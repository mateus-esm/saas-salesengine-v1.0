// SE-SUP1-7 (#6) — the pure parts of the intake forms ("Formulário de Indicação").
//
// A form is a list of fields; each field says WHERE its answer goes (the target).
// The database validates and applies it (_crm_intake_submit / _crm_forms_validate);
// these are the twins the builder and the public page use to fail fast. Keep the
// types, targets and rules in lockstep with 20261015000600_sesup1_intake_forms.sql.

export const INTAKE_FIELD_TYPES = ["text", "textarea", "phone", "email", "number", "date", "select", "boolean"] as const;
export type IntakeFieldType = (typeof INTAKE_FIELD_TYPES)[number];

export const INTAKE_FIELD_TYPE_LABELS: Record<IntakeFieldType, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  phone: "Telefone",
  email: "E-mail",
  number: "Número",
  date: "Data",
  select: "Lista de opções",
  boolean: "Sim/Não",
};

/** 'custom:<field_id>' writes to opportunities.custom_data[field_id]. */
export type IntakeTarget =
  | "lead.name"
  | "lead.phone"
  | "lead.email"
  | "lead.observations"
  | "attribution.indicated_by"
  | `custom:${string}`;

export const LEAD_TARGETS: { value: IntakeTarget; label: string }[] = [
  { value: "lead.name", label: "Nome do contato" },
  { value: "lead.phone", label: "Telefone do contato" },
  { value: "lead.email", label: "E-mail do contato" },
  { value: "lead.observations", label: "Observações do contato" },
  { value: "attribution.indicated_by", label: "Indicado por (origem)" },
];

export interface IntakeField {
  key: string;
  label: string;
  type: IntakeFieldType;
  required: boolean;
  target: IntakeTarget;
  options?: string[];
}

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const CUSTOM_RE = /^custom:[0-9a-fA-F-]{36}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIXED_TARGETS = new Set<string>(LEAD_TARGETS.map((t) => t.value));

export const isValidTarget = (t: string): boolean => FIXED_TARGETS.has(t) || CUSTOM_RE.test(t);

/** Twin of _crm_is_valid_date: the shape AND a real calendar day (2026-13-45 is not). */
export const isValidIsoDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};

/** Mirrors the cap in _crm_forms_validate. */
export const MAX_INTAKE_FIELDS = 40;

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Twin of normalize_phone_br's "is it a phone" gate: at least 8 digits after the zeros. */
const looksLikePhone = (v: string) => v.replace(/\D/g, "").replace(/^0+/, "").length >= 8;

/** The public page never learns the target: it validates required + type, the server owns the rest. */
export type IntakeFieldView = Omit<IntakeField, "target"> & { target?: IntakeTarget };

export function validateIntakeValues(
  fields: IntakeFieldView[],
  values: Record<string, unknown>,
): { key: string; message: string }[] {
  const errors: { key: string; message: string }[] = [];
  let hasContact = false;
  let contactKey: string | null = null;
  for (const field of fields) {
    const v = values[field.key];
    const isContact = field.target === "lead.phone" || field.target === "lead.email";
    if (isContact && contactKey === null) contactKey = field.key;
    if (isEmpty(v)) {
      if (field.required || field.target === "lead.name") errors.push({ key: field.key, message: `${field.label} é obrigatório` });
      continue;
    }
    const s = String(v).trim();
    if (isContact) hasContact = true;
    const bad =
      (field.type === "email" && !EMAIL_RE.test(s)) ||
      (field.type === "phone" && !looksLikePhone(s)) ||
      (field.type === "number" && !/^-?[0-9]+([.,][0-9]+)?$/.test(s)) ||
      (field.type === "date" && !isValidIsoDate(s)) ||
      (field.type === "select" && !(field.options ?? []).includes(s));
    if (bad) errors.push({ key: field.key, message: `${field.label}: valor inválido` });
  }
  if (errors.length === 0 && !hasContact && contactKey) {
    const label = fields.find((x) => x.key === contactKey)?.label ?? "Contato";
    errors.push({ key: contactKey, message: `Informe o telefone ou o e-mail (${label})` });
  }
  return errors;
}

/** What the builder checks before saving; mirrors _crm_forms_validate. */
export function validateIntakeDefinition(fields: IntakeField[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (fields.length > MAX_INTAKE_FIELDS) problems.push(`No máximo ${MAX_INTAKE_FIELDS} campos por formulário`);
  for (const field of fields) {
    if (!KEY_RE.test(field.key) || field.key === "_hp") problems.push(`Chave inválida: ${field.key || "(vazia)"}`);
    if (seen.has(field.key)) problems.push(`Chave repetida: ${field.key}`);
    seen.add(field.key);
    if (!field.label.trim()) problems.push(`O campo ${field.key} precisa de um nome`);
    if (!isValidTarget(field.target)) problems.push(`Destino inválido em ${field.label || field.key}`);
    if (field.type === "select" && (field.options ?? []).length === 0) problems.push(`${field.label}: informe as opções`);
  }
  if (fields.filter((x) => x.target === "lead.name").length !== 1) problems.push("Precisa de exatamente um campo de nome do contato");
  if (!fields.some((x) => x.target === "lead.phone" || x.target === "lead.email")) {
    problems.push("Precisa de um campo de telefone ou e-mail");
  }
  return problems;
}

export const slugify = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "formulario";

export const intakeFormUrl = (origin: string, token: string) => `${origin}/f/${token}`;

export interface IntakePreset {
  id: string;
  name: string;
  title: string;
  description: string;
  originLabel: string;
  originCategory: string;
  fields: IntakeField[];
}

/** "Formulário de Indicação": who is indicated, how to reach them, and who indicated. */
export const INDICACAO_PRESET: IntakePreset = {
  id: "indicacao",
  name: "Formulário de Indicação",
  title: "Indique alguém para a gente",
  description: "Conte quem você indica e como falar com a pessoa. A equipe entra em contato.",
  originLabel: "Formulário: Indicação",
  originCategory: "referral",
  fields: [
    { key: "nome", label: "Nome de quem você indica", type: "text", required: true, target: "lead.name" },
    { key: "telefone", label: "Telefone (WhatsApp)", type: "phone", required: true, target: "lead.phone" },
    { key: "email", label: "E-mail", type: "email", required: false, target: "lead.email" },
    { key: "indicado_por", label: "Seu nome (quem indica)", type: "text", required: true, target: "attribution.indicated_by" },
    { key: "observacoes", label: "Observações", type: "textarea", required: false, target: "lead.observations" },
  ],
};

export const INTAKE_PRESETS: IntakePreset[] = [INDICACAO_PRESET];
