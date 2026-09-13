-- Sprint 11 · Onda 6 · T58 — a fila do Copilot, a espera e o contexto.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w6_copilot_queue.test.sql
--
-- O que este teste protege: a mensagem do cliente põe o negócio na fila depois da
-- espera e cada mensagem nova empurra; um trabalho por negócio; mensagem da equipe,
-- equipe desligada e linha sem agente não enfileiram; o Sync pedido não é
-- empurrado; o agente não pega o mesmo trabalho duas vezes e recupera o preso;
-- falha volta com espera até a 3ª tentativa; o teto do dia segura; o contexto traz
-- só as mensagens novas, as etapas, os campos com valor e o modo; o app não chama
-- os verbos do agente e não lê a fila do vizinho.

begin;

-- @include supabase/migrations/20260914000100_sprint11_w6_copilot_queue.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link, is_crm_agent_enabled) values
  ('5135a000-0000-0000-0000-000000000001', 'S11W6 Fila A', 'x', 'y', true),
  ('5135a000-0000-0000-0000-000000000002', 'S11W6 Fila B (desligada)', 'x', 'y', false);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5135b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w6-fila.test',   'x', now(), now()),
  ('5135b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w6-fila.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5135b000-0000-0000-0000-00000000000a', '5135b000-0000-0000-0000-00000000000a', 'chefe@s11w6-fila.test',   '5135a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5135b000-0000-0000-0000-00000000000d', '5135b000-0000-0000-0000-00000000000d', 'vizinho@s11w6-fila.test', '5135a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5135c000-0000-0000-0000-000000000001', '5135a000-0000-0000-0000-000000000001', 'Usinas', jsonb_build_array(
     jsonb_build_object('field_id', 'f-consumo', 'key', 'consumo_kwh', 'label', 'Consumo (kWh)', 'type', 'number', 'position', 0),
     jsonb_build_object('field_id', 'f-telhado', 'key', 'telhado', 'label', 'Telhado', 'type', 'select', 'options', jsonb_build_array('cerâmica', 'metálico'), 'position', 1),
     jsonb_build_object('field_id', 'f-endereco', 'key', 'endereco', 'label', 'Endereço', 'type', 'address', 'position', 2),
     jsonb_build_object('field_id', 'f-velho', 'key', 'velho', 'label', 'Velho', 'type', 'text', 'position', 3, 'is_deleted', true))),
  ('5135c000-0000-0000-0000-000000000002', '5135a000-0000-0000-0000-000000000001', 'Sem agente', '[]'),
  ('5135c000-0000-0000-0000-000000000003', '5135a000-0000-0000-0000-000000000002', 'Do vizinho', '[]');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5135d000-0000-0000-0000-000000000001', '5135a000-0000-0000-0000-000000000001', '5135c000-0000-0000-0000-000000000001', 'Novo',     0, 'open', null),
  ('5135d000-0000-0000-0000-000000000002', '5135a000-0000-0000-0000-000000000001', '5135c000-0000-0000-0000-000000000001', 'Proposta', 1, 'open', 'proposal_sent'),
  ('5135d000-0000-0000-0000-000000000003', '5135a000-0000-0000-0000-000000000001', '5135c000-0000-0000-0000-000000000001', 'Ganho',    2, 'won',  null),
  ('5135d000-0000-0000-0000-000000000004', '5135a000-0000-0000-0000-000000000001', '5135c000-0000-0000-0000-000000000002', 'Novo',     0, 'open', null),
  ('5135d000-0000-0000-0000-000000000005', '5135a000-0000-0000-0000-000000000002', '5135c000-0000-0000-0000-000000000003', 'Novo',     0, 'open', null);

