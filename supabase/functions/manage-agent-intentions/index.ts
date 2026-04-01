import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GPT_MAKER_BASE = 'https://api.gptmaker.ai/v2';

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
      const res = await fetch(`${GPT_MAKER_BASE}/agent/${agentId}/intentions`, {
        method: 'POST',
        headers: gptHeaders,
        body: JSON.stringify({
          name: body.name,
          description: body.description || '',
          triggers: body.triggers || [],
          webhook: body.webhook || null,
          persistVariables: body.persistVariables || false,
          responseType: body.responseType || 'ai_interpretation',
          fixedResponse: body.fixedResponse || '',
        }),
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

      const res = await fetch(`${GPT_MAKER_BASE}/intention/${body.intentionId}`, {
        method: 'PUT',
        headers: gptHeaders,
        body: JSON.stringify({
          name: body.name,
          description: body.description,
          triggers: body.triggers,
          webhook: body.webhook,
          persistVariables: body.persistVariables,
          responseType: body.responseType,
          fixedResponse: body.fixedResponse,
        }),
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

      const res = await fetch(`${GPT_MAKER_BASE}/intention/${body.intentionId}`, {
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
