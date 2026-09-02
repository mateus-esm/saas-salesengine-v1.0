// ============================================================================
// Sprint 8 · T7 — billing-cron.
//
// Dunning, period rollover and credit expiry have to happen without anyone
// clicking anything. Runs daily; every job is idempotent, so running it twice in
// one day changes nothing.
//
// AUTH: x-cron-secret against BILLING_CRON_SECRET — the convention established in
// sprint7_health_cron after an embedded service-role key broke silently (401) when
// the project keys were rotated. Never embed a service-role key in cron.job.
//
// DUNNING POLICY (founder decision 7): overdue -> notify -> 7 days of full access
// -> read-only. Data is never deleted.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPayment, dueDateIn, safeEqual } from "../_shared/asaas.ts";
import { syncAgentPower } from "../_shared/agent-power.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Days of full access after a payment goes overdue, before read-only. */
const GRACE_DAYS = 7;
/** How far ahead the next period's invoice is issued. */
const RENEW_LEAD_DAYS = 5;
/** Reminder window before the due date. */
const DUE_SOON_DAYS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("BILLING_CRON_SECRET");
  if (!expected) return json({ error: "not_configured" }, 500);
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const report: Record<string, unknown> = {};
  // Each job is independent: one failure must not stop the rest, or a bad
  // rollover would also block dunning and credit expiry.
  for (const [name, fn] of Object.entries(JOBS)) {
    try {
      report[name] = await fn(db);
    } catch (e) {
      report[name] = { error: e instanceof Error ? e.message : String(e) };
      console.error(`[billing-cron] ${name} failed:`, e);
    }
  }

  return json({ ok: true, ran_at: new Date().toISOString(), ...report });
});

const JOBS: Record<string, (db: SupabaseClient) => Promise<unknown>> = {
  voidOrphanInvoices,
  markOverdue,
  remindDueSoon,
  suspendPastDue,
  endTrials,
  renewPeriods,
  expireCredits,
  creditAlerts,
  retryFailedEvents,
  // Sprint 8.1 B1 — runs LAST, so it reacts to the suspensions and expiries the
  // jobs above just applied rather than to yesterday's state.
  agentPower,
};

/**
 * An invoice created just before the gateway call failed has no
 * asaas_payment_id and can never be paid. Left alone it shows in the customer's
 * list forever as an unpayable balance. Void anything older than 2 hours.
 *
 * Sprint 8.3: EXCEPT the ones a human created on purpose. An ad-hoc invoice the
 * founder raised for a customer who pays by PIX looks identical to that debris
 * — no gateway charge, sitting open — and without this exclusion the admin
 * panel's own output would be deleted two hours after it was created.
 *
 * Sprint 8.2: AND except the implementation invoice that is waiting for go-live.
 * It is raised at provisioning so the client sees the commitment and its due
 * date, but an `on_golive` deal is only charged when the founder clicks "put it
 * live" — which is weeks later. It looks exactly like debris and is not. Without
 * this, every deferred implementation invoice would be voided the day after the
 * proposal was accepted. `go_live_contract()` clears the flag, so a charge that
 * fails AT go-live goes back to being ordinary debris and is re-issued normally.
 */
async function voidOrphanInvoices(db: SupabaseClient) {
  const cutoff = new Date(Date.now() - 2 * 3600_000).toISOString();
  const { data } = await db
    .from("invoices")
    .update({ status: "void", metadata: { voided_reason: "no_gateway_charge" } })
    .eq("status", "open")
    .is("asaas_payment_id", null)
    .not("metadata", "cs", '{"manual": true}')
    .not("metadata", "cs", '{"awaiting_golive": true}')
    .lt("created_at", cutoff)
    .select("id");
  return { voided: data?.length ?? 0 };
}

