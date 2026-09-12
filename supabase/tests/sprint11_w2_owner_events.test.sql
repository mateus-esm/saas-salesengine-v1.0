-- Sprint 11 · Onda 2 · T14 — o evento guarda o responsável do momento.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w2_owner_events.test.sql
--
-- O que este teste protege: um negócio que o vendedor B ganhou e depois foi
-- passado para C continua sendo um ganho de B — no overview, na série, na quebra,
-- nos motivos de perda, no placar e depois de um replay. O que está em aberto
-- conta para o dono atual; contato conta para quem tem negócio com ele; e o
-- vendedor sem papel de gestor vê o que é dele pela mesma regra.

begin;

-- @include supabase/migrations/20260910000100_sprint11_opportunity_owner.sql
-- @include supabase/migrations/20260911000300_sprint11_w2_owner_events.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5116a000-0000-0000-0000-000000000001', 'S11W2 Dono A', 'x', 'y'),
  ('5116a000-0000-0000-0000-000000000002', 'S11W2 Dono B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5116b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w2-dono.test',  'x', now(), now()),
  ('5116b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@s11w2-dono.test',      'x', now(), now()),
  ('5116b000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@s11w2-dono.test',      'x', now(), now()),
  ('5116b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w2-dono.test','x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5116b000-0000-0000-0000-00000000000a', '5116b000-0000-0000-0000-00000000000a', 'chefe@s11w2-dono.test',   '5116a000-0000-0000-0000-000000000001', 'Chefe',      'admin'),
  ('5116b000-0000-0000-0000-00000000000b', '5116b000-0000-0000-0000-00000000000b', 'b@s11w2-dono.test',       '5116a000-0000-0000-0000-000000000001', 'Vendedor B', 'user'),
  ('5116b000-0000-0000-0000-00000000000c', '5116b000-0000-0000-0000-00000000000c', 'c@s11w2-dono.test',       '5116a000-0000-0000-0000-000000000001', 'Vendedor C', 'user'),
  ('5116b000-0000-0000-0000-00000000000d', '5116b000-0000-0000-0000-00000000000d', 'vizinho@s11w2-dono.test', '5116a000-0000-0000-0000-000000000002', 'Vizinho',    'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.user_roles (user_id, role) values
  ('5116b000-0000-0000-0000-00000000000a', 'admin'),
  ('5116b000-0000-0000-0000-00000000000b', 'user'),
  ('5116b000-0000-0000-0000-00000000000c', 'user'),
  ('5116b000-0000-0000-0000-00000000000d', 'admin')
on conflict do nothing;

-- Um campo do tipo usuário ("Pré-vendedor"), para a quebra do dashboard.
insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5116c000-0000-0000-0000-000000000001', '5116a000-0000-0000-0000-000000000001', 'Dono S11W2', jsonb_build_array(
     jsonb_build_object('field_id', '5116f100-0000-0000-0000-000000000001', 'key', 'pre_vendedor', 'label', 'Pré-vendedor',
                        'type', 'user', 'required', false, 'position', 0)));

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5116d000-0000-0000-0000-000000000001', '5116a000-0000-0000-0000-000000000001', '5116c000-0000-0000-0000-000000000001', 'Novo',     1, 'open', null),
  ('5116d000-0000-0000-0000-000000000002', '5116a000-0000-0000-0000-000000000001', '5116c000-0000-0000-0000-000000000001', 'Proposta', 2, 'open', 'proposal_sent'),
  ('5116d000-0000-0000-0000-000000000003', '5116a000-0000-0000-0000-000000000001', '5116c000-0000-0000-0000-000000000001', 'Ganho',    3, 'won',  null),
  ('5116d000-0000-0000-0000-000000000004', '5116a000-0000-0000-0000-000000000001', '5116c000-0000-0000-0000-000000000001', 'Perdido',  4, 'lost', null);

-- Contatos SEM responsável: a responsabilidade mora no negócio.
insert into public.leads (id, equipe_id, name, origin_category) values
  ('5116e000-0000-0000-0000-000000000001', '5116a000-0000-0000-0000-000000000001', 'Contato Ganho',   'paid_social'),
  ('5116e000-0000-0000-0000-000000000002', '5116a000-0000-0000-0000-000000000001', 'Contato Aberto',  'referral'),
  ('5116e000-0000-0000-0000-000000000003', '5116a000-0000-0000-0000-000000000001', 'Contato Perdido', 'referral');

