import { describe, expect, it } from "vitest";

import { growthRange, overlaps } from "../growthPeriod";

const now = new Date(2026, 10, 23, 15, 0, 0);

describe("growthRange", () => {
  it("defaults to the last 30 days", () => {
    const r = growthRange(null, null, null, now);
    expect(r.period).toBe("30d");
    expect(r.fromDay).toBe("2026-10-25");
    expect(r.toDay).toBe("2026-11-23");
  });
  it("custom range is inclusive of the last day", () => {
    const r = growthRange("custom", "2026-11-01", "2026-11-10", now);
    expect(r.fromDay).toBe("2026-11-01");
    expect(r.toDay).toBe("2026-11-10");
    expect(new Date(r.to).getDate()).toBe(11);
    expect(r.label).toBe("01/11/2026 – 10/11/2026");
  });
  it("broken custom falls back to everything", () => {
    expect(growthRange("custom", "2026-11-10", "2026-11-01", now).period).toBe("all");
    expect(growthRange("all", null, null, now).fromDay).toBe("2000-01-01");
  });
  it("this month", () => {
    const r = growthRange("this_month", null, null, now);
    expect(r.fromDay).toBe("2026-11-01");
    expect(r.toDay).toBe("2026-11-30");
  });
});

describe("overlaps", () => {
  const range = { fromDay: "2026-11-01", toDay: "2026-11-30" };
  it("keeps experiments touching the period and undated ones", () => {
    expect(overlaps(null, null, range)).toBe(true);
    expect(overlaps("2026-10-15", "2026-11-02", range)).toBe(true);
    expect(overlaps("2026-12-01", null, range)).toBe(false);
    expect(overlaps(null, "2026-10-31", range)).toBe(false);
  });
});
