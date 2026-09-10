// Sprint 11 — read past the API's 1,000-row cap.
//
// Supabase caps every query at `max_rows = 1000` and says nothing: the 1,001st
// row simply does not come back. Solo Energia has 1,259 deals and 1,253
// contacts, so every list built from a single `select("*")` was silently short.
//
// This asks for ranges until a page comes back short. The caller MUST order by a
// unique column last (e.g. `.order("id")`): with ties in the order — 1,259 deals
// all at position 0 — Postgres may hand back rows in a different order on each
// request, and pages would repeat or skip rows.

type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
