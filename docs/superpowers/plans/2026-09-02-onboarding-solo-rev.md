# Sprint 8.2 — Onboarding, go-live e marca Solo Rev · Plano de implementação

> **Para agentes:** este plano é executado tarefa a tarefa. Passos usam `- [ ]`.

**Goal:** Separar "ambiente provisionado" de "cliente no ar", pôr as 7 etapas de
onboarding num kanban administrativo, e renomear o produto para Solo Rev.

**Architecture:** O contrato ganha um estado `onboarding` em que o trial não
corre e a cobrança não sai. A fatura de implantação é emitida no provisionamento
com vencimento na data prevista de conclusão; a *cobrança* sai no aceite
(`on_accept`) ou no clique de go-live (`on_golive`). Um card de `onboardings`
acompanha o cliente da aceitação até o ar.

**Tech Stack:** Postgres/Supabase (migrations com asserções `do $$`), Deno edge
functions, React + Vite + shadcn/ui + @dnd-kit, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-onboarding-solo-rev-design.md`

## Global Constraints

- Toda migration termina com um bloco `do $$ ... assert ... $$` que se limpa
  sozinho. É o padrão do repositório inteiro.
- Nada de `db push --include-all`. Migrations aplicadas à mão não entram no
  histórico.
- Saída de WhatsApp sempre por `_shared/phone.ts`.
- Marca: `Solo Rev` = produto, `Solo Ventures` = empresa, `#FF7700` = laranja.
- Copy pt-BR. Regra de tom: fato → impacto → ação, e sempre dizer o que
  continua funcionando.
- Deploy é manual. Nenhuma tarefa faz deploy.
- W6 (limpeza de produção) não roda até W1–W5 estarem no ar.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| ------- | ---------------- |
| `migrations/20260902000100_sprint82_onboarding_core.sql` | Tabelas de etapa, card e histórico + seed + RLS |
| `migrations/20260902000200_sprint82_provision_split.sql` | Status `onboarding`, índice único, view, `provision_*` reescrita, `go_live_contract` |
| `migrations/20260902000300_sprint82_onboarding_notifications.sql` | Tipos, templates, `ONBOARDING_CALENDLY_URL` |
| `migrations/20260902000400_sprint82_brand_solo_rev.sql` | "Sales Engine" → "Solo Rev" em dados |
| `migrations/20260902000500_sprint82_onboarding_backfill.sql` | Cards dos clientes que já existem |
| `functions/_shared/br-doc.ts` (+`.test.ts`) | CPF/CNPJ no servidor |
| `functions/_shared/brand.ts` | Nome/cor da marca para edge functions |
| `functions/_shared/billing-charges.ts` (+`.test.ts`) | Cobrança Asaas idempotente, extraída |
| `functions/_shared/email-templates.ts` | Layout do e-mail com a marca Solo |
| `functions/golive-tenant/index.ts` | A transação de go-live |
| `functions/provision-tenant/index.ts` | Provisiona sem colocar no ar |
| `functions/public-proposal/index.ts` | Aceite exige CPF/CNPJ e e-mail |
| `src/config/brand.ts` | Nome/cor da marca para o app |
| `src/hooks/useOnboarding.ts` | Consultas e mutações do kanban |
| `src/components/admin/onboarding/OnboardingTab.tsx` | O quadro |
| `src/components/admin/onboarding/OnboardingCard.tsx` | O card |
| `src/components/admin/onboarding/GoLiveDialog.tsx` | Colocar no ar, com validação |
| `src/components/admin/onboarding/OnboardingSheet.tsx` | Detalhe e histórico |
| `src/__tests__/brand-consistency.test.ts` | Impede "Sales Engine" de voltar |
| `supabase/scripts/2026-09-02_producao_limpeza.sql` | Cirurgia de dados, uma vez |
| `docs/runbook_sprint82.md` | Ordem de deploy e execução do script |

---

## W1 — Fundação SQL

### Task 1: Tabelas do onboarding

**Files:** Create `supabase/migrations/20260902000100_sprint82_onboarding_core.sql`

**Produces:** `onboarding_stages`, `onboardings`, `onboarding_events`,
`onboarding_stage_id(code text) → uuid`, trigger `trg_onboardings_log_stage`.

- [ ] Criar as três tabelas conforme §4.1–4.3 da spec
- [ ] Semear as 7 etapas com `owner` e `description` (definição de pronto)
- [ ] Trigger que grava `onboarding_events` em toda mudança de `stage_id` e
      reseta `entered_stage_at`
- [ ] RLS: super admin em tudo (mesmo padrão de `proposals`)
- [ ] Asserções: card sem proposta nem equipe é rejeitado; mudar de etapa gera
      evento e reseta `entered_stage_at`; duas equipes iguais são rejeitadas
- [ ] Commit

### Task 2: Separar provisionamento de go-live

**Files:** Create `supabase/migrations/20260902000200_sprint82_provision_split.sql`

