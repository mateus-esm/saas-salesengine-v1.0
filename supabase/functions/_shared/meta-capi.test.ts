import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { fakeDb } from "./fake-db.ts";
import type { Graph } from "./meta-graph.ts";
import { pickMatchTouch, sendCapiBatch } from "./meta-capi.ts";

Deno.test("pickMatchTouch - formulário > site > whatsapp", () => {
  const t = [
    { occurred_at: "2026-11-01T00:00:00Z", ctwa_clid: "c" },
    { occurred_at: "2026-11-02T00:00:00Z", fbclid: "f" },
    { occurred_at: "2026-10-01T00:00:00Z", leadgen_id: "123" },
  ];
  assertEquals(pickMatchTouch(t)?.leadgen_id, "123");
  assertEquals(pickMatchTouch(t.slice(0, 2))?.fbclid, "f");
  assertEquals(pickMatchTouch([t[0]])?.ctwa_clid, "c");
  assertEquals(pickMatchTouch([]), null);
});

const NOW = Date.now();

Deno.test("sendCapiBatch - envia o lote por dataset e registra o que foi enviado", async () => {
  const posted: { path: string; params?: Record<string, string | undefined> }[] = [];
  const graph = {
    post: (path: string, _t: string, params?: Record<string, string | undefined>) => {
      posted.push({ path, params });
      return Promise.resolve({ events_received: 1, fbtrace_id: "TRACE" });
    },
  } as unknown as Graph;
  const { db, ops } = fakeDb((op) => {
    if (op.kind === "rpc" && op.table === "_crm_capi_claim") {
      return {
        data: [
          { id: "c1", equipe_id: "eq", lead_id: "L1", event_name: "qualified", event_id: "E1", event_time: new Date(NOW - 60_000).toISOString(), attempts: 1 },
          { id: "c2", equipe_id: "eq", lead_id: "L2", event_name: "qualified", event_id: "E2", event_time: new Date(NOW - 60_000).toISOString(), attempts: 1 },
        ],
      };
    }
    if (op.kind === "select" && op.table === "crm_integrations") {
      return { data: { id: "int", status: "connected", settings: { dataset_id: "D1", capi_enabled: true, lead_event_source: "Rev" } } };
    }
    if (op.kind === "rpc" && op.table === "_crm_integration_key") return { data: "SYS" };
    if (op.kind === "select" && op.table === "leads") {
      const id = op.filters.find(([, c]) => c === "id")?.[2];
      return { data: id === "L1" ? { id, email: null, phone: null, created_at: new Date(NOW - 86400_000).toISOString() } : { id, email: null, phone: null, created_at: new Date(NOW - 86400_000).toISOString() } };
    }
    if (op.kind === "select" && op.table === "lead_touches") {
      const id = op.filters.find(([, c]) => c === "lead_id")?.[2];
      return { data: id === "L1" ? [{ occurred_at: new Date(NOW - 86400_000).toISOString(), leadgen_id: "12345678901234567" }] : [] };
    }
  });
  const r = await sendCapiBatch(db, graph);
  assertEquals(r, { claimed: 2, sent: 1, skipped: 1, failed: 0 });
  assertEquals(posted.length, 1);
  assertEquals(posted[0].path, "/D1/events");
  const data = JSON.parse(posted[0].params!.data!);
  assertEquals(data.length, 1);
  assertEquals(data[0].user_data.lead_id, "12345678901234567");
  assert(posted[0].params!.data!.includes('"lead_id":"12345678901234567"'), "lead_id vai como texto");
  const fin = ops.filter((o) => o.table === "_crm_capi_finish").map((o) => o.args as Record<string, unknown>);
  assertEquals(fin.find((f) => f.p_id === "c1")?.p_status, "sent");
  assertEquals(fin.find((f) => f.p_id === "c2")?.p_status, "skipped");
  assertEquals(fin.find((f) => f.p_id === "c2")?.p_reason, "no_match_key");
});

Deno.test("sendCapiBatch - CAPI desligada ou sem dataset: pula", async () => {
  const graph = { post: () => Promise.reject(new Error("não devia enviar")) } as unknown as Graph;
  const { db, ops } = fakeDb((op) => {
    if (op.kind === "rpc" && op.table === "_crm_capi_claim") {
      return { data: [{ id: "c1", equipe_id: "eq", lead_id: "L1", event_name: "q", event_id: "E1", event_time: new Date().toISOString(), attempts: 1 }] };
    }
    if (op.kind === "select" && op.table === "crm_integrations") {
      return { data: { id: "int", status: "connected", settings: { capi_enabled: false } } };
    }
  });
  const r = await sendCapiBatch(db, graph);
  assertEquals(r.skipped, 1);
  assertEquals((ops.find((o) => o.table === "_crm_capi_finish")!.args as Record<string, unknown>).p_reason, "capi_off");
});
