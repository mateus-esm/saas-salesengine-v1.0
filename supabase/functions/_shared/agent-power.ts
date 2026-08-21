// ============================================================================
// Sprint 8.1 · T3 — turning the attendance agent off and on at the provider.
//
// This closes the gap Sprint 8 shipped with. The attendance agent generates
// provider-side and autonomously, so no pre-flight check of ours can gate it: a
// tenant at zero credits kept consuming and we kept paying for it.
//
//   PUT /v2/agent/{id}/inactive
//   PUT /v2/agent/{id}/active
//
// BOTH halves matter. A switch that only turns off would be worse than none —
// a customer who just paid would stay dark until somebody noticed.
//
// The decision of WHO to pause lives in SQL (agents_to_pause / agents_to_resume)
// so the cron and the webhook cannot disagree about the rule. This module only
// performs the call and records the outcome.
// ============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const AI_ENGINE_BASE = "https://api.gptmaker.ai/v2";

export type PauseReason = "no_credits" | "suspended" | "manual";

interface Result {
  ok: boolean;
  error?: string;
}

function token(): string {
  const t = Deno.env.get("GPT_MAKER_TOKEN");
  if (!t) throw new Error("GPT_MAKER_TOKEN not configured");
  return t;
}

async function setAgentState(agentId: string, state: "active" | "inactive"): Promise<Result> {
  try {
    // Agent ids pasted by hand carry whitespace — a lesson from Sprint 7.2.
    const id = agentId.trim();
    const res = await fetch(`${AI_ENGINE_BASE}/agent/${id}/${state}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return { ok: false, error: `provider ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Stop the attendance agent and record why.
 *
 * The database is only updated when the provider confirms. Marking a tenant
 * paused after a failed call would make the next run skip it — the agent would
 * keep answering while our records claimed it was off, which is the expensive
 * direction to be wrong in.
 */
export async function pauseAgent(
  db: SupabaseClient, equipeId: string, agentId: string, reason: PauseReason,
): Promise<Result> {
  const result = await setAgentState(agentId, "inactive");
  if (!result.ok) {
    console.error(`[agent-power] pause failed for ${equipeId}: ${result.error}`);
    await recordFailure(db, equipeId, result.error ?? "unknown");
    return result;
  }
  await db.from("equipes").update({
    agent_paused_at: new Date().toISOString(),
    agent_paused_reason: reason,
    agent_power_error: null,
    agent_power_failures: 0,
  }).eq("id", equipeId);
  console.log(`[agent-power] paused ${equipeId} (${reason})`);
  return { ok: true };
}

/**
 * Bring the agent back. Clearing the flag only on success means a failed resume
 * is retried on the next tick rather than silently forgotten — erring toward
 * trying again, because the customer has already paid.
 */
export async function resumeAgent(
  db: SupabaseClient, equipeId: string, agentId: string,
): Promise<Result> {
  const result = await setAgentState(agentId, "active");
  if (!result.ok) {
    console.error(`[agent-power] resume failed for ${equipeId}: ${result.error}`);
    await recordFailure(db, equipeId, result.error ?? "unknown");
    return result;
  }
  await db.from("equipes").update({
    agent_paused_at: null,
    agent_paused_reason: null,
    agent_power_error: null,
    agent_power_failures: 0,
  }).eq("id", equipeId);
  console.log(`[agent-power] resumed ${equipeId}`);
  return { ok: true };
}

/**
 * Reconcile every agent against what the ledger and contracts say it should be.
 * Idempotent: the SQL only returns tenants whose provider state disagrees with
 * ours, so a second run in the same minute calls the provider zero times.
 */
export async function syncAgentPower(db: SupabaseClient): Promise<{ paused: number; resumed: number; failed: number }> {
  const out = { paused: 0, resumed: 0, failed: 0 };

  const { data: toPause } = await db.rpc("agents_to_pause");
  for (const row of (toPause ?? []) as Array<{ equipe_id: string; agent_id: string; reason: PauseReason }>) {
    const r = await pauseAgent(db, row.equipe_id, row.agent_id, row.reason);
    if (r.ok) {
      out.paused++;
      await notify(db, row.equipe_id,
        row.reason === "suspended" ? "contract.suspended" : "credits.exhausted",
        row.reason === "suspended" ? "Atendimento pausado" : "Seu agente parou de responder",
        row.reason === "suspended"
          ? "A conta está em modo somente leitura. O agente de atendimento foi pausado até a fatura ser paga."
          : "Seus créditos de atendimento acabaram e o agente foi pausado. O chat com sua equipe continua normal.",
        "/billing/creditos",
        `agentpause_${row.equipe_id}_${row.reason}`);
    } else out.failed++;
  }

  const { data: toResume } = await db.rpc("agents_to_resume");
  for (const row of (toResume ?? []) as Array<{ equipe_id: string; agent_id: string }>) {
    const r = await resumeAgent(db, row.equipe_id, row.agent_id);
    if (r.ok) {
      out.resumed++;
      await notify(db, row.equipe_id, "contract.reactivated", "Agente religado",
        "Seu agente de atendimento voltou a responder automaticamente.",
        "/billing", `agentresume_${row.equipe_id}_${new Date().toISOString().slice(0, 10)}`);
    } else out.failed++;
  }

  return out;
}

/**
 * Count consecutive failures so agents_to_pause can back off after five.
 * Without this, one stale agent id produces a failed provider call on every run
 * forever — noise that buries a real failure.
 */
async function recordFailure(db: SupabaseClient, equipeId: string, error: string) {
  const { data } = await db
    .from("equipes").select("agent_power_failures").eq("id", equipeId).maybeSingle();
  await db.from("equipes").update({
    agent_power_error: error.slice(0, 500),
    agent_power_failures: Number(data?.agent_power_failures ?? 0) + 1,
    agent_power_last_try: new Date().toISOString(),
  }).eq("id", equipeId);
}

async function notify(
  db: SupabaseClient, equipeId: string, type: string,
  title: string, body: string, actionUrl: string, dedupKey: string,
) {
  const { error } = await db.rpc("notify", {
    p_equipe_id: equipeId, p_type: type, p_title: title, p_body: body,
    p_action_url: actionUrl, p_data: {}, p_dedup_key: dedupKey,
  });
  if (error) console.error(`[agent-power] notify(${type}):`, error.message);
}
