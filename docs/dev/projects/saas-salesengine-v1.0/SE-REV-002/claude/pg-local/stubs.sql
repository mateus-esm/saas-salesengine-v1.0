-- SE-REV-002 — esquema mínimo para rodar os testes SQL num PostgreSQL 15 LOCAL
-- e efêmero. NÃO é o esquema de produção: são as colunas que as migrations do
-- repo declaram e que as migrations da SE-REV-001/002 leem. Serve para provar a
-- lógica (gatilhos, claim, idempotência), não que a migration aplica em
-- produção — isso é o `scripts/sqltest.sh` (NÃO EXECUTADO aqui).

create extension if not exists pgcrypto;

do $$ begin
  create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin
  create role anon; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Vault e pg_net: stubs. `net.http_post` só registra a chamada.
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
create schema if not exists net;
create table if not exists net._calls (id bigserial primary key, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
                                         headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into net._calls (url, body, headers) values (url, body, headers) returning id into v_id;
  return v_id;
end $$;

-- Cópia literal de 20260517182736_sprint55_epic1_phone_dedup.sql (existe em produção).
CREATE OR REPLACE FUNCTION public.normalize_phone_br(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  d := regexp_replace(raw, '\D', '', 'g');
  IF d = '' THEN
    RETURN NULL;
  END IF;
  -- Strip leading zeros
  d := regexp_replace(d, '^0+', '');
  IF length(d) < 8 THEN
    RETURN NULL;
  END IF;
  -- Strip leading 55 country code only when length suggests one is present.
  IF length(d) >= 12 AND left(d, 2) = '55' THEN
    d := substring(d FROM 3);
  END IF;
  -- 10-digit DDD+8 → insert mobile-9
  IF length(d) = 10 THEN
    d := left(d, 2) || '9' || substring(d FROM 3);
  END IF;
  -- 11-digit DDD+9 mobile → prepend country code
  IF length(d) = 11 THEN
    RETURN '55' || d;
  END IF;
  RETURN d;
END;
$$;

create or replace function public.update_updated_at_column() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  nome text, crm_link text, suporte_link text,
  webhook_secret text, workspace_id text, gpt_maker_agent_id text
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  equipe_id uuid references public.equipes(id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id),
  name text, phone text, source text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id),
  name text
);

create table public.pipeline_stages_v2 (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id),
  pipeline_id uuid not null references public.pipelines(id),
  name text, position int not null default 0,
  stage_type text not null default 'open',
  deleted_at timestamptz
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id),
  lead_id uuid not null references public.leads(id),
  pipeline_id uuid not null references public.pipelines(id),
  stage_id uuid not null references public.pipeline_stages_v2(id),
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  stage_entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.opportunity_stage_history (
  id bigserial primary key,
  equipe_id uuid not null,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages_v2(id) on delete set null,
  to_stage_id uuid not null references public.pipeline_stages_v2(id),
  changed_by uuid,
  changed_by_type text not null default 'team',
  changed_at timestamptz not null default now()
);

-- Igual ao gatilho de produção (20260912000700): BEFORE UPDATE grava o histórico.
create or replace function public.log_opportunity_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage_id is distinct from old.stage_id then
    insert into public.opportunity_stage_history (equipe_id, opportunity_id, from_stage_id, to_stage_id, changed_by)
    values (new.equipe_id, new.id, old.stage_id, new.stage_id, auth.uid());
    new.stage_entered_at := now();
  end if;
  return new;
end $$;
create trigger trg_opportunity_stage_change before update on public.opportunities
  for each row execute function public.log_opportunity_stage_change();

create table public.wpp_instances (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id),
  instance_name text not null unique,
  display_name text not null default 'x',
  status text not null default 'awaiting_qr',
  ingest_inbound boolean not null default true
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id),
  equipe_id uuid references public.equipes(id),
  channel text, status text default 'active',
  gpt_maker_chat_id text,
  solo_instance_id uuid references public.wpp_instances(id) on delete set null,
  last_message_at timestamptz
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id),
  conversation_id uuid references public.conversations(id),
  content text,
  sender_type text check (sender_type in ('customer', 'agent', 'member', 'system')),
  sender_id uuid,
  provider text, provider_message_id text,
  created_at timestamptz not null default now()
);

create table public.webhook_configs (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid references public.equipes(id),
  name text
);

create table public.crm_entries (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  kind text not null check (kind in ('webhook', 'whatsapp', 'agent', 'manual', 'import')),
  name text not null,
  webhook_config_id uuid unique references public.webhook_configs(id) on delete set null,
  active boolean not null default true
);

create table public.lead_touches (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  entry_id uuid references public.crm_entries(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  raw jsonb,
  created_at timestamptz not null default now()
);
