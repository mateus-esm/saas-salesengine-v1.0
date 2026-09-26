// Sprint 11 · Onda 4 · T44 — the pure parts of the artifact callback (contract v1).
//
// The n8n (or any automation) answers an artifact action by POSTing to the
// `artifact-callback` edge function with the one-time token it received. Here:
// read the body, check it against what the database says the record accepts
// (before downloading anything), decide where each file goes and whether a URL
// may be fetched at all. The storage-path rule is the twin of
// src/lib/artifactFiles.ts (Deno does not import from src/).

export const ARTIFACT_BUCKET = "artifacts";
export const ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 10;

export interface CallbackFile {
  url: string;
  name?: string;
  /** The key of the file column; the first file column when absent. */
  field?: string;
}

export interface CallbackBody {
  token: string;
  status: string | null;
  fields: Record<string, unknown>;
  files: CallbackFile[];
  /** The automation says it failed: the run is closed as failed, nothing applied. */
  error: string | null;
  /** More answers will come (contract sent now, signed later): the token stays valid. */
  keepOpen: boolean;
  /**
   * SE-DOCPIPE-001 — the id of the event being answered (the Clicksign event,
   * the n8n execution). The same id twice in one run is applied once.
   */
  eventId: string | null;
}

/** What `_crm_artifact_callback_claim` returns. */
export interface CallbackClaim {
  run_id: string;
  equipe_id: string;
  table_id: string;
  record_id: string;
  statuses: string[];
  writable_keys: string[];
  file_columns: { field_id: string; key: string }[];
}

type Parsed = { ok: true; body: CallbackBody } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseCallbackBody(raw: unknown): Parsed {
  if (!isObject(raw)) return { ok: false, error: "body_must_be_object" };
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "token_required" };

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

  const error = typeof raw.error === "string" && raw.error.trim() ? raw.error.trim() : null;
  const keepOpen = raw.keep_open === true;
  const eventId = parseEventId(raw.event_id);
  if (eventId === false) return { ok: false, error: "event_id_invalid" };
  return { ok: true, body: { token, status: status as string | null, fields, files, error, keepOpen, eventId } };
}

/** An event id: text (or a number, as n8n sends ids), up to 200 characters. `false` = unusable. */
export function parseEventId(raw: unknown): string | null | false {
  if (raw === undefined || raw === null) return null;
  const text = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : typeof raw === "string" ? raw.trim() : null;
  if (text === null || text.length > 200) return false;
  return text || null;
}

/** The file column a file goes to: the one named, or the table's first. */
export function resolveFileField(file: CallbackFile, claim: Pick<CallbackClaim, "file_columns">): string | null {
  if (file.field) return claim.file_columns.find((c) => c.key === file.field)?.field_id ?? null;
  return claim.file_columns[0]?.field_id ?? null;
}

/**
 * What in the body the record cannot take — checked before any download. Fields
 * the record does not write (lookups, relations, unknown keys) are not an
 * error: the database ignores them and says so in the answer.
 */
export function checkAgainstClaim(
  body: Pick<CallbackBody, "status" | "files" | "error">,
  claim: Pick<CallbackClaim, "statuses" | "file_columns">,
): string | null {
  if (body.error) return null;
  if (body.status !== null && !claim.statuses.includes(body.status)) return "invalid_artifact_status";
  for (const f of body.files) {
    if (!resolveFileField(f, claim)) return "invalid_file_field";
    if (!isSafeDownloadUrl(f.url)) return "unsafe_file_url";
  }
  return null;
}

