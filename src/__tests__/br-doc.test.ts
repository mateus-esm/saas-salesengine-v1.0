import { describe, expect, it } from "vitest";
import { isValidBrDoc, isValidCNPJ, isValidCPF, maskCNPJ, maskCPF, onlyDigits } from "@/lib/br-doc";

/**
 * Sprint 8 T13. These matter because an invalid document is otherwise rejected by
 * the gateway at charge time — after the customer has decided to pay.
 */
describe("isValidCPF", () => {
  it("accepts a valid CPF, formatted or bare", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidCPF("529.982.247-26")).toBe(false);
  });

  it("rejects repeated digits, which pass the arithmetic but are never real", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("000.000.000-00")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isValidCPF("5299822472")).toBe(false);
    expect(isValidCPF("")).toBe(false);
  });
});

describe("isValidCNPJ", () => {
  it("accepts a valid CNPJ, formatted or bare", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidCNPJ("11.222.333/0001-82")).toBe(false);
  });

  it("rejects repeated digits", () => {
    expect(isValidCNPJ("11.111.111/1111-11")).toBe(false);
  });

  it("rejects a CPF submitted as a CNPJ", () => {
    // The exact confusion the doc_type check constraint exists to prevent.
    expect(isValidCNPJ("52998224725")).toBe(false);
  });
});

describe("masks", () => {
  it("formats a CPF progressively while typing", () => {
    expect(maskCPF("529")).toBe("529");
    expect(maskCPF("529982")).toBe("529.982");
    expect(maskCPF("52998224725")).toBe("529.982.247-25");
  });

  it("formats a CNPJ", () => {
    expect(maskCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("never exceeds the document length", () => {
    expect(onlyDigits(maskCPF("529982247259999"))).toHaveLength(11);
    expect(onlyDigits(maskCNPJ("112223330001819999"))).toHaveLength(14);
  });
});

/**
 * Sprint 8.2. O campo de CPF/CNPJ da página de aceite dizia "Opcional" e o
 * servidor gravava o que viesse: as quatro aceitações em produção têm
 * accepted_doc = "". Sem documento, billing_accounts.doc_number fica nulo, o
 * Asaas não abre a cobrança, e a fatura fica aberta sem ninguém pedir o dinheiro.
 */
describe("isValidBrDoc", () => {
  it("aceita CPF e CNPJ válidos, com ou sem máscara", () => {
    expect(isValidBrDoc("529.982.247-25")).toBe(true);
    expect(isValidBrDoc("11222333000181")).toBe(true);
  });

  it("recusa o vazio, que é o estado real das aceitações em produção", () => {
    expect(isValidBrDoc("")).toBe(false);
    expect(isValidBrDoc("   ")).toBe(false);
  });

  it("recusa tamanho intermediário e dígito verificador errado", () => {
    expect(isValidBrDoc("123456789")).toBe(false);
    expect(isValidBrDoc("11222333000182")).toBe(false);
  });
});
