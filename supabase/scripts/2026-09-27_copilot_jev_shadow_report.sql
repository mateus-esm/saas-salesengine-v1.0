-- Sprint 13 — System One (Jev) around the Copilot keeper: the shadow report.
--
-- Answers the hypotheses of Planning/Sprints/sprint_13_copilot_jev_v1.md §3 from
-- what the keeper logs in copilot_run_events.payload.s1 (every pass since the
-- deploy with JEV_API_KEY) joined to ai_decisions by (run_id, index).
--
-- Read-only. Run:
--   psql "$(cat supabase/.temp/pooler-url)" -f supabase/scripts/2026-09-27_copilot_jev_shadow_report.sql
--
-- Decision rule (written before the data): JEV_MODE=on when, over >= 300 passes,
--   H1 false quiet <= 3 %   H2 coverage >= 15 %   H3 Jev separates better than the LLM
--   H4 System One errors < 1 %.

\echo '== H4 · volume, errors and latency of System One =='
with p as (
  select kind, payload
    from public.copilot_run_events
   where kind like 'keeper_%' and payload ? 's1' and payload->'s1' ? 'triage'
)
select count(*)                                                                        as passes,
       count(*) filter (where payload->'s1'->'triage' ? 'error')                       as triage_errors,
       count(*) filter (where payload->'s1'->'verify' ? 'error')                       as verify_errors,
       round(100.0 * count(*) filter (where payload->'s1'->'triage' ? 'error'
                                         or payload->'s1'->'verify' ? 'error') / nullif(count(*), 0), 2) as error_pct,
       percentile_cont(0.5) within group (order by (payload->'s1'->'triage'->>'ms')::int) as triage_p50_ms,
       percentile_cont(0.9) within group (order by (payload->'s1'->'triage'->>'ms')::int) as triage_p90_ms,
       percentile_cont(0.5) within group (order by (payload->'s1'->'verify'->>'ms')::int) as verify_p50_ms,
       percentile_cont(0.5) within group (order by (payload->'timings'->>'model_ms')::int) as llm_p50_ms,
       sum((payload->'s1'->'triage'->>'tokens')::int + coalesce((payload->'s1'->'verify'->>'tokens')::int, 0)) as jev_tokens,
       round(sum((payload->'s1'->'triage'->>'tokens')::int + coalesce((payload->'s1'->'verify'->>'tokens')::int, 0))
             * 0.042 / 1e6, 4)                                                          as jev_cost_usd
  from p;

\echo '== H1 + H2 · would-be-quiet passes: coverage and false quiet =='
with p as (
  select e.run_id::text as run_id, e.kind, e.payload,
         coalesce((e.payload->'s1'->'triage'->>'would_quiet')::boolean, false) as would_quiet
    from public.copilot_run_events e
   where e.kind in ('keeper_done', 'keeper_skipped')
     and e.payload->'s1'->'triage' ? 'signal'
),
kept as (  -- decisions the team kept: applied and never undone/rejected
  select d.output_action->>'run_id' as run_id, count(*) as n
    from public.ai_decisions d
   where d.agent_role = 'copilot' and d.status in ('auto_applied', 'executed', 'approved')
   group by 1
)
select would_quiet,
       count(*)                                                         as passes,
       round(100.0 * count(*) / sum(count(*)) over (), 1)               as pct_of_passes,          -- H2 on the true row
       count(*) filter (where k.n > 0)                                  as with_kept_action,
       round(100.0 * count(*) filter (where k.n > 0) / nullif(count(*), 0), 1) as false_quiet_pct, -- H1 on the true row
       count(*) filter (where p.kind = 'keeper_done'
                          and coalesce((p.payload->>'applied')::int, 0) + coalesce((p.payload->>'pending')::int, 0) = 0)
                                                                        as llm_found_nothing
  from p left join kept k using (run_id)
 group by would_quiet order by would_quiet;

\echo '== H1 · the false-quiet passes themselves (read them before flipping) =='
select e.created_at, e.opportunity_id, e.payload->'s1'->'triage'->>'signal' as signal,
       d.output_action->>'label' as kept_action, d.output_action->'action'->>'type' as type
  from public.copilot_run_events e
  join public.ai_decisions d on d.output_action->>'run_id' = e.run_id::text
 where e.kind = 'keeper_done' and (e.payload->'s1'->'triage'->>'would_quiet')::boolean
   and d.agent_role = 'copilot' and d.status in ('auto_applied', 'executed', 'approved')
 order by e.created_at desc limit 30;

