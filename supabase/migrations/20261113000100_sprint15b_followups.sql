-- Sprint 15b · T1 — follow-up agendado: aviso ao responsável, mensagem ao cliente
-- pelo motor de outreach e a volta do Reciclo.
--
-- O OBJETO. Um follow-up (crm_followups) é "nesta data e hora, para este negócio,
-- com este responsável: avisar o responsável, mandar esta mensagem ao cliente
-- e/ou devolver o negócio a esta etapa". Dois tipos: `manual` (botão "Agendar
-- follow-up") e `recycle` (a regra de volta de um negócio que entrou no Reciclo).
--
-- O ENVIO NÃO É CAMINHO NOVO. A mensagem vira um outreach_jobs comum, com
-- `followup_id` e `message_text` no lugar de inscrição/passo, criado já na hora de
-- agendar com run_after = due_at. O outreach-worker manda como manda as
-- sequências (janela, limite por linha, opt-out, telefone normalizado). O claim
-- revalida opt-out e lead apagado também para esses jobs; o finish grava o
-- desfecho do envio em crm_followups.result.message.
--
-- O AVISO E A VOLTA. crm_run_followups() (pg_cron a cada 5 min) pega o que venceu:
-- avisa o responsável (notifications) e, se pedido, devolve o negócio — mas SÓ se
-- ele ainda estiver na etapa em que estava ao agendar (quem saiu do Reciclo à mão
-- não é arrastado de volta). O movimento passa pelo mesmo verbo de
-- crm_move_opportunity: o corpo dele foi extraído para _crm_move_opportunity(),
-- com a equipe explícita, porque o agendador não tem auth.uid().
--
-- DOIS AGENDADORES, UM NEGÓCIO. crm_run_timers (reciclo por cycle_days) ignora o
-- negócio que tem regra própria de Reciclo nesta passagem pela etapa.

-- ============================================================================
-- 1. PADRÕES DO RECICLO NA CONFIGURAÇÃO DO PIPELINE
-- ============================================================================
alter table public.pipeline_stages_v2
  add column if not exists recycle_notify_owner boolean not null default true,
  add column if not exists recycle_send_message boolean not null default false,
  add column if not exists recycle_message_template text;

comment on column public.pipeline_stages_v2.recycle_notify_owner is
  'Sprint 15b: padrão do diálogo de Reciclo (etapa ciclo) — avisar o responsável no dia da volta. Dia e etapa de volta seguem em cycle_days / cycle_target_stage_id.';
comment on column public.pipeline_stages_v2.recycle_send_message is
  'Sprint 15b: padrão do diálogo de Reciclo — mandar mensagem ao cliente no dia da volta.';
comment on column public.pipeline_stages_v2.recycle_message_template is
  'Sprint 15b: texto padrão da mensagem do Reciclo (mesmas variáveis das sequências).';

alter table public.pipelines
  add column if not exists recycle_reasons jsonb not null default '[]'::jsonb;

comment on column public.pipelines.recycle_reasons is
  'Sprint 15b: motivos de Reciclo oferecidos no diálogo (lista de textos, como loss_reasons).';

-- ============================================================================
-- 2. O FOLLOW-UP
-- ============================================================================
create table if not exists public.crm_followups (
  id               uuid primary key default gen_random_uuid(),
  equipe_id        uuid not null references public.equipes(id) on delete cascade,
  opportunity_id   uuid not null references public.opportunities(id) on delete cascade,
  lead_id          uuid not null references public.leads(id) on delete cascade,
  kind             text not null default 'manual' check (kind in ('recycle', 'manual')),
  reason           text,
  -- Responsável; null = o dono do negócio na hora do aviso.
  owner_id         uuid,
  due_at           timestamptz not null,
  notify_owner     boolean not null default true,
  send_message     boolean not null default false,
  channel          text not null default 'whatsapp' check (channel in ('whatsapp', 'email')),
  message_text     text,
  -- Etapa em que o negócio estava ao agendar: a volta só acontece se ele ainda estiver nela.
  from_stage_id    uuid references public.pipeline_stages_v2(id) on delete set null,
  -- null = não move.
  return_stage_id  uuid references public.pipeline_stages_v2(id) on delete set null,
  status           text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'failed')),
  outreach_job_id  uuid,
  result           jsonb not null default '{}'::jsonb,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  executed_at      timestamptz
);

create index if not exists idx_crm_followups_due
  on public.crm_followups (status, due_at) where status = 'scheduled';
create index if not exists idx_crm_followups_opp
  on public.crm_followups (opportunity_id, status);

alter table public.crm_followups enable row level security;
drop policy if exists crm_followups_team_read on public.crm_followups;
create policy crm_followups_team_read on public.crm_followups for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
-- Sem políticas de escrita: só pelas RPCs abaixo.

