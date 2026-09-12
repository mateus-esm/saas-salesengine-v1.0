-- Sprint 11 · Onda 4 · T44 — botão de automação com retorno (contrato v1).
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w4_artifact_actions.test.sql
--
-- O que este teste protege: a ação vira um webhook da fila de saída (evento
-- próprio, payload inteiro); o clique põe o payload v1 na fila (registro, negócio
-- e seus campos por key, contato, itens, retorno com token) e guarda só o hash do
-- token; o retorno aplica campos (só os graváveis), arquivos e status (o negócio
-- anda pela regra do T43, como "automation"); o token é de uso único, expira e
-- não se reivindica em paralelo; o vizinho não configura nem clica; o app não
-- chama as funções do retorno.

begin;

-- @include supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql
-- @include supabase/migrations/20260912100200_sprint11_w4_artifacts.sql
-- @include supabase/migrations/20260912100300_sprint11_w4_artifact_files.sql
-- @include supabase/migrations/20260912100400_sprint11_w4_artifact_lifecycle.sql
-- @include supabase/migrations/20260912100500_sprint11_w4_artifact_actions.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5124a000-0000-0000-0000-000000000001', 'S11W4 Acao A', 'x', 'y'),
  ('5124a000-0000-0000-0000-000000000002', 'S11W4 Acao B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5124b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w4-acao.test',   'x', now(), now()),
  ('5124b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w4-acao.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5124b000-0000-0000-0000-00000000000a', '5124b000-0000-0000-0000-00000000000a', 'chefe@s11w4-acao.test',   '5124a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5124b000-0000-0000-0000-00000000000d', '5124b000-0000-0000-0000-00000000000d', 'vizinho@s11w4-acao.test', '5124a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5124c000-0000-0000-0000-000000000001', '5124a000-0000-0000-0000-000000000001', 'Acao A',
   jsonb_build_array(jsonb_build_object('field_id', 'cf-consumo', 'key', 'consumo_kwh', 'label', 'Consumo', 'type', 'number', 'position', 0)));

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5124d000-0000-0000-0000-000000000001', '5124a000-0000-0000-0000-000000000001', '5124c000-0000-0000-0000-000000000001', 'Novo',     0, 'open', null),
  ('5124d000-0000-0000-0000-000000000002', '5124a000-0000-0000-0000-000000000001', '5124c000-0000-0000-0000-000000000001', 'Proposta', 1, 'open', 'proposal_sent');

insert into public.leads (id, equipe_id, name, phone, email) values
  ('5124e000-0000-0000-0000-000000000001', '5124a000-0000-0000-0000-000000000001', 'Joao Solar', '5585999990000', 'joao@solar.test');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id, custom_data) values
  ('5124f000-0000-0000-0000-000000000001', '5124a000-0000-0000-0000-000000000001', '5124e000-0000-0000-0000-000000000001',
   '5124c000-0000-0000-0000-000000000001', '5124d000-0000-0000-0000-000000000001', '5124b000-0000-0000-0000-00000000000a',
   '{"cf-consumo": 850}');

insert into public.opportunity_items (equipe_id, opportunity_id, name, quantity, unit_price, position) values
  ('5124a000-0000-0000-0000-000000000001', '5124f000-0000-0000-0000-000000000001', 'Usina 8 kWp', 1, 32000, 0);
set constraints all immediate;

insert into public.custom_tables (id, equipe_id, name, slug, artifact_kind, table_schema) values
  ('51240000-0000-0000-0000-0000000000c1', '5124a000-0000-0000-0000-000000000001', 'Propostas', 'propostas_acao', 'proposal',
   jsonb_build_array(
     jsonb_build_object('field_id', 'f-titulo', 'key', 'titulo', 'label', 'Título', 'type', 'text'),
     jsonb_build_object('field_id', 'f-link', 'key', 'link_pdf', 'label', 'Link do PDF', 'type', 'url'),
     jsonb_build_object('field_id', 'f-cliente', 'key', 'cliente', 'label', 'Cliente', 'type', 'lookup',
                        'lookupConfig', jsonb_build_object('source', 'contact.name')),
     jsonb_build_object('field_id', 'f-pdf', 'key', 'pdf', 'label', 'PDF', 'type', 'file')));

