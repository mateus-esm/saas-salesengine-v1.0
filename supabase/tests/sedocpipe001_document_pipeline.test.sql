-- SE-DOCPIPE-001 — a esteira de propostas e contratos (Jestor → Rev), Fase 1.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sedocpipe001_document_pipeline.test.sql
--
-- O que este teste protege:
--   1. o payload leva os outros artefatos do negócio (a proposta vai junto no
--      "Enviar contrato") e o `trigger` do disparo;
--   2. o callback por token: `event_id` repetido não reaplica; keep_open renova a
--      validade (30 dias, teto de 90); a assinatura antiga (T44) continua valendo;
--   3. o envio do formulário público dispara a ação configurada — e, se a ação
--      sumiu, o envio do cliente passa mesmo assim;
--   4. a entrada por ID (segredo do tenant): por id e por campo, idempotente por
--      event_id, só registros de artefato da equipe, ambiguidade recusada;
--   5. o token de uma execução aberta identifica a equipe (acesso a arquivo);
--   6. o app (authenticated) não chama nenhuma das funções internas;
--   7. a semente das colunas da Solo é idempotente.

begin;

-- @include supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql
-- @include supabase/migrations/20260912100200_sprint11_w4_artifacts.sql
-- @include supabase/migrations/20260912100300_sprint11_w4_artifact_files.sql
-- @include supabase/migrations/20260912100400_sprint11_w4_artifact_lifecycle.sql
-- @include supabase/migrations/20260912100500_sprint11_w4_artifact_actions.sql
-- @include supabase/migrations/20260912100600_sprint11_w4_public_forms.sql
-- @include supabase/migrations/20260926100000_sedocpipe001_document_pipeline.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5d0ca000-0000-0000-0000-000000000001', 'DOCPIPE A', 'x', 'y'),
  ('5d0ca000-0000-0000-0000-000000000002', 'DOCPIPE B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5d0cb000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@docpipe.test',   'x', now(), now()),
  ('5d0cb000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@docpipe.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5d0cb000-0000-0000-0000-00000000000a', '5d0cb000-0000-0000-0000-00000000000a', 'chefe@docpipe.test',   '5d0ca000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5d0cb000-0000-0000-0000-00000000000d', '5d0cb000-0000-0000-0000-00000000000d', 'vizinho@docpipe.test', '5d0ca000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5d0cc000-0000-0000-0000-000000000001', '5d0ca000-0000-0000-0000-000000000001', 'Docpipe A', '[]'::jsonb);

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5d0cd000-0000-0000-0000-000000000001', '5d0ca000-0000-0000-0000-000000000001', '5d0cc000-0000-0000-0000-000000000001', 'Novo',              0, 'open', null),
  ('5d0cd000-0000-0000-0000-000000000002', '5d0ca000-0000-0000-0000-000000000001', '5d0cc000-0000-0000-0000-000000000001', 'Contrato enviado',  1, 'open', 'contract_sent'),
  ('5d0cd000-0000-0000-0000-000000000003', '5d0ca000-0000-0000-0000-000000000001', '5d0cc000-0000-0000-0000-000000000001', 'Contrato assinado', 2, 'open', 'contract_signed');

insert into public.leads (id, equipe_id, name, phone, email) values
  ('5d0ce000-0000-0000-0000-000000000001', '5d0ca000-0000-0000-0000-000000000001', 'Joao Solar', '5585999990000', 'joao@solar.test');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id, custom_data) values
  ('5d0cf000-0000-0000-0000-000000000001', '5d0ca000-0000-0000-0000-000000000001', '5d0ce000-0000-0000-0000-000000000001',
   '5d0cc000-0000-0000-0000-000000000001', '5d0cd000-0000-0000-0000-000000000001', '5d0cb000-0000-0000-0000-00000000000a', '{}');
set constraints all immediate;

