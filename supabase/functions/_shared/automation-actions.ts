// ============================================================================
// Sprint Suporte 1 · Onda 5 — a ação declarada num webhook de ENTRADA.
//
// webhook_configs.action = {type, params}. Aqui ela é resolvida contra o payload
// que chegou, e o resultado (valores literais) é o que crm_run_automation executa
// no banco — as RPCs de mover etapa / responsável / campo continuam sendo as
// únicas que escrevem. Função pura: sem rede, sem banco.
//
// params por tipo (cada valor é literal OU lido do payload):
//   move_stage      stage_id | {source, map: {valor-do-payload: stage_id}}
//   update_field    field (key ou field_id) + value | source
//   set_responsible user_id | {source, map}
//   call_webhook    webhook_id
// ============================================================================

export const ACTION_TYPES = ["move_stage", "update_field", "set_responsible", "call_webhook"] as const;
export type AutomationActionType = (typeof ACTION_TYPES)[number];

export type ResolvedAction = { type: AutomationActionType; params: Record<string, unknown> };
export type ResolveResult = { ok: true; action: ResolvedAction } | { ok: false; reason: string };

/** Lê "a.b.c" de um objeto; undefined se qualquer degrau faltar. */
export function valueAtPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Valor de params: literal (`literalKey`) ou lido do payload (`source`), com `map` opcional. */
function pick(
  params: Record<string, unknown>,
  literalKey: string,
  payload: Record<string, unknown>,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (params[literalKey] !== undefined && params[literalKey] !== null && params[literalKey] !== "") {
    return { ok: true, value: params[literalKey] };
  }
  const source = typeof params.source === "string" ? params.source : "";
  if (!source) return { ok: false, reason: `${literalKey}_required` };
  const raw = valueAtPath(payload, source);
  if (raw === undefined || raw === null || raw === "") return { ok: false, reason: "source_missing" };
  const map = params.map;
  if (map && typeof map === "object") {
    const hit = Object.entries(map as Record<string, unknown>).find(([k]) => norm(k) === norm(raw));
    return hit ? { ok: true, value: hit[1] } : { ok: false, reason: `${literalKey === "stage_id" ? "stage" : "value"}_unmapped` };
  }
  return { ok: true, value: raw };
}

export function resolveInboundAction(action: unknown, payload: Record<string, unknown>): ResolveResult {
  if (!action || typeof action !== "object") return { ok: false, reason: "no_action" };
  const { type, params: rawParams } = action as { type?: unknown; params?: unknown };
  if (!ACTION_TYPES.includes(type as AutomationActionType)) return { ok: false, reason: "unknown_type" };
  const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>;

  switch (type as AutomationActionType) {
    case "move_stage": {
      const r = pick(params, "stage_id", payload);
      return r.ok ? { ok: true, action: { type: "move_stage", params: { stage_id: r.value } } } : r;
    }
    case "set_responsible": {
      const r = pick(params, "user_id", payload);
      return r.ok ? { ok: true, action: { type: "set_responsible", params: { user_id: r.value } } } : r;
    }
    case "update_field": {
      if (typeof params.field !== "string" || !params.field) return { ok: false, reason: "field_required" };
      if (params.value !== undefined) {
        return { ok: true, action: { type: "update_field", params: { field: params.field, value: params.value } } };
      }
      const raw = typeof params.source === "string" ? valueAtPath(payload, params.source) : undefined;
      if (raw === undefined) return { ok: false, reason: "source_missing" };
      return { ok: true, action: { type: "update_field", params: { field: params.field, value: raw } } };
    }
    case "call_webhook": {
      if (typeof params.webhook_id !== "string" || !params.webhook_id) return { ok: false, reason: "webhook_required" };
      return { ok: true, action: { type: "call_webhook", params: { webhook_id: params.webhook_id } } };
    }
  }
}

/** Chave de idempotência da chegada: o mesmo corpo no mesmo webhook é o mesmo evento. */
export async function inboundEventKey(configId: string, payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(`${configId}:${JSON.stringify(payload ?? null)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return "inbound:" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * O que o chamador anônimo do webhook pode ver de uma execução: só o status (e o
 * motivo de uma ação ignorada, que vem de uma lista fixa). Texto de erro do banco fica
 * em automation_runs.
 */
export function publicRunResult(data: unknown, rpcFailed: boolean): Record<string, unknown> {
  if (rpcFailed || !data || typeof data !== "object") return { status: "error" };
  const d = data as Record<string, unknown>;
  const status = ["ok", "skipped", "error"].includes(String(d.status)) ? String(d.status) : "error";
  const reason = status === "skipped" && typeof d.reason === "string" ? { reason: d.reason } : {};
  return { status, ...reason };
}
