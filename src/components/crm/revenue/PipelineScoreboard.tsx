import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronRight, Users, X } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { useForecast } from "@/hooks/useForecast";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { usePipelines } from "@/hooks/usePipelines";
import { buildScoreboard, formatBRL, type PaceStatus } from "@/lib/scoreboard";
import { cn } from "@/lib/utils";

import { UserAvatar } from "../fields/UserAvatar";

interface PipelineScoreboardProps {
  pipelineId: string;
}

type MetricKey = "meta" | "realizado" | "ritmo" | "falta" | "conversao" | "ciclo";

// Keys hidden before T25 (per metric card) carried over to the new strip.
const LEGACY_KEYS: Record<string, MetricKey> = { win_rate: "conversao", velocity: "ciclo" };

function getHiddenMetrics(pipeline: { revenue_config: Record<string, unknown> } | undefined): Set<MetricKey> {
  const raw = pipeline?.revenue_config?.hidden_scoreboard_metrics;
  if (!Array.isArray(raw)) return new Set();
  const keys = raw.filter((k): k is string => typeof k === "string").map((k) => LEGACY_KEYS[k] ?? k);
  return new Set(keys as MetricKey[]);
}

const PACE_LABEL: Record<PaceStatus, string> = { ahead: "Na frente", on_track: "No ritmo", behind: "Atrasado" };
const PACE_COLOR: Record<PaceStatus, string> = {
  ahead: "text-emerald-600 dark:text-emerald-400",
  on_track: "text-amber-600 dark:text-amber-400",
  behind: "text-destructive",
};

const readOpen = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v !== "false";
  } catch {
    return fallback;
  }
};

/**
 * Sprint 11 · Onda 2B · T25 — the pipeline's placar, from crm_placar (the
 * owner at the moment of each win, as in the dashboard). One line when closed
 * (how it goes this period); open, each number once — Meta · Realizado · Ritmo ·
 * Falta · Conversão · Ciclo — with a thin bar, and the owners in a detail that
 * opens, "Sem responsável" included when it exists.
 */
