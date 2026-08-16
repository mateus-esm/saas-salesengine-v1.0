import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { CHANNEL_CONFIG_KEYS, pickChannelConfig } from "./channel-config.ts";

Deno.test("read-only identity fields are never forwarded on PUT", () => {
  const out = pickChannelConfig({
    id: "CH1", tenant: "T1", type: "WHATSAPP", startTrigger: "ALL",
  });
  assertEquals(out.id, undefined);
  assertEquals(out.tenant, undefined);
  assertEquals(out.type, undefined);
  assertEquals(out.startTrigger, "ALL");
});

Deno.test("only touched keys survive — a partial PUT stays partial", () => {
  const out = pickChannelConfig({ enabledTyping: true });
  assertEquals(Object.keys(out), ["enabledTyping"]);
});

Deno.test("values are forwarded as-is, never coerced", () => {
  // The docs type this as boolean but the live Instagram channel holds the
  // string "seguir". Coercing would corrupt a real tenant setting.
  const out = pickChannelConfig({ takeOutsideServiceCommandReturn: "seguir" });
  assertEquals(out.takeOutsideServiceCommandReturn, "seguir");
});

Deno.test("false and empty string are preserved, not dropped as falsy", () => {
  const out = pickChannelConfig({ enabledTyping: false, callRejectMessage: "" });
  assertEquals(out.enabledTyping, false);
  assertEquals(out.callRejectMessage, "");
});

Deno.test("null clears a field rather than being skipped", () => {
  const out = pickChannelConfig({ waitingMessageText: null });
  assertEquals("waitingMessageText" in out, true);
  assertEquals(out.waitingMessageText, null);
});

Deno.test("unknown keys are dropped", () => {
  const out = pickChannelConfig({ startTrigger: "ALL", evilKey: "x" });
  assertEquals((out as Record<string, unknown>).evilKey, undefined);
});

Deno.test("the allowlist covers every field observed live", () => {
  // Union of the Z_API (20) and INSTAGRAM (16) live shapes, minus id/tenant/type.
  for (const k of [
    "audioAction", "startTrigger", "endTrigger", "enabledTyping",
    "enableGroupsResponse", "replyGroupsType", "enablePrivateChatResponse",
    "callRejectAuto", "callRejectMessage", "waitingMessageEnabled", "waitingMessageText",
    "takeOutsideService", "takeOutsideServiceMember", "takeOutsideServiceCommand",
    "takeOutsideServiceMessage", "takeOutsideServiceCommandReturn",
    "takeOutsideServiceReturnMessage", "notReactInstagramStories",
    "commentsReplyEnabled", "commentsReplyAllEnabled",
    "commentsReplyAllInstruction", "commentsCallDirectInstruction",
  ]) {
    assertEquals(
      (CHANNEL_CONFIG_KEYS as readonly string[]).includes(k),
      true,
      `${k} observed live but missing from the allowlist`,
    );
  }
});

Deno.test("tolerates null/undefined input", () => {
  assertEquals(pickChannelConfig(null), {});
  assertEquals(pickChannelConfig(undefined), {});
});
