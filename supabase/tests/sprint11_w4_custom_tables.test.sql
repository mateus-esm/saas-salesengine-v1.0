-- Sprint 11 · Onda 4 · T39 — tabelas personalizadas em field_id + página no servidor.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w4_custom_tables.test.sql
--
-- O que este teste protege: a conversão dá `field_id` a toda coluna, leva os
-- valores de `data[key]` para `data[field_id]`, e leva junto os vínculos
-- (relation_key) e o campo de exibição das relações — e rodar de novo não muda
-- nada; coluna nova sem `field_id` ganha um; a página do servidor busca, ordena
-- pelo tipo da coluna e conta; o vizinho não lê.

begin;

-- @include supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql

-- ============================================================================
-- 0. Ensaio sobre a produção: depois da migration, nenhuma coluna sem field_id
--    e nenhum valor ainda preso à key.
-- ============================================================================
do $$
declare v_cols int; v_recs int;
begin
  assert not exists (select 1 from public.custom_tables t, jsonb_array_elements(t.table_schema) c
                      where jsonb_typeof(t.table_schema) = 'array' and nullif(c->>'field_id', '') is null),
    'T39-0 FAIL: coluna da producao ficou sem field_id';
  assert not exists (select 1
                       from public.custom_table_records r
                       join public.custom_tables t on t.id = r.table_id
                       cross join lateral jsonb_array_elements(t.table_schema) c
                      where c->>'key' <> c->>'field_id' and r.data ? (c->>'key') and not r.data ? (c->>'field_id')),
    'T39-0 FAIL: registro da producao ainda tem valor pela key';
  select count(*) into v_cols from public.custom_tables t, jsonb_array_elements(t.table_schema) c
   where jsonb_typeof(t.table_schema) = 'array';
  select count(*) into v_recs from public.custom_table_records;
  raise notice 'conversao: % colunas, % registros', v_cols, v_recs;
