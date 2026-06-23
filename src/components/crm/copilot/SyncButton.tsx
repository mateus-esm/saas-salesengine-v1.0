// src/components/crm/copilot/SyncButton.tsx
//
// Sprint 6.1 · EPIC E · E1 — the ubiquitous ⚡ Sync button.
// Sprint 6.8 · Task 2.4 — non-blocking readable live sync via CopilotThinkingBadge.
//
// One component, three surfaces:
//   • variant="card"   — compact ⚡ icon on the Kanban card face
//   • variant="chat"   — inline ⚡ in the inbox composer
//   • variant="header" — labeled "Sincronizar Pipeline" (sweep) in the pipeline header
//
// mode="single" runs one lead/opportunity via SSE (useCopilotSync); mode="sweep"
// runs the whole pipeline via Realtime (useCopilotSweep) immediately (no
// confirmation — the CopilotThinkingBadge appears with "Analisando..." within
// 300 ms). The badge is the primary live sync indicator; the TelemetryHUD Sheet
// is accessible via "Ver detalhes técnicos" inside the badge's popover.
// The button is disabled with a tooltip when the team's "Agente de CRM"
// (is_crm_agent_enabled) toggle is off.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useCopilotSync, type HudEvent } from "@/hooks/useCopilotSync";
import { useCopilotSweep } from "@/hooks/useCopilotSweep";
import { TelemetryHUD } from "@/components/crm/copilot/TelemetryHUD";
import { CopilotThinkingBadge } from "@/components/crm/copilot/CopilotThinkingBadge";

export interface SyncButtonProps {
  leadId?: string;
  opportunityId?: string;
  pipelineId?: string;
  mode: "single" | "sweep";
  variant?: "card" | "chat" | "header";
  /** Estimated open-opportunity count. (deprecated — no longer used) */
  sweepEstimate?: number;
  className?: string;
}

export function SyncButton({
  leadId,
  opportunityId,
  pipelineId,
  mode,
  variant = "card",
  className,
}: SyncButtonProps) {
  const { equipe } = useAuth();
  const enabled = equipe?.is_crm_agent_enabled ?? false;
  const queryClient = useQueryClient();

  const single = useCopilotSync();
  const sweepHook = useCopilotSweep();
  const [hudOpen, setHudOpen] = useState(false);

  const events: HudEvent[] = mode === "sweep" ? sweepHook.events : single.events;
  const running = mode === "sweep" ? sweepHook.running : single.running;
  const error = mode === "sweep" ? sweepHook.error : single.error;

  // Invalidate the live data the run may have changed, once it's done.
  // hasToasted ensures the completion toast fires exactly once per run.
  const lastSeen = useRef(0);
  const hasToasted = useRef(false);
  useEffect(() => {
    if (events.length === lastSeen.current) return;
    lastSeen.current = events.length;
    const done = events.some((e) => e.kind === "done");
    if (done) {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["leadActivities"] });
      queryClient.invalidateQueries({ queryKey: ["copilot", "credits"] });
      if (!hasToasted.current) {
        hasToasted.current = true;
        toast.success("✓ Copilot concluiu as atualizações.");
      }
    }
  }, [events, queryClient]);

  const lastError = useRef<string | null>(null);
  useEffect(() => {
    if (!error || error === lastError.current) return;
    lastError.current = error;
    toast.error(error);
  }, [error]);

  const runSingle = () => {
    if (!leadId) return;
    hasToasted.current = false; // reset so the next run can toast again
    // useCopilotSync expects snake_case query keys.
    void single.start({
      lead_id: leadId,
      opportunity_id: opportunityId,
      pipeline_id: pipelineId,
    });
  };

  const runSweep = () => {
    if (!pipelineId) return;
    hasToasted.current = false;
    void sweepHook.start(pipelineId);
  };

  const onClick = () => {
    if (!enabled) return;
    if (mode === "sweep") runSweep();
    else runSingle();
  };

  const label =
    variant === "header" ? "Sincronizar Pipeline" : variant === "chat" ? "Sincronizar" : undefined;

  const button = (
    <Button
      type="button"
      size={variant === "card" ? "icon" : "sm"}
      variant={variant === "header" ? "default" : "ghost"}
      disabled={!enabled}
      className={className}
      onClick={(e) => {
        e.stopPropagation(); // don't open the card's detail modal
        onClick();
      }}
      aria-label="Sincronizar com o Copilot"
    >
      <Zap className={label ? "mr-1 h-4 w-4" : "h-4 w-4"} />
      {label}
    </Button>
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent>
              {enabled
                ? "Avaliar e atualizar com o Copilot"
                : "Ative o Agente de CRM nas configurações da equipe"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <CopilotThinkingBadge
          events={events}
          running={running}
          onShowDetails={() => setHudOpen(true)}
        />
      </div>

      <TelemetryHUD
        open={hudOpen}
        onOpenChange={setHudOpen}
        events={events}
        running={running}
        title={mode === "sweep" ? "Sweep do Pipeline" : "Telemetria do Copilot"}
      />
    </>
  );
}