insert into public.custom_tables (id, equipe_id, name, slug, artifact_kind, table_schema) values
  ('5d0c0000-0000-0000-0000-0000000000c1', '5d0ca000-0000-0000-0000-000000000001', 'Propostas', 'propostas_docpipe', 'proposal',
   jsonb_build_array(
     jsonb_build_object('field_id', 'p-titulo', 'key', 'titulo', 'label', 'Título', 'type', 'text'),
     jsonb_build_object('field_id', 'p-pdf', 'key', 'pdf', 'label', 'PDF', 'type', 'file'))),
  ('5d0c0000-0000-0000-0000-0000000000c2', '5d0ca000-0000-0000-0000-000000000001', 'Contratos', 'contratos_docpipe', 'contract',
   jsonb_build_array(
     jsonb_build_object('field_id', 'c-nome', 'key', 'nome_completo', 'label', 'Nome', 'type', 'text'),
     jsonb_build_object('field_id', 'c-cs', 'key', 'clicksign_document_id', 'label', 'Clicksign', 'type', 'text'),
     jsonb_build_object('field_id', 'c-assinado', 'key', 'contrato_assinado', 'label', 'Assinado', 'type', 'file'),
     jsonb_build_object('field_id', 'c-pdf', 'key', 'contrato_pdf', 'label', 'PDF enviado', 'type', 'file')));

insert into public.custom_table_records (id, equipe_id, table_id, data, opportunity_id) values
  ('5d0c0000-0000-0000-0000-0000000000a1', '5d0ca000-0000-0000-0000-000000000001', '5d0c0000-0000-0000-0000-0000000000c1',
   '{"p-titulo":"Proposta 8 kWp","p-pdf":[{"name":"proposta.pdf","path":"5d0ca000-0000-0000-0000-000000000001/c1/a1/1-proposta.pdf","size":10,"type":"application/pdf"}]}',
   '5d0cf000-0000-0000-0000-000000000001'),
  ('5d0c0000-0000-0000-0000-0000000000a2', '5d0ca000-0000-0000-0000-000000000001', '5d0c0000-0000-0000-0000-0000000000c2',
   '{"c-nome":"Joao Solar"}', '5d0cf000-0000-0000-0000-000000000001');

create temp table pg_temp.dp (k text primary key, val text);
grant all on pg_temp.dp to authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5d0cb000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. O payload do "Enviar contrato" leva a proposta do negócio e o trigger.
-- ============================================================================
do $$
declare v jsonb; p jsonb;
begin
  v := public.crm_save_artifact_actions('5d0c0000-0000-0000-0000-0000000000c2',
         '[{"label":"Enviar contrato","url":"https://n8n.test/webhook/contrato"}]');
  insert into pg_temp.dp values ('action', v->0->>'id');

  v := public.crm_run_artifact_action('5d0c0000-0000-0000-0000-0000000000a2', v->0->>'id');
  assert v->>'status' = 'queued', 'DP-1 FAIL: o clique deveria entrar na fila, veio ' || v::text;

  select payload into p from public.webhook_logs where id = (v->>'webhook_log_id')::uuid;
  assert p->>'trigger' = 'button', 'DP-1 FAIL: o payload deveria dizer que veio do botao: ' || coalesce(p->>'trigger', 'null');
  assert p->'record'->'fields'->>'nome_completo' = 'Joao Solar', 'DP-1 FAIL: o registro por key continua igual';
  assert jsonb_array_length(p->'deal_artifacts') = 1
         and p->'deal_artifacts'->0->'table'->>'kind' = 'proposal'
         and p->'deal_artifacts'->0->'record'->'fields'->>'titulo' = 'Proposta 8 kWp'
         and p->'deal_artifacts'->0->'record'->'fields'->'pdf'->0->>'path' like '5d0ca000-0000-0000-0000-000000000001/%',
    'DP-1 FAIL: a proposta do negocio deveria ir junto, com o path do PDF: ' || coalesce(p->'deal_artifacts', 'null')::text;

  insert into pg_temp.dp values ('token', p->'callback'->>'token'), ('run', v->>'run_id');
end $$;

