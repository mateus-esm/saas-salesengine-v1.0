-- Sprint 11 · Onda 5 · T54 — filtros, quebras e o relatório de campanha (ROI).
--
-- FILTROS. O filtro compilado da Onda 2 ganha campanha (com "sem campanha"),
-- plataforma (com "sem plataforma") e entrada — do primeiro toque do lead — no
-- Kanban, na Tabela de Leads e na Base de Contatos. As condições entram no fim
-- e começam pelo "is null": filtro vazio não custa nada.
--
-- QUEBRAS. `get_funnel_breakdown` ganha as dimensões `campaign`, `platform` e
-- `entry` (a do primeiro toque do lead), com as mesmas contas das outras.
--
-- RELATÓRIO. `crm_campaign_report(de, até, linhas, responsáveis)`: por campanha
-- (e "Sem campanha"), no período — leads (primeiro toque no período), negócios
-- criados, ganhos, perdas, receita reconhecida (livro-razão da Onda 3, líquida),
-- investimento — e CPL, custo por ganho, taxa de ganho, ROAS (receita ÷
-- investimento) e ROI ((receita − investimento) ÷ investimento). Conta como o
-- dashboard: mesmo escopo (o vendedor vê o seu), mesmos filtros de linha e de
-- responsável, ganho e perda pelo evento (o dono do momento), receita pelo
-- livro-razão. O investimento é da campanha inteira: não tem linha nem dono.

-- ============================================================================
-- 1. O FILTRO COMPILADO GANHA CAMPANHA, PLATAFORMA E ENTRADA
-- ============================================================================

do $$
declare
  t text;
  a record;
begin
  foreach t in array array['crm_opp_filter', 'crm_lead_filter'] loop
    for a in select * from (values ('campaign_ids', 'uuid[]'), ('campaign_none', 'boolean'),
                                   ('platforms', 'text[]'), ('entry_ids', 'uuid[]')) v(name, typ) loop
      if not exists (select 1 from pg_attribute att join pg_type ty on ty.typrelid = att.attrelid
                      where ty.typname = t and att.attname = a.name and not att.attisdropped) then
        execute format('alter type public.%I add attribute %I %s', t, a.name, a.typ);
      end if;
    end loop;
  end loop;
end $$;

-- As três chaves novas, iguais nos dois compiladores.
create or replace function public._crm_compile_origin_keys(p jsonb, out campaign_ids uuid[], out campaign_none boolean,
                                                           out platforms text[], out entry_ids uuid[])
language plpgsql
stable
set search_path = public
as $$
begin
  if public._crm_jarr_len(p->'campaign_ids') > 0 then
    campaign_ids  := coalesce(public._crm_uuid_list(p->'campaign_ids'), '{}');
    campaign_none := p->'campaign_ids' ? 'none';
  end if;
  if public._crm_jarr_len(p->'platforms') > 0 then
    platforms := public._crm_text_list(p->'platforms');
  end if;
  if public._crm_jarr_len(p->'entry_ids') > 0 then
    entry_ids := coalesce(public._crm_uuid_list(p->'entry_ids'), '{}');
  end if;
end;
$$;

create or replace function public._crm_compile_opp_filters(p_filters jsonb)
returns public.crm_opp_filter
language plpgsql
stable
set search_path = public
as $$
declare
  p jsonb := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  r public.crm_opp_filter;
  o record;
  v_digits text;
