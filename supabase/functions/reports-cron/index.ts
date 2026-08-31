// ============================================================================
// Sprint 9 · T13 — the report tick.
//
// Runs hourly. For every schedule whose next_run_at has passed:
//
//   1. work out the period it covers (report_period, in the schedule's zone)
//   2. build the snapshot from the SAME cores the dashboard reads
//   3. write a report_run — the unique (schedule_id, period_start) is what
//      makes a double tick impossible rather than unlikely
//   4. render the WhatsApp text and enqueue one notification per recipient
//   5. advance next_run_at
//
// WHAT THIS FUNCTION DELIBERATELY DOES NOT DO
//
// It does not talk to WhatsApp. notify_report() writes a notification plus its
// delivery rows, and the Sprint 8.4 dispatcher — which already retries with
// backoff, already normalises phone numbers, already knows which Solo instance
// speaks for which purpose — does the sending. A second sender here would be a
// second thing to fix the next time the provider changes.
//
// STEP 5 RUNS EVEN WHEN STEP 4 FAILS
//
// If enqueuing fails and next_run_at is left in the past, the next tick tries
// the same period again, hits the unique constraint, and the schedule is stuck
// forever — one broken send would silently stop that client's reports for good.
// So the schedule always advances, and the failure is recorded on the run.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEqual } from "../_shared/asaas.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { renderReportText, type ReportSnapshot } from "../_shared/report-render.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Schedule {
  id: string;
  equipe_id: string;
  name: string;
  frequency: string;
  send_hour: number;
  weekday: number | null;
  monthday: number | null;
  timezone: string;
  sections: string[];
  filters: Record<string, unknown>;
  next_run_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("BILLING_CRON_SECRET");
  if (!secret) return json({ error: "not_configured" }, 500);
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    schedule_id?: string;
    force?: boolean;
  };

  let q = db
    .from("report_schedules")
    .select("id, equipe_id, name, frequency, send_hour, weekday, monthday, timezone, sections, filters, next_run_at")
    .eq("active", true)
    .order("next_run_at", { ascending: true })
    .limit(body.limit ?? 50);

  // `schedule_id` + `force` is the "enviar agora" path from the UI.
  if (body.schedule_id) {
    q = q.eq("id", body.schedule_id);
  } else {
    q = q.lte("next_run_at", new Date().toISOString());
  }

  const { data: due, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const result = { processed: 0, sent: 0, skipped: 0, failed: 0, details: [] as unknown[] };

  for (const row of (due ?? []) as Schedule[]) {
    result.processed++;
    try {
      const outcome = await runSchedule(db, row, !!body.force);
      if (outcome.status === "sent") result.sent++;
      else if (outcome.status === "skipped") result.skipped++;
      result.details.push({ schedule: row.id, ...outcome });
    } catch (e) {
      result.failed++;
      result.details.push({ schedule: row.id, status: "failed", error: String(e) });
      // One tenant's broken schedule must not stop the other seven.
      console.error(`[reports-cron] schedule ${row.id} failed:`, e);
      await advance(db, row).catch(() => {});
    }
  }

  return json(result);
});

async function runSchedule(
  db: SupabaseClient,
  s: Schedule,
  force: boolean,
): Promise<{ status: string; run_id?: string; recipients?: number; reason?: string }> {
  // 1. the window
  const { data: periodRows, error: pErr } = await db.rpc("report_period", {
    p_frequency: s.frequency,
    p_tz: s.timezone,
    p_at: new Date().toISOString(),
  });
  if (pErr) throw new Error(`report_period: ${pErr.message}`);

  const period = Array.isArray(periodRows) ? periodRows[0] : periodRows;
  const periodStart: string = period.period_start;
  const periodEnd: string = period.period_end;

  // 2. the numbers — same cores the dashboard reads
  const { data: snapshot, error: sErr } = await db.rpc("build_report_snapshot", {
    p_equipe: s.equipe_id,
    p_from: periodStart,
    p_to: periodEnd,
    p_sections: s.sections,
    p_filters: s.filters ?? {},
  });
  if (sErr) throw new Error(`build_report_snapshot: ${sErr.message}`);

  // 3. claim the period. The unique constraint is the guard: if this period was
  //    already built, the insert conflicts and we stop here rather than sending
  //    the same report twice.
  const { data: run, error: rErr } = await db
    .from("report_runs")
    .insert({
      schedule_id: s.id,
      equipe_id: s.equipe_id,
      period_start: periodStart,
      period_end: periodEnd,
      snapshot,
    })
    .select("id, public_token")
    .single();

  if (rErr) {
    // 23505 = unique_violation: already sent for this period.
    if ((rErr as { code?: string }).code === "23505" && !force) {
      await advance(db, s);
      return { status: "skipped", reason: "already_sent_for_period" };
    }
    throw new Error(`report_runs insert: ${rErr.message}`);
  }

  // 4. render and enqueue
  //
  // The origin is resolved PER TENANT, not from a global secret. Each client
  // reaches the app on their own white-label domain (casaflow.soloventures…,
  // solon.soloventures…), so one shared base URL would send Casa Flow a link
  // that opens a competitor's branding. The domain already lives in the
  // database — equipes.niche -> niches.domain — so there is no secret to set.
  const { data: origin } = await db.rpc("tenant_public_origin", {
    p_equipe_id: s.equipe_id,
  });
  const base = typeof origin === "string" ? origin.replace(/\/+$/, "") : "";
  const link = base ? `${base}/relatorio/${run.public_token}` : null;
  const text = renderReportText({
    snapshot: snapshot as ReportSnapshot,
    frequency: s.frequency,
    timezone: s.timezone,
    scheduleName: s.name,
    link,
  });

  const { data: recipients, error: recErr } = await db
    .from("report_recipients")
    .select("id, name, phone")
    .eq("schedule_id", s.id)
    .eq("active", true);
  if (recErr) throw new Error(`recipients: ${recErr.message}`);

  let enqueued = 0;
  const failures: string[] = [];

  for (const r of recipients ?? []) {
    // Normalised again at the door. The column CHECK catches obvious shapes,
    // but _shared/phone.ts is the one authority — Sprint 8.5 lost a sprint to a
    // number the API accepted and silently never delivered.
    const phone = normalizePhone(r.phone);
    if (!phone) {
      failures.push(`invalid_phone:${r.id}`);
      continue;
    }

    const { error: nErr } = await db.rpc("notify_report", {
      p_run_id: run.id,
      p_phone: phone,
      p_text: text,
      p_link: link,
    });
    if (nErr) failures.push(`${r.id}:${nErr.message}`);
    else enqueued++;
  }

  await db
    .from("report_runs")
    .update({
      rendered_text: text,
      recipients_n: enqueued,
      status: enqueued > 0 ? "sent" : "failed",
      error: failures.length ? failures.join("; ") : null,
    })
    .eq("id", run.id);

  // 5. always advance — see the header.
  await advance(db, s);

  return { status: enqueued > 0 ? "sent" : "failed", run_id: run.id, recipients: enqueued };
}

/** Move the schedule to its next firing time. */
async function advance(db: SupabaseClient, s: Schedule) {
  const { data: next, error } = await db.rpc("compute_next_run", {
    p_frequency: s.frequency,
    p_hour: s.send_hour,
    p_weekday: s.weekday,
    p_monthday: s.monthday,
    p_tz: s.timezone,
    p_after: new Date().toISOString(),
  });
  if (error) throw new Error(`compute_next_run: ${error.message}`);

  await db
    .from("report_schedules")
    .update({ next_run_at: next, last_run_at: new Date().toISOString() })
    .eq("id", s.id);
}
