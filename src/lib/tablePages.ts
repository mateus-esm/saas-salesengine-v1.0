// Sprint 11 · Onda 2 — pure cache helpers for the server-side tables.
//
// The Leads table and the contact base are infinite queries: pages of rows from
// `crm_opp_table` / `crm_contacts_table`, keyed by the offset each page was
// fetched at. An inline edit or a bulk action changes the cached pages before the
// server answers (and puts them back on error), so the arithmetic lives here,
// tested, instead of inside a component.

import type { InfiniteData } from "@tanstack/react-query";

/** One table's cache: pages of rows, keyed by offset. */
export type TablePages<T> = InfiniteData<T[], number>;

export function flattenPages<T>(pages: TablePages<T> | undefined): T[] {
  return pages ? pages.pages.flat() : [];
}

/** Applies `patch` to the row with this id, wherever it is loaded. */
export function patchRowInPages<T extends { id: string }>(
  pages: TablePages<T> | undefined,
  id: string,
  patch: Partial<T>,
): TablePages<T> | undefined {
  if (!pages) return pages;
  let found = false;
  const next = pages.pages.map((page) => {
    if (!page.some((row) => row.id === id)) return page;
    found = true;
    return page.map((row) => (row.id === id ? { ...row, ...patch } : row));
  });
  return found ? { ...pages, pages: next } : pages;
}

/**
 * Removes rows from the loaded pages. Emptied pages are kept: the next page is
 * fetched at an offset computed from the pages loaded, and dropping one would
 * shift it. The refetch after the mutation settles the offsets for real.
 */
export function removeRowsFromPages<T extends { id: string }>(
  pages: TablePages<T> | undefined,
  ids: string[],
): TablePages<T> | undefined {
  if (!pages) return pages;
  const drop = new Set(ids);
  return { ...pages, pages: pages.pages.map((page) => page.filter((row) => !drop.has(row.id))) };
}

/** The offset of the next page, or undefined when the last one came short. */
export function nextOffset<T>(lastPage: T[], allPages: T[][], pageSize: number): number | undefined {
  if (lastPage.length < pageSize) return undefined;
  return allPages.reduce((sum, page) => sum + page.length, 0);
}
