import { classifyGptMakerResult } from "./classify.ts";
import type {
  DeliveryResult,
  OutreachLine,
  OutreachProvider,
  ResolveCtx,
  ResolveLineResult,
} from "./providers.ts";

export const AI_ENGINE_BASE = "https://api.gptmaker.ai/v2";
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

export interface EngineChannel {
  id: string;
  name?: string | null;
  type?: string | null;
  connected?: boolean | null;
  username?: string | null;
}

export interface ProviderCallResult {
  ok: boolean;
  status: number | null;
  body: unknown;
  rawText: string | null;
  errorCode?: OpenFailureCode;
  errorMessage?: string;
}

export function supportsStartConversation(
  type: string | null | undefined,
): boolean {
  const normalized = String(type ?? "").trim().toUpperCase();
  return (START_CONVERSATION_CHANNEL_TYPES as readonly string[]).includes(
    normalized,
  );
}

export function pickStartConversationChannel(
  channels: EngineChannel[],
  preferredId?: string | null,
): { channel: EngineChannel } | { errorCode: OpenFailureCode; detail: string } {
  const wanted = String(preferredId ?? "").trim();
  if (wanted) {
    const found = channels.find((channel) =>
      String(channel.id ?? "").trim() === wanted
    );
    if (!found) {
      return {
        errorCode: "channel_not_found",
        detail:
          `Canal ${wanted} não existe (ou não pertence a este agente) no provider.`,
      };
    }
    if (!supportsStartConversation(found.type)) {
      return {
        errorCode: "channel_type_unsupported",
        detail:
          `O canal ${wanted} é do tipo ${found.type ?? "desconhecido"}. ` +
          "O provider só abre conversa em canal de WhatsApp não oficial (WHATSAPP).",
      };
    }
    if (found.connected !== true) {
      return {
        errorCode: "channel_not_connected",
        detail: `O canal ${wanted} está desconectado no provider.`,
      };
    }
    return { channel: found };
  }

  const supported = channels.filter((channel) =>
    supportsStartConversation(channel.type)
  );
  if (!supported.length) {
    return {
      errorCode: "no_whatsapp_channel",
      detail: "O tenant não tem canal de WhatsApp não oficial no provider.",
    };
  }
  const connected = supported.filter((channel) => channel.connected === true);
  if (!connected.length) {
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
        `(${
          connected.map((channel) =>
            `${channel.id}${channel.username ? ` / ${channel.username}` : ""}`
          ).join(", ")
        }). ` +
        "Defina channel_id em conversation_opener_settings para escolher a linha.",
    };
  }
  return { channel: connected[0] };
}

export function extractProviderChatId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ["chatId", "contextId", "conversationId", "id"]) {
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

export function engineHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function listEngineChannels(
  opts: { token: string; workspaceId: string; agentId: string },
): Promise<
  { channels: EngineChannel[] } | { errorCode: OpenFailureCode; detail: string }
> {
  const url =
    `${AI_ENGINE_BASE}/workspace/${opts.workspaceId}/channels?agentId=${opts.agentId}&page=1&pageSize=50`;
  try {
    const response = await fetch(url, { headers: engineHeaders(opts.token) });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        errorCode: "channel_list_failed",
        detail: `provider ${response.status}: ${text.slice(0, 500)}`,
      };
    }
    const data = await response.json().catch(() => ({}));
    const channels = Array.isArray((data as Record<string, unknown>)?.data)
      ? (data as { data: EngineChannel[] }).data
      : [];
    return { channels };
  } catch (error) {
    return {
      errorCode: "provider_unreachable",
      detail: error instanceof Error
        ? error.message
        : "falha de rede ao listar canais",
    };
  }
}

export function providerAccepted(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return true;
  const obj = body as Record<string, unknown>;
  return !("success" in obj) || obj.success === true;
}

