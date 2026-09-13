-- Sprint 11 · Onda 6 · T58 — a fila do Copilot, a espera e o contexto numa ida.
--
-- ANTES
--
-- O Copilot só rodava no clique (Sync), lia a conversa inteira a cada vez e
-- buscava lead, negócio, regras, pipelines e etapas em idas separadas ao
-- PostgREST a partir da VPS. Não havia fila: nada acontecia sozinho.
--
-- AGORA (decisões 42 e 43)
--
--   * `copilot_jobs` — um trabalho por negócio na fila. A mensagem do cliente põe
--     o negócio na fila para daqui a N minutos (a espera da linha); cada nova
--     mensagem empurra. Uma rajada de mensagens = uma passada, nunca uma por
--     mensagem. O Sync manual entra na frente e não é empurrado.
--   * Só roda sozinho onde foi ligado: equipe com o Agente CRM e linha com o agente
--     configurado (`copilot_agents`, escopo `pipeline`). O resto só pelo Sync.
--   * `copilot_memory` — o resumo do negócio e o cursor da última mensagem lida: o
--     Copilot lê só o que é novo.
--   * `crm_copilot_claim` — o agente pega os trabalhos vencidos sem dois pegarem o
--     mesmo; trabalho preso volta para a fila; teto diário de passadas por linha.
--   * `crm_copilot_finish` — fecha o trabalho; falha volta para a fila com espera
--     crescente até a 3ª tentativa.
--   * `crm_copilot_context` — tudo o que o modelo precisa, numa ida só.
--
-- A espera é `pipeline_agent_rules.cooldown_minutes`, com mínimo de 5 min (o
-- Copilot não lê a conversa enquanto ela acontece) e máximo de 4 h. O teto é a
-- coluna nova `daily_run_cap` (passadas por dia na linha; padrão 200; nulo = sem
-- teto) — `autonomy_cost_ceiling` é o limite de ferramentas do time autônomo
-- antigo, outra coisa.

-- ============================================================================
-- 1. A FILA E A MEMÓRIA
-- ============================================================================

alter table public.pipeline_agent_rules add column if not exists daily_run_cap integer default 200;
alter table public.pipeline_agent_rules drop constraint if exists pipeline_agent_rules_daily_run_cap_check;
alter table public.pipeline_agent_rules add constraint pipeline_agent_rules_daily_run_cap_check
  check (daily_run_cap is null or daily_run_cap between 1 and 10000);

create table if not exists public.copilot_jobs (
  id             uuid primary key default gen_random_uuid(),
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  lead_id        uuid references public.leads(id) on delete cascade,
  reason         text not null check (reason in ('conversation', 'manual', 'sync_stage', 'sync_pipeline')),
  priority       smallint not null default 0,
  run_after      timestamptz not null default clock_timestamp(),
  status         text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  attempts       smallint not null default 0,
  last_error     text,
  run_id         uuid,
  requested_by   uuid,
  claimed_at     timestamptz,
  finished_at    timestamptz,
  -- {applied, pending, rejected, timings: {context_ms, model_ms, apply_ms}}
  result         jsonb,
  created_at     timestamptz not null default clock_timestamp(),
  updated_at     timestamptz not null default clock_timestamp()
);

-- Um trabalho na fila por negócio (o que está rodando não conta).
create unique index if not exists uq_copilot_jobs_queued on public.copilot_jobs (opportunity_id) where status = 'queued';
create index if not exists idx_copilot_jobs_due on public.copilot_jobs (run_after, priority desc) where status = 'queued';
create index if not exists idx_copilot_jobs_team on public.copilot_jobs (equipe_id, created_at desc);

create table if not exists public.copilot_memory (
  opportunity_id  uuid primary key references public.opportunities(id) on delete cascade,
  equipe_id       uuid not null references public.equipes(id) on delete cascade,
  summary         text,
  facts           jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  last_run_id     uuid,
  updated_at      timestamptz not null default clock_timestamp()
);

alter table public.copilot_jobs enable row level security;
alter table public.copilot_memory enable row level security;
drop policy if exists copilot_jobs_team_read on public.copilot_jobs;
create policy copilot_jobs_team_read on public.copilot_jobs for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
drop policy if exists copilot_memory_team_read on public.copilot_memory;
create policy copilot_memory_team_read on public.copilot_memory for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- A tela acompanha o trabalho ao vivo (T61).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'copilot_jobs') then
    execute 'alter publication supabase_realtime add table public.copilot_jobs';
  end if;
end $$;

-- ============================================================================
-- 2. A ESPERA: A MENSAGEM DO CLIENTE PÕE O NEGÓCIO NA FILA
-- ============================================================================

