# Sprint 6.10 — Solo Copilot Evolve v1 — The Close-Out

> **Status:** Planned 2026-06-27. **Parent line:** `sprint_6.7` → `6.8` →
> `6.9` → `6.9.1`. **Role:** The **final sub-sprint of Sprint 6**. Its job is to
> close every remaining open thread from the whole Sprint 6 line so the
> **CRM + Solo-Copilot** vision is fully realized and Sprint 6 ends clean — no
> half-built features, no waived gates carried forward, no silent CI gate.
>
> **Contract (carried since 6.8):** a wave is **done when a non-technical user
> gets it and it is proven**, not when it merely builds green. Every wave has an
> explicit **Definição de Premium** (experiential acceptance). "Build green" is
> the floor, not the bar.

## Founder Objective Recap

Sprint 6 set out to turn the Revenue Powertrain plumbing into a product a
non-technical sales manager can run a predictable pipeline with, alongside a
Solo-Copilot the user trusts. Across 6.7–6.9.1 most of the original S6.8 16-point
analysis shipped: Copilot/agent information architecture, pipeline-config
redesign, predictability goals + game-placar scoreboard, Excel-style operating
tables, kanban/card craft, and navigation. What remains is the connective tissue
that makes the whole thing feel **reliable and fast**: nothing should be lost
when you navigate, the agent should feel responsive and speak plain Portuguese,
the agenda should match the Google-Calendar mental model, and the engineering
gate should actually catch regressions.

## What The Sprint 6 Line Already Achieved (do NOT redo)

- Copilot/agent IA: global activity/logs feed + per-pipeline `PipelineAgentView`
  (training/mode/automations/logs/approvals/config-shortcut); "Automações".
- 2-mode autonomy UI (Copilot / Autopilot) over the 3-value DB enum.
- Pipeline-config redesign: guided sections, vertical `StagesEditor` (cadence
  visible), Origem & Canal explained, Geral section, tooltips.
- Predictability: goals in `pipelines.revenue_config` (headline target + owner
  split), `PipelineScoreboard` game-placar (Meta/Atual/Projetado/Gap/Ritmo +
  next-action), kanban-only; "Projetado" is a real pace run-rate.
- Excel-style tables: shared `SpreadsheetGrid` with per-surface layout
  persistence (`useColumnLayout`/`surfaceKey`: order/hide/width), drag-reorder,
  "Colunas" menu, `GridToolbar` on Base de Contatos + Custom Tables, inline edit,
  virtual-model relation column.
- Kanban card craft (overflow fixed, lead name → contact drawer, "Score" label),
  navigation breadcrumbs + back links, Agenda Dia/Semana/Mês.

## What Sprint 6.10 Closes (the remaining open set)

Pulled from `Sprints_PM_Handoff.md` (6.8/6.9/6.9.1) and `todo.md`:

1. **State persistence** — full-page reloads lose in-flight input/edits.
   Flagged since 6.8 as its **own architectural pass**. *(anchor of this sprint)*
2. **Sync persistence across navigation** (founder pts 2, 10, 12) — CRM-sweep +
   per-card sync badge is lost on navigate-away/reload; the visual reference must
   survive and restore.
3. **Telemetry humanization** (founder pt 3a) — technical strings
   (`set_field Definindo <uuid> como …`) must become human-readable actions.
4. **Agent perceived latency** (founder pt 3b) — response time feels high;
   streaming + progress + optimistic UI (frontend-only, **no python-agent
   redeploy this sprint**).
5. **Agenda week grid** (founder pt 16) — Google-Calendar time-grid week view
   (day columns × hour rows), beyond the existing Dia/Semana/Mês.
6. **Real typecheck in CI** + **type-backlog burndown** — the current
   `tsc --noEmit` gate is hollow (`files: []`, always exit 0); 15 errors / 7
   files remain.
7. **W7 relation column re-audit** (6.9.1 founder-waived gate) + **per-owner
   predictability depth** + **scoreboard `profiles` scoping**.
8. **Cleanup & premium polish** — dead code, PT-BR accents, two "em breve" card
   rail stubs.

## Scope Decisions (founder, 2026-06-27)

- **Full close-out:** everything above lands in 6.10, including the guardrail/
  tech-debt work, so Sprint 6 ends truly clean.
- **State persistence is the anchor wave** (W1). Fixing it also fixes sync
  persistence (W2) for free — same architectural root.
- **Perceived-latency first** (W4): frontend streaming/progress/optimistic UI;
  no python-agent profiling or redeploy this sprint.
- **Waived gates → code-level re-audit only** (W7): re-audit the relation column
  against the proven `opportunity_links` pattern and document it; no live
  authenticated browser run this sprint. The gate stays *documented*, not
  *live-verified* — recorded as a fast-follow.

---

## Waves

> Order matters: W1 is the architectural spine; W2 depends on it. W3–W8 are
> largely independent and can be parallelized after W1 lands. Each wave ends with
> its **Definição de Premium** — the experiential bar a reviewer checks, not just
> "build green."

### W1 — State Persistence Foundation *(anchor / architectural)*

