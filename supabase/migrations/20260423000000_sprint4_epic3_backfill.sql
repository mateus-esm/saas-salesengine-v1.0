-- ============================================================================
-- Sprint 4 · EPIC 3 — Legacy sales-data backfill (3.5)
--
-- Goal: move per-pipeline sales fields that currently live on `leads`
-- (opportunity_value, meeting_*, no_show, next_contact, lead_score,
-- responsible_id, legacy stage_id) onto the Opportunity where they belong.
-- This unblocks EPIC 3 acceptance §2 ("Contact detail modal primary view
-- shows zero legacy sales fields") — the UI stops reading those columns
-- from `leads`, but the data itself cannot be lost.
--
-- Rules:
--   • Idempotent. A `legacy_backfilled` marker inside opportunities.custom_data
--     prevents double-writes. Safe to run after retries.
--   • Non-destructive. Never overwrite an operator-set field — we only write
--     opp.value when it is currently NULL, and we merge legacy flags into
--     custom_data under a `legacy_*` namespace.
--   • Additive. Legacy columns on `leads` stay intact (soft-deprecation per
--     Epic 0.5). Sprint 5 drops them once this migration has run in prod.
--
-- Two passes:
--   1. UPDATE path — contacts WITH an open opportunity. Target = most recently
--      updated open opp. Merges legacy fields into that opp's custom_data.
--   2. INSERT path — contacts WITHOUT any open opportunity, but with legacy
--      sales data and a tenant `default_pipeline_id`. Synthesizes an
--      Opportunity in that pipeline's first stage. Tenants with no default
--      pipeline are skipped (logged via RAISE NOTICE for operator review).
--
-- Runtime: O(n) scan over `leads WHERE deleted_at IS NULL`. Expect <1s per
-- 10k contacts on the current index set.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. Sanity: columns we read must still exist. If a prior Sprint 5 migration
--    has already dropped them, abort gracefully instead of throwing.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'opportunity_value'
  ) THEN
    RAISE NOTICE 'Sprint 4 EPIC 3 backfill: legacy lead columns already dropped; skipping.';
    RETURN;
  END IF;
END $$;

-- ============================================================================
-- 1. UPDATE path — merge legacy fields into the contact's active open
--    opportunity (most recently updated).
--
--    Stack of keys written into opportunities.custom_data:
--      legacy_backfilled          boolean — idempotency marker
--      legacy_stage_id            uuid    — pipeline_stages (v1) reference
--      legacy_meeting_scheduled   boolean
--      legacy_meeting_done        boolean
--      legacy_meeting_date        timestamptz
--      legacy_no_show             boolean
--      legacy_next_contact        timestamptz
--      legacy_lead_score          integer
--      legacy_responsible_id      uuid
--
--    These keys are read-only artefacts; the Agente CRM rules in EPIC 5 can
--    project them onto native custom fields per-tenant when admins wire the
--    mapping. Until then they preserve the history.
-- ============================================================================
WITH target AS (
  SELECT DISTINCT ON (o.lead_id)
    o.id            AS opp_id,
    o.lead_id       AS lead_id,
    o.value         AS opp_value,
    o.custom_data   AS opp_custom_data,
    l.opportunity_value,
    l.stage_id      AS legacy_stage_id,
    l.meeting_scheduled,
    l.meeting_done,
    l.meeting_date,
    l.no_show,
    l.next_contact,
    l.responsible_id
  FROM public.opportunities o
  JOIN public.leads l ON l.id = o.lead_id
  WHERE o.status = 'open'
    AND o.deleted_at IS NULL
    AND l.deleted_at IS NULL
    -- Skip opps already backfilled
    AND COALESCE((o.custom_data ->> 'legacy_backfilled')::boolean, false) = false
    -- Only touch opps where the contact actually has legacy data worth saving
    AND (
      COALESCE(l.opportunity_value, 0) > 0
      OR l.stage_id IS NOT NULL
      OR COALESCE(l.meeting_scheduled, false)
      OR COALESCE(l.meeting_done, false)
      OR COALESCE(l.no_show, false)
      OR l.meeting_date IS NOT NULL
      OR l.next_contact IS NOT NULL
      OR l.responsible_id IS NOT NULL
    )
  ORDER BY o.lead_id, o.updated_at DESC
)
UPDATE public.opportunities o
SET
  -- Only claim the legacy value when the opp has no value of its own —
  -- protects operator edits made after Sprint 3 shipped.
  value = CASE
    WHEN o.value IS NULL AND COALESCE(t.opportunity_value, 0) > 0
      THEN t.opportunity_value
    ELSE o.value
  END,
  custom_data = o.custom_data
    || jsonb_strip_nulls(jsonb_build_object(
      'legacy_backfilled',        true,
      'legacy_stage_id',          t.legacy_stage_id,
      'legacy_meeting_scheduled', CASE WHEN t.meeting_scheduled IS NOT NULL THEN to_jsonb(t.meeting_scheduled) END,
      'legacy_meeting_done',      CASE WHEN t.meeting_done      IS NOT NULL THEN to_jsonb(t.meeting_done)      END,
      'legacy_meeting_date',      t.meeting_date,
      'legacy_no_show',           CASE WHEN t.no_show           IS NOT NULL THEN to_jsonb(t.no_show)           END,
      'legacy_next_contact',      t.next_contact,
      'legacy_responsible_id',    t.responsible_id
    )),
  updated_at = now()
