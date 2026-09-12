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
