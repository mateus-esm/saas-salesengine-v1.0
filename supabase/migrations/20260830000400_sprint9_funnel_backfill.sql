-- 20260830000400_sprint9_funnel_backfill.sql
-- Sprint 9 · T2 — replay the history the CRM already recorded.
--
-- WHY THIS EXISTS
--
-- T1 starts recording funnel events from the moment it deploys. On its own that
-- means every client opens the new dashboard to an empty chart and is told, in
-- effect, "your business started today" — for a product whose whole pitch is
-- showing the client their own operation, that is the worst possible first
-- impression, and it lasts a month before the trends become readable.
--
-- It is also unnecessary. opportunity_stage_history has recorded every stage
-- transition since Sprint 4, with timestamp and actor. The funnel is already in
-- the database; nobody had asked it the right question yet. This migration asks.
--
-- THE ONE THING THIS MUST NOT DO: GUESS
--
-- The tempting shortcut is to map stages automatically — ILIKE '%proposta%'
-- and friends — so the dashboard looks populated on day one without the client
-- lifting a finger. Rejected, deliberately:
--
--   * a wrong guess is invisible. A client whose "Proposta" column actually
--     means "proposta recebida do fornecedor" gets a confidently wrong number
--     and no reason to doubt it, and then sends that number to their team in a
--     daily report.
--   * an empty widget that says "mapeie seus estágios" is honest, takes one
--     click to fix, and cannot mislead anyone.
--
-- So an unmapped stage produces no events, forever, until a human says what it
-- means. What DOES get backfilled without anyone configuring anything is
-- won/lost — because stage_type already carries that meaning and the client
-- declared it when they built the pipeline. That alone gives every tenant a
-- real "negócios ganhos/perdidos" history from day one.
--
-- IDEMPOTENCY IS THE WHOLE CONTRACT
--
-- This runs again every time a client edits their stage map, and a second run
-- must not double anything. The rule: everything DERIVED is deleted and
-- rebuilt; everything ASSERTED is left alone.
--
--   derived  (deleted + rebuilt) : stage_change, opportunity_created, recompute
--   asserted (never touched)     : manual, import, status_change
--
-- status_change is on the "asserted" side for a reason worth stating: it
-- records a close that happened WITHOUT a stage move, so there is nothing left
-- in the database to reconstruct it from. Deleting those rows would quietly
-- erase every deal the copilot closed by flipping a status.

begin;

-- ============================================================================
-- 1. THE REBUILD
--
-- Not exposed to clients. The RPC below wraps it with an authorisation check;
-- this one is the engine, also called directly by the initial backfill at the
-- bottom of this file (running as postgres, where no auth.uid() exists).
-- ============================================================================

