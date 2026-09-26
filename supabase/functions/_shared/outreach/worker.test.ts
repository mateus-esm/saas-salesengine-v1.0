// deno-lint-ignore-file no-import-prefix require-await
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { persistDeliveredMessage } from "./persist.ts";
import type {
  DeliveryResult,
  OutreachLine,
  OutreachProvider,
} from "./providers.ts";
import {
  type JobContext,
  type OutreachJob,
  processOutreachBatch,
  type WorkerDependencies,
} from "./worker.ts";

const line: OutreachLine = {
  provider: "solo",
  ref: "instance",
  lineId: "line-id",
  key: "solo:line-id",
};
const sent: DeliveryResult = {
  outcome: "sent",
  retryable: false,
  providerStatus: 200,
  providerBody: { ok: true },
  providerMessageId: "provider-message",
  providerChatId: null,
};
const context: JobContext = {
  lead: { id: "lead", name: "Maria", phone: "11999999999", source: "Ads" },
  enrollment: { id: "enrollment", sequence_id: "sequence" },
  step: { message_template: "Oi {{lead.first_name}}" },
  settings: {
    provider: "solo",
    channel_id: null,
    solo_instance_id: "line-id",
    send_window_start: "08:00",
    send_window_end: "20:00",
    timezone: "America/Sao_Paulo",
    max_sends_per_line_hour: 30,
  },
  tenant: { name: "Tenant" },
};
const job = (id: string): OutreachJob => ({
  id,
  equipe_id: "team",
  enrollment_id: "enrollment",
  step_id: "step",
  step_position: 0,
  lead_id: "lead",
});

function fakeProvider(deliver: OutreachProvider["deliver"]): OutreachProvider {
  return {
    id: "solo",
    resolveLine: async () => ({ line }),
    deliver,
  };
}

function dependencies(jobs: OutreachJob[], provider: OutreachProvider) {
  const finishes: unknown[][] = [];
  const defers: unknown[][] = [];
  let persists = 0;
  const deps: WorkerDependencies = {
    claim: async () => jobs,
    loadContext: async () => context,
    isSuspended: async () => false,
    lineUsage: async () => 0,
    defer: async (...args) => {
      defers.push(args);
    },
    finish: async (...args) => {
      finishes.push(args);
    },
    persist: async (_job, _context, _text, _line, delivery) => {
      persists++;
      assertEquals(delivery.providerMessageId, "provider-message");
      return "conversation";
    },
    provider: () => provider,
    now: () => new Date("2026-09-25T15:00:00Z"),
  };
  return { deps, finishes, defers, getPersists: () => persists };
}

Deno.test("job sent persiste provider_message_id e fecha como sent", async () => {
  const setup = dependencies([job("J1")], fakeProvider(async () => sent));
  const result = await processOutreachBatch(setup.deps);
  assertEquals(result, { claimed: 1, processed: 1, errors: 0 });
  assertEquals(setup.getPersists(), 1);
  assertEquals(setup.finishes[0][1], "sent");
  assertEquals(
    (setup.finishes[0][3] as Record<string, unknown>).provider_message_id,
    "provider-message",
  );
});

Deno.test("exceção em um job não interrompe o próximo", async () => {
  let deliveries = 0;
  const provider = fakeProvider(async () => {
    deliveries++;
    if (deliveries === 1) throw new Error("quebrou");
    return sent;
  });
  const setup = dependencies([job("J1"), job("J2")], provider);
  const result = await processOutreachBatch(setup.deps);
  assertEquals(result.claimed, 2);
  assertEquals(result.errors, 1);
  assertEquals(setup.finishes.map((finish) => finish[1]), ["failed", "sent"]);
});

Deno.test("fora da janela adia sem chamar provider", async () => {
  let deliveries = 0;
  const setup = dependencies(
    [job("J1")],
    fakeProvider(async () => {
      deliveries++;
      return sent;
    }),
  );
  setup.deps.now = () => new Date("2026-09-25T09:00:00Z");
  await processOutreachBatch(setup.deps);
  assertEquals(deliveries, 0);
  assertEquals(setup.defers.length, 1);
  assertEquals(
    (setup.defers[0][1] as Date).toISOString(),
    "2026-09-25T11:00:00.000Z",
  );
});

