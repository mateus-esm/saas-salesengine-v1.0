import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { DynamicFieldRenderer, validateCustomData } from "./DynamicFieldRenderer";
import type { Opportunity, OpportunityStatus, Pipeline } from "@/types/pipelines";

interface LeadOpportunitiesSectionProps {
  leadId: string;
  /** When true, rows default to expanded so the chat panel can show detail inline. */
  defaultExpanded?: boolean;
}

/**
 * Cross-pipeline opportunities for a single Lead. Renders:
 *   • Summary row (pipeline, stage, value) — click to expand
 *   • Inline editor (DynamicFieldRenderer + stage changer + value)
 *   • "Add to Pipeline" dialog (first-stage-default)
 *
 * Used in LeadDetailsModal (CRM) and CRMContextPanel (chat).
 */
export const LeadOpportunitiesSection = ({
  leadId,
  defaultExpanded = false,
}: LeadOpportunitiesSectionProps) => {
  const { opportunities, isLoading, createOpportunity, updateOpportunity } =
    useOpportunities({ leadId });
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
              opportunity={opp}
              pipeline={pipelineById.get(opp.pipeline_id)}
              defaultExpanded={defaultExpanded}
              onUpdate={(patch) =>
                updateOpportunity.mutate({ id: opp.id, ...patch })
              }
              isSaving={updateOpportunity.isPending}
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
  opportunity: Opportunity;
  pipeline: Pipeline | undefined;
  defaultExpanded: boolean;
  isSaving: boolean;
  onUpdate: (patch: {
    stage_id?: string;
    value?: number | null;
    status?: OpportunityStatus;
    custom_data?: Record<string, unknown>;
    closed_at?: string | null;
  }) => void;
}

const OpportunityRow = ({
  opportunity,
  pipeline,
  defaultExpanded,
  isSaving,
  onUpdate,
}: OpportunityRowProps) => {
  const { stages } = usePipelineStagesV2(opportunity.pipeline_id);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const [stageId, setStageId] = useState(opportunity.stage_id);
  const [status, setStatus] = useState<OpportunityStatus>(opportunity.status);
  const [value, setValue] = useState<string>(
    opportunity.value !== null ? String(opportunity.value) : "",
  );
  const [customData, setCustomData] = useState<Record<string, unknown>>(
    opportunity.custom_data ?? {},
  );

  const schema = useMemo(
    () => (pipeline?.custom_fields_schema ?? []).filter((f) => !f.is_deleted),
    [pipeline],
  );
  const stage = stages.find((s) => s.id === opportunity.stage_id);

  const fmtValue =
    opportunity.value !== null
      ? opportunity.value.toLocaleString("pt-BR", {
          style: "currency",
          currency: opportunity.currency || "BRL",
        })
      : null;

  const dirty =
    stageId !== opportunity.stage_id ||
    status !== opportunity.status ||
    (value === "" ? null : Number(value)) !== opportunity.value ||
    JSON.stringify(customData) !== JSON.stringify(opportunity.custom_data ?? {});

  const handleSave = () => {
    const errors = validateCustomData(schema, customData);
    if (errors.length > 0) {
      toast.error(errors[0].message);
      return;
    }
    onUpdate({
      stage_id: stageId,
      status,
      value: value === "" ? null : Number(value),
      custom_data: customData,
      closed_at:
        status === "open"
          ? null
          : opportunity.closed_at ?? new Date().toISOString(),
    });
  };

  return (
    <div className="border border-border rounded-md bg-card">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 flex items-center justify-between gap-2 p-2 text-left hover:bg-muted/30 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">
                {pipeline?.name ?? "Pipeline removida"}
              </span>
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
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
        {pipeline && (
          // Sprint 4 EPIC 2 §2.3 — deep-link from a contact's opportunity
          // straight into the pipeline's Kanban with this card pre-opened.
          <Link
            to={`/crm?tab=pipeline&pipeline=${pipeline.id}&view=kanban&opp=${opportunity.id}`}
            title="Abrir no Kanban"
            className="px-2 flex items-center justify-center border-l border-border text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Etapa
              </Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Status
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as OpportunityStatus)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Aberta</SelectItem>
                  <SelectItem value="won">Ganha</SelectItem>
                  <SelectItem value="lost">Perdida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Valor (R$)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8"
                placeholder="0,00"
              />
            </div>
          </div>

          {schema.length > 0 && (
            <div className="pt-2 border-t border-border/60">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Campos personalizados
              </p>
              <DynamicFieldRenderer
                schema={schema}
                value={customData}
                onChange={setCustomData}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={!dirty || isSaving}>
              <Save className="h-3.5 w-3.5 mr-1" /> Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
