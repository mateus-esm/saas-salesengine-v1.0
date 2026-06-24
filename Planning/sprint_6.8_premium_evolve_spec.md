# Sprint 6.8 — The Premium Pass: Making the Revenue Powertrain *Feel* Like One

> **Status:** Design spec (approved shape — pending written-spec review)
> **Input documents:** `sprint_6.7_solo-copilot_evolve_v1.md` (what was built), `sprint_6.8_solo-copilot_evolve_v1.md` (founder's raw critique, 18 points)
> **Author:** Founder + Claude (brainstorming session, 2026-06-23)

---

## 1. Why this sprint exists

Sprint 6.7 shipped the **plumbing** of the Revenue Powertrain: a shared grid, revenue math in Postgres, lifecycle, custom tables, a scoreboard, a sync sheet. It was executed task-by-task and every task passed its gate.

**It still missed the bar.** The founder tested the result and it does not feel premium, several surfaces are confusing to a non-technical client, the workflow gets blocked, and a few things are simply broken.

### Root cause

6.7's acceptance criteria were **functional, not experiential**. A task passed when `npm run build` was green and a value "persisted after refresh." Nothing in the contract said *"feels premium, a non-technical client understands it instantly, nothing blocks the workflow, the math is honest."* So the engineer shipped correct plumbing with wrong craft.

### The one structural change in 6.8

Every wave carries a **"Definição de Premium"** — explicit *experiential* acceptance criteria (look, clarity, non-blocking behavior, client-readability, honest numbers) alongside the functional ones. These are first-class pass/fail conditions, not aspirations.

**Execution model (founder decision):** build all waves straight through — **no per-wave stop-the-line review**. One consolidated review at the **end of the sprint**, against every wave's Definição de Premium. Commit per task for safety, but don't pause for sign-off between waves.

---

## 2. Scope: the 18 points, grouped

| Wave | Name | Founder points addressed |
|---|---|---|
| **W1** | Copilot Redesign (sidebar → view → boxes) + Card detail layout | 17, 18, 13 |
| **W2** | Copilot Live Experience (elegant, fast, non-blocking, readable) + note-dedup bug | 1, 2, 4 |
| **W3** | Revenue Intelligence Redesign (Lead Score 0–10 + honest scoreboard) | 5, 6, 7, 10, 12 |
| **W4** | True Excel Grid (resize / drag-reorder / add-remove inline / bulk move) | 8, 9, 14 |
| **W5** | Sort & Filter | 15 |
| **W6** | Stage Engine (Aberto / Ganho / Perdido / Ciclo + cycle timer + webhook) | 11 |
| **W7** | Custom Tables fixed (no slug prompt, inline columns/rows, cross-table copy) | 16 |
| **W8** | Agenda views (Dia / Semana / Mês) | todo.md |
| **defer** | State persistence (no full-page reloads, draft autosave) | 3 → own sprint, recorded in `todo.md` |

**Wave order = priority order**, approved by founder. W1 first because the founder flagged the Copilot redesign as "very very important."

---

## 3. Wave designs

> File paths below reference the real 6.7 codebase. Where a component must be located before editing, the plan phase will confirm the exact file; the implementer **reads the target file fully before editing** and follows its existing patterns.

### W1 — Copilot Redesign + Card detail  (points 17, 18, 13)

**Intent (founder, verbatim sense):** clicking Copilot opens a **sidebar of agents** → click one → it **opens a view** → inside the view, the options live in **their own boxes**, organized, progressive disclosure — *never everything on screen at the same time*. Elegant: open expands, close disappears.

**Design:**
- **Copilot sidebar** lists agents: **Base de Contatos**, **Pipelines** (chat agent intentionally excluded for now). Selecting *Pipelines* lists the team's pipelines.
- Selecting an agent/pipeline **opens a single detail view** (not a wall of cards). Inside, options are **separate collapsible boxes**, one expanded at a time:
  - **Prompt & Base de Conhecimento**
  - **Automações Determinísticas** (stage-gate rules)
  - **Trabalho Agêntico** (autonomous behavior config)
  - **Logs** (this agent/pipeline only)
  - **Receita & Metas** (goals — ties to W3 scoreboard)
- Replaces the scattered card/tab layout in `src/pages/CopilotCockpit.tsx` and the flat `PipelineCockpitAccordion.tsx`. The redesign is **sidebar + focused view**, not a tab strip.
- **Pipeline structure config (point 18):** a clean, organized editor for **etapas, função de cada etapa, SLA, metas, campos** — replacing the "ugly and disorganized" current form. Reachable from the pipeline workspace and from the Copilot pipeline-agent view. Each concern in its own section, generous spacing, no dense card grid.
- **Card detail layout (point 13):** restructure the opportunity/lead detail so the **center column** holds the opportunity data + notes, and a **right rail** holds **Touchpoints / Histórico / Agenda do card / Decisões do Copilot**, each collapsible. (Replaces the current top-to-bottom "Identidade Conectada → Campos personalizados → Vínculos → Notas/Tarefas" stack.)

**Definição de Premium:**
- Opening the Copilot never shows more than one agent's view at once; boxes expand/collapse smoothly; closing a box returns clean empty space.
- The pipeline config reads as organized and calm — a non-technical user can find "SLA" or "metas" without scanning a wall.
- On the card, opportunity data + notes are centered; secondary context is one glance to the right, collapsible.

**Functional:** `npm run build` green; existing copilot config (prompts, autonomy, automations) still saves and loads; card still reads/writes the same fields.

---

### W2 — Copilot Live Experience  (points 1, 2, 4)

**Intent:** the Copilot must feel **alive, fast, premium, and never block the workflow**, and its telemetry must be **readable by a non-technical client** — not raw IDs and function names. Plus a real bug: re-syncing with no new information **adds duplicate notes**.

**Design:**
- **Elegant "thinking" badge** replaces the big blocking telemetry panel in the chat/session context. A small live status pill shows the current human step ("Avaliando perfil do lead…", "Atualizando etapa…"). The client can **click to expand** into the full reasoning stream, and collapse it again. Default state is minimal.
- **Fast / streaming feedback:** stream steps as they happen over the existing SSE endpoint (`/sync/stream`); show an immediate typing/working indicator on action start so the UI never looks dead while waiting. Target: visible feedback < ~300 ms after an action begins.
- **Non-blocking everywhere:** no full-screen / layout-blocking modal during Copilot activity. The dashboard stays interactive (matches the non-blocking sheet direction from 6.7 W4, applied to the chat/session telemetry too).
- **Client-readable telemetry:** translate raw actions into PT-BR sentences. `move_stage` → "Movi este lead para Qualificação." `add_note` → "Adicionei uma nota: cliente pediu orçamento de 2000 W." **No raw IDs / function names** in the client-facing view; keep the technical log behind a "ver detalhes técnicos" toggle.
- **Note de-duplication (bug fix):** before the Copilot adds a note, it checks whether an equivalent note already exists (content hash / semantic equality within the sync window). **No new information → no new note.** A re-sync with nothing new must not append anything.

**Definição de Premium:**
- A client watching a sync sees calm, human sentences and a live pulse — feels alive, never "down," never blocked.
- The big technical panel never appears unless the user opens "detalhes técnicos."
- Sync twice with no new data → zero new notes, verified.

**Functional:** `npm run build` green; backend `pytest` green; a regression test proves the second identical sync adds no duplicate note.

---

### W3 — Revenue Intelligence Redesign  (points 5, 6, 7, 10, 12)

**Intent:** the cryptic `🎯 ICP` / `🔥 Vel` badges (faded, meaningless to founder and client) and the broken "Placar de Receita — Meta 0, Inbound 0, 2600%, 5%, 33%" must become **one clear signal** and **one honest, elegant panel**. The underlying math stays in Postgres; only the surface changes.

**Design:**
- **Lead Score 0–10:** a single numeric signal derived from the existing ICP + velocity math, normalized to **0–10**. Rendered as one calm chip/column (e.g. `Score 8`), **sortable**, with a hover/tap **breakdown** explaining the number. Remove the dual `🎯`/`🔥` emojis and the faded styling from card faces and Base de Contatos. One signal, clearly labeled "Score do Lead."
- **Scoreboard rebuild:** honest numbers only.
  - Always show: **Meta**, **Fechados** `X / Y` with a progress bar.
  - Derived metrics (**Inbound necessário**, **conversão por etapa**) appear **only when there is enough history**; otherwise render `—  dados insuficientes` instead of nonsense like `2600%`. Guard every division by a near-zero conversion rate.
  - **Rename** "Placar de Receita." Proposed (pick during plan): **Painel de Receita** / **Cockpit de Receita** / **Metas & Resultados**.
  - Elegant, on-brand (Groq/McLaren tokens), collapsible to a thin strip so it never clutters the board.

**Definição de Premium:**
- A non-technical client looks at a row and instantly understands "Score do Lead: 8/10."
- The scoreboard shows no impossible numbers; when data is thin it says so plainly.
- Card faces are calm — one signal, not two faded emojis.

**Functional:** `npm run build` green; score endpoint/RPC returns 0–10 + breakdown; scoreboard math has unit coverage for the divide-by-low-rate guard.

---

### W4 — True Excel Grid  (points 8, 9, 14)

**Intent:** the grid is not actually Excel-like. The founder wants to **resize columns, drag-reorder columns, add/remove columns directly on the table**, on **Base de Contatos, Pipeline leads, and all custom + default tables** — plus **bulk actions** including **"mover vários leads para uma etapa."**

**Design:**
- Upgrade the shared `SpreadsheetGrid` (from 6.7 W1) so **every** consuming table inherits:
  - **Column resize** by dragging the header border.
  - **Drag-reorder** columns.
  - **Add / remove columns inline** from a header menu (using the existing column-type registry).
  - **Persisted column layout** (width + order + visibility) per equipe/user — stored in DB or localStorage. *(This is a saved view preference, distinct from the deferred page-reload persistence issue.)*
- **Bulk actions** in the pipeline leads table via the existing Mass Action HUD, including **mover para etapa** (select N leads → choose target stage → batch update), plus assign owner / archive / link.
- Applies uniformly: Base de Contatos, Pipeline leads list, and every custom + default table renders through the upgraded grid.

**Definição de Premium:**
- Resizing/reordering feels native and smooth; layout survives refresh.
- Adding a column is a 2-click inline action, not a separate page.
- "Mover para etapa" on a multi-select just works and the rows visibly update.

**Functional:** `npm run build` green; column layout persists; bulk move updates all selected rows tenant-scoped.

---

### W5 — Sort & Filter  (point 15)

**Intent:** order rows by creation (asc/desc, newest on top) and **filter** by data de criação, canal, owner, etc. — on pipelines, Base de Contatos, **and inside the Kanban view**.

**Design:**
- A reusable **filter + sort bar** on each list surface and on the Kanban.
- **Sort:** by `created_at` (default newest-first option) and other sortable columns, asc/desc toggle.
- **Filters:** data de criação (range), canal, owner — extensible to more fields. Multiple filters combine (AND).
- Kanban honors the same sort/filter so cards within columns reorder/hide accordingly.

**Definição de Premium:**
- The newest leads can be brought to the top in one click.
- Filters read clearly in PT-BR and combine predictably; clearing is obvious.

**Functional:** `npm run build` green; queries tenant-scoped; sort/filter apply consistently in list and Kanban.

---

### W6 — Stage Engine  (point 11)

**Intent:** stage objective gains four types — **Aberto / Ganho / Perdido / Ciclo**. A **Ciclo** stage runs a timer: after **X days**, the lead **returns to a configurable stage** (founder picks which) and can **fire a webhook** to an external event. Fits recurring sales (nutritionist 60-day return) and cold-lead recycling.

**Design:**
- Extend the stage type model (`pipeline_stages_v2.stage_type`) to `aberto | ganho | perdido | ciclo` (additive migration).
- **Ciclo config** per stage: `cycle_days` (X), `target_stage_id` (the stage to return to — configurable, not hardcoded to stage 1), optional `webhook_url`.
- **Cycle engine:** a scheduled backend pass (sweep / scheduled function) finds leads that have been in a ciclo stage ≥ `cycle_days`, **moves them to `target_stage_id`**, restarts the cadence, and **POSTs the webhook** (lead payload) when configured. Tenant-scoped; idempotent (don't double-fire).
- Stage config UI (built in W1's pipeline config redesign) exposes type + ciclo fields cleanly.

**Definição de Premium:**
- Setting a stage to Ciclo with "60 dias → volta para Prospecção + webhook" is a clear, guided config.
- The return + webhook fire reliably and exactly once per cycle.

**Functional:** `npm run build` green; backend `pytest` green; tests cover the timer trigger, the configurable return target, and idempotent webhook fire; migration additive.

---

### W7 — Custom Tables fixed  (point 16)

**Intent:** custom tables are unusable as-is. Don't ask for a **slug** (derive it from the name). Inside the table the founder **can't create columns and rows** — must be able to. When activating a table, be able to **connect tables when creating a new column from another table** (like pipelines), and **creating that linked column copies the rows** into the new table.

**Design:**
- **No slug prompt:** auto-derive `slug` from `name` (slugify, ensure uniqueness silently).
- **Inline create columns + rows** inside `CustomTableView`, through the upgraded W4 grid (add column via header menu, add row via a "+" affordance). Persist to the custom-table schema/records.
- **Cross-table linked columns:** when adding a column, offer "vincular a outra tabela" (relation column type, made actually functional). Creating a linked column brings the related rows in **live-linked** (founder decision) — the relation is the source of truth and edits in the source table reflect through; no frozen snapshot, no stale data. The new table starts populated from the source via the live link.

**Definição de Premium:**
- Creating a custom table is name-only; columns and rows are added directly in the table, no detours.
- Linking a column to another table populates the new table without manual re-entry.

**Functional:** `npm run build` green; slug auto-derived and unique; inline column/row create persists; relation + row-copy works tenant-scoped; `custom_table_links` RLS intact.

---

### W8 — Agenda views  (todo.md)

**Intent:** the Agenda needs **Dia / Semana / Mês** views, not only a month grid.

**Design:**
- Add a **Dia / Semana / Mês** toggle to `AgendaView` (6.7 W5). Day = single-day timeline; Semana = 7-day grid; Mês = existing month grid. Reuse the existing aggregator hook; render per view. PT-BR labels.

**Definição de Premium:** switching Dia/Semana/Mês is instant and the same events render correctly in each.

**Functional:** `npm run build` green; events aggregate identically across views; tenant-scoped.

---

## 4. Deferred (out of scope, recorded in `todo.md`)

- **State persistence (point 3):** the app loses in-flight input because pages full-reload. This is an architectural pass (SPA navigation / optimistic state / draft autosave), not a patch — its **own refinement sprint**. Saved-view preferences (column layout, sort/filter) ARE in 6.8 (W4/W5) and are separate from this.

---

## 5. Global constraints (carry over from 6.7, unchanged)

- Tenant-scoped everything (`equipe_id`, RLS).
- Field-dictionary boundary — Copilot never writes an undefined field.
- Additive migrations only.
- PT-BR for all user-facing strings.
- Async non-blocking UI.
- Build gate: `npm run build` must pass (tsc alone insufficient); backend gate: `pytest` 0 new failures.
- JSONB for dynamic fields; entity links via bridge tables.
- Commit per task (conventional-commit prefixes).

## 6. Execution & review model (founder decision)

- The agent **works straight through all waves and tasks** — no stop-the-line gate per wave or per task.
- **Mid-flight checks only for critical things** (data loss risk, destructive migrations, anything irreversible) and one **light review before the end**.
- **End-of-sprint pass (the real quality gate):**
  - **Backend review** — correctness, tenant-scoping, migrations, tests (`pytest`), API contracts.
  - **Frontend refinement with a frontier model** — a dedicated polish/refinement pass evaluating every surface against its **Definição de Premium** (look, clarity, non-blocking behavior, client-readability, on-brand Groq/McLaren feel), driven by a frontier model.
- Commit frequently for safety; the end pass may loop fixes before merge.

---

*This spec is the contract for the Sprint 6.8 implementation plan. The plan phase breaks each wave into bite-sized, ordered tasks with exact file targets.*

---

## Implementation Plan — Wave 1 (Copilot Redesign + Card Detail)

### Task W1.1 — Copilot Sidebar + Detail View (L)
**Files:** `src/pages/CopilotCockpit.tsx` (rewrite), `src/components/crm/copilot/CopilotSidebar.tsx` (create), `src/components/crm/copilot/PipelineAgentView.tsx` (create)

Replace the current tab-based CopilotCockpit page with a sidebar + focused detail view layout.

**CopilotSidebar component:**
- Lists agents: **Base de Contatos**, **Pipelines**
- Base de Contatos shows config inline or navigates to its detail
- Pipelines expands to show the team's pipelines list
- Each item is clickable; selected item highlights
- Clean, elegant design — generous padding, subtle hover states

**PipelineAgentView component:**
- Opened when a pipeline is selected from the sidebar
- Shows a header with pipeline name + back button
- Content is collapsible boxes, one expanded at a time (accordion behavior):
  - **Prompt & Base de Conhecimento** — reuses/is inspired by CopilotConfigCard's system_prompt + name fields
  - **Automações Determinísticas** — placeholder for stage-gate rules (same "em breve" treatment as current code)
  - **Trabalho Agêntico** — autonomy mode config (reuse autonomy dial pattern from CopilotConfigCard)
  - **Logs** — per-pipeline ControlRoom logs (filtered by pipeline_id)
  - **Receita & Metas** — reuses RevenueGoalsForm
- Each box has a clear header with icon, collapses smoothly
- Default state: first box (Prompt) expanded, rest collapsed

**Rewritten CopilotCockpit.tsx:**
- Replace `<Tabs>` layout with sidebar + content area layout
- Left panel (sidebar) width ~260px
- Right panel = selected agent's detail view
- Remove the tab triggers (Setup/Pipelines/Treinamento/Aprovações/Logs)
- Keep feature gate, loading, and disabled states
- Base de Contatos click → shows BaseDetailView (simplified CopilotConfigCard)
- Global agents (chat copilot, base de contatos) accessible from sidebar
- Training, Approvals remain accessible via sidebar items or top-level nav

**Definição de Premium checks:**
- Opening Copilot never shows more than one agent's view at once
- Boxes expand/collapse; closing a box returns clean empty space
- `npm run build` green
- Existing copilot config (prompts, autonomy, automations) still saves and loads

### Task W1.2 — Pipeline Structure Config Redesign (M)
**Files:** `src/pages/PipelineSettings.tsx` (modify)

Redesign the pipeline config right pane to be organized and calm — each concern in its own section with generous spacing.

**Changes to PipelineSettings.tsx:**
- Restructure the right-pane pipeline editor sections:
  - **Identity** (name, description, cadence) — compact card
  - **Etapas** (stages editor) — cleaned up, use `StagesEditor` with clearer labels
  - **Função de cada etapa** — stage descriptions, visible in the stages list
  - **SLA** — per-stage SLA config (already exists, just present more cleanly)
  - **Metas** — revenue goals (revenue_config), reuse RevenueGoalsForm pattern
  - **Campos** — custom fields editor + card fields picker
- Each section gets its own Card with generous padding, clear heading
- Sections collapse/expand independently (Collapsible)
- Remove dense card grid layout; use vertical stack with spacing

**Definição de Premium checks:**
- A non-technical user can find "SLA" or "metas" without scanning a wall
- `npm run build` green

### Task W1.3 — Card Detail Layout Redesign (L)
**Files:** `src/components/crm/OpportunityDetailModal.tsx` (modify)

Restructure the opportunity/lead detail modal: center column holds opportunity data + notes; right rail holds Touchpoints/Histórico/Agenda/Decisões do Copilot.

**Changes to OpportunityDetailModal.tsx:**
- Current layout is 60/40 left/right split (timeline left, engineering right)
- New layout: 3-column grid:
  - **Left column (col-span-2):** opportunity data (stage, status, value, custom fields, Vínculos)
  - **Center column (col-span-2):** notes + tasks (current Notes/Tasks tabs)
  - **Right column (col-span-1):** right rail with collapsible sections
- Right rail sections (each Collapsible, start collapsed):
  - **Touchpoints** — current TouchpointsList (compact)
  - **Histórico** — stage history / activity log
  - **Agenda do card** — calendar events / tasks
  - **Decisões do Copilot** — AI decision log filtered for this lead
- Each section has clear icon + PT-BR label, collapsible
- Bottom footer bar stays same (delete, sync, cancel, save)

**Definição de Premium checks:**
- Opportunity data + notes are centered; secondary context is one glance to the right
- Right rail sections collapse cleanly
- `npm run build` green
- Card still reads/writes the same fields
