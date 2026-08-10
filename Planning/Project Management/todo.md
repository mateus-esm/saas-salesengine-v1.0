View of Project Manager: Mateus

- We need to finish the v1 of the app.

1. AI Studio: Interface of AI for the external client interaction:

- Today we use an AI Provider / Channel Provider: GPT Maker, lets finish the v1
  of the product and after we evolve it in v2.

- need have an real sync with the GPT Maker for each alteration done work
  directly.
- Knowledge base - treinamento personalizado-> blocos de treinamento, its
  necessary can defined the name of the block.

- fix the input site train
- fix the input video train
- fix the input file train
- read and study better the api docs:
  https://developer.gptmaker.ai/api-reference/introduction

- skills: improve the intention register.

- Channels: From the Agent Provider i want that he can pull all the
  possibilities of the agent provider, made the full workflow inside the section
  and have total sync.

- Solo Ventures WPP provider,we can offer an non oficial api conection trough
  whatsmeow in qr code where the user can conect your instances, we will billing
  for it

- We also can have an option for the client that want buy an number, we can buy
  trough Salvy, so we can manage this number or only facilitate and purchase for
  it too: https://docs.salvy.com.br/api-reference/introduction

- this instances and number can add more in the monthly billing.

- Improve the area of config to have better fit and sync.

2. Develop better the area of Webhooks for have an better system control.

3. Improbe the billing area with the page for historic, better integration with
   Asaas, copilot credits, agent credits, numbers, instances, and another
   features! notifications and better ui.

4. Suporte with AI Agent, FAQ, Open Tickets directly (Will be send to admin wpp
   and also the admin panel)

5. Tutorial inside suporte with full docs and also onboarding process.

6. Improve the Admin Panel for have full 360 system vision and control,
   dashboards, permissioning withoutopen the database.

7. Improve Dashboard, have the full vision of the Sales Process, per pipeline,
   per agent, per channel, per time, per responsible, kpis and granular metrics,
   utilizing the knowledg of data analyzes with the most important metrics in
   evidence in an topdown vision.

8. Create the Toolkit area like an shop for skills, plugins, automations
   workflows, personalized projects and services.

9. Create the Clube Solo area: Refferral and Afiliatte program area for generate
   indications and track, blog and contento about business, growth, sales and an
   community with wpp group or another thing.

10. Improve the Admin Panel for have full 360 system vision and control,
    dashboards, permissioning withoutopen the database.

11. Improve the solo-copilot to be more useful, less latency and better
    features.

12. Refining the UI / UX of the pages, dark / light mode

13. Create the onboarding process

14. Create the notifications workflow

15. Adapt to mobile using, PWA, Responsive design, possibilitie of native app.

16. Full documentation of the system.

17. SEO, Tracking and Growth.

18. Landing Pages.

# TODO — do later

## Security: rotate exposed keys

Old `.env` is in git history (commit `15a4f80`) and keys were pasted in chat.
Rotate all:

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
- [ ] **Neon `neondb_owner` password** (pasted in chat 2026-08-09). Belongs to a
      *different* project, not this repo — but it was exposed here, so rotate it
      in the Neon console. Owner role = full DB access.

Note: when setting `DATABASE_URL`, URL-encode the password (`%`→`%25`,
`@`→`%40`).

## 🔴 Sprint 7.2 — FOUNDER ACTIONS (blocking, do these)

> Only the founder has these credentials. Both block real functionality today.

- [ ] **Create the `ASAAS_API_KEY` edge secret** (Supabase Dashboard → Edge
      Functions → Secrets). `sync-instance-billing` dies on startup with
      `ASAAS_API_KEY not configured`, so the **R$100/mês per connected instance
      is never charged**. Every tenant has `subscription_status = null`, so
      `asaas-subscribe` / `asaas-buy-credits` are probably inert too — worth
      auditing the whole billing path once the key exists. **Blocks T11.**
- [ ] **Verify the Netlify env vars** (Site settings → Environment variables):
      `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_ID`.
      Flagged `UNVERIFIED` by T5. Until Sprint 7.2 the client silently fell back
      to `https://placeholder-url.supabase.co` when these were missing — if any
      is unset, that alone explains a chunk of the "doesn't fetch real data"
      reports. T5 now makes it fail loudly at boot instead.

