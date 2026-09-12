-- Sprint 11 · Onda 3 · T28 — a etapa decide o desfecho.
--
-- ANTES
--
-- Mover um card para uma etapa de ganho ou de perda gravava o evento (pelo
-- histórico de etapa → fn_record_stage_funnel_event), mas `opportunities.status`
-- só mudava se alguém trocasse o "Status" no modal. Em 11/09, 197 negócios em
-- etapa de perda e 3 em etapa de ganho estavam "open": contavam como em
-- andamento no placar e como "negociando" na Base de Contatos. E o mesmo ganho
-- podia gravar dois eventos (pela etapa e pelo status).
--
-- AGORA (decisão 11)
--
--   * Entrar numa etapa de ganho/perda fecha: status do tipo da etapa, closed_at
--     (agora, ou a data que o escritor mandou — importação). Trocar entre duas
--     etapas de perda mantém o fechamento.
--   * Sair de uma etapa de ganho/perda para uma aberta (ou de reciclo) REABRE:
--     status open, closed_at e lost_reason limpos, evento `reopened`.
--   * Escrever o status direto (modal, regra do Agente CRM, API) move o negócio
--     para a primeira etapa daquele tipo no pipeline ("open" → primeira aberta).
--     Sem etapa daquele tipo no pipeline, o status escrito vale como está.
--   * O ganho/perda tem um evento só: quem emite é o caminho da etapa (histórico,
--     com autor, idempotente por source_row_id). O gatilho de status só emite
--     quando o negócio não está numa etapa daquele tipo (pipelines sem etapa de
--     ganho) — e emite a reabertura.
--   * O evento de quem NASCE ganho/perdido (importação) tem a data do fechamento,
--     não a da criação: um ganho de março importado hoje é um ganho de março.
--   * Catálogo de eventos: + `reopened`, `recycled` (T34). Fonte: + `timer` (T34).
--
-- closed_at usa clock_timestamp(), não now(): dentro de uma transação now() é fixo, e
-- um reabrir + ganhar de novo no mesmo lote (o agendador, um teste) cairia no mesmo
-- instante do primeiro ganho — a receita (T31) e o dono do momento dependem da hora.
--
-- A ordem dos gatilhos BEFORE é alfabética: trg_opportunity_block_archived,
-- trg_opportunity_default_owner, trg_opportunity_outcome (este),
-- trg_opportunity_owner_same_team, trg_opportunity_stage_change. Este roda antes
-- do que grava o histórico, então a etapa que ele escolhe é a que fica no histórico.

-- ============================================================================
-- 1. O CATÁLOGO DE EVENTOS
-- ============================================================================

alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check check (event = any (array[
  'qualified', 'proposal_sent', 'meeting_scheduled', 'meeting_done', 'no_show',
  'won', 'lost', 'reopened', 'recycled'
]));

alter table public.funnel_events drop constraint if exists funnel_events_source_check;
alter table public.funnel_events add constraint funnel_events_source_check check (source = any (array[
  'stage_change', 'status_change', 'opportunity_created', 'manual', 'import', 'recompute', 'timer'
]));

-- ============================================================================
-- 2. O DESFECHO PELA ETAPA
-- ============================================================================

create or replace function public.fn_opportunity_outcome()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_type   text;
  v_target uuid;
  v_status_written boolean;
