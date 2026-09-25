import {
  callStartConversation,
  type EngineChannel,
  extractProviderChatId,
  listEngineChannels,
  type OpenFailureCode,
  pickStartConversationChannel,
} from "./start-conversation.ts";

export interface ManualGptOpeningResult {
  ok: boolean;
  channelId?: string;
  channelType?: string;
  providerChatId?: string | null;
  providerStatus?: number | null;
  providerBody?: unknown;
  errorCode?: OpenFailureCode;
  detail?: string;
}

/**
 * Abre uma conversa GPT Maker para um envio humano que ainda não tem chat.
 *
 * A função é deliberadamente pequena e não conhece banco nem idempotência: um
 * clique humano é uma intenção nova. O chamador grava um
 * conversation_open_events por mensagem e associa a mensagem/conversa depois
 * que o provider aceita.
 */
export async function openManualGptConversation(input: {
  token: string;
  workspaceId: string;
  agentId: string;
  preferredChannelId?: string | null;
  phone: string;
  message: string;
  listChannels?: typeof listEngineChannels;
  startConversation?: typeof callStartConversation;
}): Promise<ManualGptOpeningResult> {
  const listChannels = input.listChannels ?? listEngineChannels;
  const startConversation = input.startConversation ?? callStartConversation;
  const listed = await listChannels({
    token: input.token,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
  });
  if ("errorCode" in listed) {
    return { ok: false, errorCode: listed.errorCode, detail: listed.detail };
  }

  const picked = pickStartConversationChannel(
    listed.channels as EngineChannel[],
    input.preferredChannelId,
  );
  if ("errorCode" in picked) {
    return { ok: false, errorCode: picked.errorCode, detail: picked.detail };
  }

  const channel = picked.channel;
  const delivered = await startConversation({
    token: input.token,
    channelId: channel.id,
    phone: input.phone,
    message: input.message,
  });
  if (!delivered.ok) {
    return {
      ok: false,
      channelId: channel.id,
      channelType: String(channel.type ?? "").toUpperCase(),
      providerStatus: delivered.status,
      providerBody: delivered.body,
      errorCode: delivered.errorCode,
      detail: delivered.errorMessage,
    };
  }

  return {
    ok: true,
    channelId: channel.id,
    channelType: String(channel.type ?? "").toUpperCase(),
    providerChatId: extractProviderChatId(delivered.body),
    providerStatus: delivered.status,
    providerBody: delivered.body,
  };
}
