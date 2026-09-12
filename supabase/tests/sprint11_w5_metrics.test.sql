-- Sprint 11 · Onda 5 · T54 — filtros, quebras e o relatório de campanha.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w5_metrics.test.sql
--
-- O que este teste protege: o relatório conta leads (primeiro toque no período),
-- negócios, ganhos, perdas, receita do livro-razão e investimento por campanha, e
-- tira CPL, custo por ganho, taxa de ganho, ROAS e ROI; "Sem campanha" aparece;
-- os filtros de linha e de responsável do dashboard valem, e a vendedora só vê
-- o seu;
-- os filtros de campanha (e "sem campanha"), plataforma (e "sem plataforma") e
-- entrada valem no negócio e no contato — e na tabela do servidor; as quebras por
-- campanha, plataforma e entrada; o vizinho não vê nada.

begin;

-- @include supabase/migrations/20260913000100_sprint11_w5_attribution.sql
-- @include supabase/migrations/20260913000200_sprint11_w5_campaigns.sql
-- @include supabase/migrations/20260913000300_sprint11_w5_attribution_metrics.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5133a000-0000-0000-0000-000000000001', 'S11W5 ROI A', 'x', 'y'),
  ('5133a000-0000-0000-0000-000000000002', 'S11W5 ROI B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5133b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w5-roi.test',   'x', now(), now()),
  ('5133b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w5-roi.test', 'x', now(), now()),
  ('5133b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bia@s11w5-roi.test',     'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5133b000-0000-0000-0000-00000000000a', '5133b000-0000-0000-0000-00000000000a', 'chefe@s11w5-roi.test',   '5133a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5133b000-0000-0000-0000-00000000000d', '5133b000-0000-0000-0000-00000000000d', 'vizinho@s11w5-roi.test', '5133a000-0000-0000-0000-000000000002', 'Vizinho', 'admin'),
  ('5133b000-0000-0000-0000-00000000000b', '5133b000-0000-0000-0000-00000000000b', 'bia@s11w5-roi.test',     '5133a000-0000-0000-0000-000000000001', 'Bia',     'user')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.user_roles (user_id, role) values
  ('5133b000-0000-0000-0000-00000000000a', 'admin'),
  ('5133b000-0000-0000-0000-00000000000d', 'admin')
on conflict do nothing;

insert into public.pipelines (id, equipe_id, name) values
  ('5133c000-0000-0000-0000-000000000001', '5133a000-0000-0000-0000-000000000001', 'ROI A'),
  ('5133c000-0000-0000-0000-000000000002', '5133a000-0000-0000-0000-000000000001', 'ROI A outra linha');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5133d000-0000-0000-0000-000000000001', '5133a000-0000-0000-0000-000000000001', '5133c000-0000-0000-0000-000000000001', 'Novo',    0, 'open'),
  ('5133d000-0000-0000-0000-000000000002', '5133a000-0000-0000-0000-000000000001', '5133c000-0000-0000-0000-000000000001', 'Ganho',   1, 'won'),
  ('5133d000-0000-0000-0000-000000000003', '5133a000-0000-0000-0000-000000000001', '5133c000-0000-0000-0000-000000000001', 'Perdido', 2, 'lost');

insert into public.webhook_configs (id, equipe_id, name, url, trigger_event, inbound_function, field_mappings) values
  ('5133c000-0000-0000-0000-0000000000f1', '5133a000-0000-0000-0000-000000000001', 'Formulário Meta ROI', 'inbound', 'lead_received', 'receive_lead', '[]');

insert into public.crm_campaigns (id, equipe_id, name, platform, match_keys) values
  ('51330000-0000-0000-0000-0000000000c1', '5133a000-0000-0000-0000-000000000001', 'Verão', 'meta', array['usina_verao']),
  ('51330000-0000-0000-0000-0000000000c2', '5133a000-0000-0000-0000-000000000001', 'Google Busca', 'google', array['gbusca']);

