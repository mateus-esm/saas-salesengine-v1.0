// ============================================================================
// Sprint 8.3 (Fixes 2, item 6) — billing operations for the admin panel.
//
// WHY THIS IS A FUNCTION AND NOT SIX RPC CALLS FROM THE BROWSER: every one of
// these operations has TWO halves that must agree — our invoice and the charge
// at Asaas. Cancelling an invoice while the boleto stays live means the customer
// keeps being asked to pay for something we cancelled; that is the failure mode
// this exists to prevent. The browser cannot hold the Asaas key, so the pairing
// has to happen server-side.
//
// ORDER OF OPERATIONS: the database first, the gateway second. If the gateway
// call fails, our state is still correct and the operator is told the charge
// still needs attention. The reverse order would cancel real money against a
// database that never recorded it.
//
// Authorisation is checked twice on purpose: here, to reject early with a clear
// error, and again inside every SQL function, which is the boundary that
// actually holds if this function is ever called another way.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cancelPayment, createPayment, updatePayment } from "../_shared/asaas.ts";
import { applyPaid, notify, type Invoice } from "../_shared/invoice-effects.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Map a SQL guard onto a status and a message the panel can show as-is. */
const GUARDS: Record<string, { status: number; message: string }> = {
  forbidden:                 { status: 403, message: "Apenas super admin." },
  invoice_not_found:         { status: 404, message: "Fatura não encontrada." },
  proposal_not_found:        { status: 404, message: "Proposta não encontrada." },
  equipe_not_found:          { status: 404, message: "Equipe não encontrada." },
  invoice_already_paid:      { status: 409, message: "Fatura já está paga. Para desfazer, use estorno." },
  invoice_void:              { status: 409, message: "Fatura cancelada não pode ser paga." },
  invoice_not_deletable:     { status: 409, message: "Só rascunho sem cobrança pode ser apagado. Cancele em vez de apagar." },
  invoice_not_editable:      { status: 409, message: "Só fatura não paga pode ser editada." },
  invoice_has_multiple_items:{ status: 409, message: "Esta fatura tem várias linhas. Cancele e emita outra." },
  proposal_provisioned:      { status: 409, message: "Proposta já provisionada: ela é a origem de um contrato ativo." },
  invalid_amount:            { status: 400, message: "Valor precisa ser maior que zero." },
  description_required:      { status: 400, message: "Descrição é obrigatória." },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await db
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "super_admin") return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(body.action ?? "");

  // The SQL functions run as the CALLER so is_super_admin() sees the right
  // person — service_role has no auth.uid() and every gate would refuse it.
  const asUser = userClient;

  try {
    switch (action) {
      case "void_invoice":      return json(await voidInvoice(db, asUser, body));
      case "delete_invoice":    return json(await rpc(asUser, "admin_delete_invoice", { p_invoice_id: body.invoice_id }));
      case "mark_paid":         return json(await markPaid(db, asUser, body, user.id));
      case "create_adhoc":      return json(await createAdhoc(db, asUser, body));
      case "update_invoice":    return json(await updateInvoice(asUser, body));
      case "delete_proposal":   return json(await rpc(asUser, "admin_delete_proposal", { p_proposal_id: body.proposal_id }));
      default:
        return json({ error: "unknown_action", action }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const guard = Object.keys(GUARDS).find((k) => message.includes(k));
    if (guard) return json({ error: guard, message: GUARDS[guard].message }, GUARDS[guard].status);
    console.error(`[admin-billing-ops] ${action} failed:`, message);
    return json({ error: "operation_failed", message }, 500);
  }
});

async function rpc<T = Record<string, unknown>>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Cancel here, then cancel there.
 *
 * A gateway failure does NOT undo the void: the operator asked to stop billing
 * this, and leaving our invoice open because Asaas hiccupped would be the wrong
 * half to keep. It is reported instead, so the charge can be killed by hand.
 */
