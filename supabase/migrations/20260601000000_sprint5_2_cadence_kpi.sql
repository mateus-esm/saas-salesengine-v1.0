-- Sprint 5.2 Wave 1: pipeline cadence and stage interaction KPI.
-- NULL disables each control; positive integers activate telemetry rules.
ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS cadence_days integer
    CHECK (cadence_days IS NULL OR cadence_days > 0);

COMMENT ON COLUMN public.pipelines.cadence_days IS
  'Sprint 5.2 - follow-up cadence in days. NULL disables automatic next-contact shifts.';

ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS max_interactions integer
    CHECK (max_interactions IS NULL OR max_interactions > 0);

COMMENT ON COLUMN public.pipeline_stages_v2.max_interactions IS
  'Sprint 5.2 - max touchpoints before interaction-breach telemetry. NULL disables the limit.';
