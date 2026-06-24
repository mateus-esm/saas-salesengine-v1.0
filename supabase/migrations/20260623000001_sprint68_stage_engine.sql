-- ============================================================================
-- Sprint 6.8 · T6.1 — Stage type PT-BR migration + ciclo + cycle config
--
-- 1. pipeline_stages_v2.stage_type: 'open'/'won'/'lost' → 'aberto'/'ganho'/'perdido'
-- 2. New stage_type value: 'ciclo' (for cycle/return stages)
-- 3. New cycle config columns on pipeline_stages_v2
-- 4. Update shape_pipeline RPC default
-- 5. Update get_dashboard_kpis RPC stage_type comparisons
-- ============================================================================

-- ============================================================================
-- 1. Drop old CHECK constraint
--    PostgreSQL auto-names inline CHECK constraints as
--    {tablename}_{columnname}_check.
-- ============================================================================
ALTER TABLE public.pipeline_stages_v2
  DROP CONSTRAINT IF EXISTS pipeline_stages_v2_stage_type_check;

-- ============================================================================
-- 2. Migrate existing rows
-- ============================================================================
UPDATE public.pipeline_stages_v2
  SET stage_type = 'aberto'
  WHERE stage_type = 'open';

UPDATE public.pipeline_stages_v2
  SET stage_type = 'ganho'
  WHERE stage_type = 'won';

UPDATE public.pipeline_stages_v2
  SET stage_type = 'perdido'
  WHERE stage_type = 'lost';

-- ============================================================================
-- 3. Add new CHECK constraint allowing 'ciclo'
-- ============================================================================
ALTER TABLE public.pipeline_stages_v2
  ADD CONSTRAINT pipeline_stages_v2_stage_type_check
  CHECK (stage_type IN ('aberto', 'ganho', 'perdido', 'ciclo'));

-- ============================================================================
-- 4. Change DEFAULT to 'aberto'
-- ============================================================================
ALTER TABLE public.pipeline_stages_v2
  ALTER COLUMN stage_type SET DEFAULT 'aberto';

-- ============================================================================
-- 5. Add cycle config columns
--    cycle_days: X days before auto-return trigger fires
--    cycle_target_stage_id: where to move the opportunity when cycle triggers
--    cycle_webhook_url: optional webhook URL to call on cycle trigger
-- ============================================================================
ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS cycle_days integer,
  ADD COLUMN IF NOT EXISTS cycle_target_stage_id uuid
    REFERENCES public.pipeline_stages_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cycle_webhook_url text;

COMMENT ON COLUMN public.pipeline_stages_v2.cycle_days IS
  'Sprint 6.8: number of days before auto-return (ciclo stage). NULL = disabled.';
COMMENT ON COLUMN public.pipeline_stages_v2.cycle_target_stage_id IS
  'Sprint 6.8: stage to return to when cycle_days elapses. NULL = disabled.';
COMMENT ON COLUMN public.pipeline_stages_v2.cycle_webhook_url IS
  'Sprint 6.8: optional webhook URL fired when cycle triggers.';

CREATE INDEX IF NOT EXISTS idx_stages_v2_cycle_days
  ON public.pipeline_stages_v2 (cycle_days)
  WHERE cycle_days IS NOT NULL;

