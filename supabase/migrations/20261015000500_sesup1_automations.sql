-- Sprint Suporte 1 · Onda 5 (#3, #5) — automação orientada a evento: evento -> ação.
--
-- Uma ideia só: um EVENTO (entrou na etapa, chegou um webhook) dispara uma AÇÃO
-- (mover etapa, atualizar campo, atribuir responsável, chamar um webhook de saída).
-- Nada paralelo: a ação reutiliza o motor de mover etapa (crm_move_opportunity),
-- crm_set_responsible, o contrato dos campos (valor em custom_data[field_id]) e a
-- fila de entrega de webhooks (enqueue_crm_webhooks).
--
--   crm_automations   regras por equipe (trigger jsonb, action jsonb, enabled)
--   automation_runs   uma linha por execução (ok | error | skipped), com a entrada
--   crm_run_automation()  o executor; idempotente por (automação, negócio, chave)
--   webhook_configs.action  ação opcional declarada num webhook de ENTRADA
--   resend_webhook_delivery()  "reenviar" uma entrega de saída que falhou: cria a
--                             nova linha de log com o token do despachante; quem
--                             entrega continua sendo deliver-crm-webhook
--
-- Quem chama: a UI (auth.uid() presente: as RPCs de verdade, escopo da equipe de
-- quem chama) ou o servidor (crm-webhook / gatilho de etapa: sem auth.uid(), então
-- o escopo vem da própria automação e o UPDATE é o mesmo que a RPC faria — os
-- gatilhos de etapa/dono/perda disparam igual).

-- ORDEM DE DEPLOY (obrigatória): 1) esta migration; 2) functions (crm-webhook);
-- 3) frontend. O crm-webhook e a UI toleram a migration ausente (leem/gravam
-- `action` só quando há ação), mas ações e automações só funcionam depois dela.
-- Gravação de crm_automations segue a regra de webhook_configs: qualquer membro da
-- equipe (política por equipe, sem papel) — não há guarda de papel a copiar.

begin;

create table if not exists public.crm_automations (
  id         uuid primary key default gen_random_uuid(),
  equipe_id  uuid not null references public.equipes(id) on delete cascade,
  name       text not null,
  -- {event: 'stage_entered'|'webhook_received'|'button_clicked', stage_id?|webhook_id?|button_id?}
  trigger    jsonb not null,
  -- {type: 'move_stage'|'update_field'|'set_responsible'|'call_webhook', params: {...}}
  action     jsonb not null,
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_automations_trigger_event check (
    jsonb_typeof(trigger) = 'object'
    and trigger->>'event' in ('stage_entered', 'webhook_received', 'button_clicked')),
  constraint crm_automations_action_type check (
    jsonb_typeof(action) = 'object'
    and action->>'type' in ('move_stage', 'update_field', 'set_responsible', 'call_webhook'))
);

create index if not exists idx_crm_automations_equipe on public.crm_automations (equipe_id) where enabled;