-- D1: do B, com pré-vendedor C. D2: do C, aberto. D3: do B.
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, owner_id, custom_data) values
  ('5116f000-0000-0000-0000-000000000001', '5116a000-0000-0000-0000-000000000001', '5116e000-0000-0000-0000-000000000001', '5116c000-0000-0000-0000-000000000001', '5116d000-0000-0000-0000-000000000001', 10000,
   '5116b000-0000-0000-0000-00000000000b', jsonb_build_object('5116f100-0000-0000-0000-000000000001', '5116b000-0000-0000-0000-00000000000c')),
  ('5116f000-0000-0000-0000-000000000002', '5116a000-0000-0000-0000-000000000001', '5116e000-0000-0000-0000-000000000002', '5116c000-0000-0000-0000-000000000001', '5116d000-0000-0000-0000-000000000001', 3000,
   '5116b000-0000-0000-0000-00000000000c', '{}'::jsonb),
  ('5116f000-0000-0000-0000-000000000003', '5116a000-0000-0000-0000-000000000001', '5116e000-0000-0000-0000-000000000003', '5116c000-0000-0000-0000-000000000001', '5116d000-0000-0000-0000-000000000001', 2000,
   '5116b000-0000-0000-0000-00000000000b', '{}'::jsonb);

-- B manda proposta e ganha o D1; B manda proposta e perde o D3.
update public.opportunities set stage_id = '5116d000-0000-0000-0000-000000000002' where id = '5116f000-0000-0000-0000-000000000001';
update public.opportunities set stage_id = '5116d000-0000-0000-0000-000000000003', status = 'won', closed_at = now() where id = '5116f000-0000-0000-0000-000000000001';
update public.opportunities set stage_id = '5116d000-0000-0000-0000-000000000002' where id = '5116f000-0000-0000-0000-000000000003';
update public.opportunities set stage_id = '5116d000-0000-0000-0000-000000000004', status = 'lost', closed_at = now(), lost_reason = 'Preço' where id = '5116f000-0000-0000-0000-000000000003';

-- Depois do ganho, o D1 é passado para o C.
update public.opportunities set owner_id = '5116b000-0000-0000-0000-00000000000c' where id = '5116f000-0000-0000-0000-000000000001';

-- ============================================================================
-- 0. O histórico e o evento guardam o dono do momento.
-- ============================================================================
do $$ begin
  assert (select count(*) from public.opportunity_owner_history
           where opportunity_id = '5116f000-0000-0000-0000-000000000001') = 2,
    'T14-0 FAIL: o D1 deveria ter 2 linhas de historico de dono (criado com B, passado para C)';
  assert (select array_agg(distinct owner_id) from public.funnel_events
           where opportunity_id = '5116f000-0000-0000-0000-000000000001' and event = 'won') = array['5116b000-0000-0000-0000-00000000000b']::uuid[],
    'T14-0 FAIL: o evento de ganho do D1 deveria guardar o B como dono';
  assert public._opportunity_owner_at('5116f000-0000-0000-0000-000000000001', now()) = '5116b000-0000-0000-0000-00000000000b',
    'T14-0 FAIL: o dono do D1 no momento do ganho era o B';
  assert public._opportunity_owner_at('5116f000-0000-0000-0000-000000000001', clock_timestamp()) = '5116b000-0000-0000-0000-00000000000c',
    'T14-0 FAIL: o dono do D1 agora e o C';
  assert public._opportunity_owner_at('5116f000-0000-0000-0000-000000000001', now() - interval '1 hour') is null,
    'T14-0 FAIL: antes de criado, o D1 nao tinha dono';
end $$;

