# Sprint 8.2 — Onboarding, go-live e a marca Solo Rev

**Data:** 2026-09-02
**Estado:** aprovado (decisões do fundador registradas abaixo)

---

## 1. O problema, medido em produção

O app está em semi-produção com 5 clientes pagantes. Consultei o banco de
produção (`egxzsivzqlqadoqpgfby`) antes de desenhar qualquer coisa. Três defeitos
distintos produzem os sintomas relatados.

### 1.1 Provisionar sempre cria uma equipe nova

`provision_tenant_from_proposal()` faz `insert into equipes` incondicionalmente.
Não existe caminho para "esse cliente já está no software". Resultado hoje:

| Equipe com operação real            | leads | Duplicata vazia criada em 02/09 |
| ----------------------------------- | ----- | ------------------------------- |
| Solo Energia `939d7dd8`             |   456 | Solo Energia `c39a6d83`         |
| Rema Digital `33b33ec5`             |     4 | Rema Digital `b16e48b5`         |
| Walter Inglez Advogados `26b9ab8c`  |   246 | WI Advogados `e5bda77f`         |

E a consequência que ninguém veria pelo painel: **o contrato ativo da Solo
Energia está na equipe vazia**. A equipe com 456 leads, 470 conversas e o
`asaas_customer_id` real não tem contrato nenhum.

### 1.2 O "erro ao gerar a fatura" tem uma causa única

`src/pages/PublicProposal.tsx:588` renderiza o campo de CPF/CNPJ com
`placeholder="Opcional"`, e `public-proposal/index.ts` aceita qualquer coisa —
inclusive string vazia. Todas as quatro aceitações em produção têm
`accepted_doc = ""`.

O efeito em cadeia:

```
accepted_doc = ""
  → billing_accounts.doc_number = null        (provision, passo 2)
    → ensureCharges() lança billing_account_incomplete
      → a fatura existe, a cobrança no Asaas não
```

Prova: `FAT-2026-000018`, Rema Digital, R$700, `status = open`,
`asaas_payment_id = null`.

O mesmo formulário também não coleta e-mail. `WI Advogados` e `Jornada do R1`
estão com `cliente_email = null`, e o provisionamento registrou
`invite: proposal has no client email` — o cliente nunca recebeu acesso.

### 1.3 Provisionar *é* go-live no código

Um clique faz: cria equipe, inicia o relógio do trial, emite a fatura de setup,
dispara a cobrança e envia `tenant.provisioned` com o corpo *"A primeira fatura
já está disponível em Faturamento"*.

Esse é o e-mail errado que o cliente recebeu. Não existe espaço entre "aceitou"
e "está no ar" — e é exatamente ali que mora o serviço: discovery, treinamento
do agente, conexão de canais, arquitetura do CRM, integração de anúncios.

---

## 2. Decisões do fundador

| # | Decisão |
| - | ------- |
| D1 | Kanban com **7 etapas** editáveis, cada uma com dono (Solo/cliente) e definição de pronto |
| D2 | Legado entra no kanban por backfill; Rema e WI recomeçam |
| D3 | **Solo Rev** = produto; **Solo Ventures** = empresa que fatura |
| D4 | Cliente recebe login **no provisionamento**, para acompanhar a implantação. O trial não corre |
| D5 | WI Advogados: **mantém a equipe antiga** (246 leads), apaga a duplicata de hoje |
| D6 | Rema Digital: **apaga a antiga**, mantém a de hoje |
| D7 | A fatura de implantação **é emitida no provisionamento**, com vencimento na data prevista de conclusão. `on_accept` cobra na hora; `on_golive` cobra no clique do Go-live |
| D8 | Solo Teste: apagar |
| D9 | Reset do legado (Casa Flow, Solo Energia, Jornada do R1) é operação de dados. **Sem mudança de código** |

---

## 3. Arquitetura

### 3.1 O ciclo de vida, antes e depois

```
ANTES
  Aceite ──[Provisionar]──► equipe + trial + fatura + cobrança + "sua fatura está pronta"
           (um clique faz tudo, no momento errado)

DEPOIS
  Aceite ──[Provisionar]──► equipe (nova OU existente)
                            contrato 'onboarding'  · trial NÃO corre
                            fatura de implantação  · vence na data prevista
                            cobrança Asaas         · só se on_accept
                            convite de acesso
                            boas-vindas + link do Calendly
                                    │
                            ┌───────┴────────┐
                            │  7 etapas no   │  discovery, implantação,
                            │  kanban admin  │  homologação
                            └───────┬────────┘
                                    │
         ──[Colocar no ar]──► went_live_at = agora
                              trial de 15 dias começa AGORA
                              cobrança Asaas da implantação (se on_golive)
                              "seu Solo Rev está no ar"
                                    │
                              trial acaba → billing-cron emite a 1ª mensalidade
```

