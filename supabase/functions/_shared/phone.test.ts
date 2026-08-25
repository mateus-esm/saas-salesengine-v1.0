import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { normalizePhone } from "./phone.ts";

// ============================================================================
// Sprint 8.5 (Fixes 3, item 13) — the contract the OUTBOUND paths depend on.
//
// These tests exist because of a real production failure. The notification
// dispatcher and the admin test-send each rolled their own phone handling that
// only stripped non-digits, so a number typed by a human — "85996487923", the
// way anyone writes it in Brazil — went to the Solo API without a country code.
//
// The API accepts it and returns a message key, so we recorded the delivery as
// `sent`. Nothing ever arrived: the JID does not exist. A silent success is the
// worst possible failure mode for a notification system, which is why the rule
// now has tests instead of living implicitly inside two webhooks.
//
// Ground truth for the format is the Solo API reference, which documents
// `{ "number": "5511999999999" }` — country code included.
// ============================================================================

Deno.test("a number typed the way a Brazilian writes it gains the country code", () => {
  // THE PRODUCTION BUG: this is exactly what was in proposals.cliente_whatsapp
  // when the proposal was recorded as sent and never arrived.
  assertEquals(normalizePhone("85996487923"), "5585996487923");
  assertEquals(normalizePhone("11999998888"), "5511999998888");
});

Deno.test("formatting people actually use survives", () => {
  assertEquals(normalizePhone("(85) 99648-7923"), "5585996487923");
  assertEquals(normalizePhone("+55 85 99648-7923"), "5585996487923");
  assertEquals(normalizePhone("55 (85) 99648-7923"), "5585996487923");
});

Deno.test("an already-normalized number is unchanged — the fix must be idempotent", () => {
  // The dispatcher may re-send a failed delivery, and lead phones arrive from
  // the webhook already normalized. Running this twice must not produce 5555...
  const once = normalizePhone("5585996487923")!;
  assertEquals(once, "5585996487923");
  assertEquals(normalizePhone(once), once);
});

Deno.test("an 8-digit landline-era mobile gains the ninth digit", () => {
  assertEquals(normalizePhone("8596487923"), "5585996487923");
});

Deno.test("DDD 55 is not mistaken for the country code", () => {
  // Rio Grande do Sul. Stripping the leading 55 here would mangle a real
  // subscriber number, which is why the rule keys on LENGTH before prefix.
  assertEquals(normalizePhone("55999998888"), "5555999998888");
});

Deno.test("unusable input returns null instead of a broken number", () => {
  assertEquals(normalizePhone(null), null);
  assertEquals(normalizePhone(undefined), null);
  assertEquals(normalizePhone(""), null);
  assertEquals(normalizePhone("abc"), null);
  assertEquals(normalizePhone("1234"), null);
});
