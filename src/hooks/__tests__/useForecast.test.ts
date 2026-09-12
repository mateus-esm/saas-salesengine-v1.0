import { describe, it, expect } from "vitest";
import { computeRunRate, periodBounds } from "../useForecast";

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
