import { useEffect, useMemo, useState } from "react";
import { Trash2, MessageCircle, Mail, Sparkles, ChevronDown, Link2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";

import { DynamicFieldRenderer, validateCustomData } from "./DynamicFieldRenderer";
import { EntityChips } from "./EntityChips";
import { CompanySection } from "./companies/CompanySection";
import { PropertySection } from "./properties/PropertySection";
import { TouchpointsList } from "./TouchpointsList";
import { formatDisplayName, formatBrPhone } from "@/lib/displayName";
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
 *
 * Sprint 5.1 EPIC 5 §5.1 — Painel Bi-Partilhado. The drawer is split 60/40:
 * the left pane (`col-span-3`) is the live timeline (touchpoints / notes /
 * WhatsApp), the right pane (`col-span-2`) carries the connected Identity on
 * top and the Opportunity engineering controls below. Each pane scrolls
 * independently so the seller absorbs context on the left while editing on the
 * right without losing position.
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
      {/* Sprint 5.1 EPIC 5 §5.1 — bi-partilhado 60/40 split with two independent
          scroll surfaces. Left = live timeline, right = identity + engineering. */}
      <DialogContent className="max-w-5xl w-[min(96vw,1100px)] h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 space-y-3 border-b border-border/60 shrink-0">
          <div className="space-y-1">
            <DialogTitle className="text-base font-semibold leading-tight">
              {formatDisplayName(lead?.name, lead?.phone, "[Novo Contato - WhatsApp]")}
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

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-border/60">
          {/* ── Left 60% — A Linha do Tempo Viva ───────────────────────── */}
          <div className="lg:col-span-3 min-h-0 flex flex-col">
            <div className="px-5 pt-4 pb-2 shrink-0">
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Linha do tempo
              </h4>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-5 pb-5">
                {lead?.id ? (
                  <TouchpointsList leadId={lead.id} />
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Sem contato vinculado a esta oportunidade.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* ── Right 40% — O Bloco de Engenharia de Dados ─────────────── */}
          <div className="lg:col-span-2 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-5 space-y-6">
                <IdentityBlock lead={lead} />

                {/* Opportunity engineering — moved verbatim from the old Dados tab */}
                <section className="space-y-3">
                  <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    Oportunidade
                  </h4>
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
                    <div className="space-y-3 pt-1">
                      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                        Campos personalizados
                      </h4>
                      <DynamicFieldRenderer schema={schema} value={customData} onChange={setCustomData} />
                    </div>
                  )}
                </section>

                {/* Vínculos — Empresas e Imóveis, collapsed to keep the pane clean */}
                <Collapsible className="border-t border-border/60 pt-3">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors">
                    <span className="flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5" />
                      Vínculos (Empresas e Imóveis)
                    </span>
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4 space-y-5">
                    <CompanySection mode={{ kind: "opportunity", opportunityId: opportunity.id }} />
                    <PropertySection mode={{ kind: "opportunity", opportunityId: opportunity.id }} />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="flex items-center sm:justify-between gap-2 px-5 py-3 border-t border-border/60 bg-muted/30 shrink-0">
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

/**
 * Sprint 5.1 §5.1 — right-pane top: the connected Identity. Masked name,
 * WhatsApp shortcut, email and a compact AI-enrichment chip row.
 */
const ENRICHMENT_LABELS: { key: string; label: string }[] = [
  { key: "job_title", label: "" }, // value used directly
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "instagram_url", label: "Instagram" },
  { key: "company", label: "" },
  { key: "birthday", label: "Aniversário" },
];

const summarizeEnrichment = (data: Record<string, unknown> | null | undefined): string[] => {
  if (!data) return [];
  const chips: string[] = [];
  for (const { key, label } of ENRICHMENT_LABELS) {
    const raw = data[key];
    if (typeof raw === "string" && raw.trim()) {
      chips.push(label || raw.trim());
    }
  }
  return chips.slice(0, 4);
};

function IdentityBlock({ lead }: { lead: Lead | undefined }) {
  if (!lead) return null;

  const waDigits = lead.phone ? lead.phone.replace(/\D/g, "").replace(/^(?!55)/, "55$&") : null;
  const enrichment = summarizeEnrichment(lead.personal_custom_data);

  return (
    <section className="space-y-3">
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        Identidade Conectada
      </h4>
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
        <p className="text-sm font-semibold leading-tight">
          {formatDisplayName(lead.name, lead.phone, "[Novo Contato - WhatsApp]")}
        </p>

        {lead.phone && waDigits && (
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 hover:underline"
            title="Abrir no WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0" />
            {formatBrPhone(lead.phone) ?? lead.phone}
          </a>
        )}

        {lead.email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}

        {enrichment.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {enrichment.map((chip) => (
              <Badge key={chip} variant="outline" className="text-[10px] gap-1 font-normal">
                <Sparkles className="h-2.5 w-2.5 shrink-0" />
                {chip}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