begin
  -- O status foi escrito direto (sem trocar de etapa)? Leva à etapa do tipo.
  if tg_op = 'INSERT' then
    v_status_written := new.status in ('won', 'lost');
  else
    v_status_written := new.status is distinct from old.status
                        and new.stage_id is not distinct from old.stage_id;
  end if;

  select s.stage_type into v_type from public.pipeline_stages_v2 s where s.id = new.stage_id;

  if v_status_written then
    if new.status in ('won', 'lost') and v_type is distinct from new.status then
      select s.id into v_target
        from public.pipeline_stages_v2 s
       where s.pipeline_id = new.pipeline_id and s.stage_type = new.status and s.deleted_at is null
       order by s.position, s.created_at
       limit 1;
    elsif new.status = 'open' and v_type in ('won', 'lost') then
      select s.id into v_target
        from public.pipeline_stages_v2 s
       where s.pipeline_id = new.pipeline_id and s.stage_type = 'open' and s.deleted_at is null
       order by s.position, s.created_at
       limit 1;
    end if;
    if v_target is not null then
      new.stage_id := v_target;
      select s.stage_type into v_type from public.pipeline_stages_v2 s where s.id = v_target;
    end if;
  end if;

  if v_type in ('won', 'lost') then
    -- Na etapa de ganho/perda: fechado, com a data de quando fechou.
    if tg_op = 'INSERT' then
      new.closed_at := coalesce(new.closed_at, clock_timestamp());
    elsif old.status is distinct from v_type or old.closed_at is null then
      new.closed_at := case when new.closed_at is distinct from old.closed_at and new.closed_at is not null
                            then new.closed_at else clock_timestamp() end;
    end if;
    new.status := v_type;
  elsif new.status in ('won', 'lost') then
    -- Numa etapa aberta com status fechado: se o pipeline tem onde fechar, é uma
    -- reabertura (o negócio saiu da etapa de ganho/perda); se não tem, o status
    -- escrito vale como está.
    if exists (select 1 from public.pipeline_stages_v2 s
                where s.pipeline_id = new.pipeline_id and s.stage_type = new.status and s.deleted_at is null) then
      new.status := 'open';
    end if;
  end if;

  if new.status = 'open' then
    new.closed_at := null;
    if tg_op = 'UPDATE' and old.status = 'lost' then
      new.lost_reason := null;
    end if;
  elsif new.status in ('won', 'lost') and new.closed_at is null then
    new.closed_at := clock_timestamp();
  end if;

  return new;
end;
$$;

comment on function public.fn_opportunity_outcome() is
  'Sprint 11 · T28: the stage decides the outcome. A won/lost stage closes the deal; leaving it reopens; a status written directly moves the deal to the first stage of that type (or stands, when the pipeline has none).';

drop trigger if exists trg_opportunity_outcome on public.opportunities;
create trigger trg_opportunity_outcome
  before insert or update of stage_id, status, closed_at, pipeline_id on public.opportunities
  for each row execute function public.fn_opportunity_outcome();

-- ============================================================================
-- 3. UM EVENTO POR DESFECHO
-- ============================================================================

-- O gatilho de status: a reabertura sempre; o ganho/perda só quando a etapa não
-- é do mesmo tipo (quem está numa etapa de ganho já teve o `won` gravado pelo
-- histórico da etapa — ou pelo nascimento).
create or replace function public.fn_record_status_funnel_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_type  text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'open' and old.status in ('won', 'lost') then
    v_event := 'reopened';
  elsif new.status in ('won', 'lost') then
    select s.stage_type into v_type from public.pipeline_stages_v2 s where s.id = new.stage_id;
    if v_type = new.status then
      return new;
    end if;
    v_event := new.status;
  else
    return new;
  end if;

  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type)
  values
    (new.equipe_id, new.id, new.lead_id, new.pipeline_id, new.stage_id,
     v_event,
     case when v_event = 'reopened' then clock_timestamp() else coalesce(new.closed_at, clock_timestamp()) end,
     'status_change', auth.uid(),
     case when auth.uid() is null then 'system' else 'team' end)
  on conflict do nothing;

  return new;
end;
$$;

-- O gatilho antigo era `AFTER UPDATE OF status ... WHEN (novo status em won/lost e
-- a etapa não mudou)`. Um gatilho por coluna só dispara se a coluna está no SET do
-- UPDATE — a mudança feita por um gatilho BEFORE não conta. Mover o card (SET
-- stage_id) muda o status aqui dentro, e a reabertura nunca seria registrada.
-- Agora dispara a cada mudança real de status; a função decide o que é evento.
drop trigger if exists trg_funnel_from_status_change on public.opportunities;
create trigger trg_funnel_from_status_change
  after update on public.opportunities
  for each row
  when (old.status is distinct from new.status)
  execute function public.fn_record_status_funnel_event();

-- Quem nasce ganho/perdido: o evento tem a data do fechamento.
create or replace function public.fn_record_created_funnel_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  select e.funnel_event into v_event
    from public.v_stage_funnel_event e
   where e.stage_id = new.stage_id;

  if v_event is null then
    return new;
  end if;

  insert into public.funnel_events
    (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event,
     occurred_at, source, actor, actor_type)
  values
    (new.equipe_id, new.id, new.lead_id, new.pipeline_id, new.stage_id,
     v_event,
     case when v_event in ('won', 'lost') then coalesce(new.closed_at, new.created_at) else new.created_at end,
     'opportunity_created', auth.uid(),
     case when auth.uid() is null then 'system' else 'team' end)
  on conflict do nothing;

  return new;
end;
$$;
