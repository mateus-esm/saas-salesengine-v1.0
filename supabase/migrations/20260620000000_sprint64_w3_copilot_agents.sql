-- ============================================================================
-- Sprint 6.4 · Wave 3 — copilot_agents config table
-- Purpose: one row per (equipe, scope, pipeline?) — the config home for the
--          copilot "team" (chat, contact_base, per-pipeline).
-- RLS: equipe_id-via-profiles pattern — mirrors 20260422000000_sprint4_epic1_foundations.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. copilot_agents — the copilot team config home
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.copilot_agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id     uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  scope         text NOT NULL CHECK (scope IN ('chat','contact_base','pipeline')),
  pipeline_id   uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Copiloto',
  system_prompt text,
  autonomy_mode text NOT NULL DEFAULT 'observe'
                CHECK (autonomy_mode IN ('observe','suggest','autonomous')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.copilot_agents IS
  'Sprint 6.4 Wave 3: per-team copilot config. One row per (equipe, scope, pipeline). Global copilots (chat, contact_base) have pipeline_id = NULL.';

-- ============================================================================
-- 2. Unique indexes — one config per (tenant, scope, pipeline).
--    Global copilots use NULL pipeline_id; partial indexes make NULL behave
--    as a single slot (standard Postgres NULL-uniqueness workaround).
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_copilot_agents_pipeline
  ON public.copilot_agents (equipe_id, scope, pipeline_id)
  WHERE pipeline_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_copilot_agents_global
  ON public.copilot_agents (equipe_id, scope)
  WHERE pipeline_id IS NULL;

-- ============================================================================
-- 3. updated_at trigger — reuses the shared function used across all tables
-- ============================================================================
DROP TRIGGER IF EXISTS set_copilot_agents_updated_at ON public.copilot_agents;
CREATE TRIGGER set_copilot_agents_updated_at
  BEFORE UPDATE ON public.copilot_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. Row Level Security — equipe_id-via-profiles pattern
--    Copied verbatim from pipeline_agent_rules in
--    20260422000000_sprint4_epic1_foundations.sql §8
-- ============================================================================
ALTER TABLE public.copilot_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their team copilot agents" ON public.copilot_agents;
CREATE POLICY "Users can view their team copilot agents"
  ON public.copilot_agents FOR SELECT
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage their team copilot agents" ON public.copilot_agents;
CREATE POLICY "Users can manage their team copilot agents"
  ON public.copilot_agents FOR ALL
  USING (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid()));

COMMIT;
