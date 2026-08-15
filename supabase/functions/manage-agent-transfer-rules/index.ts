// ============================================================================
// Sprint 7.3 — transfer rules (provider's "Regras de transferência" tab).
//
// Upstream (all agent-scoped, unlike trainings whose write paths are global):
//   GET    /v2/agent/{agentId}/transfer-rules
//   POST   /v2/agent/{agentId}/transfer-rules
//   PUT    /v2/agent/{agentId}/transfer-rules/{ruleId}
//   DELETE /v2/agent/{agentId}/transfer-rules/{ruleId}
//
// GET returns a bare array, not { data, count }.
//
// `list-targets` proxies GET /v2/workspace/{workspaceId}/team so the UI can
// offer real people for a HUMAN transfer instead of asking for a raw user id.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  AI_ENGINE_BASE, corsHeaders, resolveAgentContext, resolveAction, readBody,
  upstreamError, ok, badRequest, errorResponse,
} from "../_shared/agent-context.ts";

const TRANSFER_TYPES = ['HUMAN', 'AGENT'] as const;

/** Build the upstream body, dropping the destination id the type doesn't use. */
function ruleBody(body: Record<string, unknown>) {
  const type = String(body.type ?? 'HUMAN').toUpperCase();
  return {
    instructions: String(body.instructions ?? ''),
    returnOnFinish: body.returnOnFinish === true,
    notInformWhenTransfer: body.notInformWhenTransfer === true,
    type,
    userId: type === 'HUMAN' ? (body.userId ?? null) : null,
    agentId: type === 'AGENT' ? (body.agentId ?? null) : null,
  };
}

function validate(body: Record<string, unknown>): string | null {
  const type = String(body.type ?? 'HUMAN').toUpperCase();
  if (!TRANSFER_TYPES.includes(type as typeof TRANSFER_TYPES[number])) {
    return `Invalid transfer type: ${type}`;
  }
  if (!String(body.instructions ?? '').trim()) {
    return 'instructions is required';
  }
  // The provider accepts a rule with no destination and then never fires it —
  // a silent no-op is exactly the failure mode this sprint exists to remove.
  if (type === 'HUMAN' && !body.userId) return 'userId is required for a HUMAN transfer';
  if (type === 'AGENT' && !body.agentId) return 'agentId is required for an AGENT transfer';
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { agentId, workspaceId, engineHeaders } = await resolveAgentContext(req);
    const body = await readBody(req);
    const action = resolveAction(req, body, 'list');
    const base = `${AI_ENGINE_BASE}/agent/${agentId}/transfer-rules`;

    if (action === 'list') {
      const res = await fetch(base, { headers: engineHeaders });
      if (!res.ok) return upstreamError(res, 'transfer-rules');
      const data = await res.json();
      return ok({ rules: Array.isArray(data) ? data : (data?.data ?? []) });
    }

    // Human destinations for the rule editor.
    if (action === 'list-targets') {
      if (!workspaceId) return ok({ targets: [] });
      const res = await fetch(`${AI_ENGINE_BASE}/workspace/${workspaceId}/team`, { headers: engineHeaders });
      if (!res.ok) return upstreamError(res, 'team');
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      return ok({
        targets: rows.map((u: any) => ({
          id: u.id,
          name: u.name ?? u.userName ?? u.email ?? u.id,
          role: u.role ?? null,
        })),
      });
    }

    if (action === 'create') {
      const invalid = validate(body);
      if (invalid) return badRequest(invalid);
      const res = await fetch(base, {
        method: 'POST', headers: engineHeaders, body: JSON.stringify(ruleBody(body)),
      });
      if (!res.ok) return upstreamError(res, 'transfer-rules-create');
      return ok(await res.json());
    }

    if (action === 'update') {
      if (!body.ruleId) return badRequest('ruleId is required');
      const invalid = validate(body);
      if (invalid) return badRequest(invalid);
      const res = await fetch(`${base}/${body.ruleId}`, {
        method: 'PUT', headers: engineHeaders, body: JSON.stringify(ruleBody(body)),
      });
      if (!res.ok) return upstreamError(res, 'transfer-rules-update');
      return ok(await res.json().catch(() => ({ success: true })));
    }

    if (action === 'delete') {
      if (!body.ruleId) return badRequest('ruleId is required');
      const res = await fetch(`${base}/${body.ruleId}`, {
        method: 'DELETE', headers: engineHeaders,
      });
      if (!res.ok) return upstreamError(res, 'transfer-rules-delete');
      return ok(await res.json().catch(() => ({ success: true })));
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (error) {
    return errorResponse(error);
  }
});
