import { describe, expect, it } from "vitest";
import { readFilterList, toggleFilterValue } from "@/lib/reportFilters";

describe("toggleFilterValue", () => {
  it("adiciona e remove, e a chave some quando a lista esvazia", () => {
    const a = toggleFilterValue({}, "channels", "meta");
    expect(a).toEqual({ channels: ["meta"] });
    const b = toggleFilterValue(a, "channels", "google");
    expect(b.channels).toEqual(["meta", "google"]);
    const c = toggleFilterValue(toggleFilterValue(b, "channels", "meta"), "channels", "google");
    expect(c).toEqual({});
  });

  it("preserva chaves alheias", () => {
    const r = toggleFilterValue({ pipeline_ids: ["p"] }, "responsible_ids", "u1");
    expect(r).toEqual({ pipeline_ids: ["p"], responsible_ids: ["u1"] });
  });

  it("aceita filters nulo", () => {
    expect(toggleFilterValue(null, "channels", "x")).toEqual({ channels: ["x"] });
  });
});

describe("readFilterList", () => {
  it("ignora lixo", () => {
    expect(readFilterList({ channels: "meta" }, "channels")).toEqual([]);
    expect(readFilterList({ channels: ["a", 1, null] }, "channels")).toEqual(["a"]);
    expect(readFilterList(undefined, "channels")).toEqual([]);
  });
});