insert into public.crm_campaign_spend (equipe_id, campaign_id, spent_on, amount) values
  ('5133a000-0000-0000-0000-000000000001', '51330000-0000-0000-0000-0000000000c1', (now() at time zone 'America/Sao_Paulo')::date, 2500),
  ('5133a000-0000-0000-0000-000000000001', '51330000-0000-0000-0000-0000000000c2', (now() at time zone 'America/Sao_Paulo')::date, 1000),
  ('5133a000-0000-0000-0000-000000000001', '51330000-0000-0000-0000-0000000000c1', (now() at time zone 'America/Sao_Paulo')::date - 400, 9999);

insert into public.leads (id, equipe_id, name) values
  ('5133e000-0000-0000-0000-000000000001', '5133a000-0000-0000-0000-000000000001', 'Verão ganho'),
  ('5133e000-0000-0000-0000-000000000002', '5133a000-0000-0000-0000-000000000001', 'Verão perdido'),
  ('5133e000-0000-0000-0000-000000000003', '5133a000-0000-0000-0000-000000000001', 'Google aberto'),
  ('5133e000-0000-0000-0000-000000000004', '5133a000-0000-0000-0000-000000000001', 'Sem campanha ganho');

do $$
declare v_entry uuid := (select id from public.crm_entries where webhook_config_id = '5133c000-0000-0000-0000-0000000000f1');
begin
  perform public.crm_record_touch('5133e000-0000-0000-0000-000000000001', v_entry, '{"utm_source":"facebook","utm_campaign":"usina_verao"}');
  perform public.crm_record_touch('5133e000-0000-0000-0000-000000000002', v_entry, '{"utm_source":"facebook","utm_campaign":"USINA_VERAO"}');
  perform public.crm_record_touch('5133e000-0000-0000-0000-000000000003', v_entry, '{"gclid":"g1","utm_campaign":"gbusca"}');
  update public.crm_entries set platform = null, origin_category = null where id = v_entry;
  perform public.crm_record_touch('5133e000-0000-0000-0000-000000000004', v_entry, '{}');
end $$;

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, owner_id) values
  ('51330000-0000-0000-0000-0000000000f1', '5133a000-0000-0000-0000-000000000001', '5133e000-0000-0000-0000-000000000001',
   '5133c000-0000-0000-0000-000000000001', '5133d000-0000-0000-0000-000000000002', 10000, '5133b000-0000-0000-0000-00000000000a'),
  ('51330000-0000-0000-0000-0000000000f2', '5133a000-0000-0000-0000-000000000001', '5133e000-0000-0000-0000-000000000002',
   '5133c000-0000-0000-0000-000000000001', '5133d000-0000-0000-0000-000000000003', 7000, '5133b000-0000-0000-0000-00000000000a'),
  ('51330000-0000-0000-0000-0000000000f3', '5133a000-0000-0000-0000-000000000001', '5133e000-0000-0000-0000-000000000003',
   '5133c000-0000-0000-0000-000000000001', '5133d000-0000-0000-0000-000000000001', 3000, '5133b000-0000-0000-0000-00000000000a'),
  ('51330000-0000-0000-0000-0000000000f4', '5133a000-0000-0000-0000-000000000001', '5133e000-0000-0000-0000-000000000004',
   '5133c000-0000-0000-0000-000000000001', '5133d000-0000-0000-0000-000000000002', 5000, '5133b000-0000-0000-0000-00000000000a');
