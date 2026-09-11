// Sprint 11 · Onda 2 — pure helpers over the filter contract (src/types/crmFilters.ts).

import type { CustomFieldFilter } from "@/types/crmFilters";

const hasBound = (v: string | number | undefined) =>
  typeof v === "number" ? Number.isFinite(v) : typeof v === "string" && v.trim() !== "";

/**
 * Drops custom-field filters that have nothing to filter by — a half-built chip
 * in the filter bar must not change the request (nor the cache key). The server
 * ignores them too, but sending them would refetch every column for nothing.
 */
export function cleanCustomFilters(list: CustomFieldFilter[]): CustomFieldFilter[] {
  const out: CustomFieldFilter[] = [];
  for (const f of list) {
    if (!f || !f.field_id) continue;
    switch (f.op) {
      case "any_of": {
        const values = (f.values ?? []).filter((v) => v !== "");
        if (values.length) out.push({ field_id: f.field_id, op: f.op, values });
        break;
      }
      case "contains": {
        const value = (f.value ?? "").trim();
        if (value) out.push({ field_id: f.field_id, op: f.op, value });
        break;
      }
      case "between_number":
      case "between_date": {
        if (!hasBound(f.from) && !hasBound(f.to)) break;
        const next: CustomFieldFilter = { field_id: f.field_id, op: f.op };
        if (hasBound(f.from)) next.from = f.from;
        if (hasBound(f.to)) next.to = f.to;
        out.push(next);
        break;
      }
      case "is_true":
      case "is_false":
      case "empty":
      case "not_empty":
        out.push({ field_id: f.field_id, op: f.op });
        break;
      default:
        break;
    }
  }
  return out;
}
