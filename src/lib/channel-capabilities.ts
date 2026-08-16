// ============================================================================
// Sprint 7.4 W2 — what each channel type actually supports.
//
// Single source of truth for the Channels UI. Two independent axes:
//
//   configFields  — which behaviour settings the provider exposes for the type.
//                   Harvested live from all 23 channels across both workspaces
//                   (2026-08-15), because the provider's docs list the fields
//                   but not which type gets which.
//
//   connection    — how a channel of this type gets connected. This is the
//                   honest constraint: the provider exposes NO credential
//                   fields and NO OAuth route (probed: oauth, connect, auth,
//                   auth-url, login, authorize, credentials, token, setup,
//                   pair — all 404). So only 'qr' and 'instant' can be
//                   completed inside our app; 'credentials' and 'oauth' must
//                   finish in the provider's console.
//
// Handoff copy is deliberately brand-free (founder decision 2026-08-15) so the
// white-label sweep from Sprint 7.2 T12 stays intact.
// ============================================================================

export type ConnectionMethod = "qr" | "instant" | "credentials" | "oauth";

export type ChannelConfigField =
  | "startTrigger" | "endTrigger" | "audioAction" | "enabledTyping"
  | "enableGroupsResponse" | "replyGroupsType" | "enablePrivateChatResponse"
  | "callRejectAuto" | "callRejectMessage"
  | "waitingMessageEnabled" | "waitingMessageText"
  | "takeOutsideService" | "takeOutsideServiceMember" | "takeOutsideServiceCommand"
  | "takeOutsideServiceMessage" | "takeOutsideServiceCommandReturn"
  | "takeOutsideServiceReturnMessage"
  | "notReactInstagramStories" | "commentsReplyEnabled" | "commentsReplyAllEnabled"
  | "commentsReplyAllInstruction" | "commentsCallDirectInstruction";

export interface ChannelCapability {
  label: string;
  connection: ConnectionMethod;
  /** Empty = the type has no conversational config (WIDGET). */
  configFields: ChannelConfigField[];
  /** Shown on the Conexão tab. Brand-free, written for the tenant. */
  connectionSteps: string[];
}

// Common groupings, named so the per-type table stays readable.
const TRIGGERS: ChannelConfigField[] = ["startTrigger", "endTrigger", "audioAction"];
const TAKEOVER: ChannelConfigField[] = [
  "takeOutsideService", "takeOutsideServiceMember", "takeOutsideServiceCommand",
  "takeOutsideServiceMessage", "takeOutsideServiceCommandReturn",
  "takeOutsideServiceReturnMessage",
];

