import { describe, expect, it } from "vitest";

import { normalizePipeline } from "../usePipelines";

const row = (extra: Record<string, unknown> = {}) =>
  ({
    id: "p1",
    equipe_id: "e1",
    name: "Solar",
    description: null,
    cadence_days: null,
    custom_fields_schema: null,
    card_field_ids: null,
    revenue_config: null,
    is_archived: false,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    ...extra,
  }) as never;

describe("normalizePipeline — the columns the screens read survive", () => {
  it("keeps the loss reasons (the Kanban's loss dialog reads them)", () => {
    const reasons = [{ value: "preco", label: "Preço" }];
    expect(normalizePipeline(row({ loss_reasons: reasons })).loss_reasons).toEqual(reasons);
  });

  it("keeps the natures (Sprint 11 · T35)", () => {
    const natures = { offer: { mode: "catalog", catalog_item_ids: [] } };
    expect(normalizePipeline(row({ natures })).natures).toEqual(natures);
  });

  it("missing columns become empty, not undefined", () => {
    const p = normalizePipeline(row());
    expect(p.loss_reasons).toEqual([]);
    expect(p.natures).toEqual({});
    expect(p.custom_fields_schema).toEqual([]);
  });
});
