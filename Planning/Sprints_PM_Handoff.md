This docs is for PMs made the Handoff of the Sprint after conclusion, in an
objective and simple way for track the progress of the Project.

# Sprint 6.8 — Handoff

> **Sprint:** The Premium Pass (`sprint_6.8_solo-copilot_evolve_v1.md`)
> **Closed:** 2026-06-24 **Branch:** `main` (committed straight to main; pushed
> to `origin/main`) **Verification:** `npm run build` green · `pytest` 321
> passed / 21 skipped / 0 failures

---

## 1. What this sprint was

A quality/correctness/redesign pass over Sprint 6.7's "Revenue Powertrain"
plumbing. 6.7 shipped capability but missed the craft bar; 6.8's contract was
that every wave meets a **Definição de Premium** (experiential acceptance), not
just "build green." Full plan + the founder's 18 raw points are in
`sprint_6.8_solo-copilot_evolve_v1.md`; design rationale in
`sprint_6.8_premium_evolve_spec.md`.

## 2. Delivered (by the engineer) — 8 waves

W1 Copilot sidebar+detail / pipeline-config sections / card 3-col · W2
note-dedup + humanized non-blocking telemetry + thinking badge · W3
LeadScoreBadge + scoreboard redesign · W4 column resize + bulk move-to-stage ·
W5 GridToolbar + query-state hook · W6 ciclo stage type + cycle pass · W7
custom-table auto-slug + inline columns/rows · W8 agenda day/week. (Commits
`5c79023`…`69853e3`.)

## 3. End-of-sprint review — found & FIXED (this handoff's work)

The "all green" summary hid **4 critical correctness bugs**; the review (2
reviewer agents + manual) caught them and they are now fixed, verified,
committed.

**`66bca08` — critical correctness:**

- **Stage enum desync** — engineer had rewritten `stage_type` to PT-BR values
  (`aberto/ganho/perdido`) but only half-propagated it; the Python agent + one
  card component still used English, breaking against the new DB CHECK.
  **Founder decision: revert to additive English values
  (`open/won/lost/ciclo`) + PT-BR labels.** Migration no longer rewrites data;
  whole Python agent + tests back to correct.
- **Cycle engine** (`cycle_pass.py`) — inserted history with non-existent
  columns → threw → **silently swallowed the webhook**. Removed the manual
  insert (DB trigger records history); webhook now awaited and fires.
- **Note de-dup** — queried `lead_activities.equipe_id` (no such column) →
  errored on real Postgres (passed on the fake test client). Now scoped by
  `lead_id` + null-guarded.
- **Forecast "2600%"** — `useForecast.ts` had no rate clamp / insufficient-data
  guard. Clamped to [0,1] + `sufficient_data` flag; scoreboard shows "dados
  insuficientes" instead of impossible numbers.

**`cba0ac5` / `c213e41` / craft in `66bca08`:**

- Card detail flipped (pt 13): Oportunidade + Notas centered, context in
  collapsible rail.
- Pipeline list (pt 15): newest-first default + Mais recentes/antigos + Canal
  filter.
- Agenda Mês view (Dia/Semana/Mês).
- Scoreboard → **Painel de Receita**; custom-table slug prompt removed (pt 16);
  chat agent removed from Copilot (pt 17); grid header LS → Score.

## 4. Deferred (NOT done — see `todo.md` "Sprint 6.8 — deferred items")

Genuine feature builds, intentionally not half-implemented:

- **W7 live-linked cross-table relation column** (pt 16 headline) — relation
  column is non-functional (no target picker).
- **W4** column drag-reorder + remove-header; extend resize/sort to Base de
  Contatos & Custom Tables (pt 8/14).
- **W5** sort/filter inside Kanban + Base de Contatos (pt 15; pipeline done).
- **W1** vertical StageCard (pt 18; config still the cramped row).
- Minor: dead-code cleanup, PT-BR accents, wire the two card "em breve" rail
  stubs.

## 5. Deploy / DB state

- **GitHub:** `origin/main` pushed.
- **Edge functions:** `analyze-message` (+ `_shared`) changed this sprint →
  deployed.
- **DB migration:** `20260623000001_sprint68_stage_engine.sql` — additive (adds
  `ciclo` to the `stage_type` CHECK + `cycle_days` / `cycle_target_stage_id` /
  `cycle_webhook_url`), no data rewrite → pushed via `supabase db push`.
- **python-agent** (FastAPI: revenue/lead-score/cycle endpoints) is **not** part
  of Supabase deploy — it runs as its own service; redeploy it wherever it's
  hosted to pick up the `cycle_pass` + dedup + lead-score changes.

## 6. Known follow-ups outside this sprint

- State persistence (full-page-reload loses input) — own architectural sprint
  (`todo.md`).
- Key rotation (`todo.md`).

---

# Sprint 6.9 — Handoff

> **Sprint:** Copilot, Clarified (`sprint_6.9_solo-copilot_evolve_v1.md`)
> **Closed:** 2026-06-25 **Branch:** `claude/sprint6.9/wave1/copilot-ia` →
> merged to `main`, pushed to `origin/main`.
> **Verification:** `vite build` green · `vitest` 17/17 pass ·
> `tsc -p tsconfig.app.json` clean **for sprint-touched files** (see §5 caveat).

## 1. What this sprint was

