import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseNumericValue } from "./index.ts";

Deno.test("parseNumericValue - standard clean number", () => {
  assertEquals(parseNumericValue(15000), 15000);
  assertEquals(parseNumericValue("15000"), 15000);
});

Deno.test("parseNumericValue - Brazilian currency/number format", () => {
  assertEquals(parseNumericValue("R$ 15.000,00"), 15000);
  assertEquals(parseNumericValue("15.000,00"), 15000);
  assertEquals(parseNumericValue("15.000"), 15000);
  assertEquals(parseNumericValue("R$1.234.567,89"), 1234567.89);
});

Deno.test("parseNumericValue - US currency/number format", () => {
  assertEquals(parseNumericValue("$15,000.00"), 15000);
  assertEquals(parseNumericValue("15,000.00"), 15000);
  assertEquals(parseNumericValue("15,000"), 15000);
  assertEquals(parseNumericValue("$1,234,567.89"), 1234567.89);
});

Deno.test("parseNumericValue - simple decimals", () => {
  assertEquals(parseNumericValue("15,5"), 15.5);
  assertEquals(parseNumericValue("15.5"), 15.5);
});

Deno.test("parseNumericValue - invalid / empty inputs", () => {
  assertEquals(parseNumericValue(undefined), undefined);
  assertEquals(parseNumericValue(null), undefined);
  assertEquals(parseNumericValue("abc"), undefined);
});
