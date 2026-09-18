import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { leadNameFromPhone, resolveLeadIdentity } from "./lead-identity.ts";
import { LEAD_ANON_NAME } from "./displayName.ts";

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
//      unchanged, with exactly TWO intentional exceptions, called out below.
//
// The exceptions: "blank contactName + technical contactPhone" used to read
// "Desconhecido" and now reads "[WhatsApp - Lead Anônimo]", which is what the CRM
// already renders for that row via `formatDisplayName`. A lead with neither a
// name nor a number has no identity to show; the screen and the notification now
// agree on the label. Every other row of the table in `lead-identity.ts` is
// pinned here too, so the change stays a single, reviewable one.
//
// SE-LID-002 (Casa Flow, 2026-09-18) revisits the row SE-LID-001 left untouched
// on purpose: a payload with NO name field. That is the shape of an OUTBOUND
// message — the team starts the conversation, so the provider has no contact
// name to send — and every lead created that way was persisted as
// "Desconhecido". Those payloads are pinned in their own section below, together
// with the invariant that no payload shape produces that string any more.
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
// SE-LID-002 — the OUTBOUND payload.
//
// The team starts the conversation. The provider sends the number the message
// was addressed to but no name at all: there is no contact name to send,
// because the contact is not the one who wrote the message. Pre-fix the webhook
// created the lead (deliberately — see step 9 of gpt-maker-webhook/index.ts)
// and labelled it "Desconhecido", which the AFTER INSERT `contact_created`
// trigger then shipped to the team's WhatsApp notification.
// ---------------------------------------------------------------------------

Deno.test("outbound: a real phone with no name at all is labelled from the number", () => {
  const identity = resolveLeadIdentity({
    contactName: "",
    contactPhone: "5585996487923",
  });

  assertEquals(identity.phone, "5585996487923");
  assertEquals(identity.phoneNormalized, "5585996487923");
  // "Lead <phone>" was only ever reachable when the name field itself was
  // technical; a blank name landed on the "Desconhecido" placeholder instead.
  assertEquals(identity.name, "Lead 5585996487923");
});

Deno.test("outbound: a phone typed the Brazilian way is labelled with the canonical digits", () => {
  const identity = resolveLeadIdentity({
    contactName: "",
    contactPhone: "(85) 99648-7923",
  });

  // The phone column keeps what the provider sent; the label uses the canonical
  // key, so the same contact cannot end up with two different labels.
  assertEquals(identity.phone, "(85) 99648-7923");
  assertEquals(identity.phoneNormalized, "5585996487923");
  assertEquals(identity.name, `Lead ${identity.phoneNormalized}`);
});

Deno.test("outbound: a JID-wrapped number with no name is labelled from the number", () => {
  const identity = resolveLeadIdentity({
    contactName: "",
    contactPhone: "5511987654321@s.whatsapp.net",
  });

  assertEquals(identity.phone, "5511987654321");
  assertEquals(identity.name, "Lead 5511987654321");
});

Deno.test("outbound: a no-name payload with no usable number gets the anonymous label", () => {
  const identity = resolveLeadIdentity({ contactName: "", contactPhone: "" });

  assertEquals(identity.name, LEAD_ANON_NAME);
  assertEquals(identity.phone, null);
  assertEquals(identity.phoneNormalized, null);
});

Deno.test("outbound: an empty payload gets the anonymous label", () => {
  const identity = resolveLeadIdentity({});

  assertEquals(identity.name, LEAD_ANON_NAME);
  assertEquals(identity.phone, null);
});

Deno.test("no payload shape produces the placeholder 'Desconhecido' as a lead name", () => {
  // The regression the team reported twice (SE-LID-001 and SE-LID-002). The
  // label must always be either something a human typed, the number, or the
  // anonymous label — never the string that reads as "we could not read the
  // name". This loop is the guard: it fails the moment a branch is added that
  // reintroduces the placeholder.
  const payloads: Array<{ contactName?: string; contactPhone?: string }> = [
    {},
    { contactName: "", contactPhone: "" },
    { contactName: "   ", contactPhone: "  " },
    { contactName: "", contactPhone: "5585996487923" },
    { contactName: "", contactPhone: "(85) 99648-7923" },
    { contactName: "", contactPhone: "5511987654321@s.whatsapp.net" },
    { contactName: "", contactPhone: "186432031355045@lid" },
    { contactName: "186432031355045@lid", contactPhone: "" },
    { contactName: "186432031355045@lid", contactPhone: "186432031355045@lid" },
    { contactName: "264162450083898@lid", contactPhone: "" },
    { contactName: "264162450083898@lid", contactPhone: "5585996487923" },
    { contactName: "Maria Souza", contactPhone: "5585996487923" },
  ];

  for (const payload of payloads) {
    const { name } = resolveLeadIdentity(payload);
    assertNotEquals(
      name,
      "Desconhecido",
      `payload ${JSON.stringify(payload)} still labels the lead "Desconhecido"`,
    );
  }
});

// ---------------------------------------------------------------------------
// `leadNameFromPhone()` — the label rule on its own. The Solo/whatsmiau webhook
// uses it for the same reason: on an outbound message `pushName` is the SENDER's
// name (the connected account), so the label has to come from the number.
// ---------------------------------------------------------------------------

Deno.test("leadNameFromPhone: builds the label from digits and from a JID envelope", () => {
  assertEquals(leadNameFromPhone("5585996487923"), "Lead 5585996487923");
  assertEquals(leadNameFromPhone("5511987654321@s.whatsapp.net"), "Lead 5511987654321");
  assertEquals(leadNameFromPhone("(85) 99648-7923"), "Lead 5585996487923");
});

Deno.test("leadNameFromPhone: refuses to build a label out of a Meta id or out of nothing", () => {
  assertEquals(leadNameFromPhone("186432031355045@lid"), null);
  assertEquals(leadNameFromPhone("264162450083898@lid"), null);
  // The bare id matters: `extractPhoneFromJid()` in solo-wpp strips the suffix
  // before this helper ever sees the value.
  assertEquals(leadNameFromPhone("186432031355045"), null);
  assertEquals(leadNameFromPhone(""), null);
  assertEquals(leadNameFromPhone("   "), null);
  assertEquals(leadNameFromPhone(null), null);
  assertEquals(leadNameFromPhone(undefined), null);
});

// ---------------------------------------------------------------------------
// Behaviour that already worked: these must not change.
// ---------------------------------------------------------------------------

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
