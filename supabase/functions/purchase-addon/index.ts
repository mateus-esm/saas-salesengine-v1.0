// ============================================================================
// Sprint 8.2 — buy an add-on.
//
// Two shapes, deliberately different:
//
//   instance_whatsapp — RECURRING. Adds a monthly line to the contract so it
//     lands on the next invoice automatically. Billing it as a one-off would
//     mean somebody has to remember it again next month, which is exactly the
//     kind of revenue that quietly stops happening.
//
//   builder_hour — ONE-OFF. An adhoc invoice for hours worked. It must not join
//     the contract, or the customer would be charged for the same hours forever.
//
// Price always comes from the catalog. The client sends a product code and a
// quantity, never an amount.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCustomer, createPayment, dueDateIn } from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED = ["instance_whatsapp", "builder_hour"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "unauthorized" }, 401);

    const { product_code, quantity } = await req.json().catch(() => ({})) as {
      product_code?: string; quantity?: number;
    };
    if (!product_code || !ALLOWED.includes(product_code)) return json({ error: "invalid_product" }, 400);

    const qty = Math.max(1, Math.floor(Number(quantity) || 1));

    const { data: profile } = await db
      .from("profiles").select("equipe_id, email, nome_completo").eq("user_id", user.id).maybeSingle();
    if (!profile?.equipe_id) return json({ error: "profile_not_found" }, 404);
    const equipeId = profile.equipe_id as string;

    const { data: product } = await db
      .from("billing_products")
      .select("id, code, name, list_price, period, kind")
      .eq("code", product_code).eq("active", true).maybeSingle();
    if (!product) return json({ error: "product_not_found" }, 404);

    // ── Recurring: it belongs on the contract ────────────────────────────────
    if (product.kind === "instance") {
      let { data: contract } = await db
        .from("contracts").select("id, status")
        .eq("equipe_id", equipeId).in("status", ["draft", "active", "past_due", "suspended"])
        .maybeSingle();

      if (!contract) {
        const { data: created, error } = await db
          .from("contracts")
          .insert({
            equipe_id: equipeId, status: "draft",
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
          })
          .select("id, status").single();
        if (error) throw new Error(`contract insert failed: ${error.message}`);
        contract = created;
      }

      // Replace rather than append: quantity is the TOTAL wanted, so a second
      // click must not silently double what the customer pays every month.
      await db.from("contract_items")
        .delete().eq("contract_id", contract.id).eq("product_id", product.id);

      const { error: itemErr } = await db.from("contract_items").insert({
        contract_id: contract.id,
        product_id: product.id,
        quantity: qty,
        unit_price: product.list_price,
        period: "monthly",
      });
      if (itemErr) throw new Error(`contract_item insert failed: ${itemErr.message}`);

      return json({
        success: true,
        recurring: true,
        contract_id: contract.id,
        quantity: qty,
        monthly_total: Number(product.list_price) * qty,
      });
    }

    // ── One-off: an adhoc invoice ───────────────────────────────────────────
    const total = Math.round(Number(product.list_price) * qty * 100) / 100;

    const { data: account } = await db
      .from("billing_accounts")
      .select("doc_number, legal_name, billing_email, phone, asaas_customer_id")
      .eq("equipe_id", equipeId).maybeSingle();
    if (!account?.doc_number) return json({ error: "billing_account_incomplete" }, 422);

    let customerId = account.asaas_customer_id;
    if (!customerId) {
      const customer = await createCustomer({
        name: account.legal_name ?? profile.nome_completo ?? "Cliente",
        email: account.billing_email ?? profile.email,
        cpfCnpj: account.doc_number,
        phone: account.phone,
      });
      customerId = customer.id;
      await db.from("billing_accounts").update({ asaas_customer_id: customerId }).eq("equipe_id", equipeId);
    }

    const { data: invoice, error: invErr } = await db
      .from("invoices")
      .insert({
        equipe_id: equipeId,
        kind: "adhoc",
        status: "open",
        subtotal: total,
        total,
        due_date: dueDateIn(3),
        issued_at: new Date().toISOString(),
        metadata: { addon: product.code, quantity: qty },
      })
      .select("id, number").single();
    if (invErr) throw new Error(`invoice insert failed: ${invErr.message}`);

    await db.from("invoice_items").insert({
      invoice_id: invoice.id,
      product_id: product.id,
      description: `${product.name} × ${qty}`,
      quantity: qty,
      unit_price: product.list_price,
      total,
    });

    const payment = await createPayment({
      customer: customerId!,
      billingType: "UNDEFINED",
      value: total,
      dueDate: dueDateIn(3),
      description: `${product.name} × ${qty} — fatura ${invoice.number}`,
      externalReference: `invoice_${invoice.id}`,
    });

    await db.from("invoices").update({
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl ?? null,
    }).eq("id", invoice.id);

    return json({
      success: true,
      recurring: false,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      invoiceUrl: payment.invoiceUrl,
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[purchase-addon] fatal:", message);
    return json({ error: message }, 500);
  }
});
