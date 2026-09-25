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

// Compatibilidade da SE-REV-001: consumidores antigos continuam importando
// deste módulo enquanto a implementação passa a morar no adaptador de provider.
export {
  AI_ENGINE_BASE,
  callStartConversation,
  engineHeaders,
  extractProviderChatId,
  listEngineChannels,
  pickStartConversationChannel,
  providerAccepted,
  START_CONVERSATION_CHANNEL_TYPES,
  supportsStartConversation,
} from "./outreach/gptmaker.ts";
export type {
  EngineChannel,
  OpenFailureCode,
  ProviderCallResult,
} from "./outreach/gptmaker.ts";

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
export function buildEventKey(
  input: { eventKey?: string | null; leadId: string },
): string {
  const explicit = typeof input.eventKey === "string"
    ? input.eventKey.trim()
    : "";
  if (explicit) return explicit.slice(0, 200);
  return `lead:${input.leadId}`;
}

/** `source` do lead casa com o filtro do tenant? Lista vazia = qualquer source. */
export function sourceMatches(
  triggerSources: string[] | null | undefined,
  source: string | null | undefined,
): boolean {
  const filters = (triggerSources ?? []).map((s) =>
    String(s).trim().toLowerCase()
  ).filter(Boolean);
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
export function entryMatches(
  triggerEntryIds: string[] | null | undefined,
  entryId: string | null | undefined,
): boolean {
  const filters = (triggerEntryIds ?? []).map((s) =>
    String(s).trim().toLowerCase()
  ).filter(Boolean);
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
  if (!entryMatches(settings.trigger_entry_ids, entryId)) {
    return "entry_not_triggered";
  }
  const source = typeof event.source === "string"
    ? event.source
    : event.leadSource ?? null;
  if (!sourceMatches(settings.trigger_sources, source)) {
    return "source_not_triggered";
  }
  return null;
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
export function renderFirstMessage(
  template: string | null | undefined,
  ctx: MessageContext,
): string {
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
    .replace(
      /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g,
      (_m, key: string) => values[key] ?? "",
    )
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
/**
 * O telefone no formato que o provider recebe: só dígitos, com DDI.
 * Reaproveita normalizePhone() — a mesma normalização que já decide identidade
 * de lead no gpt-maker-webhook — para que o número usado na abertura seja o
 * mesmo número pelo qual a resposta do lead vai ser reconhecida depois.
 */
export function providerPhone(raw: string | null | undefined): string | null {
  return normalizePhone(raw);
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
    .select(
      "equipe_id, enabled, channel_id, channel_type, trigger_sources, trigger_entry_ids, first_message",
    )
    .eq("equipe_id", equipeId)
    .maybeSingle();

  if (error) {
    console.error(
      "[start-conversation] falha ao ler conversation_opener_settings:",
      error,
    );
    return { equipe_id: equipeId, ...DEFAULT_OPENER_SETTINGS };
  }
  if (!data) return { equipe_id: equipeId, ...DEFAULT_OPENER_SETTINGS };

  return {
    equipe_id: equipeId,
    enabled: data.enabled === true,
    channel_id: data.channel_id ?? null,
    channel_type: data.channel_type ?? null,
    trigger_sources: Array.isArray(data.trigger_sources)
      ? data.trigger_sources
      : [],
    trigger_entry_ids: Array.isArray(data.trigger_entry_ids)
      ? data.trigger_entry_ids
      : [],
    first_message: data.first_message ?? null,
  };
}

async function cadenceIntakeState(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: { equipeId: string; leadId: string; entryId?: string | null },
): Promise<{ ownsEntry: boolean; enrolled: boolean }> {
  if (!input.entryId) return { ownsEntry: false, enrolled: false };
  const { data: sequences, error } = await supabase
    .from("cadence_sequences")
    .select("id")
    .eq("equipe_id", input.equipeId)
    .eq("active", true)
    .eq("trigger_event", "lead_intake")
    .contains("trigger_entry_ids", [input.entryId])
    .limit(20);
  if (error) {
    console.error(
      "[start-conversation] falha ao verificar convivência com cadência:",
      error,
    );
    return { ownsEntry: false, enrolled: false };
  }
  const ids = (sequences ?? []).map((sequence: { id: string }) => sequence.id);
  if (!ids.length) return { ownsEntry: false, enrolled: false };

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("cadence_enrollments")
    .select("id")
    .eq("lead_id", input.leadId)
    .eq("status", "active")
    .in("sequence_id", ids)
    .limit(1)
    .maybeSingle();
  if (enrollmentError) {
    console.error(
      "[start-conversation] sequência ativa sem confirmação da inscrição:",
      enrollmentError,
    );
  }
  return { ownsEntry: true, enrolled: Boolean(enrollment) };
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

    // Se uma sequência ativa é dona desta porta, o gatilho SQL em lead_touches
    // já materializou o passo 0. Nunca invocamos também a abertura legada.
    const cadence = await cadenceIntakeState(supabase, input);
    if (cadence.ownsEntry) {
      return cadence.enrolled
        ? { dispatched: true, reason: "cadence" }
        : { dispatched: false, reason: "cadence_enrollment_missing" };
    }

    const baseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!baseUrl || !serviceKey) {
      return { dispatched: false, reason: "env_missing" };
    }

    const res = await fetch(`${baseUrl}/functions/v1/start-conversation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
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
      console.error(
        `${prefix} start-conversation respondeu ${res.status}:`,
        text.slice(0, 500),
      );
      return { dispatched: false, reason: `http_${res.status}` };
    }
    return { dispatched: true };
  } catch (err) {
    console.error(`${prefix} falha ao disparar start-conversation:`, err);
    return { dispatched: false, reason: "exception" };
  }
}
