-- Sprint: Trade-off — Inbound Webhook Lead Ingest
-- Adds inbound function config, pipeline targeting, and field mappings
-- to webhook_configs for configurable ad lead ingestion.

ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS inbound_function text
    CHECK (inbound_function IS NULL OR inbound_function = 'receive_lead');

ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id)
    ON DELETE SET NULL;

ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS field_mappings jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.webhook_configs.inbound_function
  IS 'If set to ''receive_lead'', this config acts as an inbound lead ingestion webhook';
COMMENT ON COLUMN public.webhook_configs.pipeline_id
  IS 'Target pipeline for opportunity creation when inbound_function = ''receive_lead''';
COMMENT ON COLUMN public.webhook_configs.field_mappings
  IS 'Array of { source_field, target_field, target_type } mappings for inbound payload transformation';
