// ============================================================================
// Sprint 8 · T11 — nightly credit reconciliation.
//
// The provider's WhatsApp agent generates autonomously (see T10), so that
// consumption never passes through our code and cannot be debited as it happens.
// This job closes the gap: it compares what the provider says the agent spent
// this month against what our ledger recorded, and books the difference.
//
// THE RECONCILER CORRECTS THE LEDGER. IT IS NOT THE TRUTH.
// If credits-spent ever became the source of truth we would be back to deriving
// the balance on read — unauditable and unenforceable, which is the problem
// Sprint 8 exists to fix. The ledger stays authoritative; this only writes
// `adjustment` rows, which are append-only and carry their reason.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEqual } from "../_shared/asaas.ts";
import { toBilledCredits } from "../_shared/credit-pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AI_ENGINE_BASE = "https://api.gptmaker.ai/v2";

/**
 * Differences smaller than this are ignored. Provider rounding and our markup
 * conversion will never agree to the credit, and booking a 1-credit adjustment
 * every night would bury a real discrepancy in noise.
 */
const NOISE_FLOOR = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("BILLING_CRON_SECRET");
  if (!secret) return json({ error: "not_configured" }, 500);
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);

  const token = Deno.env.get("GPT_MAKER_TOKEN");
  if (!token) return json({ error: "GPT_MAKER_TOKEN not configured" }, 500);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;

  const { data: equipes, error } = await db
    .from("equipes")
    .select("id, nome, gpt_maker_agent_id")
    .not("gpt_maker_agent_id", "is", null);
  if (error) return json({ error: error.message }, 500);

  const report = {
    checked: 0, adjusted: 0, skipped: 0,
    drift: [] as unknown[],
    // Reported rather than silent: "we skipped your tenant" is something
    // the founder needs to see, or a month of real usage goes unbilled
    // and nobody notices until the next audit.
    notMeteredAllMonth: [] as unknown[],
  };

  for (const equipe of equipes ?? []) {
    report.checked++;
    const agentId = String(equipe.gpt_maker_agent_id).trim();

    // ── Sprint 8.5: never reconcile a month we were not metering all of ──
    //
    // The provider answers for a CALENDAR MONTH and nothing finer. Our ledger
    // starts when the tenant began being metered. If that happened mid-month,
    // the two numbers describe different windows and their difference is not
    // drift — it is the consumption from before we were counting.
    //
    // On 2026-08-25 this booked -8040 against Casa Flow and -7000 against Solo
    // Energia: a whole month of provider usage against a ledger one day old.
    // Because credit_balance is greatest(0, sum), those holes silently swallowed
    // every top-up the founder made afterwards — the balance stayed at zero and
    // nothing in the panel said why.
    //
    // Skipping is the only honest option: a partial month cannot be compared,
    // and inventing a pro-rata split of the provider's total would be a guess
    // billed to a customer.
    const { data: firstEntry } = await db
      .from("credit_ledger")
      .select("created_at")
      .eq("equipe_id", equipe.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstEntry) {
      // Never metered at all: there is no ledger to reconcile against.
      report.skipped++;
      continue;
    }
    if (new Date(firstEntry.created_at as string) > new Date(periodStart)) {
      report.skipped++;
      report.notMeteredAllMonth.push({
        equipe: equipe.nome,
        metering_since: firstEntry.created_at,
        period: periodKey,
      });
      continue;
    }

    let providerSpent = 0;
    try {
      const res = await fetch(
        `${AI_ENGINE_BASE}/agent/${agentId}/credits-spent?year=${year}&month=${month}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) { report.skipped++; continue; }
      providerSpent = (await res.json())?.total ?? 0;
    } catch (e) {
      console.error(`[reconcile] provider read failed for ${equipe.id}:`, e);
      report.skipped++;
      continue;
    }

    // The provider reports PROVIDER credits; the ledger stores BILLED.
    const providerBilled = toBilledCredits(providerSpent);

    // Sprint 8.1 E4 — WhatsApp pool only. The provider measures the attendance
    // agent and nothing else, so comparing it against a total that also contains
    // Copilot debits would book the Copilot's usage as "drift" every night.
    const { data: rows } = await db
      .from("credit_ledger")
      .select("credits, source")
      .eq("equipe_id", equipe.id)
      .eq("pool", "whatsapp")
      .in("entry_type", ["debit", "adjustment"])
      .gte("created_at", periodStart);

    // Debits are negative and adjustments booked here are negative too, so the
    // recorded consumption is the negated sum.
    const recorded = -(rows ?? []).reduce((s, r) => s + Number((r as { credits: number }).credits ?? 0), 0);
    const diff = providerBilled - recorded;

    if (Math.abs(diff) < NOISE_FLOOR) continue;

    // One adjustment per tenant per month: re-running the job re-books nothing,
    // it corrects the same row's worth of drift only once.
    const key = `reconcile_${periodKey}`;
    const { error: insErr } = await db.from("credit_ledger").insert({
      equipe_id: equipe.id,
      entry_type: "adjustment",
      credits: -diff, // provider says we spent more -> book a further debit
      source: "reconcile",
      pool: "whatsapp",
      idempotency_key: key,
      metadata: {
        period: periodKey,
        provider_credits: providerSpent,
        provider_billed: providerBilled,
        ledger_recorded: recorded,
        drift: diff,
      },
    });

    // 23505 = already reconciled this month.
    if (insErr && insErr.code !== "23505") {
      console.error(`[reconcile] insert failed for ${equipe.id}:`, insErr.message);
      continue;
    }
    if (insErr) continue;

    await db.rpc("recompute_credit_balance", { p_equipe_id: equipe.id });
    report.adjusted++;
    report.drift.push({ equipe: equipe.nome, drift: diff, provider: providerBilled, ledger: recorded });

    // Drift is a signal that something consumed credits outside the ledger.
    // Worth a founder's attention rather than a silent correction.
    if (Math.abs(diff) > 100) {
      // A notification failure must not undo a correction we already booked.
      const { error: notifyErr } = await db.rpc("notify", {
        p_equipe_id: equipe.id,
        p_type: "credits.low",
        p_title: "Divergência de créditos detectada",
        p_body: `A conciliação ajustou ${Math.abs(diff).toLocaleString("pt-BR")} créditos neste período.`,
        p_action_url: "/billing/creditos",
        p_data: { drift: diff, period: periodKey },
        p_dedup_key: `drift_${periodKey}`,
      });
      if (notifyErr) console.error("[reconcile] notify failed:", notifyErr.message);
    }
  }

  return json({ ok: true, period: periodKey, ...report });
});
