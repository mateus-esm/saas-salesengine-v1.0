-- =============================================================================
-- MIGRATION: Fix Default CRM Pipeline Stages
-- Date: 2026-01-06
-- Description: Ensures all default pipeline stages (active + negative) are 
--              created for new teams and fills in missing ones for existing teams.
-- =============================================================================

-- 1. Create a function to initialize default stages for a team
CREATE OR REPLACE FUNCTION public.initialize_team_stages(target_equipe_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Novo Lead (Default)
  INSERT INTO public.pipeline_stages (equipe_id, name, color, position, is_default, category)
  SELECT target_equipe_id, 'Novo Lead', '#6b7280', 1, true, 'active'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = target_equipe_id AND name = 'Novo Lead'
  );

  -- 2. Qualificação
  INSERT INTO public.pipeline_stages (equipe_id, name, color, position, is_default, category)
  SELECT target_equipe_id, 'Qualificação', '#f59e0b', 2, false, 'active'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = target_equipe_id AND name = 'Qualificação'
  );

  -- 3. Reunião Agendada
  INSERT INTO public.pipeline_stages (equipe_id, name, color, position, is_default, category)
  SELECT target_equipe_id, 'Reunião Agendada', '#3b82f6', 3, false, 'active'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = target_equipe_id AND name = 'Reunião Agendada'
  );

  -- 4. Proposta Enviada
  INSERT INTO public.pipeline_stages (equipe_id, name, color, position, is_default, category)
  SELECT target_equipe_id, 'Proposta Enviada', '#8b5cf6', 4, false, 'active'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = target_equipe_id AND name = 'Proposta Enviada'
  );

  -- 5. Fechado (Won)
  -- Note: Update existing "Fechado" to have correct category/color if needed
  UPDATE public.pipeline_stages 
  SET category = 'won', color = '#10b981', position = 5
  WHERE equipe_id = target_equipe_id AND name = 'Fechado';

  INSERT INTO public.pipeline_stages (equipe_id, name, color, position, is_default, category)
  SELECT target_equipe_id, 'Fechado', '#10b981', 5, false, 'won'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = target_equipe_id AND name = 'Fechado'
  );

  -- 6. Desqualificado
  INSERT INTO public.pipeline_stages (equipe_id, name, color, position, is_default, category)
  SELECT target_equipe_id, 'Desqualificado', '#dc2626', 6, false, 'disqualified'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = target_equipe_id AND name = 'Desqualificado'
  );

  -- 7. Perdido
  INSERT INTO public.pipeline_stages (equipe_id, name, color, position, is_default, category)
  SELECT target_equipe_id, 'Perdido', '#991b1b', 7, false, 'lost'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = target_equipe_id AND name = 'Perdido'
  );

  -- 8. Reciclo
  INSERT INTO public.pipeline_stages (equipe_id, name, color, position, is_default, category)
  SELECT target_equipe_id, 'Reciclo', '#f97316', 8, false, 'recycled'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = target_equipe_id AND name = 'Reciclo'
  );
END;
$$;

-- 2. Create Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_team_stages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.initialize_team_stages(NEW.id);
  RETURN NEW;
END;
$$;

-- 3. Create Trigger on equipes table
DROP TRIGGER IF EXISTS on_equipe_created_stages ON public.equipes;
CREATE TRIGGER on_equipe_created_stages
  AFTER INSERT ON public.equipes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_team_stages();

-- 4. Backfill existing teams
DO $$
DECLARE
  team RECORD;
BEGIN
  FOR team IN SELECT id FROM public.equipes LOOP
    PERFORM public.initialize_team_stages(team.id);
  END LOOP;
END;
$$;
