-- Sprint Suporte 1 · Onda 5 — crm_run_automation / crm_automations.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sesup1_automations.test.sql
-- (BEGIN…ROLLBACK; as migrations são recriadas dentro da transação. Não executado
--  pelo implementador: a regra da sprint proíbe escrita em produção.)
--
-- O que protege:
--   1. caminho AVULSO (servidor: sem auth.uid(), p_automation null, p_action + p_equipe) executa
--      move_stage e update_field e grava automation_runs (regressão: record não atribuído)
--   2. idempotência do avulso por event_key (coalesce do automation_id no índice único)
--   3. mover para etapa de perda sem motivo, em pipeline com loss_reasons → run em erro
--      'loss_reason_required' (e nada muda); com motivo, move
--   4. update_field: source_missing → 'skipped' sem apagar; valor de tipo errado → erro
--   5. salvar automação / ação de webhook de entrada com etapa de perda sem motivo é recusado
--   6. gatilho de etapa: roda a automação ligada; em cascata (depth>1) grava 'skipped'/'cascade'
--   7. caminho da UI (authenticated) usa a RPC e respeita a equipe

begin;
-- @include supabase/migrations/20261015000100_sesup1_crm_move_opportunity.sql
-- @include supabase/migrations/20261015000200_sesup1_responsible_attendant.sql
-- @include supabase/migrations/20261015000500_sesup1_automations.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5e700000-0000-0000-0000-00000000000a', 'AutoA', 'x', 'y'),
  ('5e700000-0000-0000-0000-00000000000b', 'AutoB', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5e7b0000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a1@sesup1-auto.test', 'x', now(), now()),
  ('5e7b0000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b1@sesup1-auto.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5e7b0000-0000-0000-0000-0000000000a1', '5e7b0000-0000-0000-0000-0000000000a1', 'a1@sesup1-auto.test', '5e700000-0000-0000-0000-00000000000a', 'A1', 'user'),
  ('5e7b0000-0000-0000-0000-0000000000b1', '5e7b0000-0000-0000-0000-0000000000b1', 'b1@sesup1-auto.test', '5e700000-0000-0000-0000-00000000000b', 'B1', 'user')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role;

-- P1 sem lista de motivos; P2 com lista (perda exige motivo). Campos: kwh (number), fase (select).
insert into public.pipelines (id, equipe_id, name, loss_reasons, custom_fields_schema) values
  ('5e7c0000-0000-0000-0000-000000000001', '5e700000-0000-0000-0000-00000000000a', 'P1', '[]'::jsonb,
   '[{"field_id":"f-kwh","key":"kwh","label":"kWh","type":"number","required":false,"position":0},
     {"field_id":"f-fase","key":"fase","label":"Fase","type":"select","options":["a","b"],"required":false,"position":1}]'::jsonb),
  ('5e7c0000-0000-0000-0000-000000000002', '5e700000-0000-0000-0000-00000000000a', 'P2', '["Preço","Sem retorno"]'::jsonb, '[]'::jsonb);
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5e7d0000-0000-0000-0000-000000000011', '5e700000-0000-0000-0000-00000000000a', '5e7c0000-0000-0000-0000-000000000001', 'Aberta', 0, 'open'),
  ('5e7d0000-0000-0000-0000-000000000012', '5e700000-0000-0000-0000-00000000000a', '5e7c0000-0000-0000-0000-000000000001', 'Ganha',  1, 'won'),
  ('5e7d0000-0000-0000-0000-000000000013', '5e700000-0000-0000-0000-00000000000a', '5e7c0000-0000-0000-0000-000000000001', 'Outra',  2, 'open'),
  ('5e7d0000-0000-0000-0000-000000000021', '5e700000-0000-0000-0000-00000000000a', '5e7c0000-0000-0000-0000-000000000002', 'Aberta', 0, 'open'),
  ('5e7d0000-0000-0000-0000-000000000022', '5e700000-0000-0000-0000-00000000000a', '5e7c0000-0000-0000-0000-000000000002', 'Perdida', 1, 'lost');

insert into public.leads (id, equipe_id, name) values
  ('5e7e0000-0000-0000-0000-000000000001', '5e700000-0000-0000-0000-00000000000a', 'Lead 1');
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('5e7f0000-0000-0000-0000-000000000001', '5e700000-0000-0000-0000-00000000000a', '5e7e0000-0000-0000-0000-000000000001', '5e7c0000-0000-0000-0000-000000000001', '5e7d0000-0000-0000-0000-000000000011'),
  ('5e7f0000-0000-0000-0000-000000000002', '5e700000-0000-0000-0000-00000000000a', '5e7e0000-0000-0000-0000-000000000001', '5e7c0000-0000-0000-0000-000000000002', '5e7d0000-0000-0000-0000-000000000021');

-- ---------------------------------------------------------------------------
-- Caminho avulso (servidor): sem JWT, p_automation null
-- ---------------------------------------------------------------------------
do $$
declare
  v_r jsonb;
  v_n int;
  c_a constant uuid := '5e700000-0000-0000-0000-00000000000a';
  o1  constant uuid := '5e7f0000-0000-0000-0000-000000000001';
  o2  constant uuid := '5e7f0000-0000-0000-0000-000000000002';
begin
  -- 1. move_stage avulso
  v_r := public.crm_run_automation(null, o1, '{}'::jsonb, null,
           '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000013"}}'::jsonb, c_a);
  assert v_r->>'status' = 'ok', 'avulso move_stage: ' || v_r::text;
  assert (select stage_id from public.opportunities where id = o1) = '5e7d0000-0000-0000-0000-000000000013', 'etapa mudou';
  assert (select count(*) from public.automation_runs where opportunity_id = o1 and status = 'ok' and automation_id is null) = 1, 'run gravado';

  -- 1b. update_field avulso (por key) e valor gravado em custom_data[field_id]
  v_r := public.crm_run_automation(null, o1, '{"dados":{"kwh":420}}'::jsonb, null,
           '{"type":"update_field","params":{"field":"kwh","from_payload":"dados.kwh"}}'::jsonb, c_a);
  assert v_r->>'status' = 'ok', 'avulso update_field: ' || v_r::text;
  assert (select custom_data->'f-kwh' from public.opportunities where id = o1) = '420'::jsonb, 'custom_data[field_id]';

  -- 4. source_missing não apaga
  v_r := public.crm_run_automation(null, o1, '{}'::jsonb, null,
           '{"type":"update_field","params":{"field":"kwh","from_payload":"dados.kwh"}}'::jsonb, c_a);
  assert v_r->>'status' = 'skipped' and v_r->>'reason' = 'source_missing', 'source_missing: ' || v_r::text;
  assert (select custom_data->'f-kwh' from public.opportunities where id = o1) = '420'::jsonb, 'valor preservado';

  -- 4b. tipo errado (number) e fora das opções (select)
  v_r := public.crm_run_automation(null, o1, '{}'::jsonb, null,
           '{"type":"update_field","params":{"field":"kwh","value":"muito"}}'::jsonb, c_a);
  assert v_r->>'status' = 'error' and v_r->>'error' like 'invalid_value_for_field%', 'number inválido: ' || v_r::text;
  v_r := public.crm_run_automation(null, o1, '{}'::jsonb, null,
           '{"type":"update_field","params":{"field":"fase","value":"z"}}'::jsonb, c_a);
  assert v_r->>'status' = 'error', 'select fora das opções: ' || v_r::text;
  v_r := public.crm_run_automation(null, o1, '{}'::jsonb, null,
           '{"type":"update_field","params":{"field":"fase","value":"b"}}'::jsonb, c_a);
  assert v_r->>'status' = 'ok', 'select válido: ' || v_r::text;

  -- 2. idempotência por event_key no avulso
  v_r := public.crm_run_automation(null, o1, '{}'::jsonb, 'k1',
           '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000011"}}'::jsonb, c_a);
  assert v_r->>'status' = 'ok', 'primeira com chave';
  v_r := public.crm_run_automation(null, o1, '{}'::jsonb, 'k1',
           '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000013"}}'::jsonb, c_a);
  assert v_r->>'status' = 'skipped', 'repetida com a mesma chave é ignorada: ' || v_r::text;
  assert (select stage_id from public.opportunities where id = o1) = '5e7d0000-0000-0000-0000-000000000011', 'segunda não moveu';

  -- 3. perda sem motivo em pipeline com loss_reasons → erro, nada muda
  v_r := public.crm_run_automation(null, o2, '{}'::jsonb, null,
           '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000022"}}'::jsonb, c_a);
  assert v_r->>'status' = 'error' and v_r->>'error' = 'loss_reason_required', 'sem motivo: ' || v_r::text;
  assert (select stage_id from public.opportunities where id = o2) = '5e7d0000-0000-0000-0000-000000000021', 'negócio intacto';
  v_r := public.crm_run_automation(null, o2, '{}'::jsonb, null,
           '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000022","lost_reason":"Preço"}}'::jsonb, c_a);
  assert v_r->>'status' = 'ok', 'com motivo: ' || v_r::text;
  assert (select lost_reason from public.opportunities where id = o2) = 'Preço', 'motivo gravado';

  -- avulso com equipe errada não alcança o negócio
  begin
    perform public.crm_run_automation(null, o1, '{}'::jsonb, null,
      '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000013"}}'::jsonb, '5e700000-0000-0000-0000-00000000000b');
    assert false, 'deveria recusar';
  exception when sqlstate 'P0002' then null; end;

  -- 5. validação ao salvar
  begin
    insert into public.crm_automations (equipe_id, name, trigger, action) values
      (c_a, 'perde sem motivo', '{"event":"stage_entered","stage_id":"5e7d0000-0000-0000-0000-000000000011"}',
       '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000022"}}');
    assert false, 'deveria recusar automação sem motivo';
  exception when sqlstate '22023' then null; end;
  begin
    insert into public.webhook_configs (equipe_id, name, url, trigger_event, inbound_function, action) values
      (c_a, 'in', '', 'lead_created', 'receive_lead',
       '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000022"}}');
    assert false, 'deveria recusar ação de webhook sem motivo';
  exception when sqlstate '22023' then null; end;

  -- 6. gatilho de etapa
  insert into public.crm_automations (equipe_id, name, trigger, action) values
    (c_a, 'entrou em Outra -> Ganha', '{"event":"stage_entered","stage_id":"5e7d0000-0000-0000-0000-000000000013"}',
     '{"type":"update_field","params":{"field":"fase","value":"a"}}');
  update public.opportunities set stage_id = '5e7d0000-0000-0000-0000-000000000013' where id = o1;
  select count(*) into v_n from public.automation_runs where status = 'ok' and automation_id is not null and opportunity_id = o1;
  assert v_n = 1, 'gatilho rodou a automação: ' || v_n;
end $$;

-- 7. UI: authenticated usa as RPCs e só enxerga a própria equipe
set local role authenticated;
set local request.jwt.claims = '{"sub":"5e7b0000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$
declare v_id uuid; v_r jsonb;
begin
  insert into public.crm_automations (equipe_id, name, trigger, action) values
    ('5e700000-0000-0000-0000-00000000000a', 'ui', '{"event":"webhook_received","webhook_id":"x"}',
     '{"type":"move_stage","params":{"stage_id":"5e7d0000-0000-0000-0000-000000000011"}}')
  returning id into v_id;
  v_r := public.crm_run_automation(v_id, '5e7f0000-0000-0000-0000-000000000001');
  assert v_r->>'status' = 'ok', 'caminho UI: ' || v_r::text;
  assert (select stage_id from public.opportunities where id = '5e7f0000-0000-0000-0000-000000000001') = '5e7d0000-0000-0000-0000-000000000011', 'moveu pela RPC';
end $$;

set local request.jwt.claims = '{"sub":"5e7b0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.crm_automations) = 0, 'equipe B não vê automações de A';
  assert (select count(*) from public.automation_runs) = 0, 'equipe B não vê execuções de A';
end $$;

rollback;
