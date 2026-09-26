import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildEventKey,
  type EngineChannel,
  extractProviderChatId,
  pickStartConversationChannel,
  providerPhone,
  renderFirstMessage,
  sourceMatches,
  supportsStartConversation,
} from "./start-conversation.ts";

// ── Idempotência ────────────────────────────────────────────────────────────

Deno.test("sem chave explícita, a chave é o lead — uma abertura por lead", () => {
  assertEquals(buildEventKey({ leadId: "abc" }), "lead:abc");
  assertEquals(buildEventKey({ eventKey: null, leadId: "abc" }), "lead:abc");
  assertEquals(buildEventKey({ eventKey: "   ", leadId: "abc" }), "lead:abc");
});

Deno.test("o mesmo evento produz a mesma chave — é o que colide no índice", () => {
  const a = buildEventKey({ eventKey: "n8n-exec-7781", leadId: "lead-1" });
  const b = buildEventKey({ eventKey: " n8n-exec-7781 ", leadId: "lead-1" });
  assertEquals(a, b);
});

Deno.test("chave gigante é truncada em vez de estourar a coluna", () => {
  const key = buildEventKey({ eventKey: "x".repeat(500), leadId: "lead-1" });
  assertEquals(key.length, 200);
});

// ── Filtro de source ────────────────────────────────────────────────────────

Deno.test("lista de sources vazia dispara para qualquer source", () => {
  assertEquals(sourceMatches([], "Meta Ads - Cadastro (Social Pago)"), true);
  assertEquals(sourceMatches(null, "qualquer coisa"), true);
  assertEquals(sourceMatches(undefined, null), true);
});

Deno.test("com filtro, o source do cliente casa ignorando caixa e espaços", () => {
  const filters = ["Meta Ads - Cadastro (Social Pago)"];
  assertEquals(sourceMatches(filters, "meta ads - cadastro (social pago)"), true);
  assertEquals(sourceMatches(filters, "  Meta Ads - Cadastro (Social Pago)  "), true);
});

Deno.test("com filtro, source fora da lista (ou ausente) não dispara", () => {
  const filters = ["Meta Ads - Cadastro (Social Pago)"];
  assertEquals(sourceMatches(filters, "Indicação"), false);
  assertEquals(sourceMatches(filters, null), false);
  assertEquals(sourceMatches(filters, ""), false);
});

// ── Tipo de canal ───────────────────────────────────────────────────────────

Deno.test("só WhatsApp não oficial é aceito — o provider não expõe o resto", () => {
  assertEquals(supportsStartConversation("WHATSAPP"), true);
  assertEquals(supportsStartConversation("whatsapp"), true);
  // SE-REV-004: Z-API é WhatsApp não oficial; é o canal real da Casa Flow.
  assertEquals(supportsStartConversation("Z_API"), true);
  assertEquals(supportsStartConversation(" z_api "), true);
  // Oficial da Meta: o endpoint não atende.
  assertEquals(supportsStartConversation("CLOUD_API"), false);
  assertEquals(supportsStartConversation("INSTAGRAM"), false);
  assertEquals(supportsStartConversation("TELEGRAM"), false);
  assertEquals(supportsStartConversation("WIDGET"), false);
  assertEquals(supportsStartConversation(null), false);
});

Deno.test("canal Z_API pedido explicitamente e conectado é usado (caso real da Casa Flow)", () => {
  // Formato devolvido por /workspace/{id}/channels em 2026-09-26.
  const channels: EngineChannel[] = [
    { id: "3F32F1093C8681A460108E59734FC41E", type: "Z_API", connected: true, username: "558581406443" },
    { id: "3F29F4971C88C088139B1A12669463B7", type: "TELEGRAM", connected: true },
    { id: "3F29F4824D89D0475462365566D9DEBD", type: "INSTAGRAM", connected: false },
    { id: "3F27CAA33AD430697C8D064C5998413F", type: "WIDGET", connected: true },
  ];
  const out = pickStartConversationChannel(channels, "3F32F1093C8681A460108E59734FC41E");
  assertEquals("channel" in out && out.channel.id, "3F32F1093C8681A460108E59734FC41E");
  const auto = pickStartConversationChannel(channels, null);
  assertEquals("channel" in auto && auto.channel.id, "3F32F1093C8681A460108E59734FC41E");
});

Deno.test("WHATSAPP e Z_API conectados sem canal fixo continuam exigindo escolha", () => {
  const channels: EngineChannel[] = [
    { id: "CH1", type: "WHATSAPP", connected: true },
    { id: "CH2", type: "Z_API", connected: true },
  ];
  const out = pickStartConversationChannel(channels, null);
  assertEquals("errorCode" in out && out.errorCode, "channel_ambiguous");
});

Deno.test("canal pedido explicitamente é usado quando existe, é do tipo certo e está conectado", () => {
  const channels: EngineChannel[] = [
    { id: "CH1", type: "INSTAGRAM", connected: true },
    { id: "CH2", type: "WHATSAPP", connected: true },
  ];
  const out = pickStartConversationChannel(channels, "CH2");
  assertEquals("channel" in out && out.channel.id, "CH2");
});

Deno.test("canal pedido de tipo não suportado falha explicitamente, sem cair num vizinho", () => {
  const channels: EngineChannel[] = [
    { id: "CH1", type: "CLOUD_API", connected: true },
    { id: "CH2", type: "WHATSAPP", connected: true },
  ];
  const out = pickStartConversationChannel(channels, "CH1");
  assertEquals("errorCode" in out && out.errorCode, "channel_type_unsupported");
});