create or replace function public._rebuild_funnel_events(p_pipeline_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_after  integer;
begin
  select count(*) into v_before
    from public.funnel_events where pipeline_id = p_pipeline_id;

  -- --- wipe the derived half -------------------------------------------------
  delete from public.funnel_events
   where pipeline_id = p_pipeline_id
     and source in ('stage_change', 'opportunity_created', 'recompute');

  -- --- 1) every stage transition the ledger remembers -------------------------
  --
  -- Soft-deleted opportunities are skipped: a deal the client removed should not
  -- come back as a number. The metric RPCs filter them out on read as well, so
  -- both paths agree on the same answer rather than disagreeing quietly.
  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type, source_row_id)
  select h.equipe_id, h.opportunity_id, o.lead_id, o.pipeline_id, h.to_stage_id,
         e.funnel_event, h.changed_at, 'stage_change', h.changed_by,
         coalesce(nullif(h.changed_by_type, ''), 'team'), h.id
    from public.opportunity_stage_history h
    join public.opportunities o        on o.id = h.opportunity_id
    join public.v_stage_funnel_event e on e.stage_id = h.to_stage_id
   where o.pipeline_id = p_pipeline_id
     and o.deleted_at is null
     and e.funnel_event is not null
  on conflict do nothing;

  -- --- 2) opportunities born already meaning something ------------------------
  --
  -- The history trigger only fires on UPDATE, so a deal created directly in
  -- "Proposta Enviada" — which the webhook importer and AssignToPipelineDialog
  -- both do — leaves no trace in the ledger and would be invisible forever.
  --
  -- THE BIRTH STAGE IS NOT THE CURRENT STAGE. The first version of this query
  -- joined on o.stage_id, which is where the deal is NOW. For a deal created in
  -- March and won in August that wrote a `won` event dated March — every win
  -- back-dated to the day its deal was created, silently wrecking every
  -- historical series and every daily report that had already been sent. The
  -- wave's test caught it; it is the reason this reads from the ledger instead.
  --
  -- Where the deal started is recoverable exactly: it is the from_stage_id of
  -- its earliest transition, or — for a deal that never moved — its current
  -- stage. A NULL from_stage_id means it started nowhere and gets no event,
  -- which is also the right answer.
  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type)
  select o.equipe_id, o.id, o.lead_id, o.pipeline_id, b.birth_stage_id,
         e.funnel_event, o.created_at, 'opportunity_created', null, 'system'
    from public.opportunities o
    cross join lateral (
      select case
               when exists (select 1 from public.opportunity_stage_history h
                             where h.opportunity_id = o.id)
               then (select h2.from_stage_id
                       from public.opportunity_stage_history h2
                      where h2.opportunity_id = o.id
                      order by h2.changed_at asc, h2.id asc
                      limit 1)
               else o.stage_id
             end as birth_stage_id
    ) b
    join public.v_stage_funnel_event e on e.stage_id = b.birth_stage_id
   where o.pipeline_id = p_pipeline_id
     and o.deleted_at is null
     and e.funnel_event is not null
  on conflict do nothing;

  -- --- 3) closes that predate the event log -----------------------------------
  --
  -- A deal that was already won before any of this shipped may have neither a
  -- history row (it was closed by status) nor a status_change event (the trigger
  -- did not exist yet). Its close is still a fact, recorded in the row itself.
  -- Recovered here, and marked `recompute` so the provenance stays honest: this
  -- one came from current state, not from a ledger.
  --
  -- Order matters — this runs last so NOT EXISTS can see everything the two
  -- inserts above just wrote.
  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type)
  select o.equipe_id, o.id, o.lead_id, o.pipeline_id, o.stage_id,
         case
           when o.status = 'won'  or e.stage_type = 'won'  then 'won'
           else 'lost'
         end,
         coalesce(o.closed_at, o.updated_at, o.created_at),
         'recompute', null, 'system'
    from public.opportunities o
    join public.v_stage_funnel_event e on e.stage_id = o.stage_id
   where o.pipeline_id = p_pipeline_id
     and o.deleted_at is null
     and (o.status in ('won', 'lost') or e.stage_type in ('won', 'lost'))
     and not exists (
       select 1 from public.funnel_events fe
        where fe.opportunity_id = o.id
          and fe.event in ('won', 'lost')
     )
  on conflict do nothing;

  select count(*) into v_after
    from public.funnel_events where pipeline_id = p_pipeline_id;

  return v_after - v_before;
end;
$$;

comment on function public._rebuild_funnel_events(uuid) is
  'Sprint 9: rebuilds the DERIVED half of funnel_events for one pipeline from opportunity_stage_history + current state. Idempotent. Never touches manual/import/status_change events, which cannot be reconstructed. Internal — call recompute_funnel_events() instead.';

revoke all on function public._rebuild_funnel_events(uuid) from public, authenticated, anon;

-- ============================================================================
-- 2. THE CLIENT-FACING RPC
--
-- Gated on admin/owner. Recompute is not destructive to CRM data, but it does
-- rewrite what the whole team's dashboard and the scheduled report will say,
-- and it runs a full-pipeline scan. That is not a button every seat should
-- have.
--
-- p_pipeline_id NULL = every pipeline in the caller's own team. equipe_id is
-- never a parameter: it is read from the caller's profile, so this cannot be
-- pointed at another tenant from the browser.
-- ============================================================================

