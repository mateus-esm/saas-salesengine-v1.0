-- Sprint 11 · Onda 2 · T13 — tabelas no servidor + verbos de negócio.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w2_tables.test.sql
--
-- O que este teste protege: a Tabela de Leads e a Base de Contatos vêm do servidor
-- em páginas que nunca repetem nem pulam linha, em qualquer ordenação; o total da
-- tabela é o do Kanban; a linha da tabela é o mesmo card do Kanban; o contato traz
-- a situação, os números e os negócios dele; um tenant não vê o outro; e os verbos
-- de negócio (mover, atribuir, apagar, criar em lote) fazem só o que dizem.

begin;

-- @include supabase/migrations/20260910000100_sprint11_opportunity_owner.sql
-- @include supabase/migrations/20260910000200_sprint11_crm_board.sql
-- @include supabase/migrations/20260911000100_sprint11_w2_filters.sql
-- @include supabase/migrations/20260911000200_sprint11_w2_tables.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5115a000-0000-0000-0000-000000000001', 'S11W2 Tabelas A', 'x', 'y'),
  ('5115a000-0000-0000-0000-000000000002', 'S11W2 Tabelas B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5115b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w2-tabelas.test',    'x', now(), now()),
  ('5115b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor@s11w2-tabelas.test', 'x', now(), now()),
  ('5115b000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outro@s11w2-tabelas.test',    'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5115b000-0000-0000-0000-00000000000a', '5115b000-0000-0000-0000-00000000000a', 'chefe@s11w2-tabelas.test',    '5115a000-0000-0000-0000-000000000001', 'Chefe A',    'admin'),
  ('5115b000-0000-0000-0000-00000000000b', '5115b000-0000-0000-0000-00000000000b', 'vendedor@s11w2-tabelas.test', '5115a000-0000-0000-0000-000000000001', 'Vendedor A', 'user'),
  ('5115b000-0000-0000-0000-00000000000c', '5115b000-0000-0000-0000-00000000000c', 'outro@s11w2-tabelas.test',    '5115a000-0000-0000-0000-000000000002', 'Outro B',    'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

-- P: a linha da tabela, com campos número, data, texto e multi-seleção.
insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5115c000-0000-0000-0000-000000000001', '5115a000-0000-0000-0000-000000000001', 'Tabela S11W2', jsonb_build_array(
     jsonb_build_object('field_id', '5115f100-0000-0000-0000-000000000001', 'key', 'potencia', 'label', 'Potência', 'type', 'number',       'required', false, 'position', 0),
     jsonb_build_object('field_id', '5115f100-0000-0000-0000-000000000002', 'key', 'visita',   'label', 'Visita',   'type', 'date',         'required', false, 'position', 1),
     jsonb_build_object('field_id', '5115f100-0000-0000-0000-000000000003', 'key', 'codigo',   'label', 'Código',   'type', 'text',         'required', false, 'position', 2),
     jsonb_build_object('field_id', '5115f100-0000-0000-0000-000000000004', 'key', 'produtos', 'label', 'Produtos', 'type', 'multi_select', 'required', false, 'position', 3)
  )),
  ('5115c000-0000-0000-0000-000000000002', '5115a000-0000-0000-0000-000000000001', 'Outra linha S11W2', '[]'::jsonb),
  ('5115c000-0000-0000-0000-000000000009', '5115a000-0000-0000-0000-000000000002', 'Vizinho S11W2',     '[]'::jsonb);

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5115d000-0000-0000-0000-000000000001', '5115a000-0000-0000-0000-000000000001', '5115c000-0000-0000-0000-000000000001', 'Entrada',     0, 'open'),
  ('5115d000-0000-0000-0000-000000000002', '5115a000-0000-0000-0000-000000000001', '5115c000-0000-0000-0000-000000000001', 'Proposta',    1, 'open'),
  ('5115d000-0000-0000-0000-000000000003', '5115a000-0000-0000-0000-000000000001', '5115c000-0000-0000-0000-000000000001', 'Ganho',       2, 'won'),
  ('5115d000-0000-0000-0000-000000000011', '5115a000-0000-0000-0000-000000000001', '5115c000-0000-0000-0000-000000000002', 'Entrada P2',  0, 'open'),
  ('5115d000-0000-0000-0000-000000000012', '5115a000-0000-0000-0000-000000000001', '5115c000-0000-0000-0000-000000000002', 'Ganho P2',    1, 'won'),
  ('5115d000-0000-0000-0000-000000000013', '5115a000-0000-0000-0000-000000000001', '5115c000-0000-0000-0000-000000000002', 'Perdido P2',  2, 'lost'),
  ('5115d000-0000-0000-0000-000000000019', '5115a000-0000-0000-0000-000000000002', '5115c000-0000-0000-0000-000000000009', 'Vizinho',     0, 'open');

