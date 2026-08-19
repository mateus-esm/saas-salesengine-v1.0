// ============================================================================
// Sprint 7.5 W2 — credit pricing.
//
// BUSINESS RULE (founder, sprint_7.3_fixes.md Wave 2): we resell provider
// credits at DOUBLE the provider's price. A model the provider charges 14
// credits for costs the tenant 28.
//
// Two distinct units flow through this system and conflating them is how the
// numbers went wrong:
//
//   provider credits — what the provider charges and what
//                      GET /agent/{id}/credits-spent reports.
//   billed credits   — what the tenant sees, is charged, and spends from
//                      their plan allotment. Always provider × CREDIT_MARKUP.
//
// Everything the tenant sees is in BILLED credits. The conversion happens here
// and nowhere else, so changing the markup is a one-line change.
// ============================================================================

/** Resale multiplier over the provider's price. */
export const CREDIT_MARKUP = 2;

/** Provider credits → billed credits. */
export const toBilledCredits = (providerCredits: number): number =>
  Math.round((providerCredits || 0) * CREDIT_MARKUP);

export interface ModelInfo {
  id: string;
  label: string;
  vendor: string;
  /**
   * The PROVIDER's price per message. Never shown to a tenant directly —
   * the API layer converts it with `toBilledCredits` before it leaves.
   */
  providerCredits: number;
  isNew?: boolean;
  isBeta?: boolean;
  /**
   * True when `providerCredits` has NOT been confirmed against the provider's
   * own model list. The provider publishes no pricing endpoint and no pricing
   * table in its docs, so every value here is transcribed by hand. Surfacing
   * the flag keeps an unverified number from silently becoming a billing
   * figure the founder believes was checked.
   */
  unverifiedPrice?: boolean;
}

/** Shape sent to the client: billed credits, provider price never exposed. */
export interface PublicModel {
  id: string;
  label: string;
  vendor: string;
  creditsPerMessage: number;
  isNew?: boolean;
  isBeta?: boolean;
  unverifiedPrice?: boolean;
}

export const toPublicModel = (m: ModelInfo): PublicModel => ({
  id: m.id,
  label: m.label,
  vendor: m.vendor,
  creditsPerMessage: toBilledCredits(m.providerCredits),
  ...(m.isNew ? { isNew: true } : {}),
  ...(m.isBeta ? { isBeta: true } : {}),
  ...(m.unverifiedPrice ? { unverifiedPrice: true } : {}),
});
