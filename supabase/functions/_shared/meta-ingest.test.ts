import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { fakeDb, type Op } from "./fake-db.ts";
import { MetaGraphError, type Graph } from "./meta-graph.ts";
import { processLeadgenEvent, type InboundEvent } from "./meta-ingest.ts";

const EV: InboundEvent = {
  id: "ev1",
  equipe_id: "eq1",
  external_id: "12345678901234567",
  asset_id: "as1",
  origin: "webhook",
  attempts: 1,
  payload: { leadgen_id: "12345678901234567", page_id: "P1", form_id: "F1", ad_id: "AD1" },
};

const LEAD = {
  id: "12345678901234567",
  created_time: "2026-11-20T10:00:00+0000",
  ad_id: "AD1",
  ad_name: "P001-V1",
  adset_id: "AS1",
  adset_name: "Fortaleza",
  campaign_id: "C1",
  campaign_name: "LEADS NOV",
  form_id: "F1",
  is_organic: false,
  platform: "fb",
  field_data: [
    { name: "full_name", values: ["Maria"] },
    { name: "phone_number", values: ["+5585996487923"] },
    { name: "cidade", values: ["Fortaleza"] },
  ],
};

function graphOf(handler: (path: string, params?: Record<string, string | undefined>) => unknown): Graph {
  const call = <T>(path: string, _t: string, params?: Record<string, string | undefined>) => {
    try {
      return Promise.resolve(handler(path, params) as T);
    } catch (e) {
      return Promise.reject(e);
    }
  };
  return {
    get: call,
    post: call,
    del: call,
    paginate: () => Promise.resolve([]),
    exchangeCode: () => Promise.resolve("x"),
    appToken: () => "app|secret",
  };
}

function db(extra: (op: Op) => { data?: unknown } | undefined = () => undefined) {
  return fakeDb((op) => {
    const r = extra(op);
    if (r) return r;
    if (op.kind === "select" && op.table === "crm_integration_assets") {
      return { data: { id: "as1", external_id: "P1", integration_id: "int1", status: "active" } };
    }
    if (op.kind === "rpc" && op.table === "_crm_asset_secret") return { data: "PAGE-TOKEN" };
    if (op.kind === "rpc" && op.table === "_crm_entry_for_meta_form") return { data: "entry1" };
    if (op.kind === "rpc" && op.table === "crm_find_lead_by_phone") return { data: null };
    if (op.kind === "insert" && op.table === "leads") return { data: { id: "lead1" } };
    if (op.kind === "rpc" && op.table === "crm_record_touch") return { data: { touch_id: "t1" } };
    if (op.kind === "select" && op.table === "crm_entries") return { data: { pipeline_id: null, name: "Meta · Formulário F1" } };
  });
}

const deps = (dispatched: string[]) => ({
  resolveOpportunity: () => Promise.resolve({ opportunity_id: "opp1", pipeline_id: "p", stage_id: "s", created: true }),
  dispatch: (_db: unknown, i: { leadId: string }) => {
    dispatched.push(i.leadId);
    return Promise.resolve({ dispatched: true });
  },
});

