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

---

# Sprint 6.9.1 — Handoff

> **Sprint:** Solo Copilot Evolve — Premium Fix Cycle
> (`sprint_6.9.1_solo-copilot_evolve_v1.md`)
> **Closed:** 2026-06-26 **Branch:** `engineer/sprint6.9.1/wave4/per-pipeline-copilot`
> → merged (fast-forward) to `main`, pushed to `origin/main`. Founder explicitly
> **waived the screenshot/live-verification gates** (§4) for this merge — they are
> deferred, not satisfied.
> **Verification:** `npm run build` green · `npm test` 27/27 green ·
> `tsc -p tsconfig.app.json` touched-file errors = **0** (only the known
> pre-existing backlog of 15 errors across 7 untouched files remains;
> `useRelationResolver` went 7→6).

## 1. What this sprint was

A correction pass against the original founder objectives after a visual review:
pipeline setup, predictability scoreboard, per-pipeline Copilot, Excel-style
tables, and kanban card craft were "working" but not yet premium. Contract:
a wave is done when a non-technical user gets it, not when it merely compiles.

## 2. Delivered — 8 build waves + final-review remediation

- **W1/W2** (`56f9b5a`) — guided `PipelineSettings` sections + readable vertical
  `StagesEditor` cards (cadence visible).
- **W3** (`23902a1`, hardened in `cd95fd5`) — `RevenueGoalsForm` headline-target
  flow + owner split; `PipelineScoreboard` game-placar (Meta/Atual/Projetado/Gap/
  Ritmo + next-action), kanban-only. "Projetado" is now a real pace run-rate
  (`computeRunRate`, unit-tested), not current attainment.
- **W4** (`a9a8fbf`) — pipeline `Copilot` sub-tab now hosts the full
  `PipelineAgentView` (training/mode/automations/logs/approvals/config-shortcut);
  scoreboard excluded from this tab.
- **W5** (`e16591b`) — `AgentRulesPanel` plain-language Quando/Então rules +
  starter presets + pre-save validation + readable collapsed summaries.
- **W6** (`4ef0080` props → **`1bb8959`+`627e456` wired this cycle**) — shared
  `SpreadsheetGrid` now has REAL per-surface layout persistence via
  `useColumnLayout`+`surfaceKey` (order/hide/width), column drag-reorder, a
  "Colunas" hide/show menu, and `GridToolbar` on Base de Contatos + Custom
  Tables. Base de Contatos and Custom Tables never show Lead Score
  (`showLeadScore` defaults false; only the opportunity grid opts in).
- **W7** (`ceb4703` → **reworked in `cd95fd5`**) — custom-table relation column.
  The first pass was non-functional (assumed physical tables, used a non-existent
  `.execute()`); it was rebuilt for the **virtual** model: `RelationPicker` reads
  `custom_table_records WHERE table_id = target`, the write awaits the builder and
  records `to_table`, and resolution reads the linked record's `data` label.
- **W8** (`ceb4703`) — `OpportunityCard` overflow/clipping fixes (`overflow-hidden`,
  score hidden when null). **Visual proof still outstanding — see §4.**

## 3. End-of-sprint review — found & FIXED (this handoff's work)

A whole-branch review (`c44f21c..627e456`, capable-model reviewer + manual) found
the prior "all waves complete" ledger was partly hollow:

- **CRITICAL — W7 relation column dead end-to-end.** Picker queried a non-existent
  physical table, the write called `.execute()` (not in supabase-js v2), and the
  resolver grouped by an unwritten `to_table`. Rebuilt against
  `custom_table_records` (`cd95fd5`).
- **IMPORTANT — W6 reorder corrupted order when a column was hidden** (visible
  index vs. absolute order-array index). Fixed with `translateVisibleToAbsolute`
  (unit-tested) (`cd95fd5`). A separate first-reorder bug (base order seeded from
  `[]`) was fixed earlier in `627e456`.
- **IMPORTANT — W3 "Projetado" mislabeled** (showed current %, not a projection).
  Now pace-based (`cd95fd5`).
- **MINOR** — dead scoreboard `pace` fields, "Prompt de Sistema" label under the
  "Treinamento" accordion, dead `stagesCount`. Cleaned.

## 4. Deferred (founder-waived for this merge) — needs an authenticated app session

The founder chose to merge without these on 2026-06-26. They remain **unverified**,
not done — track them as a fast follow. Each needs a running, logged-in Supabase
session:

- **W8 kanban after-screenshot** at the founder viewport (`Captura ...132721`).
- **W9 before/after screenshot set** (pipeline setup, goals, scoreboard, Copilot,
  Base de Contatos, Custom Table relation, kanban card).
- **W7 live E2E**: confirm picking a target custom table, linking a row, and the
  chip resolving live against `custom_table_records`. The code matches the proven
  `opportunity_links` pattern, but no live DB run was performed.

## 5. Deploy / DB state

- **Frontend-only.** Branch touched only `Planning/` + `src/` — **no migrations,
  no edge functions, no python-agent changes**, so **nothing to `supabase db push`
  or `supabase functions deploy`** this sprint. Relation links reuse the existing
  `custom_table_links` table (migration `20260621001000`).
- **Caveat (carried from 6.9):** root `tsc --noEmit` is hollow — always use
  `tsc -p tsconfig.app.json`. Touched files are clean; the pre-existing backlog
  (15 errors / 7 files: `useRelationResolver`, `mockChatData`, `OpportunityKanban`,
  `CopilotCockpit`, `useSubtasks`, `usePipelineStagesV2`, `usePipelines`) is
  unchanged and logged in `todo.md`.
- **Merged to `main`** (fast-forward) and pushed on 2026-06-26.
- Commits this cycle: `a9a8fbf` → `bb45202` (+ this doc update).

---

# Sprint 6.10 — Handoff

> **Sprint:** Solo Copilot Evolve v1 — The Close-Out
> (`sprint_6.10_solo-copilot_evolve_v1.md`) — the **final sub-sprint of Sprint 6**.
> **Closed:** 2026-06-28 **Branch:** `claude/sprint6.10/W1/state-persistence`
> (not yet merged to `main` at time of writing — see §5).
> **Verification (final tree):** `tsc -b` (the REAL gate) exits **0** ·
> `vitest` **70/70** · `vite build` green.
> ⚠️ Run vitest with `--no-file-parallelism` in this environment — the default
> worker pool times out (infra, not test failures).

## 1. What this sprint was

The close-out pass for Sprint 6: take the remaining deferred founder points and
tech-debt and finish them so the CRM + Solo-Copilot vision is whole and Sprint 6
ends clean. Scope (founder, 2026-06-27): **full close-out**, with **state
persistence as the anchor wave**, **perceived-latency only** (no python-agent
work), and the waived 6.9.1 relation gate satisfied by a **code-level re-audit**
(live E2E stays a fast-follow). Same contract as 6.8–6.9.1: a wave is done when a
non-technical user gets it and it is proven, not when it merely builds green.

## 2. Delivered — 8 build waves

W1 state-persistence draft-autosave (`useDraftAutosave`, wired into the heavy
forms) · W2 sync persistence across navigation (`useSyncJobPersistence`; badge
restores from persisted job on mount) · W3 telemetry humanization (`humanizeEvent`,
PT-BR, UUIDs stripped, local times, grouped) · W4 perceived latency (optimistic
running + auto-open TelemetryHUD) · W5 Agenda Google-Calendar week time-grid ·
W6 real typecheck (`tsc -b`) added to the CI gate · W7 equipe-scoped profiles
query + per-owner run-rate · W8 cleanup (dead code, PT-BR accents, em-breve card
rails). Commits `9d9f3b3`…`c6a13f9`.

