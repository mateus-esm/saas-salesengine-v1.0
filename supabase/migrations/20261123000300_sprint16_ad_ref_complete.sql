-- 20261123000300_sprint16_ad_ref_complete.sql
-- Sprint 16 · ajuste 2 — o que a sincronização real da Solo mostrou:
--
--   1. O lead do formulário chega com o ID do anúncio PREFIXADO ("ag:1202506…").
--      103 toques do AGO02/SET02 não casavam. _crm_ad_ref tira o prefixo; texto que
--      não é ID (a mensagem "Você não tem permissão…") vira null.
--   2. Anúncio antigo sem vídeo nem destino no gerenciador: o destino vem dos
--      outros anúncios da mesma campanha; o criativo, pelo nome do anúncio.
--      _crm_complete_ads faz isso e roda junto da religação (ingestão, salvar
--      anúncio, salvar criativo).
--
-- Sem begin/commit próprios.

create or replace function public._crm_ad_ref(p text)
returns text
language sql
immutable
as $$
  select case
    when x ~ '^[A-Za-z0-9_.-]{1,120}$' then x
  end
  from (select regexp_replace(btrim(coalesce(p, '')), '^[A-Za-z_]{1,12}:', '') as x) s;
$$;

create index if not exists idx_lead_touches_ad_ref on public.lead_touches (equipe_id, public._crm_ad_ref(ad_id))
  where ad_id is not null and crm_ad_id is null;

create or replace function public._crm_resolve_ad(p_equipe_id uuid, p_fields jsonb, p_text text)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select a.id from public.crm_ads a
      where a.equipe_id = p_equipe_id
        and public._crm_ad_ref(p_fields->>'ad_id') is not null
        and a.external_ad_id = public._crm_ad_ref(p_fields->>'ad_id')
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

-- Completa o anúncio que o gerenciador deixou sem destino/criativo.
create or replace function public._crm_complete_ads(p_equipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Destino: o mais comum entre os anúncios da mesma campanha da plataforma.
  update public.crm_ads a
     set destination = s.destination
    from (select a2.campaign_external_id, mode() within group (order by a2.destination) as destination
            from public.crm_ads a2
           where a2.equipe_id = p_equipe_id and a2.destination is not null and a2.campaign_external_id is not null
           group by a2.campaign_external_id) s
   where a.equipe_id = p_equipe_id and a.destination is null and a.campaign_external_id = s.campaign_external_id;

  -- Criativo pelo nome, quando não há vídeo/imagem/criativo da plataforma.
  insert into public.crm_creatives (equipe_id, code, title, external_key, thumbnail_url, preview_url, body, headline, source)
  select distinct on (upper(left(btrim(a.ad_name), 60)))
         p_equipe_id, upper(left(btrim(a.ad_name), 60)), '', 'name:' || upper(left(btrim(a.ad_name), 60)),
         a.thumbnail_url, a.preview_url, a.body, a.headline, 'windsor'
    from public.crm_ads a
   where a.equipe_id = p_equipe_id and a.creative_id is null and a.source = 'windsor'
     and nullif(btrim(a.ad_name), '') is not null
     and public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id) is null
   order by upper(left(btrim(a.ad_name), 60)), a.last_seen_at desc nulls last
  on conflict do nothing;

  update public.crm_ads a
     set creative_id = cr.id
    from public.crm_creatives cr
   where a.equipe_id = p_equipe_id and a.creative_id is null and a.source = 'windsor'
     and cr.equipe_id = p_equipe_id
     and public._crm_ad_key(a.video_id, a.image_hash, a.platform_creative_id) is null
     and (cr.external_key = 'name:' || upper(left(btrim(a.ad_name), 60)) or cr.code = upper(left(btrim(a.ad_name), 60)));

  -- Vídeo cujo criativo nasceu antes com outro nome (o código já existia): pelo código.
  update public.crm_ads a
     set creative_id = cr.id
    from public.crm_creatives cr
   where a.equipe_id = p_equipe_id and a.creative_id is null
     and cr.equipe_id = p_equipe_id and cr.code = upper(left(btrim(a.ad_name), 60));

  update public.crm_ads a
     set needs_review = (a.campaign_id is null or a.creative_id is null or a.destination is null)
   where a.equipe_id = p_equipe_id
     and a.needs_review is distinct from (a.campaign_id is null or a.creative_id is null or a.destination is null);
end;
$$;

create or replace function public._crm_relink_touches(p_equipe_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform public._crm_complete_ads(p_equipe_id);

  update public.lead_touches t
     set crm_ad_id = a.id,
         platform = a.platform,
         origin_category = case when a.platform = 'google' then 'paid_search' else 'paid_social' end
    from public.crm_ads a
   where t.equipe_id = p_equipe_id and t.crm_ad_id is null and t.ad_id is not null
     and a.equipe_id = p_equipe_id and a.external_ad_id = public._crm_ad_ref(t.ad_id);
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

revoke all on function public._crm_complete_ads(uuid) from public, anon, authenticated;
revoke all on function public._crm_relink_touches(uuid) from public, anon, authenticated;
revoke all on function public._crm_resolve_ad(uuid, jsonb, text) from public, anon, authenticated;