Deno.test("canal pedido que não existe no provider é erro próprio", () => {
  const out = pickStartConversationChannel([{ id: "CH1", type: "WHATSAPP", connected: true }], "CH9");
  assertEquals("errorCode" in out && out.errorCode, "channel_not_found");
});

Deno.test("canal pedido desconectado não é substituído por outro conectado", () => {
  const channels: EngineChannel[] = [
    { id: "CH1", type: "WHATSAPP", connected: false },
    { id: "CH2", type: "WHATSAPP", connected: true },
  ];
  const out = pickStartConversationChannel(channels, "CH1");
  assertEquals("errorCode" in out && out.errorCode, "channel_not_connected");
});

Deno.test("sem canal configurado, um único WhatsApp conectado é escolhido sozinho", () => {
  const channels: EngineChannel[] = [
    { id: "CH1", type: "WIDGET", connected: true },
    { id: "CH2", type: "WHATSAPP", connected: true },
  ];
  const out = pickStartConversationChannel(channels, null);
  assertEquals("channel" in out && out.channel.id, "CH2");
});

Deno.test("dois WhatsApp conectados exigem escolha explícita — não se adivinha o número", () => {
  const channels: EngineChannel[] = [
    { id: "CH1", type: "WHATSAPP", connected: true, username: "5511..." },
    { id: "CH2", type: "WHATSAPP", connected: true, username: "5521..." },
  ];
  const out = pickStartConversationChannel(channels, null);
  assertEquals("errorCode" in out && out.errorCode, "channel_ambiguous");
});

Deno.test("tenant sem WhatsApp, e tenant com WhatsApp desconectado, têm erros diferentes", () => {
  const semWhats = pickStartConversationChannel([{ id: "CH1", type: "INSTAGRAM", connected: true }], null);
  assertEquals("errorCode" in semWhats && semWhats.errorCode, "no_whatsapp_channel");

  const desconectado = pickStartConversationChannel([{ id: "CH1", type: "WHATSAPP", connected: false }], null);
  assertEquals("errorCode" in desconectado && desconectado.errorCode, "channel_not_connected");
});

Deno.test("lista vazia de canais não é tratada como canal utilizável", () => {
  const out = pickStartConversationChannel([], null);
  assertEquals("errorCode" in out && out.errorCode, "no_whatsapp_channel");
});

// ── Primeira mensagem ───────────────────────────────────────────────────────

Deno.test("placeholders são resolvidos com os dados do lead e do tenant", () => {
  const out = renderFirstMessage(
    "Oi {{lead.first_name}}, aqui é da {{tenant.name}}. Vi seu cadastro em {{lead.source}}.",
    { leadName: "Maria Silva Souza", leadSource: "Meta Ads", tenantName: "Casa Flow" },
  );
  assertEquals(out, "Oi Maria, aqui é da Casa Flow. Vi seu cadastro em Meta Ads.");
});

Deno.test("placeholder sem valor some, e não vaza '{{lead.name}}' para o cliente", () => {
  const out = renderFirstMessage("Oi {{lead.first_name}}, tudo bem?", { leadName: null });
  assertEquals(out, "Oi , tudo bem?");
});

Deno.test("espaço duplo deixado por placeholder vazio é colapsado", () => {
  const out = renderFirstMessage("Olá {{lead.first_name}} tudo bem?", { leadName: "" });
  assertEquals(out, "Olá tudo bem?");
});

Deno.test("template ausente ou só com espaços devolve string vazia (o chamador falha explícito)", () => {
  assertEquals(renderFirstMessage(null, {}), "");
  assertEquals(renderFirstMessage("   ", {}), "");
  assertEquals(renderFirstMessage(undefined, {}), "");
});

Deno.test("placeholder desconhecido é removido, não mantido cru", () => {
  assertEquals(renderFirstMessage("Oi{{lead.cpf}}!", { leadName: "X" }), "Oi!");
});

// ── Identificador devolvido pelo provider ───────────────────────────────────

Deno.test("o id do chat é achado nos nomes que o provider usa hoje", () => {
  assertEquals(extractProviderChatId({ chatId: "C1" }), "C1");
  assertEquals(extractProviderChatId({ contextId: "C2" }), "C2");
  assertEquals(extractProviderChatId({ conversationId: "C3" }), "C3");
  assertEquals(extractProviderChatId({ id: "C4" }), "C4");
});

Deno.test("chatId tem precedência sobre um id genérico no mesmo objeto", () => {
  assertEquals(extractProviderChatId({ id: "outro", chatId: "C1" }), "C1");
});

Deno.test("id aninhado em chat/data também é encontrado", () => {
  assertEquals(extractProviderChatId({ chat: { id: "C5" } }), "C5");
  assertEquals(extractProviderChatId({ data: { conversation: { id: "C6" } } }), "C6");
});

Deno.test("retorno sem id não inventa valor — devolve null e o corpo cru fica no banco", () => {
  assertEquals(extractProviderChatId({ success: true }), null);
  assertEquals(extractProviderChatId(null), null);
  assertEquals(extractProviderChatId("ok"), null);
  assertEquals(extractProviderChatId({ chatId: "   " }), null);
});

// ── Telefone ────────────────────────────────────────────────────────────────

Deno.test("o telefone enviado ao provider é o mesmo dígito que identifica o lead", () => {
  assertEquals(providerPhone("+55 (11) 98765-4321"), "5511987654321");
  assertEquals(providerPhone("11987654321"), "5511987654321");
  assertEquals(providerPhone(null), null);
  assertEquals(providerPhone("123"), null);
});