-- ============================================================================
-- 2. Callback: event_id idempotente; keep_open renova; assinatura antiga vale.
-- ============================================================================
reset role;
set local role service_role;
do $$
declare c jsonb; r jsonb; v_seen boolean; v_run public.artifact_action_runs; v_before timestamptz;
begin
  select expires_at into v_before from public.artifact_action_runs where id = (select val from pg_temp.dp where k = 'run')::uuid;

  -- Contrato enviado (keep_open), com o evento do Clicksign.
  c := public._crm_artifact_callback_claim((select val from pg_temp.dp where k = 'token'));
  v_seen := public._crm_artifact_callback_seen((c->>'run_id')::uuid, 'cs:evt-1');
  assert not v_seen, 'DP-2 FAIL: evento novo nao deveria constar como visto';
  r := public._crm_artifact_callback_apply((c->>'run_id')::uuid, 'sent', '{"clicksign_document_id":"doc-1"}',
         jsonb_build_array(jsonb_build_object('field_id', 'c-pdf', 'path', '5d0ca000-0000-0000-0000-000000000001/c2/a2/1-contrato.pdf',
                                              'name', 'contrato.pdf', 'size', 10, 'type', 'application/pdf')),
         null, true, 'cs:evt-1');
  assert r->>'status' = 'open' and r->>'event_id' = 'cs:evt-1' and (r->>'moved')::boolean,
    'DP-2 FAIL: o envio deveria aplicar e mover o negocio, veio ' || r::text;

  select * into v_run from public.artifact_action_runs where id = (c->>'run_id')::uuid;
  assert v_run.status = 'queued' and v_run.expires_at >= now() + interval '29 days' and v_run.expires_at > v_before
         and v_run.expires_at <= v_run.created_at + interval '90 days',
    'DP-2 FAIL: keep_open deveria renovar a validade (30 dias, teto 90): ' || v_run.expires_at::text;
  assert v_run.result->'event_ids' = '["cs:evt-1"]'::jsonb, 'DP-2 FAIL: o event_id deveria ficar guardado';

  -- O mesmo evento de novo (o Clicksign reentrega): nada é reaplicado.
  c := public._crm_artifact_callback_claim((select val from pg_temp.dp where k = 'token'));
  v_seen := public._crm_artifact_callback_seen((c->>'run_id')::uuid, 'cs:evt-1');
  assert v_seen, 'DP-2 FAIL: evento repetido deveria constar como visto';
  select * into v_run from public.artifact_action_runs where id = (c->>'run_id')::uuid;
  assert v_run.status = 'queued' and v_run.claimed_at is null and v_run.result->>'last_error' is null,
    'DP-2 FAIL: o repetido deveria soltar a execucao sem erro';

  -- Mesmo que passe da checagem cedo, o apply também recusa o repetido.
  c := public._crm_artifact_callback_claim((select val from pg_temp.dp where k = 'token'));
  r := public._crm_artifact_callback_apply((c->>'run_id')::uuid, 'sent', '{}',
         jsonb_build_array(jsonb_build_object('field_id', 'c-pdf', 'path', 'x', 'name', 'dup.pdf', 'size', 1, 'type', 'application/pdf')),
         null, true, 'cs:evt-1');
  assert r->>'status' = 'duplicate', 'DP-2 FAIL: apply deveria dizer duplicate, veio ' || r::text;
  assert jsonb_array_length((select data->'c-pdf' from public.custom_table_records where id = '5d0c0000-0000-0000-0000-0000000000a2')) = 1,
    'DP-2 FAIL: o arquivo repetido nao deveria entrar';

  -- Assinado, pela assinatura antiga da T44 (edge ainda não republicada).
  c := public._crm_artifact_callback_claim((select val from pg_temp.dp where k = 'token'));
  r := public._crm_artifact_callback_finish((c->>'run_id')::uuid, 'signed', '{}', '[]');
  assert r->>'status' = 'completed', 'DP-2 FAIL: a assinatura antiga deveria fechar a execucao, veio ' || r::text;
  assert (select artifact_status from public.custom_table_records where id = '5d0c0000-0000-0000-0000-0000000000a2') = 'signed'
     and (select stage_id from public.opportunities where id = '5d0cf000-0000-0000-0000-000000000001') = '5d0cd000-0000-0000-0000-000000000003',
    'DP-2 FAIL: assinado deveria mover o negocio para Contrato assinado';
  assert (select jsonb_array_length(result->'responses') from public.artifact_action_runs where id = (c->>'run_id')::uuid) = 1,
    'DP-2 FAIL: a resposta do envio deveria continuar no historico';
end $$;