## Sprint 7 / 7.1 — live E2E still pending (needs a real phone)

> Solo API inbound was fixed 2026-08-07 (token in the URL + `solo_api` CHECK).
> Code is in prod; these need a human with a device. See
> `Planning/Sprints/sprint_7.1_studio_ai_v1_fixes_1.md` §A.2.

- [ ] Re-scan the QR and send a real message — confirm it lands in the chat and
      `unread` increments. This is the test that failed on 07/08.
- [ ] Capture the real `connection.update` sequence + a verbatim
      `messages.upsert` to close out `sprint_7_api_reference.md`.
- [ ] Coexistence echo: send from a number that is also on the agent provider and
      confirm the dedup (AC4) doesn't duplicate.
- [ ] Capture the provider's window-closed error body → refine the T5 fallback
      match (today it falls back on **any** non-2xx, which is over-broad).
- [ ] `wpp_instances.phone` is `null` on both instances — `connectionState`
      doesn't return `ownerJid`, so it should self-fill on the next pairing. If
      not, backfill from `fetchInstances`.

## Sprint 7.2 — deferred to 7.3 (decided, not forgotten)

> Scope was fix-first + settings parity. These were consciously cut. See
> `Planning/Sprints/sprint_7.2_studio_ai_v1.md` and the design spec.

### No provider API exists (verified against the live docs 2026-08-08)

- [ ] **Horário de atendimento** — no field on the settings endpoint. Would need
      enforcing in our own webhook layer before handing off to the agent.
- [ ] **Moderação de conteúdo** — no field either.
- [ ] **Google Calendar / scheduling** — the provider's integrations (Eleven
      Labs, Google Agenda, Plug Chat, E-Vendi) are **dashboard-configured only,
      no endpoints**. Revisit as a *native* scheduling intention over our own
      Agenda module rather than depending on their dashboard.

### Capability we own but haven't built

- [ ] **Intentions rebuild** (founder pt 3 + 6) — the provider exposes full CRUD
      with `fields[]` (typed collect-data), `headers`/`params`/`requestBody`, and
      `variables[].defaultFieldKey`. `IntentionWizard.tsx` is already 569 lines;
      the full schema roughly doubles it. Needs its own design pass with mockups
      — it's a UX problem, not a wiring problem.
- [ ] **Transfer Rules** — full CRUD API exists, we call none of it.
- [ ] **Idle Actions** ("ações de inatividade") — same.
- [ ] **Named training blocks** (founder pt 4) — the provider has **no
      title/name field** on a training (only `documentName` for DOCUMENT). Needs
      our own convention, e.g. a `# [Título: ...]` header parsed out of the text.
- [ ] **i18n / system language** (founder pt 2) — most expensive item on the
      list, least urgent while every client is in Brazil.
- [ ] **Niche-generic examples** (founder pt 3) — placeholder copy still uses
      Solo Energia examples for every tenant.
- [ ] **Chat channel filter** (founder pt 11) — replace the side roll-bar with a
      simple list selection like the other filters.

### Tech debt created by Sprint 7.2 (pay this down in 7.3)

- [ ] **Contract contraction — remove the legacy flat keys** from
      `manage-agent-settings`. The GET response currently returns
      `{ ...agent, ...settings, agent: {…}, settings: {…} }` because
      `BehaviorSettings.tsx`, `SettingsPage.tsx` and `UsagePage.tsx` read the
      flat keys. Once W2 migrates them to the nested shape, delete the flat
      duplication. **Do not drop it before W2 lands** — it keeps a working
      editor alive across the wave gap.
- [ ] **Training bucket is public-read** — `agent-training-docs` is
      `public: true` because the provider fetches `documentUrl` server-side
      without auth. Object names carry a random UUID so they're unguessable, but
      they are **not access-controlled**: anyone with the URL reads that tenant's
      document, and knowledge-base files can hold pricing and commercial
      material. Writes/deletes *are* correctly tenant-isolated by RLS. Revisit
      whether a signed URL with expiry works — depends on whether the provider
      re-fetches after the initial training.
- [ ] **`resumeTransferHumanAI`** is returned live but undocumented. Surfaced in
      the settings contract; decide whether to expose it in the UI.
