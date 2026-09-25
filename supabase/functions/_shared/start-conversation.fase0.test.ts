// SE-REV-002 · Fase 0 — correções da SE-REV-001. Arquivo separado para que os
// 25 testes originais (start-conversation.test.ts) continuem sem edição.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { callStartConversation, providerAccepted } from "./start-conversation.ts";

/** Troca o fetch global durante `fn` e devolve o original no fim. */
async function withFetch(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const call = () => callStartConversation({ token: "t", channelId: "CH1", phone: "5511987654321", message: "oi" });

// ── Correção 1: 200 {success:false} não é conversa aberta ──────────────────

Deno.test("200 {success:false} é recusa do provider, não conversa aberta", async () => {
  await withFetch(async () => new Response(JSON.stringify({ success: false }), { status: 200 }), async () => {
    const out = await call();
    assertEquals(out.ok, false);
    assertEquals(out.errorCode, "provider_rejected");
    assertEquals(out.status, 200);
    assertEquals(out.body, { success: false });
  });
});

Deno.test("200 {success:true} é conversa aberta", async () => {
  await withFetch(async () => new Response(JSON.stringify({ success: true }), { status: 200 }), async () => {
    const out = await call();
    assertEquals(out.ok, true);
    assertEquals(out.errorCode, undefined);
  });
});

Deno.test("200 sem corpo é aceite (suposição registrada: a doc só define o corpo com success)", async () => {
  await withFetch(async () => new Response(null, { status: 200 }), async () => {
    const out = await call();
    assertEquals(out.ok, true);
  });
});

Deno.test("400 continua sendo recusa", async () => {
  await withFetch(async () => new Response(JSON.stringify({ error: "x" }), { status: 400 }), async () => {
    const out = await call();
    assertEquals(out.ok, false);
    assertEquals(out.errorCode, "provider_rejected");
  });
});

Deno.test("providerAccepted: só success===true vale quando o campo existe", () => {
  assertEquals(providerAccepted({ success: true }), true);
  assertEquals(providerAccepted({ success: false }), false);
  assertEquals(providerAccepted({ success: "true" }), false);
  assertEquals(providerAccepted({ success: null }), false);
  assertEquals(providerAccepted({ chatId: "C1" }), true);
  assertEquals(providerAccepted(null), true);
  assertEquals(providerAccepted("ok"), true);
});