-- O teto de 90 dias (execução reaberta à mão só para o teste, e fechada de novo).
reset role;
do $$
declare v_run uuid := (select val from pg_temp.dp where k = 'run')::uuid; r jsonb; v_snapshot public.artifact_action_runs;
begin
  select * into v_snapshot from public.artifact_action_runs where id = v_run;
  update public.artifact_action_runs set created_at = now() - interval '80 days', expires_at = now() + interval '1 day',
                                         status = 'claimed', claimed_at = now(), finished_at = null
   where id = v_run;
  r := public._crm_artifact_callback_apply(v_run, null, '{}', '[]', null, true, 'cs:evt-2');
  assert (r->>'expires_at')::timestamptz <= now() - interval '80 days' + interval '90 days' + interval '1 second',
    'DP-2 FAIL: a renovacao nao passa de 90 dias do clique: ' || (r->>'expires_at');
  update public.artifact_action_runs
     set created_at = v_snapshot.created_at, expires_at = v_snapshot.expires_at, status = v_snapshot.status,
         claimed_at = v_snapshot.claimed_at, finished_at = v_snapshot.finished_at, result = v_snapshot.result
   where id = v_run;
end $$;

-- ============================================================================
-- 3. O envio do formulário dispara a ação configurada.
-- ============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5d0cb000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb; v_failed boolean := false; v_link jsonb;
begin
  begin
    perform public.crm_save_form_config('5d0c0000-0000-0000-0000-0000000000c2',
      jsonb_build_object('enabled', true, 'fields', jsonb_build_array(jsonb_build_object('field_id', 'c-nome', 'required', true)),
                         'on_submit_action_id', 'nao-existe'));
  exception when others then v_failed := sqlerrm = 'invalid_submit_action';
  end;
  assert v_failed, 'DP-3 FAIL: acao que nao e da tabela deveria ser recusada';

  v := public.crm_save_form_config('5d0c0000-0000-0000-0000-0000000000c2',
    jsonb_build_object('enabled', true, 'title', 'Dados para Contrato',
                       'fields', jsonb_build_array(jsonb_build_object('field_id', 'c-nome', 'required', true)),
                       'on_submit_action_id', (select val from pg_temp.dp where k = 'action')));
  assert v->>'on_submit_action_id' = (select val from pg_temp.dp where k = 'action'),
    'DP-3 FAIL: a acao do envio deveria ficar salva, veio ' || v::text;

  v_link := public.crm_create_form_link('5d0c0000-0000-0000-0000-0000000000a2');
  insert into pg_temp.dp values ('form1', v_link->>'token');
end $$;

reset role;
set local role service_role;
do $$
declare v jsonb; v_n integer; p jsonb;
begin
  select count(*) into v_n from public.artifact_action_runs where record_id = '5d0c0000-0000-0000-0000-0000000000a2';
  v := public._crm_public_form_submit((select val from pg_temp.dp where k = 'form1'), '{"nome_completo":"Joao da Silva Solar"}');
  assert v->>'ok' = 'true' and v->>'automation' = 'queued', 'DP-3 FAIL: o envio deveria disparar a acao, veio ' || v::text;
  assert (select count(*) from public.artifact_action_runs where record_id = '5d0c0000-0000-0000-0000-0000000000a2') = v_n + 1,
    'DP-3 FAIL: o envio deveria criar uma execucao';

  -- (as execuções desta transação têm o mesmo now(): acha-se pelo trigger, não pela hora)
  select l.payload into p from public.webhook_logs l where l.payload->>'trigger' = 'form_submit';
  assert p->'record'->>'id' = '5d0c0000-0000-0000-0000-0000000000a2'
         and p->'record'->'fields'->>'nome_completo' = 'Joao da Silva Solar',
    'DP-3 FAIL: o payload deveria levar o que o cliente acabou de preencher, com trigger form_submit: ' || coalesce(p::text, 'null');
  assert (select created_by from public.artifact_action_runs where id = (p->>'run_id')::uuid) is null,
    'DP-3 FAIL: execucao disparada pelo cliente nao tem autor';
end $$;

