import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { ModelInfo } from "./credit-pricing.ts";
import {
  CATALOG_TTL_MS, FORCE_MIN_INTERVAL_MS, PROVIDER_TIMEOUT_MS, decideRefresh, fetchProviderModels,
  inferVendor, localPublicCatalog, mergeCatalog,
  parseProviderModels, provisionalCredits,
} from "./model-catalog.ts";

const local: ModelInfo[] = [
  { id: "GPT_5", label: "GPT-5", vendor: "OpenAI", providerCredits: 4 },
  { id: "GPT_5_6_SOL", label: "GPT-5.6 Sol", vendor: "OpenAI", providerCredits: 14 },
  { id: "CLAUDE_4_5_SONNET", label: "Claude 4.5 Sonnet", vendor: "Anthropic", providerCredits: 10 },
];

Deno.test("parse: aceita array puro, embrulhado e strings", () => {
  assertEquals(parseProviderModels(["GPT_5", "GPT_5"]).map((m) => m.id), ["GPT_5"]);
  assertEquals(parseProviderModels({ data: [{ model: "GPT_5" }] }).map((m) => m.id), ["GPT_5"]);
  assertEquals(parseProviderModels({ models: [{ id: "A_B", provider: "Foo", label: "AB" }] }),
    [{ id: "A_B", label: "AB", vendor: "Foo" }]);
});

Deno.test("parse: lixo e ids que o update-model recusaria são descartados", () => {
  assertEquals(parseProviderModels(null), []);
  assertEquals(parseProviderModels({ x: 1 }), []);
  assertEquals(parseProviderModels(["bad id!", 5, ""]), []);
});

Deno.test("fornecedor inferido pelo prefixo", () => {
  assertEquals(inferVendor("OPEN_AI_04"), "OpenAI");
  assertEquals(inferVendor("CLAUDE_9_OPUS"), "Anthropic");
  assertEquals(inferVendor("ZZZ"), "Outros");
});

Deno.test("preço provisório: maior do fornecedor, depois o maior geral, nunca 0", () => {
  assertEquals(provisionalCredits("OpenAI", local), 14);
  assertEquals(provisionalCredits("Anthropic", local), 10);
  assertEquals(provisionalCredits("Outros", local), 14);
  assert(provisionalCredits("Outros", []) > 0);
});

Deno.test("merge: conhecido usa o preço local; desconhecido vira novo com preço provisório", () => {
  const r = mergeCatalog({
    local, inUse: [],
    provider: [{ id: "GPT_5" }, { id: "GPT_5_7_LUNA" }],
  });
  const gpt5 = r.models.find((m) => m.id === "GPT_5")!;
  assertEquals(gpt5.creditsPerMessage, 8);
  assertEquals(gpt5.provisionalPrice, undefined);
  const luna = r.models.find((m) => m.id === "GPT_5_7_LUNA")!;
  assertEquals(luna.isNew, true);
  assertEquals(luna.provisionalPrice, true);
  assertEquals(luna.vendor, "OpenAI");
  assertEquals(luna.creditsPerMessage, 28);
  assertEquals(r.unpriced, ["GPT_5_7_LUNA"]);
});

Deno.test("merge: modelo local que o provedor não lista some, salvo se em uso", () => {
  const r = mergeCatalog({ local, inUse: ["GPT_5_6_SOL"], provider: [{ id: "GPT_5" }] });
  assertEquals(r.models.map((m) => m.id).sort(), ["GPT_5", "GPT_5_6_SOL"]);
  assertEquals(r.models.find((m) => m.id === "GPT_5_6_SOL")!.unlisted, true);
  assertEquals(r.models.find((m) => m.id === "CLAUDE_4_5_SONNET"), undefined);
  assertEquals(r.unpriced, []);
});

Deno.test("merge: em uso, fora do provedor e fora da tabela, continua visível e nunca custa 0", () => {
  const r = mergeCatalog({ local, inUse: ["QWEN_9"], provider: [{ id: "GPT_5" }] });
  const q = r.models.find((m) => m.id === "QWEN_9")!;
  assertEquals(q.unlisted, true);
  assert(q.creditsPerMessage > 0);
});

Deno.test("merge: sem lista do provedor nem cache, serve o catálogo local inteiro", () => {
  const r = mergeCatalog({ local, inUse: [], provider: null });
  assertEquals(r.models.length, 3);
  assertEquals(r.unpriced, []);
});

Deno.test("refresh: TTL de 6 h; forçado respeita o piso de 1 min", () => {
  const now = 10_000_000_000;
  assertEquals(decideRefresh(null, null, now, false), "refresh");
  assertEquals(decideRefresh(now - CATALOG_TTL_MS + 1, null, now, false), "serve-cache");
  assertEquals(decideRefresh(now - CATALOG_TTL_MS, null, now, false), "refresh");
  assertEquals(decideRefresh(now - 1000, null, now, true), "serve-cache");
  assertEquals(decideRefresh(now - FORCE_MIN_INTERVAL_MS, null, now, true), "refresh");
});

Deno.test("refresh: tentativa recente (falha incluída) segura nova chamada ao provedor", () => {
  const now = 10_000_000_000;
  const expired = now - CATALOG_TTL_MS - 1;
  assertEquals(decideRefresh(expired, now - 1000, now, false), "serve-cache");
  assertEquals(decideRefresh(expired, now - 1000, now, true), "serve-cache");
  assertEquals(decideRefresh(null, now - 1000, now, false), "serve-cache");
  assertEquals(decideRefresh(expired, now - FORCE_MIN_INTERVAL_MS, now, false), "refresh");
});

const U = "https://x/models";
const fakeFetch = (r: () => Response) => (() => Promise.resolve(r())) as unknown as typeof fetch;

Deno.test("fetchProviderModels: lista válida", async () => {
  const out = await fetchProviderModels(fakeFetch(() => Response.json({ data: ["GPT_5"] })), U, {});
  assertEquals(out.map((m) => m.id), ["GPT_5"]);
});

Deno.test("fetchProviderModels: lista vazia, HTTP 404, JSON inválido e rede caída lançam", async () => {
  for (const f of [
    fakeFetch(() => Response.json([])),
    fakeFetch(() => new Response("nope", { status: 404 })),
    fakeFetch(() => new Response("<html>", { status: 200 })),
    (() => Promise.reject(new TypeError("network"))) as unknown as typeof fetch,
  ]) {
    let threw = false;
    try { await fetchProviderModels(f, U, {}); } catch { threw = true; }
    assert(threw);
  }
});

Deno.test("fetchProviderModels: provedor pendurado aborta no timeout", async () => {
  let sawSignal = false;
  const hang = ((_u: string, init: RequestInit) => new Promise((_res, rej) => {
    sawSignal = init.signal instanceof AbortSignal;
    init.signal!.addEventListener("abort", () => rej(init.signal!.reason));
  })) as unknown as typeof fetch;
  const t0 = Date.now();
  let threw = false;
  try { await fetchProviderModels(hang, U, {}); } catch { threw = true; }
  assert(sawSignal && threw);
  assert(Date.now() - t0 < PROVIDER_TIMEOUT_MS + 2000);
});

Deno.test("localPublicCatalog: todo id local resolve rótulo e custo cobrado", () => {
  const all = localPublicCatalog(local);
  assertEquals(all.length, 3);
  assertEquals(all.find((m) => m.id === "CLAUDE_4_5_SONNET")!.creditsPerMessage, 20);
});
