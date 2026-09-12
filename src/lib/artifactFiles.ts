// Sprint 11 · Onda 4 · T42 — the pure parts of the file field.
//
// A file column keeps, in data[field_id], the list of its files: where each one
// lives in the private bucket `artifacts`, its name, size and type. Nothing here
// touches the network: the path rule (the team's folder first — it is what the
// Storage policy checks) and reading a stored value, whatever shape it came in.

import { slugify } from "./customFieldKeys";

export const ARTIFACT_BUCKET = "artifacts";
/** The bucket's limit (the migration's file_size_limit). */
export const ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;

export interface ArtifactFile {
  /** In the bucket: {equipe}/{table}/{record}/{id}-{name}. */
  path: string;
  name: string;
  size: number | null;
  type: string | null;
  uploaded_at: string | null;
  /** A file brought from elsewhere before the bucket (an import): opened by its link. */
  url?: string;
}

/** A name safe for a storage key: accents and spaces out, the extension kept. */
export function safeFileName(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const slug = slugify(base).replace(/_/g, "-").slice(0, 80) || "arquivo";
  return ext ? `${slug}.${ext}` : slug;
}

export function artifactFilePath(
  equipeId: string,
  tableId: string,
  recordId: string,
  fileName: string,
  id: string = crypto.randomUUID(),
): string {
  return `${equipeId}/${tableId}/${recordId}/${id}-${safeFileName(fileName)}`;
}

/** The files of a stored value: a list, one file, or an imported link. Anything else is none. */
export function filesOf(value: unknown): ArtifactFile[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const out: ArtifactFile[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const path = typeof f.path === "string" ? f.path : "";
    const url = typeof f.url === "string" ? f.url : undefined;
    if (!path && !url) continue;
    const fromLink = url ? decodeURIComponent(url.split("?")[0].split("/").filter(Boolean).pop() ?? "") : "";
    const name = typeof f.name === "string" && f.name.trim() ? f.name : path.split("/").pop() || fromLink || "Arquivo";
    out.push({
      path,
      name,
      size: typeof f.size === "number" ? f.size : null,
      type: typeof f.type === "string" ? f.type : null,
      uploaded_at: typeof f.uploaded_at === "string" ? f.uploaded_at : null,
      ...(url ? { url } : {}),
    });
  }
  return out;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
