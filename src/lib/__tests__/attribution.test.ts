import { describe, expect, it } from "vitest";

import { categoryFrom, isPlatform, platformFrom, platformLabel } from "../attribution";

// The same cases as supabase/tests/sprint11_w5_attribution.test.sql §1: the two
// sides are copies, and a copy without a mirrored test drifts in silence.

describe("platformFrom (twin of _crm_platform_from)", () => {
  it("trusts a click ID first", () => {
    expect(platformFrom({ gclid: "x" }, "meta")).toBe("google");
    expect(platformFrom({ fbclid: "x" })).toBe("meta");
    expect(platformFrom({ ctwa_clid: "x" })).toBe("meta");
  });

  it("then the utm_source, whatever its case", () => {
    expect(platformFrom({ utm_source: "IG" })).toBe("meta");
    expect(platformFrom({ utm_source: "TikTok_Ads" })).toBe("tiktok");
    expect(platformFrom({ utm_source: "newsletter" })).toBe("email");
  });

  it("an unknown source is 'outra'; no evidence is the entry's", () => {
    expect(platformFrom({ utm_source: "parceiro_xyz" })).toBe("outra");
    expect(platformFrom({}, "site")).toBe("site");
    expect(platformFrom({})).toBeNull();
  });
});

describe("categoryFrom (twin of _crm_category_from)", () => {
  it("fbclid alone proves no ad", () => {
    expect(categoryFrom({ fbclid: "x" }, "meta")).toBeNull();
  });

  it("a paid click is paid search on Google, paid social elsewhere", () => {
    expect(categoryFrom({ gclid: "x" }, "google", "direct_brand")).toBe("paid_search");
    expect(categoryFrom({ utm_medium: "cpc" }, "meta")).toBe("paid_social");
    expect(categoryFrom({ utm_medium: "paid_search" }, "meta")).toBe("paid_search");
  });

  it("without proof, the entry's; then an organic medium", () => {
    expect(categoryFrom({}, null, "direct_brand")).toBe("direct_brand");
    expect(categoryFrom({ utm_medium: "organic" }, "google")).toBe("organic_search");
    expect(categoryFrom({ utm_medium: "social" }, "meta")).toBe("organic_social");
  });
});

describe("platform names", () => {
  it("names the platforms and knows only the closed list", () => {
    expect(platformLabel("meta")).toBe("Meta (Facebook/Instagram)");
    expect(platformLabel(null)).toBeNull();
    expect(isPlatform("google")).toBe(true);
    expect(isPlatform("orkut")).toBe(false);
  });
});
