/**
 * A linha do tempo do negócio: o trilho do funil (Entrada → 1º contato →
 * Proposta → Reunião → Contrato → Ganho) e, abaixo, cada coisa que aconteceu,
 * com data, hora e quem fez — reuniões agendadas (para quando), no-shows,
 * propostas enviadas/aceitas, contratos enviados/assinados, etapas, touchpoints.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { useDealTimeline } from "@/hooks/useDealTimeline";
import {
  CATEGORY_STYLE,
  categoryOf,
  milestonesOf,
  shortDate,
  type DealTimeline as Timeline,
} from "@/lib/dealTimeline";
import { cn } from "@/lib/utils";

export function DealTimelineStrip({ timeline, compact }: { timeline: Timeline; compact?: boolean }) {
  const stops = useMemo(() => milestonesOf(timeline), [timeline]);
  const lastReached = stops.reduce((acc, s, i) => (s.reached ? i : acc), -1);
  return (
    <ol className="relative grid grid-cols-6 gap-0" aria-label="Marcos do negócio">
      {stops.map((s, i) => {
        const style = CATEGORY_STYLE[s.category];
        return (
          <li key={s.key} className="relative flex flex-col items-center text-center min-w-0">
            {/* trilho até o próximo marco */}
            {i < stops.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[9px] left-1/2 h-0.5 w-full",
                  i < lastReached ? "bg-emerald-500/50" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 h-[18px] w-[18px] rounded-full border-2 border-background",
                s.reached ? style.dot : "bg-muted ring-1 ring-border",
              )}
            />
            <span className={cn("mt-1 text-[11px] font-medium truncate max-w-full", !s.reached && "text-muted-foreground")}>
              {s.label}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">{s.reached ? shortDate(s.at) : "—"}</span>
            {!compact && s.note && <span className="text-[10px] text-muted-foreground truncate max-w-full">{s.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

type Filter = "all" | "milestones";

export function DealTimelineSection({ opportunityId, open }: { opportunityId: string; open: boolean }) {
  const { data, isLoading } = useDealTimeline(opportunityId, open);
  const [filter, setFilter] = useState<Filter>("milestones");
  const [expanded, setExpanded] = useState(false);

  const events = useMemo(() => {
    // "Marcos" esconde touchpoints e etapas sem significado de funil.
    const list = (data?.events ?? []).filter(
      (e) => filter === "all" || !["contact", "stage"].includes(categoryOf(e.kind)),
    );
    return [...list].reverse();
  }, [data, filter]);
  const shown = expanded ? events : events.slice(0, 8);

  // agrupado por dia
  const groups = useMemo(() => {
    const out: { day: string; items: typeof shown }[] = [];
    for (const e of shown) {
      const d = day(e.at);
      if (out[out.length - 1]?.day === d) out[out.length - 1].items.push(e);
      else out.push({ day: d, items: [e] });
    }
    return out;
  }, [shown]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Linha do tempo</h4>
        <div className="flex rounded-md border p-0.5 text-[11px]">
          {(["milestones", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn("rounded px-2 py-0.5", filter === f ? "bg-muted font-medium" : "text-muted-foreground")}
            >
              {f === "milestones" ? "Marcos" : "Tudo"}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="rounded-lg border bg-muted/10 px-2 py-3">
            <DealTimelineStrip timeline={data} />
          </div>

          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nada registrado ainda.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.day} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.day}</p>
                  <ul className="relative space-y-1.5 border-l border-border/70 pl-4 ml-1">
                    {g.items.map((e, i) => {
                      const st = CATEGORY_STYLE[categoryOf(e.kind)];
                      return (
                        <li key={`${e.at}-${e.kind}-${i}`} className="relative text-xs">
                          <span className={cn("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background", st.dot)} />
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-mono text-[10px] text-muted-foreground">{time(e.at)}</span>
                            <span className={cn("rounded px-1.5 py-0.5 font-medium", st.chip)}>{e.label}</span>
                            {e.actor && <span className="text-muted-foreground">por {e.actor}</span>}
                          </div>
                          {e.detail && <p className="mt-0.5 text-muted-foreground truncate">{e.detail}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {events.length > 8 && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Mostrar menos" : `Ver todos (${events.length})`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
