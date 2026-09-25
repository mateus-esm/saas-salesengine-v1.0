// ============================================================================
// SE-REV-001 — start-conversation
//
// Abre a primeira conversa de WhatsApp com um lead, pelo canal do próprio
// tenant, para o agente de IA começar o atendimento sem ninguém clicar em nada.
//
// Três formas de chamar, todas no mesmo caminho de execução — o que é chamado
// pelo gatilho interno é exatamente o que o n8n chama, então validar um valida
// o outro:
//
//   1. service_role  (Authorization: Bearer <SERVICE_ROLE_KEY>, equipe_id no
//      corpo) — é assim que o gatilho de entrada de lead do crm-webhook chega
//      aqui;
//   2. segredo do tenant (header x-webhook-secret ou ?secret=, o mesmo
//      equipes.webhook_secret que o crm-webhook já usa) — o caminho temporário
//      do n8n do cliente. Nenhum segredo novo para distribuir;
//   3. usuário autenticado (JWT) — abertura manual e leitura/escrita da
//      configuração (actions get-settings / update-settings).
//
// Idempotência: conversation_open_events tem UNIQUE (equipe_id, event_key) e o
// INSERT é a reserva. Quem perde a corrida lê a linha vencedora e devolve o que
// já existe. Sem chave explícita, a chave é 'lead:<id>' — uma conversa aberta
// por lead. Ver buildEventKey() em _shared/start-conversation.ts.
//
// O que NÃO acontece aqui: criar lead. O lead é criado por quem recebe o
// cadastro (crm-webhook, formulário). Esta função abre conversa com um lead que
// já existe, ou responde 404.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTechnicalPhone } from "../_shared/phone.ts";
import {
  buildEventKey,
  callStartConversation,
  extractProviderChatId,
  listEngineChannels,
  loadOpenerSettings,
  type OpenFailureCode,
  type OpenerSettings,
  pickStartConversationChannel,
  providerPhone,
  renderFirstMessage,
  sourceMatches,
} from "../_shared/start-conversation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

class HttpError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Caller = {
  equipeId: string;
  /** Quem chamou, para o rastro: 'lead_intake' | 'http' | 'manual'. */
  defaultTriggerSource: "lead_intake" | "http" | "manual";
  /** Só o usuário autenticado pode mexer na configuração. */
  profileId: string | null;
};

interface TeamRow {
  id: string;
  nome: string | null;
  workspace_id: string | null;
  gpt_maker_agent_id: string | null;
}

// ── Autenticação ────────────────────────────────────────────────────────────

/**
 * Resolve o tenant a partir de uma das três credenciais aceitas.
 *
 * A ordem importa: o segredo do tenant é verificado antes do JWT porque o n8n
 * manda os dois cabeçalhos quando a requisição passa pelo gateway do Supabase
 * (que exige um apikey/Authorization qualquer) — e nesse caso o que identifica
 * o tenant é o segredo, não o token do gateway.
 */
