// ============================================================================
// SE-LID-001 — server twin of `src/lib/displayName.ts`.
//
// The app and the edge functions must agree on two questions:
//   - "is this string actually a name, or a Meta technical id?" and
//   - "is this string actually a phone, or the same technical id?"
//
// The frontend already answered the first one (Sprint 5.5) and masked the
// result in the UI. The edge functions never did, so an inbound `@lid` was
// written to the database verbatim and shipped to the team's outbound lead
// webhook — which is how "Lead 186432031355045@lid" reached a WhatsApp
// notification (Casa Flow, 2026-09-17).
//
// Keep this file in lockstep with `src/lib/displayName.ts`. Two runtimes, no
// shared build step: the duplication is deliberate and the tests on both sides
// pin the same examples.
// ============================================================================

import { isTechnicalPhone } from "./phone.ts";

/**
 * Fallback for a contact WhatsApp never gave us a name or a number for
 * (blocked numbers, LID-only accounts). Identical to the frontend default, so
 * the CRM UI and the outbound notification show the same string.
 */
export const LEAD_ANON_NAME = "[WhatsApp - Lead Anônimo]";

const TECHNICAL_ID_SUFFIXES = [
  "@lid",
  "@s.whatsapp.net",
  "@c.us",
  "@g.us",
  "@broadcast",
] as const;

/**
 * True when `name` is a Meta technical id rather than a human name. Bare digit
 * runs of 8+ characters count: GPT Maker forwards the raw account id when it
 * cannot read a pushName.
 */
export function isTechnicalId(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  if (TECHNICAL_ID_SUFFIXES.some((suffix) => trimmed.endsWith(suffix))) return true;
  if (/^\d{8,}$/.test(trimmed)) return true;
  return false;
}

/**
 * Format a Brazilian phone (E.164 digits, e.g. "5511987654321") into the
 * familiar `+55 (11) 98765-4321` shape. Returns the input unchanged when it
 * doesn't look like a BR mobile. Mirror of the frontend helper.
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
 * Resolve the best human-facing label for a lead/contact.
 *
 * Precedence:
 *   1. a real name (not a technical id) — use it;
 *   2. a real phone — render it formatted;
 *   3. nothing usable — the anonymous fallback.
 *
 * Step 2 requires a *phone*: a Meta LID stored in the phone column is not one,
 * and rendering it produced "+186432031355045" in the UI and in notifications.
 */
export function formatDisplayName(
  name: string | null | undefined,
  phone: string | null | undefined,
  fallback: string = LEAD_ANON_NAME,
): string {
  if (name && !isTechnicalId(name)) return name.trim();
  if (isTechnicalPhone(phone)) return fallback;
  const pretty = formatBrPhone(phone);
  if (pretty) return pretty;
  return fallback;
}
