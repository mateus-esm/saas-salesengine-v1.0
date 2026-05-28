import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { User, DollarSign } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDisplayName } from "@/lib/displayName";
import type { Lead } from "@/types/crm";
import type { CustomFieldSchema, Opportunity } from "@/types/pipelines";

interface OpportunityCardProps {
  opportunity: Opportunity;
  lead: Lead | undefined;
  cardFields: CustomFieldSchema[];   // schema entries whose field_id ∈ pipeline.card_field_ids (already filtered)
  onClick: () => void;
  isDragOverlay?: boolean;
}

const formatCurrency = (value: number | null | undefined, currency: string) => {
  if (value === null || value === undefined) return null;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
};

const renderCustomValue = (field: CustomFieldSchema, raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (field.type) {
    case "currency":
      return typeof raw === "number"
        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(raw)
        : String(raw);
    case "boolean":
      return raw ? "Sim" : "Não";
    case "date":
      try {
        return new Date(String(raw)).toLocaleDateString("pt-BR");
      } catch {
        return String(raw);
      }
    default:
      return String(raw);
  }
};

export const OpportunityCard = ({
  opportunity,
  lead,
  cardFields,
  onClick,
  isDragOverlay,
}: OpportunityCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
    data: { type: "opportunity", opportunity },
    disabled: isDragOverlay,
  });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  const valueText = formatCurrency(opportunity.value, opportunity.currency);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group cursor-grab active:cursor-grabbing select-none",
        "rounded-md border border-border bg-card hover:border-primary/50 hover:shadow-sm",
        "p-2.5 space-y-1.5 transition-colors",
        isDragOverlay && "shadow-lg rotate-1 scale-[1.02]",
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium truncate">
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate">{formatDisplayName(lead?.name, lead?.phone, "[Novo Contato - WhatsApp]")}</span>
      </div>

      {valueText && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
          <DollarSign className="h-3 w-3" />
          {valueText}
        </div>
      )}

      {cardFields.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t border-border/60">
          {cardFields.map((f) => {
            const display = renderCustomValue(f, opportunity.custom_data?.[f.field_id]);
            if (!display) return null;
            return (
              <div key={f.field_id} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="uppercase tracking-wide text-muted-foreground truncate">{f.label}</span>
                <span className="truncate text-foreground/90">{display}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
