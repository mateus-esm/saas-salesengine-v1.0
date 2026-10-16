-- Sprint Suporte 1 · #12 — crm_move_opportunity: perdido sem motivo é recusado.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sesup1_move_opportunity.test.sql
-- (ATENÇÃO: o runner executa contra o projeto linkado dentro de BEGIN…ROLLBACK;
--  a migration é recriada dentro da transação. Não foi executado pelo implementador
--  da tarefa — a regra da sprint proíbe escrita em produção.)
--
-- O que este teste protege:
--   1. destino de perda SEM motivo, em pipeline com loss_reasons → erro loss_reason_required
--   2. com motivo → etapa + status + lost_reason gravados juntos, evento `lost` no funil
--   3. pipeline SEM loss_reasons → perda sem motivo passa (rede de segurança grava 'Não informado')
--   4. outra equipe não move (opportunity_not_found) e etapa de outro pipeline é recusada
--   5. reabrir (perdido → aberto) limpa o motivo; mover para a mesma etapa devolve false
--   6. perdido → outra etapa de perda mantém o motivo existente
--   7. ganho → perdido: sem motivo recusa, com motivo grava
--   8. insert já perdido sem motivo recebe 'Não informado' (rede de segurança)

begin;
-- @include supabase/migrations/20261015000100_sesup1_crm_move_opportunity.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5e500000-0000-0000-0000-00000000000a', 'Mover A', 'x', 'y'),
  ('5e500000-0000-0000-0000-00000000000b', 'Mover B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5e5b0000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@sesup1-move.test', 'x', now(), now()),
  ('5e5b0000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@sesup1-move.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5e5b0000-0000-0000-0000-00000000000a', '5e5b0000-0000-0000-0000-00000000000a', 'a@sesup1-move.test', '5e500000-0000-0000-0000-00000000000a', 'Vendedor A', 'user'),
  ('5e5b0000-0000-0000-0000-00000000000b', '5e5b0000-0000-0000-0000-00000000000b', 'b@sesup1-move.test', '5e500000-0000-0000-0000-00000000000b', 'Vendedor B', 'user')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role;

-- P1 tem motivos configurados; P2 (mesma equipe A) não tem; PB é da equipe B.
insert into public.pipelines (id, equipe_id, name, loss_reasons) values
  ('5e5c0000-0000-0000-0000-000000000001', '5e500000-0000-0000-0000-00000000000a', 'Com motivos',  '[{"label":"Preço"},{"label":"Concorrente"}]'::jsonb),
  ('5e5c0000-0000-0000-0000-000000000002', '5e500000-0000-0000-0000-00000000000a', 'Sem motivos',  '[]'::jsonb),
  ('5e5c0000-0000-0000-0000-0000000000bb', '5e500000-0000-0000-0000-00000000000b', 'Da equipe B',  '[]'::jsonb);

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5e5d0000-0000-0000-0000-000000000011', '5e500000-0000-0000-0000-00000000000a', '5e5c0000-0000-0000-0000-000000000001', 'Aberta',    0, 'open'),
  ('5e5d0000-0000-0000-0000-000000000012', '5e500000-0000-0000-0000-00000000000a', '5e5c0000-0000-0000-0000-000000000001', 'Perdida 1', 1, 'lost'),
  ('5e5d0000-0000-0000-0000-000000000013', '5e500000-0000-0000-0000-00000000000a', '5e5c0000-0000-0000-0000-000000000001', 'Perdida 2', 2, 'lost'),
  ('5e5d0000-0000-0000-0000-000000000014', '5e500000-0000-0000-0000-00000000000a', '5e5c0000-0000-0000-0000-000000000001', 'Ganha',     3, 'won'),
  ('5e5d0000-0000-0000-0000-000000000021', '5e500000-0000-0000-0000-00000000000a', '5e5c0000-0000-0000-0000-000000000002', 'Aberta',    0, 'open'),
  ('5e5d0000-0000-0000-0000-000000000022', '5e500000-0000-0000-0000-00000000000a', '5e5c0000-0000-0000-0000-000000000002', 'Perdida',   1, 'lost'),
  ('5e5d0000-0000-0000-0000-0000000000b1', '5e500000-0000-0000-0000-00000000000b', '5e5c0000-0000-0000-0000-0000000000bb', 'Aberta',    0, 'open');

insert into public.leads (id, equipe_id, name) values
  ('5e5e0000-0000-0000-0000-000000000001', '5e500000-0000-0000-0000-00000000000a', 'Lead 1'),
  ('5e5e0000-0000-0000-0000-000000000002', '5e500000-0000-0000-0000-00000000000a', 'Lead 2');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('5e5f0000-0000-0000-0000-000000000001', '5e500000-0000-0000-0000-00000000000a', '5e5e0000-0000-0000-0000-000000000001', '5e5c0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000011'),
  ('5e5f0000-0000-0000-0000-000000000002', '5e500000-0000-0000-0000-00000000000a', '5e5e0000-0000-0000-0000-000000000002', '5e5c0000-0000-0000-0000-000000000002', '5e5d0000-0000-0000-0000-000000000021'),
  ('5e5f0000-0000-0000-0000-000000000003', '5e500000-0000-0000-0000-00000000000a', '5e5e0000-0000-0000-0000-000000000002', '5e5c0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000011');

