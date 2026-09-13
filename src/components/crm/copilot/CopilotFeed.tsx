import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { dealHref, groupByDay, statusLabel, type CopilotFeed as Feed } from "@/lib/copilotFeed";
import { cn } from "@/lib/utils";

interface CopilotFeedProps {
  feed: Feed;
  busyId: string | null;
  onUndo: (id: string) => void;
}

const UNDOABLE = new Set(["auto_applied", "executed"]);

/**
 * Sprint 11 · Onda 6 · T64 — what the Copilot did, by day, in words, with undo;
 * and the passes that failed, said plainly.
 */
export function CopilotFeed({ feed, busyId, onUndo }: CopilotFeedProps) {
  const days = groupByDay(feed.recent);
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">O que fiz</h3>
        <span className="text-xs text-muted-foreground">
          hoje: {feed.today.read} {feed.today.read === 1 ? "negócio lido" : "negócios lidos"} · {feed.today.applied}{" "}
          {feed.today.applied === 1 ? "ação" : "ações"}
        </span>
      </header>

      {feed.failures.length > 0 && (
        <div className="space-y-1 border-b border-border bg-destructive/5 px-4 py-2">
          {feed.failures.slice(0, 3).map((f) => (
            <p key={f.id} className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Não consegui ler {f.contact ?? "um negócio"}
                {f.error ? `: ${f.error}` : "."}
              </span>
            </p>
          ))}
        </div>
      )}

      {days.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nada ainda. Quando uma conversa pausar, o Copilot lê e atualiza o negócio.
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          {days.map((day) => (
            <div key={day.label}>
              <p className="sticky top-0 bg-card/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {day.label}
              </p>
              <ul className="divide-y divide-border/60">
                {day.items.map((item) => {
                  const href = dealHref(item);
                  const done = UNDOABLE.has(item.status);
                  return (
                    <li key={item.id} className="flex items-start justify-between gap-2 px-4 py-2">
                      <div className="min-w-0">
                        <p className={cn("text-sm", !done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                          {item.label ?? "Ação"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {href ? (
                            <Link to={href} className="hover:text-foreground hover:underline">{item.contact ?? "Negócio"}</Link>
                          ) : (
                            item.contact ?? "Negócio"
                          )}
                          {" · "}
                          {statusLabel(item.status)}
                        </p>
                      </div>
                      {done && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 text-xs"
                          disabled={busyId === item.id}
                          onClick={() => onUndo(item.id)}
                        >
                          {busyId === item.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-1 h-3.5 w-3.5" />}
                          Desfazer
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
