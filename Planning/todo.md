# TODO — do later

## Security: rotate exposed keys
Old `.env` is in git history (commit `15a4f80`) and keys were pasted in chat. Rotate all:

- [ ] Supabase service-role key
- [ ] Supabase access token
- [ ] Supabase JWT secret
- [ ] Database password
- [ ] OpenAI key
- [ ] Anthropic key
- [ ] Gemini key
- [ ] Groq key
- [ ] Verboo key
- [ ] `AGENT_INTERNAL_TOKEN`

Note: when setting `DATABASE_URL`, URL-encode the password (`%`→`%25`, `@`→`%40`).

## State persistence (own refinement sprint — deferred from 6.8)
The whole app loses in-flight state because pages do full reloads. Symptoms:
- [ ] Filling any field and the page reloads → the input is lost.
- [ ] Navigating away discards half-finished edits / forms / open dialogs.
Goal: no full-page reloads; preserve in-progress input and unsaved edits across navigation. Treat as an architectural pass (likely SPA navigation / optimistic state / draft autosave), not a one-off patch.

## Agenda views (fold into Agenda work)
- [x] Agenda supports **Dia / Semana / Mês** views — done in Sprint 6.8 (`c213e41`).

## Sprint 6.8 — deferred items (select for a future sprint)
> Found in the end-of-sprint review (see `sprint_6.8_HANDOFF.md`). These are genuine
> feature builds, intentionally NOT half-implemented. Pick what to pull into the next sprint.

### Founder points still open
- [ ] **W7 — live-linked cross-table relation column** (point 16, headline). Today a custom-table
      "relation" column has no target-table picker and no relation config, so it does nothing.
      Needs: target-table selector on column create → store `relation {table, displayField}` in the
      column schema → map into `ColumnDef.relation` so the grid relation cell (RelationPicker /
      RelationChip / useRelationResolver from 6.7) resolves + links live (founder confirmed
      *live-link*, not snapshot). Files: `customtables/CustomTableView.tsx`, `useCustomTables` column type.
- [ ] **W4 — finish the Excel grid** (points 8, 14): column **drag-reorder** + **remove-column** header
      menu (the `useColumnLayout` reorder/hide logic exists but is unused; grid renders `allColumns`
      not `visibleColumns`); extend resize/reorder/sort to **Base de Contatos** (`DatabaseView.tsx`,
      never migrated to the shared grid) and **Custom Tables**.
- [ ] **W5 — sort/filter on the remaining surfaces** (point 15): newest-first ordering + canal/owner/
      date filters inside the **Kanban** (`OpportunityKanban.tsx`) and **Base de Contatos**
      (`DatabaseView.tsx`). Pipeline list is done (`cba0ac5`).
- [ ] **W1 — vertical StageCard** (point 18): pipeline stage config is still the cramped horizontal
      row (`StagesEditor.tsx` SortableStageRow). Re-lay as a readable vertical card per the 6.8 plan.
- [ ] **Owner + date-range filters**: confirm/add an owner/assigned field on leads, then add owner +
      created-date-range filters to the GridToolbar across surfaces.

### Minor cleanup
- [ ] Delete dead code: `useQueryState.ts` (unused), `ResizeHandle` stub in `SpreadsheetGrid.tsx`,
      `ICPScoreBadge.tsx` / `VelocityScoreBadge.tsx` (no importers after the LeadScoreBadge swap).
- [ ] Fix dropped PT-BR accents in user-facing strings: `CopilotCockpit.tsx` "operacao",
      `CopilotThinkingBadge.tsx` "execucao/Historico", `AgendaView.tsx` dialog "Titulo/Reuniao/
      Inicio/Observacoes".
- [ ] Wire the two "em breve" rail stubs on the opportunity card: **Agenda do card** (→ agenda_events)
      and **Decisões do Copilot** (→ ai_decisions feed).

## Sprint 6.9 — deferred items (select for a future sprint / 6.10)
> Sprint 6.9 ("Copilot, Clarified") was scoped to A (agent IA), B (pipeline config),
> C (predictability goals/scoreboard), E (kanban/card craft), G (navigation). The
> items below were consciously deferred out of 6.9. See
> `sprint_6.9_solo-copilot_evolve_v1.md`.

- [x] **Excel-style tables** (founder pts 6, 13; folds in 6.8-W4/W5) — **done in
      Sprint 6.9.1 W6/W7** (`1bb8959`, `627e456`, `cd95fd5`): per-surface layout
      persistence (drag-reorder + hide + width via `useColumnLayout`/`surfaceKey`),
      `GridToolbar` on Base de Contatos + Custom Tables, inline cell edit, and the
      **live-linked relation column** rebuilt for the virtual `custom_table_records`
      model. ⚠️ Relation column still needs **live (authenticated app) E2E
      verification** — code matches the proven `opportunity_links` pattern but no
      live DB run was performed.