-- Tudo abaixo roda como o vendedor da equipe A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"5e5b0000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare
  v_moved boolean;
  v_row   record;
begin
  -- 1. perda sem motivo, pipeline com motivos → recusa; nada muda.
  begin
    perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000012', null);
    raise exception 'FALHA: perda sem motivo foi aceita';
  exception when sqlstate '22023' then
    assert sqlerrm like 'loss_reason_required%', 'esperava loss_reason_required, veio: ' || sqlerrm;
  end;
  begin
    perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000012', '   ');
    raise exception 'FALHA: motivo em branco foi aceito';
  exception when sqlstate '22023' then null;
  end;
  assert (select stage_id from public.opportunities where id = '5e5f0000-0000-0000-0000-000000000001')
         = '5e5d0000-0000-0000-0000-000000000011', 'a recusa não pode mover o negócio';

  -- 2. com motivo → etapa, status e motivo juntos + evento `lost` no funil.
  v_moved := public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000012', ' Preço ');
  assert v_moved, 'devia ter movido';
  select * into v_row from public.opportunities where id = '5e5f0000-0000-0000-0000-000000000001';
  assert v_row.stage_id = '5e5d0000-0000-0000-0000-000000000012', 'etapa de perda';
  assert v_row.status = 'lost', 'status lost pelo gatilho de desfecho';
  assert v_row.lost_reason = 'Preço', 'motivo aparado e gravado';
  assert v_row.closed_at is not null, 'closed_at preenchido';
  assert (select count(*) from public.funnel_events
           where opportunity_id = '5e5f0000-0000-0000-0000-000000000001' and event = 'lost') = 1,
         'o evento lost do funil continua sendo gravado (uma vez)';

  -- 6. perda → outra etapa de perda, sem motivo novo: mantém o motivo.
  v_moved := public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000013', null);
  assert v_moved, 'perda → perda move';
  assert (select lost_reason from public.opportunities where id = '5e5f0000-0000-0000-0000-000000000001') = 'Preço',
         'o motivo existente é mantido';

  -- 5. mesma etapa → false; reabrir limpa o motivo.
  assert not public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000013', null),
         'mesma etapa devolve false';
  perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000011', null);
  select * into v_row from public.opportunities where id = '5e5f0000-0000-0000-0000-000000000001';
  assert v_row.status = 'open' and v_row.lost_reason is null and v_row.closed_at is null, 'reabrir limpa o desfecho';

  -- 3. pipeline sem motivos: perda sem motivo passa; a rede grava 'Não informado'.
  perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000002', '5e5d0000-0000-0000-0000-000000000022', null);
  assert (select lost_reason from public.opportunities where id = '5e5f0000-0000-0000-0000-000000000002') = 'Não informado',
         'perdido nunca fica vazio';

  -- 7. ganho → perdido sem motivo é recusado; com motivo passa.
  perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000003', '5e5d0000-0000-0000-0000-000000000014', null);
  assert (select status from public.opportunities where id = '5e5f0000-0000-0000-0000-000000000003') = 'won', 'foi para ganho';
  begin
    perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000003', '5e5d0000-0000-0000-0000-000000000012', null);
    raise exception 'FALHA: ganho -> perdido sem motivo aceito';
  exception when sqlstate '22023' then null;
  end;
  perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000003', '5e5d0000-0000-0000-0000-000000000012', 'Concorrente');
  assert (select status || '/' || lost_reason from public.opportunities where id = '5e5f0000-0000-0000-0000-000000000003') = 'lost/Concorrente',
         'ganho -> perdido com motivo';

  -- 8. negócio que NASCE perdido sem motivo (insert direto: importação/webhook) ganha 'Não informado'.
  insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, status)
  values ('5e5f0000-0000-0000-0000-000000000004', '5e500000-0000-0000-0000-00000000000a', '5e5e0000-0000-0000-0000-000000000001',
          '5e5c0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000012', 'lost');
  assert (select lost_reason from public.opportunities where id = '5e5f0000-0000-0000-0000-000000000004') = 'Não informado',
         'insert já perdido sem motivo recebe o padrão';

  -- 4. etapa de outro pipeline e negócio de outra equipe.
  begin
    perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000021', null);
    raise exception 'FALHA: etapa de outro pipeline aceita';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- Outra equipe: o negócio da equipe A simplesmente não existe para ela.
set local request.jwt.claims = '{"sub":"5e5b0000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  begin
    perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000012', 'Preço');
    raise exception 'FALHA: movimentação entre equipes permitida';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

-- Anônimo não executa.
reset role;
set local role anon;
do $$
begin
  begin
    perform public.crm_move_opportunity('5e5f0000-0000-0000-0000-000000000001', '5e5d0000-0000-0000-0000-000000000012', 'Preço');
    raise exception 'FALHA: anon executou a RPC';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'PASS' as result;
