import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildCapiEvent,
  buildFbc,
  capiEventId,
  fieldDataToLead,
  metaTouchPayload,
  normalizeEmail,
  normalizePhoneE164,
  parseLeadgenWebhook,
} from "./meta.ts";

// Payload no formato da doc (Webhooks quickstart), com ID de 17 dígitos > MAX_SAFE_INTEGER.
const WEBHOOK = {
  object: "page",
  entry: [{
    id: "153125381133",
    time: 1438292065,
    changes: [
      {
        field: "leadgen",
        value: {
          leadgen_id: 12345678901234567,
          page_id: 153125381133,
          form_id: "5432154321",
          adgroup_id: "6000000000001",
          ad_id: "6000000000002",
          created_time: 1440120384,
        },
      },
      { field: "feed", value: { item: "status" } },
    ],
  }],
};

Deno.test("parseLeadgenWebhook - só leadgen, IDs como string", () => {
  const out = parseLeadgenWebhook(WEBHOOK);
  assertEquals(out.length, 1);
  assertEquals(out[0].page_id, "153125381133");
  assertEquals(out[0].form_id, "5432154321");
  assertEquals(out[0].ad_id, "6000000000002");
  assertEquals(out[0].adgroup_id, "6000000000001");
  assertEquals(out[0].created_time, 1440120384);
  assertEquals(typeof out[0].leadgen_id, "string");
});

Deno.test("parseLeadgenWebhook - leadgen_id do corpo cru preserva os 17 dígitos", () => {
  const raw = '{"object":"page","entry":[{"id":"1","changes":[{"field":"leadgen","value":{"leadgen_id":12345678901234567,"page_id":1,"form_id":2}}]}]}';
  const out = parseLeadgenWebhook(JSON.parse(raw), raw);
  assertEquals(out[0].leadgen_id, "12345678901234567");
});

Deno.test("parseLeadgenWebhook - outro objeto ou corpo inválido → vazio", () => {
  assertEquals(parseLeadgenWebhook({ object: "instagram", entry: WEBHOOK.entry }), []);
  assertEquals(parseLeadgenWebhook(null), []);
  assertEquals(parseLeadgenWebhook({ object: "page", entry: [{ changes: [{ field: "leadgen", value: { page_id: "1" } }] }] }), []);
});

Deno.test("fieldDataToLead - campos padrão e perguntas extras", () => {
  const lead = fieldDataToLead([
    { name: "full_name", values: ["Maria Souza"] },
    { name: "email", values: [" Maria@Example.com "] },
    { name: "phone_number", values: ["+55 85 99648-7923"] },
    { name: "qual_o_valor_da_sua_conta_de_luz?", values: ["R$ 800"] },
    { name: "cidade", values: ["Fortaleza"] },
  ]);
  assertEquals(lead.name, "Maria Souza");
  assertEquals(lead.email, "maria@example.com");
  assertEquals(lead.phone, "+55 85 99648-7923");
  assertEquals(lead.answers, { "qual_o_valor_da_sua_conta_de_luz?": "R$ 800", cidade: "Fortaleza" });
  assertEquals(lead.observations, "Qual o valor da sua conta de luz?: R$ 800\nCidade: Fortaleza");
});

Deno.test("fieldDataToLead - first_name + last_name e telefone alternativo", () => {
  const lead = fieldDataToLead([
    { name: "first_name", values: ["João"] },
    { name: "last_name", values: ["Lima"] },
    { name: "work_phone_number", values: ["85996487923"] },
  ]);
  assertEquals(lead.name, "João Lima");
  assertEquals(lead.phone, "85996487923");
  assertEquals(lead.email, null);
  assertEquals(lead.observations, null);
});

Deno.test("metaTouchPayload - chaves que o banco lê + leadgen_id", () => {
  const p = metaTouchPayload({
    id: "12345678901234567",
    ad_id: "600",
    ad_name: "P001-V1 | Conta alta",
    adset_id: "500",
    adset_name: "Fortaleza 25-55",
    campaign_id: "400",
    campaign_name: "LEADS NOV",
    form_id: "300",
    platform: "ig",
  }, "Formulário Solar");
  assertEquals(p.leadgen_id, "12345678901234567");
  assertEquals(p.ad_id, "600");
  assertEquals(p.adset_id, "500");
  assertEquals(p.campaign_id, "400");
  assertEquals(p.campaign_name, "LEADS NOV");
  assertEquals(p.form_id, "300");
  assertEquals(p.form_name, "Formulário Solar");
  assertEquals(p.utm_source, "facebook");
  assertEquals(p.utm_medium, "paid_social");
  assertEquals(p.meta_platform, "ig");
});

