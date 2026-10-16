import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { ModelInfo } from "./credit-pricing.ts";
import {
  CATALOG_TTL_MS, FORCE_MIN_INTERVAL_MS, decideRefresh, inferVendor, mergeCatalog,
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
  assertEquals(decideRefresh(null, now, false), "refresh");
  assertEquals(decideRefresh(now - CATALOG_TTL_MS + 1, now, false), "serve-cache");
  assertEquals(decideRefresh(now - CATALOG_TTL_MS, now, false), "refresh");
  assertEquals(decideRefresh(now - 1000, now, true), "serve-cache");
  assertEquals(decideRefresh(now - FORCE_MIN_INTERVAL_MS, now, true), "refresh");
});
