-- ============================================================================
-- Sprint 6 · B4 — Atomic pipeline shaper RPC
-- Turns a validated PipelineBlueprint JSON payload into pipelines + stages.
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
      COALESCE(NULLIF(v_stage->>'stage_type', ''), 'open'),
      (v_stage->>'max_idle_hours')::integer,
      (v_stage->>'cadence_value')::integer,
      v_stage->>'cadence_unit'
    );
  END LOOP;

  RETURN v_pipeline_id;
END;
$$;

COMMENT ON FUNCTION public.shape_pipeline(uuid, jsonb) IS
  'Sprint 6: atomically creates a pipeline and stages from a Solo Copilot PipelineBlueprint payload.';

GRANT EXECUTE ON FUNCTION public.shape_pipeline(uuid, jsonb) TO service_role;

