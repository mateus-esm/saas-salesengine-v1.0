Analyze of S6.8 -

1. I like the anayling area of the sync now.
2. Also ok the persistence now. 3.The time to have some response of the agent
   its yet high
3. Telemetria still with technical and non cleat outputs: Atualizar
   fa134be9-503b-4a77-be33-b95962185d21 set_field Definindo
   fa134be9-503b-4a77-be33-b95962185d21 como 1000. Atualizar - Concluido

-

## Atualizar ac30d096-ebf7-4dab-8366-0faa2fcf50f4 set_field Definindo ac30d096-ebf7-4dab-8366-0faa2fcf50f4 como 986. Atualizar - Concluido

## Atualizar 300e19ee-1e6c-4a81-9c41-1b1b0162b2ac set_field Definindo 300e19ee-1e6c-4a81-9c41-1b1b0162b2ac como 6.71. Atualizar - Concluido

## Atualizar b973ccd2-166b-49e0-8a32-73d971b5f41c set_field Definindo b973ccd2-166b-49e0-8a32-73d971b5f41c como 15452.72. Atualizar - Concluido

## Adicionar nota add_note Cliente perguntou sobre a cidade da empresa (Solo Energia atua no Ceará e outras regiões). Adicionar nota Concluido

Sincronizacao concluida done executed

4. In CRM we have an broken in the kanban view:
   "C:\Users\mateus\Pictures\Screenshots\Captura de tela 2026-06-24 132721.png"
   so not appear all the informations,its needes to adjust is.

5. Painel de receita keeps not fit with our brand and objectives of hava an fast
   game placar in the pipeline that give to us the math and precision of the
   predicatable revenue metode: "C:\Users\mateus\Pictures\Screenshots\Captura de
   tela 2026-06-24 132837.png"

6. In lead table for example dont have the excel style where i can adjust,
   create,exclude and filter columns for example.

7. the session crm -> pipeline -> copilot -> agente de crm is still confunsing:
   "C:\Users\mateus\Pictures\Screenshots\Captura de tela 2026-06-24 133227.png"
   so we need to rethink the logic and ui/ux to we have an better
   esperience,also take off the placar de teceita of this session,only need to
   appear in the kanban view.

8. in CRM -> Pipeline -> config of the pipeline: this section also is confunsing
   we need an better organizations like etapas some field not appear at all
   because the scren is low that the tecxt,we want tha allntrxt can be clearly
   visible, cadencia for example dont appear tottaly,metas need to be more clear
   and more aligned with the predictability method, its to confusing for a user
   that dont understand, like: New opportunities (Maybe for channel to), average
   ticket, lead time, conversion rate, number of deals close, some personalized
   goals: proposals sent, meetings, faturamento, touchpoints, so we can setup
   this goals and split maybe for owner,period of time and made the track to see
   the results of an specific salesmen, and the overal of the pipeline. (this
   logic need to be refined): "C:\Users\mateus\Pictures\Screenshots\Captura de
   tela 2026-06-24 133640.png", also taxonomia de Origem e Canalneed to be
   closed and open like the others and also better explaneid,i donts undersetand
   for what is the pourpose,and also the campos do contato i need an better
   claryfing) or if somethign its condigurable to all the pipelines we can have
   an section inside this pipelines configt to general setups.

9. We need an better move flow inside the app,like iam in the pipeline config
   session and canot go to crm wirhtou have to clic in crm agais,we need think
   in this transitions inside the app.

10. inside the card on the pipeline view: an identidade where is the name of the
    lead maybe i can open the base de contatos relation when click in the name,
    and in the sync inside the pipelie also can be equal to the chat,also donta
    has persitence,when i out of the page lost the persistence and reload the
    page and i lost the sync,i seethe result that the agent work in backende
    when he fineshed the task but i lost the visualreference.

11. in the face of the card where is the Lead Scoreis only an alone numner,can
    put the legenf: lead score.

12. I click in sync all crm and he begins to work with the same badgeof the chat
    good, but when i out of the table and return lost the visual reference,maybe
    the process still working in the backend but we need the persistence.

13. in the tabelas personalized still very bad, i want the excele style, can
    edit the columns! you need tothink simple,like andexce,supabase table,dont
    invetn,copy.

14. In base de contatos dont make sense have the score lead.

15.Now in copilot areas:

15.1. In base de contatos need an more efficiente and self explanation of the
fields: "C:\Users\mateus\Pictures\Screenshots\Captura de tela 2026-06-24
135807.png", the modes can be: Copilot (Ask for or sync button) and Autopilot
(When the toggle is active the agent begin to work, analyze and execute) if the
toggle is active automatically change to autopilot and vice and versa. wd need
for base de contatos the same style of the Agent CRM confir when we descirbe
some personalized fields and also we describe the hinsts thas is the agentc
prompt to agent know whot to work or put blocksoftraining,we can change the name
of hinst to Treinamento(Blocos where we can say what the agent have to doin
natural llanguage)

