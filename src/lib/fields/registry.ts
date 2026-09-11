// Sprint 11 · Onda 2 · T15 — the field-type registry (motor de Modelo v1).
//
// One module per field type says how to show it, how to read what the user typed,
// what "empty" means, which filter operators it accepts and how it sorts. The
// grid, the Kanban card and the filter bar read from here; the server has the
// twin in SQL (`_crm_is_empty`, `_crm_custom_matches`, the cf: sort of
// `crm_opp_table`). A new field type is added HERE — never as a `switch` in a
// screen. That is what broke the tables: each screen handled types its own way,
// so a Select column had no options and a multi-select was saved as text.

import { formatBrPhone } from "@/lib/displayName";
import type { CustomFieldFilterOp } from "@/types/crmFilters";
import type { AddressValue, CustomFieldType } from "@/types/pipelines";

import { formatFieldDate, fromDateInputValue } from "./dateOnly";

export type FieldType = CustomFieldType;

/** Which inline editor the grid mounts for the type; null = edit in the modal. */
export type InlineEditor =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "select"
  | "multi_select"
  | "url"
  | "phone"
  | "user";

export interface FieldContext {
  /** select / multi_select */
  options?: string[];
  /** user: the member's name, or null when the id is not a member. */
  nameOf?: (userId: string) => string | null;
}

export interface FieldTypeSpec {
  type: FieldType;
  /** PT-BR, shown in the field editors. */
  label: string;
  /** Text for the grid, the card and exports. Never throws. */
  format(value: unknown, ctx?: FieldContext): string;
  /** From what the user typed in an inline editor to what is stored. */
  parse(raw: string, ctx?: FieldContext): unknown;
  /** The same empty as the SQL: absent, null, blank text, [] or {}. */
  isEmpty(value: unknown): boolean;
  /** The operators the server accepts for this type. */
  filterOps: CustomFieldFilterOp[];
  /** How crm_opp_table sorts a cf: key of this type; null = not sortable. */
  sortAs: "number" | "date" | "text" | null;
  inlineEdit: InlineEditor | null;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Date) return false;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * Reads a number written the Brazilian way ("1.234,56", "R$ 1.234,56") or the
 * machine way ("1234.56"). A dot with exactly three digits after it and no comma
 * ("1.234") is a thousands separator.
 */
export function parseBrNumber(raw: string): number | null {
  let text = String(raw ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") return parseBrNumber(value);
  return null;
};

const plainText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(", ");
  if (typeof value === "object") return fileLabel(value);
  return String(value);
};

const trimmedOrNull = (raw: string) => {
  const text = String(raw ?? "").trim();
  return text ? text : null;
};

function fileLabel(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(fileLabel).filter(Boolean).join(", ");
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  const record = value as Record<string, unknown>;
  const named = record.name ?? record.label ?? record.title ?? record.file_name;
  if (typeof named === "string" && named.trim()) return named;
  const url = typeof record.url === "string" ? record.url : typeof record.path === "string" ? record.path : null;
  if (url) {
    const clean = url.split("?")[0]?.split("#")[0] ?? url;
    const last = clean.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "Arquivo anexado";
  }
  return Object.keys(record).length ? "Arquivo anexado" : "";
}

