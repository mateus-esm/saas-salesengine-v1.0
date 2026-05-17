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
