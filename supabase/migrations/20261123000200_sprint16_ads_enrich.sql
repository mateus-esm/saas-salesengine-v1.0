-- 20261123000200_sprint16_ads_enrich.sql
-- Sprint 16 · ajuste 1 — puxar mais do gerenciador e não deixar o anúncio "a completar".
--
-- O que o Windsor passa a trazer de cada anúncio (pedido separado, sem métrica):
-- objetivo da campanha, tipo de destino do conjunto, ID do vídeo / hash da imagem /
-- ID do criativo, miniatura, texto, título, botão, status, verba diária e o link de
-- prévia. Com isso a sincronização:
--
--   1. CRIA A CAMPANHA do Rev que falta, uma por campanha da plataforma (nome da
--      plataforma, chave = ID dela, Social/Busca Paga). Campanha que já tem a chave
--      — ou o nome como chave, mesmo arquivada — não é recriada.
--   2. CRIA O CRIATIVO pelo VÍDEO (ou imagem, ou criativo): o mesmo vídeo em duas
--      campanhas é um criativo só. O código é o do nome (P000-V0) se houver; senão
--      o nome do anúncio. Por isso o código do criativo deixa de exigir P000-V0.
--   3. PREENCHE O DESTINO: WHATSAPP → WhatsApp, ON_AD → formulário, WEBSITE → site.
--   4. O STATUS segue o gerenciador (ACTIVE → ativo, ARCHIVED/DELETED → arquivado,
--      o resto → pausado).
--
-- Sem begin/commit próprios.

-- ============================================================================
-- 1. COLUNAS
-- ============================================================================

alter table public.crm_ads add column if not exists objective             text;
alter table public.crm_ads add column if not exists destination_type      text;
alter table public.crm_ads add column if not exists video_id              text;
alter table public.crm_ads add column if not exists image_hash            text;
alter table public.crm_ads add column if not exists platform_creative_id  text;
alter table public.crm_ads add column if not exists thumbnail_url         text;
alter table public.crm_ads add column if not exists body                  text;
alter table public.crm_ads add column if not exists headline              text;
alter table public.crm_ads add column if not exists cta                   text;
alter table public.crm_ads add column if not exists effective_status      text;
alter table public.crm_ads add column if not exists platform_daily_budget numeric(14,2);
alter table public.crm_ads add column if not exists preview_url           text;

alter table public.crm_creatives add column if not exists external_key  text;
alter table public.crm_creatives add column if not exists thumbnail_url text;
alter table public.crm_creatives add column if not exists preview_url   text;
alter table public.crm_creatives add column if not exists body          text;
alter table public.crm_creatives add column if not exists headline      text;
alter table public.crm_creatives add column if not exists source        text not null default 'manual';
create unique index if not exists uq_crm_creatives_external
  on public.crm_creatives (equipe_id, external_key) where external_key is not null;

-- O código: P000-V0 recomendado, qualquer nome aceito (maiúsculas, até 60).
alter table public.crm_creatives drop constraint if exists crm_creatives_code_check;
alter table public.crm_creatives add constraint crm_creatives_code_check
  check (code = upper(btrim(code)) and length(code) between 1 and 60);

create or replace function public._crm_ad_key(p_video text, p_image text, p_creative text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(p_video), '') is not null then 'video:' || btrim(p_video)
    when nullif(btrim(p_image), '') is not null then 'image:' || btrim(p_image)
    when nullif(btrim(p_creative), '') is not null then 'creative:' || btrim(p_creative)
  end;
$$;

-- ============================================================================
-- 2. O CADASTRO MANUAL DO CRIATIVO (código livre)
-- ============================================================================

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
  if length(v_code) not between 1 and 60 then
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

-- ============================================================================
-- 3. A INGESTÃO, AGORA COM O ANÚNCIO
-- ============================================================================

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
  v_camps   integer;
  v_crs     integer;
