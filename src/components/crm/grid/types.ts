export type ColumnKind =
  | "text" | "number" | "select" | "date" | "relation"
  | "formula" | "rollup" | "conditional"; // v2 slots — registered, not implemented

export type JsonbField =
  | "custom_fields" | "personal_custom_data" | "custom_data" | "record" | "data";

export interface ColumnDef {
  key: string;                 // native column name OR JSONB property key
  label: string;               // PT-BR header text
  kind: ColumnKind;
  source: "native" | "jsonb";
  jsonbField?: JsonbField;      // required when source === "jsonb"
  options?: { value: string; label: string }[]; // for kind "select"
  relation?: { table: string; displayField: string; linkTable?: string }; // for kind "relation"
  editable?: boolean;          // default true
  width?: number;
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
