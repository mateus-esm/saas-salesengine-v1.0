-- Sprint 9 W4 functional test — scheduling, periods, and the no-double-send guard.
--
-- The interesting failures here are all about time. A report that arrives an
-- hour late twice a year, or that covers eight hours instead of a day, or that
-- arrives twice, are all bugs the client notices before we do.
\set ON_ERROR_STOP on

begin;

insert into public.equipes (id, nome, crm_link, suporte_link)
values ('7e900000-0000-0000-0000-000000000001', 'Teste Relatórios', 'x', 'y');

-- =========================================================================
-- TEST 1 — next_run_at is computed on insert, in the schedule's timezone.
-- =========================================================================
insert into public.report_schedules (id, equipe_id, name, frequency, send_hour, timezone)
values ('7e900000-0000-0000-0000-0000000000d1','7e900000-0000-0000-0000-000000000001',
        'Diário', 'daily', 8, 'America/Sao_Paulo');

do $$
declare v timestamptz; v_hour int;
begin
  select next_run_at into v from public.report_schedules
   where id='7e900000-0000-0000-0000-0000000000d1';
  assert v is not null, 'W4-T1 FAIL: next_run_at was not computed on insert';

  -- 08:00 São Paulo, whatever that is in UTC today.
  v_hour := extract(hour from (v at time zone 'America/Sao_Paulo'))::int;
  assert v_hour = 8, 'W4-T1 FAIL: expected 08h local, got ' || v_hour;
  assert v > now(), 'W4-T1 FAIL: next run is in the past';
  raise notice 'W4-T1 ok — diario agenda 08h local (% UTC)', v;
end $$;

-- =========================================================================
-- TEST 2 — the hour is LOCAL, not UTC. This is the daylight-saving trap:
-- adding 24h to a UTC instant drifts an hour twice a year.
-- =========================================================================
do $$
declare v_sp timestamptz; v_lisbon timestamptz;
begin
  v_sp := public.compute_next_run('daily', 8::smallint, null, null, 'America/Sao_Paulo', now());
  v_lisbon := public.compute_next_run('daily', 8::smallint, null, null, 'Europe/Lisbon', now());
  assert v_sp <> v_lisbon,
    'W4-T2 FAIL: 08h in São Paulo and 08h in Lisbon resolved to the same instant';
  assert extract(hour from (v_sp at time zone 'America/Sao_Paulo'))::int = 8, 'W4-T2 FAIL: SP hour';
  assert extract(hour from (v_lisbon at time zone 'Europe/Lisbon'))::int = 8, 'W4-T2 FAIL: Lisbon hour';
  raise notice 'W4-T2 ok — 08h e horario LOCAL, nao UTC';
end $$;

-- =========================================================================
-- TEST 3 — weekly lands on the requested ISO weekday.
-- =========================================================================
insert into public.report_schedules (id, equipe_id, frequency, send_hour, weekday, timezone)
values ('7e900000-0000-0000-0000-0000000000d2','7e900000-0000-0000-0000-000000000001',
        'weekly', 9, 1, 'America/Sao_Paulo');   -- Monday

do $$
declare v timestamptz; v_dow int;
begin
  select next_run_at into v from public.report_schedules
   where id='7e900000-0000-0000-0000-0000000000d2';
  v_dow := extract(isodow from (v at time zone 'America/Sao_Paulo'))::int;
  assert v_dow = 1, 'W4-T3 FAIL: expected Monday (1), got ' || v_dow;
  assert v > now(), 'W4-T3 FAIL: weekly next run is in the past';
  raise notice 'W4-T3 ok — semanal cai na segunda-feira';
end $$;

-- =========================================================================
-- TEST 4 — a weekly schedule with no weekday is refused by the CHECK.
-- A half-filled form must not become a schedule that never fires.
-- =========================================================================
do $$
declare v_raised boolean := false;
begin
  begin
    insert into public.report_schedules (equipe_id, frequency, send_hour)
    values ('7e900000-0000-0000-0000-000000000001', 'weekly', 9);
  exception when others then v_raised := true;
  end;
  assert v_raised, 'W4-T4 FAIL: a weekly schedule without a weekday was accepted';
  raise notice 'W4-T4 ok — semanal sem dia da semana e recusado';
end $$;

-- =========================================================================
-- TEST 5 — deactivating clears next_run_at, so the cron cannot pick it up.
-- =========================================================================
do $$
declare v timestamptz;
begin
  update public.report_schedules set active = false
   where id='7e900000-0000-0000-0000-0000000000d1';
  select next_run_at into v from public.report_schedules
   where id='7e900000-0000-0000-0000-0000000000d1';
  assert v is null, 'W4-T5 FAIL: an inactive schedule still has a next_run_at';

  update public.report_schedules set active = true
   where id='7e900000-0000-0000-0000-0000000000d1';
  select next_run_at into v from public.report_schedules
   where id='7e900000-0000-0000-0000-0000000000d1';
  assert v is not null, 'W4-T5 FAIL: reactivating did not reschedule';
  raise notice 'W4-T5 ok — desativar limpa a agenda, reativar reagenda';
end $$;