Deno.test("metaTouchPayload - lead orgânico não vira mídia paga", () => {
  const p = metaTouchPayload({ id: "1", form_id: "3", is_organic: true }, null);
  assertEquals(p.utm_medium, "organic_social");
  assert(!("ad_id" in p));
});

Deno.test("normalizeEmail / normalizePhoneE164", () => {
  assertEquals(normalizeEmail("  ABC@Mail.COM "), "abc@mail.com");
  assertEquals(normalizeEmail("sem-arroba"), null);
  assertEquals(normalizePhoneE164("+55 (85) 99648-7923"), "5585996487923");
  assertEquals(normalizePhoneE164("85 9648-7923"), "5585996487923");
  assertEquals(normalizePhoneE164("12"), null);
});

Deno.test("buildFbc - formato fb.1.<ms>.<fbclid>", () => {
  assertEquals(buildFbc("AbC123", 1700000000000), "fb.1.1700000000000.AbC123");
  assertEquals(buildFbc("", 1), null);
});

Deno.test("capiEventId - estável e sensível à etapa", async () => {
  const a = await capiEventId("e", "o", "s", "qualified");
  assertEquals(a, await capiEventId("e", "o", "s", "qualified"));
  assert(a !== await capiEventId("e", "o", "s2", "qualified"));
  assertEquals(a.length, 64);
});

const NOW = Date.UTC(2026, 10, 25, 12);
const base = {
  eventName: "qualified",
  eventId: "abc",
  eventTimeMs: NOW - 3600_000,
  leadCreatedMs: NOW - 86400_000,
  nowMs: NOW,
  leadEventSource: "Rev",
};

Deno.test("buildCapiEvent - formulário usa lead_id (string, sem hash)", async () => {
  const r = await buildCapiEvent({ ...base, leadgenId: "12345678901234567", email: "a@b.com" });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.match_key, "lead_id");
  assertEquals(r.event.user_data.lead_id, "12345678901234567");
  assertEquals(r.event.action_source, "system_generated");
  assertEquals(r.event.custom_data, { event_source: "crm", lead_event_source: "Rev" });
  assertEquals(r.event.event_time, Math.floor((NOW - 3600_000) / 1000));
  assertEquals(r.event.event_id, "abc");
  // e-mail também vai, com hash
  assertEquals(r.event.user_data.em?.length, 1);
  assertEquals(r.event.user_data.em?.[0].length, 64);
});

Deno.test("buildCapiEvent - hash do e-mail é SHA-256 do normalizado", async () => {
  const r = await buildCapiEvent({ ...base, email: "  ABC " .trim() + "@x.io" });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.match_key, "hashed_pii");
  // sha256("abc@x.io")
  const want = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc@x.io"))), (b) => b.toString(16).padStart(2, "0")).join("");
  assertEquals(r.event.user_data.em, [want]);
});

Deno.test("buildCapiEvent - site com fbclid usa fbc", async () => {
  const r = await buildCapiEvent({ ...base, fbclid: "XYZ", touchAtMs: 1700000000000, phone: "85996487923" });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.match_key, "fbc");
  assertEquals(r.event.user_data.fbc, "fb.1.1700000000000.XYZ");
  assertEquals(r.event.user_data.ph?.length, 1);
});

Deno.test("buildCapiEvent - pulos: whatsapp, sem chave, velho, antes do lead", async () => {
  assertEquals(await buildCapiEvent({ ...base, ctwaClid: "c1" }), { ok: false, skip_reason: "whatsapp_requires_waba" });
  assertEquals(await buildCapiEvent({ ...base }), { ok: false, skip_reason: "no_match_key" });
  assertEquals(
    await buildCapiEvent({ ...base, leadgenId: "1", eventTimeMs: NOW - 8 * 86400_000, leadCreatedMs: NOW - 9 * 86400_000 }),
    { ok: false, skip_reason: "too_old" },
  );
  assertEquals(
    await buildCapiEvent({ ...base, leadgenId: "1", eventTimeMs: NOW - 2 * 86400_000, leadCreatedMs: NOW - 86400_000 }),
    { ok: false, skip_reason: "too_old" },
  );
});
