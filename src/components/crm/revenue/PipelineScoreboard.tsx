import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  X,
  TrendingUp,
  Target,
  Clock,
  User,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useForecast, computeRunRate } from "@/hooks/useForecast";
import { usePipelines } from "@/hooks/usePipelines";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PipelineScoreboardProps {
  pipelineId: string;
}

function getHiddenMetrics(pipeline: { revenue_config: Record<string, unknown> } | undefined): Set<string> {
  const raw = pipeline?.revenue_config?.hidden_scoreboard_metrics;
  if (Array.isArray(raw)) return new Set(raw.filter((k): k is string => typeof k === "string"));
  return new Set();
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PipelineScoreboard({ pipelineId }: PipelineScoreboardProps) {
  const storageKey = `scoreboard_open_${pipelineId}`;
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== "false");
  const { pipelines, updatePipeline } = usePipelines();
  const { profile } = useAuth();
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const [hiddenMetrics, setHiddenMetrics] = useState<Set<string>>(() => getHiddenMetrics(pipeline));
  const { data, isLoading } = useForecast(pipelineId);

  const equipeId = profile?.equipe_id;

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles", equipeId],
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("profiles")
        .select("id, name")
        .eq("equipe_id", equipeId);
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!equipeId,
    staleTime: 60_000,
  });

  const ownerName = (ownerId: string): string =>
    profiles.find((p) => p.id === ownerId)?.name || ownerId.slice(0, 8);

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
        revenue_config: { ...(pipeline?.revenue_config ?? {}), hidden_scoreboard_metrics: Array.from(current) },
      });
    },
    [pipeline, pipelineId, updatePipeline]
  );

  const showAllMetrics = useCallback(() => {
    setHiddenMetrics(new Set());
    updatePipeline.mutate({
      id: pipelineId,
      revenue_config: { ...(pipeline?.revenue_config ?? {}), hidden_scoreboard_metrics: [] },
    });
  }, [pipeline, pipelineId, updatePipeline]);

  if (isLoading) {
    return <div className="h-10 bg-black/5 animate-pulse rounded-md mx-4 mt-2" />;
  }

  if (!data) return null;

  const { goal_deals, goal_revenue, period, won_revenue } = data;
  const { won, lost, in_progress } = data.placar;
  const periodLabel = period === "month" ? "Mensal" : "Trimestral";
  const goalLabel = goal_revenue > 0 ? formatBRL(goal_revenue) : `${goal_deals} negócios`;
  const currentLabel = goal_revenue > 0 ? formatBRL(won_revenue) : `${won} fechados`;
  const gapDeals = Math.max(0, goal_deals - won);
  const gapRevenue = Math.max(0, goal_revenue - won_revenue);
  const gapLabel = gapRevenue > 0 ? formatBRL(gapRevenue) : `${gapDeals} negócios`;

  // Current attainment (used for progress bar only)
  const pctWon = goal_deals > 0 ? (won / goal_deals) * 100 : 0;

  // Pace-based projection: run-rate extrapolation of deals and revenue.
  // Formula: (won / goal) * (total_days / elapsed_days) * 100
  // Only meaningful when sufficient_data is true (goal is set, data exists).
  const now = new Date();
  const elapsed = period === "month"
    ? now.getDate()
    : (() => {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        return (
          Math.floor(
            (now.getTime() - new Date(now.getFullYear(), qm, 1).getTime()) / 86400000,
          ) + 1
        );
      })();
  const total = period === "month"
    ? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    : (() => {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        let d = 0;
        for (let i = 0; i < 3; i++) d += new Date(now.getFullYear(), qm + i + 1, 0).getDate();
        return d;
      })();

  // Deals run-rate projection
  const runRatePct = data.sufficient_data ? computeRunRate(won, goal_deals, elapsed, total) : null;
  const projectedLabel = runRatePct !== null ? `${Math.min(runRatePct, 999)}%` : "—";

  // Revenue run-rate projection
  const revenueRunRatePct =
    data.sufficient_data && goal_revenue > 0
      ? computeRunRate(won_revenue, goal_revenue, elapsed, total)
      : null;
  const revenueProjectedLabel =
    revenueRunRatePct !== null ? `${Math.min(revenueRunRatePct, 999)}%` : "—";

  // Pace indicator
  const paceColor =
    data.pace_status === "ahead" ? "text-emerald-500" :
    data.pace_status === "behind" ? "text-destructive" :
    "text-amber-500";

  const paceIcon =
    data.pace_status === "ahead" ? "✅" :
    data.pace_status === "behind" ? "⚠️" :
    "🔄";

  // Next-action strip
  const stripParts: string[] = [];
  if (data.opportunities_needed !== null && data.opportunities_needed > 0) {
    stripParts.push(`${data.opportunities_needed} oportunidades`);
  }
  if (data.proposals_needed !== null && data.proposals_needed > 0) {
    stripParts.push(`${data.proposals_needed} propostas`);
  }
  if (data.meetings_needed !== null && data.meetings_needed > 0) {
    stripParts.push(`${data.meetings_needed} reuniões`);
  }

  // Top-line metrics for the grid (pace field removed — was never rendered)
  const topMetrics = [
    {
      key: "deals",
      label: "Negócios",
      target: String(goal_deals),
      current: String(won),
      // Pace-based run-rate projection; distinct from current attainment (pctWon)
      projected: runRatePct !== null ? `${Math.min(runRatePct, 999)}%` : "—",
      gap: gapDeals > 0 ? String(gapDeals) : "0",
      icon: <Target className="h-3.5 w-3.5 text-emerald-500" />,
    },
    {
      key: "revenue",
      label: "Faturamento",
      target: goal_revenue > 0 ? formatBRL(goal_revenue) : "—",
      current: goal_revenue > 0 ? formatBRL(won_revenue) : "—",
      projected: revenueProjectedLabel,
      gap: gapRevenue > 0 ? formatBRL(gapRevenue) : "R$ 0",
      icon: <TrendingUp className="h-3.5 w-3.5 text-blue-500" />,
    },
    {
      key: "win_rate",
      label: "Conversão",
      target: "—",
      current: data.win_rate !== null ? `${data.win_rate}%` : "—",
      projected: "—",
      gap: "—",
      icon: <Target className="h-3.5 w-3.5 text-purple-500" />,
    },
    {
      key: "velocity",
      label: "Velocidade",
      target: "—",
      current: data.avg_velocity_days !== null ? `${data.avg_velocity_days} dias` : "—",
      projected: "—",
      gap: "—",
      icon: <Clock className="h-3.5 w-3.5 text-amber-500" />,
    },
  ];

  const hasHidden = hiddenMetrics.size > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between px-4 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors border-b border-border/40">
          <span className="flex items-center gap-2">
            <BarChart3 className="h-3 w-3" />
            Placar {periodLabel}
          </span>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-b border-border/20 bg-card/50 px-4 py-4">
          {/* ── Top line: Meta · Atual · Projetado · Gap · Ritmo ── */}
          <div className="grid grid-cols-5 gap-2 text-center">
            <div className="space-y-0.5">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Meta</div>
              <div className="text-sm font-bold font-mono">{goalLabel}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Atual</div>
              <div className="text-sm font-semibold font-mono">{currentLabel}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Projetado</div>
              <div className={`text-sm font-semibold font-mono ${runRatePct !== null && runRatePct >= 100 ? "text-emerald-600" : ""}`}>
                {projectedLabel}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Gap</div>
              <div className={`text-sm font-semibold font-mono ${gapDeals > 0 ? "text-destructive" : "text-emerald-600"}`}>
                {gapLabel}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Ritmo</div>
              <div className={`text-sm font-semibold ${paceColor}`}>
                {paceIcon} {data.pace_status === "ahead" ? "Na frente" : data.pace_status === "behind" ? "Atrasado" : "No ritmo"}
              </div>
            </div>
          </div>

          {/* ── Progress bar ── */}
          {goal_deals > 0 && (
            <div className="relative h-5 bg-muted rounded-full overflow-hidden">
              {pctWon > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(pctWon, 100)}%` }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-foreground/70">
                {won} / {goal_deals} negócios
              </div>
            </div>
          )}

          {/* ── Next-action strip ── */}
          {data.sufficient_data && stripParts.length > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              Faltam {stripParts.join(", ")} para manter o ritmo.
            </div>
          )}

          {/* ── Metric cards (hideable) ── */}
          {topMetrics.some((m) => !hiddenMetrics.has(m.key)) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {topMetrics.map((m) => {
                if (hiddenMetrics.has(m.key)) return null;
                return (
                  <div key={m.key} className="relative bg-card border rounded-md p-2.5 space-y-1 group">
                    <button
                      onClick={() => hideMetric(m.key)}
                      className="absolute top-1 right-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-muted-foreground transition-all"
                      title="Ocultar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="flex items-center gap-1">
                      {m.icon}
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">{m.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                      <span className="text-muted-foreground/60">Target</span>
                      <span className="text-right font-mono font-medium">{m.target}</span>
                      <span className="text-muted-foreground/60">Atual</span>
                      <span className="text-right font-mono font-medium">{m.current}</span>
                      <span className="text-muted-foreground/60">Proj.</span>
                      <span className="text-right font-mono font-medium">{m.projected}</span>
                      <span className="text-muted-foreground/60">Gap</span>
                      <span className={`text-right font-mono font-medium ${m.gap !== "\u2014" && m.gap !== "0" && m.gap !== "R$ 0" && !m.gap?.startsWith("R$ 0") ? "text-destructive" : ""}`}>
                        {m.gap}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasHidden && (
            <button
              onClick={showAllMetrics}
              className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-2"
            >
              Mostrar todos
            </button>
          )}

          {/* ── Per-owner rows ── */}
          {data.owner_goals.length > 0 && (
            <div className="border-t pt-3">
              <h4 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                <User className="h-3 w-3 text-muted-foreground" />
                Por vendedor
              </h4>
              <div className="space-y-1.5">
                {data.owner_goals.map((og) => {
                  const ownerPlacar = data.owner_placar[og.owner_id];
                  const current = ownerPlacar ? ownerPlacar.won : 0;
                  const pct = og.target_deals > 0 ? Math.min(Math.round((current / og.target_deals) * 100), 100) : 0;
                  const ownerGap = Math.max(0, og.target_deals - current);
                  const ownerRunRate = data.sufficient_data && og.target_deals > 0
                    ? computeRunRate(current, og.target_deals, elapsed, total)
                    : null;
                  const ownerRunRateLabel = ownerRunRate !== null ? `${Math.min(ownerRunRate, 999)}%` : "\u2014";
                  const ownerPaceColor =
                    ownerRunRate === null ? "text-muted-foreground"
                    : ownerRunRate >= 100 ? "text-emerald-500"
                    : ownerRunRate >= 50 ? "text-amber-500"
                    : "text-destructive";
                  return (
                    <div key={og.owner_id} className="flex items-center gap-2 text-xs">
                      <span className="w-28 truncate font-medium">{ownerName(og.owner_id)}</span>
                      <span className="w-10 text-right font-mono text-muted-foreground tabular-nums">
                        {current}
                      </span>
                      <span className="text-muted-foreground/40">/</span>
                      <span className="w-10 font-mono tabular-nums">{og.target_deals}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-muted-foreground tabular-nums">
                        {pct}%
                      </span>
                      <span className={`w-12 text-right font-mono tabular-nums ${ownerGap > 0 ? "text-destructive" : "text-emerald-600"}`}>
                        {ownerGap > 0 ? `-${ownerGap}` : "0"}
                      </span>
                      <span className={`w-14 text-right font-mono tabular-nums ${ownerPaceColor}`} title={ownerRunRate !== null ? `Projeção: ${ownerRunRate}% do ritmo` : ""}>
                        {ownerRunRateLabel}
                      </span>
                      {og.target_revenue > 0 && (
                        <span className="hidden lg:block w-20 text-right font-mono text-muted-foreground tabular-nums">
                          {formatBRL(og.target_revenue)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
