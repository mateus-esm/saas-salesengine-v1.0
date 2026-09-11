// Sprint 11 · Onda 2 · T17 — what the filter bar shows, as data (tested).
//
// Every active filter becomes a chip with a readable label and a way to remove
// just that filter. Owner and "Criado em" have their own always-visible buttons,
// so they are not repeated as chips.

import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { formatFieldDate } from "@/lib/fields/dateOnly";
import { getFieldType } from "@/lib/fields/registry";
import type {
  ContactFilters,
  ContactRelationship,
  CrmFilters,
  CustomFieldFilter,
  CustomFieldFilterOp,
  NextContactBucket,
} from "@/types/crmFilters";
import type { CustomFieldSchema, OpportunityStatus } from "@/types/pipelines";

export interface FilterChip {
  id: string;
  label: string;
}

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  open: "Aberto",
  won: "Ganho",
  lost: "Perdido",
};

export const NEXT_CONTACT_LABELS: Record<NextContactBucket, string> = {
  overdue: "Atrasado",
  today: "Hoje",
  week: "Próximos 7 dias",
  none: "Sem próximo contato",
};

export const RELATIONSHIP_LABELS: Record<ContactRelationship, string> = {
  cliente: "Cliente",
  negociando: "Negociando",
  perdido: "Perdido",
  sem_negocio: "Sem negócio",
};

export const OP_LABELS: Record<CustomFieldFilterOp, string> = {
  any_of: "é qualquer um de",
  contains: "contém",
  between_number: "entre",
  between_date: "entre as datas",
  is_true: "é Sim",
  is_false: "é Não",
  empty: "está vazio",
  not_empty: "está preenchido",
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const money = (n: number) => BRL.format(n).replace(/\u00a0/g, " ");

const originLabel = (v: string) => ORIGIN_CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? v;

export function ownerLabels(ids: string[] | undefined, nameOf: (id: string) => string | null): string[] {
  return (ids ?? []).map((id) => (id === "none" ? "Sem responsável" : nameOf(id) ?? "Usuário removido"));
}

/** "Este mês", "01/09/2026 – 30/09/2026", "desde 01/09/2026", "até 30/09/2026". */
export function rangeLabel(from?: string, to?: string): string {
  const a = from ? formatFieldDate(from) : "";
  // `to` is exclusive: the last day shown is the day before.
  const b = to ? formatFieldDate(new Date(new Date(to).getTime() - 1).toISOString()) : "";
  if (a && b) return a === b ? a : `${a} – ${b}`;
  if (a) return `desde ${a}`;
  if (b) return `até ${b}`;
  return "";
}

function valueLabel(min?: number | string, max?: number | string): string {
  const lo = typeof min === "number" ? min : min !== undefined && min !== "" ? Number(min) : undefined;
  const hi = typeof max === "number" ? max : max !== undefined && max !== "" ? Number(max) : undefined;
  if (lo !== undefined && hi !== undefined) return `${money(lo)} – ${money(hi)}`;
  if (lo !== undefined) return `≥ ${money(lo)}`;
  if (hi !== undefined) return `≤ ${money(hi)}`;
  return "";
}

export function customFilterLabel(
  f: CustomFieldFilter,
  field: CustomFieldSchema | undefined,
  nameOf: (id: string) => string | null,
): string {
  const name = field?.label ?? "Campo removido";
  const spec = getFieldType(field?.type);
  switch (f.op) {
    case "any_of": {
      const values = (f.values ?? []).map((v) => (spec.type === "user" ? nameOf(v) ?? "Usuário removido" : v));
      return `${name}: ${values.join(", ")}`;
    }
    case "contains":
      return `${name} contém "${f.value ?? ""}"`;
    case "between_number":
      return spec.type === "currency"
        ? `${name}: ${valueLabel(f.from, f.to)}`
        : `${name}: ${f.from ?? "…"} a ${f.to ?? "…"}`;
    case "between_date":
      return `${name}: ${rangeLabel(f.from as string | undefined, f.to as string | undefined)}`;
    default:
      return `${name} ${OP_LABELS[f.op]}`;
  }
}

export interface DealChipContext {
  stages: { id: string; name: string }[];
  fields: CustomFieldSchema[];
  nameOf: (id: string) => string | null;
}

export function dealFilterChips(f: CrmFilters, ctx: DealChipContext): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.stage_ids?.length) {
    const names = f.stage_ids.map((id) => ctx.stages.find((s) => s.id === id)?.name ?? "Etapa removida");
    chips.push({ id: "stage", label: `Etapa: ${names.join(", ")}` });
  }
  if (f.statuses?.length) chips.push({ id: "status", label: `Status: ${f.statuses.map((s) => STATUS_LABELS[s]).join(", ")}` });
  if (f.origin_categories?.length) {
    chips.push({ id: "origin", label: `Origem: ${f.origin_categories.map(originLabel).join(", ")}` });
  }
  if (f.tags?.length) chips.push({ id: "tags", label: `Etiquetas: ${f.tags.join(", ")}` });
  if (f.value_min !== undefined || f.value_max !== undefined) {
    chips.push({ id: "value", label: `Valor: ${valueLabel(f.value_min, f.value_max)}` });
  }
  if (f.next_contact) chips.push({ id: "next", label: `Próximo contato: ${NEXT_CONTACT_LABELS[f.next_contact]}` });
  (f.custom ?? []).forEach((c) => {
    chips.push({
      id: `cf:${c.field_id}`,
      label: customFilterLabel(c, ctx.fields.find((x) => x.field_id === c.field_id), ctx.nameOf),
    });
  });
  return chips;
}

