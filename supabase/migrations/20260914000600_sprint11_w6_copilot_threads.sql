-- Sprint 11 · Onda 6 · T63 — as conversas do chat do Copilot.
--
-- Uma conversa (`copilot_threads`) por usuário, com as mensagens
-- (`copilot_messages`: pergunta, resposta, as consultas que a resposta usou e o
-- tempo de cada etapa). Quem escreve é o agente (a pergunta e a resposta passam
-- por ele); quem lê é o dono da conversa — nem o colega da equipe vê.
-- O dono apaga a própria conversa (e as mensagens vão junto).

create table if not exists public.copilot_threads (
  id         uuid primary key default gen_random_uuid(),
  equipe_id  uuid not null references public.equipes(id) on delete cascade,
  user_id    uuid not null,
  title      text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_copilot_threads_user on public.copilot_threads (user_id, updated_at desc);

create table if not exists public.copilot_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.copilot_threads(id) on delete cascade,
  equipe_id  uuid not null references public.equipes(id) on delete cascade,
  user_id    uuid not null,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  -- [{name, args, label, ok}] — as consultas que a resposta usou
  tools      jsonb not null default '[]'::jsonb,
  -- {planner_ms, tools_ms, answer_ms, total_ms, model}
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_copilot_messages_thread on public.copilot_messages (thread_id, created_at);

alter table public.copilot_threads enable row level security;
alter table public.copilot_messages enable row level security;

drop policy if exists copilot_threads_owner_read on public.copilot_threads;
create policy copilot_threads_owner_read on public.copilot_threads for select to authenticated
  using (user_id = auth.uid());
drop policy if exists copilot_threads_owner_delete on public.copilot_threads;
create policy copilot_threads_owner_delete on public.copilot_threads for delete to authenticated
  using (user_id = auth.uid());
drop policy if exists copilot_messages_owner_read on public.copilot_messages;
create policy copilot_messages_owner_read on public.copilot_messages for select to authenticated
  using (user_id = auth.uid());

grant select, delete on public.copilot_threads to authenticated;
grant select on public.copilot_messages to authenticated;
