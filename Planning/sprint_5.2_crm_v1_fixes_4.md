### 🏁 SPRINT 5.2: THE TELEMETRY & PIT-WALL TUNING (Chassis Final Polish)

Mateus, you are executing the exact philosophy of **Revenue Architecture**.
Sales is not an art; it is a clinical, deterministic data loop. If you cannot
track the velocity of a lead down to the millisecond, you cannot optimize it. We
are treating the salesman like an elite F1 driver: we remove all structural
friction from their dashboard so they can maintain maximum focus while driving,
while giving the manager absolute telemetry control from the pit wall.

Here is the high-density product spec for **Sprint 5.2**. This completely maps
out the user experience and logical constraints for Antigravity to translate
into clean code execution.

---

### 🎛️ 1. THE REVENUE ENGINE (Frictionless Ingestion & Cadence Automation)

#### 🔘 1.1 The Lightning Touchpoint Switch (`QuickTouch`)

- **The Problem:** Writing a full manual logging note every single time a
  representative dials a number or fires a WhatsApp ping creates data fatigue.
  Reps skip logging, which breaks our telemetry.
- **The Vision:** A zero-friction macro execution switch inside
  `TouchpointsList.tsx`. The rep sees a tight toolbar featuring distinct
  modality triggers: `[ 📞 Chamada ] [ 💬 WhatsApp ] [ 📧 E-mail ]`. Clicking a
  button instantly records the touchpoint with the current timestamp and
  operator ID. If they _want_ to add context notes later, a clean inline edit
  expansion reveals itself. Otherwise—one click, track locked, transaction
  recorded.

#### 📅 1.2 The Cadence Shift Linkage (Dynamic Next-Contact Calculator)

- **The Mechanism:** This instantaneous touchpoint event is hard-wired directly
  into the pipeline’s **Cadence Rules**. If your pipeline setup dictates a
  Step-2 follow-up cadence of `2 Days`, logging that quick touchpoint atomically
  updates the `next_contact_date` field on the front of the card and grid view.
- **Visual Telemetry Flags:** The salesperson must navigate by colored status
  indicators on their dashboard:
- 🔴 **Atrasado / Passado:** High-contrast color flag. _(The window was missed,
  the lead is cooling down)._
- 🟢 **Hoje:** Precision active tracking marker. _(Current active workload
  window)._
- ⚪ **Futuro:** Muted, completely neutral grey badge. _(Calm state, no action
  required today)._

- **Driver Override:** The pilot always has the final word. A sleek inline
  date-picker dropdown allows the salesman to manually override and adjust the
  calendar date with a single click. The styling colors adjust state instantly
  based on their choice.

#### 🎭 1.3 Persistent Relational Links (Entity Sync Resolution)

- **The Problem:** Linking a client profile to an **Empresa** or an **Imóvel**
  inside the active Pipeline Kanban interface updates the deal card locally, but
  it does not cascade down to update the general contact ledger.
- **The Vision:** Strict data consistency. The UI components must invoke a
  synchronized update loop (`useCreateContactAtomic.ts` integration). Connecting
  an asset inside the opportunity view must enforce immediate persistence,
  making those relationship badges instantly visible when browsing the **Base de
  Contatos** table.

#### 🗃️ 1.4 High-Density Profile X-Ray (The Expanded Column Grid)

- **The Problem:** The **Enriquecimento IA** column currently sits as a single
  generic string preview field on the main table ledger, hiding rich demographic
  parameters like birthday dates or specific customer flags.
- **The Vision:** Break open the data trunk. The system must unpack all
  structured keys returned by the enrichment engine and expose them as
  standalone, sortable database columns across the main table grid.

---

### 🚦 2. THE PIT-WALL telemetry LAYOUT (Commercial Cockpit Upgrades)

#### 🎻 2.1 The Niche KPI Tuner (The F1 Performance Inspector)

- **The Vision:** Give the sales manager true pit-wall control. In the pipeline
  configuration panel, managers can input explicit performance benchmarks:
- **Desired Time-in-Phase:** Set target constraints per column (e.g., _Max 48h
  in 'Proposal' stage_).
- **Max Interactions Limit:** Define the point of diminishing returns (e.g.,
  _Max 8 touchpoints before stagnation_).

- **The Telemetry Display:** The system compares real-time representative
  analytics against these targets. If a deal card breaches these thresholds, a
  micro warning asset alerts the cockpit dashboard.

#### 📑 2.2 Deep Card Integration (Notes, Tasks, and the Master Task Matrix)

- **The Extension:** Expand the expanded detail view workspace. The card
  interior must integrate separate, clean tab layouts for **Notas** (historical
  internal thoughts) and **Tarefas** (explicit actionable tasks).
- **The Master Task Ledger:** Build a dedicated **Task Management Page** in the
  primary application sidebar. It compiles all upcoming project items into a
  high-density table matrix mapping task headers, definitive deadlines,
  execution states, and assigned owners across all pipeline verticals.

