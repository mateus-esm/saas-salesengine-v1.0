// deno-lint-ignore-file no-import-prefix require-await
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { gptMakerProvider } from "./gptmaker.ts";
import type { OutreachLine, OutreachSettings } from "./providers.ts";
import { soloProvider } from "./solo.ts";

const GPT_LINE: OutreachLine = {
  provider: "gptmaker",
  ref: "canal-1",
  lineId: "canal-1",
  key: "gptmaker:canal-1",
};
const SOLO_LINE: OutreachLine = {
  provider: "solo",
  ref: "instancia-1",
  lineId: "linha-1",
  key: "solo:linha-1",
};

async function withFetch(
  response: () => Promise<Response>,
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = response as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("adaptador GPT Maker classifica success true/false, 403 e 503", async () => {
  const previous = Deno.env.get("GPT_MAKER_TOKEN");
  Deno.env.set("GPT_MAKER_TOKEN", "teste");
  try {
    for (
      const fixture of [
        {
          status: 200,
          body: { success: true },
          outcome: "sent",
          retryable: false,
        },
        {
          status: 200,
          body: { success: false },
          outcome: "rejected",
          retryable: false,
        },
        {
          status: 403,
          body: { error: "forbidden" },
          outcome: "rejected",
          retryable: false,
        },
        {
          status: 503,
          body: { error: "down" },
          outcome: "rejected",
          retryable: true,
        },
      ] as const
    ) {
      await withFetch(
        async () =>
          new Response(JSON.stringify(fixture.body), {
            status: fixture.status,
          }),
        async () => {
          const result = await gptMakerProvider.deliver(GPT_LINE, {
            phone: "5511999999999",
            text: "oi",
          });
          assertEquals(result.outcome, fixture.outcome);
          assertEquals(result.retryable, fixture.retryable);
        },
      );
    }
  } finally {
    if (previous === undefined) Deno.env.delete("GPT_MAKER_TOKEN");
    else Deno.env.set("GPT_MAKER_TOKEN", previous);
  }
});

Deno.test("adaptador GPT Maker trata abort como entrega incerta", async () => {
  const previous = Deno.env.get("GPT_MAKER_TOKEN");
  Deno.env.set("GPT_MAKER_TOKEN", "teste");
  try {
    await withFetch(
      async () => {
        const error = new Error("The signal has been aborted");
        error.name = "AbortError";
        throw error;
      },
      async () => {
        const result = await gptMakerProvider.deliver(GPT_LINE, {
          phone: "5511999999999",
          text: "oi",
        });
        assertEquals(result.outcome, "unknown");
        assertEquals(result.retryable, false);
      },
    );
  } finally {
    if (previous === undefined) Deno.env.delete("GPT_MAKER_TOKEN");
    else Deno.env.set("GPT_MAKER_TOKEN", previous);
  }
});

Deno.test("adaptador Solo exige key.id e classifica HTTP 4xx", async () => {
  const oldUrl = Deno.env.get("WHATSMIAU_BASE_URL");
  const oldKey = Deno.env.get("WHATSMIAU_API_KEY");
  Deno.env.set("WHATSMIAU_BASE_URL", "https://solo.test");
  Deno.env.set("WHATSMIAU_API_KEY", "teste");
  try {
    await withFetch(
      async () =>
        new Response(JSON.stringify({ key: { id: "M1" } }), { status: 200 }),
      async () => {
        const result = await soloProvider.deliver(SOLO_LINE, {
          phone: "5511999999999",
          text: "oi",
        });
        assertEquals(result.outcome, "sent");
        assertEquals(result.providerMessageId, "M1");
      },
    );
    await withFetch(
      async () =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      async () => {
        const result = await soloProvider.deliver(SOLO_LINE, {
          phone: "5511999999999",
          text: "oi",
        });
        assertEquals(result.outcome, "unknown");
      },
    );
    await withFetch(
      async () => new Response("bad", { status: 400 }),
      async () => {
        const result = await soloProvider.deliver(SOLO_LINE, {
          phone: "5511999999999",
          text: "oi",
        });
        assertEquals(result.outcome, "rejected");
        assertEquals(result.retryable, false);
      },
    );
  } finally {
    if (oldUrl === undefined) Deno.env.delete("WHATSMIAU_BASE_URL");
    else Deno.env.set("WHATSMIAU_BASE_URL", oldUrl);
    if (oldKey === undefined) Deno.env.delete("WHATSMIAU_API_KEY");
    else Deno.env.set("WHATSMIAU_API_KEY", oldKey);
  }
});

type Instance = {
  id: string;
  equipe_id: string;
  instance_name: string;
  status: string;
};

function fakeInstances(rows: Instance[]) {
  return {
    from: () => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        limit: async (count: number) => ({
          data: rows.filter((row) =>
            Object.entries(filters).every(([key, value]) =>
              row[key as keyof Instance] === value
            )
          ).slice(0, count),
          error: null,
        }),
        maybeSingle: async () => ({
          data:
            rows.find((row) =>
              Object.entries(filters).every(([key, value]) =>
                row[key as keyof Instance] === value
              )
            ) ?? null,
          error: null,
        }),
      };
      return chain;
    },
  };
}

const settings = (soloInstanceId: string | null): OutreachSettings => ({
  provider: "solo",
  channel_id: null,
  solo_instance_id: soloInstanceId,
});

Deno.test("resolução Solo: fixada, desconectada, outra equipe e ambígua", async () => {
  const connected = {
    id: "I1",
    equipe_id: "T1",
    instance_name: "one",
    status: "connected",
  };
  const fixed = await soloProvider.resolveLine({
    supabase: fakeInstances([connected]),
    equipeId: "T1",
    settings: settings("I1"),
  });
  assertEquals("line" in fixed && fixed.line.ref, "one");

  const disconnected = await soloProvider.resolveLine({
    supabase: fakeInstances([{ ...connected, status: "awaiting_qr" }]),
    equipeId: "T1",
    settings: settings("I1"),
  });
  assertEquals(
    "errorCode" in disconnected && disconnected.errorCode,
    "line_not_connected",
  );

  const foreign = await soloProvider.resolveLine({
    supabase: fakeInstances([{ ...connected, equipe_id: "T2" }]),
    equipeId: "T1",
    settings: settings("I1"),
  });
  assertEquals("errorCode" in foreign && foreign.errorCode, "line_other_team");

  const ambiguous = await soloProvider.resolveLine({
    supabase: fakeInstances([connected, {
      ...connected,
      id: "I2",
      instance_name: "two",
    }]),
    equipeId: "T1",
    settings: settings(null),
  });
  assertEquals(
    "errorCode" in ambiguous && ambiguous.errorCode,
    "line_ambiguous",
  );
});
