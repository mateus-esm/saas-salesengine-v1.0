-- Sprint 11 · Onda 5 · T48 — entradas, campanhas e toques (decisões 29–34).
--
-- TOQUE (`lead_touches`) = uma chegada: quando, por qual entrada, com qual
-- categoria, plataforma e campanha, as UTMs, os click IDs, o anúncio, o
-- formulário, a página e o payload bruto (sem segredos, até 32 KB). Lead que
-- volta ganha um toque, não um lead novo.
--
-- ATRIBUIÇÃO v1 = PRIMEIRO TOQUE: o lead guarda `first_touch_id` e, copiados dele
-- para filtro e quebra, `entry_id`, `campaign_id` e `origin_platform`.
-- `origin_category` continua sendo a categoria (as 12 MECE da Sprint 4) — o
-- primeiro toque só a preenche quando está vazia (a categoria escrita à mão fica).
--
-- ENTRADA (`crm_entries`) = uma porta com carimbo (categoria, plataforma,
-- campanha padrão, regra de responsável — T49). Todo webhook `receive_lead` ganha
-- a sua entrada por gatilho; "Manual", "Importação" e "Agente de IA" nascem na
-- primeira vez que são usadas.
--
-- CAMPANHA (`crm_campaigns`) com chaves (valores de utm_campaign ou IDs da
-- plataforma que caem nela) e investimento em lançamentos (`crm_campaign_spend`).
-- A campanha do toque sai, nesta ordem: ID da campanha no payload → utm_campaign →
-- nome da campanha que veio → campanha padrão da entrada. UTM desconhecida não cria
-- campanha: fica no toque, esperando alguém ligar.

-- ============================================================================
-- 1. AS LISTAS FECHADAS
-- ============================================================================

create or replace function public._crm_platforms()
returns text[]
language sql
immutable
as $$
  select array['meta', 'google', 'tiktok', 'linkedin', 'youtube', 'kwai', 'pinterest',
               'email', 'whatsapp', 'site', 'outra'];
$$;

create or replace function public._crm_origin_categories()
returns text[]
language sql
immutable
as $$
  select array['organic_search', 'organic_social', 'paid_search', 'paid_social', 'direct_brand',
               'outbound_phone', 'outbound_message', 'outbound_email', 'referral', 'partner_channel',
               'offline_event', 'api_import'];
$$;

-- ============================================================================
-- 2. CAMPANHAS E INVESTIMENTO
-- ============================================================================

