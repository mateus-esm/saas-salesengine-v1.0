-- =============================================================================
-- MIGRATION: Solo SalesEngine v3.0 - Security & Schema Updates
-- Date: 2024-12-27
-- Description: Fixes security vulnerabilities, adds lead_type, touchpoints,
--              sender_type constraint, and negative pipeline stages
-- =============================================================================

-- ============================================================================
-- 1. SECURITY: Fix search_path vulnerability in functions
-- ============================================================================

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, email)
  VALUES (new.id, new.id, new.email);
  RETURN new;
END;
$$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. LEADS: Add lead_type column for Lead vs Contact distinction
-- ============================================================================

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS lead_type TEXT DEFAULT 'lead';

-- Add constraint for valid lead_type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_lead_type_check'
  ) THEN
    ALTER TABLE public.leads
    ADD CONSTRAINT leads_lead_type_check
    CHECK (lead_type IN ('lead', 'contact', 'spam'));
  END IF;
END $$;

-- Add assigned_to for handoff functionality
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id);

-- Add stage timing for SLA tracking
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ DEFAULT now();

-- ============================================================================
-- 3. MESSAGES: Standardize sender_type constraint
-- ============================================================================

-- Drop old constraint if exists
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_type_check;

-- Add new constraint with correct values
ALTER TABLE public.messages
ADD CONSTRAINT messages_sender_type_check
CHECK (sender_type IN ('customer', 'agent', 'member', 'system'));

-- Update existing 'ai' sender_type to 'agent'
UPDATE public.messages SET sender_type = 'agent' WHERE sender_type = 'ai';

-- ============================================================================
-- 4. PIPELINE STAGES: Add category for negative stages
-- ============================================================================

ALTER TABLE public.pipeline_stages
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'active';

-- Add constraint for valid category values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_stages_category_check'
  ) THEN
    ALTER TABLE public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_category_check
    CHECK (category IN ('active', 'won', 'lost', 'disqualified', 'recycled'));
  END IF;
END $$;

-- ============================================================================
-- 5. TOUCHPOINTS: Create new table for manual interactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  touchpoint_type TEXT DEFAULT 'note',
  contact_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add constraint for touchpoint types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'touchpoints_type_check'
  ) THEN
    ALTER TABLE public.touchpoints
    ADD CONSTRAINT touchpoints_type_check
    CHECK (touchpoint_type IN ('call', 'email', 'meeting', 'note', 'whatsapp'));
  END IF;
END $$;

-- Enable RLS on touchpoints
ALTER TABLE public.touchpoints ENABLE ROW LEVEL SECURITY;

-- RLS Policy for touchpoints
DROP POLICY IF EXISTS "Users can view their team touchpoints" ON public.touchpoints;
CREATE POLICY "Users can view their team touchpoints"
ON public.touchpoints FOR SELECT
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE equipe_id IN (SELECT equipe_id FROM public.profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can manage their team touchpoints" ON public.touchpoints;
CREATE POLICY "Users can manage their team touchpoints"
ON public.touchpoints FOR ALL
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE equipe_id IN (SELECT equipe_id FROM public.profiles WHERE id = auth.uid())
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_touchpoints_lead_id ON public.touchpoints(lead_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_contact_date ON public.touchpoints(contact_date DESC);

-- Enable realtime for touchpoints
ALTER PUBLICATION supabase_realtime ADD TABLE public.touchpoints;

-- ============================================================================
-- 6. CREATE NEGATIVE PIPELINE STAGES (if not exist)
-- ============================================================================

-- Function to create negative stages for all teams
CREATE OR REPLACE FUNCTION public.ensure_negative_stages()
RETURNS void
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  equipe_record RECORD;
  max_position INTEGER;
BEGIN
  FOR equipe_record IN SELECT id FROM public.equipes LOOP
    -- Get max position for this team
    SELECT COALESCE(MAX(position), 0) INTO max_position
    FROM public.pipeline_stages
    WHERE equipe_id = equipe_record.id;
    
    -- Desqualificado
    INSERT INTO public.pipeline_stages (equipe_id, name, color, position, category, is_default)
    SELECT equipe_record.id, 'Desqualificado', '#dc2626', max_position + 1, 'disqualified', false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = equipe_record.id AND name = 'Desqualificado'
    );
    
    -- Perdido
    INSERT INTO public.pipeline_stages (equipe_id, name, color, position, category, is_default)
    SELECT equipe_record.id, 'Perdido', '#991b1b', max_position + 2, 'lost', false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = equipe_record.id AND name = 'Perdido'
    );
    
    -- Reciclo
    INSERT INTO public.pipeline_stages (equipe_id, name, color, position, category, is_default)
    SELECT equipe_record.id, 'Reciclo', '#f97316', max_position + 3, 'recycled', false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages 
      WHERE equipe_id = equipe_record.id AND name = 'Reciclo'
    );
    
    -- Update existing "Fechado" stage to category 'won'
    UPDATE public.pipeline_stages 
    SET category = 'won'
    WHERE equipe_id = equipe_record.id AND name = 'Fechado';
  END LOOP;
END;
$$;

-- Execute the function to create stages
SELECT public.ensure_negative_stages();

-- ============================================================================
-- 7. TRIGGER: Update stage_entered_at when stage changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_stage_entered_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    NEW.stage_entered_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_lead_stage_entered_at ON public.leads;
CREATE TRIGGER update_lead_stage_entered_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_stage_entered_at();

-- ============================================================================
-- 8. INDEXES: Performance optimization
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON public.leads(lead_type);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_stage_entered_at ON public.leads(stage_entered_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_category ON public.pipeline_stages(category);
