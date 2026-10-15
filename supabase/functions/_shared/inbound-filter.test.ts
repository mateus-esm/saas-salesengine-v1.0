import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { classifyInbound, isNonTextual, promotionPatch } from "./inbound-filter.ts";

const real = { phone: "5511987654321@s.whatsapp.net", name: "Maria Silva", content: "Oi, quero saber o preço" };

Deno.test("mensagem comum de cliente é lead", () => {
  assertEquals(classifyInbound(real).action, "lead");
});

Deno.test("mensagens de protocolo do WhatsApp são ignoradas", () => {
  for (const t of ["protocolMessage", "senderKeyDistributionMessage", "messageContextInfo"]) {
    assertEquals(classifyInbound({ ...real, messageType: t }), { action: "ignore", reason: "protocol_message" }, t);
  }
});

Deno.test("texto, mídia, edição, reação e voto de enquete não são protocolo", () => {
  for (const t of ["conversation", "extendedTextMessage", "imageMessage", "audioMessage", "editedMessage", "reactionMessage", "pollUpdateMessage"]) {
    assertEquals(classifyInbound({ ...real, messageType: t }).action, "lead", t);
  }
});

Deno.test("reação e voto de enquete são marcados como não textuais", () => {
  assertEquals(isNonTextual("reactionMessage"), true);
  assertEquals(isNonTextual("pollUpdateMessage"), true);
  assertEquals(isNonTextual("conversation"), false);
  assertEquals(isNonTextual(null), false);
});

Deno.test("remetente de serviço vai para revisão", () => {
  for (const name of ["WhatsApp", "WhatsApp Business", "Meta Notification", "no-reply", "Notificação", "Verification"]) {
    assertEquals(classifyInbound({ ...real, name }), { action: "quarantine", reason: "service_sender" }, name);
  }
});

Deno.test("nome de marca dentro de nome de cliente continua lead", () => {
  for (const name of ["Instagram Store", "Notificações Silva Ltda", "Meta Contabilidade", "Verification Labs"]) {
    assertEquals(classifyInbound({ ...real, name }).action, "lead", name);
  }
});

Deno.test("código curto e remetente alfanumérico vão para revisão", () => {
  assertEquals(classifyInbound({ ...real, phone: "28080@s.whatsapp.net" }), { action: "quarantine", reason: "short_code" });
  assertEquals(classifyInbound({ ...real, phone: "ITAU-BANK@s.whatsapp.net" }), { action: "quarantine", reason: "alphanumeric_sender" });
});

Deno.test("sem telefone e sem nome continua lead: perder cliente é pior que deixar passar lixo", () => {
  assertEquals(classifyInbound({ phone: "186432031355045@lid", name: "", content: "oi" }).action, "lead");
  assertEquals(classifyInbound({ phone: null, name: "Desconhecido", content: "oi" }).action, "lead");
  assertEquals(classifyInbound({ phone: "186432031355045@lid", name: "186432031355045@lid" }).action, "lead");
});

Deno.test("Instagram/LID com nome de perfil real continua lead", () => {
  assertEquals(classifyInbound({ phone: null, name: "Carla Mendes", content: "oi" }).action, "lead");
  assertEquals(classifyInbound({ phone: "186432031355045@lid", name: "Carla Mendes" }).action, "lead");
});

Deno.test("telefone real sem nome é lead (nome vira Lead <fone>)", () => {
  assertEquals(classifyInbound({ phone: "5511987654321", name: "" }).action, "lead");
  assertEquals(classifyInbound({ phone: "11987654321", name: null }).action, "lead");
});

Deno.test("código automático só pesa quando o remetente não tem nome salvo", () => {
  const spam = "Seu código de verificação é 482913. Não compartilhe.";
  assertEquals(classifyInbound({ ...real, name: "", content: spam }), { action: "quarantine", reason: "automated_code" });
  // cliente com nome: lead, mesmo com texto parecido
  assertEquals(classifyInbound({ ...real, content: spam }).action, "lead");
  assertEquals(classifyInbound({ ...real, content: "meu código de confirmação do pedido é 12345" }).action, "lead");
  assertEquals(classifyInbound({ ...real, name: "", content: "como funciona a verificação?" }).action, "lead");
});

Deno.test("promoção: contato marcado pelo filtro que manda mensagem de lead volta a ser lead", () => {
  assertEquals(
    promotionPatch({ lead_type: "contact", needs_review: true }, { action: "lead" }),
    { lead_type: "lead", needs_review: false, review_reason: null },
  );
  // ainda lixo: não promove
  assertEquals(promotionPatch({ lead_type: "contact", needs_review: true }, { action: "quarantine", reason: "service_sender" }), null);
  // 'contact' por desqualificação da IA (sem needs_review) não é promovido
  assertEquals(promotionPatch({ lead_type: "contact", needs_review: false }, { action: "lead" }), null);
  assertEquals(promotionPatch({ lead_type: "lead", needs_review: false }, { action: "lead" }), null);
});
