// Sprint 5.5 — Display name normalization for Meta/WhatsApp technical IDs.
//
// When a new WhatsApp lead enters via the provider webhook before the user
// has set a display name, the upstream payload sometimes carries the Meta
// technical identifier (e.g. "264162450083898@lid") as the contactName. That
// string then surfaces in every UI that renders the lead, looking broken.
//
// This module is the single source of truth for "is this name actually a
// technical placeholder?" — used by both the webhook (to refuse to store the
// bad value) and the frontend (to mask any historical rows still carrying it).

const TECHNICAL_ID_SUFFIXES = [
  "@lid",
  "@s.whatsapp.net",
  "@c.us",
  "@g.us",
  "@broadcast",
] as const;

export function isTechnicalId(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  if (TECHNICAL_ID_SUFFIXES.some((suffix) => trimmed.endsWith(suffix))) return true;
  // Bare numeric strings of 8+ digits are also Meta IDs leaking through.
  if (/^\d{8,}$/.test(trimmed)) return true;
  return false;
}

/**
 * SE-LID-001 — the same question, asked of the phone column.
 *
 * A lead's `phone` can hold a Meta technical id when the provider withheld the
 * real number (Casa Flow, 2026-09-17: "186432031355045@lid"). The phone was
 * rendered as "+186432031355045" and shipped as-is to the team's outbound lead
 * webhook. Two shapes count:
 *   - a `@lid` / `@g.us` / `@broadcast` value — no number inside;
 *   - a digit run of 15+, longer than any BR number (max 13 after
 *     normalization: "55" + DDD + 9 digits). A "<digits>@s.whatsapp.net" /
 *     "@c.us" envelope is judged by the digits inside it, so a real number stays
 *     a real number while a 15-digit id does not slip through disguised.
 *
 * Mirrors `isTechnicalPhone` in supabase/functions/_shared/phone.ts.
 */
export function isTechnicalPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const trimmed = String(phone).trim().toLowerCase();
  if (!trimmed) return false;
  if (
    trimmed.endsWith("@lid")
    || trimmed.endsWith("@g.us")
    || trimmed.endsWith("@broadcast")
  ) {
    return true;
  }
  const envelope = ["@s.whatsapp.net", "@c.us"].find((s) => trimmed.endsWith(s));
  const candidate = envelope ? trimmed.slice(0, trimmed.length - envelope.length) : trimmed;
  return /^\d{15,}$/.test(candidate.replace(/^\+/, ""));
}

/**
 * Format a Brazilian phone (E.164 digits, e.g. "5511987654321") into the
 * familiar `+55 (11) 98765-4321` shape. Returns the input unchanged when it
 * doesn't look like a BR mobile.
 */
export function formatBrPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const prefix = digits.slice(4, 9);
    const suffix = digits.slice(9, 13);
    return `+55 (${ddd}) ${prefix}-${suffix}`;
  }
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const prefix = digits.slice(2, 7);
    const suffix = digits.slice(7, 11);
    return `(${ddd}) ${prefix}-${suffix}`;
  }
  if (digits.length >= 8) return `+${digits}`;
  return phone;
}

/**
 * Resolve the best human-facing name for a lead/contact.
 *
 * Precedence:
 *   1. A real name (not a technical ID) — use it.
 *   2. A real phone number — render it formatted.
 *   3. Nothing usable — fall back to `[WhatsApp - Lead Anônimo]`
 *      (blocked/LID-only number case).
 *
 * Step 2 requires an actual phone: a Meta LID sitting in the phone column used
 * to be formatted as "+186432031355045", which is how the raw id kept reaching
 * the screen after the name side had already been masked. The edge functions
 * no longer write LIDs (SE-LID-001), but historical rows still carry them.
 */
export function formatDisplayName(
  name: string | null | undefined,
  phone: string | null | undefined,
  fallback: string = "[WhatsApp - Lead Anônimo]",
): string {
  if (name && !isTechnicalId(name)) return name.trim();
  if (isTechnicalPhone(phone)) return fallback;
  const pretty = formatBrPhone(phone);
  if (pretty) return pretty;
  return fallback;
}