create table if not exists public.automation_runs (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid references public.crm_automations(id) on delete set null,
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  status         text not null default 'running' check (status in ('running', 'ok', 'error', 'skipped')),
  error          text,
  input          jsonb not null default '{}'::jsonb,
  -- chave do evento: com ela, o mesmo (automação, negócio, evento) roda uma vez só.
  event_key      text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_automation_runs_equipe on public.automation_runs (equipe_id, created_at desc);
-- Só execuções que não falharam seguram a chave: o que deu erro pode ser tentado de novo.
-- coalesce: ação avulsa (webhook de entrada, sem automation_id) também deduplica.
create unique index if not exists uq_automation_runs_event_key
  on public.automation_runs ((coalesce(automation_id, '00000000-0000-0000-0000-000000000000'::uuid)), opportunity_id, event_key)
  where event_key is not null and status <> 'error';

alter table public.crm_automations enable row level security;
drop policy if exists "tenant_isolation_crm_automations" on public.crm_automations;
create policy "tenant_isolation_crm_automations" on public.crm_automations
  for all
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()))
  with check (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- Execuções só se leem pela interface; quem grava é crm_run_automation (security definer).
alter table public.automation_runs enable row level security;
drop policy if exists "tenant_read_automation_runs" on public.automation_runs;
create policy "tenant_read_automation_runs" on public.automation_runs
  for select
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- Ação opcional num webhook de ENTRADA ({type, params}); sem ela o webhook só cria lead.
alter table public.webhook_configs add column if not exists action jsonb;

-- ============================================================================
-- Validação ao salvar: mover para etapa de perda exige o motivo
-- ============================================================================

create or replace function public.fn_automation_action_problem(p_equipe uuid, p_action jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_params jsonb := coalesce(p_action->'params', '{}'::jsonb);
  v_ids    text[];
  v_id     text;
  v_row    record;
begin
  if p_action is null or p_action->>'type' is distinct from 'move_stage' then
    return null;
  end if;
  v_ids := array_remove(array[v_params->>'stage_id'], null)
        || coalesce((select array_agg(m.value) from jsonb_each_text(
              case when jsonb_typeof(v_params->'map') = 'object' then v_params->'map' else '{}'::jsonb end) m), '{}');
  foreach v_id in array v_ids loop
    if v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return 'invalid_stage';
    end if;
    select s.stage_type, pl.loss_reasons into v_row
      from public.pipeline_stages_v2 s join public.pipelines pl on pl.id = s.pipeline_id
     where s.id = v_id::uuid and s.equipe_id = p_equipe and s.deleted_at is null;
    if not found then
      return 'invalid_stage';
    end if;
    if v_row.stage_type = 'lost' and jsonb_typeof(v_row.loss_reasons) = 'array'
       and jsonb_array_length(v_row.loss_reasons) > 0
       and nullif(btrim(coalesce(v_params->>'lost_reason', '')), '') is null then
      return 'loss_reason_required';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.fn_automation_action_problem(uuid, jsonb) from public, anon, authenticated;

create or replace function public.fn_validate_automation_action()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_problem text;
begin
  v_problem := public.fn_automation_action_problem(new.equipe_id, new.action);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_validate_automation_action() from public, anon, authenticated;

drop trigger if exists trg_crm_automations_validate on public.crm_automations;
create trigger trg_crm_automations_validate
  before insert or update of action on public.crm_automations
  for each row execute function public.fn_validate_automation_action();

drop trigger if exists trg_webhook_configs_validate_action on public.webhook_configs;
create trigger trg_webhook_configs_validate_action
  before insert or update of action on public.webhook_configs
  for each row when (new.action is not null)
  execute function public.fn_validate_automation_action();

-- ============================================================================
-- Executor
-- ============================================================================

create or replace function public.crm_run_automation(
  p_automation uuid,
  p_opportunity uuid,
  p_payload jsonb default '{}'::jsonb,
  p_event_key text default null,
  -- Só para o servidor: ação declarada fora de crm_automations (webhook de entrada).
  p_action jsonb default null,
  p_equipe uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller   uuid := auth.uid();
  v_equipe   uuid;
  v_enabled  boolean := true;
  v_equipe_a uuid;
  v_aid      uuid;
  v_action   jsonb;
  v_type     text;
  v_params   jsonb;
  v_opp      record;
  v_run      uuid;
  v_payload  jsonb := coalesce(p_payload, '{}'::jsonb);
  v_stage    uuid;
  v_stage_t  text;
  v_user     uuid;
  v_field    text;
  v_fid      text;
  v_value    jsonb;
  v_hook     record;
  v_pl_loss  jsonb;
  v_f        jsonb;
  v_ftype    text;
  v_ok       boolean := true;
begin
  if v_caller is not null then
    select p.equipe_id into v_equipe from public.profiles p where p.id = v_caller;
    if v_equipe is null then
      raise exception 'not_authenticated' using errcode = '42501';
    end if;
  end if;

  if p_automation is not null then
    -- Variáveis soltas (não um record): no caminho avulso nada é lido de uma linha ausente.
    select a.equipe_id, a.action, a.enabled into v_equipe_a, v_action, v_enabled
      from public.crm_automations a where a.id = p_automation;
    if not found or (v_equipe is not null and v_equipe_a <> v_equipe) then
      raise exception 'automation_not_found' using errcode = 'P0002';
    end if;
    v_equipe := v_equipe_a;
    v_aid := p_automation;
  else
    -- Ação avulsa: só o servidor (sem auth.uid()) pode declará-la, e informa a equipe.
    if v_caller is not null or p_action is null or p_equipe is null then
      raise exception 'invalid_automation' using errcode = '22023';
    end if;
    v_equipe := p_equipe;
    v_action := p_action;
  end if;

  v_type := v_action->>'type';
  v_params := coalesce(v_action->'params', '{}'::jsonb);

  select o.id, o.lead_id, o.pipeline_id, o.stage_id, o.custom_data
    into v_opp
    from public.opportunities o
   where o.id = p_opportunity and o.equipe_id = v_equipe and o.deleted_at is null
     and exists (select 1 from public.leads l where l.id = o.lead_id and l.deleted_at is null)
   for update of o;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  -- Idempotência: o mesmo evento não roda duas vezes para o mesmo negócio.
  insert into public.automation_runs (automation_id, equipe_id, opportunity_id, status, input, event_key)
  values (v_aid, v_equipe, p_opportunity, 'running',
          jsonb_build_object('action', v_action, 'payload', v_payload), p_event_key)
  on conflict ((coalesce(automation_id, '00000000-0000-0000-0000-000000000000'::uuid)), opportunity_id, event_key)
    where event_key is not null and status <> 'error'
  do nothing
  returning id into v_run;
  if v_run is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_ran');
  end if;

  begin
    if not v_enabled then
      raise exception 'automation_disabled' using errcode = '22023';
    end if;

    if v_type = 'move_stage' then
      v_stage := nullif(coalesce(v_params->>'stage_id',
                         v_payload #>> string_to_array(v_params->>'from_payload', '.')), '')::uuid;
      if v_stage is null then
        raise exception 'stage_required' using errcode = '22023';
      end if;
      select s.stage_type, pl.loss_reasons into v_stage_t, v_pl_loss
        from public.pipeline_stages_v2 s join public.pipelines pl on pl.id = s.pipeline_id
       where s.id = v_stage and s.pipeline_id = v_opp.pipeline_id
         and s.equipe_id = v_equipe and s.deleted_at is null;
      if v_stage_t is null then
        raise exception 'invalid_stage' using errcode = '22023';
      end if;
      -- A regra do motivo de perda vale para a automação como para a tela: sem
      -- motivo configurado a execução falha (não grava 'Não informado' calada).
      if v_stage_t = 'lost' and jsonb_typeof(v_pl_loss) = 'array' and jsonb_array_length(v_pl_loss) > 0
         and nullif(btrim(coalesce(v_params->>'lost_reason', '')), '') is null then
        raise exception 'loss_reason_required' using errcode = '22023';
      end if;
      if v_caller is not null then
        -- O motor único da interface.
        perform public.crm_move_opportunity(p_opportunity, v_stage, nullif(btrim(v_params->>'lost_reason'), ''));
      else
        -- Mesmo UPDATE da RPC (linha já travada acima); a rede de segurança preenche
        -- 'Não informado' só quando o pipeline não tem lista de motivos.
        update public.opportunities o
           set stage_id = v_stage,
               lost_reason = case when v_stage_t = 'lost'
                                  then coalesce(nullif(btrim(v_params->>'lost_reason'), ''), o.lost_reason)
                                  else o.lost_reason end
         where o.id = v_opp.id and o.stage_id is distinct from v_stage;
      end if;

    elsif v_type = 'set_responsible' then
      v_user := nullif(coalesce(v_params->>'user_id',
                        v_payload #>> string_to_array(v_params->>'from_payload', '.')), '')::uuid;
      if v_user is null then
        raise exception 'user_required' using errcode = '22023';
      end if;
      if v_caller is not null then
        perform public.crm_set_responsible(v_opp.lead_id, v_user);
      else
        if not exists (select 1 from public.profiles p where p.id = v_user and p.equipe_id = v_equipe) then
          raise exception 'owner_not_in_team' using errcode = '23514';
        end if;
        update public.leads l set responsible_id = v_user
         where l.id = v_opp.lead_id and l.equipe_id = v_equipe and l.responsible_id is distinct from v_user;
        update public.opportunities o set owner_id = v_user
         where o.lead_id = v_opp.lead_id and o.equipe_id = v_equipe and o.deleted_at is null
           and o.status = 'open' and o.owner_id is distinct from v_user;
      end if;

    elsif v_type = 'update_field' then
      v_field := v_params->>'field';
      -- O campo vem pelo key (ou field_id) e o valor mora em custom_data[field_id].
      select f into v_f
        from public.pipelines p, jsonb_array_elements(p.custom_fields_schema) f
       where p.id = v_opp.pipeline_id and jsonb_typeof(p.custom_fields_schema) = 'array'
         and not coalesce((f->>'is_deleted')::boolean, false)
         and (f->>'field_id' = v_field or f->>'key' = v_field)
       limit 1;
      if v_f is null then
        raise exception 'field_not_declared: %', coalesce(v_field, '') using errcode = '22023';
      end if;
      v_fid := v_f->>'field_id';
      v_ftype := v_f->>'type';
      v_value := case when v_params ? 'from_payload'
                      then v_payload #> string_to_array(v_params->>'from_payload', '.')
                      else v_params->'value' end;
      if v_params ? 'from_payload' and (v_value is null or v_value = 'null'::jsonb) then
        -- Campo ausente no payload: não apaga o que já está no negócio.
        update public.automation_runs set status = 'skipped', error = 'source_missing' where id = v_run;
        return jsonb_build_object('status', 'skipped', 'reason', 'source_missing', 'run_id', v_run);
      end if;
      -- Conferência mínima do tipo declarado (espelho enxuto de _shared/custom-fields.ts).
      if v_value is not null and v_value <> 'null'::jsonb then
        v_ok := case
          when v_ftype in ('number', 'currency') then (v_value #>> '{}') ~ '^-?[0-9]+([.][0-9]+)?$'
          when v_ftype = 'boolean' then jsonb_typeof(v_value) = 'boolean' or (v_value #>> '{}') in ('true', 'false')
          when v_ftype = 'date' then (v_value #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          when v_ftype = 'select' and jsonb_typeof(v_f->'options') = 'array' and jsonb_array_length(v_f->'options') > 0
            then v_f->'options' @> to_jsonb(v_value #>> '{}')
          else true end;
        if not v_ok then
          raise exception 'invalid_value_for_field: % (%)', v_field, v_ftype using errcode = '22023';
        end if;
      end if;
      update public.opportunities o
         set custom_data = coalesce(o.custom_data, '{}'::jsonb) || jsonb_build_object(v_fid, coalesce(v_value, 'null'::jsonb))
       where o.id = v_opp.id and o.equipe_id = v_equipe;

    elsif v_type = 'call_webhook' then
      -- Só webhooks feitos para ser disparados por regra: um webhook de evento comum
      -- (lead_created...) dispararia junto com todos os outros do mesmo evento.
      select w.id, w.trigger_event into v_hook
        from public.webhook_configs w
       where w.id = nullif(v_params->>'webhook_id', '')::uuid and w.equipe_id = v_equipe
         and w.inbound_function is null;
      if v_hook.id is null then
        raise exception 'webhook_not_found' using errcode = 'P0002';
      end if;
      if v_hook.trigger_event not like 'stage_entered:%' and v_hook.trigger_event not like 'automation:%' then
        raise exception 'webhook_not_linkable' using errcode = '22023';
      end if;
      perform public.enqueue_crm_webhooks(v_equipe, v_hook.trigger_event,
        jsonb_build_object('event', v_hook.trigger_event, 'created_at', now(),
                           'opportunity', jsonb_build_object('id', v_opp.id, 'pipeline_id', v_opp.pipeline_id,
                                                             'stage_id', v_opp.stage_id),
                           'payload', v_payload));
    else
      raise exception 'unknown_action: %', coalesce(v_type, '') using errcode = '22023';
    end if;

    update public.automation_runs set status = 'ok' where id = v_run;
    return jsonb_build_object('status', 'ok', 'run_id', v_run);
  exception when others then
    -- O bloco desfaz a ação; a execução fica registrada com o motivo.
    update public.automation_runs set status = 'error', error = left(sqlerrm, 500) where id = v_run;
    return jsonb_build_object('status', 'error', 'run_id', v_run, 'error', left(sqlerrm, 500));
  end;
end;
$$;

comment on function public.crm_run_automation(uuid, uuid, jsonb, text, jsonb, uuid) is
  'Sprint Suporte 1 · Onda 5: executes one automation action (move_stage | update_field | set_responsible | call_webhook) on an opportunity, reusing crm_move_opportunity / crm_set_responsible / the custom_data[field_id] contract / enqueue_crm_webhooks. Records an automation_runs row; idempotent per (automation, opportunity, event key). Never raises for an action failure: the run is recorded as error.';

revoke all on function public.crm_run_automation(uuid, uuid, jsonb, text, jsonb, uuid) from public, anon;
grant execute on function public.crm_run_automation(uuid, uuid, jsonb, text, jsonb, uuid) to authenticated, service_role;

-- ============================================================================
-- Gatilho: o negócio entrou numa etapa -> automações ligadas a ela
-- ============================================================================

create or replace function public.fn_run_stage_automations()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  a record;
begin
  for a in
    select x.id from public.crm_automations x
     where x.equipe_id = new.equipe_id and x.enabled
       and x.trigger->>'event' = 'stage_entered'
       and x.trigger->>'stage_id' = new.stage_id::text
  loop
    -- Uma automação que move etapa não dispara outra em cascata (evita laço A -> B -> A);
    -- a execução barrada fica registrada, para quem se pergunta por que não rodou.
    if pg_trigger_depth() > 1 then
      insert into public.automation_runs (automation_id, equipe_id, opportunity_id, status, error, input)
      values (a.id, new.equipe_id, new.id, 'skipped', 'cascade',
              jsonb_build_object('payload', jsonb_build_object('from_stage', old.stage_id, 'to_stage', new.stage_id)));
      continue;
    end if;
    -- crm_run_automation não levanta erro de ação; o que sobrar não pode travar a movimentação.
    begin
      perform public.crm_run_automation(a.id, new.id,
        jsonb_build_object('from_stage', old.stage_id, 'to_stage', new.stage_id),
        'stage_entered:' || new.stage_id::text || ':' || txid_current()::text);
    exception when others then
      raise warning 'fn_run_stage_automations: %', sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

revoke all on function public.fn_run_stage_automations() from public, anon, authenticated;

drop trigger if exists trg_opportunity_stage_automations on public.opportunities;
create trigger trg_opportunity_stage_automations
  after update of stage_id on public.opportunities
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function public.fn_run_stage_automations();

-- ============================================================================
-- Reenviar uma entrega de saída que falhou
-- ============================================================================
-- Cria a nova linha de log (o histórico da falha fica) com o MESMO payload já
-- renderizado e devolve o token do despachante. A entrega em si continua sendo de
-- deliver-crm-webhook (o cliente a invoca com log_id + token, como o enfileirador
-- faz via pg_net): nenhum segredo nem caminho de envio novo aqui.

create or replace function public.resend_webhook_delivery(p_log uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_equipe uuid;
  v_log    record;
  v_new    uuid;
  v_token  uuid := gen_random_uuid();
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select l.* into v_log from public.webhook_logs l
   where l.id = p_log and l.equipe_id = v_equipe and l.direction = 'outbound';
  if not found or v_log.webhook_config_id is null then
    raise exception 'log_not_found' using errcode = 'P0002';
  end if;
  -- Só o que falhou: entrega em andamento ou bem-sucedida não se repete.
  if v_log.error_message is null and not (v_log.response_status is not null and v_log.response_status >= 300) then
    raise exception 'delivery_not_failed' using errcode = '22023';
  end if;

  insert into public.webhook_logs (equipe_id, webhook_config_id, direction, event_type, payload, dispatch_token, response_body)
  values (v_equipe, v_log.webhook_config_id, 'outbound', v_log.event_type, v_log.payload, v_token,
          'Resend of ' || p_log::text)
  returning id into v_new;

  return jsonb_build_object('log_id', v_new, 'dispatch_token', v_token);
end;
$$;

revoke all on function public.resend_webhook_delivery(uuid) from public, anon;
grant execute on function public.resend_webhook_delivery(uuid) to authenticated;

commit;