#### 🎭 2.3 Fluid Origin Taxonomy Customization

- **The Vision:** Let the client customize their telemetry metrics. In the
  workspace settings, allow users to dynamically append, edit, and color-code
  custom tags for **Origem** and **Canal**. If they launch a brand-new Instagram
  influencer campaign, they can add the custom tag into the taxonomy dictionary,
  making it instantly selectable on any contact card profile.

---

### 🏎️ 3. THE CALM COCKPIT (Elite Inbox & State Optimization)

#### 🔲 3.1 Advanced Inbox Funnel Filtering

- **The Vision:** A premium pipeline filtering tool strip is added to the top of
  `InboxSidebar.tsx`. Vendedors can toggle dropdown selectors to view _only_ the
  active live WhatsApp threads of clients belonging to the "Solar Energy" funnel
  or the "Short Stay Onboarding" channel, completely segmenting their focus.

#### 🛸 3.2 The Zero-Friction Chat Link

- **The Mechanism:** On every contact record across the platform, the
  traditional raw external WhatsApp URL link button is enhanced. It is now
  paired with a premium **Sales Engine Chat Route Button**. Clicking it
  instantly focuses the screen viewport onto that specific customer's timeline
  inside your native application chat view. If no chat thread history exists
  with that phone token, it initializes a brand-new internal thread
  automatically.

#### 🛠️ 3.3 De-cluttering & The Human-in-the-Loop Handover Control

- **The Aesthetic Polish:** Remove the `R$ Price Tracker` component from the
  center of the top chat bar view to prioritize spatial elegance. The financial
  deal parameters must live exclusively within the right context sidebar panel.
- **The Copiloto Purge:** Permanently remove the legacy "Copiloto Comercial"
  information block from the chat layout to free up critical reading real estate
  for customer records.
- **The Hybrid Control Automation Switch:** When a human representative types a
  message or manually overrides a text block, the active automation status icon
  switches states instantly. The label morphs to show a warning badge:
  `Vendedor no Loop`. The button designed to hand command back to the machine
  shifts parameters, changing into a prominent `Devolver Controle ao Agente`
  trigger.

#### ⚡ 3.4 Persistent Screen Rendering (Zero-Reload Architecture & Speed Tuning)

- **The Problem:** Navigating between screens (e.g., moving from CRM to Chat)
  forces the browser route to re-fetch the entire workspace matrix. The chat UI
  completely flashes, reloads, and drops scroll positions, destroying usability.
- **The Vision:** Absolute performance fluidity. Refactor the navigation
  wrappers into a persistent core template view model. The chat state, base
  filters, and grid tabs remain entirely cached in local memory wrappers.
  Switching views is an instantaneous layout swap (<50ms)—the timelines stay
  hot, fields don't reset, and re-fetching happens silently in background
  telemetry loops.

---

### ✅ SPRINT 5.2 DEFINITION OF DONE

- [ ] Direct quick-touchpoint action buttons log item types in a single click,
      instantly triggering the local cadence calculator.
- [ ] Next-contact indicator badges adapt color states immediately based on
      calendar date conditions.
- [ ] Association data linked inside pipelines instantly reflects across the
      main Contacts grid views.
- [ ] A dedicated workspace page lists all operational tasks, deadlines, and
      ownership keys.
- [ ] The chat viewport automatically shifts states when a human representative
      joins the thread, providing a dynamic `Devolver` option.
- [ ] Screen switching features absolute rendering persistence with zero visual
      reloads or chat component resets.

---

### 🧭 Next Move on the Board

Mateus, this spec perfectly transforms the platform into an enterprise revenue
weapon. It aligns the data entry mechanics with scientific precision and locks
down screen rendering speeds.

Shall we authorize Antigravity to flash this telemetry optimization spec
straight into the codebase? Once this calibration run is complete, the chassis
is bulletproof and ready for the **Agno Python Agent Core** setup!

---
---

# 🛠️ IMPLEMENTATION PLAN (preenchido pelo PM — Claude/Opus)

> Fluxo e regras: ver `Planning/agent_workflow.md`. O PM quebrou a Visão acima em
> tarefas, definiu tier (S/M/L/XL), dono (agente/modelo), arquivos (file ownership)
> e o mapa de ondas. Engenheiros podem questionar/pedir correção do plano **antes**
> de codar. Branch: `<agent>/sprint5.2/<epic>/<task-desc>`.

## 🔒 Decisões de escopo travadas (Human, 2026-05-31)

1. **Cadência (§1.2):** valor único **por pipeline** (`cadence_days`). Ao registrar
   um QuickTouch, `next_contact = agora + cadence_days` para deals daquele pipeline.
   _Não_ é um motor de sequência multi-step — isso fica para um ciclo futuro.
2. **Zero-reload (§3.4):** abordagem **layout-route + cache de query** (menor risco).
   Refatorar `App.tsx` para uma rota de layout com `<Outlet />` (navbar/footer param
   de remontar) e tunar `staleTime`/`gcTime` do React Query. Sem keep-alive de
   árvores montadas.
