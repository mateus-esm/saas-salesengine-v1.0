import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { classifyInbound } from "./inbound-filter.ts";

const real = { phone: "5511987654321@s.whatsapp.net", name: "Maria Silva", content: "Oi, quero saber o preço" };

Deno.test("mensagem comum de cliente é lead", () => {
  assertEquals(classifyInbound(real).action, "lead");
});

Deno.test("mensagens de protocolo do WhatsApp são ignoradas", () => {
  for (const t of ["protocolMessage", "senderKeyDistributionMessage", "messageContextInfo", "reactionMessage", "pollUpdateMessage"]) {
    assertEquals(classifyInbound({ ...real, messageType: t }), { action: "ignore", reason: "protocol_message" }, t);
  }
});

Deno.test("texto, mídia e edição seguem como lead", () => {
  for (const t of ["conversation", "extendedTextMessage", "imageMessage", "audioMessage", "editedMessage"]) {
    assertEquals(classifyInbound({ ...real, messageType: t }).action, "lead", t);
  }
});

Deno.test("remetente de serviço vai para revisão", () => {
  for (const name of ["WhatsApp", "WhatsApp Business", "Meta Notification", "no-reply", "Notificação do Banco"]) {
    assertEquals(classifyInbound({ ...real, name }), { action: "quarantine", reason: "service_sender" }, name);
  }
});

Deno.test("código curto e remetente alfanumérico vão para revisão", () => {
  assertEquals(classifyInbound({ ...real, phone: "28080@s.whatsapp.net" }).action, "quarantine");
  assertEquals(classifyInbound({ ...real, phone: "28080@s.whatsapp.net" }), { action: "quarantine", reason: "short_code" });
  assertEquals(classifyInbound({ ...real, phone: "ITAU-BANK@s.whatsapp.net" }), { action: "quarantine", reason: "alphanumeric_sender" });
});

Deno.test("sem telefone e sem nome real não vira lead", () => {
  assertEquals(classifyInbound({ phone: "186432031355045@lid", name: "", content: "oi" }), { action: "quarantine", reason: "no_identity" });
  assertEquals(classifyInbound({ phone: null, name: "Desconhecido", content: "oi" }), { action: "quarantine", reason: "no_identity" });
  assertEquals(classifyInbound({ phone: "186432031355045@lid", name: "186432031355045@lid" }).action, "quarantine");
});

Deno.test("Instagram/LID com nome de perfil real continua lead", () => {
  assertEquals(classifyInbound({ phone: null, name: "Carla Mendes", content: "oi" }).action, "lead");
  assertEquals(classifyInbound({ phone: "186432031355045@lid", name: "Carla Mendes" }).action, "lead");
});

Deno.test("telefone real sem nome é lead (nome vira Lead <fone>)", () => {
  assertEquals(classifyInbound({ phone: "5511987654321", name: "" }).action, "lead");
  assertEquals(classifyInbound({ phone: "11987654321", name: null }).action, "lead");
});

Deno.test("código de verificação automático vai para revisão", () => {
  assertEquals(
    classifyInbound({ ...real, content: "Seu código de verificação é 482913. Não compartilhe." }),
    { action: "quarantine", reason: "automated_code" },
  );
  assertEquals(classifyInbound({ ...real, content: "como funciona a verificação?" }).action, "lead");
});
