-- Sprint 11 · Onda 3 · T34 — o agendador: reciclo e recorrência.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_timers.test.sql
--
-- O que este teste protege:
--   RECICLO — só o negócio vencido volta, para a etapa alvo, com evento
--   `recycled` e autor "automação"; `p_recycle_since` segura o acumulado
--   (quem venceu antes de ligar não sai); `dry_run` não escreve.
--   RECORRÊNCIA — um retorno por negócio e por cadência, X dias antes do
--   vencimento, com o mesmo contato e dono e os itens daquela cadência, no
--   pipeline/etapa do item; não duplica; retorno apagado não volta.

begin;

-- @include supabase/migrations/20260911000300_sprint11_w2_owner_events.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql
-- @include supabase/migrations/20260912000600_sprint11_w3_revenue_metrics.sql
-- @include supabase/migrations/20260912000700_sprint11_w3_timers.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('511da000-0000-0000-0000-000000000001', 'S11W3 Timers A', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('511db000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@s11w3-timers.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('511db000-0000-0000-0000-00000000000b', '511db000-0000-0000-0000-00000000000b', 'b@s11w3-timers.test', '511da000-0000-0000-0000-000000000001', 'Vendedor B', 'user')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

-- P1: com Reciclo (15 dias, volta para Novo). P2: a linha dos retornos de manutenção.
insert into public.pipelines (id, equipe_id, name) values
  ('511dc000-0000-0000-0000-000000000001', '511da000-0000-0000-0000-000000000001', 'Clinica Timers'),
  ('511dc000-0000-0000-0000-000000000002', '511da000-0000-0000-0000-000000000001', 'Manutencao Timers');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('511dd000-0000-0000-0000-000000000001', '511da000-0000-0000-0000-000000000001', '511dc000-0000-0000-0000-000000000001', 'Novo',    1, 'open'),
  ('511dd000-0000-0000-0000-000000000002', '511da000-0000-0000-0000-000000000001', '511dc000-0000-0000-0000-000000000001', 'Reciclo', 2, 'ciclo'),
  ('511dd000-0000-0000-0000-000000000003', '511da000-0000-0000-0000-000000000001', '511dc000-0000-0000-0000-000000000001', 'Ganho',   3, 'won'),
  ('511dd000-0000-0000-0000-000000000011', '511da000-0000-0000-0000-000000000001', '511dc000-0000-0000-0000-000000000002', 'Triagem', 1, 'open'),
  ('511dd000-0000-0000-0000-000000000012', '511da000-0000-0000-0000-000000000001', '511dc000-0000-0000-0000-000000000002', 'Agendar', 2, 'open');
update public.pipeline_stages_v2 set cycle_days = 15, cycle_target_stage_id = '511dd000-0000-0000-0000-000000000001'
 where id = '511dd000-0000-0000-0000-000000000002';

insert into public.catalog_items (id, equipe_id, name, kind, price, price_mode, recurrence_every, recurrence_unit, renew_days_before, renew_pipeline_id, renew_stage_id) values
  ('511dca00-0000-0000-0000-000000000001', '511da000-0000-0000-0000-000000000001', 'Limpeza',    'service', 250, 'fixed', 6,  'month', 15, null, null),
  ('511dca00-0000-0000-0000-000000000002', '511da000-0000-0000-0000-000000000001', 'Manutenção', 'service', 900, 'fixed', 12, 'month', 30,
   '511dc000-0000-0000-0000-000000000002', '511dd000-0000-0000-0000-000000000012'),
  ('511dca00-0000-0000-0000-000000000003', '511da000-0000-0000-0000-000000000001', 'Clareamento','service', 1200,'fixed', null, null, 0, null, null);

insert into public.leads (id, equipe_id, name) values
  ('511de000-0000-0000-0000-000000000001', '511da000-0000-0000-0000-000000000001', 'Paciente Reciclo'),
  ('511de000-0000-0000-0000-000000000002', '511da000-0000-0000-0000-000000000001', 'Paciente Recorrente');

-- Reciclo: C1 entrou há 20 dias (venceu há 5), C2 há 5 (não venceu), C3 há 40 (venceu há 25).
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, stage_entered_at, owner_id) values
  ('511df000-0000-0000-0000-000000000001', '511da000-0000-0000-0000-000000000001', '511de000-0000-0000-0000-000000000001', '511dc000-0000-0000-0000-000000000001', '511dd000-0000-0000-0000-000000000002', now() - interval '20 days', '511db000-0000-0000-0000-00000000000b'),
  ('511df000-0000-0000-0000-000000000002', '511da000-0000-0000-0000-000000000001', '511de000-0000-0000-0000-000000000001', '511dc000-0000-0000-0000-000000000001', '511dd000-0000-0000-0000-000000000002', now() - interval '5 days',  '511db000-0000-0000-0000-00000000000b'),
  ('511df000-0000-0000-0000-000000000003', '511da000-0000-0000-0000-000000000001', '511de000-0000-0000-0000-000000000001', '511dc000-0000-0000-0000-000000000001', '511dd000-0000-0000-0000-000000000002', now() - interval '40 days', '511db000-0000-0000-0000-00000000000b');

-- Recorrência: R1 ganho há 6 meses menos 10 dias (a limpeza vence em 10 dias; abre 15 antes → já).
-- R2 ganho há 12 meses menos 20 dias (a manutenção vence em 20 dias; abre 30 antes → já).
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id) values
  ('511df000-0000-0000-0000-000000000011', '511da000-0000-0000-0000-000000000001', '511de000-0000-0000-0000-000000000002', '511dc000-0000-0000-0000-000000000001', '511dd000-0000-0000-0000-000000000001', '511db000-0000-0000-0000-00000000000b'),
  ('511df000-0000-0000-0000-000000000012', '511da000-0000-0000-0000-000000000001', '511de000-0000-0000-0000-000000000002', '511dc000-0000-0000-0000-000000000001', '511dd000-0000-0000-0000-000000000001', '511db000-0000-0000-0000-00000000000b');

