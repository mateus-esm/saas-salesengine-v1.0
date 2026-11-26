// ============================================================================
// Sprint 17 · Fase 4 — envio da fila da API de Conversões (CAPI para CRM).
//
// Para cada evento: a chave mais forte que o lead tem (formulário → lead_id;
// site → fbc + e-mail/telefone com hash; só e-mail/telefone → hash; WhatsApp
// (ctwa_clid) → pulado: exige WABA oficial). Lote por dataset em
// POST /{dataset}/events. A fila guarda só o que foi enviado.
// ============================================================================

import { buildCapiEvent, type CapiEvent, metaErrorMessage, randomToken } from "./meta.ts";
import { type Graph, MetaGraphError } from "./meta-graph.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface TouchKeys {
  occurred_at: string;
  leadgen_id?: string | null;
  fbclid?: string | null;
  ctwa_clid?: string | null;
}

/** O toque que dá a chave de casamento mais forte (formulário > site > WhatsApp; o mais recente). */
export function pickMatchTouch<T extends TouchKeys>(touches: T[]): T | null {
  const by = (k: keyof TouchKeys) =>
    touches.filter((t) => !!t[k]).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0] ?? null;
  return by("leadgen_id") ?? by("fbclid") ?? by("ctwa_clid");
}

interface ConvRow {
  id: string;
  equipe_id: string;
  lead_id: string | null;
  event_name: string;
  event_id: string;
  event_time: string;
  attempts: number;
}

interface TeamCtx {
  ok: boolean;
  reason?: "capi_off" | "no_dataset";
  integrationId?: string;
  dataset?: string;
  token?: string;
  source?: string;
}

const finish = (db: Db, id: string, status: string, extra: { match_key?: string | null; payload?: unknown; response?: unknown; reason?: string | null } = {}) =>
  db.rpc("_crm_capi_finish", {
    p_id: id,
    p_status: status,
    p_match_key: extra.match_key ?? null,
    p_payload: extra.payload ?? null,
    p_response: extra.response ?? null,
    p_reason: extra.reason ?? null,
  });

async function teamCtx(db: Db, equipeId: string): Promise<TeamCtx> {
  const { data: integ } = await db.from("crm_integrations").select("id, status, settings")
    .eq("equipe_id", equipeId).eq("provider", "meta").maybeSingle();
  const s = (integ?.settings ?? {}) as Record<string, unknown>;
  if (!integ || integ.status !== "connected" || s.capi_enabled !== true) return { ok: false, reason: "capi_off" };
  if (!s.dataset_id) return { ok: false, reason: "no_dataset" };
  const { data: token } = await db.rpc("_crm_integration_key", { p_integration_id: integ.id });
  if (!token) return { ok: false, reason: "capi_off" };
  return { ok: true, integrationId: integ.id, dataset: String(s.dataset_id), token: token as string, source: String(s.lead_event_source ?? "Rev") };
}