async function voidInvoice(_db: SupabaseClient, asUser: SupabaseClient, body: Record<string, unknown>) {
  const res = await rpc<{ id: string; number: string; asaas_payment_id: string | null }>(
    asUser, "admin_void_invoice",
    { p_invoice_id: body.invoice_id, p_reason: body.reason ?? null },
  );

  let gateway: "cancelled" | "not_charged" | "failed" = "not_charged";
  if (res.asaas_payment_id) {
    gateway = (await cancelPayment(res.asaas_payment_id)) ? "cancelled" : "failed";
  }

  return { ok: true, ...res, gateway };
}

async function markPaid(
  db: SupabaseClient,
  asUser: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
) {
  // The guard and the row come from SQL; the effects come from the same module
  // the Asaas webhook uses, so a hand-marked payment grants exactly the credits
  // a real one would.
  const invoice = await rpc<Invoice>(asUser, "admin_invoice_for_payment", { p_invoice_id: body.invoice_id });

  await applyPaid(db, invoice, {
    manual: {
      byUserId: userId,
      note: (body.note as string) ?? null,
      paidAt: (body.paid_at as string) ?? undefined,
    },
  });

  return { ok: true, id: invoice.id, status: "paid" };
}

async function createAdhoc(db: SupabaseClient, asUser: SupabaseClient, body: Record<string, unknown>) {
  const res = await rpc<{
    id: string; number: string; total: number; due_date: string;
    description: string; asaas_customer_id: string | null;
  }>(asUser, "admin_create_adhoc_invoice", {
    p_equipe_id: body.equipe_id,
    p_description: body.description,
    p_amount: body.amount,
    p_due_date: body.due_date ?? null,
  });

  // No Asaas customer means this tenant was never set up for gateway billing.
  // The invoice is still real — it just has to be settled by hand, which is
  // precisely why mark_paid exists.
  let charge: { id: string; url: string | null } | null = null;
  if (res.asaas_customer_id) {
    try {
      const payment = await createPayment({
        customer: res.asaas_customer_id,
        billingType: "UNDEFINED",
        value: Number(res.total),
        dueDate: String(res.due_date),
        description: `${res.description} — fatura ${res.number}`,
        externalReference: `invoice_${res.id}`,
      });
      await db.from("invoices")
        .update({ asaas_payment_id: payment.id, asaas_invoice_url: payment.invoiceUrl ?? null })
        .eq("id", res.id);
      charge = { id: payment.id, url: payment.invoiceUrl ?? null };
    } catch (e) {
      // Reported, not fatal. The invoice exists and can be charged or settled
      // manually; throwing would leave an invoice the caller thinks failed.
      console.error("[admin-billing-ops] adhoc gateway charge failed:", e);
    }
  }

  await notify(db, String(body.equipe_id), "invoice.issued", "Nova fatura disponível",
    `R$ ${Number(res.total).toFixed(2).replace(".", ",")} — ${res.description}.`,
    "/billing/faturas", `issued_${res.id}`);

  return { ok: true, ...res, charge };
}

async function updateInvoice(asUser: SupabaseClient, body: Record<string, unknown>) {
  const res = await rpc<{
    id: string; number: string; status: string; total: number;
    due_date: string; asaas_payment_id: string | null;
  }>(asUser, "admin_update_invoice", {
    p_invoice_id: body.invoice_id,
    p_due_date: body.due_date ?? null,
    p_description: body.description ?? null,
    p_amount: body.amount ?? null,
  });

  let gateway: "updated" | "not_charged" | "failed" = "not_charged";
  if (res.asaas_payment_id) {
    try {
      await updatePayment(res.asaas_payment_id, {
        value: Number(res.total),
        dueDate: String(res.due_date),
      });
      gateway = "updated";
    } catch (e) {
      console.error("[admin-billing-ops] gateway update failed:", e);
      gateway = "failed";
    }
  }

  return { ok: true, ...res, gateway };
}
