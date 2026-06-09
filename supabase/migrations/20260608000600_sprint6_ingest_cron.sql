-- ============================================================================
-- Sprint 6 · G5 — pg_cron debounce tick for Solo Copilot ingest
-- ============================================================================
--
-- PURPOSE
--   Schedule a 1-minute recurring job that calls POST /api/v1/ingest on the
--   Python agent.  The endpoint drains "settled" copilot_ingest_queue rows
--   (processed_at IS NULL AND due_at <= now()) and runs the E6 cascade.
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
--           • Replace <YOUR_AGENT_DOMAIN>   e.g. agent.yourdomain.com
--           • Replace <YOUR_AGENT_TOKEN>    value of AGENT_INTERNAL_TOKEN
--             from the Dokploy environment variables.
--
--   Step 3  Uncomment the two blocks below that are wrapped in:
--             /* ── UNCOMMENT TO ENABLE ── */
--           and apply (or re-run) this migration.
--
--   Step 4  Verify the job registered:
--             SELECT * FROM cron.job;
--           You should see a row with jobname = 'copilot_ingest_tick'.
--
--   Step 5  Verify the first run:
--             SELECT * FROM cron.job_run_details
--             WHERE jobname = 'copilot_ingest_tick'
--             ORDER BY start_time DESC LIMIT 5;
--
-- TO DISABLE LATER (if needed, without dropping the migration)
--   SELECT cron.unschedule('copilot_ingest_tick');
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

-- ── STEP B: Register the 1-minute cron job (uncomment when ready) ────────────
/*  ── UNCOMMENT TO ENABLE ──

-- Remove any previous version of this job (idempotent re-apply).
SELECT cron.unschedule('copilot_ingest_tick')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'copilot_ingest_tick'
);

SELECT cron.schedule(
  'copilot_ingest_tick',       -- unique job name
  '* * * * *',                 -- every 1 minute
  $$
    SELECT net.http_post(
      url     := 'https://<YOUR_AGENT_DOMAIN>/api/v1/ingest',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'X-Agent-Token', '<YOUR_AGENT_TOKEN>'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

*/

-- ── End of G5 migration ───────────────────────────────────────────────────────
-- This migration is intentionally inert until Step A and Step B are uncommented.
-- Apply it now to version-control the job definition; enable it on the dashboard
-- when the agent domain + token are confirmed live.