-- 60 contatos e 60 negócios em P. Negócio i: valor i*10 (nulo nos múltiplos de 7);
-- responsável Vendedor (i <= 10), Chefe (11..20) ou ninguém; potência = i até 30;
-- código = texto de i; visita até o 20; etapa Entrada (<= 40), Proposta (41..55)
-- ou Ganho (56..60).
insert into public.leads (id, equipe_id, name, created_at, next_contact)
select ('5115e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5115a000-0000-0000-0000-000000000001',
       'Cliente ' || lpad(i::text, 2, '0'),
       '2026-01-01T12:00:00Z'::timestamptz + (i - 1) * interval '1 day',
       case when i <= 5 then date '2026-10-01' + i end
  from generate_series(1, 60) i;

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, status, closed_at, value, owner_id, created_at, custom_data)
select ('5115f000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5115a000-0000-0000-0000-000000000001',
       ('5115e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5115c000-0000-0000-0000-000000000001',
       case when i <= 40 then '5115d000-0000-0000-0000-000000000001'::uuid
            when i <= 55 then '5115d000-0000-0000-0000-000000000002'::uuid
            else '5115d000-0000-0000-0000-000000000003'::uuid end,
       case when i > 55 then 'won' else 'open' end,
       case when i > 55 then '2026-06-01T12:00:00Z'::timestamptz + i * interval '1 hour' end,
       case when i % 7 = 0 then null else i * 10 end,
       case when i <= 10 then '5115b000-0000-0000-0000-00000000000b'::uuid
            when i <= 20 then '5115b000-0000-0000-0000-00000000000a'::uuid end,
       '2026-01-01T12:00:00Z'::timestamptz + (i - 1) * interval '1 day',
       jsonb_strip_nulls(jsonb_build_object(
         '5115f100-0000-0000-0000-000000000001', case when i <= 30 then to_jsonb(i) end,
         '5115f100-0000-0000-0000-000000000002', case when i <= 20 then to_jsonb('2026-02-01T12:00:00Z'::timestamptz + i * interval '1 day') end,
         '5115f100-0000-0000-0000-000000000003', to_jsonb(i::text),
         '5115f100-0000-0000-0000-000000000004', jsonb_build_array('Módulo')
       ))
  from generate_series(1, 60) i;

-- O Cliente 01 tem mais dois negócios na outra linha: um ganho de 1.000 e um perdido.
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, status, closed_at, value) values
  ('5115f000-0000-0000-0000-000000000101', '5115a000-0000-0000-0000-000000000001', '5115e000-0000-0000-0000-000000000001', '5115c000-0000-0000-0000-000000000002', '5115d000-0000-0000-0000-000000000012', 'won',  '2026-05-01T12:00:00Z', 1000),
  ('5115f000-0000-0000-0000-000000000102', '5115a000-0000-0000-0000-000000000001', '5115e000-0000-0000-0000-000000000001', '5115c000-0000-0000-0000-000000000002', '5115d000-0000-0000-0000-000000000013', 'lost', '2026-05-02T12:00:00Z', 300);

-- Sem Negócio; e Muitos Negócios, com 12 negócios abertos na outra linha.
insert into public.leads (id, equipe_id, name) values
  ('5115e000-0000-0000-0000-000000000101', '5115a000-0000-0000-0000-000000000001', 'Sem Negócio'),
  ('5115e000-0000-0000-0000-000000000102', '5115a000-0000-0000-0000-000000000001', 'Muitos Negócios');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
select ('5115f000-0000-0000-0000-' || lpad((200 + i)::text, 12, '0'))::uuid,
       '5115a000-0000-0000-0000-000000000001',
       '5115e000-0000-0000-0000-000000000102',
       '5115c000-0000-0000-0000-000000000002',
       '5115d000-0000-0000-0000-000000000011',
       i
  from generate_series(1, 12) i;

-- Empresa e imóvel do Cliente 01 (no contato e no negócio).
insert into public.companies (id, equipe_id, name) values
  ('5115aa00-0000-0000-0000-000000000001', '5115a000-0000-0000-0000-000000000001', 'Empresa X');
insert into public.contact_company_links (equipe_id, contact_id, company_id, is_primary) values
  ('5115a000-0000-0000-0000-000000000001', '5115e000-0000-0000-0000-000000000001', '5115aa00-0000-0000-0000-000000000001', true);
insert into public.opportunity_links (equipe_id, opportunity_id, linked_type, linked_id) values
  ('5115a000-0000-0000-0000-000000000001', '5115f000-0000-0000-0000-000000000001', 'company', '5115aa00-0000-0000-0000-000000000001');
insert into public.properties (id, equipe_id, label) values
  ('5115ab00-0000-0000-0000-000000000001', '5115a000-0000-0000-0000-000000000001', 'Usina 1');
insert into public.property_owner_links (equipe_id, property_id, owner_type, owner_id) values
  ('5115a000-0000-0000-0000-000000000001', '5115ab00-0000-0000-0000-000000000001', 'contact', '5115e000-0000-0000-0000-000000000001');

-- O vizinho: um contato e um negócio no próprio quadro.
insert into public.leads (id, equipe_id, name) values
  ('5115e000-0000-0000-0000-000000000999', '5115a000-0000-0000-0000-000000000002', 'Lead do vizinho');
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value) values
  ('5115f000-0000-0000-0000-000000000999', '5115a000-0000-0000-0000-000000000002', '5115e000-0000-0000-0000-000000000999', '5115c000-0000-0000-0000-000000000009', '5115d000-0000-0000-0000-000000000019', 777);

