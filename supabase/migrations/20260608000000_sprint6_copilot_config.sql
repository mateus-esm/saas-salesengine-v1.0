-- ============================================================================
-- Sprint 6 · B1 — Solo Copilot per-pipeline runtime configuration
-- Extends pipeline_agent_rules with cascade and autonomous worker controls.
-- ============================================================================

ALTER TABLE public.pipeline_agent_rules
  ADD COLUMN IF NOT EXISTS reasoning_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tools_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enabled_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.750,
  ADD COLUMN IF NOT EXISTS autonomy_cost_ceiling numeric(10,4),
  ADD COLUMN IF NOT EXISTS doorman_model text,
  ADD COLUMN IF NOT EXISTS worker_model text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipeline_agent_rules_confidence_threshold_range'
      AND conrelid = 'public.pipeline_agent_rules'::regclass
  ) THEN
    ALTER TABLE public.pipeline_agent_rules
      ADD CONSTRAINT pipeline_agent_rules_confidence_threshold_range
      CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1);
  END IF;
END;
$$;

COMMENT ON COLUMN public.pipeline_agent_rules.reasoning_enabled IS
  'Sprint 6: enables deeper reasoning for the autonomous Team worker when allowed by pipeline policy.';
COMMENT ON COLUMN public.pipeline_agent_rules.tools_enabled IS
  'Sprint 6: allows the cascade worker to bind guarded Core-Table tools for this pipeline.';
COMMENT ON COLUMN public.pipeline_agent_rules.enabled_skills IS
  'Sprint 6: JSONB array of active skill names allowed for this pipeline.';
COMMENT ON COLUMN public.pipeline_agent_rules.confidence_threshold IS
  'Sprint 6: minimum confidence required for automatic execution; values must be between 0 and 1.';
COMMENT ON COLUMN public.pipeline_agent_rules.autonomy_cost_ceiling IS
  'Sprint 6: nullable per-run cost ceiling. NULL disables autonomous Team execution.';
COMMENT ON COLUMN public.pipeline_agent_rules.doorman_model IS
  'Sprint 6: optional model override for Tower/Floor doorman agents; NULL inherits service default.';
COMMENT ON COLUMN public.pipeline_agent_rules.worker_model IS
  'Sprint 6: optional model override for worker/autonomous execution; NULL inherits service default.';

