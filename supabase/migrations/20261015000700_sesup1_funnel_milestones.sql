-- 20261015000700_sesup1_funnel_milestones.sql
-- SE-SUP1-8 (#10) — reunião agendada, realizada, no-show, proposta e fechamento,
-- contados por data.
--
-- NADA DE TABELA NOVA PARA OS NÚMEROS. O motor é funnel_events (Sprint 9): cada
-- marco com occurred_at e o dono do momento (owner_id, Sprint 11 W2). O que faltava:
--
--   1. REGISTRO MANUAL DE DESFECHO. Uma reunião que aconteceu (ou não) não move
--      etapa nenhuma — o no-show é justamente a AUSÊNCIA de movimento. Sem um
--      botão, o no-show não existe no banco. crm_record_meeting_outcome() é esse
--      botão: chama o record_funnel_event existente (o mesmo caminho manual da
--      Sprint 9, com a mesma checagem de equipe) e marca o evento da agenda.
--      agenda_events.outcome é só ATALHO DE UI (o que o botão mostra marcado); a
--      verdade contábil continua sendo a linha em funnel_events.
--
--         realizada        -> meeting_done
--         visita técnica   -> meeting_done  (na Solo a visita É a reunião; o
--                                            atalho guarda a diferença para a tela)
--         no-show          -> no_show
--
--      Correção: trocar o desfecho de um evento da agenda apaga a linha manual que
--      ESTE evento gravou (outcome_event_id) e grava a nova — clicar errado não
--      pode deixar um no-show e uma realizada para a mesma reunião. Só a linha
--      manual do próprio evento é apagada; nada derivado de etapa é tocado.
--      Duplo clique / etapa + botão no MESMO dia local: o mesmo marco para o mesmo
--      negócio no mesmo dia não é gravado duas vezes (already_recorded).
--
--      EXCLUSÃO MÚTUA (realizada x no-show). Um negócio, um dia local: no máximo
--      UM desfecho de reunião. A regra mais simples que fecha os dois buracos:
--        * o evento da agenda que muda o PRÓPRIO desfecho substitui a linha dele
--          (a correção acima);
--        * qualquer outro caso em que o desfecho oposto já existe para o negócio
--          naquele dia (gravado pelo card, por outro evento ou por uma etapa) é
--          RECUSADO com `outcome_conflict` — a tela diz qual existe e pede para
--          desfazer primeiro. Recusar em vez de apagar: a linha alheia pode ter
--          vindo de uma etapa ou de outra pessoa, e apagá-la em silêncio mudaria um
--          número que alguém já viu.
--      Por isso o mapa da Solo deixa Reunião de Apresentação / Visita Técnica SEM
--      marco por padrão (script 2026-10-16): a realizada vem só do botão, e entrar
--      na etapa antes da reunião não grava uma realizada que depois vira no-show.
--
--   2. OS NÚMEROS POR DATA. _funnel_milestones_core devolve, para a janela pedida,
--      os seis marcos por balde (dia/semana/mês NO FUSO DO CLIENTE), por vendedor
--      (funnel_events.owner_id, o dono no momento do marco) e por pipeline, mais
--      `since`: o primeiro evento já gravado de cada marco. O widget e o relatório
--      mostram "série começa em <data>" antes disso — no_show não tem passado, e
--      um zero em setembro leria como "ninguém faltou".
--      Mesma arquitetura do resto do dashboard: _core com (equipe, restrict)
--      explícitos — o relatório agendado chama sem auth.uid() — e o wrapper
--      público que resolve o escopo por _funnel_scope(). Mesmas regras de
--      contagem do get_funnel_series: volume (count(*)) para os marcos de
--      atividade; ganho = negócios distintos, sem os ganhos depois reabertos.
--
--   3. O RELATÓRIO DIÁRIO. build_report_snapshot ganha a chave
--      `funnel_milestones` (o mesmo _core, granularidade dia). O corpo é o da
--      20261015000402 com essa única chave a mais; a assinatura não muda, então o
--      reports-cron e o dispatcher ficam intocados. O texto (seção 3, "Marcos do
--      funil") acrescenta "Por vendedor" e a nota do no-show em
--      _shared/report-render.ts — mesmas seções, mesma ordem, zero explícito.
--
-- O mapeamento etapa -> marco da Solo NÃO está aqui: é dado de um cliente,
-- conferido etapa por etapa com o gestor — supabase/scripts/2026-10-16_sesup1_solo_funnel_mapping.sql.
--
-- ORDEM: depois da 20261015000402 (substitui o build_report_snapshot dela).
-- Sem begin/commit próprios (scripts/sqltest.sh inclui o arquivo na transação do teste).

-- ============================================================================
-- 1. O ATALHO NA AGENDA
-- ============================================================================

alter table public.agenda_events
  add column if not exists opportunity_id   uuid references public.opportunities(id) on delete set null,
  add column if not exists outcome          text,
  add column if not exists outcome_at       timestamptz,
  add column if not exists outcome_by       uuid,
  -- A linha de funnel_events que ESTE evento gravou: é o que a correção apaga.
  -- Sem FK: funnel_events é log; o vínculo é só para desfazer o próprio clique.
  add column if not exists outcome_event_id bigint;

alter table public.agenda_events drop constraint if exists agenda_events_outcome_check;
alter table public.agenda_events add constraint agenda_events_outcome_check
  check (outcome is null or outcome in ('done', 'no_show', 'technical_visit'));

comment on column public.agenda_events.outcome is
  'SE-SUP1-8: desfecho marcado na tela (done | no_show | technical_visit). SÓ ATALHO DE UI — a contagem vem de funnel_events, gravado por crm_record_meeting_outcome().';
comment on column public.agenda_events.opportunity_id is
  'SE-SUP1-8: o negócio desta reunião. Nulo = o RPC usa o negócio aberto mais recente do lead.';

create index if not exists idx_agenda_events_opportunity
  on public.agenda_events (opportunity_id) where opportunity_id is not null;

-- ============================================================================
-- 2. O BOTÃO: crm_record_meeting_outcome
-- ============================================================================
--
-- p_outcome null = desfazer (só com evento da agenda: apaga a linha que ele gravou).
-- Data do marco: a informada; senão o início da reunião (sem passar de agora —
-- marcar antes da hora não cria um evento no futuro); senão agora.

create or replace function public.crm_record_meeting_outcome(
  p_opportunity_id  uuid,
  p_outcome         text,
  p_agenda_event_id uuid        default null,
  p_occurred_at     timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team    uuid;
  v_ev      public.agenda_events;
  v_opp     uuid := p_opportunity_id;
  v_event   text;
  v_at      timestamptz;
  v_id      bigint;
  v_tz      text := 'America/Sao_Paulo';
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  if v_team is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_outcome is not null and p_outcome not in ('done', 'no_show', 'technical_visit') then
    raise exception 'invalid_outcome: %', p_outcome using errcode = '22023';
  end if;

  if p_agenda_event_id is not null then
    select * into v_ev from public.agenda_events e
     where e.id = p_agenda_event_id and e.equipe_id = v_team and e.deleted_at is null
     for update;
    if v_ev.id is null then
      raise exception 'agenda_event_not_found' using errcode = 'P0002';
    end if;
  elsif p_outcome is null then
    raise exception 'outcome_required' using errcode = '22023';
  end if;

  -- Mesmo desfecho de novo: nada muda (o botão já está marcado).
  if v_ev.id is not null and v_ev.outcome is not distinct from p_outcome then
    return jsonb_build_object('funnel_event_id', v_ev.outcome_event_id, 'opportunity_id', v_ev.opportunity_id,
                              'outcome', v_ev.outcome, 'already_recorded', true);
  end if;

  -- Correção: some a linha manual que este evento tinha gravado.
  if v_ev.outcome_event_id is not null then
    delete from public.funnel_events fe
     where fe.id = v_ev.outcome_event_id
       and fe.equipe_id = v_team
       and fe.source = 'manual';
  end if;

  if p_outcome is null then
    update public.agenda_events
       set outcome = null, outcome_at = null, outcome_by = null, outcome_event_id = null
     where id = v_ev.id;
    return jsonb_build_object('funnel_event_id', null, 'opportunity_id', v_ev.opportunity_id,
                              'outcome', null, 'already_recorded', false);
  end if;

  -- O negócio: o informado; senão o do evento; senão o aberto mais recente do lead.
  if v_opp is null and v_ev.id is not null then
    v_opp := v_ev.opportunity_id;
    if v_opp is null and v_ev.lead_id is not null then
      select o.id into v_opp
        from public.opportunities o
       where o.lead_id = v_ev.lead_id and o.equipe_id = v_team
         and o.deleted_at is null and o.status = 'open'
       order by o.created_at desc
       limit 1;
    end if;
  end if;
  if v_opp is null then
    raise exception 'opportunity_required' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.opportunities o
                  where o.id = v_opp and o.equipe_id = v_team and o.deleted_at is null) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  v_event := case p_outcome when 'no_show' then 'no_show' else 'meeting_done' end;
  v_at := coalesce(p_occurred_at,
                   case when v_ev.id is not null then least(v_ev.starts_at, now()) end,
                   now());

  -- Exclusão mútua: o desfecho OPOSTO já existe para este negócio neste dia (a
  -- linha do próprio evento já foi apagada acima, então não conta).
  if exists (
    select 1 from public.funnel_events fe
     where fe.opportunity_id = v_opp
       and fe.event = case v_event when 'no_show' then 'meeting_done' else 'no_show' end
       and (fe.occurred_at at time zone v_tz)::date = (v_at at time zone v_tz)::date
  ) then
    raise exception 'outcome_conflict: já existe % para este negócio neste dia; desfaça antes',
      case v_event when 'no_show' then 'reunião realizada' else 'no-show' end
      using errcode = '23P01';
  end if;

  -- Mesmo marco, mesmo negócio, mesmo dia local: já contado (duplo clique, ou a
  -- etapa mapeada já gravou a reunião hoje).
  select fe.id into v_id
    from public.funnel_events fe
   where fe.opportunity_id = v_opp
     and fe.event = v_event
     and (fe.occurred_at at time zone v_tz)::date = (v_at at time zone v_tz)::date
   order by fe.id
   limit 1;

  if v_id is null then
    -- O caminho manual que já existe: refaz a checagem de equipe e grava source='manual'.
    v_id := public.record_funnel_event(v_opp, v_event::text, v_at::timestamptz);
    if v_ev.id is not null then
      update public.agenda_events
         set outcome = p_outcome, outcome_at = now(), outcome_by = auth.uid(),
             opportunity_id = v_opp, outcome_event_id = v_id
       where id = v_ev.id;
    end if;
    return jsonb_build_object('funnel_event_id', v_id, 'opportunity_id', v_opp,
                              'outcome', p_outcome, 'event', v_event, 'already_recorded', false);
  end if;

  -- Já contado por outro caminho: o evento da agenda mostra o desfecho, mas não
  -- é dono da linha (outcome_event_id nulo) — desfazer aqui não apaga a etapa.
  if v_ev.id is not null then
    update public.agenda_events
       set outcome = p_outcome, outcome_at = now(), outcome_by = auth.uid(),
           opportunity_id = v_opp, outcome_event_id = null
     where id = v_ev.id;
  end if;
  return jsonb_build_object('funnel_event_id', v_id, 'opportunity_id', v_opp,
                            'outcome', p_outcome, 'event', v_event, 'already_recorded', true);
end;
$$;

revoke all on function public.crm_record_meeting_outcome(uuid, text, uuid, timestamptz) from public, anon;
grant execute on function public.crm_record_meeting_outcome(uuid, text, uuid, timestamptz) to authenticated;

comment on function public.crm_record_meeting_outcome(uuid, text, uuid, timestamptz) is
  'SE-SUP1-8 #10: desfecho de reunião (done | no_show | technical_visit; null desfaz) no card ou na agenda. Grava via record_funnel_event; agenda_events.outcome é só atalho.';

-- ============================================================================
-- 3. OS MARCOS POR DATA
-- ============================================================================

create or replace function public._funnel_milestones_core(
  p_equipe          uuid,
  p_restrict        uuid,
  p_from            timestamptz,
  p_to              timestamptz,
  p_granularity     text   default 'day',
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null,
  p_channels        text[] default null,
  p_timezone        text   default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_step   interval;
  v_first  date;
  v_last   date;
  v_result jsonb;
begin
  -- Lista fechada: p_granularity vai para date_trunc.
  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'invalid_granularity: %', p_granularity using errcode = '22023';
  end if;
  v_step  := case p_granularity when 'week' then interval '1 week'
                                when 'month' then interval '1 month'
                                else interval '1 day' end;
  -- Baldes em DIAS LOCAIS: date_trunc sobre timestamptz usaria o fuso da sessão
  -- (UTC no Supabase) e jogaria a reunião das 22h de Brasília no dia seguinte.
  v_first := date_trunc(p_granularity, (p_from at time zone p_timezone))::date;
  v_last  := date_trunc(p_granularity, ((p_to - interval '1 microsecond') at time zone p_timezone))::date;

  with
  opps as (
    select o.id, o.pipeline_id
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
      join public.v_lead_channel c on c.lead_id = l.id
     where o.equipe_id = p_equipe
       and o.deleted_at is null
       and l.deleted_at is null
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
       and (p_channels is null or c.acquisition_channel = any(p_channels))
  ),
  ev as (
    select fe.opportunity_id, fe.event, fe.owner_id, o.pipeline_id,
           date_trunc(p_granularity, (fe.occurred_at at time zone p_timezone))::date as bucket
      from public.funnel_events fe
      join opps o on o.id = fe.opportunity_id
     where fe.equipe_id = p_equipe
       and fe.event in ('qualified', 'proposal_sent', 'meeting_scheduled', 'meeting_done', 'no_show', 'won')
       and fe.occurred_at >= p_from and fe.occurred_at < p_to
       and (p_restrict is null or fe.owner_id = p_restrict)
       and (p_responsible_ids is null or fe.owner_id = any(p_responsible_ids))
       -- Mesma regra do get_funnel_series: um ganho depois reaberto não conta.
       and not (fe.event = 'won' and exists (
             select 1 from public.funnel_events reo
              where reo.opportunity_id = fe.opportunity_id
                and reo.event = 'reopened'
                and reo.occurred_at > fe.occurred_at))
  ),
  -- Um só passe, quatro recortes: total, por balde, por vendedor, por pipeline.
  agg as (
    select grouping(ev.bucket)      as g_bucket,
           grouping(ev.owner_id)    as g_owner,
           grouping(ev.pipeline_id) as g_pipe,
           ev.bucket, ev.owner_id, ev.pipeline_id,
           jsonb_build_object(
             'qualified',         count(*) filter (where ev.event = 'qualified'),
             'proposal_sent',     count(*) filter (where ev.event = 'proposal_sent'),
             'meeting_scheduled', count(*) filter (where ev.event = 'meeting_scheduled'),
             'meeting_done',      count(*) filter (where ev.event = 'meeting_done'),
             'no_show',           count(*) filter (where ev.event = 'no_show'),
             'won',               count(distinct ev.opportunity_id) filter (where ev.event = 'won')
           ) as counts
      from ev
     group by grouping sets ((), (ev.bucket), (ev.owner_id), (ev.pipeline_id))
  ),
  zero as (
    select '{"qualified":0,"proposal_sent":0,"meeting_scheduled":0,"meeting_done":0,"no_show":0,"won":0}'::jsonb as z
  ),
  buckets as (
    select g::date as bucket from generate_series(v_first, v_last, v_step) g
  ),
  first_seen as (
    select fe.event, min(fe.occurred_at) as first_at
      from public.funnel_events fe
      join opps o on o.id = fe.opportunity_id
     where fe.equipe_id = p_equipe
       and fe.event in ('qualified', 'proposal_sent', 'meeting_scheduled', 'meeting_done', 'no_show', 'won')
     group by fe.event
  )
  select jsonb_build_object(
    'period',      jsonb_build_object('from', p_from, 'to', p_to),
    'granularity', p_granularity,
    'timezone',    p_timezone,
    'totals',      coalesce((select a.counts from agg a where a.g_bucket = 1 and a.g_owner = 1 and a.g_pipe = 1),
                            (select z from zero)),
    'series',      coalesce((
                     select jsonb_agg(
                              coalesce(a.counts, (select z from zero))
                              || jsonb_build_object(
                                   'bucket',     to_char(b.bucket, 'YYYY-MM-DD'),
                                   'bucket_end', ((b.bucket + v_step)::timestamp at time zone p_timezone))
                              order by b.bucket)
                       from buckets b
                       left join agg a on a.g_bucket = 0 and a.bucket = b.bucket), '[]'::jsonb),
    'by_seller',   coalesce((
                     select jsonb_agg(
                              a.counts || jsonb_build_object(
                                'seller_id',   a.owner_id,
                                'seller_name', case when a.owner_id is null then 'Não atribuído'
                                                    else coalesce(pr.nome_completo, 'Usuário removido') end)
                              order by pr.nome_completo nulls last)
                       from agg a
                       left join public.profiles pr on pr.id = a.owner_id
                      where a.g_owner = 0 and a.g_bucket = 1 and a.g_pipe = 1), '[]'::jsonb),
    'by_pipeline', coalesce((
                     select jsonb_agg(
                              a.counts || jsonb_build_object(
                                'pipeline_id',   a.pipeline_id,
                                'pipeline_name', coalesce(pl.name, 'Pipeline removido'))
                              order by pl.name nulls last)
                       from agg a
                       left join public.pipelines pl on pl.id = a.pipeline_id
                      where a.g_pipe = 0 and a.g_bucket = 1 and a.g_owner = 1), '[]'::jsonb),
    -- O primeiro evento de cada marco no escopo da equipe/pipeline/canal (sem
    -- recorte de vendedor nem de janela): é um fato sobre a SÉRIE, não sobre o
    -- período pedido.
    'since',       (select jsonb_object_agg(m.e, fs.first_at)
                      from unnest(array['qualified', 'proposal_sent', 'meeting_scheduled',
                                        'meeting_done', 'no_show', 'won']) m(e)
                      left join first_seen fs on fs.event = m.e)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public._funnel_milestones_core(uuid, uuid, timestamptz, timestamptz, text, uuid[], uuid[], text[], text)
  from public, anon, authenticated;

create or replace function public.get_funnel_milestones(
  p_from            timestamptz,
  p_to              timestamptz,
  p_granularity     text   default 'day',
  p_pipeline_ids    uuid[] default null,
  p_responsible_ids uuid[] default null,
  p_channels        text[] default null,
  p_timezone        text   default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_equipe uuid; v_restrict uuid;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;
  return public._funnel_milestones_core(
    v_equipe, v_restrict, p_from::timestamptz, p_to::timestamptz, p_granularity::text,
    p_pipeline_ids::uuid[], p_responsible_ids::uuid[], p_channels::text[], p_timezone::text);
end;
$$;

revoke all on function public.get_funnel_milestones(timestamptz, timestamptz, text, uuid[], uuid[], text[], text) from public, anon;
grant execute on function public.get_funnel_milestones(timestamptz, timestamptz, text, uuid[], uuid[], text[], text) to authenticated;

comment on function public.get_funnel_milestones(timestamptz, timestamptz, text, uuid[], uuid[], text[], text) is
  'SE-SUP1-8 #10: os seis marcos por balde (dia/semana/mês no fuso do cliente), por vendedor e por pipeline, + o primeiro evento de cada marco (since). Escopo da equipe; assento comum só vê os próprios.';

-- ============================================================================
-- 4. O RELATÓRIO: build_report_snapshot com os marcos por vendedor
--
-- Corpo da 20261015000402, inalterado, mais a chave `funnel_milestones`.
-- ============================================================================

create or replace function public.build_report_snapshot(
  p_equipe      uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_sections    text[] default null,
  p_filters     jsonb  default '{}'::jsonb,
  p_pipeline_id uuid   default null,
  p_timezone    text   default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_pipelines  uuid[];
  v_channels   text[];
  v_resp       uuid[];
  v_sections   text[] := coalesce(p_sections, array[]::text[]);
  v_equipe     text;
  v_pipe_name  text;
  v_from_day   date := (p_from at time zone p_timezone)::date;
  v_to_day     date := ((p_to - interval '1 microsecond') at time zone p_timezone)::date + 1;
  v_month_s    date := date_trunc('month', (p_from at time zone p_timezone))::date;
  v_quarter_s  date := date_trunc('quarter', (p_from at time zone p_timezone))::date;
  v_top_won    jsonb;
  v_goals      jsonb;
begin
  select nome into v_equipe from public.equipes where id = p_equipe;

  -- A coluna do agendamento manda; `filters.pipeline_ids` continua valendo para
  -- agendamentos antigos (pipeline_id nulo).
  if p_pipeline_id is not null then
    select p.name into v_pipe_name from public.pipelines p
     where p.id = p_pipeline_id and p.equipe_id = p_equipe;
    if v_pipe_name is null then
      raise exception 'pipeline_not_in_team' using errcode = '42501';
    end if;
    v_pipelines := array[p_pipeline_id];
  elsif p_filters ? 'pipeline_ids' and jsonb_typeof(p_filters->'pipeline_ids') = 'array'
        and jsonb_array_length(p_filters->'pipeline_ids') > 0 then
    v_pipelines := array(select (jsonb_array_elements_text(p_filters->'pipeline_ids'))::uuid);
    -- Filtro legado: o cabeçalho do relatório nomeia o recorte em vez de dizer
    -- "Todos os pipelines".
    select string_agg(p.name, ', ' order by p.name) into v_pipe_name
      from public.pipelines p where p.equipe_id = p_equipe and p.id = any(v_pipelines);
  end if;

  -- Recortes: o cliente escolhe canal e vendedor; não escolhe seções.
  if p_filters ? 'channels' and jsonb_typeof(p_filters->'channels') = 'array'
     and jsonb_array_length(p_filters->'channels') > 0 then
    v_channels := array(select jsonb_array_elements_text(p_filters->'channels'));
  end if;
  if p_filters ? 'responsible_ids' and jsonb_typeof(p_filters->'responsible_ids') = 'array'
     and jsonb_array_length(p_filters->'responsible_ids') > 0 then
    v_resp := array(select (jsonb_array_elements_text(p_filters->'responsible_ids'))::uuid);
  end if;

  -- Maiores ganhos NA janela (destaque positivo). Mesmo escopo do overview.
  select coalesce(jsonb_agg(w.x order by w.val desc), '[]'::jsonb)
    into v_top_won
    from (
      select d.x, d.val
        from (
          select distinct on (o.id)
                 jsonb_build_object(
                   'lead_name',        l.name,
                   'value',            coalesce(o.value, 0),
                   'responsible_name', pr.nome_completo) as x,
                 coalesce(o.value, 0) as val
            from public.funnel_events fe
            join public.opportunities o on o.id = fe.opportunity_id
            join public.leads l on l.id = o.lead_id
            left join public.profiles pr on pr.id = l.responsible_id
            left join public.v_lead_channel c on c.lead_id = l.id
           where fe.equipe_id = p_equipe
             and fe.event = 'won'
             and fe.occurred_at >= p_from and fe.occurred_at < p_to
             and o.deleted_at is null and l.deleted_at is null
             and (v_pipelines is null or o.pipeline_id = any(v_pipelines))
             and (v_resp is null or l.responsible_id = any(v_resp))
             and (v_channels is null or c.acquisition_channel = any(v_channels))
           order by o.id
        ) d
       order by d.val desc
       limit 3
    ) w;

  -- Insumos da meta: revenue_config CRU por pipeline do escopo. Quem deriva é
  -- _shared/report-targets.ts.
  select coalesce(jsonb_agg(jsonb_build_object(
           'pipeline_id',   p.id,
           'name',          p.name,
           'period',        p.revenue_config->>'period',
           'goal_deals',    p.revenue_config->'goal_deals',
           'goal_revenue',  p.revenue_config->'goal_revenue',
           'daily_targets', p.revenue_config->'daily_targets') order by p.name), '[]'::jsonb)
    into v_goals
    from public.pipelines p
   where p.equipe_id = p_equipe
     and (v_pipelines is null or p.id = any(v_pipelines))
     and (v_pipelines is not null or p.is_archived = false);

  return jsonb_build_object(
    'equipe_name', v_equipe,
    'period',      jsonb_build_object('from', p_from, 'to', p_to),
    'sections',    to_jsonb(v_sections),
    'pipeline',    case when v_pipe_name is not null
                        then jsonb_build_object('id', p_pipeline_id, 'name', v_pipe_name) end,
    'overview',    public._funnel_overview_core(p_equipe, null, p_from, p_to, v_pipelines, v_resp, v_channels),
    'loss_reasons',      public._loss_reasons_core(p_equipe, null, p_from, p_to, v_pipelines),
    'top_opportunities', public._top_opportunities_core(p_equipe, null, 5, v_pipelines),
    'top_won',           v_top_won,
    'touchpoints_by_seller',
                   public._touchpoints_by_seller_core(
                     p_equipe, null, p_from, p_to, v_pipelines, v_channels, v_resp, p_timezone),
    -- SE-SUP1-8 (#10): marcos por vendedor + início de cada série (seção 3).
    'funnel_milestones',
                   public._funnel_milestones_core(
                     p_equipe, null, p_from, p_to, 'day', v_pipelines, v_resp, v_channels, p_timezone),
    'goals', jsonb_build_object(
      'window_business_days',  public._business_days(v_from_day, v_to_day),
      'month_business_days',   public._business_days(v_month_s, (v_month_s + interval '1 month')::date),
      'quarter_business_days', public._business_days(v_quarter_s, (v_quarter_s + interval '3 months')::date),
      'pipelines',             v_goals)
  );
end;
$$;

comment on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb, uuid, text) is
  'SE-SUP1-5/8: snapshot de template fixo — sempre os mesmos blocos (agora com funnel_milestones). Mesmos _core do dashboard. p_pipeline_id restringe a um pipeline.';

revoke all on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb, uuid, text) to service_role;
