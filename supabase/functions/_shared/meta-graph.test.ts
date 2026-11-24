import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createGraph, MetaGraphError } from "./meta-graph.ts";
import { appsecretProof, GRAPH_BASE } from "./meta.ts";

type Call = { url: URL; method: string; body?: string };

function fakeFetch(responses: Array<{ status: number; body: unknown }>, calls: Call[]) {
  return (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined });
    const r = responses.shift() ?? { status: 200, body: {} };
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
  };
}

Deno.test("graph.get - versão, token e appsecret_proof na URL", async () => {
  const calls: Call[] = [];
  const g = createGraph({ appId: "1", appSecret: "sec", fetch: fakeFetch([{ status: 200, body: { id: "9" } }], calls) });
  const r = await g.get<{ id: string }>("/me", "TOK", { fields: "id" });
  assertEquals(r.id, "9");
  const u = calls[0].url;
  assertEquals(u.origin + u.pathname, `${GRAPH_BASE}/me`);
  assertEquals(u.searchParams.get("access_token"), "TOK");
  assertEquals(u.searchParams.get("appsecret_proof"), await appsecretProof("TOK", "sec"));
  assertEquals(u.searchParams.get("fields"), "id");
});

Deno.test("graph.post - parâmetros no corpo, não na URL", async () => {
  const calls: Call[] = [];
  const g = createGraph({ appId: "1", appSecret: "sec", fetch: fakeFetch([{ status: 200, body: { success: true } }], calls) });
  await g.post("/P1/subscribed_apps", "PT", { subscribed_fields: "leadgen" });
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].url.searchParams.has("access_token"), false);
  const body = new URLSearchParams(calls[0].body);
  assertEquals(body.get("subscribed_fields"), "leadgen");
  assertEquals(body.get("access_token"), "PT");
  assert(body.get("appsecret_proof"));
});

Deno.test("graph - erro do Meta vira MetaGraphError com code/subcode, sem token na mensagem", async () => {
  const calls: Call[] = [];
  const g = createGraph({
    appId: "1",
    appSecret: "sec",
    fetch: fakeFetch([{ status: 400, body: { error: { message: "Invalid OAuth access token", code: 190, error_subcode: 463, fbtrace_id: "T" } } }], calls),
  });
  const e = await assertRejects(() => g.get("/me", "SECRET-TOKEN"), MetaGraphError);
  assertEquals((e as MetaGraphError).code, 190);
  assertEquals((e as MetaGraphError).subcode, 463);
  assert(!(e as MetaGraphError).message.includes("SECRET-TOKEN"));
});

Deno.test("graph.appToken - id|secret, usado no DELETE de subscribed_apps", async () => {
  const calls: Call[] = [];
  const g = createGraph({ appId: "111", appSecret: "sec", fetch: fakeFetch([{ status: 200, body: { success: true } }], calls) });
  await g.del("/P1/subscribed_apps", g.appToken());
  assertEquals(calls[0].method, "DELETE");
  assertEquals(calls[0].url.searchParams.get("access_token"), "111|sec");
});

Deno.test("graph.exchangeCode - troca o código no servidor com redirect_uri", async () => {
  const calls: Call[] = [];
  const g = createGraph({ appId: "111", appSecret: "sec", fetch: fakeFetch([{ status: 200, body: { access_token: "LONG" } }], calls) });
  const t = await g.exchangeCode("CODE", "https://app/cb");
  assertEquals(t, "LONG");
  const u = calls[0].url;
  assertEquals(u.pathname.endsWith("/oauth/access_token"), true);
  assertEquals(u.searchParams.get("client_id"), "111");
  assertEquals(u.searchParams.get("client_secret"), "sec");
  assertEquals(u.searchParams.get("code"), "CODE");
  assertEquals(u.searchParams.get("redirect_uri"), "https://app/cb");
});

Deno.test("graph.paginate - segue paging.next até o limite", async () => {
  const calls: Call[] = [];
  const g = createGraph({
    appId: "1",
    appSecret: "sec",
    fetch: fakeFetch([
      { status: 200, body: { data: [{ id: "a" }], paging: { next: `${GRAPH_BASE}/me/accounts?after=X` } } },
      { status: 200, body: { data: [{ id: "b" }] } },
    ], calls),
  });
  const all = await g.paginate<{ id: string }>("/me/accounts", "TOK", { fields: "id" }, 5);
  assertEquals(all.map((x) => x.id), ["a", "b"]);
  assertEquals(calls[1].url.searchParams.get("after"), "X");
  assert(calls[1].url.searchParams.get("appsecret_proof"));
});