**Problem:** The app does full-page reloads on navigation, so any in-flight form
input, unsaved edit, or open dialog is discarded (todo "State persistence",
deferred since 6.8). This is the root cause behind several founder points (2, 10,
12) and a general trust problem.

**Direction:**
- Audit every navigation that triggers a full document reload (anchor `href`
  navigations, `window.location` assignments, form submits without
  `preventDefault`) and convert them to client-side SPA navigation (the app is
  Vite + React; route via the existing router, not `location.href`).
- Introduce a **draft-autosave** layer for forms with meaningful in-progress
  state: pipeline config, goals form, agent training/rules, card edits. Drafts
  persist to a durable store (keyed by surface + entity id) and rehydrate on
  return; an explicit save commits and clears the draft.
- Preserve open dialogs / selected entity across navigation where it makes sense
  (deep-link params already exist for pipeline config via `?selected=`).

**Files (expected):** the app router/shell; a new `useDraftState`/`useAutosave`
hook + draft store; the heavy forms (`PipelineSettings`, `RevenueGoalsForm`,
`AgentRulesPanel`, card edit surfaces). Confirm exact paths during execution.

**Definição de Premium:** Fill any field on a heavy form, navigate to another
section and back — the input is still there. No white-flash full reload occurs on
in-app navigation. Closing and reopening a half-edited form restores the draft.

### W2 — Sync Persistence Across Navigation (founder pts 2, 10, 12)

**Problem:** "Sync all CRM" and per-card sync show a working badge (same as the
chat thinking badge), but navigating away and back — or reloading — loses the
visual reference, even though the job continues in the backend.

**Direction:**
- Back the sync state with a **durable job record** (server/DB-backed job id +
  status + progress), not in-memory component state. The badge subscribes to the
  job and restores from it on mount, so it survives navigation and reload.
- Restore the per-card and global sync badge from the active job(s) on page load;
  show completion when the backend finished while the user was away.
- Reuse W1's persistence layer for the UI affordance; the job record is the
  source of truth.

**Files (expected):** the sync trigger + badge components (CRM sweep + per-card),
a sync-job hook/store, and possibly a lightweight `sync_jobs` table or reuse of
an existing job/telemetry table. **This is the one wave that may need a
migration** — flag it in the handoff if so.

**Definição de Premium:** Start "Sync all CRM", navigate to another page, come
back — the badge is still there with live progress. Reload mid-sync — the badge
restores and reflects current backend state. When the job finishes while away,
returning shows the completed result, not a blank.

### W3 — Telemetry Humanization (founder pt 3a)

**Problem:** Agent telemetry surfaces raw technical strings, e.g.
`Atualizar fa134be9-… set_field Definindo fa134be9-… como 1000`. A
non-technical user cannot read this.

**Direction:**
- Map agent actions to human-readable Portuguese: `set_field` → "Atualizar
  campo «Ticket médio» para R$ 1.000", `add_note` → "Adicionar nota", `done` →
  "Sincronização concluída". Resolve entity UUIDs to their human label (lead /
  contact / field name) where available; never show a bare UUID.
- Format timestamps in the user's local timezone; group related actions under a
  clear labeled heading per sync run.

**Files (expected):** the telemetry/activity feed renderer (`CopilotThinkingBadge`,
the activity/logs feed components) + a formatter that turns raw action records
into display strings. Confirm during execution.

**Definição de Premium:** A sync run reads as a short list of plain-Portuguese
actions a manager understands at a glance — no UUIDs, no `set_field`, no raw
field ids — with local times and grouped per run.

### W4 — Agent Perceived Latency (founder pt 3b)

**Problem:** Agent response time still feels high. (Scope: **perceived** latency
only this sprint — no python-agent changes.)

**Direction:**
- Stream agent responses token-by-token / chunk-by-chunk where the transport
  allows, so first paint is immediate instead of waiting for the full response.
- Add explicit progress/thinking indicators during processing (distinct stages
  if available: "analisando", "executando", "concluído").
- Optimistic UI for user-visible actions where safe, reconciled when the real
  result arrives.

**Files (expected):** the chat/agent response components + the data hook that
calls the agent endpoint. Frontend-only; **no python-agent redeploy.**

**Definição de Premium:** After sending a message, the user sees a response
begin (stream or staged progress) within ~1s of perceived time, with a clear
indicator that work is happening — the screen never sits frozen with no feedback.

### W5 — Agenda Week Grid (founder pt 16)

**Problem:** The existing Semana view is not the Google-Calendar mental model the
founder asked for. Wanted: a time-grid week — day columns × hour rows — with
events placed by time, "copy Google's layout."

**Direction:**
- Build a time-grid week view: 7 day columns, hour rows down the side, events
  rendered as time-positioned blocks spanning their duration; current-time
  indicator; click-empty-slot to create.
- Keep it as a view option alongside Dia/Semana/Mês (do not remove the existing
  views).

**Files (expected):** `AgendaView` + a new week-time-grid component; reuse the
existing `agenda_events` data layer. Confirm during execution.

