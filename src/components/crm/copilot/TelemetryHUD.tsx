// src/components/crm/copilot/TelemetryHUD.tsx
//
// Sprint 6.1 - EPIC D - D4: live cognition HUD.
// Sprint 6.10 W3 - Telemetry Humanization: timestamp formatting (pt-BR
// locale), run_id grouping, sweep totals.
//
// Events are grouped by run_id with visual separators between different runs.
// Timestamps are formatted in pt-BR local time (e.g. "14:32").
// Sweep progress events show current/total counters.

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, X } from "lucide-react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  Sheet,
  SheetPortal,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCopilotActivity } from "@/lib/copilotActivity";
import { cn } from "@/lib/utils";
import type { HudEvent } from "@/hooks/useCopilotSync";

interface TelemetryHUDProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: HudEvent[];
  running: boolean;
  title?: string;
}

type HudTone = "info" | "ok" | "err" | "warn" | "muted";

interface HudQueueItem {
  title: string;
  detail: string;
  meta: string;
  tone: HudTone;
  /** Optional timestamp string (pt-BR formatted). */
  timeLabel?: string;
  /** Event sequence number, used as stable React key. */
  seq: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a timestamp from an event to pt-BR locale time string.
 * Tries: event.ts, event.payload.created_at, event.payload.ts
 * Falls back to the event's sequence number if no timestamp is available.
 */
function formatEventTime(ev: HudEvent): string {
  const raw = ev.ts ?? (ev.payload?.created_at as string) ?? (ev.payload?.ts as string);
  if (raw) {
    try {
      const d = new Date(raw);
      return d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      // fall through to seq fallback
    }
  }
  return `#${ev.seq}`;
}

/**
 * Build a list of *grouped* items — run_id breakpoints are inserted as
 * `null` items that the render loop turns into visual separators.
 */
function groupedItems(events: HudEvent[]): (HudQueueItem | null)[] {
  const result: (HudQueueItem | null)[] = [];
  let prevRunId: string | undefined;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // Insert a run-group separator when run_id changes (skip before the
    // very first event).
    if (i > 0 && ev.run_id && ev.run_id !== prevRunId) {
      result.push(null); // null == separator sentinel
    }

    const item = itemFor(ev);
    item.seq = ev.seq;
    item.timeLabel = formatEventTime(ev);
    result.push(item);
    prevRunId = ev.run_id;
  }

  return result;
}

function activityFor(ev: HudEvent) {
  return formatCopilotActivity(ev.payload?.action ?? ev.payload);
}

function humanizeVerb(verb: string): string {
  switch (verb) {
    case "set_field":
    case "set_contact_field":
      return "Campo";
    case "move_stage":
      return "Etapa";
    case "add_note":
      return "Nota";
    case "add_touchpoint":
      return "Touchpoint";
    case "create_task":
      return "Tarefa";
    default:
      return verb;
  }
}

function stripUuids(text: string): string {
  if (!text) return text;
  return text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (match) => `#${match.slice(0, 4)}`);
}

/** Map a structured event to a readable queue item. */
function itemFor(ev: HudEvent): HudQueueItem {
  const item = _itemFor(ev);
  return {
    ...item,
    title: stripUuids(item.title),
    detail: stripUuids(item.detail),
  };
}

function _itemFor(ev: HudEvent): HudQueueItem {
  switch (ev.kind) {
    case "action_start": {
      const a = activityFor(ev);
      return {
        seq: ev.seq,
        title: a.title,
        detail: a.description,
        meta: humanizeVerb(a.verb),
        tone: "info",
      };
    }
    case "action_done": {
      const a = activityFor(ev);
      return ev.payload?.ok
        ? {
            seq: ev.seq,
            title: a.title,
            detail: a.result,
            meta: "Concluído",
            tone: "ok",
          }
        : {
            seq: ev.seq,
            title: a.title,
            detail: String(ev.payload?.error ?? "A ação falhou."),
            meta: "Erro",
            tone: "err",
          };
    }
    case "awaiting_confirmation": {
      const a = activityFor(ev);
      return {
        seq: ev.seq,
        title: "Aguardando aprovação",
        detail: a.title,
        meta: humanizeVerb(a.verb),
        tone: "warn",
      };
    }
    case "halted":
      return {
        seq: ev.seq,
        title: "Execução interrompida",
        detail: String(
          ev.payload?.reason ?? ev.payload?.error ?? "Sem créditos disponíveis.",
        ),
        meta: "Erro",
        tone: "err",
      };
    case "sweep_progress": {
      // Show current/total counts when available
      const current = String(ev.payload?.current ?? "");
      const total = String(ev.payload?.total ?? "");
      const countInfo = current && total ? `${current}/${total}` : "";
      const detail = countInfo
        ? `Sincronizando pipeline — ${countInfo} oportunidades`
        : "Sincronizando pipeline";
      return {
        seq: ev.seq,
        title: "Sincronizando pipeline",
        detail,
        meta: countInfo || "pipeline",
        tone: "muted",
      };
    }
    case "done": {
      const status = String(ev.payload?.status ?? "concluído");
      const friendlyStatus = status === "done executed" || status === "done" || status === "success" || status === "concluído"
        ? "Sincronização concluída com sucesso"
        : status;
      return {
        seq: ev.seq,
        title: "Sincronização concluída",
        detail: friendlyStatus,
        meta: "Concluído",
        tone: "ok",
      };
    }
    default:
      return {
        seq: ev.seq,
        title: String(ev.kind),
        detail: "Evento recebido do Copilot.",
        meta: String(ev.seq),
        tone: "muted",
      };
  }
}