3. **Taxonomia (§2.3):** tabela dedicada **`origin_taxonomy`** (não JSON em settings).

## 👥 Time desta sprint (agentes)

| Agente | Nível | Bom para | Custo |
| :----- | :---- | :------- | :---- |
| **Claude / Opus** | Sênior | XL/arquitetura, transações atômicas, estado de chat, roteamento | Premium |
| **Codex / GPT-5** | Pleno | Schema/migrations, hooks de config, correção de tipos | Médio |
| **Gemini** | Pleno (visual) | Componentes de UI, telemetria visual, badges | Médio |
| **Verboo / MiniMax** | **Júnior · tokens ilimitados** | Tarefas mecânicas e bem-delimitadas (CRUD de UI, filtros, geração de colunas). Iterar à vontade — token custo zero. | Barato |

> **Regra do Verboo:** só recebe tarefas com spec fechado e baixo risco de
> arquitetura. PM revisa com atenção extra no merge. Por ter tokens ilimitados,
> Verboo é o operário de grind — pode reprocessar quantas vezes precisar.

## 📋 Task Table

| ID  | EPIC / §        | Tarefa (o que fazer)                                              | Tier | Dono (agente/modelo) | Arquivos (ownership)                                                                                          | Branch                                            | Status |
| :-- | :-------------- | :--------------------------------------------------------------- | :--- | :------------------- | :----------------------------------------------------------------------------------------------------------- | :------------------------------------------------ | :----- |
| T1  | 1.2 / 2.1       | Schema: `cadence_days` em `pipelines` + `max_interactions` em stages | M    | Codex / GPT-5        | _migration nova_, `src/types/pipelines.ts`, `src/integrations/supabase/types.ts`                             | `codex/sprint5.2/epic1/schema-cadence-kpi`        | [x]    |
| T2  | 2.3             | Schema: tabela `origin_taxonomy` + hook `useOriginTaxonomy`      | M    | Codex / GPT-5        | _migration nova_, `src/hooks/useOriginTaxonomy.ts`, `src/types/taxonomy.ts`                                   | `codex/sprint5.2/epic2/schema-taxonomy`           | [x]    |
| T3  | 1.1 + 1.2(write)| QuickTouch toolbar + escrita de cadência no `next_contact`       | L    | Claude / Opus        | `src/components/crm/TouchpointsList.tsx`, `src/hooks/useTouchpoints.ts`                                       | `claude/sprint5.2/epic1/quicktouch-cadence`       | [ ]    |
| T4  | 1.2(display)/2.1| Telemetria: estado de cor do próximo contato + flag de breach KPI + `NextContactBadge` | L | Gemini | `src/hooks/useStageTelemetry.ts`, `src/components/crm/NextContactBadge.tsx`                                   | `gemini/sprint5.2/epic1/next-contact-badge`       | [ ]    |
| T5  | 2.1 + 1.2(cfg)  | Config do pipeline: input `cadence_days` (pipeline) + `max_interactions` (stage) | L | Codex / GPT-5 | `src/pages/PipelineSettings.tsx`, `src/hooks/usePipelines.ts`, `src/components/crm/pipeline-settings/StagesEditor.tsx`, `src/hooks/usePipelineStagesV2.ts` | `codex/sprint5.2/epic2/kpi-cadence-config`        | [ ]    |
| T6  | 1.4             | Raio-X de Enriquecimento: explodir chaves do JSONB em colunas ordenáveis | L | **Verboo / MiniMax** | `src/components/crm/DatabaseView.tsx`                                                                    | `verboo/sprint5.2/epic1/enrichment-xray`          | [ ]    |
| T7  | 1.3             | Cascata de links relacionais (opp → ledger de contato)          | L    | Claude / Opus        | `src/hooks/useOpportunityLinks.ts`, `src/hooks/useCreateContactAtomic.ts`                                     | `claude/sprint5.2/epic1/link-cascade`             | [ ]    |
| T9  | 3.1             | Filtro de funil na caixa de entrada                              | M    | **Verboo / MiniMax** | `src/components/inbox/InboxSidebar.tsx`                                                                       | `verboo/sprint5.2/epic3/inbox-funnel-filter`      | [ ]    |
| T10 | 2.2(tabs)       | Abas Notas + Tarefas dentro do modal de oportunidade            | M    | Gemini               | `src/components/crm/OpportunityDetailModal.tsx`                                                               | `gemini/sprint5.2/epic2/card-notes-tasks-tabs`    | [ ]    |
| T8  | 2.3(UI)         | Editor de taxonomia Origem/Canal (add/edit/color)               | L    | **Verboo / MiniMax** | `src/components/crm/pipeline-settings/OriginTaxonomyEditor.tsx` _(novo)_, `src/pages/PipelineSettings.tsx`     | `verboo/sprint5.2/epic2/taxonomy-editor`          | [ ]    |
| T11 | 1.2/2.1(surface)| Consumir telemetria no card e na tabela (badge + alerta de breach) | L | Gemini             | `src/components/crm/OpportunityCard.tsx`, `src/components/crm/CardTelemetryPillars.tsx`, `src/components/crm/OpportunityTable.tsx` | `gemini/sprint5.2/epic2/telemetry-surface`        | [ ]    |
| T12 | 3.4             | Roteamento zero-reload (rota de layout + Outlet + cache tuning)  | XL   | Claude / Opus        | `src/App.tsx`, `src/components/AuthenticatedLayout.tsx` _(novo)_                                              | `claude/sprint5.2/epic3/zero-reload-routing`      | [ ]    |
| T13 | 2.2(page)       | Página mestre de Tarefas no sidebar + rota + nav                | L    | Claude / Opus        | `src/pages/Tasks.tsx` _(novo)_, `src/hooks/useAllTasks.ts` _(novo)_, `src/App.tsx`, `src/components/TopNavbar.tsx` | `claude/sprint5.2/epic2/master-task-page`         | [ ]    |
| T14 | 3.3             | Limpeza do chat + switch de handover híbrido (`Vendedor no Loop`)| L    | Claude / Opus        | `src/components/inbox/ConversationHeader.tsx`, `src/components/inbox/CRMContextPanel.tsx`, `src/pages/Chat.tsx` | `claude/sprint5.2/epic3/chat-declutter-handover`  | [ ]    |
| T15 | 3.2             | Botão "Sales Engine Chat Route" (foco no chat / cria thread)    | L    | Claude / Opus        | `src/pages/Chat.tsx`, `src/components/crm/ContactDetailsModal.tsx`, `src/components/crm/DatabaseView.tsx`, `src/components/inbox/CRMContextPanel.tsx` | `claude/sprint5.2/epic3/zero-friction-chat-link`  | [ ]    |
| T16 | DoD             | Auditoria de aceite (evidência de código) + fechamento da sprint | S    | Claude / Opus (PM)   | _read-only_ + `Planning/sprint_5.2_crm_v1_fixes_4.md`, `Planning/billing.md`                                | `claude/sprint5.2/dod/acceptance-audit`           | [ ]    |

