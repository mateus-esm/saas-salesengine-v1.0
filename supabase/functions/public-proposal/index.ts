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
import { docType, isPlausibleEmail, isValidBrDoc, onlyDigits } from "../_shared/br-doc.ts";
import { runProvisionEffects, type ProvisionResult } from "../_shared/provision-effects.ts";

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
      .select("id, codigo, cliente_nome, cliente_email, cliente_doc, setup_price, monthly_price, list_monthly_price, term_months, valid_until, status, first_viewed_at, allow_plan_choice, recommended_plan_code, setup_waived, setup_charge_timing, trial_days, chosen_plan_code")
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

    // The page is a landing page now, so it needs the catalogue and the offer
    // terms, not just this client's numbers.
    const { data: plans } = await db
      .from("billing_products")
      .select("code, name, list_price, credits_whatsapp, credits_copilot, metadata")
      .eq("kind", "plan").eq("active", true)
      .order("list_price", { ascending: true });

    const { data: deliverables } = await db
      .from("setup_deliverables")
      .select("code, title, description, client_keeps")
      .eq("active", true)
      .order("sort_order", { ascending: true });

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
        // The offer itself
        allow_plan_choice: proposal.allow_plan_choice !== false,
        recommended_plan_code: proposal.recommended_plan_code,
        chosen_plan_code: proposal.chosen_plan_code,
        setup_waived: proposal.setup_waived === true,
        setup_charge_timing: proposal.setup_charge_timing ?? "on_accept",
        trial_days: proposal.trial_days ?? 15,
        // A página só mostra o campo de e-mail quando a proposta não traz um.
        needs_email: !proposal.cliente_email,
        plans: plans ?? [],
        deliverables: deliverables ?? [],
      });
    }

    if (action === "accept") {
      if (proposal.status === "aceita") return json({ error: "already_accepted" }, 409);
      if (expired) return json({ error: "expired" }, 409);
      if (!["enviada", "vista", "rascunho"].includes(proposal.status)) {
        return json({ error: "not_acceptable" }, 409);
      }

      const { accepted_name, accepted_doc, accepted_email, chosen_plan_code } = body as {
        accepted_name?: string; accepted_doc?: string;
        accepted_email?: string; chosen_plan_code?: string;
      };
      if (!accepted_name?.trim()) return json({ error: "name_required" }, 400);

      // ── CPF/CNPJ e e-mail: obrigatórios, conferidos AQUI ────────────────────
      //
      // Sprint 8.2. O campo do documento dizia "Opcional" na página e esta
      // função gravava o que viesse. As quatro aceitações que existem em
      // produção têm accepted_doc = "", e a partir daí:
      //
      //     accepted_doc = "" → billing_accounts.doc_number = null
      //       → o Asaas não abre cobrança sem documento
      //         → a fatura existe e o dinheiro nunca é pedido
      //
      // É por isso que a FAT-2026-000018 da Rema (R$700) está aberta sem
      // cobrança. E sem e-mail o convite de acesso não sai: WI Advogados e
      // Jornada do R1 foram provisionados sem nenhum, e o cliente nunca
      // recebeu login.
      //
      // A conferência é no SERVIDOR e não no navegador porque este endpoint é
      // público e chamável direto — a validação da página é conveniência, não
      // defesa.
      const chargeable =
        Number(proposal.setup_price ?? 0) > 0 ||
        Number(proposal.monthly_price ?? 0) > 0 ||
        proposal.allow_plan_choice !== false ||
        proposal.chosen_plan_code != null;

      if (chargeable && !isValidBrDoc(accepted_doc ?? "")) {
        return json({ error: "doc_invalid" }, 400);
      }

      // Um e-mail já negociado na proposta serve; o do formulário completa
      // quando a proposta não tem nenhum — que é o caso da metade delas.
      const email = (accepted_email ?? "").trim() || (proposal.cliente_email ?? "").trim();
      if (!isPlausibleEmail(email)) {
        return json({ error: "email_required" }, 400);
      }

      // Validate the choice against the catalogue rather than trusting the
      // browser: a forged code would otherwise become the signed contract.
      let planCode: string | null = proposal.chosen_plan_code ?? null;
      if (proposal.allow_plan_choice !== false && chosen_plan_code) {
        const valid = (plans ?? []).some((p) => (p as { code: string }).code === chosen_plan_code);
        if (!valid) return json({ error: "invalid_plan" }, 400);
        planCode = chosen_plan_code;
      }
      if (proposal.allow_plan_choice !== false && !planCode) {
        return json({ error: "plan_required" }, 400);
      }

      // Built from the database, never from the request. If the client could
      // supply the snapshot, the audit trail would prove nothing.
      const chosenPlan = (plans ?? []).find((p) => (p as { code: string }).code === planCode) as
        { code: string; name: string; list_price: number } | undefined;

      const snapshot = {
        codigo: proposal.codigo,
        cliente_nome: proposal.cliente_nome,
        setup_price: proposal.setup_waived ? 0 : Number(proposal.setup_price ?? 0),
        setup_waived: proposal.setup_waived === true,
        setup_charge_timing: proposal.setup_charge_timing ?? "on_accept",
        trial_days: proposal.trial_days ?? 15,
        // A página só mostra o campo de e-mail quando a proposta não traz um.
        needs_email: !proposal.cliente_email,
        // The tier they actually picked, at the price shown when they picked it.
        chosen_plan: chosenPlan ? { code: chosenPlan.code, name: chosenPlan.name, price: chosenPlan.list_price } : null,
        monthly_price: chosenPlan ? Number(chosenPlan.list_price) : Number(proposal.monthly_price ?? 0),
        list_monthly_price: proposal.list_monthly_price,
        term_months: proposal.term_months,
        items: items ?? [],
        deliverables: deliverables ?? [],
        doc_type: docType(accepted_doc ?? ""),
        captured_at: new Date().toISOString(),
      };

      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

      const { error: accErr } = await db.from("proposal_acceptances").insert({
        proposal_id: proposal.id,
        ip,
        user_agent: req.headers.get("user-agent"),
        accepted_name: accepted_name.trim(),
        // Só dígitos: é o formato que o gateway espera, e guardar a máscara
        // significa normalizar de novo em todo lugar que lê.
        accepted_doc: onlyDigits(accepted_doc ?? "") || null,
        terms_snapshot: snapshot,
      });
      // 23505 = a second click on Accept. Not an error worth showing.
      if (accErr && accErr.code !== "23505") throw new Error(accErr.message);

      await db.from("proposals").update({
        status: "aceita",
        chosen_plan_code: planCode,
        monthly_price: chosenPlan ? chosenPlan.list_price : proposal.monthly_price,
        // O e-mail do aceite vira o e-mail da proposta quando ela não tinha um.
        // Sem isto o provisionamento não tem para onde mandar o convite.
        cliente_email: proposal.cliente_email ?? email,
        cliente_doc: proposal.cliente_doc ?? (onlyDigits(accepted_doc ?? "") || null),
      }).eq("id", proposal.id);

      // ── o card nasce AQUI, na etapa 'aceite' ────────────────────────────────
      //
      // Antes, o card do quadro era criado por `provision_tenant_from_proposal`.
      // Isso deixava dois buracos:
      //
      //   1. Se o provisionamento falhasse (o passo logo abaixo), a proposta
      //      ficava `aceita` e o negócio não aparecia em LUGAR NENHUM do
      //      quadro. Um cliente que assinou ficava invisível justamente no caso
      //      em que alguém precisa agir.
      //   2. A etapa 'aceite' — a primeira, marcada `is_initial` — nunca
      //      recebia ninguém. Era uma coluna que não podia ter card.
      //
      // Criando aqui, 'aceite' passa a significar exatamente "assinou, o
      // ambiente ainda não existe": ou o provisionamento o move para
      // 'boas_vindas' em seguida, ou ele fica visível esperando o botão
      // "Provisionar". A etapa deixa de ser decorativa e vira a fila de quem
      // precisa de atenção.
      //
      // `on_conflict: proposal_id` porque um segundo clique em Aceitar não pode
      // criar um segundo card — e `provision_tenant_from_proposal` já sabe
      // reaproveitar um card que exista por proposal_id.
      try {
        const { data: aceiteStage } = await db.rpc("onboarding_stage_id", { p_code: "aceite" });
        if (aceiteStage) {
          await db.from("onboardings").upsert({
            proposal_id: proposal.id,
            stage_id: aceiteStage as string,
            cliente_nome: proposal.cliente_nome,
          }, { onConflict: "proposal_id", ignoreDuplicates: true });
        }
      } catch (e) {
        // Não é fatal: o aceite já está gravado, e o provisionamento abaixo
        // cria o card de qualquer jeito. Isto é a rede de segurança, não o
        // caminho principal.
        console.error("[public-proposal] card do onboarding:", e instanceof Error ? e.message : String(e));
      }

      // ── o aceite já provisiona ──────────────────────────────────────────────
      //
      // Sprint 8.2 (03/09). Antes disto, o aceite só avisava o fundador — "clique
      // em Provisionar" — e o cliente ficava sem acesso e sem a mensagem de
      // boas-vindas até alguém abrir o painel. O CPF/CNPJ e o e-mail já foram
      // validados acima, então não há motivo para esperar: o ambiente é criado,
      // o convite de login sai para o e-mail que ele acabou de informar, e a
      // mensagem de boas-vindas (com o link do discovery) vai junto — no domínio
      // do nicho da proposta, se houver um escolhido.
      //
      // Uma falha aqui NÃO desfaz o aceite, que já está gravado. O botão
      // "Provisionar" no painel continua existindo, é idempotente, e é o
      // caminho manual para quando isto falhar ou para propostas aceitas antes
      // deste deploy.
      const provisionWarnings: string[] = [];
      try {
        const { data: provResult, error: provErr } = await db.rpc("provision_tenant_from_proposal", {
          p_proposal_id: proposal.id,
          p_golive_previsto: null,
        });
        if (provErr) throw new Error(provErr.message);

        const r = provResult as ProvisionResult;
        const { warnings } = await runProvisionEffects(db, r, {
          cliente_nome: proposal.cliente_nome,
          cliente_email: proposal.cliente_email ?? email,
        });
        provisionWarnings.push(...warnings);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[public-proposal] auto-provision failed:", msg);
        provisionWarnings.push(`provisionamento automático falhou: ${msg}`);
      }

      await notifyFounder(db, "proposal.accepted", "Proposta aceita! 🎉",
        `${proposal.cliente_nome} aceitou a proposta ${proposal.codigo}`
          + (chosenPlan ? ` no plano ${chosenPlan.name}` : "")
          + (provisionWarnings.length
            ? `. Provisionado com aviso: ${provisionWarnings.join("; ")}`
            : ". Ambiente provisionado e boas-vindas enviadas automaticamente."),
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
