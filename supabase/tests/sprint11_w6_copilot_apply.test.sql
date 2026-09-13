-- Sprint 11 · Onda 6 · T59 — aplicar, desfazer e aprovar.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w6_copilot_apply.test.sql
--
-- O que este teste protege: cada ação segura com confiança é aplicada (e cobrada
-- uma vez); a arriscada, a de confiança baixa e a etiqueta nova pedem aprovação; a
-- inválida é recusada com o motivo sem levar as outras; mover etapa grava o
-- histórico como Copilot e o marco; o resumo e o cursor ficam; desfazer volta ao
-- que era — e recusa se alguém mexeu depois; aprovar aplica, recusar arquiva, a
-- sugestão velha fica desatualizada; observar só registra, sugerir só pede; sem
-- crédito vira pedido; o app não chama o aplicar e o vizinho não desfaz nada.

begin;

-- @include supabase/migrations/20260914000100_sprint11_w6_copilot_queue.sql
-- @include supabase/migrations/20260914000200_sprint11_w6_copilot_apply.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link, is_crm_agent_enabled) values
  ('5136a000-0000-0000-0000-000000000001', 'S11W6 Aplicar A', 'x', 'y', true),
  ('5136a000-0000-0000-0000-000000000002', 'S11W6 Aplicar B', 'x', 'y', true);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5136b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w6-apl.test',   'x', now(), now()),
  ('5136b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w6-apl.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5136b000-0000-0000-0000-00000000000a', '5136b000-0000-0000-0000-00000000000a', 'chefe@s11w6-apl.test',   '5136a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5136b000-0000-0000-0000-00000000000d', '5136b000-0000-0000-0000-00000000000d', 'vizinho@s11w6-apl.test', '5136a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.credit_ledger (equipe_id, entry_type, credits, source, pool, idempotency_key) values
  ('5136a000-0000-0000-0000-000000000001', 'topup', 100, 'test', 'copilot', 's11w6_t59_topup');

insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5136c000-0000-0000-0000-000000000001', '5136a000-0000-0000-0000-000000000001', 'Usinas', jsonb_build_array(
     jsonb_build_object('field_id', 'f-consumo', 'key', 'consumo_kwh', 'label', 'Consumo (kWh)', 'type', 'number'),
     jsonb_build_object('field_id', 'f-telhado', 'key', 'telhado', 'label', 'Telhado', 'type', 'select', 'options', jsonb_build_array('cerâmica', 'metálico')))),
  ('5136c000-0000-0000-0000-000000000002', '5136a000-0000-0000-0000-000000000001', 'Observar', '[]'),
  ('5136c000-0000-0000-0000-000000000003', '5136a000-0000-0000-0000-000000000002', 'Sem crédito', '[]');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5136d000-0000-0000-0000-000000000001', '5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000001', 'Novo',        0, 'open', null),
  ('5136d000-0000-0000-0000-000000000002', '5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000001', 'Qualificado', 1, 'open', 'qualified'),
  ('5136d000-0000-0000-0000-000000000003', '5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000001', 'Ganho',       2, 'won',  null),
  ('5136d000-0000-0000-0000-000000000004', '5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000001', 'Perdido',     3, 'lost', null),
  ('5136d000-0000-0000-0000-000000000005', '5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000002', 'Novo',        0, 'open', null),
  ('5136d000-0000-0000-0000-000000000006', '5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000002', 'Depois',      1, 'open', null),
  ('5136d000-0000-0000-0000-000000000007', '5136a000-0000-0000-0000-000000000002', '5136c000-0000-0000-0000-000000000003', 'Novo',        0, 'open', null);

insert into public.copilot_agents (equipe_id, pipeline_id, scope, name, autonomy_mode) values
  ('5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000001', 'pipeline', 'Usinas', 'autonomous'),
  ('5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000002', 'pipeline', 'Observar', 'observe'),
  ('5136a000-0000-0000-0000-000000000002', '5136c000-0000-0000-0000-000000000003', 'pipeline', 'Sem crédito', 'autonomous');
insert into public.pipeline_agent_rules (equipe_id, pipeline_id, confidence_threshold) values
  ('5136a000-0000-0000-0000-000000000001', '5136c000-0000-0000-0000-000000000001', 0.7);

