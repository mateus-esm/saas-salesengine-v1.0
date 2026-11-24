-- ============================================================================
-- Sprint 17 · Fase 1 — fundação da integração nativa com o Meta (Rev Gateway)
--
-- Conta (crm_integrations, provider 'meta', token system-user no Vault) →
-- ativos (crm_integration_assets: páginas, contas de anúncio, datasets; depois
-- WABA, números, contas IG) → state do OAuth (uso único) → pedidos de exclusão
-- de dados do Meta. Escrita só por verbos security definer chamados pela edge
-- (service role); a tela lê por crm_integration_assets_list (sem secret_id).
-- Spec: docs/superpowers/specs/2026-11-24-sprint17-meta-integration-design.md
-- ============================================================================

-- 1. Provider novo -----------------------------------------------------------
alter table public.crm_integrations drop constraint if exists crm_integrations_provider_check;
alter table public.crm_integrations add constraint crm_integrations_provider_check
  check (provider in ('windsor', 'meta'));

-- 2. Ativos ------------------------------------------------------------------
create or replace function public._crm_asset_types()
returns text[]
language sql
immutable
as $$ select array['page', 'ad_account', 'dataset']; $$;

create table if not exists public.crm_integration_assets (
  id             uuid primary key default gen_random_uuid(),
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  integration_id uuid not null references public.crm_integrations(id) on delete cascade,
  provider       text not null check (provider in ('meta')),
  asset_type     text not null check (asset_type = any (public._crm_asset_types())),
  external_id    text not null check (length(external_id) between 1 and 120),
  name           text check (name is null or length(name) <= 300),
  secret_id      uuid,
  status         text not null default 'available' check (status in ('available', 'active', 'error', 'disconnected')),
  subscribed_at  timestamptz,
  last_event_at  timestamptz,
  last_error     text,
  last_error_at  timestamptz,
  settings       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (integration_id, asset_type, external_id)
);

-- Uma página (ou qualquer ativo) ativa em UMA equipe só: o webhook só sabe o
-- page_id, e é isso que impede um lead de cair na equipe errada.
create unique index if not exists uq_crm_integration_assets_active
  on public.crm_integration_assets (provider, asset_type, external_id) where status = 'active';
create index if not exists idx_crm_integration_assets_team on public.crm_integration_assets (equipe_id, asset_type);

alter table public.crm_integration_assets enable row level security;

