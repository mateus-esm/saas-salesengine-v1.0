import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveLeadIdentity } from "./lead-identity.ts";

// ============================================================================
// SE-LID-001 — what the GPT Maker webhook is allowed to persist as a lead.
//
// These are the regressions the Casa Flow incident (2026-09-17) produced:
//
//   leads.name  = "Lead 186432031355045@lid"
//   leads.phone = "186432031355045@lid"
//
// ...and the outbound `contact_created` webhook rendered both straight into the
// WhatsApp notification the sales team reads. The assertions below pin the
// three things that must all hold at once:
//
//   1. a technical id never lands in `phone` (the leak);
//   2. the legacy lookup key is preserved, so existing `@lid` rows are found
//      and reused instead of duplicated (the UNIQUE index is (equipe_id,
//      phone_normalized), and a NULL key cannot match);
//   3. the labelling of ordinary leads — real numbers, no-name payloads — is
//      unchanged, with exactly ONE intentional exception, called out below.
//
// The exception: "blank contactName + technical contactPhone" used to read
// "Desconhecido" and now reads "[WhatsApp - Lead Anônimo]", which is what the CRM
// already renders for that row via `formatDisplayName`. A lead with neither a
// name nor a number has no identity to show; the screen and the notification now
// agree on the label. Every other row of the table in `lead-identity.ts` is
// pinned here too, so the change stays a single, reviewable one.
// ============================================================================

Deno.test("incident payload: the LID is not stored as a phone and not used as a name", () => {
  const identity = resolveLeadIdentity({
    contactName: "",
    contactPhone: "186432031355045@lid",
  });

  assertEquals(identity.phone, null); // was "186432031355045@lid"
  assertEquals(identity.name, "[WhatsApp - Lead Anônimo]"); // was "Lead 186432031355045@lid"
  assertEquals(identity.technicalPhone, true);
  // The read key is kept on purpose: rows created before the fix were written
  // with exactly this value, so the webhook still finds them.
  assertEquals(identity.phoneNormalized, "186432031355045");
});

Deno.test("the same LID arriving in contactName is refused too", () => {
  const identity = resolveLeadIdentity({
    contactName: "186432031355045@lid",
    contactPhone: "186432031355045@lid",
  });

  assertEquals(identity.name, "[WhatsApp - Lead Anônimo]");
  assertEquals(identity.phone, null);
  assertEquals(identity.technicalName, true);
  assertEquals(identity.technicalPhone, true);
});

Deno.test("a real name survives a LID phone — only the phone is dropped", () => {
  const identity = resolveLeadIdentity({
    contactName: "Maria Souza",
    contactPhone: "186432031355045@lid",
  });

  assertEquals(identity.name, "Maria Souza");
  assertEquals(identity.phone, null);
  assertEquals(identity.phoneNormalized, "186432031355045");
});

Deno.test("a bare stripped LID (solo-wpp / trigger shape) is refused as well", () => {
  const identity = resolveLeadIdentity({
    contactName: "",
    contactPhone: "186432031355045",
  });

  assertEquals(identity.phone, null);
  assertEquals(identity.name, "[WhatsApp - Lead Anônimo]");
  assertEquals(identity.technicalPhone, true);
});

Deno.test("a JID wrapping a real number keeps the number and drops the envelope", () => {
  const identity = resolveLeadIdentity({
    contactName: "Maria Souza",
    contactPhone: "5511987654321@s.whatsapp.net",
  });

  assertEquals(identity.phone, "5511987654321");
  assertEquals(identity.phoneNormalized, "5511987654321");
  assertEquals(identity.name, "Maria Souza");
  assertEquals(identity.technicalPhone, false);
});

// ---------------------------------------------------------------------------
// Behaviour that already worked: these must not change.
// ---------------------------------------------------------------------------

Deno.test("a real phone with no name at all keeps the previous label and the phone", () => {
  const identity = resolveLeadIdentity({
    contactName: "",
    contactPhone: "5585996487923",
  });

  assertEquals(identity.phone, "5585996487923");
  assertEquals(identity.phoneNormalized, "5585996487923");
  // "Desconhecido" is the pre-existing label for a payload with no name field —
  // left untouched on purpose. `Lead <phone>` was only ever reached when the
  // name field itself was technical (see the test above), which is precisely
  // the path that used to print the LID.
  assertEquals(identity.name, "Desconhecido");
});

Deno.test("a real phone typed the Brazilian way is still stored raw and normalized for dedup", () => {
  const identity = resolveLeadIdentity({
    contactName: "",
    contactPhone: "(85) 99648-7923",
  });

  assertEquals(identity.phone, "(85) 99648-7923");
  assertEquals(identity.phoneNormalized, "5585996487923");
});

Deno.test("a JID-wrapped number with no name field also keeps the pre-existing 'Desconhecido' label", () => {
  // The envelope is stripped, so the number is usable — and because the number
  // IS usable, this is not the anonymous case: the pre-existing "no name field"
  // label applies. Note the contrast with the test above: a blank name does not
  // by itself produce the anonymous label, only an unusable phone does.
  const identity = resolveLeadIdentity({
    contactName: "",
    contactPhone: "5511987654321@s.whatsapp.net",
  });

  assertEquals(identity.phone, "5511987654321");
  assertEquals(identity.name, "Desconhecido");
});

Deno.test("a technical name with no phone at all stays 'Novo Visitante'", () => {
  const identity = resolveLeadIdentity({
    contactName: "264162450083898@lid",
    contactPhone: "",
  });

  assertEquals(identity.phone, null);
  assertEquals(identity.name, "Novo Visitante");
});

Deno.test("a technical contactName with a real phone falls back to the phone", () => {
  const identity = resolveLeadIdentity({
    contactName: "264162450083898@lid",
    contactPhone: "5585996487923",
  });

  assertEquals(identity.name, "Lead 5585996487923");
  assertEquals(identity.technicalName, true);
  assertEquals(identity.technicalPhone, false);
});

Deno.test("a payload with neither name nor phone keeps the previous default", () => {
  const identity = resolveLeadIdentity({ contactName: "", contactPhone: "" });

  assertEquals(identity.name, "Desconhecido");
  assertEquals(identity.phone, null);
  assertEquals(identity.phoneNormalized, null);
});

Deno.test("a payload with no name at all keeps the previous default", () => {
  const identity = resolveLeadIdentity({});

  assertEquals(identity.name, "Desconhecido");
  assertEquals(identity.phone, null);
});

Deno.test("the most ordinary payload — real name and real phone — is untouched", () => {
  const identity = resolveLeadIdentity({
    contactName: "Maria Souza",
    contactPhone: "5585996487923",
  });

  assertEquals(identity.name, "Maria Souza");
  assertEquals(identity.phone, "5585996487923");
  assertEquals(identity.phoneNormalized, "5585996487923");
  assertEquals(identity.technicalName, false);
  assertEquals(identity.technicalPhone, false);
});
