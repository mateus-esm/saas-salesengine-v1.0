# Sprint 8 — Billing v1: Monetização com Escala, Confiança e Clareza

**PM:** Claude / Opus 5
**Aberto:** 2026-08-19
**Escopo:** A (verdade do dinheiro) + B (medição e preços) + C (propostas)
**Fora de escopo:** Onboarding self-service (→ Sprint 8.1), checkout público (→ 8.2)

---

# 🎯 ZONE 1 — VISION (Product Owner)

Construir a infraestrutura de cobrança que permite o software monetizar com
**escala, confiança e clareza**. Hoje o sistema cobra sem entregar e entrega sem
cobrar — nada disso é aceitável antes de vender para o próximo cliente.

Três resultados, nesta ordem:

1. **Confiança** — ninguém tem acesso sem pagar, e ninguém paga sem receber.
   Todo real que entra tem um evento auditável ligado a uma fatura.
2. **Escala** — proposta → contrato → fatura → provisionamento em um fluxo só,
   com um clique de operação humana, não uma checklist manual.
3. **Clareza** — o cliente entende o que comprou, quanto consumiu, quanto falta
   e o que acontece se não pagar. Sem surpresa, sem número que contradiz outro.

## 🔍 AUDITORIA — o que está quebrado hoje (PM, 2026-08-19)

Levantamento feito antes do plano. Cada item foi verificado no código.

### 🔴 P0 — buracos de receita e de confiança

1. **Não existe webhook do Asaas.** `ls supabase/functions` não tem nenhum
   handler. Pagamentos são criados e nunca confirmados.
2. **Acesso é liberado antes do pagamento.** `asaas-subscribe/index.ts:185`
   grava `subscription_status: 'ACTIVE'` no momento em que a assinatura é
   *criada*. O cliente ganha acesso ao clicar, não ao pagar.
3. **Quem paga crédito não recebe crédito.** `asaas-buy-credits` cria a cobrança,
   devolve o QR do PIX e termina. `creditos_avulsos` nunca é incrementado. Não
   existe caminho no código que credite um pagamento aprovado.
4. **Não existe fatura.** Sem tabela de invoices, sem histórico, sem recibo, sem
   número fiscal. O cliente não tem o que consultar e você não tem o que conciliar.
5. **Vazamento cross-tenant em `webhook_configs`.** A migration
   `20260617000000_add_team_page_permissions.sql` criou políticas RLS que filtram
   por permissão mas **não escopam por equipe**:
   `equipe_id IN (SELECT id FROM equipes WHERE page_permissions->>'webhooks' = true)`.
   Ela não removeu a política original `"Team members can manage webhooks"`, e
   políticas permissivas em Postgres são **OR** — qualquer autenticado lê e
   escreve os webhooks de qualquer equipe com o módulo ligado.

### 🟠 P1 — o dinheiro mora em quatro lugares que discordam

| Conceito | Onde vive | Natureza |
|---|---|---|
| Créditos de IA (revenda GPT-Maker, markup 2x) | derivado: `limite_creditos ?? planos.limite_creditos + creditos_avulsos − consumo` | calculado na leitura, sem ledger |
| Carteira do Copilot | `agent_credits_balance` + `agent_action_ledger` | ledger real, atômico, idempotente |
| Recargas | `equipes.creditos_avulsos` | coluna int solta |
| Instâncias WhatsApp | env `SOLO_INSTANCE_MONTHLY_PRICE` (default 100) | não está no banco |

6. **`charge_credits()` tem zero chamadores.** O ledger atômico do Sprint 6.1 foi
   construído e nunca ligado — `agent_credits_balance` é uma tabela vazia. Grep
   em `src/` e `supabase/functions/` só encontra a assinatura em `types.ts`.
7. **Nada bloqueia uma ação por saldo.** O saldo é derivado chamando
   `credits-spent` do provider a cada carregamento de página. Não existe
   pré-checagem, logo **não existe como parar** um tenant sem crédito hoje.
8. **Preço de instância não é dado.** Mudar o preço exige redeploy de função.
9. **Pagador errado.** `asaas-subscribe` envia `profile.cpf` — o CPF de quem se
   cadastrou. Cliente PJ não tem como assinar; a entidade pagadora é a empresa.

### 🟡 P2 — o que falta para o produto ser vendável

10. **Zero infraestrutura de notificação.** Sem tabela, sem provedor de e-mail,
    sem central. Só `toast` efêmero, que some no reload.
11. **Entitlements são manuais.** `page_permissions` é um JSONB que alguém
    lembra de virar. Não deriva do que o cliente comprou.
12. **Propostas vivem em `localStorage`.** `manager.html` guarda o pipeline
    comercial inteiro em um perfil de navegador — some com o cache. E
    `index.html` monta a proposta por query string, então o cliente pode editar
    o próprio preço na URL.

## 🚦 SCOPE DECISIONS (founder, 2026-08-19)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Escopo do sprint | **A + B + C** — cobrança, medição e propostas. Onboarding fica para 8.1. |
| 2 | Movimento comercial | **Assistido agora, self-service depois.** Vendas por proposta; trilhos prontos para checkout público sem retrabalho. |
| 3 | Sem crédito | **Soft stop + auto-recarga.** Ações de IA param, chat humano continua, banner e notificação disparam. |
| 4 | Empacotamento | **Catálogo + override no contrato.** Lista de produtos define preço de tabela; o contrato carrega o preço negociado. |
| 5 | Pagador | **CPF e CNPJ.** Entidade pagadora pertence à equipe, não ao usuário. |
| 6 | Fechamento | **Cliente aceita online → founder confirma.** Aceite registrado e notificado; provisionamento em um clique no admin. |
| 7 | Inadimplência | **7 dias de tolerância, depois read-only.** Dados visíveis, IA e envio parados. Nunca apagar. |
| 8 | Notificações | **In-app + e-mail + WhatsApp**, com instância de plataforma dedicada. |
| 9 | Arquitetura | **Ledger local é a verdade, Asaas é o trilho de pagamento.** |

## ✅ DEFINITION OF DONE

Cobrança correta:
- [ ] Nenhum caminho de código concede acesso antes de um pagamento confirmado por webhook.
- [ ] Um pagamento de pacote de créditos aprovado credita o tenant exatamente uma vez, mesmo com reentrega do webhook.
- [ ] Todo evento do Asaas fica gravado em `payment_events` antes de ser processado; reentrega é no-op.
- [ ] Toda fatura tem itens, total, vencimento e histórico de status auditável.
- [ ] `asaas-subscribe` não grava mais `subscription_status` diretamente.

Medição:
- [ ] Saldo de créditos é lido do ledger local (`SELECT`), não da API do provider.
- [ ] Toda ação de IA passa por `check_credits` antes e `charge_credits` no sucesso.
- [ ] Saldo insuficiente bloqueia ação de IA e **não** bloqueia chat humano.
- [ ] Conciliação noturna compara ledger com `credits-spent` e registra divergência como `adjustment`.
- [ ] Preço de instância WhatsApp vem do catálogo no banco, não de env var.

Entitlements:
- [ ] O que o tenant acessa deriva de `contract_items`, com override explícito de super admin.
- [ ] As políticas RLS sem escopo de tenant em `webhook_configs` estão corrigidas e testadas.

Propostas:
- [ ] Proposta é criada e gerenciada no admin, persistida no banco compartilhado.
- [ ] Página pública renderiza do banco; preço não é editável por query string.
- [ ] Aceite grava timestamp, IP, user agent e snapshot congelado dos termos.
- [ ] Um clique em "Provisionar" cria equipe + billing account + contrato + convite de auth + faturas.
- [ ] O cliente entra pela primeira vez e a fatura já está na tela de Billing.

Notificação e UX:
- [ ] Central de notificações in-app persiste e sobrevive a reload.
- [ ] E-mail transacional sai com identidade do nicho, não genérico do gateway.
- [ ] Eventos de severidade `warn`+ vão para o WhatsApp da instância de plataforma.
- [ ] `credits.low` dispara uma vez por período, não a cada page load.
- [ ] Página de Billing responde: o que eu tenho, quanto usei, quanto devo, o que acontece se eu não pagar.

Gates técnicos:
- [ ] `npx tsc -b` limpo.
- [ ] `npm run build` limpo.
- [ ] `npm test` — suíte nova de billing passando.
- [ ] Toda migration nova é idempotente e reversível.

---

# 🛠️ ZONE 2 — IMPLEMENTATION PLAN (PM: Claude)

