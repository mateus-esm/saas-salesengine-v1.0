-- 20260830000600_sprint9_metrics_rpcs.sql
-- Sprint 9 · T4 — the one metrics layer. Two consumers, no second opinion.
--
-- WHY THESE ARE FUNCTIONS AND NOT QUERIES IN THE FRONTEND
--
-- The dashboard renders these numbers on a screen; the scheduled report sends
-- the same numbers to a client's WhatsApp at 08:00 from inside an edge
-- function. If each built its own query, they would drift — not dramatically,
-- just enough that "propostas enviadas" on the screen says 12 and the morning
-- report says 11, and from that morning on the client trusts neither. So the
-- arithmetic lives in exactly one place and both callers ask it the same
-- question.
--
-- SCOPE IS DERIVED, NEVER PASSED
--
-- Every function here reads the caller's team from their profile and the
-- caller's role from user_roles. Nothing takes an equipe_id parameter. These
-- are SECURITY DEFINER and therefore exposed over PostgREST to any
-- authenticated user, so an equipe_id argument would be a one-line
-- cross-tenant read of every client's revenue — and RLS cannot save us here
-- precisely because SECURITY DEFINER runs as the owner and bypasses it. Every
-- single query below therefore carries an explicit `equipe_id = v_equipe`.
--
-- The founder's D7: admin/owner see the whole team; a plain `user` sees only
-- what they are responsible for. That restriction is applied inside the
-- function, not by a flag the browser sends.
--
-- COUNTING RULES, STATED ONCE
--
--   activity events (proposal_sent, meetings, no_show) -> count(*)
--       "how much work happened" — two proposals to one deal are two proposals.
--   terminal events (won, lost)                        -> count(distinct opp)
--       "how many deals closed" — a deal reopened and re-won in the same window
--       is one win, not two.
--   value / pipeline                                   -> current state
--       Pipeline value is a "right now" number by nature. It is read from
--       opportunities, not from the event log, and it deliberately ignores the
--       date range for the OPEN figure.
--
-- Soft-deleted opportunities are excluded everywhere, matching what the CRM
-- shows and what the T2 rebuild writes.

begin;

-- ============================================================================
-- 1. THE SCOPE
-- ============================================================================

create or replace function public._funnel_scope(
  out v_equipe   uuid,
  out v_restrict uuid   -- NULL = sees everything in the team
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  select p.equipe_id into v_equipe
    from public.profiles p where p.id = auth.uid();

  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.user_roles r
     where r.user_id = auth.uid()
       and r.role in ('admin', 'owner', 'super_admin')
  ) then
    v_restrict := null;
  else
    v_restrict := auth.uid();
  end if;
end;
$$;

revoke all on function public._funnel_scope() from public, anon, authenticated;

comment on function public._funnel_scope() is
  'Sprint 9: resolves (team, responsible restriction) from auth.uid(). The single place D7 is enforced. Internal.';

