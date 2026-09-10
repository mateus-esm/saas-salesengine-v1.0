// ============================================================================
// Sprint 11 · T8 — translate custom field names at the edge.
//
// A custom field value lives in opportunities.custom_data[field_id]. The card,
// the table, the form, the Copilot and the agent rules all read it there.
// Integrations (webhooks, n8n, the future API) name fields by their readable
// key, which is fixed once created. This is the one place that converts.
//
// Anything the schema does not declare is NOT dropped: it is kept under the key
// it arrived with, and reported, so the caller can log it. Dropping it would
// turn a mapping mistake into lost data; silently keeping it is how 98% of the
// custom values ended up invisible (measured 10/09/2026).
// ============================================================================

export interface SchemaField {
  field_id: string;
  key: string;
  label?: string;
  is_deleted?: boolean;
}

export function resolveCustomDataKeys(
  schema: SchemaField[] | null | undefined,
  data: Record<string, unknown>,
): { resolved: Record<string, unknown>; undeclared: string[] } {
  const live = (schema ?? []).filter((f) => !f.is_deleted);
  const byId = new Map(live.map((f) => [f.field_id, f.field_id]));
  const byKey = new Map(live.map((f) => [f.key, f.field_id]));

  const resolved: Record<string, unknown> = {};
  const undeclared: string[] = [];

  for (const [name, value] of Object.entries(data)) {
    const fieldId = byId.get(name) ?? byKey.get(name);
    if (fieldId) {
      resolved[fieldId] = value;
    } else {
      resolved[name] = value;
      undeclared.push(name);
    }
  }

  return { resolved, undeclared };
}
