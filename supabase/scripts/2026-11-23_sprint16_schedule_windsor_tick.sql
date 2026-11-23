-- Sprint 16 — liga o despertador diário do Windsor (rodar UMA vez, à mão, depois do deploy).
--
-- Pré-requisitos:
--   1. Edge `integrations-windsor` publicada (supabase functions deploy integrations-windsor).
--   2. Segredo da edge: supabase secrets set WINDSOR_SYNC_SECRET=<valor longo aleatório>
--   3. Os dois segredos no Vault (o MESMO valor do passo 2):
--        select vault.create_secret('https://<ref>.supabase.co/functions/v1/integrations-windsor', 'windsor_sync_url');
--        select vault.create_secret('<valor do passo 2>', 'windsor_sync_secret');
--
-- 06:10 em Fortaleza/São Paulo (09:10 UTC): o dia anterior já fechou nas plataformas.

select cron.schedule(
  'windsor-sync-daily',
  '10 9 * * *',
  $cron$select public._crm_windsor_tick()$cron$
);

-- Desligar (não apaga chaves nem dados):
-- select cron.unschedule('windsor-sync-daily');
