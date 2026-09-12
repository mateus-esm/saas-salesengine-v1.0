import { describe, expect, it } from "vitest";

import type { CustomTableColumn } from "@/hooks/useCustomTables";

import {
  formEligibleColumns,
  formIsOn,
  formLinkState,
  normalizeFormConfig,
  publicFormErrorText,
  publicFormUrl,
} from "../publicForm";

const col = (field_id: string, type: CustomTableColumn["type"], extra: Partial<CustomTableColumn> = {}): CustomTableColumn => ({
  field_id,
  key: field_id,
  label: field_id,
  type,
  ...extra,
});

describe("formEligibleColumns (twin of _crm_form_field_types)", () => {
  it("offers what a stranger can type; not people, relations, lookups, files or removed columns", () => {
    const columns = [
      col("nome", "text"),
      col("renda", "currency"),
      col("civil", "select"),
      col("vendedor", "user"),
      col("usina", "relation"),
      col("cliente", "lookup"),
      col("rg", "file"),
      col("velho", "text", { is_deleted: true }),
    ];
    expect(formEligibleColumns(columns).map((c) => c.field_id)).toEqual(["nome", "renda", "civil"]);
  });
});

describe("normalizeFormConfig", () => {
  it("reads the table's configuration, and nothing as none", () => {
    expect(normalizeFormConfig({ enabled: true, title: "Dados", fields: [{ field_id: "a", required: true }, { x: 1 }] })).toEqual({
      enabled: true,
      title: "Dados",
      intro: "",
      fields: [{ field_id: "a", required: true }],
    });
    expect(normalizeFormConfig(null)).toBeNull();
    expect(formIsOn(normalizeFormConfig({ enabled: true, fields: [] }))).toBe(false);
    expect(formIsOn(normalizeFormConfig({ enabled: true, fields: [{ field_id: "a" }] }))).toBe(true);
  });
});

describe("the record's link", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  const link = { created_at: "2026-09-10T00:00:00Z", expires_at: "2026-10-10T00:00:00Z", submitted_at: null, revoked_at: null };

  it("is open, answered, run out, or none", () => {
    expect(formLinkState(null, now)).toBe("none");
    expect(formLinkState(link, now)).toBe("open");
    expect(formLinkState({ ...link, submitted_at: "2026-09-11T10:00:00Z" }, now)).toBe("submitted");
    expect(formLinkState({ ...link, expires_at: "2026-09-11T00:00:00Z" }, now)).toBe("expired");
    expect(formLinkState({ ...link, revoked_at: "2026-09-11T00:00:00Z" }, now)).toBe("none");
  });

  it("lives under /f/", () => {
    expect(publicFormUrl("https://app.test/", "abc")).toBe("https://app.test/f/abc");
  });
});

describe("publicFormErrorText", () => {
  it("names the field to fix, and says when the link is over", () => {
    expect(publicFormErrorText("required", "CPF")).toBe("Preencha “CPF”.");
    expect(publicFormErrorText("invalid_field", "Renda")).toMatch(/Renda/);
    expect(publicFormErrorText("form_submitted")).toMatch(/já foi enviado/);
    expect(publicFormErrorText("form_expired")).toMatch(/não vale mais/);
    expect(publicFormErrorText(undefined)).toMatch(/Tente de novo/);
  });
});
