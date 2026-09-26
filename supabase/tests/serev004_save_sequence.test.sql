-- SE-REV-004 — crm_outreach_save_sequence em PostgreSQL 15 local.
-- O runner aplica stubs.sql antes deste arquivo e expande os includes abaixo.

-- @include supabase/migrations/20260925000100_serev001_start_conversation.sql
-- @include supabase/migrations/20260926000050_serev002_opener_entry_filter.sql
-- @include supabase/migrations/20260926000100_serev002_outreach.sql
-- @include supabase/migrations/20260926000200_serev004_save_sequence_atomic.sql

insert into public.equipes (id, nome) values
  ('54000000-0000-0000-0000-000000000001', 'Equipe A'),
  ('54000000-0000-0000-0000-000000000002', 'Equipe B');
insert into public.crm_entries (id, equipe_id, kind, name) values
  ('54000000-0000-0000-0000-000000000401', '54000000-0000-0000-0000-000000000001', 'manual', 'Manual'),
  ('54000000-0000-0000-0000-000000000402', '54000000-0000-0000-0000-000000000001', 'webhook', 'Meta ADS - Cadastro');
insert into public.leads (id, equipe_id, name, phone) values
  ('54000000-0000-0000-0000-000000000501', '54000000-0000-0000-0000-000000000001', 'Lead', '11999990001');

create temp table t_ids (k text primary key, id uuid);

-- T1: sem id cria sequência e passos, e devolve o que gravou.
do $$ declare r jsonb; begin
  r := public.crm_outreach_save_sequence(
    '54000000-0000-0000-0000-000000000001',
    '{"name":"Novo Lead","active":true,"trigger_event":"lead_intake","trigger_entry_ids":["54000000-0000-0000-0000-000000000401"]}',
    '[{"position":0,"offset_minutes":0,"message_template":"Oi"},{"position":1,"offset_minutes":60,"message_template":"Tudo bem?"}]');
  insert into t_ids values ('seq', (r->>'id')::uuid);
  assert (select count(*) from public.cadence_sequences) = 1, 'T1: deveria existir 1 sequência';
  assert jsonb_array_length(r->'steps') = 2, 'T1: resposta deveria trazer 2 passos';
  assert r->'trigger_entry_ids' = '["54000000-0000-0000-0000-000000000401"]'::jsonb, 'T1: porta gravada errada';
end $$;

-- T2: com id EDITA a mesma linha (não cria outra), troca a porta e o texto,
-- e desativa o passo removido.
update public.cadence_sequences set updated_at = now() - interval '1 hour';
do $$ declare r jsonb; v uuid := (select id from t_ids where k = 'seq'); begin
  r := public.crm_outreach_save_sequence(
    '54000000-0000-0000-0000-000000000001',
    jsonb_build_object('id', v, 'name', 'Novo Lead - Meta ADS (Cadastro)', 'active', true,
      'trigger_event', 'lead_intake', 'trigger_entry_ids', jsonb_build_array('54000000-0000-0000-0000-000000000402')),
    '[{"position":0,"offset_minutes":0,"message_template":"Oi, editado"}]');
  assert (select count(*) from public.cadence_sequences) = 1, 'T2: edição criou outra sequência';
  assert (r->>'id')::uuid = v, 'T2: id mudou';
  assert (select name from public.cadence_sequences where id = v) = 'Novo Lead - Meta ADS (Cadastro)', 'T2: nome não gravou';
  assert (select trigger_entry_ids from public.cadence_sequences where id = v) = array['54000000-0000-0000-0000-000000000402']::uuid[],
    'T2: porta não gravou';
  assert (select updated_at > created_at from public.cadence_sequences where id = v), 'T2: updated_at não andou';
  assert (select message_template from public.cadence_steps where sequence_id = v and position = 0) = 'Oi, editado', 'T2: texto não gravou';
  assert (select active from public.cadence_steps where sequence_id = v and position = 1) = false, 'T2: passo removido segue ativo';
  assert jsonb_array_length(r->'steps') = 1, 'T2: resposta deveria trazer só o passo ativo';
end $$;

-- T3: falha no meio (passo com texto vazio viola o CHECK) desfaz TUDO:
-- nome e passos continuam como estavam.
do $$ declare v uuid := (select id from t_ids where k = 'seq'); failed boolean := false; begin
  begin
    perform public.crm_outreach_save_sequence(
      '54000000-0000-0000-0000-000000000001',
      jsonb_build_object('id', v, 'name', 'NÃO DEVE FICAR', 'active', true,
        'trigger_event', 'lead_intake', 'trigger_entry_ids', jsonb_build_array('54000000-0000-0000-0000-000000000402')),
      '[{"position":0,"offset_minutes":0,"message_template":"ok"},{"position":1,"offset_minutes":60,"message_template":"   "}]');
  exception when check_violation then failed := true;
  end;
  assert failed, 'T3: deveria falhar';
  assert (select name from public.cadence_sequences where id = v) = 'Novo Lead - Meta ADS (Cadastro)', 'T3: nome parcial ficou gravado';
  assert (select message_template from public.cadence_steps where sequence_id = v and position = 0) = 'Oi, editado', 'T3: passo parcial ficou gravado';
end $$;

-- T4: id de outro time não é alterado nem vira insert.
do $$ declare v uuid := (select id from t_ids where k = 'seq'); failed boolean := false; begin
  begin
    perform public.crm_outreach_save_sequence(
      '54000000-0000-0000-0000-000000000002',
      jsonb_build_object('id', v, 'name', 'invasão', 'trigger_event', 'lead_intake'),
      '[{"position":0,"offset_minutes":0,"message_template":"x"}]');
  exception when no_data_found then failed := true;
  end;
  assert failed, 'T4: deveria recusar id de outro time';
  assert (select count(*) from public.cadence_sequences) = 1, 'T4: criou sequência';
  assert (select name from public.cadence_sequences where id = v) = 'Novo Lead - Meta ADS (Cadastro)', 'T4: alterou sequência de outro time';
end $$;

-- T5: desligar pela função mantém o gatilho que cancela inscrições ativas.
insert into public.cadence_enrollments (equipe_id, sequence_id, lead_id, status, enrollment_key)
select '54000000-0000-0000-0000-000000000001', id, '54000000-0000-0000-0000-000000000501', 'active', 't5'
  from t_ids where k = 'seq';
do $$ declare v uuid := (select id from t_ids where k = 'seq'); begin
  perform public.crm_outreach_save_sequence(
    '54000000-0000-0000-0000-000000000001',
    jsonb_build_object('id', v, 'name', 'Novo Lead - Meta ADS (Cadastro)', 'active', false,
      'trigger_event', 'lead_intake', 'trigger_entry_ids', jsonb_build_array('54000000-0000-0000-0000-000000000402')),
    '[{"position":0,"offset_minutes":0,"message_template":"Oi, editado"}]');
  assert (select status from public.cadence_enrollments where sequence_id = v) = 'cancelled', 'T5: desligar não cancelou a inscrição';
end $$;

-- T6: só service_role executa.
do $$ begin
  assert not has_function_privilege('authenticated', 'public.crm_outreach_save_sequence(uuid, jsonb, jsonb)', 'execute'),
    'T6: authenticated pode executar';
  assert has_function_privilege('service_role', 'public.crm_outreach_save_sequence(uuid, jsonb, jsonb)', 'execute'),
    'T6: service_role não pode executar';
end $$;

select 'PASS' as result;