**Goal:** Tornar o dinheiro auditável. Toda concessão de acesso e todo crédito
entregue passam a ter um evento de pagamento confirmado por trás, e todo preço
cobrado passa a ter uma linha de contrato que o justifica.

**Architecture — decisão central:** *ledger local é a verdade, Asaas é o trilho.*

Nós somos donos de `contracts`, `invoices`, `entitlements` e `credit_ledger`. O
Asaas apenas **cobra** e **avisa que cobrou**. A alternativa — espelhar o status
da assinatura do gateway — foi descartada porque uma assinatura Asaas não
consegue expressar "setup + 3 módulos + 2 instâncias com 20% de desconto", que é
exatamente o que as propostas vendem. Com o gateway como verdade, desconto e
add-on não teriam onde morar, e proposta nunca viraria fatura.

Consequência prática: o seam vira
`React → supabase.functions.invoke → edge function → (Postgres = verdade) → Asaas = trilho`.
O Asaas nunca é consultado para responder "esse tenant pode usar o produto?".

**Tech Stack:** Postgres 15 + RLS · Deno edge functions · React 18 + Vite + TS ·
TanStack Query · shadcn/ui · pg_cron · Asaas API v3 · Resend · Solo API (WhatsApp).

## Global Constraints

- **Dinheiro é `numeric(12,2)`. Nunca `float`.** Créditos são `integer`.
- **Idempotência é obrigatória em tudo que move dinheiro.** Todo caminho de
  crédito ou pagamento carrega uma chave única. O padrão já existe e está certo
  em `charge_credits()` (Sprint 6.1) — copie a disciplina, não invente outra.
- **Nenhum edge function confia no cliente para valor.** Preço vem do catálogo ou
  do contrato, lido no servidor. O front nunca envia `amount`.
- **O webhook nunca devolve 5xx depois de gravar o evento.** Grava, responde 200,
  processa. Falha de processamento vira `payment_events.status='failed'` e um job
  de retry — devolver erro faz o Asaas reentregar para sempre um bug que já está registrado.
- **Nenhuma string visível cita a marca do provider.** Identificadores internos
  (`GPT_MAKER_TOKEN`, `gpt_maker_agent_id`) permanecem.
- **Créditos exibidos são sempre `billed`, nunca `provider`.** A conversão mora
  só em `_shared/credit-pricing.ts`. Não replique `CREDIT_MARKUP`.
- Copy de UI em **pt-BR**. Moeda `Intl.NumberFormat('pt-BR', {currency:'BRL'})`.
- Toda edge function nova precisa de entrada em `supabase/config.toml`.
- Deploy é **manual**: `supabase functions deploy <fn> --project-ref egxzsivzqlqadoqpgfby`. Não há CI.
- Gates por task: `npx tsc -b` **e** `npm run build`. Build sozinho não tipa —
  Vite usa esbuild e ignora erro de tipo. Lição do Sprint 7.2.
- Migrations com timestamp explícito e `IF NOT EXISTS` / `CREATE OR REPLACE`.

## 🌊 WAVE MAP

```
W0 ── T1 schema billing · T2 schema créditos · T3 schema propostas · T4 schema notificações
      (4 migrations, arquivos separados — timestamps ordenados T1<T2<T3<T4)
        ↓ PM aplica e valida no banco antes de abrir W1
W1 ── T5 asaas-webhook ⭐ · T6 refactor subscribe/buy-credits · T7 billing-cron
      T8 notification-dispatcher · T9 provision-tenant
        ↓ PM merge — W2 consome os contratos de W1
W2 ── T10 wire charge_credits · T11 saldo do ledger + conciliação · T12 entitlements + fix RLS
        ↓
W3 ── T13 Billing UI · T14 central de notificações · T15 admin propostas
      T16 admin faturamento · T17 página pública /proposta/:codigo
        ↓
W4 ── T18 auto-recarga + banners · T19 sweep de copy e docs (roda sozinha)
```

## 📋 TASK TABLE

| # | Task | Tier | Engineer | Owns (exclusive) |
|---|---|---|---|---|
| T1 | Schema billing core | **XL** | Codex | `supabase/migrations/20260819000100_sprint8_billing_core.sql` |
| T2 | Schema crédito unificado | **XL** | Codex | `supabase/migrations/20260819000200_sprint8_credit_ledger.sql` |
| T3 | Schema propostas | **M** | Verboo | `supabase/migrations/20260819000300_sprint8_proposals.sql` |
| T4 | Schema notificações | **M** | Verboo | `supabase/migrations/20260819000400_sprint8_notifications.sql` |
| T5 | `asaas-webhook` ⭐ | **XL** | Codex | `supabase/functions/asaas-webhook/index.ts` · `supabase/functions/_shared/asaas.ts` · `supabase/config.toml` |
| T6 | Refactor subscribe + buy-credits | **L** | Codex | `supabase/functions/asaas-subscribe/index.ts` · `supabase/functions/asaas-buy-credits/index.ts` |
| T7 | `billing-cron` (dunning/rollover) | **L** | Verboo | `supabase/functions/billing-cron/index.ts` · `supabase/migrations/20260819000500_sprint8_billing_cron.sql` |
| T8 | `notification-dispatcher` | **L** | Verboo | `supabase/functions/notification-dispatcher/index.ts` · `supabase/functions/_shared/notify.ts` |
| T9 | `provision-tenant` | **L** | Codex | `supabase/functions/provision-tenant/index.ts` |
| T10 | Wire `charge_credits` nas ações de IA | **XL** | Codex | `supabase/functions/_shared/credit-guard.ts` · `supabase/functions/analyze-message/index.ts` · `supabase/functions/process-automations/index.ts` |
| T11 | Saldo do ledger + conciliação | **L** | Verboo | `supabase/functions/fetch-gpt-credits/index.ts` · `supabase/functions/credits-reconcile/index.ts` |
| T12 | Entitlements derivados + fix RLS | **L** | Codex | `supabase/migrations/20260819000600_sprint8_entitlements.sql` · `src/components/PageRouteGuard.tsx` · `src/hooks/useEntitlements.ts` |
| T13 | Billing UI (5 sub-rotas) | **XL** | Verboo | `src/pages/Billing.tsx` · `src/pages/billing/**` · `src/components/billing/**` |
| T14 | Central de notificações | **L** | Verboo | `src/components/notifications/**` · `src/hooks/useNotifications.ts` · `src/components/TopNavbar.tsx` |
| T15 | Admin — aba Propostas | **XL** | Codex | `src/components/admin/proposals/**` · `src/pages/Admin.tsx` (só a aba) |
| T16 | Admin — aba Faturamento | **L** | Codex | `src/components/admin/billing/**` |
| T17 | Página pública `/proposta/:codigo` | **L** | Verboo | `src/pages/PublicProposal.tsx` · `src/App.tsx` (só a rota) |
| T18 | Auto-recarga + banners de saldo | **M** | Verboo | `src/components/billing/AutoRecharge.tsx` · `src/components/billing/CreditAlert.tsx` |
| T19 | Sweep de copy + docs | **S** | Gemini | `Planning/Workflow/billing.md` · `docs/**` — **roda sozinha** |

> **Regra de ownership:** toque só nos seus arquivos. `src/pages/Admin.tsx` é
> tocado por T15 e T16 — **T16 só abre depois do merge de T15**. Se outro arquivo
> parecer errado, avise o PM; não conserte.

---

## WAVE 0 — Fundação de schema

> Quatro migrations em arquivos separados. Podem ser escritas em paralelo, mas os
> timestamps **ordenam** a aplicação: T1 → T2 → T3 → T4. T2 referencia `invoices`
> (criada em T1) e T3 referencia `contracts` (T1). Os nomes de tabela e coluna
> abaixo são **contrato** — não renomeie.

### T1 · Schema billing core — **XL** — Codex

**Files:** criar `supabase/migrations/20260819000100_sprint8_billing_core.sql`

**Why:** Não existe fatura, não existe contrato e o pagador é o CPF de quem se
cadastrou. Sem essas tabelas, nada do resto do sprint tem onde gravar.

**Produces:** `billing_products`, `billing_accounts`, `contracts`,
`contract_items`, `invoices`, `invoice_items`, `payment_events`.

- [ ] **Catálogo.**

