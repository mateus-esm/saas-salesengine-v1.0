# SE-BILL-001 — Implementação (Claude)

**Agente:** Claude Code (sonnet) — assinatura claude.ai
**Data:** 2026-09-08
**Input:** estudo do Verboo (`../verboo/estudio-billing-credits.md`)
**PR:** https://github.com/mateus-esm/saas-salesengine-v1.0/pull/6 (branch `feat/billing-credits-deduction`, commit `f541a84`)

## BUG 1 — Dedução no pagamento atrasado
- `supabase/functions/_shared/invoice-effects.ts`: `Invoice` ganha `due_date`/`paid_at`; `rollContractPeriod` calcula `lateWindow = [due_date, paid_at]` e concede `max(0, allowance − consumo)` por pool; marker idempotente `late_payment_<invoiceId>_<pool>` (créditos 0, metadata com window_consumption) antes do grant.
- `supabase/functions/credits-reconcile/index.ts`: soma window_consumption dos markers ao `recorded`, capped no drift positivo.
- `supabase/functions/asaas-webhook/index.ts` + migration `20260908000100_sebill001_late_payment_grace.sql`: projetam `due_date`/`paid_at`.
- **Limitação:** sub-caso onde o reconcile pula o tenant (uso autônomo só no provider) NÃO fechado — corrigir skip logic (linhas 107-115) em task separada.

## BUG 2 — AI Studio sem total do workspace
- `supabase/functions/fetch-gpt-credits/index.ts`: retorna `balances`/`allowances` por pool (whatsapp/copilot); preserva campos legacy.
- `src/components/ai-studio/AIUsageDashboard.tsx`: remove "Saldo X / Y" → mostra Consumo no período, Créditos da conta Rev, Créditos da equipe (Atendimento X · Copiloto Y).

## Validação
| Etapa | Resultado |
|---|---|
| typecheck | ✅ 0 erros |
| lint | ✅ 0 erros (91 warnings pré-existentes) |
| build | ✅ ~19s |
| test | ⚠️ 10 falhas baseline pré-existentes (vitest/JSX), não relacionadas |

## Arquivos tocados
- `supabase/functions/_shared/invoice-effects.ts`
- `supabase/functions/credits-reconcile/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/fetch-gpt-credits/index.ts`
- `supabase/migrations/20260908000100_sebill001_late_payment_grace.sql`
- `src/components/ai-studio/AIUsageDashboard.tsx`
