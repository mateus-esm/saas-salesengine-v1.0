-- Sprint 9 W2 functional test — the metrics layer.
--
-- Run:  docker exec supabase_db_<ref> psql -U postgres -d postgres -f this
--
-- The important tests here are 5 and 6. Everything else checks arithmetic;
-- those two check that a plain seat cannot read the team's revenue, which is
-- the one bug in this file that would matter to a customer.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('7e511111-1111-1111-1111-111111111111', 'Alfa', 'x', 'y'),
  ('7e599999-9999-9999-9999-999999999999', 'Outro Tenant', 'x', 'y');

-- Two humans in Alfa: one admin, one plain seat.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('7e5d0000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chefe@teste-w2.test','x',now(),now()),
  ('7e5d0000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vendedor@teste-w2.test','x',now(),now());

-- profiles.id is the auth user id everywhere in this codebase — every RLS
-- policy reads `profiles.id = auth.uid()` — even though the column carries its
-- own default. user_id is kept in step with it.
-- A trigger on auth.users already created these rows, so this attaches them to
-- the team rather than inserting. Upsert instead of insert keeps the test
-- working whether or not that trigger exists.
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('7e5d0000-0000-0000-0000-0000000000a1','7e5d0000-0000-0000-0000-0000000000a1','chefe@teste-w2.test','7e511111-1111-1111-1111-111111111111','Chefe','admin'),
  ('7e5d0000-0000-0000-0000-0000000000a2','7e5d0000-0000-0000-0000-0000000000a2','vendedor@teste-w2.test','7e511111-1111-1111-1111-111111111111','Vendedor','user')
on conflict (id) do update
  set equipe_id = excluded.equipe_id,
      nome_completo = excluded.nome_completo,
      role = excluded.role;

insert into public.user_roles (user_id, role) values
  ('7e5d0000-0000-0000-0000-0000000000a1','admin'),
  ('7e5d0000-0000-0000-0000-0000000000a2','user')
on conflict do nothing;

insert into public.pipelines (id, equipe_id, name) values
  ('7e522222-2222-2222-2222-222222222222','7e511111-1111-1111-1111-111111111111','Comercial');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('7e5a0000-0000-0000-0000-000000000001','7e511111-1111-1111-1111-111111111111','7e522222-2222-2222-2222-222222222222','Novo',1,'open',null),
  ('7e5a0000-0000-0000-0000-000000000002','7e511111-1111-1111-1111-111111111111','7e522222-2222-2222-2222-222222222222','Proposta',2,'open','proposal_sent'),
  ('7e5a0000-0000-0000-0000-000000000003','7e511111-1111-1111-1111-111111111111','7e522222-2222-2222-2222-222222222222','Ganho',3,'won',null),
  ('7e5a0000-0000-0000-0000-000000000004','7e511111-1111-1111-1111-111111111111','7e522222-2222-2222-2222-222222222222','Perdido',4,'lost',null);

-- Two leads: one owned by the boss, one by the seller.
insert into public.leads (id, equipe_id, name, responsible_id, origin_category) values
  ('7e5b0000-0000-0000-0000-000000000001','7e511111-1111-1111-1111-111111111111','Lead do Chefe','7e5d0000-0000-0000-0000-0000000000a1','paid_social'),
  ('7e5b0000-0000-0000-0000-000000000002','7e511111-1111-1111-1111-111111111111','Lead do Vendedor','7e5d0000-0000-0000-0000-0000000000a2','referral');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value) values
  ('7e5c0000-0000-0000-0000-000000000001','7e511111-1111-1111-1111-111111111111','7e5b0000-0000-0000-0000-000000000001','7e522222-2222-2222-2222-222222222222','7e5a0000-0000-0000-0000-000000000001', 10000),
  ('7e5c0000-0000-0000-0000-000000000002','7e511111-1111-1111-1111-111111111111','7e5b0000-0000-0000-0000-000000000002','7e522222-2222-2222-2222-222222222222','7e5a0000-0000-0000-0000-000000000001', 2000);

-- Boss's deal: proposal, then won. Seller's deal: proposal, then lost.
update public.opportunities set stage_id='7e5a0000-0000-0000-0000-000000000002' where id='7e5c0000-0000-0000-0000-000000000001';
update public.opportunities set stage_id='7e5a0000-0000-0000-0000-000000000003', status='won', closed_at=now() where id='7e5c0000-0000-0000-0000-000000000001';
update public.opportunities set stage_id='7e5a0000-0000-0000-0000-000000000002' where id='7e5c0000-0000-0000-0000-000000000002';
update public.opportunities set stage_id='7e5a0000-0000-0000-0000-000000000004', status='lost', closed_at=now(), lost_reason='Preço' where id='7e5c0000-0000-0000-0000-000000000002';

