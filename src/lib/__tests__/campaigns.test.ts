import { describe, expect, it } from "vitest";

import {
  campaignDraftError,
  campaignErrorText,
  normalizeMatchKeys,
  normalizeOwnerRule,
  ownerRuleLabel,
  type CampaignDraft,
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
