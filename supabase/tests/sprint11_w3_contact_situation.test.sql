-- Sprint 11 · Onda 3 · T32 — a situação e o ciclo de vida do contato.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_contact_situation.test.sql
--
-- O que este teste protege: cliente é quem tem um negócio ganho vivo — com ou
-- sem valor (65 ganhos da produção não têm valor); o Ganho total da Base de
-- Contatos é a receita líquida (itens, ajustes e estornos incluídos); e o
-- `lifecycle_stage` passa a acompanhar os negócios (client/opportunity/lost),
-- sem mexer em quem não tem negócio (o sweep do Copilot usa `mql`).

begin;

-- @include supabase/migrations/20260911000300_sprint11_w2_owner_events.sql
-- @include supabase/migrations/20260911000200_sprint11_w2_tables.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('511ba000-0000-0000-0000-000000000001', 'S11W3 Situacao A', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('511bb000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w3-situacao.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('511bb000-0000-0000-0000-00000000000a', '511bb000-0000-0000-0000-00000000000a', 'chefe@s11w3-situacao.test', '511ba000-0000-0000-0000-000000000001', 'Chefe', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('511bc000-0000-0000-0000-000000000001', '511ba000-0000-0000-0000-000000000001', 'Situacao S11W3');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('511bd000-0000-0000-0000-000000000001', '511ba000-0000-0000-0000-000000000001', '511bc000-0000-0000-0000-000000000001', 'Novo',    1, 'open'),
  ('511bd000-0000-0000-0000-000000000002', '511ba000-0000-0000-0000-000000000001', '511bc000-0000-0000-0000-000000000001', 'Ganho',   2, 'won'),
  ('511bd000-0000-0000-0000-000000000003', '511ba000-0000-0000-0000-000000000001', '511bc000-0000-0000-0000-000000000001', 'Perdido', 3, 'lost');

insert into public.catalog_items (id, equipe_id, name, price, price_mode) values
  ('511bca00-0000-0000-0000-000000000001', '511ba000-0000-0000-0000-000000000001', 'Pacote', 700, 'fixed');

-- C1: ganho com valor. C2: ganho sem valor. C3: ganho com itens. C4: sem negócio, mql.
insert into public.leads (id, equipe_id, name, lifecycle_stage) values
  ('511be000-0000-0000-0000-000000000001', '511ba000-0000-0000-0000-000000000001', 'Com valor', 'raw'),
  ('511be000-0000-0000-0000-000000000002', '511ba000-0000-0000-0000-000000000001', 'Sem valor', 'raw'),
  ('511be000-0000-0000-0000-000000000003', '511ba000-0000-0000-0000-000000000001', 'Com itens', 'raw'),
  ('511be000-0000-0000-0000-000000000004', '511ba000-0000-0000-0000-000000000001', 'Só conversa', 'mql');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value) values
  ('511bf000-0000-0000-0000-000000000001', '511ba000-0000-0000-0000-000000000001', '511be000-0000-0000-0000-000000000001', '511bc000-0000-0000-0000-000000000001', '511bd000-0000-0000-0000-000000000001', 5000),
  ('511bf000-0000-0000-0000-000000000002', '511ba000-0000-0000-0000-000000000001', '511be000-0000-0000-0000-000000000002', '511bc000-0000-0000-0000-000000000001', '511bd000-0000-0000-0000-000000000001', null),
  ('511bf000-0000-0000-0000-000000000003', '511ba000-0000-0000-0000-000000000001', '511be000-0000-0000-0000-000000000003', '511bc000-0000-0000-0000-000000000001', '511bd000-0000-0000-0000-000000000001', null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"511bb000-0000-0000-0000-00000000000a","role":"authenticated"}';

select public.crm_set_opportunity_items('511bf000-0000-0000-0000-000000000003',
  jsonb_build_array(jsonb_build_object('catalog_item_id', '511bca00-0000-0000-0000-000000000001', 'quantity', 3)));
set constraints all immediate;

create function pg_temp.row_of(p_lead uuid) returns jsonb language sql stable as $$
  select r from jsonb_array_elements(public.crm_contacts_table('{}'::jsonb, null, 200, 0)) r where r->>'id' = p_lead::text;
$$;
create function pg_temp.stage_of(p_lead uuid) returns text language sql stable as $$
  select lifecycle_stage from public.leads where id = p_lead;
$$;

-- ============================================================================
-- 1. Negócio aberto: negociando, ciclo de vida "opportunity".
-- ============================================================================
do $$ begin
  assert pg_temp.row_of('511be000-0000-0000-0000-000000000001')->>'relationship' = 'negociando',
    'T32-1 FAIL: com negocio aberto deveria ser negociando';
  assert pg_temp.stage_of('511be000-0000-0000-0000-000000000001') = 'opportunity',
    'T32-1 FAIL: com negocio aberto o ciclo de vida deveria ser opportunity, e ' || pg_temp.stage_of('511be000-0000-0000-0000-000000000001');
  assert pg_temp.stage_of('511be000-0000-0000-0000-000000000004') = 'mql',
    'T32-1 FAIL: sem negocio o ciclo de vida nao deveria mudar';
end $$;

-- ============================================================================
-- 2. Ganho: cliente — com valor, sem valor e com itens; Ganho total = receita.
-- ============================================================================
do $$ begin
  update public.opportunities set stage_id = '511bd000-0000-0000-0000-000000000002'
   where id in ('511bf000-0000-0000-0000-000000000001', '511bf000-0000-0000-0000-000000000002', '511bf000-0000-0000-0000-000000000003');
  set constraints all immediate;

  assert pg_temp.row_of('511be000-0000-0000-0000-000000000001')->>'relationship' = 'cliente'
     and (pg_temp.row_of('511be000-0000-0000-0000-000000000001')->>'won_value')::numeric = 5000,
    'T32-2 FAIL: ganho com valor deveria ser cliente com 5000';
  assert pg_temp.row_of('511be000-0000-0000-0000-000000000002')->>'relationship' = 'cliente',
    'T32-2 FAIL: ganho sem valor continua sendo cliente';
  assert (pg_temp.row_of('511be000-0000-0000-0000-000000000002')->>'won_value')::numeric = 0,
    'T32-2 FAIL: ganho sem valor tem receita 0';
  assert (pg_temp.row_of('511be000-0000-0000-0000-000000000003')->>'won_value')::numeric = 2100,
    'T32-2 FAIL: ganho com 3 pacotes de 700 deveria ter receita 2100';
  assert pg_temp.row_of('511be000-0000-0000-0000-000000000002')->>'last_won_at' is not null,
    'T32-2 FAIL: ganho sem valor deveria ter a data do ultimo ganho';
  assert pg_temp.stage_of('511be000-0000-0000-0000-000000000001') = 'client'
     and pg_temp.stage_of('511be000-0000-0000-0000-000000000002') = 'client',
    'T32-2 FAIL: o ganho deveria levar o ciclo de vida a client';
end $$;

-- ============================================================================
-- 3. Ajuste e estorno chegam ao Ganho total; perder leva a "perdido".
-- ============================================================================
do $$ begin
  update public.opportunities set value = 5500 where id = '511bf000-0000-0000-0000-000000000001';
  assert (pg_temp.row_of('511be000-0000-0000-0000-000000000001')->>'won_value')::numeric = 5500,
    'T32-3 FAIL: o ajuste deveria chegar ao Ganho total (5500)';

  update public.opportunities set stage_id = '511bd000-0000-0000-0000-000000000001'
   where id = '511bf000-0000-0000-0000-000000000001';
  assert pg_temp.row_of('511be000-0000-0000-0000-000000000001')->>'relationship' = 'negociando'
     and (pg_temp.row_of('511be000-0000-0000-0000-000000000001')->>'won_value')::numeric = 0,
    'T32-3 FAIL: reaberto deveria voltar a negociando com Ganho total 0';
  assert pg_temp.stage_of('511be000-0000-0000-0000-000000000001') = 'opportunity',
    'T32-3 FAIL: reaberto, o ciclo de vida deveria voltar a opportunity';

  update public.opportunities set stage_id = '511bd000-0000-0000-0000-000000000003'
   where id = '511bf000-0000-0000-0000-000000000001';
  assert pg_temp.row_of('511be000-0000-0000-0000-000000000001')->>'relationship' = 'perdido',
    'T32-3 FAIL: so com negocio perdido deveria ser perdido';
  assert pg_temp.stage_of('511be000-0000-0000-0000-000000000001') = 'lost',
    'T32-3 FAIL: so com negocio perdido o ciclo de vida deveria ser lost';
end $$;

rollback;
select 'PASS' as result;
