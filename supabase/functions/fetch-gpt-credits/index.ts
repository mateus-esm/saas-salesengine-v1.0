import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_ENGINE_BASE = 'https://api.gptmaker.ai/v2';

// Everything the tenant sees is in BILLED credits (provider price x markup).
import { toBilledCredits, CREDIT_MARKUP } from "../_shared/credit-pricing.ts";

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
      .select('gpt_maker_agent_id, workspace_id, plano_id, limite_creditos, creditos_avulsos')
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
    // PROVIDER credits as reported upstream; converted to billed below.
    let totalSpentProvider = 0;

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
      totalSpentProvider = allDetails.reduce((sum: number, d: any) => sum + (d.credits || 0), 0);
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

      totalSpentProvider = spentData.total || 0;
      // Live API returns the per-model breakdown under `data`, NOT `details`.
      allDetails = spentData.data || [];

      // Cache to DB
      const periodKey = `${year}-${month.toString().padStart(2, '0')}`;
      await supabaseClient.from('consumo_creditos').upsert({
        equipe_id: profile.equipe_id,
        creditos_utilizados: toBilledCredits(totalSpentProvider),
        periodo: periodKey,
        metadata: spentData,
      }, { onConflict: 'equipe_id,periodo', ignoreDuplicates: false });
    }

    // ── Balance ──────────────────────────────────────────────────────────────
    // Sprint 7.5 W2: this used to return GET /workspace/{wsId}/credits, which
    // is the RESELLER's pooled balance. Seven tenants share workspace
    // 3DF0B518…, so every one of them saw the same number — another tenant's
    // spending moved your balance. That is a cross-tenant leak, not a display
    // bug.
    //
    // A tenant's allowance comes from their plan, in BILLED credits:
    //   equipes.limite_creditos (per-tenant override)
    //     ?? planos.limite_creditos (their plan's allotment)
    //   + equipes.creditos_avulsos (top-ups)
    //   - what this agent consumed in the current period
    // The PLAN is the source of truth — the founder's rule is "the credits
    // available is based in the account plan". `equipes.limite_creditos` is a
    // legacy column sitting at 1000 for every tenant, including one on Solo
    // Scale (3000); letting it win would silently cap that tenant at a third
    // of what they pay for. It is used only when no plan is linked.
    let planAllowance: number | null = null;
    if (equipe.plano_id) {
      const { data: plano } = await supabaseClient
        .from('planos')
        .select('limite_creditos')
        .eq('id', equipe.plano_id)
        .single();
      planAllowance = plano?.limite_creditos ?? null;
    }
    if (planAllowance === null) planAllowance = equipe.limite_creditos ?? 0;
    const allowance = (planAllowance ?? 0) + (equipe.creditos_avulsos ?? 0);

    // Always measure the balance against the CURRENT month, even when the user
    // is looking at a past month or the yearly view — otherwise switching the
    // filter would appear to change how many credits they have left.
    let currentMonthSpentProvider = totalSpentProvider;
    if (period === 'year' || year !== now.getFullYear() || month !== now.getMonth() + 1) {
      try {
        const curUrl = `${AI_ENGINE_BASE}/agent/${agentId}/credits-spent`
          + `?year=${now.getFullYear()}&month=${now.getMonth() + 1}`;
        const curRes = await fetch(curUrl, { headers: engineHeaders });
        currentMonthSpentProvider = curRes.ok ? ((await curRes.json()).total || 0) : 0;
      } catch {
        currentMonthSpentProvider = 0;
      }
    }

    const balance = Math.max(0, allowance - toBilledCredits(currentMonthSpentProvider));

    // Model keys pass through unchanged (T0 §6.1: they are concrete slugs).
    // Each detail item carries the contract shape for T10 plus the legacy
    // year/month/day keys the current page still reads (W1→W2 gap).
    const details = allDetails.map((d: any) => ({
      model: d.model,
      // Billed, like every other credit figure the tenant sees. Leaving these
      // raw was why the per-model chart disagreed with the model catalog.
      credits: toBilledCredits(d.credits || 0),
      date: `${d.year}-${String(d.month ?? 1).padStart(2, '0')}-${String(d.day ?? 1).padStart(2, '0')}`,
      // legacy — the current UsagePage builds the chart from these; T10 migrates
      year: d.year,
      month: d.month,
      day: d.day,
    }));

    const totalBilled = toBilledCredits(totalSpentProvider);

    return new Response(JSON.stringify({
      // Every credit figure below is in BILLED credits.
      balance,
      total: totalBilled,
      details,
      // Context for the UI: what the allowance is and where it came from.
      allowance,
      creditMarkup: CREDIT_MARKUP,
      // legacy aliases
      creditsSpent: totalBilled,
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
