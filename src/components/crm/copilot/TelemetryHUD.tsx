// src/components/crm/copilot/TelemetryHUD.tsx
//
// Sprint 6.1 - EPIC D - D4: live cognition HUD.
// Sprint 6.3 - Epic 1: converted from blocking Dialog to non-blocking right
//   Sheet drawer (modal={false}, no overlay, run persists on close).
// Sprint 6.5 - T4: compact fast telemetry panel with readable queue cards.

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
}

function activityFor(ev: HudEvent) {
  return formatCopilotActivity(ev.payload?.action ?? ev.payload);
}

/** Map a structured event to a readable queue item. */
function itemFor(ev: HudEvent): HudQueueItem {
  switch (ev.kind) {
    case "action_start": {
      const a = activityFor(ev);
      return {
        title: a.title,
        detail: a.description,
        meta: a.verb,
        tone: "info",
      };
    }
    case "action_done": {
      const a = activityFor(ev);
      return ev.payload?.ok
        ? {
            title: a.title,
            detail: a.result,
            meta: "Concluido",
            tone: "ok",
          }
        : {
            title: a.title,
            detail: String(ev.payload?.error ?? "A acao falhou."),
            meta: "Erro",
            tone: "err",
          };
    }
    case "awaiting_confirmation": {
      const a = activityFor(ev);
      return {
        title: "Aguardando aprovacao",
        detail: a.title,
        meta: a.verb,
        tone: "warn",
      };
    }
    case "halted":
      return {
        title: "Execucao interrompida",
        detail: String(ev.payload?.reason ?? ev.payload?.error ?? "Sem creditos disponiveis."),
        meta: "Erro",
        tone: "err",
      };
    case "sweep_progress": {
      const opp = String(ev.payload?.opportunity_id ?? ev.opportunity_id ?? "");
      const state = String(ev.payload?.state ?? ev.payload?.status ?? "Em andamento");
      return {
        title: "Sincronizando pipeline",
        detail: state,
        meta: opp ? opp.slice(0, 8) : "pipeline",
        tone: "muted",
      };
    }
    case "done": {
      const status = String(ev.payload?.status ?? "concluido");
      return {
        title: "Sincronizacao concluida",
        detail: status,
        meta: "done",
        tone: "ok",
      };
    }
    default:
      return {
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
  const lastLine = useMemo(() => {
    const last = events[events.length - 1];
    return last ? itemFor(last).title : "Conectando ao Copilot";
  }, [events]);

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
                <div className="mt-1 text-xs text-muted-foreground">Preparando a analise...</div>
              </div>
            )}
            {events.map((ev, i) => {
              const item = itemFor(ev);
              return (
                <div
                  key={`${ev.seq}-${i}`}
                  className={cn("mb-2 rounded-md border p-3 text-sm", toneClass[item.tone])}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 font-medium leading-snug">{item.title}</div>
                    <div
                      className={cn(
                        "shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        metaToneClass[item.tone],
                      )}
                    >
                      {item.meta}
                    </div>
                  </div>
                  <div className="mt-1 text-xs leading-relaxed opacity-80">{item.detail}</div>
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
