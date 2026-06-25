import { describe, it, expect } from "vitest";
import { computeWinRate, computeAvgVelocityDays, computeRunRate } from "../useForecast";

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
