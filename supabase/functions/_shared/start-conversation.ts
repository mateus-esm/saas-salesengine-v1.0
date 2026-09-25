// ============================================================================
// SE-REV-001 — núcleo da abertura de conversa pelo provider.
//
// O endpoint documentado é:
//
//   POST https://api.gptmaker.ai/v2/channel/{channelId}/start-conversation
//   body { "phone": "...", "message": "..." }
//
// e a documentação diz, com todas as letras, que hoje ele só existe para canal
// de WhatsApp NÃO OFICIAL. Duas consequências que este módulo assume:
//
//   (a) o tipo do canal é checado ANTES de chamar. Um canal Instagram ou um
//       Cloud API não tem esse endpoint, e tentar de qualquer jeito troca um
//       erro claro ("esse canal não abre conversa") por um 404 do provider;
//
//   (b) o tipo do provider NÃO é confiável como discriminador. Está registrado
//       em src/lib/channel-capabilities.ts: /workspace/{id}/channels reporta
//       WHATSAPP para canais que /agent/{id}/search reporta como CLOUD_API, e
//       os dois canais "WhatsApp" de um tenant real respondem "Instance not
//       found" no /qr-code porque são conexões oficiais vestidas desse tipo.
//       Ou seja: passar na checagem (a) não garante que o provider aceite. Por
//       isso a falha upstream é gravada com status + corpo do provider em
//       conversation_open_events, em vez de virar um log que ninguém lê.
//
// As funções puras daqui são cobertas por start-conversation.test.ts; o que
// toca rede e banco fica nas funções com `supabase`/`fetch` no nome dos
// parâmetros, chamadas pela edge function start-conversation/index.ts.
// ============================================================================

import { normalizePhone } from "./phone.ts";

export const AI_ENGINE_BASE = "https://api.gptmaker.ai/v2";

/**
 * Tipos de canal para os quais o provider documenta start-conversation.
 * WhatsApp não oficial é o único hoje. Crescer esta lista é o ponto de extensão
 * quando o provider liberar o endpoint para o oficial.
 */
export const START_CONVERSATION_CHANNEL_TYPES = ["WHATSAPP"] as const;

export type OpenFailureCode =
  | "disabled"
  | "source_not_triggered"
  | "entry_not_triggered"
  | "lead_not_found"
  | "missing_phone"
  | "technical_phone"
  | "missing_message"
  | "workspace_not_configured"
  | "agent_not_configured"
  | "engine_token_missing"
  | "channel_list_failed"
  | "channel_not_found"
  | "channel_not_connected"
  | "channel_ambiguous"
  | "no_whatsapp_channel"
  | "channel_type_unsupported"
  | "provider_rejected"
  | "provider_unreachable";

export interface OpenerSettings {
  equipe_id: string;
  enabled: boolean;
  channel_id: string | null;
  channel_type: string | null;
  trigger_sources: string[];
  /** SE-REV-002 — portas (crm_entries.id) que disparam. Vazio = qualquer porta. */
  trigger_entry_ids: string[];
  first_message: string | null;
}

export const DEFAULT_OPENER_SETTINGS: Omit<OpenerSettings, "equipe_id"> = {
  enabled: false,
  channel_id: null,
  channel_type: null,
  trigger_sources: [],
  trigger_entry_ids: [],
  first_message: null,
};

export interface EngineChannel {
  id: string;
  name?: string | null;
  type?: string | null;
  connected?: boolean | null;
  username?: string | null;
}

// ── Funções puras ───────────────────────────────────────────────────────────

/**
 * A chave de idempotência.
 *
 * Sem chave explícita, a chave é o próprio lead: UMA abertura de conversa por
 * lead, para sempre. É o comportamento que o critério de aceite pede — o mesmo
 * cadastro chegando duas vezes (planilha reprocessada, retry do n8n, webhook
 * duplicado pela Meta) não gera uma segunda conversa — e é mais forte do que
 * uma janela de tempo, que só esconde o problema por alguns minutos.
 *
 * Quem tem um id de evento de verdade (execution id do n8n, id da linha da
 * planilha) pode mandá-lo e aí o bloqueio passa a ser por evento, permitindo
 * reabrir conversa com o mesmo lead num evento futuro e legítimo.
 */
export function buildEventKey(input: { eventKey?: string | null; leadId: string }): string {
  const explicit = typeof input.eventKey === "string" ? input.eventKey.trim() : "";
  if (explicit) return explicit.slice(0, 200);
  return `lead:${input.leadId}`;
}

