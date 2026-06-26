import { describe, it, expect } from "vitest";
import { resolveReorder, translateVisibleToAbsolute } from "../useColumnLayout";

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

// ---------------------------------------------------------------------------
// translateVisibleToAbsolute — pure index-translation helper
// ---------------------------------------------------------------------------

describe("translateVisibleToAbsolute", () => {
  it("returns identity when no columns are hidden", () => {
    // fullOrder = ['a','b','c'], hidden = {}
    // visible list = ['a','b','c']; visible index 1 → absolute index 1
    expect(translateVisibleToAbsolute(["a", "b", "c"], new Set(), 0)).toBe(0);
    expect(translateVisibleToAbsolute(["a", "b", "c"], new Set(), 1)).toBe(1);
    expect(translateVisibleToAbsolute(["a", "b", "c"], new Set(), 2)).toBe(2);
  });

  it("translates correctly when a hidden column precedes the visible item", () => {
    // fullOrder = ['a','b','c','d'], 'b' is hidden
    // visible list = ['a','c','d']
    // visible index 0 → 'a' → absolute 0
    // visible index 1 → 'c' → absolute 2 (b is skipped)
    // visible index 2 → 'd' → absolute 3
    const full = ["a", "b", "c", "d"];
    const hidden = new Set(["b"]);
    expect(translateVisibleToAbsolute(full, hidden, 0)).toBe(0);
    expect(translateVisibleToAbsolute(full, hidden, 1)).toBe(2);
    expect(translateVisibleToAbsolute(full, hidden, 2)).toBe(3);
  });

  it("handles multiple hidden columns", () => {
    // fullOrder = ['a','b','c','d','e'], 'b' and 'd' hidden
    // visible list = ['a','c','e']
    const full = ["a", "b", "c", "d", "e"];
    const hidden = new Set(["b", "d"]);
    expect(translateVisibleToAbsolute(full, hidden, 0)).toBe(0);
    expect(translateVisibleToAbsolute(full, hidden, 1)).toBe(2);
    expect(translateVisibleToAbsolute(full, hidden, 2)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Integrated: reorder + hidden column — the bug case from the brief
// ---------------------------------------------------------------------------

describe("resolveReorder with translated indices (hidden column before drop position)", () => {
  it("moves 'd' (visible index 2) before 'a' (visible index 0) with 'b' hidden", () => {
    // fullOrder = ['a','b','c','d'], 'b' hidden
    // visible list = ['a','c','d']
    // User drags visible index 2 ('d') to visible index 0 ('a').
    // Expected full result: ['d','a','b','c']
    const fullOrder = ["a", "b", "c", "d"];
    const hidden = new Set(["b"]);
    const absFrom = translateVisibleToAbsolute(fullOrder, hidden, 2); // 'd' → 3
    const absTo = translateVisibleToAbsolute(fullOrder, hidden, 0);   // 'a' → 0
    expect(absFrom).toBe(3);
    expect(absTo).toBe(0);
    const result = resolveReorder(fullOrder, fullOrder, absFrom, absTo);
    expect(result).toEqual(["d", "a", "b", "c"]);
  });

  it("moves 'c' (visible index 1) to after 'd' (visible index 2) with 'b' hidden", () => {
    // fullOrder = ['a','b','c','d'], 'b' hidden
    // visible list = ['a','c','d']
    // User drags visible index 1 ('c') to visible index 2 ('d').
    // Expected full result: ['a','b','d','c']
    const fullOrder = ["a", "b", "c", "d"];
    const hidden = new Set(["b"]);
    const absFrom = translateVisibleToAbsolute(fullOrder, hidden, 1); // 'c' → 2
    const absTo = translateVisibleToAbsolute(fullOrder, hidden, 2);   // 'd' → 3
    expect(absFrom).toBe(2);
    expect(absTo).toBe(3);
    const result = resolveReorder(fullOrder, fullOrder, absFrom, absTo);
    expect(result).toEqual(["a", "b", "d", "c"]);
  });
});
