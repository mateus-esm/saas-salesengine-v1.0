import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inboundTouchPayload, messageTouchPayload, recordTouch, whatsappAdReferral } from "./attribution.ts";

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

// Sprint 11 · T51 — o anúncio clique-para-WhatsApp. Sem instância da Solo API na
// produção (12/09), estes formatos são o que o teste consegue provar.
Deno.test("whatsappAdReferral lê o referral da Cloud API", () => {
  assertEquals(
    whatsappAdReferral({
      referral: {
        source_type: "ad",
        source_id: "120211",
        source_url: "https://fb.me/abc",
        headline: "Energia solar sem entrada",
        ctwa_clid: "ARAk-xyz",
      },
    }),
    {
      utm_source: "facebook",
      utm_medium: "paid_social",
      whatsapp_ad: "true",
      ctwa_clid: "ARAk-xyz",
      ad_id: "120211",
      ad_name: "Energia solar sem entrada",
      source_url: "https://fb.me/abc",
    },
  );
});

Deno.test("whatsappAdReferral lê o externalAdReply do Evolution, no topo ou dentro da mensagem", () => {
  const top = whatsappAdReferral({
    contextInfo: { conversionSource: "FB_Ads", externalAdReply: { title: "Usina", sourceId: "77", sourceUrl: "https://fb.me/u" } },
  });
  assertEquals(top.ad_id, "77");
  assertEquals(top.utm_medium, "paid_social");
  const nested = whatsappAdReferral({
    message: { extendedTextMessage: { text: "Oi", contextInfo: { externalAdReply: { ctwaClid: "c-1", sourceType: "ad" } } } },
  });
  assertEquals(nested.ctwa_clid, "c-1");
});

Deno.test("whatsappAdReferral: post impulsionado sem prova de anúncio e mensagem comum não viram anúncio", () => {
  assertEquals(whatsappAdReferral({ referral: { source_type: "post", source_url: "https://fb.me/p" } }), {});
  assertEquals(whatsappAdReferral({ message: { conversation: "Oi" } }), {});
  assertEquals(whatsappAdReferral(null), {});
});

Deno.test("messageTouchPayload guarda canal, agente e anúncio — nunca o texto", () => {
  const p = messageTouchPayload({
    channel: "whatsapp",
    agentName: "Sol",
    raw: { message: { conversation: "meu cpf é 123" }, referral: { ctwa_clid: "c-9" } },
  });
  assertEquals(p.channel, "whatsapp");
  assertEquals(p.agent_name, "Sol");
  assertEquals(p.ctwa_clid, "c-9");
  assertEquals(JSON.stringify(p).includes("cpf"), false);
});
