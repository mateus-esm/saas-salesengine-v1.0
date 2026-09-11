// Sprint 11 · Onda 2 — the grid's column handlers are the field-type registry.
//
// Format and parse come from src/lib/fields/registry.ts, so a value looks the
// same in the grid, on the card and in the filter chips. The only grid-specific
// rule: a native select column (stage, status) shows the option's label, not the
// id it stores.

import { getFieldType, type FieldContext } from "@/lib/fields/registry";

import type { ColumnDef, ColumnKind } from "./types";

export interface ColumnTypeHandler {
  kind: ColumnKind;
  format: (value: unknown, col: ColumnDef) => string;
  parse: (raw: string, col: ColumnDef) => unknown;
}

function contextOf(col: ColumnDef): FieldContext {
  return { ...col.context, options: col.options?.map((o) => o.value) };
}

function optionLabel(value: unknown, col: ColumnDef): string | null {
  if (!col.options || value === null || value === undefined) return null;
  return col.options.find((o) => o.value === value)?.label ?? null;
}

const passthrough = (kind: ColumnKind): ColumnTypeHandler => ({
  kind,
  format: (value) => (value === null || value === undefined ? "" : String(value)),
  parse: (raw) => raw,
});

export function getHandler(kind: ColumnKind): ColumnTypeHandler {
  if (kind === "relation" || kind === "formula" || kind === "rollup" || kind === "conditional") {
    return passthrough(kind);
  }
  const spec = getFieldType(kind);
  return {
    kind,
    format: (value, col) =>
      (kind === "select" ? optionLabel(value, col) : null) ?? spec.format(value, contextOf(col)),
    parse: (raw, col) => spec.parse(raw, contextOf(col)),
  };
}