A separação entre *emitir a fatura* e *emitir a cobrança* é a mudança que torna
o processo confiável. A fatura existe desde o provisionamento — o cliente vê o
compromisso e a data. A cobrança sai quando o negócio disse que sairia.

### 3.2 Unidades novas

Cada uma tem uma responsabilidade e uma interface. Nenhuma precisa que se leia a
outra por dentro.

| Unidade | O que faz | Depende de |
| ------- | --------- | ---------- |
| `onboarding_stages` | O vocabulário das etapas. Editável sem deploy | — |
| `onboardings` | Um card: onde o cliente está, desde quando, o que trava | `proposals`, `equipes`, `onboarding_stages` |
| `onboarding_events` | Histórico imutável de transições | `onboardings` |
| `go_live_contract()` | A transação de go-live, atômica | `contracts`, `invoices` |
| `golive-tenant` | Orquestra: RPC → cobrança → notificação | `go_live_contract`, `_shared/billing-charges` |
| `_shared/billing-charges.ts` | Cliente Asaas idempotente (extraído de `provision-tenant`) | `_shared/asaas.ts` |
| `_shared/brand.ts` / `src/config/brand.ts` | O nome da marca, num lugar só | — |
| `src/lib/br-doc.ts` | **Já existe.** Validação de CPF/CNPJ. Passa a ser usada | — |

---

## 4. Schema

### 4.1 Etapas

```sql
create table public.onboarding_stages (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  label       text not null,
  description text,                        -- a definição de pronto, exibida no card
  owner       text not null default 'solo' check (owner in ('solo','cliente')),
  sort_order  integer not null,
  is_initial  boolean not null default false,
  is_terminal boolean not null default false,
  active      boolean not null default true
);
```

Semeadas:

| ordem | code | label | dono | definição de pronto |
| ----- | ---- | ----- | ---- | ------------------- |
| 1 | `aceite` | Aceite | solo | Proposta aceita. Ambiente ainda não existe |
| 2 | `boas_vindas` | Boas-vindas | cliente | Ambiente criado, acesso enviado, cliente convidado a agendar o discovery |
| 3 | `discovery` | Discovery | cliente | Reunião realizada; contexto, oferta e processo comercial mapeados |
| 4 | `implantacao` | Implantação | solo | Agente treinado, canais conectados, CRM montado, Meta Ads integrado |
| 5 | `homologacao` | Homologação | cliente | Cliente validou o agente e o funil num teste real |
| 6 | `go_live` | Go-live | solo | Pronto para entrar no ar. Aguardando o clique |
| 7 | `ativo` | Ativo | solo | No ar. Trial correndo ou assinatura ativa |

`aceite` é `is_initial`, `ativo` é `is_terminal`.

### 4.2 O card

```sql
create table public.onboardings (
  id                    uuid primary key default gen_random_uuid(),
  proposal_id           uuid unique references public.proposals(id) on delete cascade,
  equipe_id             uuid unique references public.equipes(id)   on delete cascade,
  stage_id              uuid not null references public.onboarding_stages(id),
  cliente_nome          text not null,
  responsavel_user_id   uuid,
  -- D7: o cliente vê isto como o vencimento da fatura de implantação.
  golive_previsto       date,
  discovery_agendado_em timestamptz,
  discovery_feito_em    timestamptz,
  went_live_at          timestamptz,
  health                text not null default 'on_track'
                        check (health in ('on_track','at_risk','blocked')),
  blocked_reason        text,
  notes                 text,
  entered_stage_at      timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint onboardings_has_subject check (proposal_id is not null or equipe_id is not null)
);
```

`proposal_id` é nullable porque os clientes legados entram por backfill sem
proposta. `equipe_id` é nullable porque o card nasce no aceite, antes da equipe.
O CHECK garante que um card sempre tem um dos dois.

Ambos são `unique`: um cliente, um card.

### 4.3 Histórico

```sql
create table public.onboarding_events (
  id             uuid primary key default gen_random_uuid(),
  onboarding_id  uuid not null references public.onboardings(id) on delete cascade,
  from_stage     text,
  to_stage       text not null,
  note           text,
  actor_user_id  uuid,
  created_at     timestamptz not null default now()
);
```