**Consumes:** `onboarding_stage_id()` da Task 1.
**Produces:** `provision_tenant_from_proposal(uuid, date)`,
`go_live_contract(uuid)`, `proposals.target_equipe_id`, status `onboarding`.

- [ ] `alter table proposals add target_equipe_id`
- [ ] Novo `contracts_status_check` com `onboarding`
- [ ] Recriar `uq_contracts_active_per_equipe` incluindo `onboarding` e `trialing`
- [ ] Recriar `v_tenant_entitlements` com `onboarding` em `is_live`
- [ ] Reescrever `provision_tenant_from_proposal`: anexa a `target_equipe_id`
      quando houver; contrato `onboarding`; emite a fatura de implantação com
      `due_date = golive_previsto`; cria o card em `boas_vindas`
- [ ] Criar `go_live_contract`
- [ ] Asserções: as 6 primeiras da §12 da spec
- [ ] Commit

### Task 3: Notificações de onboarding

**Files:** Create `supabase/migrations/20260902000300_sprint82_onboarding_notifications.sql`

- [ ] Tipos `onboarding.welcome` (comercial) e `onboarding.golive` (financeiro)
- [ ] Templates semeados com `{{cliente_nome}}`, `{{link_agenda}}`, `{{link_app}}`,
      `{{golive_previsto}}`
- [ ] `system_settings.ONBOARDING_CALENDLY_URL` = Calendly do fundador
- [ ] `system_settings.PLATFORM_NAME` = `Solo Rev`, `APP_BASE_URL`
- [ ] Asserção: `notify` com template rende o link da agenda
- [ ] Commit

### Task 4: Marca nos dados

**Files:** Create `supabase/migrations/20260902000400_sprint82_brand_solo_rev.sql`

- [ ] `update billing_products` trocando "Sales Engine" por "Solo Rev"
- [ ] Asserção: nenhuma linha de `billing_products` contém "Sales Engine"
- [ ] Commit

---

## W2 — Edge functions

### Task 5: CPF/CNPJ no servidor

**Files:** Create `functions/_shared/br-doc.ts`, `functions/_shared/br-doc.test.ts`

**Produces:** `onlyDigits(s): string`, `isValidCPF(s): boolean`,
`isValidCNPJ(s): boolean`, `isValidBrDoc(s): boolean`.

- [ ] Escrever o teste Deno primeiro, com os mesmos casos de
      `src/__tests__/br-doc.test.ts` (529.982.247-25 válido, dígito errado
      inválido, repetidos inválidos)
- [ ] Rodar, ver falhar
- [ ] Portar a implementação de `src/lib/br-doc.ts`
- [ ] Rodar, ver passar
- [ ] Commit

### Task 6: Cobrança extraída

**Files:** Create `functions/_shared/billing-charges.ts`,
`functions/_shared/billing-charges.test.ts`; Modify `functions/provision-tenant/index.ts`

**Produces:** `checkBillingReadiness(db, equipeId) → { ok, missing: ('doc'|'email')[] }`,
`ensureCharges(db, { equipe_id, invoice_ids, due_date? }) → { charged: string[] }`.

- [ ] Teste do `checkBillingReadiness` com conta sem doc, sem e-mail, completa
- [ ] Rodar, ver falhar
- [ ] Extrair `ensureCharges` de `provision-tenant` e escrever `checkBillingReadiness`
- [ ] Rodar, ver passar
- [ ] Commit

### Task 7: Marca e e-mail

**Files:** Create `functions/_shared/brand.ts`; Modify `functions/_shared/email-templates.ts`,
`functions/notification-dispatcher/index.ts`

- [ ] `brand.ts` com `BRAND = { product, company, tagline, color }`
- [ ] Redesenhar o e-mail: faixa laranja com wordmark SOLO REV, selo de
      severidade, rodapé "Solo Rev é um produto da Solo Ventures"
- [ ] Dispatcher usa `BRAND.product` no lugar de `"Sales Engine"`
- [ ] Commit

### Task 8: Provisionar sem colocar no ar

**Files:** Modify `functions/provision-tenant/index.ts`

- [ ] Aceita `golive_previsto` no corpo, repassa à RPC
- [ ] Só cobra quando `setup_charge_timing = 'on_accept'`
- [ ] Notifica `onboarding.welcome` no lugar de `tenant.provisioned`
- [ ] Devolve `onboarding_id` e `golive_previsto` no recibo
- [ ] Commit

### Task 9: Colocar no ar

**Files:** Create `functions/golive-tenant/index.ts`; Modify `supabase/config.toml`

- [ ] Valida `checkBillingReadiness` antes de tudo → 409 `billing_incomplete`
- [ ] `rpc go_live_contract`
- [ ] Cobra quando `cobrar_agora`, com vencimento `max(previsto, hoje+3)`
- [ ] Notifica `onboarding.golive`
- [ ] Commit

### Task 10: Aceite exige documento e e-mail

**Files:** Modify `functions/public-proposal/index.ts`

- [ ] `accepted_doc` válido obrigatório quando o negócio tem valor
- [ ] `accepted_email` válido obrigatório; grava em `proposals.cliente_email`
      quando faltar
