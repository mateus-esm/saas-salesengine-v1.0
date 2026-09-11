import { describe, expect, it } from "vitest";

import { columnFromField } from "../columns";

describe("columnFromField", () => {
  it("a select column carries its options (the old grid built it without them)", () => {
    const col = columnFromField(
      { field_id: "f-1", key: "fonte", label: "Fonte", type: "select", options: ["Site", "Indicação"] },
      "custom_data",
    );
    expect(col).toMatchObject({
      key: "f-1",
      label: "Fonte",
      kind: "select",
      source: "jsonb",
      jsonbField: "custom_data",
      editable: true,
      options: [
        { value: "Site", label: "Site" },
        { value: "Indicação", label: "Indicação" },
      ],
    });
  });

  it("multi-select, user, currency and yes/no keep their own kind (not 'text')", () => {
    for (const type of ["multi_select", "user", "currency", "boolean", "url"]) {
      expect(columnFromField({ field_id: "f", key: "k", label: "L", type }, "custom_data").kind).toBe(type);
    }
  });

  it("address, files and refs are read-only in the grid", () => {
    for (const type of ["address", "file", "company_ref"]) {
      expect(columnFromField({ field_id: "f", key: "k", label: "L", type }, "custom_data").editable).toBe(false);
    }
  });

  it("contact fields are still addressed by key", () => {
    const col = columnFromField({ key: "cpf", label: "CPF", type: "text" }, "personal_custom_data", "key");
    expect(col.key).toBe("cpf");
    expect(col.jsonbField).toBe("personal_custom_data");
  });

  it("an unknown type becomes a text column instead of breaking the grid", () => {
    expect(columnFromField({ field_id: "f", key: "k", label: "L", type: "formula_v9" }, "custom_data").kind).toBe("text");
  });

  it("passes the field context (member names) to the cells", () => {
    const nameOf = () => "Luiz";
    expect(columnFromField({ field_id: "f", key: "k", label: "L", type: "user" }, "custom_data", "field_id", { nameOf }).context?.nameOf)
      .toBe(nameOf);
  });
});
