alter table public.webhook_configs add column outreach_recipients jsonb;

create table public.crm_workflows (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  event text not null check (event in ('stage_entered','button_clicked')),
  trigger_id text not null,
  action_ids uuid[] not null check (cardinality(action_ids) > 0),
  enabled boolean not null default true
);
create index crm_workflows_event on public.crm_workflows(equipe_id,event,trigger_id) where enabled;
alter table public.crm_workflows enable row level security;
grant select,insert,update,delete on public.crm_workflows to authenticated;
create policy team_workflows on public.crm_workflows for all to authenticated
using (equipe_id in (select equipe_id from public.profiles where user_id=(select auth.uid())))
with check (equipe_id in (select equipe_id from public.profiles where user_id=(select auth.uid())));

create function public.validate_crm_workflow() returns trigger language plpgsql set search_path=public as $$
begin
  if (select count(*) from webhook_configs c where c.equipe_id=new.equipe_id
        and c.id=any(new.action_ids) and c.inbound_function is null
        and c.trigger_event in ('stage_entered:'||c.id,'automation:'||c.id,'outreach_event:'||c.id))
     <> cardinality(new.action_ids) then raise exception 'Ações duplicadas ou indisponíveis'; end if;
  if new.event='stage_entered' and not exists (select 1 from pipeline_stages_v2 s where s.id::text=new.trigger_id
      and s.equipe_id=new.equipe_id and s.deleted_at is null) then raise exception 'Etapa indisponível'; end if;
  if new.enabled and new.event='stage_entered' and exists (
    select 1 from pipeline_stages_v2 s cross join lateral jsonb_array_elements(s.webhook_triggers) link
    where s.id::text=new.trigger_id and s.equipe_id=new.equipe_id and link->>'event'='on_stage_entered'
      and link->>'webhook_id' in (select unnest(new.action_ids)::text)
  ) then raise exception 'Este webhook já está vinculado diretamente à etapa'; end if;
  if new.event='button_clicked' and not exists (select 1 from webhook_configs c where
       c.equipe_id=new.equipe_id and c.trigger_event='artifact_action:'||new.trigger_id) then raise exception 'Botão indisponível'; end if;
  return new;
end $$;
create trigger validate_crm_workflow before insert or update on public.crm_workflows
for each row execute function public.validate_crm_workflow();

-- Keep the native delivery lookup one-to-one with the configuration selected in the editor.
alter table public.webhook_configs add constraint outreach_event_shape check (
  case when starts_with(trigger_event,'outreach_event:') then
    trigger_event='outreach_event:'||id and inbound_function is null and
    url ~ '^rev://whatsapp/[0-9a-f-]{36}$' and
    coalesce(jsonb_typeof(outreach_recipients)='object' and jsonb_typeof(outreach_recipients->'phones')='array'
      and jsonb_typeof(payload_template->'text')='string' and btrim(payload_template->>'text')<>'' and
      payload_template->>'number'='{{recipient}}',false)
  else outreach_recipients is null end);

create function public.dispatch_crm_workflows() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  kind text;
  trigger_key text;
  event_key text;
  deal uuid;
  payload jsonb;
  context jsonb;
  workflow crm_workflows;
  action_id uuid;
  hook webhook_configs;
  recipient text;
  run uuid;
  sent integer;
begin
  if tg_table_name='opportunities' then
    kind := 'stage_entered'; trigger_key := new.stage_id::text; deal := new.id;
    event_key := new.stage_id::text||':'||txid_current();
  else
    kind := 'button_clicked'; trigger_key := new.action_id; event_key := new.id::text;
    select opportunity_id into deal from custom_table_records where id=new.record_id and equipe_id=new.equipe_id and deleted_at is null;
  end if;
  if deal is null then return new; end if;
  for workflow in select * from crm_workflows where equipe_id=new.equipe_id and enabled and event=kind and trigger_id=trigger_key loop
    foreach action_id in array workflow.action_ids loop
      insert into automation_runs(equipe_id,opportunity_id,event_key,input)
      values(new.equipe_id,deal,'workflow:'||workflow.id||':'||action_id||':'||event_key,
             jsonb_build_object('workflow',workflow.name,'workflow_id',workflow.id,'action_id',action_id))
      on conflict do nothing returning id into run;
      if run is null then continue; end if;
      begin
        select * into strict hook from webhook_configs c where c.id=action_id and c.equipe_id=new.equipe_id
          and c.inbound_function is null and c.trigger_event in ('stage_entered:'||c.id,'automation:'||c.id,'outreach_event:'||c.id);
        if not hook.active then
          update automation_runs set status='skipped',error='action_disabled' where id=run;
          continue;
        end if;
        if payload is null then
          select public._crm_deal_won_payload(o.id,auth.uid()) into strict payload from opportunities o
            where o.id=deal and o.equipe_id=new.equipe_id and o.deleted_at is null;
          -- Only a won stage gets the legacy deal_won envelope expected by Solo Pro.
          if kind='button_clicked' or not exists(select 1 from pipeline_stages_v2 s where s.id::text=trigger_key and s.stage_type='won') then
            payload := (payload-'button') || jsonb_build_object('event',kind);
          end if;
          context := jsonb_build_object('payload',payload,'event',kind,'created_at',now(),
                                        'opportunity',jsonb_build_object('id',deal));
        end if;
        sent := 0;
        if starts_with(hook.trigger_event,'outreach_event:') then
          for recipient in
            with candidates(phone, international) as (
              select jsonb_array_elements_text(hook.outreach_recipients->'phones'), true
              union all select telefone, false from profiles where equipe_id=new.equipe_id and user_id is not null and (hook.outreach_recipients->>'team')::boolean
              union all select payload#>>'{data,telefone}', false where (hook.outreach_recipients->>'lead')::boolean
            ), digits as (select regexp_replace(phone,'[^0-9]','','g') n, international or ltrim(phone) like '+%' as has_ddi from candidates)
            select distinct case when not has_ddi and length(n) in (10,11) then '55'||n else n end from digits where length(n) between 10 and 15
          loop
            perform enqueue_crm_webhooks(new.equipe_id,hook.trigger_event,context||jsonb_build_object('recipient',recipient));
            sent := sent+1;
          end loop;
          if sent=0 then raise exception 'Nenhum destinatário com telefone'; end if;
        else
          perform enqueue_crm_webhooks(new.equipe_id,hook.trigger_event,context);
        end if;
        update automation_runs set status='ok' where id=run;
      exception when others then
        update automation_runs set status='error',error=left(sqlerrm,500) where id=run;
      end;
    end loop;
  end loop;
  return new;
end $$;
revoke all on function public.dispatch_crm_workflows() from public,anon,authenticated;
create trigger workflow_stage after update of stage_id on public.opportunities for each row
when (old.stage_id is distinct from new.stage_id and new.deleted_at is null)
execute function public.dispatch_crm_workflows();
create trigger workflow_button after insert on public.artifact_action_runs for each row
execute function public.dispatch_crm_workflows();
