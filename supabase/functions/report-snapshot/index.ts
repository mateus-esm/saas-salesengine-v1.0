// ============================================================================
// Sprint 9 · T11 — the public report endpoint.
//
// Same shape as public-proposal (Sprint 8 T17), and for the same reason: the
// page has to render for someone who is not logged in, but report_runs must
// NEVER be readable by `anon`. Exposing that table would publish every client's
// revenue, pipeline and best deals to anyone who can send a select.
//
// So the table stays closed, this function reads it with the service role, and
// it returns only what the page draws. The token is the entire authorisation —
// which is why it is 48 hex characters from gen_random_bytes and why runs
// expire after 90 days.
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

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const token = ((body as { token?: string }).token ?? url.searchParams.get("token") ?? "").trim();

    // A token that is not even the right shape never reaches the database.
    if (!token || !/^[0-9a-f]{32,64}$/.test(token)) {
      return json({ error: "invalid_token" }, 400);
    }

    const { data, error } = await db.rpc("get_report_by_token", { p_token: token });
    if (error) throw new Error(error.message);

    // Unknown and expired are answered the same way to a stranger: a distinct
    // "this expired" for an unknown token would confirm which tokens exist.
    if (!data) return json({ error: "not_found" }, 404);
    if ((data as { expired?: boolean }).expired) return json({ error: "expired" }, 410);

    return json({ report: data });
  } catch (e) {
    console.error("[report-snapshot]", e);
    return json({ error: "internal_error" }, 500);
  }
});