create or replace function public.recompute_funnel_events(p_pipeline_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe   uuid;
  v_is_admin boolean;
  v_pipeline record;
  v_delta    integer;
  v_total    integer := 0;
  v_count    integer := 0;
begin
  select p.equipe_id into v_equipe
    from public.profiles p where p.id = auth.uid();

  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.user_roles r
     where r.user_id = auth.uid()
       and r.role in ('admin', 'owner', 'super_admin')
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'forbidden: recompute requires admin' using errcode = '42501';
  end if;

  for v_pipeline in
    select pl.id, pl.name
      from public.pipelines pl
     where pl.equipe_id = v_equipe
       and pl.deleted_at is null
       and (p_pipeline_id is null or pl.id = p_pipeline_id)
  loop
    v_delta := public._rebuild_funnel_events(v_pipeline.id);
    v_total := v_total + coalesce(v_delta, 0);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'pipelines_processed', v_count,
    'net_events_change',   v_total
  );
end;
$$;

comment on function public.recompute_funnel_events(uuid) is
  'Sprint 9: replays stage history into funnel_events after a client edits their stage map. Idempotent — running it twice changes nothing the second time. Admin/owner only.';

revoke all on function public.recompute_funnel_events(uuid) from public;
grant execute on function public.recompute_funnel_events(uuid) to authenticated;

-- ============================================================================
-- 3. HOW MAPPED IS THIS PIPELINE?
--
-- Feeds the empty state. A widget that reads zero because nothing happened and
-- a widget that reads zero because nobody mapped the stage look identical, and
-- confusing them is how a client concludes the product is broken. This lets the
-- UI tell them apart and say the useful thing instead.
-- ============================================================================

create or replace function public.get_funnel_map_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe uuid;
  v_result jsonb;
begin
  select p.equipe_id into v_equipe
    from public.profiles p where p.id = auth.uid();

  if v_equipe is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(x order by x->>'pipeline_name'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
             'pipeline_id',   pl.id,
             'pipeline_name', pl.name,
             'total_stages',  count(*) filter (where e.stage_active),
             'mapped_stages', count(*) filter (where e.stage_active and e.funnel_event is not null),
             'events_covered', coalesce(
                jsonb_agg(distinct e.funnel_event)
                  filter (where e.stage_active and e.funnel_event is not null),
                '[]'::jsonb)
           ) as x
      from public.pipelines pl
      left join public.v_stage_funnel_event e on e.pipeline_id = pl.id
     where pl.equipe_id = v_equipe
       and pl.deleted_at is null
       and pl.is_archived = false
     group by pl.id, pl.name
  ) s;

  return v_result;
end;
$$;

comment on function public.get_funnel_map_status() is
  'Sprint 9: per-pipeline stage-mapping coverage, so the dashboard can distinguish "nothing happened" from "nobody mapped this yet".';

revoke all on function public.get_funnel_map_status() from public;
grant execute on function public.get_funnel_map_status() to authenticated;

-- ============================================================================
-- 4. THE INITIAL BACKFILL
--
-- Runs once, here, as postgres. No stage carries a funnel_event yet — nobody
-- has had the chance to map one — so what this actually recovers is every
-- won/lost transition in the tenant's history, derived from stage_type.
--
-- Wrapped per pipeline with a warning instead of a raise: one malformed
-- pipeline must not abort the deploy for the other seven clients. What fails
-- here is recoverable by re-running recompute_funnel_events() from the UI.
-- ============================================================================

do $$
declare
  v_pipeline record;
  v_delta    integer;
  v_total    integer := 0;
begin
  for v_pipeline in
    select id, name, equipe_id from public.pipelines where deleted_at is null
  loop
    begin
      v_delta := public._rebuild_funnel_events(v_pipeline.id);
      v_total := v_total + coalesce(v_delta, 0);
    exception when others then
      raise warning 'sprint9 backfill: pipeline % (%) failed: %',
        v_pipeline.name, v_pipeline.id, sqlerrm;
    end;
  end loop;

  raise notice 'sprint9 backfill: % funnel events recovered from history', v_total;
end $$;

commit;
