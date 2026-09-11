-- 20260911000300_sprint11_w2_owner_events.sql
-- Sprint 11 · Onda 2 · T14 — o evento guarda o responsável do momento, e as
-- métricas seguem o dono do negócio (motores de Eventos e de Métricas).
--
-- O QUE ESTAVA ERRADO
--
-- As métricas da Sprint 9 (dashboard e relatório agendado) filtravam e
-- restringiam por leads.responsible_id — o responsável do CONTATO. A decisão do
-- founder (11/09) é que o contato não tem responsável: a responsabilidade mora no
-- negócio (opportunities.owner_id). E contar o ganho pelo dono ATUAL do negócio
-- também estaria errado: reatribuir um negócio ganho moveria o ganho — e a
-- comissão — para outra pessoa. funnel_events guardava só o `actor` (quem
-- clicou), que não é o dono.
--
-- O QUE ESTE ARQUIVO ENTREGA
--
--   opportunity_owner_history  cada troca de dono, append-only (como o histórico
--                              de etapa). Só o trigger grava.
--   _opportunity_owner_at      o dono de um negócio num instante.
--   funnel_events.owner_id     o dono no momento do evento, preenchido por um
--                              trigger BEFORE INSERT — cobre os sete lugares que
--                              gravam evento (três triggers, record_funnel_event,
--                              o replay) sem mexer em nenhum.
--   métricas                   uma regra só:
--                                · métrica de EVENTO (qualificados, propostas,
--                                  reuniões, no-show, ganhos, perdidos, receita,
--                                  ciclo, motivos de perda) → funnel_events.owner_id
--                                · métrica de ESTADO (em aberto, novos negócios,
--                                  top oportunidades) → opportunities.owner_id
--                                · métrica de CONTATO (novos leads, touchpoints)
--                                  → contatos com algum negócio do responsável
--                              O vendedor sem papel de gestor (D7 da Sprint 9) vê o
--                              que é dele pela mesma regra.
--   crm_placar                 o placar do pipeline pela mesma regra (T25 troca a
--                              tela para ela).
--
-- As assinaturas das funções da Sprint 9 não mudam; o frontend e o relatório
-- agendado não mudam.

-- ============================================================================
-- 1. HISTÓRICO DE DONO
-- ============================================================================

create table if not exists public.opportunity_owner_history (
  id             bigserial primary key,
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_owner     uuid,
  to_owner       uuid,
  changed_by     uuid,
  changed_at     timestamptz not null default clock_timestamp(),
  source         text not null default 'change' check (source in ('change', 'backfill'))
);

comment on table public.opportunity_owner_history is
  'Sprint 11: cada troca de responsável de um negócio, append-only. Só o trigger trg_opportunity_owner_history grava. Serve para saber o dono num instante (_opportunity_owner_at) — um replay de funnel_events recupera o dono do momento daqui.';

create index if not exists idx_opportunity_owner_history_opp
  on public.opportunity_owner_history (opportunity_id, changed_at);

-- Leitura para a equipe; nenhuma política de escrita (o trigger é security definer).
alter table public.opportunity_owner_history enable row level security;

drop policy if exists opportunity_owner_history_select_own_team on public.opportunity_owner_history;
create policy opportunity_owner_history_select_own_team on public.opportunity_owner_history
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

revoke all on public.opportunity_owner_history from anon, authenticated;
grant select on public.opportunity_owner_history to authenticated;

-- A troca é carimbada com clock_timestamp(), não now(): dentro de uma transação
-- now() é fixo, e uma troca feita logo depois de um ganho, na mesma transação,
-- empataria com ele.
create or replace function public.fn_opportunity_owner_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is not null then
      insert into public.opportunity_owner_history
        (equipe_id, opportunity_id, from_owner, to_owner, changed_by, changed_at)
      values
        (new.equipe_id, new.id, null, new.owner_id, auth.uid(), coalesce(new.created_at, clock_timestamp()));
    end if;
  elsif new.owner_id is distinct from old.owner_id then
    insert into public.opportunity_owner_history
      (equipe_id, opportunity_id, from_owner, to_owner, changed_by, changed_at)
    values
      (new.equipe_id, new.id, old.owner_id, new.owner_id, auth.uid(), clock_timestamp());
  end if;
  return null;
