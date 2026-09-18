// ============================================================================
// Sprint 8.2 · discovery_q&a · T77 — o fundador gera o link do discovery.
//
// _discovery_ensure_link é do service_role, então o navegador não a alcança —
// é de propósito: quem gera um link de acesso público não pode ser o browser.
// Aqui a pessoa é identificada, conferida como super admin, e só então o token
// é criado. Ele volta em claro UMA vez; depois disso só existe o hash.
//
// O papel é lido de `profiles.role`, como em golive-tenant: `user_roles` e
// `profiles.role` divergem neste banco, e quem o servidor obedece é profiles.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { data: me } = await db.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (me?.role !== "super_admin") return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as { onboarding_id?: string };
    if (!body.onboarding_id) return json({ error: "onboarding_id_required" }, 400);

    const { data: onboarding } = await db
      .from("onboardings").select("equipe_id").eq("id", body.onboarding_id).maybeSingle();
    if (!onboarding) return json({ error: "onboarding_not_found" }, 404);

    const { data: token, error } = await db.rpc("_discovery_ensure_link", {
      p_onboarding_id: body.onboarding_id,
    });
    if (error) throw new Error(error.message);

    // O produto é white-label por domínio: o link tem que sair no domínio DESTE
    // cliente, senão a primeira tela que ele abre é a marca de outro.
    const { data: origin } = onboarding.equipe_id
      ? await db.rpc("tenant_public_origin", { p_equipe_id: onboarding.equipe_id })
      : { data: "" };

    const base = (typeof origin === "string" && origin) || "";
    if (!base) return json({ error: "sem_dominio" }, 409);

    return json({ url: `${base}/discovery/${token}` });
  } catch (e) {
    console.error("[admin-discovery-link]", e);
    return json({ error: "internal_error" }, 500);
  }
});