async function markOverdue(db: SupabaseClient) {
  const today = new Date().toISOString().split("T")[0];
  const { data: due } = await db
    .from("invoices")
    .select("id, equipe_id, contract_id, total")
    .eq("status", "open")
    .not("asaas_payment_id", "is", null)
    .lt("due_date", today);

  for (const inv of due ?? []) {
    await db.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
    if (inv.contract_id) {
      await db
        .from("contracts")
        .update({ status: "past_due", past_due_since: new Date().toISOString() })
        .eq("id", inv.contract_id)
        .in("status", ["active", "draft"]);
    }
    await notify(db, inv.equipe_id, "invoice.overdue", "Fatura vencida",
      `Sua conta entra em modo somente leitura em ${GRACE_DAYS} dias. Seus dados continuam salvos.`,
      "/billing/faturas", `overdue_${inv.id}`);
  }
  return { marked: due?.length ?? 0 };
}

async function remindDueSoon(db: SupabaseClient) {
  const target = new Date();
  target.setDate(target.getDate() + DUE_SOON_DAYS);
  const { data } = await db
    .from("invoices")
    .select("id, equipe_id, total, due_date")
    .eq("status", "open")
    .eq("due_date", target.toISOString().split("T")[0]);

  for (const inv of data ?? []) {
    await notify(db, inv.equipe_id, "invoice.due_soon", "Fatura vence em 3 dias",
      `R$ ${money(inv.total)} vence em ${fmtDate(inv.due_date)}.`,
      "/billing/faturas", `duesoon_${inv.id}`);
  }
  return { reminded: data?.length ?? 0 };
}

/** Dunning: read-only after the grace window. Nothing is deleted. */
async function suspendPastDue(db: SupabaseClient) {
  const cutoff = new Date(Date.now() - GRACE_DAYS * 86400_000).toISOString();
  const { data } = await db
    .from("contracts")
    .select("id, equipe_id, past_due_since")
    .eq("status", "past_due")
    .lt("past_due_since", cutoff);

  for (const c of data ?? []) {
    await db.from("contracts").update({ status: "suspended" }).eq("id", c.id);
    await notify(db, c.equipe_id, "contract.suspended", "Conta em modo somente leitura",
      "Seus dados estão salvos. IA e envios estão pausados até a fatura ser paga.",
      "/billing/faturas", `susp_${c.id}_${c.past_due_since}`);
  }
  return { suspended: data?.length ?? 0 };
}

/**
 * Sprint 9 — a trial has run out: charge the rest of THIS month, prorated, and
 * move the contract to active so day-1 billing takes over from here.
 *
 * Prorating rather than giving the partial month away is deliberate: on a
 * R$1.000 plan, waiting for the next 1st can be thirty free days.
 */
async function endTrials(db: SupabaseClient) {
  const { data: due, error } = await db.rpc("contracts_ending_trial");
  if (error) throw new Error(error.message);

  let billed = 0;
  for (const row of (due ?? []) as Array<{
    contract_id: string; equipe_id: string; monthly: number; trial_ends_at: string;
  }>) {
    const monthly = Number(row.monthly ?? 0);
    const from = new Date(row.trial_ends_at);

    // Everything bills on the 1st from now on.
    const periodEnd = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));

    await db.from("contracts").update({
      status: "active",
      current_period_start: from.toISOString(),
      current_period_end: periodEnd.toISOString(),
    }).eq("id", row.contract_id);

    if (monthly <= 0) { billed++; continue; }

    const { data: prorated } = await db.rpc("prorated_amount", {
      p_monthly: monthly,
      p_from: from.toISOString(),
    });
    const total = Number(prorated ?? monthly);
    const periodKey = from.toISOString().slice(0, 10);

    // One first-invoice per contract per trial end, so a re-run cannot bill twice.
    const { data: already } = await db
      .from("invoices").select("id")
      .eq("contract_id", row.contract_id).eq("kind", "recurring")
      .contains("metadata", { period_key: periodKey }).maybeSingle();
    if (already) { billed++; continue; }

    const { data: invoice, error: invErr } = await db
      .from("invoices")
      .insert({
        equipe_id: row.equipe_id,
        contract_id: row.contract_id,
        kind: "recurring",
        status: "open",
        subtotal: total,
        total,
        due_date: dueDateIn(5),
        issued_at: new Date().toISOString(),
        metadata: { period_key: periodKey, prorated: true },
      })
      .select("id, number").single();
    if (invErr) { console.error("[endTrials]", invErr.message); continue; }

    await db.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: `Assinatura — período proporcional de ${from.toLocaleDateString("pt-BR")} até o fim do mês`,
      quantity: 1,
      unit_price: total,
      total,
    });

    await chargeInvoice(db, row.equipe_id, invoice.id, total, `Assinatura — fatura ${invoice.number}`);

    await notify(db, row.equipe_id, "invoice.issued", "Seu período de teste terminou",
      `Primeira fatura de ${money(total)} referente aos dias restantes deste mês. A partir do próximo mês, a cobrança acontece todo dia 1.`,
      "/billing/faturas", `trialend_${row.contract_id}`);
    billed++;
  }
  return { billed };
}

