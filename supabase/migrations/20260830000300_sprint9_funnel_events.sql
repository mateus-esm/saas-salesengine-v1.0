-- 20260830000300_sprint9_funnel_events.sql
-- Sprint 9 · T1 — the funnel becomes an event log, and a lost deal gets a reason.
--
-- WHY THIS EXISTS
--
-- The dashboard asks "quantas propostas foram enviadas neste mês?" and answers
-- it by counting opportunities whose CURRENT stage is the proposal stage. That
-- is not a slow query or a rounding error; it is the wrong question. A deal that
-- went Proposta -> Reunião -> Ganho is, right now, in "Ganho". Counted from the
-- current stage it sent zero proposals. Every deal that progressed erases its
-- own history, so the metric silently reports the pipeline's leftovers instead
-- of the month's work — and it gets WORSE the better the team performs.
--
-- The fix is to stop reading state and start reading events. opportunity_stage
-- _history has recorded every transition since Sprint 4 (Epic 2), with actor and
-- timestamp. This migration turns that ledger into a queryable funnel:
--
--   funnel_events — append-only, one row per thing that HAPPENED.
--
-- WHY A SEPARATE TABLE AND NOT COLUMNS ON opportunities
--
-- A lead can receive two proposals. A meeting can be rescheduled after a
-- no-show. A column stores the last one and destroys the rest; a log stores
-- both. That distinction is the difference between "3 propostas enviadas hoje"
-- (volume of work) and "3 negócios chegaram em proposta" (funnel conversion),
-- and the report the founder specified needs the first while the funnel chart
-- needs the second. Both are derivable from a log; neither survives a column.
--
--   * volume of activity   -> count(*)
--   * conversion rates     -> count(distinct opportunity_id)
--
-- Consumers must pick deliberately. The metric RPCs in T4 document which they
-- use, per metric.
--
-- WHY A SEMANTIC MAP AND NOT HARDCODED STAGE NAMES
--
-- Every client builds their own pipeline. "Proposta Enviada" is called
-- "Orçamento" at one client and "Apresentação de Valores" at another, and one
-- of them does not send proposals at all. Hardcoding names, or guessing them
-- with an ILIKE, produces a dashboard that is confidently wrong for most
-- tenants. So a stage declares what it MEANS — pipeline_stages_v2.funnel_event
-- — and the client sets that once. A stage with no meaning declared produces no
-- events, which reads as an empty widget that says "map your stages", not as a
-- zero that looks like bad sales performance.
--
-- WHY won/lost ARE NOT IN THAT COLUMN
--
-- stage_type already carries 'won'/'lost' and it drives real closing behaviour.
-- Letting a second column also say "this is the won stage" creates two truths
-- that will disagree the first time somebody edits one of them. So the CHECK
-- here FORBIDS won/lost in funnel_event, and v_stage_funnel_event derives them
-- from stage_type. One column to edit, one view to ask.

begin;

-- ============================================================================
-- 1. THE STAGE MAP
--
-- Nullable on purpose: NULL means "this stage carries no funnel meaning" (a
-- triage column, a parking lot), which is the correct answer for most stages in
-- most pipelines. Only the handful that matter get mapped.
-- ============================================================================

alter table public.pipeline_stages_v2
  add column if not exists funnel_event text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pipeline_stages_v2_funnel_event_check'
  ) then
    alter table public.pipeline_stages_v2
      add constraint pipeline_stages_v2_funnel_event_check
      check (funnel_event is null or funnel_event in (
        'qualified', 'proposal_sent', 'meeting_scheduled', 'meeting_done', 'no_show'
      ));
  end if;
end $$;

comment on column public.pipeline_stages_v2.funnel_event is
  'Sprint 9: what reaching this stage MEANS, in canonical funnel terms. NULL = no funnel meaning. won/lost are deliberately not allowed here — they derive from stage_type, and a second place to declare them would drift. Read through v_stage_funnel_event, never directly.';

-- ----------------------------------------------------------------------------
-- The single place that answers "what does this stage mean".
--
-- A terminal stage is terminal: if stage_type says won or lost, that wins over
-- anything funnel_event claims. The CHECK above already makes the conflict
-- impossible to write, but the view states the precedence anyway so a future
-- migration that widens the CHECK cannot quietly change the answer.
--
-- security_invoker = on: RLS on pipeline_stages_v2 does the tenant filtering.
-- Sprint 8.2 learned this the expensive way (see 20260824000200) — a definer
-- view over a tenant table is a cross-tenant read waiting to be selected.
-- ----------------------------------------------------------------------------

