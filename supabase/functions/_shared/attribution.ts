// Sprint 11 · Onda 5 · T50/T51 — every arrival of a lead is a touch.
//
// The entry doors (inbound webhook, WhatsApp, the AI agent) hand the database
// what arrived; `crm_record_touch` reads UTMs, click IDs and the ad out of it,
// stamps the lead's first touch and applies the entry's owner rule. Here: the
// pure part (what payload the touch keeps) and the call, which never breaks the
// door — a lead that arrives is a lead, even if its touch could not be recorded.

// deno-lint-ignore no-explicit-any
type Db = any;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The body of an inbound webhook plus the query string of the call where the
 * body is silent (a form that posts to `.../inbound/<id>?utm_source=…`). The
 * query string used to be thrown away — `?fbclid=` included.
 */
export function inboundTouchPayload(body: unknown, searchParams: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = isObject(body) ? { ...body } : {};
  for (const [key, value] of searchParams) {
    if (key.toLowerCase() === "secret") continue;
    if (!(key in out) && value.trim()) out[key] = value;
  }
  return out;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/**
 * Sprint 11 · T51 — the click-to-WhatsApp ad, if the message carries one. Two
 * shapes: the Cloud API's `referral` ({ source_type, source_id, source_url,
 * headline, ctwa_clid }) and Evolution/Baileys' `contextInfo.externalAdReply`
 * ({ sourceType, sourceId, sourceUrl, title, ctwaClid }, with
 * `conversionSource: "FB_Ads"`), at the top of the event or inside the message.
 * Returns the touch keys the database reads (a CTWA click is a paid Meta ad);
 * nothing when there is no ad.
 */
export function whatsappAdReferral(raw: unknown): Record<string, string> {
  if (!isObject(raw)) return {};
  const candidates: Record<string, unknown>[] = [];
  const push = (v: unknown) => { if (isObject(v)) candidates.push(v); };

  push(raw.referral);
  const ctx = [raw.contextInfo];
  if (isObject(raw.message)) {
    for (const part of Object.values(raw.message)) if (isObject(part)) ctx.push(part.contextInfo);
  }
  let conversion: string | null = null;
  for (const c of ctx) {
    if (!isObject(c)) continue;
    push(c.externalAdReply);
    conversion = conversion ?? text(c.conversionSource) ?? text(c.entryPointConversionSource);
  }

  for (const ad of candidates) {
    const ctwa = text(ad.ctwa_clid) ?? text(ad.ctwaClid);
    const type = (text(ad.source_type) ?? text(ad.sourceType) ?? "").toLowerCase();
    const isAd = !!ctwa || type === "ad" || /ads?$/i.test(conversion ?? "");
    if (!isAd) continue;
    const out: Record<string, string> = { utm_source: "facebook", utm_medium: "paid_social", whatsapp_ad: "true" };
    if (ctwa) out.ctwa_clid = ctwa;
    const adId = text(ad.source_id) ?? text(ad.sourceId);
    if (adId) out.ad_id = adId;
    const title = text(ad.headline) ?? text(ad.title);
    if (title) out.ad_name = title;
    const url = text(ad.source_url) ?? text(ad.sourceUrl);
    if (url) out.source_url = url;
    return out;
  }
  return {};
}

/** What a WhatsApp/agent arrival keeps: the channel, the agent, the ad if any — never the message text. */
export function messageTouchPayload(args: {
  channel: string | null;
  agentName?: string | null;
  instance?: string | null;
  raw: unknown;
}): Record<string, unknown> {
  return {
    ...(args.channel ? { channel: args.channel } : {}),
    ...(args.agentName ? { agent_name: args.agentName } : {}),
    ...(args.instance ? { instance: args.instance } : {}),
    ...whatsappAdReferral(args.raw),
  };
}

export interface RecordedTouch {
  touch_id: string;
  first: boolean;
  entry_id: string;
  origin_category: string | null;
  platform: string | null;
  campaign_id: string | null;
  owner_id: string | null;
}

/** The team's single entry of a kind: 'agent' (AI agent), 'import' (API/import), 'manual'. */
export async function entryOfKind(db: Db, equipeId: string, kind: "agent" | "import" | "manual"): Promise<string | null> {
  const { data, error } = await db.rpc("_crm_entry_for", { p_equipe_id: equipeId, p_kind: kind });
  if (error) {
    console.error("[attribution] _crm_entry_for:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/** The entry of a WhatsApp number (Solo API instance); the database creates it the first time. */
export async function entryForInstance(db: Db, instanceId: string): Promise<string | null> {
  const { data, error } = await db.rpc("_crm_entry_for_instance", { p_instance_id: instanceId });
  if (error) {
    console.error("[attribution] _crm_entry_for_instance:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/** The entry of an inbound webhook (the database creates one per webhook). */
export async function entryForWebhook(db: Db, webhookConfigId: string): Promise<string | null> {
  const { data } = await db.from("crm_entries").select("id").eq("webhook_config_id", webhookConfigId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Records the touch. Returns null — and logs — when it could not: the lead and
 * the deal are already saved, and the door must still answer 200.
 */
export async function recordTouch(
  db: Db,
  args: { leadId: string; entryId: string | null; payload: Record<string, unknown>; opportunityId?: string | null },
  tag = "[attribution]",
): Promise<RecordedTouch | null> {
  if (!args.entryId) {
    console.error(tag, "no entry: touch not recorded for lead", args.leadId);
    return null;
  }
  try {
    const { data, error } = await db.rpc("crm_record_touch", {
      p_lead_id: args.leadId,
      p_entry_id: args.entryId,
      p_payload: args.payload,
      p_opportunity_id: args.opportunityId ?? null,
    });
    if (error) {
      console.error(tag, "crm_record_touch:", error.message);
      return null;
    }
    return data as RecordedTouch;
  } catch (e) {
    console.error(tag, "crm_record_touch threw:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
