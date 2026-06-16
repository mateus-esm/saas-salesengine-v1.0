-- 20260614000300_sprint6_1_run_events.sql
-- Copilot run-event stream: powers the live Telemetry HUD (SSE for a single sync,
-- Supabase Realtime for the global sweep). One row per cognition step.

create table if not exists public.copilot_run_events (
  id             uuid primary key default gen_random_uuid(),
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  run_id         text not null,
  opportunity_id uuid,
  seq            integer not null,
  kind           text not null,         -- action_start | action_done | awaiting_confirmation | halted | sweep_progress | done
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_run_events_run on public.copilot_run_events (equipe_id, run_id, seq);

alter table public.copilot_run_events enable row level security;
create policy run_events_tenant on public.copilot_run_events
  for select using (equipe_id in (select equipe_id from public.profiles where id = auth.uid()));

-- Realtime: stream inserts to subscribed clients. Wrapped in a guard so the
-- migration is idempotent across `supabase db reset` runs (add table only once).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'copilot_run_events'
  ) then
    alter publication supabase_realtime add table public.copilot_run_events;
  end if;
end $$;
