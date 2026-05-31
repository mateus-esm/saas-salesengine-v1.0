-- Sprint 5.1 EPIC 3 §3.1 — per-stage SLA threshold.
-- NULL = no limit (default). Positive integer = max hours an opportunity may
-- sit in this stage before the UI flips into Precision Red pulsing mode.
-- Hours (not days) to keep parity with stage_entered_at granularity.
ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS max_idle_hours integer
    CHECK (max_idle_hours IS NULL OR max_idle_hours > 0);

COMMENT ON COLUMN public.pipeline_stages_v2.max_idle_hours IS
  'Sprint 5.1 — SLA threshold in hours. NULL disables the red-pulse signal.';
