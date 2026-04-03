import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_ENGINE_BASE = 'https://api.gptmaker.ai/v2';

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
    if (!equipe?.gpt_maker_agent_id) throw new Error('AI Engine Agent ID not configured');

    const engineToken = Deno.env.get('GPT_MAKER_TOKEN');
    if (!engineToken) throw new Error('AI Engine token not configured');

    const agentId = equipe.gpt_maker_agent_id;
    const engineHeaders = {
      'Authorization': `Bearer ${engineToken}`,
      'Content-Type': 'application/json',
    };

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'get';

    // GET — return all agent settings
    if (req.method === 'GET' || action === 'get') {
      const res = await fetch(`${AI_ENGINE_BASE}/agent/${agentId}`, {
        headers: engineHeaders,
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('AI Engine get agent error:', err);
        throw new Error(`AI Engine API error: ${res.status}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify({
        behavior: data.behavior || '',
        description: data.description || '',
        prefferModel: data.prefferModel || 'gpt-4o-mini',
        name: data.name || '',
        // Operational config fields
        splitMessages: data.splitMessages ?? false,
        enabledEmoji: data.enabledEmoji ?? false,
        messageGroupingTime: data.messageGroupingTime ?? null,
        knowledgeByFunction: data.knowledgeByFunction ?? false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    let updatePayload: Record<string, unknown> = {};

    if (action === 'update-behavior') {
      updatePayload = { behavior: body.behavior };
    } else if (action === 'update-description') {
      updatePayload = { description: body.description };
    } else if (action === 'update-model') {
      updatePayload = { prefferModel: body.model };
    } else if (action === 'update-settings') {
      // Selective patch — only include provided keys
      const allowed = ['splitMessages', 'enabledEmoji', 'messageGroupingTime', 'knowledgeByFunction'];
      for (const key of allowed) {
        if (key in body) updatePayload[key] = body[key];
      }
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`${AI_ENGINE_BASE}/agent/${agentId}`, {
      method: 'PUT',
      headers: engineHeaders,
      body: JSON.stringify(updatePayload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('AI Engine update error:', err);
      throw new Error(`AI Engine API error: ${res.status}`);
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
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
