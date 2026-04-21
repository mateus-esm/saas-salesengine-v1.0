-- ============================================================================
-- Sprint 4 · EPIC 0 — Sprint 3 Cutover (Non-Negotiable Gate)
--
-- Goal: every server-side writer (webhooks, AI agent, KPI RPC, triggers) must
-- target the new Tier-3 model (opportunities + pipeline_stages_v2) before any
-- Epic 1–5 work starts. No destructive drops — legacy columns are
-- soft-deprecated via COMMENT ON COLUMN.
--
-- Covers: 0.1 default pipeline foundation · 0.3 get_dashboard_kpis rewrite ·
--         0.4 handle_lead_lifecycle retirement · 0.5 legacy column deprecation.
-- 0.2 analyze-message rewrite and 0.6 dead-code deletion ship as code changes
-- in the same PR; this migration is forward+reversible.
-- ============================================================================

-- ============================================================================
-- 1. equipes.default_pipeline_id — the tenant's inbound routing default
-- ============================================================================
ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS default_pipeline_id uuid
    REFERENCES public.pipelines(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.equipes.default_pipeline_id IS
  'Sprint 4: pipeline where webhooks land inbound contacts as opportunities. '
  'NULL = manual assignment flow. Set by admin in Pipeline Settings.';

CREATE INDEX IF NOT EXISTS idx_equipes_default_pipeline
  ON public.equipes (default_pipeline_id)
  WHERE default_pipeline_id IS NOT NULL;

-- ============================================================================
-- 2. handle_lead_lifecycle — neutralized (0.4)
--
--   The legacy trigger auto-wrote leads.stage_id based on lead_type. With
--   opportunities now the process instance, this is wrong. We keep the
--   trigger binding for reversibility and replace the body with a no-op so
--   Sprint 5 can either re-purpose it or drop it cleanly.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_lead_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- DEPRECATED Sprint 4 EPIC 0. Stage assignment moved to the opportunities
  -- table. This function is kept as a no-op so the trigger binding stays
  -- intact and reversible. Sprint 5 drops the trigger + function together.
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. Deprecation comments on legacy lead columns (0.5)
--
--   Policy: no DROP this sprint. UI + AI stop reading these next; Sprint 5
--   drops them once backfill (Epic 3) has copied values to opportunities.
-- ============================================================================
COMMENT ON COLUMN public.leads.stage_id IS
  'DEPRECATED Sprint 4. Use opportunities.stage_id. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.opportunity_value IS
  'DEPRECATED Sprint 4. Use opportunities.value. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.meeting_scheduled IS
  'DEPRECATED Sprint 4. Moves to opportunities.custom_data or dedicated column in Epic 3. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.meeting_done IS
  'DEPRECATED Sprint 4. Moves to opportunities in Epic 3. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.meeting_date IS
  'DEPRECATED Sprint 4. Moves to opportunities in Epic 3. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.no_show IS
  'DEPRECATED Sprint 4. Moves to opportunities in Epic 3. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.next_contact IS
  'DEPRECATED Sprint 4. Moves to opportunities in Epic 3. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.responsible_id IS
  'DEPRECATED Sprint 4. Moves to opportunities.owner_id in Epic 3. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.assigned_to IS
  'DEPRECATED Sprint 4. Moves to opportunities.owner_id in Epic 3. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.stage_entered_at IS
  'DEPRECATED Sprint 4. Use opportunities.stage_entered_at. Removed Sprint 5.';
-- lead_score may not exist in all environments (it was never added by a
-- prior migration). Conditionally deprecate only if the column is present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'lead_score'
  ) THEN
    COMMENT ON COLUMN public.leads.lead_score IS
      'DEPRECATED Sprint 4. Moves to opportunities in Epic 3. Removed Sprint 5.';
  END IF;
END $$;

