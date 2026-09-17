import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  extractDialablePhone,
  isTechnicalPhone,
  normalizePhone,
} from "./phone.ts";

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

// ============================================================================
// SE-LID-001 — a Meta technical id is not a phone number.
//
// Production incident (Casa Flow, 2026-09-17): leads arrived with
// Nome = Telefone = "186432031355045@lid". The value was written to
// leads.phone, the DB trigger derived phone_normalized from it, and the
// outbound lead webhook shipped it to WhatsApp as the contact's Nome *and*
// Telefone.
//
// The first test documents WHY this needed a new function rather than a change
// to normalizePhone(): normalizePhone is a documented mirror of
// public.normalize_phone_br, so its output is not ours to change alone — and a
// LID is digits, which is all it ever promised to keep.
// ============================================================================

Deno.test("normalizePhone strips the LID suffix — which is why it cannot gate on its own", () => {
  assertEquals(normalizePhone("186432031355045@lid"), "186432031355045");
  assertEquals(normalizePhone("5511987654321@s.whatsapp.net"), "5511987654321");
});

Deno.test("isTechnicalPhone recognises the ids Meta sends instead of a number", () => {
  // The exact value from the Casa Flow incident.
  assertEquals(isTechnicalPhone("186432031355045@lid"), true);
  // Same thing with the casing/whitespace a payload can carry.
  assertEquals(isTechnicalPhone(" 186432031355045@LID "), true);
  assertEquals(isTechnicalPhone("120363000000000000@g.us"), true);
  assertEquals(isTechnicalPhone("status@broadcast"), true);
  // Bare LID, after a writer stripped the suffix: solo-wpp's
  // extractPhoneFromJid(), and the Postgres trigger deriving phone_normalized
  // from an already-stored LID.
  assertEquals(isTechnicalPhone("186432031355045"), true);
});

Deno.test("isTechnicalPhone leaves real phone numbers alone", () => {
  assertEquals(isTechnicalPhone("5585996487923"), false); // E.164 BR, 13 digits
  assertEquals(isTechnicalPhone("85996487923"), false); // how a human types it
  assertEquals(isTechnicalPhone("(85) 99648-7923"), false);
  assertEquals(isTechnicalPhone("+55 85 99648-7923"), false);
  assertEquals(isTechnicalPhone("55999998888"), false); // DDD 55 is not the country code
  assertEquals(isTechnicalPhone(null), false);
  assertEquals(isTechnicalPhone(undefined), false);
  assertEquals(isTechnicalPhone(""), false);
  assertEquals(isTechnicalPhone("abc"), false);
});

Deno.test("a JID that wraps a real number is not technical — the number inside is used", () => {
  assertEquals(isTechnicalPhone("5511987654321@s.whatsapp.net"), false);
  assertEquals(isTechnicalPhone("5511987654321@c.us"), false);
  assertEquals(extractDialablePhone("5511987654321@s.whatsapp.net"), "5511987654321");
  assertEquals(extractDialablePhone("5511987654321@c.us"), "5511987654321");
});

Deno.test("a technical id hidden inside a number envelope is still refused", () => {
  // Not an observed payload — this is rule consistency: the digits inside a
  // phone JID are judged by the same length rule as a bare value, so a 15-digit
  // id cannot reach leads.phone just by wearing a number's envelope.
  assertEquals(isTechnicalPhone("186432031355045@s.whatsapp.net"), true);
  assertEquals(isTechnicalPhone("186432031355045@c.us"), true);
});

Deno.test("extractDialablePhone returns null when the id carries no number at all", () => {
  assertEquals(extractDialablePhone("186432031355045@lid"), null);
  assertEquals(extractDialablePhone("120363000000000000@g.us"), null);
  assertEquals(extractDialablePhone("status@broadcast"), null);
  assertEquals(extractDialablePhone(""), null);
  assertEquals(extractDialablePhone(null), null);
  // A human-typed number comes back untouched — normalizing is normalizePhone's job.
  assertEquals(extractDialablePhone("(85) 99648-7923"), "(85) 99648-7923");
});