begin
  create temporary table if not exists _windsor_rows2 (
    platform text, day date, account_id text, account_name text, campaign_external_id text, campaign_name text,
    adset_external_id text, adset_name text, external_ad_id text, ad_name text, spend numeric, impressions bigint,
    reach bigint, clicks bigint, video_3s bigint, thruplays bigint, platform_leads integer, conversations integer,
    objective text, destination_type text, video_id text, image_hash text, creative_ext_id text, thumbnail_url text,
    body text, headline text, cta text, effective_status text, daily_budget numeric, preview_url text
  ) on commit drop;
  truncate _windsor_rows2;

  insert into _windsor_rows2
  select x.platform, x.day, x.account_id, x.account_name, x.campaign_external_id, x.campaign_name,
         x.adset_external_id, x.adset_name, btrim(x.external_ad_id), x.ad_name, greatest(coalesce(x.spend, 0), 0),
         coalesce(x.impressions, 0), coalesce(x.reach, 0), coalesce(x.clicks, 0), coalesce(x.video_3s, 0),
         coalesce(x.thruplays, 0), coalesce(x.platform_leads, 0), coalesce(x.conversations, 0),
         x.objective, x.destination_type, x.video_id, x.image_hash, x.creative_ext_id, x.thumbnail_url,
         left(x.body, 2000), left(x.headline, 300), x.cta, x.effective_status, x.daily_budget, x.preview_url
    from jsonb_to_recordset(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as x(
         platform text, day date, account_id text, account_name text, campaign_external_id text, campaign_name text,
         adset_external_id text, adset_name text, external_ad_id text, ad_name text, spend numeric, impressions bigint,
         reach bigint, clicks bigint, video_3s bigint, thruplays bigint, platform_leads integer, conversations integer,
         objective text, destination_type text, video_id text, image_hash text, creative_ext_id text, thumbnail_url text,
         body text, headline text, cta text, effective_status text, daily_budget numeric, preview_url text)
   where x.platform = any (public._crm_ad_platforms()) and x.day is not null and nullif(btrim(x.external_ad_id), '') is not null;

  -- Anúncios: cria/atualiza com nomes, IDs e o que o gerenciador diz dele.
  with latest as (
    select distinct on (platform, external_ad_id) *
      from _windsor_rows2 order by platform, external_ad_id, day desc
  ), firsts as (
    select platform, external_ad_id, min(day) first_day, max(day) last_day from _windsor_rows2 group by 1, 2
  ), up as (
    insert into public.crm_ads as a (equipe_id, platform, external_ad_id, ad_name, adset_external_id, adset_name,
                                     campaign_external_id, campaign_name, account_id, account_name, source,
                                     needs_review, first_seen_at, last_seen_at,
                                     objective, destination_type, video_id, image_hash, platform_creative_id, thumbnail_url,
                                     body, headline, cta, effective_status, platform_daily_budget, preview_url)
    select p_equipe_id, l.platform, l.external_ad_id, l.ad_name, l.adset_external_id, l.adset_name,
           l.campaign_external_id, l.campaign_name, l.account_id, l.account_name, 'windsor', true,
           f.first_day::timestamptz, f.last_day::timestamptz,
           l.objective, l.destination_type, l.video_id, l.image_hash, l.creative_ext_id, l.thumbnail_url,
           l.body, l.headline, l.cta, l.effective_status, l.daily_budget, l.preview_url
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
           objective = coalesce(excluded.objective, a.objective),
           destination_type = coalesce(excluded.destination_type, a.destination_type),
           video_id = coalesce(excluded.video_id, a.video_id),
           image_hash = coalesce(excluded.image_hash, a.image_hash),
           platform_creative_id = coalesce(excluded.platform_creative_id, a.platform_creative_id),
           thumbnail_url = coalesce(excluded.thumbnail_url, a.thumbnail_url),
           body = coalesce(excluded.body, a.body),
           headline = coalesce(excluded.headline, a.headline),
           cta = coalesce(excluded.cta, a.cta),
           effective_status = coalesce(excluded.effective_status, a.effective_status),
           platform_daily_budget = coalesce(excluded.platform_daily_budget, a.platform_daily_budget),
           preview_url = coalesce(excluded.preview_url, a.preview_url),
           updated_at = now()
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_new from up;

  -- Status e destino pelo gerenciador (o destino escolhido à mão fica).
  update public.crm_ads a
     set status = case
                    when upper(a.effective_status) = 'ACTIVE' then 'active'
                    when upper(a.effective_status) in ('ARCHIVED', 'DELETED') then 'archived'
                    else 'paused'
                  end
   where a.equipe_id = p_equipe_id and a.source = 'windsor' and a.effective_status is not null;
  update public.crm_ads a
     set destination = case
                         when upper(a.destination_type) like '%WHATSAPP%' or upper(a.cta) like 'WHATSAPP%' then 'whatsapp'
                         when upper(a.destination_type) = 'ON_AD' or upper(a.objective) in ('OUTCOME_LEADS', 'LEAD_GENERATION') then 'form'
                         when upper(a.destination_type) in ('WEBSITE', 'APP') or upper(a.objective) in ('OUTCOME_TRAFFIC', 'OUTCOME_SALES', 'LINK_CLICKS', 'CONVERSIONS') then 'site'
                         when a.destination_type is not null then 'other'
                       end
   where a.equipe_id = p_equipe_id and a.destination is null
     and (a.destination_type is not null or a.cta is not null or a.objective is not null);

  -- 1. Campanhas: as que faltam nascem da plataforma (uma por ID).
  with ins as (
    insert into public.crm_campaigns (equipe_id, name, platform, origin_category, status, match_keys)
    select distinct on (a.campaign_external_id)
           p_equipe_id,
           left(coalesce(nullif(btrim(a.campaign_name), ''), 'Campanha ' || a.campaign_external_id), 120),
           a.platform,
           case when a.platform = 'google' then 'paid_search' else 'paid_social' end,
           'active',
           array[lower(a.campaign_external_id)]
      from public.crm_ads a
     where a.equipe_id = p_equipe_id and a.campaign_id is null and nullif(btrim(a.campaign_external_id), '') is not null
       and not exists (select 1 from public.crm_campaigns c
                        where c.equipe_id = p_equipe_id
                          and (lower(a.campaign_external_id) = any (c.match_keys)
                               or lower(btrim(a.campaign_name)) = any (c.match_keys)))
     order by a.campaign_external_id, a.last_seen_at desc nulls last
    returning 1
  )
  select count(*) into v_camps from ins;

  update public.crm_ads a
     set campaign_id = c.id
    from public.crm_campaigns c
   where a.equipe_id = p_equipe_id and a.campaign_id is null
     and c.equipe_id = p_equipe_id and c.status <> 'archived'
     and (lower(a.campaign_external_id) = any (c.match_keys) or lower(btrim(a.campaign_name)) = any (c.match_keys));

  -- 2. Criativos: o código P000-V0 do nome manda; senão o vídeo/imagem/criativo.
  insert into public.crm_creatives (equipe_id, code, title, source)
  select distinct on (public._crm_creative_code(r.ad_name)) p_equipe_id, public._crm_creative_code(r.ad_name),
         left(btrim(coalesce((regexp_split_to_array(r.ad_name, '\s*\|\s*'))[2], '')), 160), 'windsor'
    from _windsor_rows2 r
   where public._crm_creative_code(r.ad_name) is not null
   order by public._crm_creative_code(r.ad_name), r.day desc
  on conflict (equipe_id, code) do nothing;

  update public.crm_ads a
     set creative_id = cr.id
    from public.crm_creatives cr
   where a.equipe_id = p_equipe_id and a.creative_id is null
     and cr.equipe_id = p_equipe_id and cr.code = public._crm_creative_code(a.ad_name);

  with k as (
    select distinct on (public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id))
           public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id) as key,
           upper(left(btrim(coalesce(nullif(btrim(a.ad_name), ''), a.external_ad_id)), 50)) as base,
           a.thumbnail_url, a.preview_url, a.body, a.headline,
           (select count(*) from public.crm_ads a2
             where a2.equipe_id = p_equipe_id
               and public._crm_ad_key(a2.video_id, a2.image_hash, a2.platform_creative_id)
                   = public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id)) as n_ads
      from public.crm_ads a
     where a.equipe_id = p_equipe_id and a.creative_id is null
       and public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id) is not null
       and not exists (select 1 from public.crm_creatives c where c.equipe_id = p_equipe_id
                        and c.external_key = public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id))
     order by public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id), a.last_seen_at desc nulls last
  ), named as (
    select k.*, row_number() over (partition by k.base order by k.n_ads desc, k.key) as rn from k
  ), ins as (
    insert into public.crm_creatives (equipe_id, code, title, external_key, thumbnail_url, preview_url, body, headline, source)
    select p_equipe_id,
           case when n.rn = 1 and not exists (select 1 from public.crm_creatives c where c.equipe_id = p_equipe_id and c.code = n.base)
                then n.base
                else left(n.base, 50) || ' #' || right(n.key, 4) end,
           '', n.key, n.thumbnail_url, n.preview_url, n.body, n.headline, 'windsor'
      from named n
    on conflict do nothing
    returning 1
  )
  select count(*) into v_crs from ins;

  update public.crm_ads a
     set creative_id = cr.id
    from public.crm_creatives cr
   where a.equipe_id = p_equipe_id and a.creative_id is null
     and cr.equipe_id = p_equipe_id
     and cr.external_key = public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id);

  -- A miniatura e o texto do criativo vêm do anúncio mais recente dele.
  update public.crm_creatives cr
     set thumbnail_url = coalesce(cr.thumbnail_url, s.thumbnail_url),
         preview_url = coalesce(cr.preview_url, s.preview_url),
         body = coalesce(cr.body, s.body),
         headline = coalesce(cr.headline, s.headline),
         external_key = coalesce(cr.external_key, s.key)
    from (select distinct on (a.creative_id) a.creative_id, a.thumbnail_url, a.preview_url, a.body, a.headline,
                 public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id) as key
            from public.crm_ads a
           where a.equipe_id = p_equipe_id and a.creative_id is not null
           order by a.creative_id, a.last_seen_at desc nulls last) s
   where cr.id = s.creative_id
     and (cr.thumbnail_url is null or cr.body is null or cr.preview_url is null or cr.headline is null
          or (cr.external_key is null and s.key is not null
              and not exists (select 1 from public.crm_creatives o where o.equipe_id = p_equipe_id and o.external_key = s.key)));

  update public.crm_ads a
     set needs_review = (a.campaign_id is null or a.creative_id is null or a.destination is null)
   where a.equipe_id = p_equipe_id
     and a.needs_review is distinct from (a.campaign_id is null or a.creative_id is null or a.destination is null);

  insert into public.crm_ad_metrics as m (ad_id, equipe_id, day, spend, impressions, reach, clicks, video_3s, thruplays,
                                          platform_leads, conversations, synced_at)
  select a.id, p_equipe_id, r.day, round(sum(r.spend), 2), sum(r.impressions), sum(r.reach), sum(r.clicks),
         sum(r.video_3s), sum(r.thruplays), sum(r.platform_leads), sum(r.conversations), now()
    from _windsor_rows2 r
    join public.crm_ads a on a.equipe_id = p_equipe_id and a.platform = r.platform and a.external_ad_id = r.external_ad_id
   group by a.id, r.day
  on conflict (ad_id, day) do update
     set spend = excluded.spend, impressions = excluded.impressions, reach = excluded.reach, clicks = excluded.clicks,
         video_3s = excluded.video_3s, thruplays = excluded.thruplays, platform_leads = excluded.platform_leads,
         conversations = excluded.conversations, synced_at = now();
  get diagnostics v_metrics = row_count;

  v_linked := public._crm_relink_touches(p_equipe_id);
  perform public._crm_rollup_spend(p_equipe_id);

  return jsonb_build_object('new_ads', v_new, 'metric_rows', v_metrics, 'linked_touches', v_linked,
                            'new_campaigns', v_camps, 'new_creatives', v_crs);
end;
$$;

revoke all on function public._crm_windsor_ingest(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._crm_windsor_ingest(uuid, jsonb) to service_role;
revoke all on function public.crm_save_creative(jsonb) from public, anon;
grant execute on function public.crm_save_creative(jsonb) to authenticated;
