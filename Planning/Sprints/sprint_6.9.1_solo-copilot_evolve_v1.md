# Sprint 6.9.1 — Solo Copilot Evolve v1 — Premium Fix Cycle

> **Status:** Planned after founder visual review on 2026-06-25. **Parent
> sprint:** `sprint_6.9_solo-copilot_evolve_v1.md`. **Reason for this cycle:**
> Sprint 6.9 closed several functional gaps, but the founder's visual review
> shows that some core surfaces still do not meet the product bar: pipeline
> setup, goals/predictability, automations/agent UX, and Excel-style operating
> tables. This cycle is a correction pass against the original founder
> objectives, not a new feature grab bag.

## Founder Objective Recap

From the original sprint input, the intended product was not only "working CRM
features." The target experience was:

- A pipeline setup area that a non-technical manager can understand without
  explanation.
- A predictability method that feels like a **game placar** - "Pipeline
  Cockpit", not a generic dashboard.
- Agent/Copilot areas where the user clearly understands the difference between
  Copilot, Autopilot, training, rules, logs, and approvals.
- Tables that feel familiar like Excel/Supabase: edit cells, manage columns,
  filter, sort, hide, add, remove, and reorder without friction.
- Kanban cards and navigation that do not clip, confuse, or force the user into
  dead ends.
- Visual quality: clear hierarchy, no technical strings, no cramped fields, no
  hidden purpose.

## What 6.9 Achieved

Do not redo these unless touched by a higher-priority fix:

- Scoreboard is now Kanban-only in the current code path
  (`OpportunityKanban.tsx` renders `PipelineScoreboard`).
- Pipeline config reads `?selected=` and has a CRM back link.
- Contact table no longer intentionally exposes lead score through
  `DatabaseView.tsx`; however the shared `SpreadsheetGrid` still injects a score
  column by default, so this needs hardening in W4.
- Revenue config stores goals, owner goals, and hidden metrics in
  `pipelines.revenue_config`.
- `types/copilot.ts` contains the 2-mode mapping: `Copilot` -> `suggest`,
  `Autopilot` -> `autonomous`.
- Stage config has been moved toward vertical cards, and cadence is visible in
  the current screenshot.

## What Still Misses The Objective

### 1. Pipeline Setup Is Organized, But Not Yet Excellent

Evidence:

- Screenshot `Captura de tela 2026-06-24 133640.png` still reads like a dense
  admin form, not a guided setup experience.
- `PipelineSettings.tsx` splits sections, but most sections are collapsed and
  the "Geral" section only contains cadence. It does not yet feel like the
  command center for pipeline-wide setup.
- `StagesEditor.tsx` is better than before, but still has dense controls in a
  row: color, name, type, SLA, interactions, cadence, webhook, delete. This can
  still feel like a developer config screen.
- Origem & Canal and Campos do Contato are outside the selected pipeline editor
  flow. They look global but sit visually as part of the same editor, which can
  confuse the user about what applies to one pipeline vs all pipelines.

Required direction:

- Turn setup into a guided operations screen with clear groups: **Identidade**,
  **Etapas**, **Metas**, **Automações**, **Origem & Canal**, **Campos do
  Contato**, **Geral**.
- Each section must explain "why this exists" in simple business language.
- Each section must have a compact summary when closed, so collapsing does not
  hide the state of the setup.

### 2. Goals And Scoreboard Exist, But The Predictability Product Is Not There

Evidence:

- Screenshot `Captura de tela 2026-06-24 132837.png` shows a thin revenue strip:
  "Meta 0", "Inbound -", "0 ganhas · 41 em andamento · 0 perdidas", "dados
  insuficientes." This does not communicate the predictable revenue method.
- `RevenueGoalsForm.tsx` is still a compact developer form: `Meta (deals)`,
  `Meta (R$)`, `Período`, and per-vendor rows. It does not guide the manager to
  set "R$ X this month" and understand the derived activity math.
- `PipelineScoreboard.tsx` uses generic labels like `Target`, `Atual`,
  `Projetado`, `Gap` inside small cards. The math exists, but the experience
  does not yet feel like a fast executive scoreboard.

Required direction:

- Make "Metas" a setup wizard/card that starts with the manager's headline goal:
  revenue target, period, and optional owner split.
- Show derived requirements in plain Portuguese: "Para bater R$ X, você precisa
  de Y oportunidades, Z propostas, N reuniões."
- Make the Kanban scoreboard visually scannable in 5 seconds: target, current,
  projected, gap, pace status, and the next action.

