// Sprint 16 — Windsor.ai: the pure part of the daily pull (which fields to ask for,
// how a response row becomes one ad × day row for _crm_windsor_ingest).
//
// API: GET https://connectors.windsor.ai/{connector}?api_key=…&fields=a,b&date_from=…&date_to=…
// Auth is the api_key query param only. The docs do not confirm every field name
// for every connector, so each target has candidates; at connect time the edge asks
// /{connector}/fields and keeps the first candidate the account really has.

export const WINDSOR_BASE = "https://connectors.windsor.ai";

export type Connector = "facebook" | "google_ads";
export const CONNECTORS: Connector[] = ["facebook", "google_ads"];
export const CONNECTOR_PLATFORM: Record<Connector, "meta" | "google"> = { facebook: "meta", google_ads: "google" };

export type Target =
  | "day" | "account_id" | "account_name"
  | "campaign_external_id" | "campaign_name"
  | "adset_external_id" | "adset_name"
  | "external_ad_id" | "ad_name"
  | "spend" | "impressions" | "reach" | "clicks"
  | "video_3s" | "thruplays" | "platform_leads" | "conversations";

const COMMON: Partial<Record<Target, string[]>> = {
  day: ["date"],
  account_id: ["account_id"],
  account_name: ["account_name"],
  campaign_external_id: ["campaign_id"],
  campaign_name: ["campaign", "campaign_name"],
  impressions: ["impressions"],
  clicks: ["clicks"],
};

export const FIELD_CANDIDATES: Record<Connector, Partial<Record<Target, string[]>>> = {
  facebook: {
    ...COMMON,
    adset_external_id: ["adset_id", "adgroupid"],
    adset_name: ["adset_name", "adset"],
    external_ad_id: ["ad_id", "adid"],
    ad_name: ["ad_name", "ad"],
    spend: ["spend", "totalcost"],
    reach: ["reach"],
    video_3s: ["actions_video_view", "video_3_sec_watched_actions_video_view"],
    thruplays: ["video_thruplay_watched_actions_video_view", "actions_video_thruplay", "thruplays"],
    platform_leads: ["actions_leadgen_grouped", "actions_lead"],
    conversations: [
      "actions_onsite_conversion_messaging_conversation_started_7d",
      "actions_onsite_conversion_total_messaging_connection",
    ],
  },
  google_ads: {
    ...COMMON,
    adset_external_id: ["ad_group_id", "adgroup_id", "adset_id"],
    adset_name: ["ad_group_name", "adgroup_name", "adset_name"],
    external_ad_id: ["ad_id", "ad_group_ad_ad_id"],
    ad_name: ["ad_name", "ad_group_ad_ad_name"],
    spend: ["spend", "cost", "totalcost"],
    video_3s: ["video_views"],
    platform_leads: ["conversions"],
  },
};

/** The minimum a pull can live with when discovery failed or a field was refused. */
export const CORE_FIELDS: Record<Connector, string[]> = {
  facebook: ["date", "account_id", "account_name", "campaign_id", "campaign", "adset_id", "adset_name", "ad_id", "ad_name", "spend", "impressions", "clicks"],
  google_ads: ["date", "account_id", "account_name", "campaign_id", "campaign", "spend", "impressions", "clicks"],
};

export type FieldMap = Partial<Record<Target, string>>;

/** /{connector}/fields in any of the shapes it may come: ["a"], [{id:"a"}], {data:[…]}, {a:{…}}. */
export function parseFieldList(json: unknown): string[] | null {
  const pick = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of ["id", "field", "name", "field_id"]) if (typeof o[k] === "string") return o[k] as string;
    }
    return null;
  };
  let arr: unknown = json;
  if (arr && typeof arr === "object" && !Array.isArray(arr)) {
    const o = arr as Record<string, unknown>;
    arr = Array.isArray(o.data) ? o.data : Array.isArray(o.fields) ? o.fields : Array.isArray(o.result) ? o.result : null;
    if (!arr && !("error" in o)) arr = Object.keys(o);
  }
  if (!Array.isArray(arr)) return null;
  const out = arr.map(pick).filter((x): x is string => !!x);
  return out.length ? Array.from(new Set(out)) : null;
}

/** Which source field answers each target. Without a list, the first candidate. */
export function chooseFields(connector: Connector, available: string[] | null): FieldMap {
  const have = available ? new Set(available.map((f) => f.toLowerCase())) : null;
  const map: FieldMap = {};
  for (const [target, candidates] of Object.entries(FIELD_CANDIDATES[connector]) as [Target, string[]][]) {
    const hit = have ? candidates.find((c) => have.has(c.toLowerCase())) : candidates[0];
    if (hit) map[target] = hit;
  }
  return map;
}

