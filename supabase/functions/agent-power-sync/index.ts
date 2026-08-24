// ============================================================================
// Sprint 8.1 fixes — reconcile agent on/off state on demand.
//
// WHY THIS EXISTS: the daily cron already reconciles agents, but "daily" is the
// wrong latency for a resume. When the founder grants an add-on to unblock a
// client, that client's agent must come back NOW — waiting until tomorrow means
// a paying customer stays dark for up to 24 hours after being made whole.
//
// The eligibility rules stay in SQL (agents_to_pause / agents_to_resume); this
// only triggers the same reconciliation the cron runs, so the two can never
// disagree about who should be on.
//
// Accepts either a super-admin JWT (the admin panel) or the cron secret.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEqual } from "../_shared/asaas.ts";
import { syncAgentPower } from "../_shared/agent-power.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Path A — the cron.
  const cronSecret = Deno.env.get("BILLING_CRON_SECRET");
  const viaCron = !!cronSecret && safeEqual(req.headers.get("x-cron-secret") ?? "", cronSecret);

  // Path B — a super admin in the admin panel.
  let viaAdmin = false;
  if (!viaCron) {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: profile } = await db
      .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    viaAdmin = profile?.role === "super_admin";
  }

  if (!viaCron && !viaAdmin) return json({ error: "forbidden" }, 403);

  // The cron posts nothing at all and the admin panel posts `{}`, so an absent
  // or unparseable body is the normal case, not an error: it means "sweep
  // everything", which is exactly what the cron wants.
  let equipeId: string | null = null;
  let force = false;
  try {
    const body = await req.json();
    if (body && typeof body === "object") {
      equipeId = typeof body.equipe_id === "string" ? body.equipe_id : null;
      force = body.force === true;
    }
  } catch { /* no body */ }

  // Forcing an agent on is an override of our own bookkeeping. The cron must
  // never do it — only a human looking at a specific team.
  if (force && !viaAdmin) return json({ error: "force_requires_admin" }, 403);

  try {
    const result = await syncAgentPower(db, { equipeId, force });
    return json({ ok: true, equipe_id: equipeId, force, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[agent-power-sync]", message);
    return json({ error: message }, 500);
  }
});
