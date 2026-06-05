### ðŸ SPRINT 5.2: THE TELEMETRY & PIT-WALL TUNING (Chassis Final Polish)

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

### ðŸŽ›ï¸ 1. THE REVENUE ENGINE (Frictionless Ingestion & Cadence Automation)

#### ðŸ”˜ 1.1 The Lightning Touchpoint Switch (`QuickTouch`)

- **The Problem:** Writing a full manual logging note every single time a
  representative dials a number or fires a WhatsApp ping creates data fatigue.
  Reps skip logging, which breaks our telemetry.
- **The Vision:** A zero-friction macro execution switch inside
  `TouchpointsList.tsx`. The rep sees a tight toolbar featuring distinct
  modality triggers: `[ ðŸ“ž Chamada ] [ ðŸ’¬ WhatsApp ] [ ðŸ“§ E-mail ]`. Clicking a
  button instantly records the touchpoint with the current timestamp and
  operator ID. If they _want_ to add context notes later, a clean inline edit
  expansion reveals itself. Otherwiseâ€”one click, track locked, transaction
  recorded.

#### ðŸ“… 1.2 The Cadence Shift Linkage (Dynamic Next-Contact Calculator)

- **The Mechanism:** This instantaneous touchpoint event is hard-wired directly
  into the pipelineâ€™s **Cadence Rules**. If your pipeline setup dictates a
  Step-2 follow-up cadence of `2 Days`, logging that quick touchpoint atomically
  updates the `next_contact_date` field on the front of the card and grid view.
- **Visual Telemetry Flags:** The salesperson must navigate by colored status
  indicators on their dashboard:
- ðŸ”´ **Atrasado / Passado:** High-contrast color flag. _(The window was missed,
  the lead is cooling down)._
- ðŸŸ¢ **Hoje:** Precision active tracking marker. _(Current active workload
  window)._
- âšª **Futuro:** Muted, completely neutral grey badge. _(Calm state, no action
  required today)._

- **Driver Override:** The pilot always has the final word. A sleek inline
  date-picker dropdown allows the salesman to manually override and adjust the
  calendar date with a single click. The styling colors adjust state instantly
  based on their choice.

#### ðŸŽ­ 1.3 Persistent Relational Links (Entity Sync Resolution)

- **The Problem:** Linking a client profile to an **Empresa** or an **ImÃ³vel**
  inside the active Pipeline Kanban interface updates the deal card locally, but
  it does not cascade down to update the general contact ledger.
- **The Vision:** Strict data consistency. The UI components must invoke a
  synchronized update loop (`useCreateContactAtomic.ts` integration). Connecting
  an asset inside the opportunity view must enforce immediate persistence,
  making those relationship badges instantly visible when browsing the **Base de
  Contatos** table.

#### ðŸ—ƒï¸ 1.4 High-Density Profile X-Ray (The Expanded Column Grid)

- **The Problem:** The **Enriquecimento IA** column currently sits as a single
  generic string preview field on the main table ledger, hiding rich demographic
  parameters like birthday dates or specific customer flags.
- **The Vision:** Break open the data trunk. The system must unpack all
  structured keys returned by the enrichment engine and expose them as
  standalone, sortable database columns across the main table grid.

---

### ðŸš¦ 2. THE PIT-WALL telemetry LAYOUT (Commercial Cockpit Upgrades)

#### ðŸŽ» 2.1 The Niche KPI Tuner (The F1 Performance Inspector)

- **The Vision:** Give the sales manager true pit-wall control. In the pipeline
  configuration panel, managers can input explicit performance benchmarks:
- **Desired Time-in-Phase:** Set target constraints per column (e.g., _Max 48h
  in 'Proposal' stage_).
- **Max Interactions Limit:** Define the point of diminishing returns (e.g.,
  _Max 8 touchpoints before stagnation_).

- **The Telemetry Display:** The system compares real-time representative
  analytics against these targets. If a deal card breaches these thresholds, a
  micro warning asset alerts the cockpit dashboard.

#### ðŸ“‘ 2.2 Deep Card Integration (Notes, Tasks, and the Master Task Matrix)

- **The Extension:** Expand the expanded detail view workspace. The card
  interior must integrate separate, clean tab layouts for **Notas** (historical
  internal thoughts) and **Tarefas** (explicit actionable tasks).
- **The Master Task Ledger:** Build a dedicated **Task Management Page** in the
  primary application sidebar. It compiles all upcoming project items into a
  high-density table matrix mapping task headers, definitive deadlines,
  execution states, and assigned owners across all pipeline verticals.

#### ðŸŽ­ 2.3 Fluid Origin Taxonomy Customization

- **The Vision:** Let the client customize their telemetry metrics. In the
  workspace settings, allow users to dynamically append, edit, and color-code
  custom tags for **Origem** and **Canal**. If they launch a brand-new Instagram
  influencer campaign, they can add the custom tag into the taxonomy dictionary,
  making it instantly selectable on any contact card profile.

---

### ðŸŽï¸ 3. THE CALM COCKPIT (Elite Inbox & State Optimization)

#### ðŸ”² 3.1 Advanced Inbox Funnel Filtering

