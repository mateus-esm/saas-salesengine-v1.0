// Sprint 8.2 · discovery_q&a · T73 — as partes puras do discovery público.
//
// Gêmeo de _shared/public-form.ts: ler o pedido com desconfiança, e traduzir o
// erro que o banco levantou numa resposta que a página entende e sabe apontar.

export type DiscoveryRequest =
  | { action: "get"; token: string }
  | { action: "save"; token: string; answers: Record<string, unknown> }
  | { action: "submit"; token: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function parseDiscoveryRequest(raw: unknown): DiscoveryRequest | { error: string } {
  if (!isObject(raw)) return { error: "body_must_be_object" };
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "token_required" };

  const action = raw.action ?? "get";
  if (action === "get") return { action: "get", token };
  if (action === "submit") return { action: "submit", token };
  if (action === "save") {
    if (!isObject(raw.answers)) return { error: "answers_required" };
    return { action: "save", token, answers: raw.answers };
  }
  return { error: "unknown_action" };
}

/**
 * O banco levanta `required:empresa.o_que_vende`, `invalid_option:funil.ticket`,
 * `discovery_expired`… → { status, error, field? }, e a página rola até o campo.
 *
 * O ponto entra na classe do campo porque os códigos das perguntas são
 * pontuados (`agente.nome`); sem ele o nome do campo voltaria cortado e a página
 * rolaria até lugar nenhum.
 */
export function discoveryError(message: string): { status: number; error: string; field?: string } {
  const field = /(required|invalid_option):([A-Za-z0-9_.]+)/.exec(message);
  if (field) return { status: 422, error: field[1], field: field[2] };
  for (const gone of ["discovery_submitted", "discovery_expired"]) {
    if (message.includes(gone)) return { status: 410, error: gone };
  }
  if (message.includes("discovery_not_found")) return { status: 404, error: "discovery_not_found" };
  return { status: 500, error: "internal_error" };
}
