// ============================================================================
// SE-LID-001 — what an inbound lead payload is allowed to persist.
//
// The GPT Maker webhook used the payload verbatim:
//
//   phone: senderPhone          // "186432031355045@lid"
//   name:  `Lead ${senderPhone}` // "Lead 186432031355045@lid"
//
// The DB trigger then derived phone_normalized from that same string, so the
// technical id became the lead's identity *and* its label. Every consumer that
// reads the row — the CRM UI, the `contact_created` / `lead_created` outbound
// webhook (`{{lead.name}}`, `{{lead.phone}}`) and the WhatsApp notification
// built from that payload — showed the LID to the sales team.
//
// This module is the single decision point, kept pure so it can be tested
// without booting the HTTP handler.
// ============================================================================

import { extractDialablePhone, isTechnicalPhone, normalizePhone } from "./phone.ts";
import { LEAD_ANON_NAME, isTechnicalId } from "./displayName.ts";

export interface LeadIdentityInput {
  /** Raw `contactName` / `pushName` from the provider payload. */
  contactName?: string | null;
  /** Raw `contactPhone` / `phone` / `from` from the provider payload. */
  contactPhone?: string | null;
}

export interface LeadIdentity {
  /** Safe value for `leads.phone`. `null` when the payload carried a Meta id. */
  phone: string | null;
  /**
   * Canonical lookup key, kept even when `phone` is null — see the note below.
   */
  phoneNormalized: string | null;
  /** Safe value for `leads.name`. */
  name: string;
  technicalName: boolean;
  technicalPhone: boolean;
}

/**
 * SE-LID-002 — the label this codebase uses when it knows the number but not
 * the name: `Lead <number>`. Returns `null` when the value carries no number at
 * all, so the caller can pick its own "no identity" label.
 *
 * It returns a string instead of only being inlined in `resolveLeadIdentity`
 * because more than one writer needs the exact same label: the GPT Maker
 * webhook (through `resolveLeadIdentity`) and the Solo/whatsmiau webhook, whose
 * `pushName` describes the SENDER and therefore cannot label a contact on an
 * outbound message.
 *
 * The number is unwrapped from a JID envelope first
 * ("5511987654321@s.whatsapp.net" -> "5511987654321"), and a Meta id yields
 * null — "Lead 186432031355045" is the label SE-LID-001 removed.
 */
export function leadNameFromPhone(phone: string | null | undefined): string | null {
  // A Meta id is never a label — "Lead 186432031355045" is the string
  // SE-LID-001 removed. Refused here too, so the helper cannot be misused by a
  // caller that forgot to check first.
  if (isTechnicalPhone(phone)) return null;
  // Canonical digits, not the raw field: "+55 (85) 99648-7923",
  // "5585996487923" and "5585996487923@s.whatsapp.net" must label the same
  // contact the same way, and the label then matches `phone_normalized` — the
  // key the dedup already uses. normalizePhone() also returns null for anything
  // with fewer than 8 digits, so a non-number never turns into a "Lead <x>"
  // label.
  const digits = normalizePhone(phone);
  return digits ? `Lead ${digits}` : null;
}