set constraints all immediate;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5133b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. O relatório: leads, negócios, ganhos, receita, investimento e as contas.
-- ============================================================================
do $$
declare r jsonb; v jsonb; g jsonb; n jsonb;
begin
  r := public.crm_campaign_report(now() - interval '1 day', now() + interval '1 day');
  select x into v from jsonb_array_elements(r) x where x->>'name' = 'Verão';
  select x into g from jsonb_array_elements(r) x where x->>'name' = 'Google Busca';
  select x into n from jsonb_array_elements(r) x where x->>'name' = 'Sem campanha';

  assert (v->>'leads')::int = 2 and (v->>'deals')::int = 2 and (v->>'wins')::int = 1 and (v->>'losses')::int = 1
         and (v->>'revenue')::numeric = 10000 and (v->>'spend')::numeric = 2500,
    'T54-1 FAIL: os numeros da Verao, veio ' || coalesce(v::text, 'null');
  assert (v->>'cpl')::numeric = 1250 and (v->>'cost_per_win')::numeric = 2500 and (v->>'win_rate')::numeric = 50
         and (v->>'roas')::numeric = 4 and (v->>'roi')::numeric = 300,
    'T54-1 FAIL: as contas da Verao (CPL, custo por ganho, taxa, ROAS, ROI), veio ' || v::text;
  assert (g->>'leads')::int = 1 and (g->>'wins')::int = 0 and (g->>'roas')::numeric = 0 and (g->>'roi')::numeric = -100,
    'T54-1 FAIL: a Google sem ganho, veio ' || coalesce(g::text, 'null');
  assert (n->>'leads')::int = 1 and (n->>'revenue')::numeric = 5000 and (n->>'roas') is null
         and (select x->>'name' from jsonb_array_elements(r) with ordinality t(x, o) order by o desc limit 1) = 'Sem campanha',
    'T54-1 FAIL: Sem campanha (sem investimento, no fim), veio ' || coalesce(n::text, 'null');
end $$;

-- ============================================================================
-- 1b. Os filtros do dashboard: linha e responsável. O investimento fica.
-- ============================================================================
do $$
declare r jsonb; v jsonb;
begin
  r := public.crm_campaign_report(now() - interval '1 day', now() + interval '1 day',
                                  array['5133c000-0000-0000-0000-000000000002']::uuid[], null);
  select x into v from jsonb_array_elements(r) x where x->>'name' = 'Verão';
  assert (v->>'deals')::int = 0 and (v->>'wins')::int = 0 and (v->>'revenue')::numeric = 0
         and (v->>'leads')::int = 2 and (v->>'spend')::numeric = 2500 and (v->>'roi')::numeric = -100,
    'T54-1b FAIL: outra linha zera negocio, ganho e receita (lead e investimento sao da campanha), veio ' || coalesce(v::text, 'null');

  r := public.crm_campaign_report(now() - interval '1 day', now() + interval '1 day',
                                  null, array['5133b000-0000-0000-0000-00000000000b']::uuid[]);
  select x into v from jsonb_array_elements(r) x where x->>'name' = 'Verão';
  assert (v->>'leads')::int = 0 and (v->>'deals')::int = 0 and (v->>'wins')::int = 0 and (v->>'revenue')::numeric = 0,
    'T54-1b FAIL: a Bia nao tem negocio, veio ' || coalesce(v::text, 'null');
  assert not exists (select 1 from jsonb_array_elements(r) x where x->>'name' = 'Sem campanha'),
    'T54-1b FAIL: Sem campanha vazio nao aparece';
end $$;

-- A vendedora só vê o seu: nada é dela.
set local request.jwt.claims = '{"sub":"5133b000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v jsonb;
begin
  select x into v from jsonb_array_elements(public.crm_campaign_report(now() - interval '1 day', now() + interval '1 day')) x
   where x->>'name' = 'Verão';
  assert (v->>'leads')::int = 0 and (v->>'wins')::int = 0 and (v->>'revenue')::numeric = 0,
    'T54-1b FAIL: a vendedora ve o que nao e dela, veio ' || coalesce(v::text, 'null');
end $$;
set local request.jwt.claims = '{"sub":"5133b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 2. Os filtros: campanha, sem campanha, plataforma, sem plataforma, entrada.
-- ============================================================================
do $$
declare
  v_verao text := '51330000-0000-0000-0000-0000000000c1';
  v_entry text := (select id::text from public.crm_entries where webhook_config_id = '5133c000-0000-0000-0000-0000000000f1');
  f public.crm_opp_filter;
  lf public.crm_lead_filter;
  n int;
