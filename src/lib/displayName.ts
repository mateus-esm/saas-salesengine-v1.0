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
 *   2. A phone number — render it formatted.
 *   3. Nothing — fall back to `[WhatsApp - Lead Anônimo]` (blocked-number case).
 */
export function formatDisplayName(
  name: string | null | undefined,
  phone: string | null | undefined,
  fallback: string = "[WhatsApp - Lead Anônimo]",
): string {
  if (name && !isTechnicalId(name)) return name.trim();
  const pretty = formatBrPhone(phone);
  if (pretty) return pretty;
  return fallback;
}
