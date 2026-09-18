// ============================================================================
// Sprint 8.2 · discovery_q&a · T73 — o discovery público.
//
// Público (verify_jwt = false), como public-proposal e public-form: a pessoa tem
// só o link. Lê com o service_role e devolve apenas o que o formulário mostra;
// `anon` nunca toca nas tabelas. Toda validação está nas RPCs, não aqui — o
// navegador manda o que quiser, quem decide é o banco.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { discoveryError, parseDiscoveryRequest } from "../_shared/public-discovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

if (import.meta.main) {
  serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const parsed = parseDiscoveryRequest(await req.json().catch(() => null));
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } =
      parsed.action === "get"
        ? await db.rpc("_discovery_get", { p_token: parsed.token })
        : parsed.action === "save"
          ? await db.rpc("_discovery_save", { p_token: parsed.token, p_answers: parsed.answers })
          : await db.rpc("_discovery_submit", { p_token: parsed.token });

    if (error) {
      const answer = discoveryError(error.message);
      if (answer.status === 500) console.error("[public-discovery]", error.message);
      return json(answer, answer.status);
    }

    // Discovery terminado é o sinal de que dá para montar o ambiente ANTES da
    // reunião — que é o ponto inteiro desta sprint. Sem o aviso, o formulário
    // chega preenchido e fica parado esperando alguém reparar.
    //
    // O aviso não pode derrubar o envio: para o cliente o discovery já acabou, e
    // um 500 aqui o faria reenviar um formulário que já foi gravado.
    if (parsed.action === "submit") {
      const onboardingId = (data as { onboarding_id?: string } | null)?.onboarding_id;
      if (onboardingId) {
        const { data: row } = await db
          .from("onboardings").select("equipe_id, cliente_nome").eq("id", onboardingId).maybeSingle();
        if (row?.equipe_id) {
          const { error: notifyError } = await db.rpc("notify", {
            p_equipe_id: row.equipe_id,
            p_type: "onboarding.discovery_done",
            p_title: "Discovery recebido",
            p_body: "",
            p_action_url: "/admin?tab=onboarding",
            p_data: { cliente_nome: row.cliente_nome ?? "", link_onboarding: "/admin?tab=onboarding" },
            p_dedup_key: `discovery_done_${onboardingId}`,
          });
          if (notifyError) console.error("[public-discovery] notify:", notifyError.message);
        }
      }
    }

    return json(data);
  });
}
