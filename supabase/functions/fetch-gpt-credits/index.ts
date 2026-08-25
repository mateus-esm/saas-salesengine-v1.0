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
      .select('id, gpt_maker_agent_id, workspace_id, plano_id, limite_creditos, creditos_avulsos')
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

    // ── Sprint 8.5: só o que pertence a ESTE cliente sob a cobrança atual ────
    //
    // O provider responde pelo agente desde sempre. O nosso ledger começa no dia
    // em que a equipe passou a ser medida. Mostrar os dois lado a lado sem
    // recortar produz a tela que o founder viu: "saldo 1500, gastou 7000" — dois
    // números calculados sobre janelas diferentes, onde o gasto inclui dias em
    // que ninguém estava cobrando nada.
    //
    // Diferente do `credits-reconcile`, aqui dá para recortar direito: a resposta
    // vem com quebra por DIA, então o corte é exato em vez de um rateio chutado.
    const { data: firstLedgerEntry } = await supabaseClient
      .from('credit_ledger')
      .select('created_at')
      .eq('equipe_id', profile.equipe_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const meteringSince = firstLedgerEntry?.created_at
      ? new Date(firstLedgerEntry.created_at as string)
      : null;

    /** Descarta o que foi consumido antes de a cobrança desta equipe existir. */
    const sinceMetering = (rows: any[]): any[] => {
      if (!meteringSince) return rows;
      return rows.filter((d) => {
        if (!d?.year || !d?.month || !d?.day) return true; // sem data, não dá para excluir
        // Fim do dia: o consumo do dia em que a medição começou conta inteiro,
        // porque é o dia em que o cliente virou cliente.
        const end = new Date(Date.UTC(d.year, d.month - 1, d.day, 23, 59, 59));
        return end >= meteringSince;
      });
    };

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
      allDetails = sinceMetering(monthResults.flat());
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

      // Live API returns the per-model breakdown under `data`, NOT `details`.
      allDetails = sinceMetering(spentData.data || []);
      // O total tem de vir da MESMA lista que a tela desenha. Usar
      // `spentData.total` aqui deixaria o número grande no topo brigando com o
      // gráfico recortado logo abaixo.
      totalSpentProvider = allDetails.reduce((sum: number, d: any) => sum + (d.credits || 0), 0);

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
    // Sprint 8 T11: the balance now comes from the LOCAL LEDGER — one SELECT
    // instead of an API call on every page load.
    //
    // History worth keeping: this once returned GET /workspace/{id}/credits, the
    // RESELLER's pooled balance shared by seven tenants, so one tenant's spending
    // moved everyone's number. Sprint 7.5 replaced that with a figure derived
    // from the plan on each read. Deriving on read was still wrong in two ways:
    // it cannot be audited (no record of why the number is what it is) and it
    // cannot be enforced (nothing to debit before an action).
    //
    // credit_ledger is now the source of truth. `credits-spent` from the provider
    // becomes a nightly RECONCILIATION input (credits-reconcile), not the truth —
    // if it ever became the truth again we would be back to deriving on read.
    const { data: ledgerBalance, error: balErr } = await supabaseClient
      .rpc('credit_balance', { p_equipe_id: equipe.id ?? profile.equipe_id });

    let balance: number;
    let allowance: number;

    if (balErr || ledgerBalance === null || ledgerBalance === undefined) {
      // Ledger unavailable: fall back to the Sprint 7.5 derivation rather than
      // showing zero, which would look like the customer lost their credits.
      console.error('[fetch-gpt-credits] credit_balance failed, using legacy derivation:', balErr?.message);
      let planAllowance: number | null = null;
      if (equipe.plano_id) {
        const { data: plano } = await supabaseClient
          .from('planos').select('limite_creditos').eq('id', equipe.plano_id).single();
        planAllowance = plano?.limite_creditos ?? null;
      }
      if (planAllowance === null) planAllowance = equipe.limite_creditos ?? 0;
      allowance = (planAllowance ?? 0) + (equipe.creditos_avulsos ?? 0);

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
      balance = Math.max(0, allowance - toBilledCredits(currentMonthSpentProvider));
    } else {
      balance = Number(ledgerBalance);
      // The allowance is what the active grant was worth, so the UI can show
      // "restante / total do plano" without inventing a denominator.
      const { data: grant } = await supabaseClient
        .from('credit_ledger')
        .select('credits')
        .eq('equipe_id', equipe.id ?? profile.equipe_id)
        .eq('entry_type', 'grant')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: topups } = await supabaseClient
        .from('credit_ledger')
        .select('credits')
        .eq('equipe_id', equipe.id ?? profile.equipe_id)
        .eq('entry_type', 'topup');
      const topupTotal = (topups ?? []).reduce((sum: number, r: any) => sum + (r.credits ?? 0), 0);
      allowance = (grant?.credits ?? 0) + topupTotal;
    }



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
      // Sprint 8.5: desde quando este consumo é desta equipe. A tela precisa
      // poder dizer isso — um número recortado sem explicação parece um número
      // errado.
      meteringSince: meteringSince ? meteringSince.toISOString() : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
