// src/components/crm/copilot/CopilotApprovalsPanel.tsx
//
// Sprint 6 · EPIC F · F4 — approval queue of the active pipeline.
//
// SE-COPILOT-002 — the panel stopped being a wall of cards that vanished
// without a word. It now reads exactly like the home queue (CopilotApprovals),
// fed by this pipeline's `ai_decisions` rows (useCopilotApprovals) through the
// single translation layer in lib/copilotApprovals: what the Copilot wants to
// do, in which deal, with what confidence, why it is waiting and in what state.
// Loading, error and empty are visible instead of a silent `null`.
//
// The individual Aprovar/Recusar flow is the one it always had — one
// `resolveApproval` call per decision, one toast, cache refreshed. The bulk
// buttons fire N of those calls in parallel and report a single summary.
//
// Mounted in three different containers: the full-width banner above the
// workspace tabs ("banner"), the pipeline's "Aprovações" accordion and the
// settings sheet ("inline" — the container already draws the card).

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useCopilotApprovals } from "@/hooks/useCopilotApprovals";
import {
  actionableDecisions,
  decisionToQueueItem,
  summarizeResolveOutcomes,
} from "@/lib/copilotApprovals";
import { bulkResolveText } from "@/lib/copilotFeed";
import { cn } from "@/lib/utils";
import { resolveApproval } from "@/services/copilot";

import { CopilotApprovals } from "./CopilotApprovals";

interface CopilotApprovalsPanelProps {
  pipelineId: string;
  /**
   * "banner" — the full-width strip above the workspace tabs, which draws its
   * own frame. "inline" — the accordion and the sheet, where the container
   * already draws the card.
   */
  variant?: "banner" | "inline";
}

export const CopilotApprovalsPanel = ({
  pipelineId,
  variant = "banner",
}: CopilotApprovalsPanelProps) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const { data: decisions, isLoading, isError, refetch } = useCopilotApprovals(pipelineId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isResolvingMany, setIsResolvingMany] = useState(false);

  const items = useMemo(
    () => actionableDecisions(decisions).map(decisionToQueueItem),
    [decisions],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["copilot", "approvals", pipelineId] });
    if (equipeId) {
      void queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
    }
  }, [queryClient, pipelineId, equipeId]);

  const handleResolve = useCallback(
    async (id: string, approve: boolean) => {
      setBusyId(id);
      try {
        await resolveApproval(id, approve ? "approve" : "reject");
        refresh();
        toast.success(approve ? "Ação aprovada com sucesso." : "Ação rejeitada.");
      } catch (err) {
        toast.error(
          `Erro ao ${approve ? "aprovar" : "rejeitar"}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  /**
   * One `resolveApproval` call per selected decision, in parallel, and a single
   * sentence about the round — never a toast per item. A call that rejects is
   * one error among N and never takes the rest of the batch down.
   */
  const handleResolveMany = useCallback(
    async (ids: string[], approve: boolean) => {
      if (ids.length === 0) return;
      setIsResolvingMany(true);
      try {
        const outcomes = await Promise.allSettled(
          ids.map((id) => resolveApproval(id, approve ? "approve" : "reject")),
        );
        const { tone, text } = bulkResolveText(approve, summarizeResolveOutcomes(outcomes));
        if (tone === "success") toast.success(text);
        else if (tone === "warning") toast.warning(text);
        else toast.error(text);
        refresh();
      } finally {
        setIsResolvingMany(false);
      }
    },
    [refresh],
  );

  const frame = variant === "banner" ? "border-b border-border px-4 py-3" : "";
  const inner = variant === "banner" ? "mx-auto max-w-5xl space-y-3" : "space-y-3";

  if (isLoading) {
    return (
      <div className={cn(frame, variant === "banner" && "bg-muted/20")}>
        <div className={inner} aria-busy="true" aria-label="Carregando sugestões do Copilot">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            Carregando as sugestões do Copilot…
          </p>
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn(frame, variant === "banner" && "bg-muted/20")}>
        <div className={inner}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Não consegui carregar as sugestões do Copilot.</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              onClick={() => void refetch()}
            >
              Tentar de novo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn(frame, variant === "banner" && "bg-muted/20")}>
        <div className={inner}>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5 shrink-0" />
            Nada esperando por você.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(frame, "bg-amber-50/40 dark:bg-amber-900/10")}>
      <div className={inner}>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Copilot — {items.length} ação{items.length > 1 ? "ões" : ""} aguardando aprovação
          </p>
        </div>

        <CopilotApprovals
          items={items}
          busyId={busyId}
          onResolve={handleResolve}
          onResolveMany={handleResolveMany}
          isResolvingMany={isResolvingMany}
        />
      </div>
    </div>
  );
};
