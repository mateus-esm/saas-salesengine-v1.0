-- Sprint 11 · Onda 4 · T43 — o ciclo de vida do artefato prova o marco (decisão 25).
--
-- STATUS. rascunho → enviado → aceito/assinado · recusado, só pelo verbo
-- `crm_set_artifact_status` (a gravação direta de `artifact_status` é recusada:
-- quem muda o status tem de passar pela regra do marco). Proposta: rascunho,
-- enviada, aceita, recusada. Contrato: rascunho, enviado, assinado, recusado.
-- Documento: todos.
--
-- MARCO. Proposta enviada = `proposal_sent`; contrato enviado = `contract_sent`;
-- contrato assinado = `contract_signed`. Se a linha tem a etapa que declara o
-- marco e o negócio está antes dela, o negócio avança para ela — o evento sai
-- pelo caminho da etapa (uma fonte só). Senão, o evento é gravado direto (fonte
-- `artifact`), uma vez por negócio. Nunca volta etapa; negócio fechado não se
-- mexe.
--
-- `_crm_apply_artifact_status` é a regra (sem checagem de equipe, só o banco
-- chama — o retorno do n8n no T44 usa com autor "automation"); o verbo público
-- confere a equipe pelo token.

-- ============================================================================
-- 1. A FONTE "artifact" NO CATÁLOGO DE EVENTOS
-- ============================================================================

alter table public.funnel_events drop constraint if exists funnel_events_source_check;
alter table public.funnel_events add constraint funnel_events_source_check check (source = any (array[
  'stage_change', 'status_change', 'opportunity_created', 'manual', 'import', 'recompute', 'timer', 'artifact'
]));

-- ============================================================================
-- 2. AS REGRAS POR TIPO
-- ============================================================================

create or replace function public._crm_artifact_statuses(p_kind text)
returns text[]
language sql
immutable
as $$
  select case p_kind
    when 'proposal' then array['draft', 'sent', 'accepted', 'rejected']
    when 'contract' then array['draft', 'sent', 'signed', 'rejected']
    when 'document' then array['draft', 'sent', 'accepted', 'signed', 'rejected']
  end;
$$;

create or replace function public._crm_artifact_milestone(p_kind text, p_status text)
returns text
language sql
immutable
as $$
  select case
    when p_kind = 'proposal' and p_status = 'sent'   then 'proposal_sent'
    when p_kind = 'contract' and p_status = 'sent'   then 'contract_sent'
    when p_kind = 'contract' and p_status = 'signed' then 'contract_signed'
  end;
$$;

-- ============================================================================
-- 3. O STATUS SÓ MUDA PELO VERBO
-- ============================================================================

create or replace function public.fn_custom_record_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('crm.artifact_status_verb', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.artifact_status is not null and new.artifact_status <> 'draft' then
      raise exception 'artifact_status_by_verb' using errcode = '42501';
    end if;
  elsif new.artifact_status is distinct from old.artifact_status then
    raise exception 'artifact_status_by_verb' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Depois de trg_custom_record_guard (ordem alfabética), que põe o rascunho.
drop trigger if exists trg_custom_record_status_guard on public.custom_table_records;
create trigger trg_custom_record_status_guard
  before insert or update of artifact_status on public.custom_table_records
  for each row execute function public.fn_custom_record_status_guard();

-- ============================================================================
-- 4. A REGRA
-- ============================================================================

create or replace function public._crm_apply_artifact_status(
  p_record_id  uuid,
  p_status     text,
  p_actor_type text default 'team'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec      public.custom_table_records;
  v_kind     text;
  v_event    text;
  v_opp      public.opportunities;
  v_cur      integer;
  v_target   uuid;
  v_tpos     integer;
  v_moved    boolean := false;
  v_recorded boolean := false;
begin
  if p_actor_type not in ('team', 'automation') then
    raise exception 'invalid_actor_type' using errcode = '22023';
  end if;

  select * into v_rec from public.custom_table_records
   where id = p_record_id and deleted_at is null
   for update;
  if not found then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;

  select t.artifact_kind into v_kind from public.custom_tables t where t.id = v_rec.table_id;
  if v_kind is null then
    raise exception 'not_an_artifact_table' using errcode = '22023';
  end if;
  if p_status is null or not (p_status = any (public._crm_artifact_statuses(v_kind))) then
    raise exception 'invalid_artifact_status' using errcode = '22023';
  end if;

  -- Mesmo status: nada muda, nenhum marco.
  if v_rec.artifact_status is not distinct from p_status then
    return jsonb_build_object('record', public._crm_custom_table_row_json(v_rec), 'moved', false, 'event', null);
  end if;

  perform set_config('crm.artifact_status_verb', 'on', true);
  update public.custom_table_records set artifact_status = p_status where id = p_record_id
  returning * into v_rec;
  perform set_config('crm.artifact_status_verb', '', true);

  v_event := public._crm_artifact_milestone(v_kind, p_status);
  if v_event is not null and v_rec.opportunity_id is not null then
    select * into v_opp from public.opportunities o
     where o.id = v_rec.opportunity_id and o.deleted_at is null;

    if found and v_opp.status = 'open' then
      select s.id, s.position into v_target, v_tpos
        from public.pipeline_stages_v2 s
       where s.pipeline_id = v_opp.pipeline_id
         and s.funnel_event = v_event
         and s.deleted_at is null
       order by s.position
       limit 1;
      select s.position into v_cur from public.pipeline_stages_v2 s where s.id = v_opp.stage_id;

      if v_target is not null and v_tpos > coalesce(v_cur, -1) then
        -- A etapa grava o evento (histórico → funnel_events): uma fonte só.
        perform set_config('crm.actor_type', p_actor_type, true);
        update public.opportunities set stage_id = v_target where id = v_opp.id;
        perform set_config('crm.actor_type', '', true);
        v_moved := true;
      elsif not exists (select 1 from public.funnel_events e
                         where e.opportunity_id = v_opp.id and e.event = v_event) then
        insert into public.funnel_events
          (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event, occurred_at, source, actor, actor_type)
        values
          (v_opp.equipe_id, v_opp.id, v_opp.lead_id, v_opp.pipeline_id, v_opp.stage_id, v_event,
           clock_timestamp(), 'artifact', auth.uid(), p_actor_type);
        v_recorded := true;
      end if;
    end if;
  end if;

  -- `stage_id` quando moveu: a tela que tem o negócio aberto acompanha (senão o
  -- "Salvar" do modal devolveria o negócio à etapa de antes).
  return jsonb_build_object(
    'record', public._crm_custom_table_row_json(v_rec),
    'moved', v_moved,
    'stage_id', case when v_moved then v_target end,
    'event', case when v_moved or v_recorded then v_event end);
end;
$$;

revoke all on function public._crm_apply_artifact_status(uuid, text, text) from public, anon, authenticated;

-- ============================================================================
-- 5. O VERBO
-- ============================================================================

create or replace function public.crm_set_artifact_status(p_record_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null or not exists (select 1 from public.custom_table_records r
                                      where r.id = p_record_id and r.equipe_id = v_equipe and r.deleted_at is null) then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;
  return public._crm_apply_artifact_status(p_record_id, p_status, 'team');
end;
$$;

revoke all on function public.crm_set_artifact_status(uuid, text) from public, anon;
grant execute on function public.crm_set_artifact_status(uuid, text) to authenticated;