```sql
create table if not exists public.billing_products (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  kind        text not null check (kind in ('plan','addon','credit_pack','setup','instance')),
  list_price  numeric(12,2) not null check (list_price >= 0),
  period      text not null check (period in ('monthly','one_time')),
  credits_included integer not null default 0,
  metadata    jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
```

  Seed a partir de `planos` (um `kind='plan'` por linha, `code = 'plan_' || id`,
  `list_price = preco_mensal`, `credits_included = limite_creditos`). Seed também
  `instance_whatsapp` com `list_price` = valor atual de `SOLO_INSTANCE_MONTHLY_PRICE`
  (100.00) — é o item 8 da auditoria: preço sai da env e entra no banco.
  Seed os pacotes de crédito vendidos hoje em `Billing.tsx` como `kind='credit_pack'`.

- [ ] **Entidade pagadora.** `billing_accounts` com PK `equipe_id`:
  `doc_type` check `('CPF','CNPJ')`, `doc_number` (só dígitos, check de tamanho
  11/14 conforme tipo), `legal_name`, `billing_email`, `phone`, `postal_code`,
  `address_street/number/complement/district/city/state`, `asaas_customer_id`,
  `auto_recharge_enabled boolean default false`, `auto_recharge_threshold integer`,
  `auto_recharge_product_id uuid references billing_products(id)`.
  Backfill: uma linha por equipe que tenha `asaas_customer_id`, migrando o valor
  de `equipes.asaas_customer_id` e o CPF do profile `owner` da equipe.
  **Não dropar `equipes.asaas_customer_id` neste sprint** — T6 ainda lê. Marcar
  com `COMMENT ON COLUMN ... IS 'DEPRECATED sprint 8 → billing_accounts'`.

- [ ] **Contratos.**

```sql
create table if not exists public.contracts (
  id            uuid primary key default gen_random_uuid(),
  equipe_id     uuid not null references public.equipes(id) on delete cascade,
  proposal_id   uuid,
  status        text not null default 'draft'
                check (status in ('draft','active','past_due','suspended','cancelled')),
  term_months   integer,
  started_at    timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  past_due_since timestamptz,
  cancel_at     timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_contracts_active_per_equipe
  on public.contracts (equipe_id) where status in ('active','past_due','suspended');
```

  O índice parcial garante **um contrato vigente por equipe** — sem ele, dois
  provisionamentos acidentais dobram a cobrança em silêncio.

- [ ] **Itens do contrato — onde mora o preço negociado.**
  `contract_items (id, contract_id, product_id, quantity, unit_price numeric(12,2), period, created_at)`.
  `unit_price` é o **negociado** e é autoritativo; `billing_products.list_price` é
  só a âncora de desconto. Nunca calcule cobrança a partir do catálogo quando
  existir `contract_items`.

- [ ] **Faturas.**

```sql
create table if not exists public.invoices (
  id           uuid primary key default gen_random_uuid(),
  equipe_id    uuid not null references public.equipes(id) on delete cascade,
  contract_id  uuid references public.contracts(id) on delete set null,
  number       text unique not null,
  kind         text not null check (kind in ('setup','recurring','credit_pack','adhoc')),
  status       text not null default 'draft'
               check (status in ('draft','open','paid','overdue','void','refunded')),
  subtotal     numeric(12,2) not null default 0,
  discount     numeric(12,2) not null default 0,
  total        numeric(12,2) not null default 0,
  currency     text not null default 'BRL',
  due_date     date,
  issued_at    timestamptz,
  paid_at      timestamptz,
  asaas_payment_id  text unique,
  asaas_invoice_url text,
  pix_payload  text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
```

  `number` via sequence formatada `FAT-2026-000001`. `asaas_payment_id` **unique**
  — é a segunda linha de defesa contra creditar o mesmo pagamento duas vezes.
  `invoice_items (id, invoice_id, product_id?, description, quantity, unit_price, total)`.

- [ ] **Eventos de pagamento — a tabela que resolve o P0 nº 1.**

```sql
create table if not exists public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null default 'asaas',
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null,
  invoice_id        uuid references public.invoices(id) on delete set null,
  status            text not null default 'pending'
                    check (status in ('pending','processed','failed','ignored')),
  attempts          integer not null default 0,
  last_error        text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (provider, provider_event_id)
);
```

- [ ] **RLS.** Ligar em todas. Leitura por tenant:
  `equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())`.
  ℹ️ **Sobre `profiles.id` vs `profiles.user_id`:** o trigger `handle_new_user`
  (`schema_remoto.sql:237`) insere `(id, user_id) = (new.id, new.id)`, então as duas
  colunas são iguais ao `auth.uid()` e as duas formas funcionam hoje — as policies
  existentes usam ambas (`schema_remoto.sql:994` usa `id`, o Sprint 6.1 usa `id`,
  `asaas-subscribe` consulta por `user_id`). Padronize em `user_id` nas tabelas
  novas por ser explícito, mas **não "corrija" policies existentes** neste sprint:
  elas não estão quebradas e mexer nelas está fora do escopo de T1.
  Escrita: **nenhuma policy para `authenticated`.** Dinheiro só é escrito por
  edge function com service role. `billing_products` é `select` para todos os
  autenticados. `payment_events` é invisível para o tenant.

- [ ] **Assertions** no próprio arquivo (`do $$ begin assert ... end $$;`) cobrindo:
  índice parcial bloqueia segundo contrato ativo, check de `doc_number` por tipo,
  unique de `provider_event_id`.

**Gate:** migration aplica limpa em banco novo **e** sobre o schema atual (idempotente).

---

### T2 · Schema crédito unificado — **XL** — Codex

**Files:** criar `supabase/migrations/20260819000200_sprint8_credit_ledger.sql`

**Why:** Auditoria itens 6 e 7. Existe um ledger atômico correto sem nenhum
chamador, e um saldo derivado que chama a API do provider a cada page load. Não
dá para bloquear ação nenhuma por saldo enquanto a verdade estiver fora do banco.

**Depends:** T1 (referencia `invoices`).

- [ ] **Um ledger, seis tipos de lançamento.**

```sql
create table if not exists public.credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  equipe_id   uuid not null references public.equipes(id) on delete cascade,
  entry_type  text not null check (entry_type in ('grant','topup','debit','refund','expiry','adjustment')),
  credits     integer not null,
  expires_at  timestamptz,
  source      text not null,
  ref_id      uuid,
  metadata    jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at  timestamptz not null default now(),
  unique (equipe_id, idempotency_key)
);
```

  `credits` é **assinado**. Regra de sinal como check:
  `(entry_type in ('grant','topup','refund') and credits > 0)` ou
  `(entry_type in ('debit','expiry') and credits < 0)` ou `entry_type = 'adjustment'`.
  `expires_at` só se aplica a `grant`. `source` ∈ `plan_period | invoice | ai_action | reconcile`.

- [ ] **Consumo gasta o que expira primeiro.** `debit` consome saldo de `grant`
  vigente antes de `topup`. Sem essa ordem, o crédito comprado (que não expira) é
  queimado primeiro e o cliente perde a mensalidade na virada do período —
  cobrança errada a favor da casa, que é exatamente o tipo de erro que destrói confiança.

- [ ] **Saldo.** Manter `agent_credits_balance` como **cache materializado**;
  a verdade é a soma do ledger. Criar:
  - `public.credit_balance(p_equipe_id uuid) returns integer` — soma de `credits`
    ignorando `grant` com `expires_at < now()`.
  - `public.recompute_credit_balance(p_equipe_id uuid)` — recalcula o cache.
  - View `public.v_credit_balance` expondo `expiring_balance`, `permanent_balance`,
    `total`, `grant_expires_at` — a UI precisa dos três separados (ver spec de UI).

- [ ] **Estender `charge_credits()`, não substituir.** A função do Sprint 6.1 já é
  atômica, idempotente e resolve TOCTOU com sub-bloco. Manter assinatura e
  comportamento; mudar apenas para escrever em `credit_ledger` além de
  `agent_action_ledger`, e para debitar respeitando a ordem de expiração.
  ⚠️ `agent_credits_balance.balance` tem `check (balance >= 0)` — ao introduzir
  `grant`/`topup` o cache é recalculado; garantir que `recompute` nunca tente
  gravar negativo (clamp em 0 e registrar `adjustment` se a soma der < 0).

- [ ] **Nova: `grant_credits()`** — `(p_equipe_id, p_credits, p_source, p_ref_id,
  p_expires_at, p_idempotency_key)`. Usada pelo webhook (topup) e pelo cron
  (grant mensal). Idempotente pela mesma chave única.