const PRIVATE_V4 = [
  /^127\./, /^10\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/** Only https, and never a name or address inside a private network. */
export function isSafeDownloadUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return !PRIVATE_V4.some((re) => re.test(host));
  if (host.includes(":")) {
    // IPv6 literal: loopback, link-local, unique-local and v4-mapped are out.
    return !(host === "::1" || host === "::" || /^fe[89ab]/.test(host) || /^f[cd]/.test(host) || host.startsWith("::ffff:"));
  }
  return true;
}

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** The file's name: the one sent, else the response's, else the URL's last part. */
export function fileNameFrom(url: string, contentDisposition: string | null, contentType: string | null, given?: string): string {
  if (given) return given;
  const cd = contentDisposition ?? "";
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(cd);
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
  let name = "";
  try {
    name = star ? decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")) : plain ? plain[1].trim() : "";
  } catch {
    name = plain ? plain[1].trim() : "";
  }
  if (!name) {
    try {
      name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
    } catch {
      name = "";
    }
  }
  if (!name) name = "arquivo";
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!/\.[a-z0-9]{1,8}$/i.test(name) && EXT_BY_TYPE[type]) name = `${name}.${EXT_BY_TYPE[type]}`;
  return name;
}

// ---- download and store (the callback and artifact-inbound) -----------------

export interface UploadedFile {
  field_id: string;
  path: string;
  name: string;
  size: number;
  type: string | null;
}

/** Where the files of one answer go. */
export type FileTarget = Pick<CallbackClaim, "equipe_id" | "table_id" | "record_id" | "file_columns">;

// Redirects are followed by hand (file hosts hand out signed links), each hop
// checked like the first: a redirect must not lead into a private network.
export async function downloadArtifactFile(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; type: string | null; disposition: string | null }> {
  let current = url;
  let res: Response | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    if (!isSafeDownloadUrl(current)) throw new Error("unsafe_file_url");
    res = await fetchFn(current, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current).toString();
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw new Error("too_many_redirects");
  if (!res.ok) throw new Error(`download_failed:${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > ARTIFACT_MAX_BYTES) throw new Error("file_too_large");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > ARTIFACT_MAX_BYTES) throw new Error("file_too_large");
  return { bytes, type: res.headers.get("content-type"), disposition: res.headers.get("content-disposition") };
}

/**
 * Download each file into the private bucket. On any failure what already went
 * up comes down, and the error is thrown (the caller releases its claim).
 */
export async function storeArtifactFiles(
  // deno-lint-ignore no-explicit-any
  db: any,
  files: CallbackFile[],
  target: FileTarget,
  fetchFn: typeof fetch = fetch,
): Promise<UploadedFile[]> {
  const uploaded: UploadedFile[] = [];
  try {
    for (const file of files) {
      const fieldId = resolveFileField(file, target)!;
      const { bytes, type, disposition } = await downloadArtifactFile(file.url, fetchFn);
      const name = fileNameFrom(file.url, disposition, type, file.name);
      const path = artifactFilePath(target.equipe_id, target.table_id, target.record_id, name);
      const contentType = type?.split(";")[0].trim() || undefined;
      const { error } = await db.storage.from(ARTIFACT_BUCKET).upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(`upload_failed:${error.message}`);
      uploaded.push({ field_id: fieldId, path, name, size: bytes.byteLength, type: contentType ?? null });
    }
    return uploaded;
  } catch (e) {
    await removeArtifactFiles(db, uploaded);
    throw e;
  }
}

// deno-lint-ignore no-explicit-any
export async function removeArtifactFiles(db: any, uploaded: UploadedFile[]): Promise<void> {
  if (uploaded.length) await db.storage.from(ARTIFACT_BUCKET).remove(uploaded.map((u) => u.path));
}

// ---- the storage path (twin of src/lib/artifactFiles.ts) --------------------

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

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

/** The HTTP status for an error the database raised. */
export function httpStatusFor(message: string): number {
  if (message.includes("token_invalid")) return 404;
  if (message.includes("token_used") || message.includes("token_expired")) return 410;
  if (message.includes("callback_in_progress")) return 409;
  if (message.includes("invalid_artifact_status") || message.includes("invalid_file_field") || message.includes("record_not_found")) {
    return 422;
  }
  return 500;
}

/** The short code of a database error ("token_used"), for the answer to the automation. */
export function errorCode(message: string): string {
  const known = [
    "token_invalid", "token_used", "token_expired", "callback_in_progress",
    "invalid_artifact_status", "invalid_file_field", "record_not_found", "run_not_claimed",
  ];
  return known.find((k) => message.includes(k)) ?? "internal_error";
}
