BEGIN;
CREATE TABLE IF NOT EXISTS public.agenda_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id  uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  title      text NOT NULL,
  type       text NOT NULL DEFAULT 'compromisso' CHECK (type IN ('meeting', 'compromisso', 'block')),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  task_id    uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  lead_id    uuid,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_agenda_events_range ON public.agenda_events (equipe_id, starts_at) WHERE deleted_at IS NULL;
ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_agenda_events"
  ON public.agenda_events
  FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));
COMMIT;