-- Tudo abaixo roda como o chefe (gestor), com a RLS valendo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"5116b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. O ganho conta para B, não para C — overview, série, quebra, motivos, placar.
-- ============================================================================
do $$
declare v jsonb; w jsonb; n int;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day', null,
                                  array['5116b000-0000-0000-0000-00000000000b']::uuid[]);
  assert (v->>'deals_won')::int = 1 and (v->>'won_value')::numeric = 10000,
    'T14-1 FAIL: overview de B deveria ter 1 ganho de 10000, tem ' || v::text;
  assert (v->>'proposals_sent')::int = 2, 'T14-1 FAIL: B mandou 2 propostas';
  assert (v->>'deals_lost')::int = 1, 'T14-1 FAIL: B perdeu 1';

  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day', null,
                                  array['5116b000-0000-0000-0000-00000000000c']::uuid[]);
  assert (v->>'deals_won')::int = 0 and (v->>'won_value')::numeric = 0,
    'T14-1 FAIL: o ganho de B nao pode aparecer para C, overview de C: ' || v::text;

  select coalesce(sum((x->>'deals_won')::int), 0)::int into n
    from jsonb_array_elements(public.get_funnel_series(now() - interval '1 day', now() + interval '1 day', 'day', null,
                                                       array['5116b000-0000-0000-0000-00000000000b']::uuid[])) x;
  assert n = 1, 'T14-1 FAIL: a serie de B deveria somar 1 ganho, somou ' || n;
  select coalesce(sum((x->>'deals_won')::int), 0)::int into n
    from jsonb_array_elements(public.get_funnel_series(now() - interval '1 day', now() + interval '1 day', 'day', null,
                                                       array['5116b000-0000-0000-0000-00000000000c']::uuid[])) x;
  assert n = 0, 'T14-1 FAIL: a serie de C nao pode ter o ganho de B';

  v := public.get_funnel_breakdown('responsible', now() - interval '1 day', now() + interval '1 day');
  select x into w from jsonb_array_elements(v) x where x->>'label' = 'Vendedor B';
  assert (w->>'deals_won')::int = 1 and (w->>'won_value')::numeric = 10000,
    'T14-1 FAIL: na quebra por responsavel o ganho e do B, linha do B: ' || coalesce(w::text, 'nula');
  select x into w from jsonb_array_elements(v) x where x->>'label' = 'Vendedor C';
  assert coalesce((w->>'deals_won')::int, 0) = 0, 'T14-1 FAIL: na quebra, o C nao tem ganho';
  assert (w->>'open_count')::int = 1 and (w->>'open_value')::numeric = 3000,
    'T14-1 FAIL: na quebra, o aberto do C (estado) conta para o dono atual';

  v := public.get_loss_reasons(now() - interval '1 day', now() + interval '1 day', null,
                               array['5116b000-0000-0000-0000-00000000000b']::uuid[]);
  assert jsonb_array_length(v) = 1 and v->0->>'reason' = 'Preço', 'T14-1 FAIL: motivo de perda do B';
  v := public.get_loss_reasons(now() - interval '1 day', now() + interval '1 day', null,
                               array['5116b000-0000-0000-0000-00000000000c']::uuid[]);
  assert jsonb_array_length(v) = 0, 'T14-1 FAIL: o C nao perdeu nada';

  v := public.crm_placar('5116c000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');
  assert (v->>'won')::int = 1 and (v->>'lost')::int = 1 and (v->>'won_revenue')::numeric = 10000 and (v->>'in_progress')::int = 1,
    'T14-1 FAIL: placar do pipeline, veio ' || v::text;
  select x into w from jsonb_array_elements(v->'by_owner') x where x->>'owner_id' = '5116b000-0000-0000-0000-00000000000b';
  assert (w->>'won')::int = 1 and (w->>'won_revenue')::numeric = 10000 and (w->>'lost')::int = 1 and w->>'owner_name' = 'Vendedor B',
    'T14-1 FAIL: no placar, o ganho e a perda sao do B: ' || coalesce(w::text, 'nula');
  select x into w from jsonb_array_elements(v->'by_owner') x where x->>'owner_id' = '5116b000-0000-0000-0000-00000000000c';
  assert (w->>'won')::int = 0 and (w->>'in_progress')::int = 1,
    'T14-1 FAIL: no placar, o C tem 1 em andamento e nenhum ganho: ' || coalesce(w::text, 'nula');
end $$;

-- ============================================================================
-- 2 e 3. O aberto conta para o dono atual; contato, para quem tem negócio com ele.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day', null,
                                  array['5116b000-0000-0000-0000-00000000000c']::uuid[]);
  assert (v->>'open_count')::int = 1 and (v->>'open_value')::numeric = 3000,
    'T14-2 FAIL: o aberto do C deveria contar para o C';
  assert (v->>'new_leads')::int = 2,
    'T14-3 FAIL: filtrando C, novos leads = contatos com negocio do C (2), veio ' || (v->>'new_leads');

  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day', null,
                                  array['5116b000-0000-0000-0000-00000000000b']::uuid[]);
  assert (v->>'open_count')::int = 0, 'T14-2 FAIL: o B nao tem aberto';
  assert (v->>'new_leads')::int = 1, 'T14-3 FAIL: filtrando B, novos leads = 1 (o contato perdido)';

  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day');
  assert (v->>'new_leads')::int = 3 and (v->>'deals_won')::int = 1 and (v->>'open_count')::int = 1,
    'T14-2 FAIL: sem filtro, o gestor ve a equipe inteira';

  v := public.get_top_opportunities(10, null, array['5116b000-0000-0000-0000-00000000000c']::uuid[]);
  assert jsonb_array_length(v) = 1 and v->0->>'responsible_name' = 'Vendedor C',
    'T14-2 FAIL: top oportunidades do C traz o D2 com o nome do dono do negocio';
