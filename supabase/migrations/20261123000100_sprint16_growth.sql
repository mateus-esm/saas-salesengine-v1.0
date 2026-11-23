-- 20261123000100_sprint16_growth.sql
-- Sprint 16 — Growth: experimentos, criativos, anúncios, métricas por anúncio e a
-- integração com o Windsor.ai (a chave de cada equipe, no Vault).
--
-- O QUE MUDA NO TOQUE
--
--   crm_record_touch passa a resolver o ANÚNCIO antes da campanha:
--     1. ID do anúncio (ad_id que chega no clique para WhatsApp / formulário)
--     2. a mensagem padrão do WhatsApp (`_first_text`, mandado pela edge só para
--        casar — sai do raw, nunca fica guardado)
--     3. o nome do anúncio, quando um só anúncio da equipe tem esse nome (nunca no
--        clique para WhatsApp: o título "Converse conosco" se repete)
--   e o CRIATIVO: o do anúncio → o código P000-V0 no começo do utm_content → no
--   começo do nome do anúncio. A campanha: a do anúncio → as regras antigas.
--   Anúncio casado é anúncio pago: a plataforma e a categoria são as dele (o lead
--   do formulário do Meta deixa de cair em "Importação / API").
--
-- O GASTO
--
--   crm_ad_metrics guarda uma linha por anúncio por dia (o Windsor escreve).
--   _crm_rollup_spend reescreve o crm_campaign_spend de origem meta_api/google_api
--   a partir delas — o relatório de campanhas (custo por lead, ROAS) continua lendo
--   o mesmo lugar. O lançamento manual não é tocado.
--
-- Sem begin/commit próprios (scripts/sqltest.sh inclui o arquivo na transação do teste).

-- ============================================================================
-- 0. AS FONTES (taxonomia de origem) — duas novas, na rede
-- ============================================================================
--   personal_network  Rede pessoal      alguém que a equipe já conhece e cadastrou
--   customer_base     Base de clientes  quem já é cliente (recompra, ampliação)
-- Espelho: src/config/originTaxonomy.ts e src/types/crm.ts.

create or replace function public._crm_origin_categories()
returns text[]
language sql
immutable
as $$
  select array['organic_search', 'organic_social', 'paid_search', 'paid_social', 'direct_brand',
               'outbound_phone', 'outbound_message', 'outbound_email', 'referral', 'partner_channel',
               'offline_event', 'api_import', 'personal_network', 'customer_base'];
$$;

do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
            where c.conrelid = 'public.leads'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) ilike '%origin_category%'
              and pg_get_constraintdef(c.oid) ilike '%offline_event%' loop
    execute format('alter table public.leads drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.leads drop constraint if exists leads_origin_category_check;
alter table public.leads add constraint leads_origin_category_check
  check (origin_category is null or origin_category = any (public._crm_origin_categories()));

create or replace function public.origin_category_label(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_code
    when 'organic_search'   then 'Busca Orgânica'
    when 'organic_social'   then 'Social Orgânico'
    when 'paid_search'      then 'Busca Paga'
    when 'paid_social'      then 'Social Pago'
    when 'direct_brand'     then 'Direto / Marca'
    when 'outbound_phone'   then 'Cold Call'
    when 'outbound_message' then 'Cold Message'
    when 'outbound_email'   then 'Cold Email'
    when 'referral'         then 'Indicação'
    when 'partner_channel'  then 'Parceiro / Canal'
    when 'offline_event'    then 'Evento Offline'
    when 'personal_network' then 'Rede pessoal'
    when 'customer_base'    then 'Base de clientes'
    when 'api_import'       then 'Importação / API'
    else null
  end;
$$;

create or replace function public.origin_category_group(p_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_code in ('organic_search','organic_social','paid_search','paid_social','direct_brand') then 'Inbound'
    when p_code in ('outbound_phone','outbound_message','outbound_email') then 'Outbound'
    when p_code in ('referral','partner_channel','offline_event','personal_network','customer_base') then 'Rede'
    when p_code = 'api_import' then 'Sistema'
    else null
  end;
$$;

-- Quem indicou (programa de indicação): outro contato da equipe.
alter table public.leads add column if not exists referred_by_lead_id uuid references public.leads(id) on delete set null;
create index if not exists idx_leads_referred_by on public.leads (equipe_id, referred_by_lead_id) where referred_by_lead_id is not null;

-- ============================================================================
-- 1. TABELAS
-- ============================================================================

create or replace function public._crm_ad_platforms()
returns text[]
language sql
immutable
as $$
  select array['meta', 'google', 'tiktok', 'linkedin', 'youtube', 'kwai', 'pinterest'];
$$;

-- "Oi!  Vi o PROJETO " → "oi! vi o projeto". Para casar a mensagem padrão.
create or replace function public._crm_norm_text(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p, ''))), '\s+', ' ', 'g'), '');
$$;

-- "P002-V3 | Carmona" / "p002-v3_1202…" → "P002-V3". Só no começo.
create or replace function public._crm_creative_code(p text)
returns text
language sql
immutable
as $$
  select upper((regexp_match(btrim(coalesce(p, '')), '^([A-Za-z][0-9]{3}-[Vv][0-9]+)'))[1]);
$$;

create table if not exists public.crm_creatives (
  id           uuid primary key default gen_random_uuid(),
  equipe_id    uuid not null references public.equipes(id) on delete cascade,
  code         text not null check (code ~ '^[A-Z][0-9]{3}-V[0-9]+$'),
  title        text not null default '' check (length(title) <= 160),
  format       text check (format is null or length(format) <= 40),
  delivered_on date,
  files_url    text check (files_url is null or length(files_url) <= 1000),
  notes        text check (notes is null or length(notes) <= 2000),
  status       text not null default 'active' check (status in ('active', 'archived')),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (equipe_id, code)
);

