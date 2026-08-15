// ============================================================================
// Sprint 7.3 — agent webhooks (provider's "Webhooks" tab).
//
// Upstream: GET/PUT /v2/agent/{agentId}/webhooks — eight string URLs.
//
// We always PUT the COMPLETE eight-key object. The provider does not document
// merge-vs-replace on PUT; sending everything makes the distinction irrelevant
// instead of betting the tenant's configuration on an assumption.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  AI_ENGINE_BASE, corsHeaders, resolveAgentContext, resolveAction, readBody,
  upstreamError, ok, errorResponse,
} from "../_shared/agent-context.ts";
import { normalizeWebhooks } from "../_shared/agent-webhooks.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { agentId, engineHeaders } = await resolveAgentContext(req);
    const body = await readBody(req);
    const action = resolveAction(req, body, 'get');
    const url = `${AI_ENGINE_BASE}/agent/${agentId}/webhooks`;

    if (action === 'get') {
      const res = await fetch(url, { headers: engineHeaders });
      if (!res.ok) return upstreamError(res, 'webhooks');
      // Normalize so the client always sees all eight keys, even if the
      // provider omits an unset one.
      return ok({ webhooks: normalizeWebhooks(await res.json()) });
    }

    if (action === 'update') {
      const payload = normalizeWebhooks(body.webhooks ?? body);
      const res = await fetch(url, {
        method: 'PUT', headers: engineHeaders, body: JSON.stringify(payload),
      });
      if (!res.ok) return upstreamError(res, 'webhooks-update');
      // Re-read: the provider returns {success:true}, not the object, and the
      // UI must render stored truth rather than the payload we hoped landed.
      const after = await fetch(url, { headers: engineHeaders });
      return ok({
        webhooks: after.ok ? normalizeWebhooks(await after.json()) : payload,
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
