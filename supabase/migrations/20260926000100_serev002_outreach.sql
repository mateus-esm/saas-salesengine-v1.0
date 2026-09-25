-- ============================================================================
-- SE-REV-002 — motor de disparo: evento de CRM → mensagem no WhatsApp do lead,
-- com cadência (follow-up) cancelável e idempotente, para qualquer tenant.
--
-- A regra deste arquivo: IDEMPOTÊNCIA E CANCELAMENTO MORAM NO BANCO.
--
--   * inscrição   — UNIQUE (sequence_id, enrollment_key) e no máximo UMA
--                   inscrição ativa por (sequence_id, lead_id);
--   * envio       — UNIQUE (enrollment_id, step_position): um passo, um job;
--   * disputa     — crm_outreach_claim() com FOR UPDATE SKIP LOCKED;
--   * incerteza   — job 'running' abandonado vira 'unknown', NUNCA volta para
--                   a fila: mandar a mesma mensagem duas vezes para uma pessoa
--                   é pior do que não mandar o follow-up (semântica "no máximo
--                   uma vez"). Diferença deliberada em relação ao Copilot;
--   * cancelamento — gatilhos são o caminho rápido; o claim revalida tudo na
--                   hora do envio (resposta do lead, opt-out, lead apagado,
--                   inscrição não ativa), então um gatilho que falhou em
--                   silêncio não manda mensagem indevida.
--
-- Os gatilhos em tabelas quentes (lead_touches, opportunity_stage_history,
-- messages, opportunities) têm `exception when others then raise warning`:
-- nunca derrubam a escrita de origem, no mesmo padrão do
-- _copilot_enqueue_from_message.
--
-- O `cadence-check` não é tocado nem usado (sem autenticação, idempotência por
-- janela de tempo em código). O "idle" é modelado como sequência disparada por
-- entrada na etapa, com passo atrasado e cancelada quando a etapa muda.
--
-- O agendamento do tick fica em
-- supabase/scripts/2026-09-26_serev002_schedule_outreach_tick.sql (inerte).
-- ============================================================================

-- ============================================================================
-- 1. PERFIL DE DISPARO DO TENANT (colunas novas em conversation_opener_settings)
-- ============================================================================
-- O nome da tabela fica (SE-REV-001 depende dele); ela passa a ser o "perfil
-- de disparo": por qual provider e linha o tenant fala, e os freios.

alter table public.conversation_opener_settings
  add column if not exists provider text not null default 'gptmaker',
  add column if not exists solo_instance_id uuid references public.wpp_instances(id) on delete set null,
  add column if not exists send_window_start time not null default '08:00',
  add column if not exists send_window_end time not null default '20:00',
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists max_sends_per_line_hour integer not null default 30,
  add column if not exists opt_out_keywords text[] not null
    default '{sair,parar,pare,stop,cancelar,descadastrar}';

alter table public.conversation_opener_settings drop constraint if exists conversation_opener_settings_provider_check;
alter table public.conversation_opener_settings add constraint conversation_opener_settings_provider_check
  check (provider in ('gptmaker', 'solo'));
alter table public.conversation_opener_settings drop constraint if exists conversation_opener_settings_max_sends_check;
alter table public.conversation_opener_settings add constraint conversation_opener_settings_max_sends_check
  check (max_sends_per_line_hour between 1 and 500);
-- Janela que cruza a meia-noite não é aceita: simplifica o cálculo e ninguém
-- quer receber mensagem de venda de madrugada.
alter table public.conversation_opener_settings drop constraint if exists conversation_opener_settings_window_check;
alter table public.conversation_opener_settings add constraint conversation_opener_settings_window_check
  check (send_window_start < send_window_end);

comment on column public.conversation_opener_settings.provider is
  'SE-REV-002: quem entrega a mensagem do motor. gptmaker = o agente de IA do provider atende a resposta; solo = linha crua, a resposta cai no inbox humano. Sem fallback entre os dois.';
comment on column public.conversation_opener_settings.max_sends_per_line_hour is
  'SE-REV-002: freio anti-banimento. Envios (sent + unknown) por linha na última hora.';
comment on column public.conversation_opener_settings.opt_out_keywords is
  'SE-REV-002: mensagem do lead INTEIRA, normalizada (minúscula, sem acento, sem pontuação), igual a uma destas = opt-out. Não é "contém".';

-- ============================================================================
-- 2. NORMALIZAÇÃO (espelhada em _shared/outreach/optout.ts — os dois lados
--    têm casos de teste iguais)
-- ============================================================================
create or replace function public._outreach_norm_text(p text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(
             translate(lower(coalesce(p, '')),
                       'áàâãäéèêëíìîïóòôõöúùûüçñ',
                       'aaaaaeeeeiiiiooooouuuucn'),
             '[^a-z0-9 ]', '', 'g'),
           '\s+', ' ', 'g')), '');
