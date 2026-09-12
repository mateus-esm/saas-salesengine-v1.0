import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundTouchPayload, recordTouch } from "./attribution.ts";

// Sprint 11 · T50 — o que a chegada guarda. A querystring da chamada (onde
// formulários e landing pages costumam pôr utm_* e fbclid) era jogada fora.

Deno.test("inboundTouchPayload junta a querystring onde o corpo não fala", () => {
  const q = new URLSearchParams("utm_source=ig&utm_campaign=usina_verao&fbclid=AbC&name=da-url");
  assertEquals(inboundTouchPayload({ name: "Maria", phone: "85999" }, q), {
    name: "Maria",
    phone: "85999",
    utm_source: "ig",
    utm_campaign: "usina_verao",
    fbclid: "AbC",
  });
});

Deno.test("inboundTouchPayload nunca guarda o segredo da URL nem parâmetro vazio", () => {
  const q = new URLSearchParams("secret=s3gr3d0&Secret=x&utm_term=");
  assertEquals(inboundTouchPayload({ name: "Maria" }, q), { name: "Maria" });
});

Deno.test("inboundTouchPayload aceita corpo que não é objeto", () => {
  assertEquals(inboundTouchPayload(null, new URLSearchParams("utm_source=google")), { utm_source: "google" });
  assertEquals(inboundTouchPayload([1, 2], new URLSearchParams()), {});
});

Deno.test("recordTouch sem entrada não chama o banco e não quebra a porta", async () => {
  let called = false;
  const db = { rpc: () => { called = true; return Promise.resolve({ data: null, error: null }); } };
  assertEquals(await recordTouch(db, { leadId: "l", entryId: null, payload: {} }), null);
  assertEquals(called, false);
});

Deno.test("recordTouch devolve null quando o banco recusa, sem lançar", async () => {
  const db = { rpc: () => Promise.resolve({ data: null, error: { message: "lead_not_found" } }) };
  assertEquals(await recordTouch(db, { leadId: "l", entryId: "e", payload: {} }), null);
  const boom = { rpc: () => Promise.reject(new Error("rede caiu")) };
  assertEquals(await recordTouch(boom, { leadId: "l", entryId: "e", payload: {} }), null);
});

Deno.test("recordTouch devolve o toque gravado", async () => {
  const touch = { touch_id: "t", first: true, entry_id: "e", origin_category: "paid_social", platform: "meta", campaign_id: null, owner_id: null };
  const db = { rpc: (_fn: string, args: Record<string, unknown>) => Promise.resolve({ data: { ...touch, got: args.p_lead_id }, error: null }) };
  const r = await recordTouch(db, { leadId: "l-1", entryId: "e", payload: { a: 1 }, opportunityId: "o" });
  assertEquals(r?.touch_id, "t");
});