-- ============================================================================
-- 2. OVERVIEW — the numbers at the top of the page and the top of the report
-- ============================================================================

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
  v_equipe   uuid;
  v_restrict uuid;
  r          record;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  with
  -- Leads in scope, with their resolved acquisition channel. Everything else
  -- narrows from here, so the tenant + responsible + channel filters are
  -- applied exactly once.
  scoped_leads as (
    select l.id, l.created_at, l.responsible_id, c.acquisition_channel
      from public.leads l
      join public.v_lead_channel c on c.lead_id = l.id
     where l.equipe_id = v_equipe
       and l.deleted_at is null
       and (v_restrict is null or l.responsible_id = v_restrict)
       and (p_responsible_ids is null or l.responsible_id = any(p_responsible_ids))
       and (p_channels is null or c.acquisition_channel = any(p_channels))
  ),
  scoped_opps as (
    select o.id, o.value, o.status, o.created_at, o.closed_at, o.pipeline_id, o.lost_reason
      from public.opportunities o
      join scoped_leads sl on sl.id = o.lead_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  ev as (
    select fe.event, fe.opportunity_id
      from public.funnel_events fe
      join scoped_opps so on so.id = fe.opportunity_id
     where fe.equipe_id = v_equipe
       and fe.occurred_at >= p_from
       and fe.occurred_at <  p_to
  ),
  won as (
    select distinct e.opportunity_id from ev e where e.event = 'won'
  ),
  lost as (
    select distinct e.opportunity_id from ev e where e.event = 'lost'
  ),
  tp as (
    select count(*) as n
      from public.touchpoints t
      join scoped_leads sl on sl.id = t.lead_id
     where t.contact_date >= p_from and t.contact_date < p_to
  )
  select
    (select count(*) from scoped_leads where created_at >= p_from and created_at < p_to) as new_leads,
    (select count(*) from scoped_opps  where created_at >= p_from and created_at < p_to) as new_opportunities,
    (select count(*) from ev where event = 'qualified')          as qualified,
    (select count(*) from ev where event = 'proposal_sent')      as proposals_sent,
    (select count(*) from ev where event = 'meeting_scheduled')  as meetings_scheduled,
    (select count(*) from ev where event = 'meeting_done')       as meetings_done,
    (select count(*) from ev where event = 'no_show')            as no_shows,
    (select count(*) from won)                                   as deals_won,
    (select count(*) from lost)                                  as deals_lost,
    (select coalesce(sum(o.value), 0) from scoped_opps o join won w on w.opportunity_id = o.id)  as won_value,
    (select coalesce(sum(o.value), 0) from scoped_opps o join lost x on x.opportunity_id = o.id) as lost_value,
    (select coalesce(sum(o.value), 0) from scoped_opps o where o.status = 'open') as open_value,
    (select count(*) from scoped_opps o where o.status = 'open')                  as open_count,
    (select coalesce(avg(extract(epoch from (o.closed_at - o.created_at)) / 86400), 0)
       from scoped_opps o join won w on w.opportunity_id = o.id
      where o.closed_at is not null)                             as avg_cycle_days,
    (select n from tp)                                           as touchpoints
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
    -- Rates are NULL, never 0, when the denominator is empty. A 0% conversion
    -- and "nobody has been to a meeting yet" are different facts, and a chart
    -- that shows 0% for the second one is telling the client their team failed
    -- at something it never attempted.
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

comment on function public.get_funnel_overview(timestamptz, timestamptz, uuid[], uuid[], text[]) is
  'Sprint 9: the headline funnel numbers for a period. Same function feeds the dashboard hero row and the scheduled WhatsApp report — they cannot disagree.';

revoke all on function public.get_funnel_overview(timestamptz, timestamptz, uuid[], uuid[], text[]) from public;
grant execute on function public.get_funnel_overview(timestamptz, timestamptz, uuid[], uuid[], text[]) to authenticated;

-- ============================================================================
-- 3. SERIES — the same numbers over time
--
-- Buckets are generated, not derived from the data. A day with no leads must
-- appear as a zero, not vanish: a line chart that silently skips empty days
-- draws a smooth line through a week the team did nothing.
-- ============================================================================

create or replace function public.get_funnel_series(
  p_from            timestamptz,
  p_to              timestamptz,
  p_granularity     text default 'day',   -- day | week | month
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
  v_equipe   uuid;
  v_restrict uuid;
  v_step     interval;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  -- Validated before use: p_granularity is passed to date_trunc, and a closed
  -- list is what keeps a dropdown value from reaching a SQL builtin unchecked.
  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'invalid_granularity: %', p_granularity using errcode = '22023';
  end if;

  v_step := case p_granularity
              when 'week'  then interval '1 week'
              when 'month' then interval '1 month'
              else interval '1 day'
            end;

  with
  scoped_leads as (
    select l.id, l.created_at, l.responsible_id
      from public.leads l
      join public.v_lead_channel c on c.lead_id = l.id
     where l.equipe_id = v_equipe
       and l.deleted_at is null
       and (v_restrict is null or l.responsible_id = v_restrict)
       and (p_responsible_ids is null or l.responsible_id = any(p_responsible_ids))
       and (p_channels is null or c.acquisition_channel = any(p_channels))
  ),
  scoped_opps as (
    select o.id, o.value
      from public.opportunities o
      join scoped_leads sl on sl.id = o.lead_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  buckets as (
    select generate_series(
             date_trunc(p_granularity, p_from),
             date_trunc(p_granularity, p_to - interval '1 microsecond'),
             v_step
           ) as bucket
  ),
  lead_counts as (
    select date_trunc(p_granularity, sl.created_at) as bucket, count(*) as n
      from scoped_leads sl
     where sl.created_at >= p_from and sl.created_at < p_to
     group by 1
  ),
  event_counts as (
    select date_trunc(p_granularity, fe.occurred_at) as bucket,
           count(*) filter (where fe.event = 'proposal_sent')     as proposals,
           count(*) filter (where fe.event = 'meeting_scheduled') as meetings_scheduled,
           count(*) filter (where fe.event = 'meeting_done')      as meetings_done,
           count(*) filter (where fe.event = 'no_show')           as no_shows,
           count(distinct fe.opportunity_id) filter (where fe.event = 'won')  as won,
           count(distinct fe.opportunity_id) filter (where fe.event = 'lost') as lost
      from public.funnel_events fe
      join scoped_opps so on so.id = fe.opportunity_id
     where fe.equipe_id = v_equipe
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
     group by 1
  ),
  won_value as (
    select date_trunc(p_granularity, fe.occurred_at) as bucket,
           coalesce(sum(so.value), 0) as v
      from (select distinct on (fe2.opportunity_id) fe2.opportunity_id, fe2.occurred_at
              from public.funnel_events fe2
             where fe2.equipe_id = v_equipe and fe2.event = 'won'
               and fe2.occurred_at >= p_from and fe2.occurred_at < p_to
             order by fe2.opportunity_id, fe2.occurred_at) fe
      join scoped_opps so on so.id = fe.opportunity_id
     group by 1
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'bucket',             b.bucket,
             'new_leads',          coalesce(lc.n, 0),
             'proposals_sent',     coalesce(ec.proposals, 0),
             'meetings_scheduled', coalesce(ec.meetings_scheduled, 0),
             'meetings_done',      coalesce(ec.meetings_done, 0),
             'no_shows',           coalesce(ec.no_shows, 0),
             'deals_won',          coalesce(ec.won, 0),
             'deals_lost',         coalesce(ec.lost, 0),
             'won_value',          round(coalesce(wv.v, 0), 2)
           ) order by b.bucket
         ), '[]'::jsonb)
    into v_result
    from buckets b
    left join lead_counts  lc on lc.bucket = b.bucket
    left join event_counts ec on ec.bucket = b.bucket
    left join won_value    wv on wv.bucket = b.bucket;

  return v_result;
end;
$$;

revoke all on function public.get_funnel_series(timestamptz, timestamptz, text, uuid[], uuid[], text[]) from public;
grant execute on function public.get_funnel_series(timestamptz, timestamptz, text, uuid[], uuid[], text[]) to authenticated;

-- ============================================================================
-- 4. BREAKDOWN — the same numbers cut by one dimension
--
-- p_dimension is validated against a closed list and then used to pick a
-- pre-written join, never interpolated into SQL. It arrives from a dropdown in
-- the browser; treating it as a fragment of a query would be an injection with
-- a UI in front of it.
-- ============================================================================

create or replace function public.get_funnel_breakdown(
  p_dimension       text,                 -- pipeline | responsible | channel | contact_channel | origin_group | loss_reason
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
  v_equipe   uuid;
  v_restrict uuid;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  if p_dimension not in ('pipeline','responsible','channel','contact_channel','origin_group','loss_reason') then
    raise exception 'invalid_dimension: %', p_dimension using errcode = '22023';
  end if;

  with
  scoped_leads as (
    select l.id, l.created_at, l.responsible_id,
           c.acquisition_channel, c.contact_channel, c.acquisition_group
      from public.leads l
      join public.v_lead_channel c on c.lead_id = l.id
     where l.equipe_id = v_equipe
       and l.deleted_at is null
       and (v_restrict is null or l.responsible_id = v_restrict)
       and (p_responsible_ids is null or l.responsible_id = any(p_responsible_ids))
       and (p_channels is null or c.acquisition_channel = any(p_channels))
  ),
  scoped_opps as (
    select o.id, o.value, o.status, o.pipeline_id, o.lost_reason, o.created_at,
           sl.responsible_id, sl.acquisition_channel, sl.contact_channel,
           sl.acquisition_group, sl.id as lead_id
      from public.opportunities o
      join scoped_leads sl on sl.id = o.lead_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  -- One row per opportunity per dimension key, with its event tallies for the
  -- window. Doing the grouping once and selecting the key afterwards keeps the
  -- six dimensions from becoming six near-identical queries.
  keyed as (
    select
      case p_dimension
        when 'pipeline'        then coalesce(pl.name, 'Sem pipeline')
        when 'responsible'     then coalesce(pr.nome_completo, 'Não atribuído')
        when 'channel'         then so.acquisition_channel
        when 'contact_channel' then so.contact_channel
        when 'origin_group'    then coalesce(so.acquisition_group, 'Não classificado')
        when 'loss_reason'     then coalesce(so.lost_reason, 'Não informado')
      end as label,
      so.id, so.value, so.status, so.created_at
      from scoped_opps so
      left join public.pipelines pl on pl.id = so.pipeline_id
      left join public.profiles  pr on pr.id = so.responsible_id
  ),
  ev as (
    select fe.opportunity_id, fe.event
      from public.funnel_events fe
      join scoped_opps so on so.id = fe.opportunity_id
     where fe.equipe_id = v_equipe
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
  ),
  agg as (
    select k.label,
           count(*) filter (where k.created_at >= p_from and k.created_at < p_to) as new_opportunities,
           count(*) filter (where k.status = 'open')                              as open_count,
           coalesce(sum(k.value) filter (where k.status = 'open'), 0)             as open_value,
           (select count(*) from ev e where e.opportunity_id = k.id and e.event = 'proposal_sent')      as proposals_sent,
           (select count(*) from ev e where e.opportunity_id = k.id and e.event = 'meeting_done')       as meetings_done,
           (select count(*) from ev e where e.opportunity_id = k.id and e.event = 'no_show')            as no_shows,
           (select count(*) from ev e where e.opportunity_id = k.id and e.event = 'won'  limit 1)       as won_flag,
           (select count(*) from ev e where e.opportunity_id = k.id and e.event = 'lost' limit 1)       as lost_flag,
           k.value, k.id
      from keyed k
     group by k.label, k.id, k.value, k.status, k.created_at
  ),
  rolled as (
    select label,
           sum(new_opportunities)                              as new_opportunities,
           sum(open_count)                                     as open_count,
           sum(open_value)                                     as open_value,
           sum(proposals_sent)                                 as proposals_sent,
           sum(meetings_done)                                  as meetings_done,
           sum(no_shows)                                       as no_shows,
           count(*) filter (where won_flag  > 0)               as deals_won,
           count(*) filter (where lost_flag > 0)               as deals_lost,
           coalesce(sum(value) filter (where won_flag > 0), 0) as won_value
      from agg
     group by label
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'label',             label,
             'new_opportunities', new_opportunities,
             'open_count',        open_count,
             'open_value',        round(open_value, 2),
             'proposals_sent',    proposals_sent,
             'meetings_done',     meetings_done,
             'no_shows',          no_shows,
             'deals_won',         deals_won,
             'deals_lost',        deals_lost,
             'won_value',         round(won_value, 2),
             'win_rate',          case when (deals_won + deals_lost) > 0
                                       then round(100.0 * deals_won / (deals_won + deals_lost), 1) end
           ) order by won_value desc, deals_won desc, label
         ), '[]'::jsonb)
    into v_result
    from rolled;

  return v_result;
end;
$$;

comment on function public.get_funnel_breakdown(text, timestamptz, timestamptz, uuid[], uuid[], text[]) is
  'Sprint 9: the funnel cut by one dimension. p_dimension is validated against a closed list and selects a pre-written join — it is never interpolated into SQL.';

revoke all on function public.get_funnel_breakdown(text, timestamptz, timestamptz, uuid[], uuid[], text[]) from public;
grant execute on function public.get_funnel_breakdown(text, timestamptz, timestamptz, uuid[], uuid[], text[]) to authenticated;

-- ============================================================================
-- 5. LOSS REASONS — "deals lost, motive", the Vision's words
--
-- Deliberately separate from the generic breakdown: this one counts deals that
-- were LOST IN THE WINDOW (a terminal event), where the breakdown groups every
-- opportunity by whatever reason it happens to carry. Reading a loss report off
-- the generic version would silently include deals lost last year.
-- ============================================================================

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
declare
  v_equipe   uuid;
  v_restrict uuid;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  with lost_opps as (
    select distinct o.id, o.value, coalesce(o.lost_reason, 'Não informado') as reason
      from public.funnel_events fe
      join public.opportunities o on o.id = fe.opportunity_id
      join public.leads l         on l.id = o.lead_id
     where fe.equipe_id = v_equipe
       and fe.event = 'lost'
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and o.deleted_at is null
       and l.deleted_at is null
       and (v_restrict is null or l.responsible_id = v_restrict)
       and (p_responsible_ids is null or l.responsible_id = any(p_responsible_ids))
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('reason', reason, 'count', n, 'value', round(v, 2))
           order by n desc, reason
         ), '[]'::jsonb)
    into v_result
    from (select reason, count(*) as n, coalesce(sum(value), 0) as v
            from lost_opps group by reason) s;

  return v_result;
