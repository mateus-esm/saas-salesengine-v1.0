// SE-SUP1-2 (#16) — a janela de Instagram/Messenger é regra da Meta, não do
// provedor: 24 h desde a última mensagem do CLIENTE. Espelha
// src/lib/service-window.ts (módulo do front, fora do alcance do Deno); se uma
// mudar, a outra muda junto. A extensão HUMAN_AGENT (7 d) fica desligada até a
// sonda viva (Planning/AppOps/Support/sprint_suporte_1_plano.md, "Sonda pendente").

export const META_WINDOW_MS = 24 * 60 * 60 * 1000
export const META_HUMAN_AGENT_WINDOW_MS = 0

export function isMetaChannel(channel: string | null | undefined): boolean {
  const c = (channel ?? '').trim().toLowerCase()
  return c === 'instagram' || c === 'messenger'
}

/** true = a Meta recusaria o envio; só avalia canais Meta. */
export function isMetaWindowClosed(
  channel: string | null | undefined,
  lastCustomerMessageAt: string | null | undefined,
  now: number = Date.now(),
  humanAgentWindowMs: number = META_HUMAN_AGENT_WINDOW_MS,
): boolean {
  if (!isMetaChannel(channel)) return false
  const at = lastCustomerMessageAt ? new Date(lastCustomerMessageAt).getTime() : NaN
  if (Number.isNaN(at)) return true
  const limit = humanAgentWindowMs > META_WINDOW_MS ? humanAgentWindowMs : META_WINDOW_MS
  return now - at > limit
}
