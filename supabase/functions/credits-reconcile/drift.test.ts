import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  LedgerRow,
  NOISE_FLOOR,
  planAdjustment,
  recordedConsumption,
  reconcileIdempotencyKey,
} from "./drift.ts";

/**
 * O defeito que este módulo existe para impedir (SE-BILL-002):
 *
 * A chave de idempotência do ajuste era `reconcile_<AAAA-MM>` e
 * `credit_ledger` tem `unique (equipe_id, idempotency_key)`. Ou seja: UM
 * ajuste por inquilino por MÊS. O agente de atendimento gera do lado do
 * provider, então este job é a ÚNICA coisa que escreve consumo de WhatsApp no
 * ledger — não existe caminho de `debit` para esse pool.
 *
 * Resultado: na primeira noite do mês o drift era lançado; em todas as noites
 * seguintes ele era calculado corretamente e jogado fora no unique violation.
 * O mês inteiro de consumo, menos o primeiro dia, saía de graça e o saldo no
 * painel ficava alto demais.
 *
 * O teste que importa aqui é o "mês simulado": ele roda o mesmo laço que a
 * produção roda, noite após noite, e compara o que o ledger acumulou com o que
 * o provider diz. Os outros checam aritmética.
 */

/** Um mês de consumo do provider, acumulado — 120 créditos por noite. */
function providerMonthToDate(night: number): number {
  return night * 120;
}

/**
 * Roda o mês noite a noite, aplicando `planAdjustment` e inserindo o ajuste no
 * ledger falso com a MESMA regra de unicidade do banco: (equipe, chave).
 *
 * `keyFor` é injetável para que o teste possa demonstrar o comportamento antigo
 * (chave por período) e o novo (chave por dia) com um laço só.
 */
function simulateMonth(keyFor: (runDate: Date, periodKey: string) => string) {
  const ledger: LedgerRow[] = [];
  const usedKeys = new Set<string>();
  const periodKey = "2026-09";

  for (let night = 1; night <= 30; night++) {
    const runDate = new Date(Date.UTC(2026, 8, night));
    const plan = planAdjustment({
      providerBilled: providerMonthToDate(night),
      ledgerRows: ledger,
      runDate,
    });
    if (!plan.book) continue;

    const key = keyFor(runDate, periodKey);
    // O banco rejeita a segunda inserção da mesma chave (23505) e o job segue.
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    ledger.push({ credits: plan.credits, entry_type: "adjustment", source: "reconcile" });
  }

  return {
    ledgerConsumption: recordedConsumption(ledger),
    providerConsumption: providerMonthToDate(30),
    adjustments: ledger.length,
  };
}

Deno.test("um mês inteiro: a chave por período cobrava só a primeira noite", () => {
  // O comportamento anterior, reproduzido: chave = reconcile_<AAAA-MM>.
  const old = simulateMonth((_runDate, periodKey) => `reconcile_${periodKey}`);

  assertEquals(old.adjustments, 1, "a chave mensal permite um único ajuste");
  assertEquals(old.providerConsumption, 3600);
  // Só a primeira noite entrou no ledger. O resto do mês ficou sem cobrança.
  assertEquals(old.ledgerConsumption, 120);
  assertEquals(old.providerConsumption - old.ledgerConsumption, 3480);
});

Deno.test("um mês inteiro: a chave por dia acompanha o provider", () => {
  const fixed = simulateMonth((runDate) => reconcileIdempotencyKey(runDate));

  // É isto que o job promete: o ledger corrigido bate com o provider.
  assertEquals(fixed.ledgerConsumption, fixed.providerConsumption);
  assertEquals(fixed.ledgerConsumption, 3600);
  assertEquals(fixed.adjustments, 30);
});

