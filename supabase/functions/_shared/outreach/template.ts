// ============================================================================
// SE-REV-005 — as variáveis que uma mensagem pode usar.
//
// É a lista que renderFirstMessage() (../start-conversation.ts) resolve, e
// nenhuma outra: uma variável aqui sem valor lá viraria string vazia na cara
// do cliente. A tela mostra esta mesma lista (src/lib/message-variables.ts —
// o teste de lá confere que as duas continuam iguais).
//
// Antes, `{{lead.nome}}` era salvo sem erro e saía como "" no WhatsApp: o dono
// não tinha como saber que errou. Agora o texto é validado ao salvar.
// ============================================================================

export const MESSAGE_VARIABLES = [
  "lead.name",
  "lead.first_name",
  "lead.source",
  "tenant.name",
] as const;

export type MessageVariable = typeof MESSAGE_VARIABLES[number];

const KNOWN = new Set<string>(MESSAGE_VARIABLES);

/** Mesma forma que renderFirstMessage() reconhece: `{{ chave }}`. */
export const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export type TemplateProblem =
  | { kind: "unknown_variable"; variable: string }
  | { kind: "malformed"; fragment: string };

/**
 * O que está errado no texto. Vazio = ok.
 *
 * - variável fora da lista (`{{lead.nome}}`);
 * - chaves que não fecham um placeholder válido (`{{lead.name}`, `{{ }}`,
 *   `{{lead name}}`) — renderFirstMessage() as deixaria passar literais.
 */
export function templateProblems(
  template: string | null | undefined,
): TemplateProblem[] {
  const raw = typeof template === "string" ? template : "";
  const problems: TemplateProblem[] = [];
  const seen = new Set<string>();
  for (const match of raw.matchAll(PLACEHOLDER_RE)) {
    const key = match[1];
    if (!KNOWN.has(key) && !seen.has(key)) {
      seen.add(key);
      problems.push({ kind: "unknown_variable", variable: key });
    }
  }
  const leftover = raw.replace(PLACEHOLDER_RE, "");
  // `{{` ou `}}` que sobrou, ou `{lead.name}` com chave simples.
  const stray = leftover.match(
    /\{\{[^}]{0,40}|[^{]{0,40}\}\}|\{\s*[A-Za-z0-9_]+\.[A-Za-z0-9_.]+\s*\}/,
  );
  if (stray) problems.push({ kind: "malformed", fragment: stray[0].trim() });
  return problems;
}

/** Mensagem única para a API; null = texto válido. */
export function templateError(
  template: string | null | undefined,
): string | null {
  const problems = templateProblems(template);
  if (!problems.length) return null;
  const unknown = problems.flatMap((p) =>
    p.kind === "unknown_variable" ? [`{{${p.variable}}}`] : []
  );
  const malformed = problems.flatMap((p) =>
    p.kind === "malformed" ? [p.fragment] : []
  );
  const parts: string[] = [];
  if (unknown.length) parts.push(`variável inexistente: ${unknown.join(", ")}`);
  if (malformed.length) {
    parts.push(`chaves mal fechadas perto de "${malformed[0]}"`);
  }
  return `${parts.join("; ")}. Variáveis disponíveis: ${
    MESSAGE_VARIABLES.map((v) => `{{${v}}}`).join(", ")
  }.`;
}