-- 3. State do OAuth (uso único, 10 min) -------------------------------------
create table if not exists public.crm_oauth_states (
  id         uuid primary key default gen_random_uuid(),
  provider   text not null,
  equipe_id  uuid not null references public.equipes(id) on delete cascade,
  user_id    uuid not null,
  nonce_hash text not null unique,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.crm_oauth_states enable row level security;

-- 4. Exclusão de dados (callback do Meta) ------------------------------------
create table if not exists public.crm_data_deletion_requests (
  id                    uuid primary key default gen_random_uuid(),
  confirmation_code     text not null unique,
  provider              text not null,
  external_user_id      text not null,
  status                text not null default 'received' check (status in ('received', 'completed')),
  affected_integrations integer not null default 0,
  received_at           timestamptz not null default now(),
  completed_at          timestamptz
);
alter table public.crm_data_deletion_requests enable row level security;

-- 5. Verbos ------------------------------------------------------------------
create or replace function public._crm_oauth_create(p_provider text, p_equipe uuid, p_user uuid, p_nonce_hash text)
returns uuid
language sql
security definer
set search_path = public
as $$
  delete from public.crm_oauth_states where expires_at < now() - interval '1 day';
  insert into public.crm_oauth_states (provider, equipe_id, user_id, nonce_hash)
  values (p_provider, p_equipe, p_user, p_nonce_hash)
  returning id;
$$;

create or replace function public._crm_oauth_consume(p_provider text, p_nonce_hash text, p_equipe uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  update public.crm_oauth_states
     set used_at = now()
   where nonce_hash = p_nonce_hash and provider = p_provider
     and equipe_id = p_equipe and user_id = p_user
     and used_at is null and expires_at > now()
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- O que o cliente compartilhou no diálogo. Novo → available; ativo continua
-- ativo; o que não veio mais → disconnected (e perde o token).
create or replace function public._crm_meta_assets_sync(p_integration uuid, p_assets jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_int public.crm_integrations; v_gone record;
begin
  select * into v_int from public.crm_integrations where id = p_integration;
  if v_int.id is null then raise exception 'integration_not_found' using errcode = '22023'; end if;

  insert into public.crm_integration_assets (equipe_id, integration_id, provider, asset_type, external_id, name)
  select v_int.equipe_id, v_int.id, v_int.provider, a->>'asset_type', a->>'external_id', left(a->>'name', 300)
    from jsonb_array_elements(coalesce(p_assets, '[]'::jsonb)) a
   where a->>'asset_type' = any (public._crm_asset_types()) and nullif(a->>'external_id', '') is not null
  on conflict (integration_id, asset_type, external_id) do update
     set name = coalesce(excluded.name, crm_integration_assets.name),
         status = case when crm_integration_assets.status = 'disconnected' then 'available' else crm_integration_assets.status end,
         updated_at = now();

  for v_gone in
    select s.id, s.secret_id from public.crm_integration_assets s
     where s.integration_id = p_integration and s.status <> 'disconnected'
       and not exists (select 1 from jsonb_array_elements(coalesce(p_assets, '[]'::jsonb)) a
                        where a->>'asset_type' = s.asset_type and a->>'external_id' = s.external_id)
  loop
    if v_gone.secret_id is not null then delete from vault.secrets where id = v_gone.secret_id; end if;
    update public.crm_integration_assets set status = 'disconnected', secret_id = null, updated_at = now() where id = v_gone.id;
  end loop;
end;
$$;

create or replace function public._crm_asset_store_secret(p_asset uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_secret uuid; v_name text := 'meta_asset:' || p_asset::text;
begin
  if nullif(btrim(p_token), '') is null then raise exception 'invalid_key' using errcode = '22023'; end if;
  select secret_id into v_secret from public.crm_integration_assets where id = p_asset for update;
  if v_secret is not null and exists (select 1 from vault.secrets s where s.id = v_secret) then
    perform vault.update_secret(v_secret, btrim(p_token));
  else
    delete from vault.secrets where name = v_name;
    v_secret := vault.create_secret(btrim(p_token), v_name, 'Rev · token de ativo por equipe');
  end if;
  update public.crm_integration_assets set secret_id = v_secret, updated_at = now() where id = p_asset;
end;
$$;

create or replace function public._crm_asset_secret(p_asset uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.decrypted_secret
    from public.crm_integration_assets a
    join vault.decrypted_secrets s on s.id = a.secret_id
   where a.id = p_asset and a.status <> 'disconnected';
$$;

create or replace function public._crm_asset_set_status(p_asset uuid, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.crm_integration_assets
     set status = p_status,
         subscribed_at = case when p_status = 'active' then now() when p_status = 'available' then null else subscribed_at end,
         last_error = case when p_error is null and p_status = 'active' then null else coalesce(left(p_error, 1000), last_error) end,
         last_error_at = case when p_error is not null then now() else last_error_at end,
         updated_at = now()
   where id = p_asset;
exception when unique_violation then
  raise exception 'asset_active_elsewhere' using errcode = '23505',
    hint = 'Este ativo já está ativo em outra equipe do Rev.';
end;
$$;

-- Desconectar: apaga o token da conta E os dos ativos.
create or replace function public._crm_integration_disconnect(p_equipe_id uuid, p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_int public.crm_integrations;
begin
  select * into v_int from public.crm_integrations where equipe_id = p_equipe_id and provider = p_provider;
  if v_int.id is null then return; end if;
  if v_int.secret_id is not null then delete from vault.secrets where id = v_int.secret_id; end if;
  delete from vault.secrets where id in (select secret_id from public.crm_integration_assets
                                          where integration_id = v_int.id and secret_id is not null);
  update public.crm_integration_assets
     set status = 'disconnected', secret_id = null, subscribed_at = null, updated_at = now()
   where integration_id = v_int.id;
  update public.crm_integrations
     set status = 'disconnected', secret_id = null, key_last4 = null, updated_at = now()
   where id = v_int.id;
end;
$$;

create or replace function public._crm_integration_assets_for(p_equipe uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(a) - 'secret_id' order by a.asset_type, a.name), '[]'::jsonb)
    from public.crm_integration_assets a
   where a.equipe_id = p_equipe and a.status <> 'disconnected';
$$;

create or replace function public.crm_integration_assets_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$ select public._crm_integration_assets_for(public._crm_my_team()); $$;

-- Exclusão de dados pedida pelo Meta (usuário removeu o app): desconecta as
-- integrações que aquela pessoa conectou. Os leads são do cliente (controlador).
create or replace function public._crm_meta_deletion(p_fb_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := encode(extensions.gen_random_bytes(12), 'hex');
  v_n    integer := 0;
  v_row  record;
begin
  for v_row in
    select equipe_id from public.crm_integrations
     where provider = 'meta' and settings->>'fb_user_id' = p_fb_user_id and status <> 'disconnected'
  loop
    perform public._crm_integration_disconnect(v_row.equipe_id, 'meta');
    v_n := v_n + 1;
  end loop;
  insert into public.crm_data_deletion_requests (confirmation_code, provider, external_user_id, status, affected_integrations, completed_at)
  values (v_code, 'meta', p_fb_user_id, 'completed', v_n, now());
  return jsonb_build_object('confirmation_code', v_code, 'affected', v_n);
end;
$$;

create or replace function public.crm_data_deletion_status(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('status', status, 'received_at', received_at, 'completed_at', completed_at)
    from public.crm_data_deletion_requests where confirmation_code = p_code;
$$;

-- 6. Grants ------------------------------------------------------------------
revoke all on function public._crm_oauth_create(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public._crm_oauth_consume(text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public._crm_meta_assets_sync(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._crm_asset_store_secret(uuid, text) from public, anon, authenticated;
revoke all on function public._crm_asset_secret(uuid) from public, anon, authenticated;
revoke all on function public._crm_asset_set_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public._crm_integration_disconnect(uuid, text) from public, anon, authenticated;
revoke all on function public._crm_integration_assets_for(uuid) from public, anon, authenticated;
revoke all on function public._crm_meta_deletion(text) from public, anon, authenticated;
grant execute on function public._crm_oauth_create(text, uuid, uuid, text) to service_role;
grant execute on function public._crm_oauth_consume(text, text, uuid, uuid) to service_role;
grant execute on function public._crm_meta_assets_sync(uuid, jsonb) to service_role;
grant execute on function public._crm_asset_store_secret(uuid, text) to service_role;
grant execute on function public._crm_asset_secret(uuid) to service_role;
grant execute on function public._crm_asset_set_status(uuid, text, text) to service_role;
grant execute on function public._crm_integration_disconnect(uuid, text) to service_role;
grant execute on function public._crm_integration_assets_for(uuid) to service_role;
grant execute on function public._crm_meta_deletion(text) to service_role;
revoke all on function public.crm_integration_assets_list() from public, anon;
grant execute on function public.crm_integration_assets_list() to authenticated;
grant execute on function public.crm_data_deletion_status(text) to anon, authenticated;