**Definição de Premium:** The week view looks and behaves like Google Calendar's
week: events sit at their real time, span their duration across hour rows, and
the layout is immediately familiar to anyone who has used Google Calendar.

### W6 — Real Typecheck in CI + Type-Backlog Burndown *(guardrail)*

**Problem:** Root `tsconfig.json` is `files: []` + references-only, so
`tsc --noEmit` typechecks **nothing** (always exit 0). Every "tsc clean" claim so
far has been hollow — this is how the `useQueryClient` runtime crash slipped past
"build green." A backlog of 15 errors across 7 files remains.

**Direction:**
- Wire the **real** typecheck (`tsc -b` or `tsc -p tsconfig.app.json`) into the
  build/CI/verification gate so a type error fails the gate.
- Burn down the known backlog: `useRelationResolver.ts`, `mockChatData.ts`,
  `usePipelines.ts` (`icp_weights`), `usePipelineStagesV2.ts` (`cycle_*`),
  `OpportunityKanban.tsx` / `OpportunityTable.tsx` (`ColumnKind` / link union),
  `CopilotCockpit.tsx`, `useSubtasks.ts` (deep instantiation),
  `AgentRulesPanel.tsx` / `CustomFieldsEditor.tsx` (missing `ciclo` / `file`
  keys).

**Files:** `tsconfig*.json`, `package.json` scripts / CI config, plus the 7
backlog files above.

**Definição de Premium:** `npm run` typecheck (the real one) exits non-zero on a
deliberately introduced type error, and exits **0** on the current tree with the
backlog fixed. The hollow `--noEmit` path is no longer the gate.

### W7 — Relation Re-audit + Predictability Depth *(close waived gate + tech debt)*

**Problem:** (a) The 6.9.1 W7 relation column was merged founder-waived — code
matches the `opportunity_links` pattern but no live DB run was performed. (b)
Per-owner predictability is deals/revenue only; rep-level activity targets and
projection-vs-pace are pipeline-level. (c) Scoreboard `profiles` query is
unscoped (relies on RLS).