- [ ] **Nova: `check_credits(p_equipe_id uuid, p_estimated integer) returns jsonb`**
  — `{allowed, balance, deficit}`. É o que torna o soft stop possível. Não debita.

- [ ] **Backfill.** Para cada equipe com plano, criar um `grant` do período
  corrente com `expires_at = current_period_end`, e um `topup` com o valor de
  `equipes.creditos_avulsos`. Chave de idempotência `'backfill_sprint8_' || equipe_id`
  para a migration ser re-executável.

- [ ] **Assertions:** replay da mesma `idempotency_key` não dobra; debit respeita
  ordem grant→topup; `check_credits` não altera saldo.

---

### T3 · Schema propostas — **M** — Verboo

**Files:** criar `supabase/migrations/20260819000300_sprint8_proposals.sql`

**Why:** O pipeline comercial mora em `localStorage` do `manager.html` e morre com
o cache do navegador. E `index.html` monta a proposta por query string, então o
preço é editável pelo cliente na URL.

**Depends:** T1 (`contracts.proposal_id` aponta para cá).

- [ ] `proposals` — espelha `manager.html` mais o que o banco exige:
  `id`, `codigo text unique not null` (token público de 12 chars derivado de
  `gen_random_uuid()` — **não sequencial**, senão dá para enumerar propostas de
  terceiros), `cliente_nome`, `cliente_email`, `cliente_whatsapp`, `cliente_doc`,
  `setup_price numeric(12,2)`, `monthly_price numeric(12,2)`,
  `list_monthly_price numeric(12,2)` (o `valor_real` de hoje, usado para exibir o
  desconto), `term_months`, `valid_until date`,
  `status check in ('rascunho','enviada','vista','aceita','recusada','expirada')`,
  `equipe_id uuid` (preenchido no provisionamento), `created_by`, `sent_at`,
  `first_viewed_at`, `created_at`, `updated_at`.
- [ ] `proposal_items (id, proposal_id, product_id?, label, description, quantity,
  unit_price, period)` — substitui os flags `item_agente` / `item_crm` / `item_lp`
  por linhas reais, o que permite vender qualquer combinação sem mudar código.
- [ ] `proposal_acceptances (id, proposal_id, accepted_at, ip inet, user_agent text,
  terms_snapshot jsonb not null, accepted_name text, accepted_doc text)`.
  `terms_snapshot` congela **o que foi exibido na tela** no instante do aceite — é
  a única defesa contra "eu não aceitei esse valor" depois de uma edição.
  `unique (proposal_id)`: aceite é único.
- [ ] **RLS.** `proposals` e `proposal_items`: leitura só para `super_admin`.
  A página pública **não usa RLS** — lê por `codigo` através de edge function com
  service role, que devolve apenas campos de exibição. Nunca exponha a tabela ao anon.

---

### T4 · Schema notificações — **M** — Verboo

**Files:** criar `supabase/migrations/20260819000400_sprint8_notifications.sql`

**Why:** Não existe nenhuma infraestrutura de notificação — só `toast`, que some
no reload. Cobrança sem aviso vira disputa.

- [ ] `notifications (id, equipe_id, user_id?, type, severity, title, body,
  action_url, data jsonb, dedup_key, read_at, created_at)`.
  `severity check in ('info','success','warn','critical')`.
  `user_id` nulo = para todos os admins da equipe.
  `unique (equipe_id, type, dedup_key) where dedup_key is not null` — é o que faz
  `credits.low` disparar uma vez por período em vez de a cada page load.
- [ ] `notification_deliveries (id, notification_id, channel, status, provider_id,
  attempts, last_error, sent_at)`, `channel check in ('in_app','email','whatsapp')`,
  `unique (notification_id, channel)`.
- [ ] `notification_preferences (equipe_id, user_id, type, channels text[])` —
  ausência de linha significa "usar o default da matriz".
- [ ] Função `public.notify(p_equipe_id, p_type, p_severity, p_title, p_body,
  p_action_url, p_data, p_dedup_key)` — insere a notificação **e** as linhas de
  `notification_deliveries` conforme a matriz de canais (ver §Spec de Notificações).
  `on conflict do nothing` no dedup. Retorna o id, ou null se deduplicada.
- [ ] **RLS:** tenant lê as próprias (`user_id is null or user_id = auth.uid()`);
  update permitido **apenas** em `read_at` (policy com `with check` restrito).
  `notification_deliveries` invisível ao tenant.

---

## WAVE 1 — Fluxos de dinheiro (backend)

> Abre só depois do PM aplicar e validar as 4 migrations de W0 no banco.

### T5 · `asaas-webhook` ⭐ — **XL** — Codex

**Files:** criar `supabase/functions/asaas-webhook/index.ts`,
`supabase/functions/_shared/asaas.ts`; editar `supabase/config.toml`.

**Why:** É o P0 nº 1 e a razão de existir do sprint. Hoje nenhum pagamento é
confirmado: quem paga crédito não recebe, e quem não paga tem acesso.

**Esta é a função mais crítica do sprint.** Leia a ordem abaixo antes de codar —
ela não é estilística, cada passo evita um modo de falha específico.

- [ ] **Registrar em `config.toml` com `verify_jwt = false`.** O Asaas não manda
  JWT do Supabase. Autenticar pelo header `asaas-access-token` comparado com o
  secret `ASAAS_WEBHOOK_TOKEN`, usando **comparação de tempo constante**. Token
  ausente ou divergente → `401` e nada é gravado.

- [ ] **Passo 1 — gravar antes de processar.** Insert em `payment_events`
  (`provider_event_id` = `event.id` do payload). Se der `unique_violation`,
  **responder 200 imediatamente e parar**: é reentrega, já tratamos. Esse insert
  é o que torna o webhook idempotente; qualquer lógica antes dele é uma corrida.

- [ ] **Passo 2 — responder 200.** Só então processar. Se o processamento falhar,
  gravar `status='failed'` + `last_error` e **ainda assim** devolver 200. Devolver
  5xx faz o Asaas reentregar em loop um evento que já está registrado; o retry é
  responsabilidade do nosso cron (T7), não do gateway.

- [ ] **Passo 3 — despachar por `event_type`:**

  | Evento Asaas | Ação |
  |---|---|
  | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | fatura → `paid`, `paid_at=now()`. Depois, por `invoices.kind` (ver abaixo). |
  | `PAYMENT_OVERDUE` | fatura → `overdue`; contrato → `past_due`, `past_due_since=now()`; `notify('invoice.overdue','critical')`. |
  | `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` | fatura → `refunded`; lançar `refund` negativo no ledger revertendo o grant/topup daquela fatura; `notify(...,'critical')`. |
  | `PAYMENT_DELETED`, `PAYMENT_RESTORED` | fatura → `void` / `open`. |
  | qualquer outro | `status='ignored'`. Não falhe em evento desconhecido. |

- [ ] **Passo 3b — o que "pago" significa por tipo de fatura:**
  - `credit_pack` → `grant_credits(entry_type='topup')` com
    `idempotency_key = 'invoice_' || invoice_id`. **Nunca** derive créditos do
    valor pago; leia `invoice_items.product_id → billing_products.credits_included`.
    Confiar no valor abre a porta para pagar R$1 e receber o pacote.
  - `recurring` → contrato `active`, avançar `current_period_start/end` em 1 mês,
    `grant_credits(entry_type='grant', expires_at=current_period_end)`.
  - `setup` → marcar contrato pronto para iniciar; se já houver `recurring` paga,
    ativar.
  - `adhoc` → só marcar paga e notificar.

- [ ] **Passo 4 — notificar.** `invoice.paid` (success) para o tenant e para o
  founder. Nunca notificar dentro da transação de dinheiro; chame `notify()`
  depois do commit.

- [ ] **`_shared/asaas.ts`** concentra: base URL, header de auth, `createCustomer`,
  `createPayment`, `createSubscription`, `getPixQrCode`, e tipos dos eventos.
  Hoje esse código está duplicado literalmente entre `asaas-subscribe` e
  `asaas-buy-credits` (inclusive o bloco de criar/atualizar customer). T6 passa a
  consumir daqui.

- [ ] **Testes** (`index.test.ts`, Deno): reentrega do mesmo `event.id` credita uma
  vez só; evento com token inválido não grava nada; falha de processamento devolve
  200 e marca `failed`; `credit_pack` credita pelo catálogo e não pelo valor pago.