create table if not exists public.crm_ads (
  id                   uuid primary key default gen_random_uuid(),
  equipe_id            uuid not null references public.equipes(id) on delete cascade,
  platform             text not null check (platform = any (public._crm_ad_platforms())),
  external_ad_id       text check (external_ad_id is null or length(external_ad_id) between 1 and 120),
  ad_name              text check (ad_name is null or length(ad_name) <= 300),
  adset_external_id    text,
  adset_name           text,
  campaign_external_id text,
  campaign_name        text,
  account_id           text,
  account_name         text,
  campaign_id          uuid references public.crm_campaigns(id) on delete set null,
  creative_id          uuid references public.crm_creatives(id) on delete set null,
  destination          text check (destination is null or destination in ('whatsapp', 'form', 'site', 'other')),
  form_name            text,
  prefill_message      text check (prefill_message is null or length(prefill_message) <= 500),
  prefill_norm         text generated always as (public._crm_norm_text(prefill_message)) stored,
  starts_on            date,
  ends_on              date,
  daily_budget         numeric(14,2) check (daily_budget is null or daily_budget >= 0),
  status               text not null default 'active' check (status in ('active', 'paused', 'archived')),
  source               text not null default 'manual' check (source in ('manual', 'windsor')),
  needs_review         boolean not null default false,
  first_seen_at        timestamptz,
  last_seen_at         timestamptz,
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists uq_crm_ads_external
  on public.crm_ads (equipe_id, platform, external_ad_id) where external_ad_id is not null;
create index if not exists idx_crm_ads_equipe on public.crm_ads (equipe_id, status);
create index if not exists idx_crm_ads_prefill on public.crm_ads (equipe_id, prefill_norm) where prefill_norm is not null;

create table if not exists public.crm_ad_metrics (
  ad_id          uuid not null references public.crm_ads(id) on delete cascade,
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  day            date not null,
  spend          numeric(14,2) not null default 0 check (spend >= 0),
  impressions    bigint not null default 0,
  reach          bigint not null default 0,
  clicks         bigint not null default 0,
  video_3s       bigint not null default 0,
  thruplays      bigint not null default 0,
  platform_leads integer not null default 0,
  conversations  integer not null default 0,
  synced_at      timestamptz not null default now(),
  primary key (ad_id, day)
);

create index if not exists idx_crm_ad_metrics_equipe_day on public.crm_ad_metrics (equipe_id, day);

create table if not exists public.crm_experiments (
  id            uuid primary key default gen_random_uuid(),
  equipe_id     uuid not null references public.equipes(id) on delete cascade,
  title         text not null default '' check (length(title) <= 160),
  hypothesis    text check (hypothesis is null or length(hypothesis) <= 2000),
  channel       text check (channel is null or channel = any (public._crm_origin_categories())),
  campaign_id   uuid references public.crm_campaigns(id) on delete set null,
  creative_id   uuid references public.crm_creatives(id) on delete set null,
  metric        text not null default 'leads'
                check (metric in ('leads', 'deals', 'wins', 'revenue', 'cpl', 'cost_per_win', 'roas', 'custom')),
  baseline      numeric(14,2),
  target        numeric(14,2),
  result_value  numeric(14,2),
  starts_on     date,
  ends_on       date,
  status        text not null default 'idea' check (status in ('idea', 'planned', 'running', 'done', 'discarded')),
  decision      text check (decision is null or decision in ('scale', 'iterate', 'kill')),
  learnings     text check (learnings is null or length(learnings) <= 4000),
  ice_impact    smallint check (ice_impact between 1 and 10),
  ice_confidence smallint check (ice_confidence between 1 and 10),
  ice_ease      smallint check (ice_ease between 1 and 10),
  owner_id      uuid references public.profiles(id) on delete set null,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists idx_crm_experiments_equipe on public.crm_experiments (equipe_id, status);

create table if not exists public.crm_integrations (
  id               uuid primary key default gen_random_uuid(),
  equipe_id        uuid not null references public.equipes(id) on delete cascade,
  provider         text not null check (provider in ('windsor')),
  status           text not null default 'disconnected' check (status in ('connected', 'error', 'disconnected')),
  secret_id        uuid,
  key_last4        text,
  accounts         jsonb not null default '[]'::jsonb,
  settings         jsonb not null default '{}'::jsonb,
  last_sync_at     timestamptz,
  last_sync_status text check (last_sync_status is null or last_sync_status in ('ok', 'partial', 'error')),
  last_sync_error  text,
  last_sync_rows   integer,
  connected_by     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (equipe_id, provider)
);

alter table public.lead_touches add column if not exists crm_ad_id   uuid references public.crm_ads(id) on delete set null;
alter table public.lead_touches add column if not exists creative_id uuid references public.crm_creatives(id) on delete set null;
create index if not exists idx_lead_touches_crm_ad on public.lead_touches (crm_ad_id) where crm_ad_id is not null;
create index if not exists idx_lead_touches_creative on public.lead_touches (creative_id) where creative_id is not null;
create index if not exists idx_lead_touches_ad_ext on public.lead_touches (equipe_id, ad_id) where ad_id is not null and crm_ad_id is null;

-- RLS: a equipe lê; escrita só pelos verbos.
alter table public.crm_creatives enable row level security;
alter table public.crm_ads enable row level security;
alter table public.crm_ad_metrics enable row level security;
alter table public.crm_experiments enable row level security;
alter table public.crm_integrations enable row level security;

drop policy if exists crm_creatives_team_read on public.crm_creatives;
create policy crm_creatives_team_read on public.crm_creatives for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists crm_ads_team_read on public.crm_ads;
create policy crm_ads_team_read on public.crm_ads for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists crm_ad_metrics_team_read on public.crm_ad_metrics;
create policy crm_ad_metrics_team_read on public.crm_ad_metrics for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists crm_experiments_team_read on public.crm_experiments;
create policy crm_experiments_team_read on public.crm_experiments for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
-- A integração: sem leitura direta (a tela usa crm_integration_list, que não
-- devolve secret_id).

-- ============================================================================
-- 2. A LIGAÇÃO DO TOQUE
-- ============================================================================

create or replace function public._crm_resolve_ad(p_equipe_id uuid, p_fields jsonb, p_text text)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select a.id from public.crm_ads a
      where a.equipe_id = p_equipe_id
        and nullif(btrim(p_fields->>'ad_id'), '') is not null
        and a.external_ad_id = btrim(p_fields->>'ad_id')
      order by (a.status = 'archived'), a.updated_at desc
      limit 1),
    (select a.id from public.crm_ads a
      where a.equipe_id = p_equipe_id and a.status <> 'archived'
        and a.prefill_norm is not null
        and public._crm_norm_text(p_text) is not null
        and left(public._crm_norm_text(p_text), length(a.prefill_norm)) = a.prefill_norm
      order by length(a.prefill_norm) desc, a.updated_at desc
      limit 1),
    (select min(a.id::text)::uuid from public.crm_ads a
      where a.equipe_id = p_equipe_id and a.status <> 'archived'
        and not (p_fields ? 'ctwa_clid')
        and nullif(btrim(p_fields->>'ad_name'), '') is not null
        and lower(btrim(a.ad_name)) = lower(btrim(p_fields->>'ad_name'))
        and (nullif(btrim(p_fields->>'campaign_name'), '') is null or a.campaign_name is null
             or lower(btrim(a.campaign_name)) = lower(btrim(p_fields->>'campaign_name')))
     having count(*) = 1));
$$;

create or replace function public._crm_resolve_creative(p_equipe_id uuid, p_fields jsonb, p_ad_creative uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    p_ad_creative,
    (select c.id from public.crm_creatives c
      where c.equipe_id = p_equipe_id and c.code = public._crm_creative_code(p_fields->>'utm_content')),
    (select c.id from public.crm_creatives c
      where c.equipe_id = p_equipe_id and c.code = public._crm_creative_code(p_fields->>'ad_name')));
$$;

-- O payload guardado: sem segredos, sem o texto da mensagem, e só se couber em 32 KB.
create or replace function public._crm_touch_raw(p_payload jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(p_payload) <> 'object' then null
    when length(clean::text) > 32768 then jsonb_build_object('_truncated', true, '_bytes', length(clean::text))
    else clean
  end
  from (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) as clean
          from jsonb_each(case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end) e
         where lower(e.key) !~ '(apikey|api_key|token|secret|password|senha|authorization|cookie)'
           and e.key <> '_first_text') x;
$$;

