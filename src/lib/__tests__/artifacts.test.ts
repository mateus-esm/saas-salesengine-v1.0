import { describe, expect, it } from "vitest";

import type { CustomTableColumn } from "@/hooks/useCustomTables";

import {
  artifactKindLabel,
  artifactMilestone,
  artifactStatusesFor,
  artifactStatusOf,
  isArtifactKind,
  milestoneLabel,
  recordTitle,
} from "../artifacts";

const col = (field_id: string, extra: Partial<CustomTableColumn> = {}): CustomTableColumn => ({
  field_id,
  key: field_id,
  label: field_id,
  type: "text",
  ...extra,
});

describe("artifact kind", () => {
  it("names each kind, one and many", () => {
    expect(artifactKindLabel("proposal")).toBe("Proposta");
    expect(artifactKindLabel("contract", true)).toBe("Contratos");
    expect(artifactKindLabel(null)).toBeNull();
  });

  it("knows only the three kinds", () => {
    expect(isArtifactKind("document")).toBe(true);
    expect(isArtifactKind("invoice")).toBe(false);
    expect(isArtifactKind(null)).toBe(false);
  });
});

describe("artifactStatusOf", () => {
  it("keeps a known status and reads anything else as a draft", () => {
    expect(artifactStatusOf("signed")).toBe("signed");
    expect(artifactStatusOf(null)).toBe("draft");
    expect(artifactStatusOf("toString")).toBe("draft");
  });
});

describe("recordTitle", () => {
  const columns = [
    col("rel", { type: "relation" }),
    col("gone", { is_deleted: true }),
    col("titulo"),
    col("valor", { type: "currency" }),
  ];

  it("is the first column with a value, relations and removed columns aside", () => {
    expect(recordTitle({ rel: "x", gone: "Antigo", titulo: "Proposta 7" }, columns)).toBe("Proposta 7");
  });

  it("skips empty columns and writes the value by its type", () => {
    expect(recordTitle({ titulo: "  ", valor: 45000 }, columns)).toMatch(/^R\$\s?45\.000,00$/);
  });

  it("names by a lookup when it comes first (what it reads from the deal)", () => {
    const withLookup = [col("cliente", { type: "lookup", lookupConfig: { source: "contact.name" } }), col("titulo")];
    expect(recordTitle({ cliente: "Usina do João", titulo: "P-7" }, withLookup)).toBe("Usina do João");
    expect(recordTitle({ titulo: "P-7" }, withLookup)).toBe("P-7");
  });

  it("falls back when nothing has a value", () => {
    expect(recordTitle({}, columns)).toBe("Sem título");
    expect(recordTitle(null, columns, undefined, "Registro")).toBe("Registro");
  });
});

describe("the lifecycle (the database's twin)", () => {
  it("offers each kind its own statuses: a proposal is not signed, a contract is not accepted", () => {
    expect(artifactStatusesFor("proposal")).toEqual(["draft", "sent", "accepted", "rejected"]);
    expect(artifactStatusesFor("contract")).toEqual(["draft", "sent", "signed", "rejected"]);
    expect(artifactStatusesFor("document")).toContain("signed");
    expect(artifactStatusesFor(null)).toEqual([]);
  });

  it("names the milestone a status proves", () => {
    expect(artifactMilestone("proposal", "sent")).toBe("proposal_sent");
    expect(artifactMilestone("contract", "signed")).toBe("contract_signed");
    expect(artifactMilestone("proposal", "accepted")).toBeNull();
    expect(artifactMilestone("document", "sent")).toBeNull();
    expect(milestoneLabel("contract_sent")).toBe("Contrato enviado");
  });
});
