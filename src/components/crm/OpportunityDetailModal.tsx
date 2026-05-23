import { useEffect, useMemo, useState } from "react";
import { Trash2, Building2, Home, Settings2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  const hasCustomFields = schema.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Sprint 5.5 polish #2 — modal restructured into tabs (Dados / Vínculos)
          so the vertical scroll surface is cut in half. Tighter header with
          chips inline, lighter dividers, consistent spacing. */}
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 space-y-3">
          <div className="space-y-1">
            <DialogTitle className="text-base font-semibold leading-tight">
              {lead?.name ?? "Lead"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              em <span className="font-medium text-foreground/70">{pipeline?.name ?? "Pipeline"}</span>
            </p>
          </div>
          <EntityChips
            opportunityId={opportunity.id}
            primaryContact={lead}
            onOpenContact={(contactId) => {
              onClose();
              onOpenContact?.(contactId);
            }}
          />
        </DialogHeader>

        <Tabs defaultValue="dados" className="flex-1 min-h-0 flex flex-col">
          <div className="px-5 border-b border-border/60">
            <TabsList className="bg-transparent p-0 h-auto gap-1">
              <TabsTrigger
                value="dados"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-2 text-xs gap-1.5"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Dados
              </TabsTrigger>
              <TabsTrigger
                value="empresas"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-2 text-xs gap-1.5"
              >
                <Building2 className="h-3.5 w-3.5" />
                Empresas
              </TabsTrigger>
              <TabsTrigger
                value="imoveis"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-2 text-xs gap-1.5"
              >
                <Home className="h-3.5 w-3.5" />
                Imóveis
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dados" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full">
              <div className="px-5 py-4 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Etapa</Label>
                    <Select value={stageId} onValueChange={setStageId}>
                      <SelectTrigger className="h-9">
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
                    <Label className="text-xs">Status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as OpportunityStatus)}>
                      <SelectTrigger className="h-9">
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
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="0,00"
                      className="h-9 font-mono"
                    />
                  </div>
                </div>

                {hasCustomFields && (
                  <div className="space-y-3">
                    <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      Campos personalizados
                    </h4>
                    <DynamicFieldRenderer schema={schema} value={customData} onChange={setCustomData} />
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="empresas" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full">
              <div className="px-5 py-4">
                <CompanySection mode={{ kind: "opportunity", opportunityId: opportunity.id }} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="imoveis" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full">
              <div className="px-5 py-4">
                <PropertySection mode={{ kind: "opportunity", opportunityId: opportunity.id }} />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center sm:justify-between gap-2 px-5 py-3 border-t border-border/60 bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateOpportunity.isPending}
              className="h-8 bg-gradient-to-r from-solo-orange to-solo-yellow hover:from-solo-orange/90 hover:to-solo-yellow/90 text-white border-0 shadow-sm"
            >
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
