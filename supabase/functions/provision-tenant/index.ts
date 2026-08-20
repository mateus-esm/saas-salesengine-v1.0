// ============================================================================
// Sprint 8 · T9 — provision a tenant from an accepted proposal.
//
// The founder's flow (decision 6): the client accepts online, you get notified,
// and ONE click in the admin panel creates everything. This is that click.
//
// ORDER MATTERS — database first, external calls after:
//   1. provision_tenant_from_proposal() does team + billing account + contract
//      + items + invoices in ONE transaction. Either all of it exists or none.
//   2. Gateway charges, which cannot be rolled back.
//   3. The auth invite, last, because it is the most likely to fail (bad email)
//      and the least damaging to retry.
//
// Re-running with the same proposal_id RESUMES: the SQL function returns the
// existing ids instead of duplicating, and each external step is skipped if it
// already happened. That is what makes a half-finished provisioning safe to fix
// by clicking again, rather than leaving a team that exists but cannot be billed.
//
// Later, auto-provisioning on acceptance calls this same function from the
// acceptance handler instead of from a button. No rewrite.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCustomer, createPayment, dueDateIn } from "../_shared/asaas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    // Provisioning creates a billable customer — super admin only.
    const { data: me } = await db.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (me?.role !== "super_admin") return json({ error: "forbidden" }, 403);

    const { proposal_id } = await req.json().catch(() => ({})) as { proposal_id?: string };
    if (!proposal_id) return json({ error: "proposal_id_required" }, 400);

    // --- 1. the atomic part --------------------------------------------------
    const { data: result, error: provErr } = await db.rpc("provision_tenant_from_proposal", {
      p_proposal_id: proposal_id,
    });
    if (provErr) {
      const known = ["proposal_not_found", "proposal_not_accepted"];
      const code = known.find((k) => provErr.message.includes(k));
      return json({ error: code ?? provErr.message }, code ? 409 : 500);
    }

    const r = result as {
      already_provisioned: boolean;
      equipe_id: string;
      contract_id: string;
      setup_invoice_id: string | null;
      recurring_invoice_id: string | null;
    };

    const warnings: string[] = [];

    const { data: proposal } = await db
      .from("proposals")
      .select("cliente_nome, cliente_email, cliente_whatsapp")
      .eq("id", proposal_id).maybeSingle();

    // --- 2. gateway ----------------------------------------------------------
    // Non-fatal: the tenant exists and the invoices exist. billing-cron voids an
    // un-charged invoice after 2h and the next attempt re-issues it, so a
    // gateway outage delays billing instead of corrupting it.
    try {
      await ensureCharges(db, r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`gateway: ${msg}`);
      console.error("[provision-tenant] gateway step failed:", msg);
    }

    // --- 3. auth invite, last ------------------------------------------------
    let invited = false;
    if (proposal?.cliente_email) {
      try {
        invited = await ensureInvite(db, proposal.cliente_email, r.equipe_id, proposal.cliente_nome);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`invite: ${msg}`);
        // Flag it on the contract so a half-finished tenant is visible in admin
        // rather than looking complete.
        await db.from("contracts").update({
          notes: `[${new Date().toISOString()}] convite de acesso falhou: ${msg}`,
        }).eq("id", r.contract_id);
        await notify(db, r.equipe_id, "tenant.provisioned",
          "Ambiente criado, convite pendente",
          `O ambiente de ${proposal.cliente_nome} foi criado, mas o convite de acesso falhou. Reenvie pelo painel.`,
          "/admin", `provfail_${r.contract_id}`);
      }
    } else {
      warnings.push("invite: proposal has no client email");
    }

    if (!r.already_provisioned && invited) {
      await notify(db, r.equipe_id, "tenant.provisioned", "Bem-vindo!",
        "Seu ambiente está pronto. A primeira fatura já está disponível em Faturamento.",
        "/billing", `prov_${r.contract_id}`);
    }

    return json({ success: true, ...r, invited, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[provision-tenant] fatal:", message);
    return json({ error: message }, 500);
  }
});

/** Creates the Asaas customer and a charge per invoice that lacks one. */
async function ensureCharges(
  db: SupabaseClient,
  r: { equipe_id: string; setup_invoice_id: string | null; recurring_invoice_id: string | null },
) {
  const { data: account } = await db
    .from("billing_accounts")
    .select("doc_number, legal_name, billing_email, phone, asaas_customer_id")
    .eq("equipe_id", r.equipe_id).maybeSingle();

  if (!account?.doc_number) {
    throw new Error("billing_account_incomplete — cobranças não emitidas");
  }

  let customerId = account.asaas_customer_id;
  if (!customerId) {
    const customer = await createCustomer({
      name: account.legal_name ?? "Cliente",
      email: account.billing_email,
      cpfCnpj: account.doc_number,
      phone: account.phone,
    });
    customerId = customer.id;
    await db.from("billing_accounts").update({ asaas_customer_id: customerId }).eq("equipe_id", r.equipe_id);
  }

  for (const invoiceId of [r.setup_invoice_id, r.recurring_invoice_id]) {
    if (!invoiceId) continue;

    const { data: inv } = await db
      .from("invoices").select("id, number, total, kind, asaas_payment_id")
      .eq("id", invoiceId).maybeSingle();
    // Already charged — this is a resumed run.
    if (!inv || inv.asaas_payment_id) continue;

    const payment = await createPayment({
      customer: customerId!,
      billingType: "UNDEFINED",
      value: Number(inv.total),
      dueDate: dueDateIn(3),
      description: `${inv.kind === "setup" ? "Implantação" : "Assinatura"} — fatura ${inv.number}`,
      externalReference: `invoice_${inv.id}`,
    });

    await db.from("invoices").update({
      asaas_payment_id: payment.id,
      asaas_invoice_url: payment.invoiceUrl ?? null,
    }).eq("id", inv.id);
  }
}

/** Invites the client and attaches their profile to the new team. */
async function ensureInvite(
  db: SupabaseClient, email: string, equipeId: string, nome: string | null,
): Promise<boolean> {
  // A resumed run must not re-invite someone who already accepted.
  const { data: existing } = await db
    .from("profiles").select("user_id, equipe_id").eq("email", email).maybeSingle();

  if (existing) {
    if (existing.equipe_id !== equipeId) {
      await db.from("profiles")
        .update({ equipe_id: equipeId, cargo: "owner", role: "owner" })
        .eq("user_id", existing.user_id);
    }
    return true;
  }

  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    data: { nome_completo: nome ?? undefined, equipe_id: equipeId },
  });
  if (error) throw new Error(error.message);

  // handle_new_user() creates the profile row; attach it to the team.
  if (data?.user?.id) {
    await db.from("profiles").update({
      equipe_id: equipeId, cargo: "owner", role: "owner", nome_completo: nome ?? null,
    }).eq("user_id", data.user.id);
  }
  return true;
}

async function notify(
  db: SupabaseClient, equipeId: string, type: string,
  title: string, body: string, actionUrl: string, dedupKey: string,
) {
  const { error } = await db.rpc("notify", {
    p_equipe_id: equipeId, p_type: type, p_title: title, p_body: body,
    p_action_url: actionUrl, p_data: {}, p_dedup_key: dedupKey,
  });
  if (error) console.error(`[provision-tenant] notify(${type}):`, error.message);
}
