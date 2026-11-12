// Sprint 15 · T7 — every column kind has its own icon in the header.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpCircle } from "lucide-react";

import { columnIcon } from "../columnTypes";
import { RelationChips } from "../RelationChip";
import type { ColumnKind } from "../types";

// Every kind a ColumnDef can have: the field registry's types + relation + v2 slots.
const KINDS: ColumnKind[] = [
  "text", "file", "number", "currency", "date", "boolean", "select", "multi_select",
  "url", "phone", "address", "property_ref", "company_ref", "contact_ref", "user",
  "relation", "formula", "rollup", "conditional",
];

describe("columnIcon", () => {
  it.each(KINDS)("%s has its own icon", (kind) => {
    expect(columnIcon(kind)).not.toBe(HelpCircle);
  });

  it("an unknown type falls back to a generic icon", () => {
    expect(columnIcon("whatever")).toBe(HelpCircle);
  });
});

describe("RelationChips", () => {
  it("shows the first name and +N, with every name in the title", () => {
    render(<RelationChips chips={[{ toId: "a", label: "Empresa A" }, { toId: "b", label: "Empresa B" }, { toId: "c", label: "Empresa C" }]} />);
    expect(screen.getByText("Empresa A")).toBeTruthy();
    expect(screen.queryByText("Empresa B")).toBeNull();
    const more = screen.getByText("+2");
    expect(more.closest("[title]")?.getAttribute("title")).toBe("Empresa A, Empresa B, Empresa C");
  });

  it("one relation shows no counter", () => {
    render(<RelationChips chips={[{ toId: "a", label: "Empresa A" }]} />);
    expect(screen.getByText("Empresa A")).toBeTruthy();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });
});
