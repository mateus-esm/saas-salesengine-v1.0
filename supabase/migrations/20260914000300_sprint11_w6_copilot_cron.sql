-- Sprint 11 · Onda 6 · T60 — o despertador do Copilot.
--
-- `_copilot_tick()` roda pelo pg_cron a cada minuto e só acorda o agente quando
-- há trabalho vencido na fila (`copilot_jobs`): nada na fila, nenhuma chamada.
-- O endereço e o token do agente vêm do Vault (`copilot_agent_url`,
-- `copilot_agent_token`) — nunca desta migration, de script ou do texto do cron.
-- Sem os dois segredos, avisa e não chama.
--
-- O agendamento fica em supabase/scripts/2026-09-14_sprint11_schedule_copilot_tick.sql,
-- ligado no deploy (T67), depois do agente com COPILOT_JOBS_ENABLED=true.

create or replace function public._copilot_tick()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url   text;
  v_token text;
begin
  if not exists (select 1 from public.copilot_jobs where status = 'queued' and run_after <= clock_timestamp()) then
    return null;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'copilot_agent_url';
  select s.decrypted_secret into v_token from vault.decrypted_secrets s where s.name = 'copilot_agent_token';
  if nullif(btrim(v_url), '') is null or nullif(btrim(v_token), '') is null then
    raise warning 'copilot tick: faltam os segredos copilot_agent_url/copilot_agent_token no Vault';
    return null;
  end if;

  return net.http_post(
    url := rtrim(btrim(v_url), '/') || '/api/v1/jobs/tick',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Agent-Token', btrim(v_token)),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public._copilot_tick() from public, anon, authenticated;
grant execute on function public._copilot_tick() to service_role;