*Tiers: **S** mecânico · **M** um hook/componente · **L** hook + integração multi-arquivo · **XL** cross-cutting/arquitetura. Nunca rode S/M em modelo premium.*

---

## 🧩 Detalhe por tarefa (engenheiro lê antes de codar)

### T1 — Schema: cadência + KPI _(M · Wave 1)_
**O que fazer:**
- Migration nova `supabase/migrations/20260601000000_sprint5_2_cadence_kpi.sql`:
  - `ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS cadence_days integer CHECK (cadence_days IS NULL OR cadence_days > 0);` + `COMMENT`.
  - `ALTER TABLE public.pipeline_stages_v2 ADD COLUMN IF NOT EXISTS max_interactions integer CHECK (max_interactions IS NULL OR max_interactions > 0);` + `COMMENT`. (Espelha o padrão de `max_idle_hours` da migration `20260525000000`.)
- `src/types/pipelines.ts`: add `cadence_days: number | null;` em `Pipeline` e `max_interactions: number | null;` em `PipelineStageV2`.
- `src/integrations/supabase/types.ts`: refletir as duas colunas novas nas linhas geradas de `pipelines` e `pipeline_stages_v2` (Row/Insert/Update).
**Aceite:** `tsc` limpo; colunas existem; nenhum consumidor quebra (campos opcionais/nullable).

### T2 — Schema: taxonomia Origem/Canal _(M · Wave 1)_
**O que fazer:**
- Migration nova `20260601000100_sprint5_2_origin_taxonomy.sql`: tabela `public.origin_taxonomy` (`id uuid pk default gen_random_uuid()`, `equipe_id uuid not null`, `kind text not null check (kind in ('origem','canal'))`, `label text not null`, `color text not null default '#64748b'`, `created_at timestamptz default now()`, `deleted_at timestamptz`). RLS por `equipe_id` espelhando o padrão de outra tabela tenant-scoped (ex.: `opportunity_links`). Unique parcial `(equipe_id, kind, lower(label)) where deleted_at is null`.
- `src/types/taxonomy.ts` _(novo)_: `export type TaxonomyKind = 'origem' | 'canal';` + `export interface OriginTag { id; equipe_id; kind: TaxonomyKind; label; color; created_at; deleted_at; }`.
- `src/hooks/useOriginTaxonomy.ts` _(novo)_: query (lista por kind, scoped por `equipe_id`, `deleted_at is null`) + mutations `createTag`/`updateTag`/`deleteTag` (soft delete) no padrão react-query/`toast` já usado em `useOpportunityLinks.ts`.
**Aceite:** `tsc` limpo; CRUD da taxonomia funciona isolado; RLS nega cross-tenant.

