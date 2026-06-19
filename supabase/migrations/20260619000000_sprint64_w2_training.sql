-- Sprint 6.4 · Wave 2 — training-via-descriptions.
-- Stages gain a human description (the Pipeline Copilot reads it to know when to
-- move a deal here). Tenants gain an editable contact-field dictionary, same shape
-- as pipelines.custom_fields_schema. Additive + nullable.

ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.pipeline_stages_v2.description IS
  'Sprint 6.4 W2: what this stage means / when a deal belongs here. Read by the Floor triage as training.';

ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS contact_fields_schema jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.equipes.contact_fields_schema IS
  'Sprint 6.4 W2: tenant contact-base field dictionary {field_id,key,label,type,required,options,position,is_deleted,description}. Empty = canonical baseline.';
