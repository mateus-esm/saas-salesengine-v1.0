-- Sprint 11 · Onda 6 · T60 — ligar o despertador do Copilot (pg_cron → _copilot_tick → agente).
--
-- QUANDO: no T67, depois de
--   1. as migrations 20260914000100…0300 aplicadas;
--   2. o python-agent publicado (merge no main → Dokploy) e COPILOT_JOBS_ENABLED=true no
--      Dokploy (sem isso o agente responde "disabled" e não pega nada da fila);
--   3. os dois segredos no Vault. Os VALORES não entram em arquivo nenhum — digite no
--      SQL Editor do Supabase:
--
--        select vault.create_secret('<URL pública do agente, ex. https://agent…>', 'copilot_agent_url');
--        select vault.create_secret('<AGENT_INTERNAL_TOKEN do Dokploy>', 'copilot_agent_token');
--
-- Conferir antes de ligar (deve voltar um id de requisição, ou null se a fila estiver vazia):
--   select public._copilot_tick();

select cron.schedule('copilot-tick', '* * * * *', $cron$select public._copilot_tick()$cron$);

-- Desligar:  select cron.unschedule('copilot-tick');
-- Ver:       select status, count(*) from public.copilot_jobs group by 1;
--            select kind, payload->'timings', created_at from public.copilot_run_events
--             where kind like 'keeper_%' order by created_at desc limit 20;
