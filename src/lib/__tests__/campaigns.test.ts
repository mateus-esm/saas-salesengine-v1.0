import { describe, expect, it } from "vitest";

import {
  campaignDraftError,
  campaignErrorText,
  normalizeMatchKeys,
  normalizeOwnerRule,
  ownerRuleLabel,
  reportRange,
  reportTotals,
  type CampaignDraft,
  type CampaignReportRow,
} from "../campaigns";

const draft = (extra: Partial<CampaignDraft> = {}): CampaignDraft => ({
  name: "Usina Verão",
  platform: "meta",
  origin_category: "paid_social",
  owner_id: null,
  goal_leads: null,
  goal_deals: null,
  goal_revenue: null,
  starts_on: null,
  ends_on: null,
  status: "active",
  match_keys: [],
  ...extra,
});

describe("normalizeMatchKeys (twin of crm_save_campaign)", () => {
  it("lower case, trimmed, no empty, no repeat, sorted — from a list or typed text", () => {
    expect(normalizeMatchKeys(["  Usina_Verao ", "usina_verao", "", "23850000000001"])).toEqual(["23850000000001", "usina_verao"]);
    expect(normalizeMatchKeys("usina_verao, Black_Friday\nbf;")).toEqual(["bf", "black_friday", "usina_verao"]);
  });
});

describe("campaignDraftError", () => {
  it("wants a name, dates in order and goals that are not negative", () => {
    expect(campaignDraftError(draft())).toBeNull();
    expect(campaignDraftError(draft({ name: "  " }))).toMatch(/nome/);
    expect(campaignDraftError(draft({ starts_on: "2026-09-10", ends_on: "2026-09-01" }))).toMatch(/fim/);
    expect(campaignDraftError(draft({ goal_leads: -1 }))).toMatch(/negativa/);
  });
});

describe("campaignErrorText", () => {
  it("says which key is taken", () => {
    expect(campaignErrorText("match_key_taken:usina_verao")).toBe("A chave “usina_verao” já está em outra campanha.");
    expect(campaignErrorText("owner_not_in_team")).toMatch(/equipe/);
  });
});

describe("owner rule", () => {
  const nameOf = (id: string) => ({ a: "Ana", b: "Bia" } as Record<string, string>)[id] ?? null;

  it("reads a rule the way the server keeps it", () => {
    expect(normalizeOwnerRule({ mode: "round_robin", user_ids: ["a", "b", "a", 3] })).toEqual({ mode: "round_robin", user_ids: ["a", "b"] });
    expect(normalizeOwnerRule({ mode: "sorteio", user_ids: ["a"] })).toEqual({ mode: "none", user_ids: [] });
    expect(normalizeOwnerRule(null)).toEqual({ mode: "none", user_ids: [] });
  });

  it("says who takes the deals", () => {
    expect(ownerRuleLabel({ mode: "round_robin", user_ids: ["a", "b"] }, nameOf)).toBe("Rodízio: Ana, Bia");
    expect(ownerRuleLabel({ mode: "fixed", user_ids: ["b"] }, nameOf)).toBe("Sempre Bia");
    expect(ownerRuleLabel({ mode: "fixed", user_ids: ["x"] }, nameOf)).toBe("Sempre Usuário removido");
    expect(ownerRuleLabel({ mode: "none", user_ids: [] }, nameOf)).toBe("Sem regra");
  });
});

describe("the report", () => {
  it("periods are [from, to) in local days", () => {
    const now = new Date(2026, 8, 12, 15, 0);
    expect(reportRange("this_month", now)).toEqual({ from: new Date(2026, 8, 1).toISOString(), to: new Date(2026, 9, 1).toISOString() });
    expect(reportRange("last_month", now).from).toBe(new Date(2026, 7, 1).toISOString());
    expect(reportRange("90d", now)).toEqual({ from: new Date(2026, 5, 15).toISOString(), to: new Date(2026, 8, 13).toISOString() });
    expect(reportRange("this_year", now).to).toBe(new Date(2027, 0, 1).toISOString());
  });

  const row = (extra: Partial<CampaignReportRow>): CampaignReportRow => ({
    campaign_id: "c", name: "c", platform: null, status: "active", goal_leads: null,
    leads: 0, deals: 0, wins: 0, losses: 0, revenue: 0, spend: 0,
    cpl: null, cost_per_win: null, win_rate: null, roas: null, roi: null, ...extra,
  });

  it("totals: sums, and ROAS/ROI/CPL only over the campaigns that had spend", () => {
    const t = reportTotals([
      row({ leads: 2, deals: 2, wins: 1, losses: 1, revenue: 10000, spend: 2500 }),
      row({ leads: 1, deals: 1, spend: 1000 }),
      row({ campaign_id: null, name: "Sem campanha", leads: 1, wins: 1, revenue: 5000 }),
    ]);
    expect(t).toMatchObject({ leads: 4, deals: 3, wins: 2, losses: 1, revenue: 15000, spend: 3500 });
    expect(t.roas).toBe(2.86);
    expect(t.roi).toBe(185.7);
    expect(t.cpl).toBe(1166.67);
    expect(t.cost_per_win).toBe(3500);
    expect(t.win_rate).toBe(66.7);
  });

  it("no spend, no ratios", () => {
    expect(reportTotals([row({ leads: 3, revenue: 100 })])).toMatchObject({ roas: null, roi: null, cpl: null, cost_per_win: null });
  });
});
