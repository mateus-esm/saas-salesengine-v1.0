// ============================================================================
// Sprint 5.5 EPIC 1 — Phone normalization for identity resolution.
//
// Bug being fixed: webhook used raw phone strings, so "+5511..." and "5511..."
// matched different rows and created duplicate leads. Every inbound phone goes
// through normalizePhone() before any lookup / upsert.
//
// Algorithm (Brazil-centric, the only inbound channel today is WhatsApp via
// GPT Maker):
//   1. Strip non-digits.
//   2. Strip leading zeros.
//   3. If length >= 12 and starts with "55", treat the leading 55 as country
//      code and strip it temporarily.
//   4. If the remainder is 10 digits (DDD + 8-digit landline-style mobile),
//      insert the mobile-9 after the DDD.
//   5. If the remainder is 11 digits (DDD + 9-digit mobile), prepend "55".
//   6. Otherwise return whatever digits remain (handles foreign numbers).
//
// The matching PL/pgSQL function `public.normalize_phone_br(text)` lives in
// `supabase/migrations/{ts}_epic1_phone_dedup.sql` and must stay in sync with
// this implementation.
// ============================================================================

export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  digits = digits.replace(/^0+/, "");
  if (digits.length < 8) return null;

  // Treat a leading "55" as Brazil country code only when total length plausibly
  // includes a country code (12+). Avoids stripping a real DDD 55 from RS.
  if (digits.length >= 12 && digits.startsWith("55")) {
    digits = digits.slice(2);
  }

  // 10 digits = DDD + 8-digit local — insert the mobile-9 after DDD.
  if (digits.length === 10) {
    digits = digits.slice(0, 2) + "9" + digits.slice(2);
  }

  // 11 digits = DDD + 9-digit mobile — prepend country code.
  if (digits.length === 11) {
    return "55" + digits;
  }

  return digits;
}

// ============================================================================
// SE-LID-001 — a Meta technical ID is not a phone number.
//
// Meta/WhatsApp hands out identifiers that look numeric but are NOT dialable:
//   - "186432031355045@lid" — the LID (local identifier), a per-account id.
//     There is no phone number inside it; Meta withholds the number, which is
//     exactly why resolving it to a real phone is impossible and the payload
//     must therefore choose between "no phone" and "mask the value".
//
// `normalizePhone()` cannot help here: its job is to strip non-digits, so it
// happily turns "186432031355045@lid" into "186432031355045" and the caller
// stores that as a phone. Worse, because the DB trigger
// `leads_sync_phone_normalized` recomputes phone_normalized from phone via
// `normalize_phone_br()`, TS and Postgres agree on that wrong value — so the
// garbage is stable and reaches every downstream consumer (CRM UI, outbound
// lead webhooks, WhatsApp notifications).
//
// Therefore: normalizePhone() keeps its current output (it is a documented
// mirror of public.normalize_phone_br — changing one side alone would make TS
// and Postgres disagree and duplicate leads). Callers that write a phone into
// an identity column must FIRST ask this function whether the raw value is
// even a phone. Inbound lead ingestion does exactly that.
// ============================================================================

/**
 * Suffixes that wrap a REAL number: "<5511987654321>@s.whatsapp.net". The
 * digits inside are dialable, so these are not technical ids — the envelope
 * just has to be stripped.
 */
const PHONE_JID_SUFFIXES = ["@s.whatsapp.net", "@c.us"] as const;

/**
 * Suffixes that identify an account or a room, never a phone: the LID is a
 * per-account identifier Meta assigns when it does not expose the number, and
 * a group/broadcast id addresses many members.
 */
const NON_PHONE_JID_SUFFIXES = ["@lid", "@g.us", "@broadcast"] as const;

/**
 * True when `raw` is a Meta/WhatsApp identifier that no phone column may hold.
 *
 * Two shapes:
 *   1. an `@lid` / `@g.us` / `@broadcast` value — there is no number inside;
 *   2. a bare digit run of 15+ characters. A Brazilian number is at most 13
 *      digits after normalization ("55" + DDD + 9 digits), and the LID from the
 *      2026-09-17 Casa Flow incident ("186432031355045") is 15. This half
 *      matters because two writers strip the suffix before we see the value:
 *      `solo-wpp-webhook`'s `extractPhoneFromJid()`, and the Postgres trigger
 *      that derives phone_normalized from an already-stored LID.
 *
 * A "<digits>@s.whatsapp.net" / "@c.us" envelope is judged by the digits INSIDE
 * it, not by the envelope: "5511987654321@s.whatsapp.net" is a real number, but
 * a 15-digit id wrapped that way would be the same LID wearing a number's
 * clothes, and must not reach `leads.phone`. (No such payload has been observed;
 * this is consistency with rule 2, not a fix for a known case.)
 *
 * Deliberately NOT flagged:
 *   - a JID envelope wrapping a plausible number — use extractDialablePhone();
 *   - bare digit runs of 8–14 characters, which are real subscriber numbers
 *     typed without the country code ("85996487923") and are legitimately
 *     carried by the outbound notification paths.
 */
export function isTechnicalPhone(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return false;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return false;
  if (NON_PHONE_JID_SUFFIXES.some((suffix) => trimmed.endsWith(suffix))) return true;
  // Unwrap a phone JID so the id inside is judged by the same rules.
  const matched = PHONE_JID_SUFFIXES.find((suffix) => trimmed.endsWith(suffix));
  const candidate = matched ? trimmed.slice(0, trimmed.length - matched.length) : trimmed;
  return /^\d{15,}$/.test(candidate.replace(/^\+/, ""));
}

/**
 * Return the dialable part of a WhatsApp identifier, or null when the value
 * carries no number at all.
 *
 *   "5511987654321@s.whatsapp.net" -> "5511987654321"
 *   "5511987654321@c.us"           -> "5511987654321"
 *   "186432031355045@lid"          -> null
 *   "120363000000000000@g.us"      -> null
 *   "+55 11 98765-4321"            -> "+55 11 98765-4321" (unchanged, caller normalizes)
 */
export function extractDialablePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (NON_PHONE_JID_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return null;
  const matched = PHONE_JID_SUFFIXES.find((suffix) => lower.endsWith(suffix));
  if (!matched) return value;
  const local = value.slice(0, value.length - matched.length);
  return /^\+?\d+$/.test(local) ? local : null;
}