end;
$$;

drop trigger if exists trg_opportunity_owner_history on public.opportunities;
create trigger trg_opportunity_owner_history
  after insert or update of owner_id on public.opportunities
  for each row execute function public.fn_opportunity_owner_history();

-- O dono de um negócio num instante: a última troca até lá; antes da primeira
-- troca registrada, o dono de antes dela; sem histórico, o dono atual.
create or replace function public._opportunity_owner_at(p_opportunity_id uuid, p_at timestamptz)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
           when b.found then b.to_owner
           when a.found then a.from_owner
           else o.owner_id
         end
    from (select 1) one
    left join lateral (
      select true as found, h.to_owner
        from public.opportunity_owner_history h
       where h.opportunity_id = p_opportunity_id
         and h.changed_at <= p_at
       order by h.changed_at desc, h.id desc
       limit 1
    ) b on true
    left join lateral (
      select true as found, h.from_owner
        from public.opportunity_owner_history h
       where h.opportunity_id = p_opportunity_id
       order by h.changed_at asc, h.id asc
       limit 1
    ) a on true
    left join public.opportunities o on o.id = p_opportunity_id;
$$;

revoke all on function public._opportunity_owner_at(uuid, timestamptz) from public, anon, authenticated;

-- ============================================================================
-- 2. O EVENTO GUARDA O DONO DO MOMENTO
-- ============================================================================

-- Sem FK: o evento é um fato; apagar um usuário não pode reescrever o passado.
alter table public.funnel_events
  add column if not exists owner_id uuid;

comment on column public.funnel_events.owner_id is
  'Sprint 11: o responsável pelo negócio no momento do evento (não quem clicou — isso é actor). Preenchido pelo trigger trg_funnel_event_owner a partir de opportunity_owner_history.';

create index if not exists idx_funnel_events_owner
  on public.funnel_events (equipe_id, owner_id, occurred_at);

create or replace function public.fn_funnel_event_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    new.owner_id := public._opportunity_owner_at(new.opportunity_id, new.occurred_at);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_funnel_event_owner on public.funnel_events;
create trigger trg_funnel_event_owner
  before insert on public.funnel_events
  for each row execute function public.fn_funnel_event_owner();

-- Backfill: o dono de hoje vale desde a criação do negócio (o melhor que se sabe
-- sem histórico); os eventos existentes ganham o dono daquele instante.
insert into public.opportunity_owner_history
  (equipe_id, opportunity_id, from_owner, to_owner, changed_by, changed_at, source)
select o.equipe_id, o.id, null, o.owner_id, null, o.created_at, 'backfill'
  from public.opportunities o
 where o.owner_id is not null
   and not exists (select 1 from public.opportunity_owner_history h where h.opportunity_id = o.id);

update public.funnel_events fe
   set owner_id = public._opportunity_owner_at(fe.opportunity_id, fe.occurred_at)
 where fe.owner_id is null;

-- ============================================================================
-- 3. MÉTRICAS — overview (o núcleo do dashboard e do relatório agendado)
-- ============================================================================

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
  ),
  won  as (select distinct e.opportunity_id from ev e where e.event = 'won'),
  lost as (select distinct e.opportunity_id from ev e where e.event = 'lost'),
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
    -- Receita é de evento: os negócios do ganho, qualquer que seja o dono de hoje.
    (select coalesce(sum(o.value), 0) from opps_all o join won w on w.opportunity_id = o.id)  as won_value,
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

revoke all on function public._funnel_overview_core(uuid, uuid, timestamptz, timestamptz, uuid[], uuid[], text[]) from public, anon, authenticated;

