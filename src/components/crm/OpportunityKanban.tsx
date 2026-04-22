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

import { useLeads } from "@/hooks/useLeads";
import { useOpportunities } from "@/hooks/useOpportunities";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";

import { ContactDetailsModal } from "./ContactDetailsModal";
import { OpportunityCard } from "./OpportunityCard";
import { OpportunityKanbanColumn } from "./OpportunityKanbanColumn";
import { OpportunityDetailModal } from "./OpportunityDetailModal";
import { CardFieldsPicker } from "./pipeline-settings/CardFieldsPicker";

import type { Lead } from "@/types/crm";
import type { Opportunity } from "@/types/pipelines";

interface OpportunityKanbanProps {
  pipelineId: string;
}

export const OpportunityKanban = ({ pipelineId }: OpportunityKanbanProps) => {
  const { pipelines, updatePipeline } = usePipelines();
  const { stages, isLoading: stagesLoading } = usePipelineStagesV2(pipelineId);
  const { opportunities, isLoading: oppsLoading, updateOpportunity } = useOpportunities({
    pipelineId,
  });
  const { leads, updateLead, deleteLead } = useLeads();

  const pipeline = pipelines.find((p) => p.id === pipelineId);

  // Local optimistic snapshot so cross-stage drops feel instant; Realtime + query
  // invalidation reconciles when the server confirms.
  const [localOpps, setLocalOpps] = useState<Opportunity[]>(opportunities);
  useEffect(() => setLocalOpps(opportunities), [opportunities]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [contactDrawerLead, setContactDrawerLead] = useState<Lead | null>(null);
  const [showCardConfig, setShowCardConfig] = useState(false);
  const [cardFieldDraft, setCardFieldDraft] = useState<string[]>([]);

  // Sprint 4 EPIC 2 §2.3 — deep-link `?opp=<id>` opens the matching card.
  // Resolution waits for opportunities to load; when the user closes the modal
  // we strip the param so reload doesn't re-open it.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkOppId = searchParams.get("opp");

  useEffect(() => {
    if (!deepLinkOppId || selectedOpp?.id === deepLinkOppId) return;
    const match = opportunities.find((o) => o.id === deepLinkOppId);
    if (match) setSelectedOpp(match);
  }, [deepLinkOppId, opportunities, selectedOpp?.id]);

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

  const leadsById = useMemo(() => {
    const map: Record<string, (typeof leads)[number]> = {};
    for (const l of leads) map[l.id] = l;
    return map;
  }, [leads]);

  const cardFields = useMemo(() => {
    const cardFieldIds = pipeline?.card_field_ids ?? [];
    const schema = pipeline?.custom_fields_schema ?? [];
    return schema
      .filter((f) => !f.is_deleted && cardFieldIds.includes(f.field_id))
      .sort((a, b) => a.position - b.position);
  }, [pipeline]);

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const oppsByStage = useMemo(() => {
    const map: Record<string, Opportunity[]> = {};
    orderedStages.forEach((s) => (map[s.id] = []));
    for (const o of localOpps) {
      if (map[o.stage_id]) map[o.stage_id].push(o);
    }
    // Sort each column by position to keep visual order stable.
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }
    return map;
  }, [localOpps, orderedStages]);

  const activeOpp = activeId ? localOpps.find((o) => o.id === activeId) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    const opp = localOpps.find((o) => o.id === active.id);
    if (!opp) return;

    // Resolve target stage: dropped either on a column (stage.id) or on another card.
    const overId = String(over.id);
    const overData = over.data.current as { type?: string; stageId?: string } | undefined;
    let targetStageId: string | undefined;

    if (overData?.type === "stage") {
      targetStageId = overData.stageId;
    } else {
      const targetOpp = localOpps.find((o) => o.id === overId);
      targetStageId = targetOpp?.stage_id ?? overId;
    }
    if (!targetStageId || !orderedStages.some((s) => s.id === targetStageId)) return;
    if (targetStageId === opp.stage_id) return; // no-op same-column drop

    // Optimistic snapshot update
    setLocalOpps((prev) =>
      prev.map((o) => (o.id === opp.id ? { ...o, stage_id: targetStageId! } : o)),
    );

    updateOpportunity.mutate(
      { id: opp.id, stage_id: targetStageId },
      {
        onError: () => {
          // Rollback — mutation already toasts. Reset to server state by re-applying source data.
          setLocalOpps(opportunities);
        },
      },
    );
  };

  const openCardConfig = () => {
    setCardFieldDraft(pipeline?.card_field_ids ?? []);
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

  const isLoading = stagesLoading || oppsLoading;

  if (isLoading && opportunities.length === 0 && stages.length === 0) {
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
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {pipeline?.name ?? "Pipeline"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {opportunities.length} leads · {orderedStages.length} etapas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openCardConfig} disabled={!pipeline}>
            <Settings2 className="h-4 w-4 mr-1.5" />
            Campos do card
          </Button>
        </div>
      </div>

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
                stage={stage}
                opportunities={oppsByStage[stage.id] ?? []}
                leadsById={leadsById}
                cardFields={cardFields}
                onCardClick={setSelectedOpp}
              />
            ))}
          </div>

          <DragOverlay>
            {activeOpp && (
              <OpportunityCard
                opportunity={activeOpp}
                lead={leadsById[activeOpp.lead_id]}
                cardFields={cardFields}
                onClick={() => {}}
                isDragOverlay
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <OpportunityDetailModal
        open={!!selectedOpp}
        opportunity={selectedOpp}
        pipeline={pipeline}
        stages={orderedStages}
        lead={selectedOpp ? leadsById[selectedOpp.lead_id] : undefined}
        onClose={handleCloseDetail}
        onOpenContact={(contactId) => {
          const target = leadsById[contactId];
          if (target) setContactDrawerLead(target);
        }}
      />

      <ContactDetailsModal
        lead={contactDrawerLead}
        open={!!contactDrawerLead}
        onClose={() => setContactDrawerLead(null)}
        onSave={(data) => {
          updateLead.mutate(data);
          setContactDrawerLead(null);
        }}
        onDelete={(id) => {
          deleteLead.mutate(id);
          setContactDrawerLead(null);
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
