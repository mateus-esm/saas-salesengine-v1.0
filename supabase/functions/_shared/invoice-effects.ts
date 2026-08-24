// ============================================================================
// Sprint 8.3 — what happens when an invoice changes state.
//
// WHY THIS FILE EXISTS: these effects used to live inside asaas-webhook, which
// meant the gateway was the ONLY thing that could apply them. The founder takes
// payment by PIX outside Asaas often enough that "mark this invoice paid by
// hand" is a real operation — and if that path had been written separately it
// would have drifted: an invoice marked paid in the admin panel would not grant
// the plan's credits, not roll the contract period, not resume the agent. That
// is exactly the class of bug Sprint 8.2 spent itself on — money recorded in a
// place no consumer reads.
//
// So there is one implementation of "this invoice was paid", and both the
// webhook and the admin panel call it.
//
// IDEMPOTENCY: every credit movement here is keyed on the invoice or the
// contract period, never on who triggered it. A manual mark followed later by a
// real Asaas confirmation therefore grants credits exactly once.
// ============================================================================
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncAgentPower } from "./agent-power.ts";

export type Invoice = {
  id: string;
  equipe_id: string;
  contract_id: string | null;
  kind: string;
  status: string;
  total: number;
  /** Carries the credit pool chosen at purchase (Sprint 8.1). */
  metadata: { pool?: string; credits?: number; addon?: string } | null;
};

export async function notify(
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
  if (error) console.error(`[invoice-effects] notify(${type}) failed:`, error.message);
}

export interface PaidOptions {
  /**
   * Set when a human marked this paid rather than the gateway confirming it.
   * Recorded on the invoice so the difference is visible later — reconciling
   * our books against an Asaas statement is impossible if the two kinds of
   * payment look identical.
   */
  manual?: { byUserId: string | null; note: string | null; paidAt?: string };
}

export async function applyPaid(db: SupabaseClient, invoice: Invoice, opts: PaidOptions = {}) {
  const paidAt = opts.manual?.paidAt ?? new Date().toISOString();

  const patch: Record<string, unknown> = { status: "paid", paid_at: paidAt };
  if (opts.manual) {
    // Merged rather than replaced: metadata already carries the credit pool and
    // the purchased amount, and losing those would break the grant below.
    patch.metadata = {
      ...(invoice.metadata ?? {}),
      manual_payment: {
        by: opts.manual.byUserId,
        note: opts.manual.note,
        at: new Date().toISOString(),
      },
    };
  }
  await db.from("invoices").update(patch).eq("id", invoice.id);

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

    // A custom amount has no catalog product, so credits_included is 0 and the
    // loop above yields nothing. The amount was recorded on the invoice at
    // purchase time — server-side, never from the browser — so use it.
    const recorded = Number((invoice.metadata as { credits?: number } | null)?.credits ?? 0);
    if (credits === 0 && recorded > 0) credits = recorded;

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
    await syncAgentPower(db, { equipeId: invoice.equipe_id });
  } catch (e) {
    // Never fail a confirmed payment over the provider's switch.
    console.error("[invoice-effects] agent power sync failed:", e);
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

export async function applyOverdue(db: SupabaseClient, invoice: Invoice) {
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

export async function applyRefunded(db: SupabaseClient, invoice: Invoice) {
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
