// ============================================================================
// Sprint 7.4 W2 — channel configuration contract.
//
// The provider's `GET /v2/channel/{id}/config` returns a DIFFERENT field set
// per channel type, and its docs do not enumerate the enums. This list was
// harvested empirically from all 23 channels across both live workspaces
// (2026-08-15):
//
//   Z_API      20 keys   the full surface
//   INSTAGRAM  16 keys   + comment automation, no group/call fields
//   WHATSAPP    7 keys   triggers + typing only
//   TELEGRAM    5 keys   triggers only  (same for MESSENGER, MERCADO_LIVRE,
//                        TWILIO_SMS per the docs' "basic" grouping)
//   WIDGET      —        returns {} — a widget has no conversational config
//
// PUT accepts a partial body ("Only include fields you wish to modify"), so we
// allowlist the editable keys and never echo `id`/`tenant` back.
// ============================================================================

/** Editable configuration keys. `id`/`tenant`/`type` are read-only. */
export const CHANNEL_CONFIG_KEYS = [
  // Universal
  'audioAction', 'startTrigger', 'endTrigger',
  // WhatsApp-family
  'enabledTyping',
  // Z_API only
  'enableGroupsResponse', 'replyGroupsType', 'enablePrivateChatResponse',
  'callRejectAuto', 'callRejectMessage',
  'waitingMessageEnabled', 'waitingMessageText',
  // Z_API + Instagram
  'takeOutsideService', 'takeOutsideServiceMember', 'takeOutsideServiceCommand',
  'takeOutsideServiceMessage', 'takeOutsideServiceCommandReturn',
  'takeOutsideServiceReturnMessage',
  // Instagram only
  'notReactInstagramStories', 'commentsReplyEnabled', 'commentsReplyAllEnabled',
  'commentsReplyAllInstruction', 'commentsCallDirectInstruction',
] as const;

/**
 * Pick the editable keys present in the payload.
 *
 * Values are forwarded AS-IS, never coerced. The docs type
 * `takeOutsideServiceCommandReturn` as a boolean but the live Instagram channel
 * holds the string "seguir" — live wins, and coercing would corrupt it.
 */
export function pickChannelConfig(input: unknown): Record<string, unknown> {
  const src = (input ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of CHANNEL_CONFIG_KEYS) {
    if (key in src) out[key] = src[key];
  }
  return out;
}
