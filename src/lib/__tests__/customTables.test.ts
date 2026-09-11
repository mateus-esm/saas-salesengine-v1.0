import { describe, expect, it } from "vitest";

import { activeColumns, mapLinksToRows, newColumnKey } from "../customTables";
import type { CustomTableColumn } from "@/hooks/useCustomTables";

const rec = (id: string, data: Record<string, unknown> | null) => ({ id, data });

describe("mapLinksToRows", () => {
  const targets = [rec("t1", { nome: "Solo Energia" }), rec("t2", { nome: "Casa Flow" }), rec("t3", { nome: "" })];

  it("gives each source row the chips of its links, named by the display field", () => {
    const links = [
      { from_id: "a", to_id: "t1" },
      { from_id: "a", to_id: "t2" },
      { from_id: "b", to_id: "t2" },
    ];
    expect(mapLinksToRows(links, targets, "nome")).toEqual({
      a: [
        { id: "t1", name: "Solo Energia" },
        { id: "t2", name: "Casa Flow" },
      ],
      b: [{ id: "t2", name: "Casa Flow" }],
    });
  });

  it("drops a link whose target record is gone (deleted, or in no page)", () => {
    expect(mapLinksToRows([{ from_id: "a", to_id: "gone" }], targets, "nome")).toEqual({});
  });

  it("names a target with no value in the display field", () => {
    expect(mapLinksToRows([{ from_id: "a", to_id: "t3" }], targets, "nome")).toEqual({
      a: [{ id: "t3", name: "[registro]" }],
    });
    expect(mapLinksToRows([{ from_id: "a", to_id: "t1" }], targets, "campo_que_nao_existe")).toEqual({
      a: [{ id: "t1", name: "[registro]" }],
    });
    expect(mapLinksToRows([{ from_id: "a", to_id: "x" }], [rec("x", null)], "nome")).toEqual({
      a: [{ id: "x", name: "[registro]" }],
    });
  });

  it("shows a repeated link once", () => {
    const links = [
      { from_id: "a", to_id: "t1" },
      { from_id: "a", to_id: "t1" },
    ];
    expect(mapLinksToRows(links, targets, "nome")).toEqual({ a: [{ id: "t1", name: "Solo Energia" }] });
  });

  it("writes numbers and other values as text", () => {
    expect(mapLinksToRows([{ from_id: "a", to_id: "n" }], [rec("n", { codigo: 42 })], "codigo")).toEqual({
      a: [{ id: "n", name: "42" }],
    });
  });
});

describe("newColumnKey", () => {
  const col = (key: string, extra: Partial<CustomTableColumn> = {}): CustomTableColumn => ({
    key,
    label: key,
    type: "text",
    ...extra,
  });

  it("is born from the label", () => {
    expect(newColumnKey([], "Data de Instalação")).toBe("data_de_instalacao");
  });

  it("never reuses a key, not even a removed column's (its values are still stored)", () => {
    const columns = [col("status"), col("status_2", { is_deleted: true })];
    expect(newColumnKey(columns, "Status")).toBe("status_3");
  });

  it("falls back to a generic key when the label has no letters", () => {
    expect(newColumnKey([], "!!!")).toBe("coluna");
  });
});

describe("activeColumns", () => {
  it("hides removed columns", () => {
    const columns: CustomTableColumn[] = [
      { key: "a", label: "A", type: "text" },
      { key: "b", label: "B", type: "text", is_deleted: true },
    ];
    expect(activeColumns(columns).map((c) => c.key)).toEqual(["a"]);
  });
});
