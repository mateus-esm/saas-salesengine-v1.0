// SE-REV-005 — as variáveis que uma mensagem de outreach pode usar.
//
// Espelho de supabase/functions/_shared/outreach/template.ts (o servidor valida
// com a lista de lá e renderFirstMessage() resolve exatamente estas quatro).
// message-variables.test.ts confere que as duas listas continuam iguais.

export const MESSAGE_VARIABLES = [
  { key: "lead.name", label: "Nome completo do lead" },
  { key: "lead.first_name", label: "Primeiro nome do lead" },
  { key: "lead.source", label: "Origem gravada no lead" },
  { key: "tenant.name", label: "Nome da sua empresa" },
] as const;

const KNOWN = new Set<string>(MESSAGE_VARIABLES.map((v) => v.key));
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export type TemplateProblem =
  | { kind: "unknown_variable"; variable: string }
  | { kind: "malformed"; fragment: string };

/** Mesma regra do servidor: variável fora da lista ou chaves mal fechadas. */
export function templateProblems(template: string | null | undefined): TemplateProblem[] {
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
  const stray = raw.replace(PLACEHOLDER_RE, "").match(
    /\{\{[^}]{0,40}|[^{]{0,40}\}\}|\{\s*[A-Za-z0-9_]+\.[A-Za-z0-9_.]+\s*\}/,
  );
  if (stray) problems.push({ kind: "malformed", fragment: stray[0].trim() });
  return problems;
}

export function describeProblem(problem: TemplateProblem): string {
  return problem.kind === "unknown_variable"
    ? `{{${problem.variable}}} não existe — sairia em branco para o cliente.`
    : `Chaves mal fechadas perto de "${problem.fragment}". Use {{variável}}.`;
}

/** O lead de exemplo do preview na tela. */
export const SAMPLE_LEAD = { leadName: "Maria Souza", leadSource: "Meta Ads" };

export type PreviewContext = { leadName: string; leadSource: string; tenantName: string };

/** Mesmo resultado de renderFirstMessage() no servidor. */
export function renderPreview(template: string, ctx: PreviewContext): string {
  if (!template.trim()) return "";
  const name = ctx.leadName.trim();
  const values: Record<string, string> = {
    "lead.name": name,
    "lead.first_name": name.split(/\s+/)[0] ?? "",
    "lead.source": ctx.leadSource.trim(),
    "tenant.name": ctx.tenantName.trim(),
  };
  return template
    .replace(PLACEHOLDER_RE, (_m, key: string) => values[key] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
