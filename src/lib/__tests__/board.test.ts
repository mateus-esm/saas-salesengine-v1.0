import { describe, it, expect } from "vitest";
import {
  adjustSummaryForMove,
  cleanFilters,
  getNextPageOffset,
  normalizeBoardCard,
  prependCardToPages,
  removeCardFromPages,
  type BoardPages,
} from "../board";
import type { BoardCard, BoardStageSummary } from "@/types/board";

const card = (id: string, stageId = "s1", value: number | null = 100): BoardCard => ({
  id,
  equipe_id: "e",
  lead_id: `lead-${id}`,
  pipeline_id: "p",
  stage_id: stageId,
  value,
  currency: "BRL",
  status: "open",
  position: 0,
  custom_data: {},
  stage_entered_at: "2026-09-01T00:00:00Z",
  closed_at: null,
  lost_reason: null,
  owner_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  deleted_at: null,
  lead: null,
  owner_name: null,
  touchpoint_count: 0,
  icp_score: null,
  velocity: null,
  lead_score: null,
  companies: [],
});

const pagesOf = (...pages: BoardCard[][]): BoardPages => ({
  pages,
  pageParams: pages.map((_, i) => i * 30),
});

describe("removeCardFromPages", () => {
  it("removes the card from whichever page holds it and returns it", () => {
    const pages = pagesOf([card("a"), card("b")], [card("c"), card("d")]);
    const { pages: next, card: removed } = removeCardFromPages(pages, "c");
    expect(removed?.id).toBe("c");
    expect(next?.pages.map((p) => p.map((c) => c.id))).toEqual([["a", "b"], ["d"]]);
  });

  it("leaves the page params alone", () => {
    const pages = pagesOf([card("a")], [card("b")]);
    const { pages: next } = removeCardFromPages(pages, "a");
    expect(next?.pageParams).toEqual([0, 30]);
  });

  it("returns the input untouched when the card is not loaded", () => {
    const pages = pagesOf([card("a")]);
    const { pages: next, card: removed } = removeCardFromPages(pages, "zzz");
    expect(removed).toBeNull();
    expect(next).toBe(pages);
  });

  it("handles a column that has not loaded yet", () => {
    expect(removeCardFromPages(undefined, "a")).toEqual({ pages: undefined, card: null });
  });
});

describe("prependCardToPages", () => {
  it("puts the moved card at the top of the first page", () => {
    const pages = pagesOf([card("x", "s2")]);
    const next = prependCardToPages(pages, card("a", "s2"));
    expect(next?.pages[0].map((c) => c.id)).toEqual(["a", "x"]);
  });

  it("does not duplicate a card that is already there", () => {
    const pages = pagesOf([card("a", "s2"), card("x", "s2")]);
    const next = prependCardToPages(pages, card("a", "s2"));
    expect(next?.pages[0].map((c) => c.id)).toEqual(["a", "x"]);
  });

  it("leaves an unloaded column unloaded (its first fetch will include the card)", () => {
    expect(prependCardToPages(undefined, card("a"))).toBeUndefined();
  });
});

describe("adjustSummaryForMove", () => {
  const summary: BoardStageSummary[] = [
    { stage_id: "s1", count: 10, value_sum: 1000 },
    { stage_id: "s2", count: 2, value_sum: 50 },
  ];

  it("moves one count and the card's value between columns", () => {
    expect(adjustSummaryForMove(summary, "s1", "s2", 100)).toEqual([
      { stage_id: "s1", count: 9, value_sum: 900 },
      { stage_id: "s2", count: 3, value_sum: 150 },
    ]);
  });

  it("treats a card without value as zero value", () => {
    expect(adjustSummaryForMove(summary, "s1", "s2", null)).toEqual([
      { stage_id: "s1", count: 9, value_sum: 1000 },
      { stage_id: "s2", count: 3, value_sum: 50 },
    ]);
  });

  it("never lets a column go negative", () => {
    const empty: BoardStageSummary[] = [
      { stage_id: "s1", count: 0, value_sum: 0 },
      { stage_id: "s2", count: 0, value_sum: 0 },
    ];
    expect(adjustSummaryForMove(empty, "s1", "s2", 100)[0]).toEqual({ stage_id: "s1", count: 0, value_sum: 0 });
  });

  it("is a no-op for a same-column move", () => {
    expect(adjustSummaryForMove(summary, "s1", "s1", 100)).toBe(summary);
  });
});

describe("cleanFilters", () => {
  it("drops empty strings, empty arrays and undefined", () => {
    expect(
      cleanFilters({ search: "  ", owner_ids: [], tags: undefined, statuses: ["won"], value_min: 0 }),
    ).toEqual({ statuses: ["won"], value_min: 0 });
  });

  it("trims the search text", () => {
    expect(cleanFilters({ search: "  maria " })).toEqual({ search: "maria" });
  });

  it("gives the same object for no filters and blank filters (one cache entry)", () => {
    expect(cleanFilters({})).toEqual(cleanFilters({ search: "", owner_ids: [] }));
  });
});

describe("normalizeBoardCard", () => {
  it("fills defaults the server may leave null", () => {
    const raw = { ...card("a"), value: "1500.50", currency: null, custom_data: null, companies: null, touchpoint_count: null };
    const c = normalizeBoardCard(raw as unknown as Record<string, unknown>);
    expect(c.value).toBe(1500.5);
    expect(c.currency).toBe("BRL");
    expect(c.custom_data).toEqual({});
    expect(c.companies).toEqual([]);
    expect(c.touchpoint_count).toBe(0);
  });

  it("keeps a null value null (no fake zero)", () => {
    const c = normalizeBoardCard({ ...card("a"), value: null } as unknown as Record<string, unknown>);
    expect(c.value).toBeNull();
    expect(c.lead_score).toBeNull();
  });
});

describe("getNextPageOffset", () => {
  it("asks for the next offset while pages come back full", () => {
    expect(getNextPageOffset([card("a"), card("b")], [[card("x"), card("y")], [card("a"), card("b")]], 2)).toBe(4);
  });

  it("stops when a page comes back short", () => {
    expect(getNextPageOffset([card("a")], [[card("x"), card("y")], [card("a")]], 2)).toBeUndefined();
  });

  it("stops on an empty page", () => {
    expect(getNextPageOffset([], [[]], 30)).toBeUndefined();
  });
});