-- Tabelas personalizadas (T21): 3 registros da equipe A, 1 do vizinho.
insert into public.custom_tables (id, equipe_id, name, slug) values
  ('5115ac00-0000-0000-0000-000000000001', '5115a000-0000-0000-0000-000000000001', 'Usinas S11W2',  'usinas_s11w2'),
  ('5115ac00-0000-0000-0000-000000000009', '5115a000-0000-0000-0000-000000000002', 'Vizinho S11W2', 'vizinho_s11w2');
insert into public.custom_table_records (id, equipe_id, table_id, data) values
  ('5115ad00-0000-0000-0000-000000000001', '5115a000-0000-0000-0000-000000000001', '5115ac00-0000-0000-0000-000000000001', '{"nome":"Usina 1"}'),
  ('5115ad00-0000-0000-0000-000000000002', '5115a000-0000-0000-0000-000000000001', '5115ac00-0000-0000-0000-000000000001', '{"nome":"Usina 2"}'),
  ('5115ad00-0000-0000-0000-000000000003', '5115a000-0000-0000-0000-000000000001', '5115ac00-0000-0000-0000-000000000001', '{"nome":"Usina 3"}'),
  ('5115ad00-0000-0000-0000-000000000009', '5115a000-0000-0000-0000-000000000002', '5115ac00-0000-0000-0000-000000000009', '{"nome":"Do vizinho"}');

