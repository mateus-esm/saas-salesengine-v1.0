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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    if (!user) throw new Error('Unauthorized');

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('equipe_id')
      .eq('user_id', user.id)
      .single();
    if (!profile) throw new Error('Profile not found');

    const { data: equipe } = await supabaseClient
      .from('equipes')
      .select('gpt_maker_agent_id, limite_creditos, creditos_avulsos')
      .eq('id', profile.equipe_id)
      .single();

    if (!equipe?.gpt_maker_agent_id) {
      return new Response(
        JSON.stringify({ error: 'AI Engine Agent ID not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const engineToken = Deno.env.get('GPT_MAKER_TOKEN');
    if (!engineToken) throw new Error('AI Engine token not configured');

    const engineHeaders = {
      'Authorization': `Bearer ${engineToken}`,
      'Content-Type': 'application/json',
    };

    const url = new URL(req.url);
    const now = new Date();
    const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()));
    const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1));
    const period = url.searchParams.get('period') || 'month'; // 'month' | 'year'

    const agentId = equipe.gpt_maker_agent_id;
    const planLimit = equipe.limite_creditos || 1000;
    const extraCredits = equipe.creditos_avulsos || 0;
    const totalCredits = planLimit + extraCredits;

    let allDetails: any[] = [];
    let totalSpent = 0;

    if (period === 'year') {
      // Fetch all 12 months in parallel for yearly view
      const monthFetches = Array.from({ length: 12 }, (_, i) => i + 1).map(async (m) => {
        const spentUrl = `${AI_ENGINE_BASE}/agent/${agentId}/credits-spent?year=${year}&month=${m}`;
        try {
          const res = await fetch(spentUrl, { headers: engineHeaders });
          if (!res.ok) return [];
          const data = await res.json();
          return data.details || [];
        } catch {
          return [];
        }
      });

      const monthResults = await Promise.all(monthFetches);
      allDetails = monthResults.flat();
      totalSpent = allDetails.reduce((sum: number, d: any) => sum + (d.credits || 0), 0);
    } else {
      // Single month fetch
      const spentUrl = `${AI_ENGINE_BASE}/agent/${agentId}/credits-spent?year=${year}&month=${month}`;
      const spentRes = await fetch(spentUrl, { headers: engineHeaders });

      if (!spentRes.ok) {
        const err = await spentRes.text();
        console.error('AI Engine credits-spent error:', err);
        throw new Error(`AI Engine API error: ${spentRes.status}`);
      }

      const spentData = await spentRes.json();
      console.log('AI Engine credits-spent:', JSON.stringify(spentData).slice(0, 200));

      totalSpent = spentData.total || 0;
      allDetails = spentData.details || [];

      // Cache to DB
      const periodKey = `${year}-${month.toString().padStart(2, '0')}`;
      await supabaseClient.from('consumo_creditos').upsert({
        equipe_id: profile.equipe_id,
        creditos_utilizados: totalSpent,
        periodo: periodKey,
        metadata: spentData,
      }, { onConflict: 'equipe_id,periodo', ignoreDuplicates: false });
    }

    const creditsBalance = totalCredits - totalSpent;

    return new Response(JSON.stringify({
      creditsSpent: totalSpent,
      creditsBalance,
      totalCredits,
      period,
      year,
      month: period === 'month' ? month : null,
      details: allDetails,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
