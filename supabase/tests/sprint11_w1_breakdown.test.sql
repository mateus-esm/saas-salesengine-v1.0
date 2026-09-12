-- Sprint 11 · T8 — the dashboard reads a custom field where the app writes it.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w1_breakdown.test.sql
--
-- The card, the table and the form store a value in custom_data[field_id]. The
-- Sprint 9 breakdown read custom_data->>key, so every value typed in the app
-- landed in "Não informado". It now reads by field_id, falls back to the key
-- (older imports and webhooks wrote there), and counts a multi-select deal once
-- in each of its values instead of as one bucket named '["X","Y"]'.

begin;

-- @include supabase/migrations/20260910000400_sprint11_breakdown_by_field_id.sql
-- Onda 2 (T14): a versão nova da quebra (dono do negócio, nome no campo usuário).
-- @include supabase/migrations/20260910000100_sprint11_opportunity_owner.sql
-- @include supabase/migrations/20260911000300_sprint11_w2_owner_events.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql
-- @include supabase/migrations/20260912000600_sprint11_w3_revenue_metrics.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5118a000-0000-0000-0000-000000000001', 'S11 Quebra', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5118b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11-breakdown.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5118b000-0000-0000-0000-00000000000a', '5118b000-0000-0000-0000-00000000000a', 'chefe@s11-breakdown.test', '5118a000-0000-0000-0000-000000000001', 'Chefe', 'admin')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role;

insert into public.user_roles (user_id, role) values ('5118b000-0000-0000-0000-00000000000a', 'admin')
on conflict do nothing;

insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5118c000-0000-0000-0000-000000000001', '5118a000-0000-0000-0000-000000000001', 'Quebra S11',
   '[{"field_id":"f-seg","key":"segmento","label":"Segmento","type":"select","position":0},
     {"field_id":"f-prod","key":"produto","label":"Produto","type":"multi_select","position":1},
     {"field_id":"f-pot","key":"potencia","label":"Potência","type":"number","position":2}]'::jsonb);

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5118d000-0000-0000-0000-000000000001', '5118a000-0000-0000-0000-000000000001', '5118c000-0000-0000-0000-000000000001', 'Novo', 0, 'open');

insert into public.leads (id, equipe_id, name) values
  ('5118e000-0000-0000-0000-000000000001', '5118a000-0000-0000-0000-000000000001', 'A'),
  ('5118e000-0000-0000-0000-000000000002', '5118a000-0000-0000-0000-000000000001', 'B'),
  ('5118e000-0000-0000-0000-000000000003', '5118a000-0000-0000-0000-000000000001', 'C'),
  ('5118e000-0000-0000-0000-000000000004', '5118a000-0000-0000-0000-000000000001', 'D');

-- A: typed in the app (by field_id). B: written by an old import (by key).
-- C: another segment. D: nothing filled.
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, custom_data) values
  ('5118f000-0000-0000-0000-000000000001', '5118a000-0000-0000-0000-000000000001', '5118e000-0000-0000-0000-000000000001', '5118c000-0000-0000-0000-000000000001', '5118d000-0000-0000-0000-000000000001', 100,
   '{"f-seg":"Solar","f-prod":["Placas","Inversor"],"f-pot":"4.5"}'),
  ('5118f000-0000-0000-0000-000000000002', '5118a000-0000-0000-0000-000000000001', '5118e000-0000-0000-0000-000000000002', '5118c000-0000-0000-0000-000000000001', '5118d000-0000-0000-0000-000000000001', 50,
   '{"segmento":"Solar","produto":["Placas"]}'),
  ('5118f000-0000-0000-0000-000000000003', '5118a000-0000-0000-0000-000000000001', '5118e000-0000-0000-0000-000000000003', '5118c000-0000-0000-0000-000000000001', '5118d000-0000-0000-0000-000000000001', 10,
   '{"f-seg":"Eólica","f-pot":2}'),
  ('5118f000-0000-0000-0000-000000000004', '5118a000-0000-0000-0000-000000000001', '5118e000-0000-0000-0000-000000000004', '5118c000-0000-0000-0000-000000000001', '5118d000-0000-0000-0000-000000000001', 5,
   '{}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"5118b000-0000-0000-0000-00000000000a","role":"authenticated"}';

create temp view s11_seg as
  select e->>'label' as label, (e->>'count')::int as n, (e->>'value')::numeric as v
    from jsonb_array_elements(public.get_custom_field_breakdown('segmento', now() - interval '1 day', now() + interval '1 day', 'count')) e;

do $$ begin
  -- 1. A value typed in the app (field_id) counts.
  assert (select n from s11_seg where label = 'Solar') = 2,
    'T8-1 FAIL: Solar deveria ter 2 (um por field_id, um pela chave antiga), tem ' || coalesce((select n from s11_seg where label = 'Solar')::text, 'nada');
  assert (select n from s11_seg where label = 'Eólica') = 1, 'T8-1 FAIL: Eólica deveria ter 1';
  assert (select n from s11_seg where label = 'Não informado') = 1, 'T8-1 FAIL: Não informado deveria ter 1';
end $$;

do $$
declare v jsonb;
begin
  -- 2. Revenue per value.
  v := public.get_custom_field_breakdown('segmento', now() - interval '1 day', now() + interval '1 day', 'value');
  assert (select (e->>'value')::numeric from jsonb_array_elements(v) e where e->>'label' = 'Solar') = 150,
    'T8-2 FAIL: receita Solar deveria ser 150';

  -- 3. Multi-select: one deal counts once in each of its values.
  v := public.get_custom_field_breakdown('produto', now() - interval '1 day', now() + interval '1 day', 'count');
  assert (select (e->>'count')::int from jsonb_array_elements(v) e where e->>'label' = 'Placas') = 2,
    'T8-3 FAIL: Placas deveria ter 2';
  assert (select (e->>'count')::int from jsonb_array_elements(v) e where e->>'label' = 'Inversor') = 1,
    'T8-3 FAIL: Inversor deveria ter 1';
  assert not exists (select 1 from jsonb_array_elements(v) e where e->>'label' like '[%'),
    'T8-3 FAIL: um array virou nome de balde';

  -- 4. Sum of a number field, stored as text or as number.
  v := public.get_custom_field_breakdown('potencia', now() - interval '1 day', now() + interval '1 day', 'sum');
  assert (select sum((e->>'value')::numeric) from jsonb_array_elements(v) e) = 6.5,
    'T8-4 FAIL: soma de potencia deveria ser 6.5, e ' || (select sum((e->>'value')::numeric) from jsonb_array_elements(v) e);
end $$;

rollback;
select 'PASS' as result;
