import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { dueDateIn, mapEventToInvoiceStatus, safeEqual } from "./asaas.ts";

Deno.test("safeEqual matches identical tokens", () => {
  assertEquals(safeEqual("abc123", "abc123"), true);
});

Deno.test("safeEqual rejects different tokens of equal length", () => {
  assertEquals(safeEqual("abc123", "abc124"), false);
});

Deno.test("safeEqual rejects different lengths", () => {
  assertEquals(safeEqual("abc", "abcd"), false);
});

Deno.test("safeEqual rejects an empty token against a real one", () => {
  // The header is "" when Asaas sends nothing; that must never pass.
  assertEquals(safeEqual("", "real-token"), false);
});

Deno.test("payment confirmed and received both mean paid", () => {
  assertEquals(mapEventToInvoiceStatus("PAYMENT_CONFIRMED"), "paid");
  assertEquals(mapEventToInvoiceStatus("PAYMENT_RECEIVED"), "paid");
});

Deno.test("overdue maps to overdue", () => {
  assertEquals(mapEventToInvoiceStatus("PAYMENT_OVERDUE"), "overdue");
});

Deno.test("refunds and chargebacks map to refunded", () => {
  assertEquals(mapEventToInvoiceStatus("PAYMENT_REFUNDED"), "refunded");
  assertEquals(mapEventToInvoiceStatus("PAYMENT_CHARGEBACK_REQUESTED"), "refunded");
});

Deno.test("deleted and restored move the invoice, not the money", () => {
  assertEquals(mapEventToInvoiceStatus("PAYMENT_DELETED"), "void");
  assertEquals(mapEventToInvoiceStatus("PAYMENT_RESTORED"), "open");
});

Deno.test("an unknown event is ignored rather than guessed at", () => {
  // Asaas adds event types over time. Returning null keeps the webhook a no-op
  // instead of applying some default that moves money.
  assertEquals(mapEventToInvoiceStatus("PAYMENT_AWAITING_RISK_ANALYSIS"), null);
  assertEquals(mapEventToInvoiceStatus("SOMETHING_NEW"), null);
});

Deno.test("dueDateIn returns an ISO date n days out", () => {
  const d = dueDateIn(1);
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(d), true);
  const diff = Math.round((new Date(d + "T00:00:00Z").getTime() - new Date(new Date().toISOString().split("T")[0] + "T00:00:00Z").getTime()) / 86400000);
  assertEquals(diff, 1);
});