-- ============================================================================
-- 4. MÉTRICAS — série
-- ============================================================================

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
    select date_trunc(p_granularity, w.occurred_at) as bucket,
           coalesce(sum(o.value), 0) as v
      from (select distinct on (se.opportunity_id) se.opportunity_id, se.occurred_at
              from scoped_events se
             where se.event = 'won'
             order by se.opportunity_id, se.occurred_at) w
      join opps_all o on o.id = w.opportunity_id
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

revoke all on function public.get_funnel_series(timestamptz, timestamptz, text, uuid[], uuid[], text[]) from public;
grant execute on function public.get_funnel_series(timestamptz, timestamptz, text, uuid[], uuid[], text[]) to authenticated;

-- ============================================================================
-- 5. MÉTRICAS — quebra por dimensão
--
-- Estado e evento agregados em separado e juntados pelo rótulo: na dimensão
-- "responsável", um negócio ganho por B e passado para C aparece como ganho na
-- linha de B (evento) e, se estiver aberto, como aberto na linha de C (estado).
-- ============================================================================

create or replace function public.get_funnel_breakdown(
  p_dimension       text,                 -- pipeline | responsible | channel | contact_channel | origin_group | loss_reason
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

  if p_dimension not in ('pipeline','responsible','channel','contact_channel','origin_group','loss_reason') then
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
  won_agg as (
    select label, coalesce(sum(value), 0) as won_value
      from (select distinct label, opportunity_id, value from event_rows where event = 'won') w
     group by label
  ),
  rolled as (
    select coalesce(s.label, e.label)             as label,
           coalesce(s.new_opportunities, 0)       as new_opportunities,
           coalesce(s.open_count, 0)              as open_count,
           coalesce(s.open_value, 0)              as open_value,
           coalesce(e.proposals_sent, 0)          as proposals_sent,
           coalesce(e.meetings_done, 0)           as meetings_done,
           coalesce(e.no_shows, 0)                as no_shows,
           coalesce(e.deals_won, 0)               as deals_won,
           coalesce(e.deals_lost, 0)              as deals_lost,
           coalesce(w.won_value, 0)               as won_value
      from state_agg s
      full join event_agg e on coalesce(e.label, '') = coalesce(s.label, '')
      left join won_agg w on coalesce(w.label, '') = coalesce(s.label, e.label, '')
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

comment on function public.get_funnel_breakdown(text, timestamptz, timestamptz, uuid[], uuid[], text[]) is
  'Sprint 9/11: the funnel cut by one dimension. p_dimension is validated against a closed list and selects a pre-written join — it is never interpolated into SQL. State metrics follow the current owner; event metrics follow the owner at the moment of the event.';

revoke all on function public.get_funnel_breakdown(text, timestamptz, timestamptz, uuid[], uuid[], text[]) from public;
grant execute on function public.get_funnel_breakdown(text, timestamptz, timestamptz, uuid[], uuid[], text[]) to authenticated;

-- ============================================================================
-- 6. MÉTRICAS — motivos de perda (evento) e top oportunidades (estado)
-- ============================================================================

create or replace function public._loss_reasons_core(
  p_equipe       uuid,
  p_restrict     uuid,
  p_from         timestamptz,
  p_to           timestamptz,
  p_pipeline_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_result jsonb;
begin
  with lost_opps as (
    select distinct o.id, o.value, coalesce(o.lost_reason, 'Não informado') as reason
      from public.funnel_events fe
      join public.opportunities o on o.id = fe.opportunity_id
      join public.leads l         on l.id = o.lead_id
     where fe.equipe_id = p_equipe
       and fe.event = 'lost'
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and o.deleted_at is null and l.deleted_at is null
       and (p_restrict is null or fe.owner_id = p_restrict)
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('reason', reason, 'count', n, 'value', round(v, 2))
           order by n desc, reason), '[]'::jsonb)
    into v_result
    from (select reason, count(*) as n, coalesce(sum(value), 0) as v
            from lost_opps group by reason) s;
  return v_result;
end;
$$;

revoke all on function public._loss_reasons_core(uuid, uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;

create or replace function public._top_opportunities_core(
  p_equipe       uuid,
  p_restrict     uuid,
  p_limit        integer default 10,
  p_pipeline_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_result jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'value')::numeric desc), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
             'opportunity_id',   o.id,
             'lead_id',          l.id,
             'lead_name',        l.name,
             'value',            coalesce(o.value, 0),
             'pipeline_name',    pl.name,
             'stage_name',       st.name,
             -- Mesma chave de antes; agora é o dono do negócio.
             'responsible_name', pr.nome_completo,
             'days_in_stage',    greatest(0, floor(extract(epoch from (now() - o.stage_entered_at)) / 86400))::int,
             'last_touch_at',    (select max(t.contact_date) from public.touchpoints t where t.lead_id = l.id)
           ) as x
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
      left join public.pipelines pl on pl.id = o.pipeline_id
      left join public.pipeline_stages_v2 st on st.id = o.stage_id
      left join public.profiles pr on pr.id = o.owner_id
     where o.equipe_id = p_equipe
       and o.deleted_at is null and l.deleted_at is null
       and o.status = 'open'
       and (p_restrict is null or o.owner_id = p_restrict)
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
     order by coalesce(o.value, 0) desc
     limit greatest(1, least(coalesce(p_limit, 10), 50))
  ) s;
  return v_result;
