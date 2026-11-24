// ============================================================================
// Sprint 17 — callback de exclusão de dados do Meta (e deauthorize).
//
// Pública (verify_jwt = false). O Meta manda POST com `signed_request`
// (HMAC-SHA256 com o app secret); sem assinatura válida → 400. Desconecta as
// integrações que aquele usuário do Facebook conectou (apaga tokens do Vault)
// e devolve { url, confirmation_code }. GET ?code= devolve o status.
// Os leads são do cliente (controlador): aqui some a conexão, não o CRM dele.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSignedRequest } from "../_shared/meta.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (req.method === "GET") {
    const code = new URL(req.url).searchParams.get("code") ?? "";
    if (!/^[a-f0-9]{16,64}$/.test(code)) return json({ error: "invalid_code" }, 400);
    const { data } = await db.rpc("crm_data_deletion_status", { p_code: code });
    return data ? json(data) : json({ error: "not_found" }, 404);
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const raw = await req.text();
  if (raw.length > 10_000) return json({ error: "too_large" }, 413);
  let sr = "";
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      sr = String(JSON.parse(raw)?.signed_request ?? "");
    } catch {
      sr = "";
    }
  } else {
    sr = new URLSearchParams(raw).get("signed_request") ?? "";
  }

  const parsed = await parseSignedRequest(sr, Deno.env.get("META_APP_SECRET") ?? "");
  if (!parsed) return json({ error: "invalid_signed_request" }, 400);

  const { data, error } = await db.rpc("_crm_meta_deletion", { p_fb_user_id: parsed.user_id });
  if (error) {
    console.error("[meta-data-deletion]", error.message);
    return json({ error: "internal" }, 500);
  }
  const code = (data as { confirmation_code: string }).confirmation_code;
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  return json({ url: `${appUrl}/exclusao-de-dados?code=${code}`, confirmation_code: code });
});
