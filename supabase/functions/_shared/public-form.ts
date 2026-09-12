// Sprint 11 · Onda 4 · T45 — the pure parts of the public form endpoint.
//
// The person filling "Dados para Contrato" has only the link. The endpoint reads
// what the form shows and receives what was typed; the database validates each
// field. Here: read the request, and turn a database error into an HTTP answer
// the page understands.

export type PublicFormRequest =
  | { action: "get"; token: string }
  | { action: "submit"; token: string; values: Record<string, unknown> };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parsePublicFormRequest(raw: unknown): PublicFormRequest | { error: string } {
  if (!isObject(raw)) return { error: "body_must_be_object" };
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "token_required" };
  const action = raw.action ?? "get";
  if (action === "get") return { action, token };
  if (action === "submit") {
    if (!isObject(raw.values)) return { error: "values_required" };
    return { action, token, values: raw.values };
  }
  return { error: "unknown_action" };
}

/**
 * The database raises `form_expired`, `required:cpf`, `invalid_field:renda`…
 * → { status, error, field? } for the page (which names the field to fix).
 */
export function publicFormError(message: string): { status: number; error: string; field?: string } {
  const field = /(required|invalid_field):([A-Za-z0-9_]+)/.exec(message);
  if (field) return { status: 422, error: field[1], field: field[2] };
  for (const gone of ["form_submitted", "form_revoked", "form_expired"]) {
    if (message.includes(gone)) return { status: 410, error: gone };
  }
  if (message.includes("form_not_found")) return { status: 404, error: "form_not_found" };
  if (message.includes("invalid_values")) return { status: 422, error: "invalid_values" };
  return { status: 500, error: "internal_error" };
}
