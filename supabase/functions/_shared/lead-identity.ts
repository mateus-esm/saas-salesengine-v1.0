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
 * behaviour, kept as-is; the two marked `fix` are the intentional change.
 *
 *   | contactName            | contactPhone     | name                        | |
 *   |------------------------|------------------|-----------------------------|---|
 *   | real name              | anything         | the real name               | previous |
 *   | blank ("")             | real number      | "Desconhecido"              | previous |
 *   | technical id           | real number      | "Lead <number>"             | previous |
 *   | technical id           | blank            | "Novo Visitante"            | previous |
 *   | blank ("")             | technical id     | "[WhatsApp - Lead Anônimo]" | fix |
 *   | technical id           | technical id     | "[WhatsApp - Lead Anônimo]" | fix — the incident |
 *   | blank ("")             | blank ("")       | "Desconhecido"              | previous |
 *
 * Both `fix` rows are the SAME situation — no usable name and no usable number —
 * reached with the id in one field or both. Pre-fix they read "Desconhecido" and
 * "Lead <lid>" respectively; now both read "[WhatsApp - Lead Anônimo]", which is
 * what the CRM already renders for such a row via `formatDisplayName`. A lead
 * with neither a name nor a number has no identity to show, so the notification
 * and the screen now agree on the label.
 */
export function resolveLeadIdentity(input: LeadIdentityInput): LeadIdentity {
  const rawName = (input.contactName ?? "").trim();
  const rawPhone = (input.contactPhone ?? "").trim();

  const technicalName = isTechnicalId(rawName);
  const technicalPhone = isTechnicalPhone(rawPhone);
  // "5511987654321@s.whatsapp.net" -> "5511987654321"; "" for a LID/group.
  const dialable = extractDialablePhone(rawPhone);

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
  } else if (technicalName) {
    // A technical name with a usable number: the pre-existing behaviour was to
    // show the number instead of the id.
    name = dialable ? `Lead ${dialable}` : "Novo Visitante";
  } else {
    // The payload carried no name field at all. Pre-existing label, kept as-is.
    name = "Desconhecido";
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
