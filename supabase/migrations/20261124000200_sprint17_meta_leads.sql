-- ============================================================================
-- Sprint 17 · Fases 2–3 — leads dos formulários do Meta direto no Rev
--
-- webhook (só IDs) → crm_inbound_events (fila genérica, idempotente por
-- equipe + leadgen_id) → worker busca o lead na Graph API → caminho de entrada
-- de sempre (lead por telefone/e-mail, negócio, toque com crm_record_touch).
--
-- Também: leadgen_id no toque (chave da CAPI), uma entrada por formulário
-- (crm_entries.kind 'meta_form'), anúncio criado pelo lead (crm_ads.source
-- 'meta') e o despertador do worker (pg_cron, URL/segredo no Vault).
-- Sem begin/commit próprios.
-- Spec: docs/superpowers/specs/2026-11-24-sprint17-meta-integration-design.md
-- ============================================================================

-- 1. Fila de entrada ---------------------------------------------------------
create table if not exists public.crm_inbound_events (
  id              uuid primary key default gen_random_uuid(),
  equipe_id       uuid not null references public.equipes(id) on delete cascade,
  provider        text not null check (provider in ('meta')),
  kind            text not null check (kind in ('leadgen')),
  external_id     text not null check (length(external_id) between 1 and 120),
  asset_id        uuid references public.crm_integration_assets(id) on delete set null,
  payload         jsonb not null default '{}'::jsonb,
  origin          text not null default 'webhook' check (origin in ('webhook', 'backfill')),
  status          text not null default 'queued' check (status in ('queued', 'processing', 'done', 'error', 'dead')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  lead_id         uuid references public.leads(id) on delete set null,
  opportunity_id  uuid references public.opportunities(id) on delete set null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  claimed_at      timestamptz,
  unique (equipe_id, provider, kind, external_id)
);
create index if not exists idx_crm_inbound_pending on public.crm_inbound_events (next_attempt_at)
  where status in ('queued', 'error', 'processing');
create index if not exists idx_crm_inbound_team on public.crm_inbound_events (equipe_id, received_at desc);
alter table public.crm_inbound_events enable row level security;

-- O webhook só sabe o page_id: a equipe é a da página ATIVA (única no Rev).
-- Página desconhecida ou inativa → não grava nada (não guardamos dado de quem não é cliente).
create or replace function public._crm_meta_enqueue_leadgen(p_page_id text, p_value jsonb, p_origin text default 'webhook')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset public.crm_integration_assets;
  v_id    uuid;
  v_lg    text := nullif(btrim(coalesce(p_value->>'leadgen_id', p_value->>'id', '')), '');
begin
  if v_lg is null or v_lg !~ '^[0-9]{1,40}$' then return null; end if;
  select * into v_asset from public.crm_integration_assets
   where provider = 'meta' and asset_type = 'page' and external_id = p_page_id and status = 'active';
  if v_asset.id is null then return null; end if;

  insert into public.crm_inbound_events (equipe_id, provider, kind, external_id, asset_id, payload, origin)
  values (v_asset.equipe_id, 'meta', 'leadgen', v_lg, v_asset.id,
          jsonb_strip_nulls(jsonb_build_object(
            'leadgen_id', v_lg,
            'page_id', p_page_id,
            'form_id', p_value->>'form_id',
            'ad_id', p_value->>'ad_id',
            'adgroup_id', p_value->>'adgroup_id',
            'created_time', p_value->'created_time')),
          case when p_origin = 'backfill' then 'backfill' else 'webhook' end)
  on conflict (equipe_id, provider, kind, external_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Pega até p_limit eventos prontos (ou os p_ids, se vierem). Processamento
-- preso há 10 min volta. Equipe com token inválido (integração 'error') espera.
create or replace function public._crm_inbound_claim(p_limit integer default 20, p_ids uuid[] default null)
returns setof public.crm_inbound_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with c as (
    select e.id from public.crm_inbound_events e
      join public.crm_integrations i on i.equipe_id = e.equipe_id and i.provider = e.provider
     where (p_ids is null or e.id = any (p_ids))
       and i.status = 'connected'
       and ((e.status in ('queued', 'error') and e.next_attempt_at <= now())
            or (e.status = 'processing' and e.claimed_at < now() - interval '10 minutes'))
     order by e.next_attempt_at
     limit greatest(1, least(coalesce(p_limit, 20), 200))
     for update of e skip locked
  )
  update public.crm_inbound_events e
     set status = 'processing', attempts = e.attempts + 1, claimed_at = now()
    from c where e.id = c.id
  returning e.*;
end;
$$;

-- done | error (backoff; 8 tentativas → dead) | hold (token: não queima tentativa) | dead
create or replace function public._crm_inbound_finish(
  p_id uuid, p_status text, p_error text default null, p_lead uuid default null,
  p_opportunity uuid default null, p_retry_ms bigint default 60000)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ev public.crm_inbound_events;
begin
  select * into v_ev from public.crm_inbound_events where id = p_id for update;
  if v_ev.id is null then return; end if;
  if p_status = 'done' then
    update public.crm_inbound_events
       set status = 'done', processed_at = now(), last_error = null,
           lead_id = coalesce(p_lead, lead_id), opportunity_id = coalesce(p_opportunity, opportunity_id)
     where id = p_id;
    update public.crm_integration_assets set last_event_at = now(), updated_at = now() where id = v_ev.asset_id;
  elsif p_status = 'hold' then
    update public.crm_inbound_events
       set status = 'queued', attempts = greatest(0, attempts - 1), last_error = left(p_error, 1000),
           next_attempt_at = now() + make_interval(secs => greatest(60, coalesce(p_retry_ms, 3600000) / 1000.0))
     where id = p_id;
  elsif p_status = 'dead' or (p_status = 'error' and v_ev.attempts >= 8) then
    update public.crm_inbound_events set status = 'dead', last_error = left(p_error, 1000), processed_at = now() where id = p_id;
    update public.crm_integration_assets set last_error = left(p_error, 1000), last_error_at = now(), updated_at = now()
     where id = v_ev.asset_id;
  else
    update public.crm_inbound_events
       set status = 'error', last_error = left(p_error, 1000),
           next_attempt_at = now() + make_interval(secs => greatest(30, coalesce(p_retry_ms, 60000) / 1000.0))
     where id = p_id;
  end if;
end;
$$;

-- Tentar de novo o que morreu (botão na tela).
create or replace function public._crm_inbound_retry(p_equipe uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update public.crm_inbound_events set status = 'queued', attempts = 0, next_attempt_at = now()
   where equipe_id = p_equipe and status in ('dead', 'error');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- 2. leadgen_id no toque -----------------------------------------------------
alter table public.lead_touches add column if not exists leadgen_id text;
create index if not exists idx_lead_touches_leadgen on public.lead_touches (equipe_id, leadgen_id) where leadgen_id is not null;

create or replace function public._crm_touch_fields(p_payload jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  p     jsonb := case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end;
  u     jsonb := case when jsonb_typeof(p_payload->'utm') = 'object' then p_payload->'utm' else '{}'::jsonb end;
  v_page text;
  v_ref  text;
  f     jsonb;
  k     text;
begin
  v_page := public._crm_first_text(p, array['landing_page', 'landingPage', 'page_url', 'pageUrl', 'url', 'page', 'source_url', 'sourceUrl']);
  v_ref  := public._crm_first_text(p, array['referrer', 'referer', 'document_referrer', 'documentReferrer']);

  f := jsonb_build_object(
    'utm_source',   coalesce(public._crm_first_text(p, array['utm_source', 'utmSource']), public._crm_first_text(u, array['source', 'utm_source'])),
    'utm_medium',   coalesce(public._crm_first_text(p, array['utm_medium', 'utmMedium']), public._crm_first_text(u, array['medium', 'utm_medium'])),
    'utm_campaign', coalesce(public._crm_first_text(p, array['utm_campaign', 'utmCampaign']), public._crm_first_text(u, array['campaign', 'utm_campaign'])),
    'utm_content',  coalesce(public._crm_first_text(p, array['utm_content', 'utmContent']), public._crm_first_text(u, array['content', 'utm_content'])),
    'utm_term',     coalesce(public._crm_first_text(p, array['utm_term', 'utmTerm']), public._crm_first_text(u, array['term', 'utm_term'])),
    'fbclid',       public._crm_first_text(p, array['fbclid']),
    'gclid',        public._crm_first_text(p, array['gclid', 'gbraid', 'wbraid']),
    'ctwa_clid',    public._crm_first_text(p, array['ctwa_clid', 'ctwaClid']),
    'campaign_ref', public._crm_first_text(p, array['campaign_id', 'campaignId', 'utm_id', 'utmId']),
    'campaign_name', public._crm_first_text(p, array['campaign_name', 'campaignName', 'campaign']),
    'adset_id',     public._crm_first_text(p, array['adset_id', 'adsetId', 'ad_group_id', 'adGroupId']),
    'adset_name',   public._crm_first_text(p, array['adset_name', 'adsetName', 'ad_group_name', 'adGroupName']),
    'ad_id',        public._crm_first_text(p, array['ad_id', 'adId']),
    'ad_name',      public._crm_first_text(p, array['ad_name', 'adName']),
    'form_id',      public._crm_first_text(p, array['form_id', 'formId']),
    'form_name',    public._crm_first_text(p, array['form_name', 'formName', 'form']),
    'leadgen_id',   public._crm_first_text(p, array['leadgen_id', 'leadgenId']),
    'landing_page', v_page,
    'referrer',     v_ref);

  -- A página (e, se não houver, o referrer) completa o que o corpo não trouxe.
  foreach k in array array['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'utm_id'] loop
    if k = 'utm_id' then
      if f->>'campaign_ref' is null then
        f := f || jsonb_build_object('campaign_ref', coalesce(public._crm_query_param(v_page, 'utm_id'), public._crm_query_param(v_ref, 'utm_id')));
      end if;
    elsif f->>k is null then
      f := f || jsonb_build_object(k, coalesce(public._crm_query_param(v_page, k), public._crm_query_param(v_ref, k)));
    end if;
  end loop;

  return jsonb_strip_nulls(f);
end;
$$;

create or replace function public.crm_record_touch(p_lead_id uuid, p_entry_id uuid default null, p_payload jsonb default '{}'::jsonb,
                                                   p_opportunity_id uuid default null, p_occurred_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead     public.leads;
  v_entry    public.crm_entries;
  v_ad       public.crm_ads;
  v_fields   jsonb;
  v_platform text;
  v_category text;
  v_campaign uuid;
  v_creative uuid;
  v_ad_id    uuid;
  v_touch    uuid;
  v_first    boolean;
  v_owner    uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') = 'authenticated'
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.equipe_id = v_lead.equipe_id) then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  if p_entry_id is null then
    p_entry_id := public._crm_entry_for(v_lead.equipe_id,
                    case when p_payload->>'_entry_kind' = 'import' then 'import' else 'manual' end);
  end if;
  select * into v_entry from public.crm_entries where id = p_entry_id and equipe_id = v_lead.equipe_id;
  if not found then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;

  if p_opportunity_id is not null
     and not exists (select 1 from public.opportunities o where o.id = p_opportunity_id and o.lead_id = v_lead.id) then
    p_opportunity_id := null;
  end if;

  v_fields   := public._crm_touch_fields(p_payload);
  v_platform := public._crm_platform_from(v_fields, v_entry.platform);
  v_category := public._crm_category_from(v_fields, v_platform, v_entry.origin_category);

  -- Sprint 16: o anúncio primeiro; ele traz a campanha, o criativo e a prova de mídia paga.
  v_ad_id := public._crm_resolve_ad(v_lead.equipe_id, v_fields,
                                    case when jsonb_typeof(p_payload->'_first_text') = 'string'
                                         then left(p_payload->>'_first_text', 300) end);
  if v_ad_id is not null then
    select * into v_ad from public.crm_ads where id = v_ad_id;
    v_platform := v_ad.platform;
    v_category := case when v_ad.platform = 'google' then 'paid_search' else 'paid_social' end;
  end if;
  v_creative := public._crm_resolve_creative(v_lead.equipe_id, v_fields, v_ad.creative_id);
  v_campaign := coalesce(v_ad.campaign_id, public._crm_resolve_campaign(v_lead.equipe_id, v_fields, v_entry.campaign_id));

  if coalesce(auth.role(), '') = 'authenticated' then
    if p_payload->>'_origin_category' = any (public._crm_origin_categories()) then
      v_category := p_payload->>'_origin_category';
    end if;
    if p_payload->>'_platform' = any (public._crm_platforms()) then
      v_platform := p_payload->>'_platform';
    end if;
    -- Sprint 16: quem indicou, só pela tela e só da mesma equipe.
    if p_payload->>'_referred_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (p_payload->>'_referred_by')::uuid <> v_lead.id
       and exists (select 1 from public.leads r where r.id = (p_payload->>'_referred_by')::uuid
                    and r.equipe_id = v_lead.equipe_id and r.deleted_at is null) then
      update public.leads set referred_by_lead_id = (p_payload->>'_referred_by')::uuid
       where id = v_lead.id and referred_by_lead_id is null;
    end if;
  end if;

  insert into public.lead_touches (
    equipe_id, lead_id, opportunity_id, entry_id, occurred_at, origin_category, platform, campaign_id,
    crm_ad_id, creative_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, ctwa_clid,
    campaign_ref, campaign_name, adset_id, adset_name, ad_id, ad_name, form_id, form_name, leadgen_id,
    landing_page, referrer, raw)
  values (
    v_lead.equipe_id, v_lead.id, p_opportunity_id, v_entry.id, coalesce(p_occurred_at, clock_timestamp()),
    v_category, v_platform, v_campaign,
    v_ad_id, v_creative,
    v_fields->>'utm_source', v_fields->>'utm_medium', v_fields->>'utm_campaign', v_fields->>'utm_content',
    v_fields->>'utm_term', v_fields->>'fbclid', v_fields->>'gclid', v_fields->>'ctwa_clid',
    v_fields->>'campaign_ref', v_fields->>'campaign_name', v_fields->>'adset_id', v_fields->>'adset_name',
    v_fields->>'ad_id', v_fields->>'ad_name', v_fields->>'form_id', v_fields->>'form_name', v_fields->>'leadgen_id',
    v_fields->>'landing_page', v_fields->>'referrer', public._crm_touch_raw(p_payload))
  returning id into v_touch;

  v_first := v_lead.first_touch_id is null;
  if v_first then
    update public.leads
       set first_touch_id  = v_touch,
           entry_id        = v_entry.id,
           campaign_id     = v_campaign,
           origin_platform = v_platform,
           origin_category = case when v_ad_id is not null and (v_lead.origin_category is null or v_lead.origin_category = 'api_import')
                                  then v_category
                                  else coalesce(v_lead.origin_category, v_category) end,
           origin_detail   = coalesce(nullif(btrim(v_lead.origin_detail), ''), v_entry.name)
     where id = v_lead.id;
  end if;

  if p_opportunity_id is not null
     and exists (select 1 from public.opportunities o
                  where o.id = p_opportunity_id and o.owner_id is null and o.deleted_at is null) then
    v_owner := public._crm_pick_owner(v_entry.id);
    if v_owner is not null then
      update public.opportunities set owner_id = v_owner where id = p_opportunity_id and owner_id is null;
    end if;
  end if;

  return jsonb_build_object(
    'touch_id', v_touch,
    'first', v_first,
    'entry_id', v_entry.id,
    'origin_category', v_category,
    'platform', v_platform,
    'campaign_id', v_campaign,
    'ad_ref', v_ad_id,
    'creative_id', v_creative,
    'owner_id', v_owner);
end;
$$;

-- 3. Uma entrada por formulário ---------------------------------------------
alter table public.crm_entries drop constraint if exists crm_entries_kind_check;
alter table public.crm_entries add constraint crm_entries_kind_check
  check (kind in ('webhook', 'whatsapp', 'agent', 'manual', 'import', 'form', 'meta_form'));
alter table public.crm_entries add column if not exists meta_form_id text;
alter table public.crm_entries add column if not exists meta_page_id text;
create unique index if not exists uq_crm_entries_meta_form on public.crm_entries (equipe_id, meta_form_id)
  where meta_form_id is not null;

create or replace function public._crm_entry_for_meta_form(p_equipe uuid, p_page text, p_form text, p_form_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text := 'Meta · ' || coalesce(nullif(left(btrim(p_form_name), 110), ''), 'Formulário ' || p_form);
begin
  if nullif(btrim(p_form), '') is null then return null; end if;
  select id into v_id from public.crm_entries where equipe_id = p_equipe and meta_form_id = p_form;
  if v_id is null then
    insert into public.crm_entries (equipe_id, kind, name, meta_form_id, meta_page_id, origin_category, platform)
    values (p_equipe, 'meta_form', v_name, p_form, p_page, 'paid_social', 'meta')
    on conflict (equipe_id, meta_form_id) where meta_form_id is not null do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.crm_entries where equipe_id = p_equipe and meta_form_id = p_form;
    end if;
  elsif nullif(btrim(p_form_name), '') is not null then
    -- O nome do formulário chega depois do ID: troca só o nome provisório.
    update public.crm_entries set name = v_name, updated_at = now()
     where id = v_id and name = 'Meta · Formulário ' || p_form;
  end if;
  return v_id;
end;
$$;

-- A tela de Entradas: o formulário tem linha própria (como número e agente).
create or replace function public.crm_entry_list()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(e) - 'owner_cursor' || jsonb_build_object(
           'pipeline_id', x.line_id,
           'pipeline_name', (select p.name from public.pipelines p where p.id = x.line_id),
           'webhook_active', w.active,
           'campaign_name', (select c.name from public.crm_campaigns c where c.id = e.campaign_id),
           'leads', (select count(*) from public.leads l where l.entry_id = e.id and l.deleted_at is null),
           'touches_30d', (select count(*) from public.lead_touches t
                            where t.entry_id = e.id and t.occurred_at > now() - interval '30 days'),
           'last_touch_at', (select max(t.occurred_at) from public.lead_touches t where t.entry_id = e.id))
         order by case e.kind when 'webhook' then 0 when 'meta_form' then 1 when 'whatsapp' then 2 when 'agent' then 3
                              when 'manual' then 4 else 5 end,
                  e.name), '[]'::jsonb)
    from public.crm_entries e
    left join public.webhook_configs w on w.id = e.webhook_config_id
    cross join lateral (select case e.kind when 'webhook' then w.pipeline_id
                                           when 'whatsapp' then e.pipeline_id
                                           when 'agent' then e.pipeline_id
                                           when 'meta_form' then e.pipeline_id end as line_id) x
   where e.equipe_id = (select pr.equipe_id from public.profiles pr where pr.id = auth.uid());
$$;

create or replace function public.crm_save_entry(p_entry_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_entry  public.crm_entries;
begin
  select pr.equipe_id into v_equipe from public.profiles pr where pr.id = auth.uid();
  select * into v_entry from public.crm_entries e where e.id = p_entry_id and e.equipe_id = v_equipe;
  if v_equipe is null or not found then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  if p ? 'campaign_id' and nullif(p->>'campaign_id', '') is not null
     and not exists (select 1 from public.crm_campaigns c where c.id = (p->>'campaign_id')::uuid and c.equipe_id = v_equipe) then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if p ? 'pipeline_id' and nullif(p->>'pipeline_id', '') is not null
     and not exists (select 1 from public.pipelines pl where pl.id = (p->>'pipeline_id')::uuid and pl.equipe_id = v_equipe) then
    raise exception 'pipeline_not_found' using errcode = 'P0002';
  end if;

  update public.crm_entries e
     set name = case when p ? 'name' and e.kind <> 'webhook' and length(btrim(p->>'name')) between 1 and 120
                     then btrim(p->>'name') else e.name end,
         origin_category = case when p ? 'origin_category' then nullif(p->>'origin_category', '') else e.origin_category end,
         platform = case when p ? 'platform' then nullif(p->>'platform', '') else e.platform end,
         campaign_id = case when p ? 'campaign_id' then nullif(p->>'campaign_id', '')::uuid else e.campaign_id end,
         -- A linha de um webhook é a do próprio webhook (tela de webhooks); a do
         -- número, do agente e do formulário do Meta, esta; manual e importação escolhem na hora.
         pipeline_id = case when p ? 'pipeline_id' and e.kind in ('whatsapp', 'agent', 'meta_form')
                            then nullif(p->>'pipeline_id', '')::uuid else e.pipeline_id end,
         owner_rule = case when p ? 'owner_rule' then public._crm_normalize_owner_rule(v_equipe, p->'owner_rule') else e.owner_rule end,
         active = case when p ? 'active' then coalesce((p->>'active')::boolean, e.active) else e.active end,
         updated_at = now()
   where e.id = p_entry_id
  returning * into v_entry;

  return to_jsonb(v_entry) - 'owner_cursor';
end;
$$;

-- 4. Anúncio que chega no lead ---------------------------------------------
alter table public.crm_ads drop constraint if exists crm_ads_source_check;
alter table public.crm_ads add constraint crm_ads_source_check check (source in ('manual', 'windsor', 'meta'));

-- Cria o anúncio com o que o lead trouxe (ou só completa o que falta: o que o
-- Windsor ou o usuário já escreveu fica). Liga/cria a campanha pelo ID dela.
create or replace function public._crm_meta_upsert_ad(p_equipe uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ext  text := public._crm_ad_ref(p->>'ad_id');
  v_id   uuid;
  v_ad   public.crm_ads;
  v_camp uuid;
begin
  if v_ext is null then return null; end if;
  insert into public.crm_ads as a (equipe_id, platform, external_ad_id, ad_name, adset_external_id, adset_name,
                                   campaign_external_id, campaign_name, source, destination, needs_review,
                                   first_seen_at, last_seen_at)
  values (p_equipe, 'meta', v_ext, left(nullif(btrim(p->>'ad_name'), ''), 300), nullif(p->>'adset_id', ''),
          nullif(p->>'adset_name', ''), nullif(p->>'campaign_id', ''), nullif(p->>'campaign_name', ''),
          'meta', 'form', true, now(), now())
  on conflict (equipe_id, platform, external_ad_id) where external_ad_id is not null do update
     set ad_name = coalesce(a.ad_name, excluded.ad_name),
         adset_external_id = coalesce(a.adset_external_id, excluded.adset_external_id),
         adset_name = coalesce(a.adset_name, excluded.adset_name),
         campaign_external_id = coalesce(a.campaign_external_id, excluded.campaign_external_id),
         campaign_name = coalesce(a.campaign_name, excluded.campaign_name),
         destination = coalesce(a.destination, 'form'),
         last_seen_at = greatest(a.last_seen_at, now()),
         updated_at = now()
  returning id into v_id;

  select * into v_ad from public.crm_ads where id = v_id;
  if v_ad.campaign_id is null and nullif(btrim(v_ad.campaign_external_id), '') is not null then
    select c.id into v_camp from public.crm_campaigns c
     where c.equipe_id = p_equipe and c.status <> 'archived'
       and (lower(v_ad.campaign_external_id) = any (c.match_keys) or lower(btrim(v_ad.campaign_name)) = any (c.match_keys))
     order by c.created_at limit 1;
    if v_camp is null then
      insert into public.crm_campaigns (equipe_id, name, platform, origin_category, status, match_keys)
      values (p_equipe, left(coalesce(nullif(btrim(v_ad.campaign_name), ''), 'Campanha ' || v_ad.campaign_external_id), 120),
              'meta', 'paid_social', 'active', array[lower(v_ad.campaign_external_id)])
      returning id into v_camp;
    end if;
    update public.crm_ads set campaign_id = v_camp,
           needs_review = (v_camp is null or creative_id is null or destination is null)
     where id = v_id;
  end if;
  return v_id;
end;
$$;

-- 5. Despertador do worker (pg_cron → edge meta-worker) ----------------------
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
  -- Nada pendente → nem acorda a edge. (A migration da CAPI estende este teste.)
  if not exists (select 1 from public.crm_inbound_events where status in ('queued', 'error', 'processing') and next_attempt_at <= now()) then
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

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'meta-worker') then
      perform cron.unschedule('meta-worker');
    end if;
    perform cron.schedule('meta-worker', '*/5 * * * *', 'select public._crm_meta_tick()');
  else
    raise warning 'pg_cron ausente: meta-worker não foi agendado';
  end if;
end $$;

-- 6. Grants ------------------------------------------------------------------
revoke all on function public._crm_meta_enqueue_leadgen(text, jsonb, text) from public, anon, authenticated;
revoke all on function public._crm_inbound_claim(integer, uuid[]) from public, anon, authenticated;
revoke all on function public._crm_inbound_finish(uuid, text, text, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public._crm_inbound_retry(uuid) from public, anon, authenticated;
revoke all on function public._crm_entry_for_meta_form(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public._crm_meta_upsert_ad(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._crm_meta_tick() from public, anon, authenticated;
grant execute on function public._crm_meta_enqueue_leadgen(text, jsonb, text) to service_role;
grant execute on function public._crm_inbound_claim(integer, uuid[]) to service_role;
grant execute on function public._crm_inbound_finish(uuid, text, text, uuid, uuid, bigint) to service_role;
grant execute on function public._crm_inbound_retry(uuid) to service_role;
grant execute on function public._crm_entry_for_meta_form(uuid, text, text, text) to service_role;
grant execute on function public._crm_meta_upsert_ad(uuid, jsonb) to service_role;
