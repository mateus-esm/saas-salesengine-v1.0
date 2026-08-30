-- 20260830000900_sprint9_report_schedules.sql
-- Sprint 9 · T12 — the scheduled report: what it is, who gets it, and when.
--
-- THE REFACTOR AT THE TOP OF THIS FILE, AND WHY IT IS HERE
--
-- T4 promised "one metrics layer, two consumers": the screen and the report
-- must never be able to disagree. But every T4 function derives its scope from
-- auth.uid(), and the cron that sends the 08:00 report has no auth.uid() — it
-- runs as the service role, on behalf of a tenant nobody is logged in as.
--
-- The lazy fix is to write the report's queries again inside the edge function.
-- That is exactly the drift the promise was about: within two sprints the
-- screen says 12 propostas and the WhatsApp message says 11, and the client
-- stops trusting both.
--
-- So the arithmetic MOVES (it is not copied) into `_core` functions that take
-- (equipe, restrict) explicitly. The public RPCs become thin wrappers that
-- resolve the caller's scope and delegate; the report builder calls the same
-- cores with the tenant's id and no restriction. One implementation, two entry
-- points, and no way for them to drift.
--
-- DELIVERY RIDES SPRINT 8.4, IT DOES NOT REBUILD IT
--
-- notify() → notification_deliveries → notification-dispatcher → sendViaSolo
-- already exists, already speaks to the Solo API, already retries with backoff,
-- and already normalises phone numbers through _shared/phone.ts. The report
-- adds three notification types and a cron; it does not add a second thing that
-- talks to WhatsApp.

begin;

-- ============================================================================
-- 1. THE CORES — the arithmetic, addressable without a logged-in user
-- ============================================================================

