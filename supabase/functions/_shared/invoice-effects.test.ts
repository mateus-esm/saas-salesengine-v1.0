import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { applyPaid, Invoice } from "./invoice-effects.ts";

/**
 * O defeito que estes testes existem para impedir (SE-BILL-002):
 *
 * O SE-BILL-001 fez `rollContractPeriod` conceder
 * `max(0, cota - consumo em [due_date, paid_at])` quando a fatura era paga
 * atrasada. Isso cobra o cliente DUAS VEZES.
 *
 * O consumo da janela já está no ledger como linhas negativas — débitos
 * medidos, ou os ajustes que o `credits-reconcile` lança para o agente de
 * atendimento. O saldo é uma soma simples sobre o ledger, e essas linhas
 * sobrevivem à expiração da cota anterior (caem fora da janela dela), então
 * ficam como resíduo negativo que a próxima cota CHEIA já compensa sozinha.
 * Subtrair a mesma janela do grant, além disso, remove o valor duas vezes.
 *
 * Provado em Postgres de verdade, com as funções reais do ledger, no cenário do
 * próprio estudo (cota 2000, vence 01/09, paga 08/09, 400 consumidos na janela;
 * esperado 1600):
 *
 *   grant cheio de 2000  ->  saldo 1600   correto
 *   grant de 1600 (001)  ->  saldo 1200   os 400 saíram duas vezes
 *
 * Ver supabase/migrations/20260909000100_sebill002_consumption_accounting.sql.
 */

type Fixtures = {
  contract?: Record<string, unknown> | null;
  items?: unknown[];
  /**
   * Linhas do `credit_ledger` que o consumo da janela de carência produziu.
   *
   * ESTA FIXTURE É O TESTE. Sem ela o código do SE-BILL-001 lê consumo 0,
   * concede a cota cheia por acidente e passa nas asserções abaixo sem que a
   * dedução dupla tenha sido exercitada. Com ela, o SE-BILL-001 deduz 400 do
   * grant e os testes ficam vermelhos — que é o comportamento que estamos
   * travando.
   */
  ledger?: unknown[];
};