create or replace view public.v_stage_funnel_event as
select
  s.id           as stage_id,
  s.equipe_id,
  s.pipeline_id,
  s.name         as stage_name,
  s.position,
  s.stage_type,
  case
    when s.stage_type = 'won'  then 'won'
    when s.stage_type = 'lost' then 'lost'
    else s.funnel_event
  end            as funnel_event,
  (s.deleted_at is null) as stage_active
from public.pipeline_stages_v2 s;
-- Soft-deleted stages are NOT filtered out here. A stage the client removed in
-- July still meant "Proposta Enviada" in June, and the backfill in T2 replays
-- June. Filtering them here would make deleting a column quietly rewrite last
-- quarter's numbers. Callers that need only the live pipeline filter on
-- stage_active themselves.

alter view public.v_stage_funnel_event set (security_invoker = on);

comment on view public.v_stage_funnel_event is
  'Sprint 9: the canonical meaning of every stage. won/lost derive from stage_type; everything else from funnel_event. Every consumer reads this, never pipeline_stages_v2.funnel_event directly.';

grant select on public.v_stage_funnel_event to authenticated;

-- ============================================================================
-- 2. WHY A DEAL WAS LOST
--
-- The Vision asks for "deals lost, motive". There was no such field anywhere in
-- the schema — not on the opportunity, not on the lead, not in a note with any
-- structure to it. A free-text column would have been cheaper and would have
-- produced 40 spellings of "preço" that no chart can group, so the allowed
-- reasons are configured per pipeline and the opportunity stores the chosen
-- label.
--
-- Stored as a label rather than an FK to a reasons table: the list is small,
-- tenant-owned, and edited rarely, and a deal lost to a reason the client later
-- deletes must keep reading "Preço" in last quarter's report instead of turning
-- into a dangling uuid. History does not get to change because a dropdown did.
-- ============================================================================

alter table public.opportunities
  add column if not exists lost_reason text;

comment on column public.opportunities.lost_reason is
  'Sprint 9: why this deal was lost, as a label chosen from pipelines.loss_reasons. Denormalised on purpose — editing the pipeline list must not rewrite closed history.';

alter table public.pipelines
  add column if not exists loss_reasons jsonb not null default '[]'::jsonb;

comment on column public.pipelines.loss_reasons is
  'Sprint 9: the reasons this pipeline offers when a deal is marked lost. Array of {"label": text, "color": text}. Empty array = the client has not configured any; the UI then accepts a free-text reason rather than blocking the loss.';

-- Seed a sensible starting list for pipelines that have none, so the first
-- client to lose a deal after this deploy sees a usable dropdown instead of an
-- empty one. Deliberately generic and deliberately short: a list nobody edits is
-- a list nobody reads.
update public.pipelines
   set loss_reasons = '[
         {"label": "Preço",              "color": "#ef4444"},
         {"label": "Sem budget",         "color": "#f97316"},
         {"label": "Escolheu concorrente","color": "#a855f7"},
         {"label": "Sem resposta",       "color": "#64748b"},
         {"label": "Fora do perfil",     "color": "#0ea5e9"},
         {"label": "Timing",             "color": "#eab308"}
       ]'::jsonb
 where loss_reasons = '[]'::jsonb
   and deleted_at is null;

-- ============================================================================
-- 3. THE EVENT LOG
--
-- equipe_id is denormalised onto every row on purpose: every single metric
-- query filters by it, and making them all join opportunities to find it would
-- put a join in front of the cheapest index in the system.
--
-- lead_id and pipeline_id likewise — the report groups by channel (which lives
-- on the lead) and by pipeline, and the alternative is two joins on the hot
-- path of a query that runs on every dashboard load.
-- ============================================================================

