import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Target,
  TrendingUp,
  BarChart3,
  X,
  Clock,
  DollarSign,
  Users,
} from "lucide-react";
import { useForecast } from "@/hooks/useForecast";
import { usePipelines } from "@/hooks/usePipelines";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PipelineScoreboardProps {
  pipelineId: string;
}

/** Safely read hidden_scoreboard_metrics from the pipeline's revenue_config. */
function getHiddenMetrics(pipeline: { revenue_config: Record<string, unknown> } | undefined): Set<string> {
  const raw = pipeline?.revenue_config?.hidden_scoreboard_metrics;
  if (Array.isArray(raw)) return new Set(raw.filter((k): k is string => typeof k === "string"));
  return new Set();
}

/** Format a number as BRL currency. */
function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a number with compact notation. */
function formatCompact(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(0) + "k";
  return String(value);
}

/** Days elapsed in the current period. */
function daysElapsed(period: "month" | "quarter"): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));

  if (period === "month") {
    // Days elapsed this month
    return now.getDate();
  } else {
    // Days elapsed this quarter
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3; // 0, 3, 6, 9
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
    return Math.floor((now.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
}

/** Total days in the current period. */
function daysInPeriod(period: "month" | "quarter"): number {
  const now = new Date();
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  } else {
    // Sum days in the 3 months of the current quarter
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    let total = 0;
    for (let i = 0; i < 3; i++) {
      total += new Date(now.getFullYear(), quarterMonth + i + 1, 0).getDate();
    }
    return total;
  }
}

export function PipelineScoreboard({ pipelineId }: PipelineScoreboardProps) {
  const storageKey = `scoreboard_open_${pipelineId}`;
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== "false");
  const { pipelines, updatePipeline } = usePipelines();
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const [hiddenMetrics, setHiddenMetrics] = useState<Set<string>>(() =>
    getHiddenMetrics(pipeline)
  );
  const { data, isLoading } = useForecast(pipelineId);

  // Sync hiddenMetrics when pipeline data loads (first render may not have it yet)
  useEffect(() => {
    setHiddenMetrics(getHiddenMetrics(pipeline));
  }, [pipeline?.revenue_config?.hidden_scoreboard_metrics]);

  useEffect(() => {
    localStorage.setItem(storageKey, String(open));
  }, [open, storageKey]);

  const hideMetric = useCallback(
    (metricKey: string) => {
      const current = getHiddenMetrics(pipeline);
      current.add(metricKey);
      setHiddenMetrics(new Set(current));
      updatePipeline.mutate({
        id: pipelineId,
        revenue_config: {
          ...(pipeline?.revenue_config ?? {}),
          hidden_scoreboard_metrics: Array.from(current),
        },
      });
    },
    [pipeline, pipelineId, updatePipeline]
  );

  const showAllMetrics = useCallback(() => {
    setHiddenMetrics(new Set());
    updatePipeline.mutate({
      id: pipelineId,
      revenue_config: {
        ...(pipeline?.revenue_config ?? {}),
        hidden_scoreboard_metrics: [],
      },
    });
  }, [pipeline, pipelineId, updatePipeline]);

  // ── Run-rate computation ──────────────────────────────────────
  const runRateData = useMemo(() => {
    if (!data) return null;
    const elapsed = daysElapsed(data.period);
    const total = daysInPeriod(data.period);
    const pctElapsed = total > 0 ? elapsed / total : 1;

    // Deals run-rate
    const dealsRunRate =
      data.goal_deals > 0 && pctElapsed > 0
        ? Math.round((data.placar.won / data.goal_deals) * (1 / pctElapsed) * 100)
        : 0;

    // Revenue run-rate
    const revenueRunRate =
      data.goal_revenue > 0 && pctElapsed > 0
        ? Math.round((data.placar.won * (data.goal_revenue / data.goal_deals) / data.goal_revenue) * (1 / pctElapsed) * 100)
        : 0;

    return { elapsed, total, pctElapsed, dealsRunRate, revenueRunRate };
  }, [data]);

  if (isLoading) {
    return <div className="h-10 bg-black/5 animate-pulse rounded-md mx-4 mt-2" />;
  }

  if (!data) return null;

  const { won, lost, in_progress, goal } = data.placar;
  const periodLabel = data.period === "month" ? "Mensal" : "Trimestral";

  // ── Metric cards ──────────────────────────────────────────────
  const metrics = [
    {
      key: "deals",
      label: "Negócios",
      target: String(data.goal_deals),
      current: String(won),
      runRate: runRateData ? `${runRateData.dealsRunRate}%` : "\u2014",
      gap: runRateData ? runRateData.dealsRunRate - 100 : null,
      icon: <Target className="h-4 w-4 text-emerald-500" />,
    },
    {
      key: "revenue",
      label: "Faturamento",
      target: data.goal_revenue > 0 ? formatBRL(data.goal_revenue) : "\u2014",
      current: data.goal_revenue > 0 ? formatBRL((won / Math.max(goal, 1)) * data.goal_revenue) : "\u2014",
      runRate: data.goal_revenue > 0 && runRateData ? `${runRateData.revenueRunRate}%` : "\u2014",
      gap: data.goal_revenue > 0 && runRateData ? runRateData.revenueRunRate - 100 : null,
      icon: <DollarSign className="h-4 w-4 text-blue-500" />,
    },
    {
      key: "win_rate",
      label: "Taxa de Conversão",
      target: "\u2014",
      current: data.win_rate !== null ? `${data.win_rate}%` : "\u2014",
      runRate: "\u2014",
      gap: null,
      icon: <TrendingUp className="h-4 w-4 text-purple-500" />,
    },
    {
      key: "velocity",
      label: "Velocidade",
      target: "\u2014",
      current: data.avg_velocity_days !== null ? `${data.avg_velocity_days} dias` : "\u2014",
      runRate: "\u2014",
      gap: null,
      icon: <Clock className="h-4 w-4 text-amber-500" />,
    },
    {
      key: "inbound",
      label: "Inbound Necessário",
      target: "\u2014",
      current:
        data.sufficient_data && data.required_inbound !== null
          ? `${data.required_inbound} leads`
          : "\u2014",
      runRate: "\u2014",
      gap: null,
      icon: <Users className="h-4 w-4 text-cyan-500" />,
    },
    {
      key: "opportunities_needed",
      label: "Oportunidades",
      target: "\u2014",
      current:
        data.sufficient_data && data.opportunities_needed !== null
          ? `${data.opportunities_needed}`
          : "\u2014",
      runRate: "\u2014",
      gap: null,
      icon: <TrendingUp className="h-4 w-4 text-sky-500" />,
    },
    {
      key: "proposals_needed",
      label: "Propostas",
      target: "\u2014",
      current:
        data.sufficient_data && data.proposals_needed !== null
          ? `${data.proposals_needed}`
          : "\u2014",
      runRate: "\u2014",
      gap: null,
      icon: <BarChart3 className="h-4 w-4 text-indigo-500" />,
    },
    {
      key: "meetings_needed",
      label: "Reuniões",
      target: "\u2014",
      current:
        data.sufficient_data && data.meetings_needed !== null
          ? `${data.meetings_needed}`
          : "\u2014",
      runRate: "\u2014",
      gap: null,
      icon: <Users className="h-4 w-4 text-rose-500" />,
    },
  ];

  const hasHidden = hiddenMetrics.size > 0;

  // ── Progress bar ──────────────────────────────────────────────
  const wonPct = goal > 0 ? (won / goal) * 100 : 0;
  const inProgressPct = goal > 0 ? (in_progress / goal) * 100 : 0;
  const lostPct = goal > 0 ? (lost / goal) * 100 : 0;
  const remainingPct = Math.max(0, 100 - wonPct - inProgressPct - lostPct);
  const targetPct = 100; // target line is always at 100%

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors border-b border-border/40">
          <span className="flex items-center gap-2">
            <BarChart3 className="h-3 w-3" />
            Painel de Receita
          </span>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-b border-border/20 bg-card/50 px-4 py-4">
          {/* Goal header */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground">Meta {periodLabel}</span>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold">
                  {data.goal_deals > 0 ? `${data.goal_deals} negócios` : "\u2014"}
                </span>
                {data.goal_revenue > 0 && (
                  <span className="text-lg font-semibold text-muted-foreground">
                    {formatBRL(data.goal_revenue)}
                  </span>
                )}
              </div>
            </div>
            {runRateData && (
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Run Rate</span>
                <span
                  className={`text-xl font-semibold ${
                    runRateData.dealsRunRate >= 100
                      ? "text-green-600"
                      : "text-destructive"
                  }`}
                >
                  {runRateData.dealsRunRate}%
                </span>
              </div>
            )}
          </div>

          {/* Progress bar: target line vs current fill */}
          <div className="relative h-6 bg-muted rounded-full overflow-hidden">
            {/* Won fill */}
            {wonPct > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500 transition-all"
                style={{ width: `${Math.min(wonPct, 100)}%` }}
              />
            )}
            {/* In-progress fill */}
            {inProgressPct > 0 && (
              <div
                className="absolute inset-y-0 bg-sky-500 transition-all"
                style={{
                  left: `${wonPct}%`,
                  width: `${Math.min(inProgressPct, 100 - wonPct)}%`,
                }}
              />
            )}
            {/* Lost fill */}
            {lostPct > 0 && (
              <div
                className="absolute inset-y-0 bg-red-400/60 transition-all"
                style={{
                  left: `${wonPct + inProgressPct}%`,
                  width: `${Math.min(lostPct, 100 - wonPct - inProgressPct)}%`,
                }}
              />
            )}
            {/* Target line */}
            <div
              className="absolute inset-y-0 border-r-2 border-destructive"
              style={{ left: `${targetPct}%` }}
            />
            {/* Label */}
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-foreground/70">
              {won} / {goal} negócios
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Ganhas ({won})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              Andamento ({in_progress})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400/60" />
              Perdidas ({lost})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/15" />
              Restante
            </span>
          </div>

          {/* Metric cards */}
          {metrics.some((m) => !hiddenMetrics.has(m.key)) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {metrics.map((m) => {
                if (hiddenMetrics.has(m.key)) return null;
                return (
                  <div
                    key={m.key}
                    className="relative bg-card border rounded-md p-3 space-y-1 group"
                  >
                    <button
                      onClick={() => hideMetric(m.key)}
                      className="absolute top-1 right-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-all"
                      title="Ocultar métrica"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="flex items-center gap-1.5">
                      {m.icon}
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {m.label}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground/70">Target</span>
                        <span className="font-medium font-mono">{m.target}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground/70">Atual</span>
                        <span className="font-medium font-mono">{m.current}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground/70">Projetado</span>
                        <span
                          className={`font-medium font-mono ${
                            m.gap !== null
                              ? m.gap >= 0
                                ? "text-green-600"
                                : "text-destructive"
                              : ""
                          }`}
                        >
                          {m.runRate}
                        </span>
                      </div>
                      {m.gap !== null && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground/70">Gap</span>
                          <span
                            className={`font-medium font-mono ${
                              m.gap >= 0 ? "text-green-600" : "text-destructive"
                            }`}
                          >
                            {m.gap > 0 ? "+" : ""}{m.gap}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* "Mostrar todos" link */}
          {hasHidden && (
            <button
              onClick={showAllMetrics}
              className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-2"
            >
              Mostrar todos
            </button>
          )}

          {/* Per-owner split */}
          {data.owner_goals.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Por vendedor</h4>
              <div className="space-y-3">
                {data.owner_goals.map((og) => {
                  const ownerPlacar = data.owner_placar[og.owner_id];
                  const current = ownerPlacar ? ownerPlacar.won : 0;
                  const pct = og.target_deals > 0
                    ? Math.min(Math.round((current / og.target_deals) * 100), 100)
                    : 0;
                  return (
                    <div key={og.owner_id} className="flex items-center gap-3 text-sm">
                      <span className="w-32 truncate text-muted-foreground font-mono text-xs">
                        {og.owner_id.slice(0, 8)}...
                      </span>
                      <span className="w-28 text-xs font-medium">
                        {current} / {og.target_deals} negócios
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-stage conversion chips */}
          {data.sufficient_data && (
            <div className="border-t pt-3">
              <h4 className="text-xs font-medium text-muted-foreground mb-2">
                Conversão por etapa
              </h4>
              <div className="flex flex-wrap gap-2">
                {data.conversion_rates.map((r) => (
                  <div
                    key={r.stage_id}
                    className="flex items-center gap-1.5 px-2 py-1 bg-background/80 rounded text-[10px]"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        r.source === "manual" ? "bg-amber-400" : "bg-emerald-400"
                      }`}
                    />
                    <span className="text-muted-foreground">
                      {(r.rate * 100).toFixed(0)}%
                    </span>
                    <span className="text-muted-foreground/50 text-[9px]">
                      {r.source === "manual" ? "manual" : "histórico"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
