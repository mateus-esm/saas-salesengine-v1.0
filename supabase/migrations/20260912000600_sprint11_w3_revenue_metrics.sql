-- Sprint 11 · Onda 3 · T33 — as métricas passam a ler a receita.
--
-- Gerado a partir das funções de métrica da Onda 2 (20260911000300) com duas
-- mudanças, e nada mais:
--
--   1. RECEITA = LIVRO-RAZÃO. O "valor ganho" do overview, da série, da quebra e
--      do placar é a soma de `revenue_entries` no período (recognized_at), pelo
--      dono do momento do lançamento — itens, ajustes e estornos incluídos. Antes:
--      o valor de HOJE dos negócios que tiveram evento de ganho no período (um
--      ganho de agosto corrigido em setembro mudava agosto sem deixar rastro).
--   2. REABERTO NÃO CONTA. Um evento de ganho ou perda seguido de um `reopened`
--      (T28) foi uma correção — não conta no período dele; o novo ganho conta no
--      período do novo ganho. A contagem e a receita andam juntas.
--
-- A quebra ganha a dimensão PRODUTO: a receita por item do catálogo (a linha
-- avulsa pelo nome; o negócio sem itens como "Sem item"). Por produto só a
-- receita e os negócios que a geraram fazem sentido — um negócio vende vários
-- itens, então estado e funil não se cortam por produto.
--
-- As assinaturas não mudam; `create or replace` mantém as permissões.