**Direction:**
- **Re-audit** the relation column code path (`RelationPicker`, the write that
  records `to_table`, the resolver reading the linked record's `data` label)
  line-by-line against the proven `opportunity_links` pattern; document the audit
  result in the handoff. *(No live browser run this sprint — code-level only.)*
- Add **rep-level activity targets** + projection-vs-pace to per-owner goals so
  the per-owner row carries the same run-rate/funnel math as the pipeline level.
- Scope the scoreboard `profiles` query to the equipe instead of select-all.

**Files (expected):** the custom-table relation files (`CustomTableView`,
`useCustomTables`, `useRelationResolver`), `RevenueGoalsForm` /
`PipelineScoreboard` / the forecast helpers, and the profiles query.

**Definição de Premium:** A written re-audit note confirms the relation
read/write/resolve path is correct against `custom_table_records` (or names the
exact defect if not). The per-owner scoreboard row shows rep-level activity
targets and pace. The profiles query is equipe-scoped.

### W8 — Cleanup & Premium Polish

**Problem:** Residual dead code, dropped accents, and two unwired card-rail stubs.

**Direction:**
- Delete dead code: `useQueryState.ts` (unused), `ResizeHandle` stub in
  `SpreadsheetGrid.tsx`, `ICPScoreBadge.tsx` / `VelocityScoreBadge.tsx` (no
  importers after the LeadScoreBadge swap) — **verify zero importers before
  deleting each.**
- Restore dropped PT-BR accents in user-facing strings (`CopilotCockpit`
  "operação", `CopilotThinkingBadge` "execução/Histórico", `AgendaView` dialog
  "Título/Reunião/Início/Observações").
- Wire the two "em breve" rail stubs on the opportunity card: **Agenda do card**
  (→ `agenda_events`) and **Decisões do Copilot** (→ `ai_decisions` feed).

**Definição de Premium:** No dead modules remain (typecheck/build confirm no
broken imports), user-facing strings carry correct accents, and both card-rail
sections show real data instead of "em breve".

---

## Deploy / DB State (expected — confirm at close)

- **W1, W3, W4, W5, W8** are expected **frontend-only** (no migration, no edge
  function, no python-agent change).
- **W2 (sync persistence)** is the one wave that **may need a migration** (a
  durable `sync_jobs`-style record) — if so, `supabase db push` and note it.
- **W6** touches `tsconfig*`, `package.json`/CI only.
- **No python-agent redeploy** is planned (W4 is perceived-latency, frontend).
- Confirm the real `tsc -b` / `tsc -p tsconfig.app.json` gate is green (not the
  hollow `--noEmit`) before declaring any wave done.

## Out Of Scope (explicit — do not pull in)

- python-agent backend latency profiling / model swap / response caching
  (deferred; W4 is perceived-latency only).
- Live authenticated browser E2E of the waived 6.9.1 gates (W7 is code-level
  re-audit only; live verification stays a fast-follow).
- Key rotation (separate security task in `todo.md`).

## Definition of Done (sprint-level)

- All 8 waves meet their Definição de Premium.
- The **real** typecheck gate (W6) is wired and green on the final tree.
- `npm run build` green · test suite green.
- Handoff written to `Sprints_PM_Handoff.md` (what shipped, deploy/DB state, any
  migration from W2, and the W7 re-audit result + remaining fast-follows).
- `todo.md` updated: closed items checked, the live-verification fast-follow and
  any genuinely-deferred item carried forward.

---

# Appendix A — Founder Raw Analysis (S6.8) + GLM Notes

> Preserved verbatim. This is the original raw input the waves above were derived
> from; kept for traceability.

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
  - Include: total pipeline value, conversion rate, average deal size, expected
    close date
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
  - Split into logical sections: Stages, Cadence, Goals, Taxonomy, Contact
    Fields
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
  - Ensure it's intuitive and familiar to user

---

# Review 1 — Deepseek

> **Reviewer:** Deepseek (PM review)
> **Date:** 2026-06-27
> **Range:** `8ec02a7..c6a13f9` (10 commits, 26 files, +2413/−634)
> **Scope:** 8 waves × Definição de Premium + sprint-level DoD
> **Evidence:** `git diff` per wave, `npm test`, `npx tsc -b`, `npm run build`

---

## Summary

| Wave | Definição de Premium | Status | Verdict |
|------|----------------------|--------|---------|
| W1 — State Persistence | Form input survives navigation; no full reload; draft restores | ✅ | **Pass** |
| W2 — Sync Persistence | Badge survives navigation & reload; restores mid-sync | ✅ | **Pass** |
| W3 — Telemetry Humanization | Plain PT-BR, no UUIDs, no `set_field`, grouped, local times | ✅ | **Pass** |
| W4 — Perceived Latency | Response begins within ~1s, clear progress indicator | ✅ | **Pass** |
| W5 — Agenda Week Grid | Google Calendar mental model: time grid, hour rows, duration blocks | ✅ | **Pass** |
| W6 — Real Typecheck | `npm run typecheck` exits 0; backlog fixed | ❌ | **Fail** |
| W7 — Relation Re-audit | Written audit note produced; per-owner run-rate; equipe-scoped query | ❌ | **Fail** |
| W8 — Cleanup & Polish | Dead code gone; accents restored; card rails show real data | ⚠️ | **Partial** |

**Sprint-level DoD:** ❌ **Not satisfied**
- `Sprints_PM_Handoff.md` — not updated
- `todo.md` — not updated
- Real typecheck gate exists but **fails** (15 errors)
- W7 re-audit note not produced
- W8 em-breve rails styled but not wired to real data

**Tests:** 5/5 files, 68/68 passing ✅
**Build:** `npm run build` green ✅
**Typecheck (`npx tsc -b`):** EXIT 2 — **15 errors remain** ❌

---

## Wave-by-Wave Review

### W1 — State Persistence Foundation ✅

**What shipped:**
- `useDraftAutosave` hook (`src/hooks/useDraftAutosave.ts`, +83 lines) — localStorage-backed, keyed by surface+entity
- RevenueGoalsForm fully wired via hook; PipelineSettings + AgentRulesPanel have equivalent ad-hoc draft logic inline

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| W1-1 | Important | PipelineSettings e AgentRulesPanel **não usam `useDraftAutosave`** — lógica ad-hoc inline (useEffect + localStorage manual) em vez do hook compartilhado | `PipelineSettings.tsx:294-330`, `AgentRulesPanel.tsx:840-875` |
| W1-2 | Minor | `isDirty` usa `JSON.stringify` para comparação — sensível à ordem de campos | `useDraftAutosave.ts:47` |

**Verdict:** Definição de Premium atendida. Inconsistência de uso do hook é tech debt, não blocker.

---

### W2 — Sync Persistence Across Navigation ✅

**What shipped:**
- `useSyncJobPersistence` hook (+149 lines, test +202 lines)
- `useCopilotSync` e `useCopilotSweep` refatorados com job persistence
- SyncButton + CopilotThinkingBadge restauram badge do estado persistido no mount

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| W2-1 | Important | **Vazamento de subscription Realtime** no `useCopilotSweep`: `useEffect` com `[runId]` como dependência — cleanup não roda no unmount. Subscription vaza se SyncButton desmontar com sweep ativo. | `useCopilotSync.ts:100-108` |
| W2-2 | Minor | Decisão localStorage-only (sem migration) não documentada no handoff | — |

**Verdict:** Definição de Premium atendida. Subscription leak é preocupante mas não quebra a feature.

---

### W3 — Telemetry Humanization ✅

**What shipped:**
- `humanizeEvent.ts` (+204 lines) + `humanizeEvent.test.ts` (+330 lines)
- TelemetryHUD refatorado: `groupedItems`/`itemFor`, timestamps locale, UUIDs removidos
- Fix commit `46cf399` corrigiu bleed da flag `g` na regex `UUID_RE` + React keys estáveis

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| W3-1 | Minor | `action_start` expõe nome interno: `"Analisando move_stage..."` — ideal: `"Analisando movimentação de lead..."`. Impacto baixo (eventos transitórios) | `humanizeEvent.ts` |

**Verdict:** Definição de Premium atendida. Nenhum UUID ou `set_field` visível. Fix commit mostra disciplina de revisão.

---

### W4 — Agent Perceived Latency ✅

**What shipped:**
- TelemetryHUD com auto-open em 1s quando `running` inicia
- CopilotThinkingBadge com `prevRunningRef` para transição running→done
- SyncButton com optimistic running state + auto-open HUD

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| W4-1 | Minor | `hasDoneEvent` (`running && !hasDoneEvent`) pode mascarar race condition se `done` chegar antes de `running=false`. Funciona com React 18 batching, mas frágil. | `CopilotThinkingBadge.tsx:52-55` |
| W4-2 | Minor | Timer 1s não cancelado se `running` toggle rápido (start→stop→start em <1s) | `SyncButton.tsx:62-84` |

**Verdict:** Definição de Premium atendida. HUD abre automaticamente, feedback visual imediato.

---

### W5 — Agenda Week Grid ✅

**What shipped:**
- Google Calendar-style time grid: 7 colunas × 24 linhas, blocos posicionados por `getEventStyle`, indicador "agora", click vazio cria evento, scroll-to-6am
- View options intactas (Dia/Semana/Mês)

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| W5-1 | Minor | `getEventStyle` não trata eventos multi-dia ou que cruzam meia-noite — altura negativa → `max(neg, 1.5)` = 1.5% no topo | `AgendaView.tsx:26-32` |
| W5-2 | Minor | Round-trip UTC↔local time no dialog de criação pode ser lossy em DST | `AgendaView.tsx:78,380` |

**Verdict:** Definição de Premium atendida. Layout fiel ao Google Calendar.

---

### W6 — Real Typecheck in CI ❌

**What shipped:**
- `.github/workflows/ci.yml` ganhou step `npx tsc -b` antes do build (+2 lines)

**O que NÃO foi entregue:**
- ❌ **Backlog de 15 erros não foi queimado** — `npx tsc -b` exit code 2
  - `SyncButton.tsx` — 2× TS2448 (`running` used before declaration)
  - `OpportunityKanban.tsx` — 2× TS2352 (cast `Opportunity` → `Record<string, unknown>`)
  - `usePipelines.ts` — TS2741 (`icp_weights` missing)
  - `usePipelineStagesV2.ts` — TS2739 (`cycle_*` missing)
  - `useRelationResolver.ts` — 6× TS2352/TS2339 (Supabase query errors)
  - `useSubtasks.ts` — TS2589 (deep instantiation)
  - `CopilotCockpit.tsx` — TS2322 (type assignability)
- ❌ Nenhum script `typecheck` em `package.json`
- ❌ Definição de Premium não atingida — `tsc -b` falha na árvore atual
- ❌ CI vai falhar no push/PR

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| W6-1 | **Critical** | `npx tsc -b` exit 2 — 15 erros. Backlog não queimado. CI gate vai falhar. | 7 arquivos |
| W6-2 | **Critical** | Nenhum script `typecheck` em `package.json` | `package.json` |
| W6-3 | Minor | W6 alterou **apenas** CI (2 linhas). Nenhum dos 7 arquivos do backlog foi tocado. | `.github/workflows/ci.yml` |

**Verdict:** Definição de Premium **não atendida.** Metade da wave foi feita (gate adicionado), backlog não queimado.

---

### W7 — Relation Re-audit + Predictability Depth ❌

**What shipped:**
- `PipelineScoreboard.tsx` — per-owner run-rate
- `RevenueGoalsForm.tsx` — rep-level activity targets
- Profiles query escopada por equipe

**O que NÃO foi entregue:**
- ❌ **Nota de re-audit não produzida** — nenhum diff nos arquivos de relação (`CustomTableView`, `useCustomTables`, `useRelationResolver`)
- ❌ `Sprints_PM_Handoff.md` não atualizado com resultado do audit
- ❌ Gate waived do 6.9.1 permanece sem verificação documentada

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| W7-1 | **Critical** | Nota de re-audit não produzida. Nenhum arquivo de relação tocado neste sprint. Deliverable contratado não entregue. | `CustomTableView.tsx`, `useCustomTables.ts`, `useRelationResolver.ts` |
| W7-2 | Important | Per-owner `computeRunRate` usa `elapsed`/`total` do escopo do pipeline — se houver seção per-owner separada, quebra silenciosamente | `PipelineScoreboard.tsx:336-338` |

**Verdict:** Definição de Premium **não atendida.** Re-audit escrito era o deliverable central.

---

### W8 — Cleanup & Premium Polish ⚠️

**What shipped:**
- Dead code removido: `useQueryState.ts` (135), `mockChatData.ts` (254), `ProtectedByRole.tsx` (59) — sem importadores quebrados
- Acertos PT-BR: `CopilotCockpit`, `CopilotThinkingBadge`, `AgendaView`
- Em-breve card rails estilizados (borda tracejada + Clock)

**O que NÃO foi entregue:**
- ❌ **Rails NÃO conectados a dados reais.** Plano: *"Wire ... Agenda do card (→ agenda_events) e Decisões do Copilot (→ ai_decisions feed)"*. Definição de Premium: *"both card-rail sections show real data instead of 'em breve'."* Entregue: versão estilizada do "Em breve".

**Findings:**

| # | Severity | Finding | File:Line |
|---|----------|---------|-----------|
| W8-1 | **Critical** | Rails estilizados mas não wireados a dados reais. Ainda mostram "Em breve". Feature gap vs. plano. | `OpportunityDetailModal.tsx:392-407` |
| W8-2 | Minor | Import `Clock` de `lucide-react` só usado nos stubs — dead code potencial | `OpportunityDetailModal.tsx` |

**Verdict:** Definição de Premium **não atendida.** Dead code e acentos corretos, mas deliverable principal não feito.

---

## Sprint-Level Definition of Done

| Item | Status | Evidência |
|------|--------|-----------|
| 8 waves atendem Definição de Premium | ❌ | W6, W7, W8 falham |
| Real typecheck gate verde na árvore final | ❌ | `npx tsc -b` exit 2, 15 erros |
| `npm run build` green | ✅ | Confirmado |
| Test suite green (68/68) | ✅ | 5/5 files, 68 passed |
| Handoff em `Sprints_PM_Handoff.md` | ❌ | Não modificado no sprint |
| `todo.md` atualizado | ❌ | Não modificado no sprint |

---

## Issues Consolidados por Severidade

### Critical (Must Fix, 4)

| # | Wave | Issue |
|---|------|-------|
| C1 | W6 | `npx tsc -b` exit 2 — 15 erros de tipo não queimados. CI vai falhar no merge |
| C2 | W6 | Nenhum script `typecheck` em `package.json` |
| C3 | W7 | Nota de re-audit não produzida — deliverable contratado não entregue |
| C4 | W8 | Rails "Em breve" estilizados mas não wireados a dados reais |

### Important (Should Fix, 3)

| # | Wave | Issue |
|---|------|-------|
| I1 | W1 | PipelineSettings e AgentRulesPanel usam lógica ad-hoc em vez do hook `useDraftAutosave` |
| I2 | W2 | Subscription Realtime vaza no unmount do `useCopilotSweep` |
| I3 | All | `Sprints_PM_Handoff.md` e `todo.md` não atualizados |

### Minor (Nice to Have, 5)

| # | Wave | Issue |
|---|------|-------|
| M1 | W3 | `action_start` expõe nome interno `move_stage` |
| M2 | W4 | `hasDoneEvent` pode mascarar race condition |
| M3 | W4 | Timer 1s não cancelado em toggle rápido |
| M4 | W5 | `getEventStyle` não trata eventos multi-dia |
| M5 | W5 | Round-trip UTC↔local time lossy em DST |

---

## Recomendações

1. **W6 — Queimar backlog de tipos.** 15 erros conhecidos e mapeados. Correção cirúrgica em cada arquivo.
2. **W6 — Adicionar `"typecheck": "tsc -b"` ao `package.json`.** Uma linha, zero risco.
3. **W7 — Produzir nota de re-audit.** Documentar em `Sprints_PM_Handoff.md` o resultado da revisão de código do `RelationPicker`/`useRelationResolver` contra `opportunity_links`.
4. **W8 — Wirear rails a dados reais.** Conectar "Agenda do card" a `agenda_events` e "Decisões do Copilot" a `ai_decisions`.
5. **W2 — Corrigir vazamento de subscription.** Adicionar `useEffect` cleanup no unmount em `useCopilotSweep`.
6. **W1 — Unificar uso do hook.** Refatorar `PipelineSettings` e `AgentRulesPanel` para `useDraftAutosave`.
7. **Atualizar handoff e todo.md.** Fechar o sprint corretamente.

---

## Assessment Final

**Ready to merge?** **No** — 4 Critical issues impedem o merge.

**Reasoning:** Implementação tem qualidade sólida — arquitetura limpa, 68/68 testes, hooks bem isolados, revisão iterativa com fix commits. Porém, três waves não atingiram Definição de Premium: W6 (typecheck quebrado, 15 erros), W7 (re-audit não produzido), W8 (rails em-breve não wireados). O gate de CI (`npx tsc -b`) falharia no merge, tornando o branch não integrável. Documentação de handoff não atualizada. Recomenda-se corrigir os 4 Criticals antes do merge, seguidos dos Importants como fast-follow.

---

# Review 1 — Claude (cross-check)

> **Reviewer:** Claude (independent cross-check of Deepseek's Review 1)
> **Date:** 2026-06-27
> **Method:** Re-ran the hard claims directly — `tsc -p tsconfig.app.json --noEmit`,
> read the changed files, located the rail data hooks. Not a re-review of every
> wave; a verification pass over the criticals + a search for anything Review 1
> under-weighted.

**Deepseek's 4 Criticals — all CONFIRMED:**

- **C1 (W6) — typecheck red:** reproduced. `tsc -p tsconfig.app.json --noEmit`
  exits **2** with **14** `error TS` lines across the 7 files Deepseek listed
  (count is 14, not 15 — one already resolved; the gap is immaterial).
- **C2 (W6) — no `typecheck` script:** confirmed. `package.json` `scripts` has
  `dev/build/build:dev/lint/preview/test` only — no typecheck entry.
- **C3 (W7) — re-audit note absent:** confirmed. No diff touched
  `useRelationResolver` / `CustomTableView` / `useCustomTables`; no audit text in
  the handoff.
- **C4 (W8) — rails not wired:** confirmed at `OpportunityDetailModal.tsx:381-410`
  — both rails still render `<span>Em breve</span>`. The data hooks already exist
  (`useAgendaEvents`, `useCopilotDecisions`), so this is wiring, not new plumbing.

**ELEVATION — one finding Review 1 under-classified (NEW):**

- **🔴 CRITICAL (was filed as W6 type-debt):** `SyncButton.tsx` — `const running`
  (also `events`, `error`) is **declared at line 90 but referenced in two
  `useEffect` dependency arrays at lines 77 and 87**, which are evaluated *during
  render, before* line 90. This is a `const` **temporal-dead-zone →
  `ReferenceError: Cannot access 'running' before initialization` on every render
  of `SyncButton`** — a guaranteed runtime crash, not a cosmetic type warning.
  Deepseek logged the two `TS2448`s under the W6 backlog and **passed W2/W4**, but
  this code is **W4's auto-open-HUD** and the crash makes the sync button
  unrenderable. The build is green only because SWC strips types (no TDZ check)
  and no test renders `SyncButton`. **This must be fixed first and is the
  strongest argument that the W6 gate is non-negotiable** — the hollow gate is
  exactly what let a render-crash ship "green."

**Net:** I concur with **"Not ready to merge."** The fix set is the 4 Criticals
(with C1 re-scoped to lead with the SyncButton crash), then the 3 Importants. Plan
below.

---

# Fixes 1

> **Source:** Review 1 (Deepseek) + Claude cross-check above.
> **Branch:** continue on `claude/sprint6.10/W1/state-persistence` (the 6.10 work
> branch). **Goal:** clear all 4 Criticals + 3 Importants so the branch is
> mergeable and the real CI gate is green. Minors are listed as fast-follow.
> **Gate for "Fixes 1 done":** `npm run typecheck` (new) exits **0**,
> `npm run build` green, `npm test` 68/68, handoff + todo updated.

**Fix order (dependency-aware):** F1 → F2 (F2 verifies F1) → F4 → F5 → F6 → F3 → F7.

---

### F1 — Burn the type backlog + fix the SyncButton render-crash *(C1 + elevation)*

Fix all 14 `tsc` errors. **Start with SyncButton** — it is a runtime crash, not
just a type error.

- [ ] **SyncButton.tsx (the crash)** — move the three derived `const` lines
      (`events`, `running`, `error`, currently ~lines 89-91) to **above** the two
      `useEffect` blocks that depend on `running` (above ~line 67). Re-run to
      confirm the `TS2448`×2 are gone. This resolves the TDZ crash and the type
      errors together.
- [ ] **OpportunityKanban.tsx:203-204** (`TS2352`×2, `Opportunity` →
      `Record<string, unknown>`) — cast through `unknown` first:
      `... as unknown as Record<string, unknown>`.
- [ ] **usePipelines.ts:35** (`TS2741`, `icp_weights` missing) — include
      `icp_weights: (data as any).icp_weights ?? {}` in the normalized row (or
      make `icp_weights` optional on the `Pipeline` type — pick one and apply
      consistently).
- [ ] **usePipelineStagesV2.ts:36** (`TS2739`, `cycle_*` missing) — include
      `cycle_days`, `cycle_target_stage_id`, `cycle_webhook_url` (default `null`)
      in the mapped stage row.
- [ ] **useRelationResolver.ts:55,64,87,88** (`TS2352`/`TS2339`×6, Supabase
      `SelectQueryError` union) — cast each query result through `unknown` first,
      e.g. `(data ?? []) as unknown as { linked_id: string }[]`. **Note:** these
      are the same relation files the W7 re-audit (F3) covers — do the audit while
      you are in here.
- [ ] **useSubtasks.ts:24** (`TS2589`, excessively deep) — break the inferred
      chain with an explicit result annotation / `as` cast on the query builder
      so TS stops recursing.
- [ ] **CopilotCockpit.tsx:153** (`TS2322`, `scope` union not assignable) — narrow
      the agent object to `Partial<CopilotAgent> & { scope: "pipeline"; pipeline_id: string }`
      (assert `scope: "pipeline"` at the call site) before passing it.

**Acceptance:** `tsc -p tsconfig.app.json --noEmit` exits **0**; `SyncButton`
renders without throwing.

### F2 — Add the `typecheck` script *(C2)*

- [ ] Add to `package.json` `scripts`: `"typecheck": "tsc -b"`.
- [ ] Confirm the CI step added in W6 (`.github/workflows/ci.yml`) calls it (or
      `tsc -b` directly) **before** build.

**Acceptance:** `npm run typecheck` exists and exits **0** after F1.

### F4 — Wire the card rails to real data *(C4)*

`OpportunityDetailModal.tsx:381-410`. The hooks exist.

- [ ] **Agenda do card** — call `useAgendaEvents()` and filter by the card's
      `lead_id` (`events.filter(e => e.lead_id === leadId)`); render the list
      (title + time). Empty → "Sem agendamentos", **not** "Em breve".
- [ ] **Decisões do Copilot** — call `useCopilotDecisions({ pipelineId })` and
      filter by `opportunity_id` (fall back to `lead_id`); render recent decisions.
      Empty → "Sem decisões recentes".
- [ ] Remove the now-unused `Clock` import if it was only the stub (W8-2).

**Acceptance:** both rails show real rows when data exists and a real empty state
otherwise; no "Em breve" string remains.

### F5 — Unify draft logic on `useDraftAutosave` *(I1)*

- [ ] Refactor `PipelineSettings.tsx` (`PipelineEditor`) and `AgentRulesPanel.tsx`
      to consume `useDraftAutosave` instead of the inline `useEffect` +
      `localStorage` blocks (mirror the `RevenueGoalsForm` pattern).
- [ ] While here, fix the **AgentRulesPanel post-save staleness** (Claude's W1
      note): after `commit()`/save, a later DB refetch should be able to reseed —
      don't leave a permanent `restoredDraft` ref blocking the seed effect for the
      component's life.

**Acceptance:** all three heavy forms use the single hook; navigate-away-and-back
still restores drafts; after save, a fresh DB value can seed again.

### F6 — Fix the Realtime subscription leak *(I2)*

- [ ] `useCopilotSync.ts:100-108` (`useCopilotSweep`) — the subscription
      `useEffect` keyed on `[runId]` doesn't clean up on unmount. Ensure the
      cleanup (`supabase.removeChannel(...)`) runs on unmount, not only on `runId`
      change.

**Acceptance:** unmounting `SyncButton` mid-sweep removes the channel (no leaked
subscription).

### F3 — Produce the W7 relation re-audit note *(C3)*

The contracted deliverable was a **written** audit (code-level only, per scope).

- [ ] Re-audit `RelationPicker` (write path: records `to_table` / `to_id` /
      `linked_id`) and `useRelationResolver` (read path against
      `custom_table_records`) line-by-line against the proven `opportunity_links`
      pattern. F1 already touches `useRelationResolver`.
- [ ] Write the result into `Sprints_PM_Handoff.md` (Sprint 6.10 entry): either
      "matches the proven pattern, correct" or the exact defect found. Note it
      stays **code-level verified, not live-verified** (live E2E remains the
      documented fast-follow).

**Acceptance:** an audit paragraph exists in the handoff with a clear verdict.

### F7 — Close the sprint docs *(I3)*

- [ ] Add the **Sprint 6.10 handoff** to `Sprints_PM_Handoff.md` (what shipped per
      wave, deploy/DB state — note W2 chose **localStorage-only, no migration**
      (W2-2), the F3 audit verdict, and remaining fast-follows).
- [ ] Update `todo.md`: check the closed 6.10 items; carry forward the live W7 E2E
      verification and any genuinely-deferred minor.

**Acceptance:** both docs reflect the post-Fixes-1 reality.

---

## Minors — fast-follow (not blocking merge)

Fix opportunistically while touching the relevant file; otherwise carry to todo.

- **M1 (W3):** `humanizeEvent.ts` `action_start` exposes internal `move_stage` →
  map to "movimentação de lead".
- **M2 (W4):** `CopilotThinkingBadge.tsx:52-55` `hasDoneEvent` race — fragile but
  works under React 18 batching.
- **M3 (W4):** `SyncButton.tsx` 1s auto-open timer not cancelled on fast
  start→stop→start toggle.
- **M4 (W5):** `AgendaView.tsx:26-32` `getEventStyle` doesn't handle multi-day /
  cross-midnight events.
- **M5 (W5):** `AgendaView.tsx:78,380` UTC↔local round-trip may be lossy under DST.
- **(W1-2):** `useDraftAutosave.ts` `isDirty` uses `JSON.stringify` (field-order
  sensitive).
- **(W7-2):** `PipelineScoreboard.tsx:336-338` per-owner `computeRunRate` reuses
  pipeline-scope `elapsed`/`total` — verify it's correct for the per-owner row.

## Fixes 1 — Definition of Done

- [ ] `npm run typecheck` exits **0** (was exit 2 / 14 errors).
- [ ] `SyncButton` renders without `ReferenceError`.
- [ ] No "Em breve" string in `OpportunityDetailModal` rails.
- [ ] `npm run build` green · `npm test` 68/68.
- [ ] All three heavy forms on `useDraftAutosave`; sweep subscription cleaned up.
- [ ] W7 audit note + Sprint 6.10 handoff + `todo.md` updated.
- [ ] Re-review (Review 2) clears the 4 Criticals and 3 Importants.