/**
 * Resolve name/phone for a lead created from a provider payload.
 *
 * Three decisions worth explaining:
 *
 * `phone` is NULL for a technical id, and the digits of a JID envelope when
 * there are any. That is the actual fix: the LID stopped being written to a
 * column that every downstream surface treats as a phone number. Storing it
 * "hidden" somewhere else was not an option — the outbound webhook renders
 * `{{lead.phone}}` straight from this column.
 *
 * `phoneNormalized` is KEPT for a technical id. Rows created before this fix
 * already have the bare LID in `phone_normalized`, and the UNIQUE index on
 * (equipe_id, phone_normalized) is what made the LID a stable key. Preserving
 * it means the webhook's existing lookup still FINDS those legacy rows and
 * reuses them, so the fix does not fork one contact into two leads. It is also
 * re-attached after the INSERT for a new LID lead (see the caller's step 9b),
 * which is what keeps a later message from creating a second row.
 *
 * Regarding the claim that the column is "a read key only": the DB trigger
 * recomputes it from `phone` on every write, so an INSERT with `phone = NULL`
 * lands with `phone_normalized = NULL`; the caller then sets it back with an
 * UPDATE that does not list `phone`.
 *
 * `name` follows the precedence below. The rows marked `previous` are the old
 * behaviour, kept as-is; the rows marked `fix` are the intentional changes of
 * SE-LID-001 (technical ids) and SE-LID-002 (payloads with no name field).
 *
 *   | contactName            | contactPhone     | name                        | |
 *   |------------------------|------------------|-----------------------------|---|
 *   | real name              | anything         | the real name               | previous |
 *   | technical id           | real number      | "Lead <number>"             | previous |
 *   | technical id           | blank            | "Novo Visitante"            | previous |
 *   | blank ("")             | real number      | "Lead <number>"             | fix (SE-LID-002) |
 *   | blank ("")             | technical id     | "[WhatsApp - Lead Anônimo]" | fix (SE-LID-001) |
 *   | technical id           | technical id     | "[WhatsApp - Lead Anônimo]" | fix (SE-LID-001) |
 *   | blank ("")             | blank ("")       | "[WhatsApp - Lead Anônimo]" | fix (SE-LID-002) |
 *
 * SE-LID-001 changed the two rows where the provider sent a Meta technical id:
 * pre-fix they read "Desconhecido" and "Lead <lid>"; now both read
 * "[WhatsApp - Lead Anônimo]", which is what the CRM already renders for such a
 * row via `formatDisplayName`. A lead with neither a name nor a number has no
 * identity to show, so the notification and the screen agree on the label.
 *
 * SE-LID-002 revisits the two rows SE-LID-001 deliberately left as "previous":
 * the payloads that carry NO name field at all. The literal "Desconhecido" is
 * not written any more. With a number in hand the lead is labelled from it —
 * `Lead <number>`, the same string the Solo webhook and the technical-name row
 * above already use — and with nothing in hand it gets the anonymous label.
 *
 * This is the OUTBOUND case (Casa Flow, 2026-09-18): when the team starts the
 * conversation, the provider has no contact name to send, because the contact
 * is not the one who wrote the message. The old code turned that absence into
 * "Desconhecido" and the AFTER INSERT trigger shipped it to the team's
 * `contact_created` notification. The lead itself is legitimate — the number is
 * real and the history has to be kept — so only the label changes.
 */
export function resolveLeadIdentity(input: LeadIdentityInput): LeadIdentity {
  const rawName = (input.contactName ?? "").trim();
  const rawPhone = (input.contactPhone ?? "").trim();

  const technicalName = isTechnicalId(rawName);
  const technicalPhone = isTechnicalPhone(rawPhone);
  // "5511987654321@s.whatsapp.net" -> "5511987654321"; "" for a LID/group.
  const dialable = extractDialablePhone(rawPhone);
  // "we have a number, not a name" — null when there is no number either.
  const phoneLabel = leadNameFromPhone(rawPhone);

  // Written as explicit branches, in order, so every outcome is reachable and
  // reviewable. The old code chained `||` over the two fields, which made the
  // `Lead <phone>` label look reachable for a payload with a blank name field —
  // it never was, because `rawName || 'Desconhecido'` is always truthy.
  let name: string;
  if (rawName && !technicalName) {
    // A real name always wins.
    name = rawName;
  } else if (technicalPhone) {
    // No usable name AND no usable number: the provider handed us a Meta
    // account id twice. This is the incident case, and the label matches what
    // `formatDisplayName` renders in the CRM for the same row.
    name = LEAD_ANON_NAME;
  } else if (phoneLabel) {
    // The number is the only identity we have. Two payloads land here: a
    // technical id sent as the name (pre-existing behaviour), and — SE-LID-002 —
    // a payload with NO name field at all. The second one is the outbound
    // message: it used to be persisted as "Desconhecido".
    name = phoneLabel;
  } else if (technicalName) {
    // A technical name with no number at all: nothing to label from.
    name = "Novo Visitante";
  } else {
    // Neither a name nor a number. There is no identity to show, so the row
    // gets the label the CRM already renders for it. SE-LID-002 — this used to
    // read "Desconhecido", a placeholder that only ever meant "no identity".
    name = LEAD_ANON_NAME;
  }

  return {
    phone: technicalPhone ? null : dialable,
    // Derived from the RAW value on purpose: for a legacy LID row this is the
    // bare id that row was created with, which is what makes the lookup hit.
    phoneNormalized: rawPhone ? normalizePhone(rawPhone) : null,
    name,
    technicalName,
    technicalPhone,
  };
}
