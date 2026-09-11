// Sprint 11 — a custom field's key is its public name, and it never changes.
//
// Values live in custom_data[field_id]; the key is what webhooks, the dashboard
// and future integrations use to name the field. So it must be unique within the
// pipeline and fixed once created — only the label is renameable.

/** "Data de Instalação" → "data_de_instalacao" (≤ 40 chars, a-z 0-9 _). */
export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

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
