-- SE-SUP1-8 (#10) — desfecho de reunião (crm_record_meeting_outcome) e marcos por data.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sesup1_funnel_milestones.test.sql
-- (BEGIN…ROLLBACK; as migrations são recriadas dentro da transação. NÃO executado
--  pelo implementador: a regra da sprint proíbe escrita em produção.)
--
-- O que protege:
--   1. card: "realizada" grava meeting_done (source manual) pelo record_funnel_event;
--      repetir no mesmo dia não duplica (already_recorded)
--   2. agenda: no-show grava no_show e marca o atalho; trocar o desfecho apaga a
--      linha que ESTE evento gravou; desfazer limpa o atalho e não toca o que é de outro caminho
--   3. visita técnica conta como meeting_done
--   4. desfecho inválido -> 22023; outra equipe -> P0002; evento sem negócio -> opportunity_required
--   5. _funnel_milestones_core: baldes no dia LOCAL (22h30 de Brasília é do dia, não do seguinte),
--      por vendedor (dono do momento), por pipeline, since (série), granularidade fechada
--   6. build_report_snapshot traz funnel_milestones (o relatório diário usa)

begin;
-- @include supabase/migrations/20261015000401_sesup1_touchpoints_by_seller.sql
-- @include supabase/migrations/20261015000402_sesup1_report_per_pipeline.sql
-- @include supabase/migrations/20261015000700_sesup1_funnel_milestones.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5e800000-0000-0000-0000-00000000000a', 'MarcosA', 'x', 'y'),
  ('5e800000-0000-0000-0000-00000000000b', 'MarcosB', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5e8b0000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a1@sesup1-marcos.test', 'x', now(), now()),
  ('5e8b0000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b1@sesup1-marcos.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5e8b0000-0000-0000-0000-0000000000a1', '5e8b0000-0000-0000-0000-0000000000a1', 'a1@sesup1-marcos.test', '5e800000-0000-0000-0000-00000000000a', 'Ana', 'user'),
  ('5e8b0000-0000-0000-0000-0000000000b1', '5e8b0000-0000-0000-0000-0000000000b1', 'b1@sesup1-marcos.test', '5e800000-0000-0000-0000-00000000000b', 'Beto', 'user')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role, nome_completo = excluded.nome_completo;

insert into public.pipelines (id, equipe_id, name, loss_reasons) values
  ('5e8c0000-0000-0000-0000-000000000001', '5e800000-0000-0000-0000-00000000000a', 'Solar', '[]'::jsonb);
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5e8d0000-0000-0000-0000-000000000011', '5e800000-0000-0000-0000-00000000000a', '5e8c0000-0000-0000-0000-000000000001', 'Agendamento de Reunião', 0, 'open', 'meeting_scheduled'),
  ('5e8d0000-0000-0000-0000-000000000012', '5e800000-0000-0000-0000-00000000000a', '5e8c0000-0000-0000-0000-000000000001', 'Ganho', 1, 'won', null);

insert into public.leads (id, equipe_id, name) values
  ('5e8e0000-0000-0000-0000-000000000001', '5e800000-0000-0000-0000-00000000000a', 'Lead com negócio'),
  ('5e8e0000-0000-0000-0000-000000000002', '5e800000-0000-0000-0000-00000000000a', 'Lead sem negócio');

-- Nasce em "Agendamento": o gatilho da Sprint 9 grava meeting_scheduled (birth).
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id) values
  ('5e8f0000-0000-0000-0000-000000000001', '5e800000-0000-0000-0000-00000000000a', '5e8e0000-0000-0000-0000-000000000001',
   '5e8c0000-0000-0000-0000-000000000001', '5e8d0000-0000-0000-0000-000000000011', '5e8b0000-0000-0000-0000-0000000000a1');

insert into public.agenda_events (id, equipe_id, title, type, starts_at, ends_at, lead_id) values
  ('5e8a0000-0000-0000-0000-000000000001', '5e800000-0000-0000-0000-00000000000a', 'Apresentação', 'meeting', now(), now() + interval '1 hour', '5e8e0000-0000-0000-0000-000000000001'),
  ('5e8a0000-0000-0000-0000-000000000002', '5e800000-0000-0000-0000-00000000000a', 'Sem negócio',  'meeting', now() - interval '2 hours', now() - interval '1 hour', '5e8e0000-0000-0000-0000-000000000002');

set local role authenticated;
set local request.jwt.claims = '{"sub":"5e8b0000-0000-0000-0000-0000000000a1","role":"authenticated"}';

do $$
declare
  v_r jsonb;
  v_opp constant uuid := '5e8f0000-0000-0000-0000-000000000001';
  v_ev  constant uuid := '5e8a0000-0000-0000-0000-000000000001';
begin
  -- 1. card
  v_r := public.crm_record_meeting_outcome(v_opp, 'done');
  assert (v_r->>'already_recorded')::boolean = false, 'primeira realizada grava: ' || v_r::text;
  assert (select count(*) from public.funnel_events where opportunity_id = v_opp and event = 'meeting_done' and source = 'manual') = 1, 'meeting_done manual';
  v_r := public.crm_record_meeting_outcome(v_opp, 'done');
  assert (v_r->>'already_recorded')::boolean, 'duplo clique no mesmo dia não duplica';
  assert (select count(*) from public.funnel_events where opportunity_id = v_opp and event = 'meeting_done') = 1, 'ainda 1';

  -- 2. agenda: no-show (o negócio vem do lead)
  v_r := public.crm_record_meeting_outcome(null, 'no_show', v_ev);
  assert (v_r->>'opportunity_id')::uuid = v_opp, 'negócio aberto do lead';
  assert (select outcome from public.agenda_events where id = v_ev) = 'no_show', 'atalho marcado';
  assert (select outcome_event_id from public.agenda_events where id = v_ev) = (v_r->>'funnel_event_id')::bigint, 'evento dono da linha';
  assert (select count(*) from public.funnel_events where opportunity_id = v_opp and event = 'no_show') = 1, 'no_show gravado';

  -- trocar para realizada: o no-show deste evento some; a realizada de hoje já existia
  v_r := public.crm_record_meeting_outcome(null, 'done', v_ev);
  assert (select count(*) from public.funnel_events where opportunity_id = v_opp and event = 'no_show') = 0, 'correção apaga o no-show do evento';
  assert (v_r->>'already_recorded')::boolean, 'realizada de hoje já contada pelo card';
  assert (select outcome_event_id from public.agenda_events where id = v_ev) is null, 'evento não é dono da linha do card';

  -- desfazer: limpa o atalho e NÃO apaga a realizada do card
  v_r := public.crm_record_meeting_outcome(null, null, v_ev);
  assert (select outcome from public.agenda_events where id = v_ev) is null, 'atalho limpo';
  assert (select count(*) from public.funnel_events where opportunity_id = v_opp and event = 'meeting_done') = 1, 'realizada do card fica';

  -- 3. visita técnica = meeting_done (outro dia, para não deduplicar)
  v_r := public.crm_record_meeting_outcome(v_opp, 'technical_visit', null, now() - interval '3 days');
  assert v_r->>'event' = 'meeting_done', 'visita técnica é meeting_done';

  -- 4. erros
  begin
    perform public.crm_record_meeting_outcome(v_opp, 'remarcada');
    raise exception 'FALHA: desfecho inválido aceito';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.crm_record_meeting_outcome(null, 'done', '5e8a0000-0000-0000-0000-000000000002');
    raise exception 'FALHA: evento sem negócio aceito';
  exception when sqlstate 'P0002' then assert sqlerrm like 'opportunity_required%', sqlerrm;
  end;
end $$;

-- Outra equipe não grava no negócio nem no evento da A.
set local request.jwt.claims = '{"sub":"5e8b0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
begin
  begin
    perform public.crm_record_meeting_outcome('5e8f0000-0000-0000-0000-000000000001', 'no_show');
    raise exception 'FALHA: negócio de outra equipe';
  exception when sqlstate 'P0002' then assert sqlerrm like 'opportunity_not_found%', sqlerrm;
  end;
  begin
    perform public.crm_record_meeting_outcome(null, 'no_show', '5e8a0000-0000-0000-0000-000000000001');
    raise exception 'FALHA: evento de outra equipe';
  exception when sqlstate 'P0002' then assert sqlerrm like 'agenda_event_not_found%', sqlerrm;
  end;
  assert (select count(*) from public.funnel_events where opportunity_id = '5e8f0000-0000-0000-0000-000000000001' and event = 'no_show') = 0, 'nada gravado pela B';
end $$;

reset role;

-- 5. os números. Um no-show às 22h30 de Brasília de 13/10 (= 01:30Z de 14/10).
-- owner_id explícito: o negócio do fixture nasceu depois desse instante, e o dono
-- "do momento" anterior à primeira troca é nulo.
insert into public.funnel_events (equipe_id, opportunity_id, lead_id, pipeline_id, event, occurred_at, source, actor_type, owner_id)
values ('5e800000-0000-0000-0000-00000000000a', '5e8f0000-0000-0000-0000-000000000001', '5e8e0000-0000-0000-0000-000000000001',
        '5e8c0000-0000-0000-0000-000000000001', 'no_show', '2026-10-14T01:30:00Z', 'manual', 'team',
        '5e8b0000-0000-0000-0000-0000000000a1');

do $$
declare
  v_m jsonb;
  v_a constant uuid := '5e800000-0000-0000-0000-00000000000a';
begin
  -- Janela = 13/10 em Brasília: [03:00Z de 13, 03:00Z de 14).
  v_m := public._funnel_milestones_core(v_a, null, '2026-10-13T03:00:00Z', '2026-10-14T03:00:00Z', 'day');
  assert (v_m->'totals'->>'no_show')::int = 1, 'no-show das 22h30 é do dia 13: ' || v_m::text;
  assert jsonb_array_length(v_m->'series') = 1, 'um balde';
  assert v_m->'series'->0->>'bucket' = '2026-10-13', 'balde local';
  assert v_m->'by_seller'->0->>'seller_name' = 'Ana', 'vendedor = dono do momento';
  assert v_m->'by_pipeline'->0->>'pipeline_name' = 'Solar', 'pipeline';
  assert (v_m->'since'->>'no_show')::timestamptz = '2026-10-14T01:30:00Z', 'série do no-show começa no primeiro registro';
  assert v_m->'since'->'won' = 'null'::jsonb, 'marco nunca registrado: since nulo';

  -- Janela vazia: zeros explícitos, baldes presentes.
  v_m := public._funnel_milestones_core(v_a, null, '2026-09-01T03:00:00Z', '2026-09-08T03:00:00Z', 'day');
  assert (v_m->'totals'->>'meeting_done')::int = 0, 'zero explícito';
  assert jsonb_array_length(v_m->'series') = 7, 'sete dias, mesmo sem evento';
  assert jsonb_array_length(v_m->'by_seller') = 0, 'ninguém';

  -- Semana: um balde por semana ISO.
  v_m := public._funnel_milestones_core(v_a, null, now() - interval '20 days', now() + interval '1 day', 'week');
  assert (v_m->'totals'->>'meeting_done')::int = 2, 'card + visita técnica';
  assert (v_m->'totals'->>'meeting_scheduled')::int = 1, 'birth em Agendamento';

  -- Assento restrito a outro vendedor não vê os marcos da Ana.
  v_m := public._funnel_milestones_core(v_a, '5e8b0000-0000-0000-0000-0000000000b1', now() - interval '20 days', now() + interval '1 day', 'day');
  assert (v_m->'totals'->>'meeting_done')::int = 0, 'restrict por owner';

  begin
    perform public._funnel_milestones_core(v_a, null, now() - interval '1 day', now(), 'hour');
    raise exception 'FALHA: granularidade fora da lista';
  exception when sqlstate '22023' then null;
  end;

  -- 6. relatório diário
  v_m := public.build_report_snapshot(v_a, now() - interval '20 days', now() + interval '1 day');
  assert v_m ? 'funnel_milestones', 'snapshot traz os marcos';
  assert jsonb_array_length(v_m->'funnel_milestones'->'by_seller') = 1, 'por vendedor no snapshot';
end $$;

rollback;
select 'PASS' as result;
