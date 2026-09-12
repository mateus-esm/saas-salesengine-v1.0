// Sprint 11 · Onda 3 · T30 — the lines of a deal, on the screen.
//
// The database owns the rules (crm_set_opportunity_items: fixed price comes from
// the catalog; the list changes by difference, existing lines keep their id).
// This keeps the form's arithmetic and the payload it sends in one tested place.

import type { CatalogItem } from "@/types/revenue";

export interface DealLine {
  /** Stable React key (the id when saved, a temp key before). */
  key: string;
  /** Present once saved: the verb edits the line in place. */
  id?: string;
  catalog_item_id?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  /** Fixed catalog price: the database ignores a price sent for it. */
  price_locked: boolean;
}

export type ItemPayload =
  | { id: string; quantity: number; unit_price?: number; name?: string }
  | { catalog_item_id: string; quantity: number; unit_price?: number }
  | { name: string; quantity: number; unit_price: number };

// The database's round(x, 2) on numeric: 1.5 × 99.99 = 149.985 → 149.99. In
// binary floating point 149.985 × 100 is 14998.4999…, so round the cents after
// trimming the float noise (15 significant digits).
const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(15))) / 100;

export const lineTotal = (quantity: number, unitPrice: number) => round2(quantity * unitPrice);

export const itemsTotal = (lines: DealLine[]) => round2(lines.reduce((s, l) => s + lineTotal(l.quantity, l.unit_price), 0));

let tempSeq = 0;
const tempKey = () => `new-${Date.now()}-${tempSeq++}`;

export function lineFromCatalog(item: CatalogItem): DealLine {
  return {
    key: tempKey(),
    catalog_item_id: item.id,
    name: item.name,
    quantity: 1,
    unit_price: item.price ?? 0,
    price_locked: item.price_mode === "fixed",
  };
}

export function freeLine(): DealLine {
  return { key: tempKey(), name: "", quantity: 1, unit_price: 0, price_locked: false };
}

export function itemsPayload(lines: DealLine[]): ItemPayload[] {
  return lines.map((l) => {
    if (l.id) {
      const p: { id: string; quantity: number; unit_price?: number; name?: string } = { id: l.id, quantity: l.quantity };
      if (!l.price_locked) p.unit_price = l.unit_price;
      if (!l.catalog_item_id && l.name.trim()) p.name = l.name.trim();
      // A catalog line that is not locked still keeps its catalog name.
      return p;
    }
    if (l.catalog_item_id) {
      return l.price_locked
        ? { catalog_item_id: l.catalog_item_id, quantity: l.quantity }
        : { catalog_item_id: l.catalog_item_id, quantity: l.quantity, unit_price: l.unit_price };
    }
    return { name: l.name.trim(), quantity: l.quantity, unit_price: l.unit_price };
  });
}
