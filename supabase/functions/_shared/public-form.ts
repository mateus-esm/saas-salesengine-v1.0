// Sprint 11 · Onda 4 · T45 — the pure parts of the public form endpoint.
//
// The person filling "Dados para Contrato" has only the link. The endpoint reads
// what the form shows and receives what was typed; the database validates each
// field. Here: read the request, and turn a database error into an HTTP answer
// the page understands.

// SE-SUP1-7: `kind` is optional. "intake" (the lead/deal forms of crm_forms) is
// chosen by the page after it learned the kind from `get`; absent = the contract form
// ("Dados para Contrato"), exactly as before. `get` has no kind: the function tries intake
// first and falls back to the contract form (same /f/:token link).
export type PublicFormKind = "contract" | "intake";

export type PublicFormRequest =
  | { action: "get"; token: string }
  | { action: "submit"; token: string; values: Record<string, unknown>; kind: PublicFormKind };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parsePublicFormRequest(raw: unknown): PublicFormRequest | { error: string } {
  if (!isObject(raw)) return { error: "body_must_be_object" };
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "token_required" };
  const action = raw.action ?? "get";
  if (action === "get") return { action, token };
  if (action === "submit") {
    if (!isObject(raw.values)) return { error: "values_required" };
    if (raw.kind !== undefined && raw.kind !== "contract" && raw.kind !== "intake") return { error: "unknown_kind" };
    return { action, token, values: raw.values, kind: raw.kind === "intake" ? "intake" : "contract" };
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
  if (message.includes("rate_limited")) return { status: 429, error: "rate_limited" };
  if (message.includes("form_not_found")) return { status: 404, error: "form_not_found" };
  if (message.includes("invalid_values")) return { status: 422, error: "invalid_values" };
  return { status: 500, error: "internal_error" };
}