-- 1. Overview
create or replace function public._funnel_overview_core(
  p_equipe          uuid,
  p_restrict        uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null,
  p_channels        text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  r record;
begin
  with
  -- Contatos do tenant (e do canal). Sem filtro de responsável: o contato não tem.
  leads_all as (
    select l.id, l.created_at
      from public.leads l
      join public.v_lead_channel c on c.lead_id = l.id
     where l.equipe_id = p_equipe
       and l.deleted_at is null
       and (p_channels is null or c.acquisition_channel = any(p_channels))
  ),
  opps_all as (
    select o.id, o.lead_id, o.value, o.status, o.created_at, o.closed_at, o.owner_id
      from public.opportunities o
      join leads_all la on la.id = o.lead_id
     where o.equipe_id = p_equipe
       and o.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  -- ESTADO: o dono atual.
  scoped_opps as (
    select o.* from opps_all o
     where (p_restrict is null or o.owner_id = p_restrict)
       and (p_responsible_ids is null or o.owner_id = any(p_responsible_ids))
  ),
  -- CONTATO: quem tem algum negócio do responsável.
  scoped_leads as (
    select la.* from leads_all la
     where (p_restrict is null and p_responsible_ids is null)
        or exists (
          select 1 from opps_all o
           where o.lead_id = la.id
             and (p_restrict is null or o.owner_id = p_restrict)
             and (p_responsible_ids is null or o.owner_id = any(p_responsible_ids))
        )
  ),
  -- EVENTO: o dono do momento.
  ev as (
    select fe.event, fe.opportunity_id
      from public.funnel_events fe
      join opps_all o on o.id = fe.opportunity_id
     where fe.equipe_id = p_equipe
       and fe.occurred_at >= p_from
       and fe.occurred_at <  p_to
       and (p_restrict is null or fe.owner_id = p_restrict)
       and (p_responsible_ids is null or fe.owner_id = any(p_responsible_ids))
       and not (fe.event in ('won', 'lost') and exists (
             select 1 from public.funnel_events reo
              where reo.opportunity_id = fe.opportunity_id
                and reo.event = 'reopened'
                and reo.occurred_at > fe.occurred_at))
  ),
  won  as (select distinct e.opportunity_id from ev e where e.event = 'won'),
  lost as (select distinct e.opportunity_id from ev e where e.event = 'lost'),
  -- Receita: o livro-razão do período (T31), pelo dono do momento do lançamento.
  rev as (
    select coalesce(sum(re.amount), 0) as v
      from public.revenue_entries re
      join opps_all o on o.id = re.opportunity_id
     where re.equipe_id = p_equipe
       and re.recognized_at >= p_from and re.recognized_at < p_to
       and (p_restrict is null or re.owner_id = p_restrict)
       and (p_responsible_ids is null or re.owner_id = any(p_responsible_ids))
  ),
  tp as (
    select count(*) as n
      from public.touchpoints t
      join scoped_leads sl on sl.id = t.lead_id
     where t.contact_date >= p_from and t.contact_date < p_to
  )
  select
    (select count(*) from scoped_leads where created_at >= p_from and created_at < p_to) as new_leads,
    (select count(*) from scoped_opps  where created_at >= p_from and created_at < p_to) as new_opportunities,
    (select count(*) from ev where event = 'qualified')         as qualified,
    (select count(*) from ev where event = 'proposal_sent')     as proposals_sent,
    (select count(*) from ev where event = 'meeting_scheduled') as meetings_scheduled,
    (select count(*) from ev where event = 'meeting_done')      as meetings_done,
    (select count(*) from ev where event = 'no_show')           as no_shows,
    (select count(*) from won)                                  as deals_won,
    (select count(*) from lost)                                 as deals_lost,
    -- Receita: a do livro-razão (itens, ajustes e estornos), não o valor de hoje do negócio.
    (select v from rev)                                         as won_value,
    (select coalesce(sum(o.value), 0) from opps_all o join lost x on x.opportunity_id = o.id) as lost_value,
    (select coalesce(sum(o.value), 0) from scoped_opps o where o.status = 'open') as open_value,
    (select count(*) from scoped_opps o where o.status = 'open')                  as open_count,
    (select coalesce(avg(extract(epoch from (o.closed_at - o.created_at)) / 86400), 0)
       from opps_all o join won w on w.opportunity_id = o.id
      where o.closed_at is not null)                            as avg_cycle_days,
    (select n from tp)                                          as touchpoints
  into r;

  return jsonb_build_object(
    'period',             jsonb_build_object('from', p_from, 'to', p_to),
    'new_leads',          r.new_leads,
    'new_opportunities',  r.new_opportunities,
    'qualified',          r.qualified,
    'proposals_sent',     r.proposals_sent,
    'meetings_scheduled', r.meetings_scheduled,
    'meetings_done',      r.meetings_done,
    'no_shows',           r.no_shows,
    'deals_won',          r.deals_won,
    'deals_lost',         r.deals_lost,
    'won_value',          round(r.won_value, 2),
    'lost_value',         round(r.lost_value, 2),
    'open_value',         round(r.open_value, 2),
    'open_count',         r.open_count,
    'touchpoints',        r.touchpoints,
    'avg_ticket',         case when r.deals_won > 0 then round(r.won_value / r.deals_won, 2) end,
    'win_rate',           case when (r.deals_won + r.deals_lost) > 0
                               then round(100.0 * r.deals_won / (r.deals_won + r.deals_lost), 1) end,
    'no_show_rate',       case when r.meetings_scheduled > 0
                               then round(100.0 * r.no_shows / r.meetings_scheduled, 1) end,
    'show_rate',          case when r.meetings_scheduled > 0
                               then round(100.0 * r.meetings_done / r.meetings_scheduled, 1) end,
    'lead_to_won_rate',   case when r.new_leads > 0
                               then round(100.0 * r.deals_won / r.new_leads, 1) end,
    'avg_cycle_days',     case when r.deals_won > 0 then round(r.avg_cycle_days::numeric, 1) end,
    'touchpoints_per_lead', case when r.new_leads > 0
                               then round(r.touchpoints::numeric / r.new_leads, 1) end
  );
end;
$$;

-- 2. Série
create or replace function public.get_funnel_series(
  p_from            timestamptz,
  p_to              timestamptz,
  p_granularity     text default 'day',   -- day | week | month
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null,
  p_channels        text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe   uuid;
  v_restrict uuid;
  v_step     interval;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  -- Validated before use: p_granularity is passed to date_trunc, and a closed
  -- list is what keeps a dropdown value from reaching a SQL builtin unchecked.
  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'invalid_granularity: %', p_granularity using errcode = '22023';
  end if;

  v_step := case p_granularity
              when 'week'  then interval '1 week'
              when 'month' then interval '1 month'
              else interval '1 day'
            end;

  with
  leads_all as (
    select l.id, l.created_at
      from public.leads l
      join public.v_lead_channel c on c.lead_id = l.id
     where l.equipe_id = v_equipe
       and l.deleted_at is null
       and (p_channels is null or c.acquisition_channel = any(p_channels))
  ),
  opps_all as (
    select o.id, o.lead_id, o.value, o.owner_id
      from public.opportunities o
      join leads_all la on la.id = o.lead_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  scoped_leads as (
    select la.* from leads_all la
     where (v_restrict is null and p_responsible_ids is null)
        or exists (
          select 1 from opps_all o
           where o.lead_id = la.id
             and (v_restrict is null or o.owner_id = v_restrict)
             and (p_responsible_ids is null or o.owner_id = any(p_responsible_ids))
        )
  ),
  scoped_events as (
    select fe.opportunity_id, fe.event, fe.occurred_at
      from public.funnel_events fe
      join opps_all o on o.id = fe.opportunity_id
     where fe.equipe_id = v_equipe
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and (v_restrict is null or fe.owner_id = v_restrict)
       and (p_responsible_ids is null or fe.owner_id = any(p_responsible_ids))
       and not (fe.event in ('won', 'lost') and exists (
             select 1 from public.funnel_events reo
              where reo.opportunity_id = fe.opportunity_id
                and reo.event = 'reopened'
                and reo.occurred_at > fe.occurred_at))
  ),
  buckets as (
    select generate_series(
             date_trunc(p_granularity, p_from),
             date_trunc(p_granularity, p_to - interval '1 microsecond'),
             v_step
           ) as bucket
  ),
  lead_counts as (
    select date_trunc(p_granularity, sl.created_at) as bucket, count(*) as n
      from scoped_leads sl
     where sl.created_at >= p_from and sl.created_at < p_to
     group by 1
  ),
  event_counts as (
    select date_trunc(p_granularity, se.occurred_at) as bucket,
           count(*) filter (where se.event = 'proposal_sent')     as proposals,
           count(*) filter (where se.event = 'meeting_scheduled') as meetings_scheduled,
           count(*) filter (where se.event = 'meeting_done')      as meetings_done,
           count(*) filter (where se.event = 'no_show')           as no_shows,
           count(distinct se.opportunity_id) filter (where se.event = 'won')  as won,
           count(distinct se.opportunity_id) filter (where se.event = 'lost') as lost
      from scoped_events se
     group by 1
  ),
  won_value as (
    select date_trunc(p_granularity, re.recognized_at) as bucket,
           coalesce(sum(re.amount), 0) as v
      from public.revenue_entries re
      join opps_all o on o.id = re.opportunity_id
     where re.equipe_id = v_equipe
       and re.recognized_at >= p_from and re.recognized_at < p_to
       and (v_restrict is null or re.owner_id = v_restrict)
       and (p_responsible_ids is null or re.owner_id = any(p_responsible_ids))
     group by 1
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'bucket',             b.bucket,
             'new_leads',          coalesce(lc.n, 0),
             'proposals_sent',     coalesce(ec.proposals, 0),
             'meetings_scheduled', coalesce(ec.meetings_scheduled, 0),
             'meetings_done',      coalesce(ec.meetings_done, 0),
             'no_shows',           coalesce(ec.no_shows, 0),
             'deals_won',          coalesce(ec.won, 0),
             'deals_lost',         coalesce(ec.lost, 0),
             'won_value',          round(coalesce(wv.v, 0), 2)
           ) order by b.bucket
         ), '[]'::jsonb)
    into v_result
    from buckets b
    left join lead_counts  lc on lc.bucket = b.bucket
    left join event_counts ec on ec.bucket = b.bucket
    left join won_value    wv on wv.bucket = b.bucket;

  return v_result;
end;
$$;

-- 3. Quebra por dimensão
create or replace function public.get_funnel_breakdown(
  p_dimension       text,                 -- pipeline | responsible | channel | contact_channel | origin_group | loss_reason | product
  p_from            timestamptz,
  p_to              timestamptz,
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null,
  p_channels        text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe   uuid;
  v_restrict uuid;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  if p_dimension not in ('pipeline','responsible','channel','contact_channel','origin_group','loss_reason','product') then
    raise exception 'invalid_dimension: %', p_dimension using errcode = '22023';
  end if;

  with
  opps_all as (
    select o.id, o.value, o.status, o.pipeline_id, o.lost_reason, o.created_at, o.owner_id,
           c.acquisition_channel, c.contact_channel, c.acquisition_group
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
      join public.v_lead_channel c on c.lead_id = l.id
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

-- 4. Placar do pipeline
create or replace function public.crm_placar(p_pipeline_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
  with team as (
    select m.id, m.nome_completo from public.crm_team_members() m
  ),
  closed as (
    select distinct on (fe.opportunity_id, fe.event)
           fe.opportunity_id, fe.event, fe.owner_id, fe.occurred_at, o.value, o.created_at
      from public.funnel_events fe
      join public.opportunities o on o.id = fe.opportunity_id
     where fe.pipeline_id = p_pipeline_id
       and fe.event in ('won', 'lost')
       and fe.occurred_at >= p_from
       and fe.occurred_at <  p_to
       and o.deleted_at is null
       and not (fe.event in ('won', 'lost') and exists (
             select 1 from public.funnel_events reo
              where reo.opportunity_id = fe.opportunity_id
                and reo.event = 'reopened'
                and reo.occurred_at > fe.occurred_at))
     order by fe.opportunity_id, fe.event, fe.occurred_at
  ),
  open_now as (
    select o.owner_id, count(*)::int as n
      from public.opportunities o
     where o.pipeline_id = p_pipeline_id
       and o.deleted_at is null
       and o.status = 'open'
     group by o.owner_id
  ),
  won_by as (
    select owner_id, count(*)::int as won, coalesce(sum(value), 0) as won_revenue
      from closed where event = 'won' group by owner_id
  ),
  lost_by as (
    select owner_id, count(*)::int as lost
      from closed where event = 'lost' group by owner_id
  ),
  -- Receita do período: o livro-razão, pelo dono do momento do lançamento.
  rev as (
    select re.owner_id, sum(re.amount) as v
      from public.revenue_entries re
     where re.pipeline_id = p_pipeline_id
       and re.recognized_at >= p_from
       and re.recognized_at <  p_to
     group by re.owner_id
  ),
  owners as (
    select owner_id from won_by
    union select owner_id from lost_by
    union select owner_id from open_now
    union select owner_id from rev
  )
  select jsonb_build_object(
    'won',               (select count(*) from closed where event = 'won'),
    'lost',              (select count(*) from closed where event = 'lost'),
    'won_revenue',       (select coalesce(sum(v), 0) from rev),
    'in_progress',       (select coalesce(sum(n), 0) from open_now),
    'avg_velocity_days', (select round((avg(extract(epoch from (occurred_at - created_at)) / 86400))::numeric, 1)
                            from closed where event = 'won'),
    'by_owner',          coalesce((
                           select jsonb_agg(
                                    jsonb_build_object(
                                      'owner_id',    ow.owner_id,
                                      'owner_name',  (select t.nome_completo from team t where t.id = ow.owner_id),
                                      'won',         coalesce(w.won, 0),
                                      'lost',        coalesce(l.lost, 0),
                                      'in_progress', coalesce(op.n, 0),
                                      'won_revenue', coalesce(rv.v, 0)
                                    )
                                    order by coalesce(rv.v, 0) desc, coalesce(w.won, 0) desc, ow.owner_id nulls last
                                  )
                             from owners ow
                             left join won_by  w  on w.owner_id  is not distinct from ow.owner_id
                             left join lost_by l  on l.owner_id  is not distinct from ow.owner_id
                             left join open_now op on op.owner_id is not distinct from ow.owner_id
                             left join rev      rv on rv.owner_id is not distinct from ow.owner_id
                         ), '[]'::jsonb)
  );
$$;