Deno.test("persistência grava mensagem Solo com provider_message_id", async () => {
  const messages: Record<string, unknown>[] = [];
  const activities: Record<string, unknown>[] = [];
  const supabase = {
    from: (table: string) => {
      if (table === "conversations") {
        const read = {
          select: () => read,
          eq: () => read,
          neq: () => read,
          order: () => read,
          limit: () => read,
          maybeSingle: async () => ({ data: null, error: null }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "C1" }, error: null }),
            }),
          }),
        };
        return read;
      }
      return {
        insert: async (row: Record<string, unknown>) => {
          if (table === "messages") messages.push(row);
          if (table === "lead_activities") activities.push(row);
          return { error: null };
        },
      };
    },
  };
  const conversationId = await persistDeliveredMessage(supabase, {
    jobId: "J1",
    enrollmentId: "E1",
    sequenceId: "S1",
    stepPosition: 0,
    equipeId: "T1",
    leadId: "L1",
    text: "oi",
    line,
    delivery: sent,
  });
  assertEquals(conversationId, "C1");
  assertEquals(messages[0].provider, "solo");
  assertEquals(messages[0].provider_message_id, "provider-message");
  assertEquals(activities.length, 1);
});

// ── SE-REV-005 — guarda de abertura ─────────────────────────────────────────

Deno.test("passo 0 com lead já em atendimento: não envia, pula e cancela a inscrição", async () => {
  let deliveries = 0;
  const cancels: unknown[][] = [];
  const setup = dependencies(
    [job("J1")],
    fakeProvider(async () => {
      deliveries++;
      return sent;
    }),
  );
  setup.deps.inService = async () => ({
    inService: true,
    lastCustomerMessageAt: "2026-09-25T14:50:00Z",
  });
  setup.deps.cancelEnrollment = async (...args) => {
    cancels.push(args);
  };
  const result = await processOutreachBatch(setup.deps);
  assertEquals(result, { claimed: 1, processed: 1, errors: 0 });
  assertEquals(deliveries, 0);
  assertEquals(cancels, [["enrollment", "lead_replied"]]);
  assertEquals(setup.finishes[0].slice(1, 3), [
    "skipped",
    "already_in_service",
  ]);
});

Deno.test("passo 0 com lead novo: envia normalmente", async () => {
  const setup = dependencies([job("J1")], fakeProvider(async () => sent));
  setup.deps.inService = async () => ({
    inService: false,
    lastCustomerMessageAt: null,
  });
  await processOutreachBatch(setup.deps);
  assertEquals(setup.finishes[0][1], "sent");
});

Deno.test("follow-up (passo 1) não passa pela guarda: stop_on_reply já cuida", async () => {
  let checks = 0;
  const setup = dependencies(
    [{ ...job("J1"), step_position: 1 }],
    fakeProvider(async () => sent),
  );
  setup.deps.inService = async () => {
    checks++;
    return { inService: true, lastCustomerMessageAt: "2026-09-25T14:50:00Z" };
  };
  await processOutreachBatch(setup.deps);
  assertEquals(checks, 0);
  assertEquals(setup.finishes[0][1], "sent");
});

Deno.test("falha ao checar atendimento adia o job em vez de enviar", async () => {
  let deliveries = 0;
  const setup = dependencies(
    [job("J1")],
    fakeProvider(async () => {
      deliveries++;
      return sent;
    }),
  );
  setup.deps.inService = async () => ({
    inService: true,
    lastCustomerMessageAt: null,
    error: "timeout",
  });
  await processOutreachBatch(setup.deps);
  assertEquals(deliveries, 0);
  assertEquals(setup.defers[0][2], "in_service_check_failed");
  assertEquals(setup.finishes.length, 0);
});