export async function sendCapiBatch(db: Db, graph: Graph, limit = 500): Promise<{ claimed: number; sent: number; skipped: number; failed: number }> {
  const { data, error } = await db.rpc("_crm_capi_claim", { p_limit: limit });
  if (error) {
    console.error("[meta-capi] claim:", error.message);
    return { claimed: 0, sent: 0, skipped: 0, failed: 0 };
  }
  const rows = (data ?? []) as ConvRow[];
  const ctx = new Map<string, TeamCtx>();
  const batches = new Map<string, { ctx: TeamCtx; items: { row: ConvRow; match_key: string; event: CapiEvent }[] }>();
  let skipped = 0;
  let sent = 0;
  let failed = 0;
  const now = Date.now();

  for (const row of rows) {
    if (!ctx.has(row.equipe_id)) ctx.set(row.equipe_id, await teamCtx(db, row.equipe_id));
    const c = ctx.get(row.equipe_id)!;
    if (!c.ok) {
      await finish(db, row.id, "skipped", { reason: c.reason });
      skipped++;
      continue;
    }
    const { data: lead } = row.lead_id
      ? await db.from("leads").select("id, email, phone, created_at").eq("id", row.lead_id).maybeSingle()
      : { data: null };
    const { data: touches } = row.lead_id
      ? await db.from("lead_touches").select("occurred_at, leadgen_id, fbclid, ctwa_clid").eq("lead_id", row.lead_id)
      : { data: [] };
    const t = pickMatchTouch((touches ?? []) as TouchKeys[]);
    const built = await buildCapiEvent({
      eventName: row.event_name,
      eventId: row.event_id,
      eventTimeMs: new Date(row.event_time).getTime(),
      leadCreatedMs: lead?.created_at ? new Date(lead.created_at).getTime() : null,
      nowMs: now,
      leadEventSource: c.source ?? "Rev",
      leadgenId: t?.leadgen_id ?? null,
      fbclid: t?.leadgen_id ? null : t?.fbclid ?? null,
      touchAtMs: t ? new Date(t.occurred_at).getTime() : null,
      ctwaClid: t?.ctwa_clid ?? null,
      email: lead?.email ?? null,
      phone: lead?.phone ?? null,
    });
    if (!built.ok) {
      await finish(db, row.id, "skipped", { reason: built.skip_reason, match_key: built.skip_reason === "whatsapp_requires_waba" ? "ctwa" : null });
      skipped++;
      continue;
    }
    const key = `${row.equipe_id}:${c.dataset}`;
    if (!batches.has(key)) batches.set(key, { ctx: c, items: [] });
    batches.get(key)!.items.push({ row, match_key: built.match_key, event: built.event });
  }

  for (const { ctx: c, items } of batches.values()) {
    for (let i = 0; i < items.length; i += 1000) {
      const chunk = items.slice(i, i + 1000);
      try {
        const res = await graph.post<{ events_received?: number; fbtrace_id?: string; messages?: unknown }>(
          `/${c.dataset}/events`,
          c.token!,
          { data: JSON.stringify(chunk.map((x) => x.event)) },
        );
        for (const x of chunk) {
          await finish(db, x.row.id, "sent", {
            match_key: x.match_key,
            payload: x.event,
            response: { events_received: res.events_received ?? null, fbtrace_id: res.fbtrace_id ?? null },
          });
          sent++;
        }
      } catch (e) {
        const m = e instanceof MetaGraphError ? metaErrorMessage({ code: e.code, message: e.message }) : null;
        if (m?.code === "token_invalid" && c.integrationId) {
          await db.from("crm_integrations").update({ status: "error", last_sync_error: m.message, updated_at: new Date().toISOString() })
            .eq("id", c.integrationId);
        }
        const msg = m?.message ?? (e instanceof Error ? e.message : String(e));
        for (const x of chunk) {
          await finish(db, x.row.id, "error", { reason: msg, response: { error: msg } });
          failed++;
        }
      }
    }
  }
  return { claimed: rows.length, sent, skipped, failed };
}

/** Evento sintético com `test_event_code`: aparece em Gerenciador de Eventos › Testar eventos. */
export async function sendCapiTest(
  db: Db,
  graph: Graph,
  o: { equipeId: string; dataset: string; token: string; testCode: string; leadEventSource: string },
): Promise<{ ok: boolean; events_received: number | null; fbtrace_id: string | null; error?: string }> {
  const eventId = `rev-test-${randomToken(9)}`;
  const built = await buildCapiEvent({
    eventName: "rev_test_event",
    eventId,
    eventTimeMs: Date.now() - 1000,
    leadCreatedMs: null,
    nowMs: Date.now(),
    leadEventSource: o.leadEventSource,
    email: "teste@rev.app",
  });
  if (!built.ok) return { ok: false, events_received: null, fbtrace_id: null, error: built.skip_reason };
  let ok = false;
  let response: Record<string, unknown>;
  try {
    const res = await graph.post<{ events_received?: number; fbtrace_id?: string }>(`/${o.dataset}/events`, o.token, {
      data: JSON.stringify([built.event]),
      test_event_code: o.testCode,
    });
    ok = true;
    response = { events_received: res.events_received ?? null, fbtrace_id: res.fbtrace_id ?? null };
  } catch (e) {
    const msg = e instanceof MetaGraphError ? metaErrorMessage({ code: e.code, message: e.message }).message : e instanceof Error ? e.message : String(e);
    response = { error: msg };
  }
  await db.rpc("_crm_capi_record_test", {
    p_equipe: o.equipeId,
    p_event_name: built.event.event_name,
    p_event_id: eventId,
    p_payload: built.event,
    p_response: response,
    p_ok: ok,
    p_test_code: o.testCode,
  });
  return {
    ok,
    events_received: (response.events_received as number | null) ?? null,
    fbtrace_id: (response.fbtrace_id as string | null) ?? null,
    ...(ok ? {} : { error: String(response.error) }),
  };
}
