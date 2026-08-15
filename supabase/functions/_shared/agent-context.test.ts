import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveAction } from "./agent-context.ts";

const U = "https://x.functions.supabase.co/fn";

// The Canais regression, generalized: every function in this family must treat
// the body-less POST that `functions.invoke(name)` sends as its read action.
Deno.test("body-less POST resolves to the fallback, not an error", () => {
  assertEquals(resolveAction(new Request(U, { method: "POST" }), {}), "get");
  assertEquals(resolveAction(new Request(U, { method: "POST" }), {}, "list"), "list");
});

Deno.test("GET resolves to the fallback", () => {
  assertEquals(resolveAction(new Request(U), {}, "list"), "list");
});

Deno.test("body action is honoured", () => {
  assertEquals(resolveAction(new Request(U, { method: "POST" }), { action: "save" }), "save");
});

Deno.test("query action wins over body", () => {
  const req = new Request(`${U}?action=get`, { method: "POST" });
  assertEquals(resolveAction(req, { action: "save" }), "get");
});

Deno.test("empty-string and non-string actions fall back", () => {
  assertEquals(resolveAction(new Request(U, { method: "POST" }), { action: "" }), "get");
  assertEquals(resolveAction(new Request(U, { method: "POST" }), { action: 7 }), "get");
});
