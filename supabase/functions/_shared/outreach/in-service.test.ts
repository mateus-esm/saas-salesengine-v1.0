// deno-lint-ignore-file no-import-prefix require-await
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { checkLeadInService, isInService } from "./in-service.ts";

const NOW = new Date("2026-09-26T00:50:57Z");

Deno.test("mensagem do cliente dentro de 24 h = em atendimento", () => {
  // Caso real "Vale": falou às 00:42, cadastro às 00:50.
  assertEquals(isInService("2026-09-26T00:42:46Z", NOW), true);
  assertEquals(isInService("2026-09-25T01:00:00Z", NOW), true);
});

Deno.test("sem mensagem, ou mensagem velha = pode abrir", () => {
  assertEquals(isInService(null, NOW), false);
  assertEquals(isInService("2026-09-24T00:00:00Z", NOW), false);
  assertEquals(isInService("lixo", NOW), false);
});

function fakeDb(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.maybeSingle = async () => result;
  return {
    db: { from: (table: string) => (calls.push(["from", table]), chain) },
    calls,
  };
}

Deno.test("consulta só mensagens do cliente (sender_type='customer') do lead", async () => {
  const { db, calls } = fakeDb({
    data: { created_at: "2026-09-26T00:42:46Z" },
    error: null,
  });
  const check = await checkLeadInService(db, "L1", NOW);
  assertEquals(check, {
    inService: true,
    lastCustomerMessageAt: "2026-09-26T00:42:46Z",
  });
  assertEquals(calls.slice(0, 4), [
    ["from", "messages"],
    ["select", "created_at"],
    ["eq", "lead_id", "L1"],
    ["eq", "sender_type", "customer"],
  ]);
});

Deno.test("erro de leitura não libera o envio", async () => {
  const { db } = fakeDb({ data: null, error: { message: "boom" } });
  const check = await checkLeadInService(db, "L1", NOW);
  assertEquals(check.inService, true);
  assertEquals(check.error, "boom");
});