**Deploy:** `supabase functions deploy asaas-webhook --no-verify-jwt --project-ref egxzsivzqlqadoqpgfby`
e cadastrar a URL no painel do Asaas com o token.

---

### T6 · Refactor `asaas-subscribe` + `asaas-buy-credits` — **L** — Codex

**Files:** `supabase/functions/asaas-subscribe/index.ts`, `supabase/functions/asaas-buy-credits/index.ts`

**Why:** P0 nº 2 e nº 3. Um libera acesso antes do pagamento; o outro cobra e não
entrega. Ambos leem o CPF do profile errado (P1 nº 9).

**Depends:** T5 (`_shared/asaas.ts`).

- [ ] **`asaas-subscribe`: remover a concessão de acesso.** Deletar o
  `.update({ subscription_status: 'ACTIVE', ... })` de `index.ts:185`. A função
  passa a: criar/obter `billing_accounts`, criar contrato `draft` com
  `contract_items` a partir do catálogo, emitir a fatura `recurring` `open`, criar
  a cobrança no Asaas, gravar `asaas_payment_id`, devolver `invoice_url`.
  **Ativação é exclusividade do webhook.**
- [ ] **`asaas-buy-credits`: parar de confiar no cliente.** Hoje recebe
  `{amount, credits}` do front — o navegador escolhe quanto paga e quanto recebe.
  Passa a receber só `{product_id, payment_method}`; preço e créditos vêm de
  `billing_products`. Cria fatura `credit_pack` `open` e a cobrança; o crédito é
  entregue pelo webhook, nunca aqui.
- [ ] **Pagador correto:** ler `billing_accounts` (doc_type/doc_number/legal_name),
  não `profiles.cpf`. Se não houver conta de cobrança completa, devolver erro
  tipado `billing_account_incomplete` para a UI mandar o usuário a `/billing/dados`.
- [ ] **Testes:** subscribe não altera `subscription_status`; buy-credits ignora
  `amount` enviado pelo cliente.

---

### T7 · `billing-cron` — **L** — Verboo

**Files:** criar `supabase/functions/billing-cron/index.ts` e
`supabase/migrations/20260819000500_sprint8_billing_cron.sql`

**Why:** Inadimplência, virada de período e expiração de crédito precisam
acontecer sozinhas. Seguir o padrão de `sprint6_ingest_cron` / `sprint7_health_cron`.

- [ ] Agendar `pg_cron` diário às 09:00 BRT (12:00 UTC).
- [ ] **Vencimento:** fatura `open` com `due_date < today` → `overdue`, contrato
  `past_due`, `notify('invoice.overdue','critical')`.
- [ ] **Dunning (decisão 7 do founder):** contrato `past_due` há **7 dias** →
  `suspended` + `notify('contract.suspended','critical')`. Read-only: dados
  visíveis, IA e envio parados (T12 implementa o gate). **Nunca apagar dado.**
- [ ] **Lembrete:** fatura `open` vencendo em 3 dias → `notify('invoice.due_soon','warn')`.
- [ ] **Virada de período:** contrato `active` com `current_period_end` em ≤5 dias
  → gerar a próxima fatura `recurring` a partir de `contract_items` (preço
  **negociado**), emitir no Asaas, `notify('invoice.issued','info')`.
- [ ] **Expiração de crédito:** `grant` com `expires_at < now()` ainda não expirado
  → lançar `expiry` e recomputar saldo. Idempotência: `'expiry_' || grant_id`.
- [ ] **Retry de webhook:** `payment_events` com `status='failed'` e `attempts < 5`
  → reprocessar com backoff. É o par do "webhook nunca devolve 5xx".
- [ ] **Alertas de saldo:** consumo ≥80% → `credits.low` (warn); ≥95% →
  `credits.critical`; saldo 0 → `credits.exhausted`. `dedup_key` = id do período,
  para disparar uma vez por período.

---

### T8 · `notification-dispatcher` — **L** — Verboo

**Files:** criar `supabase/functions/notification-dispatcher/index.ts`,
`supabase/functions/_shared/notify.ts`

**Why:** `notify()` (T4) só enfileira. Alguém precisa entregar.

**Depends:** T4.

- [ ] Drena `notification_deliveries` com `status='pending'`. Invocada pelo cron
  (a cada 1 min) **e** diretamente após eventos críticos, para pagamento não
  esperar o minuto seguinte.
- [ ] **`in_app`** — nada a enviar: marcar `sent`. A UI lê a tabela via Realtime.
- [ ] **`email`** — Resend (`RESEND_API_KEY`). Remetente por nicho: `nichos.domain`
  e `primary_color` para o template. Sem nicho → default da plataforma. Templates
  pt-BR em `_shared/email-templates/`.
- [ ] **`whatsapp`** — instância **de plataforma**, `SOLO_PLATFORM_INSTANCE_ID`
  (decisão 8). ⚠️ **Nunca** usar a instância do tenant: o número do cliente é o
  canal comercial dele, e misturar cobrança nossa com atendimento dele confunde o
  destinatário e queima o número. Só `severity in ('warn','critical')`.
- [ ] **Retry:** máx. 3 tentativas com backoff (1min/5min/30min); depois `failed`
  + log. Falha de e-mail nunca deve impedir a entrega in-app.
- [ ] **Idempotência:** `unique(notification_id, channel)` já garante uma entrega
  por canal; gravar `provider_id` para auditoria.

---

### T9 · `provision-tenant` — **L** — Codex

**Files:** criar `supabase/functions/provision-tenant/index.ts`

**Why:** Decisão 6 do founder: "aceita online → eu confirmo → um clique cria
tudo". Essa função é o clique. É também o que faz a fatura já estar na tela
quando o cliente entra pela primeira vez.

**Depends:** T1, T3.

- [ ] Entrada: `{proposal_id}`. Só `super_admin`.
- [ ] **Ordem importa** — DB primeiro, externo depois:
  1. Em **uma transação**: criar `equipes`, `billing_accounts` (dados do aceite),
     `contracts` (`active`, período começando hoje) + `contract_items` copiados de
     `proposal_items` com o **preço negociado**, fatura `setup` (se houver
     `setup_price`) e a primeira `recurring`. Vincular `proposals.equipe_id` e
     `contracts.proposal_id`.
  2. Depois do commit: criar as cobranças no Asaas e gravar `asaas_payment_id`.
  3. Por último: `supabase.auth.admin.inviteUserByEmail` + `profiles` com
     `cargo='owner'`.
- [ ] **Se o convite falhar**, o tenant existe e fica marcado
  (`contracts.notes` + notificação para o founder) em vez de deixar meio criado.
  Reexecutar com o mesmo `proposal_id` é **idempotente**: se já existir contrato
  para aquela proposta, retomar do passo que faltou em vez de duplicar.
- [ ] `notify('tenant.provisioned')` para founder e cliente. O e-mail do cliente
  leva o convite **e** o link da fatura.
- [ ] **Teste:** rodar duas vezes com o mesmo `proposal_id` não cria duas equipes
  nem duas faturas.

---

## WAVE 2 — Medição e enforcement

### T10 · Ligar `charge_credits` nas ações de IA — **XL** — Codex

**Files:** criar `supabase/functions/_shared/credit-guard.ts`; editar
`supabase/functions/analyze-message/index.ts`, `supabase/functions/process-automations/index.ts`

**Why:** Auditoria nº 6 e 7. `charge_credits` tem zero chamadores e nada checa
saldo antes de agir — o soft stop que o founder escolheu **não tem hoje onde se
apoiar**. Sem esta task, o resto do sprint mede dinheiro que ninguém debita.

**Depends:** T2.

- [ ] `credit-guard.ts` expõe:
  - `assertCredits(equipeId, estimated)` → chama `check_credits`; se `!allowed`,
    lança `InsufficientCreditsError` com `{balance, deficit}`.
  - `chargeOnSuccess(equipeId, credits, idempotencyKey, ledger)` → `charge_credits`
    depois da ação ter dado certo.
- [ ] **Pré-checagem antes de gastar com o provider**, cobrança **só no sucesso**.
  Se a chamada ao provider falhar, não debite — o cliente não recebeu nada.
- [ ] **Chave de idempotência determinística** por ação
  (ex.: `msg_<message_id>`, `decision_<decision_id>`). Retry da mesma ação não
  cobra duas vezes. É para isso que a unique key de `charge_credits` existe.
