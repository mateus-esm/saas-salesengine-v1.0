-- ============================================================================
-- Sprint 6.3 · T5 — Reactive (event-driven) fast-path for Solo Copilot ingest
-- ============================================================================
--
-- PURPOSE
--   Add an AFTER INSERT trigger on copilot_ingest_queue that immediately calls
--   POST /api/v1/ingest/row on the Python agent for the freshly-inserted row,
--   so new chat/ad activity is processed sub-2s instead of waiting up to a
--   minute for the pg_cron poll.
--
--   The 1-minute cron poll (migration 20260608000600_sprint6_ingest_cron.sql)
--   REMAINS in place as the safety-net backstop. Reactive + cron are BOTH
--   idempotent because the /ingest/row endpoint:
--     • loads the row only WHERE processed_at IS NULL, and
--     • marks the row processed_at = now() on success.
--   So a row is never processed twice even if the trigger and the cron race.
--
-- DEPENDENCY
--   pg_net extension — enables net.http_post(). Must be enabled in the
--   Supabase dashboard before this trigger is live (it is usually already
--   present on hosted projects, and is also enabled by the cron migration).
--
-- HOW TO ENABLE (Mateus — do this after the first deploy is healthy)
-- ─────────────────────────────────────────────────────────────────
--   Step 1  Supabase Dashboard → Database → Extensions
--           Ensure "pg_net" is enabled.
--
--   Step 2  Set the real values in the function body below:
--           • Replace <YOUR_AGENT_DOMAIN>   e.g. agent.yourdomain.com
--           • Replace <YOUR_AGENT_TOKEN>    value of AGENT_INTERNAL_TOKEN
--             from the Dokploy environment variables.
--
--   Step 3  Uncomment the two blocks below that are wrapped in:
--             /* ── UNCOMMENT TO ENABLE ── */
--           and apply (or re-run) this migration. Re-applying is safe:
--           the function is CREATE OR REPLACE and the trigger is
--           DROP TRIGGER IF EXISTS ... before CREATE.
--
--   Step 4  Verify the trigger registered:
--             SELECT tgname FROM pg_trigger
--             WHERE tgname = 'copilot_ingest_reactive';
--
--   Step 5  Verify a fire: insert a queue row (or watch real activity) and
--           check the agent logs / net.http_request_queue + net._http_response.
--
-- TO DISABLE LATER (without dropping the migration)
--   DROP TRIGGER IF EXISTS copilot_ingest_reactive ON public.copilot_ingest_queue;
--
-- ============================================================================
-- SAFETY NOTE
--   This file applies as-is with ZERO side effects. The CREATE EXTENSION,
--   CREATE FUNCTION and CREATE TRIGGER statements are all commented out.
--   Even if pg_net is absent the migration succeeds (no DDL is executed).
--   Un-commenting is an intentional, manual operator action.
-- ============================================================================

-- ── STEP A: Ensure pg_net is available (uncomment when ready) ────────────────
/*  ── UNCOMMENT TO ENABLE ──

CREATE EXTENSION IF NOT EXISTS pg_net;

*/

-- ── STEP B: Trigger function + AFTER INSERT trigger (uncomment when ready) ───
/*  ── UNCOMMENT TO ENABLE ──

-- Fires net.http_post for each newly-inserted queue row. CREATE OR REPLACE so
-- re-applying this migration is idempotent.
CREATE OR REPLACE FUNCTION public.copilot_ingest_notify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://<YOUR_AGENT_DOMAIN>/api/v1/ingest/row',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'X-Agent-Token', '<YOUR_AGENT_TOKEN>'
               ),
    body    := jsonb_build_object('id', NEW.id)
  );
  RETURN NEW;
END;
$$;

-- Remove any previous version of the trigger (idempotent re-apply).
DROP TRIGGER IF EXISTS copilot_ingest_reactive ON public.copilot_ingest_queue;

CREATE TRIGGER copilot_ingest_reactive
  AFTER INSERT ON public.copilot_ingest_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.copilot_ingest_notify();

*/

-- ── End of T5 migration ──────────────────────────────────────────────────────
-- This migration is intentionally inert until Step A and Step B are uncommented.
-- Apply it now to version-control the trigger definition; enable it on the
-- dashboard when the agent domain + token are confirmed live. The cron poll
-- (20260608000600) stays as the backstop — both paths are idempotent.
