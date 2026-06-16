-- 20260614000400_sprint6_1_knowledge_pgvector.sql
-- RAG foundation (Sprint 6.1). No conversational agent ships this sprint — this
-- lays the per-tenant knowledge store so 6.2 can bring the customer agent in-house.

create extension if not exists vector;

create table if not exists public.copilot_knowledge (
  id          uuid primary key default gen_random_uuid(),
  equipe_id   uuid not null references public.equipes(id) on delete cascade,
  source      text,                          -- doc title / url / channel
  content     text not null,
  embedding   vector(1536),                  -- text-embedding-3-small
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_knowledge_equipe on public.copilot_knowledge (equipe_id);
-- ANN index for hybrid search (effective once data exists):
create index if not exists idx_knowledge_embedding on public.copilot_knowledge
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.copilot_knowledge enable row level security;
create policy knowledge_tenant on public.copilot_knowledge
  for select using (equipe_id in (select equipe_id from public.profiles where id = auth.uid()));