-- Minutos de espera da linha: o configurado, entre 5 e 240 (padrão 10).
create or replace function public._copilot_wait_minutes(p_equipe_id uuid, p_pipeline_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select least(greatest(coalesce((select r.cooldown_minutes from public.pipeline_agent_rules r
                                   where r.equipe_id = p_equipe_id and r.pipeline_id = p_pipeline_id
                                   limit 1), 10), 5), 240);
$$;

create or replace function public._copilot_enqueue_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp record;
begin
  if new.sender_type is distinct from 'customer' or new.lead_id is null then
    return new;
  end if;

  -- O negócio aberto mais recente do lead, numa linha onde o Copilot roda sozinho.
  select o.id, o.equipe_id, o.pipeline_id, o.lead_id into v_opp
    from public.opportunities o
    join public.equipes e on e.id = o.equipe_id
   where o.lead_id = new.lead_id
     and o.status = 'open'
     and o.deleted_at is null
     and coalesce(e.is_crm_agent_enabled, false)
     and exists (select 1 from public.copilot_agents a
                  where a.equipe_id = o.equipe_id and a.scope = 'pipeline' and a.pipeline_id = o.pipeline_id)
   order by o.updated_at desc nulls last
   limit 1;
  if not found then
    return new;
  end if;

  insert into public.copilot_jobs (equipe_id, opportunity_id, lead_id, reason, run_after)
  values (v_opp.equipe_id, v_opp.id, v_opp.lead_id, 'conversation',
          clock_timestamp() + make_interval(mins => public._copilot_wait_minutes(v_opp.equipe_id, v_opp.pipeline_id)))
  on conflict (opportunity_id) where status = 'queued'
  do update set run_after  = greatest(public.copilot_jobs.run_after, excluded.run_after),
                updated_at = clock_timestamp()
          -- O Sync pedido por alguém não é empurrado por mensagem nova.
          where public.copilot_jobs.reason = 'conversation';
  return new;
exception when others then
  -- A fila nunca derruba a mensagem.
  raise warning 'copilot enqueue: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_messages_copilot_enqueue on public.messages;
create trigger trg_messages_copilot_enqueue
  after insert on public.messages
  for each row execute function public._copilot_enqueue_from_message();

-- ============================================================================
-- 3. O AGENTE PEGA E DEVOLVE O TRABALHO
-- ============================================================================

create or replace function public.crm_copilot_claim(p_limit integer default 10)
returns setof public.copilot_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tomorrow timestamptz := (((now() at time zone 'America/Sao_Paulo')::date + 1) + time '07:00') at time zone 'America/Sao_Paulo';
begin
  -- Trabalho preso há 5 min (o agente caiu no meio): volta para a fila — ou falha,
  -- se já foi a 3ª tentativa ou se outra passada do mesmo negócio já está na fila.
  update public.copilot_jobs j
     set status = case when j.attempts < 3
                        and not exists (select 1 from public.copilot_jobs q
                                         where q.opportunity_id = j.opportunity_id and q.status = 'queued')
                       then 'queued' else 'failed' end,
         last_error = 'interrompido no meio',
         claimed_at = null,
         finished_at = case when j.attempts >= 3 then clock_timestamp() end,
         updated_at = clock_timestamp()
   where j.status = 'running' and j.claimed_at < clock_timestamp() - interval '5 minutes';

  -- Linha que já bateu o teto do dia: o trabalho espera amanhã, dizendo por quê.
  update public.copilot_jobs j
     set run_after = v_tomorrow, last_error = 'teto diário de passadas atingido', updated_at = clock_timestamp()
    from public.opportunities o, public.pipeline_agent_rules r
   where j.status = 'queued' and j.run_after <= clock_timestamp()
     and o.id = j.opportunity_id
     and r.equipe_id = j.equipe_id and r.pipeline_id = o.pipeline_id and r.daily_run_cap is not null
     and (select count(*) from public.copilot_jobs d
            join public.opportunities od on od.id = d.opportunity_id
           where d.equipe_id = j.equipe_id and od.pipeline_id = o.pipeline_id
             -- A passada que falhou também gastou (o modelo pode ter respondido);
             -- a que não tinha nada novo (skipped) não chamou o modelo.
             and d.status in ('done', 'running', 'failed')
             and d.claimed_at >= ((now() at time zone 'America/Sao_Paulo')::date) at time zone 'America/Sao_Paulo')
         >= r.daily_run_cap;

  return query
  with due as (
    select j.id
      from public.copilot_jobs j
     where j.status = 'queued' and j.run_after <= clock_timestamp()
     order by j.priority desc, j.run_after
     limit greatest(coalesce(p_limit, 10), 1)
     for update skip locked
  )
  update public.copilot_jobs j
     set status = 'running', claimed_at = clock_timestamp(), attempts = j.attempts + 1,
         run_id = gen_random_uuid(), last_error = null, updated_at = clock_timestamp()
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

-- p_status: done · skipped (nada novo para ler) · failed (volta para a fila com
-- espera de 1, 4, 9 min até a 3ª tentativa).
create or replace function public.crm_copilot_finish(
  p_job_id uuid,
  p_status text,
  p_error  text default null,
  p_result jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.copilot_jobs;
  v_status text;
begin
  if p_status not in ('done', 'skipped', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select * into v_job from public.copilot_jobs where id = p_job_id and status = 'running' for update;
  if not found then
    return 'not_running';
  end if;

  v_status := p_status;
  if p_status = 'failed' and v_job.attempts < 3
     and not exists (select 1 from public.copilot_jobs q where q.opportunity_id = v_job.opportunity_id and q.status = 'queued') then
    v_status := 'queued';
  end if;

  update public.copilot_jobs
     set status      = v_status,
         last_error  = case when p_status = 'failed' then left(coalesce(p_error, 'falhou'), 500) end,
         result      = coalesce(p_result, result),
         run_after   = case when v_status = 'queued'
                            then clock_timestamp() + make_interval(mins => (v_job.attempts * v_job.attempts)::int)
                            else run_after end,
         claimed_at  = case when v_status = 'queued' then null else claimed_at end,
         finished_at = case when v_status = 'queued' then null else clock_timestamp() end,
         updated_at  = clock_timestamp()
   where id = p_job_id;
  return v_status;
end;
$$;

-- ============================================================================
-- 4. O CONTEXTO, NUMA IDA
-- ============================================================================

-- Tipos de campo que o Copilot preenche (os mesmos do formulário público).
create or replace function public._copilot_writable_field_types()
returns text[]
language sql
immutable
as $$
  select array['text', 'number', 'currency', 'date', 'boolean', 'select', 'multi_select', 'url', 'phone'];
$$;

-- Nome provisório de contato criado pela porta ("[Novo Contato - WhatsApp]") ou vazio.
create or replace function public._copilot_name_is_placeholder(p_name text)
returns boolean
language sql
immutable
as $$
  select p_name is null or btrim(p_name) = '' or btrim(p_name) ~ '^\[.*\]$' or btrim(p_name) ~ '^\+?\d[\d\s().-]{6,}$';
$$;

create or replace function public.crm_copilot_context(p_opportunity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_opp  public.opportunities;
  v_lead public.leads;
  v_pipe public.pipelines;
  v_mem  public.copilot_memory;
  v_rule public.pipeline_agent_rules;
  v_mode text;
  v_msgs jsonb;
  v_last timestamptz;
begin
  select * into v_opp from public.opportunities where id = p_opportunity_id and deleted_at is null;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = v_opp.lead_id;
  select * into v_pipe from public.pipelines where id = v_opp.pipeline_id;
  select * into v_mem from public.copilot_memory where opportunity_id = v_opp.id;
  select * into v_rule from public.pipeline_agent_rules
   where equipe_id = v_opp.equipe_id and pipeline_id = v_opp.pipeline_id limit 1;
  -- Sem agente configurado na linha: tudo vira sugestão (o Sync ainda roda).
  select a.autonomy_mode into v_mode from public.copilot_agents a
   where a.equipe_id = v_opp.equipe_id and a.scope = 'pipeline' and a.pipeline_id = v_opp.pipeline_id
   limit 1;

  -- Só o que chegou depois da última leitura; as 40 mais novas, em ordem.
  select coalesce(jsonb_agg(jsonb_build_object('at', m.created_at, 'from', m.sender_type, 'text', m.body) order by m.created_at), '[]'::jsonb),
         max(m.created_at)
    into v_msgs, v_last
    from (select mm.created_at, mm.sender_type,
                 left(case when mm.media_type in ('audio', 'image', 'video', 'document')
                           then '[' || mm.media_type || ']' || coalesce(' ' || nullif(btrim(mm.content), ''), '')
                           else btrim(mm.content) end, 1000) as body
            from public.messages mm
           where mm.lead_id = v_opp.lead_id
             and (nullif(btrim(mm.content), '') is not null or mm.media_type in ('audio', 'image', 'video', 'document'))
             and (v_mem.last_message_at is null or mm.created_at > v_mem.last_message_at)
           order by mm.created_at desc
           limit 40) m;

  return jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_opp.id, 'lead_id', v_opp.lead_id, 'pipeline_id', v_opp.pipeline_id, 'stage_id', v_opp.stage_id,
      'status', v_opp.status, 'value', v_opp.value, 'owner_id', v_opp.owner_id,
      'created_at', v_opp.created_at, 'stage_entered_at', v_opp.stage_entered_at),
    'lead', jsonb_build_object(
      'id', v_lead.id, 'name', v_lead.name, 'email', v_lead.email,
      'name_is_placeholder', public._copilot_name_is_placeholder(v_lead.name),
      'tags', coalesce(to_jsonb(v_lead.tags), '[]'::jsonb)),
    'pipeline', jsonb_build_object(
      'id', v_pipe.id, 'name', v_pipe.name,
      'offer_mode', coalesce(v_pipe.natures->'offer'->>'mode', 'free')),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'stage_type', s.stage_type, 'funnel_event', s.funnel_event,
               'description', s.description, 'max_idle_hours', s.max_idle_hours, 'position', s.position,
               'current', s.id = v_opp.stage_id) order by s.position)
        from public.pipeline_stages_v2 s
       where s.pipeline_id = v_opp.pipeline_id and s.deleted_at is null), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
               'field_id', f->>'field_id', 'key', f->>'key', 'label', f->>'label', 'type', f->>'type',
               'options', coalesce(f->'options', '[]'::jsonb), 'description', f->>'description',
               'value', v_opp.custom_data -> (f->>'field_id')) order by (f->>'position')::int nulls last)
        from jsonb_array_elements(coalesce(v_pipe.custom_fields_schema, '[]'::jsonb)) f
       where not coalesce((f->>'is_deleted')::boolean, false)
         and nullif(f->>'field_id', '') is not null
         and f->>'type' = any (public._copilot_writable_field_types())), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity, 'unit_price', i.unit_price,
                                          'catalog_item_id', i.catalog_item_id) order by i.position)
        from public.opportunity_items i
       where i.opportunity_id = v_opp.id and i.deleted_at is null), '[]'::jsonb),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from (select c.id, c.name from public.catalog_items c
               where c.equipe_id = v_opp.equipe_id and c.deleted_at is null
                 and coalesce(v_pipe.natures->'offer'->>'mode', 'free') = 'catalog'
                 and (jsonb_array_length(coalesce(v_pipe.natures->'offer'->'catalog_item_ids', '[]'::jsonb)) = 0
                      or v_pipe.natures->'offer'->'catalog_item_ids' ? c.id::text)
               order by c.name limit 50) c), '[]'::jsonb),
    'open_tasks', coalesce((
      select jsonb_agg(jsonb_build_object('title', t.title, 'due_date', t.due_date, 'status', t.status) order by t.due_date nulls last)
        from (select t.title, t.due_date, t.status from public.tasks t
               where t.lead_id = v_opp.lead_id and t.status in ('a_fazer', 'fazendo')
               order by t.due_date nulls last limit 10) t), '[]'::jsonb),
    'team_tags', coalesce((
      select jsonb_agg(x.tag order by x.n desc, x.tag)
        from (select tag, count(*) as n
                from public.leads l2, unnest(coalesce(l2.tags, array[]::text[])) tag
               where l2.equipe_id = v_opp.equipe_id and l2.deleted_at is null
               group by tag order by count(*) desc limit 50) x), '[]'::jsonb),
    'messages', v_msgs,
    'last_message_at', v_last,
    'memory', jsonb_build_object('summary', v_mem.summary, 'facts', coalesce(v_mem.facts, '{}'::jsonb),
                                 'last_message_at', v_mem.last_message_at),
    'settings', jsonb_build_object(
      'mode', coalesce(v_mode, 'suggest'),
      'agent_configured', v_mode is not null,
      'threshold', coalesce(v_rule.confidence_threshold, 0.75),
      'auto_extract_custom_fields', coalesce(v_rule.auto_extract_custom_fields, true),
      'auto_advance_stages', coalesce(v_rule.auto_advance_stages, true),
      'extraction_hints', v_rule.extraction_hints)
  );
end;
$$;

-- ============================================================================
-- 5. QUEM CHAMA
-- ============================================================================

revoke all on function public.crm_copilot_claim(integer) from public, anon, authenticated;
revoke all on function public.crm_copilot_finish(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.crm_copilot_context(uuid) from public, anon, authenticated;
revoke all on function public._copilot_enqueue_from_message() from public, anon, authenticated;
grant execute on function public.crm_copilot_claim(integer) to service_role;
grant execute on function public.crm_copilot_finish(uuid, text, text, jsonb) to service_role;
grant execute on function public.crm_copilot_context(uuid) to service_role;
