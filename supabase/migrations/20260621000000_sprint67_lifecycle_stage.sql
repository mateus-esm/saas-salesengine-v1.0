BEGIN;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'raw'
    CHECK (lifecycle_stage IN ('raw','mql','sql','opportunity','client','lost'));
COMMENT ON COLUMN public.leads.lifecycle_stage IS
  'Sprint 6.7: invisible Predictable-Revenue funnel. Distinct from contact_type. Advanced by trigger fn_advance_lifecycle.';
CREATE INDEX IF NOT EXISTS idx_leads_lifecycle ON public.leads (equipe_id, lifecycle_stage);
COMMIT;