begin
  r.search := nullif(btrim(coalesce(p->>'search', '')), '');
  if r.search is not null then
    v_digits := regexp_replace(r.search, '\D', '', 'g');
    if length(v_digits) >= 6 then
      r.search_digits := v_digits;
      r.search_phone  := coalesce(public.normalize_phone_br(r.search), '-');
    end if;
  end if;

  r.created_from := public._crm_try_timestamptz(p->>'created_from');
  r.created_to   := public._crm_try_timestamptz(p->>'created_to');

  if public._crm_jarr_len(p->'owner_ids') > 0 then
    r.owner_ids  := public._crm_uuid_list(p->'owner_ids');
    r.owner_none := p->'owner_ids' ? 'none';
  end if;
  if public._crm_jarr_len(p->'stage_ids') > 0 then
    r.stage_ids := public._crm_uuid_list(p->'stage_ids');
  end if;
  if public._crm_jarr_len(p->'statuses') > 0 then
    r.statuses := public._crm_text_list(p->'statuses');
  end if;
  if public._crm_jarr_len(p->'origin_categories') > 0 then
    r.origins := public._crm_text_list(p->'origin_categories');
  end if;
  if public._crm_jarr_len(p->'tags') > 0 then
    r.tags := public._crm_text_list(p->'tags');
  end if;

  r.value_min := public._crm_try_numeric(p->>'value_min');
  r.value_max := public._crm_try_numeric(p->>'value_max');

  if p->>'next_contact' in ('overdue', 'today', 'week', 'none') then
    r.next_contact := p->>'next_contact';
  end if;
  r.today := (now() at time zone 'America/Sao_Paulo')::date;

  if public._crm_jarr_len(p->'custom') > 0 then
    r.custom := p->'custom';
  end if;

  select * into o from public._crm_compile_origin_keys(p);
  r.campaign_ids := o.campaign_ids; r.campaign_none := o.campaign_none;
  r.platforms := o.platforms; r.entry_ids := o.entry_ids;
  return r;
end;
$$;

create or replace function public._crm_compile_lead_filters(p_filters jsonb)
returns public.crm_lead_filter
language plpgsql
stable
set search_path = public
as $$
declare
  p jsonb := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  r public.crm_lead_filter;
  o record;
  v_digits text;
begin
  r.search := nullif(btrim(coalesce(p->>'search', '')), '');
  if r.search is not null then
    v_digits := regexp_replace(r.search, '\D', '', 'g');
    if length(v_digits) >= 6 then
      r.search_digits := v_digits;
      r.search_phone  := coalesce(public.normalize_phone_br(r.search), '-');
    end if;
  end if;

  r.created_from := public._crm_try_timestamptz(p->>'created_from');
  r.created_to   := public._crm_try_timestamptz(p->>'created_to');

  if public._crm_jarr_len(p->'origin_categories') > 0 then
    r.origins := public._crm_text_list(p->'origin_categories');
  end if;
  if public._crm_jarr_len(p->'tags') > 0 then
    r.tags := public._crm_text_list(p->'tags');
  end if;
  if p->>'next_contact' in ('overdue', 'today', 'week', 'none') then
    r.next_contact := p->>'next_contact';
  end if;
  r.today := (now() at time zone 'America/Sao_Paulo')::date;

  if public._crm_jarr_len(p->'relationship') > 0 then
    r.relationship := public._crm_text_list(p->'relationship');
  end if;
  if public._crm_jarr_len(p->'pipeline_ids') > 0 then
    r.pipeline_ids := public._crm_uuid_list(p->'pipeline_ids');
  end if;
  if public._crm_jarr_len(p->'deal_owner_ids') > 0 then
    r.deal_owner_ids  := public._crm_uuid_list(p->'deal_owner_ids');
    r.deal_owner_none := p->'deal_owner_ids' ? 'none';
  end if;

  select * into o from public._crm_compile_origin_keys(p);
  r.campaign_ids := o.campaign_ids; r.campaign_none := o.campaign_none;
  r.platforms := o.platforms; r.entry_ids := o.entry_ids;
  return r;
end;
$$;

-- A origem do lead contra o filtro (o planner embute: SQL puro, "is null" primeiro).
create or replace function public._crm_origin_matches_c(
  l public.leads, p_campaign_ids uuid[], p_campaign_none boolean, p_platforms text[], p_entry_ids uuid[])
returns boolean
language sql
stable
as $$
  select (p_campaign_ids is null
          or (l.campaign_id is null and coalesce(p_campaign_none, false))
          or (l.campaign_id is not null and l.campaign_id = any(p_campaign_ids)))
     and (p_platforms is null or coalesce(l.origin_platform, 'none') = any(p_platforms))
     and (p_entry_ids is null or l.entry_id = any(p_entry_ids));
$$;

