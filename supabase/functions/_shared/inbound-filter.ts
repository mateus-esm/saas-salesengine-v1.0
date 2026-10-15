// ============================================================================
// SE-SUP1-4 (#9) — o que uma mensagem inbound pode virar. Um ponto só, usado
// pelo gpt-maker-webhook e pelo solo-wpp-webhook.
//
//   lead        -> fluxo normal (lead + conversa + negócio no pipeline)
//   quarantine  -> só por SINAL POSITIVO de lixo (nome de remetente de serviço,
//                  código curto, remetente alfanumérico, texto de código
//                  automático de quem não tem nome salvo). Perder um cliente
//                  real é pior que deixar passar um lixo: sem telefone e sem
//                  nome (LID sem pushName) continua lead. A MENSAGEM é guardada
//                  (conversa existe, nada se perde), mas o contato não vira
//                  negócio: lead_type 'contact' + needs_review. Reversível.
//   ignore      -> nem conversa: é ruído de protocolo, sem conteúdo humano.
//
// Telefone SEMPRE pelo _shared/phone.ts (normalização com 55). Função pura.
// ============================================================================

import { extractDialablePhone, isTechnicalPhone } from "./phone.ts";
import { isPlaceholderName } from "./lead-name-policy.ts";

export type InboundVerdict =
  | { action: "lead" }
  | { action: "quarantine"; reason: QuarantineReason }
  | { action: "ignore"; reason: "protocol_message" };

export type QuarantineReason =
  | "service_sender"
  | "short_code"
  | "alphanumeric_sender"
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
// de protocolo (apagar/expirar) e metadados. Reação e voto de enquete NÃO estão
// aqui: são ações humanas — a mensagem é guardada; só não abrem, sozinhas, um
// lead que não existe (ver isNonTextual e o uso nos webhooks).
const PROTOCOL_TYPES = new Set([
  "protocolmessage",
  "senderkeydistributionmessage",
  "messagecontextinfo",
  "keepinchatmessage",
]);

const NON_TEXTUAL_TYPES = new Set(["reactionmessage", "pollupdatemessage"]);

/** Reação / voto de enquete: guarda a mensagem, mas não cria lead novo. */
export function isNonTextual(messageType: string | null | undefined): boolean {
  return !!messageType && NON_TEXTUAL_TYPES.has(messageType.toLowerCase());
}

// Nome de remetente de serviço: o nome INTEIRO é o da marca ("WhatsApp", "Meta",
// "WhatsApp Support"), ou "no-reply", ou a palavra de notificação/verificação
// sozinha. "Instagram Store" ou "Notificações Silva Ltda" são clientes: não casam.
const SERVICE_NAME = new RegExp(
  "^(" +
    "(whatsapp|meta|facebook|instagram)(\\s+(business|support|suporte|security|seguran[cç]a|team|equipe|notifications?|notifica[cç][oõ]es|verification|verifica[cç][aã]o))?" +
    "|notifications?|notifica[cç][aã]o|notifica[cç][oõ]es|verification|verifica[cç][aã]o" +
    ")$|\\bno[-_ ]?reply\\b",
  "i",
);

const AUTOMATED_CODE =
  /(c[óo]digo\s+de\s+(verifica|confirma)[^\n]{0,40}\d{4,8}|verification\s+code[^\n]{0,20}\d{4,8}|\b\d{4,8}\b[^\n]{0,30}(é|is)\s+seu\s+c[óo]digo)/i;

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

  // Texto de código automático só pesa quando o remetente não tem nome salvo:
  // um cliente com nome falando do "código de confirmação do pedido" é lead.
  if (isPlaceholderName(name) && i.content && AUTOMATED_CODE.test(i.content)) {
    return { action: "quarantine", reason: "automated_code" };
  }

  return { action: "lead" };
}

/**
 * Promoção: um contato que o filtro marcou (lead_type 'contact' + needs_review)
 * e que agora manda mensagem de lead de verdade volta ao fluxo normal. Só mexe
 * em quem o FILTRO marcou — 'contact' por desqualificação da IA não tem
 * needs_review e não é promovido.
 */
export function promotionPatch(
  lead: { lead_type?: string | null; needs_review?: boolean | null },
  verdict: InboundVerdict,
): { lead_type: "lead"; needs_review: false; review_reason: null } | null {
  if (verdict.action !== "lead") return null;
  if (lead.lead_type === "contact" && lead.needs_review) {
    return { lead_type: "lead", needs_review: false, review_reason: null };
  }
  return null;
}
