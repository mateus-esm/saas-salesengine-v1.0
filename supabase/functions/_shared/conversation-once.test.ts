import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { insertConversationOnce, updateConversationOnce } from "./conversation-once.ts";

// Cliente falso: grava as chamadas e devolve o que o cenário manda.
function fake(opts: { insertError?: { code: string } | null; existing?: { id: string; last_message_at?: string | null } | null; updateError?: { code: string } | null }) {
  const calls: Array<[string, unknown]> = [];
  const q: any = {
    insert(row: unknown) { calls.push(["insert", row]); return q; },
    update(patch: unknown) { calls.push(["update", patch]); q._upd = calls.filter((c) => c[0] === "update").length; return q; },
    select() { return q; },
    eq() { return q; },
    is() { return q; },
    order() { return q; },
    limit() { return q; },
    single() { return Promise.resolve(opts.insertError ? { data: null, error: opts.insertError } : { data: { id: "new" }, error: null }); },
    maybeSingle() { return Promise.resolve({ data: opts.existing ?? null, error: null }); },
    then(res: (v: unknown) => unknown) {
      // o 1º update é o do chamador (pode falhar); os seguintes são o patch na vencedora
      const err = q._upd === 1 ? (opts.updateError ?? null) : null;
      return Promise.resolve({ error: err }).then(res);
    },
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
  assertEquals(upd.last_message_at, "t"); // vencedora sem last_message_at: vale o novo
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

Deno.test("patch na vencedora: last_message_at é o maior e opened_* da vencedora não são sobrescritos", async () => {
  const { client, calls } = fake({ insertError: { code: "23505" }, existing: { id: "winner", last_message_at: "2026-10-15T12:00:00Z" } });
  await insertConversationOnce(client, { ...row, last_message_at: "2026-10-15T10:00:00Z", opened_at: "x", opened_via: "manual" });
  const upd = calls.find((c) => c[0] === "update")![1] as Record<string, unknown>;
  assertEquals(upd.last_message_at, "2026-10-15T12:00:00Z");
  assertEquals("opened_at" in upd || "opened_via" in upd, false);
});

Deno.test("reabrir arquivada sem colisão: devolve o mesmo id", async () => {
  const { client } = fake({});
  assertEquals(await updateConversationOnce(client, "arq", { status: "active", archived_at: null }, { lead_id: "l", channel: "whatsapp" }), "arq");
});

Deno.test("reabrir arquivada colide com a ativa (23505): re-aponta para a ativa, sem reabrir a arquivada", async () => {
  const { client, calls } = fake({ updateError: { code: "23505" }, existing: { id: "ativa", last_message_at: null } });
  const id = await updateConversationOnce(client, "arq", { status: "active", archived_at: null, last_message_at: "t" }, { lead_id: "l", channel: "whatsapp" });
  assertEquals(id, "ativa");
  const second = calls.filter((c) => c[0] === "update")[1][1] as Record<string, unknown>;
  assertEquals(second, { last_message_at: "t" });
});

Deno.test("updateConversationOnce propaga erro que não é 23505", async () => {
  const { client } = fake({ updateError: { code: "42501" } });
  let threw = false;
  try { await updateConversationOnce(client, "arq", { status: "active" }, { lead_id: "l", channel: "w" }); } catch { threw = true; }
  assertEquals(threw, true);
});