function addressLabel(value: unknown): string {
  if (!value || typeof value !== "object") return plainText(value);
  const a = value as AddressValue;
  const line1 = [a.street, a.number].filter(Boolean).join(", ");
  const cityState = a.city && a.state ? `${a.city}/${a.state}` : a.city || a.state || "";
  return [line1, a.neighborhood, cityState].filter(Boolean).join(" – ");
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PT_NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

const TEXT_OPS: CustomFieldFilterOp[] = ["contains", "empty", "not_empty"];
const LIST_OPS: CustomFieldFilterOp[] = ["any_of", "empty", "not_empty"];
const NUMBER_OPS: CustomFieldFilterOp[] = ["between_number", "empty", "not_empty"];
const PRESENCE_OPS: CustomFieldFilterOp[] = ["empty", "not_empty"];

const spec = (s: Omit<FieldTypeSpec, "isEmpty"> & Partial<Pick<FieldTypeSpec, "isEmpty">>): FieldTypeSpec => ({
  isEmpty: isEmptyValue,
  ...s,
});

const refSpec = (type: FieldType, label: string) =>
  spec({
    type,
    label,
    format: (v) => (isEmptyValue(v) ? "" : "Vinculado"),
    parse: trimmedOrNull,
    filterOps: PRESENCE_OPS,
    sortAs: null,
    inlineEdit: null,
  });

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const FIELD_TYPES: readonly FieldTypeSpec[] = [
  spec({
    type: "text",
    label: "Texto",
    format: plainText,
    parse: trimmedOrNull,
    filterOps: TEXT_OPS,
    sortAs: "text",
    inlineEdit: "text",
  }),
  spec({
    type: "number",
    label: "Número",
    format: (v) => {
      const n = toNumber(v);
      return n === null ? plainText(v) : PT_NUMBER.format(n);
    },
    parse: (raw) => parseBrNumber(raw),
    filterOps: NUMBER_OPS,
    sortAs: "number",
    inlineEdit: "number",
  }),
  spec({
    type: "currency",
    label: "Moeda (R$)",
    format: (v) => {
      const n = toNumber(v);
      return n === null ? plainText(v) : BRL.format(n).replace(/\u00a0/g, " ");
    },
    parse: (raw) => parseBrNumber(raw),
    filterOps: NUMBER_OPS,
    sortAs: "number",
    inlineEdit: "currency",
  }),
  spec({
    type: "date",
    label: "Data",
    format: (v) => formatFieldDate(v),
    parse: (raw) => fromDateInputValue(raw),
    filterOps: ["between_date", "empty", "not_empty"],
    sortAs: "date",
    inlineEdit: "date",
  }),
  spec({
    type: "boolean",
    label: "Sim/Não",
    format: (v) => {
      if (v === true) return "Sim";
      if (v === false) return "Não";
      const text = typeof v === "string" ? v.trim().toLowerCase() : "";
      if (text === "true" || text === "sim") return "Sim";
      if (text === "false" || text === "não" || text === "nao") return "Não";
      return "";
    },
    parse: (raw) => {
      const text = String(raw ?? "").trim().toLowerCase();
      if (text === "true" || text === "sim") return true;
      if (text === "false" || text === "não" || text === "nao") return false;
      return null;
    },
    // A boolean false is a value, not an empty field.
    isEmpty: (v) => v === null || v === undefined || v === "",
    filterOps: ["is_true", "is_false", "empty"],
    sortAs: null,
    inlineEdit: "boolean",
  }),
  spec({
    type: "select",
    label: "Seleção",
    format: plainText,
    parse: trimmedOrNull,
    filterOps: LIST_OPS,
    sortAs: "text",
    inlineEdit: "select",
  }),
  spec({
    type: "multi_select",
    label: "Multi-seleção",
    format: plainText,
    parse: (raw) => {
      const items = String(raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return items.length ? items : null;
    },
    filterOps: LIST_OPS,
    sortAs: null,
    inlineEdit: "multi_select",
  }),
  spec({
    type: "url",
    label: "Link (URL)",
    format: plainText,
    parse: trimmedOrNull,
    filterOps: TEXT_OPS,
    sortAs: "text",
    inlineEdit: "url",
  }),
  spec({
    type: "phone",
    label: "Telefone",
    format: (v) => (isEmptyValue(v) ? "" : formatBrPhone(String(v)) ?? String(v)),
    parse: trimmedOrNull,
    filterOps: TEXT_OPS,
    sortAs: "text",
    inlineEdit: "phone",
  }),
  spec({
    type: "user",
    label: "Usuário (membro da equipe)",
    format: (v, ctx) => {
      if (isEmptyValue(v)) return "";
      const id = String(v);
      return ctx?.nameOf?.(id) ?? "Usuário removido";
    },
    parse: trimmedOrNull,
    filterOps: LIST_OPS,
    sortAs: null,
    inlineEdit: "user",
  }),
  spec({
    type: "address",
    label: "Endereço",
    format: addressLabel,
    parse: trimmedOrNull,
    filterOps: PRESENCE_OPS,
    sortAs: null,
    inlineEdit: null,
  }),
  spec({
    type: "file",
    label: "Arquivo",
    format: fileLabel,
    parse: trimmedOrNull,
    filterOps: PRESENCE_OPS,
    sortAs: null,
    inlineEdit: null,
  }),
  refSpec("property_ref", "Imóvel"),
  refSpec("company_ref", "Empresa"),
  refSpec("contact_ref", "Contato"),
];

const BY_TYPE = new Map<string, FieldTypeSpec>(FIELD_TYPES.map((s) => [s.type, s]));

export function isFieldType(type: string | null | undefined): type is FieldType {
  return !!type && BY_TYPE.has(type);
}

/** The spec of a type; an unknown type is treated as text (never throws). */
export function getFieldType(type: string | null | undefined): FieldTypeSpec {
  return (type && BY_TYPE.get(type)) || BY_TYPE.get("text")!;
}