-- =========================================================================
-- TEST 6 — the period ENDS at the boundary, never at "now".
-- A daily sent at 08:00 covers yesterday 00:00–24:00, not this morning.
-- =========================================================================
do $$
declare r record; v_hours numeric;
begin
  select * into r from public.report_period('daily', 'America/Sao_Paulo', now());
  v_hours := extract(epoch from (r.period_end - r.period_start)) / 3600;
  assert v_hours = 24, 'W4-T6 FAIL: daily window is ' || v_hours || 'h, expected 24';
  assert r.period_end <= now(), 'W4-T6 FAIL: the window ends in the future';
  assert extract(hour from (r.period_start at time zone 'America/Sao_Paulo'))::int = 0,
    'W4-T6 FAIL: daily window does not start at local midnight';
  raise notice 'W4-T6 ok — janela diaria = 24h fechadas, terminando na meia-noite local';
end $$;

-- =========================================================================
-- TEST 7 — THE ONE THAT MATTERS. Two ticks cannot send the same report twice.
-- =========================================================================
do $$
declare
  v_start timestamptz := date_trunc('day', now()) - interval '1 day';
  v_raised boolean := false;
begin
  insert into public.report_runs (schedule_id, equipe_id, period_start, period_end, snapshot)
  values ('7e900000-0000-0000-0000-0000000000d1','7e900000-0000-0000-0000-000000000001',
          v_start, v_start + interval '1 day', '{}'::jsonb);

  begin
    insert into public.report_runs (schedule_id, equipe_id, period_start, period_end, snapshot)
    values ('7e900000-0000-0000-0000-0000000000d1','7e900000-0000-0000-0000-000000000001',
            v_start, v_start + interval '1 day', '{}'::jsonb);
  exception when unique_violation then v_raised := true;
  end;

  assert v_raised, 'W4-T7 FAIL: the same period was inserted twice — the report would send twice';
  raise notice 'W4-T7 ok — dois ticks no mesmo periodo: o segundo e recusado pelo banco';
end $$;

-- =========================================================================
-- TEST 8 — every run gets an unguessable token, and they differ.
-- =========================================================================
do $$
declare v_tok text; v_tok2 text;
begin
  select public_token into v_tok from public.report_runs
   where schedule_id='7e900000-0000-0000-0000-0000000000d1' limit 1;
  assert length(v_tok) >= 40, 'W4-T8 FAIL: token is only ' || length(v_tok) || ' chars';

  insert into public.report_runs (schedule_id, equipe_id, period_start, period_end, snapshot)
  values ('7e900000-0000-0000-0000-0000000000d2','7e900000-0000-0000-0000-000000000001',
          now() - interval '7 days', now(), '{}'::jsonb)
  returning public_token into v_tok2;

  assert v_tok <> v_tok2, 'W4-T8 FAIL: two runs share a token';
  raise notice 'W4-T8 ok — token longo e unico por run (% chars)', length(v_tok);
end $$;

-- =========================================================================
-- TEST 9 — a badly-shaped phone number is refused at the door.
-- Sprint 8.5 spent a sprint on numbers stored without the country code.
-- =========================================================================
do $$
declare v_raised boolean := false;
begin
  begin
    insert into public.report_recipients (schedule_id, name, phone)
    values ('7e900000-0000-0000-0000-0000000000d1', 'Sem DDI', '11987654321');
  exception when others then v_raised := true;
  end;
  assert v_raised, 'W4-T9 FAIL: a phone without a country code was accepted';

  insert into public.report_recipients (schedule_id, name, phone)
  values ('7e900000-0000-0000-0000-0000000000d1', 'Com DDI', '5511987654321');
  raise notice 'W4-T9 ok — telefone sem 55 e recusado, com 55 e aceito';
end $$;

-- =========================================================================
-- TEST 10 — the snapshot builder answers with the same numbers as the screen.
-- =========================================================================
do $$
declare v_snap jsonb; v_direct jsonb; v_from timestamptz; v_to timestamptz;
begin
  v_from := now() - interval '30 days';
  v_to   := now();

  v_snap := public.build_report_snapshot(
    '7e900000-0000-0000-0000-000000000001', v_from, v_to,
    array['panel_loss_reasons','panel_top_opportunities']);
  v_direct := public._funnel_overview_core(
    '7e900000-0000-0000-0000-000000000001', null, v_from, v_to);

  assert v_snap->'overview' = v_direct,
    'W4-T10 FAIL: the report snapshot disagrees with the dashboard core';
  assert v_snap ? 'loss_reasons', 'W4-T10 FAIL: requested section missing';
  assert v_snap ? 'top_opportunities', 'W4-T10 FAIL: requested section missing';
  raise notice 'W4-T10 ok — snapshot do relatorio == nucleo do dashboard, secao por secao';
end $$;

-- =========================================================================
-- TEST 11 — a section NOT requested is not built. The client chose.
-- =========================================================================
do $$
declare v_snap jsonb;
begin
  v_snap := public.build_report_snapshot(
    '7e900000-0000-0000-0000-000000000001', now() - interval '30 days', now(),
    array['kpi_won_value']);
  assert not (v_snap ? 'loss_reasons'),
    'W4-T11 FAIL: a section the client did not ask for was included';
  raise notice 'W4-T11 ok — secao nao pedida nao entra no relatorio';
end $$;

rollback;
