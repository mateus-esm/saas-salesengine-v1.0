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
import { Loader2, LayoutGrid, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { useDealUrlFilters } from "@/hooks/useUrlFilters";

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
import { DealFilterBar } from "./filters/DealFilterBar";
import { countDealFilters } from "./filters/model";

import type { BoardCard } from "@/types/board";
import type { Opportunity } from "@/types/pipelines";

import { useCollapsedStages } from "@/hooks/useCollapsedStages";
import { useIsMobile } from "@/hooks/use-mobile";
import { StagePicker } from "./mobile/StagePicker";
import { MoveToStageSheet } from "./mobile/MoveToStageSheet";
import { pickInitialStage } from "@/lib/mobileBoard";

interface OpportunityKanbanProps {
  pipelineId: string;
}

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
  // One request for the whole board: names for "Usuário" fields on the cards.
  const { nameOf } = useMemberDirectory();
  const isMobile = useIsMobile();
  const { isCollapsed, toggleStage } = useCollapsedStages(pipelineId);

  // Sprint 11 · Onda 2 — the filters live in the URL (shared with the Leads
  // table, shareable, kept on reload) and the server applies them
  // (crm_opp_matches): the column counts and the cards always agree.
  const { filters, setFilters } = useDealUrlFilters();
  const filtered = countDealFilters(filters) > 0;
  const declaredFields = useMemo(
    () =>
      (pipeline?.custom_fields_schema ?? [])
        .filter((f) => !f.is_deleted)
        .sort((a, b) => a.position - b.position),
    [pipeline?.custom_fields_schema],
  );

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

  // Mobile state
  const [mobileStageId, setMobileStageId] = useState<string>("");
  const [moveSheetCard, setMoveSheetCard] = useState<BoardCard | null>(null);

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  // Set initial active stage for mobile
  useEffect(() => {
    if (isMobile && !mobileStageId && orderedStages.length > 0) {
      setMobileStageId(pickInitialStage(summaryQuery.data, orderedStages));
    }
  }, [isMobile, mobileStageId, orderedStages, summaryQuery.data]);

  // The cards carry a slice of the lead; the modals need the whole row.
  const selectedLead = useLead(selectedOpp?.lead_id);
  const contactLead = useLead(contactLeadId);

  // Sprint 4 EPIC 2 §2.3 — deep-link `?opp=<id>` opens the matching card.
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

  const handleDragStart = (e: DragStartEvent) => {
    if (isMobile) return;
    const card = e.active.data.current?.opportunity as BoardCard | undefined;
    setActiveCard(card ?? null);
  };

  const [pendingLoss, setPendingLoss] = useState<{ id: string; leadName?: string } | null>(null);

  const lossReasons: LossReasonOption[] = useMemo(() => {
    const raw = (pipeline as { loss_reasons?: unknown })?.loss_reasons;
    return Array.isArray(raw) ? (raw as LossReasonOption[]) : [];
  }, [pipeline]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveCard(null);
    if (!over || isMobile) return;

    const card = active.data.current?.opportunity as BoardCard | undefined;
    if (!card) return;

    const overData = over.data.current as
      | { type?: string; stageId?: string; opportunity?: BoardCard }
      | undefined;
    let targetStageId: string | undefined;
    if (overData?.type === "stage") targetStageId = overData.stageId;
    else if (overData?.type === "opportunity") targetStageId = overData.opportunity?.stage_id;
    else targetStageId = String(over.id);

    if (!targetStageId || !orderedStages.some((s) => s.id === targetStageId)) return;
    if (targetStageId === card.stage_id) return;

    moveCard.mutate(
      { card, toStageId: targetStageId },
      {
        onSuccess: () => {
          const target = orderedStages.find((s) => s.id === targetStageId);
          if (target?.stage_type === "lost") {
            setPendingLoss({ id: card.id, leadName: card.lead?.name });
          }
        },
      },
    );
  };

  const handleMobileMove = (card: BoardCard, targetStageId: string) => {
    if (targetStageId === card.stage_id) return;
    moveCard.mutate(
      { card, toStageId: targetStageId },
      {
        onSuccess: () => {
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

  // Display stages for mobile vs desktop
  const activeMobileStage = orderedStages.find((s) => s.id === mobileStageId) || orderedStages[0];

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-3 border-b border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-foreground">
              {pipeline?.name ?? "Pipeline"}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{orderedStages.length} etapas</p>
          </div>
          <Button variant="outline" size="sm" onClick={openCardConfig} disabled={!pipeline}>
            <Settings2 className="mr-1.5 h-4 w-4" />
            Campos do card
          </Button>
        </div>
        <DealFilterBar
          filters={filters}
          onChange={setFilters}
          stages={orderedStages}
          fields={declaredFields}
          resultLabel={
            summaryQuery.isLoading
              ? "…"
              : `${totalCount.toLocaleString("pt-BR")} ${filtered ? (totalCount === 1 ? "encontrado" : "encontrados") : totalCount === 1 ? "negócio" : "negócios"}`
          }
        />
      </div>

      <PipelineScoreboard pipelineId={pipelineId} />

      {/* Mobile Stage Picker */}
      {isMobile && (
        <div className="pt-3 bg-muted/20 border-b border-border/40">
          <StagePicker
            stages={orderedStages}
            summary={summaryQuery.data ?? []}
            activeStageId={activeMobileStage.id}
            onSelectStage={setMobileStageId}
          />
        </div>
      )}

      <div className="flex-1 overflow-x-auto p-2 sm:p-4 bg-muted/30">
        {isMobile ? (
          <div className="flex justify-center h-full min-h-[400px]">
            <div className="w-full max-w-md">
              <OpportunityKanbanColumn
                key={activeMobileStage.id}
                pipelineId={pipelineId}
                stage={activeMobileStage}
                filters={filters}
                summary={summaryByStage[activeMobileStage.id]}
                cardFields={cardFields}
                nativeFlags={nativeFlags}
                onCardClick={(card, cards) => {
                  setSelectedOpp(card);
                  setSiblings(cards);
                }}
                onOpenContact={(leadId) => setContactLeadId(leadId)}
                nameOf={nameOf}
              />
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 h-full min-h-[500px]">
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
                  nameOf={nameOf}
                  isCollapsed={isCollapsed(stage.id)}
                  onToggleCollapse={() => toggleStage(stage.id)}
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
                  nameOf={nameOf}
                  ownerName={activeCard.owner_name}
                />
              )}
            </DragOverlay>
          </DndContext>
        )}

        {/* Loss Reason Dialog */}
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

        {/* Mobile Move to Stage Sheet */}
        {moveSheetCard && (
          <MoveToStageSheet
            open={!!moveSheetCard}
            onOpenChange={(o) => { if (!o) setMoveSheetCard(null); }}
            stages={orderedStages}
            currentStageId={moveSheetCard.stage_id}
            onMove={(targetStageId) => {
              handleMobileMove(moveSheetCard, targetStageId);
              setMoveSheetCard(null);
            }}
          />
        )}
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
