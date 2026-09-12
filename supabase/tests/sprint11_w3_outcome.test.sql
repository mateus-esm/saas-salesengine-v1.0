-- Sprint 11 · Onda 3 · T28 — a etapa decide o desfecho.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_outcome.test.sql
--
-- O que este teste protege: mover um card para uma etapa de ganho ou perda
-- FECHA o negócio (antes só gravava o evento e o status ficava "open" — 200
-- negócios assim em 11/09); escrever o status direto leva o negócio para a
-- etapa daquele tipo; tirar um negócio fechado de uma etapa de ganho/perda o
-- REABRE; e cada desfecho vira um evento só.

begin;

-- @include supabase/migrations/20260911000300_sprint11_w2_owner_events.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5117a000-0000-0000-0000-000000000001', 'S11W3 Desfecho A', 'x', 'y'),
  ('5117a000-0000-0000-0000-000000000002', 'S11W3 Desfecho B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5117b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w3-desfecho.test',   'x', now(), now()),
  ('5117b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w3-desfecho.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5117b000-0000-0000-0000-00000000000a', '5117b000-0000-0000-0000-00000000000a', 'chefe@s11w3-desfecho.test',   '5117a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5117b000-0000-0000-0000-00000000000d', '5117b000-0000-0000-0000-00000000000d', 'vizinho@s11w3-desfecho.test', '5117a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

-- P1: a linha completa (dois perdidos, para mover entre eles). P2: sem etapa de
-- ganho nem de perda (há pipelines assim: o status escrito vale como está).
insert into public.pipelines (id, equipe_id, name) values
  ('5117c000-0000-0000-0000-000000000001', '5117a000-0000-0000-0000-000000000001', 'Desfecho S11W3'),
  ('5117c000-0000-0000-0000-000000000002', '5117a000-0000-0000-0000-000000000001', 'Sem terminais S11W3');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5117d000-0000-0000-0000-000000000001', '5117a000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000001', 'Novo',        1, 'open', null),
  ('5117d000-0000-0000-0000-000000000002', '5117a000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000001', 'Proposta',    2, 'open', 'proposal_sent'),
  ('5117d000-0000-0000-0000-000000000003', '5117a000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000001', 'Ganho',       3, 'won',  null),
  ('5117d000-0000-0000-0000-000000000004', '5117a000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000001', 'Perdido',     4, 'lost', null),
  ('5117d000-0000-0000-0000-000000000005', '5117a000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000001', 'Sem retorno', 5, 'lost', null),
  ('5117d000-0000-0000-0000-000000000011', '5117a000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000002', 'Entrada',     1, 'open', null),
  ('5117d000-0000-0000-0000-000000000012', '5117a000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000002', 'Conversa',    2, 'open', null);

insert into public.leads (id, equipe_id, name) values
  ('5117e000-0000-0000-0000-000000000001', '5117a000-0000-0000-0000-000000000001', 'Contato Desfecho');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value) values
  ('5117f000-0000-0000-0000-000000000001', '5117a000-0000-0000-0000-000000000001', '5117e000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000001', '5117d000-0000-0000-0000-000000000001', 1000),
  ('5117f000-0000-0000-0000-000000000002', '5117a000-0000-0000-0000-000000000001', '5117e000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000001', '5117d000-0000-0000-0000-000000000002', 2000),
  ('5117f000-0000-0000-0000-000000000003', '5117a000-0000-0000-0000-000000000001', '5117e000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000002', '5117d000-0000-0000-0000-000000000011', 3000),
  ('5117f000-0000-0000-0000-000000000004', '5117a000-0000-0000-0000-000000000001', '5117e000-0000-0000-0000-000000000001', '5117c000-0000-0000-0000-000000000001', '5117d000-0000-0000-0000-000000000001', 4000);

-- Tudo abaixo roda como o chefe da equipe A, com a RLS valendo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"5117b000-0000-0000-0000-00000000000a","role":"authenticated"}';

create function pg_temp.events(p_opp uuid, p_event text) returns int language sql stable as $$
  select count(*)::int from public.funnel_events where opportunity_id = p_opp and event = p_event;
$$;