export const CHANNEL_CAPABILITIES: Record<string, ChannelCapability> = {
  // 7 keys live. The non-official WhatsApp — the one type with a real QR flow.
  //
  // ⚠️ `type` is not a reliable discriminator: `/workspace/{id}/channels`
  // reports WHATSAPP for channels that `/agent/{id}/search` reports as
  // CLOUD_API (recorded in the Sprint 7.2 reference). Both Solo Energia
  // "WhatsApp" channels answer "Instance not found" on /qr-code because they
  // are officially-connected ones wearing this type. So the QR panel must fail
  // gracefully and say so, rather than assuming every WHATSAPP row can pair.
  WHATSAPP: {
    label: "WhatsApp",
    connection: "qr",
    configFields: [...TRIGGERS, "enabledTyping"],
    connectionSteps: [
      "O canal foi criado e já está vinculado ao seu agente.",
      "Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho.",
      "Aponte a câmera para o QR code ao lado. O status muda sozinho ao parear.",
      "Se o QR não carregar, este canal provavelmente é uma conexão oficial — nesse caso a conexão é feita no console do provedor.",
    ],
  },
  // 20 keys — the richest surface.
  Z_API: {
    label: "WhatsApp (Z-API)",
    connection: "credentials",
    configFields: [
      ...TRIGGERS, "enabledTyping",
      "enableGroupsResponse", "replyGroupsType", "enablePrivateChatResponse",
      "callRejectAuto", "callRejectMessage",
      "waitingMessageEnabled", "waitingMessageText",
      ...TAKEOVER,
    ],
    connectionSteps: [
      "O canal foi criado e já está vinculado ao seu agente.",
      "Informe as credenciais da sua instância Z-API (instance ID e token) no console do provedor.",
      "Não há endpoint para enviar essas credenciais pela nossa API.",
      "Depois de conectado, todas as configurações abaixo passam a valer.",
    ],
  },
  // Official WhatsApp. Meta credentials only — no QR instance exists.
  CLOUD_API: {
    label: "WhatsApp Cloud API",
    connection: "credentials",
    configFields: [...TRIGGERS, "enabledTyping"],
    connectionSteps: [
      "O canal foi criado e já está vinculado ao seu agente.",
      "Conecte sua conta da Meta (token, ID do número e ID da conta comercial) no console do provedor.",
      "Alternativa sem credenciais da Meta: use a conexão direta por QR code na seção Solo API, abaixo.",
    ],
  },
  // 16 keys — adds comment automation, no group/call fields.
  INSTAGRAM: {
    label: "Instagram",
    connection: "oauth",
    configFields: [
      ...TRIGGERS,
      "notReactInstagramStories",
      "commentsReplyEnabled", "commentsReplyAllEnabled",
      "commentsReplyAllInstruction", "commentsCallDirectInstruction",
      ...TAKEOVER,
    ],
    connectionSteps: [
      "O canal foi criado e já está vinculado ao seu agente.",
      "O Instagram exige login do Facebook (OAuth) com a conta que administra o perfil comercial.",
      "Esse login só pode ser feito no console do provedor — não existe rota de autorização na API.",
      "Depois de conectar, as respostas automáticas a comentários podem ser configuradas aqui.",
    ],
  },
  MESSENGER: {
    label: "Messenger",
    connection: "oauth",
    configFields: [...TRIGGERS],
    connectionSteps: [
      "O canal foi criado e já está vinculado ao seu agente.",
      "O Messenger exige login do Facebook (OAuth) e a seleção da página.",
      "Finalize a conexão no console do provedor.",
    ],
  },
  TELEGRAM: {
    label: "Telegram",
    connection: "credentials",
    configFields: [...TRIGGERS],
    connectionSteps: [
      "O canal foi criado e já está vinculado ao seu agente.",
      "Crie um bot no @BotFather do Telegram e copie o token gerado.",
      "Informe esse token no console do provedor — a nossa API não aceita o token do bot.",
    ],
  },
  MERCADO_LIVRE: {
    label: "Mercado Livre",
    connection: "oauth",
    configFields: [...TRIGGERS],
    connectionSteps: [
      "O canal foi criado e já está vinculado ao seu agente.",
      "O Mercado Livre exige autorização OAuth da sua conta de vendedor.",
      "Finalize a conexão no console do provedor.",
    ],
  },
  TWILIO_SMS: {
    label: "SMS (Twilio)",
    connection: "credentials",
    configFields: [...TRIGGERS],
    connectionSteps: [
      "O canal foi criado e já está vinculado ao seu agente.",
      "Informe as credenciais da Twilio (Account SID e Auth Token) no console do provedor.",
    ],
  },
  // No config at all — the provider returns {} for a widget.
  WIDGET: {
    label: "Widget Web",
    connection: "instant",
    configFields: [],
    connectionSteps: [
      "O widget já está pronto para uso — não exige login nem credenciais.",
      "Copie um dos códigos na aba Instalação e cole no HTML do seu site.",
      "Use o botão flutuante para o canto da página, ou o iframe para embutir em uma seção.",
    ],
  },
};

