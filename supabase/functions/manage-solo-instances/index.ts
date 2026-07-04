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

function monthlyPrice(): number {
  return Number(Deno.env.get("SOLO_INSTANCE_MONTHLY_PRICE") || 100);
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

    // Auth: JWT -> profile -> equipe_id
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("equipe_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.equipe_id) throw new Error("Profile not found");

    const equipeId = profile.equipe_id;

    // Parse body
    const body = await req.json();
    const { action, instance_id, display_name } = body;
    if (!action) throw new Error("action is required");

    const VALID_ACTIONS = ["create", "connect", "status", "logout", "delete"];
    if (!VALID_ACTIONS.includes(action)) {
      throw new Error(`Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`);
    }

    // Helper: fetch instance with ownership check (used by all actions except create)
    async function getOwnedInstance(id: string) {
      const { data: inst, error } = await supabase
        .from("wpp_instances")
        .select("*")
        .eq("id", id)
        .eq("equipe_id", equipeId)
        .single();
      if (error || !inst) throw new Error("Instance not found or access denied");
      return inst;
    }

    let result: Record<string, unknown>;

    switch (action) {
      case "create": {
        if (!display_name || typeof display_name !== "string") {
          throw new Error("display_name is required");
        }
        const slug = slugify(display_name);
        if (!/^[a-z0-9-]{3,30}$/.test(slug)) {
          throw new Error("display_name must produce a slug of 3-30 characters [a-z0-9-]");
        }

        const instanceName = `se-${equipeId.slice(0, 8)}-${slug}`;

        // INSERT row first (service-role)
        const { data: instance, error: insertError } = await supabase
          .from("wpp_instances")
          .insert({
            equipe_id: equipeId,
            instance_name: instanceName,
            display_name: slug,
            status: "awaiting_qr",
          })
          .select()
          .single();

        if (insertError) {
          if (insertError.code === "23505") {
            return new Response(
              JSON.stringify({ error: "nome já em uso" }),
              {
                status: 409,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
          throw insertError;
        }

        // Call whatsmiau POST /v1/instance/create with inline webhook config
        const webhookUrl =
          Deno.env.get("SUPABASE_URL") + "/functions/v1/solo-wpp-webhook";
        const webhookToken = Deno.env.get("WHATSMIAU_WEBHOOK_TOKEN");

        const createPayload = {
          ID: instanceName,
          InstanceName: instanceName,
          groupsIgnore: true,
          webhook: {
            enabled: true,
            url: webhookUrl,
            headers: { "x-webhook-token": webhookToken },
            base64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          },
        };

        const createRes = await whatsmiauFetch("/v1/instance/create", {
          method: "POST",
          body: JSON.stringify(createPayload),
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          console.error("Whatsmiau create error:", createRes.status, errText);
          // Mark row as error
          await supabase
            .from("wpp_instances")
            .update({ status: "error" })
            .eq("id", instance.id);
          return new Response(
            JSON.stringify({ error: `Solo API error: ${createRes.status}` }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // Re-fetch to get latest row state
        const { data: updatedInstance } = await supabase
          .from("wpp_instances")
          .select("*")
          .eq("id", instance.id)
          .single();

        result = {
          instance: updatedInstance,
          monthly_price: monthlyPrice(),
        };
        break;
      }

      case "connect": {
        if (!instance_id) throw new Error("instance_id is required");
        const instance = await getOwnedInstance(instance_id);

        const connectRes = await whatsmiauFetch(
          `/v1/instance/connect/${instance.instance_name}`,
        );

        if (!connectRes.ok) {
          const errText = await connectRes.text();
          console.error("Whatsmiau connect error:", connectRes.status, errText);
          await supabase
            .from("wpp_instances")
            .update({ status: "error" })
            .eq("id", instance.id);
          return new Response(
            JSON.stringify({ error: `Solo API error: ${connectRes.status}` }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const connectData = await connectRes.json();

        if (connectData.connected === true) {
          // Already connected — sync row
          const updateData: Record<string, unknown> = {
            status: "connected",
            connected_at: new Date().toISOString(),
            billing_active: true,
          };
          if (connectData.phone) updateData.phone = connectData.phone;

          await supabase
            .from("wpp_instances")
            .update(updateData)
            .eq("id", instance.id);

          const { data: refreshed } = await supabase
            .from("wpp_instances")
            .select("*")
            .eq("id", instance.id)
            .single();

          result = {
            instance: refreshed,
            connected: true,
            monthly_price: monthlyPrice(),
          };
        } else if (connectData.base64) {
          // QR code returned — keep awaiting_qr
          result = {
            instance: { ...instance, status: "awaiting_qr" },
            qr_base64: connectData.base64,
            connected: false,
            monthly_price: monthlyPrice(),
          };
        } else {
          // Unknown shape — keep current state
          result = {
            instance,
            connected: false,
            monthly_price: monthlyPrice(),
          };
        }
        break;
      }

      case "status": {
        if (!instance_id) throw new Error("instance_id is required");
        const instance = await getOwnedInstance(instance_id);

        const statusRes = await whatsmiauFetch(
          `/v1/instance/connectionState/${instance.instance_name}`,
        );

        if (!statusRes.ok) {
          const errText = await statusRes.text();
          console.error("Whatsmiau status error:", statusRes.status, errText);
          await supabase
            .from("wpp_instances")
            .update({ status: "error" })
            .eq("id", instance.id);
          return new Response(
            JSON.stringify({ error: `Solo API error: ${statusRes.status}` }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const statusData = await statusRes.json();

        // Map whatsmiau states to our statuses
        if (statusData.state === "open") {
          await supabase
            .from("wpp_instances")
            .update({
              status: "connected",
              connected_at: instance.connected_at || new Date().toISOString(),
            })
            .eq("id", instance.id);
        } else if (
          statusData.state === "close" && instance.status === "connected"
        ) {
          await supabase
            .from("wpp_instances")
            .update({ status: "disconnected" })
            .eq("id", instance.id);
        }
        // "connecting" or other states: leave DB as-is

        const { data: refreshed } = await supabase
          .from("wpp_instances")
          .select("*")
          .eq("id", instance.id)
          .single();

        result = {
          instance: refreshed,
          state: statusData.state,
          monthly_price: monthlyPrice(),
        };
        break;
      }

      case "logout": {
        if (!instance_id) throw new Error("instance_id is required");
        const instance = await getOwnedInstance(instance_id);

        // Primary: POST /v1/instance/{id}/logout
        let logoutRes = await whatsmiauFetch(
          `/v1/instance/${instance.instance_name}/logout`,
          { method: "POST" },
        );

        // Fallback: 404 or 405 -> DELETE /v1/instance/logout/{id}
        if (logoutRes.status === 404 || logoutRes.status === 405) {
          logoutRes = await whatsmiauFetch(
            `/v1/instance/logout/${instance.instance_name}`,
            { method: "DELETE" },
          );
        }

        if (!logoutRes.ok) {
          const errText = await logoutRes.text();
          console.error("Whatsmiau logout error:", logoutRes.status, errText);
          await supabase
            .from("wpp_instances")
            .update({ status: "error" })
            .eq("id", instance.id);
          return new Response(
            JSON.stringify({ error: `Solo API error: ${logoutRes.status}` }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // Slot reserved: keep billing_active=true
        await supabase
          .from("wpp_instances")
          .update({ status: "disconnected" })
          .eq("id", instance.id);

        const { data: refreshed } = await supabase
          .from("wpp_instances")
          .select("*")
          .eq("id", instance.id)
          .single();

        result = {
          instance: refreshed,
          monthly_price: monthlyPrice(),
        };
        break;
      }

      case "delete": {
        if (!instance_id) throw new Error("instance_id is required");
        const instance = await getOwnedInstance(instance_id);

        const deleteRes = await whatsmiauFetch(
          `/v1/instance/delete/${instance.instance_name}`,
          { method: "DELETE" },
        );

        if (!deleteRes.ok) {
          const errText = await deleteRes.text();
          console.error("Whatsmiau delete error:", deleteRes.status, errText);

          if (deleteRes.status === 404) {
            // Instance already gone server-side — skip status='error', delete DB row
            console.warn(
              `Instance ${instance.instance_name} not found on whatsmiau (404), deleting DB row anyway`,
            );
          } else {
            await supabase
              .from("wpp_instances")
              .update({ status: "error" })
              .eq("id", instance.id);
            return new Response(
              JSON.stringify({ error: `Solo API error: ${deleteRes.status}` }),
              {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }

        // Delete row
        await supabase
          .from("wpp_instances")
          .delete()
          .eq("id", instance.id);

        result = {
          deleted: true,
          monthly_price: monthlyPrice(),
        };
        break;
      }

      default:
        throw new Error(`Unhandled action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
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