- [ ] **Soft stop, não hard stop (decisão 3):** com saldo insuficiente, ações de
  IA devolvem `402` com corpo tipado `{error:'insufficient_credits', balance, deficit}`.
  ⚠️ **Chat humano e recebimento de mensagem continuam funcionando.** Um lead que
  chega precisa ser gravado mesmo sem crédito; o que para é a *resposta automática*.
- [ ] **Auditar todos os caminhos que consomem IA** antes de codar e listar no
  handoff quais foram cobertos e quais ficaram de fora, com motivo. Um caminho não
  coberto é receita perdida silenciosamente.
- [ ] **Testes:** saldo insuficiente não chama o provider; falha do provider não
  debita; mesma chave duas vezes debita uma.

---

### T11 · Saldo do ledger + conciliação — **L** — Verboo

**Files:** `supabase/functions/fetch-gpt-credits/index.ts`; criar
`supabase/functions/credits-reconcile/index.ts`

**Why:** Hoje o saldo é derivado chamando o provider a cada page load — lento,
frágil e impossível de auditar. O Sprint 7.5 já corrigiu o vazamento do saldo
pooled do workspace; agora a fonte muda de vez para o ledger local.

**Depends:** T2, T10.

- [ ] `fetch-gpt-credits` passa a ler `v_credit_balance` (um `SELECT`). Manter o
  formato de resposta atual (`creditsSpent`, `creditsBalance`, `totalCredits`,
  `periodo`) para não quebrar `Billing.tsx` e `CreditBalanceBadge.tsx`; T13 evolui a UI depois.
- [ ] Manter a conversão via `toBilledCredits` — **nunca** exponha crédito de
  provider. O ledger guarda **billed**; a coluna `metadata` guarda o provider para auditoria.
- [ ] `credits-reconcile`: job noturno que compara o débito do ledger no mês com
  `credits-spent` do provider (convertido). Divergência → lançar `adjustment` com
  `source='reconcile'` + notificar o founder. **A conciliação corrige o ledger, ela
  não é a fonte da verdade** — se ela virar a fonte, voltamos ao problema atual.
- [ ] Registrar em `config.toml` e agendar no cron.

---

### T12 · Entitlements derivados + correção de RLS — **L** — Codex

**Files:** criar `supabase/migrations/20260819000600_sprint8_entitlements.sql`,
`src/hooks/useEntitlements.ts`; editar `src/components/PageRouteGuard.tsx`

**Why:** Auditoria nº 11 (acesso é um JSONB que alguém lembra de virar) e nº 5 (a
migration que criou esse JSONB abriu um vazamento cross-tenant). São o mesmo
substrato, e não dá para construir cobrança em cima de um controle de acesso furado.

**Depends:** T1.

- [ ] **View `v_tenant_entitlements`** por equipe, derivada de `contract_items`:
  `modules text[]`, `seat_limit`, `included_credits`, `instance_limit`,
  `contract_status`, `is_read_only` (true quando `status='suspended'`).
- [ ] **Efetivo = derivado OR override.** Manter `page_permissions` **apenas** como
  override explícito de super admin (renomear conceito no comentário da coluna).
  Acesso normal passa a seguir o que foi comprado.
- [ ] 🔴 **Corrigir as políticas de `webhook_configs`.** Dropar as duas criadas em
  `20260617000000_add_team_page_permissions.sql`
  (`"Enable read for webhook_configs based on team permission"` e
  `"Enable write ..."`) e recriar **com escopo de tenant**:
  ```sql
  equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
  and equipe_id in (select id from public.equipes where (page_permissions->>'webhooks')::boolean = true)
  ```
  Conferir se `"Team members can manage webhooks"` ainda existe no banco
  (`schema_remoto.sql:994`) — políticas permissivas são **OR**, então deixar a
  antiga ao lado da nova reabre o buraco. Manter **uma** política por operação.
  **Auditar as demais tabelas tocadas por aquela migration com o mesmo padrão** e
  reportar no handoff o que foi encontrado.
- [ ] `useEntitlements.ts` lê a view; `PageRouteGuard` passa a consultá-lo em vez
  de `equipe.page_permissions` direto. Super admin continua bypassando.
- [ ] **Modo read-only:** quando `is_read_only`, a UI mostra o banner de suspensão
  e desabilita ações de escrita de IA/envio. Leitura de dados permanece.
- [ ] **Testes:** usuário da equipe A não lê `webhook_configs` da equipe B (o teste
  que teria pego o bug original).

---

## 🔔 SPEC — NOTIFICAÇÕES

**Princípio:** notificar é dizer **o que aconteceu**, **o que muda para você** e
**o que fazer agora**. Uma notificação que não tem ação clara não deveria existir.
Cobrança sem aviso vira disputa; aviso sem ação vira ruído — e ruído treina o
cliente a ignorar exatamente o aviso que importa.

## Taxonomia de eventos

Esta tabela é **contrato**. `type` é a chave usada em `notify()`, nas preferências
e nos testes. Não invente tipos fora dela sem aprovação do PM.

| `type` | Sev | Disparo | Audiência | Canais default |
|---|---|---|---|---|
| `invoice.issued` | info | Fatura emitida (cron/provisionamento) | admins do tenant | in_app, email |
| `invoice.due_soon` | warn | 3 dias antes do vencimento | admins do tenant | in_app, email, whatsapp |
| `invoice.overdue` | critical | Vencida (webhook/cron) | admins + founder | in_app, email, whatsapp |
| `invoice.paid` | success | `PAYMENT_CONFIRMED` | admins + founder | in_app, email |
| `payment.refunded` | critical | Estorno/chargeback | admins + founder | in_app, email, whatsapp |
| `credits.low` | warn | 80% do período consumido | admins do tenant | in_app, email |
| `credits.critical` | critical | 95% consumido | admins do tenant | in_app, email, whatsapp |
| `credits.exhausted` | critical | Saldo 0 — IA parada | admins do tenant | in_app, email, whatsapp |
| `credits.topup_confirmed` | success | Topup creditado pelo webhook | admins do tenant | in_app, email |
| `credits.autorecharge_failed` | critical | Auto-recarga não concluída | admins + founder | in_app, email, whatsapp |
| `contract.suspended` | critical | Dunning dia 7 → read-only | admins + founder | in_app, email, whatsapp |
| `contract.reactivated` | success | Pagamento após suspensão | admins + founder | in_app, email, whatsapp |
| `proposal.viewed` | info | Primeira abertura de `/proposta/:codigo` | **founder** | in_app, whatsapp |
| `proposal.accepted` | success | Aceite registrado | **founder** | in_app, email, whatsapp |
| `proposal.expired` | warn | `valid_until` passou sem aceite | **founder** | in_app |
| `tenant.provisioned` | success | `provision-tenant` concluído | founder + cliente | in_app, email |

> **`proposal.*` nunca vai para o tenant** — são eventos do seu funil comercial,
> não do cliente. Audiência `founder` = usuários `super_admin`.

## Regras de canal

- **in_app** — sempre. É o registro persistente; os outros canais são alertas.
- **email** — Resend. Identidade visual do nicho (`nichos.domain`, `primary_color`).
  Nunca dependa do e-mail genérico do gateway: ele não fala da sua marca e não
  menciona crédito nem módulo.
- **whatsapp** — só `warn` e `critical`, pela **instância de plataforma**
  (`SOLO_PLATFORM_INSTANCE_ID`). Nunca pela instância do tenant.
- Preferência do tenant (`notification_preferences`) pode **remover** canais, exceto
  `in_app` em eventos `critical` — o cliente não pode silenciar a informação de que
  perdeu acesso.

## Deduplicação

`dedup_key` obrigatório em todo evento recorrente:

| type | `dedup_key` |
|---|---|
| `credits.low` / `credits.critical` / `credits.exhausted` | `'<contract_id>:<period_start>'` |
| `invoice.*` | `'<invoice_id>'` |
| `contract.suspended` | `'<contract_id>:<past_due_since>'` |
| `proposal.viewed` | `'<proposal_id>'` (só a primeira visualização) |

Sem isso, `credits.low` dispara a cada page load e o cliente aprende a ignorar o
aviso — e aí `credits.exhausted` também passa despercebido.

## Copy (pt-BR)

Três frases, nesta ordem: **fato → impacto → ação.**

- ✅ `credits.exhausted` — "Seus créditos acabaram. **O agente parou de responder
  automaticamente**; o chat com sua equipe continua normal. Recarregue para
  religar." · CTA "Recarregar créditos" → `/billing/creditos`
