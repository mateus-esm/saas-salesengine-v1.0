import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { upstreamFor } from "./index.ts";

Deno.test("settings actions target the /settings sub-resource", () => {
  assertEquals(upstreamFor('update-settings', 'A1').endsWith('/agent/A1/settings'), true);
  assertEquals(upstreamFor('update-model', 'A1').endsWith('/agent/A1/settings'), true);
});

Deno.test("agent-object actions do NOT target /settings", () => {
  assertEquals(upstreamFor('update-behavior', 'A1').endsWith('/agent/A1'), true);
  assertEquals(upstreamFor('update-description', 'A1').endsWith('/agent/A1'), true);
});