-- A ação some da tabela: o envio do cliente passa, a automação é pulada.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5d0cb000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_link jsonb;
begin
  perform public.crm_save_artifact_actions('5d0c0000-0000-0000-0000-0000000000c2', '[]');
  v_link := public.crm_create_form_link('5d0c0000-0000-0000-0000-0000000000a2');
  insert into pg_temp.dp values ('form2', v_link->>'token');
end $$;

reset role;
set local role service_role;
do $$
declare v jsonb;
begin
  v := public._crm_public_form_submit((select val from pg_temp.dp where k = 'form2'), '{"nome_completo":"Joao S."}');
  assert v->>'ok' = 'true' and v->>'automation' = 'skipped', 'DP-3 FAIL: sem a acao, o envio passa e a automacao e pulada: ' || v::text;
  assert (select data->>'c-nome' from public.custom_table_records where id = '5d0c0000-0000-0000-0000-0000000000a2') = 'Joao S.',
    'DP-3 FAIL: os dados do cliente deveriam ficar gravados mesmo sem a automacao';
end $$;

-- ============================================================================
-- 4. A entrada por ID: idempotente, só a equipe, por id ou por campo.
-- ============================================================================
do $$
declare b jsonb; r jsonb; v_failed boolean;
begin
  -- Por campo (o id do Clicksign), sem token.
  b := public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', 'cs:evt-9', null, null,
                                          'clicksign_document_id', 'doc-1');
  assert (b->>'duplicate')::boolean = false and b->>'record_id' = '5d0c0000-0000-0000-0000-0000000000a2'
         and b->'statuses' ? 'signed' and b->'file_columns'->0->>'key' = 'contrato_assinado',
    'DP-4 FAIL: deveria achar o contrato pelo id do Clicksign, veio ' || b::text;

  v_failed := false;
  begin
    perform public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', 'cs:evt-9', null, null,
                                               'clicksign_document_id', 'doc-1');
  exception when others then v_failed := sqlerrm = 'event_in_progress';
  end;
  assert v_failed, 'DP-4 FAIL: o mesmo evento em paralelo deveria esperar';

  r := public._crm_artifact_inbound_finish((b->>'event_row_id')::uuid, 'rejected', '{"nome_completo":"Joao Final"}', '[]');
  assert r->'fields_applied' = '["nome_completo"]'::jsonb and r->>'artifact_status' = 'rejected',
    'DP-4 FAIL: deveria aplicar campo e status, veio ' || r::text;

  -- De novo: duplicado, nada muda.
  update public.custom_table_records set data = jsonb_set(data, '{c-nome}', '"Mexido depois"')
   where id = '5d0c0000-0000-0000-0000-0000000000a2';
  b := public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', 'cs:evt-9', null, null,
                                          'clicksign_document_id', 'doc-1');
  assert (b->>'duplicate')::boolean and b->'result'->>'artifact_status' = 'rejected',
    'DP-4 FAIL: o evento repetido deveria voltar como duplicado com o resultado anterior, veio ' || b::text;
  assert (select data->>'c-nome' from public.custom_table_records where id = '5d0c0000-0000-0000-0000-0000000000a2') = 'Mexido depois',
    'DP-4 FAIL: o duplicado nao deveria reaplicar';

  -- Falhou (corpo ruim): o mesmo event_id pode voltar.
  b := public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', 'n8n:exec-1',
                                          '5d0c0000-0000-0000-0000-0000000000a1', null, null, null);
  perform public._crm_artifact_inbound_release((b->>'event_row_id')::uuid, 'invalid_file_field');
  b := public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', 'n8n:exec-1',
                                          '5d0c0000-0000-0000-0000-0000000000a1', null, null, null);
  assert (b->>'duplicate')::boolean = false, 'DP-4 FAIL: evento que falhou deveria poder voltar';
  r := public._crm_artifact_inbound_finish((b->>'event_row_id')::uuid, 'sent', '{"titulo":"P2"}', '[]');
  assert (select status from public.artifact_inbound_events where id = (b->>'event_row_id')::uuid) = 'applied',
    'DP-4 FAIL: evento aplicado';

  -- O mesmo event_id apontando para outro registro é recusado.
  v_failed := false;
  begin
    perform public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', 'n8n:exec-2',
                                               '5d0c0000-0000-0000-0000-0000000000a1', null, null, null);
    perform public._crm_artifact_inbound_release(
      (select id from public.artifact_inbound_events where event_id = 'n8n:exec-2'), 'x');
    perform public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', 'n8n:exec-2',
                                               '5d0c0000-0000-0000-0000-0000000000a2', null, null, null);
  exception when others then v_failed := sqlerrm = 'event_id_reused';
  end;
  assert v_failed, 'DP-4 FAIL: event_id reaproveitado em outro registro deveria ser recusado';

  -- A outra equipe não acha o registro.
  v_failed := false;
  begin
    perform public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000002', 'x:1',
                                               '5d0c0000-0000-0000-0000-0000000000a2', null, null, null);
  exception when others then v_failed := sqlerrm = 'record_not_found';
  end;
  assert v_failed, 'DP-4 FAIL: o vizinho nao deveria achar o registro';

  -- Dois registros com o mesmo valor: ambíguo.
  insert into public.custom_table_records (id, equipe_id, table_id, data, opportunity_id) values
    ('5d0c0000-0000-0000-0000-0000000000a3', '5d0ca000-0000-0000-0000-000000000001', '5d0c0000-0000-0000-0000-0000000000c2',
     '{"c-cs":"doc-1"}', '5d0cf000-0000-0000-0000-000000000001');
  v_failed := false;
  begin
    perform public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', 'x:2', null, null,
                                               'clicksign_document_id', 'doc-1');
  exception when others then v_failed := sqlerrm = 'record_ambiguous';
  end;
  assert v_failed, 'DP-4 FAIL: valor em dois registros deveria ser ambiguo';

  -- Sem event_id, não entra.
  v_failed := false;
  begin
    perform public._crm_artifact_inbound_begin('5d0ca000-0000-0000-0000-000000000001', ' ',
                                               '5d0c0000-0000-0000-0000-0000000000a2', null, null, null);
  exception when others then v_failed := sqlerrm = 'event_id_required';
  end;
  assert v_failed, 'DP-4 FAIL: sem event_id deveria recusar';
