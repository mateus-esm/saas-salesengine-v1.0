// Sprint 11 — pure cache helpers for the server-side Kanban.
//
// Each column is its own infinite query (pages of cards from `crm_board_stage`),
// and the column totals come from `crm_board_summary`. A drag-and-drop move has
// to touch three caches at once — the source column's pages, the target column's
// pages and the summary — so the arithmetic lives here, tested, instead of
// inside a component.

import type { InfiniteData } from "@tanstack/react-query";
import type { BoardCard, BoardStageSummary } from "@/types/board";
import type { ContactFilters, CrmFilters, CustomFieldFilter } from "@/types/crmFilters";
import { cleanCustomFilters } from "@/lib/crmFilters";
import type { OpportunityStatus } from "@/types/pipelines";

/** One column's cache: pages of cards, keyed by the offset each page was fetched at. */
export type BoardPages = InfiniteData<BoardCard[], number>;

/**
 * Drops empty values so "no filter" has exactly one shape. `{}` and
 * `{ search: "" }` must hit the same cache entry and send the same request —
 * otherwise clearing the search box refetches every column for nothing.
 * Works for both filter shapes (CrmFilters and ContactFilters); half-built
 * custom-field filters are dropped too (Wave 2).
 */
export function cleanFilters<T extends CrmFilters | ContactFilters>(filters: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
      continue;
    }
    if (key === "custom" && Array.isArray(value)) {
      const custom = cleanCustomFilters(value as CustomFieldFilter[]);
      if (custom.length) out[key] = custom;
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length) out[key] = value;
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

/** Applies the defaults the rest of the app expects to a raw `crm_board_stage` row. */
export function normalizeBoardCard(raw: Record<string, unknown>): BoardCard {
  const value = raw.value;
  return {
    ...(raw as unknown as BoardCard),
    value: value === null || value === undefined ? null : Number(value),
    currency: (raw.currency as string) || "BRL",
    status: ((raw.status as OpportunityStatus) || "open"),
    position: (raw.position as number) ?? 0,
    custom_data: (raw.custom_data as Record<string, unknown>) || {},
    owner_id: (raw.owner_id as string) ?? null,
    lost_reason: (raw.lost_reason as string) ?? null,
    closed_at: (raw.closed_at as string) ?? null,
    lead: (raw.lead as BoardCard["lead"]) ?? null,
    owner_name: (raw.owner_name as string) ?? null,
    touchpoint_count: (raw.touchpoint_count as number) ?? 0,
    icp_score: (raw.icp_score as number) ?? null,
    velocity: (raw.velocity as number) ?? null,
    lead_score: (raw.lead_score as number) ?? null,
    companies: (raw.companies as BoardCard["companies"]) ?? [],
  };
}

/**
 * Removes a card from whichever loaded page holds it.
 * Page params are left as they were. The next page's offset is computed from the
 * cards actually held (getNextPageOffset), which is what the server's ordering
 * looks like once the move is saved: the column lost one card, so everything
 * after it shifted up by one.
 */
export function removeCardFromPages(
  pages: BoardPages | undefined,
  cardId: string,
): { pages: BoardPages | undefined; card: BoardCard | null } {
  if (!pages) return { pages: undefined, card: null };

  let removed: BoardCard | null = null;
  const nextPages = pages.pages.map((page) => {
    if (removed) return page;
    const idx = page.findIndex((c) => c.id === cardId);
    if (idx === -1) return page;
    removed = page[idx];
    return [...page.slice(0, idx), ...page.slice(idx + 1)];
  });

  if (!removed) return { pages, card: null };
  return { pages: { ...pages, pages: nextPages }, card: removed };
}

/**
 * Puts a moved card at the top of a column's first page.
 * An unloaded column stays unloaded — its first fetch will include the card.
 */
export function prependCardToPages(
  pages: BoardPages | undefined,
  card: BoardCard,
): BoardPages | undefined {
  if (!pages) return undefined;
  const [first = [], ...rest] = pages.pages;
  const withoutDup = first.filter((c) => c.id !== card.id);
  return { ...pages, pages: [[card, ...withoutDup], ...rest] };
}

/** Moves one card's count and value from one column's totals to another's. */
export function adjustSummaryForMove(
  summary: BoardStageSummary[],
  fromStageId: string,
  toStageId: string,
  value: number | null,
): BoardStageSummary[] {
  if (fromStageId === toStageId) return summary;
  const v = value ?? 0;
  return summary.map((s) => {
    if (s.stage_id === fromStageId) {
      if (s.count <= 0) return s;
      return { ...s, count: s.count - 1, value_sum: Math.max(0, s.value_sum - v) };
    }
    if (s.stage_id === toStageId) {
      return { ...s, count: s.count + 1, value_sum: s.value_sum + v };
    }
    return s;
  });
}

/** Offset of the next page, or undefined once a page comes back short. */
export function getNextPageOffset(
  lastPage: BoardCard[],
  allPages: BoardCard[][],
  pageSize: number,
): number | undefined {
  if (lastPage.length < pageSize) return undefined;
  return allPages.reduce((sum, page) => sum + page.length, 0);
}
