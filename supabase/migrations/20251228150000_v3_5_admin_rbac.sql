-- =============================================================================
-- MIGRATION: Solo SalesEngine v3.5 - Admin RBAC & Advanced Analytics
-- Date: 2024-12-28
-- Description: Adds role-based access control, creation_source tracking,
--              super_admin RLS policies, and dashboard KPI RPC function
-- =============================================================================

-- ============================================================================
-- 1. PROFILES: Add role column for RBAC
-- ============================================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Add constraint for valid role values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'admin', 'owner', 'super_admin'));
  END IF;
END $$;

-- Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ============================================================================
-- 2. LEADS: Add creation_source column for tracking
-- ============================================================================

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS creation_source TEXT DEFAULT 'manual';

-- Add constraint for valid creation_source values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_creation_source_check'
  ) THEN
    ALTER TABLE public.leads
    ADD CONSTRAINT leads_creation_source_check
    CHECK (creation_source IN ('manual', 'ai_agent', 'webhook', 'import'));
  END IF;
END $$;

-- Create index for source analytics
CREATE INDEX IF NOT EXISTS idx_leads_creation_source ON public.leads(creation_source);

-- ============================================================================
-- 3. RLS POLICIES: Super Admin access to all equipes
-- ============================================================================

-- Policy for super_admin to read all equipes
DROP POLICY IF EXISTS "Super admin can read all equipes" ON public.equipes;
CREATE POLICY "Super admin can read all equipes"
ON public.equipes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
  OR id IN (SELECT equipe_id FROM public.profiles WHERE id = auth.uid())
);

-- Policy for super_admin to update all equipes
DROP POLICY IF EXISTS "Super admin can update all equipes" ON public.equipes;
CREATE POLICY "Super admin can update all equipes"
ON public.equipes FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
);

-- Policy for super_admin to manage profiles across equipes
DROP POLICY IF EXISTS "Super admin can manage all profiles" ON public.profiles;
CREATE POLICY "Super admin can manage all profiles"
ON public.profiles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid() 
    AND p.role = 'super_admin'
  )
  OR id = auth.uid()
  OR equipe_id IN (SELECT equipe_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 4. RPC FUNCTION: get_dashboard_kpis for advanced analytics
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  p_equipe_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result JSON;
  v_total_leads INTEGER;
  v_won_leads INTEGER;
  v_closing_rate NUMERIC;
  v_avg_ticket NUMERIC;
  v_avg_sla_days NUMERIC;
  v_total_touchpoints INTEGER;
  v_avg_touchpoints_per_lead NUMERIC;
  v_closing_rate_post_meeting NUMERIC;
  v_total_meetings INTEGER;
  v_won_after_meeting INTEGER;
BEGIN
  -- Get total leads in period
  SELECT COUNT(*) INTO v_total_leads
  FROM leads
  WHERE equipe_id = p_equipe_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  -- Get won leads (in stages with category = 'won')
  SELECT COUNT(*) INTO v_won_leads
  FROM leads l
  JOIN pipeline_stages ps ON l.stage_id = ps.id
  WHERE l.equipe_id = p_equipe_id
    AND ps.category = 'won'
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  -- Calculate closing rate
  v_closing_rate := CASE 
    WHEN v_total_leads > 0 THEN ROUND((v_won_leads::NUMERIC / v_total_leads) * 100, 2)
    ELSE 0 
  END;

  -- Calculate average ticket (won deals only)
  SELECT COALESCE(AVG(l.opportunity_value), 0) INTO v_avg_ticket
  FROM leads l
  JOIN pipeline_stages ps ON l.stage_id = ps.id
  WHERE l.equipe_id = p_equipe_id
    AND ps.category = 'won'
    AND l.opportunity_value > 0
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  -- Calculate average SLA (days from creation to resolution)
  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (l.updated_at - l.created_at)) / 86400
  ), 0) INTO v_avg_sla_days
  FROM leads l
  JOIN pipeline_stages ps ON l.stage_id = ps.id
  WHERE l.equipe_id = p_equipe_id
    AND ps.category IN ('won', 'lost')
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  -- Get total touchpoints
  SELECT COUNT(*) INTO v_total_touchpoints
  FROM touchpoints t
  JOIN leads l ON t.lead_id = l.id
  WHERE l.equipe_id = p_equipe_id
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date);

  -- Calculate average touchpoints per lead
  v_avg_touchpoints_per_lead := CASE 
    WHEN v_total_leads > 0 THEN ROUND(v_total_touchpoints::NUMERIC / v_total_leads, 2)
    ELSE 0 
  END;

  -- Meetings metrics
  SELECT COUNT(*) INTO v_total_meetings
  FROM leads
  WHERE equipe_id = p_equipe_id
    AND meeting_done = true
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  SELECT COUNT(*) INTO v_won_after_meeting
  FROM leads l
  JOIN pipeline_stages ps ON l.stage_id = ps.id
  WHERE l.equipe_id = p_equipe_id
    AND l.meeting_done = true
    AND ps.category = 'won'
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  v_closing_rate_post_meeting := CASE 
    WHEN v_total_meetings > 0 THEN ROUND((v_won_after_meeting::NUMERIC / v_total_meetings) * 100, 2)
    ELSE 0 
  END;

  -- Build result JSON
  result := json_build_object(
    'total_leads', v_total_leads,
    'won_leads', v_won_leads,
    'closing_rate', v_closing_rate,
    'closing_rate_post_meeting', v_closing_rate_post_meeting,
    'avg_ticket', ROUND(v_avg_ticket, 2),
    'avg_sla_days', ROUND(v_avg_sla_days, 1),
    'total_touchpoints', v_total_touchpoints,
    'avg_touchpoints_per_lead', v_avg_touchpoints_per_lead
  );

  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================================================
-- 5. ADDITIONAL INDEXES: Performance optimization for touchpoints
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_touchpoints_created_at ON public.touchpoints(created_at DESC);

-- ============================================================================
-- 6. UPDATE existing leads without creation_source
-- ============================================================================

UPDATE public.leads 
SET creation_source = 'manual' 
WHERE creation_source IS NULL;
