import { describe, expect, it } from "vitest";

import { itemsPayload, itemsTotal, lineFromCatalog, lineTotal, type DealLine } from "../dealItems";
import type { CatalogItem } from "@/types/revenue";

const cat = (c: Partial<CatalogItem>): CatalogItem => ({
  id: "c1",
  equipe_id: "e",
  name: "Limpeza",
  kind: "service",
  price: 250,
  price_mode: "fixed",
  recurrence_every: 6,
  recurrence_unit: "month",
  renew_days_before: 15,
  renew_pipeline_id: null,
  renew_stage_id: null,
  description: null,
  active: true,
  created_at: "",
  updated_at: "",
  ...c,
});

describe("lineTotal / itemsTotal", () => {
  it("quantity × unit price, to the cent", () => {
    expect(lineTotal(3, 0.1)).toBe(0.3);
    expect(lineTotal(1.5, 99.99)).toBe(149.99);
  });

  it("sums the lines", () => {
    const lines: DealLine[] = [
      { key: "a", name: "A", quantity: 2, unit_price: 250, price_locked: true },
      { key: "b", name: "B", quantity: 1, unit_price: 80, price_locked: false },
    ];
    expect(itemsTotal(lines)).toBe(580);
    expect(itemsTotal([])).toBe(0);
  });
});

describe("lineFromCatalog", () => {
  it("a fixed item comes with its price, locked", () => {
    expect(lineFromCatalog(cat({}))).toMatchObject({ name: "Limpeza", unit_price: 250, price_locked: true, catalog_item_id: "c1" });
  });

  it("a negotiable item suggests its price, or zero", () => {
    expect(lineFromCatalog(cat({ price_mode: "negotiable", price: 1200 }))).toMatchObject({ unit_price: 1200, price_locked: false });
    expect(lineFromCatalog(cat({ price_mode: "negotiable", price: null }))).toMatchObject({ unit_price: 0 });
  });
});

describe("itemsPayload — what the verb receives", () => {
  it("existing lines go by id; new catalog lines by catalog id; free lines by name", () => {
    const lines: DealLine[] = [
      { key: "x", id: "i1", name: "Limpeza", quantity: 3, unit_price: 250, price_locked: true, catalog_item_id: "c1" },
      { key: "y", name: "Clareamento", quantity: 1, unit_price: 1000, price_locked: false, catalog_item_id: "c2" },
      { key: "z", name: " Raio-x ", quantity: 1, unit_price: 80, price_locked: false },
    ];
    expect(itemsPayload(lines)).toEqual([
      { id: "i1", quantity: 3 },
      { catalog_item_id: "c2", quantity: 1, unit_price: 1000 },
      { name: "Raio-x", quantity: 1, unit_price: 80 },
    ]);
  });

  it("an editable existing line sends its price too; a locked one never does", () => {
    const lines: DealLine[] = [
      { key: "x", id: "i1", name: "Neg", quantity: 1, unit_price: 900, price_locked: false, catalog_item_id: "c2" },
      { key: "y", catalog_item_id: "c1", name: "Fixo", quantity: 2, unit_price: 1, price_locked: true },
    ];
    expect(itemsPayload(lines)).toEqual([
      { id: "i1", quantity: 1, unit_price: 900 },
      { catalog_item_id: "c1", quantity: 2 },
    ]);
  });
});