comment on table public.crm_followups is
  'Sprint 15b: follow-up agendado de um negócio (manual ou regra de Reciclo): avisar o responsável, mandar mensagem pelo motor de outreach, devolver a uma etapa. Escrita só por crm_schedule_followup / crm_cancel_followup / crm_run_followups.';

-- ============================================================================
-- 3. O JOB DE FOLLOW-UP NO MOTOR DE OUTREACH
-- ============================================================================
alter table public.outreach_jobs alter column enrollment_id drop not null;
alter table public.outreach_jobs alter column step_position drop not null;
alter table public.outreach_jobs
  add column if not exists followup_id uuid references public.crm_followups(id) on delete cascade,
  add column if not exists message_text text;

alter table public.outreach_jobs drop constraint if exists outreach_jobs_kind_shape;
alter table public.outreach_jobs add constraint outreach_jobs_kind_shape check (
  (enrollment_id is not null and followup_id is null)
  or (enrollment_id is null and followup_id is not null and message_text is not null)
);

create unique index if not exists uq_outreach_jobs_followup
  on public.outreach_jobs (followup_id) where followup_id is not null;

alter table public.crm_followups drop constraint if exists crm_followups_outreach_job_fk;
alter table public.crm_followups add constraint crm_followups_outreach_job_fk
  foreign key (outreach_job_id) references public.outreach_jobs(id) on delete set null;

comment on column public.outreach_jobs.followup_id is
  'Sprint 15b: job de follow-up (sem inscrição nem passo). O texto a enviar está em message_text.';

