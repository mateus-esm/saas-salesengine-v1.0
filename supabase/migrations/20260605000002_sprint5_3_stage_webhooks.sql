-- Sprint 5.3 T8 (M5): Per-stage webhook triggers on cadence events
-- Each pipeline stage can fire webhooks on lifecycle/cadence events. Stored as
-- an array of { event, webhook_id } objects:
--   event ∈ ('on_stage_entered', 'on_idle_breach', 'on_cadence_deadline')
--   webhook_id → public.webhook_configs(id)

ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS webhook_triggers jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.pipeline_stages_v2.webhook_triggers
  IS 'Sprint 5.3 — array of { event, webhook_id }. event ∈ on_stage_entered|on_idle_breach|on_cadence_deadline.';
