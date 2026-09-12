import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveActiveOpportunity, toDbStageType } from "./opportunities.ts";

// ============================================================================
// Sprint 11 · T7 — the contract every inbound writer depends on.
//
// These tests exist because of a real production failure. Sprint 6.8 rewrote
// stage_type to Portuguese ('aberto'/'ganho'/'perdido'), and the revert back to
// English ('open'/'won'/'lost') missed this helper. It kept asking for the first
// stage with stage_type = 'aberto' — a value no stage has — so from 23/06 on no
// WhatsApp or webhook lead ever became a deal: ~300 leads across Casa Flow,
// Cinemas Benficas and Solo Energia never reached a Kanban. The AI's
// intent-based stage moves failed the same way.
//
// The fake client below answers a stage lookup ONLY when it asks for 'open', so
// the broken helper fails here exactly the way it failed in production.
// ============================================================================

type Filter = [string, unknown];
interface Call {
  table: string;
  op: "select" | "insert" | "rpc";
  filters: Filter[];
  row?: Record<string, unknown>;
}

function fakeClient(opts: {
  openOpp?: { id: string; pipeline_id: string; stage_id: string } | null;
  defaultPipelineId?: string | null;
  /** stages that exist, by pipeline id → first open stage id */
  openStageByPipeline?: Record<string, string>;
  /** Sprint 11 · T55 — crm_intake_pipeline; default: the requested line, else the team default. */
  intake?: (pipelineId: string | null) => string | null;
  intakeFails?: boolean;
}) {
  const calls: Call[] = [];

  const respond = (call: Call) => {
    const f = Object.fromEntries(call.filters);
    if (call.table === "opportunities" && call.op === "select") {
      const want = f["pipeline_id"];
      const opp = opts.openOpp ?? null;
      if (opp && (want === undefined || want === opp.pipeline_id)) return { data: opp, error: null };
      return { data: null, error: null };
    }
    if (call.table === "equipes") {
      return { data: { default_pipeline_id: opts.defaultPipelineId ?? null }, error: null };
    }
    if (call.table === "pipeline_stages_v2") {
      if (f["stage_type"] !== "open") return { data: null, error: null };
      const stageId = opts.openStageByPipeline?.[f["pipeline_id"] as string];
      return {
        data: stageId ? { id: stageId, pipeline_id: f["pipeline_id"] } : null,
        error: null,
      };
    }
    if (call.table === "opportunities" && call.op === "insert") {
      return {
        data: { id: "new-opp", pipeline_id: call.row?.pipeline_id, stage_id: call.row?.stage_id },
        error: null,
      };
    }
    return { data: null, error: null };
  };

  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ table: fn, op: "rpc", filters: Object.entries(args) });
      if (fn !== "crm_intake_pipeline") return Promise.resolve({ data: null, error: null });
      if (opts.intakeFails) return Promise.resolve({ data: null, error: { message: "function does not exist" } });
      const requested = (args.p_pipeline_id as string | null) ?? null;
      const decide = opts.intake ?? ((pid: string | null) => pid ?? opts.defaultPipelineId ?? null);
      return Promise.resolve({ data: decide(requested), error: null });
    },
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => (call.filters.push([col, val]), b),
        is: (col: string, val: unknown) => (call.filters.push([col, val]), b),
        order: () => b,
        limit: () => b,
        insert: (row: Record<string, unknown>) => ((call.op = "insert"), (call.row = row), b),
        maybeSingle: () => Promise.resolve(respond(call)),
        single: () => Promise.resolve(respond(call)),
      };
      return b;
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

Deno.test("a new lead becomes a deal in the first OPEN stage of the default pipeline", async () => {
  const { client, calls } = fakeClient({
    openOpp: null,
    defaultPipelineId: "pipe-default",
    openStageByPipeline: { "pipe-default": "stage-1" },
  });

  const result = await resolveActiveOpportunity(client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
  });

  assertEquals(result?.created, true);
  assertEquals(result?.pipeline_id, "pipe-default");
  assertEquals(result?.stage_id, "stage-1");
  const insert = calls.find((c) => c.op === "insert");
  assertEquals(insert?.row?.stage_id, "stage-1");
});

Deno.test("an explicit pipeline_id wins over the team default", async () => {
  // An inbound webhook configured for "Carregamento Veicular" must not drop its
  // leads into the default solar pipeline.
  const { client, calls } = fakeClient({
    openOpp: null,
    defaultPipelineId: "pipe-default",
    openStageByPipeline: { "pipe-default": "stage-1", "pipe-ev": "stage-ev" },
  });

  const result = await resolveActiveOpportunity(client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
    pipeline_id: "pipe-ev",
  });

  assertEquals(result?.pipeline_id, "pipe-ev");
  assertEquals(result?.stage_id, "stage-ev");
  assertEquals(calls.some((c) => c.table === "equipes"), false, "should not need the team default");
});