create table if not exists public.funnel_events (
  id             bigserial primary key,
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  lead_id        uuid,
  pipeline_id    uuid,
  -- The stage that produced this event, when one did. NULL for manual events
  -- (a no-show is not a stage anywhere).
  stage_id       uuid,
  event          text not null check (event in (
                   'qualified', 'proposal_sent', 'meeting_scheduled',
                   'meeting_done', 'no_show', 'won', 'lost'
                 )),
  occurred_at    timestamptz not null default now(),
  source         text not null default 'stage_change' check (source in (
                   'stage_change', 'status_change', 'opportunity_created',
                   'manual', 'import', 'recompute'
                 )),
  -- Who caused it. Nullable: the copilot, a webhook and the recompute job all
  -- write events with no auth.uid() behind them.
  actor          uuid,
  actor_type     text not null default 'team' check (actor_type in (
                   'team', 'copilot', 'automation', 'import', 'system'
                 )),
  -- The opportunity_stage_history row this event was derived from. This is the
  -- idempotency key for the replay, and it is deliberately NOT the timestamp.
  --
  -- The first version of this table keyed duplicates on
  -- (opportunity_id, event, occurred_at), which looks reasonable and is wrong:
  -- now() is fixed for the whole transaction, so a deal moved Proposta ->
  -- Reunião -> Proposta inside one transaction (an import, an automation, a
  -- copilot batch) produced three history rows carrying one identical
  -- timestamp, and two of the three events were silently swallowed as
  -- "duplicates". The wave's own test caught it.
  --
  -- Keying on the source fact instead means a replay can never double an event
  -- (one history row -> one event, forever) while two genuine transitions at
  -- the same instant both survive. NULL for events with no ledger row behind
  -- them; Postgres allows many NULLs in a unique constraint, which is exactly
  -- the behaviour wanted here.
  source_row_id  bigint unique,
  created_at     timestamptz not null default now()
);

-- One birth event per opportunity, and one recovered close per opportunity.
-- Partial unique indexes rather than constraints because both only apply to a
-- single source; a manual no-show may legitimately repeat.
create unique index if not exists funnel_events_one_birth_per_opportunity
  on public.funnel_events (opportunity_id) where source = 'opportunity_created';

create unique index if not exists funnel_events_one_recovery_per_opportunity
  on public.funnel_events (opportunity_id) where source = 'recompute';

comment on table public.funnel_events is
  'Sprint 9: append-only log of what happened in the commercial funnel. Written by triggers off stage transitions, by record_funnel_event() for events that are not stage moves, and by recompute_funnel_events() when a client (re)maps their stages. Metrics read THIS, never the current stage.';

-- The index the dashboard actually uses: tenant, event type, time window.
create index if not exists idx_funnel_events_equipe_event_time
  on public.funnel_events (equipe_id, event, occurred_at desc);

-- The report's "what happened yesterday" scan, across all event types.
create index if not exists idx_funnel_events_equipe_time
  on public.funnel_events (equipe_id, occurred_at desc);

-- Breakdown by pipeline without falling back to the equipe-wide index.
create index if not exists idx_funnel_events_pipeline_event_time
  on public.funnel_events (equipe_id, pipeline_id, event, occurred_at desc);

-- recompute deletes by (pipeline, source); the drill-down reads one deal.
create index if not exists idx_funnel_events_opportunity
  on public.funnel_events (opportunity_id, occurred_at desc);

-- ----------------------------------------------------------------------------
-- RLS: a team reads its own events and nobody writes directly.
--
-- There is no INSERT/UPDATE/DELETE policy for `authenticated` by design. Every
-- write goes through a SECURITY DEFINER trigger or record_funnel_event(), which
-- run as the owner and are not subject to these policies. A client that could
-- INSERT here could fabricate its own metrics — and, more importantly, the
-- report that gets sent to the founder's clients would stop being derived from
-- what the CRM actually did.
-- ----------------------------------------------------------------------------

alter table public.funnel_events enable row level security;

drop policy if exists funnel_events_select_own_team on public.funnel_events;
create policy funnel_events_select_own_team on public.funnel_events
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

grant select on public.funnel_events to authenticated;

-- ============================================================================
-- 4. THE WRITERS
--
-- Three paths produce an event, and they are deliberately disjoint so nothing
-- is counted twice:
--
--   a) a stage transition            -> opportunity_stage_history AFTER INSERT
--   b) an opportunity born in a      -> opportunities AFTER INSERT
--      meaningful stage
--   c) status set to won/lost with   -> opportunities AFTER UPDATE, guarded on
--      NO stage change                  the stage being unchanged
--
-- (c)'s guard is the whole reason it is safe. Closing a deal normally moves it
-- to the won stage, which fires (a); without the guard the same close would
-- also fire (c) and every win would be counted twice. The guard makes (c) fire
-- only for the other path — code that flips status directly, which the copilot
-- and the webhook importers both do.
-- ============================================================================

create or replace function public.fn_record_stage_funnel_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event    text;
  v_lead_id  uuid;
  v_pipeline uuid;