insert into public.leads (id, equipe_id, name, tags) values
  ('5136e000-0000-0000-0000-000000000001', '5136a000-0000-0000-0000-000000000001', '[Novo Contato - WhatsApp]', null),
  ('5136e000-0000-0000-0000-000000000002', '5136a000-0000-0000-0000-000000000001', 'Já tem solar', array['solar']),
  ('5136e000-0000-0000-0000-000000000003', '5136a000-0000-0000-0000-000000000001', 'Observado', null),
  ('5136e000-0000-0000-0000-000000000004', '5136a000-0000-0000-0000-000000000002', 'Sem crédito', null);
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, owner_id, custom_data) values
  ('5136f000-0000-0000-0000-000000000001', '5136a000-0000-0000-0000-000000000001', '5136e000-0000-0000-0000-000000000001',
   '5136c000-0000-0000-0000-000000000001', '5136d000-0000-0000-0000-000000000001', 0, '5136b000-0000-0000-0000-00000000000a', '{}'),
  ('5136f000-0000-0000-0000-000000000003', '5136a000-0000-0000-0000-000000000001', '5136e000-0000-0000-0000-000000000003',
   '5136c000-0000-0000-0000-000000000002', '5136d000-0000-0000-0000-000000000005', 0, null, '{}'),
  ('5136f000-0000-0000-0000-000000000004', '5136a000-0000-0000-0000-000000000002', '5136e000-0000-0000-0000-000000000004',
   '5136c000-0000-0000-0000-000000000003', '5136d000-0000-0000-0000-000000000007', 0, null, '{}');

create temp table t59 (k text primary key, val uuid);
grant all on t59 to authenticated;

