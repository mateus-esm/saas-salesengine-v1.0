import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { checkBillingReadiness, chargeDueDate } from "./billing-charges.ts";

/**
 * O defeito que este módulo existe para impedir:
 *
 * provision-tenant chamava ensureCharges(), que lançava
 * `billing_account_incomplete` quando faltava o CPF/CNPJ. A mensagem era
 * engolida como um "warning" genérico, o provisionamento reportava sucesso, e
 * só semanas depois alguém descobria que a fatura nunca tinha virado cobrança.
 *
 * checkBillingReadiness devolve O QUE falta, para que o diálogo de go-live
 * mostre o campo certo e o fundador conserte antes de colocar no ar — em vez de
 * descobrir depois.
 */

/** Fake mínimo do supabase-js: só o encadeamento que a função usa. */
function fakeDb(account: Record<string, unknown> | null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: () => Promise.resolve({ data: account }) };
            },
          };
        },
      };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("conta completa está pronta para cobrar", async () => {
  const r = await checkBillingReadiness(
    fakeDb({ doc_number: "11222333000181", billing_email: "cliente@x.com", legal_name: "Cliente" }),
    "eq-1",
  );
  assertEquals(r.ok, true);
  assertEquals(r.missing, []);
});

Deno.test("sem documento, diz que falta o documento", async () => {
  const r = await checkBillingReadiness(
    fakeDb({ doc_number: null, billing_email: "cliente@x.com", legal_name: "Cliente" }),
    "eq-1",
  );
  assertEquals(r.ok, false);
  assertEquals(r.missing, ["doc"]);
});

// O estado real de produção: accepted_doc = "" virou doc_number = "".
Deno.test("documento vazio conta como ausente, não como preenchido", async () => {
  const r = await checkBillingReadiness(
    fakeDb({ doc_number: "", billing_email: "cliente@x.com", legal_name: "Cliente" }),
    "eq-1",
  );
  assertEquals(r.missing, ["doc"]);
});

Deno.test("documento com dígito verificador errado é ausente para efeito de cobrança", async () => {
  const r = await checkBillingReadiness(
    fakeDb({ doc_number: "11222333000182", billing_email: "cliente@x.com", legal_name: "Cliente" }),
    "eq-1",
  );
  assertEquals(r.missing, ["doc"]);
});

Deno.test("sem e-mail, diz que falta o e-mail", async () => {
  const r = await checkBillingReadiness(
    fakeDb({ doc_number: "11222333000181", billing_email: null, legal_name: "Cliente" }),
    "eq-1",
  );
  assertEquals(r.missing, ["email"]);
});

Deno.test("faltando os dois, reporta os dois de uma vez", async () => {
  const r = await checkBillingReadiness(fakeDb({ doc_number: null, billing_email: null }), "eq-1");
  assertEquals(r.missing, ["doc", "email"]);
});

Deno.test("equipe sem conta de cobrança falta tudo", async () => {
  const r = await checkBillingReadiness(fakeDb(null), "eq-1");
  assertEquals(r.ok, false);
  assertEquals(r.missing, ["doc", "email"]);
});

/**
 * A implantação atrasou e o vencimento previsto já passou. Emitir um boleto
 * nascido vencido é pior do que não emitir: o cliente recebe uma cobrança em
 * atraso no mesmo dia em que o produto ficou pronto.
 */
Deno.test("um vencimento no futuro é respeitado", () => {
  const hoje = new Date("2026-09-02T12:00:00Z");
  assertEquals(chargeDueDate("2026-09-23", hoje), "2026-09-23");
});

Deno.test("um vencimento já vencido é empurrado para daqui a 3 dias", () => {
  const hoje = new Date("2026-09-02T12:00:00Z");
  assertEquals(chargeDueDate("2026-08-20", hoje), "2026-09-05");
});

Deno.test("um vencimento amanhã também é empurrado: 3 dias é o mínimo para pagar", () => {
  const hoje = new Date("2026-09-02T12:00:00Z");
  assertEquals(chargeDueDate("2026-09-03", hoje), "2026-09-05");
});

Deno.test("sem vencimento informado, 3 dias a partir de hoje", () => {
  const hoje = new Date("2026-09-02T12:00:00Z");
  assertEquals(chargeDueDate(null, hoje), "2026-09-05");
});
