-- ============================================================================
-- Sprint 6 · B3 — Stage history actor metadata
-- Keeps the existing stage-change trigger intact while adding Copilot audit tags.
-- ============================================================================

ALTER TABLE public.opportunity_stage_history
  ADD COLUMN IF NOT EXISTS actor text,
  ADD COLUMN IF NOT EXISTS changed_by_type text NOT NULL DEFAULT 'team';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'opportunity_stage_history_changed_by_type_check'
      AND conrelid = 'public.opportunity_stage_history'::regclass
  ) THEN
    ALTER TABLE public.opportunity_stage_history
      ADD CONSTRAINT opportunity_stage_history_changed_by_type_check
      CHECK (changed_by_type IN ('team','copilot','automation','import'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.opportunity_stage_history.actor IS
  'Sprint 6: actor identifier stamped by guarded Core-Table tools, e.g. rep uuid or copilot.';
COMMENT ON COLUMN public.opportunity_stage_history.changed_by_type IS
  'Sprint 6: source category for stage changes: team, copilot, automation, or import.';

