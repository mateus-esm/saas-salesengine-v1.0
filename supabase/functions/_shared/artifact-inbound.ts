// SE-DOCPIPE-001 — the pure parts of `artifact-inbound`.
//
// The callback (artifact-callback) answers ONE click, with its token. This is the
// other door, for what arrives outside a click: the Clicksign says a contract
// was signed after the token expired, the n8n re-syncs a status, a record is
// updated "by ID" like it was on the Jestor. It is authenticated by the tenant
// (x-webhook-secret, the same secret of crm-webhook) and idempotent by a
// mandatory `event_id`.
//
// Two actions:
//   update    — { record_id | match: { key, value, table_id? }, event_id, status?, fields?, files? }
//   file_url  — { path } → a short signed URL of an artifact file, so the n8n can
//               fetch the proposal PDF to merge it with the contract. Also
//               accepts the callback `token` of an open run instead of the secret.

import { MAX_FILES, parseEventId, type CallbackFile } from "./artifact-callback.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export interface InboundUpdate {
  action: "update";
  eventId: string;
  recordId: string | null;
  match: { key: string; value: string; tableId: string | null } | null;
  status: string | null;
  fields: Record<string, unknown>;
  files: CallbackFile[];
}

export interface InboundFileUrl {
  action: "file_url";
  path: string;
  /** The callback token of an open run (instead of the tenant secret). */
  token: string | null;
}

export type InboundRequest = InboundUpdate | InboundFileUrl;

export function parseInboundRequest(raw: unknown): { ok: true; req: InboundRequest } | { ok: false; error: string } {
  if (!isObject(raw)) return { ok: false, error: "body_must_be_object" };
  const action = raw.action ?? "update";

  if (action === "file_url") {
    const path = typeof raw.path === "string" ? raw.path.trim() : "";
    if (!path) return { ok: false, error: "path_required" };
    const token = typeof raw.token === "string" && /^[0-9a-f]{64}$/.test(raw.token.trim()) ? raw.token.trim() : null;
    return { ok: true, req: { action, path, token } };
  }
  if (action !== "update") return { ok: false, error: "unknown_action" };

  const eventId = parseEventId(raw.event_id);
  if (eventId === false) return { ok: false, error: "event_id_invalid" };
  if (!eventId) return { ok: false, error: "event_id_required" };

  let recordId: string | null = null;
  let match: InboundUpdate["match"] = null;
  if (raw.record_id !== undefined && raw.record_id !== null) {
    if (typeof raw.record_id !== "string" || !UUID.test(raw.record_id.trim())) return { ok: false, error: "record_id_invalid" };
    recordId = raw.record_id.trim();
  } else if (isObject(raw.match)) {
    const key = typeof raw.match.key === "string" ? raw.match.key.trim() : "";
    const rawValue = raw.match.value;
    const value = typeof rawValue === "string" ? rawValue.trim() : typeof rawValue === "number" ? String(rawValue) : "";
    const tableId = raw.match.table_id;
    if (!key || !value) return { ok: false, error: "match_needs_key_and_value" };
    if (tableId !== undefined && tableId !== null && (typeof tableId !== "string" || !UUID.test(tableId))) {
      return { ok: false, error: "table_id_invalid" };
    }
    match = { key, value, tableId: (tableId as string | undefined) ?? null };
  } else {
    return { ok: false, error: "record_required" };
  }

  const status = raw.status === undefined || raw.status === null ? null : raw.status;
  if (status !== null && typeof status !== "string") return { ok: false, error: "status_must_be_text" };

  const fields = raw.fields === undefined || raw.fields === null ? {} : raw.fields;
  if (!isObject(fields)) return { ok: false, error: "fields_must_be_object" };

  const rawFiles = raw.files === undefined || raw.files === null ? [] : raw.files;
  if (!Array.isArray(rawFiles)) return { ok: false, error: "files_must_be_list" };
  if (rawFiles.length > MAX_FILES) return { ok: false, error: "too_many_files" };
  const files: CallbackFile[] = [];
  for (const f of rawFiles) {
    if (!isObject(f) || typeof f.url !== "string" || !f.url.trim()) return { ok: false, error: "file_needs_url" };
    files.push({
      url: f.url.trim(),
      ...(typeof f.name === "string" && f.name.trim() ? { name: f.name.trim() } : {}),
      ...(typeof f.field === "string" && f.field.trim() ? { field: f.field.trim() } : {}),
    });
  }

  if (status === null && Object.keys(fields).length === 0 && files.length === 0) return { ok: false, error: "nothing_to_apply" };
  return { ok: true, req: { action, eventId, recordId, match, status: status as string | null, fields, files } };
}

/**
 * A path the tenant may read: inside its own folder of the bucket
 * (`<equipe_id>/<table>/<record>/<file>`), never climbing out of it.
 */
export function isTenantArtifactPath(path: string, equipeId: string): boolean {
  if (!equipeId || !path.startsWith(`${equipeId}/`)) return false;
  if (path.includes("\\") || path.includes("//")) return false;
  return !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

/** A database error → { status, error } for the automation. */
export function inboundError(message: string): { status: number; error: string } {
  const known: [string, number][] = [
    ["event_id_required", 400],
    ["record_required", 400],
    ["record_not_found", 404],
    ["record_ambiguous", 409],
    ["event_in_progress", 409],
    ["event_id_reused", 409],
    ["invalid_artifact_status", 422],
    ["invalid_file_field", 422],
    ["event_not_claimed", 409],
  ];
  const hit = known.find(([code]) => message.includes(code));
  return hit ? { status: hit[1], error: hit[0] } : { status: 500, error: "internal_error" };
}
