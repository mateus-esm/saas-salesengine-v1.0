-- Sprint 5.2 Wave 1: tenant-scoped Origin/Channel taxonomy.
CREATE TABLE IF NOT EXISTS public.origin_taxonomy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('origem', 'canal')),
  label text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.origin_taxonomy IS
  'Sprint 5.2 - tenant-scoped custom tags for contact origin and channel taxonomy.';

CREATE UNIQUE INDEX IF NOT EXISTS origin_taxonomy_equipe_kind_label_live_key
  ON public.origin_taxonomy (equipe_id, kind, lower(label))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_origin_taxonomy_equipe_kind_live
  ON public.origin_taxonomy (equipe_id, kind)
  WHERE deleted_at IS NULL;

ALTER TABLE public.origin_taxonomy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their team origin taxonomy" ON public.origin_taxonomy;
CREATE POLICY "Users can view their team origin taxonomy"
  ON public.origin_taxonomy FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team origin taxonomy" ON public.origin_taxonomy;
CREATE POLICY "Users can manage their team origin taxonomy"
  ON public.origin_taxonomy FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));
