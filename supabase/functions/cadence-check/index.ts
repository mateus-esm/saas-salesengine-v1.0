import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sprint 5.3 T8 — periodic cadence/SLA checker.
// Intended to be invoked on a schedule (e.g. hourly pg_cron / Supabase
// scheduled function). For each pipeline stage that has webhook_triggers, it
// finds open opportunities that just breached an SLA or cadence deadline and
// fires the mapped webhook_configs.
//
// Idempotency: pass ?window_minutes=N (default 60) matching your cron interval.
// A breach only fires when its crossing moment falls inside [now-window, now],
// so a stable cron fires each breach roughly once.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookTrigger {
  event: "on_stage_entered" | "on_idle_breach" | "on_cadence_deadline";
  webhook_id: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const windowMinutes = Number(url.searchParams.get("window_minutes") ?? "60");
    const windowMs = (Number.isFinite(windowMinutes) ? windowMinutes : 60) * 60_000;
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    // Stages that actually have triggers configured.
    const { data: stages, error: stagesErr } = await supabase
      .from("pipeline_stages_v2")
      .select("id, equipe_id, name, max_idle_hours, webhook_triggers")
      .is("deleted_at", null)
      .not("webhook_triggers", "eq", "[]");
    if (stagesErr) return json({ error: stagesErr.message }, 500);

    // Cache webhook_configs by id (url + headers) lazily.
    const hookCache = new Map<string, { url: string; headers: Record<string, string> | null } | null>();
    const loadHook = async (id: string) => {
      if (hookCache.has(id)) return hookCache.get(id)!;
      const { data } = await supabase
        .from("webhook_configs")
        .select("url, headers, active")
        .eq("id", id)
        .eq("active", true)
        .maybeSingle();
      const value = data ? { url: data.url, headers: data.headers } : null;
      hookCache.set(id, value);
      return value;
    };

    const fire = async (
      webhookId: string,
      event: string,
      payload: Record<string, unknown>,
    ) => {
      const hook = await loadHook(webhookId);
      if (!hook) return false;
      try {
        await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(hook.headers ?? {}) },
          body: JSON.stringify({ event, ...payload }),
        });
        return true;
      } catch (e) {
        console.error(`webhook ${event} failed:`, e);
        return false;
      }
    };

    let fired = 0;
    let scanned = 0;

    for (const stage of (stages ?? []) as Array<{
      id: string;
      equipe_id: string;
      name: string;
      max_idle_hours: number | null;
      webhook_triggers: WebhookTrigger[];
    }>) {
      const triggers = stage.webhook_triggers ?? [];
      const idleHook = triggers.find((t) => t.event === "on_idle_breach")?.webhook_id;
      const cadenceHook = triggers.find((t) => t.event === "on_cadence_deadline")?.webhook_id;
      if (!idleHook && !cadenceHook) continue;

      const { data: opps } = await supabase
        .from("opportunities")
        .select("id, lead_id, stage_entered_at, lead:leads!inner(name, next_contact)")
        .eq("stage_id", stage.id)
        .eq("status", "open")
        .is("deleted_at", null);

      for (const opp of (opps ?? []) as Array<{
        id: string;
        lead_id: string;
        stage_entered_at: string | null;
        lead: { name: string | null; next_contact: string | null } | null;
      }>) {
        scanned++;
        const base = {
          equipe_id: stage.equipe_id,
          stage: { id: stage.id, name: stage.name },
          opportunity_id: opp.id,
          lead: { id: opp.lead_id, name: opp.lead?.name ?? null },
        };

        // Idle breach — fire when the crossing moment lands inside the window.
        if (idleHook && stage.max_idle_hours && opp.stage_entered_at) {
          const crossing =
            new Date(opp.stage_entered_at).getTime() + stage.max_idle_hours * 3_600_000;
          if (crossing <= now && crossing > now - windowMs) {
            if (await fire(idleHook, "on_idle_breach", base)) fired++;
          }
        }

        // Cadence deadline — next_contact is a date; fire once on its day.
        if (cadenceHook && opp.lead?.next_contact) {
          if (opp.lead.next_contact <= todayStr) {
            // Only fire on the deadline day itself to avoid daily repeats for
            // long-overdue leads (those are surfaced in-app already).
            if (opp.lead.next_contact === todayStr) {
              if (await fire(cadenceHook, "on_cadence_deadline", base)) fired++;
            }
          }
        }
      }
    }

    return json({ success: true, scanned, fired, window_minutes: windowMinutes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("cadence-check error:", error);
    return json({ error: "Internal server error", details: message }, 500);
  }
});
