-- SE-REV-002 — ligar o despertador do motor de outreach.
--
-- ESTE ARQUIVO É INERTE: fica em supabase/scripts, não em migrations. Só o
-- operador o aplica, depois de concluir o checklist de deploy e o smoke do
-- provider. Não executar antes de `outreach-worker` estar publicado.
--
-- Pré-requisitos:
--   1. migrations 20260926000050 e 20260926000100 aplicadas;
--   2. edge functions outreach e outreach-worker publicadas;
--   3. OUTREACH_WORKER_SECRET configurado na edge function;
--   4. os mesmos dados gravados no Vault, SEM copiar valores para este arquivo:
--
-- select vault.create_secret(
--   '<URL da função outreach-worker>',
--   'outreach_worker_url'
-- );
-- select vault.create_secret(
--   '<mesmo valor de OUTREACH_WORKER_SECRET>',
--   'outreach_worker_secret'
-- );
--
-- Antes de agendar: `select public._outreach_tick();` deve retornar null com a
-- fila vazia ou um request id do pg_net quando existir job vencido.

select cron.schedule(
  'outreach-tick',
  '* * * * *',
  $cron$select public._outreach_tick()$cron$
);

-- Desligar (rollback operacional, não apaga fila nem dados):
-- select cron.unschedule('outreach-tick');
--
-- Observar:
-- select status, count(*) from public.outreach_jobs group by 1 order by 1;
-- select id, lead_id, status, attempts, run_after, last_error
--   from public.outreach_jobs
--  order by created_at desc
--  limit 50;
