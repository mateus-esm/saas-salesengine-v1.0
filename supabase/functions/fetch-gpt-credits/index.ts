import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_ENGINE_BASE = 'https://api.gptmaker.ai/v2';

// Everything the tenant sees is in BILLED credits (provider price x markup).
import { toBilledCredits, CREDIT_MARKUP } from "../_shared/credit-pricing.ts";

/**
 * SE-BILL-003 — what one pool did with this billing cycle.
 *
 * `planTotal` is the cota the plan granted for the cycle, `planUsed` how much of
 * it the agent has already spent, `planLeft` what is left of it, and `extra` the
 * purchased/admin credits that survive the renewal. `planUsed + planLeft` is
 * always `planTotal`, and `planLeft + extra` is always the pool's balance — so
 * every number on the card can be checked against the one next to it, which is
 * exactly what the old layout made impossible.
 */
interface PoolCycle {
  planTotal: number;
  planUsed: number;
  planLeft: number;
  extra: number;
  balance: number;
}

type CycleFigures = {
  start: string | null;
  end: string | null;
  pools: { whatsapp: PoolCycle; copilot: PoolCycle };
} | null;

const buildPoolCycle = (planTotal: number, planLeft: number, balance: number): PoolCycle => ({
  planTotal,
  // Never negative: an over-spent pool reads as "the whole cota is gone", and
  // the debt it left behind shows up in `balance`, where it belongs.
  planUsed: Math.max(0, planTotal - planLeft),
  planLeft,
  extra: Math.max(0, balance - planLeft),
  balance,
});

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
    // SE-BILL-001 · BUG 2 — the two pools are billed separately, so the AI Studio
    // must show them separately instead of one combined "Saldo X / Y". null = we
    // could not read the per-pool figures (legacy fallback path).
    type PoolFigures = { whatsapp: number; copilot: number } | null;
    let balances: PoolFigures = null;
    let allowances: PoolFigures = null;
    // SE-BILL-003 — the billing cycle, per pool. null on the legacy path.
    let cycle: CycleFigures = null;

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
      const teamId = equipe.id ?? profile.equipe_id;

      // Per-pool balance + allowance. The allowance for a pool is its active
      // grant plus its never-expiring top-ups, so the UI can show
      // "restante / total do plano" for that pool alone — never a denominator
      // summed across pools (that combined figure is the workspace total BUG 2
      // hides).
      const poolBalances = { whatsapp: 0, copilot: 0 };
      const poolAllowances = { whatsapp: 0, copilot: 0 };
      // SE-BILL-003 — the plan's cota for THIS cycle, on its own. Distinct from
      // `poolAllowances`, which deliberately folds in every top-up ever bought:
      // using that as the "do plano" denominator would show Solo Energia a plan
      // of 4.000 (2.500 cota + 1.500 de saldo extra comprado em agosto).
      const poolGrants = { whatsapp: 0, copilot: 0 };

      for (const pool of ['whatsapp', 'copilot'] as const) {
        const { data: poolBal } = await supabaseClient
          .rpc('credit_balance', { p_equipe_id: teamId, p_pool: pool });
        poolBalances[pool] = Number(poolBal ?? 0);

        const { data: grant } = await supabaseClient
          .from('credit_ledger')
          .select('credits')
          .eq('equipe_id', teamId)
          .eq('entry_type', 'grant')
          .eq('pool', pool)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data: poolTopups } = await supabaseClient
          .from('credit_ledger')
          .select('credits')
          .eq('equipe_id', teamId)
          .eq('entry_type', 'topup')
          .eq('pool', pool);
        const poolTopupTotal = (poolTopups ?? []).reduce((sum: number, r: any) => sum + (r.credits ?? 0), 0);
        poolGrants[pool] = grant?.credits ?? 0;
        poolAllowances[pool] = poolGrants[pool] + poolTopupTotal;
      }

      balances = poolBalances;
      allowances = poolAllowances;
      // Kept for legacy callers (/billing, agent usage). NOT surfaced as a
      // combined "X / Y" denominator in the AI Studio any more.
      allowance = poolAllowances.whatsapp + poolAllowances.copilot;

      // ── SE-BILL-003 · o ciclo, que é a única janela que explica o saldo ────
      //
      // O AI Studio mostrava quatro números soltos: o consumo do período
      // escolhido, o mesmo consumo repetido, um "Créditos da conta Rev" que na
      // verdade era a soma dos dois pools DESTA equipe, e os dois pools
      // separados logo abaixo. O mesmo dinheiro três vezes, um deles com nome
      // de outra conta.
      //
      // O que o cliente precisa é uma coisa só, por pool: quanto o plano deu
      // neste ciclo, quanto o agente já gastou dele, quanto sobrou e quando
      // renova. Tudo em créditos faturados e tudo derivado do ledger — a mesma
      // fonte de /billing/creditos, para as duas telas nunca discordarem.
      const { data: cycleRow } = await supabaseClient
        .from("contracts")
        .select("current_period_start, current_period_end, status")
        .eq("equipe_id", teamId)
        .in("status", ["active", "past_due", "trialing"])
        .order("current_period_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      // `expiring` é o que resta DA COTA DO PLANO; `total` inclui os avulsos,
      // que sobrevivem à renovação. Somar os dois num denominador só foi o que
      // produziu o "Saldo X / Y" que ninguém conseguia conferir.
      const { data: view } = await supabaseClient
        .from("v_credit_balance")
        .select("whatsapp_total, copilot_total, whatsapp_expiring, copilot_expiring, grant_expires_at")
        .eq("equipe_id", teamId)
        .maybeSingle();

      const planRemaining = {
        whatsapp: Number((view as any)?.whatsapp_expiring ?? 0),
        copilot: Number((view as any)?.copilot_expiring ?? 0),
      };

      cycle = {
        start: (cycleRow as any)?.current_period_start ?? null,
        end: (cycleRow as any)?.current_period_end ?? (view as any)?.grant_expires_at ?? null,
        pools: {
          whatsapp: buildPoolCycle(poolGrants.whatsapp, planRemaining.whatsapp, poolBalances.whatsapp),
          copilot: buildPoolCycle(poolGrants.copilot, planRemaining.copilot, poolBalances.copilot),
        },
      };
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
      // SE-BILL-001 · BUG 2 — per-pool figures so the AI Studio can show the
      // Rev account balance and the team pools separately, with no combined
      // denominator. null on the legacy fallback path.
      balances,
      allowances,
      // SE-BILL-003 — the cycle view the AI Studio renders: per pool, what the
      // plan gave, what the agent spent, what is left, and when it renews.
      cycle,
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