- [x] **Telemetry humanization** (founder pt 3a) — **done in Sprint 6.10 W3**
      (`e865906`, `46cf399`): `humanizeEvent` (PT-BR action text, UUIDs stripped,
      local times, grouped per run). **Perceived latency** done in **W4**
      (`37cad91`): optimistic running + auto-open TelemetryHUD. ⏳ **Real
      (wall-clock) agent latency still open** — python-agent profiling / caching /
      model choice was out of scope for 6.10 (perceived-latency only). See below.
- [x] **Sync persistence across navigation** (founder pts 2, 10, 12) — **done in
      Sprint 6.10 W2** (`4525802`, `f17f225`) via `useSyncJobPersistence`
      (localStorage-backed; badge restores from the persisted job on mount,
      survives navigate-away + reload). State-persistence anchor was **W1**
      (`9d9f3b3`, `useDraftAutosave`) — full-page-reload input loss addressed.
- [x] **Agenda week grid** (founder pt 16) — **done in Sprint 6.10 W5**
      (`e2f777b`): Google-Calendar time-grid week (day columns × hour rows,
      events positioned by time, "now" indicator). ⚠️ Minor: multi-day /
      cross-midnight events not handled (Review-1 M4 — see fast-follow below).

## Tech debt surfaced during Sprint 6.9 review (do soon)
> Found while reviewing 6.9. Not feature work — guardrails + cleanup.

- [x] **Wire the REAL typecheck into CI/verification** — **done in Sprint 6.10 W6**
      (`ead0ff5`): `.github/workflows/ci.yml` runs `npx tsc -b` before build; a
      `"typecheck": "tsc -b"` script was added in **Fixes-1 T1** (`6dd3df5`). The
      hollow `tsc --noEmit` path is no longer the gate.
- [x] **Burn down the pre-existing type-error backlog** — **done in Fixes-1 T1**
      (`6dd3df5`): all 14 errors cleared (`tsc -b` exits 0). Included a real
      **`SyncButton` TDZ runtime crash** that the green build had hidden (now
      caught by a TDD render test). `mockChatData.ts` had already been removed in
      W8 cleanup.
- [x] **Scoreboard `profiles` query scoping** + **per-owner run-rate** — **done in
      Sprint 6.10 W7** (`111f6ed`): profiles query equipe-scoped; per-owner
      run-rate added. (Deeper rep-level activity targets / projection-vs-pace
      remain partial — see fast-follow.)

## Sprint 6.10 fast-follow (deferred out of 6.10 / Fixes 1 — by design)
> Sprint 6.10 closed the deferred founder points + the silent-gate tech debt.
> These remain open; see `sprint_6.10_solo-copilot_evolve_v1.md` (Review 1 + Fixes 1).

- [ ] **W7 relation column LIVE E2E** *(authenticated app required)*: pick a target
      custom table → link a record → confirm the chip resolves live against
      `custom_table_records`. The Fixes-1 T5 **code-level re-audit** verdict is
      "Correct, matches `opportunity_links`" (see `Sprints_PM_Handoff.md` §Sprint
      6.10 W7 re-audit), but **no live DB run was performed**.
- [ ] **Real (wall-clock) agent latency**: python-agent profiling / response
      caching / model choice. 6.10 W4 delivered **perceived** latency only
      (streaming/optimistic/HUD), not backend speed.
- [ ] **Per-owner predictability depth**: rep-level activity targets +
      projection-vs-pace (per-owner is still deals/revenue + run-rate; full
      funnel math is pipeline-level). Review-1 W7-2: verify per-owner
      `computeRunRate` doesn't reuse pipeline-scope `elapsed`/`total`.
- [ ] **Review-1 Minors** (non-blocking polish): M1 `humanizeEvent` exposes
      internal `move_stage` label; M2 `CopilotThinkingBadge` done/running race;
      M3 SyncButton 1s auto-open timer not cancelled on fast toggle; M4 Agenda
      week grid multi-day / cross-midnight events; M5 Agenda UTC↔local DST
      round-trip; `useDraftAutosave.isDirty` is `JSON.stringify` field-order
      sensitive.
- [ ] **Vitest worker-pool timeout** (env/infra): default parallelism times out
      workers in this environment; tests must run with `--no-file-parallelism`.
      Investigate (jsdom env setup ~80s/file) or pin the flag in the test script.
