process.env.TZ = "America/Sao_Paulo";

import { describe, expect, it } from "vitest";

import { FIELD_TYPES, getFieldType } from "../registry";
import type { CustomFieldFilterOp } from "@/types/crmFilters";

const nameOf = (id: string) => (id === "u-1" ? "Luiz" : null);

describe("the registry covers every declared field type", () => {
  it("has one spec per type, with a PT-BR label", () => {
    const types = FIELD_TYPES.map((s) => s.type).sort();
    expect(types).toEqual(
      [
        "address", "boolean", "company_ref", "contact_ref", "currency", "date", "file",
        "multi_select", "number", "phone", "property_ref", "select", "text", "url", "user",
      ].sort(),
    );
    for (const s of FIELD_TYPES) expect(s.label.length).toBeGreaterThan(2);
  });

  it("falls back to text for an unknown type, without throwing", () => {
    expect(getFieldType("formula_v9").type).toBe("text");
    expect(getFieldType(undefined).type).toBe("text");
    expect(getFieldType("formula_v9").format(42)).toBe("42");
  });
});

describe("format", () => {
  it("number and currency in pt-BR", () => {
    expect(getFieldType("number").format(1234.5)).toBe("1.234,5");
    expect(getFieldType("currency").format(1234.56)).toBe("R$ 1.234,56");
    expect(getFieldType("currency").format("1500.5")).toBe("R$ 1.500,50");
    // Bad data stays visible instead of vanishing.
    expect(getFieldType("number").format("abc")).toBe("abc");
  });

  it("multi-select joins the items; select shows the value", () => {
    expect(getFieldType("multi_select").format(["Bateria", "Módulo"])).toBe("Bateria, Módulo");
    expect(getFieldType("select").format("Site")).toBe("Site");
  });

  it("yes/no", () => {
    const b = getFieldType("boolean");
    expect(b.format(true)).toBe("Sim");
    expect(b.format(false)).toBe("Não");
    expect(b.format("sim")).toBe("Sim");
    expect(b.format(null)).toBe("");
  });

  it("date shows the local day", () => {
    expect(getFieldType("date").format("2026-10-09T12:00:00-03:00")).toBe("09/10/2026");
  });

  it("user shows the member's name, and says so when the id is not a member", () => {
    const u = getFieldType("user");
    expect(u.format("u-1", { nameOf })).toBe("Luiz");
    expect(u.format("u-2", { nameOf })).toBe("Usuário removido");
    expect(u.format(null, { nameOf })).toBe("");
  });

  it("address is summarised on one line; refs and files never show raw ids", () => {
    expect(
      getFieldType("address").format({ street: "Rua A", number: "10", neighborhood: "Centro", city: "Fortaleza", state: "CE" }),
    ).toBe("Rua A, 10 – Centro – Fortaleza/CE");
    expect(getFieldType("company_ref").format("0b1e-uuid")).toBe("Vinculado");
    expect(getFieldType("file").format({ url: "https://x.test/files/proposta%20final.pdf" })).toBe("proposta final.pdf");
    expect(getFieldType("file").format({ name: "Contrato.pdf" })).toBe("Contrato.pdf");
  });

  it("phone is formatted", () => {
    expect(getFieldType("phone").format("5585992625840")).toMatch(/99262-5840/);
  });
});

describe("parse — from what the user typed to what is stored", () => {
  it("currency and number accept the Brazilian way of writing", () => {
    const c = getFieldType("currency");
    expect(c.parse("1.234,56")).toBe(1234.56);
    expect(c.parse("R$ 1.234,56")).toBe(1234.56);
    expect(c.parse("1234.56")).toBe(1234.56);
    expect(c.parse("1.234")).toBe(1234);
    expect(c.parse("")).toBeNull();
    expect(c.parse("abc")).toBeNull();
    expect(getFieldType("number").parse("12,5")).toBe(12.5);
  });

  it("multi-select from comma-separated text", () => {
    expect(getFieldType("multi_select").parse(" Bateria , Módulo ,")).toEqual(["Bateria", "Módulo"]);
    expect(getFieldType("multi_select").parse("")).toBeNull();
  });

  it("yes/no and empty text", () => {
    expect(getFieldType("boolean").parse("Sim")).toBe(true);
    expect(getFieldType("boolean").parse("false")).toBe(false);
    expect(getFieldType("boolean").parse("")).toBeNull();
    expect(getFieldType("text").parse("   ")).toBeNull();
    expect(getFieldType("text").parse(" oi ")).toBe("oi");
  });

  it("date from the date input is local midnight", () => {
    expect(getFieldType("date").parse("2026-03-14")).toBe(new Date(2026, 2, 14).toISOString());
  });
});

describe("isEmpty — the same empty as the SQL (_crm_is_empty)", () => {
  it("absent, null, blank text, [] and {} are empty; 0 and false are not", () => {
    const t = getFieldType("text");
    for (const v of [undefined, null, "", "   ", [], {}]) expect(t.isEmpty(v)).toBe(true);
    for (const v of [0, false, "a", ["x"]]) expect(t.isEmpty(v)).toBe(false);
  });
});

describe("filter operators and sorting — the same as the SQL accepts (T12/T13)", () => {
  const ops = (t: string): CustomFieldFilterOp[] => getFieldType(t).filterOps;

  it("each type gets the operators the server implements for it", () => {
    expect(ops("select")).toEqual(["any_of", "empty", "not_empty"]);
    expect(ops("multi_select")).toEqual(["any_of", "empty", "not_empty"]);
    expect(ops("user")).toEqual(["any_of", "empty", "not_empty"]);
    expect(ops("number")).toEqual(["between_number", "empty", "not_empty"]);
    expect(ops("currency")).toEqual(["between_number", "empty", "not_empty"]);
    expect(ops("date")).toEqual(["between_date", "empty", "not_empty"]);
    expect(ops("boolean")).toEqual(["is_true", "is_false", "empty"]);
    expect(ops("text")).toEqual(["contains", "empty", "not_empty"]);
    expect(ops("url")).toEqual(["contains", "empty", "not_empty"]);
    expect(ops("phone")).toEqual(["contains", "empty", "not_empty"]);
    expect(ops("address")).toEqual(["empty", "not_empty"]);
    expect(ops("file")).toEqual(["empty", "not_empty"]);
  });

  it("sorts the way crm_opp_table sorts a cf: key", () => {
    expect(getFieldType("number").sortAs).toBe("number");
    expect(getFieldType("currency").sortAs).toBe("number");
    expect(getFieldType("date").sortAs).toBe("date");
    for (const t of ["text", "url", "phone", "select"]) expect(getFieldType(t).sortAs).toBe("text");
    for (const t of ["multi_select", "user", "boolean", "address", "file", "company_ref"]) {
      expect(getFieldType(t).sortAs).toBeNull();
    }
  });

  it("address, files and refs are read-only in the grid (edited in the modal)", () => {
    for (const t of ["address", "file", "company_ref", "property_ref", "contact_ref"]) {
      expect(getFieldType(t).inlineEdit).toBeNull();
    }
    expect(getFieldType("multi_select").inlineEdit).toBe("multi_select");
    expect(getFieldType("user").inlineEdit).toBe("user");
  });
});