-- ============================================================================
-- 1. Uma passada no modo autônomo.
-- ============================================================================
do $$
declare r jsonb; v_opp public.opportunities; v_lead public.leads;
begin
  r := public.crm_copilot_apply('5136f000-0000-0000-0000-000000000001', '51360000-0000-0000-0000-0000000000a1', jsonb_build_array(
         jsonb_build_object('type', 'note', 'text', 'Cliente quer orçamento para uma conta de 450 kWh.', 'confidence', 0.9),
         jsonb_build_object('type', 'set_field', 'field_id', 'f-consumo', 'value', '450', 'confidence', 0.9),
         jsonb_build_object('type', 'set_field', 'field_id', 'f-telhado', 'value', 'CERÂMICA', 'confidence', 0.9),
         jsonb_build_object('type', 'set_field', 'field_id', 'tipo_telhado', 'value', 'x', 'confidence', 0.9),
         jsonb_build_object('type', 'set_contact', 'attribute', 'name', 'value', 'Maria Souza', 'confidence', 0.9),
         jsonb_build_object('type', 'create_task', 'title', 'Enviar proposta', 'confidence', 0.9),
         jsonb_build_object('type', 'create_task', 'title', 'enviar proposta', 'confidence', 0.9),
         jsonb_build_object('type', 'add_tag', 'tag', 'solar', 'confidence', 0.9),
         jsonb_build_object('type', 'add_tag', 'tag', 'vip', 'confidence', 0.9),
         jsonb_build_object('type', 'move_stage', 'stage_id', '5136d000-0000-0000-0000-000000000002', 'confidence', 0.9),
         jsonb_build_object('type', 'set_value', 'value', '42.000,00', 'confidence', 0.95),
         jsonb_build_object('type', 'note', 'text', 'Talvez tenha interesse em bateria.', 'confidence', 0.4),
         jsonb_build_object('type', 'explode')),
       'Maria quer orçamento; conta de 450 kWh; telhado cerâmico.', 0.85,
       now() - interval '1 minute', 'deepseek-v4-flash');

  assert jsonb_array_length(r->'applied') = 7,
    'T59-1 FAIL: 7 aplicadas (nota, 2 campos, nome, tarefa, etiqueta, etapa), veio ' || (r->'applied')::text;
  assert (select array_agg(x->>'why' order by (x->>'index')::int) from jsonb_array_elements(r->'pending') x)
         = array['risky', 'risky', 'low_confidence'],
    'T59-1 FAIL: pedem aprovacao a etiqueta nova, o valor e a de confianca baixa, veio ' || (r->'pending')::text;
  assert (select array_agg(x->>'reason' order by (x->>'index')::int) from jsonb_array_elements(r->'rejected') x)
         = array['unknown_field', 'duplicate', 'unknown_type'],
    'T59-1 FAIL: recusadas com motivo, veio ' || (r->'rejected')::text;

  select * into v_opp from public.opportunities where id = '5136f000-0000-0000-0000-000000000001';
  select * into v_lead from public.leads where id = '5136e000-0000-0000-0000-000000000001';
  assert v_opp.custom_data = '{"f-consumo": 450, "f-telhado": "cerâmica"}'::jsonb,
    'T59-1 FAIL: os campos pelo tipo, veio ' || v_opp.custom_data::text;
  assert v_lead.name = 'Maria Souza' and v_lead.tags = array['solar'] and v_opp.value = 0,
    'T59-1 FAIL: nome, etiqueta e valor intacto';
  assert v_opp.stage_id = '5136d000-0000-0000-0000-000000000002'
     and (select changed_by_type from public.opportunity_stage_history
           where opportunity_id = v_opp.id order by changed_at desc, id desc limit 1) = 'copilot',
    'T59-1 FAIL: a etapa andou e o historico diz Copilot';
  assert exists (select 1 from public.funnel_events where opportunity_id = v_opp.id and event = 'qualified'),
    'T59-1 FAIL: a etapa de marco grava o marco';
  assert exists (select 1 from public.tasks where lead_id = v_lead.id and title = 'Enviar proposta' and status = 'a_fazer'
                  and assigned_to = '5136b000-0000-0000-0000-00000000000a'),
    'T59-1 FAIL: a tarefa com o status do banco e o dono do negocio';
  assert (select count(*) from public.agent_action_ledger
           where equipe_id = '5136a000-0000-0000-0000-000000000001' and idempotency_key like 'copilot:51360000-0000-0000-0000-0000000000a1:%') = 7,
    'T59-1 FAIL: cobra so as 7 aplicadas';
  assert (select summary from public.copilot_memory where opportunity_id = v_opp.id) like 'Maria quer%'
     and (select last_message_at from public.copilot_memory where opportunity_id = v_opp.id) is not null,
    'T59-1 FAIL: resumo e cursor';
  assert (select count(*) from public.ai_decisions where opportunity_id = v_opp.id and agent_role = 'copilot') = 10
     and exists (select 1 from public.ai_decisions where opportunity_id = v_opp.id and output_action->>'label' = 'Valor: R$ 42000,00'),
    'T59-1 FAIL: uma decisao por acao valida, com o rotulo em portugues';

  insert into t59 values
    ('stage', (select id from public.ai_decisions where opportunity_id = v_opp.id and output_action->'action'->>'type' = 'move_stage')),
    ('consumo', (select id from public.ai_decisions where opportunity_id = v_opp.id and output_action->'action'->>'field_id' = 'f-consumo')),
    ('task', (select id from public.ai_decisions where opportunity_id = v_opp.id and output_action->'action'->>'type' = 'create_task')),
    ('value', (select id from public.ai_decisions where opportunity_id = v_opp.id and output_action->'action'->>'type' = 'set_value')),
    ('vip', (select id from public.ai_decisions where opportunity_id = v_opp.id and output_action->'action'->>'tag' = 'vip'));

  -- Segunda passada: trocar o consumo já preenchido pede aprovação; ganhar também.
  r := public.crm_copilot_apply('5136f000-0000-0000-0000-000000000001', '51360000-0000-0000-0000-0000000000a2', jsonb_build_array(
         jsonb_build_object('type', 'set_field', 'field_id', 'f-consumo', 'value', 500, 'confidence', 0.95),
         jsonb_build_object('type', 'set_outcome', 'outcome', 'won', 'confidence', 0.99),
         jsonb_build_object('type', 'move_stage', 'stage_id', '5136d000-0000-0000-0000-000000000003', 'confidence', 0.99)),
       null, 0.9, now(), 'deepseek-v4-flash');
  assert jsonb_array_length(r->'applied') = 0 and jsonb_array_length(r->'pending') = 3,
    'T59-1 FAIL: trocar valor preenchido, ganhar e ir para etapa de ganho pedem aprovacao, veio ' || r::text;
  insert into t59 values
    ('won', (select id from public.ai_decisions where opportunity_id = '5136f000-0000-0000-0000-000000000001' and output_action->'action'->>'type' = 'set_outcome')),
    ('to_won_stage', (select id from public.ai_decisions where opportunity_id = '5136f000-0000-0000-0000-000000000001'
                        and output_action->'action'->>'stage_id' = '5136d000-0000-0000-0000-000000000003'));
end $$;

