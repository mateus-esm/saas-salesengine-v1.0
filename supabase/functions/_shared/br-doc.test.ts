import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isValidBrDoc, isValidCNPJ, isValidCPF, onlyDigits } from "./br-doc.ts";

// Gêmeo de src/__tests__/br-doc.test.ts. Os mesmos casos dos dois lados porque
// as duas implementações são cópias — Deno não importa de src/ — e uma cópia sem
// teste espelhado diverge em silêncio.
//
// Isto importa porque o navegador não é a defesa: qualquer um pode chamar a
// função de aceite direto. Quem realmente decide se o documento presta é o
// servidor.

Deno.test("isValidCPF aceita um CPF real, com ou sem máscara", () => {
  assertEquals(isValidCPF("529.982.247-25"), true);
  assertEquals(isValidCPF("52998224725"), true);
});

Deno.test("isValidCPF rejeita dígito verificador errado", () => {
  assertEquals(isValidCPF("529.982.247-26"), false);
});

Deno.test("isValidCPF rejeita dígitos repetidos, que passam na conta mas nunca são reais", () => {
  assertEquals(isValidCPF("111.111.111-11"), false);
  assertEquals(isValidCPF("000.000.000-00"), false);
});

Deno.test("isValidCPF rejeita tamanho errado e vazio", () => {
  assertEquals(isValidCPF("5299822472"), false);
  assertEquals(isValidCPF(""), false);
});

Deno.test("isValidCNPJ aceita um CNPJ real, com ou sem máscara", () => {
  assertEquals(isValidCNPJ("11.222.333/0001-81"), true);
  assertEquals(isValidCNPJ("11222333000181"), true);
});

Deno.test("isValidCNPJ rejeita dígito verificador errado e repetidos", () => {
  assertEquals(isValidCNPJ("11.222.333/0001-82"), false);
  assertEquals(isValidCNPJ("11.111.111/1111-11"), false);
});

Deno.test("isValidBrDoc aceita os dois formatos e recusa o resto", () => {
  assertEquals(isValidBrDoc("529.982.247-25"), true);
  assertEquals(isValidBrDoc("11222333000181"), true);
  assertEquals(isValidBrDoc("123"), false);
  assertEquals(isValidBrDoc(""), false);
});

// O caso que gerou este arquivo: as quatro aceitações em produção têm
// accepted_doc = "", porque o formulário dizia "Opcional" e o servidor não
// conferia nada. Sem documento, billing_accounts.doc_number fica nulo e a
// cobrança no Asaas nunca é criada — a fatura existe e o dinheiro não entra.
Deno.test("isValidBrDoc recusa string vazia e só espaços", () => {
  assertEquals(isValidBrDoc(""), false);
  assertEquals(isValidBrDoc("   "), false);
  assertEquals(isValidBrDoc(null as unknown as string), false);
  assertEquals(isValidBrDoc(undefined as unknown as string), false);
});

Deno.test("onlyDigits tira máscara, espaço e letra", () => {
  assertEquals(onlyDigits("529.982.247-25"), "52998224725");
  assertEquals(onlyDigits(" 11 222 333/0001-81 "), "11222333000181");
  assertEquals(onlyDigits(""), "");
});