insert into public.copilot_agents (equipe_id, pipeline_id, scope, name, autonomy_mode) values
  ('5135a000-0000-0000-0000-000000000001', '5135c000-0000-0000-0000-000000000001', 'pipeline', 'Copilot Usinas', 'autonomous'),
  ('5135a000-0000-0000-0000-000000000002', '5135c000-0000-0000-0000-000000000003', 'pipeline', 'Copilot vizinho', 'autonomous');
insert into public.pipeline_agent_rules (equipe_id, pipeline_id, cooldown_minutes, confidence_threshold, daily_run_cap) values
  ('5135a000-0000-0000-0000-000000000001', '5135c000-0000-0000-0000-000000000001', 1, 0.8, 2);

insert into public.leads (id, equipe_id, name, tags) values
  ('5135e000-0000-0000-0000-000000000001', '5135a000-0000-0000-0000-000000000001', '[Novo Contato - WhatsApp]', array['solar']),
  ('5135e000-0000-0000-0000-000000000002', '5135a000-0000-0000-0000-000000000001', 'Sem agente', null),
  ('5135e000-0000-0000-0000-000000000003', '5135a000-0000-0000-0000-000000000002', 'Do vizinho', null),
  ('5135e000-0000-0000-0000-000000000004', '5135a000-0000-0000-0000-000000000001', 'Outro da A', null),
  ('5135e000-0000-0000-0000-000000000005', '5135a000-0000-0000-0000-000000000001', 'Terceiro da A', null);
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, custom_data) values
  ('5135f000-0000-0000-0000-000000000001', '5135a000-0000-0000-0000-000000000001', '5135e000-0000-0000-0000-000000000001',
   '5135c000-0000-0000-0000-000000000001', '5135d000-0000-0000-0000-000000000001', '{"f-consumo": 450}'),
  ('5135f000-0000-0000-0000-000000000002', '5135a000-0000-0000-0000-000000000001', '5135e000-0000-0000-0000-000000000002',
   '5135c000-0000-0000-0000-000000000002', '5135d000-0000-0000-0000-000000000004', '{}'),
  ('5135f000-0000-0000-0000-000000000003', '5135a000-0000-0000-0000-000000000002', '5135e000-0000-0000-0000-000000000003',
   '5135c000-0000-0000-0000-000000000003', '5135d000-0000-0000-0000-000000000005', '{}'),
  ('5135f000-0000-0000-0000-000000000004', '5135a000-0000-0000-0000-000000000001', '5135e000-0000-0000-0000-000000000004',
   '5135c000-0000-0000-0000-000000000001', '5135d000-0000-0000-0000-000000000001', '{}'),
  ('5135f000-0000-0000-0000-000000000005', '5135a000-0000-0000-0000-000000000001', '5135e000-0000-0000-0000-000000000005',
   '5135c000-0000-0000-0000-000000000001', '5135d000-0000-0000-0000-000000000001', '{}');

