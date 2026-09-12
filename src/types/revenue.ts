// Sprint 11 · Onda 3 — the Receita engine's types (catalog, deal items, revenue).
// The database is the contract: migrations 20260912000200 (catalog),
// 0300 (items) and 0400 (revenue ledger).

export type CatalogKind = "product" | "service";
export type PriceMode = "fixed" | "negotiable";
export type RecurrenceUnit = "day" | "month";

export interface CatalogItem {
  id: string;
  equipe_id: string;
  name: string;
  kind: CatalogKind;
  /** null = no suggested price (only when negotiable). */
  price: number | null;
  price_mode: PriceMode;
  recurrence_every: number | null;
  recurrence_unit: RecurrenceUnit | null;
  /** Open the return deal this many days before the cycle is due. */
  renew_days_before: number;
  renew_pipeline_id: string | null;
  renew_stage_id: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}