/** Fake mínimo do supabase-js: só o encadeamento que applyPaid usa. */
function fakeDb(fx: Fixtures) {
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const updates: { table: string; patch: Record<string, unknown> }[] = [];

  const resultFor = (table: string, op: string) => {
    if (table === "contracts" && op === "select") {
      return { data: fx.contract ?? null, error: null };
    }
    if (table === "contract_items" && op === "select") {
      return { data: fx.items ?? [], error: null };
    }
    if (table === "credit_ledger" && op === "select") {
      return { data: fx.ledger ?? GRACE_WINDOW_LEDGER, error: null };
    }
    return { data: null, error: null };
  };

  function chain(table: string, op: string): any {
    const settled = Promise.resolve(resultFor(table, op));
    const node: any = {
      eq: () => node,
      in: () => node,
      gte: () => node,
      lt: () => node,
      order: () => node,
      limit: () => node,
      single: () => settled,
      maybeSingle: () => settled,
      then: (ok: any, err: any) => settled.then(ok, err),
    };
    return node;
  }

  const db = {
    from(table: string) {
      return {
        select: () => chain(table, "select"),
        update: (patch: Record<string, unknown>) => {
          updates.push({ table, patch });
          return chain(table, "update");
        },
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return chain(table, "insert");
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      // syncAgentPower roda dentro de try/catch e não é o objeto destes testes.
      if (name === "agents_to_pause" || name === "agents_to_resume") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as any;

  return {
    db,
    rpcs,
    inserts,
    updates,
    grants: () => rpcs.filter((c) => c.name === "grant_credits"),
    grantFor: (pool: string) =>
      rpcs.find((c) => c.name === "grant_credits" && c.args.p_pool === pool),
    ledgerInserts: () => inserts.filter((i) => i.table === "credit_ledger"),
  };
}

/**
 * O que o agente de atendimento consumiu na janela [due_date, paid_at]: 400,
 * lançados pelo `credits-reconcile` como ajuste negativo. Já reduziram o saldo.
 */
const GRACE_WINDOW_LEDGER = [{ credits: -400 }];

/** Cota do plano: 2000 Atendimento + 500 Copiloto, como no estudo. */
const PLAN_ITEMS = [
  { quantity: 1, billing_products: { credits_whatsapp: 2000, credits_copilot: 500, kind: "plan" } },
];

/** Período anterior já encerrado: venceu ontem, então o pagamento está atrasado. */
function closedContract() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return {
    id: "c-1",
    status: "past_due",
    current_period_start: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    current_period_end: yesterday,
  };
}

function lateInvoice(): Invoice {
  return {
    id: "inv-1",
    equipe_id: "eq-1",
    contract_id: "c-1",
    kind: "recurring",
    status: "overdue",
    total: 499,
    // Venceu há 8 dias e só foi paga agora: a janela de carência existe.
    due_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    paid_at: null,
    metadata: null,
  };
}

Deno.test("pagamento atrasado concede a cota CHEIA por pool", async () => {
  const f = fakeDb({ contract: closedContract(), items: PLAN_ITEMS });

  await applyPaid(f.db, lateInvoice());

  // A dedução da janela sairia daqui. Ela não pode: o consumo já está no
  // ledger e o grant cheio o compensa.
  assertEquals(f.grantFor("whatsapp")?.args.p_credits, 2000);
  assertEquals(f.grantFor("copilot")?.args.p_credits, 500);
  assertEquals(f.grants().length, 2, "um grant por pool, nada a mais");
});

Deno.test("pagamento atrasado não lança marcador late_payment no ledger", async () => {
  const f = fakeDb({ contract: closedContract(), items: PLAN_ITEMS });

  await applyPaid(f.db, lateInvoice());

  // O marcador do SE-BILL-001 (`credits: 0`, `source: 'late_payment'`) existia
  // só para avisar o reconciliador sobre a dedução. Sem dedução, ele é ruído
  // no extrato do cliente — e o reconciliador não o lê mais.
  const marcadores = f.ledgerInserts().filter((i) => i.row.source === "late_payment");
  assertEquals(marcadores, []);
  assertEquals(f.ledgerInserts(), [], "rollContractPeriod não escreve no ledger direto");
});

Deno.test("pagamento em dia concede exatamente a mesma cota", async () => {
  const emDia = { ...lateInvoice(), due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() };
  const f = fakeDb({ contract: closedContract(), items: PLAN_ITEMS });

  await applyPaid(f.db, emDia);

  // Atrasado e em dia passaram a ser o mesmo caminho. É essa igualdade que
  // garante que ninguém é cobrado por pagar tarde além do que já consumiu.
  assertEquals(f.grantFor("whatsapp")?.args.p_credits, 2000);
  assertEquals(f.grantFor("copilot")?.args.p_credits, 500);
});

Deno.test("chave de idempotência distinta por pool, estável no período", async () => {
  const f = fakeDb({ contract: closedContract(), items: PLAN_ITEMS });

  await applyPaid(f.db, lateInvoice());

  const wpp = String(f.grantFor("whatsapp")?.args.p_idempotency_key);
  const cop = String(f.grantFor("copilot")?.args.p_idempotency_key);
  assert(wpp.startsWith("period_c-1_"), `chave inesperada: ${wpp}`);
  assert(wpp.endsWith("_whatsapp"));
  assert(cop.endsWith("_copilot"));
  // Uma chave só para os dois faria o segundo grant parecer replay do primeiro.
  assert(wpp !== cop);
});

Deno.test("pool sem cota no plano não gera grant", async () => {
  const f = fakeDb({
    contract: closedContract(),
    items: [{ quantity: 1, billing_products: { credits_whatsapp: 2000, credits_copilot: 0, kind: "plan" } }],
  });

  await applyPaid(f.db, lateInvoice());

  assertEquals(f.grants().length, 1);
  assertEquals(f.grantFor("whatsapp")?.args.p_credits, 2000);
  assertEquals(f.grantFor("copilot"), undefined);
});

Deno.test("a cota multiplica pela quantidade do item", async () => {
  const f = fakeDb({
    contract: closedContract(),
    items: [
      { quantity: 3, billing_products: { credits_whatsapp: 1000, credits_copilot: 100, kind: "plan" } },
      { quantity: 1, billing_products: { credits_whatsapp: 500, credits_copilot: 0, kind: "addon" } },
    ],
  });

  await applyPaid(f.db, lateInvoice());

  assertEquals(f.grantFor("whatsapp")?.args.p_credits, 3500);
  assertEquals(f.grantFor("copilot")?.args.p_credits, 300);
});

Deno.test("o período rola e o contrato volta a ativo", async () => {
  const f = fakeDb({ contract: closedContract(), items: PLAN_ITEMS });

  await applyPaid(f.db, lateInvoice());

  const contrato = f.updates.find((u) => u.table === "contracts");
  assertEquals(contrato?.patch.status, "active");
  assertEquals(contrato?.patch.past_due_since, null);
  // Pagar atrasado não ganha um mês extra: a base é agora, não o fim do
  // período anterior, que já passou.
  const inicio = new Date(String(contrato?.patch.current_period_start)).getTime();
  assert(Math.abs(inicio - Date.now()) < 60_000, "o período devia começar agora");

  const fatura = f.updates.find((u) => u.table === "invoices");
  assertEquals(fatura?.patch.status, "paid");
  assert(fatura?.patch.paid_at, "paid_at tem de ser gravado");
});

Deno.test("contrato inexistente não concede créditos", async () => {
  const f = fakeDb({ contract: null, items: PLAN_ITEMS });

  await applyPaid(f.db, lateInvoice());

  assertEquals(f.grants().length, 0);
});