- **The Vision:** A premium pipeline filtering tool strip is added to the top of
  `InboxSidebar.tsx`. Vendedors can toggle dropdown selectors to view _only_ the
  active live WhatsApp threads of clients belonging to the "Solar Energy" funnel
  or the "Short Stay Onboarding" channel, completely segmenting their focus.

#### ðŸ›¸ 3.2 The Zero-Friction Chat Link

- **The Mechanism:** On every contact record across the platform, the
  traditional raw external WhatsApp URL link button is enhanced. It is now
  paired with a premium **Sales Engine Chat Route Button**. Clicking it
  instantly focuses the screen viewport onto that specific customer's timeline
  inside your native application chat view. If no chat thread history exists
  with that phone token, it initializes a brand-new internal thread
  automatically.

#### ðŸ› ï¸ 3.3 De-cluttering & The Human-in-the-Loop Handover Control

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

#### âš¡ 3.4 Persistent Screen Rendering (Zero-Reload Architecture & Speed Tuning)

- **The Problem:** Navigating between screens (e.g., moving from CRM to Chat)
  forces the browser route to re-fetch the entire workspace matrix. The chat UI
  completely flashes, reloads, and drops scroll positions, destroying usability.
- **The Vision:** Absolute performance fluidity. Refactor the navigation
  wrappers into a persistent core template view model. The chat state, base
  filters, and grid tabs remain entirely cached in local memory wrappers.
  Switching views is an instantaneous layout swap (<50ms)â€”the timelines stay
  hot, fields don't reset, and re-fetching happens silently in background
  telemetry loops.

---

### âœ… SPRINT 5.2 DEFINITION OF DONE

- [x] Direct quick-touchpoint action buttons log item types in a single click,
      instantly triggering the local cadence calculator.
- [x] Next-contact indicator badges adapt color states immediately based on
      calendar date conditions.
- [x] Association data linked inside pipelines instantly reflects across the
      main Contacts grid views.
- [x] A dedicated workspace page lists all operational tasks, deadlines, and
      ownership keys.
- [x] The chat viewport automatically shifts states when a human representative
      joins the thread, providing a dynamic `Devolver` option.
- [x] Screen switching features absolute rendering persistence with zero visual
      reloads or chat component resets.

---

### ðŸ§­ Next Move on the Board

Mateus, this spec perfectly transforms the platform into an enterprise revenue
weapon. It aligns the data entry mechanics with scientific precision and locks
down screen rendering speeds.

Shall we authorize Antigravity to flash this telemetry optimization spec
straight into the codebase? Once this calibration run is complete, the chassis
is bulletproof and ready for the **Agno Python Agent Core** setup!

---
---

# ðŸ› ï¸ IMPLEMENTATION PLAN (preenchido pelo PM â€” Claude/Opus)

> Fluxo e regras: ver `Planning/agent_workflow.md`. O PM quebrou a VisÃ£o acima em
> tarefas, definiu tier (S/M/L/XL), dono (agente/modelo), arquivos (file ownership)
> e o mapa de ondas. Engenheiros podem questionar/pedir correÃ§Ã£o do plano **antes**
> de codar. Branch: `<agent>/sprint5.2/<epic>/<task-desc>`.

## ðŸ”’ DecisÃµes de escopo travadas (Human, 2026-05-31)

1. **CadÃªncia (Â§1.2):** valor Ãºnico **por pipeline** (`cadence_days`). Ao registrar
   um QuickTouch, `next_contact = agora + cadence_days` para deals daquele pipeline.
   _NÃ£o_ Ã© um motor de sequÃªncia multi-step â€” isso fica para um ciclo futuro.
2. **Zero-reload (Â§3.4):** abordagem **layout-route + cache de query** (menor risco).
   Refatorar `App.tsx` para uma rota de layout com `<Outlet />` (navbar/footer param
   de remontar) e tunar `staleTime`/`gcTime` do React Query. Sem keep-alive de
   Ã¡rvores montadas.
3. **Taxonomia (Â§2.3):** tabela dedicada **`origin_taxonomy`** (nÃ£o JSON em settings).

## ðŸ‘¥ Time desta sprint (agentes)

| Agente | NÃ­vel | Bom para | Custo |
| :----- | :---- | :------- | :---- |
| **Claude / Opus** | SÃªnior | XL/arquitetura, transaÃ§Ãµes atÃ´micas, estado de chat, roteamento | Premium |
| **Codex / GPT-5** | Pleno | Schema/migrations, hooks de config, correÃ§Ã£o de tipos | MÃ©dio |
| **Gemini** | Pleno (visual) | Componentes de UI, telemetria visual, badges | MÃ©dio |
| **Verboo / MiniMax** | **JÃºnior Â· tokens ilimitados** | Tarefas mecÃ¢nicas e bem-delimitadas (CRUD de UI, filtros, geraÃ§Ã£o de colunas). Iterar Ã  vontade â€” token custo zero. | Barato |

> **Regra do Verboo:** sÃ³ recebe tarefas com spec fechado e baixo risco de
> arquitetura. PM revisa com atenÃ§Ã£o extra no merge. Por ter tokens ilimitados,
> Verboo Ã© o operÃ¡rio de grind â€” pode reprocessar quantas vezes precisar.

