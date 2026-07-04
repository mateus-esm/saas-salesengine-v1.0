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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Fetch all non-error instances
    const { data: instances, error: fetchError } = await supabase
      .from("wpp_instances")
      .select("id, instance_name, status, equipe_id")
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

    for (const inst of instances) {
      checked++;
      let newStatus: string;

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
          newStatus = mapState(data.state);
        }
      } catch (err) {
        console.warn(
          `[HealthCheck] fetch error for ${inst.instance_name}: ${err}, marking disconnected`,
        );
        newStatus = "disconnected";
      }

      // Only update if status actually changed
      if (newStatus !== inst.status) {
        const { error: updateError } = await supabase
          .from("wpp_instances")
          .update({ status: newStatus, last_health_at: new Date().toISOString() })
          .eq("id", inst.id);

        if (updateError) {
          console.error(
            `[HealthCheck] update error for ${inst.instance_name}: ${updateError}`,
          );
        } else {
          changedEquipes.add(inst.equipe_id);
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
