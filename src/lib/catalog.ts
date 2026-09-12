// Sprint 11 · Onda 3 · T29 — the catalog's words and rules on the screen.
//
// The rules are the database's (catalog_items' constraints and
// crm_save_catalog_item); the form checks them first so the person sees what is
// missing next to the field, not as a raw error after saving.

import type { CatalogItem, PriceMode, RecurrenceUnit } from "@/types/revenue";

export type CatalogDraft = Omit<CatalogItem, "id" | "equipe_id" | "created_at" | "updated_at">;

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/\u00a0/g, " ");

/** "Todo mês", "A cada 6 meses", "A cada 15 dias". */
export function recurrenceLabel(every: number | null, unit: RecurrenceUnit | null): string | null {
  if (!every || !unit) return null;
  if (every === 1) return unit === "month" ? "Todo mês" : "Todo dia";
  return `A cada ${every} ${unit === "month" ? "meses" : "dias"}`;
}

/** "R$ 250,00" (fixo) · "A partir de R$ 25.000,00" · "Negociável". */
export function priceLabel(item: { price_mode: PriceMode; price: number | null }): string {
  if (item.price === null || item.price === undefined) return "Negociável";
  return item.price_mode === "fixed" ? brl(item.price) : `A partir de ${brl(item.price)}`;
}

export function catalogItemErrors(d: CatalogDraft): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push("Dê um nome ao item.");
  if (d.price !== null && d.price < 0) errors.push("O preço não pode ser negativo.");
  if (d.price_mode === "fixed" && d.price === null) errors.push("Preço fixo precisa do preço.");
  if ((d.recurrence_every === null) !== (d.recurrence_unit === null)) {
    errors.push("Recorrência precisa de intervalo e unidade.");
  } else if (d.recurrence_every !== null && d.recurrence_every < 1) {
    errors.push("O intervalo da recorrência é pelo menos 1.");
  }
  if (d.renew_stage_id && !d.renew_pipeline_id) errors.push("Escolha o pipeline do retorno antes da etapa.");
  if (d.renew_days_before < 0) errors.push("Os dias de antecedência não podem ser negativos.");
  return errors;
}

export const EMPTY_CATALOG_DRAFT: CatalogDraft = {
  name: "",
  kind: "product",
  price: null,
  price_mode: "negotiable",
  recurrence_every: null,
  recurrence_unit: null,
  renew_days_before: 0,
  renew_pipeline_id: null,
  renew_stage_id: null,
  description: null,
  active: true,
};