insert into public.opportunity_items (equipe_id, opportunity_id, catalog_item_id, name, quantity, unit_price, price_locked, recurrence_every, recurrence_unit, renew_days_before, renew_pipeline_id, renew_stage_id, position) values
  ('511da000-0000-0000-0000-000000000001', '511df000-0000-0000-0000-000000000011', '511dca00-0000-0000-0000-000000000001', 'Limpeza',     1, 250,  true, 6,  'month', 15, null, null, 0),
  ('511da000-0000-0000-0000-000000000001', '511df000-0000-0000-0000-000000000011', '511dca00-0000-0000-0000-000000000003', 'Clareamento', 1, 1200, true, null, null, 0, null, null, 1),
  ('511da000-0000-0000-0000-000000000001', '511df000-0000-0000-0000-000000000011', '511dca00-0000-0000-0000-000000000002', 'Manutenção',  1, 900,  true, 12, 'month', 30,
   '511dc000-0000-0000-0000-000000000002', '511dd000-0000-0000-0000-000000000012', 2),
  ('511da000-0000-0000-0000-000000000001', '511df000-0000-0000-0000-000000000012', '511dca00-0000-0000-0000-000000000002', 'Manutenção',  1, 900,  true, 12, 'month', 30,
   '511dc000-0000-0000-0000-000000000002', '511dd000-0000-0000-0000-000000000012', 0);

update public.opportunities set stage_id = '511dd000-0000-0000-0000-000000000003',
       closed_at = now() - interval '6 months' + interval '10 days'
 where id = '511df000-0000-0000-0000-000000000011';
update public.opportunities set stage_id = '511dd000-0000-0000-0000-000000000003',
       closed_at = now() - interval '12 months' + interval '20 days'
 where id = '511df000-0000-0000-0000-000000000012';
set constraints all immediate;

-- ============================================================================
-- 1. dry_run responde o que faria e não escreve.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.crm_run_timers(true, null, '511da000-0000-0000-0000-000000000001');
  assert (v->>'recycled')::int = 2, 'T34-1 FAIL: dry_run deveria ver 2 vencidos no reciclo, viu ' || (v->>'recycled');
  assert (v->>'renewals')::int = 2, 'T34-1 FAIL: dry_run deveria ver 2 retornos (limpeza do R1, manutencao do R2), viu ' || (v->>'renewals');
  assert (select stage_id from public.opportunities where id = '511df000-0000-0000-0000-000000000001') = '511dd000-0000-0000-0000-000000000002',
    'T34-1 FAIL: dry_run moveu um negocio';
  assert not exists (select 1 from public.opportunities where renewal_of_id is not null and lead_id = '511de000-0000-0000-0000-000000000002'),
    'T34-1 FAIL: dry_run criou retorno';
end $$;