15.2.in pipelines the same thing its like bring to here the Agente de CRM
section that has inside the pipeline itself the diference is that inside the
pipeline is like an shortcut direct to this area,also to logs its like an filter
to the agent pipeline decisons, instead of receita and metas can have the
pipeline config that is like an shortcut to the pipele congi to,in this pipeline
config is like trainign datavase to the agent, aprovações can stay inside the
pipelien agent area,and also the base de contatos agent area witht the filter
and to general to the user can see the work of all agents, logs to! change this
name of automações deterministcas the client don understande it this area ==
regras (Agente de CRM) lets use Automações only

16. Agenda: In week view create lie the Google Agenda view, kanban day by
    day,only copy.

---

## Sprint 6.9 Recommendations (GLM)

**1. Analysis area of sync** ✅
- GLM: Keep current implementation, it's working well

**2. Persistence** ✅
- GLM: Maintain current persistence approach

**3. High agent response time**
- GLM: Optimize agent response time by:
  - Implementing streaming responses for faster perceived latency
  - Adding progress indicators during agent processing
  - Consider caching common responses for repeated queries

**4. Telemetry unclear outputs**
- GLM: Refactor telemetry to show human-readable actions:
  - Replace technical IDs with readable descriptions
  - Format timestamps in user's local timezone
  - Group related actions with clear labels
  - Example: "Atualizar cliente" instead of "set_field Definindo..."

**5. Broken kanban view**
- GLM: Fix kanban view by:
  - Reviewing the screenshot at `Captura de tela 2026-06-24 132721.png`
  - Ensuring all card fields are properly displayed
  - Implementing responsive layout for different screen sizes
  - Adding proper column width constraints

**6. Revenue panel redesign**
- GLM: Redesign revenue panel to be:
  - Fast game scoreboard style with clear metrics
  - Show predicted revenue using the predictability method
  - Include: total pipeline value, conversion rate, average deal size, expected close date
  - Make it visually distinct from other sections

**7. Lead table Excel-style columns**
- GLM: Implement Excel-style column management:
  - Drag-and-drop column reordering
  - Column visibility toggle (show/hide)
  - Column filtering capabilities
  - Custom column creation
  - Column exclusion options
  - Apply to all table views (Base de Contatos, Custom Tables)

**8. CRM → Pipeline → Copilot → Agent CRM confusion**
- GLM: Redesign navigation flow:
  - Create unified Copilot Cockpit with clear section separation
  - Remove revenue panel from this session
  - Show revenue panel only in Kanban view
  - Add breadcrumb navigation for better context
  - Consider collapsible sections to reduce cognitive load

**9. Pipeline config section confusion**
- GLM: Reorganize pipeline configuration:
  - Split into logical sections: Stages, Cadence, Goals, Taxonomy, Contact Fields
  - Make all fields clearly visible (fix layout issues)
  - Redesign cadence section with better visibility
  - Clarify goals section with predictive method explanation
  - Add tooltips/inline help for unclear fields
  - Create "General Settings" section for pipeline-wide configurations

**10. Move flow improvements**
- GLM: Improve navigation transitions:
  - Add direct navigation buttons between sections
  - Implement breadcrumb navigation
  - Add "Back to CRM" button in pipeline views
  - Consider sidebar navigation for quick access
  - Make transitions more intuitive

**11. Lead score legend**
- GLM: Add lead score legend:
  - Display "Lead Score" label next to the number
  - Add color coding (e.g., low/medium/high)
  - Include brief explanation of what the score means

**12. Sync persistence**
- GLM: Improve sync persistence:
  - Maintain sync status across page navigations
  - Show sync progress even when navigating away
  - Add "Sync in progress" indicator that persists
  - Restore sync state when returning to the page
  - Consider background sync with visual feedback

