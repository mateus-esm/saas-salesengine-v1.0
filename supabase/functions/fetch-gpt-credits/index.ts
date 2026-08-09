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
      .select('gpt_maker_agent_id, workspace_id')
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

    // IDs colados no Admin podem carregar whitespace/newline — sanitizar sempre
    const agentId = equipe.gpt_maker_agent_id.trim();
    const workspaceId = (equipe.workspace_id ?? '').trim();

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
          // Live API returns the breakdown under `data`, NOT `details`.
          return data.data || [];
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
        const body = await spentRes.text();
        console.error('AI Engine credits-spent error:', spentRes.status, body);
        return new Response(
          JSON.stringify({ error: body || 'Upstream credits-spent error', status: spentRes.status }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const spentData = await spentRes.json();
      console.log('AI Engine credits-spent:', JSON.stringify(spentData).slice(0, 200));

      totalSpent = spentData.total || 0;
      // Live API returns the per-model breakdown under `data`, NOT `details`.
      allDetails = spentData.data || [];

      // Cache to DB
      const periodKey = `${year}-${month.toString().padStart(2, '0')}`;
      await supabaseClient.from('consumo_creditos').upsert({
        equipe_id: profile.equipe_id,
        creditos_utilizados: totalSpent,
        periodo: periodKey,
        metadata: spentData,
      }, { onConflict: 'equipe_id,periodo', ignoreDuplicates: false });
    }

    // ── Real balance (T0 §6.2) ───────────────────────────────────────────────
    // GET /workspace/{wsId}/credits → { status, credits }. credits is the
    // remaining account balance. No more fabricated planLimit + creditos_avulsos.
    let balance = 0;
    if (workspaceId) {
      const balanceUrl = `${AI_ENGINE_BASE}/workspace/${workspaceId}/credits`;
      const balanceRes = await fetch(balanceUrl, { headers: engineHeaders });
      if (balanceRes.ok) {
        const balanceData = await balanceRes.json();
        balance = balanceData.credits ?? 0;
      } else {
        const body = await balanceRes.text();
        console.error('AI Engine workspace credits error:', balanceRes.status, body);
        // Balance is not fatal — the usage breakdown still works without it.
      }
    }

    // Model keys pass through unchanged (T0 §6.1: they are concrete slugs).
    // Each detail item carries the contract shape for T10 plus the legacy
    // year/month/day keys the current page still reads (W1→W2 gap).
    const details = allDetails.map((d: any) => ({
      model: d.model,
      credits: d.credits || 0,
      date: `${d.year}-${String(d.month ?? 1).padStart(2, '0')}-${String(d.day ?? 1).padStart(2, '0')}`,
      // legacy — the current UsagePage builds the chart from these; T10 migrates
      year: d.year,
      month: d.month,
      day: d.day,
    }));

    return new Response(JSON.stringify({
      // T10 contract
      balance,
      total: totalSpent,
      details,
      // legacy aliases so the current page keeps working until T10
      creditsSpent: totalSpent,
      creditsBalance: balance,
      period,
      year,
      month: period === 'month' ? month : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