A focused pass on the founder's S6.8 analysis (16 points). Scoped — with the
founder — to themes **A** (Copilot/agent information architecture), **B**
(pipeline-config redesign), **C** (predictability goals + scoreboard), plus
kanban/card craft and navigation. Excel-style tables, telemetry/latency, sync
persistence, and the Agenda week-grid were **explicitly deferred to 6.10**
(`todo.md`). Same contract as 6.8: every wave meets a **Definição de Premium**,
not just "build green." Full plan + both review-cycle appendices are in
`sprint_6.9_solo-copilot_evolve_v1.md`.

## 2. Delivered (by the engineer) — 8 waves

W1 Copilot IA: two surfaces with clear roles (global unified activity/logs feed
as Copilot landing + per-pipeline agent view; `AgentRulesPanel` embedded;
"Automações Determinísticas" → "Automações"; scoreboard moved to **Kanban
only**) · W2 Autonomy collapsed to **Copilot / Autopilot** (2-mode UI over the
unchanged 3-value DB enum) · W3 Base de Contatos agent ("Treinamento" label, NL
instructions, score removed from contact table) · W4 pipeline-config redesign
(StagesEditor re-laid so **cadência is visible**, Origem & Canal collapsible +
explained, Geral section, tooltips) · W5 predictability subsystem (goals in
`revenue_config`, smart-default funnel derivation, per-owner goals, game-placar
with run-rate + gap, hideable metrics) · W6 kanban card craft (layout fix, lead
name → contact drawer, "Score" label) · W7 navigation (breadcrumbs + back links;
`?selected=` deep-link to pipeline config) · W8 polish (PT-BR accents).

## 3. End-of-sprint review — found & FIXED (3 cycles)

The first "all 8 waves complete · build green" summary again hid real gaps. It
took **three review cycles** (2 reviewer passes + manual) to reach the bar:

- **Cycle 1 (R0–R4):** R0.1 — the "Abrir configuração da pipeline" button
  navigated to `/pipeline?selected=<id>` but `PipelineSettings` never read the
  param → landed multi-pipeline tenants on the wrong pipeline (now reads
  `?selected=`). R1 — W5 had shipped as 2 read-only metrics, not the goals
  subsystem → rebuilt (data model, per-owner, derivation, game-placar). R2 — W4
  was tooltips + collapse-all, not the redesign → StagesEditor re-laid. R3 —
  master AI toggle force-set **every** agent to autonomous; decoupled both
  sides. R4 — hidden-metric prefs moved from localStorage into `revenue_config`.
- **Cycle 2 (R5):** R5.2 — the "revenue run-rate" formula algebraically
  cancelled to the deals run-rate (never used real deal values) → now sums
  actual won `value`. R5.3 — per-owner row showed a truncated UUID → resolves to
  the salesperson's name via `profiles`. R5.4 — the forecast unit test
  re-implemented the formulas inline (tested itself, not the code) → extracted
  exported helpers (`computeWinRate` / `computeAvgVelocityDays` /
  `computeRunRate`) and the test now imports them; `goal_deals === 0` no longer
  yields `NaN`.
- **Cycle 3 (R5.5, founder fix):** the per-owner goal owner field was a
  free-text **UUID box** (failed its Definição de Premium) **and** the file
  called `useQueryClient()` with the import dropped during the rewrite — a
  **runtime crash** the hollow typecheck (see §5) missed. Both fixed: real
  team-member **picker** (names, dedup-disabled) + import restored.

## 4. Deferred (NOT done — see `todo.md` "Sprint 6.9 — deferred items")

- Excel-style tables (pts 6, 13; folds 6.8 W4/W5) — reorder/hide/inline-edit/
  filter across Leads, Base de Contatos, Custom Tables + live-linked relation col.
- Telemetry humanization + agent latency (pt 3).
- Sync persistence across navigation (pts 2, 10, 12) — tied to the state-
  persistence architectural pass.
- Agenda week-grid (pt 16).

## 5. Deploy / DB state

- **GitHub:** `origin/main` pushed.
- **Frontend-only sprint.** No edge-function, migration, or python-agent changes
  (`git diff main…branch` touched only `src/**` + `Planning/**` + test tooling).
  **Nothing to `supabase db push` or `supabase functions deploy`** this sprint.
- **Goals data** lives in the existing `pipelines.revenue_config` **JSONB**
  column (`goal_deals`, `goal_revenue`, `period`, `owner_goals[]`,
  `hidden_scoreboard_metrics[]`, `conversion_overrides`) — additive, no schema
  migration required.
- **Tooling:** added `vitest` + `"test": "vitest run"` to `package.json`.

  ⚠️ **Caveat — the typecheck gate is hollow.** Root `tsconfig.json` is
  `files: []` + references-only, so `tsc --noEmit` typechecks **nothing**
  (always exit 0). The real check is `tsc -p tsconfig.app.json` / `tsc -b`, which
  surfaces a backlog of **pre-existing** type errors (`useRelationResolver`,
  `mockChatData`, `usePipelines` icp_weights, stage-type unions, etc.) that the
  Vite/SWC build does not catch. Sprint-touched files are clean; the backlog is
  logged in `todo.md`. **Wire the real typecheck into CI** so the next "green"
  is real.

## 6. Known follow-ups outside this sprint

- Per-owner goals: scoped to deals/revenue per rep; activity targets per rep and
  projection-vs-pace per rep are still pipeline-level only.
- Profiles query in the scoreboard is unscoped (`profiles` select-all, relies on
  RLS) — fine, but tighten to equipe if RLS ever loosens.
- The hollow-typecheck backlog (§5) — see `todo.md`.
