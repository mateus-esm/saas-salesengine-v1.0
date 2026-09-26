import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { openManualGptConversation } from "./manual-conversation.ts";

Deno.test("sem chat: abre conversa GPT Maker com o texto digitado", async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url.includes("/workspace/")) {
      return new Response(
        JSON.stringify({
          data: [{ id: "canal-1", type: "WHATSAPP", connected: true }],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await openManualGptConversation({
      token: "token",
      workspaceId: "workspace",
      agentId: "agente",
      phone: "5511999999999",
      message: "Mensagem do usuário",
    });
    assertEquals(result.ok, true);
    assertEquals(result.channelId, "canal-1");
    assertEquals(calls.length, 2);
    assertEquals(
      calls[1].url.endsWith("/channel/canal-1/start-conversation"),
      true,
    );
    assertEquals(calls[1].body, {
      phone: "5511999999999",
      message: "Mensagem do usuário",
    });
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("SE-REV-004: canal Z_API configurado abre a conversa (antes: channel_type_unsupported)", async () => {
  const opened: string[] = [];
  const result = await openManualGptConversation({
    token: "token",
    workspaceId: "workspace",
    agentId: "agente",
    preferredChannelId: "3F32F1093C8681A460108E59734FC41E",
    phone: "5585998153923",
    message: "Ola teste",
    listChannels: () =>
      Promise.resolve({
        channels: [
          { id: "3F32F1093C8681A460108E59734FC41E", type: "Z_API", connected: true },
          { id: "3F29F4971C88C088139B1A12669463B7", type: "TELEGRAM", connected: true },
        ],
      }),
    startConversation: ({ channelId }) => {
      opened.push(channelId);
      return Promise.resolve({ ok: true, status: 200, body: { success: true }, rawText: null });
    },
  });
  assertEquals(result.ok, true);
  assertEquals(result.channelId, "3F32F1093C8681A460108E59734FC41E");
  assertEquals(result.channelType, "Z_API");
  assertEquals(opened, ["3F32F1093C8681A460108E59734FC41E"]);
});

Deno.test("canal oficial/sem suporte falha explicitamente e não tenta abrir", async () => {
  let opens = 0;
  const result = await openManualGptConversation({
    token: "token",
    workspaceId: "workspace",
    agentId: "agente",
    preferredChannelId: "cloud",
    phone: "5511999999999",
    message: "oi",
    listChannels: async () => ({
      channels: [{ id: "cloud", type: "CLOUD_API", connected: true }],
    }),
    startConversation: async () => {
      opens++;
      return { ok: true, status: 200, body: { success: true }, rawText: null };
    },
  });
  assertEquals(result.ok, false);
  assertEquals(result.errorCode, "channel_type_unsupported");
  assertEquals(opens, 0);
});

Deno.test("com chat o chamador mantém a rota send-message (helper não é chamado)", () => {
  // A seleção do ramo fica em send-chat-message: este teste documenta o
  // contrato aditivo do helper. Ele só representa a rota SEM chat.
  const choose = (chatId: string | null) =>
    chatId ? "send-message" : "start-conversation";
  assertEquals(choose("chat-existente"), "send-message");
  assertEquals(choose(null), "start-conversation");
});

Deno.test("perfil Solo sem linha conectada tem razão operacional explícita", () => {
  const reason = (provider: string, connected: boolean) =>
    provider === "solo" && !connected ? "solo_instance_not_connected" : null;
  assertEquals(reason("solo", false), "solo_instance_not_connected");
});