-- ============================================================================
-- 4. get_dashboard_kpis — rewritten against the new model (0.3)
--
--   Old: JOIN pipeline_stages ON leads.stage_id, category IN ('won','lost').
--   New: COUNT/AVG against opportunities + pipeline_stages_v2.stage_type.
--
--   Return JSON shape is IDENTICAL to the previous version so the dashboard
--   UI does not move. Meeting KPIs keep reading legacy leads.meeting_done
--   for one more sprint (Epic 3 backfills meeting fields into opportunities,
--   at which point this function updates again).
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
  -- Total contacts (leads table still holds identity) in the period.
  SELECT COUNT(*) INTO v_total_leads
  FROM public.leads l
  WHERE l.equipe_id = p_equipe_id
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  -- Won opportunities: status='won' OR stage_type='won'.
  -- Using the opportunity created_at keeps the metric consistent with the
  -- old behaviour where "won in period" meant the deal was created in period.
  SELECT COUNT(*) INTO v_won_leads
  FROM public.opportunities o
  JOIN public.pipeline_stages_v2 s ON o.stage_id = s.id
  WHERE o.equipe_id = p_equipe_id
    AND o.deleted_at IS NULL
    AND (o.status = 'won' OR s.stage_type = 'won')
    AND (p_start_date IS NULL OR o.created_at >= p_start_date)
    AND (p_end_date IS NULL OR o.created_at <= p_end_date);

  v_closing_rate := CASE
    WHEN v_total_leads > 0 THEN ROUND((v_won_leads::NUMERIC / v_total_leads) * 100, 2)
    ELSE 0
  END;

  -- Average ticket on won deals with a positive value.
  SELECT COALESCE(AVG(o.value), 0) INTO v_avg_ticket
  FROM public.opportunities o
  JOIN public.pipeline_stages_v2 s ON o.stage_id = s.id
  WHERE o.equipe_id = p_equipe_id
    AND o.deleted_at IS NULL
    AND (o.status = 'won' OR s.stage_type = 'won')
    AND o.value IS NOT NULL
    AND o.value > 0
    AND (p_start_date IS NULL OR o.created_at >= p_start_date)
    AND (p_end_date IS NULL OR o.created_at <= p_end_date);

  -- Average SLA: days from opportunity creation to resolution (won/lost).
  SELECT COALESCE(AVG(
    EXTRACT(EPOCH FROM (COALESCE(o.closed_at, o.updated_at) - o.created_at)) / 86400
  ), 0) INTO v_avg_sla_days
  FROM public.opportunities o
  JOIN public.pipeline_stages_v2 s ON o.stage_id = s.id
  WHERE o.equipe_id = p_equipe_id
    AND o.deleted_at IS NULL
    AND (o.status IN ('won','lost') OR s.stage_type IN ('won','lost'))
    AND (p_start_date IS NULL OR o.created_at >= p_start_date)
    AND (p_end_date IS NULL OR o.created_at <= p_end_date);

  SELECT COUNT(*) INTO v_total_touchpoints
  FROM public.touchpoints t
  JOIN public.leads l ON t.lead_id = l.id
  WHERE l.equipe_id = p_equipe_id
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date);

  v_avg_touchpoints_per_lead := CASE
    WHEN v_total_leads > 0 THEN ROUND(v_total_touchpoints::NUMERIC / v_total_leads, 2)
    ELSE 0
  END;

  -- TODO Sprint 4 Epic 3: meeting_done moves to opportunities. Until the
  -- Epic 3 backfill runs, meeting metrics still read the legacy lead column
  -- so the dashboard doesn't go dark.
  SELECT COUNT(*) INTO v_total_meetings
  FROM public.leads l
  WHERE l.equipe_id = p_equipe_id
    AND l.meeting_done = true
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  SELECT COUNT(*) INTO v_won_after_meeting
  FROM public.leads l
  JOIN public.opportunities o ON o.lead_id = l.id AND o.deleted_at IS NULL
  JOIN public.pipeline_stages_v2 s ON o.stage_id = s.id
  WHERE l.equipe_id = p_equipe_id
    AND l.meeting_done = true
    AND (o.status = 'won' OR s.stage_type = 'won')
    AND (p_start_date IS NULL OR l.created_at >= p_start_date)
    AND (p_end_date IS NULL OR l.created_at <= p_end_date);

  v_closing_rate_post_meeting := CASE
    WHEN v_total_meetings > 0 THEN ROUND((v_won_after_meeting::NUMERIC / v_total_meetings) * 100, 2)
    ELSE 0
  END;

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

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================================================
-- 5. set_default_pipeline — RPC for admins to pick the tenant default pipeline
--
--   RLS on public.equipes only permits super_admin UPDATE. This RPC uses
--   SECURITY DEFINER to let an equipe member set their own default pipeline,
--   after validating that both the caller's equipe and the target pipeline
--   share the same equipe_id. Pass NULL to clear.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_default_pipeline(p_pipeline_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_equipe uuid;
  v_pipeline_equipe uuid;
BEGIN
  SELECT equipe_id INTO v_user_equipe
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_user_equipe IS NULL THEN
    RAISE EXCEPTION 'Caller has no equipe_id' USING ERRCODE = '42501';
  END IF;

  IF p_pipeline_id IS NOT NULL THEN
    SELECT equipe_id INTO v_pipeline_equipe
    FROM public.pipelines
    WHERE id = p_pipeline_id AND deleted_at IS NULL;

    IF v_pipeline_equipe IS NULL THEN
      RAISE EXCEPTION 'Pipeline % not found', p_pipeline_id USING ERRCODE = 'P0002';
    END IF;

    IF v_pipeline_equipe <> v_user_equipe THEN
      RAISE EXCEPTION 'Pipeline belongs to a different equipe' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.equipes
     SET default_pipeline_id = p_pipeline_id
   WHERE id = v_user_equipe;

  RETURN p_pipeline_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_default_pipeline(uuid) TO authenticated;
