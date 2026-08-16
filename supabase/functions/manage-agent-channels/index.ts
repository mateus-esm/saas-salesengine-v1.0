import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { WEBHOOK_EVENT_DEFAULTS } from "../_shared/agent-webhooks.ts";
import { pickChannelConfig } from "../_shared/channel-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_ENGINE_BASE = 'https://api.gptmaker.ai/v2';

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch on the ACTION, never on the HTTP method.
//
// `supabase.functions.invoke(name)` with no options sends POST with an empty
// body (@supabase/functions-js: `method: method || 'POST'`). The previous code
// branched on `req.method === 'POST'` and then ran `await req.json()` on that
// empty body — which throws, so the listing branch below was unreachable from
// the app and Canais never loaded. Every sibling function (settings, training,
// intentions) already resolves an action with a default before touching the
// body; this brings channels in line with that convention.
//
// Absent an explicit action, the request is a listing.
// ─────────────────────────────────────────────────────────────────────────────
export function resolveAction(req: Request, body: Record<string, unknown>): string {
  const fromQuery = new URL(req.url).searchParams.get('action');
  if (fromQuery) return fromQuery;
  return typeof body.action === 'string' && body.action ? body.action : 'list';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization')!;
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

    if (!equipe?.workspace_id) throw new Error('Workspace ID not configured');
    if (!equipe?.gpt_maker_agent_id) throw new Error('Agent ID not configured');

    const engineToken = Deno.env.get('GPT_MAKER_TOKEN');
    if (!engineToken) throw new Error('AI Engine token not configured');

    const engineHeaders = {
      'Authorization': `Bearer ${engineToken}`,
      'Content-Type': 'application/json',
    };

    // IDs colados no Admin podem carregar whitespace/newline — sanitizar sempre
    // (bug real em produção: workspace_id com '\n' quebrava a URL de listagem)
    const workspaceId = equipe.workspace_id.trim();
    const agentId = equipe.gpt_maker_agent_id.trim();

    // Garante que o webhook onNewMessage do agente aponta para o nosso
    // gpt-maker-webhook — sem isso, canal criado pela UI conecta mas nenhuma
    // mensagem chega ao inbox (tenants novos nunca foram configurados à mão).
    // Nunca falha a request principal; loga e segue.
    // Read → merge → PUT the COMPLETE object. The previous version PUT
    // `{ onNewMessage }` alone; if the provider's PUT replaces rather than
    // merges, that silently wiped the tenant's other seven events. Sending all
    // eight makes the question moot, so we never have to rely on undocumented
    // merge semantics.
    async function ensureAgentWebhook(): Promise<void> {
      try {
        const ourWebhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gpt-maker-webhook`;
        const getRes = await fetch(`${AI_ENGINE_BASE}/agent/${agentId}/webhooks`, { headers: engineHeaders });
        const current = getRes.ok ? await getRes.json().catch(() => ({})) : {};
        if (current?.onNewMessage === ourWebhookUrl) return; // já configurado

        const merged = { ...WEBHOOK_EVENT_DEFAULTS, ...current, onNewMessage: ourWebhookUrl };
        const putRes = await fetch(`${AI_ENGINE_BASE}/agent/${agentId}/webhooks`, {
          method: 'PUT',
          headers: engineHeaders,
          body: JSON.stringify(merged),
        });
        console.log('[Channels] ensureAgentWebhook:', putRes.status);
      } catch (err) {
        console.error('[Channels] ensureAgentWebhook falhou (não-fatal):', err);
      }
    }

    // Tolerate an absent/!JSON body — a body-less POST is the default shape of
    // `functions.invoke(name)` and must resolve to a listing, not a parse error.
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = resolveAction(req, body);

    // --- Action dispatch ---
    {
      // LIST — the default. Source of truth for channel `type` (T0 §4.2): do
      // not switch to /agent/{id}/search, which reports CLOUD_API where this
      // reports WHATSAPP for the same channel id.
      if (action === 'list') {
        const apiUrl = `${AI_ENGINE_BASE}/workspace/${workspaceId}/channels?agentId=${agentId}&page=1&pageSize=50`;
        const res = await fetch(apiUrl, { headers: engineHeaders });

        if (!res.ok) {
          const errText = await res.text();
          console.error('AI Engine channels error:', res.status, errText);
          return new Response(JSON.stringify({ error: errText || 'Upstream channels error', status: res.status }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const data = await res.json();
        // `username` carries the connected phone number / @handle and
        // `departmentName` the team — both are shown upstream and were being
        // discarded here, which is why our list looked thinner than theirs.
        const normalized = (data.data ?? []).map((ch: any) => ({
          id: ch.id,
          name: ch.name ?? '',
          type: ch.type ?? 'UNKNOWN',
          connected: ch.connected === true,
          username: ch.username ?? null,
          departmentName: ch.departmentName ?? null,
        }));
        return new Response(JSON.stringify({ channels: normalized }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (action === 'create') {
        const { name, type } = body;
        if (!name || !type) {
          return new Response(
            JSON.stringify({ message: 'name and type are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const createUrl = `${AI_ENGINE_BASE}/agent/${agentId}/create-channel`;
        const createRes = await fetch(createUrl, {
          method: 'POST',
          headers: engineHeaders,
          body: JSON.stringify({ name, type }),
        });

        if (!createRes.ok) {
          const errBody = await createRes.json().catch(() => ({}));
          const message = errBody?.error || `GPT Maker API error: ${createRes.status}`;
          return new Response(
            JSON.stringify({ message }),
            { status: createRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const channel = await createRes.json();

        // Canal criado — garantir que as mensagens dele chegarão ao inbox.
        await ensureAgentWebhook();

        return new Response(JSON.stringify({ id: channel.id, name: channel.name, type: channel.type }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'remove') {
        const { channel_id } = body;
        if (!channel_id) {
          return new Response(
            JSON.stringify({ message: 'channel_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const removeUrl = `${AI_ENGINE_BASE}/channel/${channel_id}`;
        const removeRes = await fetch(removeUrl, {
          method: 'DELETE',
          headers: engineHeaders,
        });

        if (!removeRes.ok) {
          const errBody = await removeRes.json().catch(() => ({}));
          const message = errBody?.error || `GPT Maker API error: ${removeRes.status}`;
          return new Response(
            JSON.stringify({ message }),
            { status: removeRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'qr') {
        const { channel_id } = body;
        if (!channel_id) {
          return new Response(
            JSON.stringify({ message: 'channel_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const qrUrl = `${AI_ENGINE_BASE}/channel/${channel_id}/qr-code`;
        const qrRes = await fetch(qrUrl, { headers: engineHeaders });

        if (!qrRes.ok) {
          const errBody = await qrRes.json().catch(() => ({}));
          const message = errBody?.error || `GPT Maker API error: ${qrRes.status}`;
          return new Response(
            JSON.stringify({ message }),
            { status: qrRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const qrData = await qrRes.json();
        const result = {
          qr_value: qrData.value || null,
          connected: qrData.connected || false,
        };
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── Sprint 7.4 W2 — per-channel detail ──────────────────────────────

      // Behaviour config. The field set varies by channel type; WIDGET returns
      // an empty object because a widget has no conversational config.
      if (action === 'config') {
        const { channel_id } = body;
        if (!channel_id) {
          return new Response(JSON.stringify({ message: 'channel_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const res = await fetch(`${AI_ENGINE_BASE}/channel/${channel_id}/config`, { headers: engineHeaders });
        if (!res.ok) {
          const errText = await res.text();
          console.error('[Channels] config error:', res.status, errText);
          return new Response(JSON.stringify({ message: errText || 'Upstream config error' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const cfg = await res.json().catch(() => ({}));
        // A disconnected channel answers `{"error": null}` rather than 404 —
        // surface that as "no config yet", not as a broken response.
        const usable = cfg && typeof cfg === 'object' && !('error' in cfg) ? cfg : {};
        return new Response(JSON.stringify({ config: usable }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (action === 'update-config') {
        const { channel_id } = body;
        if (!channel_id) {
          return new Response(JSON.stringify({ message: 'channel_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Allowlisted + partial: the provider accepts only the keys we send, so
        // we never resend a stale value for a field the user did not touch.
        const payload = pickChannelConfig(body.config ?? body);
        if (Object.keys(payload).length === 0) {
          return new Response(JSON.stringify({ message: 'No valid config keys provided' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const res = await fetch(`${AI_ENGINE_BASE}/channel/${channel_id}/config`, {
          method: 'PUT', headers: engineHeaders, body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('[Channels] update-config error:', res.status, errText);
          return new Response(JSON.stringify({ message: errText || 'Upstream config update error' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Re-read so the UI renders stored truth rather than the sent payload.
        const after = await fetch(`${AI_ENGINE_BASE}/channel/${channel_id}/config`, { headers: engineHeaders });
        const cfg = after.ok ? await after.json().catch(() => ({})) : payload;
        return new Response(JSON.stringify({ config: cfg }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Widget embed snippets — the one channel type a tenant can finish
      // connecting entirely inside our UI. Note the path is `/widget-links`,
      // NOT `/widget/links` (that 404s).
      if (action === 'widget-links') {
        const { channel_id } = body;
        if (!channel_id) {
          return new Response(JSON.stringify({ message: 'channel_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const res = await fetch(`${AI_ENGINE_BASE}/channel/${channel_id}/widget-links`, { headers: engineHeaders });
        if (!res.ok) {
          const errText = await res.text();
          console.error('[Channels] widget-links error:', res.status, errText);
          return new Response(JSON.stringify({ message: errText || 'Upstream widget-links error' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const links = await res.json();
        return new Response(JSON.stringify({ float: links.float ?? null, iframe: links.iframe ?? null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (action === 'rename') {
        const { channel_id, name } = body;
        if (!channel_id || !String(name ?? '').trim()) {
          return new Response(JSON.stringify({ message: 'channel_id and name are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // PUT /channel/{id} takes { name, agentId }. Always resend agentId —
        // omitting it on a nullable field risks unlinking the channel from the
        // agent, which would silently stop its messages reaching the inbox.
        const res = await fetch(`${AI_ENGINE_BASE}/channel/${channel_id}`, {
          method: 'PUT', headers: engineHeaders,
          body: JSON.stringify({ name: String(name).trim(), agentId }),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('[Channels] rename error:', res.status, errText);
          return new Response(JSON.stringify({ message: errText || 'Upstream rename error' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(
        JSON.stringify({ message: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ message: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