begin
  select e.funnel_event into v_event
    from public.v_stage_funnel_event e
   where e.stage_id = new.to_stage_id;

  -- A stage with no declared meaning is not an error and not an event.
  if v_event is null then
    return new;
  end if;

  select o.lead_id, o.pipeline_id into v_lead_id, v_pipeline
    from public.opportunities o
   where o.id = new.opportunity_id;

  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type, source_row_id)
  values
    (new.equipe_id, new.opportunity_id, v_lead_id, v_pipeline, new.to_stage_id,
     v_event, new.changed_at, 'stage_change', new.changed_by,
     coalesce(nullif(new.changed_by_type, ''), 'team'), new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_funnel_from_stage_history on public.opportunity_stage_history;
create trigger trg_funnel_from_stage_history
  after insert on public.opportunity_stage_history
  for each row execute function public.fn_record_stage_funnel_event();

-- ----------------------------------------------------------------------------
-- (b) Born in a meaningful stage.
--
-- The history trigger is on UPDATE of opportunities, so an opportunity CREATED
-- directly in "Proposta Enviada" — which the webhook importer and the
-- AssignToPipelineDialog both do — never produces a history row and would
-- otherwise be invisible to the funnel forever.
-- ----------------------------------------------------------------------------

create or replace function public.fn_record_created_funnel_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  select e.funnel_event into v_event
    from public.v_stage_funnel_event e
   where e.stage_id = new.stage_id;

  if v_event is null then
    return new;
  end if;

  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type)
  values
    (new.equipe_id, new.id, new.lead_id, new.pipeline_id, new.stage_id,
     v_event, new.created_at, 'opportunity_created', auth.uid(),
     case when auth.uid() is null then 'system' else 'team' end)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_funnel_from_opportunity_created on public.opportunities;
create trigger trg_funnel_from_opportunity_created
  after insert on public.opportunities
  for each row execute function public.fn_record_created_funnel_event();

-- ----------------------------------------------------------------------------
-- (c) Closed by status, without moving stage.
-- ----------------------------------------------------------------------------

create or replace function public.fn_record_status_funnel_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  v_event := case new.status when 'won' then 'won' when 'lost' then 'lost' else null end;
  if v_event is null then
    return new;
  end if;

  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type)
  values
    (new.equipe_id, new.id, new.lead_id, new.pipeline_id, new.stage_id,
     v_event, coalesce(new.closed_at, now()), 'status_change', auth.uid(),
     case when auth.uid() is null then 'system' else 'team' end)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_funnel_from_status_change on public.opportunities;
create trigger trg_funnel_from_status_change
  after update of status on public.opportunities
  for each row
  when (
    old.status is distinct from new.status
    and new.status in ('won', 'lost')
    -- The guard. A close that also moved stage is already counted by (a).
    and old.stage_id is not distinct from new.stage_id
  )
  execute function public.fn_record_status_funnel_event();

-- ============================================================================
-- 5. THE MANUAL WRITE PATH
--
-- Not everything the funnel needs is a stage move. A no-show is the absence of
-- something: the meeting stayed in the same column and simply did not happen.
-- Same for a client who sends proposals from outside the CRM and just wants to
-- tick "enviei". Those need a way in that is not "give the browser INSERT on
-- the metrics table".
--
-- SECURITY DEFINER, and therefore responsible for its own authorisation: it
-- re-derives equipe_id from the opportunity and refuses anything outside the
-- caller's team. Taking equipe_id as a parameter would make it a cross-tenant
-- write primitive exposed over PostgREST.
-- ============================================================================

create or replace function public.record_funnel_event(
  p_opportunity_id uuid,
  p_event          text,
  p_occurred_at    timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp    record;
  v_equipe uuid;
  v_id     bigint;
begin
  if p_event not in ('qualified','proposal_sent','meeting_scheduled','meeting_done','no_show') then
    -- won/lost are outcomes of closing a deal, not something to be asserted by
    -- hand: allowing them here would let the UI report a win the CRM never had.
    raise exception 'invalid_event: % cannot be recorded manually', p_event
      using errcode = '22023';
  end if;

  select o.id, o.equipe_id, o.lead_id, o.pipeline_id, o.stage_id
    into v_opp
    from public.opportunities o
   where o.id = p_opportunity_id
     and o.deleted_at is null;

  if v_opp.id is null then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();

  if v_equipe is null or v_equipe <> v_opp.equipe_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type)
  values
    (v_opp.equipe_id, v_opp.id, v_opp.lead_id, v_opp.pipeline_id, v_opp.stage_id,
     p_event, p_occurred_at, 'manual', auth.uid(), 'team')
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_funnel_event(uuid, text, timestamptz) is
  'Sprint 9: record a funnel event that is not a stage move (no-show, proposal sent outside the CRM). Refuses won/lost — those must come from actually closing the deal.';

revoke all on function public.record_funnel_event(uuid, text, timestamptz) from public;
grant execute on function public.record_funnel_event(uuid, text, timestamptz) to authenticated;

commit;
