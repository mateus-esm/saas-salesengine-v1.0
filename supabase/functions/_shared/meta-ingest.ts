// ============================================================================
// Sprint 17 · Fase 3 — um evento `leadgen` da fila vira lead no Rev.
//
// Usado pelo meta-webhook (na hora, via waitUntil) e pelo meta-worker (cron).
// O lead entra pelo MESMO caminho do webhook de entrada (_shared/ingest-lead.ts,
// resolveActiveOpportunity, recordTouch, dispatchConversationOpen); o que é do
// Meta é só buscar o lead completo na Graph API e o anúncio que veio com ele.
// ============================================================================

import { entryLine, recordTouch } from "./attribution.ts";
import { META_FORM_ORIGIN, upsertInboundLead } from "./ingest-lead.ts";
import { leadNameFromPhone } from "./lead-identity.ts";
import { backoffDelayMs, fieldDataToLead, metaErrorMessage, metaTouchPayload } from "./meta.ts";
import { type Graph, MetaGraphError } from "./meta-graph.ts";
import { resolveActiveOpportunity } from "./opportunities.ts";
import { dispatchConversationOpen } from "./start-conversation.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface InboundEvent {
  id: string;
  equipe_id: string;
  external_id: string;
  asset_id: string | null;
  origin: "webhook" | "backfill";
  attempts: number;
  payload: Record<string, unknown>;
}

export type ProcessResult =
  | { status: "done"; leadId: string; opportunityId: string | null }
  | { status: "error" | "hold" | "dead"; error: string; retryMs?: number };

export interface IngestDeps {
  resolveOpportunity?: typeof resolveActiveOpportunity;
  dispatch?: (db: Db, i: { equipeId: string; leadId: string; source?: string | null; entryId?: string | null; logPrefix?: string }) => Promise<unknown>;
}

const FULL_FIELDS =
  "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,is_organic,platform";
const CORE_FIELDS = "id,created_time,ad_id,form_id,field_data";
const TAG = "[meta-ingest]";

type GraphLead = Record<string, unknown> & { field_data?: unknown };

async function fetchLead(graph: Graph, leadgenId: string, token: string, systemToken: string | null): Promise<GraphLead> {
  let lead: GraphLead;
  try {
    lead = await graph.get<GraphLead>(`/${leadgenId}`, token, { fields: FULL_FIELDS });
  } catch (e) {
    // #100 = campo que este token/versão não lê: o núcleo documentado + o anúncio.
    if (!(e instanceof MetaGraphError) || e.code !== 100) throw e;
    lead = await graph.get<GraphLead>(`/${leadgenId}`, token, { fields: CORE_FIELDS });
  }
  const adId = typeof lead.ad_id === "string" ? lead.ad_id : null;
  if (adId && !lead.campaign_id) {
    try {
      const ad = await graph.get<{ name?: string; adset?: { id?: string; name?: string }; campaign?: { id?: string; name?: string } }>(
        `/${adId}`,
        systemToken ?? token,
        { fields: "name,adset{id,name},campaign{id,name}" },
      );
      lead = {
        ...lead,
        ad_name: lead.ad_name ?? ad.name,
        adset_id: lead.adset_id ?? ad.adset?.id,
        adset_name: lead.adset_name ?? ad.adset?.name,
        campaign_id: ad.campaign?.id,
        campaign_name: lead.campaign_name ?? ad.campaign?.name,
      };
    } catch (e) {
      console.warn(TAG, "ad metadata", adId, e instanceof MetaGraphError ? e.code : "");
    }
  }
  return lead;
}

async function formName(db: Db, graph: Graph, equipeId: string, formId: string | null, token: string): Promise<string | null> {
  if (!formId) return null;
  const { data } = await db.from("crm_entries").select("name, pipeline_id").eq("equipe_id", equipeId).eq("meta_form_id", formId).maybeSingle();
  const cached = typeof data?.name === "string" && !data.name.startsWith("Meta · Formulário ") ? data.name.replace(/^Meta · /, "") : null;
  if (cached) return cached;
  try {
    return (await graph.get<{ name?: string }>(`/${formId}`, token, { fields: "name" })).name ?? null;
  } catch {
    return null;
  }
}

