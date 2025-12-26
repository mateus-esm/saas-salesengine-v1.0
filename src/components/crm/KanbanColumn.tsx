import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LeadCard } from "./LeadCard";
import { Lead, PipelineStage } from "@/types/crm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  stage: PipelineStage;
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}

export const KanbanColumn = ({ stage, leads, onLeadClick }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  const totalValue = leads.reduce((sum, lead) => sum + (lead.opportunity_value || 0), 0);

  const formatCurrency = (value: number) => {
    if (value === 0) return null;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
    }).format(value);
  };

  return (
    <div
      className={cn(
        "flex flex-col min-w-[300px] max-w-[300px] rounded-lg bg-card border border-border transition-all duration-200",
        isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      {/* Column Header */}
      <div
        className="p-3 border-b border-border rounded-t-lg"
        style={{ borderTopColor: stage.color, borderTopWidth: "3px" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <h3 className="font-semibold text-sm text-foreground">
              {stage.name}
            </h3>
          </div>
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {leads.length}
          </span>
        </div>
        {formatCurrency(totalValue) && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Total: <span className="font-medium text-green-600 dark:text-green-400">{formatCurrency(totalValue)}</span>
          </p>
        )}
      </div>

      {/* Column Content */}
      <ScrollArea className="flex-1 p-2" ref={setNodeRef}>
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 min-h-[100px]">
            {leads.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-sm text-muted-foreground border-2 border-dashed border-muted rounded-lg">
                Arraste leads aqui
              </div>
            ) : (
              leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onClick={() => onLeadClick(lead)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
};
