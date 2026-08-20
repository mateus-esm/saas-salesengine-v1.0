/**
 * Sprint 8 T13 — CPF/CNPJ validation and masking.
 *
 * Check digits are verified, not just length. Asaas rejects an invalid document
 * at charge time — the worst possible moment, because the customer has already
 * decided to pay and now sees a failure that looks like our fault.
 */

export const onlyDigits = (value: string): string => (value ?? "").replace(/\D/g, "");

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  // Repeated digits pass the arithmetic but are never real documents.
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
    // Weights run 5..2 then 9..2 for the first digit, shifted by one for the second.
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

export function maskCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function maskCNPJ(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export const maskDoc = (value: string, type: "CPF" | "CNPJ"): string =>
  type === "CPF" ? maskCPF(value) : maskCNPJ(value);
