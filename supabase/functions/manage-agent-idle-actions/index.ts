// ============================================================================
// Sprint 7.3 — idle actions (provider's "Ações de inatividade" tab).
//
// Upstream:
//   GET  /v2/agent/{agentId}/idle-actions
//   POST /v2/agent/{agentId}/idle-actions   ← replaces the WHOLE configuration
//
// POST is a full replace, not an append: the body carries every action plus the
// finish action. So this function exposes `get` and `save`, not per-item CRUD —
// modelling it as create/update/delete would invent a granularity the provider
// does not have and would lose actions on every write.
//
// ⚠️ The provider's own naming is asymmetric:
//     GET  returns { actions: [...], finishAction: { seconds, ... } }
//     POST accepts { actions: [...], finishOn:     { seconds } }
// Reading `finishOn` back off a GET yields undefined, which would silently
// reset the finish timer to a default on the next save. `toUpstream` maps it.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  AI_ENGINE_BASE, corsHeaders, resolveAgentContext, resolveAction, readBody,
  upstreamError, ok, badRequest, errorResponse,
} from "../_shared/agent-context.ts";

interface WorkingHourBlock { start: string; end: string }
interface WorkingHourDay { dayWeek: number; active: boolean; hours: WorkingHourBlock[] }

/** "HH:MM", 24h. Rejected client-side too, but the provider's 400 is opaque. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeWorkingHours(input: unknown): WorkingHourDay[] | null {
  if (!Array.isArray(input)) return null;
  const days = input
    .filter((d: any) => d && typeof d.dayWeek === 'number' && d.dayWeek >= 0 && d.dayWeek <= 6)
    .map((d: any) => ({
      dayWeek: d.dayWeek,
      active: d.active === true,
      hours: Array.isArray(d.hours)
        ? d.hours
            .filter((h: any) => HHMM.test(String(h?.start)) && HHMM.test(String(h?.end)))
            .map((h: any) => ({ start: String(h.start), end: String(h.end) }))
        : [],
    }));
  return days.length ? days : null;
}

/**
 * Build the POST body. `seconds` is the delay before the action fires;
 * `finishOn.seconds` is when the interaction is closed outright.
 */
function toUpstream(body: Record<string, unknown>) {
  const rawActions = Array.isArray(body.actions) ? body.actions : [];
  const actions = rawActions.map((a: any) => {
    const allowAllHours = a?.allowAllHours !== false;
    const workingHours = allowAllHours ? null : normalizeWorkingHours(a?.workingHours);
    return {
      instructions: String(a?.instructions ?? ''),
      seconds: Number(a?.seconds ?? 0),
      allowAllHours,
      // Omit entirely when unrestricted — the provider requires it only when
      // allowAllHours is false, and sending null alongside false is a 400.
      ...(workingHours ? { workingHours } : {}),
    };
  });

  // Accept either spelling from the client so a round-tripped GET works.
  const finishSeconds = Number(
    (body.finishOn as any)?.seconds ??
    (body.finishAction as any)?.seconds ??
    600,
  );

  return { actions, finishOn: { seconds: finishSeconds } };
}

function validate(payload: ReturnType<typeof toUpstream>): string | null {
  if (!Number.isFinite(payload.finishOn.seconds) || payload.finishOn.seconds <= 0) {
    return 'finishOn.seconds must be a positive number of seconds';
  }
  for (const [i, a] of payload.actions.entries()) {
    if (!a.instructions.trim()) return `Action ${i + 1}: instructions is required`;
    if (!Number.isFinite(a.seconds) || a.seconds <= 0) {
      return `Action ${i + 1}: seconds must be a positive number`;
    }
    if (!a.allowAllHours && !('workingHours' in a)) {
      return `Action ${i + 1}: define at least one valid working-hours block (HH:MM) or allow all hours`;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { agentId, engineHeaders } = await resolveAgentContext(req);
    const body = await readBody(req);
    const action = resolveAction(req, body, 'get');
    const url = `${AI_ENGINE_BASE}/agent/${agentId}/idle-actions`;

    if (action === 'get') {
      const res = await fetch(url, { headers: engineHeaders });
      if (!res.ok) return upstreamError(res, 'idle-actions');
      const data = await res.json();
      return ok({
        actions: Array.isArray(data?.actions) ? data.actions : [],
        // Normalize the provider's GET-side name to the one the client sends
        // back on save, so the round trip is symmetric on our side of the wire.
        finishOn: { seconds: Number(data?.finishAction?.seconds ?? 600) },
      });
    }

    if (action === 'save') {
      const payload = toUpstream(body);
      const invalid = validate(payload);
      if (invalid) return badRequest(invalid);

      const res = await fetch(url, {
        method: 'POST', headers: engineHeaders, body: JSON.stringify(payload),
      });
      if (!res.ok) return upstreamError(res, 'idle-actions-save');

      // Re-read so the UI renders stored truth: POST replaces the whole set and
      // the provider assigns ids and action types we did not send.
      const after = await fetch(url, { headers: engineHeaders });
      if (!after.ok) return ok({ success: true });
      const data = await after.json();
      return ok({
        actions: Array.isArray(data?.actions) ? data.actions : [],
        finishOn: { seconds: Number(data?.finishAction?.seconds ?? payload.finishOn.seconds) },
      });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (error) {
    return errorResponse(error);
  }
});
