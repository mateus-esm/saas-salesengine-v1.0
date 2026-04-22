import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

import { DynamicFieldRenderer, validateCustomData } from "./DynamicFieldRenderer";
import { EntityChips } from "./EntityChips";
import { CompanySection } from "./companies/CompanySection";
import { PropertySection } from "./properties/PropertySection";
import type { Lead } from "@/types/crm";
import type {
  Opportunity,
  OpportunityStatus,
  Pipeline,
  PipelineStageV2,
} from "@/types/pipelines";
import { useOpportunities } from "@/hooks/useOpportunities";

interface OpportunityDetailModalProps {
  open: boolean;
  opportunity: Opportunity | null;
  pipeline: Pipeline | undefined;
  stages: PipelineStageV2[];
  lead: Lead | undefined;
  onClose: () => void;
  /**
   * Sprint 4 EPIC 2 §2.3 — bidirectional chip navigation. When the Contact
   * chip is clicked we ask the parent to swap this drawer for the contact
   * drawer. The parent owns both drawers so neither leaks state across pipelines.
   */
  onOpenContact?: (contactId: string) => void;
}

/**
 * Opportunity editor invoked from Kanban card click or Table row click.
 * Renders custom fields via `DynamicFieldRenderer` against the pipeline schema,
 * so Lead A can have completely different data in Pipeline X vs Pipeline Y.
 */
export const OpportunityDetailModal = ({
  open,
  opportunity,
  pipeline,
  stages,
  lead,
  onClose,
  onOpenContact,
}: OpportunityDetailModalProps) => {
  const { updateOpportunity, deleteOpportunity } = useOpportunities({
    pipelineId: opportunity?.pipeline_id,
  });

  const [stageId, setStageId] = useState<string>("");
  const [status, setStatus] = useState<OpportunityStatus>("open");
  const [value, setValue] = useState<string>("");
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!opportunity) return;
    setStageId(opportunity.stage_id);
    setStatus(opportunity.status);
    setValue(opportunity.value != null ? String(opportunity.value) : "");
    setCustomData(opportunity.custom_data ?? {});
  }, [opportunity]);

  const schema = useMemo(
    () => (pipeline?.custom_fields_schema ?? []).filter((f) => !f.is_deleted),
    [pipeline],
  );

  if (!opportunity) return null;

  const handleSave = () => {
    const errors = validateCustomData(schema, customData);
    if (errors.length > 0) {
      toast.error(errors[0].message);
      return;
    }
    updateOpportunity.mutate({
      id: opportunity.id,
      stage_id: stageId,
      status,
      value: value === "" ? null : Number(value),
      custom_data: customData,
      // Stage type `won`/`lost` sets closed_at; `open` clears it. (Matches sprint state machine:
      // status is explicit, but closing the deal should persist the timestamp.)
      closed_at:
        status === "open"
          ? null
          : opportunity.closed_at ?? new Date().toISOString(),
    });
    onClose();
  };

  const handleDelete = () => {
    if (!confirm("Excluir este lead?")) return;
    deleteOpportunity.mutate(opportunity.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {lead?.name ?? "Lead"} · {pipeline?.name ?? "Pipeline"}
          </DialogTitle>
          <DialogDescription>
            Editar dados específicos deste lead. Dados do contato são compartilhados entre pipelines.
          </DialogDescription>
          <div className="pt-2">
            <EntityChips
              opportunityId={opportunity.id}
              primaryContact={lead}
              onOpenContact={(contactId) => {
                onClose();
                onOpenContact?.(contactId);
              }}
            />
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger>
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

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as OpportunityStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberta</SelectItem>
                    <SelectItem value="won">Ganha</SelectItem>
                    <SelectItem value="lost">Perdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-border">
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                Campos personalizados
              </h4>
              <DynamicFieldRenderer schema={schema} value={customData} onChange={setCustomData} />
            </div>

            {/* Sprint 4 EPIC 4 — secondary attachments (companies, properties) */}
            <div className="pt-3 border-t border-border">
              <CompanySection mode={{ kind: "opportunity", opportunityId: opportunity.id }} />
            </div>
            <div className="pt-3 border-t border-border">
              <PropertySection mode={{ kind: "opportunity", opportunityId: opportunity.id }} />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center sm:justify-between gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1.5" />
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateOpportunity.isPending}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