-- ============================================================================
-- 6. Update shape_pipeline RPC — default stage_type is now 'aberto'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.shape_pipeline(
  p_equipe_id uuid,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id uuid;
  v_custom_fields_schema jsonb := '[]'::jsonb;
  v_custom_fields jsonb := '[]'::jsonb;
  v_field jsonb;
  v_stage jsonb;
  v_field_position integer;
  v_stage_position integer;
BEGIN
  IF p_equipe_id IS NULL THEN
    RAISE EXCEPTION 'shape_pipeline requires p_equipe_id';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'shape_pipeline requires an object payload';
  END IF;

  IF nullif(btrim(p_payload->>'pipeline_name'), '') IS NULL THEN
    RAISE EXCEPTION 'shape_pipeline requires pipeline_name';
  END IF;

  IF jsonb_typeof(p_payload->'stages') <> 'array'
     OR jsonb_array_length(p_payload->'stages') < 1 THEN
    RAISE EXCEPTION 'shape_pipeline requires at least one stage';
  END IF;

  IF p_payload ? 'custom_fields' THEN
    IF jsonb_typeof(p_payload->'custom_fields') <> 'array' THEN
      RAISE EXCEPTION 'shape_pipeline custom_fields must be an array';
    END IF;
    v_custom_fields := p_payload->'custom_fields';
  END IF;

  FOR v_field IN
    SELECT value FROM jsonb_array_elements(v_custom_fields)
  LOOP
    IF nullif(btrim(v_field->>'key'), '') IS NULL THEN
      RAISE EXCEPTION 'shape_pipeline custom field key is required';
    END IF;

    IF nullif(btrim(v_field->>'label'), '') IS NULL THEN
      RAISE EXCEPTION 'shape_pipeline custom field label is required';
    END IF;

    IF nullif(btrim(v_field->>'type'), '') IS NULL THEN
      RAISE EXCEPTION 'shape_pipeline custom field type is required';
    END IF;

    IF v_field->>'position' IS NULL THEN
      RAISE EXCEPTION 'shape_pipeline custom field position is required';
    END IF;

    v_field_position := (v_field->>'position')::integer;

    v_custom_fields_schema := v_custom_fields_schema || jsonb_build_array(
      jsonb_build_object(
        'field_id', gen_random_uuid()::text,
        'key', v_field->>'key',
        'label', v_field->>'label',
        'type', v_field->>'type',
        'required', COALESCE((v_field->>'required')::boolean, false),
        'options', v_field->'options',
        'position', v_field_position,
        'description', v_field->>'description',
        'is_deleted', false
      )
    );
  END LOOP;

  INSERT INTO public.pipelines (
    equipe_id,
    name,
    description,
    custom_fields_schema
  )
  VALUES (
    p_equipe_id,
    p_payload->>'pipeline_name',
    p_payload->>'description',
    v_custom_fields_schema
  )
  RETURNING id INTO v_pipeline_id;

  FOR v_stage IN
    SELECT value FROM jsonb_array_elements(p_payload->'stages')
  LOOP
    IF nullif(btrim(v_stage->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'shape_pipeline stage name is required';
    END IF;

    IF v_stage->>'position' IS NULL THEN
      RAISE EXCEPTION 'shape_pipeline stage position is required';
    END IF;

    v_stage_position := (v_stage->>'position')::integer;

    INSERT INTO public.pipeline_stages_v2 (
      equipe_id,
      pipeline_id,
      name,
      color,
      position,
      stage_type,
      max_idle_hours,
      cadence_value,
      cadence_unit
    )
    VALUES (
      p_equipe_id,
      v_pipeline_id,
      v_stage->>'name',
      COALESCE(NULLIF(v_stage->>'color', ''), '#64748b'),
      v_stage_position,
      COALESCE(NULLIF(v_stage->>'stage_type', ''), 'aberto'),
      (v_stage->>'max_idle_hours')::integer,
      (v_stage->>'cadence_value')::integer,
      v_stage->>'cadence_unit'
    );
  END LOOP;

  RETURN v_pipeline_id;
END;
$$;

COMMENT ON FUNCTION public.shape_pipeline(uuid, jsonb) IS
  'Sprint 6.8: atomically creates a pipeline and stages from a PipelineBlueprint payload.';

GRANT EXECUTE ON FUNCTION public.shape_pipeline(uuid, jsonb) TO service_role;

-- ============================================================================
-- 7. Update get_dashboard_kpis — s.stage_type comparisons use PT-BR values
--    Note: o.status (opportunities.status) remains English ('won'/'lost') as
--    that CHECK constraint is unchanged in Sprint 6.8.
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

  -- Won opportunities: status='won' OR stage_type='ganho'.
  SELECT COUNT(*) INTO v_won_leads
  FROM public.opportunities o
  JOIN public.pipeline_stages_v2 s ON o.stage_id = s.id
  WHERE o.equipe_id = p_equipe_id
    AND o.deleted_at IS NULL
    AND (o.status = 'won' OR s.stage_type = 'ganho')
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
    AND (o.status = 'won' OR s.stage_type = 'ganho')
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
    AND (o.status IN ('won','lost') OR s.stage_type IN ('ganho','perdido'))
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

  -- Meeting metrics still read the legacy lead column (Epic 3 backfill).
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
    AND (o.status = 'won' OR s.stage_type = 'ganho')
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
