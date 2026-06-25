import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Target,
  Users,
  TrendingUp,
  BarChart3,
  X,
  Clock,
} from "lucide-react";
import { useForecast } from "@/hooks/useForecast";
import { usePipelines } from "@/hooks/usePipelines";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PipelineScoreboardProps {
  pipelineId: string;
}

const ALL_METRIC_KEYS = ["goal_progress", "win_rate", "velocity", "inbound"] as const;

/** Safely read hidden_scoreboard_metrics from the pipeline's revenue_config. */
function getHiddenMetrics(pipeline: { revenue_config: Record<string, unknown> } | undefined): Set<string> {
  const raw = pipeline?.revenue_config?.hidden_scoreboard_metrics;
  if (Array.isArray(raw)) return new Set(raw.filter((k): k is string => typeof k === "string"));
  return new Set();
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

  if (isLoading) {
    return <div className="h-10 bg-black/5 animate-pulse rounded-md mx-4 mt-2" />;
  }

  if (!data) return null;

  const { won, lost, in_progress, goal } = data.placar;

  const wonPct = goal > 0 ? (won / goal) * 100 : 0;
  const inProgressPct = goal > 0 ? (in_progress / goal) * 100 : 0;
  const lostPct = goal > 0 ? (lost / goal) * 100 : 0;
  const remainingPct = Math.max(0, 100 - wonPct - inProgressPct - lostPct);

  const goalProgressPct = goal > 0 ? Math.round((won / goal) * 100) : 0;

  const metrics = [
    {
      key: "goal_progress",
      icon: <Target className="h-4 w-4 text-emerald-500" />,
      label: "Progresso da Meta",
      value: `${won} de ${goal} negócios`,
      secondary: `${goalProgressPct}%`,
    },
    {
      key: "win_rate",
      icon: <TrendingUp className="h-4 w-4 text-blue-500" />,
      label: "Taxa de Conversão",
      value: data.win_rate !== null ? `${data.win_rate}%` : "\u2014",
      secondary: "win rate",
    },
    {
      key: "velocity",
      icon: <Clock className="h-4 w-4 text-purple-500" />,
      label: "Velocidade Média",
      value: data.avg_velocity_days !== null ? `${data.avg_velocity_days} dias` : "\u2014",
      secondary: "abertura \u2192 fechamento",
    },
    {
      key: "inbound",
      icon: <Users className="h-4 w-4 text-amber-500" />,
      label: "Inbound Necessário",
      value:
        data.sufficient_data && data.required_inbound !== null
          ? `${data.required_inbound} leads`
          : "\u2014",
      secondary: "para atingir a meta",
    },
  ] as const;

  const hasHidden = hiddenMetrics.size > 0;

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
        <div className="space-y-3 border-b border-border/20 bg-card/50 px-4 py-3">
          {/* Stacked bar + per-stage chips */}
          <div className="flex items-stretch gap-0 text-xs font-mono overflow-x-auto">
            {/* Meta */}
            <div className="flex items-center gap-2 pr-4 border-r border-border/20 shrink-0">
              <Target className="h-3.5 w-3.5 text-emerald-500" />
              <div>
                <span className="text-muted-foreground">Meta</span>
                <span className="ml-2 font-semibold">{data.goal_deals}</span>
              </div>
            </div>

            {/* Placar — stacked bar */}
            <div className="flex items-center gap-2 px-4 border-r border-border/20 min-w-[200px] shrink-0">
              <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
              <div className="flex-1 space-y-1">
                <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
                  {wonPct > 0 && (
                    <div
                      className="bg-emerald-500 transition-all"
                      style={{ width: `${wonPct}%` }}
                    />
                  )}
                  {inProgressPct > 0 && (
                    <div
                      className="bg-sky-500 transition-all"
                      style={{ width: `${inProgressPct}%` }}
                    />
                  )}
                  {lostPct > 0 && (
                    <div
                      className="bg-red-400/60 transition-all"
                      style={{ width: `${lostPct}%` }}
                    />
                  )}
                  {remainingPct > 0 && (
                    <div
                      className="bg-muted-foreground/15 transition-all"
                      style={{ width: `${remainingPct}%` }}
                    />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {won} ganhas &middot; {in_progress} em andamento &middot; {lost} perdidas
                </div>
              </div>
            </div>

            {/* Per-stage conversion chips */}
            {data.sufficient_data ? (
              data.conversion_rates.slice(0, 5).map((r) => (
                <div
                  key={r.stage_id}
                  className="flex items-center gap-1 px-2 text-[10px] shrink-0"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${r.source === "manual" ? "bg-amber-400" : "bg-emerald-400"}`}
                  />
                  <span className="text-muted-foreground">{(r.rate * 100).toFixed(0)}%</span>
                </div>
              ))
            ) : (
              <div className="flex items-center px-4 text-[10px] text-muted-foreground/70 italic shrink-0">
                dados insuficientes
              </div>
            )}
          </div>

          {/* Metrics grid — only render when at least one metric is visible */}
          {metrics.some((m) => !hiddenMetrics.has(m.key)) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {metrics.map((m) => {
                if (hiddenMetrics.has(m.key)) return null;
                return (
                  <div
                    key={m.key}
                    className="relative rounded-lg border border-border/30 bg-background/60 p-3"
                  >
                    <button
                      onClick={() => hideMetric(m.key)}
                      className="absolute top-1 right-1 p-0.5 rounded-sm text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                      title="Ocultar métrica"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="flex items-center gap-2 mb-1">
                      {m.icon}
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {m.label}
                      </span>
                    </div>
                    <div className="text-sm font-semibold font-mono">{m.value}</div>
                    {m.secondary && (
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {m.secondary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* "Mostrar todos" link — restore all hidden metrics */}
          {hasHidden && (
            <button
              onClick={showAllMetrics}
              className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-2"
            >
              Mostrar todos
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
