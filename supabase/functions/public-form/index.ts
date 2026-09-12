// ============================================================================
// Sprint 11 · Onda 4 · T45 — the public form of a record ("Dados para Contrato").
//
// Public (verify_jwt = false), like public-proposal and report-snapshot: the
// person holds only the link (/f/:token). This reads with the service role and
// returns only what the form shows; `anon` never touches the tables. Every field
// is validated by the database (_crm_public_form_submit), never trusted from the
// browser. The link works until the form is sent, or for 30 days.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { parsePublicFormRequest, publicFormError } from "../_shared/public-form.ts";

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

    const parsed = parsePublicFormRequest(await req.json().catch(() => null));
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } =
      parsed.action === "get"
        ? await db.rpc("_crm_public_form_get", { p_token: parsed.token })
        : await db.rpc("_crm_public_form_submit", { p_token: parsed.token, p_values: parsed.values });

    if (error) {
      const answer = publicFormError(error.message);
      if (answer.status === 500) console.error("[public-form]", error.message);
      return json(answer, answer.status);
    }
    return json(parsed.action === "get" ? { form: data } : data);
  });
}
