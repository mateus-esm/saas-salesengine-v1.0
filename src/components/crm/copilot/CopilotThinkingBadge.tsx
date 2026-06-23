// src/components/crm/copilot/CopilotThinkingBadge.tsx
//
// Sprint 6.8 W2 Task 2.3 -- Thinking Badge.
// Elegant live pill showing the copilot's current activity while running,
// with expand-to-detail capability via a non-blocking Popover.

import { useMemo, useState } from "react";
import { ChevronDown, Brain } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { humanizeEvent } from "./humanizeEvent";
import type { HudEvent } from "@/hooks/useCopilotSync";

export interface CopilotThinkingBadgeProps {
  events: HudEvent[];
  running: boolean;
}

export function CopilotThinkingBadge({
  events,
  running,
}: CopilotThinkingBadgeProps): JSX.Element | null {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  // Filter events through humanizeEvent, skipping suppressed ones.
  const visibleEvents = useMemo(() => {
    return events
      .map((ev) => ({ raw: ev, humanized: humanizeEvent({ type: ev.kind, payload: ev.payload }) }))
      .filter((e) => e.humanized !== null) as {
      raw: HudEvent;
      humanized: { text: string; technical: string };
    }[];
  }, [events]);

  const latestText = visibleEvents.length > 0
    ? visibleEvents[visibleEvents.length - 1].humanized.text
    : null;

  // State 1: Not running + no events → render nothing.
  if (!running && visibleEvents.length === 0) {
    return null;
  }

  const isActive = running;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border py-1 pl-2 pr-3 text-xs transition-colors",
            "border-border bg-background hover:bg-muted/60",
            isActive && "border-primary/30",
          )}
          aria-label={
            isActive
              ? "Copilot em execucao — clique para ver detalhes"
              : "Historico do Copilot — clique para ver detalhes"
          }
        >
          {/* Pulse dot */}
          <span
            className={cn(
              "relative flex h-2 w-2 shrink-0",
              isActive && "animate-pulse-dot",
            )}
          >
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                isActive
                  ? "bg-primary"
                  : "bg-muted-foreground/40",
              )}
            />
          </span>

          {/* Label */}
          <span className="truncate text-muted-foreground">
            {isActive && !latestText
              ? "Analisando..."
              : latestText ?? ""}
          </span>

          {!isActive && (
            <Brain className="ml-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-80 p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Brain className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-medium">
            {isActive ? "Atividade do Copilot" : "Historico do Copilot"}
          </span>
          {isActive && (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary" />
              Em execucao
            </span>
          )}
        </div>

        {visibleEvents.length === 0 && isActive && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            <p>Aguardando eventos do Copilot...</p>
          </div>
        )}

        {visibleEvents.length > 0 && (
          <ScrollArea className="max-h-64">
            <ul className="divide-y divide-border/50 px-4 py-2">
              {visibleEvents.map((e, i) => {
                const isLatest = i === visibleEvents.length - 1;
                return (
                  <li
                    key={`${e.raw.seq}-${i}`}
                    className={cn(
                      "py-2 text-xs leading-snug text-muted-foreground",
                      isLatest && "font-medium text-foreground",
                    )}
                  >
                    {e.humanized.text}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}

        {/* Ver detalhes tecnicos collapsible */}
        {visibleEvents.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <Collapsible open={techOpen} onOpenChange={setTechOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      techOpen && "rotate-180",
                    )}
                  />
                  ver detalhes tecnicos
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-[10px] leading-relaxed text-muted-foreground">
                  {visibleEvents.map((e) => e.humanized.technical).join("\n---\n")}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
