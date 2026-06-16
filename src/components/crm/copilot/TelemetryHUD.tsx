// src/components/crm/copilot/TelemetryHUD.tsx
//
// Sprint 6.1 · EPIC D · D4 — live cognition HUD.
//
// Renders the streamed HudEvent[] as a cockpit-style executive log instead of a
// generic spinner. Shared by single sync (SSE via useCopilotSync) and the global
// sweep (Realtime via useCopilotSweep) — both produce the same HudEvent[] shape.

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { HudEvent } from "@/hooks/useCopilotSync";

interface TelemetryHUDProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: HudEvent[];
  running: boolean;
  title?: string;
}

function verbOf(ev: HudEvent): string {
  return String(ev.payload?.verb ?? "");
}

/** Map a structured event to a human cockpit log line. */
function lineFor(ev: HudEvent): { text: string; tone: "info" | "ok" | "err" | "warn" | "muted" } {
  switch (ev.kind) {
    case "action_start":
      return { text: `Executando ${verbOf(ev)}…`, tone: "info" };
    case "action_done":
      return ev.payload?.ok
        ? { text: `✓ ${verbOf(ev)}`, tone: "ok" }
        : { text: `✗ ${verbOf(ev)}: ${String(ev.payload?.error ?? "falhou")}`, tone: "err" };
    case "awaiting_confirmation":
      return { text: `⏸ Aguardando aprovação: ${verbOf(ev)}`, tone: "warn" };
    case "halted":
      return { text: "⛔ Sem créditos — execução interrompida", tone: "err" };
    case "sweep_progress": {
      const opp = String(ev.payload?.opportunity_id ?? "");
      const state = String(ev.payload?.state ?? "");
      return { text: `↻ Oportunidade ${opp.slice(0, 8)} — ${state}`, tone: "muted" };
    }
    case "done": {
      const status = String(ev.payload?.status ?? "concluído");
      return { text: `Concluído (${status})`, tone: "ok" };
    }
    default:
      return { text: `${ev.kind}`, tone: "muted" };
  }
}

const toneClass: Record<string, string> = {
  info: "text-sky-300",
  ok: "text-emerald-300",
  err: "text-red-300",
  warn: "text-amber-300",
  muted: "text-zinc-400",
};

export function TelemetryHUD({
  open,
  onOpenChange,
  events,
  running,
  title = "Telemetria do Copilot",
}: TelemetryHUDProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            {title}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-72 rounded-md bg-zinc-950 p-3 font-mono text-xs">
          {events.length === 0 && (
            <p className="text-zinc-500">Aguardando o motor cognitivo…</p>
          )}
          {events.map((ev, i) => {
            const { text, tone } = lineFor(ev);
            return (
              <div key={`${ev.seq}-${i}`} className={toneClass[tone]}>
                <span className="text-zinc-600">{String(ev.seq).padStart(2, "0")} </span>
                {text}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
