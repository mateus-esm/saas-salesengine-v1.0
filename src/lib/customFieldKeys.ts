// Sprint 11 — a custom field's key is its public name, and it never changes.
//
// Values live in custom_data[field_id]; the key is what webhooks, the dashboard
// and future integrations use to name the field. So it must be unique within the
// pipeline and fixed once created — only the label is renameable.

/**
 * `base`, or `base_2`, `base_3`… — the first one no field of the schema uses.
 * Pass every key in the schema, including soft-deleted fields: their values are
 * still stored, and reusing the key would resurface them in the new field.
 */
export function uniqueKey(existingKeys: string[], base: string): string {
  const root = base || "campo";
  const taken = new Set(existingKeys);
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