create or replace function public._crm_opp_matches_c(o public.opportunities, l public.leads, f public.crm_opp_filter)
returns boolean
language sql
stable
as $$
  select public._crm_search_c(l, f.search, f.search_digits, f.search_phone)
    and (f.created_from is null or o.created_at >= f.created_from)
    and (f.created_to   is null or o.created_at <  f.created_to)
    and (f.owner_ids is null
         or (o.owner_id is null and coalesce(f.owner_none, false))
         or (o.owner_id is not null and o.owner_id = any(f.owner_ids)))
    and (f.stage_ids is null or o.stage_id = any(f.stage_ids))
    and (f.statuses  is null or o.status = any(f.statuses))
    and (f.origins   is null or l.origin_category = any(f.origins))
    and (f.tags      is null or l.tags && f.tags)
    and (f.value_min is null or o.value >= f.value_min)
    and (f.value_max is null or o.value <= f.value_max)
    and public._crm_next_contact_c(l.next_contact, f.next_contact, f.today)
    and (f.custom is null or public._crm_custom_matches(o.custom_data, f.custom))
    and public._crm_origin_matches_c(l, f.campaign_ids, f.campaign_none, f.platforms, f.entry_ids);
$$;

create or replace function public._crm_lead_matches_c(
  l public.leads, f public.crm_lead_filter, p_relationship text, p_pipelines uuid[], p_owners uuid[], p_unowned boolean)
returns boolean
language sql
stable
as $$
  select public._crm_search_c(l, f.search, f.search_digits, f.search_phone)
    and (f.created_from is null or l.created_at >= f.created_from)
    and (f.created_to   is null or l.created_at <  f.created_to)
    and (f.origins is null or l.origin_category = any(f.origins))
    and (f.tags    is null or l.tags && f.tags)
    and public._crm_next_contact_c(l.next_contact, f.next_contact, f.today)
    and (f.relationship is null or p_relationship = any(f.relationship))
    and (f.pipeline_ids is null or coalesce(p_pipelines && f.pipeline_ids, false))
    and (f.deal_owner_ids is null
         or (coalesce(f.deal_owner_none, false) and coalesce(p_unowned, false))
         or coalesce(p_owners && f.deal_owner_ids, false))
    and public._crm_origin_matches_c(l, f.campaign_ids, f.campaign_none, f.platforms, f.entry_ids);
$$;

-- ============================================================================
-- 2. AS QUEBRAS POR CAMPANHA, PLATAFORMA E ENTRADA
-- ============================================================================

create or replace function public._crm_platform_label(p text)
returns text
language sql
immutable
as $$
  select case p
    when 'meta' then 'Meta (Facebook/Instagram)' when 'google' then 'Google' when 'tiktok' then 'TikTok'
    when 'linkedin' then 'LinkedIn' when 'youtube' then 'YouTube' when 'kwai' then 'Kwai'
    when 'pinterest' then 'Pinterest' when 'email' then 'E-mail' when 'whatsapp' then 'WhatsApp'
    when 'site' then 'Site' when 'outra' then 'Outra'
  end;
$$;