/** Creates the gateway charge for an invoice that already exists. */
async function chargeInvoice(
  db: SupabaseClient, equipeId: string, invoiceId: string, total: number, description: string,
) {
  const { data: account } = await db
    .from("billing_accounts").select("asaas_customer_id").eq("equipe_id", equipeId).maybeSingle();
  if (!account?.asaas_customer_id) return;
  try {
    const payment = await createPayment({
      customer: account.asaas_customer_id,
      billingType: "UNDEFINED",
      value: total,
      dueDate: dueDateIn(5),
      description,
      externalReference: `invoice_${invoiceId}`,
    });
    await db.from("invoices")
      .update({ asaas_payment_id: payment.id, asaas_invoice_url: payment.invoiceUrl ?? null })
      .eq("id", invoiceId);
  } catch (e) {
    // voidOrphanInvoices clears it after 2h and the next run re-issues.
    console.error("[chargeInvoice] gateway failed:", e);
  }
}

/**
 * Issue the next period's invoice ahead of time, priced from contract_items —
 * the NEGOTIATED price, not the catalog list price.
 */
async function renewPeriods(db: SupabaseClient) {
  const horizon = new Date(Date.now() + RENEW_LEAD_DAYS * 86400_000).toISOString();
  const { data: contracts } = await db
    .from("contracts")
    .select("id, equipe_id, current_period_end")
    .eq("status", "active")
    .not("current_period_end", "is", null)
    .lt("current_period_end", horizon);

  let issued = 0;
  for (const c of contracts ?? []) {
    // Idempotency: one recurring invoice per contract per period end.
    const periodKey = String(c.current_period_end).slice(0, 10);
    const { data: already } = await db
      .from("invoices")
      .select("id")
      .eq("contract_id", c.id)
      .eq("kind", "recurring")
      .contains("metadata", { period_key: periodKey })
      .maybeSingle();
    if (already) continue;

    const { data: items } = await db
      .from("contract_items")
      .select("product_id, quantity, unit_price, period, billing_products(name)")
      .eq("contract_id", c.id)
      .eq("period", "monthly");
    if (!items?.length) continue;

    const total = items.reduce((s, i) => s + Number(i.unit_price) * (i.quantity ?? 1), 0);
    if (total <= 0) continue;

    const { data: invoice, error } = await db
      .from("invoices")
      .insert({
        equipe_id: c.equipe_id,
        contract_id: c.id,
        kind: "recurring",
        status: "open",
        subtotal: total,
        total,
        due_date: dueDateIn(RENEW_LEAD_DAYS),
        issued_at: new Date().toISOString(),
        metadata: { period_key: periodKey },
      })
      .select("id, number").single();
    if (error) { console.error("[renewPeriods] invoice insert:", error.message); continue; }

    await db.from("invoice_items").insert(
      items.map((i) => ({
        invoice_id: invoice.id,
        product_id: i.product_id,
        description: ((i as { billing_products?: { name?: string } }).billing_products?.name ?? "Assinatura")
          + " — mensalidade",
        quantity: i.quantity ?? 1,
        unit_price: i.unit_price,
        total: Number(i.unit_price) * (i.quantity ?? 1),
      })),
    );

    const { data: account } = await db
      .from("billing_accounts").select("asaas_customer_id").eq("equipe_id", c.equipe_id).maybeSingle();

    if (account?.asaas_customer_id) {
      try {
        const payment = await createPayment({
          customer: account.asaas_customer_id,
          billingType: "UNDEFINED",
          value: total,
          dueDate: dueDateIn(RENEW_LEAD_DAYS),
          description: `Assinatura — fatura ${invoice.number}`,
          externalReference: `invoice_${invoice.id}`,
        });
        await db.from("invoices")
          .update({ asaas_payment_id: payment.id, asaas_invoice_url: payment.invoiceUrl ?? null })
          .eq("id", invoice.id);
      } catch (e) {
        // The invoice stays open with no charge; voidOrphanInvoices cleans it up
        // and the next run re-issues it.
        console.error("[renewPeriods] gateway charge failed:", e);
      }
    }

    await notify(db, c.equipe_id, "invoice.issued", "Nova fatura disponível",
      `R$ ${money(total)} referente ao próximo período.`,
      "/billing/faturas", `issued_${invoice.id}`);
    issued++;
  }
  return { issued };
}