create or replace function public._funnel_overview_core(
  p_equipe          uuid,
  p_restrict        uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null,
  p_channels        text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  r record;
begin
  with
  scoped_leads as (
    select l.id, l.created_at, l.responsible_id, c.acquisition_channel
      from public.leads l
      join public.v_lead_channel c on c.lead_id = l.id
     where l.equipe_id = p_equipe
       and l.deleted_at is null
       and (p_restrict is null or l.responsible_id = p_restrict)
       and (p_responsible_ids is null or l.responsible_id = any(p_responsible_ids))
       and (p_channels is null or c.acquisition_channel = any(p_channels))
  ),
  scoped_opps as (
    select o.id, o.value, o.status, o.created_at, o.closed_at, o.pipeline_id
      from public.opportunities o
      join scoped_leads sl on sl.id = o.lead_id
     where o.equipe_id = p_equipe
       and o.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  ev as (
    select fe.event, fe.opportunity_id
      from public.funnel_events fe
      join scoped_opps so on so.id = fe.opportunity_id
     where fe.equipe_id = p_equipe
       and fe.occurred_at >= p_from
       and fe.occurred_at <  p_to
  ),
  won  as (select distinct e.opportunity_id from ev e where e.event = 'won'),
  lost as (select distinct e.opportunity_id from ev e where e.event = 'lost'),
  tp as (
    select count(*) as n
      from public.touchpoints t
      join scoped_leads sl on sl.id = t.lead_id
     where t.contact_date >= p_from and t.contact_date < p_to
  )
  select
    (select count(*) from scoped_leads where created_at >= p_from and created_at < p_to) as new_leads,
    (select count(*) from scoped_opps  where created_at >= p_from and created_at < p_to) as new_opportunities,
    (select count(*) from ev where event = 'qualified')         as qualified,
    (select count(*) from ev where event = 'proposal_sent')     as proposals_sent,
    (select count(*) from ev where event = 'meeting_scheduled') as meetings_scheduled,
    (select count(*) from ev where event = 'meeting_done')      as meetings_done,
    (select count(*) from ev where event = 'no_show')           as no_shows,
    (select count(*) from won)                                  as deals_won,
    (select count(*) from lost)                                 as deals_lost,
    (select coalesce(sum(o.value), 0) from scoped_opps o join won w on w.opportunity_id = o.id)  as won_value,
    (select coalesce(sum(o.value), 0) from scoped_opps o join lost x on x.opportunity_id = o.id) as lost_value,
    (select coalesce(sum(o.value), 0) from scoped_opps o where o.status = 'open') as open_value,
    (select count(*) from scoped_opps o where o.status = 'open')                  as open_count,
    (select coalesce(avg(extract(epoch from (o.closed_at - o.created_at)) / 86400), 0)
       from scoped_opps o join won w on w.opportunity_id = o.id
      where o.closed_at is not null)                            as avg_cycle_days,
    (select n from tp)                                          as touchpoints
  into r;

  return jsonb_build_object(
    'period',             jsonb_build_object('from', p_from, 'to', p_to),
    'new_leads',          r.new_leads,
    'new_opportunities',  r.new_opportunities,
    'qualified',          r.qualified,
    'proposals_sent',     r.proposals_sent,
    'meetings_scheduled', r.meetings_scheduled,
    'meetings_done',      r.meetings_done,
    'no_shows',           r.no_shows,
    'deals_won',          r.deals_won,
    'deals_lost',         r.deals_lost,
    'won_value',          round(r.won_value, 2),
    'lost_value',         round(r.lost_value, 2),
    'open_value',         round(r.open_value, 2),
    'open_count',         r.open_count,
    'touchpoints',        r.touchpoints,
    'avg_ticket',         case when r.deals_won > 0 then round(r.won_value / r.deals_won, 2) end,
    'win_rate',           case when (r.deals_won + r.deals_lost) > 0
                               then round(100.0 * r.deals_won / (r.deals_won + r.deals_lost), 1) end,
    'no_show_rate',       case when r.meetings_scheduled > 0
                               then round(100.0 * r.no_shows / r.meetings_scheduled, 1) end,
    'show_rate',          case when r.meetings_scheduled > 0
                               then round(100.0 * r.meetings_done / r.meetings_scheduled, 1) end,
    'lead_to_won_rate',   case when r.new_leads > 0
                               then round(100.0 * r.deals_won / r.new_leads, 1) end,
    'avg_cycle_days',     case when r.deals_won > 0 then round(r.avg_cycle_days::numeric, 1) end,
    'touchpoints_per_lead', case when r.new_leads > 0
                               then round(r.touchpoints::numeric / r.new_leads, 1) end
  );
end;
$$;

revoke all on function public._funnel_overview_core(uuid, uuid, timestamptz, timestamptz, uuid[], uuid[], text[]) from public, anon, authenticated;

-- The public RPC is now a wrapper. Same name, same signature, same output —
-- nothing in the frontend changes.
create or replace function public.get_funnel_overview(
  p_from            timestamptz,
  p_to              timestamptz,
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null,
  p_channels        text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe uuid; v_restrict uuid;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;
  return public._funnel_overview_core(
    v_equipe, v_restrict, p_from, p_to, p_pipeline_ids, p_responsible_ids, p_channels);
end;
$$;

grant execute on function public.get_funnel_overview(timestamptz, timestamptz, uuid[], uuid[], text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Loss reasons core
-- ---------------------------------------------------------------------------
create or replace function public._loss_reasons_core(
  p_equipe       uuid,
  p_restrict     uuid,
  p_from         timestamptz,
  p_to           timestamptz,
  p_pipeline_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_result jsonb;
begin
  with lost_opps as (
    select distinct o.id, o.value, coalesce(o.lost_reason, 'Não informado') as reason
      from public.funnel_events fe
      join public.opportunities o on o.id = fe.opportunity_id
      join public.leads l         on l.id = o.lead_id
     where fe.equipe_id = p_equipe
       and fe.event = 'lost'
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and o.deleted_at is null and l.deleted_at is null
       and (p_restrict is null or l.responsible_id = p_restrict)
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('reason', reason, 'count', n, 'value', round(v, 2))
           order by n desc, reason), '[]'::jsonb)
    into v_result
    from (select reason, count(*) as n, coalesce(sum(value), 0) as v
            from lost_opps group by reason) s;
  return v_result;
end;
$$;

revoke all on function public._loss_reasons_core(uuid, uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;

create or replace function public.get_loss_reasons(
  p_from            timestamptz,
  p_to              timestamptz,
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_equipe uuid; v_restrict uuid;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;
  -- p_responsible_ids narrows further within the caller's own scope.
  return public._loss_reasons_core(
    v_equipe,
    coalesce(v_restrict, case when array_length(p_responsible_ids, 1) = 1
                              then p_responsible_ids[1] end),
    p_from, p_to, p_pipeline_ids);
end;
$$;

grant execute on function public.get_loss_reasons(timestamptz, timestamptz, uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Top opportunities core
-- ---------------------------------------------------------------------------
create or replace function public._top_opportunities_core(
  p_equipe       uuid,
  p_restrict     uuid,
  p_limit        integer default 10,
  p_pipeline_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_result jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'value')::numeric desc), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
             'opportunity_id',   o.id,
             'lead_id',          l.id,
             'lead_name',        l.name,
             'value',            coalesce(o.value, 0),
             'pipeline_name',    pl.name,
             'stage_name',       st.name,
             'responsible_name', pr.nome_completo,
             'days_in_stage',    greatest(0, floor(extract(epoch from (now() - o.stage_entered_at)) / 86400))::int,
             'last_touch_at',    (select max(t.contact_date) from public.touchpoints t where t.lead_id = l.id)
           ) as x
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
      left join public.pipelines pl on pl.id = o.pipeline_id
      left join public.pipeline_stages_v2 st on st.id = o.stage_id
      left join public.profiles pr on pr.id = l.responsible_id
     where o.equipe_id = p_equipe
       and o.deleted_at is null and l.deleted_at is null
       and o.status = 'open'
       and (p_restrict is null or l.responsible_id = p_restrict)
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
     order by coalesce(o.value, 0) desc
     limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) s;
  return v_result;
end;
$$;

revoke all on function public._top_opportunities_core(uuid, uuid, integer, uuid[]) from public, anon, authenticated;

create or replace function public.get_top_opportunities(
  p_limit           integer default 10,
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_equipe uuid; v_restrict uuid;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;
  return public._top_opportunities_core(
    v_equipe,
    coalesce(v_restrict, case when array_length(p_responsible_ids, 1) = 1
                              then p_responsible_ids[1] end),
    p_limit, p_pipeline_ids);
end;
$$;

grant execute on function public.get_top_opportunities(integer, uuid[], uuid[]) to authenticated;

-- ============================================================================
-- 2. SCHEDULES
--
-- next_run_at is STORED, not computed on read. The cron's hot query is "which
-- schedules are due?", and a stored timestamptz makes that an index range scan
-- instead of evaluating a timezone expression for every schedule on the
-- platform, every tick, forever.
-- ============================================================================

create table if not exists public.report_schedules (
  id          uuid primary key default gen_random_uuid(),
  equipe_id   uuid not null references public.equipes(id) on delete cascade,
  name        text not null default 'Relatório comercial',
  frequency   text not null check (frequency in ('daily','weekly','monthly')),
  -- Local wall-clock hour the client chose. Minute is deliberately restricted:
  -- an hourly cron cannot honour 08:37, and a schedule that silently fires at
  -- the wrong time is worse than one that only offers the hour.
  send_hour   smallint not null default 8 check (send_hour between 0 and 23),
  -- 1 = Monday .. 7 = Sunday (ISO). Only meaningful for weekly.
  weekday     smallint check (weekday between 1 and 7),
  -- Capped at 28 so "day 30" does not silently skip February.
  monthday    smallint check (monthday between 1 and 28),
  timezone    text not null default 'America/Sao_Paulo',
  -- Which widget ids from the catalogue this report includes. Same vocabulary
  -- as the dashboard, so the client configures one mental model, not two.
  sections    text[] not null default array[
                'kpi_new_leads','kpi_proposals','kpi_meetings','kpi_no_show',
                'kpi_won_value','kpi_win_rate','panel_loss_reasons',
                'panel_by_channel','panel_top_opportunities'],
  filters     jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_by  uuid,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A weekly report with no weekday, or a monthly with no day, would never
  -- fire and would look like a bug in the cron rather than a half-filled form.
  constraint report_schedules_shape check (
    (frequency = 'daily')
    or (frequency = 'weekly'  and weekday  is not null)
    or (frequency = 'monthly' and monthday is not null)
  )
);

comment on table public.report_schedules is
  'Sprint 9: a recurring commercial report. next_run_at is stored so the cron''s "what is due" query is an index scan, not a timezone computation per row.';

create index if not exists idx_report_schedules_due
  on public.report_schedules (next_run_at)
  where active = true;

create index if not exists idx_report_schedules_equipe
  on public.report_schedules (equipe_id);

alter table public.report_schedules enable row level security;

-- Reading is team-wide (everyone can see what the team receives); writing is
-- admin, because a schedule sends messages to people's phones.
drop policy if exists report_schedules_select on public.report_schedules;
create policy report_schedules_select on public.report_schedules
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

drop policy if exists report_schedules_write on public.report_schedules;
create policy report_schedules_write on public.report_schedules
  for all to authenticated
  using (
    equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid())
    and exists (select 1 from public.user_roles r
                 where r.user_id = auth.uid() and r.role in ('admin','owner','super_admin'))
  )
  with check (
    equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid())
    and exists (select 1 from public.user_roles r
                 where r.user_id = auth.uid() and r.role in ('admin','owner','super_admin'))
  );

grant select, insert, update, delete on public.report_schedules to authenticated;

drop trigger if exists set_report_schedules_updated_at on public.report_schedules;
create trigger set_report_schedules_updated_at
  before update on public.report_schedules
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- 3. RECIPIENTS
--
-- A separate table rather than a jsonb array on the schedule: each recipient
-- is addressed individually by the dispatcher and can fail individually, and
-- the phone column has to be normalised and indexed. Sprint 8.5 spent a sprint
-- on numbers stored without the country code — the API accepts them and the
-- message simply never arrives.
-- ============================================================================

create table if not exists public.report_recipients (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.report_schedules(id) on delete cascade,
  name        text,
  -- Digits with country code, as produced by _shared/phone.ts. The CHECK is a
  -- backstop, not the normaliser: it rejects the obviously-wrong shapes that
  -- would otherwise be discovered only when a client says "não chegou".
  phone       text not null check (phone ~ '^[0-9]{12,15}$'),
  channel     text not null default 'whatsapp' check (channel in ('whatsapp')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (schedule_id, phone)
);

create index if not exists idx_report_recipients_schedule
  on public.report_recipients (schedule_id) where active = true;

alter table public.report_recipients enable row level security;

drop policy if exists report_recipients_all on public.report_recipients;
create policy report_recipients_all on public.report_recipients
  for all to authenticated
  using (
    schedule_id in (
      select s.id from public.report_schedules s
       where s.equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid())
    )
    and exists (select 1 from public.user_roles r
                 where r.user_id = auth.uid() and r.role in ('admin','owner','super_admin'))
  )
  with check (
    schedule_id in (
      select s.id from public.report_schedules s
       where s.equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid())
    )
    and exists (select 1 from public.user_roles r
                 where r.user_id = auth.uid() and r.role in ('admin','owner','super_admin'))
  );

grant select, insert, update, delete on public.report_recipients to authenticated;

-- ============================================================================
-- 4. RUNS — the frozen record of what was sent
--
-- The snapshot is stored, not recomputed on read. The link in a WhatsApp
-- message must open the numbers that were IN that message, forever: a page
-- that recomputes would show a client different figures a week later and make
-- the report look wrong when it was right.
--
-- The unique key is what makes double-sending impossible rather than unlikely.
-- ============================================================================

create table if not exists public.report_runs (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.report_schedules(id) on delete cascade,
  equipe_id     uuid not null references public.equipes(id) on delete cascade,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  snapshot      jsonb not null,
  rendered_text text,
  -- Long, random, and not derived from anything guessable. This is the only
  -- thing standing between a forwarded link and a stranger reading a client's
  -- revenue.
  public_token  text not null unique default encode(gen_random_bytes(24), 'hex'),
  status        text not null default 'built' check (status in ('built','sent','failed')),
  recipients_n  integer not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  -- A report link is useful for a while and a liability forever.
  expires_at    timestamptz not null default now() + interval '90 days',

  constraint report_runs_one_per_period unique (schedule_id, period_start)
);

create index if not exists idx_report_runs_schedule
  on public.report_runs (schedule_id, period_start desc);

alter table public.report_runs enable row level security;

-- Read-only for the team. Runs are written by the cron with the service role;
-- nothing a browser does should be able to forge a sent report.
drop policy if exists report_runs_select on public.report_runs;
create policy report_runs_select on public.report_runs
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

grant select on public.report_runs to authenticated;

-- ============================================================================
-- 5. WHEN DOES THIS FIRE NEXT?
--
-- All arithmetic happens in the schedule's own timezone and the result is
-- converted back to UTC for storage. Doing it the other way — adding 24h to a
-- UTC timestamp — drifts by an hour twice a year, which is exactly the kind of
-- bug that gets noticed as "o relatório chegou às 7 hoje".
-- ============================================================================

create or replace function public.compute_next_run(
  p_frequency text,
  p_hour      smallint,
  p_weekday   smallint,
  p_monthday  smallint,
  p_tz        text,
  p_after     timestamptz default now()
)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_local   timestamp;   -- wall clock in the schedule's zone
  v_cand    timestamp;
  v_days    integer;
begin
  v_local := p_after at time zone p_tz;

  if p_frequency = 'daily' then
    v_cand := date_trunc('day', v_local) + make_interval(hours => p_hour);
    if v_cand <= v_local then
      v_cand := v_cand + interval '1 day';
    end if;

  elsif p_frequency = 'weekly' then
    -- isodow: 1 = Monday .. 7 = Sunday, matching the weekday column.
    v_days := (p_weekday - extract(isodow from v_local)::integer + 7) % 7;
    v_cand := date_trunc('day', v_local) + make_interval(days => v_days, hours => p_hour);
    if v_cand <= v_local then
      v_cand := v_cand + interval '7 days';
    end if;

  else -- monthly
    v_cand := date_trunc('month', v_local)
              + make_interval(days => p_monthday - 1, hours => p_hour);
    if v_cand <= v_local then
      v_cand := date_trunc('month', v_local + interval '1 month')
                + make_interval(days => p_monthday - 1, hours => p_hour);
    end if;
  end if;

  return v_cand at time zone p_tz;
end;
$$;

comment on function public.compute_next_run(text, smallint, smallint, smallint, text, timestamptz) is
  'Sprint 9: next firing time for a schedule, computed in its own timezone and returned as UTC. Monthly is capped at day 28 by the table CHECK so February never silently skips a month.';

grant execute on function public.compute_next_run(text, smallint, smallint, smallint, text, timestamptz) to authenticated, service_role;

-- Keep next_run_at in step with the schedule automatically, so no code path can
-- create a schedule that never fires because somebody forgot to set it.
create or replace function public.fn_set_report_next_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active and (
       tg_op = 'INSERT'
       or new.frequency  is distinct from old.frequency
       or new.send_hour  is distinct from old.send_hour
       or new.weekday    is distinct from old.weekday
       or new.monthday   is distinct from old.monthday
       or new.timezone   is distinct from old.timezone
       or (not old.active and new.active)
     ) then
    new.next_run_at := public.compute_next_run(
      new.frequency, new.send_hour, new.weekday, new.monthday, new.timezone, now());
  end if;

  if not new.active then
    new.next_run_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_report_next_run on public.report_schedules;
create trigger trg_report_next_run
  before insert or update on public.report_schedules
  for each row execute function public.fn_set_report_next_run();

-- ============================================================================
-- 6. THE SNAPSHOT
--
-- Called by the cron with the service role (no auth.uid()), and by the preview
-- button as the logged-in admin. Both go through the same cores, so the
-- preview a client presses at 16:00 is byte-for-byte the report they get at
-- 08:00 the next morning.
-- ============================================================================

create or replace function public.build_report_snapshot(
  p_equipe   uuid,
  p_from     timestamptz,
  p_to       timestamptz,
  p_sections text[] default null,
  p_filters  jsonb   default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_pipelines uuid[];
  v_sections  text[] := coalesce(p_sections, array[]::text[]);
  v_out       jsonb;
  v_equipe    text;
begin
  select nome into v_equipe from public.equipes where id = p_equipe;

  v_pipelines := case
    when p_filters ? 'pipeline_ids' and jsonb_array_length(p_filters->'pipeline_ids') > 0
    then array(select (jsonb_array_elements_text(p_filters->'pipeline_ids'))::uuid)
    else null
  end;

  -- The overview is always present: it is what the message text is built from,
  -- and a report with no numbers in it is not a report.
  v_out := jsonb_build_object(
    'equipe_name', v_equipe,
    'period',      jsonb_build_object('from', p_from, 'to', p_to),
    'sections',    to_jsonb(v_sections),
    'overview',    public._funnel_overview_core(p_equipe, null, p_from, p_to, v_pipelines)
  );

  if 'panel_loss_reasons' = any(v_sections) then
    v_out := v_out || jsonb_build_object(
      'loss_reasons', public._loss_reasons_core(p_equipe, null, p_from, p_to, v_pipelines));
  end if;

  if 'panel_top_opportunities' = any(v_sections) then
    v_out := v_out || jsonb_build_object(
      'top_opportunities', public._top_opportunities_core(p_equipe, null, 5, v_pipelines));
  end if;

  return v_out;
end;
$$;

comment on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb) is
  'Sprint 9: the frozen contents of one report. Calls the same _core functions the dashboard reads, so the message and the screen cannot disagree.';

-- service_role only: it takes an equipe_id, so granting it to `authenticated`
-- would hand any logged-in user every tenant's revenue in one call. The
-- preview path below is the authenticated entry point, and it derives the team.
revoke all on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb) from public, anon, authenticated;
grant execute on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- Which window does a report cover?
--
-- The period always ENDS at the boundary before the send, never at "now": a
-- daily report sent at 08:00 covers yesterday 00:00–24:00, not the eight hours
-- of this morning. Otherwise Monday's report would compare eight hours against
-- Sunday's twenty-four and every week would look like a collapse.
-- ----------------------------------------------------------------------------

create or replace function public.report_period(
  p_frequency text,
  p_tz        text,
  p_at        timestamptz default now(),
  out period_start timestamptz,
  out period_end   timestamptz
)
returns record
language plpgsql
immutable
set search_path = public
as $$
declare
  v_local timestamp := p_at at time zone p_tz;
  v_s     timestamp;
  v_e     timestamp;
begin
  if p_frequency = 'daily' then
    v_e := date_trunc('day', v_local);
    v_s := v_e - interval '1 day';
  elsif p_frequency = 'weekly' then
    v_e := date_trunc('week', v_local);
    v_s := v_e - interval '7 days';
  else
    v_e := date_trunc('month', v_local);
    v_s := v_e - interval '1 month';
  end if;

  period_start := v_s at time zone p_tz;
  period_end   := v_e at time zone p_tz;
end;
$$;

grant execute on function public.report_period(text, text, timestamptz) to authenticated, service_role;

create or replace function public.preview_report_snapshot(
  p_schedule_id uuid,
  p_from        timestamptz default null,
  p_to          timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe uuid;
  v_sched  record;
  v_from   timestamptz;
  v_to     timestamptz;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  select * into v_sched from public.report_schedules
   where id = p_schedule_id and equipe_id = v_equipe;
  if v_sched.id is null then
    raise exception 'schedule_not_found' using errcode = 'P0002';
  end if;

  select f.period_start, f.period_end into v_from, v_to
    from public.report_period(v_sched.frequency, v_sched.timezone, now()) f;

  return public.build_report_snapshot(
    v_equipe,
    coalesce(p_from, v_from),
    coalesce(p_to, v_to),
    v_sched.sections,
    v_sched.filters);
end;
$$;


revoke all on function public.preview_report_snapshot(uuid, timestamptz, timestamptz) from public;
grant execute on function public.preview_report_snapshot(uuid, timestamptz, timestamptz) to authenticated;

commit;
