import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  WEBHOOK_EVENT_KEYS,
  WEBHOOK_EVENT_DEFAULTS,
  normalizeWebhooks,
} from "./agent-webhooks.ts";

Deno.test("the contract is the eight keys the provider returns", () => {
  assertEquals(WEBHOOK_EVENT_KEYS.length, 8);
  // Provider's spelling, capital L included. Getting this wrong means the key
  // is silently dropped on PUT.
  assertEquals(WEBHOOK_EVENT_KEYS.includes('onLackKnowLedge'), true);
});

Deno.test("defaults carry every key so a PUT is never partial", () => {
  assertEquals(Object.keys(WEBHOOK_EVENT_DEFAULTS).length, 8);
  assertEquals(Object.values(WEBHOOK_EVENT_DEFAULTS).every((v) => v === ''), true);
});

Deno.test("normalize fills missing keys rather than omitting them", () => {
  const out = normalizeWebhooks({ onNewMessage: 'https://x/hook' });
  assertEquals(Object.keys(out).length, 8);
  assertEquals(out.onNewMessage, 'https://x/hook');
  assertEquals(out.onTransfer, '');
});

Deno.test("normalize drops unknown keys and non-strings", () => {
  const out = normalizeWebhooks({
    onNewMessage: 'https://x/hook',
    onTransfer: 42,
    bogusKey: 'https://evil/hook',
  });
  assertEquals(out.onTransfer, '');
  assertEquals((out as Record<string, unknown>).bogusKey, undefined);
});

Deno.test("normalize trims — pasted URLs carry whitespace", () => {
  assertEquals(normalizeWebhooks({ onNewMessage: '  https://x/hook \n' }).onNewMessage, 'https://x/hook');
});

Deno.test("normalize tolerates null/undefined input", () => {
  assertEquals(Object.keys(normalizeWebhooks(null)).length, 8);
  assertEquals(Object.keys(normalizeWebhooks(undefined)).length, 8);
});
