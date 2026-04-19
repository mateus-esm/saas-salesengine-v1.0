import { useMemo, useState } from "react";
import { Briefcase, ChevronRight, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useOpportunities } from "@/hooks/useOpportunities";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";

interface LeadOpportunitiesSectionProps {
  leadId: string;
}

/**
 * Cross-pipeline opportunities for a single Lead. Surfaces inside the
 * LeadDetailsModal so a sales rep can see "this person is in 3 different
 * pipelines, with these stages / values".
 *
 * Plus an "Add to Pipeline" action that creates a new opportunity using the
 * pipeline's first stage (per EPIC 4 spec — kept here so the lead drawer
 * already exposes the workflow before the chat panel ships).
 */
export const LeadOpportunitiesSection = ({ leadId }: LeadOpportunitiesSectionProps) => {
  const { opportunities, isLoading, createOpportunity } = useOpportunities({ leadId });
  const { activePipelines } = usePipelines();
  const [adding, setAdding] = useState(false);
  const [draftPipelineId, setDraftPipelineId] = useState<string>("");

  const pipelineById = useMemo(
    () => new Map(activePipelines.map((p) => [p.id, p])),
    [activePipelines],
  );

  const handleAdd = async () => {
    if (!draftPipelineId) return;
    try {
      await createOpportunity.mutateAsync({
        lead_id: leadId,
        pipeline_id: draftPipelineId,
      });
      setAdding(false);
      setDraftPipelineId("");
    } catch {
      // toast handled in hook
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Oportunidades</h3>
          <Badge variant="outline" className="text-xs">
            {opportunities.length}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
          disabled={activePipelines.length === 0}
          title={
            activePipelines.length === 0
              ? "Crie uma pipeline antes de adicionar oportunidades"
              : "Adicionar a uma pipeline"
          }
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar a Pipeline
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : opportunities.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">
          Este lead ainda não está em nenhuma pipeline.
        </p>
      ) : (
        <div className="space-y-2">
          {opportunities.map((opp) => (
            <OpportunityRow
              key={opp.id}
              pipelineName={pipelineById.get(opp.pipeline_id)?.name ?? "Pipeline removida"}
              opportunity={opp}
            />
          ))}
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar a uma Pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Pipeline</Label>
              <Select value={draftPipelineId} onValueChange={setDraftPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {activePipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                A oportunidade será criada na primeira etapa da pipeline escolhida.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!draftPipelineId || createOpportunity.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────

interface OpportunityRowProps {
  pipelineName: string;
  opportunity: {
    id: string;
    pipeline_id: string;
    stage_id: string;
    value: number | null;
    currency: string;
    status: string;
  };
}

const OpportunityRow = ({ pipelineName, opportunity }: OpportunityRowProps) => {
  const { stages } = usePipelineStagesV2(opportunity.pipeline_id);
  const stage = stages.find((s) => s.id === opportunity.stage_id);

  const fmtValue =
    opportunity.value !== null
      ? opportunity.value.toLocaleString("pt-BR", {
          style: "currency",
          currency: opportunity.currency || "BRL",
        })
      : null;

  return (
    <div className="flex items-center justify-between gap-2 p-2 border border-border rounded-md bg-card hover:bg-muted/30 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{pipelineName}</span>
          {stage && (
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: stage.color, color: stage.color }}
            >
              {stage.name}
            </Badge>
          )}
          {opportunity.status !== "open" && (
            <Badge
              variant={opportunity.status === "won" ? "default" : "secondary"}
              className="text-xs"
            >
              {opportunity.status === "won" ? "Ganho" : "Perdido"}
            </Badge>
          )}
        </div>
        {fmtValue && (
          <p className="text-xs text-muted-foreground mt-0.5">{fmtValue}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
};
