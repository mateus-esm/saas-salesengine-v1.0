import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveAction } from "./index.ts";

const URL_BASE = "https://x.functions.supabase.co/manage-agent-channels";

// ─────────────────────────────────────────────────────────────────────────────
// THE regression test.
//
// supabase-js `functions.invoke(name)` with no options sends POST with an empty
// body (@supabase/functions-js FunctionsClient: `method: method || 'POST'`).
// The old code branched on `req.method === 'POST'` and then ran
// `await req.json()` on that empty body, which throws — so the channel listing
// was unreachable from the app and every load showed "não foi possível carregar
// os canais". Dispatch must key off the ACTION, never the HTTP method.
// ─────────────────────────────────────────────────────────────────────────────
Deno.test("body-less POST (supabase-js default invoke) resolves to list", () => {
  const req = new Request(URL_BASE, { method: "POST" });
  assertEquals(resolveAction(req, {}), "list");
});

Deno.test("GET resolves to list", () => {
  const req = new Request(URL_BASE, { method: "GET" });
  assertEquals(resolveAction(req, {}), "list");
});

Deno.test("action in the body is honoured", () => {
  const req = new Request(URL_BASE, { method: "POST" });
  assertEquals(resolveAction(req, { action: "create" }), "create");
  assertEquals(resolveAction(req, { action: "remove" }), "remove");
  assertEquals(resolveAction(req, { action: "qr" }), "qr");
});

Deno.test("action in the query string is honoured", () => {
  const req = new Request(`${URL_BASE}?action=qr`, { method: "POST" });
  assertEquals(resolveAction(req, {}), "qr");
});

Deno.test("query string wins over body when both are present", () => {
  const req = new Request(`${URL_BASE}?action=list`, { method: "POST" });
  assertEquals(resolveAction(req, { action: "create" }), "list");
});

Deno.test("a non-string body action never leaks through", () => {
  const req = new Request(URL_BASE, { method: "POST" });
  assertEquals(resolveAction(req, { action: 42 }), "list");
  assertEquals(resolveAction(req, { action: null }), "list");
});
