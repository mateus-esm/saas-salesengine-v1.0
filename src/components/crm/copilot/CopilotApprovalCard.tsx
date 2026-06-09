// src/components/crm/copilot/CopilotApprovalCard.tsx
//
// Sprint 6 · EPIC F · F4 — Single approval decision card
//
// Renders one `ai_decisions` row with `status = 'pending_approval'`.
// Approve/Reject call `copilot.resolveApproval` and then invalidate:
//   • ["copilot", "approvals", pipelineId]  — removes this card from the list
//   • ["opportunities", equipeId]            — refreshes Kanban if the action
//                                              moved a stage
//
// Each button tracks its own loading state so the two can't race.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { resolveApproval } from "@/services/copilot";
import type { AiDecision } from "@/hooks/useCopilotApprovals";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats the `output_action` JSONB value into a human-readable string.
 * Falls back to a JSON dump when the shape is unexpected.
 */
function formatAction(action: unknown): string {
  if (!action || typeof action !== "object") return String(action ?? "—");
  const a = action as Record<string, unknown>;

  // Core-Table Skill verbs (§P4)
  if (typeof a.action === "string") {
    switch (a.action) {
      case "move_stage":
        return `Mover para etapa${a.stage_name_hint ? ` "${a.stage_name_hint}"` : ""} (${a.stage_type ?? "open"})`;
      case "set_status":
        return `Definir status → ${a.status}`;
      case "set_field":
        return `Definir campo [${a.field_id}] = ${JSON.stringify(a.value)}`;
      case "set_contact_field":
        return `Definir campo do contato [${a.key}] = ${JSON.stringify(a.value)}`;
      case "add_touchpoint":
        return `Adicionar touchpoint (${a.touchpoint_type}): ${a.content_template}`;
      case "add_note":
        return `Adicionar nota: ${a.content_template}`;
      case "create_task":
        return `Criar tarefa: ${a.title_template}`;
      case "add_tag":
        return `Adicionar tag: ${a.tag}`;
      case "trigger_webhook":
        return `Disparar webhook: ${a.url}`;
      default:
        break;
    }
  }

  return JSON.stringify(action);
}

/**
 * Maps an `agent_role` string to a readable label.
 */
function formatRole(role: string | null): string {
  if (!role) return "Copilot";
  const labels: Record<string, string> = {
    tower_doorman: "Tower Doorman",
    floor_doorman: "Floor Doorman",
    worker: "Worker",
    autonomous_team: "Agente Autônomo",
    track_shaper: "Track Shaper",
  };
  return labels[role] ?? role;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CopilotApprovalCardProps {
  decision: AiDecision;
  pipelineId: string;
}

export const CopilotApprovalCard = ({
  decision,
  pipelineId,
}: CopilotApprovalCardProps) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const isApproving = approvingId === decision.id;
  const isRejecting = rejectingId === decision.id;
  const isBusy = isApproving || isRejecting;

  const handleResolve = async (action: "approve" | "reject") => {
    if (action === "approve") setApprovingId(decision.id);
    else setRejectingId(decision.id);

    try {
      await resolveApproval(decision.id, action);

      // Invalidate the approvals list (card disappears) and the opportunity
      // cache so the Kanban refreshes if the action moved a stage.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["copilot", "approvals", pipelineId],
        }),
        equipeId
          ? queryClient.invalidateQueries({
              queryKey: ["opportunities", equipeId],
            })
          : Promise.resolve(),
      ]);

      toast.success(
        action === "approve"
          ? "Ação aprovada com sucesso."
          : "Ação rejeitada.",
      );
    } catch (err) {
      toast.error(
        `Erro ao ${action === "approve" ? "aprovar" : "rejeitar"}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setApprovingId(null);
      setRejectingId(null);
    }
  };

  const confidencePct =
    decision.confidence_score != null
      ? `${Math.round(decision.confidence_score * 100)}%`
      : null;

  return (
    <Card className="rounded-lg border border-border bg-card">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary shrink-0" />
            {formatRole(decision.agent_role)}
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            {confidencePct && (
              <Badge
                variant="outline"
                className="text-[10px] font-mono text-muted-foreground"
              >
                {confidencePct}
              </Badge>
            )}
            <Badge
              variant="secondary"
              className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30"
            >
              Aguardando aprovação
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-2">
        {/* Action */}
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            Ação proposta
          </p>
          <p className="text-sm text-foreground font-medium break-words">
            {formatAction(decision.output_action)}
          </p>
        </div>

        {/* Reason */}
        {decision.reason && (
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Motivo
            </p>
            <p className="text-xs text-muted-foreground break-words">
              {decision.reason}
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="px-4 pb-4 pt-0 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => handleResolve("reject")}
          disabled={isBusy}
        >
          <XCircle className="h-3.5 w-3.5" />
          {isRejecting ? "Rejeitando…" : "Rejeitar"}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => handleResolve("approve")}
          disabled={isBusy}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isApproving ? "Aprovando…" : "Aprovar"}
        </Button>
      </CardFooter>
    </Card>
  );
};
