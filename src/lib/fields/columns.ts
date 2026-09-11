// Sprint 11 · Onda 2 · T15 — a declared field becomes a grid column in one place.
//
// Before, OpportunityTable and DatabaseView each had their own `toColumnKind`,
// which turned everything that was not number/select/date into "text" and built
// Select columns without their options.

import type { ColumnDef, JsonbField } from "@/components/crm/grid/types";

import { getFieldType, type FieldContext } from "./registry";

export interface FieldLike {
  /** Pipeline fields are addressed by field_id (the Sprint 11 contract). */
  field_id?: string;
  /** Contact fields and custom tables still use the key, until v1.2. */
  key: string;
  label: string;
  type: string;
  options?: string[];
}

export function columnFromField(
  field: FieldLike,
  jsonbField: JsonbField,
  addressBy: "field_id" | "key" = "field_id",
  context?: FieldContext,
): ColumnDef {
  const spec = getFieldType(field.type);
  return {
    key: addressBy === "field_id" ? field.field_id ?? field.key : field.key,
    label: field.label,
    kind: spec.type,
    source: "jsonb",
    jsonbField,
    options: field.options?.map((o) => ({ value: o, label: o })),
    editable: spec.inlineEdit !== null,
    context,
  };
}