/** Erro do Meta → o que a fila faz com ele. */
async function failure(db: Db, ev: InboundEvent, integrationId: string | null, e: unknown): Promise<ProcessResult> {
  if (e instanceof MetaGraphError) {
    const m = metaErrorMessage({ code: e.code, message: e.message });
    if (m.code === "token_invalid") {
      if (integrationId) {
        await db.from("crm_integrations").update({
          status: "error",
          last_sync_error: m.message,
          updated_at: new Date().toISOString(),
        }).eq("id", integrationId);
      }
      return { status: "hold", error: m.message, retryMs: 3600_000 };
    }
    if (ev.asset_id && (m.code === "leads_access" || m.code === "permission_missing")) {
      await db.from("crm_integration_assets").update({
        last_error: m.message,
        last_error_at: new Date().toISOString(),
      }).eq("id", ev.asset_id);
    }
    return { status: "error", error: m.message, retryMs: backoffDelayMs(ev.attempts) };
  }
  return { status: "error", error: e instanceof Error ? e.message.slice(0, 500) : String(e), retryMs: backoffDelayMs(ev.attempts) };
}

export async function processLeadgenEvent(db: Db, graph: Graph, ev: InboundEvent, deps: IngestDeps = {}): Promise<ProcessResult> {
  const resolveOpp = deps.resolveOpportunity ?? resolveActiveOpportunity;
  const dispatch = deps.dispatch ?? dispatchConversationOpen;

  const { data: asset } = await db.from("crm_integration_assets")
    .select("id, external_id, integration_id, status").eq("id", ev.asset_id).maybeSingle();
  if (!asset || asset.status !== "active") return { status: "dead", error: "A página não está mais recebendo leads no Rev." };

  const { data: pageToken } = await db.rpc("_crm_asset_secret", { p_asset: asset.id });
  const { data: sysToken } = await db.rpc("_crm_integration_key", { p_integration_id: asset.integration_id });
  const token = (pageToken as string | null) ?? (sysToken as string | null);
  if (!token) return { status: "hold", error: "Token do Meta não encontrado. Reconecte.", retryMs: 3600_000 };

  let lead: GraphLead;
  let form: string | null;
  try {
    lead = await fetchLead(graph, ev.external_id, token, (sysToken as string | null) ?? null);
    form = await formName(db, graph, ev.equipe_id, (lead.form_id as string | undefined) ?? (ev.payload.form_id as string | undefined) ?? null, token);
  } catch (e) {
    return failure(db, ev, asset.integration_id, e);
  }
  const formId = (lead.form_id as string | undefined) ?? (ev.payload.form_id as string | undefined) ?? null;
  if (!lead.ad_id && ev.payload.ad_id) lead.ad_id = ev.payload.ad_id;
  if (!lead.adset_id && ev.payload.adgroup_id) lead.adset_id = ev.payload.adgroup_id;

  const { data: entryId, error: entryErr } = await db.rpc("_crm_entry_for_meta_form", {
    p_equipe: ev.equipe_id,
    p_page: asset.external_id,
    p_form: formId ?? `page:${asset.external_id}`,
    p_form_name: form,
  });
  if (entryErr) return { status: "error", error: "entrada: " + entryErr.message, retryMs: backoffDelayMs(ev.attempts) };

  const fd = fieldDataToLead(lead.field_data);
  const name = fd.name ?? leadNameFromPhone(fd.phone) ?? fd.email ?? "Lead do formulário Meta";
  const up = await upsertInboundLead(db, {
    equipeId: ev.equipe_id,
    name,
    email: fd.email,
    phone: fd.phone,
    observations: fd.observations,
    custom_fields: Object.keys(fd.answers).length ? { meta_form: fd.answers } : null,
    origin: META_FORM_ORIGIN,
    matchEmail: true,
    appendObservations: true,
    logPrefix: TAG,
  });
  if (!up.ok) return { status: "error", error: "lead: " + up.error, retryMs: backoffDelayMs(ev.attempts) };

  // O anúncio antes do toque: o toque casa pelo ID e herda campanha e criativo.
  if (lead.ad_id) {
    const { error } = await db.rpc("_crm_meta_upsert_ad", {
      p_equipe: ev.equipe_id,
      p: {
        ad_id: lead.ad_id,
        ad_name: lead.ad_name,
        adset_id: lead.adset_id,
        adset_name: lead.adset_name,
        campaign_id: lead.campaign_id,
        campaign_name: lead.campaign_name,
      },
    });
    if (error) console.error(TAG, "_crm_meta_upsert_ad:", error.message);
  }

  let opportunityId: string | null = null;
  try {
    const line = await entryLine(db, entryId as string);
    const opp = await resolveOpp(db, { equipe_id: ev.equipe_id, lead_id: up.leadId, createIfMissing: true, pipeline_id: line });
    opportunityId = opp?.opportunity_id ?? null;
  } catch (e) {
    console.error(TAG, "opportunity:", e instanceof Error ? e.message : e);
  }

  const touch = await recordTouch(db, {
    leadId: up.leadId,
    entryId: entryId as string,
    payload: metaTouchPayload(lead, form),
    opportunityId,
    occurredAt: typeof lead.created_time === "string" ? lead.created_time : null,
  }, TAG);

  await db.from("lead_activities").insert({
    lead_id: up.leadId,
    tipo: "meta_lead",
    descricao: up.isNew ? "Lead criado pelo formulário do Meta" : "Lead voltou pelo formulário do Meta",
    metadata: {
      leadgen_id: ev.external_id,
      form_id: formId,
      form_name: form,
      ad_id: lead.ad_id ?? null,
      opportunity_id: opportunityId,
      is_new: up.isNew,
      origin: ev.origin,
      ...(touch ? { touch_id: touch.touch_id, campaign_id: touch.campaign_id } : {}),
    },
  });

  // Importação de leads antigos não dispara saudação automática.
  if (ev.origin === "webhook") {
    await dispatch(db, { equipeId: ev.equipe_id, leadId: up.leadId, source: "meta_lead_ads", entryId: entryId as string, logPrefix: TAG });
  }

  return { status: "done", leadId: up.leadId, opportunityId };
}