create or replace function public.crm_record_touch(
  p_lead_id        uuid,
  p_entry_id       uuid default null,
  p_payload        jsonb default '{}'::jsonb,
  p_opportunity_id uuid default null,
  p_occurred_at    timestamptz default null
)
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
    campaign_ref, campaign_name, adset_id, adset_name, ad_id, ad_name, form_id, form_name,
    landing_page, referrer, raw)
  values (
    v_lead.equipe_id, v_lead.id, p_opportunity_id, v_entry.id, coalesce(p_occurred_at, clock_timestamp()),
    v_category, v_platform, v_campaign,
    v_ad_id, v_creative,
    v_fields->>'utm_source', v_fields->>'utm_medium', v_fields->>'utm_campaign', v_fields->>'utm_content',
    v_fields->>'utm_term', v_fields->>'fbclid', v_fields->>'gclid', v_fields->>'ctwa_clid',
    v_fields->>'campaign_ref', v_fields->>'campaign_name', v_fields->>'adset_id', v_fields->>'adset_name',
    v_fields->>'ad_id', v_fields->>'ad_name', v_fields->>'form_id', v_fields->>'form_name',
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

revoke all on function public.crm_record_touch(uuid, uuid, jsonb, uuid, timestamptz) from public, anon;
grant execute on function public.crm_record_touch(uuid, uuid, jsonb, uuid, timestamptz) to authenticated, service_role;

-- Liga ao anúncio os toques que chegaram com o ID dele antes do cadastro, completa a
-- campanha/criativo do que já foi ligado e corrige a categoria do primeiro toque.
create or replace function public._crm_relink_touches(p_equipe_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.lead_touches t
     set crm_ad_id = a.id,
         platform = a.platform,
         origin_category = case when a.platform = 'google' then 'paid_search' else 'paid_social' end
    from public.crm_ads a
   where t.equipe_id = p_equipe_id and t.crm_ad_id is null and t.ad_id is not null
     and a.equipe_id = p_equipe_id and a.external_ad_id = t.ad_id;
  get diagnostics v_n = row_count;

  update public.lead_touches t
     set creative_id = coalesce(t.creative_id, a.creative_id),
         campaign_id = coalesce(t.campaign_id, a.campaign_id)
    from public.crm_ads a
   where t.equipe_id = p_equipe_id and t.crm_ad_id = a.id
     and ((t.creative_id is null and a.creative_id is not null) or (t.campaign_id is null and a.campaign_id is not null));

  update public.leads l
     set campaign_id     = coalesce(l.campaign_id, t.campaign_id),
         origin_platform = t.platform,
         origin_category = case when l.origin_category is null or l.origin_category = 'api_import'
                                then t.origin_category else l.origin_category end
    from public.lead_touches t
   where l.equipe_id = p_equipe_id and t.id = l.first_touch_id and t.crm_ad_id is not null
     and ((l.campaign_id is null and t.campaign_id is not null)
          or l.origin_platform is distinct from t.platform
          or l.origin_category is null or l.origin_category = 'api_import');

  return v_n;
end;
$$;

-- O gasto vindo da API, por campanha e dia, refeito das métricas por anúncio.
create or replace function public._crm_rollup_spend(p_equipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.crm_campaign_spend s
   where s.equipe_id = p_equipe_id and s.source in ('meta_api', 'google_api');

  insert into public.crm_campaign_spend (equipe_id, campaign_id, spent_on, amount, source, note)
  select p_equipe_id, a.campaign_id, m.day, round(sum(m.spend), 2),
         case when a.platform = 'google' then 'google_api' else 'meta_api' end,
         'Windsor · por anúncio'
    from public.crm_ad_metrics m
    join public.crm_ads a on a.id = m.ad_id
   where m.equipe_id = p_equipe_id and a.campaign_id is not null and a.platform in ('meta', 'google')
   group by a.campaign_id, m.day, (a.platform = 'google')
  having sum(m.spend) > 0;
end;
$$;

-- ============================================================================
-- 3. CRIATIVOS E ANÚNCIOS (verbos da tela)
-- ============================================================================

create or replace function public._crm_my_team()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pr.equipe_id from public.profiles pr where pr.id = auth.uid();
$$;

create or replace function public.crm_save_creative(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid := public._crm_my_team();
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_code   text := upper(btrim(coalesce(p->>'code', '')));
  v_row    public.crm_creatives;
begin
  if v_equipe is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v_code !~ '^[A-Z][0-9]{3}-V[0-9]+$' then
    raise exception 'invalid_creative_code' using errcode = '22023';
  end if;
  if exists (select 1 from public.crm_creatives c where c.equipe_id = v_equipe and c.code = v_code and c.id is distinct from v_id) then
    raise exception 'creative_code_taken:%', v_code using errcode = '23505';
  end if;

  if v_id is null then
    insert into public.crm_creatives (equipe_id, code, title, format, delivered_on, files_url, notes, status, created_by)
    values (v_equipe, v_code, left(btrim(coalesce(p->>'title', '')), 160), nullif(btrim(p->>'format'), ''),
            nullif(p->>'delivered_on', '')::date, nullif(btrim(p->>'files_url'), ''), nullif(btrim(p->>'notes'), ''),
            coalesce(nullif(p->>'status', ''), 'active'), auth.uid())
    returning * into v_row;
  else
    update public.crm_creatives
       set code = v_code,
           title = left(btrim(coalesce(p->>'title', '')), 160),
           format = nullif(btrim(p->>'format'), ''),
           delivered_on = nullif(p->>'delivered_on', '')::date,
           files_url = nullif(btrim(p->>'files_url'), ''),
           notes = nullif(btrim(p->>'notes'), ''),
           status = coalesce(nullif(p->>'status', ''), status),
           updated_at = now()
     where id = v_id and equipe_id = v_equipe
    returning * into v_row;
    if not found then raise exception 'creative_not_found' using errcode = 'P0002'; end if;
  end if;

  -- Anúncios cujo nome começa com o código e ainda não têm criativo passam a ter.
  update public.crm_ads a
     set creative_id = v_row.id, updated_at = now(),
         needs_review = (a.campaign_id is null or a.destination is null)
   where a.equipe_id = v_equipe and a.creative_id is null and public._crm_creative_code(a.ad_name) = v_row.code;
  update public.lead_touches t
     set creative_id = v_row.id
   where t.equipe_id = v_equipe and t.creative_id is null
     and (public._crm_creative_code(t.utm_content) = v_row.code
          or (t.crm_ad_id is null and public._crm_creative_code(t.ad_name) = v_row.code));
  perform public._crm_relink_touches(v_equipe);

  return to_jsonb(v_row);
end;
$$;

create or replace function public.crm_creative_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
           'ads', (select count(*) from public.crm_ads a where a.creative_id = c.id and a.status <> 'archived'),
           'leads', (select count(*) from public.leads l join public.lead_touches t on t.id = l.first_touch_id
                      where t.creative_id = c.id and l.deleted_at is null))
         order by (c.status = 'archived'), c.code desc), '[]'::jsonb)
    from public.crm_creatives c
   where c.equipe_id = public._crm_my_team();
$$;

create or replace function public.crm_save_ad(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe   uuid := public._crm_my_team();
  v_id       uuid := nullif(p->>'id', '')::uuid;
  v_platform text := lower(btrim(coalesce(p->>'platform', '')));
  v_ext      text := nullif(btrim(p->>'external_ad_id'), '');
  v_camp     uuid := nullif(p->>'campaign_id', '')::uuid;
  v_creative uuid := nullif(p->>'creative_id', '')::uuid;
  v_dest     text := nullif(p->>'destination', '');
  v_prefill  text := nullif(btrim(p->>'prefill_message'), '');
  v_campext  text := nullif(btrim(p->>'campaign_external_id'), '');
  v_key      text;
  v_row      public.crm_ads;
begin
  if v_equipe is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not (v_platform = any (public._crm_ad_platforms())) then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;
  if v_ext is null and nullif(btrim(p->>'ad_name'), '') is null and v_prefill is null then
    raise exception 'ad_needs_identity' using errcode = '22023';
  end if;
  if v_ext is not null and exists (select 1 from public.crm_ads a where a.equipe_id = v_equipe and a.platform = v_platform
                                     and a.external_ad_id = v_ext and a.id is distinct from v_id) then
    raise exception 'ad_id_taken:%', v_ext using errcode = '23505';
  end if;
  if v_prefill is not null and exists (select 1 from public.crm_ads a where a.equipe_id = v_equipe and a.status <> 'archived'
                                         and a.prefill_norm = public._crm_norm_text(v_prefill) and a.id is distinct from v_id) then
    raise exception 'prefill_taken' using errcode = '23505';
  end if;
  if v_camp is not null and not exists (select 1 from public.crm_campaigns c where c.id = v_camp and c.equipe_id = v_equipe) then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if v_creative is not null and not exists (select 1 from public.crm_creatives c where c.id = v_creative and c.equipe_id = v_equipe) then
    raise exception 'creative_not_found' using errcode = 'P0002';
  end if;
  if v_creative is null then
    select c.id into v_creative from public.crm_creatives c
     where c.equipe_id = v_equipe and c.code = public._crm_creative_code(p->>'ad_name');
  end if;

  if v_id is null then
    insert into public.crm_ads (equipe_id, platform, external_ad_id, ad_name, adset_external_id, adset_name,
                                campaign_external_id, campaign_name, campaign_id, creative_id, destination, form_name,
                                prefill_message, starts_on, ends_on, daily_budget, status, source, needs_review, created_by)
    values (v_equipe, v_platform, v_ext, nullif(btrim(p->>'ad_name'), ''), nullif(btrim(p->>'adset_external_id'), ''),
            nullif(btrim(p->>'adset_name'), ''), v_campext, nullif(btrim(p->>'campaign_name'), ''), v_camp, v_creative,
            v_dest, nullif(btrim(p->>'form_name'), ''), v_prefill, nullif(p->>'starts_on', '')::date,
            nullif(p->>'ends_on', '')::date, nullif(p->>'daily_budget', '')::numeric,
            coalesce(nullif(p->>'status', ''), 'active'), 'manual',
            (v_camp is null or v_creative is null or v_dest is null), auth.uid())
    returning * into v_row;
  else
    update public.crm_ads
       set platform = v_platform,
           external_ad_id = v_ext,
           ad_name = nullif(btrim(p->>'ad_name'), ''),
           adset_external_id = nullif(btrim(p->>'adset_external_id'), ''),
           adset_name = nullif(btrim(p->>'adset_name'), ''),
           campaign_external_id = v_campext,
           campaign_name = nullif(btrim(p->>'campaign_name'), ''),
           campaign_id = v_camp,
           creative_id = v_creative,
           destination = v_dest,
           form_name = nullif(btrim(p->>'form_name'), ''),
           prefill_message = v_prefill,
           starts_on = nullif(p->>'starts_on', '')::date,
           ends_on = nullif(p->>'ends_on', '')::date,
           daily_budget = nullif(p->>'daily_budget', '')::numeric,
           status = coalesce(nullif(p->>'status', ''), status),
           needs_review = (v_camp is null or v_creative is null or v_dest is null),
           updated_at = now()
     where id = v_id and equipe_id = v_equipe
    returning * into v_row;
    if not found then raise exception 'ad_not_found' using errcode = 'P0002'; end if;
  end if;

  -- O ID da campanha da plataforma vira chave da campanha do Rev: os outros
  -- anúncios dela e os toques com utm_campaign={{campaign.id}} caem sozinhos.
  if v_camp is not null and v_campext is not null then
    v_key := lower(v_campext);
    if exists (select 1 from public.crm_campaigns c where c.equipe_id = v_equipe and c.status <> 'archived'
                 and c.id <> v_camp and v_key = any (c.match_keys)) then
      raise exception 'match_key_taken:%', v_key using errcode = '23505';
    end if;
    update public.crm_campaigns
       set match_keys = (select array_agg(distinct k order by k) from unnest(match_keys || array[v_key]) k),
           platform = coalesce(platform, v_platform),
           updated_at = now()
     where id = v_camp and not (v_key = any (match_keys));
    update public.crm_ads a
       set campaign_id = v_camp, needs_review = (a.creative_id is null or a.destination is null), updated_at = now()
     where a.equipe_id = v_equipe and a.campaign_id is null and lower(a.campaign_external_id) = v_key;
  end if;

  perform public._crm_relink_touches(v_equipe);
  perform public._crm_rollup_spend(v_equipe);
  return to_jsonb(v_row);
end;
$$;

create or replace function public.crm_ad_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg((to_jsonb(a) - 'prefill_norm') || jsonb_build_object(
           'creative_code', cr.code,
           'crm_campaign_name', c.name,
           'spend_30d', coalesce((select sum(m.spend) from public.crm_ad_metrics m
                                   where m.ad_id = a.id and m.day >= current_date - 29), 0),
           'leads', (select count(*) from public.leads l join public.lead_touches t on t.id = l.first_touch_id
                      where t.crm_ad_id = a.id and l.deleted_at is null))
         order by (a.status = 'archived'), a.needs_review desc, a.last_seen_at desc nulls last, a.created_at desc), '[]'::jsonb)
    from public.crm_ads a
    left join public.crm_creatives cr on cr.id = a.creative_id
    left join public.crm_campaigns c on c.id = a.campaign_id
   where a.equipe_id = public._crm_my_team();
$$;

-- ============================================================================
-- 4. EXPERIMENTOS
-- ============================================================================

create or replace function public.crm_save_experiment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid := public._crm_my_team();
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_row    public.crm_experiments;
  v_camp   uuid := nullif(p->>'campaign_id', '')::uuid;
  v_cr     uuid := nullif(p->>'creative_id', '')::uuid;
  v_owner  uuid := nullif(p->>'owner_id', '')::uuid;
  v_ice    smallint[];
begin
  if v_equipe is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if v_camp is not null and not exists (select 1 from public.crm_campaigns c where c.id = v_camp and c.equipe_id = v_equipe) then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if v_cr is not null and not exists (select 1 from public.crm_creatives c where c.id = v_cr and c.equipe_id = v_equipe) then
    raise exception 'creative_not_found' using errcode = 'P0002';
  end if;
  if v_owner is not null and not exists (select 1 from public.profiles pr where pr.id = v_owner and pr.equipe_id = v_equipe) then
    raise exception 'owner_not_in_team' using errcode = '22023';
  end if;
  v_ice := array[
    case when nullif(p->>'ice_impact', '') is null then null else greatest(1, least(10, (p->>'ice_impact')::numeric::int)) end,
    case when nullif(p->>'ice_confidence', '') is null then null else greatest(1, least(10, (p->>'ice_confidence')::numeric::int)) end,
    case when nullif(p->>'ice_ease', '') is null then null else greatest(1, least(10, (p->>'ice_ease')::numeric::int)) end];

  if v_id is null then
    insert into public.crm_experiments (equipe_id, created_by) values (v_equipe, auth.uid()) returning id into v_id;
  end if;

  update public.crm_experiments
     set title = left(btrim(coalesce(p->>'title', '')), 160),
         hypothesis = nullif(btrim(p->>'hypothesis'), ''),
         channel = case when p->>'channel' = any (public._crm_origin_categories()) then p->>'channel' end,
         campaign_id = v_camp,
         creative_id = v_cr,
         metric = case when p->>'metric' in ('leads', 'deals', 'wins', 'revenue', 'cpl', 'cost_per_win', 'roas', 'custom')
                       then p->>'metric' else 'leads' end,
         baseline = nullif(p->>'baseline', '')::numeric,
         target = nullif(p->>'target', '')::numeric,
         result_value = nullif(p->>'result_value', '')::numeric,
         starts_on = nullif(p->>'starts_on', '')::date,
         ends_on = nullif(p->>'ends_on', '')::date,
         status = case when p->>'status' in ('idea', 'planned', 'running', 'done', 'discarded') then p->>'status' else 'idea' end,
         decision = case when p->>'decision' in ('scale', 'iterate', 'kill') then p->>'decision' end,
         learnings = nullif(btrim(p->>'learnings'), ''),
         ice_impact = v_ice[1], ice_confidence = v_ice[2], ice_ease = v_ice[3],
         owner_id = v_owner,
         updated_at = now()
   where id = v_id and equipe_id = v_equipe
  returning * into v_row;
  if not found then raise exception 'experiment_not_found' using errcode = 'P0002'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.crm_delete_experiment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.crm_experiments where id = p_id and equipe_id = public._crm_my_team();
  if not found then raise exception 'experiment_not_found' using errcode = 'P0002'; end if;
end;
$$;

-- Os experimentos com os números ao vivo da campanha/criativo, na janela deles
-- (início → fim, ou hoje). Sem campanha nem criativo, só o resultado manual.
create or replace function public.crm_experiment_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select x.*,
           (coalesce(x.starts_on, x.created_at::date)::timestamp at time zone 'America/Sao_Paulo') as w_from,
           ((coalesce(x.ends_on, (now() at time zone 'America/Sao_Paulo')::date) + 1)::timestamp at time zone 'America/Sao_Paulo') as w_to
      from public.crm_experiments x
     where x.equipe_id = public._crm_my_team()
  )
  select coalesce(jsonb_agg(
           (to_jsonb(e) - 'w_from' - 'w_to') || jsonb_build_object('live',
             case when e.campaign_id is null and e.creative_id is null then null else jsonb_build_object(
               'leads', (select count(*) from public.leads l join public.lead_touches t on t.id = l.first_touch_id
                          where l.equipe_id = e.equipe_id and l.deleted_at is null
                            and t.occurred_at >= e.w_from and t.occurred_at < e.w_to
                            and (e.campaign_id is null or l.campaign_id = e.campaign_id)
                            and (e.creative_id is null or t.creative_id = e.creative_id)),
               'deals', (select count(*) from public.opportunities o join public.leads l on l.id = o.lead_id
                          join public.lead_touches t on t.id = l.first_touch_id
                          where o.equipe_id = e.equipe_id and o.deleted_at is null
                            and o.created_at >= e.w_from and o.created_at < e.w_to
                            and (e.campaign_id is null or l.campaign_id = e.campaign_id)
                            and (e.creative_id is null or t.creative_id = e.creative_id)),
               'wins', (select count(distinct fe.opportunity_id) from public.funnel_events fe
                          join public.opportunities o on o.id = fe.opportunity_id
                          join public.leads l on l.id = o.lead_id
                          join public.lead_touches t on t.id = l.first_touch_id
                          where fe.equipe_id = e.equipe_id and fe.event = 'won'
                            and fe.occurred_at >= e.w_from and fe.occurred_at < e.w_to
                            and (e.campaign_id is null or l.campaign_id = e.campaign_id)
                            and (e.creative_id is null or t.creative_id = e.creative_id)
                            and not exists (select 1 from public.funnel_events r where r.opportunity_id = fe.opportunity_id
                                             and r.event = 'reopened' and r.occurred_at > fe.occurred_at)),
               'revenue', coalesce((select round(sum(re.amount), 2) from public.revenue_entries re
                          join public.opportunities o on o.id = re.opportunity_id
                          join public.leads l on l.id = o.lead_id
                          join public.lead_touches t on t.id = l.first_touch_id
                          where re.equipe_id = e.equipe_id
                            and re.recognized_at >= e.w_from and re.recognized_at < e.w_to
                            and (e.campaign_id is null or l.campaign_id = e.campaign_id)
                            and (e.creative_id is null or t.creative_id = e.creative_id)), 0),
               'spend', coalesce(case
                          when e.creative_id is not null then
                            (select round(sum(m.spend), 2) from public.crm_ad_metrics m join public.crm_ads a on a.id = m.ad_id
                              where a.creative_id = e.creative_id and (e.campaign_id is null or a.campaign_id = e.campaign_id)
                                and m.day >= (e.w_from at time zone 'America/Sao_Paulo')::date
                                and m.day <  (e.w_to at time zone 'America/Sao_Paulo')::date)
                          else
                            (select round(sum(s.amount), 2) from public.crm_campaign_spend s
                              where s.campaign_id = e.campaign_id
                                and s.spent_on >= (e.w_from at time zone 'America/Sao_Paulo')::date
                                and s.spent_on <  (e.w_to at time zone 'America/Sao_Paulo')::date)
                        end, 0))
             end)
           order by case e.status when 'running' then 0 when 'planned' then 1 when 'idea' then 2 when 'done' then 3 else 4 end,
                    (coalesce(e.ice_impact, 0) * coalesce(e.ice_confidence, 0) * coalesce(e.ice_ease, 0)) desc,
                    e.created_at), '[]'::jsonb)
    from e;
