-- Sprint 11 · Onda 3 · T35 — as naturezas Oferta e Processo.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_natures.test.sql
--
-- O que este teste protege: a natureza se grava pelo verbo (validada e
-- normalizada); escolher marcos numa linha que já existe cria só as etapas que
-- faltam (antes do ganho/perda, declarando o marco) e repetir não duplica; os
-- marcos novos de contrato são eventos de verdade; o vizinho não mexe.

begin;

-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000800_sprint11_w3_natures.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('511ea000-0000-0000-0000-000000000001', 'S11W3 Natureza A', 'x', 'y'),
  ('511ea000-0000-0000-0000-000000000002', 'S11W3 Natureza B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('511eb000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w3-natureza.test',   'x', now(), now()),
  ('511eb000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w3-natureza.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('511eb000-0000-0000-0000-00000000000a', '511eb000-0000-0000-0000-00000000000a', 'chefe@s11w3-natureza.test',   '511ea000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('511eb000-0000-0000-0000-00000000000d', '511eb000-0000-0000-0000-00000000000d', 'vizinho@s11w3-natureza.test', '511ea000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('511ec000-0000-0000-0000-000000000001', '511ea000-0000-0000-0000-000000000001', 'Natureza S11W3');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('511ed000-0000-0000-0000-000000000001', '511ea000-0000-0000-0000-000000000001', '511ec000-0000-0000-0000-000000000001', 'Novo',     0, 'open', null),
  ('511ed000-0000-0000-0000-000000000002', '511ea000-0000-0000-0000-000000000001', '511ec000-0000-0000-0000-000000000001', 'Proposta', 1, 'open', 'proposal_sent'),
  ('511ed000-0000-0000-0000-000000000003', '511ea000-0000-0000-0000-000000000001', '511ec000-0000-0000-0000-000000000001', 'Ganho',    2, 'won',  null),
  ('511ed000-0000-0000-0000-000000000004', '511ea000-0000-0000-0000-000000000001', '511ec000-0000-0000-0000-000000000001', 'Perdido',  3, 'lost', null);

insert into public.catalog_items (id, equipe_id, name) values
  ('511eca00-0000-0000-0000-000000000001', '511ea000-0000-0000-0000-000000000001', 'Usina'),
  ('511eca00-0000-0000-0000-000000000009', '511ea000-0000-0000-0000-000000000002', 'Do vizinho');

insert into public.leads (id, equipe_id, name) values
  ('511ee000-0000-0000-0000-000000000001', '511ea000-0000-0000-0000-000000000001', 'Contato Natureza');

set local role authenticated;
set local request.jwt.claims = '{"sub":"511eb000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Gravar a natureza: validada e normalizada.
-- ============================================================================
do $$
declare v jsonb; v_failed boolean;
begin
  v := public.crm_save_pipeline_natures('511ec000-0000-0000-0000-000000000001', jsonb_build_object(
         'offer',   jsonb_build_object('mode', 'catalog', 'catalog_item_ids', jsonb_build_array('511eca00-0000-0000-0000-000000000001')),
         'process', jsonb_build_object('mode', 'milestones', 'milestones', jsonb_build_array('proposal_sent', 'qualified', 'qualified'))));
  assert v->'process'->'milestones' = '["qualified", "proposal_sent"]'::jsonb,
    'T35-1 FAIL: marcos deveriam vir sem repeticao e na ordem do funil, vieram ' || (v->'process'->'milestones')::text;
  assert (select natures->'offer'->>'mode' from public.pipelines where id = '511ec000-0000-0000-0000-000000000001') = 'catalog',
    'T35-1 FAIL: a natureza nao foi gravada';

  v_failed := false;
  begin
    perform public.crm_save_pipeline_natures('511ec000-0000-0000-0000-000000000001',
      jsonb_build_object('offer', jsonb_build_object('mode', 'leilao'), 'process', jsonb_build_object('mode', 'direct')));
  exception when others then v_failed := sqlerrm like '%invalid_natures%';
  end;
  assert v_failed, 'T35-1 FAIL: modo de oferta desconhecido deveria ser recusado';

  v_failed := false;
  begin
    perform public.crm_save_pipeline_natures('511ec000-0000-0000-0000-000000000001', jsonb_build_object(
      'offer', jsonb_build_object('mode', 'catalog', 'catalog_item_ids', jsonb_build_array('511eca00-0000-0000-0000-000000000009')),
      'process', jsonb_build_object('mode', 'direct')));
  exception when others then v_failed := sqlerrm like '%catalog_item_not_found%';
  end;
  assert v_failed, 'T35-1 FAIL: item do catalogo do vizinho nao deveria entrar na oferta';
end $$;

-- ============================================================================
-- 2. Marcos numa linha existente: só as etapas que faltam, antes do ganho.
-- ============================================================================
do $$
declare n int;
begin
  n := public.crm_add_milestone_stages('511ec000-0000-0000-0000-000000000001',
         array['qualified', 'proposal_sent', 'contract_signed']);
  assert n = 2, 'T35-2 FAIL: deveria criar 2 etapas (qualificado e contrato assinado), criou ' || n;
  assert (select array_agg(coalesce(funnel_event, stage_type) order by position)
            from public.pipeline_stages_v2 where pipeline_id = '511ec000-0000-0000-0000-000000000001' and deleted_at is null)
         = array['open', 'proposal_sent', 'qualified', 'contract_signed', 'won', 'lost'],
    'T35-2 FAIL: as etapas novas deveriam entrar antes do ganho e da perda';
  assert (select name from public.pipeline_stages_v2 where pipeline_id = '511ec000-0000-0000-0000-000000000001'
            and funnel_event = 'contract_signed') = 'Contrato assinado',
    'T35-2 FAIL: a etapa nova deveria ter o nome do marco';

  n := public.crm_add_milestone_stages('511ec000-0000-0000-0000-000000000001',
         array['qualified', 'proposal_sent', 'contract_signed']);
  assert n = 0, 'T35-2 FAIL: repetir nao deveria criar etapas';
end $$;

-- ============================================================================
-- 3. O marco novo é evento de verdade.
-- ============================================================================
do $$
declare v_stage uuid;
begin
  select id into v_stage from public.pipeline_stages_v2
   where pipeline_id = '511ec000-0000-0000-0000-000000000001' and funnel_event = 'contract_signed';
  insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
    ('511ef000-0000-0000-0000-000000000001', '511ea000-0000-0000-0000-000000000001', '511ee000-0000-0000-0000-000000000001',
     '511ec000-0000-0000-0000-000000000001', '511ed000-0000-0000-0000-000000000001');
  update public.opportunities set stage_id = v_stage where id = '511ef000-0000-0000-0000-000000000001';
  assert exists (select 1 from public.funnel_events
                  where opportunity_id = '511ef000-0000-0000-0000-000000000001' and event = 'contract_signed'),
    'T35-3 FAIL: entrar na etapa Contrato assinado deveria gravar o evento';
end $$;

-- ============================================================================
-- 4. O vizinho não mexe na linha da equipe A.
-- ============================================================================
set local request.jwt.claims = '{"sub":"511eb000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean := false; n int;
begin
  begin
    perform public.crm_save_pipeline_natures('511ec000-0000-0000-0000-000000000001',
      jsonb_build_object('offer', jsonb_build_object('mode', 'free'), 'process', jsonb_build_object('mode', 'direct')));
  exception when others then v_failed := sqlerrm like '%pipeline_not_found%';
  end;
  assert v_failed, 'T35-4 FAIL: o vizinho gravou a natureza da linha da equipe A';

  v_failed := false;
  begin
    n := public.crm_add_milestone_stages('511ec000-0000-0000-0000-000000000001', array['meeting_done']);
  exception when others then v_failed := sqlerrm like '%pipeline_not_found%';
  end;
  assert v_failed, 'T35-4 FAIL: o vizinho criou etapas na linha da equipe A';
end $$;

rollback;
select 'PASS' as result;