/** Unknown types degrade to triggers-only rather than rendering nothing. */
export const FALLBACK_CAPABILITY: ChannelCapability = {
  label: "Canal",
  connection: "credentials",
  configFields: [...TRIGGERS],
  connectionSteps: [
    "O canal foi criado e já está vinculado ao seu agente.",
    "Finalize a conexão no console do provedor.",
  ],
};

export const capabilityFor = (type: string): ChannelCapability =>
  CHANNEL_CAPABILITIES[(type ?? "").toUpperCase()] ?? FALLBACK_CAPABILITY;

// ── Field presentation ───────────────────────────────────────────────────────
// Enum options are what we have OBSERVED live plus the provider's own labels.
// Never validate a stored value against these — an unobserved value must render
// as itself, exactly like the model catalog. See `optionsWithLive` below.
export const CHANNEL_ENUMS: Record<string, { value: string; label: string }[]> = {
  startTrigger: [
    { value: "ALL", label: "Toda mensagem" },
    { value: "ONLY_WHEN_CALLING_BY_NAME", label: "Só quando chamarem pelo nome" },
  ],
  endTrigger: [
    { value: "NEVER", label: "Nunca encerrar" },
    { value: "WHEN_SAY_GOODBYE", label: "Ao se despedir" },
  ],
  audioAction: [
    { value: "REPLY", label: "Responder em áudio" },
  ],
  replyGroupsType: [
    { value: "ALL", label: "Todos os grupos" },
  ],
};

/**
 * Enum options including the live value even when we have never seen it.
 * The provider ships values that appear in no published enum; dropping one
 * would silently rewrite the tenant's setting on the next save.
 */
export function optionsWithLive(field: string, live: unknown) {
  const base = CHANNEL_ENUMS[field] ?? [];
  if (typeof live !== "string" || !live || base.some((o) => o.value === live)) return base;
  return [...base, { value: live, label: live }];
}

export const CHANNEL_FIELD_META: Record<ChannelConfigField, { label: string; hint?: string; type: "switch" | "select" | "text" }> = {
  startTrigger: { label: "Quando responder", type: "select" },
  endTrigger: { label: "Quando encerrar o atendimento", type: "select" },
  audioAction: { label: "Ao receber áudio", type: "select" },
  enabledTyping: { label: "Mostrar 'digitando…'", type: "switch" },
  enableGroupsResponse: { label: "Responder em grupos", type: "switch" },
  replyGroupsType: { label: "Quais grupos responder", type: "select" },
  enablePrivateChatResponse: { label: "Responder no privado", type: "switch" },
  callRejectAuto: { label: "Rejeitar chamadas automaticamente", type: "switch" },
  callRejectMessage: { label: "Mensagem ao rejeitar chamada", type: "text" },
  waitingMessageEnabled: { label: "Mensagem de espera", type: "switch" },
  waitingMessageText: { label: "Texto da mensagem de espera", type: "text" },
  takeOutsideService: { label: "Permitir assumir o atendimento", hint: "Um humano pode assumir a conversa por comando.", type: "switch" },
  takeOutsideServiceMember: { label: "Membro responsável", type: "text" },
  takeOutsideServiceCommand: { label: "Comando para assumir", hint: "Ex: parar", type: "text" },
  takeOutsideServiceMessage: { label: "Mensagem ao assumir", type: "text" },
  takeOutsideServiceCommandReturn: { label: "Comando para devolver", hint: "Ex: seguir", type: "text" },
  takeOutsideServiceReturnMessage: { label: "Mensagem ao devolver", type: "text" },
  notReactInstagramStories: { label: "Não reagir a stories", type: "switch" },
  commentsReplyEnabled: { label: "Responder comentários", type: "switch" },
  commentsReplyAllEnabled: { label: "Responder todos os comentários", type: "switch" },
  commentsReplyAllInstruction: { label: "Instrução para comentários", type: "text" },
  commentsCallDirectInstruction: { label: "Instrução para chamar no direct", type: "text" },
};
