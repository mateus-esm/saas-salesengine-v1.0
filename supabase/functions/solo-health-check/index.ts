import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSMIAU_TIMEOUT = 15_000; // 15s

function whatsmiauHeaders(): HeadersInit {
  return {
    apikey: Deno.env.get("WHATSMIAU_API_KEY")!,
    "Content-Type": "application/json",
  };
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isAuthorizedHealthRequest(req: Request): boolean {
  const bearerToken = getBearerToken(req);
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceRoleKey && bearerToken === serviceRoleKey) return true;

  const cronSecret =
    Deno.env.get("SOLO_HEALTH_CRON_SECRET") || Deno.env.get("CRON_SECRET") || "";
  if (!cronSecret) return false;

  return (
    req.headers.get("x-cron-secret") === cronSecret ||
    bearerToken === cronSecret
  );
}

async function whatsmiauFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const baseUrl = Deno.env.get("WHATSMIAU_BASE_URL")!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHATSMIAU_TIMEOUT);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...whatsmiauHeaders(),
        ...(options.headers as Record<string, string> || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reconcile the instance's webhook config on whatsmiau.
 *
 * O dispatcher do whatsmiau ignora webhook.headers no envio, então o token
 * precisa estar na URL (?token=). Instâncias criadas antes desse fix ficaram
 * com a URL sem token (todos os eventos davam 401) — este reconciler corrige
 * o drift a cada tick sem intervenção manual.
 */
async function ensureWebhookConfig(
  instanceName: string,
  expectedUrl: string,
  webhookToken: string,
): Promise<void> {
  try {
    const findRes = await whatsmiauFetch(`/v1/webhook/find/${instanceName}`);
    if (findRes.ok) {
      const found = await findRes.json();
      if (found?.webhook?.url === expectedUrl && found?.webhook?.enabled) {
        return; // config em dia
      }
    }

    const setRes = await whatsmiauFetch(`/v1/webhook/set/${instanceName}`, {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: expectedUrl,
          headers: { "x-webhook-token": webhookToken },
          base64: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      }),
    });

    if (!setRes.ok) {
      console.warn(
        `[HealthCheck] webhook/set ${setRes.status} for ${instanceName}`,
      );
    } else {
      console.log(`[HealthCheck] webhook config reconciled for ${instanceName}`);
    }
  } catch (err) {
    console.warn(`[HealthCheck] webhook reconcile error for ${instanceName}: ${err}`);
  }
}

/** Map whatsmiau connectionState to our internal status. */
function mapState(state: string): string {
  switch (state) {
    case "open":
      return "connected";
    case "close":
      return "disconnected";
    case "connecting":
      return "awaiting_qr";
    case "qr-code":
      return "awaiting_qr";
    default:
      return "disconnected";
  }
}

function extractPhone(data: Record<string, unknown>): string | null {
  const nestedInstance = data.instance as Record<string, unknown> | undefined;
  const candidates = [
    data.phone,
    data.wuid,
    data.ownerJid,
    nestedInstance?.phone,
    nestedInstance?.wuid,
    nestedInstance?.ownerJid,
  ];

  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const digits = value.split("@")[0]?.replace(/\D/g, "") || "";
    if (digits.length >= 8) return digits;
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!isAuthorizedHealthRequest(req)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Fetch all non-error instances
    const { data: instances, error: fetchError } = await supabase
      .from("wpp_instances")
      .select("id, instance_name, status, equipe_id, billing_active, connected_at, phone")
      .neq("status", "error");

    if (fetchError) throw fetchError;
    if (!instances || instances.length === 0) {
      console.log("[HealthCheck] checked=0 changed=[]");
      return new Response(
        JSON.stringify({ checked: 0, changed: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const changedEquipes = new Set<string>();
    let checked = 0;

    const webhookToken = Deno.env.get("WHATSMIAU_WEBHOOK_TOKEN") || "";
    const expectedWebhookUrl = Deno.env.get("SUPABASE_URL") +
      "/functions/v1/solo-wpp-webhook?token=" +
      encodeURIComponent(webhookToken);

    for (const inst of instances) {
      checked++;

      await ensureWebhookConfig(inst.instance_name, expectedWebhookUrl, webhookToken);
      let newStatus: string;
      let stateData: Record<string, unknown> | null = null;

      try {
        const res = await whatsmiauFetch(
          `/v1/instance/connectionState/${inst.instance_name}`,
        );

        if (!res.ok) {
          console.warn(
            `[HealthCheck] connectionState error ${res.status} for ${inst.instance_name}, marking disconnected`,
          );
          newStatus = "disconnected";
        } else {
          const data = await res.json();
          stateData = data;
          newStatus = mapState(data.state);
        }
      } catch (err) {
        console.warn(
          `[HealthCheck] fetch error for ${inst.instance_name}: ${err}, marking disconnected`,
        );
        newStatus = "disconnected";
      }

      const now = new Date().toISOString();
      const updateData: Record<string, unknown> = { last_health_at: now };
      let shouldSyncBilling = false;

      if (newStatus !== inst.status) {
        updateData.status = newStatus;
        shouldSyncBilling = true;
      }

      if (newStatus === "connected") {
        updateData.billing_active = true;
        updateData.connected_at = inst.connected_at || now;
        const phone = stateData ? extractPhone(stateData) : null;
        if (phone && phone !== inst.phone) updateData.phone = phone;
        if (!inst.billing_active) shouldSyncBilling = true;
      }

      const needsUpdate = Object.keys(updateData).length > 1 ||
        !("last_health_at" in updateData);

      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from("wpp_instances")
          .update(updateData)
          .eq("id", inst.id);

        if (updateError) {
          console.error(
            `[HealthCheck] update error for ${inst.instance_name}: ${updateError}`,
          );
        } else {
          if (shouldSyncBilling) changedEquipes.add(inst.equipe_id);
        }
      } else {
        // Still refresh last_health_at even if status didn't change
        const { error: touchError } = await supabase
          .from("wpp_instances")
          .update({ last_health_at: new Date().toISOString() })
          .eq("id", inst.id);

        if (touchError) {
          console.error(
            `[HealthCheck] touch error for ${inst.instance_name}: ${touchError}`,
          );
        }
      }
    }

    // 7. Notify sync-instance-billing for each equipe with a status change
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const equipeId of changedEquipes) {
      try {
        const syncRes = await fetch(
          `${supabaseUrl}/functions/v1/sync-instance-billing`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ equipe_id: equipeId }),
          },
        );

        if (!syncRes.ok) {
          console.error(
            `[HealthCheck] sync-instance-billing error for ${equipeId}: ${syncRes.status}`,
          );
        }
      } catch (err) {
        console.error(
          `[HealthCheck] sync-instance-billing fetch error for ${equipeId}: ${err}`,
        );
      }
    }

    const changed = Array.from(changedEquipes);
    console.log(`[HealthCheck] checked=${checked} changed=${JSON.stringify(changed)}`);

    return new Response(
      JSON.stringify({ checked, changed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[HealthCheck] fatal:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
