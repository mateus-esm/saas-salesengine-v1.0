import type { ReactNode } from "react";

import type { FieldContext, FieldType } from "@/lib/fields/registry";

/**
 * A grid column is a field type from the registry (src/lib/fields/registry.ts),
 * or a relation. The v2 slots stay registered but are not implemented.
 */
export type ColumnKind =
  | FieldType
  | "relation"
  | "formula" | "rollup" | "conditional"; // v2 slots — registered, not implemented

export type JsonbField =
  | "custom_fields" | "personal_custom_data" | "custom_data" | "record" | "data";

export interface ColumnDef {
  key: string;                 // native column name OR JSONB property key
  label: string;               // PT-BR header text
  kind: ColumnKind;
  source: "native" | "jsonb";
  jsonbField?: JsonbField;      // required when source === "jsonb"
  options?: { value: string; label: string }[]; // for kind "select" / "multi_select"
  relation?: {
    table: string;
    displayField: string;
    linkTable?: string;
    /** UUID of the target custom table; present when the target is a virtual (custom_table_records) table. */
    targetTableId?: string;
    /** The chips already come in the row value ({ id, name }[]): no query per cell. */
    resolvedFromRow?: boolean;
  }; // for kind "relation"
  editable?: boolean;          // default true
  width?: number;
  /** Opens the record: the cell renders as a button. One per grid. */
  primary?: boolean;
  /** What the field type needs to show a value (member names for "user"). */
  context?: FieldContext;
  /**
   * A display-only column drawn by the screen (e.g. the deals of a contact as
   * chips). The cell is not editable and does no query of its own.
   */
  render?: (value: unknown, row: GridRow) => ReactNode;
}

export interface GridRow {
  id: string;
  equipe_id: string;
  [key: string]: unknown;
}

export type CellMutation = {
  rowId: string;
  column: ColumnDef;
  value: unknown;
};
