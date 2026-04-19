-- ============================================================================
-- Sprint 3 · EPIC 1 — Global Lead Database
--
-- Promotes `leads` to the universal identity tier (Tier 1 of the 3-tier
-- architecture). Pipeline-specific data (stage, value, meeting flags, etc.)
-- moves to `opportunities` in the EPIC 2 migration.
--
-- This migration is fully ADDITIVE. No legacy column is dropped here — the
-- existing Kanban / DatabaseView keep working off `leads.stage_id` until
-- Sprint 4 cuts them over to `opportunities`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pre-migration snapshot (idempotent)
--    Creates a frozen copy of leads BEFORE any change in this sprint.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'leads_backup_sprint3'
  ) THEN
    EXECUTE 'CREATE TABLE public.leads_backup_sprint3 AS TABLE public.leads';
    COMMENT ON TABLE public.leads_backup_sprint3 IS
      'Sprint 3 EPIC 1 snapshot — restore source if leads schema migration regresses.';
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 2. Universal identity columns (additive)
--      • origin       → standard 'whatsapp' | 'manual' | 'web' | 'import'
--      • deleted_at   → soft delete to align with project conventions
-- ----------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origin     text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill `origin` from the legacy `origem`/`source` strings, normalised.
UPDATE public.leads
SET origin = CASE
  WHEN lower(coalesce(origem, '')) IN ('whatsapp','wpp','wa') THEN 'whatsapp'
  WHEN lower(coalesce(origem, '')) IN ('web','website','site') THEN 'web'
  WHEN lower(coalesce(origem, '')) IN ('import','imported','csv') THEN 'import'
  WHEN lower(coalesce(source, '')) IN ('whatsapp','wpp','wa') THEN 'whatsapp'
  WHEN lower(coalesce(source, '')) IN ('web','website','site') THEN 'web'
  WHEN lower(coalesce(source, '')) IN ('import','imported','csv') THEN 'import'
  WHEN coalesce(origem, source) IS NOT NULL THEN 'manual'
  ELSE 'manual'
END
WHERE origin IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Indexes — partial, scoped to live rows
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_equipe_phone_live
  ON public.leads (equipe_id, phone)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_equipe_email_live
  ON public.leads (equipe_id, email)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_equipe_created_live
  ON public.leads (equipe_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_equipe_origin_live
  ON public.leads (equipe_id, origin)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Soft-delete is enforced at the application layer for now (UPDATE … SET
--    deleted_at = now()). RLS already covers tenant isolation; no new policy
--    is needed because `deleted_at IS NULL` filtering happens in queries.
-- ----------------------------------------------------------------------------
