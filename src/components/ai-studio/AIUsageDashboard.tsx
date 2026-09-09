import { useState, useEffect, useCallback, useMemo } from "react";
import { CreditCard, Loader2, BarChart2, Calendar } from "lucide-react";
import { DateRange } from "react-day-picker";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Credit cost per model (cr/msg) ────────────────────────────────────────────
// T10 Step 1: the duplicated MODEL_COSTS map is gone. Costs and labels come
// from T1's action=models catalog — one source of truth, never a second
// hand-maintained copy.
interface CatalogModel {
  id: string;
  label: string;
  vendor: string;
  creditsPerMessage: number;
  isNew?: boolean;
  isBeta?: boolean;
}

const getColor = (model: string): string => {
  const palette: Record<string, string> = {
    'gpt-4o': '#10a37f', 'gpt-4o-mini': '#34d399', 'GPT_4O': '#10a37f', 'GPT_4O_MINI': '#34d399',
    'claude-3.5-sonnet': '#d97757', 'claude-4.5-sonnet': '#ef8c6a',
    'llama-3.3': '#0668E1', 'deepseek-v3': '#4d6bfe',
    'GPT_5_4': '#7c3aed', 'GPT_5_4_MINI': '#a78bfa',
  };
  if (palette[model]) return palette[model];
  const h = model.split('').reduce((a, c) => c.charCodeAt(0) + ((a << 5) - a), 0);
  return `hsl(${Math.abs(h) % 360}, 65%, 52%)`;
};

// ── Period presets ─────────────────────────────────────────────────────────────
type PeriodPreset = 'day' | 'week' | 'month' | 'year' | 'custom';

interface PeriodConfig {
  label: string;
  apiPeriod: 'month' | 'year';
  year: number;
  month: number;
  filterFrom: Date;
  filterTo: Date;
}