$$;

create or replace function public._outreach_is_opt_out(p_content text, p_keywords text[])
returns boolean
language sql
immutable
as $$
  select public._outreach_norm_text(p_content) is not null
     and exists (select 1 from unnest(coalesce(p_keywords, '{}'::text[])) k
                  where public._outreach_norm_text(k) = public._outreach_norm_text(p_content));
$$;

-- ============================================================================
-- 3. TABELAS
-- ============================================================================

-- (a) A definição da sequência.
create table if not exists public.cadence_sequences (
  id                   uuid primary key default gen_random_uuid(),
  equipe_id            uuid not null references public.equipes(id) on delete cascade,
  name                 text not null check (length(btrim(name)) between 1 and 120),
  -- Nasce desligada, como a SE-REV-001: ligar é decisão do tenant.
  active               boolean not null default false,
  trigger_event        text not null check (trigger_event in ('lead_intake', 'stage_entered')),
  -- lead_intake: portas (crm_entries.id). Vazio = NENHUMA porta (não "todas"):
  -- "todas" incluiria a porta WhatsApp, e quem acabou de mandar mensagem para
  -- a linha receberia uma sequência de abertura.
  trigger_entry_ids    uuid[] not null default '{}',
  trigger_stage_id     uuid references public.pipeline_stages_v2(id) on delete cascade,
  reenroll             text not null default 'once_per_lead' check (reenroll in ('once_per_lead', 'per_event')),
  stop_on_reply        boolean not null default true,
  stop_on_stage_change boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint cadence_sequences_trigger_shape check (
    (trigger_event = 'lead_intake' and trigger_stage_id is null)
    or (trigger_event = 'stage_entered' and trigger_stage_id is not null)
  )
);

create index if not exists idx_cadence_sequences_active
  on public.cadence_sequences (equipe_id, trigger_event) where active;
create index if not exists idx_cadence_sequences_stage
  on public.cadence_sequences (trigger_stage_id) where active and trigger_event = 'stage_entered';

drop trigger if exists update_cadence_sequences_updated_at on public.cadence_sequences;
create trigger update_cadence_sequences_updated_at
  before update on public.cadence_sequences
  for each row execute function public.update_updated_at_column();