-- Grava o desfecho do envio no follow-up do job (no-op para job de sequência).
create or replace function public._followup_mark_message(p_job_id uuid, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.crm_followups f
     set result = f.result
                  || jsonb_build_object('message', p_status, 'message_at', clock_timestamp())
                  || case when p_error is not null then jsonb_build_object('message_error', left(p_error, 500))
                          else '{}'::jsonb end
    from public.outreach_jobs j
   where j.id = p_job_id and j.followup_id is not null and f.id = j.followup_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- crm_outreach_claim — o mesmo de SE-REV-002, mais as garantias do job de
-- follow-up (que não tem inscrição: os passos por inscrição não o alcançam).
-- ----------------------------------------------------------------------------
create or replace function public.crm_outreach_claim(p_limit integer default 20)
returns setof public.outreach_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_ids uuid[];
begin
  -- 1. 'running' abandonado: a função morreu no meio, talvez DEPOIS de o
  --    provider aceitar. Vira 'unknown' (uma pessoa decide), nunca 'queued'.
  update public.outreach_jobs
     set status = 'unknown', last_error = 'interrompido: entrega incerta', finished_at = v_now
   where status = 'running' and claimed_at < v_now - interval '5 minutes';
  -- ...e a inscrição que ficou sem nada na fila por causa disso é concluída
  -- (senão uma 'per_event' nunca mais inscreveria o lead).
  update public.cadence_enrollments e
     set status = 'completed', finished_at = v_now
   where e.status = 'active'
     and e.id in (select j.enrollment_id from public.outreach_jobs j
                   where j.status = 'unknown' and j.finished_at = v_now)
     and not exists (select 1 from public.outreach_jobs q
                      where q.enrollment_id = e.id and q.status in ('queued', 'running'));
  -- ...e o follow-up fica sabendo.
  update public.crm_followups f
     set result = f.result || jsonb_build_object('message', 'unknown', 'message_at', v_now)
    from public.outreach_jobs j
   where j.followup_id = f.id and j.status = 'unknown' and j.finished_at = v_now;

  -- 2a. Sequência desligada (garantia do gatilho de cadence_sequences).
  select array_agg(distinct e.id) into v_ids
    from public.outreach_jobs j
    join public.cadence_enrollments e on e.id = j.enrollment_id
    join public.cadence_sequences s on s.id = e.sequence_id
   where j.status = 'queued' and j.run_after <= v_now and e.status = 'active' and not s.active;
  perform public._outreach_cancel_enrollments(v_ids, 'sequence_disabled');

  -- 2b. Inscrição que não está mais ativa.
  update public.outreach_jobs j
     set status = 'cancelled', skip_reason = coalesce(e.cancel_reason, 'enrollment_' || e.status), finished_at = v_now
    from public.cadence_enrollments e
   where j.status = 'queued' and j.run_after <= v_now
     and e.id = j.enrollment_id and e.status <> 'active';

  -- 2c. Follow-up cancelado (garantia: crm_cancel_followup já cancela o job).
  update public.outreach_jobs j
     set status = 'cancelled', skip_reason = 'followup_cancelled', finished_at = v_now
    from public.crm_followups f
   where j.status = 'queued' and j.run_after <= v_now
     and f.id = j.followup_id and f.status = 'cancelled';

  -- 3. O lead respondeu (garantia: o gatilho de messages pode ter falhado).
  --    Só sequência: o follow-up foi pedido por uma pessoa e sai mesmo assim.
  select array_agg(distinct e.id) into v_ids
    from public.outreach_jobs j
    join public.cadence_enrollments e on e.id = j.enrollment_id
    join public.cadence_sequences s on s.id = e.sequence_id
   where j.status = 'queued' and j.run_after <= v_now
     and e.status = 'active' and s.stop_on_reply
     and exists (select 1 from public.messages m
                  where m.lead_id = e.lead_id and m.sender_type = 'customer' and m.created_at > e.started_at);
  perform public._outreach_cancel_enrollments(v_ids, 'lead_replied');

  -- 4a. Telefone descadastrado: o job vencido sai 'skipped', o resto cancela.
  select array_agg(distinct j.enrollment_id) into v_ids
    from public.outreach_jobs j
    join public.leads l on l.id = j.lead_id
   where j.status = 'queued' and j.run_after <= v_now and j.enrollment_id is not null
     and exists (select 1 from public.contact_opt_outs o
                  where o.equipe_id = j.equipe_id and o.phone_normalized = public.normalize_phone_br(l.phone));
  update public.outreach_jobs
     set status = 'skipped', skip_reason = 'opted_out', finished_at = v_now
   where enrollment_id = any (coalesce(v_ids, '{}')) and status = 'queued' and run_after <= v_now;
  perform public._outreach_cancel_enrollments(v_ids, 'opted_out');
  --     ...e o job de follow-up do mesmo telefone.
  with s as (
    update public.outreach_jobs j
       set status = 'skipped', skip_reason = 'opted_out', finished_at = v_now
      from public.leads l
     where j.status = 'queued' and j.run_after <= v_now and j.followup_id is not null
       and l.id = j.lead_id
       and exists (select 1 from public.contact_opt_outs o
                    where o.equipe_id = j.equipe_id and o.phone_normalized = public.normalize_phone_br(l.phone))
    returning j.followup_id
  )
  update public.crm_followups f
     set result = f.result || jsonb_build_object('message', 'skipped', 'message_at', v_now, 'message_error', 'opted_out')
    from s where f.id = s.followup_id;

  -- 4b. Lead apagado.
  select array_agg(distinct j.enrollment_id) into v_ids
    from public.outreach_jobs j
    join public.leads l on l.id = j.lead_id
   where j.status = 'queued' and j.run_after <= v_now and l.deleted_at is not null and j.enrollment_id is not null;
  update public.outreach_jobs
     set status = 'skipped', skip_reason = 'lead_deleted', finished_at = v_now
   where enrollment_id = any (coalesce(v_ids, '{}')) and status = 'queued' and run_after <= v_now;
  perform public._outreach_cancel_enrollments(v_ids, 'lead_deleted');
  with s as (
    update public.outreach_jobs j
       set status = 'skipped', skip_reason = 'lead_deleted', finished_at = v_now
      from public.leads l
     where j.status = 'queued' and j.run_after <= v_now and j.followup_id is not null
       and l.id = j.lead_id and l.deleted_at is not null
    returning j.followup_id
  )
  update public.crm_followups f
     set result = f.result || jsonb_build_object('message', 'skipped', 'message_at', v_now, 'message_error', 'lead_deleted')
    from s where f.id = s.followup_id;

  -- 5. O resto: reivindica sem dois workers pegarem o mesmo.
  return query
  with due as (
    select j.id
      from public.outreach_jobs j
     where j.status = 'queued' and j.run_after <= v_now
     order by j.run_after
     limit greatest(coalesce(p_limit, 20), 1)
     for update skip locked
  )
  update public.outreach_jobs j
     set status = 'running', claimed_at = v_now, attempts = j.attempts + 1, last_error = null
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

-- ----------------------------------------------------------------------------
-- crm_outreach_finish — o mesmo de SE-REV-002; job de follow-up não mexe em
-- inscrição e grava o desfecho em crm_followups.result.message.
-- ----------------------------------------------------------------------------
create or replace function public.crm_outreach_finish(
  p_job_id    uuid,
  p_status    text,
  p_error     text default null,
  p_result    jsonb default null,
  p_retryable boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job    public.outreach_jobs;
  v_status text;
  r        jsonb := coalesce(p_result, '{}'::jsonb);
begin
  if p_status not in ('sent', 'failed', 'skipped', 'unknown') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select * into v_job from public.outreach_jobs where id = p_job_id and status = 'running' for update;
  if not found then
    return 'not_running';
  end if;

  v_status := p_status;
  if p_status = 'failed' and coalesce(p_retryable, false) and v_job.attempts < 3 then
    v_status := 'queued';
  end if;

  update public.outreach_jobs
     set status              = v_status,
         last_error          = case when p_status in ('failed', 'unknown') then left(coalesce(p_error, p_status), 500) end,
         skip_reason         = case when p_status = 'skipped' then left(coalesce(p_error, 'skipped'), 200) else skip_reason end,
         provider            = coalesce(r->>'provider', provider),
         line_key            = coalesce(r->>'line_key', line_key),
         rendered_message    = coalesce(r->>'rendered_message', rendered_message),
         provider_status     = coalesce((r->>'provider_status')::integer, provider_status),
         provider_response   = coalesce(r->'provider_response', provider_response),
         provider_message_id = coalesce(r->>'provider_message_id', provider_message_id),
         provider_chat_id    = coalesce(r->>'provider_chat_id', provider_chat_id),
         conversation_id     = coalesce((r->>'conversation_id')::uuid, conversation_id),
         run_after           = case when v_status = 'queued'
                                    then clock_timestamp() + make_interval(mins => (v_job.attempts * v_job.attempts)::int)
                                    else run_after end,
         claimed_at          = case when v_status = 'queued' then null else claimed_at end,
         finished_at         = case when v_status = 'queued' then null else clock_timestamp() end
   where id = p_job_id;

  if v_status <> 'queued' and v_job.enrollment_id is not null
     and not exists (select 1 from public.outreach_jobs q
                      where q.enrollment_id = v_job.enrollment_id and q.status in ('queued', 'running')) then
    update public.cadence_enrollments
       set status = 'completed', finished_at = clock_timestamp()
     where id = v_job.enrollment_id and status = 'active';
  end if;

  if v_status <> 'queued' and v_job.followup_id is not null then
    perform public._followup_mark_message(
      p_job_id, v_status,
      case when v_status in ('failed', 'skipped', 'unknown') then coalesce(p_error, v_status) end);
  end if;
  return v_status;
end;
$$;

-- ============================================================================
-- 4. O VERBO DE MOVER, COM A EQUIPE EXPLÍCITA
-- ============================================================================
-- O corpo de crm_move_opportunity (20261015000100) sem mudança de regra; a
-- pública só resolve a equipe de quem chama e delega. O agendador (sem
-- auth.uid()) chama esta com a equipe do follow-up.
create or replace function public._crm_move_opportunity(
  p_equipe_id   uuid,
  p_opportunity uuid,
  p_stage       uuid,
  p_lost_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_opp     record;
  v_type    text;
  v_reasons jsonb;
  v_reason  text := nullif(btrim(coalesce(p_lost_reason, '')), '');
begin
  if p_equipe_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Trava a linha: dois movimentos simultâneos do mesmo negócio não se atropelam.
  select o.id, o.stage_id, o.pipeline_id, o.status, o.lost_reason
    into v_opp
    from public.opportunities o
   where o.id = p_opportunity
     and o.equipe_id = p_equipe_id
     and o.deleted_at is null
   for update;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  -- A etapa precisa ser da linha do negócio (e, por consequência, da equipe).
  select s.stage_type into v_type
    from public.pipeline_stages_v2 s
   where s.id = p_stage
     and s.pipeline_id = v_opp.pipeline_id
     and s.equipe_id = p_equipe_id
     and s.deleted_at is null;
  if not found then
    raise exception 'invalid_stage' using errcode = '22023';
  end if;

  -- Já está lá: nada a fazer (não regrava histórico nem evento).
  if v_opp.stage_id = p_stage then
    return false;
  end if;

  if v_type = 'lost' then
    select pl.loss_reasons into v_reasons from public.pipelines pl where pl.id = v_opp.pipeline_id;
    if jsonb_typeof(v_reasons) = 'array' and jsonb_array_length(v_reasons) > 0
       and v_reason is null
       -- Perdido → outra etapa de perda mantém o motivo que já tinha.
       and not (v_opp.status = 'lost' and nullif(btrim(coalesce(v_opp.lost_reason, '')), '') is not null) then
      raise exception 'loss_reason_required' using errcode = '22023';
    end if;
  end if;

  update public.opportunities o
     set stage_id = p_stage,
         lost_reason = case when v_type = 'lost' then coalesce(v_reason, o.lost_reason) else o.lost_reason end
   where o.id = v_opp.id;

  return true;
end;
$$;

create or replace function public.crm_move_opportunity(
  p_opportunity uuid,
  p_stage uuid,
  p_lost_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_equipe uuid;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return public._crm_move_opportunity(v_equipe, p_opportunity, p_stage, p_lost_reason);
end;
$$;

comment on function public.crm_move_opportunity(uuid, uuid, text) is
  'Sprint Suporte 1 · #12: the single stage-move verb of the UI. Writes stage and loss reason in one UPDATE (all stage triggers fire as before) and refuses a lost target without a reason when the pipeline has loss_reasons. Tenant-scoped by the caller''s equipe_id. Returns false when the deal was already in that stage. Sprint 15b: body lives in _crm_move_opportunity(equipe, ...), which the follow-up scheduler calls.';

revoke all on function public.crm_move_opportunity(uuid, uuid, text) from public, anon;
grant execute on function public.crm_move_opportunity(uuid, uuid, text) to authenticated;

-- ============================================================================
-- 5. AGENDAR E CANCELAR (front)
-- ============================================================================
create or replace function public.crm_schedule_followup(
  p_opportunity_id  uuid,
  p_due_at          timestamptz,
  p_kind            text default 'manual',
  p_owner_id        uuid default null,
  p_reason          text default null,
  p_notify_owner    boolean default true,
  p_send_message    boolean default false,
  p_message_text    text default null,
  p_return_stage_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_opp    record;
  v_text   text := nullif(btrim(coalesce(p_message_text, '')), '');
  v_kind   text := coalesce(p_kind, 'manual');
  v_fu     public.crm_followups;
  v_job    uuid;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select o.id, o.equipe_id, o.lead_id, o.pipeline_id, o.stage_id
    into v_opp
    from public.opportunities o
   where o.id = p_opportunity_id and o.equipe_id = v_equipe and o.deleted_at is null
   for update;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  if v_kind not in ('manual', 'recycle') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_due_at is null or p_due_at < clock_timestamp() - interval '1 minute' then
    raise exception 'invalid_due_at' using errcode = '22023';
  end if;
  if p_owner_id is not null
     and not exists (select 1 from public.profiles p where p.id = p_owner_id and p.equipe_id = v_equipe) then
    raise exception 'invalid_owner' using errcode = '22023';
  end if;
  if coalesce(p_send_message, false) then
    if v_text is null then
      raise exception 'message_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.conversation_opener_settings c
                    where c.equipe_id = v_equipe
                      and (c.solo_instance_id is not null or nullif(btrim(coalesce(c.channel_id, '')), '') is not null)) then
      raise exception 'no_outreach_line' using errcode = '22023';
    end if;
  end if;
  if p_return_stage_id is not null
     and not exists (select 1 from public.pipeline_stages_v2 s
                      where s.id = p_return_stage_id and s.pipeline_id = v_opp.pipeline_id
                        and s.equipe_id = v_equipe and s.deleted_at is null) then
    raise exception 'invalid_return_stage' using errcode = '22023';
  end if;

  -- Uma regra de Reciclo por negócio: a nova substitui a agendada.
  if v_kind = 'recycle' then
    update public.outreach_jobs j
       set status = 'cancelled', skip_reason = 'followup_replaced', finished_at = clock_timestamp()
      from public.crm_followups f
     where f.opportunity_id = v_opp.id and f.kind = 'recycle' and f.status = 'scheduled'
       and j.followup_id = f.id and j.status = 'queued';
    update public.crm_followups f
       set status = 'cancelled',
           result = f.result || jsonb_build_object('cancel_reason', 'replaced'),
           executed_at = clock_timestamp()
     where f.opportunity_id = v_opp.id and f.kind = 'recycle' and f.status = 'scheduled';
  end if;

  insert into public.crm_followups
    (equipe_id, opportunity_id, lead_id, kind, reason, owner_id, due_at, notify_owner, send_message,
     message_text, from_stage_id, return_stage_id, created_by)
  values
    (v_equipe, v_opp.id, v_opp.lead_id, v_kind, nullif(btrim(coalesce(p_reason, '')), ''), p_owner_id, p_due_at,
     coalesce(p_notify_owner, true), coalesce(p_send_message, false),
     v_text, v_opp.stage_id, p_return_stage_id, auth.uid())
  returning * into v_fu;

  if v_fu.send_message then
    insert into public.outreach_jobs (equipe_id, followup_id, message_text, lead_id, run_after, status)
    values (v_equipe, v_fu.id, v_text, v_opp.lead_id, p_due_at, 'queued')
    returning id into v_job;
    update public.crm_followups set outreach_job_id = v_job where id = v_fu.id
    returning * into v_fu;
  end if;

  return to_jsonb(v_fu);
end;
$$;

create or replace function public.crm_cancel_followup(p_followup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_fu     public.crm_followups;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_fu from public.crm_followups
   where id = p_followup_id and equipe_id = v_equipe
   for update;
  if not found then
    raise exception 'followup_not_found' using errcode = 'P0002';
  end if;

  -- A mensagem ainda na fila não sai mais — mesmo se o aviso já foi dado
  -- (o job pode estar esperando a janela de horário).
  update public.outreach_jobs
     set status = 'cancelled', skip_reason = 'followup_cancelled', finished_at = clock_timestamp()
   where followup_id = v_fu.id and status = 'queued';
  if found then
    v_fu.result := v_fu.result || jsonb_build_object('message', 'cancelled');
  end if;

  if v_fu.status = 'scheduled' then
    v_fu.status := 'cancelled';
    v_fu.executed_at := clock_timestamp();
    v_fu.result := v_fu.result || jsonb_build_object('cancel_reason', 'manual', 'cancelled_by', auth.uid());
  end if;

  update public.crm_followups
     set status = v_fu.status, executed_at = v_fu.executed_at, result = v_fu.result
   where id = v_fu.id
  returning * into v_fu;

  return to_jsonb(v_fu);
end;
$$;

-- ============================================================================
-- 6. O AGENDADOR DOS FOLLOW-UPS (pg_cron, a cada 5 min)
-- ============================================================================
create or replace function public.crm_run_followups(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f        record;
  v_opp    record;
  v_lead   text;
  v_user   uuid;
  v_notif  uuid;
  v_moved  boolean;
  v_result jsonb;
  v_done   integer := 0;
  v_failed integer := 0;
  v_moves  integer := 0;
begin
  perform set_config('crm.actor_type', 'automation', true);

  for f in
    select *
      from public.crm_followups
     where status = 'scheduled' and due_at <= clock_timestamp()
     order by due_at
     limit greatest(coalesce(p_limit, 200), 1)
     for update skip locked
  loop
    begin
      v_result := f.result;

      select o.id, o.stage_id, o.owner_id, o.pipeline_id, o.lead_id, o.deleted_at
        into v_opp
        from public.opportunities o where o.id = f.opportunity_id;

      if v_opp.deleted_at is not null then
        update public.outreach_jobs
           set status = 'cancelled', skip_reason = 'opportunity_deleted', finished_at = clock_timestamp()
         where followup_id = f.id and status = 'queued';
        update public.crm_followups
           set status = 'cancelled', executed_at = clock_timestamp(),
               result = v_result || jsonb_build_object('cancel_reason', 'opportunity_deleted')
         where id = f.id;
        continue;
      end if;

      -- Aviso ao responsável.
      if f.notify_owner then
        select l.name into v_lead from public.leads l where l.id = f.lead_id;
        v_user := coalesce(f.owner_id, v_opp.owner_id);
        v_notif := null;
        insert into public.notifications (equipe_id, user_id, type, severity, title, body, action_url, data, dedup_key)
        values (f.equipe_id, v_user, 'crm_followup_due', 'info',
                'Follow-up: ' || coalesce(nullif(btrim(v_lead), ''), 'negócio'),
                coalesce(f.reason, f.message_text),
                '/crm?tab=pipeline&opp=' || f.opportunity_id::text,
                jsonb_build_object('followup_id', f.id, 'opportunity_id', f.opportunity_id, 'kind', f.kind),
                'followup:' || f.id::text)
        on conflict (equipe_id, type, dedup_key) where dedup_key is not null do nothing
        returning id into v_notif;
        -- v_notif nulo = aviso já existia (dedup): conta como avisado.
        v_result := v_result || jsonb_build_object('notified', true, 'notified_user_id', v_user,
                                                   'notification_id', v_notif);
      end if;

      -- A volta: só se o negócio ainda está onde estava ao agendar.
      if f.return_stage_id is not null then
        if v_opp.stage_id is not distinct from f.from_stage_id and f.from_stage_id is not null then
          v_moved := public._crm_move_opportunity(f.equipe_id, f.opportunity_id, f.return_stage_id, null);
          if v_moved then
            v_moves := v_moves + 1;
            if f.kind = 'recycle' then
              insert into public.funnel_events
                (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event, occurred_at, source, actor, actor_type)
              values
                (f.equipe_id, f.opportunity_id, f.lead_id, v_opp.pipeline_id, f.return_stage_id, 'recycled',
                 clock_timestamp(), 'timer', null, 'automation');
            end if;
          end if;
          v_result := v_result || jsonb_build_object('return', case when v_moved then 'moved' else 'already_there' end);
        else
          v_result := v_result || jsonb_build_object('return', 'skipped_left_stage');
        end if;
      end if;

      update public.crm_followups
         set status = 'done', executed_at = clock_timestamp(), result = v_result
       where id = f.id;
      v_done := v_done + 1;
    exception when others then
      update public.crm_followups
         set status = 'failed', executed_at = clock_timestamp(),
             result = f.result || jsonb_build_object('error', left(sqlerrm, 500), 'sqlstate', sqlstate)
       where id = f.id;
      v_failed := v_failed + 1;
    end;
  end loop;

  perform set_config('crm.actor_type', '', true);
  return jsonb_build_object('done', v_done, 'failed', v_failed, 'moved', v_moves);
end;
$$;

comment on function public.crm_run_followups(integer) is
  'Sprint 15b: runs due follow-ups — notifies the owner (notifications, dedup followup:<id>) and moves the deal back to return_stage_id through _crm_move_opportunity only if it is still in from_stage_id (else result.return = skipped_left_stage). One failure does not stop the batch (status failed, result.error). pg_cron crm-run-followups, every 5 min.';

-- ============================================================================
-- 7. crm_run_timers — o reciclo por cycle_days respeita a regra por negócio
-- ============================================================================
-- Igual a 20260912000700, mudando só o filtro do reciclo: fica de fora o negócio
-- com follow-up de Reciclo agendado, ou já executado NESTA passagem pela etapa
-- (regra "Manter no Reciclo": quem escolheu ficar não é puxado pelo padrão).
create or replace function public.crm_run_timers(
  p_dry_run       boolean default false,
  p_recycle_since timestamptz default null,
  p_equipe_id     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_recycled integer := 0;
  v_renewals integer := 0;
  v_details  jsonb := '[]'::jsonb;
  v_new_id   uuid;
  v_stage    uuid;
  c_limit    constant integer := 500;
begin
  perform set_config('crm.actor_type', 'automation', true);

  -- ---------------------------------------------------------------- reciclo --
  for r in
    select o.id, o.equipe_id, o.lead_id, o.pipeline_id, o.stage_id,
           s.cycle_target_stage_id as target, s.cycle_webhook_url as webhook,
           o.stage_entered_at + make_interval(days => s.cycle_days) as expired_at
      from public.opportunities o
      join public.pipeline_stages_v2 s on s.id = o.stage_id
      join public.pipeline_stages_v2 t on t.id = s.cycle_target_stage_id
     where s.stage_type = 'ciclo'
       and s.deleted_at is null
       and coalesce(s.cycle_days, 0) > 0
       and t.deleted_at is null
       and t.pipeline_id = o.pipeline_id
       and o.deleted_at is null
       and o.stage_entered_at + make_interval(days => s.cycle_days) <= now()
       and (p_recycle_since is null or o.stage_entered_at + make_interval(days => s.cycle_days) >= p_recycle_since)
       and (p_equipe_id is null or o.equipe_id = p_equipe_id)
       and not exists (
         select 1 from public.crm_followups fu
          where fu.opportunity_id = o.id and fu.kind = 'recycle'
            and (fu.status = 'scheduled'
                 or (fu.status = 'done' and fu.from_stage_id = o.stage_id
                     and fu.created_at >= coalesce(o.stage_entered_at, '-infinity'::timestamptz))))
     order by o.stage_entered_at
     limit c_limit
  loop
    v_recycled := v_recycled + 1;
    v_details := v_details || jsonb_build_object('kind', 'recycle', 'opportunity_id', r.id,
                                                 'from_stage_id', r.stage_id, 'to_stage_id', r.target);
    if not p_dry_run then
      update public.opportunities set stage_id = r.target where id = r.id;
      insert into public.funnel_events
        (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event, occurred_at, source, actor, actor_type)
      values
        (r.equipe_id, r.id, r.lead_id, r.pipeline_id, r.target, 'recycled', clock_timestamp(), 'timer', null, 'automation');
      if r.webhook is not null and r.webhook <> '' then
        perform net.http_post(
          url     := r.webhook,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := jsonb_build_object('event', 'cycle_pass', 'equipe_id', r.equipe_id, 'opportunity_id', r.id,
                                        'from_stage_id', r.stage_id, 'to_stage_id', r.target)
        );
      end if;
    end if;
  end loop;

  -- ------------------------------------------------------------ recorrência --
  for r in
    with due as (
      select o.id, o.equipe_id, o.lead_id, o.pipeline_id, o.owner_id,
             i.recurrence_every, i.recurrence_unit,
             i.recurrence_every::text || ':' || i.recurrence_unit as rkey,
             min(i.renew_days_before) as renew_days_before,
             (array_agg(i.renew_pipeline_id order by i.position) filter (where i.renew_pipeline_id is not null))[1] as renew_pipeline_id,
             (array_agg(i.renew_stage_id order by i.position) filter (where i.renew_stage_id is not null))[1] as renew_stage_id,
             o.closed_at + case i.recurrence_unit
                             when 'month' then make_interval(months => i.recurrence_every)
                             else make_interval(days => i.recurrence_every) end as due_at
        from public.opportunities o
        join public.opportunity_items i on i.opportunity_id = o.id and i.deleted_at is null
       where o.status = 'won'
         and o.deleted_at is null
         and o.closed_at is not null
         and i.recurrence_every is not null
         and (p_equipe_id is null or o.equipe_id = p_equipe_id)
       group by o.id, o.equipe_id, o.lead_id, o.pipeline_id, o.owner_id, o.closed_at,
                i.recurrence_every, i.recurrence_unit
    )
    select d.* from due d
     where d.due_at - make_interval(days => d.renew_days_before) <= now()
       and not exists (select 1 from public.opportunities x
                        where x.renewal_of_id = d.id and x.renewal_key = d.rkey)
     order by d.due_at
     limit c_limit
  loop
    -- Onde o retorno nasce: o pipeline do item (se ativo), senão o do negócio;
    -- a etapa do item (se é daquele pipeline), senão a primeira aberta.
    select pl.id into r.renew_pipeline_id from public.pipelines pl
     where pl.id = coalesce(r.renew_pipeline_id, r.pipeline_id) and pl.deleted_at is null and not pl.is_archived;
    if r.renew_pipeline_id is null then
      r.renew_pipeline_id := r.pipeline_id;
    end if;
    select s.id into v_stage from public.pipeline_stages_v2 s
     where s.id = r.renew_stage_id and s.pipeline_id = r.renew_pipeline_id and s.deleted_at is null;
    if v_stage is null then
      select s.id into v_stage from public.pipeline_stages_v2 s
       where s.pipeline_id = r.renew_pipeline_id and s.stage_type = 'open' and s.deleted_at is null
       order by s.position, s.created_at limit 1;
    end if;
    if v_stage is null then
      v_details := v_details || jsonb_build_object('kind', 'renewal_skipped', 'opportunity_id', r.id,
                                                   'reason', 'no_open_stage', 'pipeline_id', r.renew_pipeline_id);
      continue;
    end if;

    v_renewals := v_renewals + 1;
    v_details := v_details || jsonb_build_object('kind', 'renewal', 'opportunity_id', r.id, 'cadence', r.rkey,
                                                 'due_at', r.due_at, 'pipeline_id', r.renew_pipeline_id, 'stage_id', v_stage);
    if not p_dry_run then
      insert into public.opportunities
        (equipe_id, lead_id, pipeline_id, stage_id, owner_id, origin, renewal_of_id, renewal_key)
      values
        (r.equipe_id, r.lead_id, r.renew_pipeline_id, v_stage, r.owner_id, 'recorrencia', r.id, r.rkey)
      returning id into v_new_id;

      insert into public.opportunity_items
        (equipe_id, opportunity_id, catalog_item_id, name, quantity, unit_price, price_locked,
         recurrence_every, recurrence_unit, renew_days_before, renew_pipeline_id, renew_stage_id, position)
      select i.equipe_id, v_new_id, i.catalog_item_id, i.name, i.quantity, i.unit_price, i.price_locked,
             i.recurrence_every, i.recurrence_unit, i.renew_days_before, i.renew_pipeline_id, i.renew_stage_id, i.position
        from public.opportunity_items i
       where i.opportunity_id = r.id and i.deleted_at is null
         and i.recurrence_every = r.recurrence_every and i.recurrence_unit = r.recurrence_unit;

      update public.opportunities o
         set value = (select sum(i.total) from public.opportunity_items i
                       where i.opportunity_id = v_new_id and i.deleted_at is null)
       where o.id = v_new_id;
    end if;
  end loop;

  insert into public.crm_timer_runs (dry_run, recycled, renewals, details)
  values (p_dry_run, v_recycled, v_renewals, v_details);

  perform set_config('crm.actor_type', '', true);

  return jsonb_build_object('dry_run', p_dry_run, 'recycled', v_recycled, 'renewals', v_renewals, 'details', v_details);
end;
$$;

comment on function public.crm_run_timers(boolean, timestamptz, uuid) is
  'Sprint 11 · T34: the one scheduler — recycles expired deals in ciclo stages (event recycled, stage webhook) and opens the next-cycle deal for won recurring items (one per deal and cadence). Called by pg_cron for every team; p_dry_run answers without writing; p_recycle_since holds the backlog; p_equipe_id runs one team (operation, tests). Sprint 15b: a deal with its own recycle follow-up (scheduled, or done during this stay in the stage) is left to it.';

revoke all on function public.crm_run_timers(boolean, timestamptz, uuid) from public, anon, authenticated;

-- ============================================================================
-- 8. PERMISSÕES
-- ============================================================================
revoke all on function public._followup_mark_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public._crm_move_opportunity(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.crm_outreach_claim(integer) from public, anon, authenticated;
revoke all on function public.crm_outreach_finish(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.crm_run_followups(integer) from public, anon, authenticated;
revoke all on function public.crm_schedule_followup(uuid, timestamptz, text, uuid, text, boolean, boolean, text, uuid) from public, anon;
revoke all on function public.crm_cancel_followup(uuid) from public, anon;

grant execute on function public._followup_mark_message(uuid, text, text) to service_role;
grant execute on function public._crm_move_opportunity(uuid, uuid, uuid, text) to service_role;
grant execute on function public.crm_outreach_claim(integer) to service_role;
grant execute on function public.crm_outreach_finish(uuid, text, text, jsonb, boolean) to service_role;
grant execute on function public.crm_run_followups(integer) to service_role;
grant execute on function public.crm_schedule_followup(uuid, timestamptz, text, uuid, text, boolean, boolean, text, uuid) to authenticated, service_role;
grant execute on function public.crm_cancel_followup(uuid) to authenticated, service_role;

-- ============================================================================
-- 9. pg_cron — crm-run-followups a cada 5 min (idempotente)
-- ============================================================================
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'crm-run-followups';
    perform cron.schedule('crm-run-followups', '*/5 * * * *', 'select public.crm_run_followups()');
  else
    raise warning 'pg_cron ausente: crm-run-followups não foi agendado';
  end if;
end
$cron$;
