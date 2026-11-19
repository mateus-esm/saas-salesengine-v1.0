-- Fechamento de venda + linha do tempo do negócio.
--
-- 1. Quem agendou a reunião: agenda_events.created_by.
-- 2. Quando cada proposta/contrato mudou de status: artifact_status_events
--    (aceite não gerava marco nenhum; "quando foi aceita?" não tinha resposta).
-- 3. crm_deal_timeline: resumo (ciclo, 1ª resposta, touchpoints, reuniões,
--    no-shows, SLA) + itens + artefatos + eventos em ordem, para o card.
-- 4. crm_close_won_prepare: o checklist do "Ganho" — itens que fecharam (os
--    outros saem do negócio, soft delete), a proposta aceita e o contrato
--    assinado (os concorrentes viram 'rejected', para o payload do ERP achar UM),
--    e o valor real. Roda ANTES da mudança de etapa: o webhook de ganho dispara
--    no update de stage_id e já lê tudo certo.

begin;

alter table public.agenda_events add column if not exists created_by uuid default auth.uid();
alter table public.opportunities add column if not exists won_snapshot jsonb;

-- ============================================================================
-- STATUS DOS ARTEFATOS, COM DATA
-- ============================================================================

create table if not exists public.artifact_status_events (
  id             bigserial primary key,
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  record_id      uuid not null references public.custom_table_records(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  kind           text,
  from_status    text,
  to_status      text not null,
  actor          uuid default auth.uid(),
  occurred_at    timestamptz not null default clock_timestamp()
);
create index if not exists artifact_status_events_opp_idx on public.artifact_status_events (opportunity_id, occurred_at);
-- Só lida pelos RPCs security definer: RLS ligado, sem política.
alter table public.artifact_status_events enable row level security;
revoke all on public.artifact_status_events from anon, authenticated;

create or replace function public.fn_log_artifact_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.artifact_status is distinct from old.artifact_status and new.artifact_status is not null then
    insert into public.artifact_status_events (equipe_id, record_id, opportunity_id, kind, from_status, to_status)
    select new.equipe_id, new.id, new.opportunity_id, t.artifact_kind, old.artifact_status, new.artifact_status
      from public.custom_tables t where t.id = new.table_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_artifact_status on public.custom_table_records;
create trigger trg_log_artifact_status
  after update of artifact_status on public.custom_table_records
  for each row execute function public.fn_log_artifact_status();

-- ============================================================================
-- RESUMO DE UM ARTEFATO (título, valor, itens)
-- ============================================================================

create or replace function public._crm_artifact_brief(p_record_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'kind', t.artifact_kind,
    'table', t.name,
    'status', r.artifact_status,
    'created_at', r.created_at,
    'value', coalesce(
      nullif(f->>'preco_total', '')::numeric, nullif(f->>'valor_negocio', '')::numeric,
      nullif(f->>'valor_total', '')::numeric, nullif(f->>'valor', '')::numeric),
    'items', (select string_agg(i->>'name', ', ')
                from jsonb_array_elements(case when jsonb_typeof(f->'itens') = 'array' then f->'itens' else '[]'::jsonb end) i),
    'title', coalesce(f->>'titulo', f->>'nome_completo', f->>'cliente', t.name))
  from public.custom_table_records r
  join public.custom_tables t on t.id = r.table_id
  cross join lateral (select coalesce(public._crm_artifact_record_fields(r.id), '{}'::jsonb) as f) x
  where r.id = p_record_id;
$$;
revoke all on function public._crm_artifact_brief(uuid) from public, anon, authenticated;

-- ============================================================================
-- LINHA DO TEMPO
-- ============================================================================

create or replace function public.crm_deal_timeline(p_opportunity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_opp  public.opportunities;
  v_lead public.leads;
  v_res  jsonb;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  select * into v_opp from public.opportunities o
   where o.id = p_opportunity_id and o.equipe_id = v_team and o.deleted_at is null;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads l where l.id = v_opp.lead_id;

  with names as (
    select p.id, p.nome_completo as name from public.profiles p where p.equipe_id = v_team
  ),
  meetings as (
    select a.* from public.agenda_events a
     where a.equipe_id = v_team and a.deleted_at is null and coalesce(a.type, 'meeting') <> 'block'
       and (a.opportunity_id = v_opp.id or (a.opportunity_id is null and a.lead_id = v_opp.lead_id))
  ),
  tps as (
    select t.*, row_number() over (order by t.created_at) as n
      from public.touchpoints t where t.lead_id = v_opp.lead_id
  ),
  has_log as (
    select exists (select 1 from public.artifact_status_events e where e.opportunity_id = v_opp.id) as yes
  ),
  ev as (
    -- o lead e o negócio
    select v_lead.created_at as at, 'lead' as kind, 'Lead entrou' as label,
           (select c.acquisition_channel from public.v_lead_channel c where c.lead_id = v_lead.id limit 1) as detail,
           null::uuid as actor
     where v_lead.id is not null and v_lead.created_at < v_opp.created_at - interval '1 minute'
    union all
    select v_opp.created_at, 'created', 'Negócio criado', null, null
    -- touchpoints
    union all
    select t.created_at, 'touchpoint', 'Touchpoint ' || t.n || coalesce(' · ' || t.touchpoint_type, ''),
           left(t.content, 90), t.user_id
      from tps t
    -- etapas (com o significado da etapa)
    union all
    select h.changed_at,
           coalesce(case when f.stage_type = 'ciclo' then 'recycled' end, f.funnel_event, 'stage'),
           'Etapa: ' || coalesce(f.stage_name, '—'),
           (select 'de ' || ff.stage_name from public.v_stage_funnel_event ff where ff.stage_id = h.from_stage_id),
           h.changed_by
      from public.opportunity_stage_history h
      left join public.v_stage_funnel_event f on f.stage_id = h.to_stage_id
     where h.opportunity_id = v_opp.id and h.from_stage_id is not null
    -- reuniões: agendada (por quem, para quando) e o desfecho
    union all
    select m.created_at, 'meeting_scheduled',
           case when m.type = 'meeting' or m.type is null then 'Reunião agendada' else 'Compromisso agendado' end,
           coalesce(m.title || ' · ', '') || 'para ' || to_char(m.starts_at at time zone 'America/Fortaleza', 'DD/MM HH24:MI'),
           m.created_by
      from meetings m
    union all
    select coalesce(m.outcome_at, m.starts_at),
           case m.outcome when 'no_show' then 'no_show' else 'meeting_done' end,
           case m.outcome when 'no_show' then 'No-show' when 'technical_visit' then 'Visita técnica realizada'
                          else 'Reunião realizada' end,
           m.title, m.outcome_by
      from meetings m where m.outcome is not null
    -- marcos manuais/artefato que não vieram de etapa nem da agenda
    union all
    select e.occurred_at, e.event,
           case e.event when 'meeting_done' then 'Reunião realizada' when 'no_show' then 'No-show'
                        when 'proposal_sent' then 'Proposta enviada' when 'contract_sent' then 'Contrato enviado'
                        when 'contract_signed' then 'Contrato assinado' when 'qualified' then 'Qualificado'
                        when 'meeting_scheduled' then 'Reunião agendada' else e.event end,
           null, e.actor
      from public.funnel_events e
     where e.opportunity_id = v_opp.id
       and e.source not in ('stage_change', 'status_change', 'opportunity_created', 'recompute', 'import')
       and not exists (select 1 from meetings m where m.outcome_event_id = e.id)
       and not (e.source = 'artifact' and (select yes from has_log))
    -- propostas e contratos: criados e cada mudança de status
    union all
    select r.created_at, t.artifact_kind || '_created',
           case t.artifact_kind when 'proposal' then 'Proposta criada' when 'contract' then 'Contrato criado'
                                else 'Documento criado' end,
           t.name, null
      from public.custom_table_records r join public.custom_tables t on t.id = r.table_id
     where r.opportunity_id = v_opp.id and r.deleted_at is null and t.artifact_kind is not null
    union all
    select e.occurred_at, coalesce(e.kind, 'document') || '_' || e.to_status,
           case coalesce(e.kind, 'document') when 'proposal' then 'Proposta ' when 'contract' then 'Contrato ' else 'Documento ' end
           || case e.to_status when 'sent' then 'enviada' when 'accepted' then 'aceita' when 'signed' then 'assinado'
                               when 'rejected' then 'descartada' when 'generated' then 'gerada' else e.to_status end,
           null, e.actor
      from public.artifact_status_events e where e.opportunity_id = v_opp.id
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'created_at', v_opp.created_at,
      'closed_at', v_opp.closed_at,
      'cycle_days', ceil(extract(epoch from (coalesce(v_opp.closed_at, now()) - v_opp.created_at)) / 86400)::int,
      'first_response_hours', (select round((extract(epoch from (min(t.created_at) - v_opp.created_at)) / 3600)::numeric, 1)
                                 from tps t where t.created_at >= v_opp.created_at - interval '1 minute'),
      'touchpoints', (select count(*) from tps),
      'last_touchpoint_at', (select max(t.created_at) from tps t),
      'meetings_scheduled', (select count(*) from meetings),
      'meetings_done', (select count(*) from public.funnel_events e where e.opportunity_id = v_opp.id and e.event = 'meeting_done'),
      'no_shows', (select count(*) from public.funnel_events e where e.opportunity_id = v_opp.id and e.event = 'no_show'),
      'stage_sla_hours', (select nullif(s.max_idle_hours, 0) from public.pipeline_stages_v2 s where s.id = v_opp.stage_id),
      'hours_in_stage', round((extract(epoch from (now() - v_opp.stage_entered_at)) / 3600)::numeric, 1),
      'value', v_opp.value,
      'won_snapshot', v_opp.won_snapshot
    ),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'quantity', i.quantity,
                                                           'unit_price', i.unit_price, 'total', i.total)
                                        order by i.position, i.created_at)
                         from public.opportunity_items i
                        where i.opportunity_id = v_opp.id and i.deleted_at is null), '[]'::jsonb),
    'artifacts', coalesce((select jsonb_agg(public._crm_artifact_brief(r.id) order by r.created_at desc)
                             from public.custom_table_records r
                             join public.custom_tables t on t.id = r.table_id and t.artifact_kind is not null
                            where r.opportunity_id = v_opp.id and r.deleted_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', ev.at, 'kind', ev.kind, 'label', ev.label,
                                                            'detail', ev.detail, 'actor', n.name)
                                         order by ev.at)
                          from ev left join names n on n.id = ev.actor
                         where ev.at is not null), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

