// Filters live in the URL: shareable, and they survive a reload.
process.env.TZ = "America/Sao_Paulo";

import { describe, expect, it } from "vitest";

import {
  FILTER_PARAM_KEYS,
  contactFiltersToParams,
  crmFiltersToParams,
  dayToIso,
  isoToDay,
  paramToSort,
  paramsToContactFilters,
  paramsToCrmFilters,
  sortToParam,
} from "../crmFilterParams";
import type { ContactFilters, CrmFilters } from "@/types/crmFilters";

const U1 = "5114b000-0000-0000-0000-00000000000a";
const U2 = "5114b000-0000-0000-0000-00000000000b";
const F = "5114f100-0000-0000-0000-000000000001";

const roundTrip = (f: CrmFilters) => paramsToCrmFilters(new URLSearchParams(crmFiltersToParams(f).toString()));

describe("days in the URL, ISO in the filter", () => {
  it("a day starts at local midnight; an end day is exclusive (the next midnight)", () => {
    expect(dayToIso("2026-09-01")).toBe(new Date(2026, 8, 1).toISOString());
    expect(dayToIso("2026-09-30", true)).toBe(new Date(2026, 9, 1).toISOString());
    expect(isoToDay(new Date(2026, 9, 1).toISOString(), true)).toBe("2026-09-30");
    expect(isoToDay(new Date(2026, 8, 1).toISOString())).toBe("2026-09-01");
    expect(dayToIso("2026-02-31")).toBeNull();
  });
});

describe("deal filters round trip", () => {
  it("every key survives the URL", () => {
    const f: CrmFilters = {
      search: "maria silva",
      created_from: dayToIso("2026-09-01")!,
      created_to: dayToIso("2026-09-30", true)!,
      owner_ids: [U1, "none"],
      stage_ids: [U2],
      statuses: ["open", "won"],
      origin_categories: ["paid_social", "referral"],
      tags: ["solar, residencial", "vip"],
      value_min: 1000,
      value_max: 50000.5,
      next_contact: "overdue",
      custom: [
        { field_id: F, op: "any_of", values: ["Indicação", "Site|Blog", "a~b"] },
        { field_id: F, op: "contains", value: "telhado colonial" },
        { field_id: F, op: "between_number", from: 10 },
        { field_id: F, op: "between_date", from: dayToIso("2026-09-01")!, to: dayToIso("2026-09-30", true)! },
        { field_id: F, op: "is_true" },
        { field_id: F, op: "empty" },
      ],
    };
    expect(roundTrip(f)).toEqual(f);
  });

  it("a range with only one end", () => {
    expect(roundTrip({ created_to: dayToIso("2026-09-30", true)! })).toEqual({ created_to: dayToIso("2026-09-30", true) });
    expect(roundTrip({ value_min: 5 })).toEqual({ value_min: 5 });
    expect(roundTrip({ custom: [{ field_id: F, op: "between_number", to: 9 }] })).toEqual({
      custom: [{ field_id: F, op: "between_number", to: 9 }],
    });
  });

  it("the URL is readable", () => {
    const p = crmFiltersToParams({ owner_ids: [U1, "none"], value_min: 1000, next_contact: "today" });
    expect(p.get("resp")).toBe(`${U1},none`);
    expect(p.get("valor")).toBe("1000..");
    expect(p.get("prox")).toBe("today");
    expect(crmFiltersToParams({ created_from: dayToIso("2026-09-01")!, created_to: dayToIso("2026-09-30", true)! }).get("criado"))
      .toBe("2026-09-01..2026-09-30");
  });

  it("empty filters write nothing", () => {
    expect(crmFiltersToParams({}).toString()).toBe("");
  });

  it("writing filters replaces the old ones and keeps unrelated params (pipeline, view, sort)", () => {
    const p = new URLSearchParams("pipeline=abc&view=leads&q=velho&etapa=x&ordem=value.desc");
    crmFiltersToParams({ search: "novo" }, p);
    expect(p.get("pipeline")).toBe("abc");
    expect(p.get("view")).toBe("leads");
    expect(p.get("ordem")).toBe("value.desc");
    expect(p.get("q")).toBe("novo");
    expect(p.get("etapa")).toBeNull();
  });
});

describe("bad params are ignored, never thrown", () => {
  it("drops what it cannot read", () => {
    const f = paramsToCrmFilters(
      new URLSearchParams(
        "criado=ontem..amanha&valor=abc..&prox=semana&status=open,banana&cf=lixo&cf=" +
          encodeURIComponent(`${F}~nao_existe~x`) +
          "&resp=nao-e-uuid,none",
      ),
    );
    expect(f).toEqual({ statuses: ["open"], owner_ids: ["none"] });
  });
});

describe("contact filters round trip", () => {
  it("every key survives the URL, and resp means the deal's owner", () => {
    const f: ContactFilters = {
      search: "joão",
      created_from: dayToIso("2026-01-01")!,
      origin_categories: ["referral"],
      tags: ["vip"],
      next_contact: "week",
      relationship: ["cliente", "negociando"],
      pipeline_ids: [U2],
      deal_owner_ids: [U1, "none"],
    };
    expect(paramsToContactFilters(new URLSearchParams(contactFiltersToParams(f).toString()))).toEqual(f);
    expect(contactFiltersToParams(f).get("resp")).toBe(`${U1},none`);
  });
});

describe("sort", () => {
  it("round trips, including a custom field key", () => {
    expect(paramToSort(sortToParam({ key: "value", dir: "desc" }))).toEqual({ key: "value", dir: "desc" });
    expect(paramToSort(sortToParam({ key: `cf:${F}`, dir: "asc" }))).toEqual({ key: `cf:${F}`, dir: "asc" });
    expect(paramToSort(null)).toBeNull();
    expect(paramToSort("value.sideways")).toBeNull();
    expect(sortToParam(null)).toBeNull();
  });

  it("the sort param is one of the filter keys a tab switch clears", () => {
    expect(FILTER_PARAM_KEYS).toContain("ordem");
    expect(FILTER_PARAM_KEYS).toContain("cf");
  });
});