/** `source` do lead casa com o filtro do tenant? Lista vazia = qualquer source. */
export function sourceMatches(triggerSources: string[] | null | undefined, source: string | null | undefined): boolean {
  const filters = (triggerSources ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (filters.length === 0) return true;
  const value = String(source ?? "").trim().toLowerCase();
  if (!value) return false;
  return filters.includes(value);
}

/**
 * SE-REV-002 — a porta de entrada (crm_entries.id) casa com o filtro do tenant?
 * Lista vazia = qualquer porta. Com filtro, chegada sem porta conhecida não
 * dispara: sem saber por onde o lead entrou, não dá para afirmar que ele veio
 * do anúncio.
 */
export function entryMatches(triggerEntryIds: string[] | null | undefined, entryId: string | null | undefined): boolean {
  const filters = (triggerEntryIds ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (filters.length === 0) return true;
  const value = String(entryId ?? "").trim().toLowerCase();
  if (!value) return false;
  return filters.includes(value);
}

/**
 * SE-REV-002 — o filtro do gatilho automático (`trigger_source = 'lead_intake'`).
 *
 * Usa o source e a porta DO EVENTO quando o chamador os manda (o dispatcher
 * manda). Só cai no `leads.source` gravado quando o evento não trouxe source —
 * compatibilidade com chamadas antigas. Antes, um lead que voltou por um
 * anúncio era barrado pelo source do primeiro cadastro.
 */
export function intakeFilterFailure(
  settings: Pick<OpenerSettings, "trigger_sources" | "trigger_entry_ids">,
  event: { source?: unknown; entryId?: unknown; leadSource?: string | null },
): "entry_not_triggered" | "source_not_triggered" | null {
  const entryId = typeof event.entryId === "string" ? event.entryId : null;
  if (!entryMatches(settings.trigger_entry_ids, entryId)) return "entry_not_triggered";
  const source = typeof event.source === "string" ? event.source : event.leadSource ?? null;
  if (!sourceMatches(settings.trigger_sources, source)) return "source_not_triggered";
  return null;
}

export function supportsStartConversation(type: string | null | undefined): boolean {
  const normalized = String(type ?? "").trim().toUpperCase();
  return (START_CONVERSATION_CHANNEL_TYPES as readonly string[]).includes(normalized);
}

/**
 * Escolhe o canal que vai abrir a conversa.
 *
 * Com `preferredId`, é aquele canal ou erro — nunca um vizinho parecido: mandar
 * a mensagem do número errado é pior do que não mandar.
 *
 * Sem `preferredId`, só decide sozinho quando existe exatamente um candidato.
 * Dois números conectados viram `channel_ambiguous`, que pede a configuração
 * explícita, porque não há como adivinhar de qual número o tenant quer falar.
 */
export function pickStartConversationChannel(
  channels: EngineChannel[],
  preferredId?: string | null,
): { channel: EngineChannel } | { errorCode: OpenFailureCode; detail: string } {
  const wanted = String(preferredId ?? "").trim();

  if (wanted) {
    const found = channels.find((c) => String(c.id ?? "").trim() === wanted);
    if (!found) {
      return {
        errorCode: "channel_not_found",
        detail: `Canal ${wanted} não existe (ou não pertence a este agente) no provider.`,
      };
    }
    if (!supportsStartConversation(found.type)) {
      return {
        errorCode: "channel_type_unsupported",
        detail:
          `O canal ${wanted} é do tipo ${found.type ?? "desconhecido"}. ` +
          `O provider só abre conversa em canal de WhatsApp não oficial (${START_CONVERSATION_CHANNEL_TYPES.join(", ")}).`,
      };
    }
    if (found.connected !== true) {
      return { errorCode: "channel_not_connected", detail: `O canal ${wanted} está desconectado no provider.` };
    }
    return { channel: found };
  }

  const supported = channels.filter((c) => supportsStartConversation(c.type));
  if (supported.length === 0) {
    return {
      errorCode: "no_whatsapp_channel",
      detail: "O tenant não tem canal de WhatsApp não oficial no provider.",
    };
  }

  const connected = supported.filter((c) => c.connected === true);
  if (connected.length === 0) {
    return {
      errorCode: "channel_not_connected",
      detail: "O tenant tem canal de WhatsApp, mas nenhum conectado.",
    };
  }
  if (connected.length > 1) {
    return {
      errorCode: "channel_ambiguous",
      detail:
        `O tenant tem ${connected.length} canais de WhatsApp conectados ` +
        `(${connected.map((c) => `${c.id}${c.username ? ` / ${c.username}` : ""}`).join(", ")}). ` +
        "Defina channel_id em conversation_opener_settings para escolher de qual número falar.",
    };
  }
  return { channel: connected[0] };
}

export interface MessageContext {
  leadName?: string | null;
  leadSource?: string | null;
  tenantName?: string | null;
}

/**
 * Resolve os placeholders da primeira mensagem. Um placeholder sem valor vira
 * string vazia (nunca o literal "{{lead.name}}" na cara do cliente), e o
 * espaço duplo que isso deixa é colapsado.
 */
export function renderFirstMessage(template: string | null | undefined, ctx: MessageContext): string {
  const raw = typeof template === "string" ? template : "";
  if (!raw.trim()) return "";

  const name = String(ctx.leadName ?? "").trim();
  const values: Record<string, string> = {
    "lead.name": name,
    "lead.first_name": name.split(/\s+/)[0] ?? "",
    "lead.source": String(ctx.leadSource ?? "").trim(),
    "tenant.name": String(ctx.tenantName ?? "").trim(),
  };

  return raw
    .replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_m, key: string) => values[key] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * O identificador de chat dentro da resposta do provider.
 *
 * A documentação do start-conversation descreve o corpo da requisição, não o do
 * retorno. Os nomes abaixo são os que o provider usa nos outros endpoints que
 * este repo já consome (`contextId` chega no gpt-maker-webhook, `chatId`/`id`
 * aparecem nas respostas de chat). Nada é inventado: o corpo cru fica em
 * conversation_open_events.provider_response, então um retorno com nome novo é
 * descobrível sem reproduzir o caso.
 */
export function extractProviderChatId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  const direct = ["chatId", "contextId", "conversationId", "id"];
  for (const key of direct) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  for (const key of ["chat", "conversation", "data"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object") {
      const found = extractProviderChatId(nested);
      if (found) return found;
    }
  }
  return null;
}

/**
 * O telefone no formato que o provider recebe: só dígitos, com DDI.
 * Reaproveita normalizePhone() — a mesma normalização que já decide identidade
 * de lead no gpt-maker-webhook — para que o número usado na abertura seja o
 * mesmo número pelo qual a resposta do lead vai ser reconhecida depois.
 */
export function providerPhone(raw: string | null | undefined): string | null {
  return normalizePhone(raw);
}

// ── Chamada ao provider ─────────────────────────────────────────────────────

export function engineHeaders(token: string): Record<string, string> {
  return { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
}

export interface ProviderCallResult {
  ok: boolean;
  status: number | null;
  body: unknown;
  rawText: string | null;
  errorCode?: OpenFailureCode;
  errorMessage?: string;
}

/** GET /v2/workspace/{id}/channels — mesma rota (e mesmos parâmetros) que a aba Canais usa. */
export async function listEngineChannels(
  opts: { token: string; workspaceId: string; agentId: string },
): Promise<{ channels: EngineChannel[] } | { errorCode: OpenFailureCode; detail: string }> {
  const url =
    `${AI_ENGINE_BASE}/workspace/${opts.workspaceId}/channels?agentId=${opts.agentId}&page=1&pageSize=50`;
  try {
    const res = await fetch(url, { headers: engineHeaders(opts.token) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { errorCode: "channel_list_failed", detail: `provider ${res.status}: ${text.slice(0, 500)}` };
    }
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray((data as Record<string, unknown>)?.data) ? (data as { data: EngineChannel[] }).data : [];
    return { channels: list };
  } catch (err) {
    return {
      errorCode: "provider_unreachable",
      detail: err instanceof Error ? err.message : "falha de rede ao listar canais",
    };
  }
}

/**
 * O corpo de um 2xx do start-conversation significa "aceito"?
 *
 * - objeto com `success` → só `success === true` é aceite;
 * - corpo vazio, não-JSON ou objeto sem `success` → aceite. SUPOSIÇÃO
 *   registrada: a documentação só descreve o corpo com `success`; um 2xx sem
 *   esse campo não tem outra leitura razoável, e o corpo cru fica no rastro.
 */
export function providerAccepted(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return true;
  const obj = body as Record<string, unknown>;
  if (!("success" in obj)) return true;
  return obj.success === true;
}

/** POST /v2/channel/{channelId}/start-conversation */
export async function callStartConversation(
  opts: { token: string; channelId: string; phone: string; message: string; timeoutMs?: number },
): Promise<ProviderCallResult> {
  const url = `${AI_ENGINE_BASE}/channel/${opts.channelId}/start-conversation`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: engineHeaders(opts.token),
      body: JSON.stringify({ phone: opts.phone, message: opts.message }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    const rawText = await res.text().catch(() => "");
    let body: unknown = null;
    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body,
        rawText,
        errorCode: "provider_rejected",
        errorMessage: `provider ${res.status}: ${rawText.slice(0, 500)}`,
      };
    }
    // SE-REV-002 — a documentação do provider define a resposta 200 como
    // `{"success": boolean}`. Um `200 {"success": false}` é recusa: tratá-lo
    // como aberto gravava 'opened' e o lead nunca recebia nada.
    if (!providerAccepted(body)) {
      return {
        ok: false,
        status: res.status,
        body,
        rawText,
        errorCode: "provider_rejected",
        errorMessage: `provider ${res.status} com success=false: ${rawText.slice(0, 500)}`,
      };
    }
    return { ok: true, status: res.status, body, rawText };
  } catch (err) {
    return {
      ok: false,
      status: null,
      body: null,
      rawText: null,
      errorCode: "provider_unreachable",
      errorMessage: err instanceof Error ? err.message : "falha de rede no start-conversation",
    };
  }
}

// ── Configuração do tenant ──────────────────────────────────────────────────

/**
 * Lê a configuração do tenant. Tenant sem linha herda os defaults (desligado),
 * e um erro de leitura também: nenhum caminho aqui manda mensagem por acidente.
 */
export async function loadOpenerSettings(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  equipeId: string,
): Promise<OpenerSettings> {
  const { data, error } = await supabase
    .from("conversation_opener_settings")
    .select("equipe_id, enabled, channel_id, channel_type, trigger_sources, trigger_entry_ids, first_message")
    .eq("equipe_id", equipeId)
    .maybeSingle();

  if (error) {
    console.error("[start-conversation] falha ao ler conversation_opener_settings:", error);
    return { equipe_id: equipeId, ...DEFAULT_OPENER_SETTINGS };
  }
  if (!data) return { equipe_id: equipeId, ...DEFAULT_OPENER_SETTINGS };

  return {
    equipe_id: equipeId,
    enabled: data.enabled === true,
    channel_id: data.channel_id ?? null,
    channel_type: data.channel_type ?? null,
    trigger_sources: Array.isArray(data.trigger_sources) ? data.trigger_sources : [],
    trigger_entry_ids: Array.isArray(data.trigger_entry_ids) ? data.trigger_entry_ids : [],
    first_message: data.first_message ?? null,
  };
}

// ── Gatilho de entrada ──────────────────────────────────────────────────────

/**
 * Gatilho chamado por quem cria lead (hoje: crm-webhook).
 *
 * Decide aqui — com uma leitura de configuração, sem rede — se vale invocar a
 * edge function. Assim o caminho de entrada de lead continua igual para todo
 * tenant que não ligou o recurso: uma consulta a mais e nada mais.
 *
 * Nunca lança. A porta de entrada de lead não pode cair porque o provider está
 * fora do ar; a tentativa fica registrada em conversation_open_events pela
 * própria função invocada.
 */
export async function dispatchConversationOpen(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: {
    equipeId: string;
    leadId: string;
    source?: string | null;
    /** SE-REV-002 — a porta (crm_entries.id) por onde o lead chegou agora. */
    entryId?: string | null;
    eventKey?: string | null;
    logPrefix?: string;
  },
): Promise<{ dispatched: boolean; reason?: string }> {
  const prefix = input.logPrefix ?? "[start-conversation]";
  try {
    const settings = await loadOpenerSettings(supabase, input.equipeId);
    if (!settings.enabled) return { dispatched: false, reason: "disabled" };
    if (!entryMatches(settings.trigger_entry_ids, input.entryId)) {
      return { dispatched: false, reason: "entry_not_triggered" };
    }
    if (!sourceMatches(settings.trigger_sources, input.source)) {
      return { dispatched: false, reason: "source_not_triggered" };
    }

    const baseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!baseUrl || !serviceKey) return { dispatched: false, reason: "env_missing" };

    const res = await fetch(`${baseUrl}/functions/v1/start-conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
      body: JSON.stringify({
        equipe_id: input.equipeId,
        lead_id: input.leadId,
        event_key: input.eventKey ?? null,
        trigger_source: "lead_intake",
        // SE-REV-002 — o filtro do lado da função usa o source e a porta DESTA
        // chegada, não o leads.source gravado no primeiro cadastro.
        source: input.source ?? null,
        entry_id: input.entryId ?? null,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`${prefix} start-conversation respondeu ${res.status}:`, text.slice(0, 500));
      return { dispatched: false, reason: `http_${res.status}` };
    }
    return { dispatched: true };
  } catch (err) {
    console.error(`${prefix} falha ao disparar start-conversation:`, err);
    return { dispatched: false, reason: "exception" };
  }
}