- ✅ `contract.suspended` — "Sua conta está em modo somente leitura desde
  {data}. **Seus dados estão salvos**; envio e IA estão pausados. Pague a fatura
  em aberto para religar na hora." · CTA "Ver fatura" → `/billing/faturas`
- ❌ "Atenção: status alterado." — não diz nada, não dá o que fazer.

Sempre dizer o que **continua funcionando**. Um cliente que acha que perdeu os
dados liga irritado; um que sabe que só a IA parou vai pagar a fatura.

---

## 💳 SPEC — BILLING UI

**Princípio:** a página responde quatro perguntas, sem o usuário caçar:
**o que eu tenho · quanto usei · quanto devo · o que acontece se eu não pagar.**

`Billing.tsx` tem 835 linhas fazendo tudo. Vira shell com sub-rotas, no mesmo
padrão já usado em `/ai-studio` (que tem `usage`, `knowledge`, `channels`, `settings`).

## Estrutura de rotas

```
/billing            → Visão geral
/billing/faturas    → Faturas e recibos
/billing/creditos   → Saldo, recarga, auto-recarga
/billing/contrato   → Plano, módulos, itens contratados
/billing/dados      → Dados de cobrança (CPF/CNPJ, endereço)
```

## `/billing` — Visão geral

**1. Banner de status** (só aparece quando há algo a fazer). É o elemento mais
importante da página — o estado da conta nunca deve exigir interpretação.

| Estado | Cor | Texto | CTA |
|---|---|---|---|
| `active` | — | *(sem banner)* | — |
| `past_due` | âmbar | "Fatura de {mês} vencida em {data}. Sua conta entra em modo somente leitura em **{N} dias**." | Pagar agora |
| `suspended` | vermelho | "Conta em modo somente leitura. Dados preservados; IA e envio pausados." | Regularizar |
| sem `billing_account` | azul | "Complete seus dados de cobrança para emitir faturas." | Completar |

O contador **{N} dias** é o ponto: transforma prazo abstrato em urgência concreta,
e é honesto porque a regra é fixa em 7 dias.

**2. Três cards — um número herói cada.** Nada de dois números do mesmo tamanho
disputando atenção no mesmo card.

- **Plano atual** — herói: valor mensal. Apoio: nome, próxima cobrança, módulos ativos.
- **Créditos** — herói: saldo restante. Apoio: gauge restante/total, dias até a
  virada, e **"{X} do plano (expiram em {data}) + {Y} avulsos (não expiram)"**.
  A separação vem de `v_credit_balance` e não é detalhe: o cliente precisa saber
  que o crédito comprado sobrevive à virada, senão ele não compra.
- **Fatura em aberto** — herói: valor. Apoio: vencimento, status. CTA "Pagar".
  Sem fatura em aberto: "Nenhuma fatura em aberto" com check discreto.

**3. Consumo** — gráfico existente, mantido, sempre em créditos **billed**.
**4. Últimas 5 faturas** — tabela compacta, link para `/billing/faturas`.

## `/billing/faturas`

Tabela: número · descrição · emissão · vencimento · valor · status (badge) · ações.
Filtros por status e período. Ações por linha: **Pagar** (aberta/vencida), **Ver
recibo** (paga), **Copiar PIX**. Vazio: "Nenhuma fatura ainda."

**Fluxo PIX** (dialog, evoluído do que já existe em `Billing.tsx`):
QR + copia-e-cola + botão copiar → **polling do status a cada 5s** → estado de
sucesso animado ("Pagamento confirmado! Créditos liberados.") sem exigir reload.
O polling lê `invoices.status`, que o webhook atualiza — é o que faz a promessa do
sprint ficar visível para o cliente no momento em que acontece.

## `/billing/creditos`

- Saldo em destaque, com a separação expira/não-expira.
- **Pacotes** do catálogo (`billing_products` `kind='credit_pack'`) em cards —
  preço e créditos vindos do banco, **não** do slider client-side de hoje.
  O front nunca manda preço.
- **Auto-recarga** (T18): toggle, limiar, pacote. ⚠️ **Copy honesta:** com cartão
  salvo a recarga é automática; **com PIX o sistema gera a cobrança e avisa, mas
  alguém precisa pagar.** Prometer automação que o PIX não entrega gera a exata
  quebra de confiança que este sprint existe para evitar.
- Histórico do ledger: data · tipo · créditos · origem. É o extrato — a prova de
  que todo débito e crédito tem origem rastreável.

## `/billing/contrato`

Itens contratados (de `contract_items`): módulo · quantidade · valor unitário ·
total. Vigência, período atual, renovação. Se houver desconto sobre
`list_price`, mostrar **"de R$X por R$Y"** — o cliente que negociou gosta de ver
o desconto que conquistou toda vez que abre a página.

## `/billing/dados`

Formulário de `billing_accounts`: tipo (CPF/CNPJ) com máscara e validação de
dígito verificador, razão social/nome, e-mail de cobrança, telefone, endereço com
busca por CEP. Bloqueia emissão enquanto incompleto, com aviso claro do porquê.

## Regras transversais de UI

- **Moeda** sempre `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})`.
  Nunca concatenar `'R$ ' + valor`.
- **Skeletons** com a altura final do conteúdo. Zero layout shift — em tela de
  dinheiro, conteúdo que pula parece erro.
- **Nunca dois números que possam divergir.** O bug do Sprint 7.5 (gráfico e lista
  discordando por 2x) nasceu disso. Uma fonte por número: o ledger.
- **Erro é acionável.** "Não foi possível gerar a cobrança. Verifique seus dados
  de cobrança." + link — nunca "Erro ao processar".
- **Dark mode** e responsivo obrigatórios (padrão do projeto).
- **Nenhuma menção à marca do provider** em texto visível.

---

## WAVE 3 — Frontend

### T13 · Billing UI — 5 sub-rotas — **XL** — Verboo

**Files:** `src/pages/Billing.tsx` (vira shell), criar `src/pages/billing/**`
(`OverviewPage`, `InvoicesPage`, `CreditsPage`, `ContractPage`, `BillingDataPage`),
`src/components/billing/**`

**Why:** `Billing.tsx` tem 835 linhas e mistura créditos, planos, PIX e instâncias
numa tela só — e agora precisa mostrar faturas, contrato e dados de cobrança.

**Depends:** T11 (saldo), T1 (faturas/contrato).

- [ ] Implementar exatamente a **§SPEC — BILLING UI** acima. Rotas aninhadas em
  `App.tsx` seguindo o padrão de `/ai-studio` (`Route` pai + filhos).
- [ ] Preservar a seção de instâncias WhatsApp (T11 do Sprint 7.2), movida para
  `/billing/contrato`, agora com preço vindo de `billing_products` em vez de
  chamar `manage-solo-instances` uma vez por instância — o `Promise.all` de
  `status` por instância em `Billing.tsx:98` vira N chamadas de rede a cada load.
- [ ] TanStack Query para tudo, com `invalidateQueries` após pagamento.
- [ ] Nenhum componente novo com mais de ~250 linhas; extrair para `components/billing/`.

**Gate:** `npx tsc -b` e `npm run build` limpos.

---

### T14 · Central de notificações — **L** — Verboo

**Files:** criar `src/components/notifications/**`, `src/hooks/useNotifications.ts`;
editar `src/components/TopNavbar.tsx`

**Depends:** T4, T8.

- [ ] Sino no `TopNavbar` com badge de não lidas.
- [ ] Popover: lista agrupada por dia, ícone por severidade, título + corpo, tempo
  relativo pt-BR, CTA quando houver `action_url`.
- [ ] Marcar como lida ao clicar; "marcar todas como lidas".
- [ ] **Realtime** via canal Supabase em `notifications` filtrado por equipe —
  notificação crítica precisa chegar sem reload.
- [ ] `critical` também dispara um `toast` (sonner) — mas o toast é reforço, o
  registro persistente é a central.
- [ ] Vazio: "Nenhuma notificação." Página `/notificacoes` com histórico completo.

---

### T15 · Admin — aba Propostas — **XL** — Codex

**Files:** criar `src/components/admin/proposals/**`; editar `src/pages/Admin.tsx`
(**apenas** para adicionar a aba)

**Why:** Traz o `manager.html` para dentro do produto e para o banco compartilhado.

**Depends:** T3.

- [ ] Nova aba "Propostas" ao lado de nichos/equipes/usuários/solo-instances.
- [ ] **Header de estatísticas** (equivalente ao `header-stats` do manager.html):
  total, enviadas, aceitas, taxa de conversão, valor do funil.
