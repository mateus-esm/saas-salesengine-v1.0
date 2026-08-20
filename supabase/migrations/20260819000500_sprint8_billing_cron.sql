-- ============================================================================
-- Sprint 8 · T7 — pg_cron tick for billing.
-- ============================================================================
--
-- PURPOSE
--   Schedule a daily job that calls the billing-cron edge function. It runs, in
--   order: void orphaned invoices, mark overdue, remind due-soon, suspend after
--   the grace window, issue the next period's invoice, expire credits, raise
--   credit alerts, and re-queue failed payment events.
--
-- DUNNING POLICY (founder decision, 2026-08-19)
--   overdue -> notify -> 7 days of full access -> read-only.
--   Read-only means data stays visible and AI/outbound stop. Nothing is deleted.
--
-- SAFETY
--   This committed migration is intentionally inert, matching the convention set
--   by 20260705000001_sprint7_health_cron.sql. It documents the job definition
--   but creates no extension and registers no job. Never commit service-role
--   keys or cron secrets into a migration.
--
-- AUTH
--   Use x-cron-secret with the value of the BILLING_CRON_SECRET edge secret.
--   Do NOT embed a service-role key in cron.job: Sprint 7 learned that the hard
--   way when key rotation silently broke the health tick with a 401.
--
-- HOW TO ENABLE AFTER DEPLOY IS HEALTHY
--   1. Enable pg_cron and pg_net in Dashboard > Database > Extensions.
--   2. Set the edge secret BILLING_CRON_SECRET (any long random string).
--   3. Deploy the function:
--        supabase functions deploy billing-cron --project-ref egxzsivzqlqadoqpgfby
--   4. Run this operator-only script in the SQL editor, injecting live values:
--
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--     CREATE EXTENSION IF NOT EXISTS pg_net;
--
--     SELECT cron.unschedule('sprint8_billing_tick')
--     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sprint8_billing_tick');
--
--     -- 12:00 UTC = 09:00 BRT. Daily: dunning is a day-granularity policy, and
--     -- a morning run means a customer sees the notice during business hours.
--     SELECT cron.schedule(
--       'sprint8_billing_tick',
--       '0 12 * * *',
--       $$
--         SELECT net.http_post(
--           url     := 'https://<project>.supabase.co/functions/v1/billing-cron',
--           headers := jsonb_build_object(
--                        'Content-Type',  'application/json',
--                        'x-cron-secret', '<BILLING_CRON_SECRET>'
--                      ),
--           body    := '{}'::jsonb
--         );
--       $$
--     );
--
--   Verify registration:
--     SELECT * FROM cron.job WHERE jobname = 'sprint8_billing_tick';
--
--   Verify recent runs:
--     SELECT * FROM cron.job_run_details
--     WHERE jobname = 'sprint8_billing_tick'
--     ORDER BY start_time DESC LIMIT 5;
--
-- TO DISABLE LATER
--     SELECT cron.unschedule('sprint8_billing_tick');
--
-- MANUAL RUN (safe — every job is idempotent)
--     curl -X POST https://<project>.supabase.co/functions/v1/billing-cron \
--          -H 'x-cron-secret: <BILLING_CRON_SECRET>'
-- ============================================================================

-- Index supporting the cron's hottest lookup: contracts due for renewal.
create index if not exists idx_contracts_renewal
  on public.contracts (current_period_end)
  where status = 'active';

-- Supports voidOrphanInvoices and markOverdue without scanning every invoice.
create index if not exists idx_invoices_open_nopayment
  on public.invoices (created_at)
  where status = 'open' and asaas_payment_id is null;
