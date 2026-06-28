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