-- Tudo abaixo roda como o chefe da equipe A, com a RLS valendo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"5115b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- Atalhos (temp: somem com a transação).
create function pg_temp.opp_page(p_sort jsonb, p_limit int, p_offset int, p_filters jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select public.crm_opp_table('5115c000-0000-0000-0000-000000000001', p_filters, p_sort, p_limit, p_offset);
$$;

create function pg_temp.pos(p_rows jsonb, p_id text) returns int language sql immutable as $$
  select (o - 1)::int from jsonb_array_elements(p_rows) with ordinality e(r, o) where r->>'id' = p_id;
$$;

create function pg_temp.summary_total() returns int language sql stable as $$
  select coalesce(sum((e->>'count')::int), 0)::int
    from jsonb_array_elements(public.crm_board_summary('5115c000-0000-0000-0000-000000000001')) e;
$$;

-- ============================================================================
-- 1. Página de 50 + página de 10, sem sobreposição; total = o do Kanban.
-- ============================================================================
do $$
declare p1 jsonb; p2 jsonb;
begin
  p1 := pg_temp.opp_page(null, 50, 0);
  p2 := pg_temp.opp_page(null, 50, 50);
  assert jsonb_array_length(p1) = 50, 'T13-1 FAIL: primeira pagina deveria ter 50, tem ' || jsonb_array_length(p1);
  assert jsonb_array_length(p2) = 10, 'T13-1 FAIL: segunda pagina deveria ter 10, tem ' || jsonb_array_length(p2);
  assert not exists (
    select 1 from jsonb_array_elements(p1) a join jsonb_array_elements(p2) b on a->>'id' = b->>'id'
  ), 'T13-1 FAIL: as paginas se sobrepoem';
  assert pg_temp.summary_total() = 60, 'T13-1 FAIL: o resumo do Kanban deveria somar 60';
  assert p1->0->>'id' = '5115f000-0000-0000-0000-000000000060',
    'T13-1 FAIL: a ordem padrao (criado em, desc) deveria comecar pelo Cliente 60';
  assert jsonb_array_length(pg_temp.opp_page(null, 5000, 0)) = 60, 'T13-1 FAIL: limite acima de 200 deveria ser cortado em 200 (e trazer os 60)';
  assert jsonb_array_length(pg_temp.opp_page(null, 0, 0)) = 1, 'T13-1 FAIL: limite 0 deveria virar 1';
end $$;

-- ============================================================================
-- 2. Toda ordenação, nos dois sentidos: páginas de 25 cobrem as 60 linhas sem
--    repetir, mesmo com valores empatados (etapa, atualizado em).
-- ============================================================================
do $$
declare
  k text; d text; s jsonb; n int;
begin
  foreach k in array array['created_at', 'updated_at', 'value', 'stage', 'stage_entered_at', 'closed_at',
                           'lead_name', 'owner_name', 'next_contact',
                           'cf:5115f100-0000-0000-0000-000000000001', 'cf:5115f100-0000-0000-0000-000000000002',
                           'cf:5115f100-0000-0000-0000-000000000003', 'cf:5115f100-0000-0000-0000-000000000004',
                           'cf:naoexiste', 'hacker; drop table leads'] loop
    foreach d in array array['asc', 'desc'] loop
      s := jsonb_build_object('key', k, 'dir', d);
      select count(distinct r->>'id') into n
        from (
          select jsonb_array_elements(pg_temp.opp_page(s, 25, 0))  r
          union all select jsonb_array_elements(pg_temp.opp_page(s, 25, 25))
          union all select jsonb_array_elements(pg_temp.opp_page(s, 25, 50))
        ) x;
      assert n = 60, 'T13-2 FAIL: ordenando por ' || k || ' ' || d || ' as paginas cobriram ' || n || ' de 60';
    end loop;
  end loop;
end $$;

do $$
declare r jsonb;
begin
  -- valor: nulos no fim nos dois sentidos (8 múltiplos de 7).
  r := pg_temp.opp_page('{"key":"value","dir":"desc"}', 200, 0);
  assert r->0->>'id' = '5115f000-0000-0000-0000-000000000060', 'T13-2 FAIL: maior valor deveria vir primeiro';
  assert (select count(*) from jsonb_array_elements(r) with ordinality e(x, o) where o > 52 and x->'value' = 'null'::jsonb) = 8,
    'T13-2 FAIL: os 8 valores nulos deveriam ficar no fim (desc)';
  r := pg_temp.opp_page('{"key":"value","dir":"asc"}', 200, 0);
  assert r->0->>'id' = '5115f000-0000-0000-0000-000000000001', 'T13-2 FAIL: menor valor deveria vir primeiro';
  assert (select count(*) from jsonb_array_elements(r) with ordinality e(x, o) where o > 52 and x->'value' = 'null'::jsonb) = 8,
    'T13-2 FAIL: os 8 valores nulos deveriam ficar no fim (asc)';

  r := pg_temp.opp_page('{"key":"lead_name","dir":"asc"}', 200, 0);
  assert r->0->'lead'->>'name' = 'Cliente 01', 'T13-2 FAIL: nome asc deveria comecar pelo Cliente 01';
  r := pg_temp.opp_page('{"key":"owner_name","dir":"asc"}', 200, 0);
  assert r->0->>'owner_name' = 'Chefe A', 'T13-2 FAIL: responsavel asc deveria comecar pelo Chefe A';
  assert r->59->'owner_name' = 'null'::jsonb, 'T13-2 FAIL: sem responsavel deveria ficar no fim';
  r := pg_temp.opp_page('{"key":"stage","dir":"desc"}', 200, 0);
  assert r->0->>'stage_id' = '5115d000-0000-0000-0000-000000000003', 'T13-2 FAIL: etapa desc deveria comecar pelo Ganho';

  -- chave desconhecida e campo que não ordena (multi-seleção) caem no padrão.
  assert pg_temp.opp_page('{"key":"hacker","dir":"asc"}', 1, 0)->0->>'id' = '5115f000-0000-0000-0000-000000000060',
    'T13-2 FAIL: chave desconhecida deveria cair em criado em desc';
  assert pg_temp.opp_page('{"key":"cf:5115f100-0000-0000-0000-000000000004","dir":"asc"}', 1, 0)->0->>'id' = '5115f000-0000-0000-0000-000000000060',
    'T13-2 FAIL: multi-selecao nao ordena; deveria cair no padrao';
end $$;

-- ============================================================================
-- 3. Campo personalizado ordena pelo tipo: número 9 < 10; texto "10" < "9".
-- ============================================================================
do $$
declare r jsonb;
begin
  r := pg_temp.opp_page('{"key":"cf:5115f100-0000-0000-0000-000000000001","dir":"asc"}', 200, 0);
  assert pg_temp.pos(r, '5115f000-0000-0000-0000-000000000009') < pg_temp.pos(r, '5115f000-0000-0000-0000-000000000010'),
    'T13-3 FAIL: campo numero deveria ordenar 9 antes de 10';
  assert pg_temp.pos(r, '5115f000-0000-0000-0000-000000000031') > pg_temp.pos(r, '5115f000-0000-0000-0000-000000000030'),
    'T13-3 FAIL: sem potencia deveria ficar depois de quem tem';
  r := pg_temp.opp_page('{"key":"cf:5115f100-0000-0000-0000-000000000003","dir":"asc"}', 200, 0);
  assert pg_temp.pos(r, '5115f000-0000-0000-0000-000000000010') < pg_temp.pos(r, '5115f000-0000-0000-0000-000000000009'),
    'T13-3 FAIL: campo texto deveria ordenar "10" antes de "9"';
  r := pg_temp.opp_page('{"key":"cf:5115f100-0000-0000-0000-000000000002","dir":"desc"}', 200, 0);
  assert r->0->>'id' = '5115f000-0000-0000-0000-000000000020', 'T13-3 FAIL: campo data desc deveria comecar pela visita mais recente';
end $$;

-- ============================================================================
-- 4. A linha da tabela é o card do Kanban (mais property_count).
-- ============================================================================
do $$
declare v_row jsonb; v_card jsonb;
begin
  select r into v_row from jsonb_array_elements(pg_temp.opp_page(null, 200, 0)) r
   where r->>'id' = '5115f000-0000-0000-0000-000000000001';
  select c into v_card from jsonb_array_elements(public.crm_board_stage(
      '5115c000-0000-0000-0000-000000000001', '5115d000-0000-0000-0000-000000000001', '{}', 200, 0)) c
   where c->>'id' = '5115f000-0000-0000-0000-000000000001';
  assert v_row is not null and v_card is not null, 'T13-4 FAIL: o negocio 1 sumiu da tabela ou do quadro';
  assert (v_row - 'property_count') = v_card, 'T13-4 FAIL: a linha da tabela difere do card do Kanban';
  assert (v_row->>'property_count')::int = 1, 'T13-4 FAIL: o Cliente 01 tem 1 imovel';
  assert v_row->'companies'->0->>'name' = 'Empresa X', 'T13-4 FAIL: a empresa do negocio sumiu';
  assert v_row->>'owner_name' = 'Vendedor A', 'T13-4 FAIL: nome do responsavel';
end $$;

-- ============================================================================
-- 5. Contato: situação, números e negócios.
-- ============================================================================
create function pg_temp.contact(p_id text, p_filters jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select r from jsonb_array_elements(public.crm_contacts_table(p_filters, null, 200, 0)) r where r->>'id' = p_id;
$$;

do $$
declare c jsonb;
begin
  c := pg_temp.contact('5115e000-0000-0000-0000-000000000001');
  assert c->>'relationship' = 'cliente', 'T13-5 FAIL: Cliente 01 deveria ser cliente, e ' || coalesce(c->>'relationship', 'nulo');
  assert (c->>'open_count')::int = 1, 'T13-5 FAIL: Cliente 01 tem 1 negocio aberto';
  assert (c->>'won_value')::numeric = 1000, 'T13-5 FAIL: ganho total do Cliente 01 deveria ser 1000';
  assert (c->>'last_won_at')::timestamptz = '2026-05-01T12:00:00Z', 'T13-5 FAIL: ultimo ganho do Cliente 01';
  assert jsonb_array_length(c->'deals') = 3, 'T13-5 FAIL: Cliente 01 tem 3 negocios';
  assert c->'deals'->0->>'status' = 'open', 'T13-5 FAIL: o negocio aberto deveria vir primeiro';
  assert c->'deals'->0->>'owner_name' = 'Vendedor A', 'T13-5 FAIL: responsavel do negocio aberto';
  assert c->'deals'->0->>'pipeline_name' = 'Tabela S11W2' and c->'deals'->0->>'stage_name' = 'Entrada',
    'T13-5 FAIL: nome da linha e da etapa do negocio';
  assert c->>'company_name' = 'Empresa X', 'T13-5 FAIL: empresa do contato';
  assert (c->>'property_count')::int = 1, 'T13-5 FAIL: imoveis do contato';

  c := pg_temp.contact('5115e000-0000-0000-0000-000000000102');
  assert c->>'relationship' = 'negociando', 'T13-5 FAIL: Muitos Negocios deveria estar negociando';
  assert jsonb_array_length(c->'deals') = 10, 'T13-5 FAIL: no maximo 10 negocios no contato';
  assert (c->>'open_count')::int = 12, 'T13-5 FAIL: open_count conta todos os abertos (12)';

  c := pg_temp.contact('5115e000-0000-0000-0000-000000000101');
  assert c->>'relationship' = 'sem_negocio' and jsonb_array_length(c->'deals') = 0 and (c->>'won_value')::numeric = 0,
    'T13-5 FAIL: Sem Negocio';
end $$;

-- ============================================================================
-- 6. Contagem de contatos = linhas das páginas, com e sem filtro; ordenação.
-- ============================================================================
do $$
declare p1 jsonb; p2 jsonb;
begin
  assert public.crm_contacts_count() = 62, 'T13-6 FAIL: a equipe A tem 62 contatos, contou ' || public.crm_contacts_count();
  p1 := public.crm_contacts_table('{}', null, 50, 0);
  p2 := public.crm_contacts_table('{}', null, 50, 50);
  assert jsonb_array_length(p1) = 50 and jsonb_array_length(p2) = 12, 'T13-6 FAIL: paginas de contatos (50 + 12)';
  assert not exists (select 1 from jsonb_array_elements(p1) a join jsonb_array_elements(p2) b on a->>'id' = b->>'id'),
    'T13-6 FAIL: paginas de contatos se sobrepoem';
  assert public.crm_contacts_count('{"relationship":["cliente"]}') = 6, 'T13-6 FAIL: 6 clientes (Cliente 01 e os ganhos 56..60)';
  assert jsonb_array_length(public.crm_contacts_table('{"relationship":["cliente"]}', null, 200, 0)) = 6, 'T13-6 FAIL: 6 linhas de cliente';
  assert public.crm_contacts_table('{}', '{"key":"won_value","dir":"desc"}', 1, 0)->0->>'id' = '5115e000-0000-0000-0000-000000000001',
    'T13-6 FAIL: ganho total desc deveria comecar pelo Cliente 01';
  assert public.crm_contacts_table('{}', '{"key":"name","dir":"asc"}', 1, 0)->0->>'name' = 'Cliente 01',
    'T13-6 FAIL: nome asc deveria comecar pelo Cliente 01';
end $$;

-- ============================================================================
-- 7. Verbos de negócio.
-- ============================================================================
do $$
declare
  n int;
  failed boolean;
  v jsonb;
begin
  -- mover dois negócios de etapa grava histórico
  n := public.crm_update_opportunities(array['5115f000-0000-0000-0000-000000000001', '5115f000-0000-0000-0000-000000000002']::uuid[],
                                       '{"stage_id":"5115d000-0000-0000-0000-000000000002"}');
  assert n = 2, 'T13-7 FAIL: deveria mover 2, moveu ' || n;
  assert exists (select 1 from public.opportunity_stage_history h
                  where h.opportunity_id = '5115f000-0000-0000-0000-000000000001'
                    and h.to_stage_id = '5115d000-0000-0000-0000-000000000002'),
    'T13-7 FAIL: mover pelo verbo nao gravou historico';

  -- etapa de outra linha não move
  n := public.crm_update_opportunities(array['5115f000-0000-0000-0000-000000000003']::uuid[],
                                       '{"stage_id":"5115d000-0000-0000-0000-000000000011"}');
  assert n = 0, 'T13-7 FAIL: etapa de outra linha nao deveria mover';

  -- responsável: nulo zera; outra equipe é recusada; chave desconhecida é recusada
  n := public.crm_update_opportunities(array['5115f000-0000-0000-0000-000000000011']::uuid[], '{"owner_id":null}');
  assert n = 1 and (select owner_id from public.opportunities where id = '5115f000-0000-0000-0000-000000000011') is null,
    'T13-7 FAIL: owner_id null deveria tirar o responsavel';

  failed := false;
  begin
    perform public.crm_update_opportunities(array['5115f000-0000-0000-0000-000000000004']::uuid[],
                                            '{"owner_id":"5115b000-0000-0000-0000-00000000000c"}');
  exception when others then
    failed := sqlerrm like '%owner_not_in_team%';
  end;
  assert failed, 'T13-7 FAIL: responsavel de outra equipe deveria ser recusado';

  failed := false;
  begin
    perform public.crm_update_opportunities(array['5115f000-0000-0000-0000-000000000004']::uuid[], '{"value":1}');
  exception when others then
    failed := sqlerrm like '%invalid_patch_key%';
  end;
  assert failed, 'T13-7 FAIL: chave desconhecida deveria levantar invalid_patch_key';

  -- 1.200 ids numa chamada (corpo do POST); só os 2 reais mudam
  n := public.crm_update_opportunities(
         array(select gen_random_uuid() from generate_series(1, 1198))
           || array['5115f000-0000-0000-0000-000000000021', '5115f000-0000-0000-0000-000000000022']::uuid[],
         '{"owner_id":"5115b000-0000-0000-0000-00000000000b"}');
  assert n = 2, 'T13-7 FAIL: 1.200 ids deveriam atualizar os 2 reais, atualizaram ' || n;

  -- apagar: some da tabela e do resumo; negócio do vizinho conta 0
  n := public.crm_delete_opportunities(array['5115f000-0000-0000-0000-000000000005']::uuid[]);
  assert n = 1, 'T13-7 FAIL: deveria apagar 1';
  assert jsonb_array_length(pg_temp.opp_page(null, 200, 0)) = 59 and pg_temp.summary_total() = 59,
    'T13-7 FAIL: o negocio apagado continua na tabela ou no resumo';
  n := public.crm_delete_opportunities(array['5115f000-0000-0000-0000-000000000999']::uuid[]);
  assert n = 0, 'T13-7 FAIL: apagou negocio do vizinho';

  n := public.crm_delete_leads(array['5115e000-0000-0000-0000-000000000101', '5115e000-0000-0000-0000-000000000999']::uuid[]);
  assert n = 1 and public.crm_contacts_count() = 61, 'T13-7 FAIL: apagar contato (1 da equipe; o do vizinho conta 0)';

  -- criar em lote: Cliente 01 não tem aberto na outra linha → cria; Muitos tem → pula;
  -- o do vizinho não é da equipe → pula.
  v := public.crm_create_opportunities(
         array['5115e000-0000-0000-0000-000000000001', '5115e000-0000-0000-0000-000000000102', '5115e000-0000-0000-0000-000000000999']::uuid[],
         '5115c000-0000-0000-0000-000000000002');
  assert (v->>'created')::int = 1 and (v->>'skipped')::int = 2,
    'T13-7 FAIL: criar em lote deveria dar 1 criado e 2 pulados, deu ' || v::text;
  assert exists (select 1 from public.opportunities o
                  where o.lead_id = '5115e000-0000-0000-0000-000000000001'
                    and o.pipeline_id = '5115c000-0000-0000-0000-000000000002'
                    and o.status = 'open'
                    and o.stage_id = '5115d000-0000-0000-0000-000000000011'
                    and o.deleted_at is null),
    'T13-7 FAIL: o negocio criado deveria estar aberto na primeira etapa da linha';
  assert (select contact_type from public.leads where id = '5115e000-0000-0000-0000-000000000001') = 'opportunity',
    'T13-7 FAIL: contato do tipo lead que entra numa linha deveria virar opportunity';

  failed := false;
  begin
    perform public.crm_create_opportunities(array['5115e000-0000-0000-0000-000000000002']::uuid[],
                                            '5115c000-0000-0000-0000-000000000002',
                                            '5115d000-0000-0000-0000-000000000001');
  exception when others then
    failed := sqlerrm like '%stage_not_in_pipeline%';
  end;
  assert failed, 'T13-7 FAIL: etapa de outra linha deveria ser recusada ao criar';

  -- T21 — excluir registros de tabela personalizada em lote, ids no corpo do POST:
  -- os 2 da equipe; o do vizinho a RLS não deixa tocar; repetir não conta de novo.
  n := public.crm_delete_custom_records(array['5115ad00-0000-0000-0000-000000000001',
                                               '5115ad00-0000-0000-0000-000000000002',
                                               '5115ad00-0000-0000-0000-000000000009']::uuid[]);
  assert n = 2, 'T21 FAIL: excluir registros deveria contar os 2 da equipe, contou ' || n;
  assert (select count(*) from public.custom_table_records
           where table_id = '5115ac00-0000-0000-0000-000000000001' and deleted_at is null) = 1,
    'T21 FAIL: deveria sobrar 1 registro ativo na tabela da equipe A';
  n := public.crm_delete_custom_records(array['5115ad00-0000-0000-0000-000000000001']::uuid[]);
  assert n = 0, 'T21 FAIL: registro ja excluido nao conta de novo';
  assert public.crm_delete_custom_records(null) = 0, 'T21 FAIL: lista nula deveria contar 0';
end $$;

-- ============================================================================
-- 8. O vizinho não vê nada da equipe A.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5115b000-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$ begin
  assert jsonb_array_length(pg_temp.opp_page(null, 200, 0)) = 0, 'T13-8 FAIL: o vizinho ve a tabela da equipe A';
  assert public.crm_contacts_count() = 1, 'T13-8 FAIL: o vizinho deveria contar so o proprio contato';
  assert (select count(*) from jsonb_array_elements(public.crm_contacts_table('{}', null, 200, 0)) r
           where r->>'equipe_id' <> '5115a000-0000-0000-0000-000000000002') = 0,
    'T13-8 FAIL: o vizinho recebeu contato de outra equipe';
  assert (select deleted_at is null from public.custom_table_records
           where id = '5115ad00-0000-0000-0000-000000000009'),
    'T21 FAIL: o registro do vizinho foi excluido pela equipe A';
end $$;

rollback;
select 'PASS' as result;
