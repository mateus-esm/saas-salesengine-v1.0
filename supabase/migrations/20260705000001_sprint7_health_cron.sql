-- ============================================================================
-- Sprint 7 · T7 — pg_cron health tick for Solo WhatsApp instances
-- ============================================================================
--
-- PURPOSE
--   Schedule a 5-minute recurring job that calls the solo-health-check edge
--   function.  The function polls every non-error wpp_instances row against
--   the whatsmiau connectionState endpoint and syncs status changes, then
--   triggers sync-instance-billing for any equipe whose status changed.
--
-- DEPENDENCY CHAIN
--   1. pg_cron  extension   — enables cron.schedule()
--   2. pg_net   extension   — enables net.http_post()
--   Both must be enabled in the Supabase dashboard before this job is live.
--
-- HOW TO ENABLE (Mateus — do this after the first deploy is healthy)
-- ─────────────────────────────────────────────────────────────────
--   Step 1  Supabase Dashboard → Database → Extensions
--           Enable "pg_cron"  (may require a project restart)
--           Enable "pg_net"   (usually already present on hosted projects)
--
--   Step 2  Set the real values below:
--           • Replace <YOUR_SUPABASE_URL>   e.g. https://<project>.supabase.co
--           • Replace <YOUR_SERVICE_ROLE_KEY>  value of SUPABASE_SERVICE_ROLE_KEY
--             from the Supabase environment.
--
--   Step 3  Uncomment the two blocks below that are wrapped in:
--             /* ── UNCOMMENT TO ENABLE ── */
--           and apply (or re-run) this migration.
--
--   Step 4  Verify the job registered:
--             SELECT * FROM cron.job;
--           You should see a row with jobname = 'sprint7_health_tick'.
--
--   Step 5  Verify the first run:
--             SELECT * FROM cron.job_run_details
--             WHERE jobname = 'sprint7_health_tick'
--             ORDER BY start_time DESC LIMIT 5;
--
-- TO DISABLE LATER (if needed, without dropping the migration)
--   SELECT cron.unschedule('sprint7_health_tick');
--
-- ============================================================================
-- SAFETY NOTE
--   This file applies as-is with ZERO side effects.  The pg_cron and pg_net
--   blocks are commented out.  Even if the extensions are absent the migration
--   will succeed (no DDL is executed).  Un-commenting is an intentional,
--   manual operator action.
-- ============================================================================

-- ── STEP A: Enable extensions (uncomment when ready) ─────────────────────────
/*  ── UNCOMMENT TO ENABLE ──

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

*/

-- ── STEP B: Register the 5-minute cron job (uncomment when ready) ────────────
/*  ── UNCOMMENT TO ENABLE ──

-- Remove any previous version of this job (idempotent re-apply).
SELECT cron.unschedule('sprint7_health_tick')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sprint7_health_tick'
);

SELECT cron.schedule(
  'sprint7_health_tick',       -- unique job name
  '*/5 * * * *',               -- every 5 minutes
  $$
    SELECT net.http_post(
      url     := '<YOUR_SUPABASE_URL>/functions/v1/solo-health-check',
      headers := jsonb_build_object(
                   'Content-Type',       'application/json',
                   'Authorization',      'Bearer <YOUR_SERVICE_ROLE_KEY>'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

*/

-- ── End of T7 migration ───────────────────────────────────────────────────────
-- This migration is intentionally inert until Step A and Step B are uncommented.
-- Apply it now to version-control the job definition; enable it on the dashboard
-- when the supabase URL + service-role key are confirmed live.