- [ ] **Model catalog is hand-maintained.** No list endpoint exists, and the live
      API runs slugs in no published enum (`GPT_5_6_SOL`, `GPT_5_6_TERRA`,
      `GPT_5_4`). Credit costs for those three are **estimates**. Re-check when
      the provider publishes real figures.

### Found during the W2/W3 audits (real, still open)

- [ ] **Rename the `gpt-maker-webhook` edge function** — the last user-visible
      brand leak. T12 neutralized every rendered string, but the Webhooks page
      still displays `…/functions/v1/gpt-maker-webhook` for the user to copy.
      Renaming the deployed function would break every webhook already
      configured upstream by every tenant, so it needs a deliberate migration
      (deploy under a neutral slug → update tenants → retire the old slug), not
      a string edit.
- [ ] **`agent-assets` bucket has no tenant namespacing.** The pre-existing
      `uploadToStorage` helper in `KnowledgePage.tsx` writes training
      attachments to `agent-assets` at `training-attachments/{ts}-{random}.ext`
      — no `equipe_id` in the path and therefore no path-enforced isolation,
      unlike the `agent-training-docs` bucket T4 built. Align it with the T4
      pattern.
- [ ] **Billing tier amounts don't match the tier table.** `billing.md` states
      S=R$5 · M=R$12 · L=R$20 · XL=R$28, but every Sprint 7.2 row uses
      S=10 · M=20 · L=24 · XL=40 — roughly double, across 13 rows. The file
      says the R$ "comes from the table — you don't calculate anything", so
      either recalibrate the table or correct the rows. **Founder decision.**
      Until it's resolved, cost-per-engineer totals are not meaningful.

### Process notes for the next wave

- [ ] **One branch per task, cut from `main`.** In W1, T3 was stacked on T2, so
      merging T3 alone would silently have brought T2 with it.
- [ ] **Expect ledger/billing merge conflicts** — one per parallel task, since
      every branch ticks its own box and adds its own row. Resolve by keeping
      **all** rows and **all** ticks (workflow §7.5).

## State persistence (own refinement sprint — deferred from 6.8)

The whole app loses in-flight state because pages do full reloads. Symptoms:

- [ ] Filling any field and the page reloads → the input is lost.
- [ ] Navigating away discards half-finished edits / forms / open dialogs. Goal:
      no full-page reloads; preserve in-progress input and unsaved edits across
      navigation. Treat as an architectural pass (likely SPA navigation /
      optimistic state / draft autosave), not a one-off patch.

## Agenda views (fold into Agenda work)

- [x] Agenda supports **Dia / Semana / Mês** views — done in Sprint 6.8
      (`c213e41`).

## Sprint 6.8 — deferred items (select for a future sprint)

> Found in the end-of-sprint review (see `sprint_6.8_HANDOFF.md`). These are
> genuine feature builds, intentionally NOT half-implemented. Pick what to pull
> into the next sprint.

### Founder points still open

- [ ] **W7 — live-linked cross-table relation column** (point 16, headline).
      Today a custom-table "relation" column has no target-table picker and no
      relation config, so it does nothing. Needs: target-table selector on
      column create → store `relation {table, displayField}` in the column
      schema → map into `ColumnDef.relation` so the grid relation cell
      (RelationPicker / RelationChip / useRelationResolver from 6.7) resolves +
      links live (founder confirmed _live-link_, not snapshot). Files:
      `customtables/CustomTableView.tsx`, `useCustomTables` column type.
- [ ] **W4 — finish the Excel grid** (points 8, 14): column **drag-reorder** +
      **remove-column** header menu (the `useColumnLayout` reorder/hide logic
      exists but is unused; grid renders `allColumns` not `visibleColumns`);
      extend resize/reorder/sort to **Base de Contatos** (`DatabaseView.tsx`,
      never migrated to the shared grid) and **Custom Tables**.
- [ ] **W5 — sort/filter on the remaining surfaces** (point 15): newest-first
      ordering + canal/owner/ date filters inside the **Kanban**
      (`OpportunityKanban.tsx`) and **Base de Contatos** (`DatabaseView.tsx`).
      Pipeline list is done (`cba0ac5`).
- [ ] **W1 — vertical StageCard** (point 18): pipeline stage config is still the
      cramped horizontal row (`StagesEditor.tsx` SortableStageRow). Re-lay as a
      readable vertical card per the 6.8 plan.
