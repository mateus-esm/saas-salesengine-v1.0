/**
 * Sprint 8.2 — a marca, num lugar só.
 *
 * O nome interno de engenharia tinha vazado para o texto que o cliente lê: a
 * tooltip do card do CRM, o parágrafo de abertura da proposta pública e a
 * descrição das entregas da implantação — o texto que ele literalmente aceita
 * ao clicar em "Aceitar proposta".
 *
 * PRODUTO ≠ EMPRESA. Solo Rev é o software; Solo Ventures é quem emite a nota,
 * assina o contrato e aparece no remetente do e-mail. Colapsar os dois num nome
 * só quebraria a cobrança, então são campos separados de propósito.
 *
 * O gêmeo do lado servidor é supabase/functions/_shared/brand.ts, e
 * src/__tests__/brand-consistency.test.ts falha se o nome antigo reaparecer em
 * qualquer fonte de src/ — inclusive num comentário como este.
 */
export const BRAND = {
  /** O software. Rev de Receita e de Revolução: o produto é um motor de receita. */
  product: "Solo Rev",
  /** Quem fatura, emite nota e assina o e-mail. */
  company: "Solo Ventures",
  tagline: "Motor de Receita",
  /**
   * O laranja Solo. É `--primary: 28 100% 50%` de src/index.css convertido para
   * hex — o app e o e-mail usam literalmente a mesma cor, em vez de dois
   * laranjas parecidos que ninguém percebe estarem diferentes.
   */
  color: "#FF7700",
} as const;
