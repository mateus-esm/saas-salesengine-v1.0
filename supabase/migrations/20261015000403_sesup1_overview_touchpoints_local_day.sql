-- 20261015000403_sesup1_overview_touchpoints_local_day.sql
-- SE-SUP1-5 (fix round 1) — o total de touchpoints do overview contava o dia errado.
--
-- touchpoints.contact_date é `date`. `date >= timestamptz` converte a data para
-- meia-noite UTC (fuso da sessão), e numa janela de Brasília [03:00Z, 03:00Z)
-- isso derruba o dia pedido e inclui o seguinte. Aqui a janela vira DIAS LOCAIS
-- (America/Sao_Paulo, o fuso de todos os clientes hoje) antes de comparar; o fim
-- é `to - 1µs`, que serve tanto a [00:00, 00:00) quanto a endOfDay. Mesmo
-- critério de _touchpoints_by_seller_core (000401).
--
-- Corpo copiado da definição ATUAL (20260912000600, Sprint 11 W3); a ÚNICA
-- mudança é o filtro de data da CTE `tp`. Assinatura idêntica: create or
-- replace mantém as permissões. (O filtro de pipeline continua sem efeito sobre
-- touchpoints aqui, como antes — fora do escopo desta correção.)

begin;

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
     where t.contact_date >= ((p_from at time zone 'America/Sao_Paulo')::date)
       and t.contact_date <= (((p_to - interval '1 microsecond') at time zone 'America/Sao_Paulo')::date)
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

commit;
