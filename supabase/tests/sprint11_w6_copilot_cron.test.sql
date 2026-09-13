-- Sprint 11 · Onda 6 · T60 — o despertador só chama quando há trabalho e segredo.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w6_copilot_cron.test.sql
--
-- O que este teste protege: fila vazia (ou só trabalho futuro) → nenhuma chamada;
-- trabalho vencido sem os segredos do Vault → nenhuma chamada; com os segredos → a
-- requisição é enfileirada no pg_net (em rollback: nunca sai). O app não chama.

begin;

-- @include supabase/migrations/20260914000100_sprint11_w6_copilot_queue.sql
-- @include supabase/migrations/20260914000300_sprint11_w6_copilot_cron.sql

insert into public.equipes (id, nome, crm_link, suporte_link, is_crm_agent_enabled) values
  ('5137a000-0000-0000-0000-000000000001', 'S11W6 Despertador', 'x', 'y', true);
insert into public.pipelines (id, equipe_id, name) values
  ('5137c000-0000-0000-0000-000000000001', '5137a000-0000-0000-0000-000000000001', 'Linha');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5137d000-0000-0000-0000-000000000001', '5137a000-0000-0000-0000-000000000001', '5137c000-0000-0000-0000-000000000001', 'Novo', 0, 'open');
insert into public.leads (id, equipe_id, name) values
  ('5137e000-0000-0000-0000-000000000001', '5137a000-0000-0000-0000-000000000001', 'Lead');
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('5137f000-0000-0000-0000-000000000001', '5137a000-0000-0000-0000-000000000001', '5137e000-0000-0000-0000-000000000001',
   '5137c000-0000-0000-0000-000000000001', '5137d000-0000-0000-0000-000000000001');

-- A produção pode já ter trabalho vencido de verdade: o teste olha só o que ele cria.
create temp table t60_before as select id from public.copilot_jobs where status = 'queued' and run_after <= clock_timestamp();
update public.copilot_jobs set run_after = run_after + interval '1 day' where id in (select id from t60_before);

do $$
declare v bigint; n_before bigint;
begin
  -- Trabalho só no futuro: nenhuma chamada.
  insert into public.copilot_jobs (equipe_id, opportunity_id, lead_id, reason, run_after)
  values ('5137a000-0000-0000-0000-000000000001', '5137f000-0000-0000-0000-000000000001',
          '5137e000-0000-0000-0000-000000000001', 'conversation', clock_timestamp() + interval '10 minutes');
  assert public._copilot_tick() is null, 'T60 FAIL: chamou sem trabalho vencido';

  -- Vencido, mas sem os segredos: nenhuma chamada.
  update public.copilot_jobs set run_after = clock_timestamp() - interval '1 second'
   where opportunity_id = '5137f000-0000-0000-0000-000000000001';
  if not exists (select 1 from vault.decrypted_secrets where name in ('copilot_agent_url', 'copilot_agent_token')) then
    assert public._copilot_tick() is null, 'T60 FAIL: chamou sem os segredos';

    -- Com os segredos (desta transação, que volta atrás): a requisição entra no pg_net.
    perform vault.create_secret('https://agent.example.test/', 'copilot_agent_url');
    perform vault.create_secret('token-de-teste', 'copilot_agent_token');
    select count(*) into n_before from net.http_request_queue;
    v := public._copilot_tick();
    assert v is not null and (select count(*) from net.http_request_queue) = n_before + 1,
      'T60 FAIL: com trabalho e segredos, a chamada deveria entrar na fila do pg_net';
    assert exists (select 1 from net.http_request_queue where id = v and url = 'https://agent.example.test/api/v1/jobs/tick'
                    and headers->>'X-Agent-Token' = 'token-de-teste'),
      'T60 FAIL: o endereco e o cabecalho do agente';
  end if;
end $$;

set local role authenticated;
do $$
declare v_failed boolean := false;
begin
  begin
    perform public._copilot_tick();
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T60 FAIL: o app chamou o despertador';
end $$;

rollback;
select 'PASS' as result;