async function expireCredits(db: SupabaseClient) {
  const { data, error } = await db.rpc("expire_credits");
  if (error) throw new Error(error.message);
  return { grants_expired: data ?? 0 };
}

/**
 * 80% / 95% / exhausted. dedup_key is the grant period, so each threshold fires
 * once per period instead of on every run.
 */
async function creditAlerts(db: SupabaseClient) {
  // WhatsApp pool only: it is the one that stops the customer's attendance when
  // it runs dry, and warning about a combined balance would understate the risk.
  const { data: grants } = await db
    .from("credit_ledger")
    .select("equipe_id, credits, expires_at, created_at")
    .eq("entry_type", "grant")
    .eq("pool", "whatsapp")
    .gt("expires_at", new Date().toISOString());

  let fired = 0;
  for (const g of grants ?? []) {
    const { data: balance } = await db.rpc("credit_balance", { p_equipe_id: g.equipe_id, p_pool: "whatsapp" });
    const total = Number(balance ?? 0);
    const granted = Number(g.credits);
    if (granted <= 0) continue;

    const used = Math.max(0, granted - total);
    const pct = used / granted;
    const period = String(g.expires_at).slice(0, 10);

    let type: string | null = null;
    let title = "";
    let body = "";
    if (total <= 0) {
      type = "credits.exhausted";
      title = "Seus créditos acabaram";
      body = "O agente parou de responder automaticamente. O chat com sua equipe continua normal.";
    } else if (pct >= 0.95) {
      type = "credits.critical";
      title = "Menos de 5% dos créditos restantes";
      body = `Restam ${total.toLocaleString("pt-BR")} créditos neste período.`;
    } else if (pct >= 0.8) {
      type = "credits.low";
      title = "80% dos créditos utilizados";
      body = `Restam ${total.toLocaleString("pt-BR")} créditos neste período.`;
    }

    if (type) {
      const id = await notify(db, g.equipe_id, type, title, body, "/billing/creditos", `${period}_${type}`);
      if (id) fired++;
    }
  }
  return { alerts: fired };
}

/** The other half of "the webhook never returns 5xx". */
async function retryFailedEvents(db: SupabaseClient) {
  const { data } = await db
    .from("payment_events")
    .select("id, attempts")
    .eq("status", "failed")
    .lt("attempts", 5)
    .limit(50);

  // Re-queue rather than reprocess inline: the webhook owns that logic, and
  // duplicating it here is how the two drift apart.
  for (const ev of data ?? []) {
    await db.from("payment_events")
      .update({ status: "pending", attempts: (ev.attempts ?? 0) + 1 })
      .eq("id", ev.id);
  }
  return { requeued: data?.length ?? 0 };
}

/** Sprint 8.1 · turn the attendance agent off/on to match ledger and contract. */
async function agentPower(db: SupabaseClient) {
  return await syncAgentPower(db);
}

async function notify(
  db: SupabaseClient, equipeId: string, type: string,
  title: string, body: string, actionUrl: string, dedupKey: string,
): Promise<string | null> {
  const { data, error } = await db.rpc("notify", {
    p_equipe_id: equipeId, p_type: type, p_title: title, p_body: body,
    p_action_url: actionUrl, p_data: {}, p_dedup_key: dedupKey,
  });
  if (error) { console.error(`[billing-cron] notify(${type}):`, error.message); return null; }
  return data as string | null;
}

const money = (v: unknown) => Number(v).toFixed(2).replace(".", ",");
const fmtDate = (d: unknown) => {
  const parts = String(d).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(d);
};
