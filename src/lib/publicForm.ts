// Sprint 11 · Onda 4 · T45 — the pure parts of the public form of a record.
//
// A table chooses which of its fields go in the form ("Dados para Contrato");
// each record gets a link (/f/:token) the client fills without logging in. Here:
// which fields a form can hold (the twin of _crm_form_field_types), reading the
// table's configuration, the state of a record's link, and the words for the
// errors the server gives back.

import type { CustomTableColumn } from "@/hooks/useCustomTables";

export const FORM_FIELD_TYPES = [
  "text",
  "number",
  "currency",
  "date",
  "boolean",
  "select",
  "multi_select",
  "url",
  "phone",
] as const;

export interface FormConfigField {
  field_id: string;
  required: boolean;
}

export interface FormConfig {
  enabled: boolean;
  title: string;
  intro: string;
  fields: FormConfigField[];
}

export const EMPTY_FORM_CONFIG: FormConfig = { enabled: false, title: "", intro: "", fields: [] };

/** The columns a public form can ask for (no people, relations, lookups or files). */
export function formEligibleColumns(columns: CustomTableColumn[]): CustomTableColumn[] {
  return columns.filter((c) => !c.is_deleted && (FORM_FIELD_TYPES as readonly string[]).includes(c.type));
}

export function normalizeFormConfig(raw: unknown): FormConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const fields = Array.isArray(r.fields)
    ? r.fields
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && typeof (f as { field_id?: unknown }).field_id === "string")
        .map((f) => ({ field_id: f.field_id as string, required: f.required === true }))
    : [];
  return {
    enabled: r.enabled === true,
    title: typeof r.title === "string" ? r.title : "",
    intro: typeof r.intro === "string" ? r.intro : "",
    fields,
  };
}

export const formIsOn = (config: FormConfig | null | undefined) => !!config?.enabled && config.fields.length > 0;

export function publicFormUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/f/${token}`;
}

export interface FormLinkRow {
  created_at: string;
  expires_at: string;
  submitted_at: string | null;
  revoked_at: string | null;
}

export type FormLinkState = "none" | "open" | "submitted" | "expired";

/** The record's latest link: none yet, waiting for the client, answered, or run out. */
export function formLinkState(link: FormLinkRow | null | undefined, now: Date = new Date()): FormLinkState {
  if (!link || link.revoked_at) return "none";
  if (link.submitted_at) return "submitted";
  if (new Date(link.expires_at) <= now) return "expired";
  return "open";
}

/** What the page says when the server refuses the form. */
export function publicFormErrorText(error: string | undefined, fieldLabel?: string): string {
  switch (error) {
    case "required":
      return fieldLabel ? `Preencha “${fieldLabel}”.` : "Preencha os campos obrigatórios.";
    case "invalid_field":
      return fieldLabel ? `Confira “${fieldLabel}”: o valor não é válido.` : "Algum valor não é válido.";
    case "form_submitted":
      return "Este formulário já foi enviado. Obrigado!";
    case "form_expired":
    case "form_revoked":
      return "Este link não vale mais. Peça um novo a quem enviou.";
    case "form_not_found":
      return "Formulário não encontrado. Confira o link.";
    default:
      return "Não foi possível enviar agora. Tente de novo em instantes.";
  }
}