export async function callStartConversation(
  opts: {
    token: string;
    channelId: string;
    phone: string;
    message: string;
    timeoutMs?: number;
  },
): Promise<ProviderCallResult> {
  try {
    const response = await fetch(
      `${AI_ENGINE_BASE}/channel/${opts.channelId}/start-conversation`,
      {
        method: "POST",
        headers: engineHeaders(opts.token),
        body: JSON.stringify({ phone: opts.phone, message: opts.message }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      },
    );
    const rawText = await response.text().catch(() => "");
    let body: unknown = null;
    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch {
      body = null;
    }
    if (!response.ok || !providerAccepted(body)) {
      return {
        ok: false,
        status: response.status,
        body,
        rawText,
        errorCode: "provider_rejected",
        errorMessage: !response.ok
          ? `provider ${response.status}: ${rawText.slice(0, 500)}`
          : `provider ${response.status} com success=false: ${
            rawText.slice(0, 500)
          }`,
      };
    }
    return { ok: true, status: response.status, body, rawText };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: null,
      rawText: null,
      errorCode: "provider_unreachable",
      errorMessage: error instanceof Error
        ? error.message
        : "falha de rede no start-conversation",
    };
  }
}

async function resolveGptMakerLine(
  ctx: ResolveCtx,
): Promise<ResolveLineResult> {
  const token = Deno.env.get("GPT_MAKER_TOKEN") ?? "";
  if (!token) {
    return {
      errorCode: "engine_token_missing",
      detail: "GPT_MAKER_TOKEN ausente.",
    };
  }
  const { data: team, error } = await ctx.supabase
    .from("equipes")
    .select("workspace_id, gpt_maker_agent_id")
    .eq("id", ctx.equipeId)
    .maybeSingle();
  if (error) throw error;
  const workspaceId = String(team?.workspace_id ?? "").trim();
  const agentId = String(team?.gpt_maker_agent_id ?? "").trim();
  if (!workspaceId) {
    return {
      errorCode: "workspace_not_configured",
      detail: "Tenant sem workspace_id.",
    };
  }
  if (!agentId) {
    return {
      errorCode: "agent_not_configured",
      detail: "Tenant sem gpt_maker_agent_id.",
    };
  }
  const listed = await listEngineChannels({ token, workspaceId, agentId });
  if ("errorCode" in listed) return listed;
  const picked = pickStartConversationChannel(
    listed.channels,
    ctx.settings.channel_id,
  );
  if ("errorCode" in picked) return picked;
  const channel = picked.channel;
  return {
    line: {
      provider: "gptmaker",
      ref: channel.id,
      lineId: channel.id,
      key: `gptmaker:${channel.id}`,
      channelType: channel.type ?? null,
    },
  };
}

async function deliverGptMaker(
  line: OutreachLine,
  req: { phone: string; text: string },
): Promise<DeliveryResult> {
  const token = Deno.env.get("GPT_MAKER_TOKEN") ?? "";
  if (!token) {
    return {
      outcome: "rejected",
      retryable: false,
      errorCode: "engine_token_missing",
      errorMessage: "GPT_MAKER_TOKEN ausente.",
      providerStatus: null,
      providerBody: null,
      providerMessageId: null,
      providerChatId: null,
    };
  }
  const result = await callStartConversation({
    token,
    channelId: line.ref,
    phone: req.phone,
    message: req.text,
  });
  const classification = classifyGptMakerResult({
    status: result.status,
    accepted: result.ok,
    error: result.status === null
      ? new Error(result.errorMessage ?? "provider unreachable")
      : undefined,
  });
  return {
    ...classification,
    errorMessage: result.errorMessage,
    providerStatus: result.status,
    providerBody: result.body ??
      (result.rawText ? { raw: result.rawText } : null),
    providerMessageId: null,
    providerChatId: extractProviderChatId(result.body),
  };
}

export const gptMakerProvider: OutreachProvider = {
  id: "gptmaker",
  resolveLine: resolveGptMakerLine,
  deliver: deliverGptMaker,
};