function buildPeriodConfig(preset: PeriodPreset, customRange?: DateRange): PeriodConfig {
  const now = new Date();
  switch (preset) {
    case 'day':
      return {
        label: 'Hoje',
        apiPeriod: 'month',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        filterFrom: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        filterTo: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
      };
    case 'week':
      return {
        label: 'Esta Semana',
        apiPeriod: 'month',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        filterFrom: startOfWeek(now, { weekStartsOn: 1 }),
        filterTo: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case 'year':
      return {
        label: String(now.getFullYear()),
        apiPeriod: 'year',
        year: now.getFullYear(),
        month: 0,
        filterFrom: startOfYear(now),
        filterTo: endOfYear(now),
      };
    case 'custom':
      return {
        label: 'Personalizado',
        apiPeriod: 'month',
        year: (customRange?.from || now).getFullYear(),
        month: (customRange?.from || now).getMonth() + 1,
        filterFrom: customRange?.from || startOfMonth(now),
        filterTo: customRange?.to || endOfMonth(now),
      };
    default: // month
      return {
        label: format(now, 'MMMM yyyy', { locale: ptBR }),
        apiPeriod: 'month',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        filterFrom: startOfMonth(now),
        filterTo: endOfMonth(now),
      };
  }
}

// ── The billing cycle, per pool ───────────────────────────────────────────────
// `planUsed + planLeft === planTotal`, and `planLeft + extra === balance`. Every
// number on the card can be checked against the one beside it — which is exactly
// what the old layout made impossible.
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

const POOL_META = {
  whatsapp: { label: 'Atendimento', hint: 'Gastos quando o agente responde seus clientes' },
  copilot: { label: 'Copiloto', hint: 'Gastos pelas ações automáticas no CRM' },
} as const;

/**
 * Severidade do pool. Nunca só pela cor: cada estado carrega o seu rótulo, para
 * quem não distingue as cores ler a mesma coisa.
 *
 * A trilha é um passo mais claro da MESMA rampa do preenchimento, então o estado
 * se lê na barra inteira e não só na parte cheia.
 */
function severityOf(left: number, total: number) {
  const pct = total > 0 ? (left / total) * 100 : 0;
  if (total > 0 && left <= 0) return { fill: 'bg-red-600', track: 'bg-red-600/15', text: 'text-red-600', note: 'Cota do plano esgotada' };
  if (pct < 20) return { fill: 'bg-red-600', track: 'bg-red-600/15', text: 'text-red-600', note: 'Cota quase no fim' };
  if (pct < 50) return { fill: 'bg-amber-500', track: 'bg-amber-500/15', text: 'text-amber-600', note: 'Menos da metade da cota' };
  return { fill: 'bg-emerald-600', track: 'bg-emerald-600/15', text: 'text-emerald-700', note: 'Dentro da cota' };
}

/**
 * Um pool, como MEDIDOR — uma razão contra um limite, não um gráfico.
 * O limite é a cota DO PLANO (o grant do ciclo). Os avulsos aparecem ao lado,
 * nunca somados ao denominador: eles não expiram e inflariam a cota.
 */
function PoolMeter({ pool, c }: { pool: keyof typeof POOL_META; c: PoolCycle }) {
  const meta = POOL_META[pool];
  const sev = severityOf(c.planLeft, c.planTotal);
  const pct = c.planTotal > 0 ? Math.min(100, Math.max(0, (c.planLeft / c.planTotal) * 100)) : 0;
  const fmt = (n: number) => n.toLocaleString('pt-BR');

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{meta.label}</p>
        <p className={cn('text-[11px] font-medium', sev.text)}>{sev.note}</p>
      </div>

      {/* Valor da stat tile: figuras proporcionais, não tabulares. */}
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
        {fmt(c.planLeft)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          de {fmt(c.planTotal)} cr do plano
        </span>
      </p>

      {/* Medidor: trilha = passo mais claro da mesma rampa; ponta arredondada. */}
      <div className={cn('mt-2 h-1.5 w-full overflow-hidden rounded-full', sev.track)}>
        <div className={cn('h-full rounded-full transition-all', sev.fill)} style={{ width: `${pct}%` }} />
      </div>

      <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>Usado neste ciclo</dt>
          <dd className="tabular-nums text-foreground">{fmt(c.planUsed)} cr</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Avulsos — não expiram</dt>
          <dd className="tabular-nums text-foreground">{fmt(c.extra)} cr</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-border/60 pt-0.5">
          <dt className="font-medium">Saldo do pool</dt>
          <dd className="tabular-nums font-medium text-foreground">{fmt(c.balance)} cr</dd>
        </div>
      </dl>

      <p className="mt-1.5 text-[11px] text-muted-foreground">{meta.hint}</p>
    </div>
  );
}

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
  { id: 'custom', label: 'Custom' },
];

