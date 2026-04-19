-- ============================================================================
-- Sprint 3 · EPIC 2 — Multi-Pipeline Engine ("Jestor for Sales")
--
-- Introduces the 3-tier relational model:
--   Tier 2 — pipelines + pipeline_stages_v2
--   Tier 3 — opportunities + opportunity_stage_history
--
-- The legacy public.pipeline_stages table is left untouched. The current
-- Kanban / DatabaseView keeps using it. EPIC 3 (next workload) will switch
-- the UI over to pipeline_stages_v2 + opportunities.
--
-- Convention: see /db/CONVENTIONS.md
-- ============================================================================

-- ============================================================================
-- 1. pipelines  — process definition + custom field schema (JSONB)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pipelines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id            uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,

  name                 text NOT NULL,
  description          text,

  -- Array of CustomFieldSchema. See /db/CONVENTIONS.md §6.
  custom_fields_schema jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Which custom field_ids appear on Kanban cards. Order is preserved.
  card_field_ids       jsonb NOT NULL DEFAULT '[]'::jsonb,

  is_archived          boolean NOT NULL DEFAULT false,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

COMMENT ON TABLE public.pipelines IS
  'Sprint 3 EPIC 2: Tier-2 process definition. One row per sales process per tenant.';
COMMENT ON COLUMN public.pipelines.custom_fields_schema IS
  'Array of CustomFieldSchema {field_id,key,label,type,required,options,position,is_deleted}';

CREATE INDEX IF NOT EXISTS idx_pipelines_equipe_live
  ON public.pipelines (equipe_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pipelines_equipe_active
  ON public.pipelines (equipe_id, is_archived)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. pipeline_stages_v2 — ordered states inside a pipeline
--     Named *_v2 to coexist with the legacy flat public.pipeline_stages table
--     until EPIC 3 retires the latter.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pipeline_stages_v2 (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id   uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,

  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#64748b',
  position    integer NOT NULL,
  stage_type  text NOT NULL DEFAULT 'open'
              CHECK (stage_type IN ('open', 'won', 'lost')),

  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

COMMENT ON TABLE public.pipeline_stages_v2 IS
  'Sprint 3 EPIC 2: stages owned by a pipeline. Replaces flat pipeline_stages in EPIC 3.';

CREATE INDEX IF NOT EXISTS idx_stages_v2_pipeline_position_live
  ON public.pipeline_stages_v2 (pipeline_id, position)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stages_v2_equipe_live
  ON public.pipeline_stages_v2 (equipe_id)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. opportunities — Tier-3 instance: Lead × Pipeline × Stage + custom_data
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.opportunities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id        uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,

  lead_id          uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  pipeline_id      uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE RESTRICT,
  stage_id         uuid NOT NULL REFERENCES public.pipeline_stages_v2(id) ON DELETE RESTRICT,

  value            numeric(14,2),
  currency         text NOT NULL DEFAULT 'BRL',

  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'won', 'lost')),

  position         integer NOT NULL DEFAULT 0,

  -- Keyed by CustomFieldSchema.field_id (uuid). Never by key/label.
  custom_data      jsonb NOT NULL DEFAULT '{}'::jsonb,

  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

COMMENT ON TABLE public.opportunities IS
  'Sprint 3 EPIC 2: a Lead instantiated inside a Pipeline at a Stage with tenant-defined custom_data.';

CREATE INDEX IF NOT EXISTS idx_opportunities_kanban_live
  ON public.opportunities (equipe_id, pipeline_id, stage_id, position)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_lead_live
  ON public.opportunities (equipe_id, lead_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_status_live
  ON public.opportunities (equipe_id, status)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. opportunity_stage_history — append-only event log
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.opportunity_stage_history (
  id              bigserial PRIMARY KEY,
  equipe_id       uuid NOT NULL,
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  from_stage_id   uuid REFERENCES public.pipeline_stages_v2(id) ON DELETE SET NULL,
  to_stage_id     uuid NOT NULL REFERENCES public.pipeline_stages_v2(id) ON DELETE SET NULL,
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.opportunity_stage_history IS
  'Append-only ledger of stage transitions. Populated automatically by trg_opportunity_stage_change.';

CREATE INDEX IF NOT EXISTS idx_opp_history_opportunity_changed
  ON public.opportunity_stage_history (opportunity_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_opp_history_equipe_changed
  ON public.opportunity_stage_history (equipe_id, changed_at DESC);

-- ============================================================================
-- 5. updated_at triggers — reuse existing helper
-- ============================================================================
DROP TRIGGER IF EXISTS set_pipelines_updated_at ON public.pipelines;
CREATE TRIGGER set_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_opportunities_updated_at ON public.opportunities;
CREATE TRIGGER set_opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. Stage-change history trigger
--     Writes a history row + bumps stage_entered_at on every stage transition.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_opportunity_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.opportunity_stage_history
      (equipe_id, opportunity_id, from_stage_id, to_stage_id, changed_by)
    VALUES
      (NEW.equipe_id, NEW.id, OLD.stage_id, NEW.stage_id, auth.uid());
    NEW.stage_entered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_opportunity_stage_change() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_opportunity_stage_change ON public.opportunities;
CREATE TRIGGER trg_opportunity_stage_change
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.log_opportunity_stage_change();

-- ============================================================================
-- 7. Archive guard — block new opportunities on archived pipelines
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_opportunity_pipeline_active()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_archived boolean;
BEGIN
  SELECT p.is_archived INTO is_archived
  FROM public.pipelines p
  WHERE p.id = NEW.pipeline_id;

  IF is_archived THEN
    RAISE EXCEPTION 'Cannot create opportunity in archived pipeline %', NEW.pipeline_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_block_archived ON public.opportunities;
CREATE TRIGGER trg_opportunity_block_archived
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.guard_opportunity_pipeline_active();

-- ============================================================================
-- 8. Row Level Security
-- ============================================================================
ALTER TABLE public.pipelines               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages_v2      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_stage_history ENABLE ROW LEVEL SECURITY;

-- pipelines
DROP POLICY IF EXISTS "Users can view their team pipelines" ON public.pipelines;
CREATE POLICY "Users can view their team pipelines"
  ON public.pipelines FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team pipelines" ON public.pipelines;
CREATE POLICY "Users can manage their team pipelines"
  ON public.pipelines FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- pipeline_stages_v2
DROP POLICY IF EXISTS "Users can view their team stages_v2" ON public.pipeline_stages_v2;
CREATE POLICY "Users can view their team stages_v2"
  ON public.pipeline_stages_v2 FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team stages_v2" ON public.pipeline_stages_v2;
CREATE POLICY "Users can manage their team stages_v2"
  ON public.pipeline_stages_v2 FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- opportunities
DROP POLICY IF EXISTS "Users can view their team opportunities" ON public.opportunities;
CREATE POLICY "Users can view their team opportunities"
  ON public.opportunities FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team opportunities" ON public.opportunities;
CREATE POLICY "Users can manage their team opportunities"
  ON public.opportunities FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- opportunity_stage_history (read-only from app; trigger inserts via SECURITY DEFINER)
DROP POLICY IF EXISTS "Users can view their team opp history" ON public.opportunity_stage_history;
CREATE POLICY "Users can view their team opp history"
  ON public.opportunity_stage_history FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

-- ============================================================================
-- 9. Realtime publication — Kanban (EPIC 3) needs live updates on opportunities
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'opportunities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunities;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pipeline_stages_v2'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages_v2;
  END IF;
END$$;
