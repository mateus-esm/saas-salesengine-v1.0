-- Sprint 11 · Onda 6 · T61 — o Sync só enfileira, na frente.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w6_copilot_sync.test.sql
--
-- O que este teste protege: o negócio pedido (ou o do contato) entra agora e na
-- frente, sem duplicar; o trabalho que esperava a conversa pausar passa a rodar
-- já; o pipeline de 1.000 negócios com 30 conversas novas vira 30 trabalhos; o
-- vendedor só enfileira os seus; equipe desligada e vizinho são barrados.

begin;

-- @include supabase/migrations/20260914000100_sprint11_w6_copilot_queue.sql
-- @include supabase/migrations/20260914000400_sprint11_w6_copilot_sync.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link, is_crm_agent_enabled) values
  ('5138a000-0000-0000-0000-000000000001', 'S11W6 Sync A', 'x', 'y', true),
  ('5138a000-0000-0000-0000-000000000002', 'S11W6 Sync B (desligada)', 'x', 'y', false);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5138b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w6-sync.test', 'x', now(), now()),
  ('5138b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bia@s11w6-sync.test',   'x', now(), now()),
  ('5138b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w6-sync.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5138b000-0000-0000-0000-00000000000a', '5138b000-0000-0000-0000-00000000000a', 'chefe@s11w6-sync.test',   '5138a000-0000-0000-0000-000000000001', 'Chefe', 'admin'),
  ('5138b000-0000-0000-0000-00000000000b', '5138b000-0000-0000-0000-00000000000b', 'bia@s11w6-sync.test',     '5138a000-0000-0000-0000-000000000001', 'Bia',   'user'),
  ('5138b000-0000-0000-0000-00000000000d', '5138b000-0000-0000-0000-00000000000d', 'vizinho@s11w6-sync.test', '5138a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;
insert into public.user_roles (user_id, role) values
  ('5138b000-0000-0000-0000-00000000000a', 'admin'),
  ('5138b000-0000-0000-0000-00000000000d', 'admin')
on conflict do nothing;

insert into public.pipelines (id, equipe_id, name) values
  ('5138c000-0000-0000-0000-000000000001', '5138a000-0000-0000-0000-000000000001', 'Mil negócios'),
  ('5138c000-0000-0000-0000-000000000002', '5138a000-0000-0000-0000-000000000002', 'Do vizinho');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5138d000-0000-0000-0000-000000000001', '5138a000-0000-0000-0000-000000000001', '5138c000-0000-0000-0000-000000000001', 'Novo', 0, 'open'),
  ('5138d000-0000-0000-0000-000000000002', '5138a000-0000-0000-0000-000000000001', '5138c000-0000-0000-0000-000000000001', 'Proposta', 1, 'open'),
  ('5138d000-0000-0000-0000-000000000003', '5138a000-0000-0000-0000-000000000002', '5138c000-0000-0000-0000-000000000002', 'Novo', 0, 'open');

-- 1.000 negócios; os 30 primeiros com conversa nova; o 1º já lido depois da última mensagem.
insert into public.leads (id, equipe_id, name)
select ('5138e000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '5138a000-0000-0000-0000-000000000001', 'Lead ' || g
  from generate_series(1, 1000) g;
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id)
select ('5138f000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '5138a000-0000-0000-0000-000000000001',
       ('5138e000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '5138c000-0000-0000-0000-000000000001',
       case when g <= 10 then '5138d000-0000-0000-0000-000000000002'::uuid else '5138d000-0000-0000-0000-000000000001'::uuid end,
       case when g % 2 = 0 then '5138b000-0000-0000-0000-00000000000b'::uuid else '5138b000-0000-0000-0000-00000000000a'::uuid end
  from generate_series(1, 1000) g;
insert into public.messages (lead_id, content, sender_type, created_at)
select ('5138e000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Oi', 'customer', now() - interval '1 hour'
  from generate_series(1, 31) g;
insert into public.copilot_memory (opportunity_id, equipe_id, last_message_at) values
  ('5138f000-0000-0000-0000-000000000001', '5138a000-0000-0000-0000-000000000001', now()),
  ('5138f000-0000-0000-0000-000000000031', '5138a000-0000-0000-0000-000000000001', now() - interval '2 hours');
-- O lead 31 foi lido antes da mensagem: conta. O 1 foi lido depois: não conta.
-- (a equipe não tem agente configurado na linha: o gatilho não enfileira nada aqui)

insert into public.leads (id, equipe_id, name) values ('5138e000-0000-0000-0000-999999999999', '5138a000-0000-0000-0000-000000000002', 'Vizinho');
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('5138f000-0000-0000-0000-999999999999', '5138a000-0000-0000-0000-000000000002', '5138e000-0000-0000-0000-999999999999',
   '5138c000-0000-0000-0000-000000000002', '5138d000-0000-0000-0000-000000000003');

set local role authenticated;
set local request.jwt.claims = '{"sub":"5138b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Um negócio: agora, na frente, sem duplicar; pelo contato também.
-- ============================================================================
do $$
declare r jsonb; j public.copilot_jobs;
begin
  r := public.crm_copilot_enqueue(p_opportunity_id => '5138f000-0000-0000-0000-000000000500');
  select * into j from public.copilot_jobs where id = (r->'job_ids'->>0)::uuid;
  assert (r->>'queued')::int = 1 and j.reason = 'manual' and j.priority = 10 and j.run_after <= clock_timestamp(),
    'T61-1 FAIL: o negocio pedido entra agora e na frente, veio ' || r::text;
  r := public.crm_copilot_enqueue(p_lead_id => '5138e000-0000-0000-0000-000000000500');
  assert (r->'job_ids'->>0)::uuid = j.id and (select count(*) from public.copilot_jobs where opportunity_id = '5138f000-0000-0000-0000-000000000500') = 1,
    'T61-1 FAIL: pelo contato, o mesmo trabalho, sem duplicar';
end $$;

-- ============================================================================
-- 2. O trabalho que esperava a conversa pausar passa a rodar já.
-- ============================================================================
reset role;
insert into public.copilot_jobs (equipe_id, opportunity_id, lead_id, reason, run_after) values
  ('5138a000-0000-0000-0000-000000000001', '5138f000-0000-0000-0000-000000000700', '5138e000-0000-0000-0000-000000000700',
   'conversation', clock_timestamp() + interval '10 minutes');
set local role authenticated;
do $$
begin
  perform public.crm_copilot_enqueue(p_opportunity_id => '5138f000-0000-0000-0000-000000000700');
  assert (select run_after <= clock_timestamp() and reason = 'manual' and priority = 10
            from public.copilot_jobs where opportunity_id = '5138f000-0000-0000-0000-000000000700' and status = 'queued'),
    'T61-2 FAIL: o pedido adianta o trabalho que esperava';
end $$;

-- ============================================================================
-- 3. O pipeline de 1.000: só as 30 conversas novas; a etapa: só as da etapa.
-- ============================================================================
do $$
declare r jsonb;
begin
  r := public.crm_copilot_enqueue(p_pipeline_id => '5138c000-0000-0000-0000-000000000001');
  assert (r->>'queued')::int = 30, 'T61-3 FAIL: 30 trabalhos (31 com mensagem, 1 ja lido), veio ' || (r->>'queued');
  assert (select count(*) from public.copilot_jobs j
           where j.id in (select (x #>> '{}')::uuid from jsonb_array_elements(r->'job_ids') x) and j.reason = 'sync_pipeline') = 30,
    'T61-3 FAIL: os trabalhos do pipeline';

  r := public.crm_copilot_enqueue(p_stage_id => '5138d000-0000-0000-0000-000000000002');
  assert (r->>'queued')::int = 9, 'T61-3 FAIL: a etapa Proposta tem 10, 1 ja lido: 9, veio ' || (r->>'queued');
end $$;

-- ============================================================================
-- 4. A vendedora só enfileira os seus; equipe desligada e vizinho barrados.
-- ============================================================================
reset role;
delete from public.copilot_jobs where equipe_id = '5138a000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"5138b000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare r jsonb; v_failed boolean := false;
begin
  r := public.crm_copilot_enqueue(p_pipeline_id => '5138c000-0000-0000-0000-000000000001');
  assert (r->>'queued')::int = 15, 'T61-4 FAIL: a Bia tem os pares (15 dos 30), veio ' || (r->>'queued');
  begin
    perform public.crm_copilot_enqueue(p_opportunity_id => '5138f000-0000-0000-0000-000000000003');
  exception when others then v_failed := sqlerrm like '%opportunity_not_found%';
  end;
  assert v_failed, 'T61-4 FAIL: a Bia enfileirou um negocio que nao e dela';
end $$;

set local request.jwt.claims = '{"sub":"5138b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.crm_copilot_enqueue(p_opportunity_id => '5138f000-0000-0000-0000-999999999999');
  exception when others then v_failed := sqlerrm like '%copilot_disabled%';
  end;
  assert v_failed, 'T61-4 FAIL: equipe com o Agente de CRM desligado enfileirou';
end $$;

rollback;
select 'PASS' as result;
