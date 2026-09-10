import { describe, it, expect } from "vitest";
import {
  buildPlacar,
  computeWinRate,
  computeAvgVelocityDays,
  computeRunRate,
  periodBounds,
  type PlacarOpp,
} from "../useForecast";

describe("periodBounds", () => {
  it("month: from the 1st to the 1st of next month", () => {
    const { start, end } = periodBounds("month", new Date(2026, 8, 10, 15, 0)); // 10/09/2026
    expect(start).toEqual(new Date(2026, 8, 1));
    expect(end).toEqual(new Date(2026, 9, 1));
  });

  it("quarter: Q3 runs July 1st to October 1st", () => {
    const { start, end } = periodBounds("quarter", new Date(2026, 8, 10));
    expect(start).toEqual(new Date(2026, 6, 1));
    expect(end).toEqual(new Date(2026, 9, 1));
  });
});

describe("buildPlacar", () => {
  const september = periodBounds("month", new Date(2026, 8, 10));
  const opp = (o: Partial<PlacarOpp>): PlacarOpp => ({
    status: "open",
    created_at: "2026-09-01T12:00:00",
    closed_at: null,
    owner_id: null,
    value: null,
    ...o,
  });

  it("counts a win or a loss only when it closed inside the period", () => {
    const p = buildPlacar(
      [
        opp({ status: "won", closed_at: "2026-09-05T12:00:00", value: 1000 }),
        opp({ status: "won", closed_at: "2026-08-20T12:00:00", value: 9999 }), // last month
        opp({ status: "lost", closed_at: "2026-09-06T12:00:00" }),
        opp({ status: "lost", closed_at: "2025-01-31T12:00:00" }), // history
      ],
      september,
    );
    expect(p.won).toBe(1);
    expect(p.lost).toBe(1);
    expect(p.won_revenue).toBe(1000);
    expect(p.win_rate).toBe(50);
  });

  it("does not count a win whose close date is unknown", () => {
    // Solo Energia imported 61 wins with no close date. Putting them in "this
    // month" is exactly the lie the old dashboard told.
    const p = buildPlacar([opp({ status: "won", closed_at: null, value: 500 })], september);
    expect(p.won).toBe(0);
    expect(p.won_revenue).toBe(0);
  });

  it("in progress is a snapshot: every open deal, whenever it was created", () => {
    const p = buildPlacar(
      [opp({ created_at: "2025-03-01T00:00:00" }), opp({}), opp({ status: "won", closed_at: "2026-09-02T00:00:00" })],
      september,
    );
    expect(p.in_progress).toBe(2);
  });

  it("reads money sent as text", () => {
    const p = buildPlacar([opp({ status: "won", closed_at: "2026-09-02T00:00:00", value: "1500.50" })], september);
    expect(p.won_revenue).toBe(1500.5);
  });

  it("splits by owner_id and leaves unowned deals out of the per-owner rows", () => {
    const p = buildPlacar(
      [
        opp({ status: "won", closed_at: "2026-09-02T00:00:00", owner_id: "mateus" }),
        opp({ status: "won", closed_at: "2026-09-03T00:00:00", owner_id: "mateus" }),
        opp({ status: "lost", closed_at: "2026-09-03T00:00:00", owner_id: "luiz" }),
        opp({ status: "open", owner_id: "luiz" }),
        opp({ status: "won", closed_at: "2026-09-04T00:00:00", owner_id: null }),
      ],
      september,
    );
    expect(p.owner_placar).toEqual({
      mateus: { won: 2, lost: 0, in_progress: 0 },
      luiz: { won: 0, lost: 1, in_progress: 1 },
    });
    expect(p.won).toBe(3);
  });

  it("empty pipeline: zeros and no fake rates", () => {
    const p = buildPlacar([], september);
    expect(p).toMatchObject({ won: 0, lost: 0, in_progress: 0, won_revenue: 0, win_rate: null, avg_velocity_days: null });
    expect(p.owner_placar).toEqual({});
  });
});

describe("computeWinRate", () => {
  it("returns percentage when there are decisions", () => {
    expect(computeWinRate(10, 5)).toBe(67);
  });
  it("returns null when no decisions", () => {
    expect(computeWinRate(0, 0)).toBeNull();
  });
  it("returns 100 when all won", () => {
    expect(computeWinRate(5, 0)).toBe(100);
  });
  it("returns 0 when all lost", () => {
    expect(computeWinRate(0, 5)).toBe(0);
  });
});

describe("computeAvgVelocityDays", () => {
  it("computes average correctly", () => {
    const opps = [
      { created_at: "2026-01-01T00:00:00Z", closed_at: "2026-01-11T00:00:00Z" },
      { created_at: "2026-02-01T00:00:00Z", closed_at: "2026-02-21T00:00:00Z" },
    ];
    expect(computeAvgVelocityDays(opps)).toBe(15);
  });
  it("returns null when no won opps", () => {
    expect(computeAvgVelocityDays([])).toBeNull();
  });
});

describe("computeRunRate", () => {
  it("computes correctly when on track", () => {
    // 5 won out of 10 target, 15 days elapsed out of 30
    expect(computeRunRate(5, 10, 15, 30)).toBe(100);
  });
  it("computes correctly when behind", () => {
    // 3 won out of 10 target, 15 days elapsed out of 30
    expect(computeRunRate(3, 10, 15, 30)).toBe(60);
  });
  it("returns null when target is 0", () => {
    expect(computeRunRate(5, 0, 15, 30)).toBeNull();
  });
  it("returns null when elapsed is 0", () => {
    expect(computeRunRate(5, 10, 0, 30)).toBeNull();
  });
});
