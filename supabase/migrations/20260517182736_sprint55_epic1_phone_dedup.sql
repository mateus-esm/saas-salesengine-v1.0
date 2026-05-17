-- ============================================================================
-- Sprint 5.5 EPIC 1 — Identity Resolution
--
-- Root cause: gpt-maker-webhook stored phone as-is, so "+5511..." and "5511..."
-- created separate leads + duplicate conversations. There was no UNIQUE
-- constraint on (equipe_id, phone) to enforce dedup at the DB level.
--
-- This migration:
--   1. Creates a normalize_phone_br(text) function (mirrors _shared/phone.ts)
--   2. Adds leads.phone_normalized and backfills it
--   3. MERGES existing duplicates: oldest lead per (equipe_id, phone_normalized)
--      becomes canonical; all child rows (conversations, opportunities,
--      tasks, etc.) are reassigned; duplicate leads are soft-deleted.
--      Reassignment is FK-driven so any future tables that REFERENCE leads(id)
--      are picked up automatically.
--   4. Logs every merge into public.epic1_merge_log for auditing.
--   5. Adds a partial UNIQUE INDEX on (equipe_id, phone_normalized) so the
--      bug cannot reappear.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Safety snapshot of leads BEFORE merging.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'leads_backup_sprint55_pre_merge'
  ) THEN
    EXECUTE 'CREATE TABLE public.leads_backup_sprint55_pre_merge AS TABLE public.leads';
    COMMENT ON TABLE public.leads_backup_sprint55_pre_merge IS
      'Sprint 5.5 EPIC 1 snapshot before phone-dedup merge. Restore source.';
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 1. normalize_phone_br(text) — must stay in sync with _shared/phone.ts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_phone_br(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  d := regexp_replace(raw, '\D', '', 'g');
  IF d = '' THEN
    RETURN NULL;
  END IF;
  -- Strip leading zeros
  d := regexp_replace(d, '^0+', '');
  IF length(d) < 8 THEN
    RETURN NULL;
  END IF;
  -- Strip leading 55 country code only when length suggests one is present.
  IF length(d) >= 12 AND left(d, 2) = '55' THEN
    d := substring(d FROM 3);
  END IF;
  -- 10-digit DDD+8 → insert mobile-9
  IF length(d) = 10 THEN
    d := left(d, 2) || '9' || substring(d FROM 3);
  END IF;
  -- 11-digit DDD+9 mobile → prepend country code
  IF length(d) = 11 THEN
    RETURN '55' || d;
  END IF;
  RETURN d;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone_br(text) IS
  'Sprint 5.5 EPIC 1 — canonical phone form for lead dedup. Mirror of supabase/functions/_shared/phone.ts.';

-- ----------------------------------------------------------------------------
-- 2. Add phone_normalized column + backfill
-- ----------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_normalized text;

UPDATE public.leads
SET phone_normalized = public.normalize_phone_br(phone)
WHERE phone_normalized IS NULL
  AND phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_phone_normalized
  ON public.leads (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Merge audit log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epic1_merge_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id             uuid,
  phone_normalized      text,
  canonical_lead_id     uuid,
  merged_lead_ids       uuid[],
  reassigned_tables     jsonb,
  merged_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.epic1_merge_log IS
  'Sprint 5.5 EPIC 1 — audit of the one-time phone dedup merge. Keep forever.';

-- ----------------------------------------------------------------------------
-- 4. MERGE — for every (equipe_id, phone_normalized) group with >1 leads:
--    a) canonical = oldest by created_at
--    b) for every FK referencing leads(id), reassign children dup → canonical
--    c) soft-delete the duplicates
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  grp                 RECORD;
  fk                  RECORD;
  canonical_id        uuid;
  dup_ids             uuid[];
  reassigned_summary  jsonb;
  rows_moved          integer;
  sql_text            text;
BEGIN
  FOR grp IN
    SELECT equipe_id, phone_normalized, array_agg(id ORDER BY created_at) AS lead_ids
    FROM public.leads
    WHERE phone_normalized IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY equipe_id, phone_normalized
    HAVING count(*) > 1
  LOOP
    canonical_id := grp.lead_ids[1];
    dup_ids := grp.lead_ids[2:array_length(grp.lead_ids, 1)];
    reassigned_summary := '{}'::jsonb;

    -- Discover every FK pointing at leads(id) and remap children dup → canonical.
    FOR fk IN
      SELECT
        n.nspname        AS schema_name,
        c.relname        AS table_name,
        a.attname        AS column_name
      FROM pg_constraint con
      JOIN pg_class      c   ON c.oid = con.conrelid
      JOIN pg_namespace  n   ON n.oid = c.relnamespace
      JOIN pg_class      fc  ON fc.oid = con.confrelid
      JOIN pg_namespace  fn  ON fn.oid = fc.relnamespace
      JOIN pg_attribute  a   ON a.attrelid = con.conrelid
                            AND a.attnum = con.conkey[1]
      WHERE con.contype = 'f'
        AND fc.relname = 'leads'
        AND fn.nspname = 'public'
    LOOP
      sql_text := format(
        'UPDATE %I.%I SET %I = $1 WHERE %I = ANY($2)',
        fk.schema_name, fk.table_name, fk.column_name, fk.column_name
      );
      EXECUTE sql_text USING canonical_id, dup_ids;
      GET DIAGNOSTICS rows_moved = ROW_COUNT;
      IF rows_moved > 0 THEN
        reassigned_summary := reassigned_summary || jsonb_build_object(
          fk.schema_name || '.' || fk.table_name || '.' || fk.column_name,
          rows_moved
        );
      END IF;
    END LOOP;

    -- Soft-delete the duplicate leads. Name suffix makes the merge visible
    -- in the CRM if any UI surface ever shows soft-deleted rows.
    UPDATE public.leads
    SET deleted_at = COALESCE(deleted_at, now()),
        name = COALESCE(name, '') || ' [merged]'
    WHERE id = ANY(dup_ids);

    INSERT INTO public.epic1_merge_log (
      equipe_id, phone_normalized, canonical_lead_id,
      merged_lead_ids, reassigned_tables
    ) VALUES (
      grp.equipe_id, grp.phone_normalized, canonical_id,
      dup_ids, reassigned_summary
    );
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 5. UNIQUE constraint — the bug cannot reappear after this point.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_equipe_phone_normalized_unique
  ON public.leads (equipe_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL
    AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_leads_equipe_phone_normalized_unique IS
  'Sprint 5.5 EPIC 1 — enforces 1 lead per (equipe, normalized phone) for live rows.';

-- ----------------------------------------------------------------------------
-- 6. Trigger to keep phone_normalized in sync going forward.
--    Defence-in-depth in case any future writer forgets to populate it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_sync_phone_normalized()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone_normalized := public.normalize_phone_br(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_sync_phone_normalized ON public.leads;
CREATE TRIGGER trg_leads_sync_phone_normalized
  BEFORE INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_sync_phone_normalized();
