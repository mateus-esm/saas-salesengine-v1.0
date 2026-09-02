// ============================================================================
// Sprint 8.2 — a marca, num lugar só (lado servidor).
//
// "Sales Engine" estava escrito em quatro arquivos de src/ e em dois pontos do
// notification-dispatcher, cada um com seu próprio fallback. Renomear o produto
// virava uma caça a literais, e o gêmeo em src/config/brand.ts existe pela
// mesma razão do lado do app.
//
// PRODUTO ≠ EMPRESA. Solo Rev é o software; Solo Ventures é quem emite a nota e
// assina o remetente do e-mail. Colapsar os dois num nome só quebraria a
// cobrança, então eles são campos separados de propósito.
// ============================================================================

export const BRAND = {
  /** O software. Rev de Receita e de Revolução: o produto é um motor de receita. */
  product: "Solo Rev",
  /** Quem fatura, emite nota e assina o e-mail. */
  company: "Solo Ventures",
  tagline: "Motor de Receita",
  /**
   * O laranja Solo. É a conversão exata de `--primary: 28 100% 50%` em
   * src/index.css — o e-mail e o app usam literalmente a mesma cor, em vez de
   * dois laranjas parecidos que ninguém percebe estarem diferentes.
   */
  color: "#FF7700",
} as const;

/**
 * O nome a exibir, na ordem: o que o painel configurou, o que o ambiente
 * definiu, e por fim a constante.
 *
 * O painel vem primeiro porque trocar o nome do produto não deve exigir deploy.
 */
export function platformName(settings?: Map<string, string>): string {
  return settings?.get("PLATFORM_NAME")?.trim()
    || Deno.env.get("PLATFORM_NAME")?.trim()
    || BRAND.product;
}
