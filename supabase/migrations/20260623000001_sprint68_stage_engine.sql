-- ============================================================================
-- Sprint 6.8 · T6.1 — Stage engine: add 'ciclo' stage type + cycle config
--
-- ADDITIVE ONLY (founder decision, 2026-06-23): the internal stage_type enum
-- stays in English ('open'/'won'/'lost'); the UI renders PT-BR labels
-- (Aberto/Ganho/Perdido/Ciclo) via a value→label map. This migration only:
--   1. Widens the stage_type CHECK to also allow 'ciclo'.
--   2. Adds the cycle configuration columns.
-- No data is rewritten; no RPC is redefined (the existing English-aware
-- shape_pipeline / get_dashboard_kpis stay correct).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Widen the stage_type CHECK constraint to allow 'ciclo'
--    (PostgreSQL auto-names the inline CHECK {table}_{column}_check.)
-- ----------------------------------------------------------------------------
ALTER TABLE public.pipeline_stages_v2
  DROP CONSTRAINT IF EXISTS pipeline_stages_v2_stage_type_check;

ALTER TABLE public.pipeline_stages_v2
  ADD CONSTRAINT pipeline_stages_v2_stage_type_check
  CHECK (stage_type IN ('open', 'won', 'lost', 'ciclo'));

-- ----------------------------------------------------------------------------
-- 2. Cycle configuration columns (all nullable → additive, default disabled)
--    cycle_days            : X days in a 'ciclo' stage before auto-return fires
--    cycle_target_stage_id : stage to move the opportunity back to on trigger
--    cycle_webhook_url     : optional webhook fired (best-effort) on trigger
-- ----------------------------------------------------------------------------
ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS cycle_days integer,
  ADD COLUMN IF NOT EXISTS cycle_target_stage_id uuid
    REFERENCES public.pipeline_stages_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cycle_webhook_url text;

COMMENT ON COLUMN public.pipeline_stages_v2.cycle_days IS
  'Sprint 6.8: days before auto-return (ciclo stage). NULL = disabled.';
COMMENT ON COLUMN public.pipeline_stages_v2.cycle_target_stage_id IS
  'Sprint 6.8: stage to return to when cycle_days elapses. NULL = disabled.';
COMMENT ON COLUMN public.pipeline_stages_v2.cycle_webhook_url IS
  'Sprint 6.8: optional webhook URL fired (best-effort) when the cycle triggers.';

CREATE INDEX IF NOT EXISTS idx_stages_v2_cycle_days
  ON public.pipeline_stages_v2 (cycle_days)
  WHERE cycle_days IS NOT NULL;