### 3. Pipeline Copilot / Automations Still Has Split-Brain Risk

Evidence:

- Screenshot `Captura de tela 2026-06-24 133227.png` shows the old confusing
  state: revenue panel inside Copilot plus the agent rules page.
- Current `PipelineWorkspace.tsx` still renders `AgentRulesPanel` directly for
  `view === "agent"`, not the richer `PipelineAgentView`. That means the planned
  per-pipeline Copilot surface is not actually the pipeline sub-tab host.
- `PipelineAgentView.tsx` exists with Prompt, Automations, Autonomy, Logs,
  Approvals, and config shortcut, but it is not used in the pipeline workspace.
- `AgentRulesPanel.tsx` still contains "Hints de extração", technical warning
  copy, and automation concepts that need more business-language framing.

Required direction:

- Use one real per-pipeline Copilot surface in the pipeline sub-tab.
- The tab must show: **Treinamento**, **Modo**, **Automações**, **Logs desta
  pipeline**, **Aprovações**, and **Abrir configuração da pipeline**.
- The automations builder should read like: "Quando isto acontecer" -> "O agente
  deve fazer isto", with templates/presets.

### 4. Contact/Base And Tables Still Do Not Feel Like Excel/Supabase

Evidence:

- Original founder points 6 and 13 were deferred, but they remain core to the
  visual quality problem.
- `SpreadsheetGrid.tsx` always injects a `LeadScoreHeader` and `LeadScoreBadge`
  column into every grid, even when the caller is Base de Contatos or Custom
  Tables. This contradicts the founder point: "In base de contatos dont make
  sense have the score lead."
- `DatabaseView.tsx` has hide columns and inline edits, but no drag reorder, no
  persistent column layout, no advanced filters, and no clear spreadsheet
  toolbar.
- `CustomTableView.tsx` has a column popover and row add, but relation columns
  are still underpowered and the UI is not yet a real table builder.

Required direction:

- Shared grid must support an explicit `showLeadScore` option. Default false.
- Leads pipeline table can opt in to score. Base de Contatos and Custom Tables
  must not show it.
- Table toolbar should feel like a spreadsheet: columns, filters, sort, add
  column, add row/contact, import/export, and view state.
- Persist column order, visibility, and width per table/surface.

### 5. Kanban Card Craft Needs Visual Verification, Not Just Code Claims

Evidence:

- Screenshot `Captura de tela 2026-06-24 132721.png` shows content clipped at
  the card/column edge. The phone strip and action buttons are cramped.
- The current code has native card flags and configurable fields, but the visual
  acceptance must be screenshot-based.

Required direction:

- Verify card behavior at the same viewport as the founder screenshot.
- Cards must not clip key identity, score, timing, phone, or action buttons.
- The card should have a clear identity area, compact operational facts, and a
  clean action row.

## Sprint 6.9.1 Scope

This sprint is a **premium fix cycle** focused on visible product quality. It
does not add unrelated modules.

### In Scope

- Pipeline setup experience.
- Goals setup and game placar.
- Per-pipeline Copilot/Automations experience.
- Excel/Supabase grid foundation for Base de Contatos, Leads, and Custom Tables.
- Kanban card visual verification.
- Real verification gates: screenshot pass, `npm run build`, `npm test`, and
  real typecheck (`tsc -p tsconfig.app.json` or `tsc -b`) with known backlog
  handled explicitly.

### Out Of Scope Unless Cheap

- Full agent latency architecture.
- Full sync persistence architecture.
- Agenda Google-style week grid.
- Key rotation.
- Global dead-code cleanup outside files touched by this cycle.

## Wave 0 — Audit And Guardrails

**Goal.** Start with truth, not "green" claims.

**Build / Check.**

- Run and record:
  - `npm run build`
  - `npm test`
  - `npx tsc -p tsconfig.app.json --noEmit` or `npx tsc -b`
- Capture before screenshots for:
  - Pipeline config, Etapas open.
  - Pipeline config, Metas open.
  - Pipeline Kanban with scoreboard open.
  - Pipeline Copilot tab.
  - Base de Contatos table.
  - Custom Table view.
- If the real typecheck backlog blocks this sprint, document exactly which
  errors are pre-existing and which are caused by touched files. Touched-file
  errors are blockers.

**Files.**

- `package.json`
- `tsconfig*.json`
- `Planning/sprint_6.9.1_solo-copilot_evolve_v1.md`

**Definição de Premium.** The sprint starts with visible before/after evidence
and a real safety gate. No more "tsc clean" if the command checks nothing.