export function requestFields(map: FieldMap): string[] {
  return Array.from(new Set(Object.values(map).filter((x): x is string => !!x)));
}

/** A FieldMap from a plain field list (the CORE fallback). */
export function mapFromList(connector: Connector, fields: string[]): FieldMap {
  return chooseFields(connector, fields);
}

export function windsorUrl(connector: Connector | "all", apiKey: string, params: Record<string, string | undefined>): string {
  const u = new URL(`${WINDSOR_BASE}/${connector}`);
  u.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** The error Windsor answered, in words, and whether it is the key. Both documented shapes. */
export function windsorError(status: number, json: unknown): { message: string; auth: boolean } | null {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const err = o?.error;
  if (status < 400 && !err) return null;
  let message = `HTTP ${status}`;
  let code = "";
  if (typeof err === "string") message = err;
  else if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") message = e.message;
    if (typeof e.code === "string") code = e.code;
  }
  const auth = status === 401 || status === 403 || code === "authentication_error" || /not authori[sz]ed|invalid api key/i.test(message);
  return { message, auth };
}

const toNum = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
const toText = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};
const toDay = (v: unknown): string | null => {
  const s = toText(v);
  const m = s ? /^(\d{4}-\d{2}-\d{2})/.exec(s) : null;
  return m ? m[1] : null;
};

export interface IngestRow {
  platform: "meta" | "google";
  day: string;
  account_id: string | null;
  account_name: string | null;
  campaign_external_id: string | null;
  campaign_name: string | null;
  adset_external_id: string | null;
  adset_name: string | null;
  external_ad_id: string;
  ad_name: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  video_3s: number;
  thruplays: number;
  platform_leads: number;
  conversations: number;
}

const METRICS = ["spend", "impressions", "reach", "clicks", "video_3s", "thruplays", "platform_leads", "conversations"] as const;

/**
 * Windsor rows → one row per ad per day. Without an ad ID (a pull at ad group or
 * campaign level) the ad group / campaign stands in, prefixed so it never collides
 * with a real ad ID. Rows with no day or no identity are dropped.
 */
export function normalizeRows(connector: Connector, rows: unknown[], map: FieldMap): IngestRow[] {
  const get = (r: Record<string, unknown>, t: Target) => (map[t] ? r[map[t] as string] : undefined);
  const out = new Map<string, IngestRow>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const day = toDay(get(r, "day"));
    if (!day) continue;
    const adId = toText(get(r, "external_ad_id"));
    const adsetId = toText(get(r, "adset_external_id"));
    const campId = toText(get(r, "campaign_external_id"));
    const ext = adId ?? (adsetId ? `adgroup:${adsetId}` : campId ? `campaign:${campId}` : null);
    if (!ext) continue;
    const key = `${ext}|${day}`;
    const row: IngestRow = out.get(key) ?? {
      platform: CONNECTOR_PLATFORM[connector],
      day,
      account_id: toText(get(r, "account_id")),
      account_name: toText(get(r, "account_name")),
      campaign_external_id: campId,
      campaign_name: toText(get(r, "campaign_name")),
      adset_external_id: adsetId,
      adset_name: toText(get(r, "adset_name")),
      external_ad_id: ext,
      ad_name: toText(get(r, "ad_name")) ?? (adId ? null : toText(get(r, "adset_name")) ?? toText(get(r, "campaign_name"))),
      spend: 0, impressions: 0, reach: 0, clicks: 0, video_3s: 0, thruplays: 0, platform_leads: 0, conversations: 0,
    };
    for (const m of METRICS) row[m] += toNum(get(r, m));
    row.spend = Math.round(row.spend * 100) / 100;
    out.set(key, row);
  }
  return [...out.values()];
}

/** The ad accounts seen in a pull: [{source, id, name}]. */
export function accountsOf(connector: Connector, rows: IngestRow[]): { source: Connector; id: string; name: string | null }[] {
  const seen = new Map<string, { source: Connector; id: string; name: string | null }>();
  for (const r of rows) if (r.account_id && !seen.has(r.account_id)) seen.set(r.account_id, { source: connector, id: r.account_id, name: r.account_name });
  return [...seen.values()];
}

/** [from, to] as YYYY-MM-DD for the last `days` days including today, in São Paulo. */
export function syncWindow(days: number, now: Date = new Date()): { from: string; to: string } {
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const to = fmt(now);
  const from = fmt(new Date(now.getTime() - (Math.max(1, days) - 1) * 86_400_000));
  return { from, to };
}