Escrito por trigger em `onboardings`, nunca pela aplicação. Um card que voltou de
Homologação para Implantação três vezes é a informação mais útil do sistema, e
ela se perde se depender de alguém lembrar de registrar.

### 4.4 Mudanças em tabelas existentes

```sql
-- Provisionar sobre uma equipe que já existe (§1.1)
alter table public.proposals
  add column if not exists target_equipe_id uuid references public.equipes(id) on delete set null;

-- O contrato existe antes de estar no ar
alter table public.contracts drop constraint contracts_status_check;
alter table public.contracts add constraint contracts_status_check
  check (status in ('draft','onboarding','trialing','active','past_due','suspended','cancelled'));

-- Um contrato vivo por equipe. 'trialing' e 'onboarding' faltavam: hoje dá para
-- provisionar duas vezes e criar duas cobranças sem que nada reclame.
drop index if exists uq_contracts_active_per_equipe;
create unique index uq_contracts_active_per_equipe on public.contracts (equipe_id)
  where status in ('onboarding','trialing','active','past_due','suspended');
```

E a view de entitlements ganha `onboarding` em `is_live` — D4 diz que o cliente
tem acesso durante a implantação:

```sql
(c.status in ('onboarding','trialing','active','past_due')) as is_live
```

`is_read_only` continua sendo só `suspended`. Implantação não é inadimplência.

---

## 5. As duas transações

### 5.1 `provision_tenant_from_proposal(p_proposal_id)` — reescrita

Muda em quatro pontos:

1. **Anexa ou cria.** Se `proposals.target_equipe_id` está preenchido, usa aquela
   equipe: nada de `insert into equipes`, e a `billing_accounts` existente é
   atualizada em vez de duplicada (`on conflict (equipe_id) do update`).
2. **Contrato nasce `onboarding`.** Sem `trial_ends_at`, sem `went_live_at`, sem
   `current_period_end`. O relógio não corre.
3. **A fatura de implantação sai aqui** (D7), quando `not setup_waived and
   setup_price > 0`, com `due_date = golive_previsto`. Vale para os dois
   `setup_charge_timing` — o que muda é só quando a cobrança é emitida.
4. **Cria o card do onboarding** na etapa `boas_vindas`, com `golive_previsto`.

`golive_previsto` entra como parâmetro (`p_golive_previsto date default null`),
com fallback `current_date + 21`. Vinte e um dias porque é o prazo real de uma
implantação com discovery, treinamento e integração de anúncios; um padrão que
mente vira uma fatura vencida antes da entrega.

Reexecutar continua retornando os ids existentes em vez de duplicar.

### 5.2 `go_live_contract(p_contract_id)` — nova

```
1. trava o contrato (for update)
2. se went_live_at já existe → retorna o que existe (idempotente)
3. went_live_at = now()
   status = 'trialing' se trial_days > 0, senão 'active'
   trial_ends_at, current_period_start/end
4. garante a fatura de implantação (caso a proposta tenha sido editada depois
   do provisionamento e o setup tenha deixado de ser isento)
5. card → etapa 'ativo', went_live_at
6. devolve setup_invoice_id, trial_ends_at, cobrar_agora
```

`cobrar_agora` é `true` quando `setup_charge_timing = 'on_golive'` e a fatura
ainda não tem `asaas_payment_id`. É o que diz à edge function se ela deve
chamar o gateway.

Quando a cobrança sai no go-live e o `golive_previsto` já passou, o vencimento
é recalculado para `greatest(golive_previsto, current_date + 3)`. Emitir um
boleto já vencido é pior do que não emitir.

---

## 6. Edge functions

### 6.1 `_shared/billing-charges.ts` — extraído

`ensureCharges()` sai de `provision-tenant/index.ts` e vira compartilhado, porque
`golive-tenant` precisa exatamente do mesmo comportamento idempotente. Ganha uma
mudança: em vez de lançar `billing_account_incomplete` como erro genérico,
retorna um resultado tipado dizendo *o que* falta (`doc`, `email`), para que o
diálogo de go-live consiga mostrar o campo certo.

### 6.2 `provision-tenant/index.ts`

- Aceita `golive_previsto` no corpo.
- Só chama o gateway quando `setup_charge_timing = 'on_accept'`.
- Troca a notificação: `tenant.provisioned` some, entra `onboarding.welcome`.

### 6.3 `golive-tenant/index.ts` — nova