end $$;

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5120a000-0000-0000-0000-000000000001', 'S11W4 Tabelas A', 'x', 'y'),
  ('5120a000-0000-0000-0000-000000000002', 'S11W4 Tabelas B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5120b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w4-tabelas.test',   'x', now(), now()),
  ('5120b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w4-tabelas.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5120b000-0000-0000-0000-00000000000a', '5120b000-0000-0000-0000-00000000000a', 'chefe@s11w4-tabelas.test',   '5120a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5120b000-0000-0000-0000-00000000000d', '5120b000-0000-0000-0000-00000000000d', 'vizinho@s11w4-tabelas.test', '5120a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

-- Duas tabelas no formato antigo (por key): Usinas (nome, potência) e Visitas
-- (nota, relação com Usinas pelo nome).
insert into public.custom_tables (id, equipe_id, name, slug, table_schema) values
  ('5120c000-0000-0000-0000-000000000001', '5120a000-0000-0000-0000-000000000001', 'Usinas', 'usinas_w4', jsonb_build_array(
     jsonb_build_object('key', 'nome', 'label', 'Nome', 'type', 'text'),
     jsonb_build_object('key', 'potencia', 'label', 'Potência', 'type', 'number'))),
  ('5120c000-0000-0000-0000-000000000002', '5120a000-0000-0000-0000-000000000001', 'Visitas', 'visitas_w4', jsonb_build_array(
     jsonb_build_object('key', 'nota', 'label', 'Nota', 'type', 'text'),
     jsonb_build_object('key', 'usina', 'label', 'Usina', 'type', 'relation',
                        'relationConfig', jsonb_build_object('targetTable', 'Usinas', 'targetTableSlug', 'usinas_w4',
                                                             'targetTableId', '5120c000-0000-0000-0000-000000000001',
                                                             'displayField', 'nome'))));

insert into public.custom_table_records (id, equipe_id, table_id, data) values
  ('5120d000-0000-0000-0000-000000000001', '5120a000-0000-0000-0000-000000000001', '5120c000-0000-0000-0000-000000000001', '{"nome":"Usina Norte","potencia":"8.5"}'),
  ('5120d000-0000-0000-0000-000000000002', '5120a000-0000-0000-0000-000000000001', '5120c000-0000-0000-0000-000000000001', '{"nome":"Usina Sul","potencia":12}'),
  ('5120d000-0000-0000-0000-000000000003', '5120a000-0000-0000-0000-000000000001', '5120c000-0000-0000-0000-000000000001', '{"nome":"Galpão","potencia":3}'),
  ('5120d000-0000-0000-0000-000000000011', '5120a000-0000-0000-0000-000000000001', '5120c000-0000-0000-0000-000000000002', '{"nota":"primeira visita"}');

insert into public.custom_table_links (equipe_id, from_table, from_id, to_table, to_id, relation_key) values
  ('5120a000-0000-0000-0000-000000000001', 'visitas_w4', '5120d000-0000-0000-0000-000000000011',
   '5120c000-0000-0000-0000-000000000001', '5120d000-0000-0000-0000-000000000001', 'usina');

-- ============================================================================
-- 1. A conversão: field_id em toda coluna, valores e vínculos junto.
-- ============================================================================
do $$
declare
  v_nome uuid; v_pot uuid; v_usina uuid; v_data jsonb;
begin
  perform public._crm_custom_tables_to_field_id();

  select (c->>'field_id')::uuid into v_nome from public.custom_tables t, jsonb_array_elements(t.table_schema) c
   where t.id = '5120c000-0000-0000-0000-000000000001' and c->>'key' = 'nome';
  select (c->>'field_id')::uuid into v_pot from public.custom_tables t, jsonb_array_elements(t.table_schema) c
   where t.id = '5120c000-0000-0000-0000-000000000001' and c->>'key' = 'potencia';
  select (c->>'field_id')::uuid into v_usina from public.custom_tables t, jsonb_array_elements(t.table_schema) c
   where t.id = '5120c000-0000-0000-0000-000000000002' and c->>'key' = 'usina';
  assert v_nome is not null and v_pot is not null and v_usina is not null, 'T39-1 FAIL: toda coluna deveria ganhar field_id';

  select data into v_data from public.custom_table_records where id = '5120d000-0000-0000-0000-000000000001';
  assert v_data = jsonb_build_object(v_nome::text, 'Usina Norte', v_pot::text, '8.5'),
    'T39-1 FAIL: os valores deveriam ir para data[field_id], ficou ' || v_data::text;

  assert (select relation_key from public.custom_table_links where from_id = '5120d000-0000-0000-0000-000000000011') = v_usina::text,
    'T39-1 FAIL: o vinculo deveria passar a relation_key = field_id da coluna';

  assert (select c->'relationConfig'->>'displayField' from public.custom_tables t, jsonb_array_elements(t.table_schema) c
           where t.id = '5120c000-0000-0000-0000-000000000002' and c->>'key' = 'usina') = v_nome::text,
    'T39-1 FAIL: o campo de exibicao da relacao deveria virar o field_id da coluna alvo';

  -- Idempotente.
  perform public._crm_custom_tables_to_field_id();
  assert (select data from public.custom_table_records where id = '5120d000-0000-0000-0000-000000000001') = v_data,
    'T39-1 FAIL: rodar a conversao de novo mudou os dados';
end $$;

-- ============================================================================
-- 2. Coluna nova sem field_id ganha um; as existentes ficam.
-- ============================================================================
do $$
declare v_before jsonb; v_after jsonb;
begin
  select table_schema into v_before from public.custom_tables where id = '5120c000-0000-0000-0000-000000000001';
  update public.custom_tables
     set table_schema = table_schema || jsonb_build_array(jsonb_build_object('key', 'cidade', 'label', 'Cidade', 'type', 'text'))
   where id = '5120c000-0000-0000-0000-000000000001';
  select table_schema into v_after from public.custom_tables where id = '5120c000-0000-0000-0000-000000000001';
  assert (v_after->2->>'field_id') is not null, 'T39-2 FAIL: coluna nova deveria ganhar field_id';
  assert v_after->0->>'field_id' = v_before->0->>'field_id', 'T39-2 FAIL: o field_id de uma coluna existente mudou';
end $$;

-- ============================================================================
-- 3. A página do servidor: busca, ordena pelo tipo, conta.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5120b000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare v jsonb; v_pot text; v_nome text;
begin
  select c->>'field_id' into v_pot from public.custom_tables t, jsonb_array_elements(t.table_schema) c
   where t.id = '5120c000-0000-0000-0000-000000000001' and c->>'key' = 'potencia';
  select c->>'field_id' into v_nome from public.custom_tables t, jsonb_array_elements(t.table_schema) c
   where t.id = '5120c000-0000-0000-0000-000000000001' and c->>'key' = 'nome';

  v := public.crm_custom_table_page('5120c000-0000-0000-0000-000000000001', 'usina', null, 50, 0);
  assert jsonb_array_length(v) = 2, 'T39-3 FAIL: a busca por "usina" deveria achar 2, achou ' || jsonb_array_length(v);
  assert public.crm_custom_table_count('5120c000-0000-0000-0000-000000000001', 'usina') = 2,
    'T39-3 FAIL: a contagem deveria bater com a busca';

  -- Potência é número: 3 < 8.5 < 12 (como texto seria "12" < "3" < "8.5").
  v := public.crm_custom_table_page('5120c000-0000-0000-0000-000000000001', null,
         jsonb_build_object('field_id', v_pot, 'dir', 'asc'), 50, 0);
  assert (select array_agg(r->'data'->>v_nome order by ord) from jsonb_array_elements(v) with ordinality x(r, ord))
         = array['Galpão', 'Usina Norte', 'Usina Sul'],
    'T39-3 FAIL: ordenar pela potencia deveria ser numerico';

  v := public.crm_custom_table_page('5120c000-0000-0000-0000-000000000001', null, null, 2, 2);
  assert jsonb_array_length(v) = 1, 'T39-3 FAIL: a segunda pagina (limite 2) deveria ter 1';
end $$;

set local request.jwt.claims = '{"sub":"5120b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$ begin
  assert jsonb_array_length(public.crm_custom_table_page('5120c000-0000-0000-0000-000000000001', null, null, 50, 0)) = 0,
    'T39-4 FAIL: o vizinho le a tabela da equipe A';
end $$;

rollback;
select 'PASS' as result;