-- ============================================================================
-- 2. Observar só registra; sem crédito, pede.
-- ============================================================================
do $$
declare r jsonb;
begin
  r := public.crm_copilot_apply('5136f000-0000-0000-0000-000000000003', '51360000-0000-0000-0000-0000000000b1', jsonb_build_array(
         jsonb_build_object('type', 'move_stage', 'stage_id', '5136d000-0000-0000-0000-000000000006', 'confidence', 0.99)),
       'Observado.', 0.99, now(), null);
  assert r->>'mode' = 'observe' and jsonb_array_length(r->'proposed') = 1 and jsonb_array_length(r->'applied') = 0
     and (select stage_id from public.opportunities where id = '5136f000-0000-0000-0000-000000000003') = '5136d000-0000-0000-0000-000000000005',
    'T59-2 FAIL: observar nao mexe, veio ' || r::text;

  r := public.crm_copilot_apply('5136f000-0000-0000-0000-000000000004', '51360000-0000-0000-0000-0000000000c1', jsonb_build_array(
         jsonb_build_object('type', 'note', 'text', 'Sem crédito.', 'confidence', 0.99)),
       null, 0.99, now(), null);
  assert (r->'pending'->0->>'why') = 'no_credits' and jsonb_array_length(r->'applied') = 0,
    'T59-2 FAIL: sem credito vira pedido, veio ' || r::text;
end $$;

-- ============================================================================
-- 3. Pela tela: desfazer, aprovar, recusar, desatualizada.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5136b000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare r jsonb;
begin
  -- Desfazer a etapa: volta para Novo.
  r := public.crm_copilot_undo((select val from t59 where k = 'stage'));
  assert (r->>'ok')::boolean and (select stage_id from public.opportunities where id = '5136f000-0000-0000-0000-000000000001') = '5136d000-0000-0000-0000-000000000001',
    'T59-3 FAIL: desfazer a etapa, veio ' || r::text;
  assert public.crm_copilot_undo((select val from t59 where k = 'stage'))->>'reason' = 'not_applied',
    'T59-3 FAIL: desfazer duas vezes';

  -- Desfazer a tarefa: some.
  r := public.crm_copilot_undo((select val from t59 where k = 'task'));
  assert (r->>'ok')::boolean and not exists (select 1 from public.tasks where lead_id = '5136e000-0000-0000-0000-000000000001'),
    'T59-3 FAIL: desfazer a tarefa';

  -- Alguém mexeu no consumo depois: desfazer recusa.
  update public.opportunities set custom_data = custom_data || '{"f-consumo": 470}' where id = '5136f000-0000-0000-0000-000000000001';
  assert public.crm_copilot_undo((select val from t59 where k = 'consumo'))->>'reason' = 'changed_since',
    'T59-3 FAIL: desfazer depois de alguem mexer';

  -- Aprovar o valor; recusar a etiqueta nova.
  r := public.crm_copilot_resolve((select val from t59 where k = 'value'), true);
  assert r->>'status' = 'executed' and (select value from public.opportunities where id = '5136f000-0000-0000-0000-000000000001') = 42000,
    'T59-3 FAIL: aprovar o valor, veio ' || r::text;
  r := public.crm_copilot_resolve((select val from t59 where k = 'vip'), false);
  assert r->>'status' = 'rejected'
     and not exists (select 1 from public.leads where id = '5136e000-0000-0000-0000-000000000001' and 'vip' = any (coalesce(tags, array[]::text[]))),
    'T59-3 FAIL: recusar a etiqueta';

  -- A sugestão de ir para "Ganho" foi feita com o negócio em "Qualificado"; hoje ele
  -- está em "Novo" (desfeito acima): desatualizada.
  r := public.crm_copilot_resolve((select val from t59 where k = 'to_won_stage'), true);
  assert r->>'reason' = 'stale' and (select status from public.ai_decisions where id = (select val from t59 where k = 'to_won_stage')) = 'stale',
    'T59-3 FAIL: sugestao velha fica desatualizada, veio ' || r::text;
end $$;

-- O vizinho não aprova nem desfaz nada da equipe A; o app não chama o aplicar.
set local request.jwt.claims = '{"sub":"5136b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.crm_copilot_resolve((select val from t59 where k = 'won'), true);
  exception when others then v_failed := sqlerrm like '%decision_not_found%';
  end;
  assert v_failed, 'T59-4 FAIL: o vizinho aprovou uma decisao da equipe A';
  v_failed := false;
  begin
    perform public.crm_copilot_apply('5136f000-0000-0000-0000-000000000001', gen_random_uuid(), '[]');
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T59-4 FAIL: o app chamou o aplicar do agente';
end $$;

rollback;
select 'PASS' as result;
