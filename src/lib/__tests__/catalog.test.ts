import { describe, expect, it } from "vitest";

import { catalogItemErrors, priceLabel, recurrenceLabel, type CatalogDraft } from "../catalog";

const draft = (d: Partial<CatalogDraft> = {}): CatalogDraft => ({
  name: "Limpeza",
  kind: "service",
  price_mode: "negotiable",
  price: null,
  recurrence_every: null,
  recurrence_unit: null,
  renew_days_before: 0,
  renew_pipeline_id: null,
  renew_stage_id: null,
  description: null,
  active: true,
  ...d,
});

describe("recurrenceLabel", () => {
  it("says it the way people say it", () => {
    expect(recurrenceLabel(1, "month")).toBe("Todo mês");
    expect(recurrenceLabel(6, "month")).toBe("A cada 6 meses");
    expect(recurrenceLabel(12, "month")).toBe("A cada 12 meses");
    expect(recurrenceLabel(1, "day")).toBe("Todo dia");
    expect(recurrenceLabel(15, "day")).toBe("A cada 15 dias");
  });

  it("no recurrence: nothing", () => {
    expect(recurrenceLabel(null, null)).toBeNull();
  });
});

describe("priceLabel", () => {
  it("fixed shows the price; negotiable says so, with the suggestion when there is one", () => {
    expect(priceLabel({ price_mode: "fixed", price: 250 })).toBe("R$ 250,00");
    expect(priceLabel({ price_mode: "negotiable", price: 25000 })).toBe("A partir de R$ 25.000,00");
    expect(priceLabel({ price_mode: "negotiable", price: null })).toBe("Negociável");
  });
});

describe("catalogItemErrors — the same rules as the database", () => {
  it("a valid item has none", () => {
    expect(catalogItemErrors(draft())).toEqual([]);
  });

  it("needs a name", () => {
    expect(catalogItemErrors(draft({ name: "  " }))).toContain("Dê um nome ao item.");
  });

  it("a fixed price needs the price", () => {
    expect(catalogItemErrors(draft({ price_mode: "fixed", price: null }))).toContain("Preço fixo precisa do preço.");
  });

  it("no negative price", () => {
    expect(catalogItemErrors(draft({ price: -1 }))).toContain("O preço não pode ser negativo.");
  });

  it("recurrence comes whole, and the return stage needs its pipeline", () => {
    expect(catalogItemErrors(draft({ recurrence_every: 6, recurrence_unit: null }))).toContain(
      "Recorrência precisa de intervalo e unidade.",
    );
    expect(catalogItemErrors(draft({ recurrence_every: 0, recurrence_unit: "month" }))).toContain(
      "O intervalo da recorrência é pelo menos 1.",
    );
    expect(
      catalogItemErrors(draft({ recurrence_every: 6, recurrence_unit: "month", renew_stage_id: "s1" })),
    ).toContain("Escolha o pipeline do retorno antes da etapa.");
  });
});
