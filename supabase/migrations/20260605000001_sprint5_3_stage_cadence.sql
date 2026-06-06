-- Sprint 5.3 T7: Per-stage cadence configuration
-- Each pipeline stage can have its own follow-up cadence, replacing the
-- pipeline-level cadence_days with a stage-specific value + unit.

ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS cadence_value integer,
  ADD COLUMN IF NOT EXISTS cadence_unit text CHECK (cadence_unit IS NULL OR cadence_unit IN ('hours', 'days'));

COMMENT ON COLUMN public.pipeline_stages_v2.cadence_value
  IS 'Sprint 5.3 — follow-up cadence magnitude (e.g. 1, 2, 10). NULL = inherit pipeline-level cadence_days.';
COMMENT ON COLUMN public.pipeline_stages_v2.cadence_unit
  IS 'Sprint 5.3 — follow-up cadence unit (hours|days). NULL = inherit pipeline-level cadence_days.';
