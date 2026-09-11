import { describe, expect, it } from "vitest";

import { cleanFilters } from "../board";
import { cleanCustomFilters } from "../crmFilters";
import type { CustomFieldFilter } from "@/types/crmFilters";

const F = "5114f100-0000-0000-0000-000000000001";

describe("cleanCustomFilters", () => {
  it("keeps complete filters of every operator", () => {
    const list: CustomFieldFilter[] = [
      { field_id: F, op: "any_of", values: ["Site"] },
      { field_id: F, op: "contains", value: "telhado" },
      { field_id: F, op: "between_number", from: 10 },
      { field_id: F, op: "between_date", to: "2026-10-01T03:00:00.000Z" },
      { field_id: F, op: "is_true" },
      { field_id: F, op: "is_false" },
      { field_id: F, op: "empty" },
      { field_id: F, op: "not_empty" },
    ];
    expect(cleanCustomFilters(list)).toEqual(list);
  });

  it("drops filters with nothing to filter by", () => {
    expect(
      cleanCustomFilters([
        { field_id: F, op: "any_of", values: [] },
        { field_id: F, op: "any_of" },
        { field_id: F, op: "contains", value: "   " },
        { field_id: F, op: "between_number" },
        { field_id: F, op: "between_date", from: "", to: "" },
        { field_id: "", op: "empty" },
      ]),
    ).toEqual([]);
  });

  it("trims the contains text and keeps a zero bound", () => {
    expect(
      cleanCustomFilters([
        { field_id: F, op: "contains", value: "  telhado " },
        { field_id: F, op: "between_number", from: 0 },
      ]),
    ).toEqual([
      { field_id: F, op: "contains", value: "telhado" },
      { field_id: F, op: "between_number", from: 0 },
    ]);
  });
});

describe("cleanFilters with the v2 keys", () => {
  it("keeps next_contact and a complete custom list", () => {
    expect(
      cleanFilters({
        next_contact: "overdue",
        custom: [{ field_id: F, op: "any_of", values: ["Site"] }],
      }),
    ).toEqual({
      next_contact: "overdue",
      custom: [{ field_id: F, op: "any_of", values: ["Site"] }],
    });
  });

  it("drops a custom list that has only incomplete filters (one cache entry for 'no filter')", () => {
    expect(cleanFilters({ custom: [{ field_id: F, op: "any_of", values: [] }] })).toEqual({});
    expect(cleanFilters({ custom: [] })).toEqual({});
  });
});
