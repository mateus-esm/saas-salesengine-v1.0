import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ColumnDef, ColumnKind } from "./types";

export interface ColumnTypeHandler {
  kind: ColumnKind;
  menuLabel: string;
  implemented: boolean;
  format: (value: unknown, col: ColumnDef) => string;
  parse: (raw: string, col: ColumnDef) => unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the display label for a select option value. */
function selectLabel(value: unknown, col: ColumnDef): string {
  if (!col.options) return String(value ?? "");
  const match = col.options.find((o) => o.value === value);
  return match?.label ?? String(value ?? "");
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const COLUMN_TYPES: Record<ColumnKind, ColumnTypeHandler> = {
  // -- implemented kinds ---------------------------------------------------
  text: {
    kind: "text",
    menuLabel: "Texto",
    implemented: true,
    format: (value, _col) => String(value ?? ""),
    parse: (raw, _col) => raw,
  },

  number: {
    kind: "number",
    menuLabel: "Número",
    implemented: true,
    format: (value, _col) => {
      if (value == null) return "";
      const n = Number(value);
      if (Number.isNaN(n)) return "";
      return n.toLocaleString("pt-BR");
    },
    parse: (raw, _col) => {
      const n = Number(raw);
      return Number.isNaN(n) ? null : n;
    },
  },

  select: {
    kind: "select",
    menuLabel: "Seleção",
    implemented: true,
    format: (value, col) => selectLabel(value, col),
    parse: (raw, _col) => raw,
  },

  date: {
    kind: "date",
    menuLabel: "Data",
    implemented: true,
    format: (value, _col) => {
      if (value == null) return "";
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return "";
      return format(d, "dd/MM/yyyy", { locale: ptBR });
    },
    parse: (raw, _col) => {
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    },
  },

  boolean: {
    kind: "boolean",
    menuLabel: "Sim/Não",
    implemented: true,
    format: (value, _col) =>
      value === true || value === "true" || value === "Sim"
        ? "Sim"
        : value === false || value === "false" || value === "Não"
          ? "Não"
          : "",
    parse: (raw, _col) => raw === "true" || raw === "Sim",
  },

  relation: {
    kind: "relation",
    menuLabel: "Relacionamento",
    implemented: true,
    format: (value, _col) => String(value ?? ""),
    parse: (raw, _col) => raw,
  },

  // -- v2 extensibility slots (not implemented) ----------------------------
  formula: {
    kind: "formula",
    menuLabel: "Formula (em breve)",
    implemented: false,
    format: (value, _col) => String(value ?? ""),
    parse: (raw, _col) => raw,
  },

  rollup: {
    kind: "rollup",
    menuLabel: "Rollup (em breve)",
    implemented: false,
    format: (value, _col) => String(value ?? ""),
    parse: (raw, _col) => raw,
  },

  conditional: {
    kind: "conditional",
    menuLabel: "Condicional (em breve)",
    implemented: false,
    format: (value, _col) => String(value ?? ""),
    parse: (raw, _col) => raw,
  },
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function getHandler(kind: ColumnKind): ColumnTypeHandler {
  const handler = COLUMN_TYPES[kind];
  if (!handler) {
    throw new Error(`Unknown column kind: "${kind}"`);
  }
  return handler;
}