const toneClass: Record<HudTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100",
  err: "border-red-200 bg-red-50 text-red-950 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100",
  warn: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100",
  muted: "border-border bg-muted/40 text-foreground",
};

const metaToneClass: Record<HudTone, string> = {
  info: "text-sky-700 dark:text-sky-300",
  ok: "text-emerald-700 dark:text-emerald-300",
  err: "text-red-700 dark:text-red-300",
  warn: "text-amber-700 dark:text-amber-300",
  muted: "text-muted-foreground",
};

export function TelemetryHUD({
  open,
  onOpenChange,
  events,
  running,
  title = "Telemetria do Copilot",
}: TelemetryHUDProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [minimized, setMinimized] = useState(false);

  const items = useMemo(() => groupedItems(events), [events]);

  const lastLine = useMemo(() => {
    // Find the last non-separator item
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i] !== null) return items[i]!.title;
    }
    return "Conectando ao Copilot";
  }, [items]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  useEffect(() => {
    if (!open) setMinimized(false);
  }, [open]);

  if (open && minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs text-foreground shadow-lg transition hover:bg-muted"
        aria-label="Restaurar telemetria do Copilot"
      >
        {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        <span className="max-w-64 truncate">{lastLine}</span>
      </button>
    );
  }

  return (
    // modal={false} disables Radix scroll-lock and pointer-event blocking so
    // CRM, chat, and Kanban surfaces stay interactive while the agent runs.
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetPortal>
        {/* No SheetOverlay here: intentionally omitted to avoid blocking the page. */}
        <SheetPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed right-4 top-20 z-50 w-[min(420px,calc(100vw-2rem))] max-h-[min(560px,calc(100vh-7rem))] rounded-lg border border-border bg-background p-4 shadow-2xl transition ease-in-out data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-right-4 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-right-4",
          )}
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 pr-16 text-base">
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
              {title}
            </SheetTitle>
          </SheetHeader>

          <div className="absolute right-4 top-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <Minus className="h-4 w-4" />
              <span className="sr-only">Minimizar</span>
            </button>
            <SheetClose className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </SheetClose>
          </div>

          <ScrollArea className="mt-4 h-[min(420px,calc(100vh-13rem))] pr-3">
            {events.length === 0 && (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <div className="text-sm font-medium text-foreground">Conectando ao Copilot</div>
                <div className="mt-1 text-xs text-muted-foreground">Preparando a análise...</div>
              </div>
            )}
            {items.map((item, i) => {
              // ── Run-group separator ────────────────────────────────
              if (item === null) {
                return (
                  <div
                    key={`sep-${i}`}
                    className="mb-2 mt-1 flex items-center gap-2"
                  >
                    <hr className="flex-1 border-t border-border/40" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      Nova execução
                    </span>
                    <hr className="flex-1 border-t border-border/40" />
                  </div>
                );
              }

              return (
                <div
                  key={`ev-${item.seq}`}
                  className={cn(
                    "mb-2 rounded-md border p-3 text-sm",
                    toneClass[item.tone],
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-medium leading-snug">
                      {item.title}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.timeLabel && (
                        <span className="text-[10px] tabular-nums text-muted-foreground/60">
                          {item.timeLabel}
                        </span>
                      )}
                      <div
                        className={cn(
                          "rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          metaToneClass[item.tone],
                        )}
                      >
                        {item.meta}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 text-xs leading-relaxed opacity-80">
                    {item.detail}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </ScrollArea>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
