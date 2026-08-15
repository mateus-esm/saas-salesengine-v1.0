// ============================================================================
// Sprint 7.3 — the agent-webhooks contract, shared by `manage-agent-webhooks`
// (the editor) and `manage-agent-channels` (which pins onNewMessage whenever a
// channel is created).
//
// The provider's `GET /v2/agent/{id}/webhooks` returns exactly these eight
// keys, every one a string URL, `""` when unset. Captured live 2026-08-14.
//
// We always PUT the COMPLETE object. The provider does not document whether
// PUT merges or replaces, and a partial PUT under replace semantics would
// silently wipe a tenant's other events — so we never send a partial body and
// the question never arises.
//
// NOTE `onLackKnowLedge` (provider's spelling, including the capital L) lives
// HERE, not on /settings. Sprint 7.2 recorded it as "documented but absent from
// the live /settings GET"; it was simply never a settings key. Until 7.3 the
// Settings page offered a field for it that wrote to /settings, where the
// provider accepted the request and discarded the value.
// ============================================================================

export const WEBHOOK_EVENT_KEYS = [
  'onNewMessage',
  'onFirstInteraction',
  'onStartInteraction',
  'onFinishInteraction',
  'onTransfer',
  'onCreateEvent',
  'onCancelEvent',
  'onLackKnowLedge',
] as const;

export type WebhookEventKey = typeof WEBHOOK_EVENT_KEYS[number];

export type AgentWebhooks = Record<WebhookEventKey, string>;

/** Every event unset — the base every PUT body is built on. */
export const WEBHOOK_EVENT_DEFAULTS: AgentWebhooks = Object.fromEntries(
  WEBHOOK_EVENT_KEYS.map((k) => [k, '']),
) as AgentWebhooks;

/**
 * Coerce an arbitrary upstream/client payload into the full eight-key object.
 * Unknown keys are dropped, missing keys default to '', and non-strings are
 * discarded rather than forwarded — the provider rejects a non-string URL and
 * we would rather lose a malformed value than fail the whole PUT.
 */
export function normalizeWebhooks(input: unknown): AgentWebhooks {
  const src = (input ?? {}) as Record<string, unknown>;
  const out = { ...WEBHOOK_EVENT_DEFAULTS };
  for (const key of WEBHOOK_EVENT_KEYS) {
    if (typeof src[key] === 'string') out[key] = (src[key] as string).trim();
  }
  return out;
}