end;
$$;

revoke all on function public.get_loss_reasons(timestamptz, timestamptz, uuid[], uuid[]) from public;
grant execute on function public.get_loss_reasons(timestamptz, timestamptz, uuid[], uuid[]) to authenticated;

-- ============================================================================
-- 6. BEST OPPORTUNITIES — "best opportunities", the Vision's words
--
-- Open deals ranked by value, with the two facts that decide whether the number
-- is real: how long it has sat in its current stage, and when anyone last
-- touched it. A big deal nobody has spoken to in three weeks is the single most
-- useful line in a daily report.
-- ============================================================================

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
declare
  v_equipe   uuid;
  v_restrict uuid;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

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
      join public.leads l              on l.id = o.lead_id
      left join public.pipelines pl    on pl.id = o.pipeline_id
      left join public.pipeline_stages_v2 st on st.id = o.stage_id
      left join public.profiles pr     on pr.id = l.responsible_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and l.deleted_at is null
       and o.status = 'open'
       and (v_restrict is null or l.responsible_id = v_restrict)
       and (p_responsible_ids is null or l.responsible_id = any(p_responsible_ids))
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
     order by coalesce(o.value, 0) desc
     limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) s;

  return v_result;
end;
$$;

revoke all on function public.get_top_opportunities(integer, uuid[], uuid[]) from public;
grant execute on function public.get_top_opportunities(integer, uuid[], uuid[]) to authenticated;

-- ============================================================================
-- 7. THE FILTER OPTIONS THE UI NEEDS
--
-- One round trip instead of four. The dashboard needs pipelines, team members
-- and the channels that actually occur in this tenant's data — the last of
-- which cannot be listed from a config table, because it is resolved from six
-- columns at read time.
-- ============================================================================

create or replace function public.get_dashboard_filters()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe   uuid;
  v_restrict uuid;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  return jsonb_build_object(
    'can_see_team', v_restrict is null,
    'pipelines', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
        from public.pipelines p
       where p.equipe_id = v_equipe and p.deleted_at is null and p.is_archived = false), '[]'::jsonb),
    'responsibles', case when v_restrict is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.nome_completo) order by pr.nome_completo)
        from public.profiles pr
       where pr.equipe_id = v_equipe), '[]'::jsonb) end,
    'channels', coalesce((
      select jsonb_agg(distinct c.acquisition_channel)
        from public.v_lead_channel c
       where c.equipe_id = v_equipe), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_dashboard_filters() from public;
grant execute on function public.get_dashboard_filters() to authenticated;

commit;
