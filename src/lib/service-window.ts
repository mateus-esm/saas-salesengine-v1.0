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
 * SE-SUP1-2 (#16) — canais de mensageria da Meta. A Solo API é WhatsApp-only:
 * uma instância conectada NÃO torna Instagram/Messenger "sempre abertos". Para
 * eles vale a regra da Meta: 24 h desde a última mensagem do cliente.
 */
export const META_MESSAGING_CHANNELS = ["instagram", "messenger"] as const;

/**
 * Extensão HUMAN_AGENT (resposta de atendente real por até 7 dias). DESLIGADA
 * (0) enquanto não houver sonda viva provando que o provedor aceita a tag —
 * ver "Sonda pendente" em Planning/AppOps/Support/sprint_suporte_1_plano.md.
 * Para ligar: 7 * 24 * 60 * 60 * 1000, junto com o lado servidor.
 */
export const META_HUMAN_AGENT_WINDOW_MS = 0;

export type ChannelKind = "whatsapp" | "meta" | "other";

export function isMetaMessagingChannel(channel: string | null | undefined): boolean {
  const c = (channel ?? "").trim().toLowerCase();
  return (META_MESSAGING_CHANNELS as readonly string[]).includes(c);
}

function channelKindOf(channel: string | null | undefined): ChannelKind {
  if (isMetaMessagingChannel(channel)) return "meta";
  const c = (channel ?? "").trim().toLowerCase();
  // Ausente conta como WhatsApp: é o default histórico de `conversations.channel`.
  return c === "" || c === "whatsapp" ? "whatsapp" : "other";
}

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
  /** `conversations.channel` (whatsapp | instagram | messenger | ...). */
  channel?: string | null;
  /** Última mensagem DO CLIENTE na conversa (mensagem do time não conta). */
  lastCustomerMessageAt?: string | Date | null;
  /** Janela estendida do atendente humano (Meta); default desligado. */
  humanAgentWindowMs?: number;
  /** Injetável para teste; default `Date.now()`. */
  now?: number;
}

export type ServiceWindowReason =
  | "always_open"
  | "within_window"
  | "human_agent_extension"
  | "window_expired"
  | "no_customer_message";

export interface ServiceWindow {
  /** A conexão é não oficial: a janela nunca fecha, por definição. */
  alwaysOpen: boolean;
  /** O envio é livre agora: `alwaysOpen` ou última mensagem do cliente <= 24 h. */
  open: boolean;
  channelKind: ChannelKind;
  reason: ServiceWindowReason;
  /** Quando a janela vigente fecha (null se sempre aberta ou sem inbound). */
  expiresAt: Date | null;
}

/** Conexão não oficial (WhatsApp Web/QR, Z-API ou Solo API) — só vale para WhatsApp. */
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
  const at = toMillis(lastCustomerMessageAt);
  if (at === null) return false;
  return now - at <= windowMs;
}

function toMillis(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * A decisão final que o chat mostra e pela qual o envio se orienta.
 * `alwaysOpen` vem do tipo de conexão; `open` soma a regra de 24 h quando a
 * conexão é oficial. Canais Meta ignoram qualquer sinal de Solo API.
 */
export function resolveServiceWindow(input: ServiceWindowInput): ServiceWindow {
  const now = input.now ?? Date.now();
  const channelKind = channelKindOf(input.channel);
  const at = toMillis(input.lastCustomerMessageAt);

  if (channelKind === "meta") {
    const expiresAt = at === null ? null : new Date(at + SERVICE_WINDOW_MS);
    const base = { alwaysOpen: false, channelKind, expiresAt } as const;
    if (at === null) return { ...base, open: false, reason: "no_customer_message" };
    if (now - at <= SERVICE_WINDOW_MS) return { ...base, open: true, reason: "within_window" };
    const extMs = input.humanAgentWindowMs ?? META_HUMAN_AGENT_WINDOW_MS;
    if (extMs > SERVICE_WINDOW_MS && now - at <= extMs) {
      return { ...base, open: true, reason: "human_agent_extension", expiresAt: new Date(at + extMs) };
    }
    return { ...base, open: false, reason: "window_expired" };
  }

  // Fora do WhatsApp/Meta (web, telegram) mantém o comportamento legado.
  const alwaysOpen = isNonOfficialConnection(input);
  const within = isWithinServiceWindow(input.lastCustomerMessageAt, now);
  return {
    alwaysOpen,
    open: alwaysOpen || within,
    channelKind,
    reason: alwaysOpen
      ? "always_open"
      : within
        ? "within_window"
        : at === null
          ? "no_customer_message"
          : "window_expired",
    expiresAt: alwaysOpen || at === null ? null : new Date(at + SERVICE_WINDOW_MS),
  };
}
