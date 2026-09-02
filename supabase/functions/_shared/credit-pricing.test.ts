import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  CREDIT_MARKUP, toBilledCredits, toPublicModel, type ModelInfo,
} from "./credit-pricing.ts";

Deno.test("the resale markup is 2x the provider price", () => {
  assertEquals(CREDIT_MARKUP, 2);
});

// The founder's worked example from sprint_7.3_fixes.md Wave 2.
Deno.test("GPT 5.6 Sol: 14 provider credits bills at 28", () => {
  assertEquals(toBilledCredits(14), 28);
});

Deno.test("zero and missing values stay zero, never NaN", () => {
  assertEquals(toBilledCredits(0), 0);
  assertEquals(toBilledCredits(undefined as unknown as number), 0);
  assertEquals(toBilledCredits(null as unknown as number), 0);
});

Deno.test("billed credits are whole numbers", () => {
  assertEquals(Number.isInteger(toBilledCredits(2.5)), true);
});

Deno.test("the provider's own price never leaves the function", () => {
  const model: ModelInfo = {
    id: "GPT_5_6_SOL", label: "GPT-5.6 Sol", vendor: "OpenAI", providerCredits: 14,
  };
  const pub = toPublicModel(model);
  assertEquals(pub.creditsPerMessage, 28);
  assertEquals((pub as unknown as Record<string, unknown>).providerCredits, undefined);
});

Deno.test("optional flags are carried through, absent when unset", () => {
  const base: ModelInfo = { id: "X", label: "X", vendor: "V", providerCredits: 1 };
  assertEquals(toPublicModel(base).isNew, undefined);
  assertEquals(toPublicModel({ ...base, isNew: true }).isNew, true);
  assertEquals(toPublicModel({ ...base, isBeta: true }).isBeta, true);
  // An unconfirmed price must stay visible to the UI — a hand-transcribed
  // number that silently looks authoritative is a billing hazard.
  assertEquals(toPublicModel({ ...base, unverifiedPrice: true }).unverifiedPrice, true);
});
