alter table public.crm_automations
  drop constraint crm_automations_trigger_event,
  add constraint crm_automations_trigger_event check (jsonb_typeof(trigger) = 'object' and
    trigger->>'event' in ('stage_entered','webhook_received','button_clicked','outreach_sent','outreach_failed','outreach_unknown')),
  drop constraint crm_automations_action_type,
  add constraint crm_automations_action_type check (jsonb_typeof(action) = 'object' and
    action->>'type' in ('move_stage','update_field','set_responsible','call_webhook','notify_team'));

create unique index uq_automation_runs_without_deal on public.automation_runs (automation_id,event_key)
  where opportunity_id is null and automation_id is not null and event_key is not null and status <> 'error';

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
  v_trigger  text;
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
    select a.equipe_id, a.action, a.enabled, a.trigger->>'event' into v_equipe_a, v_action, v_enabled, v_trigger
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
  if not found and not (p_opportunity is null and coalesce(v_trigger in ('outreach_sent','outreach_failed','outreach_unknown'), false)) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  -- Idempotência: o mesmo evento não roda duas vezes para o mesmo negócio.
  insert into public.automation_runs (automation_id, equipe_id, opportunity_id, status, input, event_key)
  values (v_aid, v_equipe, p_opportunity, 'running',
          jsonb_build_object('action', v_action, 'payload', v_payload), p_event_key)
  on conflict do nothing
  returning id into v_run;
  if v_run is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_ran');
  end if;

  begin
    if not v_enabled then
      raise exception 'automation_disabled' using errcode = '22023';
    end if;

    if p_opportunity is null and v_type not in ('notify_team','call_webhook') then
      update public.automation_runs set status = 'skipped', error = 'opportunity_required' where id = v_run;
      return jsonb_build_object('status','skipped','reason','opportunity_required');
    end if;

    if v_type = 'notify_team' then
      insert into public.notifications (equipe_id, user_id, type, title, body, data)
      select v_equipe, p.user_id, 'automation.team',
             coalesce(nullif(btrim(v_params->>'message'), ''), 'Atualização no CRM'),
             coalesce(l.name, v_payload->>'lead_name'),
             jsonb_build_object('run_id', v_run, 'opportunity_id', p_opportunity)
        from public.profiles p
        left join public.leads l on l.id = v_opp.lead_id and l.equipe_id = v_equipe
       where p.equipe_id = v_equipe and p.user_id is not null;
    elsif v_type = 'move_stage' then
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

create or replace function public.dispatch_outreach_job_automations()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rule record;
  deal_id uuid;
  context jsonb;
  event_name text := 'outreach_' || new.status;
begin
  for rule in select id from public.crm_automations
               where equipe_id = new.equipe_id and enabled and trigger->>'event' = event_name
  loop
    begin
      select coalesce(e.opportunity_id, f.opportunity_id),
             jsonb_build_object('event', event_name, 'job_id', new.id, 'lead_id', l.id,
               'lead_name', l.name, 'phone', l.phone, 'status', new.status,
               'enrollment_id', new.enrollment_id, 'sequence_id', e.sequence_id,
               'followup_id', new.followup_id, 'step_position', new.step_position)
        into deal_id, context from public.leads l
        left join public.cadence_enrollments e on e.id = new.enrollment_id and e.equipe_id = l.equipe_id and e.lead_id = l.id
        left join public.crm_followups f on f.id = new.followup_id and f.equipe_id = l.equipe_id and f.lead_id = l.id
       where l.id = new.lead_id and l.equipe_id = new.equipe_id and l.deleted_at is null;
      if found then
        perform public.crm_run_automation(rule.id, deal_id, context, event_name || ':' || new.id);
      end if;
    exception when others then
      insert into public.automation_runs(automation_id,equipe_id,status,error,input)
      values (rule.id,new.equipe_id,'error',left(sqlerrm,500),jsonb_build_object('job_id',new.id));
    end;
  end loop;
  return new;
end;
$$;
revoke all on function public.dispatch_outreach_job_automations() from public, anon, authenticated;
create trigger outreach_job_automations after update of status on public.outreach_jobs
  for each row when (old.status is distinct from new.status and new.status in ('sent','failed','unknown'))
  execute function public.dispatch_outreach_job_automations();
