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

    if (!equipe?.workspace_id) throw new Error('Workspace ID not configured');
    if (!equipe?.gpt_maker_agent_id) throw new Error('Agent ID not configured');

    const engineToken = Deno.env.get('GPT_MAKER_TOKEN');
    if (!engineToken) throw new Error('AI Engine token not configured');

    const engineHeaders = {
      'Authorization': `Bearer ${engineToken}`,
      'Content-Type': 'application/json',
    };

    const workspaceId = equipe.workspace_id;
    const agentId = equipe.gpt_maker_agent_id;

    // GET /v2/workspace/{workspaceId}/channels?agentId={agentId}
    const apiUrl = `${AI_ENGINE_BASE}/workspace/${workspaceId}/channels?agentId=${agentId}&page=1&pageSize=50`;
    const res = await fetch(apiUrl, { headers: engineHeaders });

    if (!res.ok) {
      const err = await res.text();
      console.error('AI Engine channels error:', err);
      throw new Error(`AI Engine API error: ${res.status}`);
    }

    const data = await res.json();
    const channels = data.data || data || [];

    // Normalize channel shape
    const normalized = (Array.isArray(channels) ? channels : []).map((ch: any) => ({
      id: ch.id || ch._id,
      name: ch.name || 'Canal sem nome',
      type: ch.type || 'WHATSAPP',
      status: ch.connected ? 'active' : (ch.status === 'ACTIVE' ? 'active' : 'inactive'),
      phone: ch.phone || ch.phoneNumber || null,
      connectedAt: ch.connectedAt || ch.createdAt
        ? new Date(ch.connectedAt || ch.createdAt).toLocaleDateString('pt-BR')
        : null,
    }));

    return new Response(JSON.stringify({ data: normalized }), {
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