export function removeDealChip(f: CrmFilters, id: string): CrmFilters {
  const next = { ...f };
  switch (id) {
    case "stage":
      delete next.stage_ids;
      break;
    case "status":
      delete next.statuses;
      break;
    case "origin":
      delete next.origin_categories;
      break;
    case "tags":
      delete next.tags;
      break;
    case "value":
      delete next.value_min;
      delete next.value_max;
      break;
    case "next":
      delete next.next_contact;
      break;
    default:
      if (id.startsWith("cf:")) {
        const fieldId = id.slice(3);
        const custom = (f.custom ?? []).filter((c) => c.field_id !== fieldId);
        if (custom.length) next.custom = custom;
        else delete next.custom;
      }
  }
  return next;
}

/** Filters that change the result (search included), for the "Limpar" and the mobile badge. */
export function countDealFilters(f: CrmFilters): number {
  let n = 0;
  if (f.search?.trim()) n++;
  if (f.owner_ids?.length) n++;
  if (f.created_from || f.created_to) n++;
  if (f.stage_ids?.length) n++;
  if (f.statuses?.length) n++;
  if (f.origin_categories?.length) n++;
  if (f.tags?.length) n++;
  if (f.value_min !== undefined || f.value_max !== undefined) n++;
  if (f.next_contact) n++;
  n += f.custom?.length ?? 0;
  return n;
}

export interface ContactChipContext {
  pipelines: { id: string; name: string }[];
}

export function contactFilterChips(f: ContactFilters, ctx: ContactChipContext): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.relationship?.length) {
    chips.push({ id: "relationship", label: `Situação: ${f.relationship.map((r) => RELATIONSHIP_LABELS[r]).join(", ")}` });
  }
  if (f.pipeline_ids?.length) {
    const names = f.pipeline_ids.map((id) => ctx.pipelines.find((p) => p.id === id)?.name ?? "Pipeline removido");
    chips.push({ id: "pipeline", label: `Pipeline: ${names.join(", ")}` });
  }
  if (f.origin_categories?.length) {
    chips.push({ id: "origin", label: `Origem: ${f.origin_categories.map(originLabel).join(", ")}` });
  }
  if (f.tags?.length) chips.push({ id: "tags", label: `Etiquetas: ${f.tags.join(", ")}` });
  if (f.next_contact) chips.push({ id: "next", label: `Próximo contato: ${NEXT_CONTACT_LABELS[f.next_contact]}` });
  return chips;
}

export function removeContactChip(f: ContactFilters, id: string): ContactFilters {
  const next = { ...f };
  if (id === "relationship") delete next.relationship;
  if (id === "pipeline") delete next.pipeline_ids;
  if (id === "origin") delete next.origin_categories;
  if (id === "tags") delete next.tags;
  if (id === "next") delete next.next_contact;
  return next;
}

export function countContactFilters(f: ContactFilters): number {
  let n = 0;
  if (f.search?.trim()) n++;
  if (f.deal_owner_ids?.length) n++;
  if (f.created_from || f.created_to) n++;
  if (f.relationship?.length) n++;
  if (f.pipeline_ids?.length) n++;
  if (f.origin_categories?.length) n++;
  if (f.tags?.length) n++;
  if (f.next_contact) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Date presets for "Criado em"
// ---------------------------------------------------------------------------

export type DatePreset = "today" | "7d" | "30d" | "this_month" | "last_month";

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
};

/** [from, to) as ISO, in local days. */
export function presetRange(preset: DatePreset, now: Date = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = (yy: number, mm: number, dd: number) => new Date(yy, mm, dd).toISOString();
  switch (preset) {
    case "today":
      return { from: day(y, m, d), to: day(y, m, d + 1) };
    case "7d":
      return { from: day(y, m, d - 6), to: day(y, m, d + 1) };
    case "30d":
      return { from: day(y, m, d - 29), to: day(y, m, d + 1) };
    case "this_month":
      return { from: day(y, m, 1), to: day(y, m + 1, 1) };
    case "last_month":
      return { from: day(y, m - 1, 1), to: day(y, m, 1) };
  }
}

/** The preset a range corresponds to (today), or null for a custom range. */
export function matchPreset(from?: string, to?: string, now: Date = new Date()): DatePreset | null {
  if (!from || !to) return null;
  for (const p of Object.keys(DATE_PRESET_LABELS) as DatePreset[]) {
    const r = presetRange(p, now);
    if (r.from === from && r.to === to) return p;
  }
  return null;
}
