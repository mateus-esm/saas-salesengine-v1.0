-- Sprint 5.3 T15 (M6+M7): Personalized Tables foundation (Jestor/Airtable vision)
-- Schema only — no UI this sprint. Stores per-team custom table definitions and
-- their JSONB records so future sprints can build the visual table builder.

-- M6 — table definitions ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id    uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  slug         text NOT NULL,
  icon         text,
  description  text,
  -- Column schema: array of { key, label, type, options? } describing each field.
  table_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_tables_equipe_slug
  ON public.custom_tables (equipe_id, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_custom_tables_equipe
  ON public.custom_tables (equipe_id)
  WHERE deleted_at IS NULL;

-- M7 — records ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_table_records (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id  uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  table_id   uuid NOT NULL REFERENCES public.custom_tables(id) ON DELETE CASCADE,
  -- Row payload keyed by the parent table_schema column keys.
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_custom_table_records_table
  ON public.custom_table_records (table_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_custom_table_records_equipe
  ON public.custom_table_records (equipe_id)
  WHERE deleted_at IS NULL;

-- updated_at touch triggers (reuse the standard helper if present) ------------
DROP TRIGGER IF EXISTS set_custom_tables_updated_at ON public.custom_tables;
CREATE TRIGGER set_custom_tables_updated_at
  BEFORE UPDATE ON public.custom_tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_custom_table_records_updated_at ON public.custom_table_records;
CREATE TRIGGER set_custom_table_records_updated_at
  BEFORE UPDATE ON public.custom_table_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — scope every row to the caller's team ----------------------------------
ALTER TABLE public.custom_tables         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_table_records  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their team custom_tables"
  ON public.custom_tables FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Users can manage their team custom_tables"
  ON public.custom_tables FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Users can view their team custom_table_records"
  ON public.custom_table_records FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Users can manage their team custom_table_records"
  ON public.custom_table_records FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));
