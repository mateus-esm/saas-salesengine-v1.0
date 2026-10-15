import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isMetaChannel, isMetaWindowClosed, META_WINDOW_MS } from "./meta-window.ts";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

Deno.test("canais Meta: instagram e messenger, normalizados", () => {
  assertEquals(isMetaChannel("instagram"), true);
  assertEquals(isMetaChannel(" Messenger "), true);
  assertEquals(isMetaChannel("whatsapp"), false);
  assertEquals(isMetaChannel(null), false);
});

Deno.test("IG: último inbound há 30 h fecha; há 3 h abre; no limite abre", () => {
  assertEquals(isMetaWindowClosed("instagram", ago(30), NOW), true);
  assertEquals(isMetaWindowClosed("instagram", ago(3), NOW), false);
  assertEquals(isMetaWindowClosed("instagram", new Date(NOW - META_WINDOW_MS).toISOString(), NOW), false);
});

Deno.test("IG sem inbound ou data inválida: fechada (nunca abre por falta de dado)", () => {
  assertEquals(isMetaWindowClosed("instagram", null, NOW), true);
  assertEquals(isMetaWindowClosed("instagram", "x", NOW), true);
});

Deno.test("WhatsApp nunca é barrado por esta regra", () => {
  assertEquals(isMetaWindowClosed("whatsapp", ago(500), NOW), false);
  assertEquals(isMetaWindowClosed(null, null, NOW), false);
});

Deno.test("extensão humana (se ligada) usa a janela maior; desligada por padrão", () => {
  assertEquals(isMetaWindowClosed("instagram", ago(48), NOW), true);
  assertEquals(isMetaWindowClosed("instagram", ago(48), NOW, 7 * 24 * 3_600_000), false);
});