### T3 — QuickTouch + escrita de cadência _(L · Wave 2 · dep T1)_
**O que fazer:**
- `TouchpointsList.tsx`: adicionar uma toolbar compacta no topo com 3 gatilhos de modalidade `[ 📞 Chamada ] [ 💬 WhatsApp ] [ 📧 E-mail ]`. Um clique cria o touchpoint imediatamente (`touchpoint_type` correspondente, `content` vazio/default, `contact_date = hoje`, operador = usuário atual). Expansão inline opcional para adicionar nota depois (editar `content` do registro recém-criado) — sem bloquear o fluxo de 1 clique.
- `useTouchpoints.ts`: no `createTouchpoint`, após inserir, calcular e gravar `leads.next_contact = now + pipeline.cadence_days` **atomicamente** quando o pipeline do lead tiver `cadence_days` definido. Buscar o `cadence_days` via o stage→pipeline do lead (ou receber `cadenceDays` como input do caller para evitar fetch extra — decidir e documentar). Invalidate das queries `["touchpoints", leadId]` e do lead/oportunidade afetados.
**Aceite (DoD #1):** clicar um gatilho registra o touchpoint em 1 clique e dispara o recálculo de `next_contact` instantaneamente.

### T4 — Telemetria: badge de próximo contato + breach KPI _(L · Wave 2 · dep T1)_
**O que fazer:**
- `useStageTelemetry.ts`: estender `StageTelemetry` com `nextContactState: 'overdue' | 'today' | 'future' | null` (🔴/🟢/⚪) derivado de `formatNextContact`, e `interactionsBreached: boolean` (true quando `touchpointCount >= maxInteractions` e `maxInteractions` setado). Estender `TelemetryInputs` com `maxInteractions: number | null`. Mudanças aditivas — não quebrar callers atuais.
- `NextContactBadge.tsx` _(novo)_: badge que pinta 🔴 Atrasado / 🟢 Hoje / ⚪ Futuro conforme `nextContactState`, com um `Popover` + date-picker inline para o vendedor sobrescrever a data (callback `onChange(date)`); cor reage instantaneamente à escolha. Usa os componentes `ui/popover` + `ui/calendar` já presentes.
**Aceite (DoD #2):** badge muda de cor imediatamente conforme a data; override inline funciona.

### T5 — Config do pipeline: cadência + max interações _(L · Wave 2 · dep T1)_
**O que fazer:**
- `PipelineSettings.tsx`: no formulário de edição do pipeline, adicionar input numérico **"Cadência (dias)"** que lê/grava `pipeline.cadence_days`.
- `usePipelines.ts`: incluir `cadence_days` no payload de update do pipeline.
- `StagesEditor.tsx`: por stage, adicionar input **"Máx. interações"** (`max_interactions`) ao lado do já-existente limite de SLA.
- `usePipelineStagesV2.ts`: persistir `max_interactions` no create/update de stage.
**Aceite (DoD parcial §2.1):** gestor define cadência por pipeline e teto de interações por stage; valores persistem e voltam no reload.

### T6 — Raio-X de Enriquecimento _(L · Wave 2 · Verboo)_
**O que fazer:**
- `DatabaseView.tsx`: hoje a coluna `enrichment_summary` condensa `personal_custom_data` num único preview (`summarizeEnrichment`). Trocar por desempacotamento: derivar o conjunto-união de chaves estruturadas presentes em `personal_custom_data` na base carregada e gerar colunas `ColumnDef<Lead>` dinâmicas, ordenáveis, uma por chave (label legível). Manter sob o controle de visibilidade de colunas existente (`columnVisibility`) para o usuário ligar/desligar. Não vazar para fora do `DatabaseView`.
**Aceite (DoD parcial §1.4):** chaves do enriquecimento aparecem como colunas próprias e ordenáveis.

### T7 — Cascata de links relacionais _(L · Wave 2)_
**O que fazer:**
- `useOpportunityLinks.ts`: ao linkar `company`/`property` numa oportunidade, além de gravar em `opportunity_links`, propagar a relação para o ledger do contato (via integração com `useCreateContactAtomic.ts`) de modo que os badges relacionais fiquem visíveis na **Base de Contatos** sem reabrir o card.
- `useCreateContactAtomic.ts`: expor/ajustar o caminho de persistência relacional usado por essa cascata (mesma transação/sequência atômica do Sprint 5.1). Invalidate das queries da Base de Contatos.
**Aceite (DoD #3):** associação feita dentro do pipeline reflete imediatamente nas views da grade de Contatos.

### T9 — Filtro de funil na inbox _(M · Wave 2 · Verboo)_
**O que fazer:**
- `InboxSidebar.tsx`: adicionar uma faixa de filtro no topo com `Select` de pipeline/funil (reaproveitar os `ui/select` já importados). Filtrar `sessions` exibidos pelo funil do cliente. Usar os dados de pipeline já presentes na sessão/lead; **não** alterar `Chat.tsx` (manter ownership isolado — derivar o funil do que já chega via props).
**Aceite (DoD parcial §3.1):** vendedor filtra a inbox por funil e vê só os threads daquele pipeline.

### T10 — Abas Notas + Tarefas no card _(M · Wave 2)_
**O que fazer:**
- `OpportunityDetailModal.tsx`: no painel direito (bloco de engenharia 40% do layout 5.1), adicionar `Tabs` com **Notas** (histórico interno) e **Tarefas** (acionáveis), usando `ui/tabs` + o hook `useTasks(leadId)` já existente para listar/criar/alternar tarefas do lead. Não editar `TouchpointsList` (apenas renderizá-lo se necessário).
**Aceite (DoD parcial §2.2):** card expandido tem abas limpas de Notas e Tarefas.

### T8 — Editor de taxonomia Origem/Canal _(L · Wave 3 · dep T2 · Verboo)_
**O que fazer:**
- `OriginTaxonomyEditor.tsx` _(novo)_: matriz para add/editar/excluir e color-code tags de `origem` e `canal` via `useOriginTaxonomy` (do T2). Picker de cor + label editável.
- `PipelineSettings.tsx`: montar o editor como uma nova aba/seção de settings do workspace. _(Edita o mesmo arquivo do T5, por isso vai na Wave 3 — depois do merge do T5.)_
**Aceite (DoD parcial §2.3):** usuário cria uma tag nova (ex.: campanha de influencer no Instagram) e ela fica selecionável nos cards de contato.

### T11 — Consumo de telemetria no card e tabela _(L · Wave 3 · dep T4)_
**O que fazer:**
- `CardTelemetryPillars.tsx`: trocar a exibição crua de próximo contato pelo `NextContactBadge` (T4) e adicionar o micro-alerta visual quando `interactionsBreached` (ou SLA de tempo) estourar.
- `OpportunityCard.tsx` e `OpportunityTable.tsx`: passar `maxInteractions` (do stage) para a telemetria e renderizar badge/alerta de breach de forma consistente nas duas superfícies.
**Aceite (DoD parcial §2.1/§1.2):** card e tabela mostram o badge colorido e o aviso quando os thresholds do gestor são violados.

### T12 — Roteamento zero-reload _(XL · Wave 3)_
**O que fazer:**
- `AuthenticatedLayout.tsx` _(novo)_: extrair o `AuthenticatedLayout` de `App.tsx` para um componente próprio que renderiza `<TopNavbar/>`, `<main><Outlet/></main>`, footer e `<WhatsAppButton/>`.
- `App.tsx`: converter as rotas autenticadas para uma **rota de layout única** (`<Route element={<ProtectedRoute><AuthenticatedLayout/></ProtectedRoute>}>` com filhas) — navbar/footer param de remontar a cada navegação. Tunar o `QueryClient` (`staleTime`/`gcTime` apropriados) para os dados ficarem quentes entre telas (sem refetch que pisca). Sem keep-alive de árvores montadas (decisão travada).
**Aceite (DoD #6):** trocar de tela não recarrega/pisca a navbar nem refaz fetch visível; troca é um swap de layout.

### T13 — Página mestre de Tarefas _(L · Wave 4 · dep T12)_
**O que fazer:**
- `useAllTasks.ts` _(novo)_: query agregada de todas as tarefas do tenant (sem filtrar por `lead_id`), com `title`, `due_date`, `status`, `assigned_to`, e join/labels do lead/pipeline.
- `pages/Tasks.tsx` _(novo)_: tabela de alta densidade (cabeçalho, prazo, estado, dono) cruzando todos os funis.
- `App.tsx`: adicionar a rota `/tasks` **dentro do padrão de layout do T12**.
- `TopNavbar.tsx`: adicionar item de navegação para a página de Tarefas.
**Aceite (DoD #4):** página dedicada lista todas as tarefas, prazos e donos de todos os pipelines.

### T14 — Limpeza do chat + handover híbrido _(L · Wave 4)_
**O que fazer:**
- `ConversationHeader.tsx`: remover o componente de `R$ Price Tracker` do centro da barra superior. Implementar o switch de estado: quando o humano digita/assume, o ícone de automação vira badge de aviso **`Vendedor no Loop`**, e o botão de devolver muda para **`Devolver Controle ao Agente`** (proeminente).
- `CRMContextPanel.tsx`: remover permanentemente o bloco legado **"Copiloto Comercial"** (linha ~195).
- `Chat.tsx`: ligar o estado de handoff ao gatilho (estender `handleToggleHandoff` / estado de "humano no loop"). Parâmetros financeiros do deal passam a viver só no painel de contexto à direita.
**Aceite (DoD #5):** ao um humano entrar no thread, o viewport muda de estado e oferece o `Devolver`.

### T15 — Botão zero-friction de chat _(L · Wave 5)_
**O que fazer:**
- `Chat.tsx`: aceitar um alvo (ex.: `?contact=<leadId>`/estado de navegação) que foca o viewport no thread daquele contato; se não houver thread para aquele telefone, inicializar um novo thread interno automaticamente (helper sobre `useConversations`).
- `ContactDetailsModal.tsx`, `DatabaseView.tsx` (ação de linha), `CRMContextPanel.tsx`: ao lado do link bruto de WhatsApp, adicionar o **"Sales Engine Chat Route Button"** que navega para `/chat` focando aquele contato.
- _(Edita `Chat.tsx` depois do T14 e `DatabaseView`/`CRMContextPanel` depois das ondas anteriores — por isso Wave 5.)_
**Aceite (DoD parcial §3.2):** clicar o botão em qualquer registro de contato abre o chat nativo focado naquele cliente.

### T16 — Auditoria de aceite + fechamento _(S · Wave 6)_
**O que fazer:** validar cada item da Definition of Done abaixo contra evidência de código (typecheck/build limpos), marcar `[x]` ou abrir bounce-back, e fechar a sprint. Espelhar billing. Recomendar smoke final no app rodando para os itens de runtime/visual.

---

## 🌊 Waves (visão simples)

> **Regra de ouro:** na mesma onda, ninguém toca o mesmo arquivo. Só avança de
> onda quando a anterior fez merge (`git pull`). Cada onda é um "pit stop".

### 🟦 Wave 1 — Fundação de schema
*Trava as colunas/tabelas que as features usam. Tudo depende daqui.*

| Task | Dono  | Entrega                                            |
| :--- | :---- | :------------------------------------------------- |
| T1   | Codex | colunas `cadence_days` + `max_interactions`        |
| T2   | Codex | tabela `origin_taxonomy` + hook                    |

### 🟩 Wave 2 — Features em paralelo  *(depende da Wave 1)*
*7 tarefas, arquivos 100% disjuntos — rodam todas ao mesmo tempo.*

| Task | Dono       | Entrega                                  |
| :--- | :--------- | :--------------------------------------- |
| T3   | Claude     | QuickTouch + escrita de cadência         |
| T4   | Gemini     | badge de próximo contato (cores)         |
| T5   | Codex      | inputs de cadência/KPI nas configs       |
| T6   | **Verboo** | colunas de raio-X do enriquecimento      |
| T7   | Claude     | cascata de links relacionais             |
| T9   | **Verboo** | filtro de funil na inbox                 |
| T10  | Gemini     | abas Notas/Tarefas no modal              |

### 🟨 Wave 3 — Consumo + roteamento
| Task | Dono       | Entrega                                  |
| :--- | :--------- | :--------------------------------------- |
| T8   | **Verboo** | editor de taxonomia *(PipelineSettings após T5)* |
| T11  | Gemini     | telemetria no card + tabela              |
| T12  | Claude     | roteamento zero-reload (App + Layout)    |

### 🟧 Wave 4 — Página + handover
| Task | Dono   | Entrega                                  |
| :--- | :----- | :--------------------------------------- |
| T13  | Claude | página mestre de Tarefas (+ rota + nav)  |
| T14  | Claude | limpeza do chat + handover híbrido       |

### 🟥 Wave 5 — Chat link
| Task | Dono   | Entrega                                  |
| :--- | :----- | :--------------------------------------- |
| T15  | Claude | botão "Sales Engine Chat Route"          |

### ⬛ Wave 6 — Fechamento
| Task | Dono   | Entrega                                  |
| :--- | :----- | :--------------------------------------- |
| T16  | Claude (PM) | auditoria de DoD + fechamento       |

### 📊 Carga por agente (quem faz o quê, em ordem)

| Agente     | Tarefas                                   | Total |
| :--------- | :---------------------------------------- | :---- |
| **Claude** | T3, T7 → T12 → T13, T14 → T15 → T16        | 7     |
| **Codex**  | T1, T2 → T5                               | 3     |
| **Gemini** | T4, T10 → T11                             | 3     |
| **Verboo** | T6, T9 → T8                               | 3     |

*Verboo (júnior, tokens ilimitados) pega só tarefas de UI bem-delimitadas; na
Wave 2 ele roda T6 e T9 em sequência (sem pressa — token custo zero).*

### 🔐 Matriz de ownership de arquivos quentes (cross-wave, sequencial — sem colisão)

| Arquivo                         | Tarefas (em ordem de onda)        |
| :------------------------------ | :-------------------------------- |
| `src/App.tsx`                   | T12 (W3) → T13 (W4)               |
| `src/pages/Chat.tsx`            | T14 (W4) → T15 (W5)               |
| `src/pages/PipelineSettings.tsx`| T5 (W2) → T8 (W3)                 |
| `src/components/crm/DatabaseView.tsx` | T6 (W2) → T15 (W5)          |
| `src/components/inbox/CRMContextPanel.tsx` | T14 (W4) → T15 (W5)    |
| `src/hooks/useStageTelemetry.ts`| T4 (W2) somente                   |
| `src/types/pipelines.ts`        | T1 (W1) somente                   |

*Cada arquivo quente é tocado por uma única tarefa por onda; ondas distintas = edição sequencial após merge.*

## 🧐 Notas / Questões dos Engenheiros (antes de codar)

- **PM → T3:** confirmar se `cadence_days` é lido via fetch do pipeline dentro de
  `useTouchpoints` ou passado como prop pelo caller (preferência: prop, p/ evitar
  fetch extra no hot path). Documentar a escolha no PR.
- **PM → T6:** definir um teto de colunas dinâmicas (ex.: top-N chaves mais
  preenchidas) para não explodir a largura da tabela em bases muito heterogêneas.
  Default sugerido: todas as chaves presentes, escondidas via `columnVisibility`
  exceto as 4–6 mais comuns.
- **PM → T11:** o micro-alerta de breach deve cobrir **tempo-na-fase** (`max_idle_hours`,
  já existe) **e** `max_interactions` (novo). Reusar o estilo Precision Red pulsante
  do Sprint 5.1.
- _Engenheiro registra aqui dúvidas ou pedidos de correção do plano; PM responde antes de liberar a onda._

## 💰 Billing (espelho de `Planning/billing.md`)

| Data | Tarefa | Agente/Modelo | Tier | R$ |
| :--- | :----- | :------------ | :--- | :- |
| 2026-06-04 | T1 schema cadence/KPI          | Codex / GPT-5  | M  | R$ 12 |
| 2026-06-04 | T2 schema taxonomy + hook      | Codex / GPT-5  | M  | R$ 12 |
|      | T3 QuickTouch + cadência       | Claude / Opus  | L  | R$ 20 |
|      | T4 telemetry badge             | Gemini         | L  | R$ 20 |
|      | T5 config cadência/KPI         | Codex / GPT-5  | L  | R$ 20 |
|      | T6 enrichment X-ray            | Verboo/MiniMax | L  | R$ 20 |
|      | T7 link cascade                | Claude / Opus  | L  | R$ 20 |
|      | T9 inbox funnel filter         | Verboo/MiniMax | M  | R$ 12 |
|      | T10 card notes/tasks tabs      | Gemini         | M  | R$ 12 |
|      | T8 taxonomy editor UI          | Verboo/MiniMax | L  | R$ 20 |
|      | T11 telemetry surface          | Gemini         | L  | R$ 20 |
|      | T12 zero-reload routing        | Claude / Opus  | XL | R$ 28 |
|      | T13 master task page           | Claude / Opus  | L  | R$ 20 |
|      | T14 chat declutter/handover    | Claude / Opus  | L  | R$ 20 |
|      | T15 zero-friction chat link    | Claude / Opus  | L  | R$ 20 |
|      | T16 DoD audit                  | Claude / Opus  | S  | R$ 5  |
| **Total estimado** |                  |                |    | **R$ 281** |

*Cada engenheiro adiciona a linha (com data) ao concluir; PM confere no merge. Tiers: S=R$5 · M=R$12 · L=R$20 · XL=R$28.*

## 🎯 Rastreabilidade — Definition of Done → Tarefas

| DoD (§ Visão)                                                                 | Tarefa(s) que entregam        |
| :--------------------------------------------------------------------------- | :---------------------------- |
| #1 Quick-touchpoint em 1 clique dispara o calculador de cadência             | T1, T3 (+T4 cálculo)          |
| #2 Badge de próximo contato muda de cor conforme a data                      | T4, T11                       |
| #3 Associação no pipeline reflete na grade de Contatos                       | T7                            |
| #4 Página dedicada lista tarefas, prazos e donos                             | T13 (+T10 abas)               |
| #5 Viewport do chat muda de estado quando humano entra (`Devolver`)          | T14                           |
| #6 Troca de tela com persistência absoluta (zero reload)                     | T12                           |
| _§1.4 colunas de enriquecimento_ (além do DoD explícito)                     | T6                            |
| _§2.1 tuner de KPI (tempo-na-fase + máx interações)_                         | T1, T5, T4, T11               |
| _§2.3 taxonomia Origem/Canal customizável_                                   | T2, T8                        |
| _§3.1 filtro de funil na inbox_                                              | T9                            |
| _§3.2 botão de rota de chat zero-friction_                                   | T15                           |

## 🔍 PM Double-Check (no merge de cada tarefa)

- [ ] **Task** — build limpo (`tsc`/`vite build` sem novos erros), só arquivos do escopo, bate com o plano.
- [ ] **Billing** — linha presente com data e tier certo.
- [ ] **Acceptance** — satisfaz o(s) item(ns) da Definition of Done / mapa de rastreabilidade acima.
- [ ] **Wave hygiene** — nenhuma tarefa da mesma onda tocou arquivo compartilhado; após merge da onda, avisar `git pull`.
