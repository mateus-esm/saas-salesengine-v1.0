-- Sprint 11 · Onda 3 · T37 — Track Shaper understands the configured line.
--
-- The Python service already validates PipelineBlueprint. This database edge
-- remains atomic and persists both parts of the same contract: the line's
-- natures and each stage's canonical funnel event.

create or replace function public.shape_pipeline(
  p_equipe_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline_id uuid;
  v_custom_fields_schema jsonb := '[]'::jsonb;
  v_custom_fields jsonb := '[]'::jsonb;
  v_natures jsonb;
  v_field jsonb;
  v_stage jsonb;
  v_field_position integer;
  v_stage_position integer;
begin
  if p_equipe_id is null then
    raise exception 'shape_pipeline requires p_equipe_id';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'shape_pipeline requires an object payload';
  end if;

  if nullif(btrim(p_payload->>'pipeline_name'), '') is null then
    raise exception 'shape_pipeline requires pipeline_name';
  end if;

  if jsonb_typeof(p_payload->'stages') <> 'array'
     or jsonb_array_length(p_payload->'stages') < 1 then
    raise exception 'shape_pipeline requires at least one stage';
  end if;

  if p_payload ? 'natures' and jsonb_typeof(p_payload->'natures') <> 'object' then
    raise exception 'shape_pipeline natures must be an object';
  end if;
  v_natures := coalesce(
    p_payload->'natures',
    '{"offer":{"mode":"free","catalog_item_ids":[]},"process":{"mode":"milestones","milestones":[]}}'::jsonb
  );

  if p_payload ? 'custom_fields' then
    if jsonb_typeof(p_payload->'custom_fields') <> 'array' then
      raise exception 'shape_pipeline custom_fields must be an array';
    end if;
    v_custom_fields := p_payload->'custom_fields';
  end if;

  for v_field in select value from jsonb_array_elements(v_custom_fields)
  loop
    if nullif(btrim(v_field->>'key'), '') is null then
      raise exception 'shape_pipeline custom field key is required';
    end if;
    if nullif(btrim(v_field->>'label'), '') is null then
      raise exception 'shape_pipeline custom field label is required';
    end if;
    if nullif(btrim(v_field->>'type'), '') is null then
      raise exception 'shape_pipeline custom field type is required';
    end if;
    if v_field->>'position' is null then
      raise exception 'shape_pipeline custom field position is required';
    end if;

    v_field_position := (v_field->>'position')::integer;
    v_custom_fields_schema := v_custom_fields_schema || jsonb_build_array(
      jsonb_build_object(
        'field_id', gen_random_uuid()::text,
        'key', v_field->>'key',
        'label', v_field->>'label',
        'type', v_field->>'type',
        'required', coalesce((v_field->>'required')::boolean, false),
        'options', v_field->'options',
        'position', v_field_position,
        'description', v_field->>'description',
        'is_deleted', false
      )
    );
  end loop;

  insert into public.pipelines (equipe_id, name, description, custom_fields_schema)
  values (p_equipe_id, p_payload->>'pipeline_name', p_payload->>'description', v_custom_fields_schema)
  returning id into v_pipeline_id;

  -- The T35 verb validates modes, canonicalizes milestones and checks catalog
  -- ownership. A failure rolls this whole function back, including the parent.
  perform public.crm_save_pipeline_natures(v_pipeline_id, v_natures);

  for v_stage in select value from jsonb_array_elements(p_payload->'stages')
  loop
    if nullif(btrim(v_stage->>'name'), '') is null then
      raise exception 'shape_pipeline stage name is required';
    end if;
    if v_stage->>'position' is null then
      raise exception 'shape_pipeline stage position is required';
    end if;

    v_stage_position := (v_stage->>'position')::integer;
    insert into public.pipeline_stages_v2 (
      equipe_id,
      pipeline_id,
      name,
      color,
      position,
      stage_type,
      description,
      max_idle_hours,
      cadence_value,
      cadence_unit,
      funnel_event
    )
    values (
      p_equipe_id,
      v_pipeline_id,
      v_stage->>'name',
      coalesce(nullif(v_stage->>'color', ''), '#64748b'),
      v_stage_position,
      coalesce(nullif(v_stage->>'stage_type', ''), 'open'),
      v_stage->>'description',
      (v_stage->>'max_idle_hours')::integer,
      (v_stage->>'cadence_value')::integer,
      v_stage->>'cadence_unit',
      v_stage->>'funnel_event'
    );
  end loop;

  return v_pipeline_id;
end;
$$;

-- A public SECURITY DEFINER function is an API endpoint. The service supplies
-- equipe_id from the verified tenant context; browser roles must never call it.
revoke all on function public.shape_pipeline(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.shape_pipeline(uuid, jsonb) to service_role;

comment on function public.shape_pipeline(uuid, jsonb) is
  'Sprint 11 T37: atomically creates a configured pipeline from a validated Copilot blueprint; service_role only.';
