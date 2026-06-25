import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { cn } from "@/lib/utils";

import type { Lead } from "@/types/crm";
import type { CustomFieldSchema, Opportunity, PipelineStageV2 } from "@/types/pipelines";
import { OpportunityCard, type NativeCardFlags } from "./OpportunityCard";

interface OpportunityKanbanColumnProps {
  stage: PipelineStageV2;
  opportunities: Opportunity[];
  leadsById: Record<string, Lead>;
  cardFields: CustomFieldSchema[];
  touchpointCounts: Record<string, number>;      // NEW
  nativeFlags: NativeCardFlags;
  onCardClick: (opp: Opportunity) => void;
  onOpenContact?: (leadId: string) => void;
  companiesByOppId?: Record<string, { id: string; name: string }[]>;
}

const sumValues = (opps: Opportunity[]) =>
  opps.reduce((acc, o) => acc + (o.value ?? 0), 0);

const formatCompactBRL = (v: number) =>
  v === 0
    ? null
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
      }).format(v);

export const OpportunityKanbanColumn = ({
  stage,
  opportunities,
  leadsById,
  cardFields,
  touchpointCounts,
  nativeFlags,
  onCardClick,
  onOpenContact,
  companiesByOppId = {},
}: OpportunityKanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "stage", stageId: stage.id },
  });

  const total = formatCompactBRL(sumValues(opportunities));
  const dimmed = stage.stage_type === "lost";

  return (
    <div
      className={cn(
        "flex flex-col min-w-[300px] max-w-[300px] rounded-lg bg-card border border-border transition-all duration-200",
        isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        dimmed && "opacity-80",
      )}
    >
      <div
        className="p-3 border-b border-border rounded-t-lg"
        style={{ borderTopColor: stage.color, borderTopWidth: "3px" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
            <h3 className="font-semibold text-sm text-foreground truncate">{stage.name}</h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {stage.max_idle_hours && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                SLA {stage.max_idle_hours}h
              </span>
            )}
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {opportunities.length}
            </span>
          </div>
        </div>
        {total && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Total: <span className="font-medium text-green-600 dark:text-green-400">{total}</span>
          </p>
        )}
      </div>

      <div className="flex-1 p-2 overflow-y-auto" ref={setNodeRef}>
        <SortableContext
          items={opportunities.map((o) => o.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 min-h-[100px]">
            {opportunities.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-xs text-muted-foreground border-2 border-dashed border-muted rounded-md">
                Arraste leads aqui
              </div>
            ) : (
              opportunities.map((opp) => (
                <div key={opp.id} className="shrink-0">
                  <OpportunityCard
                    opportunity={opp}
                    lead={leadsById[opp.lead_id]}
                    stage={stage}
                    cardFields={cardFields}
                    touchpointCount={touchpointCounts[opp.lead_id] ?? 0}
                    nativeFlags={nativeFlags}
                    leadScore={(opp as any)._lead_score ?? null}
                    leadScoreBreakdown={(opp as any)._lead_breakdown}
                    onClick={() => onCardClick(opp)}
                    onOpenContact={onOpenContact}
                    companies={companiesByOppId[opp.id] ?? []}
                  />
                </div>
              ))
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
};
