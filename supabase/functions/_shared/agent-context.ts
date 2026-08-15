// ============================================================================
// Sprint 7.3 — shared request context for the agent-management functions.
//
// `manage-agent-settings`, `-channels`, `-training` and `-intentions` each grew
// their own copy of the same preamble: verify the JWT, read `profiles.equipe_id`,
// read the equipe's provider ids, read the token from the environment. Sprint
// 7.3 adds three more functions; triplicating it again is how the copies drift.
//
// Existing functions are intentionally NOT migrated in this sprint — they work,
// and a mechanical rewrite of four working functions is risk without reward.
// New functions use this.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export const AI_ENGINE_BASE = 'https://api.gptmaker.ai/v2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

export interface AgentContext {
  equipeId: string;
  agentId: string;
  workspaceId: string;
  engineHeaders: Record<string, string>;
}

/**
 * Resolve the caller's agent context, or throw with a message safe to surface.
 *
 * Provider ids pasted through the Admin UI carry whitespace and newlines —
 * several `equipes` rows hold a literal trailing "\n" in `workspace_id`, which
 * produced an invalid URL and a confusing upstream error. Always `.trim()`.
 */
export async function resolveAgentContext(req: Request): Promise<AgentContext> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Unauthorized');
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('equipe_id')
    .eq('user_id', user.id)
    .single();
  if (!profile?.equipe_id) throw new Error('Profile not found');

  const { data: equipe } = await supabase
    .from('equipes')
    .select('gpt_maker_agent_id, workspace_id')
    .eq('id', profile.equipe_id)
    .single();
  if (!equipe?.gpt_maker_agent_id) throw new Error('AI Engine Agent ID not configured');

  const engineToken = Deno.env.get('GPT_MAKER_TOKEN');
  if (!engineToken) throw new Error('AI Engine token not configured');

  return {
    equipeId: profile.equipe_id,
    agentId: equipe.gpt_maker_agent_id.trim(),
    workspaceId: (equipe.workspace_id ?? '').trim(),
    engineHeaders: {
      'Authorization': `Bearer ${engineToken}`,
      'Content-Type': 'application/json',
    },
  };
}

/**
 * Dispatch on the ACTION, never on the HTTP method.
 *
 * `supabase.functions.invoke(name)` with no options sends POST with an empty
 * body, so a method-based branch that then parses the body throws and makes the
 * read path unreachable. That was the Canais bug (Sprint 7.3 W1). Every
 * function in this family resolves an action with a default instead.
 */
export function resolveAction(
  req: Request,
  body: Record<string, unknown>,
  fallback = 'get',
): string {
  const fromQuery = new URL(req.url).searchParams.get('action');
  if (fromQuery) return fromQuery;
  return typeof body.action === 'string' && body.action ? body.action : fallback;
}

/** Parse a JSON body, tolerating the empty body of a default `invoke()`. */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  return await req.json().catch(() => ({})) as Record<string, unknown>;
}

/** Surface the provider's response body verbatim so a bad enum is diagnosable. */
export async function upstreamError(res: Response, label: string): Promise<Response> {
  const body = await res.text();
  console.error(`AI Engine ${label} error ${res.status}: ${body}`);
  return new Response(
    JSON.stringify({ error: body || `Upstream ${label} error`, status: res.status }),
    { status: 502, headers: jsonHeaders },
  );
}

export function ok(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders });
}

export function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message, status: 400 }), {
    status: 400, headers: jsonHeaders,
  });
}

/** Map a thrown context error to the right status: auth vs. misconfiguration. */
export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const status = message === 'Unauthorized' ? 401 : 500;
  console.error('Error:', message);
  return new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders });
}