Super admin. Recebe `{ contract_id }` ou `{ onboarding_id }`.

```
1. valida CPF/CNPJ e e-mail da billing_account ANTES de qualquer coisa
   → 409 { error: 'billing_incomplete', missing: ['doc'] } se faltar
2. rpc go_live_contract
3. se cobrar_agora → ensureCharges (não fatal: a fatura fica e o
   billing-cron reemite)
4. notify onboarding.golive
```

A validação vem primeiro de propósito. Colocar no ar e só então descobrir que a
cobrança não sai é como o sistema se comporta hoje.

### 6.4 `public-proposal/index.ts` — a raiz do §1.2

O aceite passa a exigir:

- `accepted_doc` com CPF ou CNPJ **válido** (dígito verificador conferido no
  servidor, não só no navegador) sempre que o negócio tem qualquer valor —
  `setup_price > 0 or monthly_price > 0 or chosen_plan_code is not null`
- `accepted_email` válido, gravado em `proposals.cliente_email` quando a proposta
  não tem um

Novo `supabase/functions/_shared/br-doc.ts`, porta do `src/lib/br-doc.ts` que já
existe e já é testado. Deno não importa de `src/`, então é uma cópia — com um
teste que trava os mesmos casos, para as duas não divergirem em silêncio.

---

## 7. Notificações

Dois tipos novos, ambos com template editável.

| tipo | remetente | canais | quando |
| ---- | --------- | ------ | ------ |
| `onboarding.welcome` | comercial | whatsapp, email, inapp | provisionamento |
| `onboarding.golive` | financeiro | whatsapp, email, inapp | go-live |

`tenant.provisioned` deixa de ser disparado. O tipo continua na tabela para não
quebrar histórico.

Template de boas-vindas (semeado, editável no painel):

```
Bem-vindo à Solo Rev, {{cliente_nome}}!

Seu ambiente já está criado e o acesso foi enviado para o seu e-mail.

O próximo passo é a nossa reunião de discovery — é onde entendemos seu processo
comercial, sua oferta e seus canais para montar tudo do seu jeito.

Agende no melhor horário para você: {{link_agenda}}

Qualquer dúvida, é só responder esta mensagem.
```

Variáveis: `cliente_nome`, `link_agenda`, `link_app`, `golive_previsto`.

`link_agenda` vem de `system_settings.ONBOARDING_CALENDLY_URL`, semeado com
`https://calendly.com/mateus-soloenergia/30min` — editável sem deploy, porque o
link de agenda muda mais do que o código.

---

## 8. A marca

### 8.1 Um ponto de verdade

`src/config/brand.ts` e `supabase/functions/_shared/brand.ts`:

```ts
export const BRAND = {
  product: "Solo Rev",       // o software
  company: "Solo Ventures",  // quem fatura
  tagline: "Motor de Receita",
  color: "#FF7700",          // hsl(28 100% 50%), o laranja já usado no app
} as const;
```

`#FF7700` é a conversão exata do `--primary: 28 100% 50%` de `src/index.css`.
O e-mail e o app passam a usar literalmente a mesma cor.

### 8.2 Onde troca

| Arquivo | Hoje | Depois |
| ------- | ---- | ------ |
| `index.html` | "Máquina Automática de Vendas \| Transforme Seu Negócio" | "Solo Rev — Motor de Receita" + og/twitter |
| `public/manifest.json` | "Solo Ventures - Máquina de Vendas" | "Solo Rev", `theme_color` `#FF7700` |
| `notification-dispatcher` | `PLATFORM_NAME ?? "Sales Engine"` (2×) | `BRAND.product` |
| `PublicProposal.tsx` | "O Sales Engine junta o que hoje..." | "O Solo Rev junta..." |
| `OpportunityCard.tsx`, `OpportunityDetailModal.tsx`, `ContactDetailsModal.tsx` | "Abrir conversa no Sales Engine" | "...no Solo Rev" |
| `billing_products` | "Integração Meta Ads ↔ Sales Engine" | "↔ Solo Rev" (migration) |

### 8.3 O guarda

`src/__tests__/brand-consistency.test.ts`, no molde do
`no-provider-branding.test.ts` que já existe: falha se `/sales\s*engine/i`
aparecer em qualquer fonte de `src/`. É o que impede a marca antiga de voltar
por um copiar-colar daqui a dois sprints.

### 8.4 O e-mail

`_shared/email-templates.ts` continua sendo tabela com estilo inline — Outlook
não é navegador. Mudam:

