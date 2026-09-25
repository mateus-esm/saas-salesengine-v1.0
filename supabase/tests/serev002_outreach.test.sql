-- SE-REV-002 — testes do motor de outreach em PostgreSQL 15 local.
-- O runner aplica stubs.sql antes deste arquivo e expande os includes abaixo.

-- @include supabase/migrations/20260925000100_serev001_start_conversation.sql
-- @include supabase/migrations/20260926000050_serev002_opener_entry_filter.sql
-- @include supabase/migrations/20260926000100_serev002_outreach.sql

insert into public.equipes (id, nome) values
  ('52000000-0000-0000-0000-000000000001', 'Equipe A'),
  ('52000000-0000-0000-0000-000000000002', 'Equipe B');
insert into public.profiles (id, equipe_id) values
  ('52000000-0000-0000-0000-000000000101', '52000000-0000-0000-0000-000000000001');
insert into public.conversation_opener_settings (equipe_id) values
  ('52000000-0000-0000-0000-000000000001'),
  ('52000000-0000-0000-0000-000000000002');
insert into public.pipelines (id, equipe_id, name) values
  ('52000000-0000-0000-0000-000000000201', '52000000-0000-0000-0000-000000000001', 'Funil');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position) values
  ('52000000-0000-0000-0000-000000000301', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000201', 'Entrada', 0),
  ('52000000-0000-0000-0000-000000000302', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000201', 'Contato', 1);
insert into public.crm_entries (id, equipe_id, kind, name) values
  ('52000000-0000-0000-0000-000000000401', '52000000-0000-0000-0000-000000000001', 'webhook', 'Porta certa'),
  ('52000000-0000-0000-0000-000000000402', '52000000-0000-0000-0000-000000000001', 'manual', 'Porta errada');
insert into public.leads (id, equipe_id, name, phone) values
  ('52000000-0000-0000-0000-000000000501', '52000000-0000-0000-0000-000000000001', 'Lead T1', '11999990001'),
  ('52000000-0000-0000-0000-000000000502', '52000000-0000-0000-0000-000000000001', 'Lead T2', '11999990002'),
  ('52000000-0000-0000-0000-000000000503', '52000000-0000-0000-0000-000000000001', 'Lead T4', '11999990003'),
  ('52000000-0000-0000-0000-000000000504', '52000000-0000-0000-0000-000000000001', 'Lead T5', '11999990004'),
  ('52000000-0000-0000-0000-000000000505', '52000000-0000-0000-0000-000000000001', 'Lead T6', '11999990005'),
  ('52000000-0000-0000-0000-000000000506', '52000000-0000-0000-0000-000000000001', 'Lead T7 due', '11999990006'),
  ('52000000-0000-0000-0000-000000000507', '52000000-0000-0000-0000-000000000001', 'Lead T7 future', '11999990007'),
  ('52000000-0000-0000-0000-000000000508', '52000000-0000-0000-0000-000000000001', 'Lead T7 reply', '11999990008'),
  ('52000000-0000-0000-0000-000000000509', '52000000-0000-0000-0000-000000000001', 'Lead T7 optout', '11999990009'),
  ('52000000-0000-0000-0000-000000000510', '52000000-0000-0000-0000-000000000001', 'Lead T8', '11999990010'),
  ('52000000-0000-0000-0000-000000000511', '52000000-0000-0000-0000-000000000001', 'Lead T9', '11999990011'),
  ('52000000-0000-0000-0000-000000000512', '52000000-0000-0000-0000-000000000001', 'Lead T10', '11999990012');

-- T1: porta certa materializa dois jobs nos offsets; errada e array vazio não.
insert into public.cadence_sequences
  (id, equipe_id, name, active, trigger_event, trigger_entry_ids)
values
  ('52000000-0000-0000-0000-000000000601', '52000000-0000-0000-0000-000000000001', 'T1 certa', true, 'lead_intake', array['52000000-0000-0000-0000-000000000401']::uuid[]),
  ('52000000-0000-0000-0000-000000000602', '52000000-0000-0000-0000-000000000001', 'T1 vazia', true, 'lead_intake', '{}');
insert into public.cadence_steps (sequence_id, equipe_id, position, offset_minutes, message_template) values
  ('52000000-0000-0000-0000-000000000601', '52000000-0000-0000-0000-000000000001', 0, 0, 'Olá'),
  ('52000000-0000-0000-0000-000000000601', '52000000-0000-0000-0000-000000000001', 1, 60, 'Follow-up');
insert into public.lead_touches (id, equipe_id, lead_id, entry_id, occurred_at) values
  ('52000000-0000-0000-0000-000000000701', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000501', '52000000-0000-0000-0000-000000000401', clock_timestamp());
insert into public.lead_touches (id, equipe_id, lead_id, entry_id, occurred_at) values
  ('52000000-0000-0000-0000-000000000702', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000502', '52000000-0000-0000-0000-000000000402', clock_timestamp());
do $$ declare e public.cadence_enrollments; begin
  select * into strict e from public.cadence_enrollments where sequence_id = '52000000-0000-0000-0000-000000000601';
  assert (select count(*) from public.outreach_jobs where enrollment_id = e.id) = 2, 'T1: deveria materializar 2 jobs';
  assert (select extract(epoch from (max(run_after) - min(run_after)))::int from public.outreach_jobs where enrollment_id = e.id) = 3600,
    'T1: offsets deveriam partir do início da inscrição';
  assert not exists (select 1 from public.cadence_enrollments where sequence_id = '52000000-0000-0000-0000-000000000602'),
    'T1: array vazio não deve inscrever';
  assert not exists (select 1 from public.cadence_enrollments where lead_id = '52000000-0000-0000-0000-000000000502'),
    'T1: porta errada não deve inscrever';
end $$;

-- T2: once_per_lead não reinscreve; per_event reinscreve só após encerrar a ativa.
insert into public.cadence_sequences
  (id, equipe_id, name, active, trigger_event, trigger_entry_ids, reenroll)
values
  ('52000000-0000-0000-0000-000000000603', '52000000-0000-0000-0000-000000000001', 'T2 once', true, 'lead_intake', array['52000000-0000-0000-0000-000000000401']::uuid[], 'once_per_lead'),
  ('52000000-0000-0000-0000-000000000604', '52000000-0000-0000-0000-000000000001', 'T2 event', true, 'lead_intake', array['52000000-0000-0000-0000-000000000401']::uuid[], 'per_event');
insert into public.cadence_steps (sequence_id, equipe_id, position, offset_minutes, message_template) values
  ('52000000-0000-0000-0000-000000000603', '52000000-0000-0000-0000-000000000001', 0, 0, 'once'),
  ('52000000-0000-0000-0000-000000000604', '52000000-0000-0000-0000-000000000001', 0, 0, 'event');
insert into public.lead_touches (id, equipe_id, lead_id, entry_id) values
  ('52000000-0000-0000-0000-000000000703', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000502', '52000000-0000-0000-0000-000000000401'),
  ('52000000-0000-0000-0000-000000000704', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000502', '52000000-0000-0000-0000-000000000401');
do $$ begin
  assert (select count(*) from public.cadence_enrollments where sequence_id = '52000000-0000-0000-0000-000000000603') = 1,
    'T2: once_per_lead duplicou';
  assert (select count(*) from public.cadence_enrollments where sequence_id = '52000000-0000-0000-0000-000000000604') = 1,
    'T2: per_event não pode ter duas inscrições ativas';
end $$;
update public.cadence_enrollments set status = 'completed', finished_at = clock_timestamp()
 where sequence_id = '52000000-0000-0000-0000-000000000604';
insert into public.lead_touches (id, equipe_id, lead_id, entry_id) values
  ('52000000-0000-0000-0000-000000000705', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000502', '52000000-0000-0000-0000-000000000401');
do $$ begin
  assert (select count(*) from public.cadence_enrollments where sequence_id = '52000000-0000-0000-0000-000000000604') = 2,
    'T2: per_event deveria reinscrever depois de concluir';
end $$;

-- T3: o banco barra job duplicado do mesmo passo.
do $$ declare j public.outreach_jobs; duplicated boolean := false; begin
  select * into j from public.outreach_jobs limit 1;
  begin
    insert into public.outreach_jobs (equipe_id, enrollment_id, step_id, step_position, lead_id, run_after)
      values (j.equipe_id, j.enrollment_id, j.step_id, j.step_position, j.lead_id, j.run_after);
  exception when unique_violation then duplicated := true;
  end;
  assert duplicated, 'T3: UNIQUE enrollment+position não barrou duplicação';
end $$;

-- T4: customer cancela; agent não cancela.
insert into public.cadence_sequences (id, equipe_id, name, active, trigger_event, trigger_entry_ids)
 values ('52000000-0000-0000-0000-000000000605', '52000000-0000-0000-0000-000000000001', 'T4', true, 'lead_intake', '{}');
insert into public.cadence_steps (sequence_id, equipe_id, position, offset_minutes, message_template)
 values ('52000000-0000-0000-0000-000000000605', '52000000-0000-0000-0000-000000000001', 0, 0, 't4');
select public._outreach_enroll('52000000-0000-0000-0000-000000000605', '52000000-0000-0000-0000-000000000503', null, 'api:t4', null);
insert into public.messages (lead_id, content, sender_type) values
 ('52000000-0000-0000-0000-000000000503', 'agente', 'agent');
do $$ begin
  assert exists (select 1 from public.cadence_enrollments where lead_id = '52000000-0000-0000-0000-000000000503' and status = 'active'),
    'T4: mensagem agent cancelou';
end $$;
insert into public.messages (lead_id, content, sender_type, created_at) values
 ('52000000-0000-0000-0000-000000000503', 'resposta', 'customer', clock_timestamp() + interval '1 second');
do $$ begin
  assert exists (select 1 from public.cadence_enrollments where lead_id = '52000000-0000-0000-0000-000000000503' and status = 'cancelled' and cancel_reason = 'lead_replied'),
    'T4: customer não cancelou';
  assert exists (select 1 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000503' and status = 'cancelled'),
    'T4: job queued não foi cancelado';
end $$;

-- T5: igualdade normalizada gera opt-out; frase que contém a palavra não gera.
insert into public.cadence_sequences (id, equipe_id, name, active, trigger_event, trigger_entry_ids)
 values ('52000000-0000-0000-0000-000000000606', '52000000-0000-0000-0000-000000000001', 'T5', true, 'lead_intake', '{}');
insert into public.cadence_steps (sequence_id, equipe_id, position, offset_minutes, message_template)
 values ('52000000-0000-0000-0000-000000000606', '52000000-0000-0000-0000-000000000001', 0, 0, 't5');
select public._outreach_enroll('52000000-0000-0000-0000-000000000606', '52000000-0000-0000-0000-000000000504', null, 'api:t5', null);
insert into public.messages (lead_id, content, sender_type, created_at) values
 ('52000000-0000-0000-0000-000000000504', 'não quero parar', 'customer', clock_timestamp() + interval '1 second');
do $$ begin
  assert not exists (select 1 from public.contact_opt_outs where lead_id = '52000000-0000-0000-0000-000000000504'),
    'T5: frase contendo parar virou opt-out';
end $$;
-- Nova inscrição para provar o opt-out sem depender da anterior, cancelada por resposta.
update public.cadence_enrollments set status = 'completed', cancel_reason = null where sequence_id = '52000000-0000-0000-0000-000000000606';
select public._outreach_enroll('52000000-0000-0000-0000-000000000606', '52000000-0000-0000-0000-000000000504', null, 'api:t5b', null);
insert into public.messages (lead_id, content, sender_type, created_at) values
 ('52000000-0000-0000-0000-000000000504', '  SAÍR!!! ', 'customer', clock_timestamp() + interval '2 seconds');
do $$ begin
  assert exists (select 1 from public.contact_opt_outs where lead_id = '52000000-0000-0000-0000-000000000504' and reason = 'keyword'),
    'T5: SAIR normalizado não gerou opt-out';
  assert exists (select 1 from public.cadence_enrollments where enrollment_key = 'api:t5b' and status = 'cancelled' and cancel_reason = 'opted_out'),
    'T5: opt-out não cancelou';
end $$;

-- T6: mudança de etapa cancela a antiga e inscreve na nova.
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
 ('52000000-0000-0000-0000-000000000801', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000505', '52000000-0000-0000-0000-000000000201', '52000000-0000-0000-0000-000000000301');
insert into public.cadence_sequences
 (id, equipe_id, name, active, trigger_event, trigger_stage_id, reenroll) values
 ('52000000-0000-0000-0000-000000000607', '52000000-0000-0000-0000-000000000001', 'T6 antiga', true, 'stage_entered', '52000000-0000-0000-0000-000000000301', 'per_event'),
 ('52000000-0000-0000-0000-000000000608', '52000000-0000-0000-0000-000000000001', 'T6 nova', true, 'stage_entered', '52000000-0000-0000-0000-000000000302', 'per_event');
insert into public.cadence_steps (sequence_id, equipe_id, position, offset_minutes, message_template) values
 ('52000000-0000-0000-0000-000000000607', '52000000-0000-0000-0000-000000000001', 0, 30, 'antiga'),
 ('52000000-0000-0000-0000-000000000608', '52000000-0000-0000-0000-000000000001', 0, 30, 'nova');
select public._outreach_enroll('52000000-0000-0000-0000-000000000607', '52000000-0000-0000-0000-000000000505', '52000000-0000-0000-0000-000000000801', 'stage_history:old', null);
update public.opportunities set stage_id = '52000000-0000-0000-0000-000000000302' where id = '52000000-0000-0000-0000-000000000801';
do $$ begin
  assert exists (select 1 from public.cadence_enrollments where sequence_id = '52000000-0000-0000-0000-000000000607' and status = 'cancelled' and cancel_reason = 'stage_changed'),
    'T6: sequência da etapa antiga não cancelou';
  assert exists (select 1 from public.cadence_enrollments where sequence_id = '52000000-0000-0000-0000-000000000608' and status = 'active'),
    'T6: sequência da etapa nova não inscreveu';
end $$;

-- Sequência auxiliar para T7–T10.
insert into public.cadence_sequences (id, equipe_id, name, active, trigger_event, trigger_entry_ids)
 values ('52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000001', 'Fila', true, 'lead_intake', '{}');
insert into public.cadence_steps (id, sequence_id, equipe_id, position, offset_minutes, message_template)
 values ('52000000-0000-0000-0000-000000000901', '52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000001', 0, 0, 'fila');

-- T7: claim só pega vencido e revalida cancelamento, resposta e opt-out.
select public._outreach_enroll('52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000506', null, 'api:due', null);
select public._outreach_enroll('52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000507', null, 'api:future', null);
select public._outreach_enroll('52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000508', null, 'api:reply', null);
select public._outreach_enroll('52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000509', null, 'api:optout', null);
update public.outreach_jobs set run_after = clock_timestamp() + interval '1 hour' where lead_id = '52000000-0000-0000-0000-000000000507';
alter table public.messages disable trigger trg_messages_outreach_cancel;
insert into public.messages (lead_id, content, sender_type, created_at) values
 ('52000000-0000-0000-0000-000000000508', 'resposta sem gatilho', 'customer', clock_timestamp() + interval '1 second');
alter table public.messages enable trigger trg_messages_outreach_cancel;
insert into public.contact_opt_outs (equipe_id, phone_normalized, lead_id, reason) values
 ('52000000-0000-0000-0000-000000000001', public.normalize_phone_br('11999990009'), '52000000-0000-0000-0000-000000000509', 'manual');
create temporary table t7_claim as select * from public.crm_outreach_claim(20);
do $$ begin
  assert exists (select 1 from t7_claim where lead_id = '52000000-0000-0000-0000-000000000506'), 'T7: vencido não foi reivindicado';
  assert not exists (select 1 from t7_claim where lead_id = '52000000-0000-0000-0000-000000000507'), 'T7: futuro foi reivindicado';
  assert exists (select 1 from public.cadence_enrollments where lead_id = '52000000-0000-0000-0000-000000000508' and status = 'cancelled' and cancel_reason = 'lead_replied'),
    'T7: garantia do claim não detectou resposta';
  assert exists (select 1 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000509' and status = 'skipped' and skip_reason = 'opted_out'),
    'T7: opt-out não virou skipped';
end $$;

-- T8: running abandonado vira unknown, nunca queued.
select public._outreach_enroll('52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000510', null, 'api:stale', null);
update public.outreach_jobs set status = 'running', attempts = 1, claimed_at = clock_timestamp() - interval '6 minutes'
 where lead_id = '52000000-0000-0000-0000-000000000510';
select count(*) from public.crm_outreach_claim(20);
do $$ begin
  assert exists (select 1 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000510' and status = 'unknown'),
    'T8: running abandonado não virou unknown';
end $$;

-- T9: retryable espera attempts²; terceira tentativa termina failed e conclui.
select public._outreach_enroll('52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000511', null, 'api:retry', null);
update public.outreach_jobs set status = 'running', attempts = 1, claimed_at = clock_timestamp()
 where lead_id = '52000000-0000-0000-0000-000000000511';
select public.crm_outreach_finish(id, 'failed', '503', null, true)
 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000511';
do $$ begin
  assert exists (select 1 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000511' and status = 'queued'
                  and run_after between clock_timestamp() + interval '50 seconds' and clock_timestamp() + interval '70 seconds'),
    'T9: primeira espera não foi 1 minuto';
end $$;
update public.outreach_jobs set status = 'running', attempts = 2, claimed_at = clock_timestamp()
 where lead_id = '52000000-0000-0000-0000-000000000511';
select public.crm_outreach_finish(id, 'failed', '503', null, true)
 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000511';
do $$ begin
  assert exists (select 1 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000511' and status = 'queued'
                  and run_after between clock_timestamp() + interval '230 seconds' and clock_timestamp() + interval '250 seconds'),
    'T9: segunda espera não foi 4 minutos';
end $$;
update public.outreach_jobs set status = 'running', attempts = 3, claimed_at = clock_timestamp()
 where lead_id = '52000000-0000-0000-0000-000000000511';
select public.crm_outreach_finish(id, 'failed', '503', null, true)
 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000511';
do $$ begin
  assert exists (select 1 from public.outreach_jobs where lead_id = '52000000-0000-0000-0000-000000000511' and status = 'failed'),
    'T9: terceira tentativa deveria ficar failed';
  assert exists (select 1 from public.cadence_enrollments where lead_id = '52000000-0000-0000-0000-000000000511' and status = 'completed'),
    'T9: último job não concluiu a inscrição';
end $$;

-- T10: erro dentro do gatilho é isolado e não impede inserir a mensagem.
select public._outreach_enroll('52000000-0000-0000-0000-000000000609', '52000000-0000-0000-0000-000000000512', null, 'api:trigger-failure', null);
alter table public.cadence_enrollments add constraint t10_never_cancel check (status <> 'cancelled') not valid;
insert into public.messages (id, lead_id, content, sender_type, created_at) values
 ('52000000-0000-0000-0000-000000000a01', '52000000-0000-0000-0000-000000000512', 'resposta', 'customer', clock_timestamp() + interval '1 second');
do $$ begin
  assert exists (select 1 from public.messages where id = '52000000-0000-0000-0000-000000000a01'),
    'T10: falha no gatilho derrubou o INSERT de origem';
end $$;
alter table public.cadence_enrollments drop constraint t10_never_cancel;

-- T11: RLS ligada, políticas de leitura existem e authenticated não executa RPCs internas.
do $$ declare t text; begin
  foreach t in array array['cadence_sequences','cadence_steps','cadence_enrollments','outreach_jobs','contact_opt_outs'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), 'T11: RLS desligada em ' || t;
    assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT'),
      'T11: sem política SELECT em ' || t;
  end loop;
  assert not has_function_privilege('authenticated', 'public.crm_outreach_claim(integer)', 'execute'),
    'T11: authenticated pode executar claim';
  assert not has_function_privilege('authenticated', 'public._outreach_tick()', 'execute'),
    'T11: authenticated pode executar tick';
end $$;

-- T12: sem vencido, tick retorna null e não chama pg_net.
update public.outreach_jobs set run_after = clock_timestamp() + interval '1 day' where status = 'queued';
truncate table net._calls;
do $$ declare r bigint; begin
  r := public._outreach_tick();
  assert r is null, 'T12: tick sem vencido deveria retornar null';
  assert (select count(*) from net._calls) = 0, 'T12: tick sem vencido chamou pg_net';
end $$;

select 'PASS' as result;
