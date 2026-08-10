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
