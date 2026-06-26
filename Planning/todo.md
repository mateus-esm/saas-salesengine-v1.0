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
- [ ] **Telemetry humanization + agent latency** (founder pt 3): streaming responses
      / progress indicators for perceived latency; further humanize agent telemetry
      output beyond the 6.8 pass.
- [ ] **Sync persistence across navigation** (founder pts 2, 10, 12): keep the sync
      badge/job visible after navigating away and back (CRM sweep + per-card sync).
      Overlaps the "State persistence" architectural item above — treat as one
      architectural pass, not a bolt-on.
- [ ] **Agenda week grid** (founder pt 16): Google-Calendar-style time-grid week
      view (day-by-day columns with hour rows), beyond the existing Dia/Semana/Mês
      from 6.8. Copy Google's layout.

## Tech debt surfaced during Sprint 6.9 review (do soon)
> Found while reviewing 6.9. Not feature work — guardrails + cleanup.

- [ ] **Wire the REAL typecheck into CI/verification** *(important — silent gate)*.
      Root `tsconfig.json` is `files: []` + references-only, so `tsc --noEmit`
      typechecks **nothing** (always exit 0). Every "tsc clean" claim so far has been
      hollow. Use `tsc -b` (or `tsc -p tsconfig.app.json`) in the build/CI gate. This
      is how the `useQueryClient` runtime-crash regression in `RevenueGoalsForm.tsx`
      slipped past "build green."
- [ ] **Burn down the pre-existing type-error backlog** that the real typecheck
      exposes (none block the Vite/SWC build, but they erode the safety net):
      `useRelationResolver.ts` (Supabase query result casts), `mockChatData.ts`
      (`completed` not on `Task`), `usePipelines.ts` (`icp_weights` missing on
      normalized row), `usePipelineStagesV2.ts` (cycle_* fields), `OpportunityTable.tsx`
      (`ColumnKind` / link-unlink union), `AgentRulesPanel.tsx` + `CustomFieldsEditor.tsx`
      (missing `ciclo` / `file` keys in `Record<…>`), `useSubtasks.ts` (excessively
      deep instantiation).
- [ ] **Per-owner predictability depth**: rep-level activity targets + projection-vs-pace
      (today per-owner is deals/revenue goals only; the run-rate/funnel math is
      pipeline-level).
- [ ] **Scoreboard `profiles` query is unscoped** (`select id,name` with no equipe
      filter; relies on RLS). Tighten to the equipe if RLS ever loosens.
