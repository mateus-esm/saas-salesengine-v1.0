-- Sprint 11 · Onda 3 · T33 — as métricas leem a receita.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_revenue_metrics.test.sql
--
-- O que este teste protege: o valor ganho do overview, da série, da quebra e do
-- placar é o livro-razão (itens incluídos); um ganho reaberto não conta nem na
-- contagem nem na receita; a quebra por produto soma o que cada item vendeu.

begin;

-- @include supabase/migrations/20260911000300_sprint11_w2_owner_events.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql
-- @include supabase/migrations/20260912000600_sprint11_w3_revenue_metrics.sql
-- @include supabase/migrations/20260912000700_sprint11_w3_timers.sql
-- @include supabase/migrations/20260912000800_sprint11_w3_natures.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('511ca000-0000-0000-0000-000000000001', 'S11W3 Metricas A', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('511cb000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w3-metricas.test', 'x', now(), now()),
  ('511cb000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@s11w3-metricas.test',     'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('511cb000-0000-0000-0000-00000000000a', '511cb000-0000-0000-0000-00000000000a', 'chefe@s11w3-metricas.test', '511ca000-0000-0000-0000-000000000001', 'Chefe',      'admin'),
  ('511cb000-0000-0000-0000-00000000000b', '511cb000-0000-0000-0000-00000000000b', 'b@s11w3-metricas.test',     '511ca000-0000-0000-0000-000000000001', 'Vendedor B', 'user')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.user_roles (user_id, role) values
  ('511cb000-0000-0000-0000-00000000000a', 'admin'),
  ('511cb000-0000-0000-0000-00000000000b', 'user')
on conflict do nothing;

insert into public.pipelines (id, equipe_id, name) values
  ('511cc000-0000-0000-0000-000000000001', '511ca000-0000-0000-0000-000000000001', 'Metricas S11W3');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('511cd000-0000-0000-0000-000000000001', '511ca000-0000-0000-0000-000000000001', '511cc000-0000-0000-0000-000000000001', 'Novo',  1, 'open'),
  ('511cd000-0000-0000-0000-000000000002', '511ca000-0000-0000-0000-000000000001', '511cc000-0000-0000-0000-000000000001', 'Ganho', 2, 'won');

insert into public.catalog_items (id, equipe_id, name, price, price_mode) values
  ('511cca00-0000-0000-0000-000000000001', '511ca000-0000-0000-0000-000000000001', 'Painel',  500, 'fixed'),
  ('511cca00-0000-0000-0000-000000000002', '511ca000-0000-0000-0000-000000000001', 'Serviço', 300, 'fixed');

insert into public.leads (id, equipe_id, name) values
  ('511ce000-0000-0000-0000-000000000001', '511ca000-0000-0000-0000-000000000001', 'Cliente Metricas');

-- D1: valor 1000. D2: itens (2 painéis + 1 serviço = 1300). D3: valor 800, será reaberto.
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, owner_id) values
  ('511cf000-0000-0000-0000-000000000001', '511ca000-0000-0000-0000-000000000001', '511ce000-0000-0000-0000-000000000001', '511cc000-0000-0000-0000-000000000001', '511cd000-0000-0000-0000-000000000001', 1000, '511cb000-0000-0000-0000-00000000000b'),
  ('511cf000-0000-0000-0000-000000000002', '511ca000-0000-0000-0000-000000000001', '511ce000-0000-0000-0000-000000000001', '511cc000-0000-0000-0000-000000000001', '511cd000-0000-0000-0000-000000000001', null, '511cb000-0000-0000-0000-00000000000b'),
  ('511cf000-0000-0000-0000-000000000003', '511ca000-0000-0000-0000-000000000001', '511ce000-0000-0000-0000-000000000001', '511cc000-0000-0000-0000-000000000001', '511cd000-0000-0000-0000-000000000001', 800,  '511cb000-0000-0000-0000-00000000000b');

set local role authenticated;
set local request.jwt.claims = '{"sub":"511cb000-0000-0000-0000-00000000000a","role":"authenticated"}';

select public.crm_set_opportunity_items('511cf000-0000-0000-0000-000000000002', jsonb_build_array(
  jsonb_build_object('catalog_item_id', '511cca00-0000-0000-0000-000000000001', 'quantity', 2),
  jsonb_build_object('catalog_item_id', '511cca00-0000-0000-0000-000000000002', 'quantity', 1)));
set constraints all immediate;

-- Os três ganham; o D3 é reaberto (engano).
update public.opportunities set stage_id = '511cd000-0000-0000-0000-000000000002'
 where id in ('511cf000-0000-0000-0000-000000000001', '511cf000-0000-0000-0000-000000000002', '511cf000-0000-0000-0000-000000000003');
set constraints all immediate;
update public.opportunities set stage_id = '511cd000-0000-0000-0000-000000000001'
 where id = '511cf000-0000-0000-0000-000000000003';

-- ============================================================================
-- 1. Overview: 2 ganhos, receita 2300 (o reaberto não conta).
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day', array['511cc000-0000-0000-0000-000000000001']::uuid[]);
  assert (v->>'deals_won')::int = 2, 'T33-1 FAIL: deveria contar 2 ganhos (o reaberto nao), contou ' || (v->>'deals_won');
  assert (v->>'won_value')::numeric = 2300, 'T33-1 FAIL: receita deveria ser 1000 + 1300 = 2300, veio ' || (v->>'won_value');
  assert (v->>'avg_ticket')::numeric = 1150, 'T33-1 FAIL: ticket medio deveria ser 1150';
end $$;

-- ============================================================================
-- 2. Série: a receita no dia do ganho.
-- ============================================================================
do $$
declare v_total numeric; v_won int;
begin
  select sum((b->>'won_value')::numeric), sum((b->>'deals_won')::int) into v_total, v_won
    from jsonb_array_elements(public.get_funnel_series(now() - interval '1 day', now() + interval '1 day', 'day',
                                                       array['511cc000-0000-0000-0000-000000000001']::uuid[])) b;
  assert v_total = 2300, 'T33-2 FAIL: a serie deveria somar 2300, somou ' || v_total;
  assert v_won = 2, 'T33-2 FAIL: a serie deveria contar 2 ganhos, contou ' || v_won;
end $$;

-- ============================================================================
-- 3. Quebra por produto: o que cada item vendeu.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.get_funnel_breakdown('product', now() - interval '1 day', now() + interval '1 day',
                                   array['511cc000-0000-0000-0000-000000000001']::uuid[]);
  assert (select (r->>'won_value')::numeric from jsonb_array_elements(v) r where r->>'label' = 'Painel') = 1000,
    'T33-3 FAIL: Painel deveria ter vendido 1000';
  assert (select (r->>'won_value')::numeric from jsonb_array_elements(v) r where r->>'label' = 'Serviço') = 300,
    'T33-3 FAIL: Servico deveria ter vendido 300';
  assert (select (r->>'won_value')::numeric from jsonb_array_elements(v) r where r->>'label' = 'Sem item') = 1000,
    'T33-3 FAIL: o negocio sem itens deveria aparecer como Sem item (1000)';
  assert (select (r->>'deals_won')::int from jsonb_array_elements(v) r where r->>'label' = 'Painel') = 1,
    'T33-3 FAIL: Painel veio de 1 negocio';

  v := public.get_funnel_breakdown('responsible', now() - interval '1 day', now() + interval '1 day',
                                   array['511cc000-0000-0000-0000-000000000001']::uuid[]);
  assert (select (r->>'won_value')::numeric from jsonb_array_elements(v) r where r->>'label' = 'Vendedor B') = 2300,
    'T33-3 FAIL: a receita do B deveria ser 2300';
  assert (select (r->>'deals_won')::int from jsonb_array_elements(v) r where r->>'label' = 'Vendedor B') = 2,
    'T33-3 FAIL: o B ganhou 2 (o reaberto nao conta)';
end $$;

-- ============================================================================
-- 4. Placar: a receita do livro-razão, por dono.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.crm_placar('511cc000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');
  assert (v->>'won')::int = 2, 'T33-4 FAIL: placar deveria contar 2 ganhos, contou ' || (v->>'won');
  assert (v->>'won_revenue')::numeric = 2300, 'T33-4 FAIL: placar deveria somar 2300, somou ' || (v->>'won_revenue');
  assert (select (o->>'won_revenue')::numeric from jsonb_array_elements(v->'by_owner') o
           where o->>'owner_id' = '511cb000-0000-0000-0000-00000000000b') = 2300,
    'T33-4 FAIL: a receita do B no placar deveria ser 2300';
end $$;

rollback;
select 'PASS' as result;
