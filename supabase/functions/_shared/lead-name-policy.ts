// ============================================================================
// SE-SUP1-4 (#9) — quem pode escrever leads.name depois que o lead existe.
//
// O pushName do WhatsApp é o apelido que o PRÓPRIO contato escolheu ("mah",
// "💙", "Mãe"), e o nome extraído pela IA vem de uma frase solta. Nenhum dos
// dois pode desfazer o que o time digitou. Regras, em um só lugar:
//
//   - leads.name_locked = true (edição manual) -> ninguém sobrescreve;
//   - origem 'provider' (pushName/contactName): só preenche nome vazio ou
//     técnico/de reserva — nunca troca um nome que já é de gente;
//   - origem 'ai' (analyze-message): pode corrigir um nome de gente que o
//     contato escolheu mal, mas só destravado.
// Função pura: os webhooks e o analyze-message só perguntam.
// ============================================================================

import { LEAD_ANON_NAME, isTechnicalId } from "./displayName.ts";

const PLACEHOLDERS = new Set([
  "desconhecido",
  "novo visitante",
  LEAD_ANON_NAME.toLowerCase(),
]);

/** Vazio, id técnico, só número, "Lead <fone>" ou rótulo de reserva. */
export function isPlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  if (PLACEHOLDERS.has(n.toLowerCase())) return true;
  if (isTechnicalId(n)) return true;
  // "Lead 5511987654321" / "Lead 186432031355045@lid": o rótulo que os
  // webhooks geram quando o provider não deu nome.
  const m = /^lead\s+(.+)$/i.exec(n);
  if (m && (isTechnicalId(m[1]) || /^[\d\s()+-]{8,}$/.test(m[1]))) return true;
  return false;
}

export interface NameDecisionInput {
  current: string | null | undefined;
  incoming: string | null | undefined;
  locked: boolean | null | undefined;
  source: "provider" | "ai";
}

export function shouldApplyName(i: NameDecisionInput): boolean {
  if (i.locked) return false;
  const incoming = (i.incoming ?? "").trim();
  if (!incoming || isPlaceholderName(incoming)) return false;
  if (incoming === (i.current ?? "").trim()) return false;
  if (i.source === "provider") return isPlaceholderName(i.current);
  return true;
}
