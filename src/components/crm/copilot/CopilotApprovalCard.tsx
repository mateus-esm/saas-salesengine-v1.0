import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, CheckCircle2, ChevronDown, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { resolveApproval } from "@/services/copilot";
import type { AiDecision } from "@/hooks/useCopilotApprovals";
import { formatCopilotActivity } from "@/lib/copilotActivity";

function formatRole(role: string | null): string {
  if (!role) return "Copilot";
  const labels: Record<string, string> = {
    tower_doorman: "Tower Doorman",
    floor_doorman: "Floor Doorman",
    worker: "Worker",
    autonomous_team: "Copilot Autônomo",
    track_shaper: "Track Shaper",
  };
  return labels[role] ?? role;
}

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
  const leadName = "este lead";
  const activity = formatCopilotActivity(decision.output_action, { leadName });
  const actionSentence = `${activity.title}?`;

  return (
    <Card className="rounded-lg border border-border bg-card">
      <CardHeader className="px-4 pb-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-start gap-2 text-sm font-semibold leading-snug text-foreground">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{actionSentence}</span>
          </CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
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
              className="border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400"
            >
              Aguardando aprovação
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 px-4 pb-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Campo</p>
            <p className="truncate font-medium text-foreground">{activity.field}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Resultado</p>
            <p className="truncate font-medium text-foreground" title={activity.result}>
              {activity.result}
            </p>
          </div>
        </div>

        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Agente
          </p>
          <p className="break-words text-xs text-muted-foreground">
            {formatRole(decision.agent_role)}
          </p>
        </div>

        {decision.reason && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Motivo
            </p>
            <p className="break-words text-xs text-muted-foreground">
              {decision.reason}
            </p>
          </div>
        )}

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              Ver detalhes
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
              {activity.technical}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      <CardFooter className="flex gap-2 px-4 pb-4 pt-0">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={() => handleResolve("reject")}
          disabled={isBusy}
        >
          <XCircle className="h-3.5 w-3.5" />
          {isRejecting ? "Rejeitando..." : "Rejeitar"}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => handleResolve("approve")}
          disabled={isBusy}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isApproving ? "Aprovando..." : "Aprovar"}
        </Button>
      </CardFooter>
    </Card>
  );
};