\echo '== H3 · verification vs the LLM''s own confidence, by what happened to the action =='
with v as (
  select e.run_id::text as run_id, x.i as idx,
         (e.payload->'s1'->'verify'->'p'->>(x.i - 1))::numeric   as jev_p,
         (e.payload->'s1'->'verify'->'llm'->>(x.i - 1))::numeric as llm_conf,
         e.payload->'s1'->'verify'->'types'->>(x.i - 1)          as type
    from public.copilot_run_events e,
         generate_series(1, jsonb_array_length(coalesce(e.payload->'s1'->'verify'->'p', '[]'::jsonb))) as x(i)
   where e.kind = 'keeper_done'
),
j as (
  select v.*, d.status,
         case when d.status in ('rejected', 'undone') then 'bad'
              when d.status in ('auto_applied', 'executed', 'approved') then 'kept'
              else 'unlabeled' end as label
    from v join public.ai_decisions d
      on d.output_action->>'run_id' = v.run_id and (d.output_action->>'index')::int = v.idx
   where d.agent_role = 'copilot'
)
select label, count(*) as actions,
       round(avg(jev_p), 3) as jev_mean, round(avg(llm_conf), 3) as llm_mean,
       count(*) filter (where jev_p >= 0.75) as jev_would_pass, count(*) filter (where llm_conf >= 0.75) as llm_passed
  from j group by label order by label;

\echo '== H3 · where the gate would move (threshold 0.75) =='
with v as (
  select (e.payload->'s1'->'verify'->'p'->>(x.i - 1))::numeric   as jev_p,
         (e.payload->'s1'->'verify'->'llm'->>(x.i - 1))::numeric as llm_conf,
         e.payload->'s1'->'verify'->'types'->>(x.i - 1)          as type
    from public.copilot_run_events e,
         generate_series(1, jsonb_array_length(coalesce(e.payload->'s1'->'verify'->'p', '[]'::jsonb))) as x(i)
   where e.kind = 'keeper_done'
)
select type,
       count(*)                                                   as actions,
       count(*) filter (where llm_conf < 0.75 and jev_p >= 0.75)  as unlocked_by_jev,
       count(*) filter (where llm_conf >= 0.75 and jev_p < 0.75)  as blocked_by_jev,
       count(*) filter (where jev_p < 0.2)                        as jev_says_unsupported
  from v group by type order by actions desc;

\echo '== H3 · calibration table: Jev probability bucket vs share of bad outcomes =='
with v as (
  select e.run_id::text as run_id, x.i as idx, (e.payload->'s1'->'verify'->'p'->>(x.i - 1))::numeric as jev_p
    from public.copilot_run_events e,
         generate_series(1, jsonb_array_length(coalesce(e.payload->'s1'->'verify'->'p', '[]'::jsonb))) as x(i)
   where e.kind = 'keeper_done'
)
select width_bucket(v.jev_p, 0, 1.0000001, 5) as bucket, min(v.jev_p) as p_min, max(v.jev_p) as p_max, count(*) as labeled,
       round(100.0 * count(*) filter (where d.status in ('rejected', 'undone')) / count(*), 1) as bad_pct
  from v join public.ai_decisions d
    on d.output_action->>'run_id' = v.run_id and (d.output_action->>'index')::int = v.idx
 where d.agent_role = 'copilot' and d.status in ('rejected', 'undone', 'auto_applied', 'executed', 'approved')
 group by 1 order by 1;

\echo '== H5 · triage stage vs the stage the LLM moved to =='
select count(*)                                                                           as llm_moves,
       count(*) filter (where d.output_action->'action'->>'stage_id' = e.payload->'s1'->'triage'->>'stage_id') as agree,
       round(100.0 * count(*) filter (where d.output_action->'action'->>'stage_id' = e.payload->'s1'->'triage'->>'stage_id')
             / nullif(count(*), 0), 1)                                                     as agree_pct,
       round(avg((e.payload->'s1'->'triage'->>'stage_confidence')::numeric), 3)            as triage_conf_mean
  from public.copilot_run_events e
  join public.ai_decisions d on d.output_action->>'run_id' = e.run_id::text
 where e.kind = 'keeper_done' and d.agent_role = 'copilot'
   and d.output_action->'action'->>'type' = 'move_stage'
   and e.payload->'s1'->'triage' ? 'stage_id';