## ðŸ“‹ Task Table

| ID  | EPIC / Â§        | Tarefa (o que fazer)                                              | Tier | Dono (agente/modelo) | Arquivos (ownership)                                                                                          | Branch                                            | Status |
| :-- | :-------------- | :--------------------------------------------------------------- | :--- | :------------------- | :----------------------------------------------------------------------------------------------------------- | :------------------------------------------------ | :----- |
| T1  | 1.2 / 2.1       | Schema: `cadence_days` em `pipelines` + `max_interactions` em stages | M    | Codex / GPT-5        | _migration nova_, `src/types/pipelines.ts`, `src/integrations/supabase/types.ts`                             | `codex/sprint5.2/epic1/schema-cadence-kpi`        | [x]    |
| T2  | 2.3             | Schema: tabela `origin_taxonomy` + hook `useOriginTaxonomy`      | M    | Codex / GPT-5        | _migration nova_, `src/hooks/useOriginTaxonomy.ts`, `src/types/taxonomy.ts`                                   | `codex/sprint5.2/epic2/schema-taxonomy`           | [x]    |
| T3  | 1.1 + 1.2(write)| QuickTouch toolbar + escrita de cadÃªncia no `next_contact`       | L    | Claude / Opus        | `src/components/crm/TouchpointsList.tsx`, `src/hooks/useTouchpoints.ts`                                       | `claude/sprint5.2/epic1/quicktouch-cadence`       | [x]    |
| T4  | 1.2(display)/2.1| Telemetria: estado de cor do prÃ³ximo contato + flag de breach KPI + `NextContactBadge` | L | Gemini | `src/hooks/useStageTelemetry.ts`, `src/components/crm/NextContactBadge.tsx`                                   | `gemini/sprint5.2/epic1/next-contact-badge`       | [x]    |
| T5  | 2.1 + 1.2(cfg)  | Config do pipeline: input `cadence_days` (pipeline) + `max_interactions` (stage) | L | Codex / GPT-5 | `src/pages/PipelineSettings.tsx`, `src/hooks/usePipelines.ts`, `src/components/crm/pipeline-settings/StagesEditor.tsx`, `src/hooks/usePipelineStagesV2.ts` | `codex/sprint5.2/epic2/kpi-cadence-config`        | [x]    |
| T6  | 1.4             | Raio-X de Enriquecimento: explodir chaves do JSONB em colunas ordenÃ¡veis | L | **Verboo / MiniMax** | `src/components/crm/DatabaseView.tsx`                                                                    | `verboo/sprint5.2/epic1/enrichment-xray`          | [x]    |
| T7  | 1.3             | Cascata de links relacionais (opp â†’ ledger de contato)          | L    | Claude / Opus        | `src/hooks/useOpportunityLinks.ts`, `src/hooks/useCreateContactAtomic.ts`                                     | `claude/sprint5.2/epic1/link-cascade`             | [x]    |
| T9  | 3.1             | Filtro de funil na caixa de entrada                              | M    | **Verboo / MiniMax** | `src/components/inbox/InboxSidebar.tsx`                                                                       | `verboo/sprint5.2/epic3/inbox-funnel-filter`      | [x]    |
| T10 | 2.2(tabs)       | Abas Notas + Tarefas dentro do modal de oportunidade            | M    | Gemini               | `src/components/crm/OpportunityDetailModal.tsx`                                                               | `gemini/sprint5.2/epic2/card-notes-tasks-tabs`    | [x]    |
| T8  | 2.3(UI)         | Editor de taxonomia Origem/Canal (add/edit/color)               | L    | **Verboo / MiniMax** | `src/components/crm/pipeline-settings/OriginTaxonomyEditor.tsx` _(novo)_, `src/pages/PipelineSettings.tsx`     | `verboo/sprint5.2/epic2/taxonomy-editor`          | [x]    |
| T11 | 1.2/2.1(surface)| Consumir telemetria no card e na tabela (badge + alerta de breach) | L | Gemini             | `src/components/crm/OpportunityCard.tsx`, `src/components/crm/CardTelemetryPillars.tsx`, `src/components/crm/OpportunityTable.tsx` | `gemini/sprint5.2/epic2/telemetry-surface`        | [x]    |
| T12 | 3.4             | Roteamento zero-reload (rota de layout + Outlet + cache tuning)  | XL   | Claude / Opus        | `src/App.tsx`, `src/components/AuthenticatedLayout.tsx` _(novo)_                                              | `claude/sprint5.2/epic3/zero-reload-routing`      | [x]    |
| T13 | 2.2(page)       | PÃ¡gina mestre de Tarefas no sidebar + rota + nav                | L    | Claude / Opus        | `src/pages/Tasks.tsx` _(novo)_, `src/hooks/useAllTasks.ts` _(novo)_, `src/App.tsx`, `src/components/TopNavbar.tsx` | `claude/sprint5.2/epic2/master-task-page`         | [x]    |
| T14 | 3.3             | Limpeza do chat + switch de handover hÃ­brido (`Vendedor no Loop`)| L    | Claude / Opus        | `src/components/inbox/ConversationHeader.tsx`, `src/components/inbox/CRMContextPanel.tsx`, `src/pages/Chat.tsx` | `claude/sprint5.2/epic3/chat-declutter-handover`  | [x]    |
| T15 | 3.2             | BotÃ£o "Sales Engine Chat Route" (foco no chat / cria thread)    | L    | Claude / Opus        | `src/pages/Chat.tsx`, `src/components/crm/ContactDetailsModal.tsx`, `src/components/crm/DatabaseView.tsx`, `src/components/inbox/CRMContextPanel.tsx` | `claude/sprint5.2/epic3/zero-friction-chat-link`  | [x]    |
| T16 | DoD             | Auditoria de aceite (evidÃªncia de cÃ³digo) + fechamento da sprint | S    | Claude / Opus (PM)   | _read-only_ + `Planning/sprint_5.2_crm_v1_fixes_4.md`, `Planning/billing.md`                                | `claude/sprint5.2/dod/acceptance-audit`           | [x]    |

