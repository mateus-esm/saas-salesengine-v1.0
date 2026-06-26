import { describe, it, expect } from "vitest";
import { resolveReorder } from "../useColumnLayout";

/**
 * Tests for the `resolveReorder` pure helper that backs `reorderColumn` in
 * `useColumnLayout`.
 *
 * BUG (now fixed): the old implementation used `prev ?? []` as the base.
 * When no order had been persisted yet (`prev === null`) the base was `[]`,
 * so `splice(fromIndex, 1)` extracted `undefined` and the returned array had
 * length 1 containing `undefined` — the reorder was silently broken.
 *
 * FIX: `prev ?? columnKeys` — when prev is null, fall back to the full
 * ordered list of column keys so the result always has the correct length.
 */

describe("resolveReorder — prev === null (no persisted order)", () => {
  const columns = ["name", "email", "phone"];

  it("moves the first column to the end — result length equals column count", () => {
    // OLD BUG: resolveReorder(null, [], 0, 2) → [undefined]  (length 1)
    // FIX:     resolveReorder(null, columns, 0, 2) → ["email","phone","name"]
    const result = resolveReorder(null, columns, 0, 2);
    expect(result).toHaveLength(columns.length); // fails with old `prev ?? []`
    expect(result).not.toContain(undefined);
    expect(result).toEqual(["email", "phone", "name"]);
  });

  it("moves the last column to the front", () => {
    const result = resolveReorder(null, columns, 2, 0);
    expect(result).toHaveLength(columns.length);
    expect(result).toEqual(["phone", "name", "email"]);
  });

  it("swap of adjacent columns", () => {
    const result = resolveReorder(null, columns, 0, 1);
    expect(result).toHaveLength(columns.length);
    expect(result).toEqual(["email", "name", "phone"]);
  });
});

describe("resolveReorder — prev has persisted order (subsequent reorder)", () => {
  const persisted = ["email", "name", "phone"];
  const columns = ["name", "email", "phone"]; // original schema order (unused as base)

  it("reorders within the persisted order, ignoring the column schema order", () => {
    // Move "email" (index 0 in persisted) to index 2
    const result = resolveReorder(persisted, columns, 0, 2);
    expect(result).toEqual(["name", "phone", "email"]);
    expect(result).toHaveLength(3);
  });

  it("two sequential reorders compose correctly", () => {
    // First reorder: move index 0 → 1
    const after1 = resolveReorder(persisted, columns, 0, 1);
    expect(after1).toEqual(["name", "email", "phone"]);

    // Second reorder (prev is now the result of first reorder)
    const after2 = resolveReorder(after1, columns, 2, 0);
    expect(after2).toEqual(["phone", "name", "email"]);
    expect(after2).toHaveLength(3);
  });
});
