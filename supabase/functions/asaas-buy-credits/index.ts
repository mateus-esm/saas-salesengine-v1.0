// ============================================================================
// Sprint 8 · T6 — buy credits.
//
// WHAT WAS WRONG (audit item 3): this function created the charge, returned the
// PIX QR code, and ended. `creditos_avulsos` was never incremented — a customer
// who paid received nothing. There was no invoice, so there was nothing for a
// webhook to confirm even once one existed.
//
// It also took `{amount, credits}` straight from the browser, so the client
// chose both what it paid and what it received.
//
// NOW: this function only ISSUES an invoice and a charge. Credits are granted by
// asaas-webhook when the payment is actually confirmed. Price and credits always
// come from the catalog; the client's `amount` is ignored in every code path.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { createCustomer, createPayment, dueDateIn, getPixQrCode, updateCustomer } from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    const body = await req.json().catch(() => ({}));
    const { product_id, paymentMethod, credits: legacyCredits, pool: requestedPool } = body as {
      product_id?: string;
      paymentMethod?: string;
      credits?: number;
      pool?: string;
    };

    // Sprint 8.1: the buyer chooses which pool to fill. Anything unrecognised
    // falls back to whatsapp — it is the pool whose exhaustion stops the
    // customer's own attendance, so it is the safe default to top up.
    const pool = requestedPool === "copilot" ? "copilot" : "whatsapp";

    const { data: profile } = await db
      .from("profiles").select("equipe_id, email, nome_completo, telefone")
      .eq("user_id", user.id).maybeSingle();
    if (!profile?.equipe_id) return json({ error: "profile_not_found" }, 404);

    const equipeId = profile.equipe_id as string;

    // --- price and credits: catalog only -------------------------------------
    let credits = 0;
    let price = 0;
    let productId: string | null = null;
    let label = "";

    if (product_id) {
      const { data: product } = await db
        .from("billing_products")
        .select("id, name, list_price, credits_included, kind, active")
        .eq("id", product_id).eq("kind", "credit_pack").maybeSingle();
      if (!product || !product.active) return json({ error: "product_not_found" }, 404);
      productId = product.id;
      credits = product.credits_included;
      price = Number(product.list_price);
      label = product.name;
    } else if (typeof legacyCredits === "number" && legacyCredits > 0) {
      // LEGACY PATH — the current Billing.tsx slider sends an arbitrary multiple
      // of 500 and its own `amount`. Kept working until T13 ships the catalog UI,
      // but priced entirely server-side. Remove in 8.1 once no caller uses it.
      const { data: exact } = await db
        .from("billing_products")
        .select("id, name, list_price, credits_included")
        .eq("kind", "credit_pack").eq("credits_included", legacyCredits)
        .eq("active", true).maybeSingle();

      if (exact) {
        productId = exact.id;
        credits = exact.credits_included;
        price = Number(exact.list_price);
        label = exact.name;
      } else {
        // No pack of that exact size: derive the unit rate from the catalog
        // rather than trusting the browser.
        const { data: ref } = await db
          .from("billing_products")
          .select("list_price, credits_included")
          .eq("kind", "credit_pack").eq("active", true)
          .order("credits_included", { ascending: true }).limit(1).maybeSingle();
        if (!ref || !ref.credits_included) return json({ error: "catalog_unavailable" }, 500);
        const unit = Number(ref.list_price) / ref.credits_included;
        credits = Math.round(legacyCredits);
        price = Math.round(credits * unit * 100) / 100;
        label = `${credits.toLocaleString("pt-BR")} créditos`;
      }
    } else {
      return json({ error: "product_id_required" }, 400);
    }

    if (credits <= 0 || price <= 0) return json({ error: "invalid_product" }, 400);

    // --- the payer is the team ----------------------------------------------
    const { data: account } = await db
      .from("billing_accounts")
      .select("equipe_id, doc_type, doc_number, legal_name, billing_email, phone, asaas_customer_id")
      .eq("equipe_id", equipeId).maybeSingle();

    if (!account?.doc_number || !account?.doc_type) {
      // Typed so the UI can send them to /billing/dados instead of showing a
      // generic failure. Replaces reading profiles.cpf (audit item 9).
      return json({ error: "billing_account_incomplete" }, 422);
    }

    let customerId = account.asaas_customer_id;
    if (!customerId) {
      const customer = await createCustomer({
        name: account.legal_name ?? profile.nome_completo ?? "Cliente",
        email: account.billing_email ?? profile.email,
        cpfCnpj: account.doc_number,
        phone: account.phone ?? profile.telefone,
      });
      customerId = customer.id;
      await db.from("billing_accounts").update({ asaas_customer_id: customerId }).eq("equipe_id", equipeId);
    } else {
      await updateCustomer(customerId, { cpfCnpj: account.doc_number }).catch((e) =>
        console.error("[buy-credits] customer update failed:", e.message)
      );
    }

    // --- invoice first, charge second ---------------------------------------
    // The invoice exists before the charge so the webhook always has something
    // to match on. A charge with no invoice is money we cannot attribute.
    const { data: invoice, error: invErr } = await db
      .from("invoices")
      .insert({
        equipe_id: equipeId,
        kind: "credit_pack",
        status: "open",
        subtotal: price,
        total: price,
        due_date: dueDateIn(1),
        issued_at: new Date().toISOString(),
        // Read back by asaas-webhook when the payment confirms.
        // `credits` is recorded here because a CUSTOM amount has no catalog
        // product to read credits_included from — without it the webhook would
        // grant zero and the customer would pay for nothing.
        metadata: { pool, credits },
      })
      .select("id, number").single();
    if (invErr) throw new Error(`invoice insert failed: ${invErr.message}`);

    // The customer sees this in the invoice list, in the receipt and on the bank
    // statement. "Recarga de créditos" alone does not say which wallet was
    // topped up, and with two pools that is the first question they will ask.
    const poolLabel = pool === "copilot" ? "Copiloto" : "Atendimento";
    const itemDescription = `Recarga de ${credits.toLocaleString("pt-BR")} créditos — ${poolLabel}`;

    await db.from("invoice_items").insert({
      invoice_id: invoice.id,
      product_id: productId,
      description: itemDescription,
      quantity: 1,
      unit_price: price,
      total: price,
    });

    const payment = await createPayment({
      customer: customerId!,
      billingType: paymentMethod === "PIX" ? "PIX" : "UNDEFINED",
      value: price,
      dueDate: dueDateIn(1),
      description: `${itemDescription} — fatura ${invoice.number}`,
      externalReference: `invoice_${invoice.id}`,
    });

    const patch: Record<string, unknown> = {
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl ?? null,
    };

    let pixQrCode: string | undefined;
    let pixCopyPaste: string | undefined;
    if (paymentMethod === "PIX") {
      const qr = await getPixQrCode(payment.id);
      pixQrCode = qr.encodedImage;
      pixCopyPaste = qr.payload;
      patch.pix_payload = qr.payload ?? null;
    }

    await db.from("invoices").update(patch).eq("id", invoice.id);

    // Response shape preserved for the current Billing.tsx.
    return json({
      success: true,
      paymentId: payment.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      invoiceUrl: payment.invoiceUrl,
      credits,
      pool,
      amount: price,
      pixQrCode,
      pixCopyPaste,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[buy-credits] fatal:", message);
    return json({ error: message }, 500);
  }
});