-- ============================================================================
-- TEST 1 — the admin sees the whole team.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e5d0000-0000-0000-0000-0000000000a1","role":"authenticated"}';

do $$
declare v jsonb;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day');
  assert (v->>'proposals_sent')::int = 2, 'W2-T1 FAIL: expected 2 propostas, got ' || (v->>'proposals_sent');
  assert (v->>'deals_won')::int  = 1, 'W2-T1 FAIL: expected 1 ganho, got ' || (v->>'deals_won');
  assert (v->>'deals_lost')::int = 1, 'W2-T1 FAIL: expected 1 perda, got ' || (v->>'deals_lost');
  assert (v->>'won_value')::numeric = 10000, 'W2-T1 FAIL: won_value ' || (v->>'won_value');
  assert (v->>'win_rate')::numeric = 50.0, 'W2-T1 FAIL: win_rate ' || (v->>'win_rate');
  raise notice 'W2-T1 ok — admin ve a equipe inteira: 2 propostas, 1 ganho, 1 perda, 50%% win rate';
end $$;

-- ============================================================================
-- TEST 2 — rates are NULL, not 0, when nothing was attempted.
-- A 0% show rate and "no meetings booked" are different facts.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day');
  assert v->>'show_rate' is null, 'W2-T2 FAIL: show_rate should be null with no meetings, got ' || coalesce(v->>'show_rate','<null>');
  assert v->>'no_show_rate' is null, 'W2-T2 FAIL: no_show_rate should be null';
  raise notice 'W2-T2 ok — taxa sem denominador volta NULL, nao 0%%';
end $$;

-- ============================================================================
-- TEST 3 — an empty day is a zero in the series, not a missing point.
-- ============================================================================
do $$
declare v jsonb;
begin
  -- D-5 .. D+1 inclusive is 7 daily buckets.
  v := public.get_funnel_series(now() - interval '5 days', now() + interval '1 day', 'day');
  assert jsonb_array_length(v) = 7,
    'W2-T3 FAIL: expected 7 daily buckets, got ' || jsonb_array_length(v);
  assert (v->0->>'new_leads')::int = 0, 'W2-T3 FAIL: first bucket should be an explicit zero';
  raise notice 'W2-T3 ok — dia vazio vira zero explicito: % baldes', jsonb_array_length(v);
end $$;

-- ============================================================================
-- TEST 4 — loss reasons carry the motive the Vision asked for.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.get_loss_reasons(now() - interval '1 day', now() + interval '1 day');
  assert jsonb_array_length(v) = 1, 'W2-T4 FAIL: expected 1 reason, got ' || jsonb_array_length(v);
  assert v->0->>'reason' = 'Preço', 'W2-T4 FAIL: expected Preço, got ' || (v->0->>'reason');
  assert (v->0->>'value')::numeric = 2000, 'W2-T4 FAIL: expected 2000, got ' || (v->0->>'value');
  raise notice 'W2-T4 ok — motivo de perda agregado: % (R$ %)', v->0->>'reason', v->0->>'value';
end $$;

-- ============================================================================
-- TEST 5 — THE ONE THAT MATTERS. A plain seat sees only their own numbers.
-- ============================================================================
set local request.jwt.claims = '{"sub":"7e5d0000-0000-0000-0000-0000000000a2","role":"authenticated"}';

do $$
declare v jsonb;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day');
  assert (v->>'deals_won')::int = 0,
    'W2-T5 FAIL: a plain seat can see the boss''s win — got ' || (v->>'deals_won');
  assert (v->>'won_value')::numeric = 0,
    'W2-T5 FAIL: a plain seat can see team revenue — got ' || (v->>'won_value');
  assert (v->>'proposals_sent')::int = 1,
    'W2-T5 FAIL: expected only own proposal, got ' || (v->>'proposals_sent');
  assert (v->>'deals_lost')::int = 1, 'W2-T5 FAIL: own loss should be visible';
  raise notice 'W2-T5 ok — assento comum ve so o proprio funil (0 ganhos, R$ 0, 1 proposta)';
end $$;

-- ============================================================================
-- TEST 6 — a plain seat is not offered the team roster either.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.get_dashboard_filters();
  assert (v->>'can_see_team')::boolean = false, 'W2-T6 FAIL: plain seat reported as team-wide';
  assert jsonb_array_length(v->'responsibles') = 0,
    'W2-T6 FAIL: plain seat was handed the team roster';
  raise notice 'W2-T6 ok — assento comum nao recebe a lista de responsaveis';
end $$;

-- ============================================================================
-- TEST 7 — breakdown by responsible, from the admin's seat.
-- ============================================================================
set local request.jwt.claims = '{"sub":"7e5d0000-0000-0000-0000-0000000000a1","role":"authenticated"}';

