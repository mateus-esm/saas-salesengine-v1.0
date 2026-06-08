-- ============================================================================
-- Sprint 6 · B2 — AI decisions audit and approval queue
-- Extends the legacy audit table into the Copilot approval/execution ledger.
-- ============================================================================

ALTER TABLE public.ai_decisions
  ADD COLUMN IF NOT EXISTS equipe_id uuid REFERENCES public.equipes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_role text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS actor text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.ai_decisions
  ALTER COLUMN status SET DEFAULT 'auto_applied';

UPDATE public.ai_decisions
SET status = 'auto_applied'
WHERE status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_decisions_status_sprint6_check'
      AND conrelid = 'public.ai_decisions'::regclass
  ) THEN
    ALTER TABLE public.ai_decisions
      ADD CONSTRAINT ai_decisions_status_sprint6_check
      CHECK (status IN (
        'auto_applied',
        'pending_approval',
        'approved',
        'rejected',
        'executed',
        'failed'
      )) NOT VALID;
  END IF;
END;
$$;

COMMENT ON COLUMN public.ai_decisions.equipe_id IS
  'Sprint 6: tenant scope for Copilot decisions and approvals.';
COMMENT ON COLUMN public.ai_decisions.opportunity_id IS
  'Sprint 6: opportunity affected by the Copilot decision, when available.';
COMMENT ON COLUMN public.ai_decisions.pipeline_id IS
  'Sprint 6: pipeline context used by the Copilot cascade.';
COMMENT ON COLUMN public.ai_decisions.agent_role IS
  'Sprint 6: cascade component that produced the decision, e.g. tower_doorman, floor_doorman, worker.';
COMMENT ON COLUMN public.ai_decisions.status IS
  'Sprint 6: approval/execution state for Copilot decisions.';
COMMENT ON COLUMN public.ai_decisions.actor IS
  'Sprint 6: actor that initiated execution, e.g. copilot or a representative uuid.';
COMMENT ON COLUMN public.ai_decisions.resolved_by IS
  'Sprint 6: user who approved or rejected a pending approval.';
COMMENT ON COLUMN public.ai_decisions.resolved_at IS
  'Sprint 6: timestamp when a pending approval was resolved.';

CREATE INDEX IF NOT EXISTS idx_ai_decisions_pending_approval
  ON public.ai_decisions (equipe_id, pipeline_id, created_at DESC)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_ai_decisions_opportunity
  ON public.ai_decisions (equipe_id, opportunity_id, created_at DESC)
  WHERE opportunity_id IS NOT NULL;