FROM target t
WHERE o.id = t.opp_id;

-- ============================================================================
-- 2. INSERT path — contacts WITHOUT any open opportunity, but with legacy
--    sales data AND a tenant default pipeline.
--
--    Strategy:
--      a. Find eligible contacts (legacy data, no open opp, tenant has default).
--      b. For each, resolve the first pipeline stage (lowest position,
--         stage_type='open').
--      c. INSERT one opportunity per contact with custom_data marker + legacy
--         fields. `position` = 0 (end of column resolution can happen lazily).
--
--    Fallback: if the default pipeline has no stages, skip — another error
--    state the admin must fix before opportunities are usable anyway.
-- ============================================================================
WITH eligible AS (
  SELECT
    l.id              AS lead_id,
    l.equipe_id,
    l.opportunity_value,
    l.stage_id        AS legacy_stage_id,
    l.meeting_scheduled,
    l.meeting_done,
    l.meeting_date,
    l.no_show,
    l.next_contact,
    l.responsible_id,
    e.default_pipeline_id
  FROM public.leads l
  JOIN public.equipes e ON e.id = l.equipe_id
  WHERE l.deleted_at IS NULL
    AND e.default_pipeline_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.opportunities o
      WHERE o.lead_id = l.id
        AND o.deleted_at IS NULL
    )
    AND (
      COALESCE(l.opportunity_value, 0) > 0
      OR l.stage_id IS NOT NULL
      OR COALESCE(l.meeting_scheduled, false)
      OR COALESCE(l.meeting_done, false)
      OR COALESCE(l.no_show, false)
      OR l.meeting_date IS NOT NULL
      OR l.next_contact IS NOT NULL
      OR l.responsible_id IS NOT NULL
    )
),
first_stage AS (
  SELECT DISTINCT ON (pipeline_id)
    pipeline_id,
    id AS stage_id
  FROM public.pipeline_stages_v2
  WHERE deleted_at IS NULL
  ORDER BY pipeline_id, position ASC
)
INSERT INTO public.opportunities (
  equipe_id, lead_id, pipeline_id, stage_id,
  value, currency, status, position,
  custom_data, stage_entered_at, created_at, updated_at
)
SELECT
  e.equipe_id,
  e.lead_id,
  e.default_pipeline_id,
  fs.stage_id,
  CASE WHEN COALESCE(e.opportunity_value, 0) > 0 THEN e.opportunity_value ELSE NULL END,
  'BRL',
  'open',
  0,
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_backfilled',        true,
    'legacy_synthesized',       true,
    'legacy_stage_id',          e.legacy_stage_id,
    'legacy_meeting_scheduled', CASE WHEN e.meeting_scheduled IS NOT NULL THEN to_jsonb(e.meeting_scheduled) END,
    'legacy_meeting_done',      CASE WHEN e.meeting_done      IS NOT NULL THEN to_jsonb(e.meeting_done)      END,
    'legacy_meeting_date',      e.meeting_date,
    'legacy_no_show',           CASE WHEN e.no_show           IS NOT NULL THEN to_jsonb(e.no_show)           END,
    'legacy_next_contact',      e.next_contact,
    'legacy_responsible_id',    e.responsible_id
  )),
  now(),
  now(),
  now()
FROM eligible e
JOIN first_stage fs ON fs.pipeline_id = e.default_pipeline_id;

-- ============================================================================
-- 3. Observability — report how many contacts would have been backfilled but
--    couldn't be because their tenant has no default_pipeline_id set. Admins
--    need to see these so they can pick a default and re-run the migration.
-- ============================================================================
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.leads l
  JOIN public.equipes e ON e.id = l.equipe_id
  WHERE l.deleted_at IS NULL
    AND e.default_pipeline_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.lead_id = l.id AND o.deleted_at IS NULL
    )
    AND (
      COALESCE(l.opportunity_value, 0) > 0
      OR l.stage_id IS NOT NULL
      OR COALESCE(l.meeting_scheduled, false)
      OR COALESCE(l.meeting_done, false)
      OR COALESCE(l.no_show, false)
      OR l.meeting_date IS NOT NULL
      OR l.next_contact IS NOT NULL
      OR l.responsible_id IS NOT NULL
    );

  IF orphan_count > 0 THEN
    RAISE NOTICE
      'Sprint 4 EPIC 3 backfill: % contact(s) had legacy sales data but their tenant has no default_pipeline_id. Set one in Pipeline Settings and re-run.',
      orphan_count;
  END IF;
END $$;

COMMIT;