create or replace function public.get_funnel_breakdown(
  p_dimension       text,
  p_from            timestamptz,
  p_to              timestamptz,
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null,
  p_channels        text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_equipe   uuid;
  v_restrict uuid;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  if p_dimension not in ('pipeline', 'responsible', 'channel', 'contact_channel', 'origin_group', 'loss_reason',
                         'product', 'campaign', 'platform', 'entry') then
    raise exception 'invalid_dimension: %', p_dimension using errcode = '22023';
  end if;

  with
  opps_all as (
    select o.id, o.value, o.status, o.pipeline_id, o.lost_reason, o.created_at, o.owner_id,
           c.acquisition_channel, c.contact_channel, c.acquisition_group,
           coalesce(cp.name, 'Sem campanha') as campaign_label,
           coalesce(public._crm_platform_label(l.origin_platform), 'Sem plataforma') as platform_label,
           coalesce(en.name, 'Sem entrada') as entry_label
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
      join public.v_lead_channel c on c.lead_id = l.id
      left join public.crm_campaigns cp on cp.id = l.campaign_id
      left join public.crm_entries en on en.id = l.entry_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and l.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
       and (p_channels is null or c.acquisition_channel = any(p_channels))
  ),
  -- Estado: uma linha por negócio; o responsável é o dono atual.
  state_rows as (
    select
      case p_dimension
        when 'pipeline'        then coalesce(pl.name, 'Sem pipeline')
        when 'responsible'     then coalesce(pr.nome_completo, 'Não atribuído')
        when 'channel'         then o.acquisition_channel
        when 'contact_channel' then o.contact_channel
        when 'origin_group'    then coalesce(o.acquisition_group, 'Não classificado')
        when 'loss_reason'     then coalesce(o.lost_reason, 'Não informado')
        when 'campaign'        then o.campaign_label
        when 'platform'        then o.platform_label
        when 'entry'           then o.entry_label
      end as label,
      o.id, o.value, o.status, o.created_at
      from opps_all o
      left join public.pipelines pl on pl.id = o.pipeline_id
      left join public.profiles  pr on pr.id = o.owner_id
     where (v_restrict is null or o.owner_id = v_restrict)
       and (p_responsible_ids is null or o.owner_id = any(p_responsible_ids))
       and p_dimension <> 'product'
  ),
  -- Evento: uma linha por evento na janela; o responsável é o dono do momento.
  event_rows as (
    select
      case p_dimension
        when 'pipeline'        then coalesce(pl.name, 'Sem pipeline')
        when 'responsible'     then coalesce(pr.nome_completo, 'Não atribuído')
        when 'channel'         then o.acquisition_channel
        when 'contact_channel' then o.contact_channel
        when 'origin_group'    then coalesce(o.acquisition_group, 'Não classificado')
        when 'loss_reason'     then coalesce(o.lost_reason, 'Não informado')
        when 'campaign'        then o.campaign_label
        when 'platform'        then o.platform_label
        when 'entry'           then o.entry_label
      end as label,
      fe.opportunity_id, fe.event, o.value
      from public.funnel_events fe
      join opps_all o on o.id = fe.opportunity_id
      left join public.pipelines pl on pl.id = o.pipeline_id
      left join public.profiles  pr on pr.id = fe.owner_id
     where fe.equipe_id = v_equipe
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and (v_restrict is null or fe.owner_id = v_restrict)
       and (p_responsible_ids is null or fe.owner_id = any(p_responsible_ids))
       and p_dimension <> 'product'
       and not (fe.event in ('won', 'lost') and exists (
             select 1 from public.funnel_events reo
              where reo.opportunity_id = fe.opportunity_id
                and reo.event = 'reopened'
                and reo.occurred_at > fe.occurred_at))
  ),
  state_agg as (
    select label,
           count(*) filter (where created_at >= p_from and created_at < p_to) as new_opportunities,
           count(*) filter (where status = 'open')                             as open_count,
           coalesce(sum(value) filter (where status = 'open'), 0)              as open_value
      from state_rows
     group by label
  ),
  event_agg as (
    select label,
           count(*) filter (where event = 'proposal_sent')                   as proposals_sent,
           count(*) filter (where event = 'meeting_done')                    as meetings_done,
           count(*) filter (where event = 'no_show')                         as no_shows,
           count(distinct opportunity_id) filter (where event = 'won')       as deals_won,
           count(distinct opportunity_id) filter (where event = 'lost')      as deals_lost
      from event_rows
     group by label
  ),
  -- Receita: o livro-razão do período, cortado pela dimensão. Produto = o item do
  -- catálogo (ou a linha avulsa; sem itens, "Sem item").
  rev_rows as (
    select
      case p_dimension
        when 'pipeline'        then coalesce(pl.name, 'Sem pipeline')
        when 'responsible'     then coalesce(pr.nome_completo, 'Não atribuído')
        when 'channel'         then o.acquisition_channel
        when 'contact_channel' then o.contact_channel
        when 'origin_group'    then coalesce(o.acquisition_group, 'Não classificado')
        when 'loss_reason'     then coalesce(o.lost_reason, 'Não informado')
        when 'product'         then coalesce(ci.name, oi.name, 'Sem item')
        when 'campaign'        then o.campaign_label
        when 'platform'        then o.platform_label
        when 'entry'           then o.entry_label
      end as label,
      re.opportunity_id, re.amount
      from public.revenue_entries re
      join opps_all o on o.id = re.opportunity_id
      left join public.pipelines          pl on pl.id = o.pipeline_id
      left join public.profiles           pr on pr.id = re.owner_id
      left join public.catalog_items      ci on ci.id = re.catalog_item_id
      left join public.opportunity_items  oi on oi.id = re.opportunity_item_id
     where re.equipe_id = v_equipe
       and re.recognized_at >= p_from and re.recognized_at < p_to
       and (v_restrict is null or re.owner_id = v_restrict)
       and (p_responsible_ids is null or re.owner_id = any(p_responsible_ids))
  ),
  won_agg as (
    select label, coalesce(sum(net), 0) as won_value, count(*) filter (where net > 0) as revenue_deals
      from (select label, opportunity_id, sum(amount) as net from rev_rows group by label, opportunity_id) x
     group by label
  ),
  rolled as (
    select coalesce(s.label, e.label, w.label)    as label,
           coalesce(s.new_opportunities, 0)       as new_opportunities,
           coalesce(s.open_count, 0)              as open_count,
           coalesce(s.open_value, 0)              as open_value,
           coalesce(e.proposals_sent, 0)          as proposals_sent,
           coalesce(e.meetings_done, 0)           as meetings_done,
           coalesce(e.no_shows, 0)                as no_shows,
           case when p_dimension = 'product' then coalesce(w.revenue_deals, 0)
                else coalesce(e.deals_won, 0) end as deals_won,
           coalesce(e.deals_lost, 0)              as deals_lost,
           coalesce(w.won_value, 0)               as won_value
      from state_agg s
      full join event_agg e on coalesce(e.label, '') = coalesce(s.label, '')
      full join won_agg w on coalesce(w.label, '') = coalesce(s.label, e.label, '')
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'label',             label,
             'new_opportunities', new_opportunities,
             'open_count',        open_count,
             'open_value',        round(open_value, 2),
             'proposals_sent',    proposals_sent,
             'meetings_done',     meetings_done,
             'no_shows',          no_shows,
             'deals_won',         deals_won,
             'deals_lost',        deals_lost,
             'won_value',         round(won_value, 2),
             'win_rate',          case when (deals_won + deals_lost) > 0
                                       then round(100.0 * deals_won / (deals_won + deals_lost), 1) end
           ) order by won_value desc, deals_won desc, label
         ), '[]'::jsonb)
    into v_result
    from rolled;

  return v_result;
