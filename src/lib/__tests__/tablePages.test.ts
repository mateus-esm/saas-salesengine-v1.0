import { describe, expect, it } from "vitest";

import {
  flattenPages,
  nextOffset,
  patchRowInPages,
  removeRowsFromPages,
  type TablePages,
} from "../tablePages";

type Row = { id: string; name: string; owner_id?: string | null };

const pages = (...chunks: Row[][]): TablePages<Row> => ({
  pages: chunks,
  pageParams: chunks.map((_, i) => i * 2),
});

const r = (id: string, name = id): Row => ({ id, name });

describe("flattenPages", () => {
  it("joins the pages in order", () => {
    expect(flattenPages(pages([r("a"), r("b")], [r("c")])).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("gives an empty list before the first page arrives", () => {
    expect(flattenPages(undefined)).toEqual([]);
  });
});

describe("patchRowInPages", () => {
  it("patches the row wherever it is and leaves the others untouched", () => {
    const before = pages([r("a"), r("b")], [r("c")]);
    const after = patchRowInPages(before, "c", { owner_id: "u1" });
    expect(flattenPages(after)).toEqual([r("a"), r("b"), { id: "c", name: "c", owner_id: "u1" }]);
    expect(after?.pages[0]).toBe(before.pages[0]); // untouched page keeps its identity
    expect(after?.pageParams).toEqual(before.pageParams);
  });

  it("returns the same cache when the row is not loaded", () => {
    const before = pages([r("a")]);
    expect(patchRowInPages(before, "zzz", { name: "x" })).toBe(before);
  });

  it("passes undefined through", () => {
    expect(patchRowInPages<Row>(undefined, "a", { name: "x" })).toBeUndefined();
  });
});

describe("removeRowsFromPages", () => {
  it("removes every listed row across pages", () => {
    const after = removeRowsFromPages(pages([r("a"), r("b")], [r("c"), r("d")]), ["b", "c"]);
    expect(flattenPages(after).map((x) => x.id)).toEqual(["a", "d"]);
  });

  it("keeps empty pages so the offsets of later pages stay valid", () => {
    const after = removeRowsFromPages(pages([r("a")], [r("b")]), ["a"]);
    expect(after?.pages).toEqual([[], [r("b")]]);
    expect(after?.pageParams).toEqual([0, 2]);
  });

  it("passes undefined through", () => {
    expect(removeRowsFromPages<Row>(undefined, ["a"])).toBeUndefined();
  });
});

describe("nextOffset", () => {
  it("asks for the next offset when the last page was full", () => {
    expect(nextOffset([r("a"), r("b")], [[r("a"), r("b")]], 2)).toBe(2);
    expect(nextOffset([r("c"), r("d")], [[r("a"), r("b")], [r("c"), r("d")]], 2)).toBe(4);
  });

  it("stops when the last page came short", () => {
    expect(nextOffset([r("c")], [[r("a"), r("b")], [r("c")]], 2)).toBeUndefined();
    expect(nextOffset([], [[]], 50)).toBeUndefined();
  });
});
