import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { insertConversationOnce } from "./conversation-once.ts";

// Cliente falso: grava as chamadas e devolve o que o cenário manda.
function fake(opts: { insertError?: { code: string } | null; existing?: { id: string } | null }) {
  const calls: Array<[string, unknown]> = [];
  const q: any = {
    insert(row: unknown) { calls.push(["insert", row]); return q; },
    update(patch: unknown) { calls.push(["update", patch]); return q; },
    select() { return q; },
    eq() { return q; },
    is() { return q; },
    order() { return q; },
    limit() { return q; },
    single() { return Promise.resolve(opts.insertError ? { data: null, error: opts.insertError } : { data: { id: "new" }, error: null }); },
    maybeSingle() { return Promise.resolve({ data: opts.existing ?? null, error: null }); },
    then(res: (v: unknown) => unknown) { return Promise.resolve({ error: null }).then(res); },
  };
  return { client: { from: () => q } as any, calls };
}

const row = { lead_id: "l", equipe_id: "e", channel: "whatsapp", status: "active", unread_count: 0, atendido_por_agente: false, last_message_at: "t", solo_instance_id: "i" };

Deno.test("sem corrida: insere e devolve created", async () => {
  const { client } = fake({});
  assertEquals(await insertConversationOnce(client, row), { id: "new", created: true });
});

Deno.test("perdeu a corrida (23505): reaproveita a conversa vencedora e aplica o patch", async () => {
  const { client, calls } = fake({ insertError: { code: "23505" }, existing: { id: "winner" } });
  assertEquals(await insertConversationOnce(client, row), { id: "winner", created: false });
  const upd = calls.find((c) => c[0] === "update")![1] as Record<string, unknown>;
  assertEquals(upd.last_message_at, "t");
  assertEquals(upd.solo_instance_id, "i");
  // identidade e contadores não são regravados
  assertEquals("lead_id" in upd || "unread_count" in upd || "channel" in upd, false);
});

Deno.test("outro erro de banco é propagado", async () => {
  const { client } = fake({ insertError: { code: "42501" } });
  let threw = false;
  try { await insertConversationOnce(client, row); } catch { threw = true; }
  assertEquals(threw, true);
});

Deno.test("23505 sem vencedora visível: propaga o erro original", async () => {
  const { client } = fake({ insertError: { code: "23505" }, existing: null });
  let threw = false;
  try { await insertConversationOnce(client, row); } catch { threw = true; }
  assertEquals(threw, true);
});
