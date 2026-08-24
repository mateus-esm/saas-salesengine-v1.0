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
// Sprint 8.3: the state-change effects moved to _shared so the admin panel can
// apply the exact same ones when a payment arrives outside the gateway.
import { applyOverdue, applyPaid, applyRefunded } from "../_shared/invoice-effects.ts";

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
      await applyPaid(db, invoice);
      break;
    case "overdue":
      await applyOverdue(db, invoice);
      break;
    case "refunded":
      await applyRefunded(db, invoice);
      break;
    case "void":
    case "open":
      await db.from("invoices").update({ status: newStatus }).eq("id", invoice.id);
      break;
  }

  return { handled: true, invoiceId: invoice.id };
}