end;
$$;

revoke all on function public._top_opportunities_core(uuid, uuid, integer, uuid[]) from public, anon, authenticated;

-- ============================================================================
-- 7. MÉTRICAS — quebra por campo personalizado (estado: negócios criados na
--    janela, pelo dono atual). Campo do tipo usuário agrupa pelo NOME do membro.
-- ============================================================================

create or replace function public.get_custom_field_breakdown(
  p_field_key text,
  p_from      timestamptz,
  p_to        timestamptz,
  p_agg       text default 'count',
  p_pipeline_ids uuid[] default null
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
  v_type     text;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  if p_agg not in ('count', 'sum', 'value') then
    raise exception 'invalid_agg: %', p_agg using errcode = '22023';
  end if;

  -- THE WHITELIST. The key must be one this tenant declared, in a pipeline this
  -- tenant owns. Anything else is refused before it can reach a jsonb path.
  select f->>'type' into v_type
    from public.pipelines pl
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(pl.custom_fields_schema) = 'array'
           then pl.custom_fields_schema else '[]'::jsonb end
    ) f
   where pl.equipe_id = v_equipe
     and pl.deleted_at is null
     and f->>'key' = p_field_key
     and coalesce((f->>'is_deleted')::boolean, false) = false
   limit 1;

  if v_type is null then
    raise exception 'unknown_field: % is not declared in this tenant''s pipeline schema', p_field_key
      using errcode = '22023';
  end if;

  if p_agg = 'sum' and v_type not in ('number', 'currency') then
    raise exception 'field_not_summable: % is %', p_field_key, v_type using errcode = '22023';
  end if;

  with field_ids as (
    -- The field_id of this key in each of the tenant's pipelines.
    select pl.id as pipeline_id, f->>'field_id' as field_id
      from public.pipelines pl
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(pl.custom_fields_schema) = 'array'
             then pl.custom_fields_schema else '[]'::jsonb end
      ) f
     where pl.equipe_id = v_equipe
       and pl.deleted_at is null
       and f->>'key' = p_field_key
       and coalesce((f->>'is_deleted')::boolean, false) = false
  ),
  scoped as (
    select o.id, o.value,
           -- field_id first (where the app writes), the key as fallback (older
           -- imports and webhooks). Values, never query text.
           coalesce(
             case when fi.field_id is not null
                   and o.custom_data -> fi.field_id is not null
                   and o.custom_data -> fi.field_id <> 'null'::jsonb
                  then o.custom_data -> fi.field_id end,
             o.custom_data -> p_field_key
           ) as raw
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
      left join field_ids fi on fi.pipeline_id = o.pipeline_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and l.deleted_at is null
       and o.created_at >= p_from
       and o.created_at <  p_to
       and (v_restrict is null or o.owner_id = v_restrict)
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  bucketed as (
    -- One row per (deal, value). A multi-select array gives one row per item;
    -- anything else gives one row. DISTINCT: a repeated item counts once.
    select distinct sc.id, sc.value,
           coalesce(nullif(trim(x.item), ''), 'Não informado') as bucket
      from scoped sc
      cross join lateral (
        select a.item
          from jsonb_array_elements_text(
                 case when jsonb_typeof(sc.raw) = 'array' then sc.raw else '[]'::jsonb end
               ) as a(item)
        union all
        select case when sc.raw is null or jsonb_typeof(sc.raw) in ('array', 'null') then null
                    else sc.raw #>> '{}' end
         where sc.raw is null
            or jsonb_typeof(sc.raw) <> 'array'
            or jsonb_array_length(sc.raw) = 0
      ) x
  ),
  -- Campo do tipo usuário: o valor é um profiles.id; o dashboard mostra o nome.
  labeled as (
    select b.id, b.value, b.bucket,
           case
             when v_type = 'user' and b.bucket <> 'Não informado' then
               coalesce((select nullif(trim(p.nome_completo), '')
                           from public.profiles p
                          where p.id::text = b.bucket and p.equipe_id = v_equipe),
                        'Usuário removido')
             else b.bucket
           end as label
      from bucketed b
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('label', label, 'value', round(v, 2), 'count', n)
           order by v desc, n desc, label
         ), '[]'::jsonb)
    into v_result
  from (
    select label,
           count(*) as n,
           case p_agg
             when 'count' then count(*)::numeric
             when 'value' then coalesce(sum(l.value), 0)
             -- 'sum' re-reads the field as a number. The whitelist guaranteed
             -- the declared type is numeric; the regex guards the row where an
             -- older import wrote "1.200,00", so one bad row cannot 500 the
             -- whole dashboard.
             else coalesce(sum(
               case when (l.bucket ~ '^-?[0-9]+(\.[0-9]+)?$')
                    then l.bucket::numeric else 0 end), 0)
           end as v
      from labeled l
     group by label
  ) g;

  return v_result;
