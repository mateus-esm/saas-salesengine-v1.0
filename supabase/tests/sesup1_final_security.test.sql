begin;
insert into public.equipes (id,nome,crm_link,suporte_link)
values ('5ef00000-0000-0000-0000-000000000001','Guard review','x','y');
insert into public.leads(id,equipe_id,name)
values ('5ef10000-0000-0000-0000-000000000001','5ef00000-0000-0000-0000-000000000001','Guard');
-- Simula o legado que fez a Onda 3 pular o índice único.
drop index if exists public.uq_conversations_active_lead_channel;
alter table public.conversations disable trigger trg_conversation_active_guard;
insert into public.conversations(id,equipe_id,lead_id,channel,status) values
('5ef20000-0000-0000-0000-000000000001','5ef00000-0000-0000-0000-000000000001','5ef10000-0000-0000-0000-000000000001','whatsapp','active'),
('5ef20000-0000-0000-0000-000000000002','5ef00000-0000-0000-0000-000000000001','5ef10000-0000-0000-0000-000000000001','whatsapp','active');
alter table public.conversations enable trigger trg_conversation_active_guard;
do $$ begin
  begin
    insert into public.conversations(equipe_id,lead_id,channel,status)
    values ('5ef00000-0000-0000-0000-000000000001','5ef10000-0000-0000-0000-000000000001','whatsapp','active');
    raise exception 'guard accepted a third active conversation';
  exception when unique_violation then null; end;
  assert (select count(*) from public.conversations where lead_id='5ef10000-0000-0000-0000-000000000001') = 2;
end $$;
-- Alterações normais e arquivamento do legado continuam funcionando.
update public.conversations set unread_count=2 where id='5ef20000-0000-0000-0000-000000000001';
update public.conversations set status='archived' where id='5ef20000-0000-0000-0000-000000000002';
do $$ begin
  begin
    update public.conversations set status='active' where id='5ef20000-0000-0000-0000-000000000002';
    raise exception 'guard reopened a duplicate';
  exception when unique_violation then null; end;
  assert not has_function_privilege('anon','public.fn_conversation_active_guard()','execute');
  assert not has_function_privilege('authenticated','public.crm_assign_next(public.opportunities)','execute');
  assert not has_function_privilege('authenticated','public._crm_intake_submit(text,jsonb,text)','execute');
  assert not has_function_privilege('anon','public.crm_run_automation(uuid,uuid,jsonb,text,jsonb,uuid)','execute');
  assert (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.crm_forms'::regclass,'public.crm_form_submissions'::regclass,
    'public.crm_automations'::regclass,'public.automation_runs'::regclass,
    'public.pipeline_distribution'::regclass,'public.pipeline_distribution_runs'::regclass,
    'public.ai_model_catalog'::regclass,'public.ai_model_catalog_state'::regclass));
  assert (select qual not like '%owner%' from pg_policies where tablename='ai_model_catalog' and policyname='admin_read_ai_model_catalog');
end $$;
rollback;
select 'PASS' as result;