- [ ] **Lista** com filtro por status e busca por cliente. Colunas: código ·
  cliente · setup · mensal · validade · status · ações.
- [ ] **Formulário** de criar/editar: dados do cliente, itens (linhas de
  `proposal_items` a partir do catálogo, com preço editável = negociado),
  setup, mensalidade, `list_monthly_price` para exibir desconto, prazo, validade.
  **Preview do link** + copiar (equivalente a `preview-link`/`preview-codigo`).
- [ ] **Pipeline de status**: rascunho → enviada → vista → aceita/recusada/expirada.
  `vista` e `aceita` são gravados pela página pública, não à mão.
- [ ] **Aceite:** quando `aceita`, mostrar o painel de aceite (data, IP, user agent,
  snapshot dos termos) e o botão **Provisionar** → `provision-tenant` (T9), com
  confirmação mostrando o que será criado. Depois de provisionada, a proposta
  linka para a equipe criada.
- [ ] **Migração dos dados existentes:** exportar o `localStorage` do `manager.html`
  para JSON e importar via script único documentado no handoff. Sem isso o
  histórico comercial atual se perde na virada.

---

### T16 · Admin — aba Faturamento — **L** — Codex

**Files:** criar `src/components/admin/billing/**`

**Depends:** T15 merged (ambas tocam `Admin.tsx`). **Não abrir em paralelo com T15.**

- [ ] Aba "Faturamento": contratos (equipe, status, MRR, período, ações) e faturas
  (todas as equipes, filtro por status/equipe/período).
- [ ] Resumo no topo: **MRR**, faturas em aberto, vencidas, recebido no mês.
  MRR = soma de `contract_items` mensais de contratos `active` — preço negociado.
- [ ] Ações: emitir fatura avulsa (`adhoc`), cancelar (`void`), reenviar cobrança,
  ver eventos de `payment_events` da fatura (auditoria — é aqui que você investiga
  "o cliente diz que pagou").
- [ ] Editar catálogo `billing_products` (preço, ativo). **Alterar `list_price`
  nunca altera contrato vigente** — contratos carregam o preço deles. Deixar isso
  explícito na UI.

---

### T17 · Página pública `/proposta/:codigo` — **L** — Verboo

**Files:** criar `src/pages/PublicProposal.tsx`, `supabase/functions/public-proposal/index.ts`;
editar `src/App.tsx` (**apenas** a rota, fora do `ProtectedRoute`)

**Why:** Substitui `index.html` por uma página que lê do banco. Hoje a proposta é
montada por query string — o cliente pode editar o próprio preço na URL antes de
"aceitar", e nada registra o aceite.

**Depends:** T3.

- [ ] Rota **pública**. Edge function `public-proposal` (`verify_jwt = false`) com
  service role: `GET` por `codigo` devolve **só** campos de exibição; `POST /accept`
  registra o aceite. A tabela nunca é exposta ao anon.
- [ ] Portar o visual de `index.html` (o design está aprovado) para React +
  Tailwind, com os dados vindo do banco.
- [ ] Primeira abertura grava `first_viewed_at`, status → `vista`, dispara
  `proposal.viewed` (dedup por proposta) — você fica sabendo que o cliente abriu.
- [ ] **Aceite:** nome + documento + checkbox dos termos → grava
  `proposal_acceptances` com `accepted_at`, `ip`, `user_agent` e `terms_snapshot`
  **montado no servidor** a partir do banco (nunca do que o cliente mandou), status
  → `aceita`, dispara `proposal.accepted`.
- [ ] Recusar `valid_until` vencida com mensagem clara e CTA de contato.
- [ ] Links legados com query string continuam abrindo (fallback), mas **sem** aceite.

---

## WAVE 4 — Fechamento

### T18 · Auto-recarga + banners de saldo — **M** — Verboo

**Files:** criar `src/components/billing/AutoRecharge.tsx`, `src/components/billing/CreditAlert.tsx`

**Depends:** T13.

- [ ] Configuração de auto-recarga gravando em `billing_accounts`
  (`auto_recharge_enabled/threshold/product_id`).
- [ ] **Copy honesta sobre PIX** — ver §SPEC. Com PIX: "geramos a cobrança e
  avisamos você" (não "recarrega sozinho").
- [ ] `CreditAlert`: banner global em 80% / 95% / 0, dispensável mas reaparecendo a
  cada sessão enquanto a condição durar. Em 0: deixar explícito que **o chat humano
  continua funcionando**.

### T19 · Sweep de copy + docs — **S** — Gemini — *roda sozinha*

- [ ] Varredura de menções à marca do provider em texto visível.
- [ ] Revisão de copy pt-BR das notificações e da UI de billing contra a §SPEC.
- [ ] `docs/` — runbook: como configurar o webhook do Asaas, secrets necessários,
  como conciliar um pagamento manualmente.
- [ ] Fechar `Planning/Workflow/billing.md`.

---

## 🔑 SECRETS NOVOS (founder configura antes de W1)

| Secret | Onde | Para quê |
|---|---|---|
| `ASAAS_WEBHOOK_TOKEN` | Supabase Edge Secrets | Autenticar o webhook (header `asaas-access-token`) |
| `RESEND_API_KEY` | Supabase Edge Secrets | E-mail transacional |
| `SOLO_PLATFORM_INSTANCE_ID` | Supabase Edge Secrets | Instância WhatsApp de plataforma |

⚠️ `SOLO_INSTANCE_MONTHLY_PRICE` fica **deprecado** após T1 (preço vai para o
catálogo). Manter a env até T13 migrar a leitura; remover em 8.1.

---

# 📊 ZONE 3 — LEDGER

| # | Task | Tier | Engineer | Status |
|---|---|---|---|---|
| T1 | Schema billing core | XL | Claude (PM) | [x] |
| T2 | Schema crédito unificado | XL | Claude (PM) | [x] |
| T3 | Schema propostas | M | Claude (PM) | [x] |
| T4 | Schema notificações | M | Claude (PM) | [x] |
| T5 | `asaas-webhook` | XL | Claude (PM) | [x] |
| T6 | Refactor subscribe + buy-credits | L | Claude (PM) | [x] |
| T7 | `billing-cron` | L | Claude (PM) | [x] |
| T8 | `notification-dispatcher` | L | Verboo | [ ] |
| T9 | `provision-tenant` | L | Codex | [ ] |
| T10 | Wire `charge_credits` | XL | Codex | [ ] |
| T11 | Saldo do ledger + conciliação | L | Verboo | [ ] |
| T12 | Entitlements + fix RLS | L | Codex | [ ] |
| T13 | Billing UI | XL | Verboo | [ ] |
| T14 | Central de notificações | L | Verboo | [ ] |
| T15 | Admin — Propostas | XL | Codex | [ ] |
| T16 | Admin — Faturamento | L | Codex | [ ] |
| T17 | Página pública de proposta | L | Verboo | [ ] |
| T18 | Auto-recarga + banners | M | Verboo | [ ] |
| T19 | Sweep de copy + docs | S | Gemini | [ ] |

> Cada engenheiro adiciona **uma linha** em `Planning/Workflow/billing.md` ao
> concluir sua task, e marca `[x]` aqui na própria branch.

---

## ⚠️ RISCOS CONHECIDOS

1. **Auto-recarga com PIX não é automática.** Restrição do meio de pagamento, não
   do código. Mitigação: copy honesta + alertas agressivos (T18).
2. **A conciliação pode revelar divergência histórica** entre o consumo do provider
   e o ledger novo, já que nunca houve ledger. Backfill em T2 cria o marco zero;
   consumo anterior a ele não é reconstruível. Documentar em T19.
3. **Workspace pooled do provider.** Sete tenants dividem o mesmo workspace. O
   Sprint 7.5 já isolou o *saldo*; o `credits-spent` por agente continua sendo a
   única medição por tenant. Se o provider mudar essa rota, a conciliação quebra.
4. **`Admin.tsx` é um arquivo único e grande.** T15 e T16 o tocam — por isso são
   sequenciais. Se T15 crescer demais, o PM avalia extrair as abas antes de T16.
5. **Deploy manual.** Sem CI, cada função nova precisa de deploy explícito. T5 e
   T17 exigem `--no-verify-jwt`; esquecer isso faz o webhook devolver 401 para o
   Asaas silenciosamente. O runbook de T19 cobre isso.