end $$;

-- ============================================================================
-- 6. Quebra por campo do tipo usuário mostra o nome do membro.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.get_custom_field_breakdown('pre_vendedor', now() - interval '1 day', now() + interval '1 day');
  assert exists (select 1 from jsonb_array_elements(v) x where x->>'label' = 'Vendedor C' and (x->>'count')::int = 1),
    'T14-6 FAIL: a quebra por pre-vendedor deveria mostrar "Vendedor C", veio ' || v::text;
  assert not exists (select 1 from jsonb_array_elements(v) x where x->>'label' = '5116b000-0000-0000-0000-00000000000c'),
    'T14-6 FAIL: a quebra mostrou o id no lugar do nome';
end $$;

-- ============================================================================
-- 5. O replay mantém o dono do momento.
-- ============================================================================
do $$
declare v jsonb;
begin
  perform public.recompute_funnel_events('5116c000-0000-0000-0000-000000000001');
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day', null,
                                  array['5116b000-0000-0000-0000-00000000000b']::uuid[]);
  assert (v->>'deals_won')::int = 1, 'T14-5 FAIL: depois do replay o ganho continua do B, veio ' || v::text;
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day', null,
                                  array['5116b000-0000-0000-0000-00000000000c']::uuid[]);
  assert (v->>'deals_won')::int = 0, 'T14-5 FAIL: depois do replay o C continua sem o ganho do B';
end $$;

-- ============================================================================
-- 4. O vendedor sem papel de gestor vê o que é dele pela mesma regra.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5116b000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare v jsonb;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day');
  assert (v->>'deals_won')::int = 1 and (v->>'won_value')::numeric = 10000,
    'T14-4 FAIL: o B ve o proprio ganho, veio ' || v::text;
  assert (v->>'open_count')::int = 0, 'T14-4 FAIL: o B nao ve o aberto do C';
end $$;

set local request.jwt.claims = '{"sub":"5116b000-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$
declare v jsonb;
begin
  v := public.get_funnel_overview(now() - interval '1 day', now() + interval '1 day');
  assert (v->>'deals_won')::int = 0 and (v->>'won_value')::numeric = 0,
    'T14-4 FAIL: o C nao ve o ganho que era do B';
  assert (v->>'open_count')::int = 1, 'T14-4 FAIL: o C ve o proprio aberto';
end $$;

-- ============================================================================
-- 7. O histórico de dono: a equipe lê, ninguém escreve à mão, o vizinho não vê.
-- ============================================================================
do $$
declare failed boolean := false;
begin
  assert (select count(*) from public.opportunity_owner_history) >= 2,
    'T14-7 FAIL: a equipe deveria ler o historico de dono';
  begin
    insert into public.opportunity_owner_history (equipe_id, opportunity_id, to_owner)
    values ('5116a000-0000-0000-0000-000000000001', '5116f000-0000-0000-0000-000000000002', '5116b000-0000-0000-0000-00000000000c');
  exception when others then
    failed := true;
  end;
  assert failed, 'T14-7 FAIL: um usuario conseguiu escrever no historico de dono';
end $$;

set local request.jwt.claims = '{"sub":"5116b000-0000-0000-0000-00000000000d","role":"authenticated"}';

do $$ begin
  assert (select count(*) from public.opportunity_owner_history
           where equipe_id = '5116a000-0000-0000-0000-000000000001') = 0,
    'T14-7 FAIL: o vizinho le o historico de dono da equipe A';
  assert jsonb_array_length(coalesce(public.crm_placar('5116c000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day')->'by_owner', '[]')) = 0,
    'T14-7 FAIL: o vizinho ve o placar da equipe A';
end $$;

rollback;
select 'PASS' as result;