- [ ] **Owner + date-range filters**: confirm/add an owner/assigned field on
      leads, then add owner + created-date-range filters to the GridToolbar
      across surfaces.

### Minor cleanup

- [ ] Delete dead code: `useQueryState.ts` (unused), `ResizeHandle` stub in
      `SpreadsheetGrid.tsx`, `ICPScoreBadge.tsx` / `VelocityScoreBadge.tsx` (no
      importers after the LeadScoreBadge swap).
- [ ] Fix dropped PT-BR accents in user-facing strings: `CopilotCockpit.tsx`
      "operacao", `CopilotThinkingBadge.tsx` "execucao/Historico",
      `AgendaView.tsx` dialog "Titulo/Reuniao/ Inicio/Observacoes".
- [ ] Wire the two "em breve" rail stubs on the opportunity card: **Agenda do
      card** (→ agenda_events) and **Decisões do Copilot** (→ ai_decisions
      feed).

## Sprint 6.9 — deferred items (select for a future sprint / 6.10)

> Sprint 6.9 ("Copilot, Clarified") was scoped to A (agent IA), B (pipeline
> config), C (predictability goals/scoreboard), E (kanban/card craft), G
> (navigation). The items below were consciously deferred out of 6.9. See
> `sprint_6.9_solo-copilot_evolve_v1.md`.

- [x] **Excel-style tables** (founder pts 6, 13; folds in 6.8-W4/W5) — **done in
      Sprint 6.9.1 W6/W7** (`1bb8959`, `627e456`, `cd95fd5`): per-surface layout
      persistence (drag-reorder + hide + width via
      `useColumnLayout`/`surfaceKey`), `GridToolbar` on Base de Contatos +
      Custom Tables, inline cell edit, and the **live-linked relation column**
      rebuilt for the virtual `custom_table_records` model. ⚠️ Relation column
      still needs **live (authenticated app) E2E verification** — code matches
      the proven `opportunity_links` pattern but no live DB run was performed.
- [x] **Telemetry humanization** (founder pt 3a) — **done in Sprint 6.10 W3**
      (`e865906`, `46cf399`): `humanizeEvent` (PT-BR action text, UUIDs
      stripped, local times, grouped per run). **Perceived latency** done in
      **W4** (`37cad91`): optimistic running + auto-open TelemetryHUD. ⏳ **Real
      (wall-clock) agent latency still open** — python-agent profiling / caching
      / model choice was out of scope for 6.10 (perceived-latency only). See
      below.
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

- [x] **Wire the REAL typecheck into CI/verification** — **done in Sprint 6.10
      W6** (`ead0ff5`): `.github/workflows/ci.yml` runs `npx tsc -b` before
      build; a `"typecheck": "tsc -b"` script was added in **Fixes-1 T1**
      (`6dd3df5`). The hollow `tsc --noEmit` path is no longer the gate.
- [x] **Burn down the pre-existing type-error backlog** — **done in Fixes-1 T1**
      (`6dd3df5`): all 14 errors cleared (`tsc -b` exits 0). Included a real
      **`SyncButton` TDZ runtime crash** that the green build had hidden (now
      caught by a TDD render test). `mockChatData.ts` had already been removed
      in W8 cleanup.
- [x] **Scoreboard `profiles` query scoping** + **per-owner run-rate** — **done
      in Sprint 6.10 W7** (`111f6ed`): profiles query equipe-scoped; per-owner
      run-rate added. (Deeper rep-level activity targets / projection-vs-pace
      remain partial — see fast-follow.)

## Sprint 6.10 fast-follow (deferred out of 6.10 / Fixes 1 — by design)

> Sprint 6.10 closed the deferred founder points + the silent-gate tech debt.
> These remain open; see `sprint_6.10_solo-copilot_evolve_v1.md` (Review 1 +
> Fixes 1).

- [ ] **W7 relation column LIVE E2E** _(authenticated app required)_: pick a
      target custom table → link a record → confirm the chip resolves live
      against `custom_table_records`. The Fixes-1 T5 **code-level re-audit**
      verdict is "Correct, matches `opportunity_links`" (see
      `Sprints_PM_Handoff.md` §Sprint 6.10 W7 re-audit), but **no live DB run
      was performed**.
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
      Investigate (jsdom env setup ~80s/file) or pin the flag in the test
      script.
