-- ============================================================================
-- Sprint 6.4 · W3.3 — Extend ai_decisions status CHECK to include 'proposed'
--
-- 'proposed' is written by the autonomy-dial cascade when mode = 'observe':
-- the copilot records every planned action as a proposed decision without
-- executing it, giving a pure shadow / audit trail.
--
-- This migration drops the existing Sprint-6 CHECK and recreates it with the
-- new value added (additive; all existing valid values are preserved).
-- ============================================================================

ALTER TABLE public.ai_decisions
  DROP CONSTRAINT IF EXISTS ai_decisions_status_sprint6_check;

ALTER TABLE public.ai_decisions
  ADD CONSTRAINT ai_decisions_status_sprint6_check
  CHECK (status IN (
    'auto_applied',
    'pending_approval',
    'approved',
    'rejected',
    'executed',
    'failed',
    'proposed'
  )) NOT VALID;

COMMENT ON CONSTRAINT ai_decisions_status_sprint6_check ON public.ai_decisions IS
  'Sprint 6.4 W3.3: added proposed for observe-mode shadow audit trail.';