begin
  f := public._crm_compile_opp_filters(jsonb_build_object('campaign_ids', jsonb_build_array(v_verao)));
  select count(*) into n from public.opportunities o join public.leads l on l.id = o.lead_id
   where o.equipe_id = '5133a000-0000-0000-0000-000000000001' and public._crm_opp_matches_c(o, l, f);
  assert n = 2, 'T54-2 FAIL: filtro por campanha no negocio, achou ' || n;

  f := public._crm_compile_opp_filters('{"campaign_ids":["none"]}');
  select count(*) into n from public.opportunities o join public.leads l on l.id = o.lead_id
   where o.equipe_id = '5133a000-0000-0000-0000-000000000001' and public._crm_opp_matches_c(o, l, f);
  assert n = 1, 'T54-2 FAIL: sem campanha, achou ' || n;

  f := public._crm_compile_opp_filters('{"platforms":["google"]}');
  select count(*) into n from public.opportunities o join public.leads l on l.id = o.lead_id
   where o.equipe_id = '5133a000-0000-0000-0000-000000000001' and public._crm_opp_matches_c(o, l, f);
  assert n = 1, 'T54-2 FAIL: plataforma google, achou ' || n;

  lf := public._crm_compile_lead_filters('{"platforms":["none"]}');
  select count(*) into n from public.leads l
   where l.equipe_id = '5133a000-0000-0000-0000-000000000001' and public._crm_lead_matches_c(l, lf, null, null, null, null);
  assert n = 1, 'T54-2 FAIL: contato sem plataforma, achou ' || n;

  lf := public._crm_compile_lead_filters(jsonb_build_object('entry_ids', jsonb_build_array(v_entry)));
  select count(*) into n from public.leads l
   where l.equipe_id = '5133a000-0000-0000-0000-000000000001' and public._crm_lead_matches_c(l, lf, null, null, null, null);
  assert n = 4, 'T54-2 FAIL: contatos da entrada, achou ' || n;

  -- E na tabela do servidor.
  assert jsonb_array_length(public.crm_opp_table('5133c000-0000-0000-0000-000000000001',
           jsonb_build_object('campaign_ids', jsonb_build_array(v_verao)), null, 50, 0)) = 2,
    'T54-2 FAIL: a Tabela de Leads do servidor com o filtro de campanha';
end $$;

-- ============================================================================
-- 3. As quebras por campanha, plataforma e entrada.
-- ============================================================================
do $$
declare b jsonb;
begin
  b := public.get_funnel_breakdown('campaign', now() - interval '1 day', now() + interval '1 day');
  assert (select (x->>'won_value')::numeric from jsonb_array_elements(b) x where x->>'label' = 'Verão') = 10000
     and (select (x->>'deals_won')::int from jsonb_array_elements(b) x where x->>'label' = 'Verão') = 1
     and (select (x->>'won_value')::numeric from jsonb_array_elements(b) x where x->>'label' = 'Sem campanha') = 5000,
    'T54-3 FAIL: quebra por campanha, veio ' || b::text;

  b := public.get_funnel_breakdown('platform', now() - interval '1 day', now() + interval '1 day');
  assert exists (select 1 from jsonb_array_elements(b) x where x->>'label' = 'Meta (Facebook/Instagram)')
     and exists (select 1 from jsonb_array_elements(b) x where x->>'label' = 'Sem plataforma'),
    'T54-3 FAIL: quebra por plataforma, veio ' || b::text;

  b := public.get_funnel_breakdown('entry', now() - interval '1 day', now() + interval '1 day');
  assert (select (x->>'new_opportunities')::int from jsonb_array_elements(b) x where x->>'label' = 'Formulário Meta ROI') = 4,
    'T54-3 FAIL: quebra por entrada, veio ' || b::text;
end $$;

-- ============================================================================
-- 4. O vizinho não vê nada.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5133b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
begin
  assert public.crm_campaign_report(now() - interval '1 day', now() + interval '1 day') = '[]'::jsonb,
    'T54-4 FAIL: o vizinho ve o relatorio da equipe A';
end $$;

rollback;
select 'PASS' as result;