Deno.test("rodar duas vezes na mesma noite não cobra duas vezes", () => {
  const runDate = new Date(Date.UTC(2026, 8, 9));
  const ledger: LedgerRow[] = [];

  const first = planAdjustment({ providerBilled: 500, ledgerRows: ledger, runDate });
  assert(first.book);
  ledger.push({ credits: first.credits, entry_type: "adjustment", source: "reconcile" });

  // Segunda execução na mesma noite: o drift já foi lançado, então some...
  const second = planAdjustment({ providerBilled: 500, ledgerRows: ledger, runDate });
  assertEquals(second.book, false, "sem drift restante, nada a lançar");

  // ...e mesmo que houvesse, a chave é a mesma e o banco recusa.
  const third = planAdjustment({ providerBilled: 900, ledgerRows: ledger, runDate });
  assert(third.book);
  assertEquals(third.idempotencyKey, first.idempotencyKey);
});

Deno.test("cada ajuste lança o drift INCREMENTAL, não o mês todo", () => {
  const runOne = new Date(Date.UTC(2026, 8, 9));
  const runTwo = new Date(Date.UTC(2026, 8, 10));

  const first = planAdjustment({ providerBilled: 500, ledgerRows: [], runDate: runOne });
  assert(first.book);
  assertEquals(first.credits, -500);

  const ledger: LedgerRow[] = [
    { credits: first.credits, entry_type: "adjustment", source: "reconcile" },
  ];
  const second = planAdjustment({ providerBilled: 800, ledgerRows: ledger, runDate: runTwo });
  assert(second.book);
  // 300, não 800: o ajuste de ontem conta como consumo já registrado.
  assertEquals(second.credits, -300);
  assertEquals(second.recorded, 500);
  assertNotEquals(second.idempotencyKey, first.idempotencyKey);
});

Deno.test("chaves distintas por dia, estáveis dentro do dia", () => {
  assertEquals(
    reconcileIdempotencyKey(new Date(Date.UTC(2026, 8, 9, 4, 30))),
    "reconcile_2026-09-09",
  );
  // A hora não entra na chave: o cron das 04:30 e um disparo manual às 23:00 da
  // mesma noite são a mesma reconciliação.
  assertEquals(
    reconcileIdempotencyKey(new Date(Date.UTC(2026, 8, 9, 23, 0))),
    "reconcile_2026-09-09",
  );
  assertNotEquals(
    reconcileIdempotencyKey(new Date(Date.UTC(2026, 8, 9))),
    reconcileIdempotencyKey(new Date(Date.UTC(2026, 8, 10))),
  );
});

Deno.test("ruído do provider não vira ajuste", () => {
  const runDate = new Date(Date.UTC(2026, 8, 9));
  const plan = planAdjustment({
    providerBilled: NOISE_FLOOR - 1,
    ledgerRows: [],
    runDate,
  });
  assertEquals(plan.book, false);
});

Deno.test("drift negativo devolve créditos", () => {
  // O ledger registrou mais do que o provider cobrou: estorno.
  const plan = planAdjustment({
    providerBilled: 100,
    ledgerRows: [{ credits: -400, entry_type: "adjustment", source: "reconcile" }],
    runDate: new Date(Date.UTC(2026, 8, 9)),
  });
  assert(plan.book);
  assertEquals(plan.recorded, 400);
  assertEquals(plan.credits, 300);
});

Deno.test("recordedConsumption conta apenas movimentos de uso", () => {
  assertEquals(recordedConsumption([]), 0);
  assertEquals(recordedConsumption([
    { credits: -100, entry_type: "debit", source: "copilot" },
    { credits: -50, entry_type: "adjustment", source: "reconcile" },
  ]), 150);
  // Reparo positivo não é consumo e não pode ser re-debitado na noite seguinte.
  assertEquals(recordedConsumption([
    { credits: -100, entry_type: "adjustment", source: "reconcile" },
    { credits: 40, entry_type: "adjustment", source: "reconcile" },
  ]), 100);
  // Estorno e ajuste administrativo também são movimentos de saldo, não uso do provider.
  assertEquals(recordedConsumption([
    { credits: -500, entry_type: "adjustment", source: "invoice" },
    { credits: -200, entry_type: "adjustment", source: "admin" },
  ]), 0);
  // Os marcadores `late_payment` do SE-BILL-001 tinham credits = 0 e agora não
  // existem mais; uma linha zerada não pode mover o consumo de qualquer forma.
  assertEquals(recordedConsumption([
    { credits: 0, entry_type: "adjustment", source: "late_payment" },
  ]), 0);
});
