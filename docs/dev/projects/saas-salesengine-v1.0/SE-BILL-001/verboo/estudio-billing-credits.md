# Estudo Técnico — Créditos & Billing (SE-BILL-001)
**Motor:** Verboo Code (deepseek-v4-flash-0731) — somente leitura, nada modificado.
**Data:** 2026-09-08 | **Produto:** Solo Rev

Créditos são rastreados em um ledger por equipe (`equipes`), em dois pools independentes (`whatsapp`=Atendimento, `copilot`=Copiloto). Números exibidos ao cliente são **billed credits** (provider × `CREDIT_MARKUP=2`, `_shared/credit-pricing.ts`).

---

## BUG 1 — Pagamento atrasado não deduz consumo do total

**Exemplo:** Solo Energia, fatura vence dia 1, pagou dia 8; agente consumiu 400 de 1→8; total ainda mostra 2000.

### Causa raiz
A cota mensal é concedida **somente quando a fatura recorrente é paga**, em um lugar:
- `supabase/functions/_shared/invoice-effects.ts:66` — `applyPaid()` seta `paid_at`, e para `kind="recurring"` chama `rollContractPeriod()` (linha 128).
- `invoice-effects.ts:158` — `rollContractPeriod()` rola o período (base = antigo `current_period_end` se futuro, senão **agora**) e concede a cota cheia por pool via RPC `grant_credits` (linhas 205–221, chave `period_{contract.id}_{periodKey}_{pool}`). **Nunca subtrai o consumo da janela sem pagamento.**

Por que os 400 somem do ledger antes do grant:
- Consumo registrado via ① RPC `charge_credits` → linhas `debit` (`20260819000200_sprint8_credit_ledger.sql:304`, chamado por `python-agent/app/credits.py:29`), e ② uso autônomo de provider contabilizado à noite por `supabase/functions/credits-reconcile/index.ts` como linhas `adjustment` do **mês calendário** — mas **pula** tenants cujo ledger começou depois do início do mês (linhas 107–115, exatamente o caso Solo Energia). Quando pula, os 400 existem só como `credits-spent` do provider, nunca no ledger.
- No dia 8, `rollContractPeriod` concede 2000 sobre saldo 0 → allowance/total mostra 2000, e os 400 viram grátis.

Total exibido: `fetch-gpt-credits/index.ts:203–223` (`balance`=`credit_balance` combinada, `allowance`=grant ativo+topups) → `AIUsageDashboard.tsx:330` "Saldo X / Y".

### Mudança proposta
Em `rollContractPeriod`, quando o pagamento está atrasado (`paid_at > due_date`/antigo `current_period_end`):
1. Janela = [`invoices.due_date`, `paid_at`] (ambos já existem; o tipo `Invoice` em `invoice-effects.ts:23–32` não tem `due_date`/`paid_at` — estender selects em `asaas-webhook/index.ts:176` e `admin-billing-ops/index.ts:210`, ou reler dentro).
2. Consumo da janela via `public.credits_consumed_in_window` (`credit_ledger.sql:82`; variante pool `20260820000100_sprint81_credit_pools.sql:92`) — atualmente **só debits**, precisa incluir linhas `adjustment` do reconcile.
3. Conceder `max(0, allowance − consumption)` por pool.
4. **Proteção contra dupla dedução:** lançar o consumo da janela como linhas idempotentes (`late_payment_{invoice.id}_{pool}`) **antes** do grant, para o `credits-reconcile` ver `recorded ≥ provider` e não lançar drift extra. Resultado: balance e total exibido = 1600.

## BUG 2 — AI Studio (Rev): esconder total de créditos do workspace

### Comportamento atual
A única figura de crédito em `/ai-studio/usage` (`UsagePage.tsx` → `AIUsageDashboard`) é `AIUsageDashboard.tsx:330` "Saldo: X / Y", alimentada por `fetch-gpt-credits/index.ts` (`balance` = `credit_balance(equipe_id)` combinada sem pool = Atendimento+Copiloto; `allowance` = grant+topups combinados). Essa allowance única (2000) é o total do workspace/equipe a esconder. O consumo ("Consumo no Período" + breakdown por modelo) já está correto. Badges (`CreditBalanceBadge`, `TopNavbar.tsx:246`) e páginas de billing já são por pool/equipe — não regressar.

### Mudança proposta
1. `fetch-gpt-credits/index.ts` — retornar balances/allowances **por pool** em vez de um único `balance`/`allowance` combinado; manter `total`/`details`/`meteringSince`.
2. `AIUsageDashboard.tsx` — substituir "Saldo X / Y" por três figuras escopadas: **créditos da conta Rev (equipe remanescente)**, **créditos da equipe (breakdown por pool, sem denominador somado)**, **consumo**.

## Arquivos-chave
- Grant no pagamento: `supabase/functions/_shared/invoice-effects.ts` (`applyPaid`, `rollContractPeriod`); chamadores `asaas-webhook/index.ts:202`, `admin-billing-ops/index.ts:210`
- Ledger/RPCs: `20260819000200_sprint8_credit_ledger.sql` + `20260820000100_sprint81_credit_pools.sql`
- Reconcile: `supabase/functions/credits-reconcile/index.ts`
- BUG 2 server: `supabase/functions/fetch-gpt-credits/index.ts:172–222`; UI: `src/components/ai-studio/AIUsageDashboard.tsx:149–178, 317–341`

## Verificação
- **BUG 1:** seed contrato com período passado + fatura aberta; consumir 400 na janela; pagar (webhook/manual); assert grant = 1600, balance/UI total = 1600; rodar reconcile de novo → sem adjustment extra; replay `applyPaid` → sem re-grant.
- **BUG 2:** carregar `/ai-studio/usage` como membro da equipe; assert sem "Saldo X / Y" combinado; três figuras escopadas presentes; `CreditBalanceBadge` e `/billing/creditos` inalterados.

## Premissas
- BUG 1: dedução só no pagamento atrasado; reduzir o novo grant para balance e total exibido caírem (billing mostra 1600).
- BUG 2: "créditos da conta Rev" = créditos remanescentes da equipe; "créditos da equipe" = breakdown por pool; esconder só a allowance combinada. Alternativas descartadas: mostrar créditos da conta do provider GPT Maker (reintroduziria número do provider na UI, contra a regra "provider nunca é a verdade").
