import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as copilot from "@/services/copilot";
import { Trash2, MessageCircle, MessageSquareText, Mail, Sparkles, ChevronDown, Link2, Calendar as CalendarIcon, Plus, Loader2, Phone, History, Bot } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTasks } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

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
import { PaddleShifterNav } from "./PaddleShifterNav";
import { useSiblingNavigation } from "@/hooks/useSiblingNavigation";
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
  /**
   * Sprint 5.1 §5.2 — Paddle shifters. The parent passes the ordered list of
   * opportunities in the same column/view the user sees, plus a navigate
   * callback that swaps `opportunity` in place without closing the drawer.
   */
  siblings?: Opportunity[];
  onNavigate?: (opportunityId: string) => void;
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
  siblings,
  onNavigate,
}: OpportunityDetailModalProps) => {
  const { updateOpportunity, deleteOpportunity } = useOpportunities({
    pipelineId: opportunity?.pipeline_id,
  });

  const queryClient = useQueryClient();
  const { profile, equipe } = useAuth();
  const equipeId = profile?.equipe_id;
  // "Agente de CRM" toggle (equipes.is_crm_agent_enabled): the ⚡ Sync button
  // only appears for niches/teams that have the CRM agent enabled.
  const crmAgentEnabled = equipe?.is_crm_agent_enabled ?? false;

  const [stageId, setStageId] = useState<string>("");
  const [syncLoading, setSyncLoading] = useState(false);
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

  // Sprint 5.1 §5.2 — paddle-shifter navigation across the parent's ordered list.
  const { prevId, nextId, canPrev, canNext, indexLabel } = useSiblingNavigation(
    siblings ?? [],
    opportunity?.id ?? null,
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

  const handleSync = async () => {
    if (!opportunity.lead_id) {
      toast.error("Esta oportunidade não tem lead vinculado.");
      return;
    }
    setSyncLoading(true);
    try {
      await copilot.syncOpportunity({
        lead_id: opportunity.lead_id,
        opportunity_id: opportunity.id,
        pipeline_id: opportunity.pipeline_id,
      });
      toast.success("Copilot sincronizou o card");
      queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sincronizar com o Copilot");
    } finally {
      setSyncLoading(false);
    }
  };

  const hasCustomFields = schema.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Sprint 5.1 EPIC 5 §5.1 — bi-partilhado 60/40 split with two independent
          scroll surfaces. Left = live timeline, right = identity + engineering. */}
      <DialogContent className="max-w-5xl w-[min(96vw,1100px)] h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 space-y-3 border-b border-border/60 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">
                {formatDisplayName(lead?.name, lead?.phone, "[Novo Contato - WhatsApp]")}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                em <span className="font-medium text-foreground/70">{pipeline?.name ?? "Pipeline"}</span>
              </p>
            </div>
            {siblings && siblings.length > 1 && (
              <div className="shrink-0 mr-7">
                <PaddleShifterNav
                  canPrev={canPrev}
                  canNext={canNext}
                  onPrev={() => prevId && onNavigate?.(prevId)}
                  onNext={() => nextId && onNavigate?.(nextId)}
                  label={indexLabel}
                />
              </div>
            )}
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
          {/* ── Left col-span-2: Dados da Oportunidade ────────────────── */}
          <div className="lg:col-span-2 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-5 space-y-6">
                <IdentityBlock lead={lead} />

                {/* Opportunity engineering */}
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

                {/* Vínculos — Empresas e Imóveis, collapsed */}
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

          {/* ── Center col-span-2: Notas e Tarefas ─────────────────────── */}
          <div className="lg:col-span-2 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-5">
                <Tabs defaultValue="notes" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="notes">Notas</TabsTrigger>
                    <TabsTrigger value="tasks">Tarefas</TabsTrigger>
                  </TabsList>

                  <TabsContent value="notes" className="pt-3">
                    {lead?.id ? (
                      <TouchpointsList leadId={lead.id} />
                    ) : (
                      <p className="text-xs text-muted-foreground italic text-center py-4">
                        Sem contato vinculado para ver notas.
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="tasks" className="pt-3">
                    {lead?.id ? (
                      <TasksTabPane leadId={lead.id} />
                    ) : (
                      <p className="text-xs text-muted-foreground italic text-center py-4">
                        Sem contato vinculado para ver tarefas.
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </div>

          {/* ── Right col-span-1: Rail de Contexto ─────────────────────── */}
          <div className="lg:col-span-1 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-3 space-y-1.5">
                {/* Touchpoints */}
                <Collapsible>
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                    <span className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      Touchpoints
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-2 pb-2">
                    {lead?.id ? (
                      <TouchpointsList leadId={lead.id} />
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic py-2">
                        Sem contato vinculado.
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Histórico */}
                <Collapsible>
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                    <span className="flex items-center gap-2">
                      <History className="h-3.5 w-3.5 shrink-0" />
                      Histórico
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-2 pb-2 space-y-1.5">
                    <StageHistoryDisplay opportunity={opportunity} stages={stages} />
                  </CollapsibleContent>
                </Collapsible>

                {/* Agenda do card */}
                <Collapsible>
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                    <span className="flex items-center gap-2">
                      <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                      Agenda do card
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-2 pb-2">
                    <p className="text-[11px] text-muted-foreground italic py-2">
                      Agenda em breve
                    </p>
                  </CollapsibleContent>
                </Collapsible>

                {/* Decisões do Copilot */}
                <Collapsible>
                  <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                    <span className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 shrink-0" />
                      Decisões do Copilot
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-2 pb-2">
                    <p className="text-[11px] text-muted-foreground italic py-2">
                      Decisões do agente em breve
                    </p>
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
            {crmAgentEnabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncLoading}
                className="h-8"
              >
                {syncLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                Sync com Copilot
              </Button>
            )}
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
  const navigate = useNavigate();
  if (!lead) return null;

  const waDigits = lead.phone ? lead.phone.replace(/\D/g, "").replace(/^(?!55)/, "55$&") : null;
  const enrichment = summarizeEnrichment(lead.personal_custom_data);

  return (
    <section className="space-y-3">
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        Identidade Conectada
      </h4>
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
        {/* Sprint 5.3 — name + primary Chat action aligned on the header row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight min-w-0">
            {formatDisplayName(lead.name, lead.phone, "[Novo Contato - WhatsApp]")}
          </p>
          {lead.id && (
            <Button
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2.5"
              onClick={() => navigate(`/chat?contact=${lead.id}`)}
              title="Abrir conversa no Sales Engine"
            >
              <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
              Chat
            </Button>
          )}
        </div>

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

/**
 * Sprint 6.8 W1.3 — stage history display for the Histórico right-rail section.
 */
function StageHistoryDisplay({
  opportunity,
  stages,
}: {
  opportunity: Opportunity;
  stages: PipelineStageV2[];
}) {
  const currentStage = stages.find((s) => s.id === opportunity.stage_id);

  const fmt = (iso: string) => {
    try {
      return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-1.5 text-[11px] leading-relaxed">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Estágio:</span>
        {currentStage ? (
          <span className="flex items-center gap-1 font-medium text-foreground/70">
            <span
              className="w-2 h-2 rounded-full inline-block shrink-0"
              style={{ backgroundColor: currentStage.color }}
            />
            {currentStage.name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className="text-muted-foreground">
        Criado em:{" "}
        <span className="font-medium text-foreground/70">{fmt(opportunity.created_at)}</span>
      </div>
      <div className="text-muted-foreground">
        Entrou no estágio:{" "}
        <span className="font-medium text-foreground/70">{fmt(opportunity.stage_entered_at)}</span>
      </div>
      <div className="text-muted-foreground">
        Atualizado em:{" "}
        <span className="font-medium text-foreground/70">{fmt(opportunity.updated_at)}</span>
      </div>
      {opportunity.closed_at && (
        <div className="text-muted-foreground">
          Fechado em:{" "}
          <span className="font-medium text-foreground/70">{fmt(opportunity.closed_at)}</span>
        </div>
      )}
    </div>
  );
}

function TasksTabPane({ leadId }: { leadId: string }) {
  const { tasks, isLoading, createTask, toggleTask, deleteTask } = useTasks(leadId);
  const [newTitle, setNewTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCreating, setIsCreating] = useState(false);

  const handleAddTask = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      let dueDateStr: string | undefined = undefined;
      if (selectedDate) {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        dueDateStr = `${year}-${month}-${day}`;
      }
      await createTask(newTitle.trim(), undefined, dueDateStr);
      setNewTitle("");
      setSelectedDate(undefined);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Form to create task */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nova tarefa..."
            className="h-9 flex-1 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            disabled={isCreating}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-24 justify-start text-left font-normal text-xs shrink-0"
                disabled={isCreating}
              >
                <CalendarIcon className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground">
                  {selectedDate ? format(selectedDate, "dd/MM", { locale: ptBR }) : "Prazo"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            onClick={handleAddTask}
            disabled={!newTitle.trim() || isCreating}
            className="h-9 w-9 p-0 shrink-0 bg-gradient-to-r from-solo-orange to-solo-yellow hover:from-solo-orange/90 hover:to-solo-yellow/90 text-white border-0 shadow-sm"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4 italic">
            Nenhuma tarefa cadastrada.
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/20 border border-border/50 group hover:bg-muted/40 hover:border-border transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Checkbox
                  checked={task.status === "feito"}
                  onCheckedChange={() => toggleTask(task.id)}
                  id={`task-check-${task.id}`}
                  className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`task-check-${task.id}`}
                    className={cn(
                      "text-xs font-medium cursor-pointer block truncate text-foreground/90",
                      task.status === "feito" && "line-through text-muted-foreground"
                    )}
                  >
                    {task.title}
                  </label>
                  {task.due_date && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 font-mono">
                      <CalendarIcon className="h-2.5 w-2.5 shrink-0" />
                      Prazo: {task.due_date.split('T')[0].split('-').reverse().join('/')}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => deleteTask(task.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

