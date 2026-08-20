// ============================================================================
// Sprint 8 · T17 — public proposal endpoint.
//
// The old flow built the proposal from query-string parameters (cliente, setup,
// mensalidade, valor_real…), which meant the client could edit their own price
// in the URL before "accepting" it — and nothing recorded that an acceptance
// ever happened.
//
// Now the page renders from the database. The proposals table is NEVER exposed
// to `anon`: doing so would publish every client's negotiated pricing. This
// function reads with the service role and returns only display fields.
//
// The accepted terms snapshot is built HERE, from the database, not from
// anything the browser sends. That is the whole point of the audit trail.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (body as { action?: string }).action ?? url.searchParams.get("action") ?? "get";
    const codigo = ((body as { codigo?: string }).codigo ?? url.searchParams.get("codigo") ?? "").trim().toUpperCase();

    if (!codigo) return json({ error: "codigo_required" }, 400);

    const { data: proposal, error } = await db
      .from("proposals")
      .select("id, codigo, cliente_nome, cliente_email, setup_price, monthly_price, list_monthly_price, term_months, valid_until, status, first_viewed_at")
      .eq("codigo", codigo)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!proposal) return json({ error: "not_found" }, 404);

    const { data: items } = await db
      .from("proposal_items")
      .select("label, description, quantity, unit_price, period, sort_order")
      .eq("proposal_id", proposal.id)
      .order("sort_order", { ascending: true });

    const expired = proposal.valid_until
      ? new Date(`${proposal.valid_until}T23:59:59`) < new Date()
      : false;

    if (action === "get") {
      // First open: record it and tell the founder. Deduped on proposal id, so
      // re-reads do not re-notify.
      if (!proposal.first_viewed_at && proposal.status !== "aceita") {
        await db.from("proposals").update({
          first_viewed_at: new Date().toISOString(),
          status: proposal.status === "enviada" ? "vista" : proposal.status,
        }).eq("id", proposal.id);
        await notifyFounder(db, "proposal.viewed", "Proposta aberta pelo cliente",
          `${proposal.cliente_nome} abriu a proposta ${proposal.codigo}.`, `viewed_${proposal.id}`);
      }

      return json({
        codigo: proposal.codigo,
        cliente_nome: proposal.cliente_nome,
        setup_price: Number(proposal.setup_price ?? 0),
        monthly_price: Number(proposal.monthly_price ?? 0),
        list_monthly_price: proposal.list_monthly_price != null ? Number(proposal.list_monthly_price) : null,
        term_months: proposal.term_months,
        valid_until: proposal.valid_until,
        status: proposal.status,
        expired,
        accepted: proposal.status === "aceita",
        items: items ?? [],
      });
    }

    if (action === "accept") {
      if (proposal.status === "aceita") return json({ error: "already_accepted" }, 409);
      if (expired) return json({ error: "expired" }, 409);
      if (!["enviada", "vista", "rascunho"].includes(proposal.status)) {
        return json({ error: "not_acceptable" }, 409);
      }

      const { accepted_name, accepted_doc } = body as { accepted_name?: string; accepted_doc?: string };
      if (!accepted_name?.trim()) return json({ error: "name_required" }, 400);

      // Built from the database, never from the request. If the client could
      // supply the snapshot, the audit trail would prove nothing.
      const snapshot = {
        codigo: proposal.codigo,
        cliente_nome: proposal.cliente_nome,
        setup_price: Number(proposal.setup_price ?? 0),
        monthly_price: Number(proposal.monthly_price ?? 0),
        list_monthly_price: proposal.list_monthly_price,
        term_months: proposal.term_months,
        items: items ?? [],
        captured_at: new Date().toISOString(),
      };

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

      const { error: accErr } = await db.from("proposal_acceptances").insert({
        proposal_id: proposal.id,
        ip,
        user_agent: req.headers.get("user-agent"),
        accepted_name: accepted_name.trim(),
        accepted_doc: accepted_doc?.trim() ?? null,
        terms_snapshot: snapshot,
      });
      // 23505 = a second click on Accept. Not an error worth showing.
      if (accErr && accErr.code !== "23505") throw new Error(accErr.message);

      await db.from("proposals").update({ status: "aceita" }).eq("id", proposal.id);

      await notifyFounder(db, "proposal.accepted", "Proposta aceita! 🎉",
        `${proposal.cliente_nome} aceitou a proposta ${proposal.codigo}. Provisione o ambiente no painel.`,
        `accepted_${proposal.id}`, "/admin");

      return json({ success: true, accepted: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[public-proposal]", message);
    return json({ error: message }, 500);
  }
});

/**
 * Proposal events belong to the founder's funnel, not to any tenant — a prospect
 * has no team yet. They are addressed to the platform team, identified by
 * PLATFORM_EQUIPE_ID.
 */
async function notifyFounder(
  db: SupabaseClient, type: string, title: string, body: string,
  dedupKey: string, actionUrl = "/admin",
) {
  const equipeId = Deno.env.get("PLATFORM_EQUIPE_ID");
  if (!equipeId) {
    console.warn(`[public-proposal] PLATFORM_EQUIPE_ID not set; ${type} not delivered`);
    return;
  }
  const { error } = await db.rpc("notify", {
    p_equipe_id: equipeId, p_type: type, p_title: title, p_body: body,
    p_action_url: actionUrl, p_data: {}, p_dedup_key: dedupKey,
  });
  if (error) console.error(`[public-proposal] notify(${type}):`, error.message);
}