insert into public.custom_table_records (id, equipe_id, table_id, data, opportunity_id) values
  ('51240000-0000-0000-0000-0000000000a1', '5124a000-0000-0000-0000-000000000001', '51240000-0000-0000-0000-0000000000c1',
   '{"f-titulo":"Proposta 1"}', '5124f000-0000-0000-0000-000000000001');

create temp table pg_temp.t44 (k text primary key, val text);
grant all on pg_temp.t44 to authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5124b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Configurar: a ação vira um webhook da fila de saída.
-- ============================================================================
do $$
declare v jsonb; v_failed boolean := false; v_cfg record;
begin
  v := public.crm_save_artifact_actions('51240000-0000-0000-0000-0000000000c1',
         '[{"label":"Gerar proposta","url":"https://n8n.test/webhook/gerar"}]');
  assert jsonb_array_length(v) = 1 and v->0->>'url' = 'https://n8n.test/webhook/gerar',
    'T44-1 FAIL: a acao deveria voltar com a URL, veio ' || v::text;
  insert into pg_temp.t44 values ('action', v->0->>'id');

  select * into v_cfg from public.webhook_configs where trigger_event = 'artifact_action:' || (v->0->>'id');
  assert v_cfg.active and v_cfg.equipe_id = '5124a000-0000-0000-0000-000000000001'
         and v_cfg.payload_template = to_jsonb('{{artifact}}'::text) and v_cfg.inbound_function is null,
    'T44-1 FAIL: a acao deveria ser um webhook de saida da equipe com o payload inteiro';

  -- Renomear mantém a mesma ação (e o mesmo webhook).
  v := public.crm_save_artifact_actions('51240000-0000-0000-0000-0000000000c1',
         jsonb_build_array(jsonb_build_object('id', v->0->>'id', 'label', 'Gerar PDF', 'url', 'https://n8n.test/webhook/gerar2')));
  assert v->0->>'id' = (select val from pg_temp.t44 where k = 'action') and v->0->>'label' = 'Gerar PDF',
    'T44-1 FAIL: editar deveria manter a acao';
  assert (select count(*) from public.webhook_configs where trigger_event like 'artifact_action:%'
            and equipe_id = '5124a000-0000-0000-0000-000000000001') = 1,
    'T44-1 FAIL: editar nao deveria criar outro webhook';

  begin
    perform public.crm_save_artifact_actions('51240000-0000-0000-0000-0000000000c1', '[{"label":"x","url":"ftp://n8n.test"}]');
  exception when others then v_failed := sqlerrm = 'invalid_action';
  end;
  assert v_failed, 'T44-1 FAIL: URL que nao e http(s) deveria ser recusada';
end $$;

-- ============================================================================
-- 2. O clique: payload v1 na fila; só o hash do token guardado.
-- ============================================================================
do $$
declare v jsonb; p jsonb; v_run record;
begin
  v := public.crm_run_artifact_action('51240000-0000-0000-0000-0000000000a1', (select val from pg_temp.t44 where k = 'action'));
  assert v->>'status' = 'queued' and v->>'webhook_log_id' is not null, 'T44-2 FAIL: o clique deveria entrar na fila, veio ' || v::text;

  select payload into p from public.webhook_logs where id = (v->>'webhook_log_id')::uuid;
  assert (p->>'version')::int = 1 and p->'action'->>'label' = 'Gerar PDF', 'T44-2 FAIL: payload sem versao/acao: ' || p::text;
  assert p->'record'->'fields'->>'titulo' = 'Proposta 1', 'T44-2 FAIL: o registro deveria ir por key';
  assert p->'record'->'fields'->>'cliente' = 'Joao Solar', 'T44-2 FAIL: a consulta deveria ir com o valor de agora';
  assert (p->'deal'->'fields'->>'consumo_kwh')::numeric = 850, 'T44-2 FAIL: os campos do negocio deveriam ir por key';
  assert p->'deal'->'owner'->>'name' = 'Chefe' and p->'deal'->'stage'->>'name' = 'Novo', 'T44-2 FAIL: dono e etapa do negocio';
  assert p->'contact'->>'phone' = '5585999990000', 'T44-2 FAIL: o contato deveria ir no payload';
  assert p->'items'->0->>'name' = 'Usina 8 kWp', 'T44-2 FAIL: os itens deveriam ir no payload';
  assert p->'callback'->>'url' like '%/functions/v1/artifact-callback' and length(p->'callback'->>'token') = 64,
    'T44-2 FAIL: o retorno deveria ter URL e token';

  insert into pg_temp.t44 values ('token', p->'callback'->>'token'), ('run', v->>'run_id');