*Tiers: **S** mecÃ¢nico Â· **M** um hook/componente Â· **L** hook + integraÃ§Ã£o multi-arquivo Â· **XL** cross-cutting/arquitetura. Nunca rode S/M em modelo premium.*

---

## ðŸ§© Detalhe por tarefa (engenheiro lÃª antes de codar)

### T1 â€” Schema: cadÃªncia + KPI _(M Â· Wave 1)_
**O que fazer:**
- Migration nova `supabase/migrations/20260601000000_sprint5_2_cadence_kpi.sql`:
  - `ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS cadence_days integer CHECK (cadence_days IS NULL OR cadence_days > 0);` + `COMMENT`.
  - `ALTER TABLE public.pipeline_stages_v2 ADD COLUMN IF NOT EXISTS max_interactions integer CHECK (max_interactions IS NULL OR max_interactions > 0);` + `COMMENT`. (Espelha o padrÃ£o de `max_idle_hours` da migration `20260525000000`.)
- `src/types/pipelines.ts`: add `cadence_days: number | null;` em `Pipeline` e `max_interactions: number | null;` em `PipelineStageV2`.
- `src/integrations/supabase/types.ts`: refletir as duas colunas novas nas linhas geradas de `pipelines` e `pipeline_stages_v2` (Row/Insert/Update).
**Aceite:** `tsc` limpo; colunas existem; nenhum consumidor quebra (campos opcionais/nullable).

### T2 â€” Schema: taxonomia Origem/Canal _(M Â· Wave 1)_
**O que fazer:**
- Migration nova `20260601000100_sprint5_2_origin_taxonomy.sql`: tabela `public.origin_taxonomy` (`id uuid pk default gen_random_uuid()`, `equipe_id uuid not null`, `kind text not null check (kind in ('origem','canal'))`, `label text not null`, `color text not null default '#64748b'`, `created_at timestamptz default now()`, `deleted_at timestamptz`). RLS por `equipe_id` espelhando o padrÃ£o de outra tabela tenant-scoped (ex.: `opportunity_links`). Unique parcial `(equipe_id, kind, lower(label)) where deleted_at is null`.
- `src/types/taxonomy.ts` _(novo)_: `export type TaxonomyKind = 'origem' | 'canal';` + `export interface OriginTag { id; equipe_id; kind: TaxonomyKind; label; color; created_at; deleted_at; }`.
- `src/hooks/useOriginTaxonomy.ts` _(novo)_: query (lista por kind, scoped por `equipe_id`, `deleted_at is null`) + mutations `createTag`/`updateTag`/`deleteTag` (soft delete) no padrÃ£o react-query/`toast` jÃ¡ usado em `useOpportunityLinks.ts`.
**Aceite:** `tsc` limpo; CRUD da taxonomia funciona isolado; RLS nega cross-tenant.