## Wave 1 — Pipeline Setup: Guided Configuration

**Goal.** Make pipeline setup understandable to a manager who does not know the
system.

**Build.**

- Redesign the right editor in `PipelineSettings.tsx` into a guided setup page:
  - Top summary: pipeline name, default status, period goal, number of stages,
    automations status, and last saved state.
  - Sections with clear summaries when closed:
    - **Identidade**: name and purpose.
    - **Etapas**: funnel stages and stage rules.
    - **Metas**: predictability targets.
    - **Automações**: shortcut to the pipeline agent's rules.
    - **Origem & Canal**: explain classification and reporting purpose.
    - **Campos do Contato**: explain enrichment/training purpose.
    - **Geral**: only truly pipeline-wide settings.
- Move global/shared sections visually into a "Configurações compartilhadas"
  band or clearly label them as shared across pipelines.
- Replace tooltip-only explanation with always-visible helper copy where the
  concept is essential.

**Files.**

- `src/pages/PipelineSettings.tsx`
- `src/components/crm/pipeline-settings/StagesEditor.tsx`
- `src/components/crm/pipeline-settings/OriginTaxonomyEditor.tsx`
- `src/components/crm/pipeline-settings/ContactFieldsEditor.tsx`
- `src/components/crm/pipeline-settings/CustomFieldsEditor.tsx`

**Definição de Premium.** A user can open pipeline config and answer: what is
this pipeline, what are the stages, what are the goals, what will the agent do,
and what data will be collected. No field feels like a mystery setting.

## Wave 2 — Stage Cards: Business-Readable, Not Dense Admin Rows

**Goal.** Finish the Etapas section to premium visual quality.

**Build.**

- Replace the dense row layout in `StagesEditor.tsx` with a readable StageCard:
  - Header: drag handle, color, stage name, stage type, active summary.
  - Operational row: SLA, max interactions, cadence, webhook status.
  - Training row: description textarea with clear "what the agent should know"
    language.
  - Advanced ciclo settings only when `stage_type === "ciclo"`, visually
    grouped.
- Make the cadence controls readable at narrow widths. No clipped labels.
- Add inline field descriptions for SLA, max interactions, cadence, and cycle.
- Keep drag reorder, create, update, delete behavior.

**Files.**

- `src/components/crm/pipeline-settings/StagesEditor.tsx`
- `src/types/pipelines.ts`

**Definição de Premium.** The Etapas section reads like a sales-process builder,
not a database row editor. At the founder screenshot size, every label and input
is visible.

## Wave 3 — Predictability Setup And Game Placar

**Goal.** Turn the math into the product promise: predictable revenue.

**Build.**

- Redesign `RevenueGoalsForm.tsx`:
  - Step 1: headline target: `Faturamento alvo`, `Negócios alvo`, `Período`.
  - Step 2: owner split with named salespeople, deals and revenue target.
  - Step 3: optional conversion overrides for when history is insufficient.
  - Preview: "Com sua taxa atual, esta meta exige..."
- Extend forecast helpers if needed so derived metrics are pure and testable:
  - required opportunities
  - required proposals
  - required meetings
  - required touchpoints
  - gap and pace status
- Redesign `PipelineScoreboard.tsx`:
  - Top line: "Meta", "Atual", "Projetado", "Gap", "Ritmo".
  - Next-action strip: "Faltam X propostas / Y reuniões para manter o ritmo."
  - Per-owner rows show real name, target, current, projected, and gap.
  - Hideable metrics remain persisted in `revenue_config`.
- Keep the scoreboard Kanban-only.

**Files.**

- `src/components/crm/revenue/RevenueGoalsForm.tsx`
- `src/components/crm/revenue/PipelineScoreboard.tsx`
- `src/hooks/useForecast.ts`
- `src/hooks/__tests__/useForecast.test.ts`
- `src/types/pipelines.ts`

**Definição de Premium.** A manager sets "R$ X this month" and immediately sees
what activity pace is required, whether the team is on pace, and what to do
next. This must be obvious without reading documentation.

## Wave 4 — Real Per-Pipeline Copilot Surface

**Goal.** Remove the split-brain between `PipelineAgentView` and
`AgentRulesPanel`.

**Build.**

- Change `PipelineWorkspace.tsx` so the `Copilot` tab hosts the full
  per-pipeline agent surface, not only `AgentRulesPanel`.
- Either:
  - wire `PipelineAgentView.tsx` into `PipelineWorkspace.tsx`, or
  - fold its useful sections into a new pipeline-hosted component.
