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
  op: "select" | "insert";
  filters: Filter[];
  row?: Record<string, unknown>;
}

function fakeClient(opts: {
  openOpp?: { id: string; pipeline_id: string; stage_id: string } | null;
  defaultPipelineId?: string | null;
  /** stages that exist, by pipeline id → first open stage id */
  openStageByPipeline?: Record<string, string>;
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

Deno.test("stage types written the old Portuguese way map to what the database stores", () => {
  assertEquals(toDbStageType("aberto"), "open");
  assertEquals(toDbStageType("ganho"), "won");
  assertEquals(toDbStageType("perdido"), "lost");
  assertEquals(toDbStageType("ciclo"), "ciclo");
  assertEquals(toDbStageType("open"), "open");
  assertEquals(toDbStageType("won"), "won");
  assertEquals(toDbStageType("lost"), "lost");
});
