-- Sprint 11 · Onda 3 · T37 — natures and funnel events cross the DB edge.
-- Run: bash scripts/sqltest.sh supabase/tests/sprint11_w3_track_shaper.test.sql

begin;

-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000800_sprint11_w3_natures.sql
-- @include supabase/migrations/20260912024524_sprint11_w3_track_shaper_natures.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('537ea000-0000-0000-0000-000000000001', 'S11W3 Shaper', 'x', 'y');

do $$
declare
  v_pipeline uuid;
  v_failed boolean := false;
begin
  v_pipeline := public.shape_pipeline(
    '537ea000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'pipeline_name', 'Venda Solar pelo Shaper',
      'description', 'Linha configurada pelo Copilot',
      'natures', jsonb_build_object(
        'offer', jsonb_build_object('mode', 'catalog', 'catalog_item_ids', jsonb_build_array()),
        'process', jsonb_build_object('mode', 'milestones', 'milestones', jsonb_build_array('qualified', 'proposal_sent'))
      ),
      'stages', jsonb_build_array(
        jsonb_build_object('name', 'Novo', 'position', 0, 'stage_type', 'open'),
        jsonb_build_object('name', 'Qualificado', 'position', 1, 'stage_type', 'open', 'funnel_event', 'qualified'),
        jsonb_build_object('name', 'Proposta', 'position', 2, 'stage_type', 'open', 'funnel_event', 'proposal_sent', 'description', 'Proposta pronta'),
        jsonb_build_object('name', 'Ganho', 'position', 3, 'stage_type', 'won'),
        jsonb_build_object('name', 'Perdido', 'position', 4, 'stage_type', 'lost')
      ),
      'custom_fields', jsonb_build_array()
    )
  );

  assert (select natures->'offer'->>'mode' from public.pipelines where id = v_pipeline) = 'catalog',
    'T37 FAIL: shape_pipeline did not persist offer nature';
  assert (select natures->'process'->'milestones' from public.pipelines where id = v_pipeline)
         = '["qualified", "proposal_sent"]'::jsonb,
    'T37 FAIL: shape_pipeline did not persist process milestones';
  assert (select array_agg(funnel_event order by position) filter (where funnel_event is not null)
            from public.pipeline_stages_v2 where pipeline_id = v_pipeline)
         = array['qualified', 'proposal_sent'],
    'T37 FAIL: stage funnel events did not cross the apply edge';
  assert (select description from public.pipeline_stages_v2
           where pipeline_id = v_pipeline and funnel_event = 'proposal_sent') = 'Proposta pronta',
    'T37 FAIL: stage description was dropped';

  begin
    perform public.shape_pipeline(
      '537ea000-0000-0000-0000-000000000001',
      '{"pipeline_name":"Invalid nature","natures":{"offer":{"mode":"auction"},"process":{"mode":"direct"}},"stages":[{"name":"Novo","position":0}]}'::jsonb
    );
  exception when others then
    v_failed := sqlerrm like '%invalid_natures%';
  end;
  assert v_failed, 'T37 FAIL: invalid nature should abort the blueprint';
  assert not exists (select 1 from public.pipelines where name = 'Invalid nature'),
    'T37 FAIL: invalid blueprint left an orphan pipeline';

  assert not has_function_privilege('authenticated', 'public.shape_pipeline(uuid,jsonb)', 'execute'),
    'T37 FAIL: authenticated can call the service-role SECURITY DEFINER edge';
  assert has_function_privilege('service_role', 'public.shape_pipeline(uuid,jsonb)', 'execute'),
    'T37 FAIL: service_role lost the apply edge';
end $$;

rollback;
select 'PASS' as result;