### T3 â€” QuickTouch + escrita de cadÃªncia _(L Â· Wave 2 Â· dep T1)_
**O que fazer:**
- `TouchpointsList.tsx`: adicionar uma toolbar compacta no topo com 3 gatilhos de modalidade `[ ðŸ“ž Chamada ] [ ðŸ’¬ WhatsApp ] [ ðŸ“§ E-mail ]`. Um clique cria o touchpoint imediatamente (`touchpoint_type` correspondente, `content` vazio/default, `contact_date = hoje`, operador = usuÃ¡rio atual). ExpansÃ£o inline opcional para adicionar nota depois (editar `content` do registro recÃ©m-criado) â€” sem bloquear o fluxo de 1 clique.
- `useTouchpoints.ts`: no `createTouchpoint`, apÃ³s inserir, calcular e gravar `leads.next_contact = now + pipeline.cadence_days` **atomicamente** quando o pipeline do lead tiver `cadence_days` definido. Buscar o `cadence_days` via o stageâ†’pipeline do lead (ou receber `cadenceDays` como input do caller para evitar fetch extra â€” decidir e documentar). Invalidate das queries `["touchpoints", leadId]` e do lead/oportunidade afetados.
**Aceite (DoD #1):** clicar um gatilho registra o touchpoint em 1 clique e dispara o recÃ¡lculo de `next_contact` instantaneamente.

### T4 â€” Telemetria: badge de prÃ³ximo contato + breach KPI _(L Â· Wave 2 Â· dep T1)_
**O que fazer:**
- `useStageTelemetry.ts`: estender `StageTelemetry` com `nextContactState: 'overdue' | 'today' | 'future' | null` (ðŸ”´/ðŸŸ¢/âšª) derivado de `formatNextContact`, e `interactionsBreached: boolean` (true quando `touchpointCount >= maxInteractions` e `maxInteractions` setado). Estender `TelemetryInputs` com `maxInteractions: number | null`. MudanÃ§as aditivas â€” nÃ£o quebrar callers atuais.
- `NextContactBadge.tsx` _(novo)_: badge que pinta ðŸ”´ Atrasado / ðŸŸ¢ Hoje / âšª Futuro conforme `nextContactState`, com um `Popover` + date-picker inline para o vendedor sobrescrever a data (callback `onChange(date)`); cor reage instantaneamente Ã  escolha. Usa os componentes `ui/popover` + `ui/calendar` jÃ¡ presentes.
**Aceite (DoD #2):** badge muda de cor imediatamente conforme a data; override inline funciona.

### T5 â€” Config do pipeline: cadÃªncia + max interaÃ§Ãµes _(L Â· Wave 2 Â· dep T1)_
**O que fazer:**
- `PipelineSettings.tsx`: no formulÃ¡rio de ediÃ§Ã£o do pipeline, adicionar input numÃ©rico **"CadÃªncia (dias)"** que lÃª/grava `pipeline.cadence_days`.
- `usePipelines.ts`: incluir `cadence_days` no payload de update do pipeline.
- `StagesEditor.tsx`: por stage, adicionar input **"MÃ¡x. interaÃ§Ãµes"** (`max_interactions`) ao lado do jÃ¡-existente limite de SLA.
- `usePipelineStagesV2.ts`: persistir `max_interactions` no create/update de stage.
**Aceite (DoD parcial Â§2.1):** gestor define cadÃªncia por pipeline e teto de interaÃ§Ãµes por stage; valores persistem e voltam no reload.

### T6 â€” Raio-X de Enriquecimento _(L Â· Wave 2 Â· Verboo)_
**O que fazer:**
- `DatabaseView.tsx`: hoje a coluna `enrichment_summary` condensa `personal_custom_data` num Ãºnico preview (`summarizeEnrichment`). Trocar por desempacotamento: derivar o conjunto-uniÃ£o de chaves estruturadas presentes em `personal_custom_data` na base carregada e gerar colunas `ColumnDef<Lead>` dinÃ¢micas, ordenÃ¡veis, uma por chave (label legÃ­vel). Manter sob o controle de visibilidade de colunas existente (`columnVisibility`) para o usuÃ¡rio ligar/desligar. NÃ£o vazar para fora do `DatabaseView`.
**Aceite (DoD parcial Â§1.4):** chaves do enriquecimento aparecem como colunas prÃ³prias e ordenÃ¡veis.

### T7 â€” Cascata de links relacionais _(L Â· Wave 2)_
**O que fazer:**
- `useOpportunityLinks.ts`: ao linkar `company`/`property` numa oportunidade, alÃ©m de gravar em `opportunity_links`, propagar a relaÃ§Ã£o para o ledger do contato (via integraÃ§Ã£o com `useCreateContactAtomic.ts`) de modo que os badges relacionais fiquem visÃ­veis na **Base de Contatos** sem reabrir o card.
- `useCreateContactAtomic.ts`: expor/ajustar o caminho de persistÃªncia relacional usado por essa cascata (mesma transaÃ§Ã£o/sequÃªncia atÃ´mica do Sprint 5.1). Invalidate das queries da Base de Contatos.
**Aceite (DoD #3):** associaÃ§Ã£o feita dentro do pipeline reflete imediatamente nas views da grade de Contatos.

### T9 â€” Filtro de funil na inbox _(M Â· Wave 2 Â· Verboo)_
**O que fazer:**
- `InboxSidebar.tsx`: adicionar uma faixa de filtro no topo com `Select` de pipeline/funil (reaproveitar os `ui/select` jÃ¡ importados). Filtrar `sessions` exibidos pelo funil do cliente. Usar os dados de pipeline jÃ¡ presentes na sessÃ£o/lead; **nÃ£o** alterar `Chat.tsx` (manter ownership isolado â€” derivar o funil do que jÃ¡ chega via props).
**Aceite (DoD parcial Â§3.1):** vendedor filtra a inbox por funil e vÃª sÃ³ os threads daquele pipeline.

### T10 â€” Abas Notas + Tarefas no card _(M Â· Wave 2)_
**O que fazer:**
- `OpportunityDetailModal.tsx`: no painel direito (bloco de engenharia 40% do layout 5.1), adicionar `Tabs` com **Notas** (histÃ³rico interno) e **Tarefas** (acionÃ¡veis), usando `ui/tabs` + o hook `useTasks(leadId)` jÃ¡ existente para listar/criar/alternar tarefas do lead. NÃ£o editar `TouchpointsList` (apenas renderizÃ¡-lo se necessÃ¡rio).
**Aceite (DoD parcial Â§2.2):** card expandido tem abas limpas de Notas e Tarefas.

### T8 â€” Editor de taxonomia Origem/Canal _(L Â· Wave 3 Â· dep T2 Â· Verboo)_
**O que fazer:**
- `OriginTaxonomyEditor.tsx` _(novo)_: matriz para add/editar/excluir e color-code tags de `origem` e `canal` via `useOriginTaxonomy` (do T2). Picker de cor + label editÃ¡vel.
- `PipelineSettings.tsx`: montar o editor como uma nova aba/seÃ§Ã£o de settings do workspace. _(Edita o mesmo arquivo do T5, por isso vai na Wave 3 â€” depois do merge do T5.)_
**Aceite (DoD parcial Â§2.3):** usuÃ¡rio cria uma tag nova (ex.: campanha de influencer no Instagram) e ela fica selecionÃ¡vel nos cards de contato.

### T11 â€” Consumo de telemetria no card e tabela _(L Â· Wave 3 Â· dep T4)_
**O que fazer:**
- `CardTelemetryPillars.tsx`: trocar a exibiÃ§Ã£o crua de prÃ³ximo contato pelo `NextContactBadge` (T4) e adicionar o micro-alerta visual quando `interactionsBreached` (ou SLA de tempo) estourar.
- `OpportunityCard.tsx` e `OpportunityTable.tsx`: passar `maxInteractions` (do stage) para a telemetria e renderizar badge/alerta de breach de forma consistente nas duas superfÃ­cies.
**Aceite (DoD parcial Â§2.1/Â§1.2):** card e tabela mostram o badge colorido e o aviso quando os thresholds do gestor sÃ£o violados.

### T12 â€” Roteamento zero-reload _(XL Â· Wave 3)_
**O que fazer:**
- `AuthenticatedLayout.tsx` _(novo)_: extrair o `AuthenticatedLayout` de `App.tsx` para um componente prÃ³prio que renderiza `<TopNavbar/>`, `<main><Outlet/></main>`, footer e `<WhatsAppButton/>`.
- `App.tsx`: converter as rotas autenticadas para uma **rota de layout Ãºnica** (`<Route element={<ProtectedRoute><AuthenticatedLayout/></ProtectedRoute>}>` com filhas) â€” navbar/footer param de remontar a cada navegaÃ§Ã£o. Tunar o `QueryClient` (`staleTime`/`gcTime` apropriados) para os dados ficarem quentes entre telas (sem refetch que pisca). Sem keep-alive de Ã¡rvores montadas (decisÃ£o travada).
**Aceite (DoD #6):** trocar de tela nÃ£o recarrega/pisca a navbar nem refaz fetch visÃ­vel; troca Ã© um swap de layout.

### T13 â€” PÃ¡gina mestre de Tarefas _(L Â· Wave 4 Â· dep T12)_
**O que fazer:**
- `useAllTasks.ts` _(novo)_: query agregada de todas as tarefas do tenant (sem filtrar por `lead_id`), com `title`, `due_date`, `status`, `assigned_to`, e join/labels do lead/pipeline.
- `pages/Tasks.tsx` _(novo)_: tabela de alta densidade (cabeÃ§alho, prazo, estado, dono) cruzando todos os funis.
- `App.tsx`: adicionar a rota `/tasks` **dentro do padrÃ£o de layout do T12**.
- `TopNavbar.tsx`: adicionar item de navegaÃ§Ã£o para a pÃ¡gina de Tarefas.
**Aceite (DoD #4):** pÃ¡gina dedicada lista todas as tarefas, prazos e donos de todos os pipelines.

### T14 â€” Limpeza do chat + handover hÃ­brido _(L Â· Wave 4)_
**O que fazer:**
- `ConversationHeader.tsx`: remover o componente de `R$ Price Tracker` do centro da barra superior. Implementar o switch de estado: quando o humano digita/assume, o Ã­cone de automaÃ§Ã£o vira badge de aviso **`Vendedor no Loop`**, e o botÃ£o de devolver muda para **`Devolver Controle ao Agente`** (proeminente).
- `CRMContextPanel.tsx`: remover permanentemente o bloco legado **"Copiloto Comercial"** (linha ~195).
- `Chat.tsx`: ligar o estado de handoff ao gatilho (estender `handleToggleHandoff` / estado de "humano no loop"). ParÃ¢metros financeiros do deal passam a viver sÃ³ no painel de contexto Ã  direita.
**Aceite (DoD #5):** ao um humano entrar no thread, o viewport muda de estado e oferece o `Devolver`.

### T15 â€” BotÃ£o zero-friction de chat _(L Â· Wave 5)_
**O que fazer:**
- `Chat.tsx`: aceitar um alvo (ex.: `?contact=<leadId>`/estado de navegaÃ§Ã£o) que foca o viewport no thread daquele contato; se nÃ£o houver thread para aquele telefone, inicializar um novo thread interno automaticamente (helper sobre `useConversations`).
- `ContactDetailsModal.tsx`, `DatabaseView.tsx` (aÃ§Ã£o de linha), `CRMContextPanel.tsx`: ao lado do link bruto de WhatsApp, adicionar o **"Sales Engine Chat Route Button"** que navega para `/chat` focando aquele contato.
- _(Edita `Chat.tsx` depois do T14 e `DatabaseView`/`CRMContextPanel` depois das ondas anteriores â€” por isso Wave 5.)_
**Aceite (DoD parcial Â§3.2):** clicar o botÃ£o em qualquer registro de contato abre o chat nativo focado naquele cliente.

### T16 â€” Auditoria de aceite + fechamento _(S Â· Wave 6)_
**O que fazer:** validar cada item da Definition of Done abaixo contra evidÃªncia de cÃ³digo (typecheck/build limpos), marcar `[x]` ou abrir bounce-back, e fechar a sprint. Espelhar billing. Recomendar smoke final no app rodando para os itens de runtime/visual.

---

## ðŸŒŠ Waves (visÃ£o simples)

> **Regra de ouro:** na mesma onda, ninguÃ©m toca o mesmo arquivo. SÃ³ avanÃ§a de
> onda quando a anterior fez merge (`git pull`). Cada onda Ã© um "pit stop".

### ðŸŸ¦ Wave 1 â€” FundaÃ§Ã£o de schema
*Trava as colunas/tabelas que as features usam. Tudo depende daqui.*

| Task | Dono  | Entrega                                            |
| :--- | :---- | :------------------------------------------------- |
| T1   | Codex | colunas `cadence_days` + `max_interactions`        |
| T2   | Codex | tabela `origin_taxonomy` + hook                    |

### ðŸŸ© Wave 2 â€” Features em paralelo  *(depende da Wave 1)*
*7 tarefas, arquivos 100% disjuntos â€” rodam todas ao mesmo tempo.*

| Task | Dono       | Entrega                                  |
| :--- | :--------- | :--------------------------------------- |
| T3   | Claude     | QuickTouch + escrita de cadÃªncia         |
| T4   | Gemini     | badge de prÃ³ximo contato (cores)         |
| T5   | Codex      | inputs de cadÃªncia/KPI nas configs       |
| T6   | **Verboo** | colunas de raio-X do enriquecimento      |
| T7   | Claude     | cascata de links relacionais             |
| T9   | **Verboo** | filtro de funil na inbox                 |
| T10  | Gemini     | abas Notas/Tarefas no modal              |

### ðŸŸ¨ Wave 3 â€” Consumo + roteamento
| Task | Dono       | Entrega                                  |
| :--- | :--------- | :--------------------------------------- |
| T8   | **Verboo** | editor de taxonomia *(PipelineSettings apÃ³s T5)* |
| T11  | Gemini     | telemetria no card + tabela              |
| T12  | Claude     | roteamento zero-reload (App + Layout)    |

### ðŸŸ§ Wave 4 â€” PÃ¡gina + handover
| Task | Dono   | Entrega                                  |
| :--- | :----- | :--------------------------------------- |
| T13  | Claude | pÃ¡gina mestre de Tarefas (+ rota + nav)  |
| T14  | Claude | limpeza do chat + handover hÃ­brido       |

### ðŸŸ¥ Wave 5 â€” Chat link
| Task | Dono   | Entrega                                  |
| :--- | :----- | :--------------------------------------- |
| T15  | Claude | botÃ£o "Sales Engine Chat Route"          |

### â¬› Wave 6 â€” Fechamento
| Task | Dono   | Entrega                                  |
| :--- | :----- | :--------------------------------------- |
| T16  | Claude (PM) | auditoria de DoD + fechamento       |

### ðŸ“Š Carga por agente (quem faz o quÃª, em ordem)

| Agente     | Tarefas                                   | Total |
| :--------- | :---------------------------------------- | :---- |
| **Claude** | T3, T7 â†’ T12 â†’ T13, T14 â†’ T15 â†’ T16        | 7     |
| **Codex**  | T1, T2 â†’ T5                               | 3     |
| **Gemini** | T4, T10 â†’ T11                             | 3     |
| **Verboo** | T6, T9 â†’ T8                               | 3     |

*Verboo (jÃºnior, tokens ilimitados) pega sÃ³ tarefas de UI bem-delimitadas; na
Wave 2 ele roda T6 e T9 em sequÃªncia (sem pressa â€” token custo zero).*

### ðŸ” Matriz de ownership de arquivos quentes (cross-wave, sequencial â€” sem colisÃ£o)

| Arquivo                         | Tarefas (em ordem de onda)        |
| :------------------------------ | :-------------------------------- |
| `src/App.tsx`                   | T12 (W3) â†’ T13 (W4)               |
| `src/pages/Chat.tsx`            | T14 (W4) â†’ T15 (W5)               |
| `src/pages/PipelineSettings.tsx`| T5 (W2) â†’ T8 (W3)                 |
| `src/components/crm/DatabaseView.tsx` | T6 (W2) â†’ T15 (W5)          |
| `src/components/inbox/CRMContextPanel.tsx` | T14 (W4) â†’ T15 (W5)    |
| `src/hooks/useStageTelemetry.ts`| T4 (W2) somente                   |
| `src/types/pipelines.ts`        | T1 (W1) somente                   |

*Cada arquivo quente Ã© tocado por uma Ãºnica tarefa por onda; ondas distintas = ediÃ§Ã£o sequencial apÃ³s merge.*

## ðŸ§ Notas / QuestÃµes dos Engenheiros (antes de codar)

- **PM â†’ T3:** confirmar se `cadence_days` Ã© lido via fetch do pipeline dentro de
  `useTouchpoints` ou passado como prop pelo caller (preferÃªncia: prop, p/ evitar
  fetch extra no hot path). Documentar a escolha no PR.
- **PM â†’ T6:** definir um teto de colunas dinÃ¢micas (ex.: top-N chaves mais
  preenchidas) para nÃ£o explodir a largura da tabela em bases muito heterogÃªneas.
  Default sugerido: todas as chaves presentes, escondidas via `columnVisibility`
  exceto as 4â€“6 mais comuns.
- **PM â†’ T11:** o micro-alerta de breach deve cobrir **tempo-na-fase** (`max_idle_hours`,
  jÃ¡ existe) **e** `max_interactions` (novo). Reusar o estilo Precision Red pulsante
  do Sprint 5.1.
- _Engenheiro registra aqui dÃºvidas ou pedidos de correÃ§Ã£o do plano; PM responde antes de liberar a onda._

## ðŸ’° Billing (espelho de `Planning/billing.md`)

| Data | Tarefa | Agente/Modelo | Tier | R$ |
| :--- | :----- | :------------ | :--- | :- |
| 2026-06-04 | T1 schema cadence/KPI          | Codex / GPT-5  | M  | R$ 12 |
| 2026-06-04 | T2 schema taxonomy + hook      | Codex / GPT-5  | M  | R$ 12 |
| 2026-06-04 | T3 QuickTouch + cadÃªncia       | Claude / Opus  | L  | R$ 20 |
| 2026-06-04 | T4 telemetry badge             | Gemini         | L  | R$ 20 |
| 2026-06-04 | T5 config cadÃªncia/KPI         | Codex / GPT-5  | L  | R$ 20 |
| 2026-06-04 | T6 enrichment X-ray            | Verboo/MiniMax | L  | R$ 20 |
| 2026-06-04 | T7 link cascade                | Claude / Opus  | L  | R$ 20 |
| 2026-06-04 | T9 inbox funnel filter         | Verboo/MiniMax | M  | R$ 12 |
| 2026-06-04 | T10 card notes/tasks tabs      | Gemini         | M  | R$ 12 |
| 2026-06-04 | T8 taxonomy editor UI          | Verboo/MiniMax | L  | R$ 20 |
| 2026-06-04 | T11 telemetry surface          | Gemini         | L  | R$ 20 |
| 2026-06-04 | T12 zero-reload routing        | Claude / Opus  | XL | R$ 28 |
| 2026-06-04 | T13 master task page           | Claude / Opus  | L  | R$ 20 |
| 2026-06-04 | T14 chat declutter/handover    | Claude / Opus  | L  | R$ 20 |
| 2026-06-04 | T15 zero-friction chat link    | Claude / Opus  | L  | R$ 20 |
| 2026-06-04 | T16 DoD audit                  | Claude / Opus  | S  | R$ 5  |
| **Total estimado** |                  |                |    | **R$ 281** |

*Cada engenheiro adiciona a linha (com data) ao concluir; PM confere no merge. Tiers: S=R$5 Â· M=R$12 Â· L=R$20 Â· XL=R$28.*

## ðŸŽ¯ Rastreabilidade â€” Definition of Done â†’ Tarefas

| DoD (Â§ VisÃ£o)                                                                 | Tarefa(s) que entregam        |
| :--------------------------------------------------------------------------- | :---------------------------- |
| #1 Quick-touchpoint em 1 clique dispara o calculador de cadÃªncia             | T1, T3 (+T4 cÃ¡lculo)          |
| #2 Badge de prÃ³ximo contato muda de cor conforme a data                      | T4, T11                       |
| #3 AssociaÃ§Ã£o no pipeline reflete na grade de Contatos                       | T7                            |
| #4 PÃ¡gina dedicada lista tarefas, prazos e donos                             | T13 (+T10 abas)               |
| #5 Viewport do chat muda de estado quando humano entra (`Devolver`)          | T14                           |
| #6 Troca de tela com persistÃªncia absoluta (zero reload)                     | T12                           |
| _Â§1.4 colunas de enriquecimento_ (alÃ©m do DoD explÃ­cito)                     | T6                            |
| _Â§2.1 tuner de KPI (tempo-na-fase + mÃ¡x interaÃ§Ãµes)_                         | T1, T5, T4, T11               |
| _Â§2.3 taxonomia Origem/Canal customizÃ¡vel_                                   | T2, T8                        |
| _Â§3.1 filtro de funil na inbox_                                              | T9                            |
| _Â§3.2 botÃ£o de rota de chat zero-friction_                                   | T15                           |

## ðŸ” PM Double-Check (no merge de cada tarefa)

- [ ] **Task** â€” build limpo (`tsc`/`vite build` sem novos erros), sÃ³ arquivos do escopo, bate com o plano.
- [ ] **Billing** â€” linha presente com data e tier certo.
- [ ] **Acceptance** â€” satisfaz o(s) item(ns) da Definition of Done / mapa de rastreabilidade acima.
- [ ] **Wave hygiene** â€” nenhuma tarefa da mesma onda tocou arquivo compartilhado; apÃ³s merge da onda, avisar `git pull`.
