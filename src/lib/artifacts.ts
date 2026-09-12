// Sprint 11 · Onda 4 · T40 — the pure parts of the artifacts.
//
// An artifact (proposal, contract, document) is a record of a custom table marked
// as an artifact, held by a deal (custom_table_records.opportunity_id). These are
// the names the screens show and the rule that names a record.

import type { CustomTableColumn } from "@/hooks/useCustomTables";

import { formatLookup } from "./customTables";
import { getFieldType, type FieldContext } from "./fields/registry";

export type ArtifactKind = "proposal" | "contract" | "document";
export type ArtifactStatus = "draft" | "sent" | "accepted" | "signed" | "rejected";

export const ARTIFACT_KINDS: { value: ArtifactKind; label: string; plural: string }[] = [
  { value: "proposal", label: "Proposta", plural: "Propostas" },
  { value: "contract", label: "Contrato", plural: "Contratos" },
  { value: "document", label: "Documento", plural: "Documentos" },
];

export const ARTIFACT_STATUS_LABEL: Record<ArtifactStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  accepted: "Aceito",
  signed: "Assinado",
  rejected: "Recusado",
};

export const ARTIFACT_STATUS_STYLE: Record<ArtifactStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  signed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  rejected: "bg-destructive/10 text-destructive",
};

export function isArtifactKind(v: unknown): v is ArtifactKind {
  return v === "proposal" || v === "contract" || v === "document";
}

export function artifactKindLabel(kind: ArtifactKind | null | undefined, plural = false): string | null {
  const k = ARTIFACT_KINDS.find((x) => x.value === kind);
  return k ? (plural ? k.plural : k.label) : null;
}

/** Sprint 11 · T43 — the statuses each kind goes through (the twin of _crm_artifact_statuses). */
export function artifactStatusesFor(kind: ArtifactKind | null | undefined): ArtifactStatus[] {
  switch (kind) {
    case "proposal":
      return ["draft", "sent", "accepted", "rejected"];
    case "contract":
      return ["draft", "sent", "signed", "rejected"];
    case "document":
      return ["draft", "sent", "accepted", "signed", "rejected"];
    default:
      return [];
  }
}

const MILESTONE_LABEL: Record<string, string> = {
  proposal_sent: "Proposta enviada",
  contract_sent: "Contrato enviado",
  contract_signed: "Contrato assinado",
};

/** The deal's milestone a status proves (the twin of _crm_artifact_milestone), or null. */
export function artifactMilestone(kind: ArtifactKind | null | undefined, status: ArtifactStatus): string | null {
  if (kind === "proposal" && status === "sent") return "proposal_sent";
  if (kind === "contract" && status === "sent") return "contract_sent";
  if (kind === "contract" && status === "signed") return "contract_signed";
  return null;
}

export const milestoneLabel = (event: string | null | undefined) => (event ? MILESTONE_LABEL[event] ?? event : null);

/** A record of an artifact table with no status yet (made before the table was one) is a draft. */
export function artifactStatusOf(status: unknown): ArtifactStatus {
  return typeof status === "string" && Object.prototype.hasOwnProperty.call(ARTIFACT_STATUS_LABEL, status)
    ? (status as ArtifactStatus)
    : "draft";
}

/**
 * The name of a record: the first column (not a relation) that has a value,
 * written by its field type — a lookup by what it reads from the deal —; the
 * fallback when none has. `values` is recordValues(record): data and lookups.
 */
export function recordTitle(
  values: Record<string, unknown> | null | undefined,
  columns: CustomTableColumn[],
  context?: FieldContext,
  fallback = "Sem título",
): string {
  for (const col of columns) {
    if (col.is_deleted || col.type === "relation") continue;
    const v = values?.[col.field_id];
    let text: string;
    if (col.type === "lookup") {
      text = formatLookup(col.lookupConfig?.source, v);
    } else {
      const spec = getFieldType(col.type);
      if (spec.isEmpty(v)) continue;
      text = spec.format(v, { ...context, options: col.options });
    }
    if (text.trim()) return text.trim();
  }
  return fallback;
}
