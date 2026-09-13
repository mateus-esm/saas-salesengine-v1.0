// src/components/crm/copilot/SyncButton.tsx
//
// Sprint 6.1 · EPIC E · E1 — the ubiquitous ⚡ Sync button.
// Sprint 11 · Onda 6 · T61 — it only queues now.
//
// One component, three surfaces:
//   • variant="card"   — compact ⚡ icon on the Kanban card face
//   • variant="chat"   — inline ⚡ in the inbox composer (only the contact is known)
//   • variant="header" — labeled "Sincronizar Pipeline" in the pipeline header
//
// The click puts the deal — or, in the header, only the pipeline's deals with a
// new conversation — at the front of the Copilot's queue (crm_copilot_enqueue)
// and follows the jobs: a small pill says "Na fila → Lendo a conversa… → Pronto"
// (or "12 de 30"), and a toast says what the Copilot did. It used to open an SSE
// with the agent and wait for the whole pass before showing anything.
// Disabled with a tooltip when the team's "Agente de CRM" toggle is off.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useCopilotEnqueue, useCopilotJobsStatus } from "@/hooks/useCopilotJobs";
import { copilotErrorText, jobProgress, progressLabel, progressSummary } from "@/lib/copilotJobs";
import { cn } from "@/lib/utils";

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

export function SyncButton({ leadId, opportunityId, pipelineId, mode, variant = "card", className }: SyncButtonProps) {
  const { equipe } = useAuth();
  const enabled = equipe?.is_crm_agent_enabled ?? false;
  const queryClient = useQueryClient();
  const enqueue = useCopilotEnqueue();
  const [jobIds, setJobIds] = useState<string[]>([]);
  const { jobs } = useCopilotJobsStatus(jobIds);
  const progress = jobProgress(jobs, jobIds.length);
  const working = enqueue.isPending || (jobIds.length > 0 && !progress.finished);

  // Once every job ended: refresh what the Copilot may have changed, say it once.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    const key = jobIds.join(",");
    if (!key || !progress.finished || announced.current === key) return;
    announced.current = key;
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["leadActivities"] });
    void queryClient.invalidateQueries({ queryKey: ["copilot"] });
    const text = progressSummary(progress);
    if (progress.failed && !progress.done) toast.error(text);
    else toast.success(text);
  }, [jobIds, progress, queryClient]);

  const onClick = async () => {
    if (!enabled || working) return;
    try {
      const r = await enqueue.mutateAsync(mode === "sweep" ? { pipelineId } : { opportunityId, leadId });
      if (r.queued === 0) {
        toast.info("Nenhum negócio com conversa nova para ler.");
        return;
      }
      announced.current = null;
      setJobIds(r.job_ids);
    } catch (e) {
      toast.error(copilotErrorText(e instanceof Error ? e.message : String(e)));
    }
  };

  const label = variant === "header" ? "Sincronizar Pipeline" : variant === "chat" ? "Sincronizar" : undefined;
  const pill = jobIds.length > 0 ? progressLabel(progress) : "";

  const button = (
    <Button
      type="button"
      size={variant === "card" ? "icon" : "sm"}
      variant={variant === "header" ? "default" : "ghost"}
      disabled={!enabled}
      className={className}
      onClick={(e) => {
        e.stopPropagation(); // don't open the card's detail modal
        void onClick();
      }}
      aria-label="Sincronizar com o Copilot"
      aria-busy={working}
    >
      {working ? <Loader2 className={cn("h-4 w-4 animate-spin", label && "mr-1")} /> : <Zap className={cn("h-4 w-4", label && "mr-1")} />}
      {label}
    </Button>
  );

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            {enabled
              ? mode === "sweep"
                ? "O Copilot lê os negócios com conversa nova"
                : "O Copilot lê a conversa e atualiza o negócio"
              : "Ative o Agente de CRM nas configurações da equipe"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {pill && variant !== "card" && (
        <span className="whitespace-nowrap text-[11px] text-muted-foreground" aria-live="polite">
          {pill}
        </span>
      )}
    </div>
  );
}