end;
$$;

-- ============================================================================
-- 3. O RELATÓRIO DE CAMPANHA
-- ============================================================================

create or replace function public.crm_campaign_report(
  p_from            timestamptz,
  p_to              timestamptz,
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_equipe   uuid;
  v_restrict uuid;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;
  if v_equipe is null then
    return '[]'::jsonb;
  end if;

  with
  camps as (
    select c.id, c.name, c.platform, c.status, c.goal_leads, c.goal_deals, c.goal_revenue, c.owner_id
      from public.crm_campaigns c
     where c.equipe_id = v_equipe and c.status <> 'archived'
  ),
  -- Negócios da equipe (e das linhas, quando filtradas), com a campanha do lead.
  opps_all as (
    select o.id, o.lead_id, o.created_at, o.owner_id, l.campaign_id
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
     where o.equipe_id = v_equipe and o.deleted_at is null and l.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  -- Leads: o primeiro toque caiu no período. O contato não tem dono: com
  -- responsável (o do filtro, ou o vendedor que só vê o seu), contam os leads
  -- com negócio dele — como no dashboard.
  leads_p as (
    select l.campaign_id, count(*) as leads
      from public.leads l
      join public.lead_touches ft on ft.id = l.first_touch_id
     where l.equipe_id = v_equipe and l.deleted_at is null
       and ft.occurred_at >= p_from and ft.occurred_at < p_to
       and ((v_restrict is null and p_responsible_ids is null)
            or exists (select 1 from opps_all o
                        where o.lead_id = l.id
                          and (v_restrict is null or o.owner_id = v_restrict)
                          and (p_responsible_ids is null or o.owner_id = any(p_responsible_ids))))
     group by l.campaign_id
  ),
  -- Negócios criados no período, pelo dono atual.
  deals_p as (
    select campaign_id, count(*) as deals
      from opps_all
     where created_at >= p_from and created_at < p_to
       and (v_restrict is null or owner_id = v_restrict)
       and (p_responsible_ids is null or owner_id = any(p_responsible_ids))
     group by campaign_id
  ),
  -- Ganhos e perdas: o evento na janela, com o dono do momento; o que foi
  -- reaberto depois não conta.
  closed_p as (
    select o.campaign_id,
           count(distinct fe.opportunity_id) filter (where fe.event = 'won')  as wins,
           count(distinct fe.opportunity_id) filter (where fe.event = 'lost') as losses
      from public.funnel_events fe
      join opps_all o on o.id = fe.opportunity_id
     where fe.equipe_id = v_equipe
       and fe.event in ('won', 'lost')
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and (v_restrict is null or fe.owner_id = v_restrict)
       and (p_responsible_ids is null or fe.owner_id = any(p_responsible_ids))
       and not exists (select 1 from public.funnel_events reo
                        where reo.opportunity_id = fe.opportunity_id
                          and reo.event = 'reopened'
                          and reo.occurred_at > fe.occurred_at)
     group by o.campaign_id
  ),
  -- Receita: o livro-razão do período, com o dono do momento.
  rev_p as (
    select o.campaign_id, sum(re.amount) as revenue
      from public.revenue_entries re
      join opps_all o on o.id = re.opportunity_id
     where re.equipe_id = v_equipe
       and re.recognized_at >= p_from and re.recognized_at < p_to
       and (v_restrict is null or re.owner_id = v_restrict)
       and (p_responsible_ids is null or re.owner_id = any(p_responsible_ids))
     group by o.campaign_id
  ),
  spend_p as (
    select s.campaign_id, sum(s.amount) as spend
      from public.crm_campaign_spend s
     where s.equipe_id = v_equipe
       and s.spent_on >= (p_from at time zone 'America/Sao_Paulo')::date
       and s.spent_on <  (p_to   at time zone 'America/Sao_Paulo')::date
     group by s.campaign_id
  ),
  keyset as (
    select id as campaign_id from camps
    union select campaign_id from leads_p
    union select campaign_id from deals_p
    union select campaign_id from closed_p
    union select campaign_id from rev_p
  ),
  rows_ as (
    select k.campaign_id,
           coalesce(c.name, case when k.campaign_id is null then 'Sem campanha' else 'Campanha arquivada' end) as name,
           c.platform, c.status, c.owner_id, c.goal_leads, c.goal_deals, c.goal_revenue,
           coalesce(lp.leads, 0) as leads,
           coalesce(dp.deals, 0) as deals,
           coalesce(cl.wins, 0) as wins,
           coalesce(cl.losses, 0) as losses,
           round(coalesce(rp.revenue, 0), 2) as revenue,
           round(coalesce(sp.spend, 0), 2) as spend
      from keyset k
      left join camps    c  on c.id = k.campaign_id
      left join leads_p  lp on lp.campaign_id is not distinct from k.campaign_id
      left join deals_p  dp on dp.campaign_id is not distinct from k.campaign_id
      left join closed_p cl on cl.campaign_id is not distinct from k.campaign_id
      left join rev_p    rp on rp.campaign_id is not distinct from k.campaign_id
      left join spend_p  sp on sp.campaign_id is not distinct from k.campaign_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'campaign_id', campaign_id, 'name', name, 'platform', platform, 'status', status, 'owner_id', owner_id,
           'goal_leads', goal_leads, 'goal_deals', goal_deals, 'goal_revenue', goal_revenue,
           'leads', leads, 'deals', deals, 'wins', wins, 'losses', losses, 'revenue', revenue, 'spend', spend,
           'cpl', case when leads > 0 and spend > 0 then round(spend / leads, 2) end,
           'cost_per_win', case when wins > 0 and spend > 0 then round(spend / wins, 2) end,
           'win_rate', case when wins + losses > 0 then round(100.0 * wins / (wins + losses), 1) end,
           'roas', case when spend > 0 then round(revenue / spend, 2) end,
           'roi', case when spend > 0 then round(100.0 * (revenue - spend) / spend, 1) end)
         order by (campaign_id is null), revenue desc, leads desc, name), '[]'::jsonb)
    into v_result
    from rows_
   where campaign_id is not null or leads + deals + wins + losses > 0 or revenue <> 0;

  return v_result;
end;
$$;

revoke all on function public.crm_campaign_report(timestamptz, timestamptz, uuid[], uuid[]) from public, anon;
grant execute on function public.crm_campaign_report(timestamptz, timestamptz, uuid[], uuid[]) to authenticated;