-- ============================================================================
-- 1. A espera: a mensagem do cliente enfileira; cada nova empurra; uma por negócio.
-- ============================================================================
do $$
declare v_first timestamptz; v_second timestamptz;
begin
  insert into public.messages (lead_id, content, sender_type, created_at) values ('5135e000-0000-0000-0000-000000000001', 'Oi, quero orçamento', 'customer', now() - interval '2 minutes');
  select run_after into v_first from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000001' and status = 'queued';
  -- A espera configurada é 1 min: vale o mínimo de 5.
  assert v_first between clock_timestamp() + interval '4 minutes' and clock_timestamp() + interval '6 minutes',
    'T58-1 FAIL: a espera minima de 5 min, veio ' || coalesce(v_first::text, 'null');

  perform pg_sleep(0.02);
  insert into public.messages (lead_id, content, sender_type, created_at) values ('5135e000-0000-0000-0000-000000000001', 'Minha conta é 450 kWh', 'customer', now() - interval '1 minute');
  select run_after into v_second from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000001' and status = 'queued';
  assert v_second > v_first, 'T58-1 FAIL: a mensagem nova deveria empurrar a espera';
  assert (select count(*) from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000001') = 1,
    'T58-1 FAIL: um trabalho por negocio';

  -- Mensagem da equipe, linha sem agente, equipe desligada: nada.
  insert into public.messages (lead_id, content, sender_type) values
    ('5135e000-0000-0000-0000-000000000004', 'Olá, sou a Ana', 'member'),
    ('5135e000-0000-0000-0000-000000000002', 'Oi', 'customer'),
    ('5135e000-0000-0000-0000-000000000003', 'Oi', 'customer');
  assert not exists (select 1 from public.copilot_jobs where opportunity_id in (
           '5135f000-0000-0000-0000-000000000002', '5135f000-0000-0000-0000-000000000003', '5135f000-0000-0000-0000-000000000004')),
    'T58-1 FAIL: enfileirou onde nao devia';
end $$;

-- ============================================================================
-- 2. O Sync pedido entra na frente e não é empurrado por mensagem nova.
-- ============================================================================
do $$
declare v_at timestamptz;
begin
  insert into public.copilot_jobs (equipe_id, opportunity_id, lead_id, reason, priority, run_after)
  values ('5135a000-0000-0000-0000-000000000001', '5135f000-0000-0000-0000-000000000004',
          '5135e000-0000-0000-0000-000000000004', 'manual', 10, clock_timestamp() - interval '1 second')
  returning run_after into v_at;
  insert into public.messages (lead_id, content, sender_type) values ('5135e000-0000-0000-0000-000000000004', 'Oi', 'customer');
  assert (select run_after from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000004' and status = 'queued') = v_at
     and (select reason from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000004' and status = 'queued') = 'manual',
    'T58-2 FAIL: o Sync pedido foi empurrado';
end $$;

-- ============================================================================
-- 3. Pegar, devolver, recuperar o preso, tentar de novo e o teto do dia.
-- ============================================================================
do $$
declare j public.copilot_jobs; n int; v text;
begin
  update public.copilot_jobs set run_after = clock_timestamp() - interval '1 minute'
   where opportunity_id = '5135f000-0000-0000-0000-000000000001';

  select count(*) into n from public.crm_copilot_claim(10);
  assert n = 2, 'T58-3 FAIL: pegaria os 2 vencidos, pegou ' || n;
  assert (select priority from public.copilot_jobs where status = 'running' order by claimed_at, priority desc limit 1) = 10,
    'T58-3 FAIL: o Sync pedido vem primeiro';
  select count(*) into n from public.crm_copilot_claim(10);
  assert n = 0, 'T58-3 FAIL: pegou o mesmo trabalho duas vezes';

  -- Falhou: volta para a fila com espera (tentativa 1 → 1 min).
  select * into j from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000001' and status = 'running';
  v := public.crm_copilot_finish(j.id, 'failed', 'provedor recusou');
  assert v = 'queued' and (select run_after > clock_timestamp() + interval '50 seconds' from public.copilot_jobs where id = j.id),
    'T58-3 FAIL: a falha deveria voltar para a fila com espera, veio ' || v;

  -- Preso há 6 min: volta para a fila.
  update public.copilot_jobs set run_after = clock_timestamp() - interval '1 minute' where id = j.id;
  perform public.crm_copilot_claim(1);
  update public.copilot_jobs set claimed_at = clock_timestamp() - interval '6 minutes' where id = j.id;
  select count(*) into n from public.crm_copilot_claim(10);
  assert (select attempts from public.copilot_jobs where id = j.id) = 3 and n = 1,
    'T58-3 FAIL: o preso deveria voltar e ser pego de novo (3a tentativa)';
  v := public.crm_copilot_finish(j.id, 'failed', 'de novo');
  assert v = 'failed', 'T58-3 FAIL: a 3a falha e final, veio ' || v;

  -- O manual termina bem.
  select * into j from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000004' and status = 'running';
  assert public.crm_copilot_finish(j.id, 'done', null, '{"applied": 2}') = 'done', 'T58-3 FAIL: done';
  assert public.crm_copilot_finish(j.id, 'done') = 'not_running', 'T58-3 FAIL: fechar duas vezes';

  -- Teto do dia (2 passadas na linha): a terceira espera amanhã, dizendo por quê.
  insert into public.copilot_jobs (equipe_id, opportunity_id, lead_id, reason, run_after)
  values ('5135a000-0000-0000-0000-000000000001', '5135f000-0000-0000-0000-000000000005',
          '5135e000-0000-0000-0000-000000000005', 'conversation', clock_timestamp() - interval '1 second');
  select count(*) into n from public.crm_copilot_claim(10);
  assert n = 0 and (select last_error from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000005') like 'teto%'
     and (select run_after > clock_timestamp() + interval '1 hour' from public.copilot_jobs where opportunity_id = '5135f000-0000-0000-0000-000000000005'),
    'T58-3 FAIL: o teto do dia deveria segurar';
end $$;

-- ============================================================================
-- 4. O contexto: só o que é novo, etapas, campos com valor, modo e limiar.
-- ============================================================================
do $$
declare c jsonb;
begin
  insert into public.copilot_memory (opportunity_id, equipe_id, summary, last_message_at)
  values ('5135f000-0000-0000-0000-000000000001', '5135a000-0000-0000-0000-000000000001', 'Quer orçamento.',
          (select min(created_at) from public.messages where lead_id = '5135e000-0000-0000-0000-000000000001'));
  c := public.crm_copilot_context('5135f000-0000-0000-0000-000000000001');

  assert jsonb_array_length(c->'messages') = 1 and c->'messages'->0->>'text' = 'Minha conta é 450 kWh',
    'T58-4 FAIL: so a mensagem nova, veio ' || (c->'messages')::text;
  assert (c->>'last_message_at')::timestamptz = (select max(created_at) from public.messages where lead_id = '5135e000-0000-0000-0000-000000000001'),
    'T58-4 FAIL: o cursor da leitura';
  assert jsonb_array_length(c->'stages') = 3 and (c->'stages'->0->>'current')::boolean
     and c->'stages'->1->>'funnel_event' = 'proposal_sent',
    'T58-4 FAIL: as etapas, veio ' || (c->'stages')::text;
  assert (select array_agg(f->>'field_id' order by f->>'field_id') from jsonb_array_elements(c->'fields') f) = array['f-consumo', 'f-telhado']
     and (select (f->>'value')::numeric from jsonb_array_elements(c->'fields') f where f->>'field_id' = 'f-consumo') = 450,
    'T58-4 FAIL: campos que o Copilot preenche (sem endereco, sem apagado), com valor, veio ' || (c->'fields')::text;
  assert (c->'lead'->>'name_is_placeholder')::boolean and c->'memory'->>'summary' = 'Quer orçamento.'
     and c->'settings'->>'mode' = 'autonomous' and (c->'settings'->>'threshold')::numeric = 0.8
     and c->'team_tags' ? 'solar',
    'T58-4 FAIL: contato, memoria, modo e limiar, veio ' || c::text;

  -- Linha sem agente: tudo vira sugestão.
  assert public.crm_copilot_context('5135f000-0000-0000-0000-000000000002')->'settings'->>'mode' = 'suggest',
    'T58-4 FAIL: sem agente, sugerir';
end $$;

-- ============================================================================
-- 5. O app não chama os verbos do agente e não lê a fila do vizinho.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5135b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.crm_copilot_context('5135f000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T58-5 FAIL: o app chamou o contexto do agente';
  assert not exists (select 1 from public.copilot_jobs) and not exists (select 1 from public.copilot_memory),
    'T58-5 FAIL: o vizinho le a fila ou a memoria da equipe A';
end $$;

rollback;
select 'PASS' as result;
