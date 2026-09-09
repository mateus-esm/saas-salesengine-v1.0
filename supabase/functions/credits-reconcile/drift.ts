// ============================================================================
// SE-BILL-002 — what the nightly reconciliation decides to book.
//
// WHY THIS IS ITS OWN FILE: index.ts calls serve() at import time, so a test
// that imports it starts an HTTP server. The arithmetic that actually decides
// how many credits a customer loses lives here instead, where it can be driven
// across a simulated month without a database or a provider.
// ============================================================================

/**
 * Differences smaller than this are ignored. Provider rounding and our markup
 * conversion will never agree to the credit, and booking a 1-credit adjustment
 * every night would bury a real discrepancy in noise.
 */
export const NOISE_FLOOR = 5;

/** Columns needed to distinguish real usage from repairs/refunds. */
export type LedgerRow = {
  credits: number;
  entry_type: "debit" | "adjustment" | string;
  source: string;
};

export type Plan =
  | { book: false; recorded: number; drift: number }
  | { book: true; recorded: number; drift: number; credits: number; idempotencyKey: string };

/**
 * SE-BILL-002 — the idempotency key of a reconcile adjustment is the RUN DATE,
 * not the period.
 *
 * It used to be `reconcile_<YYYY-MM>`. `credit_ledger` carries
 * `unique (equipe_id, idempotency_key)`, so that key can be inserted exactly
 * ONCE PER CALENDAR MONTH per tenant — and the job treats the resulting 23505 as
 * "already reconciled" and moves on.
 *
 * The consequence was not a small one. The attendance agent generates
 * provider-side, so `credits-reconcile` is the ONLY thing that ever writes
 * WhatsApp consumption to the ledger — there is no debit path for that pool.
 * The job runs at 04:30 every night, computes the drift correctly, and on the
 * first night of the month books it. Every night after that it computed the
 * remaining drift and then threw it away on the unique violation. So roughly
 * one day of each month's WhatsApp usage was ever charged, and the rest of the
 * month was free: the balance in the panel stayed far too high, which is the
 * symptom SE-BILL-002 was opened for.
 *
 * A per-day key keeps the property the monthly key was reaching for — running
 * the job twice in one night books nothing the second time — without capping
 * the month.
 */
export function reconcileIdempotencyKey(runDate: Date): string {
  return `reconcile_${runDate.toISOString().slice(0, 10)}`;
}

/**
 * Consumption our ledger has recorded for the period so far.
 *
 * Debits are negative and the usage adjustments this job books are negative
 * too. Positive repairs, invoice refunds and admin corrections are deliberately
 * excluded: they move the balance, but they are not provider consumption.
 * Reconcile adjustments already booked earlier in the month are INCLUDED on
 * purpose: that makes each night's drift incremental rather than a re-statement
 * of the whole month.
 */
export function recordedConsumption(rows: readonly LedgerRow[]): number {
  return (rows ?? []).reduce((sum, r) => {
    const credits = Number(r?.credits ?? 0);
    if (credits >= 0) return sum;

    // Metered debits are usage. For adjustments, only the reconciler represents
    // provider-side usage; invoice refunds and admin corrections are separate
    // balance movements and must not change the provider-vs-ledger comparison.
    const isUsage = r.entry_type === "debit"
      || (r.entry_type === "adjustment" && r.source === "reconcile");
    return isUsage ? sum - credits : sum;
  }, 0);
}

/**
 * Decide the adjustment for one tenant on one night.
 *
 * `providerBilled` is the provider's month-to-date total already converted to
 * BILLED credits; `ledgerRows` is every debit/adjustment row on the pool since
 * the start of the period.
 */
export function planAdjustment(input: {
  providerBilled: number;
  ledgerRows: readonly LedgerRow[];
  runDate: Date;
}): Plan {
  const recorded = recordedConsumption(input.ledgerRows);
  const drift = input.providerBilled - recorded;

  if (Math.abs(drift) < NOISE_FLOOR) return { book: false, recorded, drift };

  return {
    book: true,
    recorded,
    drift,
    // The provider says we spent more than we recorded -> book a further debit.
    credits: -drift,
    idempotencyKey: reconcileIdempotencyKey(input.runDate),
  };
}
