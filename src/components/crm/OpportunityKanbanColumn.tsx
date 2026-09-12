import { useEffect, useMemo, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useBoardStage } from "@/hooks/useBoard";

import type { BoardCard, BoardStageSummary } from "@/types/board";
import type { CrmFilters } from "@/types/crmFilters";
import type { CustomFieldSchema, PipelineStageV2 } from "@/types/pipelines";
import { OpportunityCard, type NativeCardFlags } from "./OpportunityCard";

interface OpportunityKanbanColumnProps {
  pipelineId: string;
  stage: PipelineStageV2;
  filters: CrmFilters;
  /** The column's true totals (crm_board_summary), not just the loaded cards. */
  summary: BoardStageSummary | undefined;
  cardFields: CustomFieldSchema[];
  nativeFlags: NativeCardFlags;
  /** Receives the clicked card and the cards loaded in this column (for paddle navigation). */
  onCardClick: (card: BoardCard, siblings: BoardCard[]) => void;
  onOpenContact?: (leadId: string) => void;
  /** Member names for "Usuário" fields on the cards. */
  nameOf?: (userId: string) => string | null;
  /** Sprint 11 Wave 2B: collapse state */
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Touch screens: each card offers "Mover para…" (dragging is off). */
  onMoveCard?: (card: BoardCard) => void;
}

const formatCompactBRL = (v: number) =>
  v === 0
    ? null
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
      }).format(v);

/**
 * Sprint 11 — one Kanban column, loaded from the server 30 cards at a time.
 *
 * The count and total in the header come from the summary, so a column with 514
 * deals says 514 even while only the first 30 are on screen. Scrolling near the
 * bottom loads the next page (infinite scroll, no page buttons).
 */
export const OpportunityKanbanColumn = ({
  pipelineId,
  stage,
  filters,
  summary,
  cardFields,
  nativeFlags,
  onCardClick,
  onOpenContact,
  nameOf,
  isCollapsed,
  onToggleCollapse,
  onMoveCard,
}: OpportunityKanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "stage", stageId: stage.id },
  });

  const query = useBoardStage(pipelineId, stage.id, filters);
  const cards = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isCollapsed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isCollapsed]);

  const count = summary?.count ?? cards.length;
  const total = formatCompactBRL(summary?.value_sum ?? 0);
  const dimmed = stage.stage_type === "lost";
  const firstLoad = query.isLoading;

  if (isCollapsed) {
    return (
      <div
        onClick={onToggleCollapse}
        className={cn(
          "flex flex-col items-center min-w-[48px] max-w-[48px] rounded-lg bg-card border border-border cursor-pointer hover:border-primary/50 py-3 transition-all duration-200 select-none",
          isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          dimmed && "opacity-60",
        )}
        title={`Clique para expandir "${stage.name}" (${count} negócios)`}
      >
        <div
          className="w-3 h-3 rounded-full shrink-0 mb-3"
          style={{ backgroundColor: stage.color }}
        />
        <div className="flex-1 flex items-center justify-center [writing-mode:vertical-lr] rotate-180 text-xs font-semibold text-foreground tracking-wide gap-2">
          <span>{stage.name}</span>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col min-w-[300px] max-w-[300px] rounded-lg bg-card border border-border transition-all duration-200",
        isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        dimmed && "opacity-80",
      )}
    >
      <div
        className="p-3 border-b border-border rounded-t-lg group cursor-pointer"
        style={{ borderTopColor: stage.color, borderTopWidth: "3px" }}
        onClick={onToggleCollapse}
        title="Clique para recolher esta coluna"
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
            <span
              className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full tabular-nums"
              title={`${count} negócio(s) nesta etapa`}
            >
              {count}
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
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 min-h-[100px]">
            {firstLoad ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : query.isError ? (
              <div className="flex flex-col items-center justify-center gap-2 h-24 text-xs text-destructive text-center px-2">
                <span>Não foi possível carregar esta etapa.</span>
                <button
                  type="button"
                  className="underline text-muted-foreground hover:text-foreground"
                  onClick={() => query.refetch()}
                >
                  Tentar de novo
                </button>
              </div>
            ) : cards.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-xs text-muted-foreground border-2 border-dashed border-muted rounded-md">
                Arraste leads aqui
              </div>
            ) : (
              cards.map((card) => (
                <div key={card.id} className="shrink-0">
                  <OpportunityCard
                    card={card}
                    stage={stage}
                    cardFields={cardFields}
                    nativeFlags={nativeFlags}
                    onClick={() => onCardClick(card, cards)}
                    onOpenContact={onOpenContact}
                    onMoveRequest={onMoveCard ? () => onMoveCard(card) : undefined}
                    nameOf={nameOf}
                  />
                </div>
              ))
            )}

            {hasNextPage && <div ref={sentinelRef} className="h-2" aria-hidden />}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
};
