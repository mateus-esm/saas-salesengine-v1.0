import { describe, expect, it } from "vitest";

import { activeColumns, mapLinksToRows, newColumn, newColumnKey, toTableSort, withFieldIds } from "../customTables";
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

const col = (key: string, extra: Partial<CustomTableColumn> = {}): CustomTableColumn => ({
  field_id: `id-${key}`,
  key,
  label: key,
  type: "text",
  ...extra,
});

describe("newColumnKey", () => {
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
    const columns: CustomTableColumn[] = [col("a"), col("b", { is_deleted: true })];
    expect(activeColumns(columns).map((c) => c.key)).toEqual(["a"]);
  });
});

describe("withFieldIds", () => {
  it("keeps the field_id the database gave", () => {
    expect(withFieldIds([col("nome")])).toEqual([col("nome")]);
  });

  it("addresses a column read before the conversion by its key (its values are still there)", () => {
    expect(withFieldIds([{ key: "nome", label: "Nome", type: "text" }])).toEqual([
      { field_id: "nome", key: "nome", label: "Nome", type: "text" },
    ]);
  });

  it("reads a missing or broken schema as no columns", () => {
    expect(withFieldIds(null)).toEqual([]);
    expect(withFieldIds({ nome: "x" })).toEqual([]);
  });
});

describe("newColumn", () => {
  it("gets a field_id of its own and a key born from the label", () => {
    expect(newColumn([col("status")], "Status", "select", () => "f-1")).toEqual({
      field_id: "f-1",
      key: "status_2",
      label: "Status",
      type: "select",
    });
  });
});

describe("toTableSort", () => {
  const columns = [
    col("potencia", { type: "number" }),
    col("usina", { type: "relation" }),
    col("tags", { type: "multi_select" }),
    col("nome"),
  ];

  it("sorts a column by its field_id", () => {
    expect(toTableSort("id-potencia", "desc", columns)).toEqual({ field_id: "id-potencia", dir: "desc" });
    expect(toTableSort("id-nome", "asc", columns)).toEqual({ field_id: "id-nome", dir: "asc" });
  });

  it("does not sort relations, lists, unknown columns, or with no direction", () => {
    expect(toTableSort("id-usina", "asc", columns)).toBeNull();
    expect(toTableSort("id-tags", "asc", columns)).toBeNull();
    expect(toTableSort("id-sumiu", "asc", columns)).toBeNull();
    expect(toTableSort("id-nome", null, columns)).toBeNull();
  });
});
