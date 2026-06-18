-- Sprint 6.4 · Wave 1 — deal-scoped notes.
-- lead_activities notes were keyed by lead only; the Copilot writes notes about a
-- specific opportunity, so they must be scoped to the deal too. Additive + nullable
-- (legacy lead-only notes keep working).

ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS opportunity_id uuid
    REFERENCES public.opportunities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lead_activities.opportunity_id IS
  'Sprint 6.4: when a note belongs to a specific deal, scope it to that opportunity. NULL = contact-level note.';

CREATE INDEX IF NOT EXISTS idx_lead_activities_opportunity
  ON public.lead_activities (opportunity_id)
  WHERE opportunity_id IS NOT NULL;
