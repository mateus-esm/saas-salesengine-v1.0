BEGIN;
CREATE TABLE IF NOT EXISTS public.custom_table_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id    uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  from_table   text NOT NULL,
  from_id      uuid NOT NULL,
  to_table     text NOT NULL,
  to_id        uuid NOT NULL,
  relation_key text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ctl_from ON public.custom_table_links (equipe_id, from_table, from_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ctl_to   ON public.custom_table_links (equipe_id, to_table, to_id)   WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctl_edge ON public.custom_table_links (equipe_id, from_table, from_id, to_table, to_id, relation_key) WHERE deleted_at IS NULL;
ALTER TABLE public.custom_table_links ENABLE ROW LEVEL SECURITY;
-- RLS: equipe_id must match caller's profile equipe_id (copy EXACT pattern from foundations migration)
CREATE POLICY "tenant_isolation_custom_table_links"
  ON public.custom_table_links
  FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));
COMMIT;