- The final per-pipeline Copilot tab must include:
  - **Treinamento**: natural-language instructions, not "Prompt de Sistema."
  - **Modo**: Copilot / Autopilot.
  - **Automações**: rule builder.
  - **Logs desta pipeline**: filtered decisions/events.
  - **Aprovações**.
  - **Abrir configuração da pipeline**.
- Remove or rewrite technical text:
  - "Hints de extração" -> "Treinamento".
  - Technical warnings should become plain operational status text.
- Keep the revenue scoreboard out of this tab.

**Files.**

- `src/components/crm/PipelineWorkspace.tsx`
- `src/components/crm/copilot/PipelineAgentView.tsx`
- `src/components/crm/AgentRulesPanel.tsx`
- `src/components/crm/copilot/ControlRoom.tsx`
- `src/components/crm/copilot/CopilotApprovalsPanel.tsx`
- `src/hooks/useCopilotAgents.ts`

**Definição de Premium.** Opening Pipeline -> Copilot shows exactly one mental
model: "this is the agent for this pipeline." A user sees training, mode,
automations, logs, and approvals without wondering why revenue or unrelated
global controls are there.

## Wave 5 — Automations Builder: Simple Language And Presets

**Goal.** Make automations usable by a non-technical operator.

**Build.**

- Rework `AgentRulesPanel.tsx` copy and hierarchy:
  - "Quando..." and "Então..." stay, but fields must have plain examples.
  - Add starter presets:
    - Lead interessado -> mover para Qualificação.
    - Objeção de preço -> criar tarefa de follow-up.
    - Sem resposta por X horas -> adicionar touchpoint / tarefa.
    - Campo detectado -> preencher campo.
  - Rule cards collapsed by default after saving, with a readable summary:
    "Quando intenção = interessado, mover para Qualificação e criar tarefa."
- Guard against invalid rules before save:
  - empty rule name
  - no action
  - missing stage or field where required
- Save button should be sticky or always reachable in long rule lists.

**Files.**

- `src/components/crm/AgentRulesPanel.tsx`
- `src/hooks/useAgentRules.ts`
- `src/types/pipelines.ts`

**Definição de Premium.** A user can create one automation from a preset, edit
it in plain language, and understand what will happen before saving.

## Wave 6 — Excel/Supabase Grid Foundation

**Goal.** Close the founder's repeated table complaint with a real shared grid
foundation.

**Build.**

- Add explicit grid capability props to `SpreadsheetGrid.tsx`:
  - `showLeadScore?: boolean`
  - `allowColumnReorder?: boolean`
  - `allowColumnResize?: boolean`
  - `allowColumnHide?: boolean`
  - `allowColumnCreate?: boolean`
  - `surfaceKey: string` for persisted layout.
- Default `showLeadScore` to false.
- Opt in only where lead score belongs:
  - Pipeline leads table / opportunity grid if appropriate.
  - Not Base de Contatos.
  - Not Custom Tables.
- Implement persistent column layout using existing `useColumnLayout` or a
  focused replacement:
  - order
  - hidden columns
  - width
  - sort state if cheap
- Add drag reorder for column headers.
- Give `DatabaseView.tsx` a spreadsheet toolbar:
  - search
  - filters
  - columns
  - add field
  - import/export
  - refresh
- Give `CustomTableView.tsx` the same grid behavior and remove the feeling of a
  small popover-only schema editor.

**Files.**

- `src/components/crm/grid/SpreadsheetGrid.tsx`
- `src/components/crm/grid/GridToolbar.tsx`
- `src/hooks/useColumnLayout.ts`
- `src/components/crm/DatabaseView.tsx`
- `src/components/crm/OpportunityTable.tsx`
- `src/components/crm/customtables/CustomTableView.tsx`
- `src/hooks/useCustomTables.ts`

**Definição de Premium.** Base de Contatos, Leads, and Custom Tables feel like a
simple spreadsheet: manage columns, edit cells, sort/filter, and keep layout
choices after reload. Base de Contatos never shows Lead Score.

## Wave 7 — Custom Table Relation Column

**Goal.** Finish the deferred live-linked relation column instead of leaving a
fake "relation" type.

**Build.**

- When creating a relation column in `CustomTableView.tsx`, require:
  - target table
  - display field
  - relation label
- Store relation config in table schema:
  - `{ relation: { table, displayField } }`
- Map schema into `ColumnDef.relation`.
- Use existing relation UI:
  - `RelationPicker`
  - `RelationChip`
  - `useRelationResolver`