export function PipelineScoreboard({ pipelineId }: PipelineScoreboardProps) {
  const isMobile = useIsMobile();
  const storageKey = `scoreboard_open_${pipelineId}`;
  const [open, setOpen] = useState(() => readOpen(storageKey, !isMobile));
  const [ownersOpen, setOwnersOpen] = useState(false);
  const { pipelines, updatePipeline } = usePipelines();
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const [hidden, setHidden] = useState<Set<MetricKey>>(() => getHiddenMetrics(pipeline));
  const { data, isLoading } = useForecast(pipelineId);
  const { nameOf } = useMemberDirectory();

  useEffect(() => {
    setHidden(getHiddenMetrics(pipeline));
  }, [pipeline?.revenue_config?.hidden_scoreboard_metrics]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(open));
    } catch {
      // private window / blocked storage: the placar still works
    }
  }, [open, storageKey]);

  const saveHidden = useCallback(
    (next: Set<MetricKey>) => {
      setHidden(next);
      updatePipeline.mutate({
        id: pipelineId,
        revenue_config: { ...(pipeline?.revenue_config ?? {}), hidden_scoreboard_metrics: Array.from(next) },
      });
    },
    [pipeline, pipelineId, updatePipeline],
  );

  const board = useMemo(
    () =>
      data
        ? buildScoreboard({
            placar: data.placar,
            goalDeals: data.goal_deals,
            goalRevenue: data.goal_revenue,
            ownerGoals: data.owner_goals,
            elapsedDays: data.elapsed_days,
            totalDays: data.total_days,
            nameOf,
          })
        : null,
    [data, nameOf],
  );

  if (isLoading) return <div className="mx-4 mt-2 h-8 animate-pulse rounded-md bg-muted/60" />;
  if (!data || !board) return null;

  const periodLabel = data.period === "month" ? "do mês" : "do trimestre";
  const ritmoText = board.ritmoPct !== null ? `${Math.min(board.ritmoPct, 999)}%` : "—";

  const metrics: { key: MetricKey; label: string; value: string; className?: string; title?: string }[] = [
    { key: "meta", label: "Meta", value: board.meta ?? "Sem meta" },
    { key: "realizado", label: "Realizado", value: board.realizado },
    {
      key: "ritmo",
      label: "Ritmo",
      value: board.ritmoStatus ? `${ritmoText} · ${PACE_LABEL[board.ritmoStatus]}` : "—",
      className: board.ritmoStatus ? PACE_COLOR[board.ritmoStatus] : undefined,
      title: "Onde o período termina neste ritmo, em % da meta",
    },
    {
      key: "falta",
      label: "Falta",
      value: board.falta ?? "—",
      className: board.falta && board.progressPct !== null && board.progressPct < 100 ? "text-destructive" : undefined,
    },
    { key: "conversao", label: "Conversão", value: board.conversao, title: "Ganhos ÷ (ganhos + perdidos) no período" },
    { key: "ciclo", label: "Ciclo", value: board.ciclo, title: "Dias da criação ao ganho, em média" },
  ];
  const visibleMetrics = metrics.filter((m) => !hidden.has(m.key));

  const nextSteps: string[] = [];
  if (data.opportunities_needed) nextSteps.push(`${data.opportunities_needed} oportunidades`);
  if (data.proposals_needed) nextSteps.push(`${data.proposals_needed} propostas`);
  if (data.meetings_needed) nextSteps.push(`${data.meetings_needed} reuniões`);

  // The closed strip: how the period goes, in one line.
  const summary = board.meta
    ? `${board.realizado} de ${board.meta} · ${ritmoText}`
    : `${board.realizado} ${periodLabel}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border/40">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <BarChart3 className="h-3 w-3 shrink-0" />
          <span className="shrink-0 font-medium">Placar {periodLabel}</span>
          {!open && (
            <span className={cn("min-w-0 truncate", board.ritmoStatus && PACE_COLOR[board.ritmoStatus])}>{summary}</span>
          )}
          {!open && board.progressPct !== null && (
            <span className="ml-1 hidden h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
              <span className="block h-full bg-emerald-500" style={{ width: `${board.progressPct}%` }} />
            </span>
          )}
          <span className="ml-auto shrink-0">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 bg-card/50 px-4 pb-3 pt-1">
          {visibleMetrics.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
              {visibleMetrics.map((m) => (
                <div key={m.key} className="group relative min-w-0" title={m.title}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                  <div className={cn("truncate text-sm font-semibold tabular-nums", m.className)}>{m.value}</div>
                  <button
                    type="button"
                    onClick={() => saveHidden(new Set([...hidden, m.key]))}
                    className="absolute right-0 top-0 rounded-sm p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100"
                    title="Ocultar"
                    aria-label={`Ocultar ${m.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {board.progressPct !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${board.progressPct}% da meta`}>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${board.progressPct}%` }} />
            </div>
          )}

          {data.sufficient_data && nextSteps.length > 0 && (
            <p className="text-xs text-muted-foreground">Faltam {nextSteps.join(", ")} para manter o ritmo.</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {board.owners.length > 0 && (
              <button
                type="button"
                onClick={() => setOwnersOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Users className="h-3 w-3" />
                Por responsável ({board.owners.length})
                {ownersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            )}
            {hidden.size > 0 && (
              <button
                type="button"
                onClick={() => saveHidden(new Set())}
                className="text-[11px] text-muted-foreground/70 underline underline-offset-2 hover:text-foreground"
              >
                Mostrar todos os números
              </button>
            )}
          </div>

          {ownersOpen && (
            <div className="space-y-1.5">
              {board.owners.map((o) => (
                <div key={o.ownerId ?? "none"} className="flex items-center gap-2 text-xs">
                  <UserAvatar userId={o.ownerId} name={o.ownerId ? o.name : null} size="xs" />
                  <span className="w-32 min-w-0 truncate font-medium">{o.name}</span>
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                    {o.target ? `${o.won} / ${o.target}` : `${o.won} ${o.won === 1 ? "ganho" : "ganhos"}`}
                  </span>
                  <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                    {o.pct !== null && (
                      <div className="h-full rounded-full bg-primary" style={{ width: `${o.pct}%` }} />
                    )}
                  </div>
                  <span
                    className={cn(
                      "w-12 shrink-0 text-right tabular-nums",
                      o.runRate === null
                        ? "text-muted-foreground"
                        : o.runRate >= 100
                          ? "text-emerald-600"
                          : o.runRate >= 50
                            ? "text-amber-600"
                            : "text-destructive",
                    )}
                    title={o.runRate !== null ? `Neste ritmo: ${o.runRate}% da meta` : "Sem meta individual"}
                  >
                    {o.runRate !== null ? `${Math.min(o.runRate, 999)}%` : "—"}
                  </span>
                  <span className="hidden w-24 shrink-0 text-right tabular-nums text-muted-foreground md:block">
                    {formatBRL(o.wonRevenue)}
                  </span>
                  <span className="hidden w-20 shrink-0 text-right text-muted-foreground lg:block" title="Negócios abertos agora">
                    {o.inProgress} abertos
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