// ── Main component ─────────────────────────────────────────────────────────────
export function AIUsageDashboard() {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<any[]>([]);
  /**
   * SE-BILL-003 — o ciclo, que é a única janela que explica o saldo.
   *
   * O que estava aqui antes: `creditsBalance`, rotulado "Créditos da conta Rev".
   * O `fetch-gpt-credits` devolve esse campo como `credit_balance(equipe_id)`
   * SEM pool — ou seja, a soma dos dois pools DESTA equipe, não o saldo de outra
   * conta. A tela mostrava esse total, repetia o consumo do período logo acima
   * dele, e ainda listava os dois pools separados embaixo: o mesmo dinheiro três
   * vezes, um deles com nome de uma conta que não era a do cliente.
   *
   * O cliente não precisa de quatro números soltos. Precisa de um por pool:
   * quanto o plano deu neste ciclo, quanto o agente gastou, quanto sobrou e
   * quando renova.
   */
  const [cycle, setCycle] = useState<CycleFigures>(null);
  /**
   * Sprint 8.5 — a partir de quando este consumo pertence a esta equipe.
   *
   * O provider responde pelo agente desde sempre; a cobrança desta equipe
   * comecou num dia especifico. Sem dizer isso, um total recortado parece um
   * total errado — e um total NAO recortado parece o consumo de outra pessoa,
   * que foi exatamente a reclamacao.
   */
  const [meteringSince, setMeteringSince] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);

  // T10 Step 3: label lookup via the catalog; unknown keys render as the raw
  // key so gaps are visible instead of silently dropped.
  const catalogById = useMemo(() => {
    const m = new Map<string, CatalogModel>();
    catalog.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalog]);

  const labelFor = (modelId: string) => catalogById.get(modelId)?.label ?? modelId;
  const costFor = (modelId: string) => catalogById.get(modelId)?.creditsPerMessage ?? null;

  const [activePreset, setActivePreset] = useState<PeriodPreset>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [calOpen, setCalOpen] = useState(false);

  const { toast } = useToast();

  const periodCfg = useMemo(() => buildPeriodConfig(activePreset, customRange), [activePreset, customRange]);

  const fetchUsage = useCallback(async () => {
    try {
      setLoading(true);
      const params = periodCfg.apiPeriod === 'year'
        ? `year=${periodCfg.year}&period=year`
        : `year=${periodCfg.year}&month=${periodCfg.month}&period=month`;

      const [usageRes, catalogRes] = await Promise.all([
        supabase.functions.invoke(`fetch-gpt-credits?${params}`, { body: null }),
        supabase.functions.invoke('manage-agent-settings?action=models'),
      ]);

      if (usageRes.error) throw usageRes.error;
      const data = usageRes.data ?? {};
      // T3 shape: { balance, total, details: [{model, credits, ...}] }
      // SE-BILL-001: { balances: { whatsapp, copilot } } added for BUG 2.
      setCycle(data.cycle && data.cycle.pools ? (data.cycle as CycleFigures) : null);
      setDetails(data.details || []);
      setMeteringSince(typeof data.meteringSince === 'string' ? data.meteringSince : null);

      if (!catalogRes.error && Array.isArray(catalogRes.data?.models)) {
        setCatalog(catalogRes.data.models);
      }
    } catch (err) {
      console.error('Usage fetch error:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar dados de consumo.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [periodCfg, toast]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  // ── Chart data processing ──────────────────────────────────────────────────
  const { chartData, modelKeys, totalFilteredSpent, modelBreakdown } = useMemo(() => {
    if (!details.length) return { chartData: [], modelKeys: [], totalFilteredSpent: 0, modelBreakdown: [] };

    const from = periodCfg.filterFrom.getTime();
    const to = periodCfg.filterTo.getTime();

    const inRange = details.filter((d) => {
      const t = new Date(d.year, (d.month ?? 1) - 1, d.day ?? 1).getTime();
      return t >= from && t <= to;
    });

    const dailyMap = new Map<string, any>();
    const modelsSet = new Set<string>();
    let total = 0;
    const breakdown: Record<string, number> = {};

    inRange.forEach((d) => {
      const isYear = activePreset === 'year';
      const key = isYear
        ? `${String(d.month ?? 1).padStart(2, '0')}/${d.year}`
        : `${String(d.day ?? 1).padStart(2, '0')}/${String(d.month ?? 1).padStart(2, '0')}`;
      const model = d.model || 'unknown';
      const credits = d.credits || 0;

      modelsSet.add(model);
      total += credits;
      breakdown[model] = (breakdown[model] || 0) + credits;

      if (!dailyMap.has(key)) dailyMap.set(key, { day: key });
      const entry = dailyMap.get(key);
      entry[model] = (entry[model] || 0) + credits;
    });

    const breakdownArr = Object.entries(breakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([model, credits]) => ({
        model,
        credits,
        color: getColor(model),
        label: labelFor(model),
        costPerReq: costFor(model) ?? '—',
      }));

    const sorted = Array.from(dailyMap.values()).sort((a, b) => {
      const [pa, pb] = [a.day.split('/'), b.day.split('/')];
      return new Date(2000, Number(pa[1]) - 1, Number(pa[0])).getTime()
        - new Date(2000, Number(pb[1]) - 1, Number(pb[0])).getTime();
    });

    return { chartData: sorted, modelKeys: Array.from(modelsSet), totalFilteredSpent: total, modelBreakdown: breakdownArr };
  }, [details, periodCfg, activePreset, catalogById]);

  const fmt = (n: number) => n.toLocaleString('pt-BR');

  // O ciclo por extenso: "02/09 – 01/10 · renova em 22 dias". Sem a data de
  // renovação, "restam 1.856" não diz se é para dois dias ou para um mês.
  const cycleLabel = (() => {
    if (!cycle?.start || !cycle?.end) return null;
    const start = new Date(cycle.start);
    const end = new Date(cycle.end);
    const days = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
    return `${format(start, 'dd/MM')} – ${format(end, 'dd/MM')} · renova em ${days} ${days === 1 ? 'dia' : 'dias'}`;
  })();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border">
          {PRESETS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                setActivePreset(id);
                if (id === 'custom') setCalOpen(true);
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-mono font-semibold rounded-md transition-all",
                activePreset === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {activePreset === 'custom' && (
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 font-mono text-xs">
                <Calendar className="w-3.5 h-3.5" />
                {customRange?.from
                  ? customRange.to
                    ? `${format(customRange.from, 'dd/MM')} – ${format(customRange.to, 'dd/MM/yy')}`
                    : format(customRange.from, 'dd/MM/yyyy')
                  : 'Selecionar período'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                initialFocus
                mode="range"
                selected={customRange}
                onSelect={(r) => {
                  setCustomRange(r);
                  if (r?.from && r?.to) setCalOpen(false);
                }}
                numberOfMonths={1}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        )}

        <span className="ml-auto text-xs font-mono text-muted-foreground hidden sm:block">
          {periodCfg.label}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Credit card */}
            <Card className="border border-border bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-primary/8 text-primary rounded border border-primary/15">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Consumo no Período</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {/* A ÚNICA figura-herói da tela: o que o agente consumiu no
                    período escolhido acima. O saldo não mora mais aqui — ele
                    pertence ao ciclo de faturamento, que tem a sua própria
                    janela e o seu próprio card. Repetir o mesmo número em três
                    linhas com nomes diferentes era o que tornava esta tela
                    impossível de conferir. */}
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-3xl font-bold font-mono text-foreground">
                    {totalFilteredSpent.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">cr</span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Medido pelo provedor no período selecionado, já convertido para os
                  créditos que você paga.
                </p>
                {meteringSince && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Conta só o consumo desta equipe a partir de{" "}
                    {new Date(meteringSince).toLocaleDateString("pt-BR")}, quando a cobrança dela
                    começou. O que o agente gastou antes disso não é cobrado aqui.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Model breakdown */}
            <Card className="md:col-span-2 border border-border bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-emerald-500/10 text-emerald-600 rounded border border-emerald-200/50">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Breakdown por Modelo</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {modelBreakdown.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4">
                    Sem consumo neste período.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {modelBreakdown.map((item) => (
                      <div key={item.model} className="p-2.5 rounded-md border border-border bg-muted/20">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-[11px] font-semibold text-foreground truncate font-mono">
                            {item.label}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-muted-foreground">{item.costPerReq} cr/msg</span>
                          <span className="font-bold text-foreground">{item.credits} cr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Ciclo de faturamento ────────────────────────────────────────
              Um MEDIDOR por pool: uma razão contra um limite, não um gráfico.
              O limite é a cota do plano deste ciclo; os avulsos ficam ao lado e
              nunca entram no denominador — eles não expiram e inflariam a cota.
              É a mesma fonte de /billing/creditos, para as duas telas nunca
              discordarem. */}
          {cycle && (
            <Card className="border border-border bg-card">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="p-1.5 bg-primary/8 text-primary rounded border border-primary/15">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Ciclo de faturamento</CardTitle>
                  {cycleLabel && (
                    <span className="text-[11px] font-mono text-muted-foreground">{cycleLabel}</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                  <PoolMeter pool="whatsapp" c={cycle.pools.whatsapp} />
                  <PoolMeter pool="copilot" c={cycle.pools.copilot} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Chart */}
          <Card className="border border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Consumo {activePreset === 'year' ? 'Mensal' : 'Diário'} — Barras Empilhadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs font-mono text-muted-foreground">
                    Sem dados para o período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                        cursor={{ fill: 'hsl(var(--muted))' }}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', paddingTop: '12px' }}
                      />
                      {modelKeys.map((model, i) => (
                        <Bar
                          key={model}
                          dataKey={model}
                          stackId="a"
                          fill={getColor(model)}
                          radius={i === modelKeys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
