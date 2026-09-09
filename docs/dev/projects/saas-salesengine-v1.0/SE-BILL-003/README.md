# SE-BILL-003 — o pagamento rolou o período errado

## O sintoma

Solo Energia pagou a fatura em 07/09 e os créditos não voltaram para a cota do
plano. O founder lançou um ajuste manual de -1972 (Atendimento) e -500
(Copiloto) para forçar o saldo a 2000/500.

## A causa

`rollContractPeriod` nunca leu o `period_key` que a própria fatura carrega. Ele
estendia a partir de `current_period_end` sempre que esse valor estivesse no
futuro.

Essa regra está **certa** para a fatura de renovação: o `renewPeriods` a emite 5
dias antes do fim do período, então quem paga está mesmo comprando o próximo.
Está **errada** para a fatura do primeiro período, que cobra o período em curso.

As linhas gravadas, exatamente como o código as produziu:

```
fatura FAT-2026-000036  period_key 2026-09-02  first_period: true  paga 07/09
contrato  current_period_start 2026-10-01  current_period_end 2026-11-01
grant     2500 whatsapp / 500 copilot  expira 2026-11-01  (54 dias)
          chave period_<contrato>_2026-10-01_<pool>
```

O cliente pagou 02/09→01/10 e recebeu 01/10→01/11. Consequências:

1. Setembro ficou **sem cota nenhuma** — não havia o que "voltar para 2500";
2. a cota nasceu valendo 54 dias em vez de ~30;
3. `current_period_start` ficou três semanas no futuro;
4. o `renewPeriods` só voltaria a emitir por volta de 27/10 — **o mês pago nunca
   seria cobrado de novo**.

Um quarto defeito apareceu no teste: `setMonth` lê e escreve meses **locais**,
então numa máquina atrás de UTC uma base `2026-10-01T00:00Z` virava `2026-10-31`.
A aritmética passou a ser toda em UTC.

## A correção

`_shared/invoice-effects.ts` — a fatura diz de qual período ela é:

- com `period_key`: a base é essa chave e o fim é o dia 1º do mês seguinte (a
  âncora que o `endTrials` estabelece ao proporcionalizar o primeiro período);
- sem `period_key` (faturas legadas, cobrança marcada à mão): comportamento
  anterior, agora em UTC.

`20260909000200_sebill003_period_key_repair.sql` conserta o que já foi gravado.

### A armadilha da chave de idempotência

O grant estava sob `period_<contrato>_2026-10-01_<pool>`. Reancorar o contrato
sem reescrever essa chave deixaria uma bomba: ao pagar a fatura de outubro, o
`grant_credits` veria a mesma chave, trataria como replay e **não concederia a
cota** — o cliente pagaria e não receberia crédito, sem erro em lugar nenhum.
A migration reescreve a chave e grava o motivo no `metadata` da linha.

## O que NÃO foi mexido

`credits_consumed_in_window` continua contando **todo** ajuste negativo que não
seja estorno de fatura, inclusive os de `source = 'admin'`. Chegou a parecer um
defeito (é mais largo que a regra do `drift.ts`), mas as duas respondem a
perguntas diferentes:

- o **reconciliador** compara contra o medidor do provedor, então só pode contar
  o que ele mesmo lançou;
- a **expiração** precisa contar toda saída do pool, ou a cota é estornada
  inteira enquanto o ajuste já tinha tirado os créditos — o resíduo negativo que
  o SE-BILL-002 fechou.

## Verificação

`credits-reconcile` disparado à mão em 09/09 12:51, com o código do PR #7:

```
{"drift":[{"equipe":"Solo Energia","drift":616,"provider":644,"ledger":28}]}
```

O ledger tinha 28 (só o dia 01/09, travado pela chave mensal antiga) contra 644
faturados que o provedor reportou. A chave por dia (`reconcile_2026-09-09`)
lançou os 616 que faltavam.