$$;

-- ============================================================================
-- 5. O RELATÓRIO POR ANÚNCIO E POR CRIATIVO
-- ============================================================================

create or replace function public.crm_ads_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_equipe   uuid;
  v_restrict uuid;
  v_d_from   date := (p_from at time zone 'America/Sao_Paulo')::date;
  v_d_to     date := (p_to at time zone 'America/Sao_Paulo')::date;
  v_ads      jsonb;
  v_creatives jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;
  if v_equipe is null then
    return jsonb_build_object('ads', '[]'::jsonb, 'creatives', '[]'::jsonb);
  end if;

  with
  ft as (
    select l.id as lead_id, t.crm_ad_id as ad, t.creative_id as creative, t.occurred_at
      from public.leads l join public.lead_touches t on t.id = l.first_touch_id
     where l.equipe_id = v_equipe and l.deleted_at is null and (t.crm_ad_id is not null or t.creative_id is not null)
  ),
  met as (
    select m.ad_id, sum(m.spend) spend, sum(m.impressions) impressions, sum(m.reach) reach, sum(m.clicks) clicks,
           sum(m.video_3s) video_3s, sum(m.thruplays) thruplays, sum(m.platform_leads) platform_leads,
           sum(m.conversations) conversations
      from public.crm_ad_metrics m
     where m.equipe_id = v_equipe and m.day >= v_d_from and m.day < v_d_to
     group by m.ad_id
  ),
  lp as (
    select ft.ad, ft.creative, count(*) leads
      from ft
     where ft.occurred_at >= p_from and ft.occurred_at < p_to
       and (v_restrict is null or exists (select 1 from public.opportunities o where o.lead_id = ft.lead_id
                                           and o.deleted_at is null and o.owner_id = v_restrict))
     group by ft.ad, ft.creative
  ),
  dp as (
    select ft.ad, ft.creative, count(*) deals
      from public.opportunities o join ft ft on ft.lead_id = o.lead_id
     where o.deleted_at is null and o.created_at >= p_from and o.created_at < p_to
       and (v_restrict is null or o.owner_id = v_restrict)
     group by ft.ad, ft.creative
  ),
  wp as (
    select ft.ad, ft.creative, count(distinct fe.opportunity_id) wins
      from public.funnel_events fe
      join public.opportunities o on o.id = fe.opportunity_id
      join ft ft on ft.lead_id = o.lead_id
     where fe.equipe_id = v_equipe and fe.event = 'won' and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and (v_restrict is null or fe.owner_id = v_restrict)
       and not exists (select 1 from public.funnel_events r where r.opportunity_id = fe.opportunity_id
                        and r.event = 'reopened' and r.occurred_at > fe.occurred_at)
     group by ft.ad, ft.creative
  ),
  rp as (
    select ft.ad, ft.creative, sum(re.amount) revenue
      from public.revenue_entries re
      join public.opportunities o on o.id = re.opportunity_id
      join ft ft on ft.lead_id = o.lead_id
     where re.equipe_id = v_equipe and re.recognized_at >= p_from and re.recognized_at < p_to
       and (v_restrict is null or re.owner_id = v_restrict)
     group by ft.ad, ft.creative
  ),
  ad_rows as (
    select a.id, a.platform, a.external_ad_id, a.ad_name, a.campaign_id, c.name as campaign, a.creative_id,
           cr.code as creative_code, a.status, a.needs_review,
           coalesce(m.spend, 0) spend, coalesce(m.impressions, 0) impressions, coalesce(m.reach, 0) reach,
           coalesce(m.clicks, 0) clicks, coalesce(m.video_3s, 0) video_3s, coalesce(m.thruplays, 0) thruplays,
           coalesce(m.platform_leads, 0) platform_leads, coalesce(m.conversations, 0) conversations,
           coalesce((select sum(leads) from lp where lp.ad = a.id), 0) leads,
           coalesce((select sum(deals) from dp where dp.ad = a.id), 0) deals,
           coalesce((select sum(wins) from wp where wp.ad = a.id), 0) wins,
           round(coalesce((select sum(revenue) from rp where rp.ad = a.id), 0), 2) revenue
      from public.crm_ads a
      left join met m on m.ad_id = a.id
      left join public.crm_campaigns c on c.id = a.campaign_id
      left join public.crm_creatives cr on cr.id = a.creative_id
     where a.equipe_id = v_equipe
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.spend desc, r.leads desc), '[]'::jsonb) into v_ads
    from ad_rows r
   where r.spend > 0 or r.leads > 0 or r.deals > 0 or r.wins > 0 or r.impressions > 0;

  with
  ft as (
    select l.id as lead_id, t.crm_ad_id as ad, t.creative_id as creative, t.occurred_at
      from public.leads l join public.lead_touches t on t.id = l.first_touch_id
     where l.equipe_id = v_equipe and l.deleted_at is null and (t.crm_ad_id is not null or t.creative_id is not null)
  ),
  met as (
    select a.creative_id, sum(m.spend) spend, sum(m.impressions) impressions, sum(m.reach) reach, sum(m.clicks) clicks,
           sum(m.video_3s) video_3s, sum(m.thruplays) thruplays, sum(m.platform_leads) platform_leads,
           sum(m.conversations) conversations, count(distinct a.id) ads
      from public.crm_ad_metrics m join public.crm_ads a on a.id = m.ad_id
     where m.equipe_id = v_equipe and m.day >= v_d_from and m.day < v_d_to and a.creative_id is not null
     group by a.creative_id
  ),
  lp as (
    select ft.creative, count(*) leads from ft
     where ft.creative is not null and ft.occurred_at >= p_from and ft.occurred_at < p_to
       and (v_restrict is null or exists (select 1 from public.opportunities o where o.lead_id = ft.lead_id
                                           and o.deleted_at is null and o.owner_id = v_restrict))
     group by ft.creative
  ),
  dp as (
    select ft.creative, count(*) deals
      from public.opportunities o join ft ft on ft.lead_id = o.lead_id
     where ft.creative is not null and o.deleted_at is null and o.created_at >= p_from and o.created_at < p_to
       and (v_restrict is null or o.owner_id = v_restrict)
     group by ft.creative
  ),
  wp as (
    select ft.creative, count(distinct fe.opportunity_id) wins
      from public.funnel_events fe
      join public.opportunities o on o.id = fe.opportunity_id
      join ft ft on ft.lead_id = o.lead_id
     where ft.creative is not null and fe.equipe_id = v_equipe and fe.event = 'won'
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and (v_restrict is null or fe.owner_id = v_restrict)
       and not exists (select 1 from public.funnel_events r where r.opportunity_id = fe.opportunity_id
                        and r.event = 'reopened' and r.occurred_at > fe.occurred_at)
     group by ft.creative
  ),
  rp as (
    select ft.creative, sum(re.amount) revenue
      from public.revenue_entries re
      join public.opportunities o on o.id = re.opportunity_id
      join ft ft on ft.lead_id = o.lead_id
     where ft.creative is not null and re.equipe_id = v_equipe
       and re.recognized_at >= p_from and re.recognized_at < p_to
       and (v_restrict is null or re.owner_id = v_restrict)
     group by ft.creative
  ),
  cr_rows as (
    select cr.id, cr.code, cr.title, cr.format, cr.status, coalesce(m.ads, 0) ads,
           coalesce(m.spend, 0) spend, coalesce(m.impressions, 0) impressions, coalesce(m.reach, 0) reach,
           coalesce(m.clicks, 0) clicks, coalesce(m.video_3s, 0) video_3s, coalesce(m.thruplays, 0) thruplays,
           coalesce(m.platform_leads, 0) platform_leads, coalesce(m.conversations, 0) conversations,
           coalesce(lp.leads, 0) leads, coalesce(dp.deals, 0) deals, coalesce(wp.wins, 0) wins,
           round(coalesce(rp.revenue, 0), 2) revenue
      from public.crm_creatives cr
      left join met m on m.creative_id = cr.id
      left join lp on lp.creative = cr.id
      left join dp on dp.creative = cr.id
      left join wp on wp.creative = cr.id
      left join rp on rp.creative = cr.id
     where cr.equipe_id = v_equipe
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.spend desc, r.leads desc, r.code), '[]'::jsonb) into v_creatives
    from cr_rows r
   where r.spend > 0 or r.leads > 0 or r.deals > 0 or r.wins > 0 or r.impressions > 0;

  return jsonb_build_object('ads', v_ads, 'creatives', v_creatives);
