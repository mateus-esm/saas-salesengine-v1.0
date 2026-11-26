-- ============================================================================
-- Sprint 17 · Fase 4 — API de Conversões do Meta (CAPI para CRM), infra pronta
--
-- etapa do funil → evento (crm_conversion_mappings, TUDO desligado por padrão)
-- → quando o negócio entra numa etapa mapeada e ativa, e a CAPI da equipe está
-- ligada, o evento entra na fila (crm_conversion_events, event_id estável =
-- deduplicação no Meta) → o meta-worker envia para POST /{dataset}/events.
-- A fila guarda só o que foi enviado (IDs e hashes). Registro por lead (LGPD).
-- Sem begin/commit próprios.
-- ============================================================================

create table if not exists public.crm_conversion_mappings (
  id          uuid primary key default gen_random_uuid(),
  equipe_id   uuid not null references public.equipes(id) on delete cascade,
  provider    text not null default 'meta' check (provider in ('meta')),
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  stage_id    uuid not null references public.pipeline_stages_v2(id) on delete cascade,
  event_name  text not null check (event_name ~ '^[A-Za-z0-9_]{1,50}$'),
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (equipe_id, provider, stage_id)
);
alter table public.crm_conversion_mappings enable row level security;

create table if not exists public.crm_conversion_events (
  id              uuid primary key default gen_random_uuid(),
  equipe_id       uuid not null references public.equipes(id) on delete cascade,
  provider        text not null default 'meta' check (provider in ('meta')),
  lead_id         uuid references public.leads(id) on delete set null,
  opportunity_id  uuid references public.opportunities(id) on delete set null,
  stage_id        uuid references public.pipeline_stages_v2(id) on delete set null,
  event_name      text not null,
  event_id        text not null unique,
  event_time      timestamptz not null default now(),
  match_key       text check (match_key is null or match_key in ('lead_id', 'fbc', 'hashed_pii', 'ctwa')),
  payload         jsonb,
  status          text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'error', 'skipped', 'dead')),
  skip_reason     text check (skip_reason is null or skip_reason in ('no_match_key', 'too_old', 'capi_off', 'whatsapp_requires_waba', 'no_dataset')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  response        jsonb,
  test_event_code text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index if not exists idx_crm_conv_pending on public.crm_conversion_events (next_attempt_at) where status in ('queued', 'error', 'processing');
create index if not exists idx_crm_conv_lead on public.crm_conversion_events (lead_id, created_at desc);
create index if not exists idx_crm_conv_team on public.crm_conversion_events (equipe_id, created_at desc);
alter table public.crm_conversion_events enable row level security;

-- Salvar mapeamento (edge, admin): etapa precisa ser da equipe. p_active null = mantém.
create or replace function public._crm_capi_save_mapping(p_equipe uuid, p_stage uuid, p_event_name text, p_active boolean default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_pipe uuid; v_id uuid;
begin
  select s.pipeline_id into v_pipe from public.pipeline_stages_v2 s
   where s.id = p_stage and s.equipe_id = p_equipe and s.deleted_at is null;
  if not found then raise exception 'stage_not_found' using errcode = 'P0002'; end if;
  if coalesce(p_event_name, '') !~ '^[A-Za-z0-9_]{1,50}$' then
    raise exception 'invalid_event_name' using errcode = '22023', hint = 'Use letras, números e _ (até 50).';
  end if;
  insert into public.crm_conversion_mappings (equipe_id, provider, pipeline_id, stage_id, event_name, active)
  values (p_equipe, 'meta', v_pipe, p_stage, p_event_name, coalesce(p_active, false))
  on conflict (equipe_id, provider, stage_id) do update
     set event_name = excluded.event_name,
         active = coalesce(p_active, crm_conversion_mappings.active),
         updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Gatilho: entrou numa etapa mapeada + ativa, com a CAPI da equipe ligada → fila.
-- Nunca derruba a mudança de etapa: qualquer erro vira aviso.
create or replace function public._crm_capi_on_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map  public.crm_conversion_mappings;
  v_lead uuid;
begin
  begin
    select m.* into v_map from public.crm_conversion_mappings m
     where m.equipe_id = new.equipe_id and m.provider = 'meta' and m.stage_id = new.to_stage_id and m.active;
    if v_map.id is null then return new; end if;
    if not exists (select 1 from public.crm_integrations i
                    where i.equipe_id = new.equipe_id and i.provider = 'meta' and i.status <> 'disconnected'
                      and coalesce((i.settings->>'capi_enabled')::boolean, false)) then
      return new;
    end if;
    select o.lead_id into v_lead from public.opportunities o where o.id = new.opportunity_id;
    insert into public.crm_conversion_events (equipe_id, provider, lead_id, opportunity_id, stage_id, event_name, event_id, event_time)
    values (new.equipe_id, 'meta', v_lead, new.opportunity_id, new.to_stage_id, v_map.event_name,
            encode(extensions.digest(new.equipe_id::text || ':' || new.opportunity_id::text || ':' || new.to_stage_id::text
                                     || ':' || v_map.event_name, 'sha256'), 'hex'),
            coalesce(new.changed_at, now()))
    on conflict (event_id) do nothing;
  exception when others then
    raise warning 'capi on stage: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_stage_history_capi on public.opportunity_stage_history;
create trigger trg_stage_history_capi after insert on public.opportunity_stage_history
  for each row execute function public._crm_capi_on_stage();

create or replace function public._crm_capi_claim(p_limit integer default 200)
returns setof public.crm_conversion_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with c as (
    select e.id from public.crm_conversion_events e
      join public.crm_integrations i on i.equipe_id = e.equipe_id and i.provider = e.provider
     where i.status = 'connected'
       and e.test_event_code is null
       and ((e.status in ('queued', 'error') and e.next_attempt_at <= now())
            or (e.status = 'processing' and e.next_attempt_at < now() - interval '10 minutes'))
     order by e.event_time
     limit greatest(1, least(coalesce(p_limit, 200), 1000))
     for update of e skip locked
  )
  update public.crm_conversion_events e
     set status = 'processing', attempts = e.attempts + 1, next_attempt_at = now()
    from c where e.id = c.id
  returning e.*;
end;
$$;

-- sent | skipped (motivo) | error (backoff 2^n min até 6 h; 8 tentativas → dead)
create or replace function public._crm_capi_finish(
  p_id uuid, p_status text, p_match_key text default null, p_payload jsonb default null,
  p_response jsonb default null, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_att integer;
begin
  select attempts into v_att from public.crm_conversion_events where id = p_id;
  if p_status = 'sent' then
    update public.crm_conversion_events
       set status = 'sent', sent_at = now(), match_key = p_match_key, payload = p_payload, response = p_response, last_error = null
     where id = p_id;
  elsif p_status = 'skipped' then
    update public.crm_conversion_events
       set status = 'skipped', skip_reason = p_reason, match_key = coalesce(p_match_key, match_key)
     where id = p_id;
  elsif v_att >= 8 then
    update public.crm_conversion_events set status = 'dead', last_error = left(p_reason, 1000), response = p_response where id = p_id;
  else
    update public.crm_conversion_events
       set status = 'error', last_error = left(p_reason, 1000), response = p_response,
           next_attempt_at = now() + least(power(2, greatest(v_att, 0)) * interval '1 minute', interval '6 hours')
     where id = p_id;
  end if;
end;
$$;

-- Evento de teste (Gerenciador de Eventos › Testar eventos): fica registrado.
create or replace function public._crm_capi_record_test(
  p_equipe uuid, p_event_name text, p_event_id text, p_payload jsonb, p_response jsonb, p_ok boolean, p_test_code text)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.crm_conversion_events (equipe_id, provider, event_name, event_id, payload, response, status,
                                            test_event_code, sent_at, match_key, last_error)
  values (p_equipe, 'meta', p_event_name, p_event_id, p_payload, p_response,
          case when p_ok then 'sent' else 'error' end, left(p_test_code, 60),
          case when p_ok then now() end, 'hashed_pii',
          case when not p_ok then left(p_response->>'error', 1000) end)
  returning id;
$$;

-- Registro por lead (LGPD): o que foi enviado ao Meta sobre este lead.
create or replace function public._crm_lead_conversion_events_for(p_lead uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'event_name', e.event_name, 'event_time', e.event_time, 'status', e.status,
           'skip_reason', e.skip_reason, 'match_key', e.match_key, 'sent_at', e.sent_at,
           'stage_name', (select s.name from public.pipeline_stages_v2 s where s.id = e.stage_id),
           'payload', e.payload, 'last_error', e.last_error)
         order by e.created_at desc), '[]'::jsonb)
    from public.crm_conversion_events e
   where e.lead_id = p_lead and e.test_event_code is null;
$$;

create or replace function public.crm_lead_conversion_events(p_lead uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (select 1 from public.leads l where l.id = p_lead and l.equipe_id = public._crm_my_team())
              then public._crm_lead_conversion_events_for(p_lead) else '[]'::jsonb end;
$$;

-- O despertador também acorda para a fila da CAPI.
create or replace function public._crm_meta_tick()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.crm_integrations where provider = 'meta' and status = 'connected') then
    return null;
  end if;
  if not exists (select 1 from public.crm_inbound_events where status in ('queued', 'error', 'processing') and next_attempt_at <= now())
     and not exists (select 1 from public.crm_conversion_events
                      where status in ('queued', 'error', 'processing') and next_attempt_at <= now() and test_event_code is null) then
    return null;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'meta_worker_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'meta_worker_secret';
  if nullif(btrim(v_url), '') is null or nullif(btrim(v_secret), '') is null then
    raise warning 'meta tick: faltam os segredos meta_worker_url/meta_worker_secret no Vault';
    return null;
  end if;
  return net.http_post(
    url := btrim(v_url),
    body := '{"action": "tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', btrim(v_secret)),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public._crm_capi_save_mapping(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public._crm_capi_on_stage() from public, anon, authenticated;
revoke all on function public._crm_capi_claim(integer) from public, anon, authenticated;
revoke all on function public._crm_capi_finish(uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public._crm_capi_record_test(uuid, text, text, jsonb, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public._crm_lead_conversion_events_for(uuid) from public, anon, authenticated;
revoke all on function public._crm_meta_tick() from public, anon, authenticated;
grant execute on function public._crm_capi_save_mapping(uuid, uuid, text, boolean) to service_role;
grant execute on function public._crm_capi_claim(integer) to service_role;
grant execute on function public._crm_capi_finish(uuid, text, text, jsonb, jsonb, text) to service_role;
grant execute on function public._crm_capi_record_test(uuid, text, text, jsonb, jsonb, boolean, text) to service_role;
grant execute on function public._crm_lead_conversion_events_for(uuid) to service_role;
revoke all on function public.crm_lead_conversion_events(uuid) from public, anon;
grant execute on function public.crm_lead_conversion_events(uuid) to authenticated;