Deno.test("processLeadgenEvent - lead completo pelo caminho de entrada", async () => {
  const { db: d, ops } = db();
  const dispatched: string[] = [];
  const g = graphOf((path) => {
    if (path === "/12345678901234567") return LEAD;
    if (path === "/F1") return { name: "Simulação Solar" };
    throw new Error("inesperado " + path);
  });
  const r = await processLeadgenEvent(d, g, EV, deps(dispatched));
  assertEquals(r, { status: "done", leadId: "lead1", opportunityId: "opp1" });

  const ins = ops.find((o) => o.kind === "insert" && o.table === "leads")!.args as Record<string, unknown>;
  assertEquals(ins.name, "Maria");
  assertEquals(ins.creation_source, "form");
  assertEquals(ins.source, "meta_lead_ads");
  assertEquals(ins.observations, "Cidade: Fortaleza");
  assertEquals(ins.custom_fields, { meta_form: { cidade: "Fortaleza" } });

  const ad = ops.find((o) => o.table === "_crm_meta_upsert_ad")!.args as { p: Record<string, string> };
  assertEquals(ad.p.ad_id, "AD1");
  assertEquals(ad.p.campaign_id, "C1");

  const entry = ops.find((o) => o.table === "_crm_entry_for_meta_form")!.args as Record<string, string>;
  assertEquals(entry.p_form_name, "Simulação Solar");

  const touch = ops.find((o) => o.table === "crm_record_touch")!.args as Record<string, unknown>;
  assertEquals((touch.p_payload as Record<string, string>).leadgen_id, "12345678901234567");
  assertEquals((touch.p_payload as Record<string, string>).form_name, "Simulação Solar");
  assertEquals(touch.p_entry_id, "entry1");
  assertEquals(touch.p_opportunity_id, "opp1");
  assertEquals(touch.p_occurred_at, "2026-11-20T10:00:00+0000");
  // anúncio antes do toque (o toque casa pelo anúncio)
  assert(ops.indexOf(ops.find((o) => o.table === "_crm_meta_upsert_ad")!) < ops.indexOf(ops.find((o) => o.table === "crm_record_touch")!));
  assertEquals(dispatched, ["lead1"]);
});

Deno.test("processLeadgenEvent - backfill não abre conversa", async () => {
  const { db: d } = db();
  const dispatched: string[] = [];
  const g = graphOf((path) => (path === "/F1" ? { name: "F" } : LEAD));
  const r = await processLeadgenEvent(d, g, { ...EV, origin: "backfill" }, deps(dispatched));
  assertEquals(r.status, "done");
  assertEquals(dispatched, []);
});

Deno.test("processLeadgenEvent - campo recusado (#100) cai no núcleo e completa pelo anúncio", async () => {
  const { db: d, ops } = db();
  const seen: string[] = [];
  const g = graphOf((path, params) => {
    seen.push(`${path}?${params?.fields ?? ""}`);
    if (path === "/12345678901234567" && String(params?.fields).includes("campaign_name")) {
      throw new MetaGraphError("(#100) Tried accessing nonexisting field (campaign_name)", 100);
    }
    if (path === "/12345678901234567") return { id: LEAD.id, created_time: LEAD.created_time, ad_id: "AD1", form_id: "F1", field_data: LEAD.field_data };
    if (path === "/AD1") return { name: "P001-V1", adset: { id: "AS1", name: "Fortaleza" }, campaign: { id: "C1", name: "LEADS NOV" } };
    if (path === "/F1") return { name: "F" };
    throw new Error(path);
  });
  const r = await processLeadgenEvent(d, g, EV, deps([]));
  assertEquals(r.status, "done");
  const ad = ops.find((o) => o.table === "_crm_meta_upsert_ad")!.args as { p: Record<string, string> };
  assertEquals(ad.p.campaign_name, "LEADS NOV");
  assertEquals(ad.p.adset_id, "AS1");
});

Deno.test("processLeadgenEvent - token inválido: segura a fila e marca a integração", async () => {
  const { db: d, ops } = db();
  const g = graphOf(() => {
    throw new MetaGraphError("Error validating access token", 190);
  });
  const r = await processLeadgenEvent(d, g, EV, deps([]));
  assertEquals(r.status, "hold");
  const up = ops.find((o) => o.kind === "update" && o.table === "crm_integrations")!;
  assertEquals((up.args as Record<string, unknown>).status, "error");
  assertEquals(ops.some((o) => o.table === "leads"), false);
});

Deno.test("processLeadgenEvent - limite do Meta: erro com nova tentativa", async () => {
  const { db: d } = db();
  const g = graphOf(() => {
    throw new MetaGraphError("Application request limit reached", 4);
  });
  const r = await processLeadgenEvent(d, g, EV, deps([]));
  assertEquals(r.status, "error");
});

Deno.test("processLeadgenEvent - página desativada: dead", async () => {
  const { db: d } = db((op) =>
    op.kind === "select" && op.table === "crm_integration_assets"
      ? { data: { id: "as1", external_id: "P1", integration_id: "int1", status: "available" } }
      : undefined
  );
  const r = await processLeadgenEvent(d, graphOf(() => LEAD), EV, deps([]));
  assertEquals(r.status, "dead");
});