end;
$$;

-- ============================================================================
-- 6. INTEGRAÇÕES (Windsor) — a chave no Vault, só a edge lê
-- ============================================================================

create or replace function public.crm_integration_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(i) - 'secret_id' order by i.provider), '[]'::jsonb)
    from public.crm_integrations i
   where i.equipe_id = public._crm_my_team();
$$;

-- Grava (ou troca) a chave. Chamada só pela edge, depois de validar a chave no Windsor.
create or replace function public._crm_integration_store_key(
  p_equipe_id uuid, p_provider text, p_key text, p_accounts jsonb, p_settings jsonb, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.crm_integrations;
  v_name text := p_provider || '_api_key:' || p_equipe_id::text;
begin
  if nullif(btrim(p_key), '') is null then raise exception 'invalid_key' using errcode = '22023'; end if;

  select * into v_row from public.crm_integrations where equipe_id = p_equipe_id and provider = p_provider for update;
  if v_row.secret_id is not null and exists (select 1 from vault.secrets s where s.id = v_row.secret_id) then
    perform vault.update_secret(v_row.secret_id, btrim(p_key));
  else
    delete from vault.secrets where name = v_name;
    v_row.secret_id := vault.create_secret(btrim(p_key), v_name, 'Rev · chave de integração por equipe');
  end if;

  insert into public.crm_integrations (equipe_id, provider, status, secret_id, key_last4, accounts, settings, connected_by,
                                       last_sync_error)
  values (p_equipe_id, p_provider, 'connected', v_row.secret_id, right(btrim(p_key), 4),
          coalesce(p_accounts, '[]'::jsonb), coalesce(p_settings, '{}'::jsonb), p_user, null)
  on conflict (equipe_id, provider) do update
     set status = 'connected', secret_id = excluded.secret_id, key_last4 = excluded.key_last4,
         accounts = excluded.accounts,
         settings = public.crm_integrations.settings || excluded.settings,
         connected_by = excluded.connected_by, last_sync_error = null, updated_at = now()
  returning * into v_row;
  return v_row.id;
end;
$$;

create or replace function public._crm_integration_key(p_integration_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.decrypted_secret
    from public.crm_integrations i
    join vault.decrypted_secrets s on s.id = i.secret_id
   where i.id = p_integration_id and i.status <> 'disconnected';
$$;

create or replace function public._crm_integration_disconnect(p_equipe_id uuid, p_provider text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret uuid;
begin
  select secret_id into v_secret from public.crm_integrations where equipe_id = p_equipe_id and provider = p_provider;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  update public.crm_integrations
     set status = 'disconnected', secret_id = null, key_last4 = null, updated_at = now()
   where equipe_id = p_equipe_id and provider = p_provider;
end;
$$;

create or replace function public._crm_integration_mark(
  p_integration_id uuid, p_status text, p_error text, p_rows integer, p_settings jsonb default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.crm_integrations
     set last_sync_at = now(),
         last_sync_status = p_status,
         last_sync_error = left(p_error, 1000),
         last_sync_rows = p_rows,
         status = case when p_status = 'error' and p_error ilike '%auth%' then 'error' else 'connected' end,
         settings = case when p_settings is null then settings else settings || p_settings end,
         updated_at = now()
   where id = p_integration_id and status <> 'disconnected';
$$;

-- As linhas do Windsor, já normalizadas pela edge (uma por anúncio por dia):
--   {platform, day, account_id, account_name, campaign_external_id, campaign_name,
--    adset_external_id, adset_name, external_ad_id, ad_name, spend, impressions,
--    reach, clicks, video_3s, thruplays, platform_leads, conversations}
create or replace function public._crm_windsor_ingest(p_equipe_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new     integer;
  v_metrics integer;
  v_linked  integer;
begin
  create temporary table if not exists _windsor_rows (
    platform text, day date, account_id text, account_name text, campaign_external_id text, campaign_name text,
    adset_external_id text, adset_name text, external_ad_id text, ad_name text, spend numeric, impressions bigint,
    reach bigint, clicks bigint, video_3s bigint, thruplays bigint, platform_leads integer, conversations integer
  ) on commit drop;
  truncate _windsor_rows;

  insert into _windsor_rows
  select x.platform, x.day, x.account_id, x.account_name, x.campaign_external_id, x.campaign_name,
         x.adset_external_id, x.adset_name, x.external_ad_id, x.ad_name, greatest(coalesce(x.spend, 0), 0),
         coalesce(x.impressions, 0), coalesce(x.reach, 0), coalesce(x.clicks, 0), coalesce(x.video_3s, 0),
         coalesce(x.thruplays, 0), coalesce(x.platform_leads, 0), coalesce(x.conversations, 0)
    from jsonb_to_recordset(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as x(
         platform text, day date, account_id text, account_name text, campaign_external_id text, campaign_name text,
         adset_external_id text, adset_name text, external_ad_id text, ad_name text, spend numeric, impressions bigint,
         reach bigint, clicks bigint, video_3s bigint, thruplays bigint, platform_leads integer, conversations integer)
   where x.platform = any (public._crm_ad_platforms()) and x.day is not null and nullif(btrim(x.external_ad_id), '') is not null;

  -- O código P000-V0 no nome do anúncio cria o criativo que ainda não existe.
  insert into public.crm_creatives (equipe_id, code, title)
  select distinct on (public._crm_creative_code(r.ad_name)) p_equipe_id, public._crm_creative_code(r.ad_name),
         left(btrim(coalesce((regexp_split_to_array(r.ad_name, '\s*\|\s*'))[2], '')), 160)
    from _windsor_rows r
   where public._crm_creative_code(r.ad_name) is not null
   order by public._crm_creative_code(r.ad_name), r.day desc
  on conflict (equipe_id, code) do nothing;

  with latest as (
    select distinct on (platform, external_ad_id) *
      from _windsor_rows order by platform, external_ad_id, day desc
  ), firsts as (
    select platform, external_ad_id, min(day) first_day, max(day) last_day from _windsor_rows group by 1, 2
  ), up as (
    insert into public.crm_ads as a (equipe_id, platform, external_ad_id, ad_name, adset_external_id, adset_name,
                                     campaign_external_id, campaign_name, account_id, account_name, source,
                                     needs_review, first_seen_at, last_seen_at)
    select p_equipe_id, l.platform, btrim(l.external_ad_id), l.ad_name, l.adset_external_id, l.adset_name,
           l.campaign_external_id, l.campaign_name, l.account_id, l.account_name, 'windsor', true,
           f.first_day::timestamptz, f.last_day::timestamptz
      from latest l join firsts f using (platform, external_ad_id)
    on conflict (equipe_id, platform, external_ad_id) where external_ad_id is not null do update
       set ad_name = coalesce(excluded.ad_name, a.ad_name),
           adset_external_id = coalesce(excluded.adset_external_id, a.adset_external_id),
           adset_name = coalesce(excluded.adset_name, a.adset_name),
           campaign_external_id = coalesce(excluded.campaign_external_id, a.campaign_external_id),
           campaign_name = coalesce(excluded.campaign_name, a.campaign_name),
           account_id = coalesce(excluded.account_id, a.account_id),
           account_name = coalesce(excluded.account_name, a.account_name),
           first_seen_at = least(a.first_seen_at, excluded.first_seen_at),
           last_seen_at = greatest(a.last_seen_at, excluded.last_seen_at),
           updated_at = now()
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_new from up;

  -- Campanha e criativo para quem ainda não tem.
  update public.crm_ads a
     set campaign_id = c.id
    from public.crm_campaigns c
   where a.equipe_id = p_equipe_id and a.campaign_id is null
     and c.equipe_id = p_equipe_id and c.status <> 'archived'
     and (lower(a.campaign_external_id) = any (c.match_keys) or lower(btrim(a.campaign_name)) = any (c.match_keys));
  update public.crm_ads a
     set creative_id = cr.id
    from public.crm_creatives cr
   where a.equipe_id = p_equipe_id and a.creative_id is null
     and cr.equipe_id = p_equipe_id and cr.code = public._crm_creative_code(a.ad_name);
  update public.crm_ads a
     set needs_review = (a.campaign_id is null or a.creative_id is null or a.destination is null)
   where a.equipe_id = p_equipe_id and a.source = 'windsor'
     and a.needs_review is distinct from (a.campaign_id is null or a.creative_id is null or a.destination is null);

  insert into public.crm_ad_metrics as m (ad_id, equipe_id, day, spend, impressions, reach, clicks, video_3s, thruplays,
                                          platform_leads, conversations, synced_at)
  select a.id, p_equipe_id, r.day, round(sum(r.spend), 2), sum(r.impressions), sum(r.reach), sum(r.clicks),
         sum(r.video_3s), sum(r.thruplays), sum(r.platform_leads), sum(r.conversations), now()
    from _windsor_rows r
    join public.crm_ads a on a.equipe_id = p_equipe_id and a.platform = r.platform and a.external_ad_id = btrim(r.external_ad_id)
   group by a.id, r.day
  on conflict (ad_id, day) do update
     set spend = excluded.spend, impressions = excluded.impressions, reach = excluded.reach, clicks = excluded.clicks,
         video_3s = excluded.video_3s, thruplays = excluded.thruplays, platform_leads = excluded.platform_leads,
         conversations = excluded.conversations, synced_at = now();
  get diagnostics v_metrics = row_count;

  v_linked := public._crm_relink_touches(p_equipe_id);
  perform public._crm_rollup_spend(p_equipe_id);

  return jsonb_build_object('new_ads', v_new, 'metric_rows', v_metrics, 'linked_touches', v_linked);
end;
$$;

-- O despertador diário: pg_cron → aqui → edge integrations-windsor (que sincroniza
-- todas as equipes conectadas). URL e segredo no Vault — nunca nesta migration.
create or replace function public._crm_windsor_tick()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.crm_integrations where provider = 'windsor' and status <> 'disconnected') then
    return null;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'windsor_sync_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'windsor_sync_secret';
  if nullif(btrim(v_url), '') is null or nullif(btrim(v_secret), '') is null then
    raise warning 'windsor tick: faltam os segredos windsor_sync_url/windsor_sync_secret no Vault';
    return null;
  end if;
  return net.http_post(
    url := btrim(v_url),
    body := '{"action": "sync_all"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', btrim(v_secret)),
    timeout_milliseconds := 10000
  );
end;
$$;

-- ============================================================================
-- 6b. QUEM MAIS INDICA (programa de indicação)
-- ============================================================================
create or replace function public.crm_referrers(p_campaign_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ind as (
    select l.referred_by_lead_id as referrer, l.id as lead_id
      from public.leads l
     where l.equipe_id = public._crm_my_team() and l.deleted_at is null and l.referred_by_lead_id is not null
       and (p_campaign_id is null or l.campaign_id = p_campaign_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lead_id', r.id, 'name', r.name, 'phone', r.phone,
           'referrals', x.referrals, 'wins', x.wins, 'revenue', x.revenue)
         order by x.wins desc, x.referrals desc, r.name), '[]'::jsonb)
    from (select i.referrer, count(distinct i.lead_id) as referrals,
                 count(distinct o.id) filter (where o.status = 'won') as wins,
                 round(coalesce(sum(o.value) filter (where o.status = 'won'), 0), 2) as revenue
            from ind i
            left join public.opportunities o on o.lead_id = i.lead_id and o.deleted_at is null
           group by i.referrer) x
    join public.leads r on r.id = x.referrer;
$$;
revoke all on function public.crm_referrers(uuid) from public, anon;
grant execute on function public.crm_referrers(uuid) to authenticated;

-- ============================================================================
-- 7. PERMISSÕES
-- ============================================================================

revoke all on function public._crm_resolve_ad(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public._crm_resolve_creative(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public._crm_relink_touches(uuid) from public, anon, authenticated;
revoke all on function public._crm_rollup_spend(uuid) from public, anon, authenticated;
revoke all on function public._crm_my_team() from public, anon;
revoke all on function public._crm_integration_store_key(uuid, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public._crm_integration_key(uuid) from public, anon, authenticated;
revoke all on function public._crm_integration_disconnect(uuid, text) from public, anon, authenticated;
revoke all on function public._crm_integration_mark(uuid, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public._crm_windsor_ingest(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._crm_windsor_tick() from public, anon, authenticated;

grant execute on function public._crm_my_team() to authenticated;
grant execute on function public._crm_integration_store_key(uuid, text, text, jsonb, jsonb, uuid) to service_role;
grant execute on function public._crm_integration_key(uuid) to service_role;
grant execute on function public._crm_integration_disconnect(uuid, text) to service_role;
grant execute on function public._crm_integration_mark(uuid, text, text, integer, jsonb) to service_role;
grant execute on function public._crm_windsor_ingest(uuid, jsonb) to service_role;

revoke all on function public.crm_save_creative(jsonb) from public, anon;
revoke all on function public.crm_creative_list() from public, anon;
revoke all on function public.crm_save_ad(jsonb) from public, anon;
revoke all on function public.crm_ad_list() from public, anon;
revoke all on function public.crm_save_experiment(jsonb) from public, anon;
revoke all on function public.crm_delete_experiment(uuid) from public, anon;
revoke all on function public.crm_experiment_list() from public, anon;
revoke all on function public.crm_ads_report(timestamptz, timestamptz) from public, anon;
revoke all on function public.crm_integration_list() from public, anon;

grant execute on function public.crm_save_creative(jsonb) to authenticated;
grant execute on function public.crm_creative_list() to authenticated;
grant execute on function public.crm_save_ad(jsonb) to authenticated;
grant execute on function public.crm_ad_list() to authenticated;
grant execute on function public.crm_save_experiment(jsonb) to authenticated;
grant execute on function public.crm_delete_experiment(uuid) to authenticated;
grant execute on function public.crm_experiment_list() to authenticated;
grant execute on function public.crm_ads_report(timestamptz, timestamptz) to authenticated;
grant execute on function public.crm_integration_list() to authenticated;