end $$;

reset role;
do $$
declare v_run public.artifact_action_runs;
begin
  select * into v_run from public.artifact_action_runs where id = (select val from pg_temp.t44 where k = 'run')::uuid;
  assert v_run.token_hash = encode(extensions.digest((select val from pg_temp.t44 where k = 'token'), 'sha256'), 'hex')
         and v_run.token_hash <> (select val from pg_temp.t44 where k = 'token'),
    'T44-2 FAIL: o token deveria ficar guardado so como hash';
  assert v_run.expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour',
    'T44-2 FAIL: o token deveria valer 7 dias';
end $$;

-- ============================================================================
-- 3. O retorno: campos, arquivo e status; o negócio anda como "automation".
-- ============================================================================
set local role service_role;
do $$
declare c jsonb; r jsonb; v_failed boolean := false; v_data jsonb;
begin
  c := public._crm_artifact_callback_claim((select val from pg_temp.t44 where k = 'token'));
  assert c->>'record_id' = '51240000-0000-0000-0000-0000000000a1' and c->'statuses' ? 'sent'
         and c->'writable_keys' ? 'link_pdf' and not (c->'writable_keys' ? 'cliente')
         and c->'file_columns'->0->>'key' = 'pdf',
    'T44-3 FAIL: a reivindicacao deveria dizer o que a edge valida, veio ' || c::text;

  begin
    perform public._crm_artifact_callback_claim((select val from pg_temp.t44 where k = 'token'));
  exception when others then v_failed := sqlerrm = 'callback_in_progress';
  end;
  assert v_failed, 'T44-3 FAIL: duas chamadas ao mesmo tempo com o mesmo token';

  -- keep_open: aplica e deixa o token valendo (o contrato assinado chega depois).
  r := public._crm_artifact_callback_finish((c->>'run_id')::uuid, 'sent',
         '{"link_pdf":"https://docs.test/p1.pdf","cliente":"nao se escreve","inexistente":1}',
         jsonb_build_array(jsonb_build_object('field_id', 'f-pdf', 'path', '5124a000-0000-0000-0000-000000000001/t/r/1-p1.pdf',
                                              'name', 'p1.pdf', 'size', 1234, 'type', 'application/pdf')),
         null, true);
  assert r->>'status' = 'open' and r->'fields_applied' = '["link_pdf"]'::jsonb
         and r->'fields_ignored' @> '["cliente","inexistente"]'::jsonb and (r->>'files')::int = 1
         and (r->>'moved')::boolean,
    'T44-3 FAIL: o retorno deveria aplicar so o gravavel, o arquivo e o status, veio ' || r::text;

  select data into v_data from public.custom_table_records where id = '51240000-0000-0000-0000-0000000000a1';
  assert v_data->>'f-link' = 'https://docs.test/p1.pdf' and not (v_data ? 'f-cliente')
         and v_data->'f-pdf'->0->>'name' = 'p1.pdf',
    'T44-3 FAIL: os dados do registro depois do retorno: ' || v_data::text;
  assert (select artifact_status from public.custom_table_records where id = '51240000-0000-0000-0000-0000000000a1') = 'sent',
    'T44-3 FAIL: o status deveria mudar pelo retorno';
  assert (select stage_id from public.opportunities where id = '5124f000-0000-0000-0000-000000000001') = '5124d000-0000-0000-0000-000000000002'
     and (select changed_by_type from public.opportunity_stage_history
           where opportunity_id = '5124f000-0000-0000-0000-000000000001' order by changed_at desc limit 1) = 'automation',
    'T44-3 FAIL: o negocio deveria andar pela proposta enviada, como automation';

  -- A segunda resposta com o mesmo token fecha a execução.
  c := public._crm_artifact_callback_claim((select val from pg_temp.t44 where k = 'token'));
  r := public._crm_artifact_callback_finish((c->>'run_id')::uuid, 'accepted', '{}', '[]');
  assert r->>'status' = 'completed'
     and (select jsonb_array_length(result->'responses') from public.artifact_action_runs where id = (c->>'run_id')::uuid) = 1,
    'T44-3 FAIL: a resposta final deveria fechar a execucao, guardando a anterior, veio ' || r::text;

  v_failed := false;
  begin
    perform public._crm_artifact_callback_claim((select val from pg_temp.t44 where k = 'token'));
  exception when others then v_failed := sqlerrm = 'token_used';
  end;
  assert v_failed, 'T44-3 FAIL: o token deveria ser de uso unico';

  v_failed := false;
  begin
    perform public._crm_artifact_callback_claim(repeat('0', 64));
  exception when others then v_failed := sqlerrm = 'token_invalid';
  end;
  assert v_failed, 'T44-3 FAIL: token desconhecido deveria ser recusado';
