import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GPT_MAKER_BASE = 'https://api.gptmaker.ai/v2';

/**
 * Map incoming request body (old + new field names) to GPT Maker API v2 shape.
 *
 * Old fields (backwards compat): name*, description, triggers, webhook ({url,method,headers,body}),
 *   persistVariables, responseType, fixedResponse
 * New fields: description, details, type, httpMethod, url, autoGenerateParams, autoGenerateBody,
 *   instructions, fields[], headers[] ({name,value}), params[], variables[]
 *
 * * `name` is accepted but NOT sent to the API (not in GPT Maker shape).
 */
function mapIntentionBody(body: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  // --- Direct pass-through ---
  mapped.description = (body.description as string) || '';

  if (body.details !== undefined) {
    mapped.details = body.details as string;
  }

  // --- Type (WEBHOOK | INSTRUCTIONS) ---
  if (body.type === 'WEBHOOK' || body.type === 'INSTRUCTIONS') {
    mapped.type = body.type;
  } else if ((body as any).webhook?.url) {
    mapped.type = 'WEBHOOK';
  } else {
    mapped.type = 'INSTRUCTIONS';
  }

  // --- URL & HTTP method ---
  const wh = (body as any).webhook;
  if (body.url) {
    mapped.url = body.url as string;
  } else if (wh?.url) {
    mapped.url = wh.url as string;
  }

  if (body.httpMethod) {
    mapped.httpMethod = body.httpMethod as string;
  } else if (wh?.method) {
    mapped.httpMethod = wh.method as string;
  }

  // --- Instructions (for INSTRUCTIONS type) ---
  if (body.instructions !== undefined) {
    mapped.instructions = body.instructions as string;
  }

  // --- Headers: new array format or old Record format ---
  if (Array.isArray(body.headers)) {
    mapped.headers = body.headers;
  } else if (wh?.headers) {
    mapped.headers = Object.entries(wh.headers as Record<string, string>).map(([name, value]) => ({
      name,
      value,
    }));
  }

  // --- Boolean toggles ---
  mapped.autoGenerateParams = body.autoGenerateParams ?? false;
  mapped.autoGenerateBody = body.autoGenerateBody ?? false;

  // --- Array passthrough fields ---
  if (Array.isArray(body.fields)) mapped.fields = body.fields;
  if (Array.isArray(body.params)) mapped.params = body.params;
  if (Array.isArray(body.variables)) mapped.variables = body.variables;

  return mapped;
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

    // Auth
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
      .select('gpt_maker_agent_id')
      .eq('id', profile.equipe_id)
      .single();
    if (!equipe?.gpt_maker_agent_id) throw new Error('GPT Maker Agent ID not configured');

    const gptToken = Deno.env.get('GPT_MAKER_TOKEN');
    if (!gptToken) throw new Error('GPT Maker token not configured');

    const agentId = equipe.gpt_maker_agent_id;
    const gptHeaders = {
      'Authorization': `Bearer ${gptToken}`,
      'Content-Type': 'application/json',
    };

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'list';

    // LIST intentions
    if (req.method === 'GET' || action === 'list') {
      const res = await fetch(`${GPT_MAKER_BASE}/agent/${agentId}/intentions`, {
        headers: gptHeaders,
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('GPT Maker list intentions error:', err);
        throw new Error(`GPT Maker API error: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST actions (create, update, delete)
    const body = await req.json();

    // CREATE intention
    if (action === 'create') {
      const apiBody = mapIntentionBody(body);
      const res = await fetch(`${GPT_MAKER_BASE}/agent/${agentId}/intentions`, {
        method: 'POST',
        headers: gptHeaders,
        body: JSON.stringify(apiBody),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('GPT Maker create intention error:', err);
        throw new Error(`Failed to create intention: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UPDATE intention
    if (action === 'update') {
      if (!body.intentionId) throw new Error('intentionId required');

      const apiBody = mapIntentionBody(body);
      const res = await fetch(`${GPT_MAKER_BASE}/agent/${agentId}/intentions/${body.intentionId}`, {
        method: 'PUT',
        headers: gptHeaders,
        body: JSON.stringify(apiBody),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('GPT Maker update intention error:', err);
        throw new Error(`Failed to update intention: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE intention
    if (action === 'delete') {
      if (!body.intentionId) throw new Error('intentionId required');

      const res = await fetch(`${GPT_MAKER_BASE}/agent/${agentId}/intentions/${body.intentionId}`, {
        method: 'DELETE',
        headers: gptHeaders,
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('GPT Maker delete intention error:', err);
        throw new Error(`Failed to delete intention: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
