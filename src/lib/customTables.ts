// Sprint 11 · Onda 2 · T21 — the pure parts of the custom tables.
//
// A relation column used to resolve its chips with a query per cell (two, in
// fact: the links, then the target records). Now each relation column asks twice
// for the whole table — its links, and the target table's records — and this
// joins them in the browser, delivered to the grid in the row (resolvedFromRow).

//
// Sprint 11 · Onda 4 · T39 — columns are addressed by `field_id` (the pipeline
// fields' contract): the value lives in data[field_id], the key is the public
// name at the edges. The server pages, searches and sorts (crm_custom_table_page).

import type { CustomTableColumn } from "@/hooks/useCustomTables";

import { slugify, uniqueKey } from "./customFieldKeys";
import { getFieldType } from "./fields/registry";

export interface CustomTableLinkRow {
  from_id: string;
  to_id: string;
}

export interface CustomTableTargetRecord {
  id: string;
  data: Record<string, unknown> | null;
}

export type RelationChips = { id: string; name: string }[];

const NO_NAME = "[registro]";

function labelOf(record: CustomTableTargetRecord, displayField: string): string {
  const raw = record.data?.[displayField];
  if (raw === null || raw === undefined) return NO_NAME;
  const text = String(raw).trim();
  return text || NO_NAME;
}

/**
 * Source row id → the chips of its links. A link whose target record is not in
 * `targetRecords` (deleted) is dropped; a repeated link shows once.
 */
export function mapLinksToRows(
  links: CustomTableLinkRow[],
  targetRecords: CustomTableTargetRecord[],
  displayField: string,
): Record<string, RelationChips> {
  const names = new Map(targetRecords.map((r) => [r.id, labelOf(r, displayField)]));
  const out: Record<string, RelationChips> = {};
  for (const link of links) {
    const name = names.get(link.to_id);
    if (name === undefined) continue;
    const chips = (out[link.from_id] ??= []);
    if (!chips.some((c) => c.id === link.to_id)) chips.push({ id: link.to_id, name });
  }
  return out;
}

/**
 * The key of a new column, born from its label. Removed columns count: their
 * values are still stored under the key, and reusing it would bring them back.
 */
export function newColumnKey(columns: CustomTableColumn[], label: string): string {
  return uniqueKey(
    columns.map((c) => c.key),
    slugify(label) || "coluna",
  );
}

/** The columns on screen (removed ones keep their key and values, hidden). */
export function activeColumns(columns: CustomTableColumn[]): CustomTableColumn[] {
  return columns.filter((c) => !c.is_deleted);
}

/**
 * Every column with its field_id. The database gives one to every column; a
 * column read before the conversion has none yet, and its values are still under
 * the key — so the key addresses it until then.
 */
export function withFieldIds(columns: unknown): CustomTableColumn[] {
  if (!Array.isArray(columns)) return [];
  return (columns as CustomTableColumn[]).map((c) => (c.field_id ? c : { ...c, field_id: c.key }));
}

/** A new column: its field_id never changes; its key is born from the label. */
export function newColumn(
  columns: CustomTableColumn[],
  label: string,
  type: CustomTableColumn["type"],
  newId: () => string = () => crypto.randomUUID(),
): CustomTableColumn {
  return { field_id: newId(), key: newColumnKey(columns, label), label, type };
}

export interface CustomTableSort {
  field_id: string;
  dir: "asc" | "desc";
}

/** The server's sort for a grid column, or null when the column does not sort (relations, lists, people). */
export function toTableSort(
  fieldId: string,
  dir: "asc" | "desc" | null,
  columns: CustomTableColumn[],
): CustomTableSort | null {
  if (!dir) return null;
  const col = columns.find((c) => c.field_id === fieldId);
  if (!col || col.type === "relation" || !getFieldType(col.type).sortAs) return null;
  return { field_id: fieldId, dir };
}