Deno.test("with a pipeline_id, only an open deal of THAT pipeline is reused", async () => {
  const { client } = fakeClient({
    openOpp: { id: "solar-opp", pipeline_id: "pipe-default", stage_id: "s" },
    defaultPipelineId: "pipe-default",
    openStageByPipeline: { "pipe-ev": "stage-ev" },
  });

  const result = await resolveActiveOpportunity(client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
    pipeline_id: "pipe-ev",
  });

  assertEquals(result?.created, true);
  assertEquals(result?.pipeline_id, "pipe-ev");
});

Deno.test("an existing open deal is reused, not duplicated", async () => {
  const { client, calls } = fakeClient({
    openOpp: { id: "open-opp", pipeline_id: "pipe-default", stage_id: "s" },
    defaultPipelineId: "pipe-default",
  });

  const result = await resolveActiveOpportunity(client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
  });

  assertEquals(result?.opportunity_id, "open-opp");
  assertEquals(result?.created, false);
  assertEquals(calls.some((c) => c.op === "insert"), false);
});

// ---------------------------------------------------------------------------
// Sprint 11 · T55 — a campaign line that ended takes no new deal.
// ---------------------------------------------------------------------------

const endedToDefault = (pid: string | null) => (pid === null || pid === "pipe-bf" ? "pipe-default" : pid);

Deno.test("a campaign line that ended sends the new deal to the team default", async () => {
  const { client, calls } = fakeClient({
    openOpp: null,
    defaultPipelineId: "pipe-default",
    openStageByPipeline: { "pipe-default": "stage-1", "pipe-bf": "stage-bf" },
    intake: endedToDefault,
  });

  const result = await resolveActiveOpportunity(client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
    pipeline_id: "pipe-bf",
  });

  assertEquals(result?.created, true);
  assertEquals(result?.pipeline_id, "pipe-default");
  assertEquals(calls.find((c) => c.op === "insert")?.row?.pipeline_id, "pipe-default");
});

Deno.test("swapped to the default: an open deal already there is reused, not duplicated", async () => {
  const { client, calls } = fakeClient({
    openOpp: { id: "default-opp", pipeline_id: "pipe-default", stage_id: "s" },
    defaultPipelineId: "pipe-default",
    openStageByPipeline: { "pipe-default": "stage-1" },
    intake: endedToDefault,
  });

  const result = await resolveActiveOpportunity(client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
    pipeline_id: "pipe-bf",
  });

  assertEquals(result?.opportunity_id, "default-opp");
  assertEquals(result?.created, false);
  assertEquals(calls.some((c) => c.op === "insert"), false);
});

Deno.test("an open deal in the ended line itself keeps being worked", async () => {
  const { client, calls } = fakeClient({
    openOpp: { id: "bf-opp", pipeline_id: "pipe-bf", stage_id: "s" },
    defaultPipelineId: "pipe-default",
    intake: endedToDefault,
  });

  const result = await resolveActiveOpportunity(client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
    pipeline_id: "pipe-bf",
  });

  assertEquals(result?.opportunity_id, "bf-opp");
  assertEquals(calls.some((c) => c.op === "rpc"), false, "no need to ask where a new deal goes");
});

Deno.test("the entry's line takes the new deal — asked only when one is about to be created", async () => {
  let asked = 0;
  const createIn = () => ((asked += 1), Promise.resolve("pipe-wpp"));

  const fresh = fakeClient({
    openOpp: null,
    defaultPipelineId: "pipe-default",
    openStageByPipeline: { "pipe-default": "stage-1", "pipe-wpp": "stage-wpp" },
  });
  const created = await resolveActiveOpportunity(fresh.client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
    createIn,
  });
  assertEquals(created?.pipeline_id, "pipe-wpp");
  assertEquals(created?.stage_id, "stage-wpp");

  // A lead with an open deal anywhere keeps it; the entry's line is not even asked.
  const returning = fakeClient({ openOpp: { id: "open-opp", pipeline_id: "pipe-default", stage_id: "s" } });
  const reused = await resolveActiveOpportunity(returning.client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
    createIn,
  });
  assertEquals(reused?.opportunity_id, "open-opp");
  assertEquals(asked, 1);
});

Deno.test("if the database cannot say where, the door still works the old way", async () => {
  const { client, calls } = fakeClient({
    openOpp: null,
    defaultPipelineId: "pipe-default",
    openStageByPipeline: { "pipe-default": "stage-1" },
    intakeFails: true,
  });

  const result = await resolveActiveOpportunity(client, {
    equipe_id: "eq",
    lead_id: "lead",
    createIfMissing: true,
  });

  assertEquals(result?.pipeline_id, "pipe-default");
  assertEquals(calls.some((c) => c.table === "equipes"), true);
});

Deno.test("stage types written the old Portuguese way map to what the database stores", () => {
  assertEquals(toDbStageType("aberto"), "open");
  assertEquals(toDbStageType("ganho"), "won");
  assertEquals(toDbStageType("perdido"), "lost");
  assertEquals(toDbStageType("ciclo"), "ciclo");
  assertEquals(toDbStageType("open"), "open");
  assertEquals(toDbStageType("won"), "won");
  assertEquals(toDbStageType("lost"), "lost");
});
