-- Sprint 11 · Onda 4 · T40 — o artefato preso ao negócio.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w4_artifacts.test.sql
--
-- O que este teste protege: criar um artefato já preso ao negócio, em rascunho,
-- guardando só as colunas da tabela; tabela comum não vira artefato pelo verbo;
-- o negócio e a tabela são da mesma equipe do registro (a guarda também fecha a
-- gravação direta); o painel do negócio lista as tabelas de artefato com os
-- registros daquele negócio; a linha da tabela carrega o negócio; o vizinho não
-- vê nem cria.

begin;

-- @include supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql
-- @include supabase/migrations/20260912100200_sprint11_w4_artifacts.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5121a000-0000-0000-0000-000000000001', 'S11W4 Artefato A', 'x', 'y'),
  ('5121a000-0000-0000-0000-000000000002', 'S11W4 Artefato B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5121b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w4-artefato.test',   'x', now(), now()),
  ('5121b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w4-artefato.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5121b000-0000-0000-0000-00000000000a', '5121b000-0000-0000-0000-00000000000a', 'chefe@s11w4-artefato.test',   '5121a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5121b000-0000-0000-0000-00000000000d', '5121b000-0000-0000-0000-00000000000d', 'vizinho@s11w4-artefato.test', '5121a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('5121c000-0000-0000-0000-000000000001', '5121a000-0000-0000-0000-000000000001', 'Artefato A'),
  ('5121c000-0000-0000-0000-000000000002', '5121a000-0000-0000-0000-000000000002', 'Artefato B');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5121d000-0000-0000-0000-000000000001', '5121a000-0000-0000-0000-000000000001', '5121c000-0000-0000-0000-000000000001', 'Novo', 0, 'open'),
  ('5121d000-0000-0000-0000-000000000002', '5121a000-0000-0000-0000-000000000002', '5121c000-0000-0000-0000-000000000002', 'Novo', 0, 'open');

insert into public.leads (id, equipe_id, name) values
  ('5121e000-0000-0000-0000-000000000001', '5121a000-0000-0000-0000-000000000001', 'Usina do Joao'),
  ('5121e000-0000-0000-0000-000000000002', '5121a000-0000-0000-0000-000000000002', 'Contato do Vizinho');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('5121f000-0000-0000-0000-000000000001', '5121a000-0000-0000-0000-000000000001', '5121e000-0000-0000-0000-000000000001',
   '5121c000-0000-0000-0000-000000000001', '5121d000-0000-0000-0000-000000000001'),
  ('5121f000-0000-0000-0000-000000000002', '5121a000-0000-0000-0000-000000000002', '5121e000-0000-0000-0000-000000000002',
   '5121c000-0000-0000-0000-000000000002', '5121d000-0000-0000-0000-000000000002');

insert into public.custom_tables (id, equipe_id, name, slug, artifact_kind, table_schema) values
  ('51210000-0000-0000-0000-0000000000c1', '5121a000-0000-0000-0000-000000000001', 'Propostas', 'propostas_w4', 'proposal',
   jsonb_build_array(jsonb_build_object('field_id', 'f-titulo', 'key', 'titulo', 'label', 'Título', 'type', 'text'),
                     jsonb_build_object('field_id', 'f-valor', 'key', 'valor', 'label', 'Valor', 'type', 'currency'))),
  ('51210000-0000-0000-0000-0000000000c2', '5121a000-0000-0000-0000-000000000001', 'Contratos', 'contratos_w4', 'contract',
   jsonb_build_array(jsonb_build_object('field_id', 'f-numero', 'key', 'numero', 'label', 'Número', 'type', 'text'))),
  ('51210000-0000-0000-0000-0000000000c3', '5121a000-0000-0000-0000-000000000001', 'Notas', 'notas_w4', null,
   jsonb_build_array(jsonb_build_object('field_id', 'f-nota', 'key', 'nota', 'label', 'Nota', 'type', 'text'))),
  ('51210000-0000-0000-0000-0000000000c9', '5121a000-0000-0000-0000-000000000002', 'Propostas B', 'propostas_b_w4', 'proposal',
   '[]'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5121b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Criar o artefato: preso ao negócio, em rascunho, só as colunas da tabela.
-- ============================================================================
do $$
declare v jsonb; v_failed boolean;
begin
  v := public.crm_create_artifact('51210000-0000-0000-0000-0000000000c1', '5121f000-0000-0000-0000-000000000001',
         '{"f-titulo":"Proposta 1","f-valor":"45000","campo_que_nao_existe":"x"}');
  assert v->>'opportunity_id' = '5121f000-0000-0000-0000-000000000001', 'T40-1 FAIL: o artefato deveria nascer preso ao negocio';
  assert v->>'artifact_status' = 'draft', 'T40-1 FAIL: o artefato deveria nascer em rascunho';
  assert v->'data' = '{"f-titulo":"Proposta 1","f-valor":"45000"}'::jsonb,
    'T40-1 FAIL: so as colunas da tabela deveriam ser gravadas, ficou ' || (v->'data')::text;
  assert v->'deal'->>'name' = 'Usina do Joao', 'T40-1 FAIL: a linha deveria trazer o nome do negocio';

  v_failed := false;
  begin
    perform public.crm_create_artifact('51210000-0000-0000-0000-0000000000c3', '5121f000-0000-0000-0000-000000000001');
  exception when others then v_failed := sqlerrm = 'not_an_artifact_table';
  end;
  assert v_failed, 'T40-1 FAIL: tabela comum nao deveria virar artefato pelo verbo';

  v_failed := false;
  begin
    perform public.crm_create_artifact('51210000-0000-0000-0000-0000000000c1', '5121f000-0000-0000-0000-000000000002');
  exception when others then v_failed := sqlerrm = 'opportunity_not_found';
  end;
  assert v_failed, 'T40-1 FAIL: artefato preso ao negocio do vizinho';
end $$;

-- ============================================================================
-- 2. A guarda: gravação direta também respeita equipe da tabela e do negócio;
--    registro de tabela de artefato nasce em rascunho.
-- ============================================================================
do $$
declare v_failed boolean; v_status text;
begin
  v_failed := false;
  begin
    insert into public.custom_table_records (equipe_id, table_id, data, opportunity_id) values
      ('5121a000-0000-0000-0000-000000000001', '51210000-0000-0000-0000-0000000000c1', '{}', '5121f000-0000-0000-0000-000000000002');
  exception when others then v_failed := sqlerrm = 'opportunity_not_found';
  end;
  assert v_failed, 'T40-2 FAIL: gravacao direta prendeu o registro ao negocio do vizinho';

  v_failed := false;
  begin
    insert into public.custom_table_records (equipe_id, table_id, data) values
      ('5121a000-0000-0000-0000-000000000001', '51210000-0000-0000-0000-0000000000c9', '{}');
  exception when others then v_failed := sqlerrm = 'table_not_found';
  end;
  assert v_failed, 'T40-2 FAIL: registro da equipe A entrou na tabela da equipe B';

  insert into public.custom_table_records (equipe_id, table_id, data) values
    ('5121a000-0000-0000-0000-000000000001', '51210000-0000-0000-0000-0000000000c2', '{"f-numero":"C-1"}')
  returning artifact_status into v_status;
  assert v_status = 'draft', 'T40-2 FAIL: registro de tabela de artefato deveria nascer em rascunho';

  insert into public.custom_table_records (equipe_id, table_id, data) values
    ('5121a000-0000-0000-0000-000000000001', '51210000-0000-0000-0000-0000000000c3', '{"f-nota":"n"}')
  returning artifact_status into v_status;
  assert v_status is null, 'T40-2 FAIL: registro de tabela comum nao tem status de artefato';
end $$;

-- ============================================================================
-- 3. O painel do negócio e a linha da tabela.
-- ============================================================================
do $$
declare v jsonb; v_page jsonb;
begin
  v := public.crm_deal_artifacts('5121f000-0000-0000-0000-000000000001');
  assert (select array_agg(g->'table'->>'name' order by ord) from jsonb_array_elements(v) with ordinality x(g, ord))
         = array['Propostas', 'Contratos'],
    'T40-3 FAIL: o painel deveria listar as tabelas de artefato da equipe (proposta antes de contrato), veio ' || v::text;
  assert jsonb_array_length(v->0->'records') = 1, 'T40-3 FAIL: Propostas deveria ter 1 registro deste negocio';
  assert jsonb_array_length(v->1->'records') = 0, 'T40-3 FAIL: o contrato solto nao e deste negocio';

  v_page := public.crm_custom_table_page('51210000-0000-0000-0000-0000000000c1', null, null, 50, 0);
  assert v_page->0->'deal'->>'name' = 'Usina do Joao', 'T40-3 FAIL: a linha da tabela deveria carregar o negocio';
end $$;

-- ============================================================================
-- 4. O vizinho não vê o painel nem cria na tabela da equipe A.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5121b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  assert public.crm_deal_artifacts('5121f000-0000-0000-0000-000000000001') = '[]'::jsonb,
    'T40-4 FAIL: o vizinho ve os artefatos do negocio da equipe A';
  begin
    perform public.crm_create_artifact('51210000-0000-0000-0000-0000000000c1', '5121f000-0000-0000-0000-000000000001');
  exception when others then v_failed := sqlerrm = 'table_not_found';
  end;
  assert v_failed, 'T40-4 FAIL: o vizinho criou artefato na tabela da equipe A';
end $$;

rollback;
select 'PASS' as result;
