-- Sprint 9 W1 functional test. Runs as postgres against the local stack.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link)
values ('11111111-1111-1111-1111-111111111111', 'Teste Funil', 'x', 'y');

insert into public.pipelines (id, equipe_id, name)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'Comercial');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event)
values
  ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Novo',        1,'open', null),
  ('a0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Proposta',    2,'open', 'proposal_sent'),
  ('a0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Reunião',     3,'open', 'meeting_scheduled'),
  ('a0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Ganho',       4,'won',  null),
  ('a0000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Perdido',     5,'lost', null);

insert into public.leads (id, equipe_id, name, origin_category, channel)
values ('b0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Lead Um','paid_social','whatsapp'),
       ('b0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Lead Dois', null, null);
-- Lead Tres exercises the column DEFAULTS: source/origem default to 'manual'
-- and channel to 'whatsapp'. A default must never be reported as a measured
-- acquisition channel.
insert into public.leads (id, equipe_id, name)
values ('b0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Lead Tres');

-- =========================================================================
-- TEST 1 — an opportunity born in an unmapped stage produces no event.
-- =========================================================================
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
values ('c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
        'b0000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
        'a0000000-0000-0000-0000-000000000001', 5000);

do $$ begin
  assert (select count(*) from public.funnel_events) = 0,
    'T1 FAIL: unmapped birth stage produced an event';
  raise notice 'T1 ok — estagio sem mapa nao gera evento';
end $$;

-- =========================================================================
-- TEST 2 — moving to a mapped stage produces exactly one event.
-- =========================================================================
update public.opportunities set stage_id = 'a0000000-0000-0000-0000-000000000002'
 where id = 'c0000000-0000-0000-0000-000000000001';

do $$ begin
  assert (select count(*) from public.funnel_events where event='proposal_sent') = 1,
    'T2 FAIL: expected exactly 1 proposal_sent, got ' ||
    (select count(*) from public.funnel_events where event='proposal_sent');
  raise notice 'T2 ok — mover para estagio mapeado gera 1 evento';
end $$;

-- =========================================================================
-- TEST 3 — history is kept: move on, then back, then on again.
-- The whole point of the sprint. Under the old "current stage" logic this
-- would read as 1 proposal at best and 0 once the deal advanced.
-- =========================================================================
update public.opportunities set stage_id = 'a0000000-0000-0000-0000-000000000003' where id = 'c0000000-0000-0000-0000-000000000001';
update public.opportunities set stage_id = 'a0000000-0000-0000-0000-000000000002' where id = 'c0000000-0000-0000-0000-000000000001';
update public.opportunities set stage_id = 'a0000000-0000-0000-0000-000000000003' where id = 'c0000000-0000-0000-0000-000000000001';

do $$
declare v_prop int; v_meet int;
begin
  select count(*) into v_prop from public.funnel_events where event='proposal_sent';
  select count(*) into v_meet from public.funnel_events where event='meeting_scheduled';
  assert v_prop = 2, 'T3 FAIL: expected 2 proposal_sent, got ' || v_prop;
  assert v_meet = 2, 'T3 FAIL: expected 2 meeting_scheduled, got ' || v_meet;
  raise notice 'T3 ok — historico preservado: % propostas, % reunioes', v_prop, v_meet;
end $$;

-- =========================================================================
-- TEST 4 — closing by moving to the won stage records won EXACTLY ONCE.
-- This is the double-count guard: the stage move fires (a), and the status
-- flip must not also fire (c).
-- =========================================================================
update public.opportunities
   set stage_id = 'a0000000-0000-0000-0000-000000000004', status = 'won', closed_at = now()
 where id = 'c0000000-0000-0000-0000-000000000001';

do $$
declare v_won int;
begin
  select count(*) into v_won from public.funnel_events
   where event='won' and opportunity_id='c0000000-0000-0000-0000-000000000001';
  assert v_won = 1, 'T4 FAIL: expected exactly 1 won event, got ' || v_won;
  raise notice 'T4 ok — fechar movendo de estagio conta ganho UMA vez';
end $$;

-- =========================================================================
-- TEST 5 — closing by status only (no stage move) still records the win.
-- This is the copilot / webhook path.
-- =========================================================================
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
values ('c0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
        'b0000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',
        'a0000000-0000-0000-0000-000000000001', 900);

update public.opportunities set status = 'lost', closed_at = now()
 where id = 'c0000000-0000-0000-0000-000000000002';

do $$
declare v_lost int;
begin
  select count(*) into v_lost from public.funnel_events
   where event='lost' and opportunity_id='c0000000-0000-0000-0000-000000000002';
  assert v_lost = 1, 'T5 FAIL: expected 1 lost event via status path, got ' || v_lost;
  raise notice 'T5 ok — fechamento so por status tambem vira evento';
end $$;

-- =========================================================================
-- TEST 6 — an opportunity BORN in a mapped stage is not invisible.
-- =========================================================================
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value)
values ('c0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',
        'b0000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
        'a0000000-0000-0000-0000-000000000002', 1500);

do $$
declare v int;
begin
  select count(*) into v from public.funnel_events
   where opportunity_id='c0000000-0000-0000-0000-000000000003' and event='proposal_sent'
     and source='opportunity_created';
  assert v = 1, 'T6 FAIL: opportunity born in a mapped stage produced ' || v || ' events';
  raise notice 'T6 ok — oportunidade nascida em estagio mapeado gera evento';
end $$;

