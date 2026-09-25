// SE-REV-002 · Fase 0 — correções da SE-REV-001. Arquivo separado para que os
// 25 testes originais (start-conversation.test.ts) continuem sem edição.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  callStartConversation,
  dispatchConversationOpen,
  entryMatches,
  intakeFilterFailure,
  providerAccepted,
} from "./start-conversation.ts";

/** Troca o fetch global durante `fn` e devolve o original no fim. */
async function withFetch(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const call = () =>
  callStartConversation({
    token: "t",
    channelId: "CH1",
    phone: "5511987654321",
    message: "oi",
  });

// ── Correção 1: 200 {success:false} não é conversa aberta ──────────────────

Deno.test("200 {success:false} é recusa do provider, não conversa aberta", async () => {
  await withFetch(
    async () =>
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    async () => {
      const out = await call();
      assertEquals(out.ok, false);
      assertEquals(out.errorCode, "provider_rejected");
      assertEquals(out.status, 200);
      assertEquals(out.body, { success: false });
    },
  );
});

Deno.test("200 {success:true} é conversa aberta", async () => {
  await withFetch(
    async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    async () => {
      const out = await call();
      assertEquals(out.ok, true);
      assertEquals(out.errorCode, undefined);
    },
  );
});

Deno.test("200 sem corpo é aceite (suposição registrada: a doc só define o corpo com success)", async () => {
  await withFetch(async () => new Response(null, { status: 200 }), async () => {
    const out = await call();
    assertEquals(out.ok, true);
  });
});

Deno.test("400 continua sendo recusa", async () => {
  await withFetch(
    async () => new Response(JSON.stringify({ error: "x" }), { status: 400 }),
    async () => {
      const out = await call();
      assertEquals(out.ok, false);
      assertEquals(out.errorCode, "provider_rejected");
    },
  );
});

Deno.test("providerAccepted: só success===true vale quando o campo existe", () => {
  assertEquals(providerAccepted({ success: true }), true);
  assertEquals(providerAccepted({ success: false }), false);
  assertEquals(providerAccepted({ success: "true" }), false);
  assertEquals(providerAccepted({ success: null }), false);
  assertEquals(providerAccepted({ chatId: "C1" }), true);
  assertEquals(providerAccepted(null), true);
  assertEquals(providerAccepted("ok"), true);
});

// ── Correção 3: filtro pela porta, com o source do evento ──────────────────

const PORTA = "5a000000-0000-0000-0000-0000000000e1";
const OUTRA = "5a000000-0000-0000-0000-0000000000e2";

Deno.test("entryMatches: lista vazia = qualquer porta; com filtro, só a porta listada", () => {
  assertEquals(entryMatches([], PORTA), true);
  assertEquals(entryMatches(null, null), true);
  assertEquals(entryMatches([PORTA], PORTA), true);
  assertEquals(entryMatches([PORTA], PORTA.toUpperCase()), true);
  assertEquals(entryMatches([PORTA], OUTRA), false);
  assertEquals(entryMatches([PORTA], null), false);
});

Deno.test("lead que voltou: vale o source do evento, não o leads.source antigo", () => {
  const settings = { trigger_sources: ["Anúncio"], trigger_entry_ids: [] };
  // leads.source = 'Manual' (primeiro cadastro), mas esta chegada veio do anúncio.
  assertEquals(
    intakeFilterFailure(settings, { source: "Anúncio", leadSource: "Manual" }),
    null,
  );
  // Sem source no evento (chamador antigo), cai no leads.source.
  assertEquals(
    intakeFilterFailure(settings, { leadSource: "Manual" }),
    "source_not_triggered",
  );
});

Deno.test("porta fora do filtro barra antes do source", () => {
  const settings = { trigger_sources: [], trigger_entry_ids: [PORTA] };
  assertEquals(
    intakeFilterFailure(settings, {
      entryId: PORTA,
      source: "webhook_inbound",
    }),
    null,
  );
  assertEquals(
    intakeFilterFailure(settings, {
      entryId: OUTRA,
      source: "webhook_inbound",
    }),
    "entry_not_triggered",
  );
  assertEquals(
    intakeFilterFailure(settings, { source: "webhook_inbound" }),
    "entry_not_triggered",
  );
});

/** Cliente falso: só o que loadOpenerSettings lê. */
function fakeSettingsClient(row: Record<string, unknown> | null) {
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        contains: () => chain,
        in: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data: table === "conversation_opener_settings" ? row : null,
          error: null,
        }),
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: table === "cadence_sequences" ? [] : null,
            error: null,
          }),
      };
      return chain;
    },
  };
}

Deno.test("dispatcher: porta fora do filtro não chama a função (nenhum fetch)", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return new Response("{}", { status: 200 });
  }, async () => {
    const supabase = fakeSettingsClient({
      equipe_id: "t1",
      enabled: true,
      trigger_sources: [],
      trigger_entry_ids: [PORTA],
      first_message: "oi",
    });
    const out = await dispatchConversationOpen(supabase, {
      equipeId: "t1",
      leadId: "l1",
      entryId: OUTRA,
    });
    assertEquals(out, { dispatched: false, reason: "entry_not_triggered" });
  });
  assertEquals(calls, 0);
});

Deno.test("dispatcher: porta certa manda source e entry_id no corpo", async () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "http://local.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");
  let sent: Record<string, unknown> | null = null;
  try {
    await withFetch(async (_input, init) => {
      sent = JSON.parse(String(init?.body ?? "{}"));
      return new Response("{}", { status: 200 });
    }, async () => {
      const supabase = fakeSettingsClient({
        equipe_id: "t1",
        enabled: true,
        trigger_sources: [],
        trigger_entry_ids: [PORTA],
        first_message: "oi",
      });
      const out = await dispatchConversationOpen(supabase, {
        equipeId: "t1",
        leadId: "l1",
        entryId: PORTA,
        source: "webhook_inbound",
      });
      assertEquals(out.dispatched, true);
    });
  } finally {
    if (prevUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevKey === undefined) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
  }
  assertEquals(sent!.entry_id, PORTA);
  assertEquals(sent!.source, "webhook_inbound");
  assertEquals(sent!.trigger_source, "lead_intake");
});

Deno.test("dispatcher: sequência ativa para a porta não chama o HTTP legado", async () => {
  let fetches = 0;
  const supabase = {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        contains: () => chain,
        in: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data: table === "conversation_opener_settings"
            ? {
              equipe_id: "t1",
              enabled: true,
              trigger_sources: [],
              trigger_entry_ids: [PORTA],
            }
            : table === "cadence_enrollments"
            ? { id: "enrollment" }
            : null,
          error: null,
        }),
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: table === "cadence_sequences" ? [{ id: "sequence" }] : null,
            error: null,
          }),
      };
      return chain;
    },
  };
  await withFetch(async () => {
    fetches++;
    return new Response("{}", { status: 200 });
  }, async () => {
    const result = await dispatchConversationOpen(supabase, {
      equipeId: "t1",
      leadId: "l1",
      entryId: PORTA,
      source: "webhook_inbound",
    });
    assertEquals(result, { dispatched: true, reason: "cadence" });
  });
  assertEquals(fetches, 0);
});