-- ============================================================================
-- 1. Mover para a etapa de ganho fecha o negócio — um `won` só.
-- ============================================================================
do $$
declare o record;
begin
  update public.opportunities set stage_id = '5117d000-0000-0000-0000-000000000003'
   where id = '5117f000-0000-0000-0000-000000000001';
  select * into o from public.opportunities where id = '5117f000-0000-0000-0000-000000000001';
  assert o.status = 'won', 'T28-1 FAIL: mover para Ganho deveria fechar como won, ficou ' || o.status;
  assert o.closed_at is not null, 'T28-1 FAIL: ganho sem closed_at';
  assert pg_temp.events(o.id, 'won') = 1, 'T28-1 FAIL: deveria haver 1 evento won, ha ' || pg_temp.events(o.id, 'won');

  -- Escrever o status que ele já tem (o modal manda tudo junto) não duplica.
  update public.opportunities set status = 'won', value = 1100 where id = o.id;
  assert pg_temp.events(o.id, 'won') = 1, 'T28-1 FAIL: salvar de novo duplicou o won';
end $$;

-- ============================================================================
-- 2. Status escrito direto leva o negócio para a etapa daquele tipo.
-- ============================================================================
do $$
declare o record;
begin
  update public.opportunities set status = 'lost', lost_reason = 'Preço'
   where id = '5117f000-0000-0000-0000-000000000002';
  select * into o from public.opportunities where id = '5117f000-0000-0000-0000-000000000002';
  assert o.stage_id = '5117d000-0000-0000-0000-000000000004',
    'T28-2 FAIL: status lost deveria mover para a primeira etapa de perda';
  assert o.status = 'lost' and o.closed_at is not null, 'T28-2 FAIL: perda sem status/closed_at';
  assert pg_temp.events(o.id, 'lost') = 1, 'T28-2 FAIL: deveria haver 1 evento lost, ha ' || pg_temp.events(o.id, 'lost');
  assert exists (select 1 from public.opportunity_stage_history
                  where opportunity_id = o.id and to_stage_id = '5117d000-0000-0000-0000-000000000004'),
    'T28-2 FAIL: o movimento para a etapa de perda nao ficou no historico';
end $$;

-- ============================================================================
-- 3. Mover entre duas etapas de perda mantém a data do fechamento.
-- ============================================================================
do $$
declare v_closed timestamptz; o record;
begin
  select closed_at into v_closed from public.opportunities where id = '5117f000-0000-0000-0000-000000000002';
  update public.opportunities set stage_id = '5117d000-0000-0000-0000-000000000005'
   where id = '5117f000-0000-0000-0000-000000000002';
  select * into o from public.opportunities where id = '5117f000-0000-0000-0000-000000000002';
  assert o.status = 'lost' and o.closed_at = v_closed, 'T28-3 FAIL: trocar de etapa de perda mudou o fechamento';
  assert o.lost_reason = 'Preço', 'T28-3 FAIL: o motivo sumiu entre etapas de perda';
end $$;

-- ============================================================================
-- 4. Tirar de uma etapa de perda para uma aberta reabre — `reopened`, sem motivo.
-- ============================================================================
do $$
declare o record;
begin
  update public.opportunities set stage_id = '5117d000-0000-0000-0000-000000000002'
   where id = '5117f000-0000-0000-0000-000000000002';
  select * into o from public.opportunities where id = '5117f000-0000-0000-0000-000000000002';
  assert o.status = 'open', 'T28-4 FAIL: voltar para etapa aberta deveria reabrir, ficou ' || o.status;
  assert o.closed_at is null, 'T28-4 FAIL: reaberto com closed_at';
  assert o.lost_reason is null, 'T28-4 FAIL: reaberto com o motivo da perda antiga';
  assert pg_temp.events(o.id, 'reopened') = 1, 'T28-4 FAIL: deveria haver 1 evento reopened';
end $$;