/** Pega eventos prontos da fila (ou os `ids`) e processa um a um. */
export async function processInboundBatch(
  db: Db,
  graph: Graph,
  opts: { ids?: string[]; limit?: number } = {},
): Promise<{ claimed: number; done: number; failed: number }> {
  const { data, error } = await db.rpc("_crm_inbound_claim", { p_limit: opts.limit ?? 25, p_ids: opts.ids ?? null });
  if (error) {
    console.error(TAG, "_crm_inbound_claim:", error.message);
    return { claimed: 0, done: 0, failed: 0 };
  }
  const events = (data ?? []) as InboundEvent[];
  let done = 0;
  let failed = 0;
  for (const ev of events) {
    let r: ProcessResult;
    try {
      r = await processLeadgenEvent(db, graph, ev);
    } catch (e) {
      r = { status: "error", error: e instanceof Error ? e.message.slice(0, 500) : String(e), retryMs: backoffDelayMs(ev.attempts) };
    }
    if (r.status === "done") done++;
    else failed++;
    await db.rpc("_crm_inbound_finish", {
      p_id: ev.id,
      p_status: r.status,
      p_error: r.status === "done" ? null : r.error,
      p_lead: r.status === "done" ? r.leadId : null,
      p_opportunity: r.status === "done" ? r.opportunityId : null,
      p_retry_ms: r.status === "done" ? null : r.retryMs ?? 60_000,
    });
  }
  return { claimed: events.length, done, failed };
}
