-- 20261123000400_sprint16_unlinked_sources.sql
-- Sprint 16 · ajuste 3 — leads sem campanha.
--
-- O histórico importado (Jestor) chegou só com o rótulo da origem antiga
-- ("Tráfego Pago", "Indicação", "Base Ativa"…), sem anúncio nem UTM. Sem campanha,
-- o lead não entra no retorno. Aqui: a lista desses grupos (categoria + detalhe
-- da origem) e o verbo que liga um grupo inteiro a uma campanha — o lead e o
-- primeiro toque dele. Nada é inventado: quem escolhe a campanha é a equipe.
--
-- Sem begin/commit próprios.

-- O rótulo do grupo: o detalhe da origem, ou o `source` antigo.
create or replace function public._crm_source_label(p_detail text, p_source text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(btrim(p_detail), ''), nullif(btrim(p_source), ''), '(sem detalhe)');
$$;

create or replace function public.crm_unlinked_sources(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'origin_category', g.origin_category, 'label', g.label, 'leads', g.leads,
           'wins', g.wins, 'first_at', g.first_at, 'last_at', g.last_at)
         order by g.leads desc), '[]'::jsonb)
    from (select l.origin_category, public._crm_source_label(l.origin_detail, l.source) as label,
                 count(*) as leads,
                 count(*) filter (where exists (select 1 from public.opportunities o
                                                 where o.lead_id = l.id and o.status = 'won' and o.deleted_at is null)) as wins,
                 min(l.created_at) as first_at, max(l.created_at) as last_at
            from public.leads l
           where l.equipe_id = public._crm_my_team() and l.deleted_at is null and l.campaign_id is null
           group by 1, 2
           order by count(*) desc
           limit greatest(1, least(coalesce(p_limit, 50), 200))) g;
$$;

-- Liga o grupo (categoria + rótulo) à campanha: os leads sem campanha e o primeiro toque deles.
create or replace function public.crm_link_source(p_campaign_id uuid, p_origin_category text, p_label text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid := public._crm_my_team();
  v_n      integer;
begin
  if v_equipe is null or not exists (select 1 from public.crm_campaigns c
                                      where c.id = p_campaign_id and c.equipe_id = v_equipe and c.status <> 'archived') then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;

  with upd as (
    update public.leads l
       set campaign_id = p_campaign_id
     where l.equipe_id = v_equipe and l.deleted_at is null and l.campaign_id is null
       and l.origin_category is not distinct from nullif(p_origin_category, '')
       and public._crm_source_label(l.origin_detail, l.source) = p_label
    returning l.first_touch_id
  )
  update public.lead_touches t
     set campaign_id = p_campaign_id
    from upd
   where t.id = upd.first_touch_id and t.campaign_id is null;

  select count(*) into v_n from public.leads l
   where l.equipe_id = v_equipe and l.campaign_id = p_campaign_id
     and l.origin_category is not distinct from nullif(p_origin_category, '')
     and public._crm_source_label(l.origin_detail, l.source) = p_label;
  return v_n;
end;
$$;

revoke all on function public.crm_unlinked_sources(integer) from public, anon;
revoke all on function public.crm_link_source(uuid, text, text) from public, anon;
grant execute on function public.crm_unlinked_sources(integer) to authenticated;
grant execute on function public.crm_link_source(uuid, text, text) to authenticated;