-- ============================================================================
-- 5. Status "open" escrito direto num negócio ganho reabre na primeira aberta.
-- ============================================================================
do $$
declare o record;
begin
  update public.opportunities set status = 'open' where id = '5117f000-0000-0000-0000-000000000001';
  select * into o from public.opportunities where id = '5117f000-0000-0000-0000-000000000001';
  assert o.stage_id = '5117d000-0000-0000-0000-000000000001', 'T28-5 FAIL: reabrir pelo status deveria ir para a primeira etapa aberta';
  assert o.status = 'open' and o.closed_at is null, 'T28-5 FAIL: reabertura pelo status incompleta';
  assert pg_temp.events(o.id, 'reopened') = 1, 'T28-5 FAIL: reabrir pelo status deveria emitir reopened';

  -- Ganhar de novo é outro ganho (o evento de 5 minutos atrás continua sendo fato).
  update public.opportunities set stage_id = '5117d000-0000-0000-0000-000000000003' where id = o.id;
  assert pg_temp.events(o.id, 'won') = 2, 'T28-5 FAIL: ganhar de novo deveria gravar o segundo won';
end $$;

-- ============================================================================
-- 6. Linha sem etapa de ganho: o status escrito vale e vira um evento.
-- ============================================================================
do $$
declare o record;
begin
  update public.opportunities set status = 'won' where id = '5117f000-0000-0000-0000-000000000003';
  select * into o from public.opportunities where id = '5117f000-0000-0000-0000-000000000003';
  assert o.stage_id = '5117d000-0000-0000-0000-000000000011', 'T28-6 FAIL: sem etapa de ganho, nao deveria mover';
  assert o.status = 'won' and o.closed_at is not null, 'T28-6 FAIL: sem etapa de ganho o status deveria valer';
  assert pg_temp.events(o.id, 'won') = 1, 'T28-6 FAIL: o ganho pelo status deveria gravar 1 won';

  -- E mover entre etapas abertas dessa linha não desfaz o ganho (não há onde ganhar).
  update public.opportunities set stage_id = '5117d000-0000-0000-0000-000000000012' where id = o.id;
  select * into o from public.opportunities where id = o.id;
  assert o.status = 'won', 'T28-6 FAIL: sem etapa de ganho, mover nao deveria reabrir';
end $$;

-- ============================================================================
-- 7. Nascer numa etapa de ganho já nasce fechado; a data de uma importação vale.
-- ============================================================================
do $$
declare o record;
begin
  insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, closed_at) values
    ('5117f000-0000-0000-0000-000000000005', '5117a000-0000-0000-0000-000000000001', '5117e000-0000-0000-0000-000000000001',
     '5117c000-0000-0000-0000-000000000001', '5117d000-0000-0000-0000-000000000003', 500, '2026-03-14T12:00:00Z');
  select * into o from public.opportunities where id = '5117f000-0000-0000-0000-000000000005';
  assert o.status = 'won', 'T28-7 FAIL: nascer em Ganho deveria nascer won';
  assert o.closed_at = '2026-03-14T12:00:00Z'::timestamptz, 'T28-7 FAIL: a data do fechamento importada foi trocada';
  assert pg_temp.events(o.id, 'won') = 1, 'T28-7 FAIL: nascer ganho deveria gravar 1 won, ha ' || pg_temp.events(o.id, 'won');
  -- O ganho importado conta no mês em que fechou, não no dia da importação.
  assert (select occurred_at from public.funnel_events where opportunity_id = o.id and event = 'won')
         = '2026-03-14T12:00:00Z'::timestamptz,
    'T28-7 FAIL: o won de quem nasce ganho deveria ter a data do fechamento';

  insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, status) values
    ('5117f000-0000-0000-0000-000000000006', '5117a000-0000-0000-0000-000000000001', '5117e000-0000-0000-0000-000000000001',
     '5117c000-0000-0000-0000-000000000001', '5117d000-0000-0000-0000-000000000001', 700, 'lost');
  select * into o from public.opportunities where id = '5117f000-0000-0000-0000-000000000006';
  assert o.stage_id = '5117d000-0000-0000-0000-000000000004' and o.closed_at is not null,
    'T28-7 FAIL: criar ja perdido deveria ir para a etapa de perda, fechado';
end $$;

-- ============================================================================
-- 8. Nada disso vaza: o vizinho não vê os eventos da equipe A.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5117b000-0000-0000-0000-00000000000d","role":"authenticated"}';

do $$ begin
  assert (select count(*) from public.funnel_events where opportunity_id::text like '5117f000%') = 0,
    'T28-8 FAIL: o vizinho le eventos da equipe A';
end $$;

rollback;
select 'PASS' as result;
