import { describe, expect, it } from "vitest";

import {
  adDraftError,
  adMissing,
  adRatios,
  clampIce,
  creativeCodeOf,
  emptyAdDraft,
  experimentHit,
  experimentValue,
  growthErrorText,
  iceScore,
  normalizeCreativeCode,
  sumReport,
  type AdsReportBase,
} from "../growth";

const base = (p: Partial<AdsReportBase> = {}): AdsReportBase => ({
  spend: 0, impressions: 0, reach: 0, clicks: 0, video_3s: 0, thruplays: 0,
  platform_leads: 0, conversations: 0, leads: 0, deals: 0, wins: 0, revenue: 0, ...p,
});

describe("creative codes", () => {
  it("normalizes and validates P000-V0", () => {
    expect(normalizeCreativeCode(" p002-v3 ")).toBe("P002-V3");
    expect(normalizeCreativeCode("carmona")).toBeNull();
    expect(normalizeCreativeCode("P02-V3")).toBeNull();
  });
  it("reads the code only at the start (twin of _crm_creative_code)", () => {
    expect(creativeCodeOf("P002-V3 | Carmona")).toBe("P002-V3");
    expect(creativeCodeOf("p002-v3_120211")).toBe("P002-V3");
    expect(creativeCodeOf("Carmona P002-V3")).toBeNull();
    expect(creativeCodeOf(null)).toBeNull();
  });
});

describe("ads", () => {
  it("needs something the lead will carry", () => {
    expect(adDraftError(emptyAdDraft())).toMatch(/ID do anúncio/);
    expect(adDraftError({ ...emptyAdDraft(), prefill_message: "Oi!" })).toBeNull();
    expect(adDraftError({ ...emptyAdDraft(), external_ad_id: "12 34" })).toMatch(/estranhos/);
    expect(adDraftError({ ...emptyAdDraft(), ad_name: "x", starts_on: "2026-11-20", ends_on: "2026-11-01" })).toMatch(/fim/);
  });
  it("lists what is missing", () => {
    expect(adMissing({ campaign_id: null, creative_id: "c", destination: null })).toEqual(["campanha", "destino"]);
  });
  it("puts database errors in words", () => {
    expect(growthErrorText("match_key_taken:120210")).toMatch(/120210/);
    expect(growthErrorText("prefill_taken")).toMatch(/mensagem padrão/);
    expect(growthErrorText("creative_code_taken:P002-V3")).toMatch(/P002-V3/);
  });
});

describe("adRatios", () => {
  it("computes the doc's metrics", () => {
    const r = adRatios(base({ spend: 100, impressions: 20000, reach: 5000, clicks: 300, video_3s: 6000, thruplays: 1500, conversations: 20, leads: 10, wins: 2, revenue: 5000 }));
    expect(r.cpm).toBe(5);
    expect(r.frequency).toBe(4);
    expect(r.hook_rate).toBe(30);
    expect(r.retention).toBe(25);
    expect(r.ctr).toBe(1.5);
    expect(r.cost_per_contact).toBe(5);
    expect(r.cpl).toBe(10);
    expect(r.cost_per_win).toBe(50);
    expect(r.roas).toBe(50);
  });
  it("never divides by zero", () => {
    const { roas, ...rest } = adRatios(base({ spend: 10 }));
    expect(Object.values(rest).every((v) => v === null)).toBe(true);
    expect(roas).toBe(0);
    expect(adRatios(base()).roas).toBeNull();
  });
  it("sums rows", () => {
    expect(sumReport([base({ spend: 1.1, leads: 1 }), base({ spend: 2.2, leads: 2 })])).toMatchObject({ spend: 3.3, leads: 3 });
  });
});

describe("experiments", () => {
  it("ICE needs the three, clamps 1–10", () => {
    expect(iceScore({ ice_impact: 8, ice_confidence: 5, ice_ease: 10 })).toBe(400);
    expect(iceScore({ ice_impact: 8, ice_confidence: null, ice_ease: 10 })).toBeNull();
    expect(clampIce(15)).toBe(10);
    expect(clampIce(0)).toBe(1);
    expect(clampIce(null)).toBeNull();
  });
  it("value is live from Rev, or the manual result", () => {
    const live = { leads: 10, deals: 4, wins: 2, revenue: 9000, spend: 300 };
    expect(experimentValue({ metric: "cpl", live, result_value: null })).toBe(30);
    expect(experimentValue({ metric: "roas", live, result_value: null })).toBe(30);
    expect(experimentValue({ metric: "custom", live, result_value: 7 })).toBe(7);
    expect(experimentValue({ metric: "leads", live: null, result_value: 3 })).toBe(3);
  });
  it("hit respects lower-is-better", () => {
    const live = { leads: 10, deals: 4, wins: 2, revenue: 9000, spend: 300 };
    expect(experimentHit({ metric: "cpl", live, result_value: null, target: 35 })).toBe(true);
    expect(experimentHit({ metric: "cpl", live, result_value: null, target: 25 })).toBe(false);
    expect(experimentHit({ metric: "leads", live, result_value: null, target: 12 })).toBe(false);
    expect(experimentHit({ metric: "leads", live, result_value: null, target: null })).toBeNull();
  });
});
