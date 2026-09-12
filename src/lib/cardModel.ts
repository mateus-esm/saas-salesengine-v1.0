// Sprint 11 · Onda 2B · T24 — what a Kanban card shows, and in which order.
//
// Pure: the card component only draws this. The hierarchy is a rule here, tested:
//   line 1  name · owner avatar
//   line 2  value · time in stage · next contact
//   badges  outcome (won/lost) → overdue contact → above SLA → interaction cap
//   line 3  up to three card fields, tags, companies
// A closed deal shows its outcome only: overdue, SLA and time in stage are about
// deals still being worked.

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

export type CardBadgeKind = "won" | "lost" | "overdue" | "sla" | "interactions";

export interface CardBadge {
  kind: CardBadgeKind;
  label: string;
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
  slaBreached: boolean;
  interactionsBreached: boolean;
  /** In display order. */
  badges: CardBadge[];
  fields: CardFieldDisplay[];
  tags: string[];
  companies: { id: string; name: string }[];
  touchpointCount: number;
}

const MAX_CARD_FIELDS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** "2026-09-10" (a date column) as local midnight — never as UTC. */
function parseLocalDate(raw: string): Date | null {
  const [y, m, d] = raw.slice(0, 10).split("-").map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function nextContactBadgeFor(raw: string, today: Date): CardNextContactBadge | null {
  const next = parseLocalDate(raw);
  if (!next) return null;
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((next.getTime() - todayDateOnly.getTime()) / DAY_MS);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d atrasado`, variant: "overdue" };
  if (diffDays === 0) return { label: "Hoje", variant: "today" };
  if (diffDays === 1) return { label: "Amanhã", variant: "future" };
  const dd = String(next.getDate()).padStart(2, "0");
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  return { label: `${dd}/${mm}`, variant: "future" };
}

export function buildCardModel(
  card: BoardCard,
  stage: PipelineStageV2 | undefined,
  flags: NativeCardFlags,
  fields: CustomFieldSchema[],
  today: Date = new Date(),
  nameOf?: (userId: string) => string | null,
): CardModel {
  const status: CardModel["status"] = card.status || "open";
  const open = status === "open";
  const title = formatDisplayName(card.lead?.name, card.lead?.phone, "[Novo Contato - WhatsApp]");
  const ownerId = card.owner_id ?? null;
  const ownerName = card.owner_name ?? (ownerId ? nameOf?.(ownerId) ?? null : null);
  const touchpointCount = card.touchpoint_count ?? 0;

  // Time in stage — only while the deal is being worked.
  const enteredMs = card.stage_entered_at ? new Date(card.stage_entered_at).getTime() : NaN;
  const hoursInStage = Number.isFinite(enteredMs) ? Math.max(0, (today.getTime() - enteredMs) / 36e5) : null;
  let timeInStageText: string | null = null;
  if (open && flags.timeInPhase && hoursInStage !== null) {
    const days = Math.floor(hoursInStage / 24);
    timeInStageText = days <= 0 ? "Hoje" : `${days}d na etapa`;
  }

  const nextContactBadge =
    flags.nextContact && card.lead?.next_contact ? nextContactBadgeFor(card.lead.next_contact, today) : null;
  const isOverdue = open && nextContactBadge?.variant === "overdue";

  const maxIdle = stage?.max_idle_hours ?? null;
  const slaBreached = open && typeof maxIdle === "number" && maxIdle > 0 && hoursInStage !== null && hoursInStage >= maxIdle;
  const maxInteractions = stage?.max_interactions ?? null;
  const interactionsBreached =
    open && typeof maxInteractions === "number" && maxInteractions > 0 && touchpointCount >= maxInteractions;

  const badges: CardBadge[] = [];
  if (status === "won") badges.push({ kind: "won", label: "Ganho" });
  if (status === "lost") badges.push({ kind: "lost", label: card.lost_reason ? `Perdido · ${card.lost_reason}` : "Perdido" });
  if (isOverdue && nextContactBadge) badges.push({ kind: "overdue", label: `Contato ${nextContactBadge.label}` });
  if (slaBreached) badges.push({ kind: "sla", label: `Acima do SLA (${maxIdle}h)` });
  if (interactionsBreached) badges.push({ kind: "interactions", label: `${touchpointCount}/${maxInteractions} interações` });

  const renderedFields: CardFieldDisplay[] = [];
  for (const field of fields) {
    if (renderedFields.length >= MAX_CARD_FIELDS) break;
    const raw = card.custom_data?.[field.field_id];
    const spec = getFieldType(field.type);
    if (spec.isEmpty(raw)) continue;
    const formatted = spec.format(raw, { nameOf, options: field.options });
    if (formatted) renderedFields.push({ field_id: field.field_id, label: field.label, value: formatted });
  }

  return {
    title,
    leadId: card.lead?.id ?? null,
    valueText: flags.value ? formatCurrency(card.value, card.currency) : null,
    ownerId,
    ownerName,
    timeInStageText,
    nextContactBadge,
    status,
    isOverdue,
    slaBreached,
    interactionsBreached,
    badges,
    fields: renderedFields,
    tags: card.lead?.tags ?? [],
    companies: card.companies ?? [],
    touchpointCount,
  };
}