do $$
declare v jsonb; v_chefe jsonb;
begin
  v := public.get_funnel_breakdown('responsible', now() - interval '1 day', now() + interval '1 day');
  assert jsonb_array_length(v) = 2, 'W2-T7 FAIL: expected 2 responsibles, got ' || jsonb_array_length(v);
  select x into v_chefe from jsonb_array_elements(v) x where x->>'label' = 'Chefe';
  assert (v_chefe->>'deals_won')::int = 1, 'W2-T7 FAIL: Chefe should have 1 win';
  assert (v_chefe->>'won_value')::numeric = 10000, 'W2-T7 FAIL: Chefe won_value';
  raise notice 'W2-T7 ok — quebra por responsavel bate com o funil';
end $$;

-- ============================================================================
-- TEST 8 — breakdown by acquisition channel resolves real labels.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.get_funnel_breakdown('channel', now() - interval '1 day', now() + interval '1 day');
  assert exists (select 1 from jsonb_array_elements(v) x where x->>'label' = 'Social Pago'),
    'W2-T8 FAIL: expected a "Social Pago" bucket';
  assert exists (select 1 from jsonb_array_elements(v) x where x->>'label' = 'Indicação'),
    'W2-T8 FAIL: expected an "Indicação" bucket';
  raise notice 'W2-T8 ok — quebra por canal usa o rotulo do cliente';
end $$;

-- ============================================================================
-- TEST 9 — an invalid dimension is refused, not interpolated.
-- ============================================================================
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.get_funnel_breakdown('pipeline; drop table leads', now(), now());
  exception when others then v_raised := true;
  end;
  assert v_raised, 'W2-T9 FAIL: an unknown dimension was accepted';
  raise notice 'W2-T9 ok — dimensao fora da lista fechada e recusada';
end $$;

-- ============================================================================
-- TEST 10 — top opportunities ranks open deals and reports staleness.
-- ============================================================================
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, status)
values ('7e5c0000-0000-0000-0000-000000000003','7e511111-1111-1111-1111-111111111111',
        '7e5b0000-0000-0000-0000-000000000001','7e522222-2222-2222-2222-222222222222',
        '7e5a0000-0000-0000-0000-000000000001', 75000, 'open');

do $$
declare v jsonb;
begin
  v := public.get_top_opportunities(5);
  assert jsonb_array_length(v) = 1, 'W2-T10 FAIL: expected 1 open deal, got ' || jsonb_array_length(v);
  assert (v->0->>'value')::numeric = 75000, 'W2-T10 FAIL: expected the 75k deal on top';
  assert v->0->>'days_in_stage' is not null, 'W2-T10 FAIL: days_in_stage missing';
  raise notice 'W2-T10 ok — melhores oportunidades: R$ % parada ha % dias',
    v->0->>'value', v->0->>'days_in_stage';
end $$;

-- ============================================================================
-- TEST 11 — CROSS-TENANT. Another team's data must be invisible, and the
-- functions take no equipe_id that could be pointed elsewhere.
-- ============================================================================
-- Seed the neighbouring tenant as postgres: RLS correctly refuses to let the
-- logged-in Alfa user create data for another team, which is itself reassuring.
reset role;
insert into public.pipelines (id, equipe_id, name) values
  ('7e533333-3333-3333-3333-333333333333','7e599999-9999-9999-9999-999999999999','Outro');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('7e5a0000-0000-0000-0000-0000000000f1','7e599999-9999-9999-9999-999999999999','7e533333-3333-3333-3333-333333333333','Ganho',1,'won');
insert into public.leads (id, equipe_id, name) values
  ('7e5b0000-0000-0000-0000-0000000000f1','7e599999-9999-9999-9999-999999999999','Lead Alheio');
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, status)
values ('7e5c0000-0000-0000-0000-0000000000f1','7e599999-9999-9999-9999-999999999999',
        '7e5b0000-0000-0000-0000-0000000000f1','7e533333-3333-3333-3333-333333333333',
        '7e5a0000-0000-0000-0000-0000000000f1', 999999, 'won');

-- Back to the Alfa admin's seat.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e5d0000-0000-0000-0000-0000000000a1","role":"authenticated"}';

do $$
declare v jsonb;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day');
  assert (v->>'won_value')::numeric = 10000,
    'W2-T11 FAIL: another tenant''s revenue leaked in — won_value ' || (v->>'won_value');
  v := public.get_top_opportunities(50);
  assert not exists (select 1 from jsonb_array_elements(v) x where x->>'lead_name' = 'Lead Alheio'),
    'W2-T11 FAIL: another tenant''s opportunity is visible';
  raise notice 'W2-T11 ok — tenant vizinho invisivel';
end $$;

rollback;