async function resolveCaller(
  req: Request,
  url: URL,
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Caller> {
  const secret = req.headers.get("x-webhook-secret") || url.searchParams.get("secret");
  if (secret) {
    const { data: team, error } = await supabase
      .from("equipes")
      .select("id")
      .eq("webhook_secret", secret)
      .maybeSingle();
    if (error) throw error;
    if (!team) throw new HttpError("Segredo de webhook inválido", 401, "invalid_secret");
    return { equipeId: team.id, defaultTriggerSource: "http", profileId: null };
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError("Credencial ausente", 401, "unauthorized");

  // service_role: chamada interna (gatilho de entrada de lead). O tenant vem no
  // corpo porque a chave de serviço não pertence a tenant nenhum.
  if (token === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "___")) {
    const equipeId = typeof body.equipe_id === "string" ? body.equipe_id.trim() : "";
    if (!equipeId) throw new HttpError("equipe_id é obrigatório na chamada interna", 400, "missing_equipe");
    return { equipeId, defaultTriggerSource: "lead_intake", profileId: null };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) throw new HttpError("Credencial inválida", 401, "unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, equipe_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.equipe_id) throw new HttpError("Perfil sem equipe", 403, "no_team");

  return { equipeId: profile.equipe_id, defaultTriggerSource: "manual", profileId: profile.id };
}

// ── Resolução do lead ───────────────────────────────────────────────────────

interface LeadRow {
  id: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  equipe_id: string;
}

const LEAD_COLUMNS = "id, name, phone, source, equipe_id";

/**
 * Acha o lead por id ou por telefone. O telefone passa pelo mesmo RPC
 * `crm_find_lead_by_phone` que o crm-webhook usa, porque `leads.phone` guarda o
 * que foi digitado (com máscara, em boa parte da base) e comparar dígitos crus
 * não encontra o lead — foi exatamente esse o bug do Sprint 11.
 */
async function resolveLead(
  supabase: SupabaseClient,
  equipeId: string,
  body: Record<string, unknown>,
): Promise<LeadRow> {
  const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
  if (leadId) {
    const { data, error } = await supabase
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("id", leadId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError("Lead não encontrado", 404, "lead_not_found");
    if (data.equipe_id !== equipeId) throw new HttpError("Lead de outra equipe", 403, "forbidden");
    return data as LeadRow;
  }

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!phone) throw new HttpError("lead_id ou phone é obrigatório", 400, "missing_lead");

  const { data: foundId, error: rpcError } = await supabase.rpc("crm_find_lead_by_phone", {
    p_equipe_id: equipeId,
    p_phone: phone,
  });
  if (rpcError) throw rpcError;
  if (!foundId) {
    throw new HttpError(
      "Nenhum lead deste time com esse telefone. Cadastre o lead primeiro (crm-webhook) e chame de novo.",
      404,
      "lead_not_found",
    );
  }

  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("id", foundId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError("Lead não encontrado", 404, "lead_not_found");
  return data as LeadRow;
}

// ── Rastro ──────────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  status: string;
  conversation_id: string | null;
  provider_chat_id: string | null;
  attempts: number;
  event_key: string;
}

const EVENT_COLUMNS = "id, status, conversation_id, provider_chat_id, attempts, event_key";

/**
 * Reserva o evento. O INSERT é a trava: UNIQUE (equipe_id, event_key) garante
 * que só um chamador segue em frente.
 *
 * - 'claimed'      → esta chamada é a dona, pode falar com o provider;
 * - 'already'      → já existe conversa aberta (ou outra chamada está abrindo
 *                    agora) — devolve o que existe, sem abrir uma segunda;
 * - 'retaken'      → a tentativa anterior falhou/foi pulada e esta reassume.
 *
 * Uma reserva 'pending' velha não trava para sempre: passados STALE_MS ela é
 * considerada abandonada (a função morreu no meio, o provider pendurou) e pode
 * ser reassumida. Sem isso, um timeout deixaria o lead sem conversa e sem
 * caminho de retry.
 */
const STALE_PENDING_MS = 5 * 60_000;

async function claimEvent(
  supabase: SupabaseClient,
  row: {
    equipe_id: string;
    lead_id: string;
    event_key: string;
    trigger_source: string;
    phone: string | null;
    force: boolean;
  },
): Promise<{ kind: "claimed" | "retaken"; event: EventRow } | { kind: "already"; event: EventRow }> {
  const { data: inserted, error } = await supabase
    .from("conversation_open_events")
    .insert({
      equipe_id: row.equipe_id,
      lead_id: row.lead_id,
      event_key: row.event_key,
      trigger_source: row.trigger_source,
      phone: row.phone,
      status: "pending",
    })
    .select(EVENT_COLUMNS)
    .single();

  if (!error) return { kind: "claimed", event: inserted as EventRow };
  if ((error as { code?: string }).code !== "23505") throw error;

  const { data: existing, error: readError } = await supabase
    .from("conversation_open_events")
    .select(`${EVENT_COLUMNS}, updated_at`)
    .eq("equipe_id", row.equipe_id)
    .eq("event_key", row.event_key)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new HttpError("Conflito de idempotência sem linha vencedora", 500, "idempotency_race");

  const event = existing as EventRow & { updated_at: string };

  if (event.status === "opened" && !row.force) return { kind: "already", event };

  const stale = Date.now() - new Date(event.updated_at).getTime() > STALE_PENDING_MS;
  if (event.status === "pending" && !stale) return { kind: "already", event };

  // Reassume: 'failed'/'skipped', ou 'pending' abandonada, ou force explícito.
  // O .eq('status', ...) é o que impede duas chamadas de reassumirem juntas.
  const { data: retaken, error: takeError } = await supabase
    .from("conversation_open_events")
    .update({
      status: "pending",
      attempts: (event.attempts ?? 1) + 1,
      trigger_source: row.trigger_source,
      phone: row.phone,
      error_code: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", event.id)
    .eq("status", event.status)
    .select(EVENT_COLUMNS)
    .maybeSingle();
  if (takeError) throw takeError;
  if (!retaken) return { kind: "already", event };
  return { kind: "retaken", event: retaken as EventRow };
}

async function recordFailure(
  supabase: SupabaseClient,
  eventId: string,
  failure: {
    code: OpenFailureCode | string;
    message: string;
    status?: "failed" | "skipped";
    providerStatus?: number | null;
    providerResponse?: unknown;
    channelId?: string | null;
    channelType?: string | null;
  },
) {
  // Registrado, nunca em silêncio: a linha em conversation_open_events é o que
  // permite responder "por que o lead X nunca recebeu mensagem?" sem log vivo.
  console.error(`[start-conversation] ${failure.code}: ${failure.message}`);
  await supabase
    .from("conversation_open_events")
    .update({
      status: failure.status ?? "failed",
      error_code: failure.code,
      error_message: failure.message.slice(0, 2000),
      provider_status: failure.providerStatus ?? null,
      provider_response: failure.providerResponse ?? null,
      channel_id: failure.channelId ?? null,
      channel_type: failure.channelType ?? null,
    })
    .eq("id", eventId);
}

/**
 * Grava a conversa aberta.
 *
 * Reaproveita a conversa de WhatsApp que o lead já tenha, em vez de criar outra:
 * o gpt-maker-webhook procura conversa por (lead, canal) antes de criar, e duas
 * conversas de WhatsApp para o mesmo lead fariam a resposta dele cair numa e a
 * nossa mensagem ficar na outra.
 */
async function persistOpenedConversation(
  supabase: SupabaseClient,
  input: {
    equipeId: string;
    leadId: string;
    channelId: string;
    providerChatId: string | null;
    message: string;
  },
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const patch = {
    gpt_maker_chat_id: input.providerChatId,
    opened_at: nowIso,
    opened_via: "start_conversation",
    provider_channel_id: input.channelId,
    last_message_at: nowIso,
  };

  const { data: existing } = await supabase
    .from("conversations")
    .select("id, status, gpt_maker_chat_id")
    .eq("lead_id", input.leadId)
    .eq("channel", "whatsapp")
    .neq("status", "deleted")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  let conversationId: string | null = null;

  if (existing) {
    conversationId = existing.id;
    const update: Record<string, unknown> = { ...patch };
    // Um chat_id que já existe não é sobrescrito por null: se o provider não
    // devolveu id nenhum, o id que a conversa já tinha continua valendo.
    if (!input.providerChatId) delete update.gpt_maker_chat_id;
    if (existing.status === "archived") {
      update.status = "active";
      update.archived_at = null;
    }
    await supabase.from("conversations").update(update).eq("id", conversationId);
  } else {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        lead_id: input.leadId,
        equipe_id: input.equipeId,
        channel: "whatsapp",
        status: "active",
        atendido_por_agente: false,
        unread_count: 0,
        ...patch,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[start-conversation] falha ao criar conversa:", error);
      return null;
    }
    conversationId = created.id;
  }

  // A mensagem enviada aparece no inbox como qualquer outra saída. O eco que o
  // provider devolve depois pelo gpt-maker-webhook é descartado lá pela dedup
  // de conteúdo em janela de 5 min para remetente 'agent'.
  const { error: msgError } = await supabase.from("messages").insert({
    lead_id: input.leadId,
    conversation_id: conversationId,
    content: input.message,
    sender_type: "agent",
    provider: "gptmaker",
    created_at: nowIso,
  });
  if (msgError) console.error("[start-conversation] falha ao registrar mensagem enviada:", msgError);

  return conversationId;
}

// ── Configuração (actions get-settings / update-settings) ───────────────────

const SETTINGS_COLUMNS = "equipe_id, enabled, channel_id, channel_type, trigger_sources, first_message, updated_at";

async function handleUpdateSettings(
  supabase: SupabaseClient,
  caller: Caller,
  body: Record<string, unknown>,
): Promise<Response> {
  if (!caller.profileId) {
    throw new HttpError("Só um usuário autenticado altera a configuração", 403, "forbidden");
  }

  const patch: Record<string, unknown> = { equipe_id: caller.equipeId };
  if ("enabled" in body) patch.enabled = body.enabled === true;
  if ("channel_id" in body) {
    const value = typeof body.channel_id === "string" ? body.channel_id.trim() : "";
    patch.channel_id = value || null;
  }
  if ("channel_type" in body) {
    const value = typeof body.channel_type === "string" ? body.channel_type.trim() : "";
    patch.channel_type = value || null;
  }
  if ("first_message" in body) {
    const value = typeof body.first_message === "string" ? body.first_message : "";
    patch.first_message = value.trim() || null;
  }
  if ("trigger_sources" in body) {
    const list = Array.isArray(body.trigger_sources) ? body.trigger_sources : [];
    patch.trigger_sources = list
      .map((s) => String(s).trim())
      .filter(Boolean);
  }

  const { data, error } = await supabase
    .from("conversation_opener_settings")
    .upsert(patch, { onConflict: "equipe_id" })
    .select(SETTINGS_COLUMNS)
    .single();
  if (error) throw error;
  return json({ settings: data });
}

// ── Abertura ────────────────────────────────────────────────────────────────

async function handleOpen(
  supabase: SupabaseClient,
  caller: Caller,
  body: Record<string, unknown>,
): Promise<Response> {
  const settings: OpenerSettings = await loadOpenerSettings(supabase, caller.equipeId);

  // O interruptor vale para os três caminhos de chamada, de propósito: ele é a
  // autorização do tenant para o Rev mandar a primeira mensagem. Um tenant que
  // não ligou isso não recebe abertura automática nem por um n8n mal apontado.
  if (!settings.enabled) {
    console.log(`[start-conversation] equipe ${caller.equipeId}: recurso desligado`);
    return json({
      success: false,
      skipped: true,
      code: "disabled" satisfies OpenFailureCode,
      message:
        "Abertura automática de conversa está desligada para este tenant. " +
        "Ligue em conversation_opener_settings (action update-settings).",
    }, 409);
  }

  const lead = await resolveLead(supabase, caller.equipeId, body);

  const triggerSource = typeof body.trigger_source === "string" && body.trigger_source
    ? body.trigger_source
    : caller.defaultTriggerSource;

  // O filtro de source existe para o gatilho automático: é ele que separa
  // "lead veio do anúncio" de "lead digitado à mão por um vendedor". Chamada
  // explícita (n8n, botão) já é a intenção declarada e não passa pelo filtro.
  if (triggerSource === "lead_intake" && !sourceMatches(settings.trigger_sources, lead.source)) {
    console.log(
      `[start-conversation] lead ${lead.id}: source "${lead.source}" fora do filtro do tenant`,
    );
    return json({
      success: false,
      skipped: true,
      code: "source_not_triggered" satisfies OpenFailureCode,
      lead_id: lead.id,
    }, 200);
  }

  // Conta em modo somente-leitura não manda mensagem — mesma regra (e mesmo
  // 402) do send-chat-message.
  const { data: suspended } = await supabase.rpc("tenant_is_suspended", {
    p_equipe_id: caller.equipeId,
  });
  if (suspended === true) {
    throw new HttpError(
      "contract_suspended: conta em modo somente leitura. Pague a fatura em aberto para voltar a enviar mensagens.",
      402,
      "contract_suspended",
    );
  }

  const eventKey = buildEventKey({
    eventKey: typeof body.event_key === "string" ? body.event_key : null,
    leadId: lead.id,
  });
  const phone = providerPhone(lead.phone);

  const claim = await claimEvent(supabase, {
    equipe_id: caller.equipeId,
    lead_id: lead.id,
    event_key: eventKey,
    trigger_source: triggerSource,
    phone,
    force: body.force === true,
  });

  if (claim.kind === "already") {
    console.log(`[start-conversation] evento ${eventKey} já processado (${claim.event.status})`);
    return json({
      success: claim.event.status === "opened",
      already: true,
      status: claim.event.status,
      event_id: claim.event.id,
      event_key: eventKey,
      lead_id: lead.id,
      conversation_id: claim.event.conversation_id,
      provider_chat_id: claim.event.provider_chat_id,
    }, 200);
  }

  const eventId = claim.event.id;

  // SE-LID-001: um id técnico da Meta ("...@lid") parece número e não é. Não dá
  // para abrir conversa com ele, e tentar mandaria a mensagem para o vazio.
  if (isTechnicalPhone(lead.phone)) {
    await recordFailure(supabase, eventId, {
      code: "technical_phone",
      message: `O lead ${lead.id} tem um identificador técnico no lugar do telefone.`,
    });
    return json({ success: false, code: "technical_phone", event_id: eventId, lead_id: lead.id }, 422);
  }
  if (!phone) {
    await recordFailure(supabase, eventId, {
      code: "missing_phone",
      message: `O lead ${lead.id} não tem telefone utilizável.`,
    });
    return json({ success: false, code: "missing_phone", event_id: eventId, lead_id: lead.id }, 422);
  }

  const { data: team, error: teamError } = await supabase
    .from("equipes")
    .select("id, nome, workspace_id, gpt_maker_agent_id")
    .eq("id", caller.equipeId)
    .maybeSingle();
  if (teamError) throw teamError;
  const tenant = (team ?? null) as TeamRow | null;

  const message = renderFirstMessage(
    typeof body.message === "string" && body.message.trim() ? body.message : settings.first_message,
    { leadName: lead.name, leadSource: lead.source, tenantName: tenant?.nome ?? null },
  );
  if (!message) {
    await recordFailure(supabase, eventId, {
      code: "missing_message",
      message:
        "Sem primeira mensagem: configure first_message em conversation_opener_settings " +
        "ou mande `message` no corpo da chamada.",
    });
    return json({ success: false, code: "missing_message", event_id: eventId, lead_id: lead.id }, 422);
  }

  const engineToken = Deno.env.get("GPT_MAKER_TOKEN");
  if (!engineToken) {
    await recordFailure(supabase, eventId, {
      code: "engine_token_missing",
      message: "GPT_MAKER_TOKEN não está configurado no ambiente da função.",
    });
    return json({ success: false, code: "engine_token_missing", event_id: eventId }, 500);
  }
  // IDs colados no Admin carregam whitespace/newline — o mesmo saneamento que o
  // manage-agent-channels faz, pelo mesmo motivo (URL quebrada em produção).
  const workspaceId = (tenant?.workspace_id ?? "").trim();
  const agentId = (tenant?.gpt_maker_agent_id ?? "").trim();
  if (!workspaceId || !agentId) {
    await recordFailure(supabase, eventId, {
      code: workspaceId ? "agent_not_configured" : "workspace_not_configured",
      message: `Tenant ${caller.equipeId} sem workspace_id/gpt_maker_agent_id configurado.`,
    });
    return json({
      success: false,
      code: workspaceId ? "agent_not_configured" : "workspace_not_configured",
      event_id: eventId,
    }, 422);
  }

  const listed = await listEngineChannels({ token: engineToken, workspaceId, agentId });
  if ("errorCode" in listed) {
    await recordFailure(supabase, eventId, { code: listed.errorCode, message: listed.detail });
    return json({ success: false, code: listed.errorCode, message: listed.detail, event_id: eventId }, 502);
  }

  const requestedChannel = typeof body.channel_id === "string" && body.channel_id.trim()
    ? body.channel_id.trim()
    : settings.channel_id;
  const picked = pickStartConversationChannel(listed.channels, requestedChannel);
  if ("errorCode" in picked) {
    await recordFailure(supabase, eventId, {
      code: picked.errorCode,
      message: picked.detail,
      channelId: requestedChannel ?? null,
    });
    return json({ success: false, code: picked.errorCode, message: picked.detail, event_id: eventId }, 422);
  }
  const channel = picked.channel;
  const channelType = String(channel.type ?? "").toUpperCase();

  const result = await callStartConversation({
    token: engineToken,
    channelId: channel.id,
    phone,
    message,
  });

  if (!result.ok) {
    await recordFailure(supabase, eventId, {
      code: result.errorCode ?? "provider_rejected",
      message: result.errorMessage ?? "provider recusou a abertura de conversa",
      providerStatus: result.status,
      providerResponse: result.body ?? (result.rawText ? { raw: result.rawText.slice(0, 2000) } : null),
      channelId: channel.id,
      channelType,
    });
    return json({
      success: false,
      code: result.errorCode ?? "provider_rejected",
      message: result.errorMessage,
      provider_status: result.status,
      event_id: eventId,
      // O tipo reportado pelo provider não garante que o canal aceite o
      // endpoint (canal oficial vestido de WHATSAPP). Vale dizer isso a quem lê
      // a resposta, em vez de deixar o 404 do provider sem explicação.
      hint: result.status === 404
        ? "O provider não expôs start-conversation neste canal. Confirme que é WhatsApp NÃO oficial (conexão por QR code)."
        : undefined,
    }, 502);
  }

  const providerChatId = extractProviderChatId(result.body);
  const conversationId = await persistOpenedConversation(supabase, {
    equipeId: caller.equipeId,
    leadId: lead.id,
    channelId: channel.id,
    providerChatId,
    message,
  });

  await supabase
    .from("conversation_open_events")
    .update({
      status: "opened",
      channel_id: channel.id,
      channel_type: channelType,
      message,
      provider_chat_id: providerChatId,
      provider_response: result.body ?? (result.rawText ? { raw: result.rawText.slice(0, 2000) } : null),
      provider_status: result.status,
      conversation_id: conversationId,
      opened_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq("id", eventId);

  // Timeline do lead: quem abriu a conversa, por qual canal, com que resultado.
  await supabase.from("lead_activities").insert({
    lead_id: lead.id,
    tipo: "conversation_opened",
    descricao: "Conversa de WhatsApp aberta pelo Rev para o agente iniciar o atendimento",
    metadata: {
      event_id: eventId,
      event_key: eventKey,
      trigger_source: triggerSource,
      channel_id: channel.id,
      channel_type: channelType,
      provider_chat_id: providerChatId,
      conversation_id: conversationId,
    },
  });

  console.log(
    `[start-conversation] aberta: lead=${lead.id} canal=${channel.id} chat=${providerChatId ?? "sem id"}`,
  );

  return json({
    success: true,
    event_id: eventId,
    event_key: eventKey,
    lead_id: lead.id,
    conversation_id: conversationId,
    channel_id: channel.id,
    channel_type: channelType,
    provider_chat_id: providerChatId,
  }, 201);
}

// ── Entrada HTTP ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const url = new URL(req.url);
    // Corpo ausente ou não-JSON não é erro de parse: `functions.invoke(name)`
    // sem opções manda POST com corpo vazio, e a leitura de configuração é uma
    // chamada legítima sem corpo (mesma convenção do manage-agent-channels).
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = url.searchParams.get("action") ||
      (typeof body.action === "string" && body.action ? body.action : "open");

    const caller = await resolveCaller(req, url, supabase, body);

    if (action === "get-settings") {
      const { data, error } = await supabase
        .from("conversation_opener_settings")
        .select(SETTINGS_COLUMNS)
        .eq("equipe_id", caller.equipeId)
        .maybeSingle();
      if (error) throw error;
      return json({ settings: data ?? null });
    }

    if (action === "update-settings") {
      return await handleUpdateSettings(supabase, caller, body);
    }

    if (action === "open") {
      return await handleOpen(supabase, caller, body);
    }

    return json({ success: false, code: "unknown_action", message: `Ação desconhecida: ${action}` }, 400);
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ success: false, code: error.code, message: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[start-conversation] erro inesperado:", error);
    return json({ success: false, code: "internal_error", message }, 500);
  }
});
