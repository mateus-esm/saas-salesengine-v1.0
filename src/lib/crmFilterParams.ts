// Sprint 11 · Onda 2 · T17 — the CRM filters in the URL.
//
// Shareable (copy the link, the colleague sees the same board), and they survive
// a reload. Dates are local DAYS in the URL ("criado=2026-09-01..2026-09-30",
// the end day inclusive, as a person reads it) and ISO timestamps in the filter
// ([from, to), as the server compares them). `resp` is always the DEAL's owner —
// on the contact base too, since a contact has no owner of its own.
//
// Reading never throws: a param that does not parse is dropped, so a hand-edited
// or stale link degrades to "fewer filters", never to a broken screen.

import type {
  ContactFilters,
  ContactRelationship,
  CrmFilters,
  CrmSort,
  CustomFieldFilter,
  CustomFieldFilterOp,
  NextContactBucket,
} from "@/types/crmFilters";
import type { OpportunityStatus } from "@/types/pipelines";

/** Every param the filter bars own. A top-tab switch clears them all. */
export const FILTER_PARAM_KEYS = [
  "q", "criado", "resp", "etapa", "status", "origem", "tags", "valor", "prox", "cf", "situacao", "linha", "ordem",
] as const;

/** The filter params (not the sort): what writing a filter object replaces. */
const FILTER_ONLY_KEYS = FILTER_PARAM_KEYS.filter((k) => k !== "ordem");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const STATUSES: OpportunityStatus[] = ["open", "won", "lost"];
const BUCKETS: NextContactBucket[] = ["overdue", "today", "week", "none"];
const RELATIONSHIPS: ContactRelationship[] = ["sem_negocio", "negociando", "cliente", "perdido"];
const OPS: CustomFieldFilterOp[] = [
  "any_of", "contains", "between_number", "between_date", "is_true", "is_false", "empty", "not_empty",
];

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" → ISO of that local midnight; `endExclusive` → the next midnight. */
export function dayToIso(day: string, endExclusive = false): string | null {
  const m = DAY.exec((day ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  if (endExclusive) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

/** ISO → its local "YYYY-MM-DD"; `endExclusive` → the day before (the last day included). */
export function isoToDay(iso: string, endExclusive = false): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (endExclusive) date.setMilliseconds(date.getMilliseconds() - 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function writeDayRange(from?: string, to?: string): string | null {
  const a = from ? isoToDay(from) : null;
  const b = to ? isoToDay(to, true) : null;
  if (!a && !b) return null;
  return `${a ?? ""}..${b ?? ""}`;
}

function readDayRange(raw: string | null): { from?: string; to?: string } {
  if (!raw || !raw.includes("..")) return {};
  const [a, b] = raw.split("..");
  const out: { from?: string; to?: string } = {};
  const from = a ? dayToIso(a) : null;
  const to = b ? dayToIso(b, true) : null;
  if (from) out.from = from;
  if (to) out.to = to;
  return out;
}

// ---------------------------------------------------------------------------
// Lists and numbers
// ---------------------------------------------------------------------------

const writeList = (items: string[] | undefined) =>
  items && items.length ? items.map((i) => encodeURIComponent(i)).join(",") : null;

function readList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((i) => {
      try {
        return decodeURIComponent(i);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

const readIds = (raw: string | null, allowNone = false) =>
  readList(raw).filter((id) => UUID.test(id) || (allowNone && id === "none"));

function readNumberRange(raw: string | null): { from?: number; to?: number } {
  if (!raw || !raw.includes("..")) return {};
  const [a, b] = raw.split("..");
  const out: { from?: number; to?: number } = {};
  const num = (s: string) => (s !== "" && Number.isFinite(Number(s)) ? Number(s) : undefined);
  const from = num(a);
  const to = num(b);
  if (from !== undefined) out.from = from;
  if (to !== undefined) out.to = to;
  return out;
}

const writeNumberRange = (from?: number | string, to?: number | string) =>
  from === undefined && to === undefined ? null : `${from ?? ""}..${to ?? ""}`;

// ---------------------------------------------------------------------------
// Custom fields: cf=<field_id>~<op>~<payload>, repeatable
// ---------------------------------------------------------------------------

function writeCustom(f: CustomFieldFilter): string {
  let payload = "";
  switch (f.op) {
    case "any_of":
      payload = (f.values ?? []).map((v) => encodeURIComponent(v)).join("|");
      break;
    case "contains":
      payload = encodeURIComponent(f.value ?? "");
      break;
    case "between_number":
      payload = writeNumberRange(f.from, f.to) ?? "";
      break;
    case "between_date":
      payload = writeDayRange(f.from as string | undefined, f.to as string | undefined) ?? "";
      break;
    default:
      payload = "";
  }
  return `${f.field_id}~${f.op}~${payload}`;
}

function readCustom(raw: string): CustomFieldFilter | null {
  const first = raw.indexOf("~");
  const second = first < 0 ? -1 : raw.indexOf("~", first + 1);
  if (first < 0 || second < 0) return null;
  const field_id = raw.slice(0, first);
  const op = raw.slice(first + 1, second) as CustomFieldFilterOp;
  const payload = raw.slice(second + 1);
  if (!UUID.test(field_id) || !OPS.includes(op)) return null;

  const safe = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return "";
    }
  };

  switch (op) {
    case "any_of": {
      const values = payload.split("|").map(safe).filter(Boolean);
      return values.length ? { field_id, op, values } : null;
    }
    case "contains": {
      const value = safe(payload).trim();
      return value ? { field_id, op, value } : null;
    }
    case "between_number": {
      const r = readNumberRange(payload);
      return r.from === undefined && r.to === undefined ? null : { field_id, op, ...r };
    }
    case "between_date": {
      const r = readDayRange(payload);
      return !r.from && !r.to ? null : { field_id, op, ...r };
    }
    default:
      return { field_id, op };
  }
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

function setOrDelete(p: URLSearchParams, key: string, value: string | null | undefined) {
  if (value) p.set(key, value);
  else p.delete(key);
}

/** Writes the filters into `into` (replacing the old ones; other params kept). */
export function crmFiltersToParams(f: CrmFilters, into: URLSearchParams = new URLSearchParams()): URLSearchParams {
  for (const k of FILTER_ONLY_KEYS) into.delete(k);
  setOrDelete(into, "q", f.search?.trim());
  setOrDelete(into, "criado", writeDayRange(f.created_from, f.created_to));
  setOrDelete(into, "resp", writeList(f.owner_ids));
  setOrDelete(into, "etapa", writeList(f.stage_ids));
  setOrDelete(into, "status", writeList(f.statuses));
  setOrDelete(into, "origem", writeList(f.origin_categories));
  setOrDelete(into, "tags", writeList(f.tags));
  setOrDelete(into, "valor", writeNumberRange(f.value_min, f.value_max));
  setOrDelete(into, "prox", f.next_contact);
  for (const c of f.custom ?? []) into.append("cf", writeCustom(c));
  return into;
}

export function paramsToCrmFilters(p: URLSearchParams): CrmFilters {
  const f: CrmFilters = {};
  const q = p.get("q")?.trim();
  if (q) f.search = q;

  const created = readDayRange(p.get("criado"));
  if (created.from) f.created_from = created.from;
  if (created.to) f.created_to = created.to;

  const owners = readIds(p.get("resp"), true);
  if (owners.length) f.owner_ids = owners;
  const stages = readIds(p.get("etapa"));
  if (stages.length) f.stage_ids = stages;
  const statuses = readList(p.get("status")).filter((s): s is OpportunityStatus =>
    STATUSES.includes(s as OpportunityStatus),
  );
  if (statuses.length) f.statuses = statuses;
  const origins = readList(p.get("origem"));
  if (origins.length) f.origin_categories = origins;
  const tags = readList(p.get("tags"));
  if (tags.length) f.tags = tags;

  const value = readNumberRange(p.get("valor"));
  if (value.from !== undefined) f.value_min = value.from;
  if (value.to !== undefined) f.value_max = value.to;

  const prox = p.get("prox") as NextContactBucket | null;
  if (prox && BUCKETS.includes(prox)) f.next_contact = prox;

  const custom = p
    .getAll("cf")
    .map(readCustom)
    .filter((c): c is CustomFieldFilter => c !== null);
  if (custom.length) f.custom = custom;
  return f;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function contactFiltersToParams(
  f: ContactFilters,
  into: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  for (const k of FILTER_ONLY_KEYS) into.delete(k);
  setOrDelete(into, "q", f.search?.trim());
  setOrDelete(into, "criado", writeDayRange(f.created_from, f.created_to));
  setOrDelete(into, "origem", writeList(f.origin_categories));
  setOrDelete(into, "tags", writeList(f.tags));
  setOrDelete(into, "prox", f.next_contact);
  setOrDelete(into, "situacao", writeList(f.relationship));
  setOrDelete(into, "linha", writeList(f.pipeline_ids));
  setOrDelete(into, "resp", writeList(f.deal_owner_ids));
  return into;
}

export function paramsToContactFilters(p: URLSearchParams): ContactFilters {
  const f: ContactFilters = {};
  const q = p.get("q")?.trim();
  if (q) f.search = q;

  const created = readDayRange(p.get("criado"));
  if (created.from) f.created_from = created.from;
  if (created.to) f.created_to = created.to;

  const origins = readList(p.get("origem"));
  if (origins.length) f.origin_categories = origins;
  const tags = readList(p.get("tags"));
  if (tags.length) f.tags = tags;

  const prox = p.get("prox") as NextContactBucket | null;
  if (prox && BUCKETS.includes(prox)) f.next_contact = prox;

  const rel = readList(p.get("situacao")).filter((r): r is ContactRelationship =>
    RELATIONSHIPS.includes(r as ContactRelationship),
  );
  if (rel.length) f.relationship = rel;
  const pipelines = readIds(p.get("linha"));
  if (pipelines.length) f.pipeline_ids = pipelines;
  const owners = readIds(p.get("resp"), true);
  if (owners.length) f.deal_owner_ids = owners;
  return f;
}

// ---------------------------------------------------------------------------
// Sort: ordem=<key>.<asc|desc>
// ---------------------------------------------------------------------------

export function sortToParam(s: CrmSort | null): string | null {
  return s ? `${s.key}.${s.dir}` : null;
}

export function paramToSort(v: string | null): CrmSort | null {
  if (!v) return null;
  const dot = v.lastIndexOf(".");
  if (dot <= 0) return null;
  const key = v.slice(0, dot);
  const dir = v.slice(dot + 1);
  return dir === "asc" || dir === "desc" ? { key, dir } : null;
}