-- =========================================================================
-- TEST 7 — IDEMPOTENCY. The contract of the whole backfill.
-- =========================================================================
do $$
declare v_before int; v_after1 int; v_after2 int;
begin
  select count(*) into v_before from public.funnel_events;
  perform public._rebuild_funnel_events('22222222-2222-2222-2222-222222222222');
  select count(*) into v_after1 from public.funnel_events;
  perform public._rebuild_funnel_events('22222222-2222-2222-2222-222222222222');
  select count(*) into v_after2 from public.funnel_events;

  assert v_after1 = v_after2,
    'T7 FAIL: recompute is not idempotent — ' || v_after1 || ' then ' || v_after2;
  -- The strict form. A recompute over already-correct data must be a no-op:
  -- anything else means the rebuild disagrees with the live triggers about what
  -- the history means, and the dashboard would change every time somebody
  -- pressed the button.
  assert v_after1 = v_before,
    'T7 FAIL: recompute changed correct data — before ' || v_before || ' after ' || v_after1;
  raise notice 'T7 ok — recompute idempotente: % antes, % depois, % na segunda',
    v_before, v_after1, v_after2;
end $$;

-- =========================================================================
-- TEST 8 — remapping a stage changes history, and only via recompute.
-- =========================================================================
update public.pipeline_stages_v2 set funnel_event = 'qualified'
 where id = 'a0000000-0000-0000-0000-000000000002';

do $$
declare v_prop_before int; v_prop_after int; v_qual int;
begin
  select count(*) into v_prop_before from public.funnel_events where event='proposal_sent';
  assert v_prop_before > 0, 'T8 setup FAIL: no proposal events before remap';

  perform public._rebuild_funnel_events('22222222-2222-2222-2222-222222222222');

  select count(*) into v_prop_after from public.funnel_events where event='proposal_sent';
  select count(*) into v_qual from public.funnel_events where event='qualified';

  assert v_prop_after = 0, 'T8 FAIL: old proposal events survived the remap: ' || v_prop_after;
  assert v_qual = v_prop_before, 'T8 FAIL: expected ' || v_prop_before || ' qualified, got ' || v_qual;
  raise notice 'T8 ok — remapear reprocessa o historico: % propostas viraram % qualificados',
    v_prop_before, v_qual;
end $$;

-- =========================================================================
-- TEST 9 — manual events survive a recompute (they are not derivable).
-- =========================================================================
insert into public.funnel_events (equipe_id, opportunity_id, lead_id, pipeline_id, event, source, actor_type)
values ('11111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
        'no_show','manual','team');

do $$
declare v int;
begin
  perform public._rebuild_funnel_events('22222222-2222-2222-2222-222222222222');
  select count(*) into v from public.funnel_events where source='manual' and event='no_show';
  assert v = 1, 'T9 FAIL: recompute destroyed a manual event';
  raise notice 'T9 ok — evento manual sobrevive ao recompute';
end $$;

-- =========================================================================
-- TEST 10 — the channel view never returns NULL, and separates the two ideas.
-- =========================================================================
do $$
declare r record;
begin
  select * into r from public.v_lead_channel where lead_id='b0000000-0000-0000-0000-000000000001';
  assert r.acquisition_channel = 'Social Pago',
    'T10 FAIL: expected Social Pago, got ' || coalesce(r.acquisition_channel,'<null>');
  assert r.contact_channel = 'WhatsApp',
    'T10 FAIL: expected WhatsApp, got ' || coalesce(r.contact_channel,'<null>');
  assert r.acquisition_group = 'Inbound',
    'T10 FAIL: expected Inbound, got ' || coalesce(r.acquisition_group,'<null>');

  select * into r from public.v_lead_channel where lead_id='b0000000-0000-0000-0000-000000000002';
  assert r.acquisition_channel = 'Não informado',
    'T10 FAIL: null origin must read "Não informado", got ' || coalesce(r.acquisition_channel,'<null>');
  assert r.contact_channel = 'Não informado',
    'T10 FAIL: null channel must read "Não informado", got ' || coalesce(r.contact_channel,'<null>');

  -- The default trap: source='manual' and origem='manual' arrive without anyone
  -- choosing them, so they must not become an acquisition channel.
  select * into r from public.v_lead_channel where lead_id='b0000000-0000-0000-0000-000000000003';
  assert r.acquisition_channel = 'Não informado',
    'T10 FAIL: the source="manual" DEFAULT leaked into the chart as ' || coalesce(r.acquisition_channel,'<null>');
  raise notice 'T10 ok — canal de aquisicao e de atendimento separados, default nao vira dado';
end $$;

-- =========================================================================
-- TEST 11 — record_funnel_event refuses to fabricate a win.
-- =========================================================================
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.record_funnel_event('c0000000-0000-0000-0000-000000000003','won');
  exception when others then
    v_raised := true;
  end;
  assert v_raised, 'T11 FAIL: record_funnel_event accepted a manual "won"';
  raise notice 'T11 ok — nao da para afirmar um ganho na mao';
end $$;

-- =========================================================================
-- TEST 12 — map status tells "unmapped" apart from "nothing happened".
-- =========================================================================
do $$
declare v jsonb;
begin
  v := (select jsonb_agg(x) from (
         select jsonb_build_object(
           'total',  count(*) filter (where stage_active),
           'mapped', count(*) filter (where stage_active and funnel_event is not null)
         ) as x
         from public.v_stage_funnel_event
         where pipeline_id='22222222-2222-2222-2222-222222222222') s);
  -- 5 stages; Ganho + Perdido derive from stage_type, Reunião + Proposta mapped.
  assert (v->0->>'total')::int = 5, 'T12 FAIL: expected 5 stages, got ' || (v->0->>'total');
  assert (v->0->>'mapped')::int = 4, 'T12 FAIL: expected 4 mapped, got ' || (v->0->>'mapped');
  raise notice 'T12 ok — cobertura do mapa: % de % estagios', v->0->>'mapped', v->0->>'total';
end $$;

rollback;