- Ensure relation writes to `custom_table_links` and displays live target data.

**Files.**

- `src/components/crm/customtables/CustomTableView.tsx`
- `src/hooks/useCustomTables.ts`
- `src/components/crm/grid/InlineCell.tsx`
- `src/components/crm/grid/RelationPicker.tsx`
- `src/components/crm/grid/RelationChip.tsx`
- `src/hooks/useRelationResolver.ts`
- `src/components/crm/grid/types.ts`

**Definição de Premium.** A user creates a relation column, picks a target
table, links a row, and sees the related record update live. No raw IDs, no dead
column.

## Wave 8 — Kanban Card Visual Verification

**Goal.** Make the kanban card fix visually real.

**Build.**

- Reproduce the founder card screenshot viewport.
- Adjust `OpportunityCard.tsx` and `OpportunityKanbanColumn.tsx` so:
  - identity never clips
  - phone strip fits
  - action buttons fit or stack cleanly
  - score label is visible only where score belongs
  - selected configurable fields do not blow out card width
- Add a max content strategy:
  - truncate with tooltip where appropriate
  - wrap where business meaning would be lost
  - avoid horizontal overflow inside the card
- Capture after screenshot and attach the path in this sprint file or handoff.

**Files.**

- `src/components/crm/OpportunityCard.tsx`
- `src/components/crm/OpportunityKanbanColumn.tsx`
- `src/components/crm/OpportunityKanban.tsx`
- `src/components/crm/LeadScoreBadge.tsx`

**Definição de Premium.** The card looks complete at the founder screenshot
size. No important card content is cut off at the column edge.

## Wave 9 — Review Loop And Handoff

**Goal.** Avoid another "junior shipped green but not premium" loop.

**Build / Check.**

- Manual pass against every wave's Definição de Premium.
- Screenshot pass:
  - before/after pipeline setup
  - before/after goals setup
  - before/after scoreboard
  - before/after pipeline Copilot
  - before/after Base de Contatos
  - before/after Custom Table relation
  - before/after Kanban card
- Verification:
  - `npm run build`
  - `npm test`
  - real typecheck command, with touched-file errors at zero
- Update:
  - `Planning/Sprints_PM_Handoff.md`
  - `Planning/todo.md` only for items genuinely deferred after this cycle.

**Definição de Premium.** The sprint closes only when the visual result matches
the founder objective, not when the code compiles.

## Execution Order

1. Wave 0 — audit and guardrails.
2. Wave 4 — wire the correct per-pipeline Copilot host, because this is a
   functional IA mismatch.
3. Wave 1 + Wave 2 — pipeline setup and stages, because this is the most visible
   setup complaint.
4. Wave 3 — goals and scoreboard, because this is core product IP.
5. Wave 6 + Wave 7 — spreadsheet/table foundation and relation column.
6. Wave 5 — automation builder polish, after the host is correct.
7. Wave 8 — kanban visual verification.
8. Wave 9 — final review/handoff.

## Explicit Non-Negotiables For The Engineer

- Do not hide confusion by collapsing everything. Closed sections need
  summaries.
- Do not use technical IDs in visible copy unless no display name exists.
- Do not claim "Base de Contatos has no score" while `SpreadsheetGrid` injects a
  score column by default.
- Do not ship a relation column that cannot select a target table and resolve
  live records.
- Do not claim a visual fix without a screenshot at the problem viewport.
- Do not use `tsc --noEmit` at repo root as proof. It is known to be hollow.
- Keep changes scoped. No broad redesign outside the CRM/Copilot/table surfaces
  in this plan.

## Sprint Exit Criteria

- [ ] Pipeline setup is guided, readable, and section summaries are clear.
- [ ] Etapas cards are readable at short-screen / narrow-width conditions.
- [ ] Metas setup guides the manager from revenue target to activity pace.
- [ ] Kanban game placar communicates target/current/projected/gap/next action.
- [ ] Pipeline Copilot tab hosts one coherent agent surface.
- [ ] Automations are understandable through plain-language rules and presets.
- [ ] Base de Contatos, Leads, and Custom Tables share spreadsheet-grade column
      behavior.
- [ ] Base de Contatos does not show Lead Score.
- [ ] Custom Table relation columns are live-linked and usable.
- [ ] Kanban cards have after-screenshot proof with no clipping.
- [ ] `npm run build` green.
- [ ] `npm test` green.
- [ ] Real typecheck run documented; touched-file type errors are zero.
- [ ] PM handoff updated with what shipped, what was verified, and what remains.
