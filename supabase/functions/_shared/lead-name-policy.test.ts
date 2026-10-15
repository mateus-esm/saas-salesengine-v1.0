import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isPlaceholderName, shouldApplyName } from "./lead-name-policy.ts";

Deno.test("nome técnico ou de reserva é placeholder", () => {
  for (const n of [null, undefined, "", "  ", "Desconhecido", "Novo Visitante", "[WhatsApp - Lead Anônimo]",
    "Lead 5511987654321", "5511987654321", "186432031355045@lid", "Lead 186432031355045@lid"]) {
    assertEquals(isPlaceholderName(n), true, String(n));
  }
});

Deno.test("nome de gente não é placeholder", () => {
  for (const n of ["Maria Silva", "João", "Lead Master Ltda", "Leandro"]) {
    assertEquals(isPlaceholderName(n), false, n);
  }
});

Deno.test("pushName só preenche nome vazio/técnico", () => {
  assertEquals(shouldApplyName({ current: "Lead 5511987654321", incoming: "Maria", locked: false, source: "provider" }), true);
  assertEquals(shouldApplyName({ current: "", incoming: "Maria", locked: false, source: "provider" }), true);
  // o contato escolhe o próprio apelido; o nome que o time já tem não é trocado
  assertEquals(shouldApplyName({ current: "Maria Souza (Rema)", incoming: "mah", locked: false, source: "provider" }), false);
});

Deno.test("nome travado nunca é sobrescrito, de nenhuma origem", () => {
  assertEquals(shouldApplyName({ current: "Desconhecido", incoming: "Maria", locked: true, source: "provider" }), false);
  assertEquals(shouldApplyName({ current: "Ana", incoming: "Maria", locked: true, source: "ai" }), false);
});

Deno.test("nome extraído pela IA troca nome real só quando destravado", () => {
  assertEquals(shouldApplyName({ current: "mah", incoming: "Maria Souza", locked: false, source: "ai" }), true);
  assertEquals(shouldApplyName({ current: "Maria Souza", incoming: "Maria Souza", locked: false, source: "ai" }), false);
});

Deno.test("candidato vazio ou técnico nunca é aplicado", () => {
  assertEquals(shouldApplyName({ current: "", incoming: "5511987654321", locked: false, source: "provider" }), false);
  assertEquals(shouldApplyName({ current: "", incoming: "  ", locked: false, source: "ai" }), false);
  assertEquals(shouldApplyName({ current: "Ana", incoming: null, locked: false, source: "ai" }), false);
});
