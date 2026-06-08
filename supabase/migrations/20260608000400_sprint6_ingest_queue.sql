-- ============================================================================
-- Sprint 6 · B5 — Copilot ingest queue
-- Stateless debounce marker consumed by the gated /api/v1/ingest route.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.copilot_ingest_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id         uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  lead_id           uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  pipeline_id       uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  conversation_ref  text,
  due_at            timestamptz NOT NULL,
  processed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.copilot_ingest_queue IS
  'Sprint 6: stateless debounce queue for the gated Solo Copilot background ingest loop.';

CREATE INDEX IF NOT EXISTS idx_copilot_ingest_queue_due_pending
  ON public.copilot_ingest_queue (due_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_ingest_queue_team_lead_pending
  ON public.copilot_ingest_queue (equipe_id, lead_id, due_at)
  WHERE processed_at IS NULL;

DROP TRIGGER IF EXISTS set_copilot_ingest_queue_updated_at ON public.copilot_ingest_queue;
CREATE TRIGGER set_copilot_ingest_queue_updated_at
  BEFORE UPDATE ON public.copilot_ingest_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.copilot_ingest_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their team copilot ingest queue" ON public.copilot_ingest_queue;
CREATE POLICY "Users can view their team copilot ingest queue"
  ON public.copilot_ingest_queue FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team copilot ingest queue" ON public.copilot_ingest_queue;
CREATE POLICY "Users can manage their team copilot ingest queue"
  ON public.copilot_ingest_queue FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

