import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Loader2, LayoutGrid, Search, Settings2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { LossReasonDialog, type LossReasonOption } from "./LossReasonDialog";
import { useBoardRealtime, useBoardSummary, useMoveBoardCard } from "@/hooks/useBoard";
import { useLead, useOpportunity } from "@/hooks/useLead";
import { useLeadMutations } from "@/hooks/useLeads";
import { useOpportunityMutations } from "@/hooks/useOpportunities";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";

import { ContactDetailsModal } from "./ContactDetailsModal";
import {
  DEFAULT_NATIVE_CARD_FLAGS,
  OpportunityCard,
  type NativeCardFlags,
} from "./OpportunityCard";
import { OpportunityKanbanColumn } from "./OpportunityKanbanColumn";
import { OpportunityDetailModal } from "./OpportunityDetailModal";
import { CardFieldsPicker, NATIVE_CARD_FIELDS } from "./pipeline-settings/CardFieldsPicker";
import { PipelineScoreboard } from "./revenue/PipelineScoreboard";

import type { BoardCard } from "@/types/board";
import type { CrmFilters } from "@/types/crmFilters";
import type { Opportunity } from "@/types/pipelines";

interface OpportunityKanbanProps {
  pipelineId: string;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Sprint 11 — the Kanban reads from the server.
 *
 * Before: the whole pipeline and every lead of the team were loaded into the
 * browser (both capped at 1,000 rows by the API, so 259 Solo Energia deals never
 * showed), and two lead-score RPCs were fired per lead. Now each column loads its
 * own cards 30 at a time (OpportunityKanbanColumn), the header counts come from
 * crm_board_summary, and every card arrives with its lead, owner, touchpoints and
 * score. The modals fetch the full lead only when opened.
 */
export const OpportunityKanban = ({ pipelineId }: OpportunityKanbanProps) => {
  const { pipelines, updatePipeline } = usePipelines();
  const { stages, isLoading: stagesLoading } = usePipelineStagesV2(pipelineId);
  const pipeline = pipelines.find((p) => p.id === pipelineId);

  // Search runs on the server (crm_opp_matches: name, e-mail, or phone typed any
  // way). Wave 2 replaces this box with the full filter bar on the same contract.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);
  const filters = useMemo<CrmFilters>(() => (search.trim() ? { search } : {}), [search]);

  const summaryQuery = useBoardSummary(pipelineId, filters);
  const summaryByStage = useMemo(
    () => Object.fromEntries((summaryQuery.data ?? []).map((s) => [s.stage_id, s])),
    [summaryQuery.data],
  );
  const totalCount = useMemo(
    () => (summaryQuery.data ?? []).reduce((sum, s) => sum + s.count, 0),
    [summaryQuery.data],
  );

  useBoardRealtime(pipelineId);
  const moveCard = useMoveBoardCard(pipelineId, filters);
  const { updateOpportunity } = useOpportunityMutations();
  const { updateLead, deleteLead } = useLeadMutations();

  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [siblings, setSiblings] = useState<Opportunity[]>([]);
  const [contactLeadId, setContactLeadId] = useState<string | null>(null);
  const [showCardConfig, setShowCardConfig] = useState(false);
  const [cardFieldDraft, setCardFieldDraft] = useState<string[]>([]);

  // The cards carry a slice of the lead; the modals need the whole row.
  const selectedLead = useLead(selectedOpp?.lead_id);
  const contactLead = useLead(contactLeadId);

  // Sprint 4 EPIC 2 §2.3 — deep-link `?opp=<id>` opens the matching card. The
  // card may be on a page not loaded yet, so it is fetched by id.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkOppId = searchParams.get("opp");
  const deepLinkOpp = useOpportunity(
    deepLinkOppId && selectedOpp?.id !== deepLinkOppId ? deepLinkOppId : null,
  );
  useEffect(() => {
    const opp = deepLinkOpp.data;
    if (opp && opp.pipeline_id === pipelineId) setSelectedOpp(opp);
  }, [deepLinkOpp.data, pipelineId]);

  const handleCloseDetail = useCallback(() => {
    setSelectedOpp(null);
    if (searchParams.has("opp")) {
      const next = new URLSearchParams(searchParams);
      next.delete("opp");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const cardFields = useMemo(() => {
    const cardFieldIds = pipeline?.card_field_ids ?? [];
    const schema = pipeline?.custom_fields_schema ?? [];
    return schema
      .filter((f) => !f.is_deleted && cardFieldIds.includes(f.field_id))
      .sort((a, b) => a.position - b.position);
  }, [pipeline]);

  const nativeCardFieldIds = useMemo(
    () => NATIVE_CARD_FIELDS.map((field) => field.field_id),
    [],
  );

  const effectiveCardFieldIds = useMemo(() => {
    const ids = pipeline?.card_field_ids ?? [];
    const hasNativeConfig = ids.some((id) => id.startsWith("native:"));
    return hasNativeConfig ? ids : [...nativeCardFieldIds, ...ids];
  }, [nativeCardFieldIds, pipeline?.card_field_ids]);

  const nativeFlags = useMemo<NativeCardFlags>(() => {
    const ids = pipeline?.card_field_ids ?? [];
    const hasNativeConfig = ids.some((id) => id.startsWith("native:"));
    if (!hasNativeConfig) return DEFAULT_NATIVE_CARD_FLAGS;

    return {
      value: ids.includes("native:value"),
      timeInPhase: ids.includes("native:time_in_phase"),
      touchpoints: ids.includes("native:touchpoints"),
      nextContact: ids.includes("native:next_contact"),
      whatsapp: ids.includes("native:whatsapp"),
    };
  }, [pipeline?.card_field_ids]);

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const handleDragStart = (e: DragStartEvent) => {
    const card = e.active.data.current?.opportunity as BoardCard | undefined;
    setActiveCard(card ?? null);
  };

  // Sprint 9: a deal dropped into a lost stage is asked why. Held here between
  // the drop (which already moved the card) and the answer.
  const [pendingLoss, setPendingLoss] = useState<{ id: string; leadName?: string } | null>(null);

  const lossReasons: LossReasonOption[] = useMemo(() => {
    const raw = (pipeline as { loss_reasons?: unknown })?.loss_reasons;
    return Array.isArray(raw) ? (raw as LossReasonOption[]) : [];
  }, [pipeline]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveCard(null);
    if (!over) return;

    const card = active.data.current?.opportunity as BoardCard | undefined;
    if (!card) return;

    // Dropped either on a column (stage) or on another card (take its stage).
    const overData = over.data.current as
      | { type?: string; stageId?: string; opportunity?: BoardCard }
      | undefined;
    let targetStageId: string | undefined;
    if (overData?.type === "stage") targetStageId = overData.stageId;
    else if (overData?.type === "opportunity") targetStageId = overData.opportunity?.stage_id;
    else targetStageId = String(over.id);

    if (!targetStageId || !orderedStages.some((s) => s.id === targetStageId)) return;
    if (targetStageId === card.stage_id) return; // same-column drop

    moveCard.mutate(
      { card, toStageId: targetStageId },
      {
        onSuccess: () => {
          // Ask for the motive only after the move actually landed, so a failed
          // save never leaves a dialog asking about something that did not happen.
          const target = orderedStages.find((s) => s.id === targetStageId);
          if (target?.stage_type === "lost") {
            setPendingLoss({ id: card.id, leadName: card.lead?.name });
          }
        },
      },
    );
  };

  const openCardConfig = () => {
    setCardFieldDraft(effectiveCardFieldIds);
    setShowCardConfig(true);
  };

  const saveCardConfig = () => {
    if (!pipeline) return;
    updatePipeline.mutate(
      { id: pipeline.id, card_field_ids: cardFieldDraft },
      {
        onSuccess: () => setShowCardConfig(false),
      },
    );
  };

  if (stagesLoading && stages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (orderedStages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-md">
          <LayoutGrid className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Esta pipeline ainda não tem etapas</h2>
          <p className="text-sm text-muted-foreground">
            Vá em "Configurar" para criar as etapas do seu processo comercial.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border bg-card">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {pipeline?.name ?? "Pipeline"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {summaryQuery.isLoading ? "…" : totalCount} {search ? "encontrados" : "leads"} ·{" "}
            {orderedStages.length} etapas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar nome, telefone ou e-mail"
              className="h-9 w-64 pl-8 pr-8"
              aria-label="Buscar no quadro"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={openCardConfig} disabled={!pipeline}>
            <Settings2 className="h-4 w-4 mr-1.5" />
            Campos do card
          </Button>
        </div>
      </div>

      <PipelineScoreboard pipelineId={pipelineId} />

      <div className="flex-1 overflow-x-auto p-4 bg-muted/30">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-h-[500px]">
            {orderedStages.map((stage) => (
              <OpportunityKanbanColumn
                key={stage.id}
                pipelineId={pipelineId}
                stage={stage}
                filters={filters}
                summary={summaryByStage[stage.id]}
                cardFields={cardFields}
                nativeFlags={nativeFlags}
                onCardClick={(card, cards) => {
                  setSelectedOpp(card);
                  setSiblings(cards);
                }}
                onOpenContact={(leadId) => setContactLeadId(leadId)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard && (
              <OpportunityCard
                opportunity={activeCard}
                lead={activeCard.lead}
                stage={orderedStages.find((s) => s.id === activeCard.stage_id)}
                cardFields={cardFields}
                touchpointCount={activeCard.touchpoint_count}
                nativeFlags={nativeFlags}
                leadScore={activeCard.lead_score}
                leadScoreBreakdown={
                  activeCard.lead_score !== null
                    ? { icp: activeCard.icp_score, velocity: activeCard.velocity }
                    : undefined
                }
                onClick={() => {}}
                isDragOverlay
                companies={activeCard.companies}
              />
            )}
          </DragOverlay>
        </DndContext>

        {/* Sprint 9 — the motive, asked at the moment it is known. */}
        <LossReasonDialog
          open={!!pendingLoss}
          onOpenChange={(o) => { if (!o) setPendingLoss(null); }}
          reasons={lossReasons}
          leadName={pendingLoss?.leadName}
          onConfirm={(reason) => {
            if (pendingLoss && reason) {
              updateOpportunity.mutate({ id: pendingLoss.id, lost_reason: reason });
            }
            setPendingLoss(null);
          }}
        />
      </div>

      <OpportunityDetailModal
        open={!!selectedOpp}
        opportunity={selectedOpp}
        pipeline={pipeline}
        stages={orderedStages}
        lead={selectedLead.data ?? undefined}
        onClose={handleCloseDetail}
        onOpenContact={(contactId) => setContactLeadId(contactId)}
        siblings={siblings}
        onNavigate={(id) => {
          const next = siblings.find((o) => o.id === id);
          if (next) setSelectedOpp(next);
        }}
      />

      <ContactDetailsModal
        lead={contactLead.data ?? null}
        open={!!contactLeadId && !!contactLead.data}
        onClose={() => setContactLeadId(null)}
        onSave={(data) => {
          updateLead.mutate(data);
          setContactLeadId(null);
        }}
        onDelete={(id) => {
          deleteLead.mutate(id);
          setContactLeadId(null);
        }}
      />

      <Dialog open={showCardConfig} onOpenChange={setShowCardConfig}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Configurar campos do card</DialogTitle>
            <DialogDescription>
              Escolha até 3-4 campos para exibir no rosto do card do Kanban.
            </DialogDescription>
          </DialogHeader>
          {pipeline && (
            <CardFieldsPicker
              schema={pipeline.custom_fields_schema}
              cardFieldIds={cardFieldDraft}
              onChange={setCardFieldDraft}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCardConfig(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCardConfig} disabled={updatePipeline.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