end $$;

-- Status fora do tipo não se aplica; soltar deixa tentar de novo; token vencido.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5124b000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v := public.crm_run_artifact_action('51240000-0000-0000-0000-0000000000a1', (select val from pg_temp.t44 where k = 'action'));
  insert into pg_temp.t44 values ('run2', v->>'run_id'),
    ('token2', (select payload->'callback'->>'token' from public.webhook_logs where id = (v->>'webhook_log_id')::uuid));
end $$;
set local role service_role;
do $$
declare c jsonb; v_failed boolean := false;
begin
  c := public._crm_artifact_callback_claim((select val from pg_temp.t44 where k = 'token2'));
  begin
    perform public._crm_artifact_callback_finish((c->>'run_id')::uuid, 'signed', '{}', '[]');
  exception when others then v_failed := sqlerrm = 'invalid_artifact_status';
  end;
  assert v_failed, 'T44-4 FAIL: proposta nao se assina nem pelo retorno';

  perform public._crm_artifact_callback_release((c->>'run_id')::uuid, 'corpo invalido');
  c := public._crm_artifact_callback_claim((select val from pg_temp.t44 where k = 'token2'));
  assert c->>'run_id' = (select val from pg_temp.t44 where k = 'run2'), 'T44-4 FAIL: soltar deveria deixar tentar de novo';
end $$;

reset role;
update public.artifact_action_runs set expires_at = now() - interval '1 minute', status = 'queued', claimed_at = null
 where id = (select val from pg_temp.t44 where k = 'run2')::uuid;
set local role service_role;
do $$
declare v_failed boolean := false;
begin
  begin
    perform public._crm_artifact_callback_claim((select val from pg_temp.t44 where k = 'token2'));
  exception when others then v_failed := sqlerrm = 'token_expired';
  end;
  assert v_failed, 'T44-4 FAIL: token vencido deveria ser recusado';
end $$;

-- ============================================================================
-- 5. O vizinho não configura nem clica; o app não chama o retorno.
-- ============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5124b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean;
begin
  v_failed := false;
  begin
    perform public.crm_save_artifact_actions('51240000-0000-0000-0000-0000000000c1', '[]');
  exception when others then v_failed := sqlerrm = 'table_not_found';
  end;
  assert v_failed, 'T44-5 FAIL: o vizinho mexeu nas acoes da tabela da equipe A';

  v_failed := false;
  begin
    perform public.crm_run_artifact_action('51240000-0000-0000-0000-0000000000a1', (select val from pg_temp.t44 where k = 'action'));
  exception when others then v_failed := sqlerrm = 'record_not_found';
  end;
  assert v_failed, 'T44-5 FAIL: o vizinho clicou na acao do registro da equipe A';

  assert (select count(*) from public.artifact_action_runs) = 0, 'T44-5 FAIL: o vizinho ve as execucoes da equipe A';

  v_failed := false;
  begin
    perform public._crm_artifact_callback_claim('x');
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T44-5 FAIL: o app nao deveria chamar as funcoes do retorno';
end $$;

rollback;
select 'PASS' as result;
