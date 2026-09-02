// ============================================================================
// Sprint 8.2 — CPF/CNPJ no servidor.
//
// POR QUE ISTO EXISTE, e por que é uma cópia de src/lib/br-doc.ts:
//
// A página de aceite da proposta pedia o documento com o placeholder "Opcional",
// e a edge function gravava o que viesse. As quatro aceitações que existem em
// produção têm accepted_doc = "". A partir daí:
//
//     accepted_doc = ""
//       → billing_accounts.doc_number = null
//         → o Asaas não aceita criar cobrança sem CPF/CNPJ
//           → a fatura existe e o dinheiro nunca é pedido
//
// É por isso que a FAT-2026-000018 da Rema Digital (R$700) está aberta sem
// nenhuma cobrança associada.
//
// Validar no navegador não resolve: a função de aceite é pública e chamável
// direto. Quem decide se o documento presta tem que ser o servidor — daqui.
//
// Deno não importa de src/, então este arquivo é uma cópia deliberada.
// br-doc.test.ts roda os mesmos casos de src/__tests__/br-doc.test.ts para que
// as duas não divirjam em silêncio.
// ============================================================================

export const onlyDigits = (value: string): string => (value ?? "").replace(/\D/g, "");

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  // Dígitos repetidos passam na aritmética e nunca são documentos reais.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (upTo: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i++) sum += Number(cpf[i]) * (upTo + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digit = (upTo: number): number => {
    // Pesos 5..2 e depois 9..2 para o primeiro dígito, deslocados para o segundo.
    let weight = upTo - 7;
    let sum = 0;
    for (let i = 0; i < upTo; i++) {
      sum += Number(cnpj[i]) * weight;
      weight = weight - 1 === 1 ? 9 : weight - 1;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

/** Aceita qualquer um dos dois. É o que o Asaas precisa para abrir uma cobrança. */
export function isValidBrDoc(value: string): boolean {
  const d = onlyDigits(value);
  return d.length === 11 ? isValidCPF(d) : d.length === 14 ? isValidCNPJ(d) : false;
}

/** 'CPF' | 'CNPJ' | null — o que billing_accounts.doc_type espera. */
export function docType(value: string): "CPF" | "CNPJ" | null {
  const d = onlyDigits(value);
  if (d.length === 11 && isValidCPF(d)) return "CPF";
  if (d.length === 14 && isValidCNPJ(d)) return "CNPJ";
  return null;
}

/**
 * Um e-mail que o convite de acesso consegue alcançar.
 *
 * Deliberadamente frouxo: validar e-mail por regex é uma armadilha conhecida, e
 * recusar um endereço válido é pior do que aceitar um inválido — a proposta já
 * foi negociada, e o cliente está parado na tela de aceite. Isto barra o que
 * claramente não é endereço (vazio, sem @, sem domínio) e deixa o resto passar;
 * o convite falhando é visível no painel, um aceite bloqueado não.
 */
export function isPlausibleEmail(value: string): boolean {
  const v = (value ?? "").trim();
  return v.length >= 6 && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}
