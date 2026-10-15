// ============================================================================
// SE-SUP1-4 (#9) — o que uma mensagem inbound pode virar. Um ponto só, usado
// pelo gpt-maker-webhook e pelo solo-wpp-webhook.
//
//   lead        -> fluxo normal (lead + conversa + negócio no pipeline)
//   quarantine  -> a MENSAGEM é guardada (conversa existe, nada se perde), mas o
//                  contato não vira negócio: lead_type 'contact' + needs_review,
//                  para alguém olhar. É reversível; ignorar não seria.
//   ignore      -> nem conversa: é ruído de protocolo, sem conteúdo humano.
//
// Telefone SEMPRE pelo _shared/phone.ts (normalização com 55). Função pura.
// ============================================================================

import { extractDialablePhone, isTechnicalPhone, normalizePhone } from "./phone.ts";
import { isPlaceholderName } from "./lead-name-policy.ts";

export type InboundVerdict =
  | { action: "lead" }
  | { action: "quarantine"; reason: QuarantineReason }
  | { action: "ignore"; reason: "protocol_message" };

export type QuarantineReason =
  | "service_sender"
  | "short_code"
  | "alphanumeric_sender"
  | "no_identity"
  | "automated_code";

export interface InboundInput {
  /** remoteJid / contactPhone cru, como o provider mandou. */
  phone?: string | null;
  /** pushName / contactName cru. */
  name?: string | null;
  content?: string | null;
  /** messageType do Baileys/Evolution, quando existe. */
  messageType?: string | null;
}

// Tipos do Baileys que não são fala de ninguém: distribuição de chave, ajuste
// de protocolo (apagar/expirar), metadados, reação e voto de enquete.
const PROTOCOL_TYPES = new Set([
  "protocolmessage",
  "senderkeydistributionmessage",
  "messagecontextinfo",
  "reactionmessage",
  "pollupdatemessage",
  "keepinchatmessage",
]);

const SERVICE_NAME = /^(whatsapp|meta|facebook|instagram)\b|no[-_ ]?reply|notification|notifica[cç][aã]o|verifica[cç][aã]o|verification/i;
const AUTOMATED_CODE = /(c[óo]digo\s+de\s+(verifica|confirma)[^\n]{0,40}\d{4,8}|verification\s+code[^\n]{0,20}\d{4,8}|\b\d{4,8}\b[^\n]{0,30}(é|is)\s+seu\s+c[óo]digo)/i;

export function classifyInbound(i: InboundInput): InboundVerdict {
  if (i.messageType && PROTOCOL_TYPES.has(i.messageType.toLowerCase())) {
    return { action: "ignore", reason: "protocol_message" };
  }

  const name = (i.name ?? "").trim();
  const rawPhone = (i.phone ?? "").trim();
  const user = rawPhone.split("@")[0];

  if (name && SERVICE_NAME.test(name)) return { action: "quarantine", reason: "service_sender" };

  // O que vem antes do @ não é número: "ITAU-BANK@s.whatsapp.net".
  if (rawPhone.includes("@") && !isTechnicalPhone(rawPhone) && /[a-z]/i.test(user)) {
    return { action: "quarantine", reason: "alphanumeric_sender" };
  }

  const dialable = isTechnicalPhone(rawPhone) ? null : extractDialablePhone(rawPhone);
  const digits = (dialable ?? "").replace(/\D/g, "");
  // 3-7 dígitos: código curto de serviço. normalizePhone() recusa < 8 dígitos.
  if (digits.length >= 3 && digits.length < 8) return { action: "quarantine", reason: "short_code" };

  const hasRealPhone = !!dialable && normalizePhone(dialable) !== null;
  if (!hasRealPhone && isPlaceholderName(name)) return { action: "quarantine", reason: "no_identity" };

  if (i.content && AUTOMATED_CODE.test(i.content)) return { action: "quarantine", reason: "automated_code" };

  return { action: "lead" };
}