- [ ] Erros `doc_invalid` / `email_required` com 400
- [ ] Commit

---

## W3 — Kanban

### Task 11: Hook e tipos

**Files:** Create `src/hooks/useOnboarding.ts`

**Produces:** `useOnboardingStages()`, `useOnboardings()`, `useMoveStage()`,
`useUpdateOnboarding()`, `useGoLive()`, tipos `OnboardingStage`, `OnboardingRow`.

- [ ] Queries com react-query, chaves `["onboarding-stages"]` e `["onboardings"]`
- [ ] `useMoveStage` com atualização otimista
- [ ] Commit

### Task 12: O quadro

**Files:** Create `src/components/admin/onboarding/OnboardingTab.tsx`,
`OnboardingCard.tsx`

- [ ] `DndContext` com uma coluna por etapa ativa
- [ ] Card: nome, valor mensal, dias na etapa, `golive_previsto`, dono da etapa
- [ ] Saúde: âmbar > 5 dias, vermelho > 10 dias ou `blocked`
- [ ] Coluna `ativo` colapsada por padrão
- [ ] Soltar em `ativo` não move: abre o `GoLiveDialog`
- [ ] Commit

### Task 13: Colocar no ar

**Files:** Create `src/components/admin/onboarding/GoLiveDialog.tsx`

- [ ] Mostra ambiente, plano, trial que vai começar, fatura e quando cobra
- [ ] Bloqueia com campo de CPF/CNPJ ou e-mail quando faltar, salvando na
      `billing_accounts` antes de chamar a função
- [ ] Chama `golive-tenant`, trata `billing_incomplete`
- [ ] Commit

### Task 14: Detalhe do card

**Files:** Create `src/components/admin/onboarding/OnboardingSheet.tsx`

- [ ] Histórico de etapas por `onboarding_events`
- [ ] Edita `golive_previsto`, discovery, saúde, motivo do bloqueio, notas
- [ ] Links para equipe e proposta
- [ ] Commit

### Task 15: Ligar no Admin

**Files:** Modify `src/pages/Admin.tsx`

- [ ] Aba `onboarding` em `ADMIN_TABS` e no `TabsList`
- [ ] Commit

### Task 16: Proposta aponta para equipe existente

**Files:** Modify `src/components/admin/proposals/ProposalDialog.tsx`,
`ProposalsTab.tsx`

- [ ] Seletor "Cliente existente (opcional)" gravando `target_equipe_id`
- [ ] `ProvisionResultDialog` mostra se anexou ou criou, e a previsão
- [ ] Commit

---

## W4 — Marca no frontend

### Task 17: Ponto único e guarda

**Files:** Create `src/config/brand.ts`, `src/__tests__/brand-consistency.test.ts`;
Modify `OpportunityCard.tsx`, `OpportunityDetailModal.tsx`, `ContactDetailsModal.tsx`

- [ ] Teste que falha se `/sales\s*engine/i` aparecer em `src/`
- [ ] Rodar, ver falhar (4 arquivos)
- [ ] `brand.ts` + trocar as ocorrências
- [ ] Rodar, ver passar
- [ ] Commit

### Task 18: Título, PWA e manifesto

**Files:** Modify `index.html`, `public/manifest.json`

- [ ] Título "Solo Rev — Motor de Receita", descrição, og, twitter
- [ ] Manifesto: nome, short_name, `theme_color: #FF7700`
- [ ] Commit

### Task 19: Proposta pública

**Files:** Modify `src/pages/PublicProposal.tsx`

- [ ] CPF/CNPJ obrigatório e validado com `src/lib/br-doc.ts`, máscara ao digitar
- [ ] Campo de e-mail obrigatório quando a proposta não tem
- [ ] Copy "Sales Engine" → "Solo Rev"
- [ ] Commit

---

## W5 — Backfill

### Task 20: Cards de quem já existe

**Files:** Create `supabase/migrations/20260902000500_sprint82_onboarding_backfill.sql`

- [ ] Cards em `ativo` para as 6 equipes que operam, casando por id
- [ ] WI Advogados `26b9ab8c` e Rema `b16e48b5` em `implantacao`
- [ ] Idempotente: `on conflict do nothing` por `equipe_id`
- [ ] Commit

---

## W6 — Limpeza de produção

### Task 21: Script e runbook

**Files:** Create `supabase/scripts/2026-09-02_producao_limpeza.sql`,
`docs/runbook_sprint82.md`

- [ ] Bloco A: desduplicação na ordem da §11 da spec, com backup e verificação
      antes de cada `delete from equipes`
- [ ] Bloco B: reset do legado (faturas anuladas, ledgers zerados,
      `valid_until = 2026-09-04`)
- [ ] Runbook com a ordem de deploy e o que conferir depois
- [ ] Commit

---

## Verificação final

- [ ] `npm run test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `deno test --allow-all supabase/functions/_shared/`
- [ ] Atualizar `Planning/Project Management/todo.md` com os itens da §14 da spec
