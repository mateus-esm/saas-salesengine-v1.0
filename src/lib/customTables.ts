// Sprint 11 · Onda 2 · T21 — the pure parts of the custom tables.
//
// A relation column used to resolve its chips with a query per cell (two, in
// fact: the links, then the target records). Now each relation column asks twice
// for the whole table — its links, and the target table's records — and this
// joins them in the browser, delivered to the grid in the row (resolvedFromRow).

import type { CustomTableColumn } from "@/hooks/useCustomTables";

import { slugify, uniqueKey } from "./customFieldKeys";

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
