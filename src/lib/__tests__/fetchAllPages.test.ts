import { describe, it, expect, vi } from "vitest";
import { fetchAllPages } from "../fetchAllPages";

/** A fake table of `total` rows served in [from, to] ranges, like PostgREST. */
const pagerOver = (total: number) => {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
};

describe("fetchAllPages", () => {
  it("returns nothing for an empty table, in one request", async () => {
    const page = pagerOver(0);
    expect(await fetchAllPages(page)).toEqual([]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("asks once more when a page comes back exactly full", async () => {
    // 1,000 rows fill the first page; only an empty second page proves the end.
    const page = pagerOver(1000);
    const rows = await fetchAllPages(page);
    expect(rows).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("gets every row past the 1,000-row cap", async () => {
    const page = pagerOver(2500);
    const rows = await fetchAllPages(page);
    expect(rows).toHaveLength(2500);
    expect(rows[2499]).toEqual({ id: 2499 });
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("throws the error of a failing page instead of returning a partial list", async () => {
    const page = vi.fn(async (from: number) =>
      from === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }
        : { data: null, error: new Error("boom") },
    );
    await expect(fetchAllPages(page)).rejects.toThrow("boom");
  });

  it("respects a custom page size", async () => {
    const page = pagerOver(5);
    expect(await fetchAllPages(page, 2)).toHaveLength(5);
    expect(page).toHaveBeenCalledTimes(3);
  });
});
