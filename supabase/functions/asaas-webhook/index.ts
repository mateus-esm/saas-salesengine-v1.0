// ============================================================================
// Sprint 8 · T5 — Asaas webhook. ⭐
//
// This is the function whose absence is the reason for this sprint. Before it,
// no payment was ever confirmed: asaas-subscribe granted access at click time and
// asaas-buy-credits took money without ever crediting anyone.
//
// ORDER OF OPERATIONS IS NOT STYLISTIC. Each step prevents a specific failure:
//
//   1. Authenticate with a constant-time token compare.
//   2. INSERT into payment_events FIRST. A unique violation means this is a
//      redelivery — return 200 and stop. Any logic before this insert is a race.
//   3. Return 200 even when processing fails. Asaas retries on non-2xx, so
//      returning 5xx for a bug we have already recorded means an infinite retry
//      loop. Failures are marked 'failed' and retried by billing-cron (T7).
//   4. Credits come from the CATALOG, never from the amount paid — otherwise
//      paying R$1 for a R$800 pack would credit the pack.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AsaasWebhookEvent, mapEventToInvoiceStatus, safeEqual } from "../_shared/asaas.ts";
import { syncAgentPower } from "../_shared/agent-power.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, asaas-access-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // --- 1. Authenticate -------------------------------------------------------
  const expected = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (!expected) {
    console.error("[asaas-webhook] ASAAS_WEBHOOK_TOKEN not configured");
    return json({ error: "not_configured" }, 500);
  }
  const received = req.headers.get("asaas-access-token") ?? "";
  if (!safeEqual(received, expected)) {
    console.warn("[asaas-webhook] rejected: bad token");
    return json({ error: "unauthorized" }, 401);
  }

  let event: AsaasWebhookEvent;
  try {
    event = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const db = admin();

  // Asaas does not always send a top-level event id. Fall back to a
  // deterministic composite so redelivery of the SAME state is still caught.
  const eventId = event.id ?? `${event.event}:${event.payment?.id ?? "unknown"}:${event.payment?.status ?? ""}`;

  // --- 2. Record before processing -------------------------------------------
  const { data: stored, error: insertErr } = await db
    .from("payment_events")
    .insert({
      provider: "asaas",
      provider_event_id: eventId,
      event_type: event.event,
      payload: event,
    })
    .select("id")
    .single();

  if (insertErr) {
    // 23505 = unique_violation = Asaas redelivered something we already have.
    if (insertErr.code === "23505") {
      console.log(`[asaas-webhook] duplicate ${eventId} — no-op`);
      return json({ received: true, duplicate: true });
    }
    console.error("[asaas-webhook] could not record event:", insertErr);
    // We could not even record it, so asking Asaas to retry is correct here.
    return json({ error: "storage_failed" }, 500);
  }

  // --- 3. Process, but never fail the response -------------------------------
  try {
    const result = await processEvent(db, event);
    await db
      .from("payment_events")
      .update({ status: result.handled ? "processed" : "ignored", processed_at: new Date().toISOString(), invoice_id: result.invoiceId ?? null })
      .eq("id", stored.id);
    return json({ received: true, handled: result.handled });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[asaas-webhook] processing failed for ${eventId}:`, message);
    await db
      .from("payment_events")
      .update({ status: "failed", last_error: message, attempts: 1 })
      .eq("id", stored.id);
    // 200 on purpose. The event is recorded; billing-cron retries it.
    return json({ received: true, deferred: true });
  }
});

interface ProcessResult {
  handled: boolean;
  invoiceId?: string;
}

async function processEvent(db: SupabaseClient, event: AsaasWebhookEvent): Promise<ProcessResult> {
  const newStatus = mapEventToInvoiceStatus(event.event);
  if (!newStatus) {
    console.log(`[asaas-webhook] ignoring ${event.event}`);
    return { handled: false };
  }

  const paymentId = event.payment?.id;
  if (!paymentId) throw new Error(`event ${event.event} has no payment.id`);

  const { data: invoice, error } = await db
    .from("invoices")
    .select("id, equipe_id, contract_id, kind, status, total, metadata")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();

  if (error) throw new Error(`invoice lookup failed: ${error.message}`);
  if (!invoice) {
    // A payment we have no invoice for: created outside the app, or from before
    // Sprint 8. Recorded and ignored rather than guessed at.
    console.warn(`[asaas-webhook] no invoice for payment ${paymentId}`);
    return { handled: false };
  }

  // Already in this state — a redelivery that slipped past the event-id check.
  if (invoice.status === newStatus) {
    return { handled: true, invoiceId: invoice.id };
  }

  switch (newStatus) {
    case "paid":
      await onPaid(db, invoice);
      break;
    case "overdue":
      await onOverdue(db, invoice);
      break;
    case "refunded":
      await onRefunded(db, invoice);
      break;
    case "void":
    case "open":
      await db.from("invoices").update({ status: newStatus }).eq("id", invoice.id);
      break;
  }

  return { handled: true, invoiceId: invoice.id };
}

type Invoice = {
  id: string;
  equipe_id: string;
  contract_id: string | null;
  kind: string;
  status: string;
  total: number;
  /** Carries the credit pool chosen at purchase (Sprint 8.1). */
  metadata: { pool?: string } | null;
};

async function onPaid(db: SupabaseClient, invoice: Invoice) {
  await db
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoice.id);

  if (invoice.kind === "credit_pack") {
    // Credits come from the catalog, NOT from what was paid. Deriving credits
    // from the amount would let a manipulated charge buy a large pack cheaply.
    const { data: items } = await db
      .from("invoice_items")
      .select("product_id, quantity, billing_products(credits_included)")
      .eq("invoice_id", invoice.id);

    let credits = 0;
    for (const item of items ?? []) {
      const included = (item as { billing_products?: { credits_included?: number } }).billing_products?.credits_included ?? 0;
      credits += included * ((item as { quantity?: number }).quantity ?? 1);
    }

    // Sprint 8.1: the buyer picks the pool at purchase; asaas-buy-credits stored
    // it on the invoice. Defaulting to whatsapp is the safe direction — it is the
    // pool that stops customer-facing attendance when empty.
    const pool = (invoice.metadata as { pool?: string } | null)?.pool === "copilot" ? "copilot" : "whatsapp";

    if (credits > 0) {
      const { error } = await db.rpc("grant_credits", {
        p_equipe_id: invoice.equipe_id,
        p_credits: credits,
        p_source: "invoice",
        p_ref_id: invoice.id,
        p_expires_at: null,
        p_idempotency_key: `invoice_${invoice.id}`,
        p_entry_type: "topup",
        p_pool: pool,
      });
      if (error) throw new Error(`grant_credits failed: ${error.message}`);
    }

    await notify(db, invoice.equipe_id, "credits.topup_confirmed", "Créditos liberados",
      `${credits.toLocaleString("pt-BR")} créditos foram adicionados ao seu saldo.`,
      "/billing/creditos", `invoice_${invoice.id}`);
  }

  if (invoice.kind === "recurring" && invoice.contract_id) {
    await rollContractPeriod(db, invoice);
  }

  if (invoice.kind === "setup" && invoice.contract_id) {
    // The setup fee alone does not start the clock; the first recurring invoice
    // does. Just make sure a draft contract becomes live.
    await db
      .from("contracts")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", invoice.contract_id)
      .eq("status", "draft");
  }

  await notify(db, invoice.equipe_id, "invoice.paid", "Pagamento confirmado",
    `Recebemos o pagamento de R$ ${Number(invoice.total).toFixed(2).replace(".", ",")}.`,
    "/billing/faturas", `paid_${invoice.id}`);

  // Sprint 8.1 B1 — bring the attendance agent back NOW. Waiting for the daily
  // cron would leave a customer who just paid dark for up to 24 hours, which is
  // the worst possible moment to be slow. The SQL decides eligibility, so this is
  // a no-op when the agent was never paused.
  try {
    await syncAgentPower(db);
  } catch (e) {
    // Never fail a confirmed payment over the provider's switch.
    console.error("[asaas-webhook] agent power sync failed:", e);
  }
}

async function rollContractPeriod(db: SupabaseClient, invoice: Invoice) {
  const { data: contract } = await db
    .from("contracts")
    .select("id, status, current_period_start, current_period_end")
    .eq("id", invoice.contract_id!)
    .single();
  if (!contract) return;

  const wasSuspended = contract.status === "suspended";

  // Extend from the current period end when it is in the future, otherwise from
  // now — so paying late does not silently grant a free extra month.
  const base = contract.current_period_end && new Date(contract.current_period_end) > new Date()
    ? new Date(contract.current_period_end)
    : new Date();
  const nextEnd = new Date(base);
  nextEnd.setMonth(nextEnd.getMonth() + 1);

  await db
    .from("contracts")
    .update({
      status: "active",
      past_due_since: null,
      started_at: contract.current_period_start ?? new Date().toISOString(),
      current_period_start: base.toISOString(),
      current_period_end: nextEnd.toISOString(),
    })
    .eq("id", contract.id);

  // Monthly allowance for the period just paid for — one grant PER POOL.
  // Sprint 8.1: the plan sells attendance and Copilot credits separately, so a
  // single combined grant would let WhatsApp usage silently eat the Copilot's
  // allowance (and vice versa).
  const { data: items } = await db
    .from("contract_items")
    .select("quantity, billing_products(credits_whatsapp, credits_copilot, kind)")
    .eq("contract_id", contract.id);

  let whatsapp = 0;
  let copilot = 0;
  for (const item of items ?? []) {
    const prod = (item as { billing_products?: { credits_whatsapp?: number; credits_copilot?: number } }).billing_products;
    const qty = (item as { quantity?: number }).quantity ?? 1;
    whatsapp += (prod?.credits_whatsapp ?? 0) * qty;
    copilot  += (prod?.credits_copilot ?? 0) * qty;
  }

  const periodKey = base.toISOString().slice(0, 10);
  for (const [pool, amount] of [["whatsapp", whatsapp], ["copilot", copilot]] as const) {
    if (amount <= 0) continue;
    const { error } = await db.rpc("grant_credits", {
      p_equipe_id: invoice.equipe_id,
      p_credits: amount,
      p_source: "plan_period",
      p_ref_id: invoice.id,
      p_expires_at: nextEnd.toISOString(),
      // Distinct keys per pool: one shared key would make the second grant look
      // like a replay of the first and silently skip it.
      p_idempotency_key: `period_${contract.id}_${periodKey}_${pool}`,
      p_entry_type: "grant",
      p_pool: pool,
    });
    if (error) throw new Error(`grant_credits (${pool}) failed: ${error.message}`);
  }

  if (wasSuspended) {
    await notify(db, invoice.equipe_id, "contract.reactivated", "Conta reativada",
      "Sua conta voltou ao normal. IA e envios estão religados.",
      "/billing", `react_${contract.id}_${base.toISOString().slice(0, 10)}`);
  }
}

async function onOverdue(db: SupabaseClient, invoice: Invoice) {
  await db.from("invoices").update({ status: "overdue" }).eq("id", invoice.id);

  if (invoice.contract_id) {
    await db
      .from("contracts")
      .update({ status: "past_due", past_due_since: new Date().toISOString() })
      .eq("id", invoice.contract_id)
      .in("status", ["active", "draft"]);
  }

  await notify(db, invoice.equipe_id, "invoice.overdue", "Fatura vencida",
    "Sua conta entra em modo somente leitura em 7 dias. Seus dados continuam salvos.",
    "/billing/faturas", `overdue_${invoice.id}`);
}

async function onRefunded(db: SupabaseClient, invoice: Invoice) {
  await db.from("invoices").update({ status: "refunded" }).eq("id", invoice.id);

  // Reverse whatever this invoice credited. Negative adjustment rather than a
  // delete: the ledger is append-only so the history stays auditable.
  const { data: granted } = await db
    .from("credit_ledger")
    .select("credits")
    .eq("equipe_id", invoice.equipe_id)
    .eq("ref_id", invoice.id)
    .in("entry_type", ["topup", "grant"]);

  const total = (granted ?? []).reduce((s, r) => s + ((r as { credits: number }).credits ?? 0), 0);
  if (total > 0) {
    await db.from("credit_ledger").insert({
      equipe_id: invoice.equipe_id,
      entry_type: "adjustment",
      credits: -total,
      source: "invoice",
      ref_id: invoice.id,
      idempotency_key: `refund_${invoice.id}`,
      metadata: { reason: "refund_or_chargeback" },
    });
    await db.rpc("recompute_credit_balance", { p_equipe_id: invoice.equipe_id });
  }

  await notify(db, invoice.equipe_id, "payment.refunded", "Pagamento estornado",
    "O pagamento foi estornado e os créditos correspondentes foram removidos.",
    "/billing/faturas", `refund_${invoice.id}`);
}

async function notify(
  db: SupabaseClient,
  equipeId: string,
  type: string,
  title: string,
  body: string,
  actionUrl: string,
  dedupKey: string,
) {
  // Notification failure must never roll back money that was correctly applied.
  const { error } = await db.rpc("notify", {
    p_equipe_id: equipeId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_action_url: actionUrl,
    p_data: {},
    p_dedup_key: dedupKey,
  });
  if (error) console.error(`[asaas-webhook] notify(${type}) failed:`, error.message);
}