create table if not exists public.crm_campaigns (
  id              uuid primary key default gen_random_uuid(),
  equipe_id       uuid not null references public.equipes(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  platform        text check (platform is null or platform = any (public._crm_platforms())),
  origin_category text check (origin_category is null or origin_category = any (public._crm_origin_categories())),
  owner_id        uuid references public.profiles(id) on delete set null,
  goal_leads      integer check (goal_leads is null or goal_leads >= 0),
  goal_deals      integer check (goal_deals is null or goal_deals >= 0),
  goal_revenue    numeric(14,2) check (goal_revenue is null or goal_revenue >= 0),
  starts_on       date,
  ends_on         date,
  status          text not null default 'active' check (status in ('active', 'paused', 'ended', 'archived')),
  -- Minúsculas e sem espaços nas pontas (o verbo normaliza).
  match_keys      text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists idx_crm_campaigns_equipe on public.crm_campaigns (equipe_id) where status <> 'archived';
create index if not exists idx_crm_campaigns_keys on public.crm_campaigns using gin (match_keys);

create table if not exists public.crm_campaign_spend (
  id           uuid primary key default gen_random_uuid(),
  equipe_id    uuid not null references public.equipes(id) on delete cascade,
  campaign_id  uuid not null references public.crm_campaigns(id) on delete cascade,
  spent_on     date not null,
  amount       numeric(14,2) not null check (amount >= 0),
  source       text not null default 'manual' check (source in ('manual', 'meta_api', 'google_api')),
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

create index if not exists idx_crm_campaign_spend_campaign on public.crm_campaign_spend (campaign_id, spent_on);

-- ============================================================================
-- 3. ENTRADAS
-- ============================================================================

create table if not exists public.crm_entries (
  id                uuid primary key default gen_random_uuid(),
  equipe_id         uuid not null references public.equipes(id) on delete cascade,
  kind              text not null check (kind in ('webhook', 'whatsapp', 'agent', 'manual', 'import')),
  name              text not null,
  webhook_config_id uuid unique references public.webhook_configs(id) on delete set null,
  wpp_instance_id   uuid unique references public.wpp_instances(id) on delete set null,
  -- A linha de uma entrada de webhook é o `pipeline_id` do próprio webhook.
  pipeline_id       uuid references public.pipelines(id) on delete set null,
  origin_category   text check (origin_category is null or origin_category = any (public._crm_origin_categories())),
  platform          text check (platform is null or platform = any (public._crm_platforms())),
  campaign_id       uuid references public.crm_campaigns(id) on delete set null,
  owner_rule        jsonb not null default '{"mode": "none"}'::jsonb,
  owner_cursor      integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Uma entrada "Manual", uma "Importação" e uma "Agente de IA" por equipe.
create unique index if not exists uq_crm_entries_singleton
  on public.crm_entries (equipe_id, kind) where kind in ('manual', 'import', 'agent');

-- ============================================================================
-- 4. TOQUES E O PRIMEIRO TOQUE NO LEAD
-- ============================================================================

create table if not exists public.lead_touches (
  id              uuid primary key default gen_random_uuid(),
  equipe_id       uuid not null references public.equipes(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  opportunity_id  uuid references public.opportunities(id) on delete set null,
  entry_id        uuid references public.crm_entries(id) on delete set null,
  occurred_at     timestamptz not null default clock_timestamp(),
  origin_category text check (origin_category is null or origin_category = any (public._crm_origin_categories())),
  platform        text check (platform is null or platform = any (public._crm_platforms())),
  campaign_id     uuid references public.crm_campaigns(id) on delete set null,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  fbclid          text,
  gclid           text,
  ctwa_clid       text,
  campaign_ref    text,
  campaign_name   text,
  adset_id        text,
  adset_name      text,
  ad_id           text,
  ad_name         text,
  form_id         text,
  form_name       text,
  landing_page    text,
  referrer        text,
  raw             jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_lead_touches_lead on public.lead_touches (lead_id, occurred_at);
create index if not exists idx_lead_touches_campaign on public.lead_touches (equipe_id, campaign_id) where campaign_id is not null;
create index if not exists idx_lead_touches_unmatched on public.lead_touches (equipe_id, lower(utm_campaign))
  where campaign_id is null and utm_campaign is not null;

alter table public.leads add column if not exists first_touch_id  uuid references public.lead_touches(id) on delete set null;
alter table public.leads add column if not exists entry_id        uuid references public.crm_entries(id) on delete set null;
alter table public.leads add column if not exists campaign_id     uuid references public.crm_campaigns(id) on delete set null;
alter table public.leads add column if not exists origin_platform text;
alter table public.leads drop constraint if exists leads_origin_platform_check;
alter table public.leads add constraint leads_origin_platform_check
  check (origin_platform is null or origin_platform = any (public._crm_platforms()));

create index if not exists idx_leads_campaign on public.leads (equipe_id, campaign_id) where campaign_id is not null;
create index if not exists idx_leads_entry on public.leads (equipe_id, entry_id) where entry_id is not null;

-- ============================================================================
-- 5. RLS: a equipe lê; escrita só pelos verbos
-- ============================================================================

alter table public.crm_campaigns enable row level security;
alter table public.crm_campaign_spend enable row level security;
alter table public.crm_entries enable row level security;
alter table public.lead_touches enable row level security;

drop policy if exists crm_campaigns_team_read on public.crm_campaigns;
create policy crm_campaigns_team_read on public.crm_campaigns for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists crm_campaign_spend_team_read on public.crm_campaign_spend;
create policy crm_campaign_spend_team_read on public.crm_campaign_spend for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists crm_entries_team_read on public.crm_entries;
create policy crm_entries_team_read on public.crm_entries for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists lead_touches_team_read on public.lead_touches;
create policy lead_touches_team_read on public.lead_touches for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- ============================================================================
-- 6. LER O PAYLOAD
-- ============================================================================

-- "%C3%A3o+verão" → "ão verão". Sequência inválida volta como veio.
create or replace function public._crm_url_decode(p text)
returns text
language plpgsql
immutable
as $$
declare
  v_bytes bytea := ''::bytea;
  m text;
begin
  if p is null then
    return null;
  end if;
  for m in select x[1] from regexp_matches(replace(p, '+', ' '), '(%[0-9A-Fa-f]{2}|[^%]+|%)', 'g') as t(x) loop
    if m ~ '^%[0-9A-Fa-f]{2}$' then
      v_bytes := v_bytes || decode(substr(m, 2), 'hex');
    else
      v_bytes := v_bytes || convert_to(m, 'UTF8');
    end if;
  end loop;
  return convert_from(v_bytes, 'UTF8');
exception when others then
  return p;
end;
$$;

-- O valor de um parâmetro na querystring de uma URL.
create or replace function public._crm_query_param(p_url text, p_name text)
returns text
language sql
immutable
as $$
  select nullif(btrim(public._crm_url_decode((regexp_match(p_url, '[?&]' || p_name || '=([^&#]*)'))[1])), '');
$$;

-- O primeiro texto não vazio entre as chaves (planas) do payload.
create or replace function public._crm_first_text(p jsonb, p_keys text[])
returns text
language sql
immutable
as $$
  select nullif(btrim(p->>k), '')
    from unnest(p_keys) with ordinality u(k, o)
   where jsonb_typeof(p->k) in ('string', 'number')
     and nullif(btrim(p->>k), '') is not null
   order by o
   limit 1;
$$;

-- Os campos do toque, do jeito que chegam: chaves planas (várias grafias), o
-- objeto `utm`, e a querystring da página (utm_* e click IDs).
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

-- A plataforma: click ID → utm_source → a da entrada.
create or replace function public._crm_platform_from(p_fields jsonb, p_entry_platform text)
returns text
language sql
immutable
as $$
  select case
    when p_fields ? 'fbclid' or p_fields ? 'ctwa_clid' then 'meta'
    when p_fields ? 'gclid' then 'google'
    when s in ('facebook', 'fb', 'ig', 'instagram', 'meta', 'facebook_ads', 'facebookads', 'instagram_ads',
               'fb_ads', 'meta_ads', 'an', 'msg', 'messenger', 'audience_network') then 'meta'
    when s in ('google', 'adwords', 'google_ads', 'googleads', 'gads', 'google_cpc') then 'google'
    when s like 'tiktok%' then 'tiktok'
    when s in ('linkedin', 'li', 'linkedin_ads') then 'linkedin'
    when s in ('youtube', 'yt') then 'youtube'
    when s like 'kwai%' then 'kwai'
    when s like 'pinterest%' then 'pinterest'
    when s in ('email', 'e-mail', 'newsletter', 'mail', 'mailchimp', 'rdstation', 'rd_station') then 'email'
    when s in ('whatsapp', 'wa', 'wpp') then 'whatsapp'
    when s is not null then coalesce(p_entry_platform, 'outra')
    else p_entry_platform
  end
  from (select lower(btrim(p_fields->>'utm_source')) as s) x;
$$;

-- A categoria: o que o payload prova (anúncio pago) → a da entrada → o meio
-- orgânico. Nunca inventa: sem prova e sem carimbo, fica em branco. `gclid` e
-- `ctwa_clid` só existem em clique de anúncio; `fbclid` não prova nada (o Facebook
-- põe em todo link que sai dele, post orgânico inclusive) — só diz a plataforma.
create or replace function public._crm_category_from(p_fields jsonb, p_platform text, p_entry_category text)
returns text
language sql
immutable
as $$
  select case
    when p_fields ? 'gclid' or p_fields ? 'ctwa_clid'
         or m in ('cpc', 'ppc', 'cpm', 'cpv', 'paid', 'paid_social', 'paid_search', 'paidsocial', 'social_paid',
                  'ads', 'ad', 'sem', 'display') then
      case
        when m in ('paid_social', 'paidsocial', 'social_paid') then 'paid_social'
        when m in ('paid_search', 'sem') then 'paid_search'
        when p_platform = 'google' then 'paid_search'
        when p_platform in ('meta', 'tiktok', 'linkedin', 'youtube', 'kwai', 'pinterest') then 'paid_social'
        else coalesce(p_entry_category, 'paid_social')
      end
    when p_entry_category is not null then p_entry_category
    when m in ('organic', 'social', 'organic_social', 'social_organic') then
      case when p_platform = 'google' then 'organic_search' else 'organic_social' end
    when m in ('referral', 'indicacao') then 'referral'
    else null
  end
  from (select lower(btrim(coalesce(p_fields->>'utm_medium', ''))) as m) x;
$$;

-- A campanha: ID → utm_campaign → nome da campanha → padrão da entrada.
create or replace function public._crm_resolve_campaign(p_equipe_id uuid, p_fields jsonb, p_entry_campaign uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select c.id from public.crm_campaigns c
      where c.equipe_id = p_equipe_id and c.status <> 'archived'
        and lower(btrim(p_fields->>'campaign_ref')) = any (c.match_keys)
      order by c.created_at limit 1),
    (select c.id from public.crm_campaigns c
      where c.equipe_id = p_equipe_id and c.status <> 'archived'
        and lower(btrim(p_fields->>'utm_campaign')) = any (c.match_keys)
      order by c.created_at limit 1),
    (select c.id from public.crm_campaigns c
      where c.equipe_id = p_equipe_id and c.status <> 'archived'
        and lower(btrim(p_fields->>'campaign_name')) = any (c.match_keys)
      order by c.created_at limit 1),
    (select c.id from public.crm_campaigns c
      where c.id = p_entry_campaign and c.equipe_id = p_equipe_id and c.status <> 'archived'));
$$;

-- O payload que fica guardado: sem segredos, e só se couber em 32 KB.
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
         where lower(e.key) !~ '(apikey|api_key|token|secret|password|senha|authorization|cookie)') x;
$$;

-- ============================================================================
-- 7. AS ENTRADAS QUE SE CRIAM SOZINHAS
-- ============================================================================

-- A entrada "Manual" / "Importação" / "Agente de IA" da equipe (cria na primeira vez).
create or replace function public._crm_entry_for(p_equipe_id uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_kind not in ('manual', 'import', 'agent') then
    raise exception 'invalid_entry_kind' using errcode = '22023';
  end if;
  select id into v_id from public.crm_entries where equipe_id = p_equipe_id and kind = p_kind;
  if v_id is null then
    insert into public.crm_entries (equipe_id, kind, name, origin_category)
    values (p_equipe_id, p_kind,
            case p_kind when 'manual' then 'Manual' when 'import' then 'Importação' else 'Agente de IA' end,
            case p_kind when 'import' then 'api_import' end)
    on conflict (equipe_id, kind) where kind in ('manual', 'import', 'agent') do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.crm_entries where equipe_id = p_equipe_id and kind = p_kind;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public._crm_entry_for(uuid, text) from public, anon, authenticated;

-- O nome de um webhook diz de onde ele vem ("Formulário Meta ADS", "Landing
-- Page"): carimbo inicial, que o founder corrige na tela de entradas.
create or replace function public._crm_guess_stamp(p_name text)
returns jsonb
language sql
immutable
as $$
  select case
    when n ~ '(meta|facebook|instagram|fb ads)' then jsonb_build_object('platform', 'meta', 'origin_category', 'paid_social')
    when n ~ '(google|adwords)' then jsonb_build_object('platform', 'google', 'origin_category', 'paid_search')
    when n ~ 'tiktok' then jsonb_build_object('platform', 'tiktok', 'origin_category', 'paid_social')
    when n ~ '(landing|site|lp )|página|pagina' then jsonb_build_object('platform', 'site', 'origin_category', 'direct_brand')
    else '{}'::jsonb
  end
  from (select lower(coalesce(p_name, '')) || ' ' as n) x;
$$;

create or replace function public.fn_crm_entry_for_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g jsonb;
begin
  if new.inbound_function = 'receive_lead' then
    g := public._crm_guess_stamp(new.name);
    insert into public.crm_entries (equipe_id, kind, name, webhook_config_id, platform, origin_category)
    values (new.equipe_id, 'webhook', new.name, new.id, g->>'platform', g->>'origin_category')
    on conflict (webhook_config_id) do update set name = excluded.name, updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.fn_crm_entry_for_webhook() from public, anon, authenticated;

drop trigger if exists trg_crm_entry_for_webhook on public.webhook_configs;
create trigger trg_crm_entry_for_webhook
  after insert or update of name, inbound_function on public.webhook_configs
  for each row execute function public.fn_crm_entry_for_webhook();

-- Os webhooks de entrada que já existem ganham a sua entrada agora.
insert into public.crm_entries (equipe_id, kind, name, webhook_config_id, platform, origin_category)
select c.equipe_id, 'webhook', c.name, c.id,
       public._crm_guess_stamp(c.name)->>'platform', public._crm_guess_stamp(c.name)->>'origin_category'
  from public.webhook_configs c
 where c.inbound_function = 'receive_lead'
on conflict (webhook_config_id) do nothing;

-- ============================================================================
-- 8. O VERBO: GRAVAR UM TOQUE
-- ============================================================================
--
-- Chamado pelas edges (service_role: webhook, WhatsApp, agente) e pela tela
-- (usuário da equipe: cadastro manual). Devolve o toque, se foi o primeiro, e o
-- carimbo resolvido.

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
  v_fields   jsonb;
  v_platform text;
  v_category text;
  v_campaign uuid;
  v_touch    uuid;
  v_first    boolean;
begin
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  -- Usuário do app: só o lead da própria equipe. (service_role e o banco passam.)
  if coalesce(auth.role(), '') = 'authenticated'
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.equipe_id = v_lead.equipe_id) then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  if p_entry_id is null then
    p_entry_id := public._crm_entry_for(v_lead.equipe_id, 'manual');
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
  v_campaign := public._crm_resolve_campaign(v_lead.equipe_id, v_fields, v_entry.campaign_id);

  insert into public.lead_touches (
    equipe_id, lead_id, opportunity_id, entry_id, occurred_at, origin_category, platform, campaign_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, ctwa_clid,
    campaign_ref, campaign_name, adset_id, adset_name, ad_id, ad_name, form_id, form_name,
    landing_page, referrer, raw)
  values (
    v_lead.equipe_id, v_lead.id, p_opportunity_id, v_entry.id, coalesce(p_occurred_at, clock_timestamp()),
    v_category, v_platform, v_campaign,
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
           origin_category = coalesce(v_lead.origin_category, v_category),
           origin_detail   = coalesce(nullif(btrim(v_lead.origin_detail), ''), v_entry.name)
     where id = v_lead.id;
  end if;

  return jsonb_build_object(
    'touch_id', v_touch,
    'first', v_first,
    'entry_id', v_entry.id,
    'origin_category', v_category,
    'platform', v_platform,
    'campaign_id', v_campaign);
end;
$$;

revoke all on function public.crm_record_touch(uuid, uuid, jsonb, uuid, timestamptz) from public, anon;
grant execute on function public.crm_record_touch(uuid, uuid, jsonb, uuid, timestamptz) to authenticated, service_role;
