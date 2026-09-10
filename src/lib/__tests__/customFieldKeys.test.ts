import { describe, it, expect } from "vitest";
import { uniqueKey } from "../customFieldKeys";

describe("uniqueKey", () => {
  it("keeps the slug when nobody has it", () => {
    expect(uniqueKey(["valor", "cidade"], "tipo_de_telhado")).toBe("tipo_de_telhado");
  });

  it("appends _2, _3… when the slug is taken", () => {
    expect(uniqueKey(["telefone"], "telefone")).toBe("telefone_2");
    expect(uniqueKey(["telefone", "telefone_2"], "telefone")).toBe("telefone_3");
  });

  it("counts soft-deleted fields too — their data is still stored under that key", () => {
    // The caller passes every key in the schema, deleted or not. Reusing a
    // deleted field's key would make old values show up in the new field.
    expect(uniqueKey(["origem"], "origem")).toBe("origem_2");
  });

  it("falls back to 'campo' when the label produced no slug", () => {
    expect(uniqueKey([], "")).toBe("campo");
    expect(uniqueKey(["campo"], "")).toBe("campo_2");
  });
});