end $$;

-- ============================================================================
-- 5. O token de uma execução aberta identifica a equipe; fechada, não.
-- ============================================================================
do $$
declare v_token text;
begin
  -- A execução do formulário (seção 3) está aberta; o token não aparece no banco, só no payload.
  select l.payload->'callback'->>'token' into v_token from public.webhook_logs l
   where l.payload->>'trigger' = 'form_submit' order by l.created_at desc limit 1;
  assert public._crm_artifact_run_equipe(v_token) = '5d0ca000-0000-0000-0000-000000000001',
    'DP-5 FAIL: o token aberto deveria identificar a equipe';
  assert public._crm_artifact_run_equipe((select val from pg_temp.dp where k = 'token')) is null,
    'DP-5 FAIL: execucao encerrada nao da acesso';
  assert public._crm_artifact_run_equipe(repeat('0', 64)) is null, 'DP-5 FAIL: token desconhecido';
end $$;

-- ============================================================================
-- 6. O app não chama as funções internas.
-- ============================================================================
reset role;
do $$
declare f text;
begin
  foreach f in array array[
    'public._crm_start_artifact_run(uuid, uuid, text, uuid, text)',
    'public._crm_artifact_apply(uuid, text, jsonb, jsonb)',
    'public._crm_artifact_callback_seen(uuid, text)',
    'public._crm_artifact_callback_apply(uuid, text, jsonb, jsonb, text, boolean, text)',
    'public._crm_artifact_inbound_begin(uuid, text, uuid, uuid, text, text)',
    'public._crm_artifact_inbound_finish(uuid, text, jsonb, jsonb)',
    'public._crm_artifact_inbound_release(uuid, text)',
    'public._crm_artifact_run_equipe(text)',
    'public._crm_artifact_record_fields(uuid)'
  ] loop
    assert not has_function_privilege('authenticated', f, 'execute'), 'DP-6 FAIL: authenticated executa ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'DP-6 FAIL: anon executa ' || f;
  end loop;
  assert has_function_privilege('authenticated', 'public.crm_run_artifact_action(uuid, text)', 'execute'),
    'DP-6 FAIL: o botao continua sendo do app';
end $$;

rollback;
select 'PASS' as result;