end;
$$;

revoke all on function public.get_custom_field_breakdown(text, timestamptz, timestamptz, text, uuid[]) from public;
grant execute on function public.get_custom_field_breakdown(text, timestamptz, timestamptz, text, uuid[]) to authenticated;

-- ============================================================================
-- 8. O PLACAR DO PIPELINE
-- ============================================================================

-- Ganhos e perdas do período por evento (negócio distinto, dono do momento); em
-- andamento pelo dono atual. Substitui baixar todos os negócios do pipeline no
-- navegador para contar (T25). A RLS de funnel_events e opportunities recorta o
-- tenant.
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
  owners as (
    select owner_id from won_by
    union select owner_id from lost_by
    union select owner_id from open_now
  )
  select jsonb_build_object(
    'won',               (select count(*) from closed where event = 'won'),
    'lost',              (select count(*) from closed where event = 'lost'),
    'won_revenue',       (select coalesce(sum(value), 0) from closed where event = 'won'),
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
                                      'won_revenue', coalesce(w.won_revenue, 0)
                                    )
                                    order by coalesce(w.won_revenue, 0) desc, coalesce(w.won, 0) desc, ow.owner_id nulls last
                                  )
                             from owners ow
                             left join won_by  w  on w.owner_id  is not distinct from ow.owner_id
                             left join lost_by l  on l.owner_id  is not distinct from ow.owner_id
                             left join open_now op on op.owner_id is not distinct from ow.owner_id
                         ), '[]'::jsonb)
  );
$$;

revoke all on function public.crm_placar(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_placar(uuid, timestamptz, timestamptz) to authenticated;