-- ============================================================================
-- 2. Reciclo com p_recycle_since: sai o que venceu depois de ligar; o acumulado fica.
-- ============================================================================
do $$
declare v jsonb; h record;
begin
  v := public.crm_run_timers(false, now() - interval '10 days', '511da000-0000-0000-0000-000000000001');
  assert (v->>'recycled')::int = 1, 'T34-2 FAIL: so o C1 venceu depois do corte, reciclou ' || (v->>'recycled');
  assert (select stage_id from public.opportunities where id = '511df000-0000-0000-0000-000000000001') = '511dd000-0000-0000-0000-000000000001',
    'T34-2 FAIL: o C1 deveria ter voltado para Novo';
  assert (select stage_id from public.opportunities where id = '511df000-0000-0000-0000-000000000002') = '511dd000-0000-0000-0000-000000000002',
    'T34-2 FAIL: o C2 nao venceu e saiu do Reciclo';
  assert (select stage_id from public.opportunities where id = '511df000-0000-0000-0000-000000000003') = '511dd000-0000-0000-0000-000000000002',
    'T34-2 FAIL: o C3 venceu antes do corte e deveria ficar';
  assert (select count(*) from public.funnel_events
           where opportunity_id = '511df000-0000-0000-0000-000000000001' and event = 'recycled' and source = 'timer') = 1,
    'T34-2 FAIL: o reciclo deveria gravar 1 evento recycled';
  select * into h from public.opportunity_stage_history
   where opportunity_id = '511df000-0000-0000-0000-000000000001' order by id desc limit 1;
  assert h.changed_by_type = 'automation', 'T34-2 FAIL: o movimento do agendador deveria ser de automacao, foi ' || h.changed_by_type;
  assert (select count(*) from public.crm_timer_runs) >= 2, 'T34-2 FAIL: cada execucao deveria ficar registrada';

  -- Sem corte: o acumulado sai.
  v := public.crm_run_timers(false, null, '511da000-0000-0000-0000-000000000001');
  assert (select stage_id from public.opportunities where id = '511df000-0000-0000-0000-000000000003') = '511dd000-0000-0000-0000-000000000001',
    'T34-2 FAIL: sem corte, o C3 deveria reciclar';
end $$;

-- ============================================================================
-- 3. Recorrência: um retorno por negócio e por cadência, com os itens dela.
-- ============================================================================
do $$
declare r1 record; r2 record;
begin
  select * into r1 from public.opportunities where renewal_of_id = '511df000-0000-0000-0000-000000000011';
  assert found, 'T34-3 FAIL: o R1 deveria ter o retorno da limpeza';
  assert r1.origin = 'recorrencia' and r1.lead_id = '511de000-0000-0000-0000-000000000002'
         and r1.owner_id = '511db000-0000-0000-0000-00000000000b',
    'T34-3 FAIL: o retorno deveria ter origem recorrencia, o mesmo contato e o mesmo dono';
  assert r1.pipeline_id = '511dc000-0000-0000-0000-000000000001' and r1.stage_id = '511dd000-0000-0000-0000-000000000001',
    'T34-3 FAIL: sem pipeline de retorno, deveria abrir no mesmo pipeline, primeira etapa aberta';
  assert r1.status = 'open' and r1.value = 250, 'T34-3 FAIL: o retorno da limpeza deveria abrir com 250';
  assert (select count(*) from public.opportunity_items where opportunity_id = r1.id and deleted_at is null) = 1
     and (select name from public.opportunity_items where opportunity_id = r1.id) = 'Limpeza',
    'T34-3 FAIL: o retorno deveria levar so a limpeza (nao o clareamento, nem a manutencao de outra cadencia)';

  select * into r2 from public.opportunities where renewal_of_id = '511df000-0000-0000-0000-000000000012';
  assert found and r2.pipeline_id = '511dc000-0000-0000-0000-000000000002' and r2.stage_id = '511dd000-0000-0000-0000-000000000012',
    'T34-3 FAIL: o retorno da manutencao deveria abrir no pipeline e etapa do item';

  -- A manutenção do R1 vence em ~6 meses: ainda não.
  assert (select count(*) from public.opportunities where renewal_of_id = '511df000-0000-0000-0000-000000000011') = 1,
    'T34-3 FAIL: a manutencao do R1 ainda nao venceu';
end $$;

-- ============================================================================
-- 4. Não duplica; retorno apagado não volta.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.crm_run_timers(false, null, '511da000-0000-0000-0000-000000000001');
  assert (v->>'renewals')::int = 0, 'T34-4 FAIL: rodar de novo nao deveria criar retorno, criou ' || (v->>'renewals');

  update public.opportunities set deleted_at = now() where renewal_of_id = '511df000-0000-0000-0000-000000000012';
  v := public.crm_run_timers(false, null, '511da000-0000-0000-0000-000000000001');
  assert (v->>'renewals')::int = 0, 'T34-4 FAIL: retorno apagado nao deveria voltar';
end $$;

-- ============================================================================
-- 5. O agendador é do sistema: o app não o chama.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"511db000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.crm_run_timers(true, null, '511da000-0000-0000-0000-000000000001');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'T34-5 FAIL: um usuario do app nao deveria chamar o agendador';
end $$;

rollback;
select 'PASS' as result;
