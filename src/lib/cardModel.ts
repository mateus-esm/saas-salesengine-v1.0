import type { BoardCard } from "@/types/board";
import type { CustomFieldSchema, PipelineStageV2 } from "@/types/pipelines";
import type { NativeCardFlags } from "@/components/crm/OpportunityCard";
import { formatDisplayName } from "@/lib/displayName";
import { getFieldType } from "@/lib/fields/registry";

export interface CardFieldDisplay {
  field_id: string;
  label: string;
  value: string;
}

export interface CardNextContactBadge {
  label: string;
  variant: "overdue" | "today" | "future";
}

export interface CardModel {
  title: string;
  leadId: string | null;
  valueText: string | null;
  ownerId: string | null;
  ownerName: string | null;
  timeInStageText: string | null;
  nextContactBadge: CardNextContactBadge | null;
  status: "open" | "won" | "lost";
  isOverdue: boolean;
  fields: CardFieldDisplay[];
  tags: string[];
  companies: { id: string; name: string }[];
  touchpointCount: number;
}

export function formatCurrency(value: number | null | undefined, currency?: string): string | null {
  if (value === null || value === undefined) return null;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(value);
  } catch {
    return `${currency || "BRL"} ${value}`;
  }
}

export function buildCardModel(
  card: BoardCard,
  stage: PipelineStageV2 | undefined,
  flags: NativeCardFlags,
  fields: CustomFieldSchema[],
  today: Date = new Date(),
  nameOf?: (userId: string) => string | null,
): CardModel {
  const title = formatDisplayName(card.lead?.name, card.lead?.phone, "[Novo Contato - WhatsApp]");
  const leadId = card.lead?.id ?? null;
  const valueText = flags.value ? formatCurrency(card.value, card.currency) : null;
  const ownerId = card.owner_id ?? null;
  const ownerName = card.owner_name ?? (ownerId ? nameOf?.(ownerId) ?? null : null);

  // Time in stage calculation
  let timeInStageText: string | null = null;
  if (flags.timeInPhase && card.stage_entered_at) {
    const entered = new Date(card.stage_entered_at);
    if (!isNaN(entered.getTime())) {
      const diffMs = today.getTime() - entered.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) {
        timeInStageText = "Hoje";
      } else if (diffDays === 1) {
        timeInStageText = "1d na etapa";
      } else {
        timeInStageText = `${diffDays}d na etapa`;
      }
    }
  }

  // Next contact badge logic
  let nextContactBadge: CardNextContactBadge | null = null;
  let isOverdue = false;

  if (flags.nextContact && card.lead?.next_contact) {
    const rawDateStr = card.lead.next_contact;
    const [yearStr, monthStr, dayStr] = rawDateStr.split("-");
    if (yearStr && monthStr && dayStr) {
      const nextDate = new Date(
        parseInt(yearStr, 10),
        parseInt(monthStr, 10) - 1,
        parseInt(dayStr, 10),
      );
      const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const diffMs = nextDate.getTime() - todayDateOnly.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        isOverdue = true;
        nextContactBadge = {
          label: `${Math.abs(diffDays)}d atrasado`,
          variant: "overdue",
        };
      } else if (diffDays === 0) {
        nextContactBadge = {
          label: "Hoje",
          variant: "today",
        };
      } else if (diffDays === 1) {
        nextContactBadge = {
          label: "Amanhã",
          variant: "future",
        };
      } else {
        const formattedDate = `${dayStr.padStart(2, "0")}/${monthStr.padStart(2, "0")}`;
        nextContactBadge = {
          label: formattedDate,
          variant: "future",
        };
      }
    }
  }

  // Custom fields
  const renderedFields: CardFieldDisplay[] = [];
  for (const field of fields) {
    if (renderedFields.length >= 3) break; // Limit to up to 3 fields on card
    const raw = card.custom_data?.[field.field_id];
    const spec = getFieldType(field.type);
    if (!spec.isEmpty(raw)) {
      const formatted = spec.format(raw, { nameOf, options: field.options });
      if (formatted) {
        renderedFields.push({
          field_id: field.field_id,
          label: field.label,
          value: formatted,
        });
      }
    }
  }

  return {
    title,
    leadId,
    valueText,
    ownerId,
    ownerName,
    timeInStageText,
    nextContactBadge,
    status: card.status || "open",
    isOverdue,
    fields: renderedFields,
    tags: card.lead?.tags ?? [],
    companies: card.companies ?? [],
    touchpointCount: card.touchpoint_count ?? 0,
  };
}
