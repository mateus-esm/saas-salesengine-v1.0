import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sprint 5.3 T6 — Tasks API for external automation.
// POST /tasks-api  → create a task for an existing lead, scoped to the team via
// the same x-webhook-secret contract used by crm-webhook. On success, fires any
// `task_created` webhook_configs for the team (outbound notification).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const VALID_STATUSES = new Set(["a_fazer", "fazendo", "feito", "parado"]);

interface TaskPayload {
  title: string;
  description?: string;
  due_date?: string;
  assigned_to?: string; // email or profile UUID
  lead_id?: string;
  lead_phone?: string;
  status?: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const webhookSecret =
      req.headers.get("x-webhook-secret") || url.searchParams.get("secret");
    if (!webhookSecret) return json({ error: "Missing webhook secret" }, 401);

    const { data: equipe, error: equipeError } = await supabase
      .from("equipes")
      .select("id, nome")
      .eq("webhook_secret", webhookSecret)
      .maybeSingle();
    if (equipeError || !equipe) return json({ error: "Invalid webhook secret" }, 401);

    const payload = (await req.json()) as TaskPayload;

    if (!payload.title || !payload.title.trim()) {
      return json({ error: "title is required" }, 400);
    }

    const status = payload.status ?? "a_fazer";
    if (!VALID_STATUSES.has(status)) {
      return json(
        { error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(", ")}` },
        400,
      );
    }

    // Resolve the lead — by id or phone — and confirm it belongs to the team.
    let leadId = payload.lead_id ?? null;
    if (!leadId && payload.lead_phone) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("equipe_id", equipe.id)
        .eq("phone", payload.lead_phone)
        .is("deleted_at", null)
        .maybeSingle();
      leadId = lead?.id ?? null;
    }
    if (!leadId) {
      return json({ error: "lead_id or a resolvable lead_phone is required" }, 400);
    }

    const { data: leadRow, error: leadErr } = await supabase
      .from("leads")
      .select("id, name")
      .eq("id", leadId)
      .eq("equipe_id", equipe.id)
      .maybeSingle();
    if (leadErr || !leadRow) {
      return json({ error: "Lead not found or access denied" }, 404);
    }

    // Resolve assignee — accept a profile UUID or an email, but only within team.
    let assignedTo: string | null = null;
    if (payload.assigned_to) {
      const lookup = supabase
        .from("profiles")
        .select("id")
        .eq("equipe_id", equipe.id);
      const { data: assignee } = await (isUuid(payload.assigned_to)
        ? lookup.eq("id", payload.assigned_to)
        : lookup.eq("email", payload.assigned_to)
      ).maybeSingle();
      if (!assignee) {
        return json({ error: "assigned_to does not match a team member" }, 400);
      }
      assignedTo = assignee.id;
    }

    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .insert({
        lead_id: leadId,
        title: payload.title.trim(),
        description: payload.description ?? null,
        due_date: payload.due_date ?? null,
        status,
        assigned_to: assignedTo,
      })
      .select()
      .single();
    if (taskErr) {
      return json({ error: "Failed to create task", details: taskErr.message }, 500);
    }

    // Outbound: fire any task_created webhooks for the team (best-effort).
    try {
      const { data: hooks } = await supabase
        .from("webhook_configs")
        .select("url, headers")
        .eq("equipe_id", equipe.id)
        .eq("trigger_event", "task_created")
        .eq("active", true);

      await Promise.all(
        ((hooks ?? []) as Array<{ url: string; headers: Record<string, string> | null }>).map(
          (hook) =>
            fetch(hook.url, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(hook.headers ?? {}) },
              body: JSON.stringify({
                event: "task_created",
                equipe_id: equipe.id,
                task,
                lead: { id: leadRow.id, name: leadRow.name },
              }),
            }).catch((e) => console.error("task_created webhook failed:", e)),
        ),
      );
    } catch (hookErr) {
      console.error("Error dispatching task_created webhooks:", hookErr);
    }

    return json({ success: true, task_id: task.id, task }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("tasks-api error:", error);
    return json({ error: "Internal server error", details: message }, 500);
  }
});
