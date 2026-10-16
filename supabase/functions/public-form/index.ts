// ============================================================================
// Sprint 11 · Onda 4 · T45 — the public form of a record ("Dados para Contrato").
//
// Public (verify_jwt = false), like public-proposal and report-snapshot: the
// person holds only the link (/f/:token). This reads with the service role and
// returns only what the form shows; `anon` never touches the tables. Every field
// is validated by the database (_crm_public_form_submit), never trusted from the
// browser. The contract link works until the form is sent, or for 30 days; an
// intake form (SE-SUP1-7, crm_forms) works while it is active.
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

    // SE-SUP1-7: the same /f/:token serves two kinds. `get` asks the intake forms
    // (crm_forms) first — NULL means "not one of mine" — then the contract form.
    // `submit` is told the kind by the page, which learned it from `get`.
    let result: { data: unknown; error: { message: string } | null };
    if (parsed.action === "get") {
      const intake = await db.rpc("_crm_intake_form_get", { p_token: parsed.token });
      // PGRST202 = the RPC is not deployed yet (function before migration): the
      // contract forms must keep working in that window.
      const notDeployed = (intake.error as { code?: string } | null)?.code === "PGRST202";
      if ((intake.error && !notDeployed) || intake.data) {
        result = intake;
      } else {
        result = await db.rpc("_crm_public_form_get", { p_token: parsed.token });
      }
    } else if (parsed.kind === "intake") {
      result = await db.rpc("_crm_intake_submit", { p_token: parsed.token, p_values: parsed.values });
    } else {
      result = await db.rpc("_crm_public_form_submit", { p_token: parsed.token, p_values: parsed.values });
    }
    const { data, error } = result;

    if (error) {
      const answer = publicFormError(error.message);
      if (answer.status === 500) console.error("[public-form]", error.message);
      return json(answer, answer.status);
    }
    return json(parsed.action === "get" ? { form: data } : data);
  });
}
