// Caracterização: o que a rota /inbound do crm-webhook fazia com o lead
// (antes da extração) continua igual — mesmo insert, mesmo update.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { fakeDb } from "./fake-db.ts";
import { INBOUND_WEBHOOK_ORIGIN, upsertInboundLead } from "./ingest-lead.ts";

const EQ = "eq-1";

Deno.test("upsertInboundLead - lead novo: o insert da rota /inbound", async () => {
  const { db, ops } = fakeDb((op) => {
    if (op.kind === "rpc") return { data: null };
    if (op.kind === "insert") return { data: { id: "L1" } };
  });
  const r = await upsertInboundLead(db, {
    equipeId: EQ,
    name: "Ana",
    email: "ana@x.com",
    phone: "(85) 99648-7923",
    tags: ["form"],
    observations: "obs",
    custom_fields: { a: 1 },
    origin: INBOUND_WEBHOOK_ORIGIN,
  });
  assertEquals(r, { ok: true, leadId: "L1", isNew: true });
  assertEquals(ops[0], { kind: "rpc", table: "crm_find_lead_by_phone", args: { p_equipe_id: EQ, p_phone: "(85) 99648-7923" }, filters: [] });
  const ins = ops.find((o) => o.kind === "insert")!;
  assertEquals(ins.table, "leads");
  assertEquals(ins.args, {
    equipe_id: EQ,
    name: "Ana",
    email: "ana@x.com",
    phone: "85996487923",
    source: "webhook_inbound",
    origem: "webhook",
    creation_source: "webhook",
    created_by_type: "webhook",
    atendido_por_agente: false,
    tags: ["form"],
    observations: "obs",
    custom_fields: { a: 1 },
  });
});

Deno.test("upsertInboundLead - telefone conhecido: o update da rota /inbound", async () => {
  const { db, ops } = fakeDb((op) => {
    if (op.kind === "rpc") return { data: "L9" };
    if (op.kind === "select") return { data: { id: "L9", custom_fields: { old: 1 }, tags: ["x"], observations: "antiga" } };
  });
  const r = await upsertInboundLead(db, {
    equipeId: EQ,
    name: "Ana",
    phone: "85996487923",
    observations: "nova",
    custom_fields: { a: 1 },
    origin: INBOUND_WEBHOOK_ORIGIN,
  });
  assertEquals(r, { ok: true, leadId: "L9", isNew: false });
  const up = ops.find((o) => o.kind === "update")!;
  assertEquals(up.args, { observations: "nova", custom_fields: { old: 1, a: 1 } });
  assertEquals(up.filters, [["eq", "id", "L9"]]);
  assertEquals(ops.some((o) => o.kind === "insert"), false);
});

Deno.test("upsertInboundLead - sem telefone: insere sem consultar", async () => {
  const { db, ops } = fakeDb((op) => (op.kind === "insert" ? { data: { id: "L2" } } : undefined));
  const r = await upsertInboundLead(db, { equipeId: EQ, name: "Sem fone", origin: INBOUND_WEBHOOK_ORIGIN });
  assertEquals(r, { ok: true, leadId: "L2", isNew: true });
  assertEquals(ops.filter((o) => o.kind === "rpc").length, 0);
  assertEquals((ops[0].args as Record<string, unknown>).phone, null);
});

Deno.test("upsertInboundLead - erro do insert volta como erro", async () => {
  const { db } = fakeDb((op) => (op.kind === "insert" ? { error: { message: "boom" } } : undefined));
  const r = await upsertInboundLead(db, { equipeId: EQ, name: "X", origin: INBOUND_WEBHOOK_ORIGIN });
  assertEquals(r, { ok: false, error: "boom" });
});

Deno.test("upsertInboundLead - porta Meta: e-mail como 2ª chave e observação acrescentada", async () => {
  const { db, ops } = fakeDb((op) => {
    if (op.kind === "rpc") return { data: null };
    if (op.kind === "select" && op.filters.some(([, c]) => c === "email")) {
      return { data: { id: "L5", custom_fields: {}, tags: [], observations: "antiga" } };
    }
  });
  const r = await upsertInboundLead(db, {
    equipeId: EQ,
    name: "Ana",
    email: "ana@x.com",
    phone: "85996487923",
    observations: "nova",
    origin: { source: "meta_lead_ads", origem: "meta_lead_ads", creation_source: "form", created_by_type: "webhook" },
    matchEmail: true,
    appendObservations: true,
  });
  assertEquals(r, { ok: true, leadId: "L5", isNew: false });
  const up = ops.find((o) => o.kind === "update")!;
  assertEquals((up.args as Record<string, unknown>).observations, "antiga\n\nnova");
});
