import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

if (import.meta.main) {
  serve(async (req) => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const body = await req.json();
      const logId = String(body?.log_id || "");
      const dispatchToken = String(body?.dispatch_token || "");

      if (
        body?.operation !== "deliver_outbound" ||
        !uuidPattern.test(logId) ||
        !uuidPattern.test(dispatchToken)
      ) {
        return jsonResponse({ error: "Invalid delivery request" }, 400);
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Claim the delivery once. The random token is generated inside Postgres,
      // is cleared atomically here, and prevents callers from replaying a log ID.
      const { data: deliveryLog, error: claimError } = await supabase
        .from("webhook_logs")
        .update({ dispatch_token: null })
        .eq("id", logId)
        .eq("dispatch_token", dispatchToken)
        .eq("direction", "outbound")
        .is("response_status", null)
        .is("error_message", null)
        .select("id, equipe_id, webhook_config_id, payload")
        .maybeSingle();

      if (claimError) throw claimError;
      if (!deliveryLog?.webhook_config_id) {
        return jsonResponse(
          { error: "Delivery not found or already claimed" },
          404,
        );
      }

      const finishWithError = async (message: string) => {
        await supabase
          .from("webhook_logs")
          .update({ error_message: message })
          .eq("id", deliveryLog.id);
        return jsonResponse({ success: false, error: message });
      };

      const { data: config, error: configError } = await supabase
        .from("webhook_configs")
        .select("url, headers")
        .eq("id", deliveryLog.webhook_config_id)
        .eq("equipe_id", deliveryLog.equipe_id)
        .is("inbound_function", null)
        .maybeSingle();

      if (configError) throw configError;
      if (!config) {
        return await finishWithError("Webhook configuration not found");
      }

      let destination: URL;
      try {
        destination = new URL(String(config.url || ""));
        if (!["http:", "https:"].includes(destination.protocol)) {
          throw new Error("Unsupported protocol");
        }
      } catch {
        return await finishWithError("Webhook destination URL is invalid");
      }

      const configuredHeaders =
        config.headers && typeof config.headers === "object" &&
          !Array.isArray(config.headers)
          ? config.headers as Record<string, unknown>
          : {};
      const outboundHeaders = Object.fromEntries(
        Object.entries(configuredHeaders).map((
          [key, value],
        ) => [key, String(value)]),
      );

      let responseStatus: number | null = null;
      let responseBody: string | null = null;
      let errorMessage: string | null = null;

      try {
        const response = await fetch(destination, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...outboundHeaders },
          body: JSON.stringify(deliveryLog.payload),
          signal: AbortSignal.timeout(30000),
        });
        responseStatus = response.status;
        responseBody = (await response.text()).slice(0, 10000);
      } catch (error) {
        errorMessage = error instanceof Error
          ? error.message
          : "Unknown delivery error";
      }

      const { error: updateError } = await supabase
        .from("webhook_logs")
        .update({
          response_status: responseStatus,
          response_body: responseBody,
          error_message: errorMessage,
        })
        .eq("id", deliveryLog.id);

      if (updateError) throw updateError;

      return jsonResponse({
        success: !errorMessage && responseStatus !== null &&
          responseStatus >= 200 && responseStatus < 300,
        destination_status: responseStatus,
        error: errorMessage,
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Unknown dispatcher error";
      console.error("[deliver-crm-webhook]", message);
      return jsonResponse({ error: message }, 500);
    }
  });
}
