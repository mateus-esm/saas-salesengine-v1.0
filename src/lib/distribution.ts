// SE-SUP1-8 (#17) — a roleta do pipeline, do lado da tela.
//
// Quem decide é o banco (crm_assign_next, no INSERT do negócio); aqui só a forma
// da configuração, a validação antes de salvar (a mesma que o RPC refaz) e o texto
// do motivo, no MESMO formato que o banco grava ("regra 2: origem=Indicação") —
// o gestor reconhece no histórico a regra que escreveu.

export type DistributionMode = "round_robin" | "weighted" | "by_rule";

export interface DistributionMember {
  user_id: string;
  weight: number;
  /** "Ausente": com "pular ausentes" ligado, não recebe. */
  away: boolean;
}

export interface DistributionRule {
  /** Coluna do lead (lista fechada) ou "custom:<field_id>" do pipeline. */
  field: string;
  value: string;
  user_ids: string[];
}

export interface DistributionConfig {
  active: boolean;
  mode: DistributionMode;
  members: DistributionMember[];
  rules: DistributionRule[];
  max_open_per_seller: number | null;
  skip_away: boolean;
}

export const DEFAULT_DISTRIBUTION: DistributionConfig = {
  active: false,
  mode: "round_robin",
  members: [],
  rules: [],
  max_open_per_seller: null,
  skip_away: true,
};

export const MODE_LABEL: Record<DistributionMode, string> = {
  round_robin: "Rodízio",
  weighted: "Por peso",
  by_rule: "Por regra",
};

/** Mesmos rótulos do _distribution_field_label no banco. */
const LEAD_FIELDS: { value: string; label: string }[] = [
  { value: "origem", label: "origem" },
  { value: "source", label: "fonte" },
  { value: "origin_category", label: "categoria de origem" },
  { value: "origin_detail", label: "detalhe da origem" },
  { value: "origin_platform", label: "plataforma" },
  { value: "channel", label: "canal" },
];

interface SchemaField {
  field_id: string;
  label: string;
  is_deleted?: boolean;
}

export function ruleFieldOptions(schema: SchemaField[] | null | undefined): { value: string; label: string }[] {
  return [
    ...LEAD_FIELDS,
    ...(schema ?? []).filter((f) => !f.is_deleted).map((f) => ({ value: `custom:${f.field_id}`, label: f.label })),
  ];
}

export function fieldLabel(field: string, schema: SchemaField[] | null | undefined): string {
  if (field === "origin") return "origem";
  return (
    LEAD_FIELDS.find((f) => f.value === field)?.label ??
    (schema ?? []).find((f) => `custom:${f.field_id}` === field)?.label ??
    "campo"
  );
}

/** "regra 2: origem=Indicação" — índice 0-based na tela, 1-based no texto. */
export const describeRule = (r: DistributionRule, index: number, schema: SchemaField[] | null | undefined): string =>
  `regra ${index + 1}: ${fieldLabel(r.field, schema)}=${r.value.trim()}`;

const isMode = (m: unknown): m is DistributionMode => m === "round_robin" || m === "weighted" || m === "by_rule";

export function normalizeDistribution(raw: unknown): DistributionConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DISTRIBUTION };
  const r = raw as Record<string, unknown>;
  const max = Number(r.max_open_per_seller);
  return {
    active: r.active === true,
    mode: isMode(r.mode) ? r.mode : "round_robin",
    members: (Array.isArray(r.members) ? r.members : [])
      .filter((m: Record<string, unknown>) => typeof m?.user_id === "string")
      .map((m: Record<string, unknown>) => ({
        user_id: m.user_id as string,
        weight: Math.min(100, Math.max(1, Math.round(Number(m.weight) || 1))),
        away: m.away === true,
      })),
    rules: (Array.isArray(r.rules) ? r.rules : []).map((x: Record<string, unknown>) => ({
      field: String(x?.field ?? "origem"),
      value: String(x?.value ?? ""),
      user_ids: Array.isArray(x?.user_ids) ? (x.user_ids as unknown[]).map(String) : [],
    })),
    max_open_per_seller: r.max_open_per_seller == null || !Number.isFinite(max) ? null : max,
    skip_away: r.skip_away !== false,
  };
}

/** Os erros que o RPC recusaria, em português, antes de mandar. */
export function validateDistribution(c: DistributionConfig): string[] {
  const errors: string[] = [];
  const memberIds = new Set(c.members.map((m) => m.user_id));
  if (c.active && c.members.length === 0) errors.push("Adicione pelo menos um vendedor à roleta.");
  if (c.max_open_per_seller !== null && (!Number.isInteger(c.max_open_per_seller) || c.max_open_per_seller < 1)) {
    errors.push("O limite de negócios abertos deve ser um número inteiro maior que zero.");
  }
  if (c.mode === "by_rule") {
    if (c.active && c.rules.length === 0) errors.push("Crie pelo menos uma regra.");
    c.rules.forEach((r, i) => {
      if (!r.value.trim()) errors.push(`Regra ${i + 1}: informe o valor.`);
      else if (r.user_ids.length === 0) errors.push(`Regra ${i + 1}: escolha quem recebe.`);
      else if (r.user_ids.some((u) => !memberIds.has(u))) errors.push(`Regra ${i + 1}: o grupo tem quem não está na roleta.`);
    });
  }
  return errors;
}

export function toSavePayload(c: DistributionConfig) {
  return {
    active: c.active,
    mode: c.mode,
    members: c.members,
    rules: c.rules.map((r) => ({ ...r, value: r.value.trim() })),
    max_open_per_seller: c.max_open_per_seller,
    skip_away: c.skip_away,
  };
}

export function distributionErrorMessage(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  const rule = msg.match(/invalid_rule_(field|value|group):(\d+)/);
  if (rule) {
    const n = rule[2];
    if (rule[1] === "field") return `Regra ${n}: campo inválido.`;
    if (rule[1] === "value") return `Regra ${n}: informe o valor.`;
    return `Regra ${n}: o grupo tem quem não está na roleta.`;
  }
  if (/member_not_in_team/.test(msg)) return "Um dos vendedores escolhidos não é da equipe.";
  if (/no_members/.test(msg)) return "Adicione pelo menos um vendedor à roleta.";
  if (/no_rules/.test(msg)) return "Crie pelo menos uma regra.";
  if (/invalid_max_open/.test(msg)) return "O limite de negócios abertos deve ser um número inteiro maior que zero.";
  if (/too_many_rules/.test(msg)) return "No máximo 30 regras.";
  if (/pipeline_not_found/.test(msg)) return "Pipeline não encontrado.";
  return "Não foi possível salvar a distribuição.";
}