- barra superior de 4px → faixa laranja Solo com o wordmark **SOLO REV**
- a cor de acento vira o laranja da marca; severidade passa a ser um selo
  (Informação / Concluído / Atenção / Urgente) em vez de tingir a marca inteira
- rodapé: "Solo Rev é um produto da Solo Ventures" + link do app
- white-label por nicho preservado: quando a equipe tem nicho, o nome e a cor do
  nicho continuam vencendo

---

## 9. O kanban

`src/components/admin/onboarding/`, nova aba `?tab=onboarding` no Admin.

```
┌──────────┬────────────┬───────────┬─────────────┬─────────────┬──────────┐
│ Aceite   │Boas-vindas │ Discovery │ Implantação │ Homologação │ Go-live  │
│          │            │           │             │             │          │
│ ┌──────┐ │ ┌────────┐ │ ┌───────┐ │ ┌─────────┐ │             │┌────────┐│
│ │PlanLog│ │ │Rema    │ │ │Casa   │ │ │WI Adv.  │ │             ││Jornada ││
│ │R$700 │ │ │Digital │ │ │Flow   │ │ │         │ │             ││do R1   ││
│ │      │ │ │ 2d     │ │ │ 5d ⚠  │ │ │ 12d 🔴  │ │             ││        ││
│ │      │ │ │→ 23/09 │ │ │→ 20/09│ │ │→ 15/09  │ │             ││[No ar] ││
│ └──────┘ │ └────────┘ │ └───────┘ │ └─────────┘ │             │└────────┘│
└──────────┴────────────┴───────────┴─────────────┴─────────────┴──────────┘
```

`@dnd-kit` já é dependência (o CRM usa). Cada card mostra dias na etapa
(âmbar > 5, vermelho > 10 ou `health = 'blocked'`), o `golive_previsto`, o dono
da etapa e o valor mensal.

`Ativo` é uma coluna colapsada por padrão: cliente no ar não é trabalho em
andamento, mas precisa estar acessível.

Arrastar entre etapas é um `update`. **Entrar em `ativo` não é arrastável** — só
o botão "Colocar no ar", que abre o `GoLiveDialog`:

```
Colocar Rema Digital no ar

  Ambiente        Rema Digital · 1 membro · agente conectado
  Plano           Starter · R$200/mês
  Trial           15 dias, começa hoje · termina em 17/09
  Implantação     R$700 · FAT-2026-000018 · vence 23/09
  Cobrança        será emitida agora (on_golive)

  ⚠ CNPJ não informado — a cobrança não será emitida sem ele
    [ CNPJ ______________ ]

  [Cancelar]  [Colocar no ar]
```

O diálogo lê a `billing_account` e bloqueia com o campo à mão quando falta
documento ou e-mail. É a resposta direta ao "preciso que isso seja mais
confiável".

Um `OnboardingSheet` abre no clique: histórico de etapas, datas do discovery,
motivo do bloqueio, notas, links para a equipe e para a proposta.

---

## 10. Backfill

Migration idempotente, casando por nome, criando card só onde não existe:

| equipe | etapa | por quê |
| ------ | ----- | ------- |
| Solo Energia `939d7dd8` | ativo | opera |
| Casa Flow `aa33b576` | ativo | opera |
| Jornada do R1 `a43f3b4a` | ativo | opera |
| Cinemas Benficas `ae432b64` | ativo | 351 leads, opera |
| Lucas Castelo `99c68948` | ativo | opera |
| Be My Guest `c3d0e1ff` | ativo | opera |
| WI Advogados `26b9ab8c` | implantacao | D5: mantém a equipe, refaz o processo |
| Rema Digital `b16e48b5` | implantacao | D6: ambiente novo, em implantação |

Propostas aceitas sem equipe entram em `aceite`. Propostas `enviada`/`vista`
(PlanLog, Casa Flow ADS) **não** viram card — ainda são pipeline comercial, e a
aba Propostas já é o lugar delas.

---

## 11. Limpeza de produção — operação de dados

`supabase/scripts/2026-09-02_producao_limpeza.sql`. **Não é migration**: é
cirurgia numa base específica, e D9 diz explicitamente que isso não é regra do
software. Roda uma vez, pelo runbook.

Toda etapa destrutiva copia antes para `backup_20260902_<tabela>`. Nada é
apagado sem cópia.

### Bloco A — desduplicação

