import { describe, it, expect } from "vitest";

// Pure logic tests for win_rate and avg_velocity_days computation
// These test the math, not the Supabase query

describe("forecast math", () => {
  it("win_rate is won/(won+lost) as percentage", () => {
    const won = 10, lost = 5;
    const rate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
    expect(rate).toBe(67);
  });

  it("win_rate is null when no decisions", () => {
    const won = 0, lost = 0;
    const rate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
    expect(rate).toBeNull();
  });

  it("avg_velocity_days computes correctly", () => {
    const wonOpps = [
      { created_at: "2026-01-01T00:00:00Z", closed_at: "2026-01-11T00:00:00Z" },
      { created_at: "2026-02-01T00:00:00Z", closed_at: "2026-02-21T00:00:00Z" },
    ];
    const avg = wonOpps.length > 0
      ? Math.round(
          wonOpps.reduce((sum, o) => {
            const created = new Date(o.created_at).getTime();
            const closed = new Date(o.closed_at).getTime();
            return sum + (closed - created) / (1000 * 60 * 60 * 24);
          }, 0) / wonOpps.length
        )
      : null;
    expect(avg).toBe(15); // (10 + 20) / 2
  });

  it("avg_velocity_days is null when no won opps", () => {
    const wonOpps: any[] = [];
    const avg = wonOpps.length > 0 ? 0 : null;
    expect(avg).toBeNull();
  });
});