## 3. Review 1 + Fixes 1 — found & FIXED (this cycle)

Review 1 (Deepseek PM review, appended to the sprint plan) + a Claude cross-check
found the "8 waves complete" ledger was partly hollow — **4 Criticals** and
3 Importants. All were fixed in the **Fixes 1** cycle via subagent-driven
development (implementer + per-task review + re-review). Commits `6dd3df5`…
`b4b6988`:

- **T1 (Criticals C1 + an elevation):** the W6 gate was red — `tsc -b` exited 2
  with 14 type errors and there was **no `typecheck` script**. Burned all 14
  (across `SyncButton`, `OpportunityKanban`, `usePipelines`, `usePipelineStagesV2`,
  `useRelationResolver`, `useSubtasks`, `CopilotCockpit`) and added
  `"typecheck": "tsc -b"`. **Elevation:** the two `SyncButton` `running` errors
  Review 1 filed as type-debt were actually a **`const` TDZ → `ReferenceError` on
  every render of `SyncButton`** (W4's auto-open-HUD code) — a real runtime crash
  the green build hid. Fixed by reordering the derived consts above the effects,
  proven with a TDD render test.
- **T2 (Critical C4):** the two "em breve" card rails were wired to real data —
  Agenda do card → `useAgendaEvents` (filtered by `lead_id`), Decisões do Copilot
  → `useCopilotDecisions` (filtered by `opportunity_id`), with graceful loading/
  empty/error states (an unconfigured Copilot API shows "Sem decisões recentes.",
  never crashes). No "Em breve" string remains.
- **T3 (Important I1 + 2 review-found Criticals):** unified `PipelineEditor`,
  `AgentRulesPanel`, and `RevenueGoalsForm` onto `useDraftAutosave` (dropped the
  ad-hoc refs/localStorage). The task review then caught a **regression the
  refactor introduced** — `commit()` reset the form to `initial` before the async
  save landed, so after saving PipelineEditor reverted to pre-edit values and
  AgentRulesPanel blanked its rules. Fixed by adding `clearPersisted()` (clears
  the draft, leaves on-screen values) and using it on save in all three forms;
  re-reviewed clean.
- **T4 (Important I2 — adjudicated):** Review 1's "sweep Realtime subscription
  leak on unmount" was a **false positive** — `useCopilotSweep`'s `[runId]` effect
  already returns a `removeChannel` cleanup that React runs on unmount. The **real**
  (minor) leak was in `useCopilotSync`: the SSE fetch stream's `AbortController`
  was never aborted on unmount. Added an unmount cleanup that aborts it.
- **T5 (Critical C3):** produced the contracted **W7 relation re-audit** (the
  `## Sprint 6.10 — W7 Relation Column Re-audit` section below) — verdict
  **Correct**, code-level only.

Importants I3 (handoff + todo not updated) is closed by this document + the
`todo.md` update. Review 1's Minors (M1–M5 + a few Claude/W1 notes) are carried in
`todo.md` as fast-follow.

## 4. Outstanding / fast-follow (NOT done — by design)

- **W7 live E2E** of the relation column (authenticated app: pick target table →
  link a record → chip resolves against `custom_table_records`). The re-audit
  below confirms the code is correct, but no live DB run was performed — carried
  to `todo.md`.
- **Real agent (wall-clock) latency** — W4 was perceived-latency only;
  python-agent profiling/caching/model choice was explicitly out of scope.
- **Review 1 Minors** (M1 internal `move_stage` label, M2 badge race, M3 fast-
  toggle timer, M4 multi-day events in week grid, M5 DST round-trip, isDirty
  field-order, per-owner run-rate scope) — `todo.md`.

## 5. Deploy / DB state

- **Frontend-only.** No migrations, no edge functions, no python-agent changes
  this sprint — **nothing to `supabase db push` or `functions deploy`.** W2 sync
  persistence chose a **localStorage-backed** approach (`useSyncJobPersistence`),
  so the "may need a migration" flag from the plan resolved to **no migration**.
- **The typecheck gate is now real:** `.github/workflows/ci.yml` runs `npx tsc -b`
  before the build, and `npm run typecheck` exists. The hollow `tsc --noEmit`
  path is no longer the gate. The pre-existing backlog is **burned to 0**.
- **Not yet merged to `main`** — the branch is green (tsc 0, 70/70, build) and
  Review-1 Criticals are cleared; awaiting the final whole-branch review +
  founder merge decision.

## Sprint 6.10 — W7 Relation Column Re-audit (code-level)

**Verdict: Correct — no defect found. The custom-table relation column's write/read/resolve path is internally consistent and follows the proven `opportunity_links` shape, with intentional adaptations for the virtual-table model.**

### Audit checklist

#### Write path

**File:** `src/components/crm/customtables/CustomTableView.tsx:112–141`

When a user picks a record via `RelationPicker`, `InlineCell` fires `onCommit({ toId, label })`, routed to `handleCellCommit`. The insert (line 132) is:

```
await sb.from("custom_table_links").insert({
  equipe_id, from_table: table.slug, from_id: m.rowId,
  to_table: toTable,   // = col.relation.targetTableId (custom table UUID)
  to_id: linkVal.toId,
  relation_key: m.column.key,
});
```

- `toTable` is resolved as `m.column.relation?.targetTableId ?? m.column.relation?.table ?? ""` (line 119). For virtual custom-table targets `targetTableId` (the UUID) is always set by the column editor UI, so `to_table` stores the UUID of the target custom table.
- **`await` is present** — no `.execute()` call anywhere in the path. The original 6.9.1 bug (non-awaited builder) is resolved. ✓
- Soft-delete (remove path, line 121–129) also uses `await` and matches the `opportunity_links` soft-delete shape. ✓

**Files consulted:** `CustomTableView.tsx`, `InlineCell.tsx:181–185`, `RelationPicker.tsx:58–74`.

#### Read / resolve path

**File:** `src/hooks/useRelationResolver.ts:72–115`

For `linkTable === "custom_table_links"` (the non-`opportunity_links` branch):

1. Queries `custom_table_links` selecting `"to_id, to_table"` filtered by `from_table`, `from_id`, `relation_key`, `equipe_id`, `deleted_at IS NULL` (lines 73–81).
2. Groups `to_id`s by `to_table` (line 85–89).
3. For each target-table group, queries `custom_table_records` with `.eq("table_id", toTable).in("id", ids)` selecting `"id, data"`, then reads `data[displayField]` as the label (lines 97–113).

**Task-1 `as unknown as` casts verification:**
- Line 86: `edges as unknown as { to_table: string; to_id: string }[]` — the `.select("to_id, to_table")` at line 75 selects exactly these two columns. Cast is correct. ✓
- Line 106: `records as { id: string; data: Record<string, unknown> }[]` — the `.select("id, data")` at line 99 selects exactly these two columns. Cast is correct. ✓

#### Write ↔ Read consistency

| Dimension | Write (`CustomTableView`) | Read (`useRelationResolver`) | Match? |
|---|---|---|---|
| Link table | `custom_table_links` | `custom_table_links` | ✓ |
| Source scope | `from_table = table.slug` | `.eq("from_table", context.fromTable)` where `fromTable = table.slug` (passed at `CustomTableView.tsx:339`) | ✓ |
| Source record | `from_id = m.rowId` | `.eq("from_id", rowId)` | ✓ |
| Column discriminator | `relation_key = m.column.key` | `.eq("relation_key", column.key)` | ✓ |
| Target pointer | `to_table = targetTableId` (UUID), `to_id = linkVal.toId` | groups by `to_table`, queries `custom_table_records.eq("table_id", toTable).in("id", ids)` | ✓ |
| Soft-delete | `deleted_at` field | `.is("deleted_at", null)` | ✓ |
| Tenant scope | `equipe_id` on insert | `.eq("equipe_id", context.equipeId)` | ✓ |

No write/read column mismatch found.

#### vs `opportunity_links`

`opportunity_links` schema: `opportunity_id`, `linked_type`, `linked_id`, `equipe_id`, soft-delete. The proven write in `OpportunityTable.tsx:438–444` directly awaits `supabase.from("opportunity_links").insert(...)` (no `.execute()`). Resolve in `useRelationResolver.ts:44–69` queries `opportunity_links` for `linked_id`, then fetches from the physical target table.

The custom-table path follows the same structural pattern: await direct insert into a bridge table → filter by composite key on read → batch-fetch display labels. Differences are intentional and correct:
- Uses `(from_table, from_id, relation_key)` instead of `(opportunity_id, linked_type)` — more generic, supports N relation columns per table.
- Resolves via `custom_table_records` (JSONB virtual model) instead of physical tables — correct, since all custom table rows live in `custom_table_records`.

**One design note (not an active defect):** If a relation column were misconfigured with a physical table target and no `targetTableId`, the resolver would incorrectly query `custom_table_records`. However, the column editor UI in `CustomTableView.tsx:295–301` only allows selecting other custom tables (from `otherTables`), so this misconfiguration cannot be reached via normal UI flow.

### Conclusion

All four checklist items pass. No `.execute()` calls. Casts match selected columns. Write and read columns are fully consistent. The pattern mirrors `opportunity_links` with intentional, correct adaptations.

**Verified code-level only — NOT live/authenticated E2E verified. Live E2E (pick target table → link a record → chip resolves against `custom_table_records`) remains a documented fast-follow.**

---

# Sprint 7 — Handoff

> **Sprint:** Studio AI v1: Channels & Solo API (`sprint_7_studio_ai_v1.md`)
> **Closed (code):** 2026-07-09 · **PM:** Claude · **Branches:** merged to `main` across 4 waves
> **Verification:** code gates green; **live E2E deferred** (needed a real phone — see §4)

---

## 1. What this sprint was

The founder amended the ROADMAP mid-flight: **whatsmiau** (an unofficial WhatsApp API on his own VPS, Evolution-API-compatible, port 8081) was pulled forward from post-v1 to replace the ~R$100/mo Z-API connection inside the agent provider. Branded internally as the **Solo API**.

The agent provider stays the default brain and inbox in v1. The Solo API covers three things it can't: solo-native conversations, outbound-initiated messages (forms/ads leads), and the 24h-window-closed fallback.

**Decisions locked by the founder:** no provider-abstraction refactor in v1 (ship first) · billing = one Asaas subscription line-item per connected instance, reconciler pattern (`SOLO_INSTANCE_MONTHLY_PRICE` ≈ R$100; disconnect keeps billing, only delete stops it) · channel creation supports all 7 provider types · Knowledge Base sync explicitly pushed to a later sprint.

## 2. Delivered — 4 waves, T1–T12

- **W0** — API reference spike (`sprint_7_api_reference.md`) built from the whatsmiau **source code** rather than samples, plus live validation against the VPS; migration `20260705000000` (`wpp_instances` table, `conversations.solo_instance_id`, `messages.provider` + `provider_message_id`).
- **W1** — `manage-solo-instances` (create/connect/status/logout/delete) · `solo-wpp-webhook` (connection + message ingest, dedup, opportunity + AI parity with the existing pipeline).
- **W2** — `send-chat-message` 3-route send routing + `_shared/solo-sender.ts` · `sync-instance-billing` Asaas reconciler · `solo-health-check` + pg_cron migration.
- **W3** — ChannelsPage Solo API UI · CreateChannelDialog (7 channel types + QR) · inbox channel chips + Solo window · admin Solo-instances panel · T12 hardening gate.

## 3. End-of-sprint review — found & FIXED

- **`connectionState` emits an undocumented state `qr-code`** while awaiting pairing (not in the source-derived mapping). Mapped to `awaiting_qr` in both the status action and the webhook.
- **`sendText` body shape**: the founder's n8n flow used `{number, textMessage:{text}}`; the current server expects `{number, text}`. The legacy shape would have failed silently.
- Instance-ID sanitization + agent webhook auto-config fixups.
- Media dedup hardened so Solo photo albums don't collapse into one message.

## 4. Deferred (NOT done)

- **Live E2E** — QR scan with a real device, verbatim `messages.upsert` capture, coexistence echo/dedup, and the provider's window-closed error body. All require a human with a phone. *These became the opening of Sprint 7.1.*
- pg_cron health tick was committed **inert** by design (no service-role key in a migration).

## 5. Deploy / DB state

- Migrations `20260705000000` + `20260705000001` applied.
- All 21 edge functions deployed **manually via the local Supabase CLI** — the GitHub Actions deploy failed with `401` because the `SUPABASE_ACCESS_TOKEN` repo secret was invalid.
- Secrets set: `WHATSMIAU_BASE_URL` / `_API_KEY` / `_WEBHOOK_TOKEN`.
- VPS: 2 pre-existing production instances (`solobusiness`, `soloventures-salesengine-admin`) — **never to be touched**.

## 6. Known follow-ups outside this sprint

- CI `evals` job red from a pre-existing python-agent failure, unrelated to this sprint.
- Knowledge Base sync (became Sprint 7.2).
- Salvy number purchase, mass campaigns — explicitly out of scope.

---

# Sprint 7.1 — Handoff

> **Sprint:** Studio AI v1 Fixes 1 (`sprint_7.1_studio_ai_v1_fixes_1.md`)
> **Closed:** 2026-08-07 · **PM:** Claude · **Branch:** `fix/solo-webhook-token-delivery` → PR #4 → `main`
> **Verification:** synthetic E2E against prod, cleaned up afterwards; `deno check` clean

---

## 1. What this sprint was

Not a planned sprint — a **diagnosis**. The founder connected an instance by QR, sent a WhatsApp message, and nothing appeared in the chat. Sprint 7's code was all merged and deployed, so on paper it should have worked.

## 2. Delivered — root cause was two independent bugs

**Bug 1 — the webhook token never arrived (401 on every event).** `manage-solo-instances` configured the instance with `webhook.headers: {x-webhook-token}`. whatsmiau *stores* those headers, but its dispatcher (`lib/whatsmiau/event_emitter.go` → `doEmit`) sends **only** `Content-Type` — configured headers are never transmitted. Every event hit `solo-wpp-webhook` tokenless and was rejected. Prod logs showed dozens of `Token invalido ou ausente (401)` in exactly the founder's test window.

*Fix:* the token travels in the URL (`?token=`); the webhook accepts header **or** query param; `solo-health-check` reconciles webhook config drift on every tick, so instances created before the fix heal themselves.

**Bug 2 — a CHECK constraint blocked lead creation (23514).** Found by synthetic E2E *after* the 401 was cleared — the 401 had been masking it. The webhook inserts `creation_source: 'solo_api'` per the T2 spec, but no migration ever extended `leads_creation_source_check` (`manual|ai_agent|webhook|import`). **Every** message from a new number aborted.

*Fix:* migration `20260807020000` adds `'solo_api'`; the webhook falls back to `'webhook'` on 23514 so a message is never lost while the migration is pending.

**Also fixed:** the pg_cron health tick had a **service-role JWT baked into `cron.job`** that went stale after key rotation — 401 every 5 minutes since inception. Re-authored to use `x-cron-secret` + a new `SOLO_HEALTH_CRON_SECRET` secret.

## 3. End-of-sprint review — found & FIXED

- The GitHub Actions deploy workflow had **never once succeeded** (401 from a stale repo secret). Founder's call: delete `deploy.yml` and keep deploys manual rather than renew it. `ci.yml` stays.
- Verified the whole ingest path with a synthetic `messages.upsert`: lead + conversation (`solo_instance_id` set) + message (`provider='solo'`) + unread increments. Test rows removed, zero residue.

## 4. Deferred (NOT done)

- Live E2E with a real device (carried from Sprint 7) — still open, now in `todo.md`.
- `wpp_instances.phone` stays `null` because `connectionState` doesn't return `ownerJid`; expected to self-fill on next pairing.

## 5. Deploy / DB state

- Migration `20260807020000` applied **by hand** by the founder — so it was missing from `supabase_migrations.schema_migrations` until Sprint 7.2's `db push` replayed it (safe: `DROP … IF EXISTS` + `ADD`).
- `solo-wpp-webhook`, `manage-solo-instances`, `solo-health-check` deployed manually.
- New secret: `SOLO_HEALTH_CRON_SECRET`. `cron.job sprint7_health_tick` rewritten.

## 6. Known follow-ups outside this sprint

- `ASAAS_API_KEY` absent → `sync-instance-billing` dead → **no instance charge ever posted** (resolved in 7.2 close-out).
- Local DNS can't resolve the Supabase pooler host; `supabase db push` needs `--dns-resolver https` on this machine.


---

# Sprint 7.2 — Handoff

> **Sprint:** Studio AI: Truth & Parity (`sprint_7.2_studio_ai_v1.md`)
> **Closed:** 2026-08-10 · **PM:** Claude · **Engineer:** Verboo (deepseek-v4-flash) — all 13 tasks
> **Design spec:** `docs/superpowers/specs/2026-08-08-studio-ai-truth-and-parity-design.md`
> **Ground truth:** `Planning/Sprints/sprint_7.2_api_reference.md` (live capture)
> **Verification:** `npx tsc -b` exit 0 · vitest 71/71 · `npm run build` clean · `deno test` 2/2

---

## 1. What this sprint was

The founder's verdict was that Studio AI did not meet expectations. Investigation found the cause was **not** missing UI — every page existed and called real edge functions. The functions were talking to the **wrong upstream resource**.

**Root cause:** `manage-agent-settings` read and wrote `GET/PUT /v2/agent/{id}`. That object carries only `id · name · avatar · status · communicationType · type · jobName · jobDescription · jobSite · behavior`. Every operational setting **and `prefferModel`** live on a separate `/v2/agent/{id}/settings` sub-resource that we had never called. So the settings page rendered defaults and silently discarded every write. **An entire page of the product had never worked.**

Scope chosen by the founder: **fix-first + full settings parity**. Google Calendar was dropped because the provider has no API for it (dashboard-only configuration).

## 2. Delivered — 4 waves, T0–T12

- **W0** — live API spike producing `sprint_7.2_api_reference.md`: 9 endpoints captured against the real agent, plus a DOCUMENT training round-trip run twice with cleanup.
- **W1** — `manage-agent-settings` repointed at `/settings` with a server-owned model catalog (`?action=models`) · `manage-agent-channels` real fetch · `fetch-gpt-credits` real balance + per-model breakdown · `manage-agent-training` DOCUMENT upload + `agent-training-docs` Storage bucket with tenant-isolating RLS · env fail-fast + committed `netlify.toml`.
- **W2** — Settings page (12 controls in 3 groups, saved one field at a time with rollback) · model selector reading the real catalog and current model · Channels page + richer Solo instance cards (connection date, monthly price) · Knowledge Base file upload · Usage page on real credit data · Billing instances section.
- **W3** — white-label sweep plus a `no-provider-branding` regression guard, run alone because it touches files six W2 tasks owned.

## 3. End-of-sprint review — found & FIXED

The spike and the wave audits surfaced **six defects that were not in the original brief**, four of them in the PM's own plan:

1. **The plan would have rejected the tenant's own model.** `update-model` validated against a hardcoded catalog, but the live `prefferModel` is `GPT_5_6_SOL`, which appears in no published enum. Validation is now a format check; the catalog is display metadata, never an allowlist.
2. **Trainings were being listed TEXT-only.** `GET /trainings` silently defaults to TEXT when `type` is omitted, so an uploaded document was invisible in the list. A direct cause of "Knowledge Base doesn't fetch real data".
3. **The `credits-spent` breakdown was always empty** — the code read `data.details`, but the live shape is `{ total, data: [...] }`. A second, independent cause of "Uso & Analytics doesn't fetch real data".
4. **`description` does not exist on the agent object** — the field is `jobDescription`. The plan as written would have made the description editor a silent no-op: the *third* instance of the same bug class this sprint existed to remove.
5. **The frontend gate was hollow.** `npm run build` uses esbuild and does **not** typecheck; T7 shipped a real `TS2515` that the build reported as clean. The gate is now `npx tsc -b` **and** `npm run build`. The project had already learned this in 6.9/6.10; the plan specified the weaker check anyway.
6. **`Webhooks.tsx` displayed URLs for a project that is not ours** (`padduteanashekmereof…` instead of `egxzsivzqlqadoqpgfby`), including the `crm-webhook` URL carrying the tenant's secret. Any customer who copied them pointed their webhooks at the wrong project and their inbound leads went nowhere — silently breaking the feature shipped in 7.1. All three now derive from `VITE_SUPABASE_URL`.

Also fixed during the audits:

- **Two silent-save failures.** `maxDailyMessagesLimitAction` is discarded by the provider unless `maxDailyMessages` travels in the same PUT (the pair is now always sent together, and the control is disabled with an explanation while no limit is set). `onLackKnowLedge` is write-only upstream — the field now says so rather than appearing to lose input.
- **`npm test` had gone red** because T1 placed a Deno test inside the vitest glob; `supabase/functions/**` is now excluded and both runners are green.
- The white-label guard was **verified to actually fail** by injecting a brand string into a real UI file — a guard that cannot detect a violation is worse than none.

## 4. Deferred (NOT done — see `todo.md`)

- **No provider API exists:** business hours · content moderation · Google Calendar.
- **Capability we own but chose not to build:** Intentions rebuild (needs its own design pass with mockups) · Transfer Rules · Idle Actions · named training blocks · i18n · niche-generic example copy · chat channel-filter restyle.
- **Tech debt this sprint created:** the flat/nested settings contract duplication must be contracted in 7.3; the training bucket is public-read by design.

## 5. Deploy / DB state

- Migrations `20260807020000` (replayed, which re-synced the migration ledger) and `20260808000000` (`agent-training-docs` bucket) applied. Bucket live with a 20 MB cap; **RLS verified against `pg_policies` in prod**, not merely against the migration file.
- Edge functions deployed from merged `main` on **2026-08-10 21:21–21:22 UTC**: `manage-agent-settings`, `manage-agent-channels`, `fetch-gpt-credits`, `manage-agent-training`, `sync-instance-billing`, `solo-health-check`, `solo-wpp-webhook`, `manage-solo-instances`.
- **`ASAAS_API_KEY` set 2026-08-10.** `sync-instance-billing` no longer dies on startup — its error moved past the key check — so instance billing can post for the first time.
- Frontend deploys via Netlify from `main`. Netlify env vars remain **unverified by a human**.

## 6. Known follow-ups outside this sprint

- **Rotate the Asaas production key** — it was pasted in plaintext into a chat transcript.
- The `gpt-maker-webhook` function slug is the last user-visible brand leak. Renaming it is a migration (deploy neutral slug → move tenants → retire old), not a string edit, because every tenant has it configured upstream.
- The `agent-assets` bucket writes training attachments with no `equipe_id` in the path, so it lacks the path-enforced isolation that `agent-training-docs` has.
- Billing ledger amounts are roughly double the documented tier table across all 13 rows — needs a founder decision before cost-per-engineer means anything.
- **The sprint's real proof is still untested by a human:** open Studio AI and confirm settings persist, channels list, usage shows real numbers, and an uploaded document appears. Everything is verified at the API layer; nobody has yet confirmed it in the running app.

---

# Sprint 10 — Handoff

> **Sprint:** Migração Solo Energia (`sprint_10_migration_solo_energia.md`)
> **Closed:** 2026-09-09 **Branch:** `claude/sprint10/migration/solo-energia` → PR #9
> **Verification:** ensaio purge+import em transação com `ROLLBACK` contra a
> produção · asserções da migration e do import passaram · `norm_phone` conferido
> contra `normalize_phone_br` do banco em 400 telefones reais, 0 divergências

---

## 1. What this sprint was

Tirar a Solo Energia do Jestor e colocá-la operando no app. A meta do founder
era literal: *"made this migration to tomorrow i can begin to use the app"* — e
a razão importa, porque ele usando o produto todo dia é o que faz o produto
evoluir rápido.

O escopo foi **só a migração**. O sprint original vinha embalado com mais duas
coisas — um importador genérico de planilha com field-matching, e oito features
de paridade com o Jestor (proposta, contrato, cadências de e-mail e WhatsApp,
tabelas relacionais, logs, personalização, dashboard). Foram separadas de
propósito: são oito sprints, não uma, e **a migração não depende do importador**.
Decisão do founder: migração rápida agora, importador depois.

## 2. Delivered — 4 tarefas, 1 branch

- **T1 (M)** backup + zeragem da base atual da Solo Energia
- **T2 (L)** `scripts/migrate_solo_energia.py` — normalização, dedup, geração do SQL
- **T3 (M)** execução em produção + relatório de revisão
- **T4 (S)** fix de `stage_type` do pipeline Carregamento Veicular

```
backup      468 leads · 56 oportunidades · 9.340 mensagens
importado   1.251 leads · 1.260 oportunidades · 0 sem etapa
telefone    1.173 leads com phone_normalized
```

O Kanban bate **1:1** com a contagem de `Estágio` do Jestor: Ganho 137, Perdido
101, Desqualificado 402, Reciclo 514, e os ~106 vivos distribuídos nas etapas
certas.

## 3. O que a análise mudou no plano (antes de escrever código)

- **A escala é 10× menor do que parece.** `wc -l` dá 5.085 / 14.512; parseado
  como CSV de verdade são **1.268 / 1.260**. O resto era newline dentro de
  `Observações` entre aspas. Planejar em cima do número errado teria virado uma
  sprint inteira para um problema de uma tarde.
- **O pipeline que já existia cobre 100% dos estágios do Jestor.** Os 10 valores
  de `Estágio` caem todos nas 11 etapas de `Solo Energia | Usinas - Micro
  Geração`. Não foi preciso criar pipeline nem etapa — só um rename no mapa
  (`Nova Oportunidade` → `Contato Inicial`). **A resposta à pergunta do founder
  ("nossos campos hoje são efetivos?") é sim**, sem alteração de schema.
- **A junção é limpa:** `oportunidade.Lead` → `contato.Nome` casa 1.024 de 1.024.
  `Propriedade` parecia chave e não é — é o marcador nulo `'-` do Jestor.
- **73% da base é histórico morto** (Reciclo 514 + Desqualificado 402). O founder
  optou por trazer tudo, com as fases corretas.

## 4. Os cinco defeitos que o ensaio pegou (nenhum apareceria em teste local)

Cada rodada de ensaio (`BEGIN; … ROLLBACK;` contra a produção) derrubou um:

1. **Dedup cego por telefone destruiria 38 pessoas reais.** 65 grupos de telefone
   repetido: 51 são a mesma pessoa com grafia diferente, 14 são gente diferente
   dividindo o número. Regra final: primeiro nome igual (ou um nome contido no
   outro) — compartilhar um token qualquer junta `Abinoan Pereira` com
   `Gesaias Pereira Azevedo`.
2. **`leads.origin_category` é taxonomia fechada** por CHECK. O rótulo cru do
   Jestor não cabe: a categoria classifica, `origin_detail` preserva o original.
3. **`UNIQUE (equipe_id, phone_normalized)` parcial.** O banco só admite um dono
   por número — e está certo, porque mensagem que chega de um número
   compartilhado não tem como ser desambiguada.
4. **`trg_leads_sync_phone_normalized` recalcula a coluna no INSERT.** Zerar só
   `phone_normalized` não adianta: o trigger reescreve a partir de `phone`.
5. **`normalize_phone_br` não é "sempre prefixa 55".** Ela remove o 55 quando
   `len >= 12`, insere o 9 do celular em números de 10 dígitos e devolve 8/9
   dígitos **sem** DDI. Enquanto o script divergia dela, telefones que ele
   julgava distintos colidiam no UNIQUE. Hoje é porta exata da função do banco.

O item 5 é o que mais importa além desta sprint: o runbook já registra que
WhatsApp sem o 55 é **aceito** pela API e a mensagem some. Normalizar por uma
regra diferente da do banco é o agente falando com ninguém.

## 5. Deploy / DB state

- Migration `20260909000400_sprint10_backup_purge_solo_energia.sql` aplicada via
  `supabase db push` (T1 + T4). Backup em `leads_backup_sprint10`,
  `opportunities_backup_sprint10`, `messages_backup_sprint10` — mesma convenção
  de `leads_backup_sprint3` / `leads_backup_sprint55_pre_merge`.
- Import aplicado por `psql` a partir do SQL gerado, dentro de uma transação,
  com asserções de contagem. **Nenhuma edge function mudou nesta sprint.**
- **CI existe agora** (`.github/workflows/ci.yml`): `Backend unit tests` e
  `Frontend build gate` são checks obrigatórios em `main`, e `main` está
  protegida. O runbook (`docs/billing-runbook.md`) ainda diz *"Deploy é manual
  neste projeto — não existe CI"* — está desatualizado.
- CSVs, SQL gerado e relatório de revisão ficam **fora do git** (`.gitignore`):
  carregam nome, e-mail e telefone de 1.251 pessoas reais.

## 6. Known follow-ups outside this sprint

- **24 grupos para revisão humana** — pessoas diferentes dividindo telefone,
  preservadas separadas. Lista em `Planning/Assets/migration_report_solo_energia.md`.
- **50 contatos ficaram sem `phone`** (o número foi para `observations`), porque
  o UNIQUE só admite um dono por número.
- **Nada foi importado para `messages`/`conversations`**: o histórico de conversa
  do Jestor não veio no export. Os 9.340 do backup são do app, não do Jestor.
- **`Responsável` não foi mapeado para usuários do app** — ficou em
  `custom_data.responsavel_jestor`. 573 das 1.260 vinham vazias.
- O importador genérico e as oito features de paridade seguem abertos, cada um
  com sua sprint.

---

# Sprint 11 · Onda 1 — Handoff

> **Sprint:** CRM v1.1 — Confiança (`sprint_11_crm_v1.1.md`)
> **Fechada:** 2026-09-10 · **PM + Engineer:** Claude (Opus 5) · **Branch:** `claude/sprint11/w1/crm-confianca`
> **Verificação:** `tsc -b` limpo · vitest 137/137 · `npm run build` · `deno test _shared` 84/84 ·
> 4 testes SQL (`scripts/sqltest.sh`, em rollback contra a produção) · `python scripts/test_migrate_solo_energia.py`

## 1. O que esta onda era

A Sprint 11 abriu com 14 pontos do founder. A análise mostrou que o CRM tinha
coisas **quebradas**, não só feias — e que tudo o que se construísse por cima
herdaria isso. A Onda 1 conserta o que está quebrado, com prova, usando a Solo
Energia como caso. Ondas 2 (Kanban/tabelas claros), 3 (tabelas relacionais) e 4
(tracking) seguem no plano.

## 2. Entregue

- **T1** `scripts/sqltest.sh` — testes SQL contra a produção sempre em
  `BEGIN … ROLLBACK`, com `-- @include` da migration de verdade e recusa de `commit;`.
- **T2** `opportunities.owner_id` (herda do contato, recusa responsável de outra
  equipe) + `crm_team_members()` — a RLS de profiles fazia todo seletor de membro
  mostrar só o usuário logado.
- **T3** RPCs do quadro: `crm_board_summary`, `crm_board_stage`, `crm_lead_scores`,
  `crm_touchpoint_counts`, com um só filtro (`crm_opp_matches`). Na base real:
  resumo em 185 ms contando os 1.259, página de 30 cards em 114 ms.
- **T4** Kanban lê do servidor, 30 cards por coluna com rolagem infinita; contador
  e total verdadeiros; busca por nome/telefone/e-mail no cabeçalho.
- **T5** tabelas leem além de 1.000 linhas; score e touchpoints numa chamada.
- **T6** placar com números reais **do período** (antes: coluna inexistente → zero;
  corrigido só isso, contaria o histórico inteiro como "mês").
- **T7** webhook de entrada deduplica pelo telefone normalizado — e o achado maior (§3).
- **T8** contrato dos campos: valor em `custom_data[field_id]`, chave imutável,
  webhook traduz, dashboard lê pelo field_id e conta multi-seleção por item.
- **T9** reparo da Solo Energia **aplicado**.

## 3. Achados que não estavam no plano

1. **Nenhum lead de WhatsApp/webhook virava negócio desde 23/06.** A reversão do
   `stage_type` para inglês (Sprint 6.8) não viu `_shared/opportunities.ts`, que
   seguiu procurando `stage_type = 'aberto'`. 296 leads fora de qualquer Kanban
   (Casa Flow 174, Cinemas Benficas 120, Rema 1, Solo Energia 1). O mesmo erro
   matava os movimentos de etapa por intenção do `analyze-message`.
2. **19 tabelas de backup + `epic1_merge_log` estavam legíveis pela internet** com a
   chave anon (contatos, 9.340 mensagens, cópias de profiles/billing/contracts/
   equipes). Fechado com aprovação do founder. Logs só guardam ~1 dia: nenhum
   acesso de fora nesse período; antes disso, não dá para saber. Os
   `webhook_secret` expostos eram de equipes já apagadas.
3. **Os dados da Sprint 10 (minha) saíram tortos:** data de criação = dia da
   importação (bug do `parse_dt` com ISO), 564 ganhos/perdas sem data, eventos de
   funil em setembro, responsável preso em custom_data, 10 campos invisíveis, 10
   nomes com a barra dobrada.
4. **O placar e o formulário de metas pediam `profiles.name`**, coluna que não
   existe: nomes por vendedor viravam UUID e metas por vendedor nunca funcionaram.
5. **O modal de detalhe carregava todos os negócios da equipe mesmo fechado.**
6. **O webhook de entrada ignorava o pipeline configurado** e criava no padrão.

## 4. Deploy / estado da produção (10/09)

- **Migrations** `20260910000050` (backups fechados), `…0100` (owner), `…0200`
  (quadro), `…0300` (telefone), `…0400` (quebra por field_id): aplicadas pela
  Management API (o `supabase db push` não conecta desta máquina — DNS) e
  **registradas em `supabase_migrations.schema_migrations`**. Histórico local ×
  remoto sem divergência.
- **Edge functions** `crm-webhook` v120, `gpt-maker-webhook` v149,
  `solo-wpp-webhook` v18, `analyze-message` v115 — deploy com `--use-api`,
  21:54 UTC.
- **Backfill** `supabase/scripts/2026-09-10_sprint11_backfill_inbound_opportunities.sql`:
  297 negócios criados, com o webhook `lead_created` desligado na transação
  (conferido: 0 disparos). Desfazer = apagar os ids de `sprint11_backfill_inbound_opps`.
- **Reparo da Solo Energia** aplicado; backups `*_backup_sprint11` com RLS.
- **Frontend:** vai pelo PR desta branch → Netlify.

## 5. Fica para depois

- **Verificação no navegador** do Kanban novo (contadores = 1.259, <20
  requisições, nome em todo card) — precisa de sessão logada.
- Onda 2 (filtros, UI, mobile, placar redesenhado), Onda 3 (Propostas/Contratos),
  Onda 4 (tracking) — plano detalhado quando cada uma abrir.
- O modelo do lead score (ICP sem critério + contagem de atividade) — com o Copilot.
- Leads anteriores a 23/06 sem negócio (outras equipes) têm outra causa; não mexidos.
- Avaliar obrigação de LGPD pela exposição dos backups (decisão do founder).

---

# Sprint 11 · Onda 4 — Handoff

> **Sprint:** CRM v1.1 (`sprint_11_crm_v1.1.md`) · arquitetura em `Planning/Architecture/motores_revops.md`
> **Código fechado:** 2026-09-12 · **PM + Engineer:** Claude (Opus 5), T39–T46
> **Branches:** `claude/sprint11/w4a/artefatos` (T39–T43) · `claude/sprint11/w4b/automacao-e-formulario` (T44–T47, sobre o 4A)
> **Verificação:** `tsc -b` limpo · lint 0 erro · `npm run build` · vitest 306/306 (37 arquivos) · Deno 97/97 (`_shared`) · 30/30 suítes SQL em rollback contra a produção
> **Deploy:** **parado no T47 — aguarda aprovação do founder** (seção 4)

## 1. O que esta onda entrega

Artefatos: propostas e contratos presos ao negócio, com automação e formulário.

- **Modelo (T39).** Tabelas personalizadas no contrato dos campos do pipeline: cada
  coluna tem `field_id`, o valor mora em `data[field_id]`, a `key` é o nome público
  nas bordas. A tabela vem em páginas de 50 do servidor (`crm_custom_table_page`), que
  busca em qualquer valor e ordena pelo tipo da coluna.
- **Artefato (T40).** Tabela marcada como proposta · contrato · documento; o registro
  fica preso a um negócio por coluna de verdade (`opportunity_id`). O modal do negócio
  mostra "Propostas (3)", cria já preso e abre a mesma gaveta da tabela.
- **Consulta (T41).** Coluna que lê do negócio na hora da leitura (contato, valor,
  etapa, responsável, itens) — nunca copiada.
- **Arquivo (T42).** Bucket **privado** `artifacts`, pasta da equipe, URL assinada de 1
  minuto; cada mudança de arquivo salva na hora.
- **Ciclo de vida → marco (T43).** Rascunho → enviado → aceito/assinado · recusado, só
  pelo verbo. Proposta enviada = `proposal_sent`; contrato enviado/assinado =
  `contract_sent`/`contract_signed`: com a etapa do marco à frente, o negócio anda (o
  evento sai pela etapa); senão o evento é gravado direto (fonte `artifact`), uma vez.
- **Automação (T44).** Botões por tabela (rótulo + URL). O clique manda o payload v1
  (registro por key, negócio, contato, itens, token de retorno) pela **fila de saída
  que já existia**; o n8n responde na edge `artifact-callback` com status, campos e
  arquivos. Contrato: `Planning/Architecture/contrato_artefato_v1.md`.
- **Formulário público (T45).** A tabela escolhe os campos; cada registro gera um link
  `/f/:token` (30 dias ou até o envio) que o cliente preenche sem login; o servidor
  valida cada tipo.
- **Semente da Solo Energia (T46).** "Propostas Comerciais" (os campos do Jestor) e
  "Contratos" (Dados para Contrato no formulário), ensaiadas em rollback.

## 2. Achados que não estavam no plano

1. **Gatilho × tela antiga (T39).** Com o gatilho que dá `field_id` a coluna nova, uma
   tela antiga gravando por key depois da migration deixaria o valor preso à key. A
   conversão cobre toda coluna e é idempotente — **rodar de novo depois do deploy do
   frontend** (seção 4, passo 5).
2. **Registro em tabela de outra equipe (T40).** A RLS dos registros olha só a equipe
   do registro; dava para gravar numa tabela alheia. A guarda nova exige a equipe da
   tabela e a do negócio.
3. **"Salvar" do modal desfazia o marco (T43).** O modal manda sempre a etapa do estado
   local: se a proposta movesse o negócio com o modal aberto, salvar o devolveria. O
   verbo devolve a etapa nova e o modal acompanha.
4. **ClickSign não cabia no token de uso único (T44).** "Enviado" agora e "assinado"
   dias depois são duas respostas → `keep_open: true` mantém o token até vencer.
5. **"4.500,00" não era número no servidor (T45)** → `_crm_parse_br_number`, gêmeo do
   `parseBrNumber` do registro de tipos.
6. **A Solo Energia não declara o marco da proposta (T46).** "Envio de Proposta" é uma
   etapa aberta comum: marcar a proposta como enviada grava o evento mas não move o
   negócio. **Decisão do founder:** ligar a etapa ao marco `proposal_sent` nas
   configurações do pipeline (um clique; a partir daí entrar na etapa também conta).
7. **Riscos registrados, fora da onda:** `chat-attachments` é público (achado 29) e a
   política "Allow authenticated delete" dele deixa qualquer usuário logado apagar anexo
   de qualquer equipe.
8. **Gate:** dois testes que leem todo o `src/` (marca, provedor) estouravam os 5 s do
   vitest com a suíte em paralelo — ganharam 30 s. O `sebill002_credit_consumption` é
   teste de psql (sem marcador PASS), fora do runner desde 09/09.

## 3. Limites da v1 (anotados no contrato e no ledger)

- A automação não baixa arquivos do CRM (armazenamento privado; URL assinada no payload
  fica para a v2 do contrato).
- O formulário público não recebe arquivo (foto do RG/CNH) na v1.
- A busca da tabela olha os valores gravados; consultas e nomes de relação não entram.
- O link do formulário só aparece na hora de gerar (o banco guarda o hash); reenviar =
  gerar outro (o anterior deixa de valer).

## 4. Deploy — ponto de parada (aprovação do founder)

Nada desta onda está na produção. A ordem importa (o frontend novo chama as funções
novas; a tela antiga não sabe de `field_id`):

1. **Migrations** `20260912100100` … `20260912100600`, na ordem, registradas no
   histórico. A `…100100` já converte a "Teste" da Solo Energia (1 coluna, 2 registros)
   — ensaiado: nenhuma coluna sem `field_id`, nenhum valor preso à key.
2. **Edge functions novas:** `artifact-callback` e `public-form` (ambas
   `verify_jwt = false`, já no `config.toml`). `deliver-crm-webhook` não muda.
3. **Semente** `supabase/scripts/2026-09-12_sprint11_seed_solo_artifacts.sql` (ensaio
   `sprint11_w4_seed_solo.test.sql`).
4. **PR + merge** do branch `claude/sprint11/w4b/automacao-e-formulario` → Netlify.
5. Depois do frontend no ar: `select public._crm_custom_tables_to_field_id();` (idempotente).
6. Verificação no navegador: tabela "Teste" em páginas; criar uma proposta num negócio
   da Solo, anexar PDF, marcar como enviada; gerar o link do formulário de um contrato e
   preencher em aba anônima.

## 5. Fica para depois

- Configurar os botões do n8n (APITemplate, ClickSign) nas tabelas da Solo — os fluxos
  se adaptam ao contrato v1.
- Ligar "Envio de Proposta" ao marco `proposal_sent` (achado 6).
- Contrato v2: arquivos do CRM para a automação; retorno sem clique (evento).
- Formulário com arquivo; "selecionar todos" os filtrados (v1.2).

---

# Sprint 11 · Onda 3 — Handoff

> **Sprint:** CRM v1.1 (`sprint_11_crm_v1.1.md`) · arquitetura em `Planning/Architecture/motores_revops.md`
> **Fechada:** 2026-09-12 · **PM + Engineer:** Claude (Opus 5) em T28–T35; Codex (GPT-5) em T36–T38
> **Branches:** `claude/sprint11/w3a/receita` (T28–T34) · `claude/sprint11/w3b/linha-configurada` (T35–T38) · **PR #15**
> **Verificação:** `tsc -b` · lint 0 erros · build · vitest 272/272 · pytest 333 passed/21 skipped · 23/23 suítes SQL em rollback

## 1. O que esta onda entrega

- **Desfecho único:** a etapa decide ganho/perda/reabertura e o evento tem uma fonte.
- **Receita v1:** catálogo, itens do negócio, valor pela soma, livro-razão append-only,
  estorno/ajuste e dashboard/placar pela receita reconhecida.
- **Ciclo de vida:** a Base de Contatos usa ganhos vivos e receita; `lifecycle_stage`
  acompanha cliente, oportunidade e perdido.
- **Tempo:** um agendador de banco faz reciclo e recorrência; cada recorrência abre um
  novo negócio por cadência.
- **Linha configurada:** Oferta e Processo em `pipelines.natures`, marcos canônicos,
  quatro modelos prontos e Track Shaper capaz de propor e persistir natureza + marcos.

## 2. Estado da produção

- Migrations `20260912000100` … `20260912000800` e
  `20260912024524_sprint11_w3_track_shaper_natures` aplicadas e registradas.
- Reparos aplicados na ordem ensaiada: status pela etapa → receita histórica → ciclo de
  vida. Verificação final: **0** status divergentes, **0** receitas divergentes do valor
  ganho e **0** ciclos de vida divergentes para contatos com negócio.
- `crm-timers`: job **8**, ativo a cada 15 minutos. Corte
  `2026-09-12T03:06:35.7060700Z`: os 29 reciclos históricos da Casa Flow ficam onde
  estavam; só vencimentos posteriores ao corte são movidos.
- `shape_pipeline` continua atômico e agora é executável somente por `service_role`;
  `authenticated` não tem `EXECUTE`.
- Frontend (Netlify) e `python-agent` (Dokploy) seguem o merge em `main` do PR #15.

## 3. Gates e observações

- O changelog atual do Supabase não trouxe breaking change aplicável ao deploy hospedado
  desta onda. As migrations não fixam versão de extensão (prática agora depreciada).
- O advisor pré-deploy encontrou três erros **anteriores à onda** em views administrativas
  `SECURITY DEFINER` (`v_tenant_entitlements`, `v_admin_notification_matrix`,
  `v_admin_team_billing`) e avisos antigos de RLS/índices. Não foram alterados aqui: exigem
  auditoria própria para não quebrar a leitura administrativa.
- Warnings não bloqueantes: 87 avisos de lint já existentes, chunk principal de 2,66 MB e
  depreciação `httpx`/`TestClient`; nenhum erro de lint/build/test.

---

# Sprint 11 · Onda 2 — Handoff

> **Sprint:** CRM v1.1 (`sprint_11_crm_v1.1.md`) · arquitetura em `Planning/Architecture/motores_revops.md`
> **Fechada:** 2026-09-11 · **PM + Engineer:** Claude (Opus 5); T22 (deploy) e o PR #13 (2B parcial) por outra sessão
> **Branches:** `w2a/achar-filtrar-atribuir` (PR #12) · `w2b/claro-e-celular` (PR #13) · `w2b/fecha-a-onda` (fechamento)
> **Verificação:** `tsc -b` limpo · lint 0 erro · vitest 235/235 · `npm run build` · 10 testes SQL em rollback contra a produção

## 1. O que esta onda era

Achar, filtrar e atribuir: o Kanban e as tabelas leem do servidor com um filtro só
(inclusive por campo personalizado), os filtros moram na URL, o responsável mora no
**negócio** (o contato não tem dono) e as métricas contam cada ganho pelo dono **do
momento**. A 2B deixa o card e o placar claros e leva o CRM ao celular.

## 2. Entregue

**2A (PR #12)**
- **T12/T13** filtro compilado no servidor (`_crm_compile_*`, lido uma vez) com campo
  personalizado, próximo contato e situação do contato; `crm_opp_table`,
  `crm_contacts_table/count` e os verbos `crm_update/delete_opportunities`,
  `crm_delete_leads`, `crm_create_opportunities`, `crm_delete_custom_records` (ids no
  corpo do POST). Na Solo Energia: resumo do Kanban 8 ms, maior coluna 78 ms, Tabela de
  Leads 153 ms, Base de Contatos 35 ms.
- **T14** `funnel_events.owner_id` (dono do momento) + histórico de dono; overview,
  série, quebras, motivos e `crm_placar` seguem o negócio.
- **T15/T16** registro de tipos de campo (15 tipos) e a grade certa por tipo; campo Usuário.
- **T17** barra de filtros única, filtros na URL (link compartilhável), folha no celular.
- **T18/T19** Tabela de Leads e Base de Contatos no servidor (páginas de 50); a base
  mostra Situação, Negócios (com o responsável de cada um), Ganho total, Último ganho.
- **T20** responsável no cabeçalho do negócio, salvo na hora; modal leve.
- **T21** tabelas personalizadas no mesmo padrão (gaveta do registro, relação por coluna,
  sem teto de 1.000, remover coluna esconde).

**2B (PR #13 + fechamento)**
- **T24** card desenhado pelo `cardModel`: nome + responsável; valor · tempo na etapa ·
  interações · próximo contato (editável); selos em ordem; até 3 campos, etiquetas,
  empresas; ações no hover (mouse) ou sempre (toque). Coluna recolhível.
- **T25** placar pelo `crm_placar`: Meta · Realizado · Ritmo · Falta · Conversão · Ciclo,
  barra fina, detalhe por responsável com "Sem responsável"; uma linha quando fechado.
- **T26** celular: Kanban de uma etapa com chips e "Mover para…", tabelas em lista,
  modais em tela cheia, cabeçalhos compactos.

## 3. Achados que não estavam no plano

1. **A 1ª versão do filtro deixou o Kanban 3× mais lento** (590 ms) e "clientes" em 2 s:
   relia o jsonb em cada linha. O filtro compilado resolveu (8 ms / 25 ms).
2. **A 2B entrou pela metade** (PR #13): `cardModel` sem uso (o card não mudou), placar
   com a tela antiga e **mover card no celular impossível** (o "Mover para…" não tinha
   gatilho). Fechado em `w2b/fecha-a-onda`; o ledger foi reescrito para dizer o que
   cada PR entregou.
3. **Chave duplicada `reuniao_agendada`** no pipeline da Solo Energia (Sim/Não ativo +
   seleção apagada): a apagada virou `reuniao_agendada_deleted` no T22. Nenhum pipeline
   tem chave repetida hoje (conferido 11/09).
4. **Tabela personalizada:** apagar coluna e recriar com o mesmo nome ressuscitava os
   valores antigos; agora remover esconde (`is_deleted`) e a chave não volta.
5. **`.in()` com ids na URL** em exclusões em lote (custom tables e um
   `bulkDeleteOpportunities` morto): "selecionar todos" estouraria a URL — virou verbo.
6. **O teste `sprint9_w1_funnel_events` falhava contra a produção** antes da onda (contava
   eventos reais); agora conta só a equipe do teste.
7. **Uma edição pendente de `docs/billing-runbook.md` sumiu** num `git reset` da outra
   sessão. Conferido: era só reformatação (tabelas alinhadas, quebras de linha), sem
   conteúdo novo.

## 4. Deploy / estado da produção (11/09)

- **Migrations** `20260911000100` (filtros), `…0200` (tabelas + verbos), `…0300` (dono
  do momento): aplicadas e registradas em `supabase_migrations.schema_migrations`
  (a coluna `name` ficou vazia nas três — só cosmético). Conferido na produção: as 11
  funções novas existem; `funnel_events.owner_id` preenchido em 454 de 1.092 eventos, e
  **0** evento sem dono cujo negócio tem dono (os 638 restantes são de negócios sem
  responsável); `opportunity_owner_history` com 614 linhas.
- **Frontend:** PRs #12 e #13 no main; o fechamento vai pelo PR de `w2b/fecha-a-onda` → Netlify.
- A 2B não muda edge function nem banco.

## 5. Fica para depois

- **Verificação no navegador** (extensão do Chrome desconectada em toda a onda): Base de
  Contatos = 1.254; ≤ 10 requisições até as primeiras linhas; abrir negócio ≤ 8; celular
  em 390×844 e 360×800 sem rolagem horizontal; tabela "Teste" da Solo Energia; dashboard
  filtrado por um responsável.
- **Billing:** as linhas do T22 e do PR #13 (outra sessão) não foram lançadas — agente
  não identificado.
- "Selecionar todos" cobre as linhas carregadas; todos os filtrados fica para a v1.2.
- **Onda 3 — Receita e linha configurada** é a próxima.