```
WI Advogados   mantém 26b9ab8c (246 leads)
               contrato ca4bfac4, proposta 56d1c2ca, billing_account e perfis
               migram para ela · apaga e5bda77f
               renomeia para "WI Advogados"

Solo Energia   mantém 939d7dd8 (456 leads, asaas_customer_id real)
               contrato 5234874b, proposta ff534526 e perfis migram
               apaga c39a6d83
               a billing_account velha (com CPF e cliente Asaas) prevalece

Rema Digital   mantém b16e48b5 (de hoje, com contrato e fatura)
               apaga 33b33ec5 (4 leads, 0 membros)

Solo Teste     apaga 57b34902 · o contrato em trial venceria 08/09 e viraria
               fatura
```

**A ordem importa, e o motivo é grave.** Conferido em produção: *quarenta e três*
tabelas apontam para `equipes` com `on delete cascade` — e `profiles` é uma
delas. Apagar uma equipe apaga o perfil do usuário junto, e o cliente perde o
acesso sem que nada acuse o erro. Então, para cada desduplicação, nesta ordem:

```
1. profiles.equipe_id     → equipe que fica
2. contracts.equipe_id    → equipe que fica
3. invoices.equipe_id     → equipe que fica
4. proposals.equipe_id e proposals.target_equipe_id → equipe que fica
5. onboardings.equipe_id  → equipe que fica
6. billing_accounts       → a linha da equipe que fica prevalece
                            (PK é equipe_id; a duplicata é descartada, não
                             mesclada — a antiga da Solo Energia tem CPF e
                             asaas_customer_id reais, a nova não tem nada)
7. só então: delete from equipes
```

Cada passo é verificado por `select count(*)` antes do delete. Um `delete` que
encontra linhas ainda apontando para a equipe condenada aborta a transação.

### Bloco B — reset do legado

Casa Flow, Solo Energia, Jornada do R1:

- faturas `open`/`past_due` → `void`
- `agent_action_ledger`, `credit_ledger`, `consumo_creditos`, `notifications`
  → backup e limpeza (Casa Flow tem 1.825 ações, Solo Energia 375)
- `proposals.valid_until = 2026-09-04` nas propostas deles

O corte do agente no dia 4, se não regularizarem, é **manual**, pelo controle de
pausa que já existe. Automatizar viraria regra do software, e D9 diz que não é.

---

## 12. Testes

| Camada | Como |
| ------ | ---- |
| SQL | Blocos `do $$ ... assert ...$$` no fim de cada migration, como todo o repositório faz |
| Deno | `_shared/br-doc.test.ts`, `_shared/billing-charges.test.ts` |
| Vitest | `brand-consistency.test.ts`, `onboarding-stage-health.test.ts` |

Asserções que importam:

1. Provisionar com `target_equipe_id` **não** cria equipe nova
2. Contrato nasce `onboarding`, sem `trial_ends_at`
3. A fatura de implantação existe após provisionar, com `due_date = golive_previsto`
4. `on_accept` marca para cobrar no provisionamento; `on_golive` não
5. `go_live_contract` duas vezes = um trial, uma fatura
6. Duas equipes não podem ter dois contratos `onboarding`
7. Aceite com CPF inválido é recusado com 400
8. Aceite sem e-mail é recusado com 400
9. `is_live` é true para `onboarding`, `is_read_only` é false
10. Mover de etapa grava um `onboarding_event`

---

## 13. Ordem de execução

```
W1  migrations 1-4 (schema, split, notificações, marca)   ── sem UI, deploy seguro
W2  edge functions (billing-charges, golive, provision, public-proposal)
W3  kanban + GoLiveDialog + seletor de equipe na proposta
W4  marca no frontend + e-mail + guarda de teste
W5  backfill (migration 5)
W6  limpeza de produção (script, pelo runbook)  ── só depois de W1-W5 no ar
```

W6 por último e à parte: mexe em dado de cliente pagante e não deve rodar até
que o código novo esteja em produção e verificado.

---

## 14. Fora de escopo — vai para o todo.md

| Item | Por quê |
| ---- | ------- |
| Portal de onboarding para o cliente (ele vê o próprio progresso) | Sprint próprio; aqui o kanban é interno |
| Integração real com a API do Calendly (ler o agendamento e mover o card sozinho) | Depende de OAuth do Calendly |
| Assinatura eletrônica do contrato | Jurídico, não onboarding |
| Templates de implantação por nicho (checklist pronto por vertical) | Só faz sentido com mais volume |
| Coleta de CPF/CNPJ dos clientes legados | Operação comercial, não código |
| Logo em SVG para o e-mail | Depende de arquivo de design que não existe no repo |