revoke all on function public.crm_deal_timeline(uuid) from public, anon;
grant execute on function public.crm_deal_timeline(uuid) to authenticated;

-- ============================================================================
-- O CHECKLIST DO GANHO
-- ============================================================================

-- p_items: [{ id, won: bool, unit_price? }]; itens fora da lista ficam como estão.
create or replace function public.crm_close_won_prepare(
  p_opportunity_id uuid,
  p_items          jsonb,
  p_proposal_id    uuid,
  p_contract_id    uuid,
  p_value          numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team  uuid;
  v_opp   public.opportunities;
  v_item  jsonb;
  v_id    uuid;
  v_kind  text;
  v_rec   record;
  v_lost  text[] := array[]::text[];
  v_name  text;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  select * into v_opp from public.opportunities o
   where o.id = p_opportunity_id and o.equipe_id = v_team and o.deleted_at is null
   for update;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  -- Itens: o que não fechou sai do negócio (fica no histórico, deleted_at).
  for v_item in select e.value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e loop
    v_id := nullif(v_item->>'id', '')::uuid;
    if coalesce((v_item->>'won')::boolean, true) then
      update public.opportunity_items i
         set unit_price = coalesce(nullif(v_item->>'unit_price', '')::numeric, i.unit_price), updated_at = now()
       where i.id = v_id and i.opportunity_id = v_opp.id and i.deleted_at is null;
    else
      v_name := null;
      update public.opportunity_items i set deleted_at = now()
       where i.id = v_id and i.opportunity_id = v_opp.id and i.deleted_at is null
      returning i.name into v_name;
      if v_name is not null then v_lost := v_lost || v_name; end if;
    end if;
  end loop;

  -- Proposta e contrato que fecharam; os concorrentes vivos viram 'rejected'.
  foreach v_kind in array array['proposal', 'contract'] loop
    v_id := case v_kind when 'proposal' then p_proposal_id else p_contract_id end;
    continue when v_id is null;
    if not exists (select 1 from public.custom_table_records r join public.custom_tables t on t.id = r.table_id
                    where r.id = v_id and r.opportunity_id = v_opp.id and r.deleted_at is null
                      and t.artifact_kind = v_kind) then
      raise exception '%_not_in_deal', v_kind using errcode = 'P0002';
    end if;
    for v_rec in
      select r.id from public.custom_table_records r join public.custom_tables t on t.id = r.table_id
       where r.opportunity_id = v_opp.id and r.deleted_at is null and t.artifact_kind = v_kind
         and r.id <> v_id and coalesce(r.artifact_status, 'draft') not in ('draft', 'rejected')
    loop
      perform public._crm_apply_artifact_status(v_rec.id, 'rejected', 'team');
    end loop;
    perform public._crm_apply_artifact_status(v_id, case v_kind when 'proposal' then 'accepted' else 'signed' end, 'team');
  end loop;

  -- Valor: com itens, a soma (trigger); sem itens, o informado.
  update public.opportunities o
     set value = coalesce(p_value, o.value),
         won_snapshot = jsonb_build_object(
           'at', now(), 'by', auth.uid(),
           'items_won', (select coalesce(jsonb_agg(i.name order by i.position), '[]'::jsonb)
                           from public.opportunity_items i where i.opportunity_id = o.id and i.deleted_at is null),
           'items_lost', to_jsonb(v_lost),
           'proposal_id', p_proposal_id, 'contract_id', p_contract_id)
   where o.id = v_opp.id
  returning * into v_opp;

  update public.opportunities o set won_snapshot = o.won_snapshot || jsonb_build_object('value', o.value)
   where o.id = v_opp.id
  returning * into v_opp;

  return jsonb_build_object('value', v_opp.value, 'stage_id', v_opp.stage_id);
end;
$$;

revoke all on function public.crm_close_won_prepare(uuid, jsonb, uuid, uuid, numeric) from public, anon;
grant execute on function public.crm_close_won_prepare(uuid, jsonb, uuid, uuid, numeric) to authenticated;

commit;
