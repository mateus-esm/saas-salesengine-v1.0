// ============================================================================
// Sprint 8 · T9 — provisionar um ambiente a partir de uma proposta aceita.
// Sprint 8.2 — provisionar deixou de ser colocar no ar.
// Sprint 8.2 (03/09) — o aceite da proposta já chama isto sozinho agora
// (ver public-proposal/index.ts). Este endpoint continua existindo como o
// caminho MANUAL: reexecutar um provisionamento que falhou pela metade (e-mail
// errado, gateway fora do ar), ou provisionar uma proposta aceita antes deste
// deploy, que nunca disparou o fluxo automático.
//
// O que este clique faz: o ambiente passa a existir, o cliente ganha acesso e
// recebe as boas-vindas com o link para agendar o discovery. O compromisso
// financeiro fica visível (a fatura de implantação é emitida, vencendo na data
// prevista de conclusão), mas o relógio do trial não corre e a mensalidade não
// é cobrada.
//
// O que ele NÃO faz: iniciar o trial, e dizer ao cliente que a primeira fatura
// está disponível. Isso é o go-live, que é um clique separado — o momento em
// que o cliente realmente tem um produto: agente treinado, canais conectados,
// CRM montado.
//
// A ORDEM IMPORTA — banco primeiro, chamadas externas depois:
//   1. provision_tenant_from_proposal() faz equipe + conta + contrato + itens +
//      fatura + card do onboarding numa transação só. Ou existe tudo, ou nada.
//   2. Cobrança e convite e boas-vindas: _shared/provision-effects.ts, o mesmo
//      código que o aceite da proposta chama.
//
// Reexecutar com o mesmo proposal_id RETOMA: a função SQL devolve os ids que já
// existem em vez de duplicar, e cada passo externo é pulado se já aconteceu. É
// o que torna seguro consertar um provisionamento pela metade clicando de novo.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runProvisionEffects, type ProvisionResult } from "../_shared/provision-effects.ts";

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

    // Provisionar cria um cliente faturável — só super admin.
    const { data: me } = await db.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (me?.role !== "super_admin") return json({ error: "forbidden" }, 403);

    const { proposal_id, golive_previsto } = await req.json().catch(() => ({})) as {
      proposal_id?: string;
      golive_previsto?: string;
    };
    if (!proposal_id) return json({ error: "proposal_id_required" }, 400);

    // --- 1. a parte atômica --------------------------------------------------
    const { data: result, error: provErr } = await db.rpc("provision_tenant_from_proposal", {
      p_proposal_id: proposal_id,
      p_golive_previsto: golive_previsto ?? null,
    });
    if (provErr) {
      const known = [
        "proposal_not_found",
        "proposal_not_accepted",
        "target_equipe_not_found",
        // A proposta aponta para uma equipe que já tem contrato vivo. Provisionar
        // assim mesmo cobraria o cliente duas vezes.
        "equipe_has_live_contract",
      ];
      const code = known.find((k) => provErr.message.includes(k));
      return json({ error: code ?? provErr.message }, code ? 409 : 500);
    }

    const r = result as ProvisionResult;

    const { data: proposal } = await db
      .from("proposals")
      .select("cliente_nome, cliente_email")
      .eq("id", proposal_id).maybeSingle();

    // --- 2. cobrança, convite e boas-vindas — o mesmo código que o aceite usa -
    const { charged, invited, warnings } = await runProvisionEffects(db, r, {
      cliente_nome: proposal?.cliente_nome ?? null,
      cliente_email: proposal?.cliente_email ?? null,
    });

    return json({ success: true, ...r, invited, charged, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[provision-tenant] fatal:", message);
    return json({ error: message }, 500);
  }
});