**13. Custom tables Excel-style**
- GLM: Redesign custom tables to be Excel-like:
  - Full drag-and-drop column management
  - Inline cell editing
  - Column filtering and sorting
  - Clear column headers with visibility controls
  - Simple, familiar interface (don't reinvent)
  - Make it feel like a Supabase table with Excel features

**14. Remove lead score from Base de Contatos**
- GLM: Remove lead score from Base de Contatos view
  - It doesn't make sense in this context
  - Keep lead score only in Pipeline/Kanban views

**15. Copilot areas improvements**

**15.1. Base de Contatos Copilot**
- GLM: Redesign Copilot interface:
  - Add field explanations with tooltips
  - Implement two modes: Copilot (Ask/Sync) and Autopilot (toggle)
  - When toggle is active, automatically switch to Autopilot mode
  - Add "Training Blocks" section for agent prompts
  - Rename "Hinsts" to "Treinamento" (Training)
  - Include blocks where users describe what agent should do in natural language

**15.2. Pipeline Copilot**
- GLM: Redesign Pipeline Copilot section:
  - Bring Agent CRM section directly into Pipeline view
  - Create shortcut to Pipeline Config from this area
  - Use Pipeline Config as training database for the agent
  - Keep approvals inside Pipeline Agent area
  - Add Base de Contatos Agent area with filters
  - Show all agent work in one unified view
  - Rename "Automações determinísticas" to "Automações" (Automations)
  - Add logs filter for agent pipeline decisions

**16. Agenda week view**
- GLM: Implement Google Agenda-style week view:
  - Copy Google Calendar's week view layout
  - Day-by-day kanban style
  - Make it visually similar to Google's implementation
  - Ensure it's intuitive and familiar to users

---

# Sprint 6.9 — "Copilot, Clarified" — PLAN

> **Status:** Planned (brainstormed + approved 2026-06-24).
> **Theme:** Make the Copilot/agent experience legible, redesign the pipeline
> config, and ship the predictability "game placar." A focused sprint — not
> everything in the analysis above lands here (see *Deferred* at the end and
> `todo.md`).
> **Contract (carried from 6.8):** every wave meets a **Definição de Premium**
> (experiential acceptance), not just "build green." A wave is done when a
> non-technical user gets it without being told.

## Scope decisions (locked with founder)

- **In 6.9:** A (agent IA consolidation), B (pipeline config redesign),
  C (predictability goals + scoreboard), E (kanban/card craft), G (navigation).
- **Deferred to 6.10:** Excel-style tables (pts 6, 13, 6.8-W4/W5),
  telemetry humanization + agent latency (pt 3), sync persistence across
  navigation (pts 2, 10, 12), Agenda week grid (pt 16). See `todo.md`.
- **Copilot IA = two surfaces with clear roles** (global overview + per-pipeline
  shortcut), not one merged surface.
- **Autonomy = 2 modes (Copilot / Autopilot)** in the UI, tied to the AI toggle;
  DB enum unchanged for back-compat.
- **Predictability goals = full subsystem with smart defaults**: the user sets
  only the headline target; activity targets auto-derive from historical
  conversion rates. Mini-dash metrics are **hideable** so the pipeline view
  stays clean.

## Current-state anchors (verified in code)

- Two Copilot entry points overlap today:
  - CRM top-tab `Copilot` → `src/pages/CopilotCockpit.tsx` (global; sidebar
    `CopilotSidebar.tsx`, per-pipeline `PipelineAgentView.tsx`).
  - Pipeline sub-tab `Copilot` → `PipelineWorkspace.tsx` `view === "agent"` →
    `AgentRulesPanel.tsx`.
- `PipelineScoreboard.tsx` renders in `PipelineWorkspace` **above all three
  sub-tabs** (kanban/leads/agent) — that's the pt-7 complaint.
- Revenue plumbing already exists and must be **extended, not rebuilt**:
  `pipelines.revenue_config` JSON (`goal_deals`, `period`) → `useForecast()`
  (computes `placar`, `required_inbound`, `sufficient_data`, `conversion_rates`)
  → `PipelineScoreboard` + `RevenueGoalsForm`.
- `assigned_to` already exists on leads (`src/types/crm.ts:54`) → per-owner
  goals need no new lead schema.
- Autonomy options live in `src/types/copilot.ts` (`AUTONOMY_OPTIONS`,
  `AutonomyMode`).

---

## Wave 1 — Copilot IA: two surfaces, clear roles  *(pts 7, 15.2)*

**Goal.** Kill the "two Copilots that look the same" confusion. Give each surface
one job.

**Build.**
- **Global Copilot (`CopilotCockpit.tsx`)** = the *"all agents" overview*.
  Default landing (no sidebar item selected) becomes a **unified activity/logs
  feed** across every agent (all pipelines + Base de Contatos), with a filter by
  *agent · pipeline · decision type*. Sidebar unchanged in structure
  (Base de Contatos / Pipelines / Treinamento / Aprovações).
- **Per-pipeline Copilot** (pipeline `agent` sub-tab) = a *focused shortcut into
  THIS pipeline's agent*. Sections: Prompt & nome · Autonomia (Wave 2) ·
  **Automações** (rules) · Logs **filtered to this pipeline** · Aprovações ·
  a **"Abrir configuração da pipeline"** button that **replaces "Receita &
  Metas"** in this view (pipeline config = the agent's training DB).
  Reconcile `AgentRulesPanel.tsx` and `PipelineAgentView.tsx` into one coherent
  per-pipeline view (pick one host; fold the other's content in).
- Rename **"Automações Determinísticas" → "Automações"** everywhere
  (`PipelineAgentView.tsx`, any labels/strings).
- **Move `PipelineScoreboard` out of `PipelineWorkspace` top** → render **only in
  the Kanban view** (inside `OpportunityKanban` or gated by `view === "kanban"`).

**Files.** `CopilotCockpit.tsx`, `PipelineAgentView.tsx`, `AgentRulesPanel.tsx`,
`PipelineWorkspace.tsx`, `ControlRoom.tsx` (logs filter), `CopilotSidebar.tsx`
(if landing/overview entry needed).

**Definição de Premium.** A user opening *Copilot* immediately sees "what have my
agents been doing" across everything; opening a pipeline's *Copilot* sub-tab sees
only that pipeline's agent and its controls. The revenue strip never appears
outside Kanban.

## Wave 2 — Autonomy: Copilot / Autopilot  *(pt 15.1)*

**Goal.** Two intelligible modes instead of three jargon levels.

**Build.**
- UI presents **2 modes**: *Copilot* (asks/suggests; you sync or approve) and
  *Autopilot* (acts on its own). Map: `observe` + `suggest` → **Copilot**,
  `autonomous` → **Autopilot**. **Keep the DB enum** (`observe/suggest/autonomous`)
  — mapping lives in the UI/`types/copilot.ts` layer; writing "Copilot" persists
  `suggest` (or `observe` — pick one canonical and document it).
- Wire the existing **AI toggle** (`AIAgentToggle.tsx`) ↔ mode, bidirectional:
  toggle ON → Autopilot, OFF → Copilot; changing mode flips the toggle.

**Files.** `types/copilot.ts`, `CopilotConfigCard.tsx`, `PipelineAgentView.tsx`,
`AIAgentToggle.tsx`, autonomy persistence hook (`useCopilotAgents`).

**Definição de Premium.** A non-technical user reads two options and knows which
is "do it for me" vs "ask me first." The toggle and the mode never disagree.

## Wave 3 — Base de Contatos agent  *(pts 15.1, 14)*

**Goal.** The contact-base agent is configured the same clear way as the CRM
agent.

**Build.**
- Self-explaining field labels/help on the Base de Contatos agent config.
- Same **Copilot/Autopilot** model (Wave 2) here.
- **"Treinamento" blocks** — rename "hints"/"Prompt de Sistema" framing into
  natural-language instruction blocks (same UX as the CRM agent's training),
  where the user writes what the agent should do.
- **Remove Lead Score** from the Base de Contatos table view (`DatabaseView.tsx`)
  — it's meaningless there (pt 14).

**Files.** `CopilotConfigCard.tsx`, `CopilotTrainingPanel.tsx`, `DatabaseView.tsx`.

**Definição de Premium.** Each field on the contact agent explains itself; the
contact table no longer shows a score that doesn't belong.

## Wave 4 — Pipeline config redesign  *(pt 8)*

**Goal.** Make `PipelineSettings` legible on a short screen and organized by
intent.

**Build.**
- Reorganize into clear collapsible sections, **all text visible on short
  screens** (the current cramped layout is the complaint):
  - **Etapas** — re-lay as a **vertical StageCard** (pulls in deferred 6.8-W1;
    `StagesEditor.tsx` `SortableStageRow`). Cadência must be fully visible.
  - **Cadência** — surfaced/legible (today it's clipped).
  - **Metas** — predictability-driven (Wave 5).
  - **Taxonomia de Origem & Canal** — make it **collapsible like the others**
    and add a plain-language explanation of its purpose.
  - **Campos do Contato** — clarify what each does.
  - **Geral** — a section for pipeline-wide setups (things configurable across
    all pipelines).
- Inline help/tooltips on unclear fields.

**Files.** `PipelineSettings.tsx`, `pipeline-settings/StagesEditor.tsx`,
`OriginTaxonomyEditor.tsx`, `ContactFieldsEditor.tsx`, `CustomFieldsEditor.tsx`.

**Definição de Premium.** A user who doesn't know the product can read every
field, knows what Origem/Canal is for, and nothing is cut off by screen height.

## Wave 5 — Predictability goals + scoreboard  *(pts 5, 8-metas)* — **core IP**

**Goal.** A "game placar" that turns a revenue target into the activity pace
needed to hit it, per salesperson and overall.

**Build.**
- **Metrics catalog** (built-in): `faturamento` (revenue), `deals_closed`,
  `conversion_rate`, `avg_ticket`, `lead_time`, `new_opportunities`,
  `proposals_sent`, `meetings`, `touchpoints`.
- **Data model.** Extend `pipelines.revenue_config` (or add a `pipeline_goals`
  table if multi-row per-owner is cleaner) to hold: per-metric target,
  `owner_id` (nullable = whole pipeline), `period` (month/quarter). Also store
  **mini-dash display prefs** (which metrics are shown/hidden) per pipeline.
- **Smart defaults.** User sets only the **headline target** (revenue or
  deals/period). Activity targets (proposals, meetings, touchpoints, required
  inbound) **auto-derive** from historical conversion rates — the
  predictable-revenue funnel math, extending `useForecast`. Everything else
  optional; nothing forced.
- **Per-owner + period** split using `assigned_to`; show per-salesperson and
  pipeline-overall.
- **Scoreboard redesign** (`PipelineScoreboard.tsx`) into the **game placar**:
  target vs current vs **projected run-rate** vs **gap**, plus leading
  indicators. **Hideable metrics** so the mini-dash stays uncluttered.
  **Kanban-only** placement (per Wave 1).

**Files.** `useForecast.ts`, `RevenueGoalsForm.tsx`, `PipelineScoreboard.tsx`,
`pipelines.revenue_config` schema / new migration, python-agent forecast
endpoint if the math lives server-side.

**Definição de Premium.** A manager sets "R$X this month," and the placar shows,
without further setup, how many proposals/meetings/touchpoints per rep that
implies and whether the current pace will get there — and they can hide the
metrics they don't care about.

## Wave 6 — Kanban + card craft  *(pts 4, 10, 11)*

**Goal.** Fix the visibly broken card and add the small clarity wins.

**Build.**
- Fix the **broken/clipped kanban card layout** (screenshot 132721 — fields cut
  off / overflow).
- **Click the lead name → open the contact** (Base de Contatos relation) from the
  card.
- Add the **"Lead Score" legend** label next to the bare number (pt 11).

**Files.** `OpportunityCard.tsx`, `OpportunityKanbanColumn.tsx`,
`LeadScoreBadge.tsx`, `OpportunityKanban.tsx` (contact open handler exists).

**Definição de Premium.** No card content is clipped; the lead name is obviously
clickable; the score reads as "Lead Score: N," not a mystery number.

## Wave 7 — Navigation flow  *(pt 9)*

**Goal.** Move through the app without dead-ends or re-clicking.

**Build.**
- Breadcrumbs + direct transitions: e.g. from pipeline-config **back to
  CRM/Kanban** without re-clicking "CRM"; back buttons where missing; preserve
  context on transition.

**Files.** `PipelineSettings.tsx`, `CRM.tsx`, `PipelineWorkspace.tsx`, shared
breadcrumb component (new).

**Definição de Premium.** From any deep config screen there's an obvious one-click
path back to where the user was.

## Wave 8 — Polish

- Fix dropped PT-BR accents in user-facing strings (`CopilotCockpit.tsx`
  "operacao", `CopilotThinkingBadge.tsx` "execucao/Historico", etc.).
- Wire the two opportunity-card "em breve" rail stubs (Agenda do card →
  agenda_events; Decisões do Copilot → ai_decisions) **if cheap**.
- Dead-code cleanup **limited to files touched this sprint**.

---

## Deferred out of 6.9 (tracked in `todo.md` "Sprint 6.9 — deferred items")

- **Excel-style tables** (pts 6, 13; 6.8-W4/W5): column drag-reorder / hide /
  inline edit / filter across Leads, Base de Contatos, Custom Tables; live-linked
  relation column.
- **Telemetry humanization + agent latency** (pt 3): streaming/perceived latency,
  further humanized agent output.
- **Sync persistence across navigation** (pts 2, 10, 12): keep the sync badge/job
  visible after navigating away/back — its own architectural pass.
- **Agenda week grid** (pt 16): Google-Calendar-style time-grid week view.

## Verification (end-of-sprint)

- `npm run build` green · `pytest` green (match 6.8: ~321 passing).
- Manual + reviewer-agent pass against each wave's *Definição de Premium*,
  not just compile-green (the explicit lesson from the 6.8 handoff: "all green"
  hid 4 correctness bugs).
- Any DB change additive + pushed via `supabase db push`; redeploy edge
  functions / python-agent if their code changed.

---

# Appendix A — Review-Cycle Remediation Plan

> **Reviewed:** 2026-06-25 · **Branch:** `claude/sprint6.9/wave1/copilot-ia`
> (12 commits, 8 waves). **Build:** `tsc --noEmit` exit 0 (compiles clean).
> **Verdict:** Waves 1/2/3/6/7/8 are solid and mergeable; **one functional bug**
> and the **two strategic waves (4 config-redesign, 5 predictability) are
> substantially under-delivered** vs. the approved plan. Do **not** merge to
> `main` as "6.9 complete" until R0–R2 are closed (R3/R4 may ship as 6.9b at
> founder's discretion).
>
> This appendix is the engineer's worklist to close the gap. Each item carries
> **evidence** (file:line), the **required fix**, and a **Definição de Premium**
> (acceptance). Same contract as the sprint: a wave is done when a non-technical
> user gets it without being told — not when it merely compiles.

## What passed review (do not re-touch)

- **W1 IA split** — `PipelineAgentView` reconciled: Automações now embeds the
  real `AgentRulesPanel` (was "Em breve"), Aprovações added, Receita&Metas → config
  shortcut, scoreboard moved into `OpportunityKanban` only. ✅
- **W1 unified feed** — `ControlRoom` agent/type filters; values verified against
  `originLabel` (`ControlRoom.tsx:52-68`). ✅
- **W2 mode mapping** — `toDisplayMode`/`toDbMode` clean 2-over-3 abstraction,
  DB enum preserved (`types/copilot.ts`). ✅ (but see R3 for the toggle wiring)
- **W6 card** — lead-name → contact drawer wired with `stopPropagation`
  (`OpportunityCard.tsx:187`), score label added. ✅
- **W7/W8** — breadcrumb, back link, PT-BR accents. ✅
- **Forecast math** — `win_rate`/`avg_velocity_days` null-guarded;
  `closed_at` confirmed real (`20260419110000_epic2_pipelines.sql:105`). ✅

---

## Round R0 — Ship-blocker hotfix (do first; ~1 file)

### R0.1 — Pipeline-config shortcut lands on the wrong pipeline  *(BUG)*
- **Evidence.** `PipelineAgentView.tsx` navigates to
  `/pipeline?selected=${pipeline.id}`, but `PipelineSettings.tsx:75-90` keeps
  selection in internal `useState(selectedId)` and auto-selects the **first**
  pipeline of the tab — it never reads any URL param. On a multi-pipeline tenant
  the button opens the wrong pipeline; the param is dead.
- **Fix.** Read the selection from the URL in `PipelineSettings`: seed
  `selectedId` from `?selected=` (use `useSearchParams`), and only fall back to
  auto-select-first when the param is absent or invalid. Keep the URL in sync
  when the user picks a different pipeline so reload/back is honest.
- **Definição de Premium.** Clicking "Abrir configuração da pipeline" from a
  pipeline's Copilot view opens **that** pipeline's config, every time, on a
  tenant with several pipelines.

---

## Round R1 — Wave 5: build the real predictability subsystem  *(headline IP)*

> **Gap.** Delivered = 2 read-only computed metrics (`win_rate`,
> `avg_velocity_days`) + 4 hideable cards (`PipelineScoreboard.tsx`,
> `useForecast.ts`). The approved Wave 5 was a goals subsystem. Build it.

### R1.1 — Goals data model
- Extend `pipelines.revenue_config` (or add a `pipeline_goals` table if per-owner
  rows are cleaner) to hold, per metric: `metric_key`, `target_value`,
  `owner_id` (nullable = whole pipeline), `period` (`month`/`quarter`).
- **Metrics catalog** (built-in): `faturamento`, `deals_closed`,
  `conversion_rate`, `avg_ticket`, `lead_time`, `new_opportunities`,
  `proposals_sent`, `meetings`, `touchpoints`.
- Migration **additive**; push via `supabase db push`.

### R1.2 — Smart defaults (the "don't make the user configure everything" rule)
- The user sets only the **headline target** (revenue or deals for the period).
- Activity targets (`proposals_sent`, `meetings`, `touchpoints`,
  `required_inbound`) **auto-derive** from historical conversion rates — extend
  `useForecast` (the existing `conversion_rates` + `sufficient_data` plumbing is
  the seed). When data is insufficient, say so (reuse the existing guard) instead
  of inventing numbers.

### R1.3 — Per-owner + per-period
- Split goals and actuals by `assigned_to` (`crm.ts:54`) and by period; show
  **per-salesperson** and **pipeline-overall**.

### R1.4 — Game-placar redesign (kanban-only)
- The scoreboard shows, for each tracked metric: **target vs current vs projected
  run-rate vs gap**, plus the leading indicators that drive it.
- **Hideable metrics** persist **per pipeline in the data model** (see R4.1), not
  only localStorage.
- **Definição de Premium.** A manager sets "R$X this month"; the placar shows —
  with no further setup — how many proposals/meetings/touchpoints per rep that
  implies and whether the current pace will hit it; metrics they don't care about
  can be hidden and stay hidden for the team.

---

## Round R2 — Wave 4: the actual pipeline-config redesign

> **Gap.** Delivered = 4 tooltips + collapse-all-by-default + back link
> (`PipelineSettings.tsx`). The founder's complaints (pt 8) — content cut off on
> short screens, cadência not fully visible, Origem/Canal confusing — are
> sidestepped, not fixed. Collapsing by default hides the problem; it doesn't
> solve the cramped layout when a section is open.

### R2.1 — Vertical StageCard
- Re-lay `StagesEditor.tsx` `SortableStageRow` as a **readable vertical card**
  per stage (pulls in deferred 6.8-W1). Nothing clipped at low screen height;
  **cadência fully visible** (today it's cut off).

### R2.2 — Taxonomia de Origem & Canal
- Make it **collapsible like the other sections** and add a plain-language
  explanation of its purpose (the founder explicitly didn't understand what it's
  for). Add the same `Info` tooltip the other four sections got.

### R2.3 — Campos do Contato — clarify
- Explain what each field does (`ContactFieldsEditor.tsx`); add inline help.

### R2.4 — "Geral" section
- Add a section for pipeline-wide setups (settings that apply across pipelines),
  per the plan.
- **Definição de Premium.** A user who doesn't know the product reads every field
  with nothing cut off, understands what Origem/Canal is for, and finds a clear
  home for cross-pipeline settings.

---

## Round R3 — Autonomy & toggle safety

### R3.1 — Master toggle must not force max autonomy  *(SAFETY)*
- **Evidence.** `AIAgentToggle.tsx:44-51` — toggle ON → `bulkSetAutonomy("autonomous")`
  (every agent to Autopilot); OFF → `"suggest"`. So enabling the feature for the
  first time silently puts all agents on Autopilot, and any `observe` (read-only)
  agent is promoted to acting.
- **Fix.** Decouple "feature enabled" from "autonomy level." The master toggle
  should enable/disable the Copilot feature **without** forcibly maxing autonomy;
  let per-agent mode be set per-agent. If a global default is desired, make ON
  default to **Copilot** (suggest), not Autopilot, and never silently downgrade an
  explicit per-agent choice.

### R3.2 — One source of truth
- **Evidence.** `equipe.is_crm_agent_enabled` and per-agent `autonomy_mode` are now
  synced imperatively from two places (`AIAgentToggle.tsx` and
  `CopilotCockpit.tsx:91-94` via `syncToggleToAgents` + `refreshEquipe`). Fragile —
  any path that updates one without the other desyncs.
- **Fix.** Define the canonical relationship in one place (a hook/util) and have
  both surfaces call it; document the mapping. Decide explicitly whether `observe`
  is retired (currently unreachable via the 2-mode UI) or preserved.

---

## Round R4 — Polish, persistence & coverage

### R4.1 — Hideable-metric prefs → data model
- **Evidence.** `PipelineScoreboard.tsx` stores hidden metrics in `localStorage`
  (`scoreboard_hidden_*`). Per-browser, not per-team.
- **Fix.** Persist per-pipeline display prefs in `revenue_config` (folds into
  R1.1) so hides are consistent for the team — unless the founder confirms
  per-user/per-browser is intended.

### R4.2 — Verify the "broken kanban" fix is real  *(UNVERIFIED)*
- **Evidence.** `OpportunityKanbanColumn.tsx` swapped Radix `ScrollArea` → `div
  overflow-y-auto`. The screenshot clipping (`Captura ...132721.png`) looked
  **horizontal** (content cut at the column edge), which a vertical-scroll swap
  may not address.
- **Fix.** Reproduce against the screenshot; confirm no card content is clipped at
  the column boundary (check column width + card `min-w`/overflow). Attach an
  after-screenshot to the handoff.

### R4.3 — Tests for the pure logic
- Add unit tests for `toDbMode`/`toDisplayMode` (`types/copilot.ts`) and the
  `win_rate` / `avg_velocity_days` derivations (`useForecast.ts`) — pure functions,
  trivially testable; exactly the coverage the 6.8 retro called for.

---

## Review-cycle exit criteria

- [ ] R0.1 fixed and manually verified on a multi-pipeline tenant.
- [ ] R1 (predictability subsystem) meets its Definição de Premium — not a
      compile-green stub.
- [ ] R2 (config redesign) meets its Definição de Premium — nothing clipped,
      Origem/Canal explained.
- [ ] R3 decoupling shipped; autonomy/enable behavior documented.
- [ ] R4 persistence + kanban visual confirmation + tests.
- [ ] `npm run build` green · `pytest` green · `tsc --noEmit` clean.
- [ ] Re-review pass (reviewer agent + manual against each Definição de Premium)
      before merge — the 6.8 lesson stands: "all green" hid 4 correctness bugs.

---

# Appendix B — Review-Cycle 2 Remediation Plan (R5)

> **Reviewed:** 2026-06-25 (2nd pass) · **Branch:** `claude/sprint6.9/wave1/copilot-ia`
> (17 commits). **Build:** `tsc --noEmit` exit 0 · `vitest` 11/11 pass (re-run
> independently). **Verdict:** Cycle-1 remediation (R0–R4) is **genuinely done** —
> big improvement. Four real gaps remain; none are crash-blockers, but **two
> contradict the stated R1 scope** and must close before this is "6.9 complete."

## What passed Cycle-2 review (do not re-touch)

- **R0.1** — `PipelineSettings.tsx:78-89` seeds `selectedId` from `?selected=` and
  syncs the URL. Wrong-pipeline bug gone. ✅
- **R3** — decoupled on **both** sides: `AIAgentToggle` no longer forces autonomy;
  `CopilotCockpit` no longer reverse-syncs the master toggle. ✅
- **R1 data model + placar** — goals in `revenue_config` JSON (`RevenueConfig` type;
  additive, no migration); scoreboard renders deals/revenue **run-rate + gap**,
  derived funnel targets, hideable metrics. Smart-default derivation real
  (`useForecast.ts:129-151`). ✅
- **R4.1** — hidden metrics persist to `revenue_config`, not just localStorage. ✅
- **R2** — StagesEditor re-laid; **cadência now visible**; Origem & Canal
  collapsible; Geral section added. ✅
- **No phantom RPC** — `fn_stage_conversion_rates` exists (migration
  `20260621002000`). ✅

---

## Round R5 — close the Cycle-1 gaps

### R5.1 — Per-owner goals: add the missing config (write) path  *(MODERATE — half-wired feature)*
- **Evidence.** `owner_goals` is read in `useForecast.ts:61` and rendered as
  "Por vendedor" (`PipelineScoreboard.tsx:431-444`), but **nothing writes it** —
  `RevenueGoalsForm.tsx` only edits `goal_deals`/`goal_revenue`/`period`. So
  `owner_goals.length` is always 0 and the per-owner split **never shows** for a
  normal user (only via raw DB edit). The R1 "per-owner" claim is not
  user-reachable today.
- **Fix.** Add an owner-goals editor to `RevenueGoalsForm` (or a sibling section):
  pick an owner (from team members / `assigned_to` candidates), set
  `target_deals` + `target_revenue`, add/remove rows; persist into
  `revenue_config.owner_goals`. Invalidate the `forecast` query on save.
- **Definição de Premium.** A manager can set a per-rep target in the UI and
  immediately see that rep appear under "Por vendedor" with their progress — no
  database editing.

### R5.2 — Revenue run-rate must use real deal values  *(MODERATE — misleading math)*
- **Evidence.** `PipelineScoreboard.tsx:138` —
  `won * (goal_revenue / goal_deals) / goal_revenue * (1/pctElapsed) * 100`
  algebraically **cancels to `won / goal_deals`**, i.e. it is identical to the
  deals run-rate. "Current revenue" (line 169) is likewise `won × avg_ticket`.
  Neither uses the actual `value` of won opportunities, so the revenue metric adds
  no real signal over the deals metric.
- **Fix.** Compute **actual won revenue** by summing `value` of won opportunities
  (extend the `useForecast` opps query to select `value`); base "current revenue"
  and the revenue run-rate on that real sum vs `goal_revenue`. Keep the
  `sufficient_data` honesty guard.
- **Definição de Premium.** Two pipelines with the same won-count but different
  deal sizes show **different** revenue progress and run-rate.

### R5.3 — Show the salesperson's name, not a UUID  *(MINOR — UX)*
- **Evidence.** `PipelineScoreboard.tsx:444` renders `og.owner_id.slice(0, 8) + "..."`.
- **Fix.** Resolve `owner_id` → team-member display name (reuse whatever maps
  `assigned_to` → profile elsewhere); fall back to the short id only if unresolved.
- **Definição de Premium.** "Por vendedor" lists real names.

### R5.4 — Make the forecast test exercise real code + fix the NaN edge  *(MINOR — false confidence)*
- **Evidence.** `useForecast.test.ts` re-implements the win_rate / velocity
  formulas **inline** and never imports `useForecast` — it tests its own
  arithmetic and would stay green if the production code broke. Separately,
  `goal_deals === 0` with `goal_revenue > 0` makes `goal_revenue / goal_deals`
  → `Infinity` → `NaN%` in the revenue run-rate.
- **Fix.** Extract the pure derivations (win_rate, velocity, run-rate, funnel
  targets) into exported helpers and have the test import and call **those**;
  add a case for `goal_deals === 0`. Guard the run-rate against `goal_deals === 0`.
- **Definição de Premium.** Breaking the production formula turns the test red; a
  revenue-only goal never renders `NaN`.

---

## Review-cycle 2 exit criteria

- [ ] R5.1 — per-owner goals settable in the UI; "Por vendedor" reachable without DB edits.
- [ ] R5.2 — revenue progress/run-rate derived from real won-deal `value`.
- [ ] R5.3 — owner names rendered, not UUIDs.
- [ ] R5.4 — forecast tests import production code; `goal_deals === 0` yields no `NaN`.
- [ ] `tsc --noEmit` clean · `vitest` green (with the new real assertions) · `vite build` green.
- [ ] Final re-review against each Definição de Premium before merge.