-- (b) Os passos. `offset_minutes` conta a partir do INÍCIO da inscrição, não do
-- passo anterior: agendamento previsível, e um passo adiado pela janela de
-- horário não empurra os seguintes em cascata.
create table if not exists public.cadence_steps (
  id               uuid primary key default gen_random_uuid(),
  sequence_id      uuid not null references public.cadence_sequences(id) on delete cascade,
  equipe_id        uuid not null references public.equipes(id) on delete cascade,
  position         smallint not null check (position >= 0),
  offset_minutes   integer not null check (offset_minutes between 0 and 86400),
  message_template text not null check (length(btrim(message_template)) > 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (sequence_id, position)
);

drop trigger if exists update_cadence_steps_updated_at on public.cadence_steps;
create trigger update_cadence_steps_updated_at
  before update on public.cadence_steps
  for each row execute function public.update_updated_at_column();

-- (c) A inscrição de um lead numa sequência.
create table if not exists public.cadence_enrollments (
  id             uuid primary key default gen_random_uuid(),
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  sequence_id    uuid not null references public.cadence_sequences(id) on delete cascade,
  lead_id        uuid not null references public.leads(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  -- 'lead:<id>' | 'touch:<id>' | 'stage_history:<id>' | 'api:<chave do chamador>'
  enrollment_key text not null,
  trigger_ref    jsonb,
  status         text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  cancel_reason  text check (cancel_reason in ('lead_replied', 'stage_changed', 'opportunity_closed', 'opted_out',
                                              'manual', 'lead_deleted', 'sequence_disabled')),
  started_at     timestamptz not null default clock_timestamp(),
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Idempotência da inscrição: o mesmo evento não inscreve duas vezes.
  constraint uq_cadence_enrollments_key unique (sequence_id, enrollment_key)
);

-- Nunca duas inscrições ativas da mesma pessoa na mesma sequência.
create unique index if not exists uq_cadence_enrollments_active
  on public.cadence_enrollments (sequence_id, lead_id) where status = 'active';
create index if not exists idx_cadence_enrollments_lead_active
  on public.cadence_enrollments (lead_id) where status = 'active';
create index if not exists idx_cadence_enrollments_opp_active
  on public.cadence_enrollments (opportunity_id) where status = 'active' and opportunity_id is not null;
create index if not exists idx_cadence_enrollments_team
  on public.cadence_enrollments (equipe_id, created_at desc);

drop trigger if exists update_cadence_enrollments_updated_at on public.cadence_enrollments;
create trigger update_cadence_enrollments_updated_at
  before update on public.cadence_enrollments
  for each row execute function public.update_updated_at_column();

-- (d) A fila E o registro de envio (espelha copilot_jobs).
create table if not exists public.outreach_jobs (
  id                  uuid primary key default gen_random_uuid(),
  equipe_id           uuid not null references public.equipes(id) on delete cascade,
  enrollment_id       uuid not null references public.cadence_enrollments(id) on delete cascade,
  step_id             uuid references public.cadence_steps(id) on delete set null,
  step_position       smallint not null,
  lead_id             uuid not null references public.leads(id) on delete cascade,
  run_after           timestamptz not null,
  status              text not null default 'queued'
                      check (status in ('queued', 'running', 'sent', 'failed', 'cancelled', 'skipped', 'unknown')),
  attempts            smallint not null default 0,
  last_error          text,
  skip_reason         text,
  claimed_at          timestamptz,
  finished_at         timestamptz,
  provider            text,
  line_key            text,
  rendered_message    text,
  provider_status     integer,
  provider_response   jsonb,
  provider_message_id text,
  provider_chat_id    text,
  conversation_id     uuid references public.conversations(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Idempotência do envio: um passo da inscrição é UM job.
  constraint uq_outreach_jobs_step unique (enrollment_id, step_position)
);

create index if not exists idx_outreach_jobs_due on public.outreach_jobs (run_after) where status = 'queued';
create index if not exists idx_outreach_jobs_line
  on public.outreach_jobs (line_key, finished_at) where status in ('sent', 'unknown');
create index if not exists idx_outreach_jobs_lead on public.outreach_jobs (lead_id, status);
create index if not exists idx_outreach_jobs_running on public.outreach_jobs (claimed_at) where status = 'running';

drop trigger if exists update_outreach_jobs_updated_at on public.outreach_jobs;
create trigger update_outreach_jobs_updated_at
  before update on public.outreach_jobs
  for each row execute function public.update_updated_at_column();

-- (e) Opt-out por TELEFONE normalizado, não por lead: um lead apagado e
-- recriado com o mesmo número continua descadastrado.
create table if not exists public.contact_opt_outs (
  id                uuid primary key default gen_random_uuid(),
  equipe_id         uuid not null references public.equipes(id) on delete cascade,
  phone_normalized  text not null,
  lead_id           uuid references public.leads(id) on delete set null,
  reason            text not null check (reason in ('keyword', 'manual', 'api')),
  source_message_id uuid,
  created_at        timestamptz not null default now(),
  constraint uq_contact_opt_outs_phone unique (equipe_id, phone_normalized)
);

-- ============================================================================
-- 4. RLS — leitura para o time; escrita só por service_role / RPC
-- ============================================================================
alter table public.cadence_sequences enable row level security;
alter table public.cadence_steps enable row level security;
alter table public.cadence_enrollments enable row level security;
alter table public.outreach_jobs enable row level security;
alter table public.contact_opt_outs enable row level security;

drop policy if exists cadence_sequences_team_read on public.cadence_sequences;
create policy cadence_sequences_team_read on public.cadence_sequences for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists cadence_steps_team_read on public.cadence_steps;
create policy cadence_steps_team_read on public.cadence_steps for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists cadence_enrollments_team_read on public.cadence_enrollments;
create policy cadence_enrollments_team_read on public.cadence_enrollments for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists outreach_jobs_team_read on public.outreach_jobs;
create policy outreach_jobs_team_read on public.outreach_jobs for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists contact_opt_outs_team_read on public.contact_opt_outs;
create policy contact_opt_outs_team_read on public.contact_opt_outs for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- ============================================================================
-- 5. INSCRIÇÃO E CANCELAMENTO (núcleo)
-- ============================================================================

-- Inscreve e materializa os jobs. O INSERT é a trava: chave repetida ou
-- inscrição ativa existente → devolve null e nada mais acontece.
-- Não checa opt-out nem janela: isso é do claim e do worker. A inscrição de
-- quem se descadastrou é permitida e os jobs saem 'skipped/opted_out', o que
-- fica visível no rastro.
create or replace function public._outreach_enroll(
  p_sequence_id    uuid,
  p_lead_id        uuid,
  p_opportunity_id uuid,
  p_enrollment_key text,
  p_trigger_ref    jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq   public.cadence_sequences;
  v_id    uuid;
  v_start timestamptz;
begin
  select * into v_seq from public.cadence_sequences where id = p_sequence_id;
  if not found then
    return null;
  end if;
  -- Multi-tenant: um lead de outro time nunca entra numa sequência deste.
  if not exists (select 1 from public.leads l where l.id = p_lead_id and l.equipe_id = v_seq.equipe_id) then
    raise exception 'lead_other_team' using errcode = '22023';
  end if;

  insert into public.cadence_enrollments (equipe_id, sequence_id, lead_id, opportunity_id, enrollment_key, trigger_ref)
  values (v_seq.equipe_id, v_seq.id, p_lead_id, p_opportunity_id, left(p_enrollment_key, 250), p_trigger_ref)
  on conflict do nothing
  returning id, started_at into v_id, v_start;

  if v_id is null then
    return null;
  end if;

  insert into public.outreach_jobs (equipe_id, enrollment_id, step_id, step_position, lead_id, run_after)
  select v_seq.equipe_id, v_id, s.id, s.position, p_lead_id, v_start + make_interval(mins => s.offset_minutes)
    from public.cadence_steps s
   where s.sequence_id = v_seq.id and s.active
  on conflict (enrollment_id, step_position) do nothing;

  -- Sequência sem passo ativo: a inscrição fica registrada, e já concluída.
  if not found then
    update public.cadence_enrollments
       set status = 'completed', finished_at = clock_timestamp()
     where id = v_id;
  end if;

  return v_id;
end;
$$;

-- Cancela inscrições ativas e os jobs ainda na fila delas. Devolve quantas
-- inscrições foram canceladas.
create or replace function public._outreach_cancel_enrollments(p_ids uuid[], p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  update public.cadence_enrollments
     set status = 'cancelled', cancel_reason = p_reason, finished_at = clock_timestamp()
   where id = any (p_ids) and status = 'active';
  get diagnostics v_count = row_count;

  update public.outreach_jobs
     set status = 'cancelled', skip_reason = p_reason, finished_at = clock_timestamp()
   where enrollment_id = any (p_ids) and status = 'queued';
  return v_count;
end;
$$;

-- Registra o opt-out de um telefone e cancela as inscrições ativas de todo
-- lead do time com esse número.
create or replace function public._outreach_register_opt_out(
  p_equipe_id  uuid,
  p_phone      text,
  p_lead_id    uuid,
  p_reason     text,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone     text := public.normalize_phone_br(p_phone);
  v_cancelled integer := 0;
  v_ids       uuid[];
begin
  if v_phone is not null then
    insert into public.contact_opt_outs (equipe_id, phone_normalized, lead_id, reason, source_message_id)
    values (p_equipe_id, v_phone, p_lead_id, p_reason, p_message_id)
    on conflict (equipe_id, phone_normalized) do nothing;
  end if;

  select array_agg(e.id) into v_ids
    from public.cadence_enrollments e
    join public.leads l on l.id = e.lead_id
   where e.equipe_id = p_equipe_id and e.status = 'active'
     and (e.lead_id = p_lead_id or (v_phone is not null and public.normalize_phone_br(l.phone) = v_phone));
  v_cancelled := public._outreach_cancel_enrollments(v_ids, 'opted_out');

  return jsonb_build_object('phone_normalized', v_phone, 'cancelled', v_cancelled);
end;
$$;

-- ============================================================================
-- 6. GATILHOS — quem inscreve e quem cancela
-- ============================================================================

-- (a) Lead chegou por uma porta. Toda chegada passa por crm_record_touch, que
-- insere em lead_touches incondicionalmente: um gatilho aqui cobre todas as
-- portas sem tocar em edge function nenhuma.
create or replace function public._outreach_on_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq record;
begin
  if new.entry_id is null then
    return new;
  end if;
  for v_seq in
    select s.id, s.reenroll
      from public.cadence_sequences s
     where s.equipe_id = new.equipe_id and s.active and s.trigger_event = 'lead_intake'
       and new.entry_id = any (s.trigger_entry_ids)
  loop
    perform public._outreach_enroll(
      v_seq.id, new.lead_id, new.opportunity_id,
      case when v_seq.reenroll = 'per_event' then 'touch:' || new.id else 'lead:' || new.lead_id end,
      jsonb_build_object('entry_id', new.entry_id, 'touch_id', new.id));
  end loop;
  return new;
exception when others then
  raise warning 'outreach on_touch: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_lead_touches_outreach on public.lead_touches;
create trigger trg_lead_touches_outreach
  after insert on public.lead_touches
  for each row execute function public._outreach_on_touch();

-- (b) Oportunidade entrou numa etapa: primeiro cancela o que a mudança de
-- etapa encerra, depois inscreve nas sequências da etapa nova.
create or replace function public._outreach_on_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp record;
  v_ids uuid[];
  v_seq record;
begin
  select o.id, o.lead_id, o.equipe_id into v_opp from public.opportunities o where o.id = new.opportunity_id;
  if not found then
    return new;
  end if;

  select array_agg(e.id) into v_ids
    from public.cadence_enrollments e
    join public.cadence_sequences s on s.id = e.sequence_id
   where e.opportunity_id = v_opp.id and e.status = 'active'
     and s.stop_on_stage_change
     and s.trigger_stage_id is distinct from new.to_stage_id;
  perform public._outreach_cancel_enrollments(v_ids, 'stage_changed');

  for v_seq in
    select s.id, s.reenroll
      from public.cadence_sequences s
     where s.equipe_id = v_opp.equipe_id and s.active and s.trigger_event = 'stage_entered'
       and s.trigger_stage_id = new.to_stage_id
  loop
    perform public._outreach_enroll(
      v_seq.id, v_opp.lead_id, v_opp.id,
      case when v_seq.reenroll = 'per_event' then 'stage_history:' || new.id else 'lead:' || v_opp.lead_id end,
      jsonb_build_object('stage_history_id', new.id, 'to_stage_id', new.to_stage_id));
  end loop;
  return new;
exception when others then
  raise warning 'outreach on_stage: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_stage_history_outreach on public.opportunity_stage_history;
create trigger trg_stage_history_outreach
  after insert on public.opportunity_stage_history
  for each row execute function public._outreach_on_stage();

-- (c) O lead escreveu: opt-out por palavra-chave e cancelamento por resposta.
create or replace function public._outreach_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead     record;
  v_keywords text[];
  v_ids      uuid[];
begin
  if new.sender_type is distinct from 'customer' or new.lead_id is null then
    return new;
  end if;

  select l.id, l.equipe_id, l.phone into v_lead from public.leads l where l.id = new.lead_id;
  if not found then
    return new;
  end if;

  -- Opt-out: só mensagens curtas podem ser uma palavra-chave (poupa a tabela
  -- quente de normalizar textos longos).
  if length(coalesce(new.content, '')) <= 40 then
    select c.opt_out_keywords into v_keywords
      from public.conversation_opener_settings c where c.equipe_id = v_lead.equipe_id;
    if public._outreach_is_opt_out(new.content,
         coalesce(v_keywords, '{sair,parar,pare,stop,cancelar,descadastrar}'::text[])) then
      perform public._outreach_register_opt_out(v_lead.equipe_id, v_lead.phone, v_lead.id, 'keyword', new.id);
      return new;
    end if;
  end if;

  -- Resposta: só conta mensagem posterior ao início da inscrição (um
  -- sync-chat-history importando conversa antiga não cancela nada).
  select array_agg(e.id) into v_ids
    from public.cadence_enrollments e
    join public.cadence_sequences s on s.id = e.sequence_id
   where e.lead_id = new.lead_id and e.status = 'active'
     and s.stop_on_reply
     and coalesce(new.created_at, clock_timestamp()) > e.started_at;
  perform public._outreach_cancel_enrollments(v_ids, 'lead_replied');
  return new;
exception when others then
  raise warning 'outreach on_message: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_messages_outreach_cancel on public.messages;
create trigger trg_messages_outreach_cancel
  after insert on public.messages
  for each row execute function public._outreach_on_message();

-- (d) Negócio ganho ou perdido.
create or replace function public._outreach_on_opportunity_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(e.id) into v_ids
    from public.cadence_enrollments e
   where e.opportunity_id = new.id and e.status = 'active';
  perform public._outreach_cancel_enrollments(v_ids, 'opportunity_closed');
  return new;
exception when others then
  raise warning 'outreach on_opportunity_closed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_opportunities_outreach_closed on public.opportunities;
create trigger trg_opportunities_outreach_closed
  after update of status on public.opportunities
  for each row
  when (new.status in ('won', 'lost') and old.status is distinct from new.status)
  execute function public._outreach_on_opportunity_closed();

-- (e) Sequência desligada.
create or replace function public._outreach_on_sequence_disabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(e.id) into v_ids
    from public.cadence_enrollments e
   where e.sequence_id = new.id and e.status = 'active';
  perform public._outreach_cancel_enrollments(v_ids, 'sequence_disabled');
  return new;
exception when others then
  raise warning 'outreach on_sequence_disabled: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_cadence_sequences_disabled on public.cadence_sequences;
create trigger trg_cadence_sequences_disabled
  after update of active on public.cadence_sequences
  for each row
  when (old.active and not new.active)
  execute function public._outreach_on_sequence_disabled();

-- ============================================================================
-- 7. O WORKER PEGA E DEVOLVE O TRABALHO
-- ============================================================================

-- Revalida TUDO na hora de enviar, e só então reivindica.
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

  -- 3. O lead respondeu (garantia: o gatilho de messages pode ter falhado).
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
   where j.status = 'queued' and j.run_after <= v_now
     and exists (select 1 from public.contact_opt_outs o
                  where o.equipe_id = j.equipe_id and o.phone_normalized = public.normalize_phone_br(l.phone));
  update public.outreach_jobs
     set status = 'skipped', skip_reason = 'opted_out', finished_at = v_now
   where enrollment_id = any (coalesce(v_ids, '{}')) and status = 'queued' and run_after <= v_now;
  perform public._outreach_cancel_enrollments(v_ids, 'opted_out');

  -- 4b. Lead apagado.
  select array_agg(distinct j.enrollment_id) into v_ids
    from public.outreach_jobs j
    join public.leads l on l.id = j.lead_id
   where j.status = 'queued' and j.run_after <= v_now and l.deleted_at is not null;
  update public.outreach_jobs
     set status = 'skipped', skip_reason = 'lead_deleted', finished_at = v_now
   where enrollment_id = any (coalesce(v_ids, '{}')) and status = 'queued' and run_after <= v_now;
  perform public._outreach_cancel_enrollments(v_ids, 'lead_deleted');

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

-- Devolve o job para a fila sem contar tentativa (fora da janela de horário,
-- limite da linha). Só age sobre job 'running'.
create or replace function public.crm_outreach_defer(p_job_id uuid, p_run_after timestamptz, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.outreach_jobs
     set status = 'queued',
         run_after = greatest(coalesce(p_run_after, clock_timestamp()), clock_timestamp()),
         attempts = greatest(attempts - 1, 0),
         claimed_at = null,
         last_error = left(p_reason, 500)
   where id = p_job_id and status = 'running';
  if not found then
    return 'not_running';
  end if;
  return 'queued';
end;
$$;

-- Fecha o job. p_status: sent · failed · skipped · unknown.
-- 'failed' com p_retryable e menos de 3 tentativas volta à fila com espera de
-- 1, 4 min (attempts²). Só retryable quando o provider CERTAMENTE não
-- entregou (recusa transitória, sem conexão) — decisão do adaptador.
-- Quando não sobra job na fila da inscrição, ela fica 'completed'.
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

  if v_status <> 'queued'
     and not exists (select 1 from public.outreach_jobs q
                      where q.enrollment_id = v_job.enrollment_id and q.status in ('queued', 'running')) then
    update public.cadence_enrollments
       set status = 'completed', finished_at = clock_timestamp()
     where id = v_job.enrollment_id and status = 'active';
  end if;
  return v_status;
end;
$$;

-- Freio anti-banimento: quantas mensagens a linha soltou na janela. 'unknown'
-- conta, porque pode ter saído.
create or replace function public.crm_outreach_line_usage(p_line_key text, p_window_minutes integer default 60)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.outreach_jobs
   where line_key = p_line_key and status in ('sent', 'unknown')
     and finished_at > clock_timestamp() - make_interval(mins => greatest(coalesce(p_window_minutes, 60), 1));
$$;

-- ============================================================================
-- 8. RPCs DA API (outreach) — sempre com o tenant explícito
-- ============================================================================

-- Inscrição pedida de fora (n8n, botão). Idempotente pela chave.
create or replace function public.crm_outreach_enroll(
  p_equipe_id   uuid,
  p_sequence_id uuid,
  p_lead_id     uuid,
  p_event_key   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq public.cadence_sequences;
  v_key text;
  v_opp uuid;
  v_id  uuid;
  v_existing public.cadence_enrollments;
begin
  select * into v_seq from public.cadence_sequences where id = p_sequence_id and equipe_id = p_equipe_id;
  if not found then
    raise exception 'sequence_not_found' using errcode = 'P0002';
  end if;
  if not v_seq.active then
    raise exception 'sequence_inactive' using errcode = '22023';
  end if;
  if not exists (select 1 from public.leads l where l.id = p_lead_id and l.equipe_id = p_equipe_id and l.deleted_at is null) then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  v_key := case when nullif(btrim(p_event_key), '') is not null
                then 'api:' || left(btrim(p_event_key), 200)
                else 'lead:' || p_lead_id end;
  select o.id into v_opp
    from public.opportunities o
   where o.lead_id = p_lead_id and o.status = 'open' and o.deleted_at is null
   order by o.updated_at desc nulls last
   limit 1;

  v_id := public._outreach_enroll(p_sequence_id, p_lead_id, v_opp, v_key, jsonb_build_object('api', true));
  if v_id is not null then
    return jsonb_build_object('created', true, 'enrollment_id', v_id, 'enrollment_key', v_key);
  end if;

  select * into v_existing from public.cadence_enrollments
   where sequence_id = p_sequence_id and (enrollment_key = v_key or (lead_id = p_lead_id and status = 'active'))
   order by (status = 'active') desc, created_at desc
   limit 1;
  return jsonb_build_object('created', false, 'enrollment_id', v_existing.id, 'enrollment_key', v_key,
                            'status', v_existing.status,
                            'reason', case when v_existing.enrollment_key = v_key then 'duplicate_event'
                                           else 'already_active' end);
end;
$$;

create or replace function public.crm_outreach_cancel(
  p_equipe_id     uuid,
  p_enrollment_id uuid default null,
  p_lead_id       uuid default null,
  p_sequence_id   uuid default null,
  p_reason        text default 'manual'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if p_enrollment_id is null and p_lead_id is null then
    raise exception 'missing_target' using errcode = '22023';
  end if;
  if p_reason not in ('manual', 'opted_out') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  select array_agg(e.id) into v_ids
    from public.cadence_enrollments e
   where e.equipe_id = p_equipe_id and e.status = 'active'
     and (e.id = p_enrollment_id
          or (p_enrollment_id is null and e.lead_id = p_lead_id
              and (p_sequence_id is null or e.sequence_id = p_sequence_id)));
  return public._outreach_cancel_enrollments(v_ids, p_reason);
end;
$$;

create or replace function public.crm_outreach_opt_out(
  p_equipe_id uuid,
  p_phone     text,
  p_lead_id   uuid default null,
  p_reason    text default 'api'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reason not in ('manual', 'api') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_lead_id is not null
     and not exists (select 1 from public.leads l where l.id = p_lead_id and l.equipe_id = p_equipe_id) then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;
  if public.normalize_phone_br(p_phone) is null and p_lead_id is null then
    raise exception 'missing_phone' using errcode = '22023';
  end if;
  return public._outreach_register_opt_out(p_equipe_id, p_phone, p_lead_id, p_reason, null);
end;
$$;

-- ============================================================================
-- 9. O DESPERTADOR (pg_cron → _outreach_tick → outreach-worker)
-- ============================================================================
-- Só chama o worker quando há job vencido. URL e segredo vêm do Vault
-- (`outreach_worker_url`, `outreach_worker_secret`) — nunca desta migration.
create or replace function public._outreach_tick()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.outreach_jobs where status = 'queued' and run_after <= clock_timestamp()) then
    return null;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'outreach_worker_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'outreach_worker_secret';
  if nullif(btrim(v_url), '') is null or nullif(btrim(v_secret), '') is null then
    raise warning 'outreach tick: faltam os segredos outreach_worker_url/outreach_worker_secret no Vault';
    return null;
  end if;

  return net.http_post(
    url := btrim(v_url),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-outreach-secret', btrim(v_secret)),
    timeout_milliseconds := 10000
  );
end;
$$;

-- ============================================================================
-- 10. PERMISSÕES — nenhuma função do motor é chamável por usuário final
-- ============================================================================
revoke all on function public._outreach_enroll(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public._outreach_cancel_enrollments(uuid[], text) from public, anon, authenticated;
revoke all on function public._outreach_register_opt_out(uuid, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.crm_outreach_claim(integer) from public, anon, authenticated;
revoke all on function public.crm_outreach_defer(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.crm_outreach_finish(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.crm_outreach_line_usage(text, integer) from public, anon, authenticated;
revoke all on function public.crm_outreach_enroll(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.crm_outreach_cancel(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.crm_outreach_opt_out(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public._outreach_tick() from public, anon, authenticated;

grant execute on function public._outreach_enroll(uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public._outreach_cancel_enrollments(uuid[], text) to service_role;
grant execute on function public._outreach_register_opt_out(uuid, text, uuid, text, uuid) to service_role;
grant execute on function public.crm_outreach_claim(integer) to service_role;
grant execute on function public.crm_outreach_defer(uuid, timestamptz, text) to service_role;
grant execute on function public.crm_outreach_finish(uuid, text, text, jsonb, boolean) to service_role;
grant execute on function public.crm_outreach_line_usage(text, integer) to service_role;
grant execute on function public.crm_outreach_enroll(uuid, uuid, uuid, text) to service_role;
grant execute on function public.crm_outreach_cancel(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.crm_outreach_opt_out(uuid, text, uuid, text) to service_role;
grant execute on function public._outreach_tick() to service_role;
