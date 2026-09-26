// ============================================================================
// SE-REV-006 — a janela de atendimento do chat depende do TIPO DE CONEXÃO.
//
// Antes: a janela era calculada só pelo relógio (última mensagem do cliente
// <= 24 h), sem olhar o canal. O dono apontou o erro: quando a conexão com o
// WhatsApp é NÃO OFICIAL, quem envia pela API pode enviar a qualquer momento —
// não existe janela para fechar. Só o WhatsApp OFICIAL da Meta (CLOUD_API)
// tem a regra de 24 h.
//
//   NÃO OFICIAL (sempre aberta)
//     - WHATSAPP — WhatsApp Web/QR no provider ("canal fornecido")
//     - Z_API    — Z-API no provider
//     - Solo API — wpp_instances conectada / conversations.solo_instance_id
//
//   OFICIAL (mantém as 24 h)
//     - CLOUD_API — WhatsApp Cloud API da Meta
//
// Este módulo é a ÚNICA decisão. Nenhum componente/ hook repete a conta de
// 86_400_000 nem decide "não oficial" por conta propria: todos leem daqui.
//
// ⚠️ O `type` que o provider devolve para cada canal NÃO entra sozinho nesta
// decisão em runtime (ver `providerChannelType` abaixo): o repositório já
// registrou que `/workspace/{id}/channels` reporta WHATSAPP para canais que
// são oficialmente conectados (`src/lib/channel-capabilities.ts`, aviso em
// WHATSAPP). A ponta confiável e sempre presente é a Solo API; a ponta do
// provider depende do tipo do canal, que segue o mesmo critério da abertura de
// conversa (SE-REV-004: WHATSAPP/Z_API abrem, CLOUD_API não).
// ============================================================================

/**
 * Tipos de canal do provider cuja conexão é NÃO OFICIAL.
 *
 * Espelha de propósito o ponto de verdade que já existia no repo: a lista
 * `START_CONVERSATION_CHANNEL_TYPES` no módulo de canais do provider, em
 * `supabase/functions/_shared/outreach/` (mesma lista, mesma normalização
 * `trim().toUpperCase()` de `supportsStartConversation`). Não é importado de
 * lá porque é módulo Deno, fora do glob do vitest, e o motor de outreach é
 * território proibido nesta task.
 */
export const NON_OFFICIAL_CHANNEL_TYPES = ["WHATSAPP", "Z_API"] as const;

/** A janela do WhatsApp oficial: 24 h a partir da última mensagem do cliente. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * O que descreve a conexão de uma conversa. Quanto mais sinais, mais precisa a
 * resposta; qualquer um dos três já basta para reconhecer a conexão não
 * oficial.
 */
export interface ConnectionDescriptor {
  /** Tipo do canal no provider (WHATSAPP | Z_API | CLOUD_API | ...). */
  providerChannelType?: string | null;
  /** `conversations.solo_instance_id` — a conversa vive numa instância Solo API. */
  conversationSoloInstanceId?: string | null;
  /** O tenant tem alguma `wpp_instances` com status 'connected'. */
  hasConnectedSoloInstance?: boolean;
}

export interface ServiceWindowInput extends ConnectionDescriptor {
  /** Última mensagem DO CLIENTE na conversa (mensagem do time não conta). */
  lastCustomerMessageAt?: string | Date | null;
  /** Injetável para teste; default `Date.now()`. */
  now?: number;
}

export interface ServiceWindow {
  /** A conexão é não oficial: a janela nunca fecha, por definição. */
  alwaysOpen: boolean;
  /** O envio é livre agora: `alwaysOpen` ou última mensagem do cliente <= 24 h. */
  open: boolean;
}

/** Conexão não oficial (WHATSAPP/Z_API no provider, ou conexão Solo API). */
export function isNonOfficialConnection(
  connection: ConnectionDescriptor,
): boolean {
  if (connection.conversationSoloInstanceId) return true;
  if (connection.hasConnectedSoloInstance) return true;

  const type = (connection.providerChannelType ?? "").trim().toUpperCase();
  return (NON_OFFICIAL_CHANNEL_TYPES as readonly string[]).includes(type);
}

/**
 * A regra de 24 h do WhatsApp oficial, sozinha. Data ausente ou inválida conta
 * como fora da janela — nunca abre por falta de dado.
 */
export function isWithinServiceWindow(
  lastCustomerMessageAt: string | Date | null | undefined,
  now: number = Date.now(),
  windowMs: number = SERVICE_WINDOW_MS,
): boolean {
  if (!lastCustomerMessageAt) return false;

  const at = lastCustomerMessageAt instanceof Date
    ? lastCustomerMessageAt.getTime()
    : new Date(lastCustomerMessageAt).getTime();
  if (Number.isNaN(at)) return false;

  return now - at <= windowMs;
}

/**
 * A decisão final que o chat mostra e pela qual o envio se orienta.
 * `alwaysOpen` vem do tipo de conexão; `open` soma a regra de 24 h quando a
 * conexão é oficial.
 */
export function resolveServiceWindow(input: ServiceWindowInput): ServiceWindow {
  const alwaysOpen = isNonOfficialConnection(input);

  return {
    alwaysOpen,
    open: alwaysOpen ||
      isWithinServiceWindow(
        input.lastCustomerMessageAt,
        input.now ?? Date.now(),
      ),
  };
}
