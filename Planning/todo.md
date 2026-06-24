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
