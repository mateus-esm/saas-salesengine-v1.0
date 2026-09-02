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

# TODO — vindo do Sprint 8.2 (onboarding)

## Segurança: duas fontes de verdade para "quem é admin" — URGENTE

`is_super_admin()` lê `profiles.role`. `useRole()` no frontend lê
`user_roles.role`. São tabelas diferentes, e elas discordam hoje em produção.

Consequência real, encontrada em 02/09: `wi@walteringlezadv.com.br` — um cliente
— estava com `profiles.role = 'super_admin'`, o que libera o RLS de `proposals`,
`proposal_items`, `proposal_acceptances`, `system_settings` e
`notification_senders`. Pela API, esse login lia a proposta de todos os outros
clientes, com preço negociado e aceite. A interface nunca mostrou o painel para
ele, porque lê a outra tabela — e foi justamente isso que escondeu o problema.

O bloco C de `supabase/scripts/2026-09-02_producao_limpeza.sql` estanca o caso.
Falta a correção estrutural:

- [ ] Escolher UMA fonte de verdade (`user_roles` é a certa: existe uma linha por
      papel, e é a tabela que o resto do RBAC usa)
- [ ] `is_super_admin()` passa a ler de lá
- [ ] Um CHECK ou trigger que impeça `profiles.role = 'super_admin'` quando
      `equipe_id is not null` — um super admin nunca pertence à equipe de um cliente
- [ ] Uma tela no admin que mostre os dois papéis lado a lado, para o
      descasamento ficar visível em vez de silencioso
- [ ] Auditar o que esse login acessou (Supabase → Logs → PostgREST)

## Onboarding — o que ficou de fora do 8.2

- [ ] **Portal do cliente**: ele acompanha o próprio onboarding, vê em que etapa
      está e o que falta dele. Hoje o quadro é só interno.
- [ ] **Calendly de verdade**: ler o agendamento pela API e mover o card de
      Boas-vindas para Discovery sozinho. Depende de OAuth do Calendly.
      Hoje o link é enviado e a data é anotada à mão.
- [ ] **Checklist por etapa**: as entregas concretas da implantação (treinar
      agente, conectar canal, montar pipeline, n8n dos anúncios) como itens
      marcáveis que bloqueiam o go-live enquanto não estiverem prontos.
- [ ] **Templates de implantação por nicho**: o checklist acima, pré-preenchido
      por vertical. Só faz sentido com mais volume.
- [ ] **Assinatura eletrônica do contrato** no aceite da proposta.
- [ ] **Coletar CPF/CNPJ dos clientes legados** — Casa Flow, Jornada do R1,
      Cinemas Benficas, Lucas Castelo, Be My Guest e WI estão todos sem
      `doc_number`, então nenhuma cobrança pode ser aberta para eles. É operação
      comercial, não código, mas trava o faturamento.
- [ ] **Logo em SVG no e-mail**: hoje o cabeçalho é o wordmark em texto sobre a
      faixa laranja. Um SVG inline ficaria melhor, mas depende de um arquivo de
      design que não existe no repositório.

## Dívida técnica encontrada no caminho

- [ ] `src/integrations/supabase/types.ts` está desatualizado desde o sprint 8.4:
      não conhece `system_settings`, `notification_senders` nem
      `v_admin_notification_matrix`, e isso deixa **7 erros de typecheck** no
      `main` desde antes do 8.2. Regenerar (passo 4 do `docs/runbook_sprint82.md`)
      e trocar os `supabase as any` de `useOnboarding.ts` e `ProposalsTab.tsx`
      pelo cliente tipado.
- [ ] `billing-cron` anula fatura sem cobrança depois de 2h. Com a fatura de
      implantação agora nascendo no provisionamento e só sendo cobrada no
      go-live (`on_golive`), essa regra pode anular uma fatura legítima que está
      apenas esperando. **Conferir antes de o primeiro cliente `on_golive`
      passar de 2h em implantação.**

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

## 🟠 SPRINT 7.3 — CODE DONE, NOT DEPLOYED

> Branch `sprint/7.3-provider-parity`. Spec:
> `docs/superpowers/specs/2026-08-14-studio-ai-provider-parity-design.md`.
> Verified: `tsc -b` clean · `vite build` OK · 26 Deno tests · 71 FE tests.
> **Deploy is manual** — none of this is live until the commands below run.

### 🔴 Deploy these five functions

```bash
supabase functions deploy manage-agent-channels      --project-ref egxzsivzqlqadoqpgfby
supabase functions deploy manage-agent-settings      --project-ref egxzsivzqlqadoqpgfby
supabase functions deploy manage-agent-webhooks      --project-ref egxzsivzqlqadoqpgfby
supabase functions deploy manage-agent-idle-actions  --project-ref egxzsivzqlqadoqpgfby
supabase functions deploy manage-agent-transfer-rules --project-ref egxzsivzqlqadoqpgfby
```

The three new ones keep the default `verify_jwt = true` (they authenticate the
caller's JWT internally, like `manage-agent-settings`) — no `config.toml` entry
needed. Frontend deploys via Netlify on merge.

⚠️ `manage-agent-settings` **must** ship together with the frontend: its GET
response dropped the legacy flat keys. Old JS against the new function is fine
(nothing reads them), but do not deploy the function and then roll the
frontend back past 7.2 W2.

### What shipped

- **Canais** — root cause was `manage-agent-channels` branching on
  `req.method === 'POST'` and then parsing an empty body; `invoke()` defaults to
  POST, so the listing branch was unreachable. Now dispatches on action.
- **Knowledge Base** — Perfil and Contexto were write-only and opened blank over
  real data. Both load on mount. Truncation caps removed from the load path.
- **Config** — 4 tabs; added `resumeTransferHumanAI`; moved `onLackKnowLedge` to
  Webhooks (it lives on that resource, which is why it never worked in
  Settings); new idle-actions and transfer-rules editors.
- **Models** — + Sonnet 5, + Sonnet 4.6; `OPEN_AI_04` spelling corrected.

### Verify in the running app after deploying

1. **Canais** — 5 channels on Solo Energia, each showing its phone/@handle.
2. **Knowledge Base** — Perfil opens with Solon's real prompt in *Texto Livre*;
   Contexto shows the real company description.
3. **Configurações** — all 4 tabs load; toggle something, reload, it stuck.
4. **Regras de transferência** — the "cliente irritado" rule appears with
   *Mateus Sombra* as its target.
5. **Modelo** — pick Sonnet 5. If the slug is wrong you get an explicit
   provider error, not silence — report it and the catalog gets corrected.

## 🔴 SPRINT 7.2 CLOSE-OUT — WHAT IS STILL MISSING

> Sprint 7.2 closed 2026-08-10; all 13 tasks merged and deployed. Handoffs for
> Sprints 7, 7.1 and 7.2 are in `Sprints_PM_Handoff.md`. What follows is
> everything that is genuinely **not done**.

### The one thing that decides whether the sprint worked

- [ ] **Open Studio AI and look.** Everything is verified at the API layer —
      settings round-trip live, the model catalog is real, a DOCUMENT training
      round-trips, RLS was read out of `pg_policies` in prod — but **no human
      has confirmed it in the running app.** Check, in order:
      1. **Configurações** — toggle a control, reload, it stuck.
      2. **Modelo** — the selector shows the *current* model pre-selected and a
         real catalog; change it, reload, it stuck.
      3. **Canais** — real channels list (5 expected on Solo Energia).
      4. **Uso & Analytics** — real balance and per-model breakdown, no
         fabricated numbers.
      5. **Knowledge Base** — upload a PDF; it appears without a manual reload.
      6. **Billing** — the Solo API instances section renders.
      If any of these is wrong, it is a *new* bug: the API layer is proven.

### Founder actions (only you have these credentials)

- [x] ~~**Create the `ASAAS_API_KEY` edge secret**~~ ✅ **DONE 2026-08-10.**
      `sync-instance-billing` no longer dies on startup — its error moved past
      the key check. Billing can post for the first time.
- [ ] 🔴 **ROTATE the Asaas production key.** It was pasted in plaintext into a
      chat transcript on 2026-08-10. It is an `aact_prod_` key: anyone with
      transcript access can charge your customers. Rotate in Asaas, then update
      the edge secret (`supabase secrets set --env-file …`) and the local `.env`.
- [ ] **Audit the rest of the billing path now that the key exists.** Every
      tenant still has `subscription_status = null` and `asaas_subscription_id
      = null`, so `asaas-subscribe` and `asaas-buy-credits` have likely never
      run successfully either. The key was the blocker; whether the flows work
      is untested.
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

- [ ] **Horário de atendimento** — no field on the settings endpoint and no
      agent-level route (re-verified 2026-08-14: 8 path variants all 404).
      Would need enforcing in our own webhook layer before handing off to the
      agent. **Partial workaround now shipped:** idle actions carry a
      per-action `workingHours` (`dayWeek` 0–6 × `HH:MM` blocks) — supported by
      `manage-agent-idle-actions`, though the 7.3 UI only exposes the
      allow-all-hours toggle. Deferred by founder decision 2026-08-14.
- [ ] **Moderação de conteúdo** — no field and no route either (4 variants
      probed 2026-08-14). The provider's docs "Moderation" section is
      human-takeover (`/chats/start-human`), not content moderation. Deferred
      by founder decision 2026-08-14.
- [ ] **Google Calendar / scheduling** — the provider's integrations (Eleven
      Labs, Google Agenda, Plug Chat, E-Vendi) are **dashboard-configured only,
      no endpoints**. Revisit as a *native* scheduling intention over our own
      Agenda module rather than depending on their dashboard.

### Capability we own but haven't built

- [x] ~~**Transfer Rules**~~ ✅ **DONE Sprint 7.3** — `manage-agent-transfer-rules`
      (full CRUD) + `TransferRulesTab`, human targets from
      `/workspace/{id}/team`.
- [x] ~~**Idle Actions**~~ ✅ **DONE Sprint 7.3** — `manage-agent-idle-actions`
      + `IdleActionsTab`. Exposed as get/save, not per-item CRUD: the
      provider's POST replaces the whole configuration.
- [ ] **Intentions rebuild** (founder pt 3 + 6) — the provider exposes full CRUD
      with `fields[]` (typed collect-data), `headers`/`params`/`requestBody`, and
      `variables[].defaultFieldKey`. `IntentionWizard.tsx` is already 569 lines;
      the full schema roughly doubles it. Needs its own design pass with mockups
      — it's a UX problem, not a wiring problem.
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

- [x] ~~**Contract contraction — remove the legacy flat keys**~~ ✅ **DONE
      Sprint 7.3.** `manage-agent-settings` GET now returns just
      `{ agent, settings }`. Verified no consumer reads the flat keys:
      `UsagePage` and `ModelSelector` were already on the nested shape and
      `BehaviorSettings.tsx` / `AIKnowledgeBase.tsx` were deleted as dead code.
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
- [ ] **Model catalog is hand-maintained.** No list endpoint exists (re-verified
      2026-08-14: `/models`, `/workspace/{id}/models`, `/agent/{id}/models` all
      404, and the provider's own endpoint index has no such route). The live
      API runs slugs in no published enum (`GPT_5_6_SOL`, `GPT_5_6_TERRA`,
      `GPT_5_4`). Credit costs for those three are **estimates**.
- [ ] 🟡 **Confirm the two new Claude slugs.** Sprint 7.3 added
      `CLAUDE_5_SONNET` and `CLAUDE_4_6_SONNET` because the founder confirmed
      Sonnet 5 / Sonnet 4.6 are in the provider's dropdown, but the ids are
      **derived from the naming pattern, not observed**. Selecting one in the
      app confirms it (a wrong slug returns the provider's error body verbatim
      via `upstreamError`). Correct the catalog once observed.

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

## Surfaced while verifying Sprint 8.2 in production (24/08/2026)

> Found tracing why granted credits never reached a balance. The credit path
> itself is fixed (migrations `20260824000100` + `20260824000200`); these are the
> loose ends that trace turned up.

- [ ] **Sprint 9 signup OVERWRITES an existing profile instead of refusing.**
      Accepting a proposal moves the accepting user's `profiles.equipe_id` to
      the newly provisioned team and resets `role` to `owner` — it does not
      check whether that user already belongs to one. Reproduced live on
      2026-08-24: testing the go-live flow with `mateussmaia95@gmail.com`
      (super_admin) silently made it `owner` of the new team "Solo Teste", off
      its previous team. **A real customer who is already a user and accepts a
      second proposal is moved out of their current team the same way**, losing
      access to everything scoped to it. Decide the intended behaviour first —
      refuse with "this e-mail already has an account", provision under a
      different e-mail, or support one user in several teams (a schema change:
      `profiles` is one row per user today). See
      `supabase/migrations/20260821000500_sprint9_provision_with_trial.sql`.

- [ ] **A tenant on trial has no credits, so its agent is paused as
      `no_credits`.** Credits only enter `credit_ledger` when an invoice is
      paid, and a trial issues none. **This is the founder's decision as of
      24/08, not a bug**: the trial exists to configure the product, and credit
      is granted by hand from Faturamento when a team should go live. Recorded
      here so nobody "fixes" it by auto-granting at provisioning. Revisit only
      if trials start needing a working agent unattended.

- [ ] **A proposal with no plan produces a contract that bills but entitles
      nothing.** When `proposals.chosen_plan_code` is null and no proposal line
      maps to a `billing_products` row, provisioning falls back to inserting a
      `contract_items` line with `product_id = NULL` carrying the headline
      monthly price ("a proposal with neither a chosen plan nor line items still
      sells its headline monthly price"). MRR is right — the admin view sums
      `unit_price * quantity` regardless of product — but **every entitlement
      number joins `billing_products`**, so seat_limit, agent_limit, included
      credits, instance_limit and builder_hours all come back null/0. Live case:
      "Solo Teste" (proposal `73F74E2BB4F1`) holds exactly one item,
      `product_id NULL` at R$200/month, and reads as entitled to nothing.
      Decide whether a productless line should be rejected at acceptance, map to
      a default plan, or carry its own entitlement metadata. See
      `20260821000500_sprint9_provision_with_trial.sql` §4.

- [ ] **`equipes.creditos_avulsos` / `limite_creditos` still have live readers.**
      Both are deprecated and pinned at 0 (Sprint 8.2), but `fetch-gpt-credits`,
      `Suporte.tsx` and `AuthContext` still select them, which is why the
      migration zeroed rather than dropped the columns. Cut those three readers
      over to `credit_balance(equipe_id, pool)`, then drop the columns.

## Sprint 8.3 — Fixes 2, bloco A (entregue 24/08/2026)

> Itens 6, 8, 9 e 10 do `sprint_8.1_billing_v1_fixes.md`. O item 7 já tinha sido
> resolvido pela migration `20260824000200`. Migration `20260824000300` aplicada
> em produção; `admin-billing-ops`, `asaas-webhook` e `billing-cron` no ar.

- [x] **6 · Gerenciar e cancelar faturas.** Cancelar (`void`, com motivo, mantém
      histórico) + apagar apenas rascunho sem cobrança + marcar paga na mão +
      fatura avulsa + editar valor/vencimento. Toda ação cancela ou atualiza a
      cobrança no Asaas junto — `cancelPayment`/`updatePayment` não existiam.
      Cancelar a única fatura vencida de um contrato também tira o contrato de
      `past_due`, senão o cliente seguia punido por uma cobrança que não existe
      mais.
- [x] **8 · Excluir proposta.** Permitido só enquanto a proposta não virou
      equipe; depois disso ela é o documento de origem de um contrato vivo e o
      servidor recusa.
- [x] **9 · Retirar créditos.** Já funcionava (valor negativo grava
      `adjustment`); o rótulo dizia só "Conceder" e escondia isso.
- [x] **10 · O que o Provisionar faz.** Ele sempre criou equipe, perfil,
      convite, contrato (em trial), itens e fatura de setup — e sempre devolveu
      todos esses ids. O painel jogava fora e mostrava um toast. Agora mostra o
      recibo do que foi criado.

**Decisão de arquitetura que vale lembrar:** os efeitos de "fatura paga" saíram
do `asaas-webhook` para `_shared/invoice-effects.ts`. Marcar paga na mão dispara
exatamente o mesmo caminho do pagamento real — créditos do plano, renovação do
período, religar o agente — e as chaves de idempotência são por fatura, então
marcar na mão e depois receber a confirmação do Asaas credita uma vez só.

**Armadilha resolvida:** `voidOrphanInvoices` cancelava toda fatura em aberto sem
cobrança no gateway após 2h. Uma fatura avulsa para receber por PIX é
indistinguível desse lixo — passou a ser marcada com `metadata.manual` e o cron
a respeita.

### Ainda aberto do Fixes 2

- [ ] **11 · Notificações (bloco B).** O núcleo já existe: `notifications`,
      `notification_deliveries` (in_app/email/whatsapp), `notification_types`
      com matriz de canais, dispatcher com Resend e `sendViaSolo`. Falta o que
      o founder pediu: instância Solo por finalidade (Comercial/Financeiro/
      Suporte/Operação), tela para conectar por QR ou por nome, templates
      editáveis (hoje o texto está escrito na mão em cada chamador), liga/desliga
      por cliente, e o disparo "Proposta Gerada → cliente recebe no WhatsApp".
      Precisa de desenho próprio antes de codar.
- [ ] **12 · Revisão geral do billing/admin.** Não é tarefa isolada — é critério
      de aceite a aplicar sobre os outros itens.

## Sprint 8.4 — Fixes 2, bloco B: notificações (entregue 25/08/2026)

> Item 11 do `sprint_8.1_billing_v1_fixes.md`. Migration `20260824000400`
> aplicada em produção; `admin-notifications` criada, `notification-dispatcher`
> redeployado. Nova aba **Notificações** no admin.

- [x] **Instância por finalidade.** `notification_senders` com Comercial,
      Financeiro, Suporte e Operação. Antes existia UMA instância para tudo,
      num env var — cobrança e follow-up de venda saíam da mesma linha. Pode
      escolher uma instância conectada no produto ou digitar o nome de uma que
      já existe na VPS. Botão de teste envia de verdade sem gravar histórico.
- [x] **Templates editáveis.** O texto de cada notificação estava escrito na mão
      dentro das edge functions — mudar uma palavra exigia deploy. Agora vive em
      `notification_types.template_*` com `{{variáveis}}`; quando existe, vence o
      texto do código. Variável não fornecida some, o cliente nunca vê `{{x}}`.
- [x] **Liga/desliga por cliente.** `notification_policies`: por cliente e por
      tipo, decide se envia, por quais canais, se é automático e para qual
      número/e-mail. É distinto de `notification_preferences`, que é do cliente
      e só consegue reduzir. A política é o teto; a preferência do cliente
      abaixa mais. Ninguém opta por receber o que a plataforma não liberou.
- [x] **Proposta no WhatsApp do cliente.** Era impossível: `notifications.
      equipe_id` era NOT NULL e quem recebe proposta ainda não é tenant. Agora é
      anulável com `proposal_id` e contatos próprios — e a RLS continua fechada
      porque todo filtro usa `equipe_id IN (...)`, que NULL nunca satisfaz.
- [x] **Chave da Resend no painel.** `system_settings`, só super admin, e o
      valor nunca volta para a tela. Vazio = usa a variável de ambiente.

**Removido de propósito:** o dispatcher só mandava WhatsApp para severidade
`warn`+, hardcoded. Isso tornava o resto inalcançável — um tipo podia declarar
whatsapp e nunca enviar. Quem decide agora é `notify()`, a partir do tipo
estreitado pela política do cliente.

### Falta configurar (não é código)

- [ ] **Escolher a instância de cada finalidade** na aba Notificações. Todas
      estão vazias hoje, então caem na instância padrão da plataforma
      (`SOLO_PLATFORM_INSTANCE_ID`); se esse env var não estiver setado, o canal
      WhatsApp é pulado e só e-mail e in-app saem.
- [x] **Agendar o cron do `notification-dispatcher`** — feito em 25/08. Os três
      jobs (`sprint8_billing_tick`, `sprint8_dispatch_tick`,
      `sprint8_reconcile_tick`) estão ativos; o dispatcher roda de minuto em
      minuto e drenou na primeira execução a fila parada desde 24/08.

- [ ] **Verificar o domínio na Resend.** É o único ponto que sobrou do canal de
      e-mail: as 11 entregas falharam com `403: The soloventures.com.br domain
      is not verified`. WhatsApp e in-app saem normalmente. Verificar em
      https://resend.com/domains — precisa de acesso ao DNS, ninguém mais faz
      isso. O código já avisava disso: o comentário em `brandFor` conta que a
      produção recusou os domínios por nicho pelo mesmo motivo.

## Sprint 8.5 — Fixes 3 (entregue 25/08/2026)

> Itens 13, 14 e 15 do `sprint_8.1_billing_v1_fixes.md`. Migration
> `20260825000100` aplicada; `admin-notifications` e `notification-dispatcher`
> redeployados.

- [x] **13 · Mensagem de teste não chegava no WhatsApp.** Causa raiz: os
      caminhos de SAÍDA (dispatcher e teste do painel) cada um refez sua própria
      normalização de telefone, que só tirava não-dígitos. Um número digitado à
      mão — `85996487923` — ia para a Solo API **sem o código do país**. A API
      aceita, devolve `key.id`, gravamos `sent`, e nada chega: o JID não existe.
      Sucesso silencioso é o pior modo de falha possível num sistema de
      notificação.

      O `_shared/phone.ts` já resolvia isso desde o Sprint 5.5 (prepende 55,
      insere o nono dígito, e não confunde DDD 55 do RS com código de país) —
      **só os webhooks de ENTRADA o importavam**. Por isso o chat sempre
      funcionou: os telefones dele vêm de leads, já normalizados na entrada.
      Agora os dois caminhos de saída usam o mesmo normalizador, com
      `phone.test.ts` fixando o contrato (6 testes).

- [x] **14 · CRUD de modelos + escolha de canal.** Criar, editar, apagar e
      decidir por onde sai (app, e-mail, WhatsApp, todos, nenhum). Nenhum canal
      marcado = a notificação é registrada e não entregue, que é como se
      silencia um aviso do sistema. Modelos criados à mão viram tipos
      `custom.*` e ganham "enviar agora" para um cliente — sem isso um modelo
      que nenhum código dispara seria peso morto.

      **Modelo do sistema não pode ser apagado.** Cada um é emitido por uma
      chamada de `notify()` dentro de uma edge function, e `notify()` levanta
      `unknown_notification_type` quando o tipo some — apagar transformaria
      "removi um modelo" em "a confirmação de pagamento passou a estourar".

- [x] **15 · Erro ao enviar proposta.** Duas coisas, uma delas não era bug: a
      proposta **foi enviada** (WhatsApp `sent`), só o e-mail falhou. O toast
      dizia "Enviada com falhas" em vermelho sempre que qualquer canal falhasse
      — e o e-mail sempre falha enquanto o domínio não estiver verificado. Agora
      o aviso nomeia primeiro o canal que deu certo, e só fica vermelho quando
      nada chegou ao cliente. O erro cru da Resend também virou frase
      acionável em vez de JSON.

### Falta, e não é código

- [ ] **Verificar o domínio na Resend.** Continua sendo o único motivo do canal
      de e-mail falhar — agora em `soloenergia.com.br`, que foi configurado como
      remetente do Comercial. Verificar em https://resend.com/domains.
- [ ] **Confirmar que a mensagem de teste chega.** A causa raiz está corrigida e
      provada por duas evidências independentes (a referência da API documenta
      `"number": "5511999999999"`, e todo telefone que funciona no banco tem o
      55 enquanto nenhum dos que falham tem), mas **a chegada só quem confirma é
      quem tem o aparelho**. Reprocessei a entrega da proposta às 03:53 com o
      número corrigido.

## Sprint 8.5 — três problemas de produção (25/08/2026)

> Reportados juntos: recarga que não muda nada, e-mail recusado, e consumo do
> Studio AI parecendo de outro cliente. Os dois primeiros tinham a MESMA causa
> de fundo: comparar janelas de tempo diferentes como se fossem a mesma.

- [x] **Recarga de crédito não mudava nada.** Os créditos ENTRAVAM (500 às
      05:20, 500 às 05:21). O que os engolia era um lançamento de **−7000** que
      o `credits-reconcile` fez às 04:30, na primeira execução depois que agendei
      o cron. Ele pergunta ao GPT Maker o gasto do **mês calendário** e compara
      com o que o nosso ledger registrou — só que o primeiro lançamento do
      `credit_ledger` é de 24/08 16:06. Comparou 24 dias de provider contra 1 dia
      de ledger e cobrou a diferença.

      Como `credit_balance` é `greatest(0, soma)`, o buraco ficava **invisível**:
      o saldo mostrava 0 e cada recarga nova desaparecia dentro dele sem deixar
      rastro na tela. Casa Flow −8040, Solo Energia −7000, Walter Inglez −20.

      Reparo em `20260825000200` (estorno com lançamento positivo, não delete —
      o ledger é append-only e o cliente tem direito de ver o erro e a correção).
      Causa corrigida: um mês em que a medição começou no meio é **pulado**, e o
      relatório do job diz quais equipes pulou. Pular é a única saída honesta —
      a API do provider só responde por mês fechado e ratear seria um palpite
      cobrado do cliente.

- [x] **E-mail recusado pela Resend.** O domínio verificado é
      `comercial.soloenergia.com.br`, um **subdomínio**; o remetente configurado
      era `comercial@soloenergia.com.br`, o apex. Para a Resend são domínios
      diferentes. Remetente da plataforma passou a
      `nao-responda@comercial.soloenergia.com.br` e as 15 entregas que estavam
      falhando saíram todas. O aviso na tela agora diz explicitamente que
      subdomínio conta como domínio separado.

- [x] **Studio AI mostrando consumo que não é daquele cliente.** O endpoint já
      era por agente (verificado contra a API: Solo Energia 3500, Walter Inglez
      10 no mesmo workspace). O problema era a JANELA: mostrava o mês inteiro do
      agente ao lado do saldo do ledger, que começa no dia em que a equipe passou
      a ser cobrada. "Saldo 1500, gastou 7000" — dois números sobre períodos
      incompatíveis. Como a resposta do provider tem quebra **por dia**, aqui deu
      para recortar exato, e a tela explica desde quando está contando.

### Falta

- [ ] **Confirmar que a leitura do Studio AI ficou como você esperava.**
      Interpretei "mostra o consumo dos workspaces" como "mostra consumo de
      antes deste cliente existir" — que era um erro real e está corrigido. Se
      você via outra coisa (um número somando várias equipes), me diga em qual
      tela, porque a origem dos dados é comprovadamente por agente.
- [ ] **`workspace_id` com `\n` no fim** em Rema Digital e Be My Guest. O código
      faz `.trim()` nos pontos que importam, mas o valor sujo no banco vai
      morder alguma consulta futura. Limpar.

## Resíduo dos sprints 8.2–8.5 — o que ficou para trás

> Levantado contra produção em 25/08/2026, não de memória. Cada item abaixo foi
> conferido no banco ou no código.

### Duas verdades sobre crédito convivendo

- [ ] **`agent_credits_balance` (Sprint 6.1) ainda é lido, em paralelo ao
      `credit_ledger` (Sprint 8).** Tem 7 linhas e é a fonte do
      `CreditBalanceBadge` e do `useCopilotCredits` — ou seja, o badge de
      Copiloto no CRM mostra um número que **não vem do ledger**. É exatamente a
      classe de bug que o 8.2 gastou uma sessão consertando: dois lugares
      dizendo saldo, e o cliente vendo o que não é cobrado. Migrar os dois
      consumidores para `credit_balance(equipe_id, 'copilot')` e aposentar a
      tabela.

- [ ] **`equipes.creditos_avulsos` / `limite_creditos` têm mais leitores do que
      a migration do 8.2 registrou.** Ela citou três; são seis:
      `AuthContext.tsx`, `Admin.tsx`, `Billing.tsx`, `Suporte.tsx`,
      `asaas-buy-credits` e `fetch-gpt-credits`. As colunas estão fixadas em 0,
      então hoje ninguém mente — mas enquanto forem lidas alguém vai voltar a
      escrever nelas. Cortar os seis e dropar as colunas.

- [ ] **`consumo_creditos` virou cache órfão.** 9 linhas, escrito só pelo
      `fetch-gpt-credits` e lido por ninguém. Pior: guarda os números de ANTES
      do recorte por início de medição do 8.5, então discorda da tela que o
      cliente vê. Ou passa a ser lido de verdade, ou some.

### Sujeira de dados observada

- [ ] **`workspace_id` com `\n` no fim** em Be My Guest e Rema Digital. O código
      faz `.trim()` nos pontos que importam hoje; o valor sujo continua lá
      esperando a próxima consulta que esquecer.

- [ ] **Artefatos de teste em produção:** a equipe `Solo Teste` (criada 24/08,
      zero leads, um contrato `trialing` com uma linha de R$200 sem produto), a
      proposta `41FB0F2CCC3A` (PlanLog, rascunho) e a instância
      `se-a44...-teste` (desconectada, pendurada na Jornada do R1). A proposta
      `73F74E2BB4F1` está provisionada e por isso o servidor recusa apagá-la —
      remover a equipe primeiro é o caminho.

- [ ] **`send-chat-message` tem sua própria cópia de `normalizePhone`** que só
      tira não-dígitos — a mesma armadilha do item 13, ainda armada. Não morde
      hoje porque os telefones dele vêm de leads já normalizados na entrada.

### Cópia de segurança que a tela não mostra

- [ ] **Notificações do dispatcher não têm tela de histórico no admin.** Há 15
      notificações e 40 entregas no banco, com status e `last_error` por canal,
      e nada disso é visível. Quando um envio falha, hoje só se descobre por
      SQL. A aba Notificações precisa de um quarto painel: o log.

---

## FULL RESET — voltar o sistema para o zero

> Pedido do founder em 25/08. **Ainda é possível fazer isso sem destruir nada
> financeiro, e essa janela vai fechar.**

**Por que agora é o momento:** o banco tem hoje **1 fatura, nenhuma paga, 1
contrato (o de teste) e 16 lançamentos no ledger** — nenhum deles referente a
dinheiro que entrou de verdade. Enquanto isso for verdade, apagar o histórico
financeiro não apaga registro contábil de ninguém. **Depois da primeira fatura
paga, esta opção deixa de existir** e o reset vira "estornar", que é outra
coisa e muito mais cara.

**O que NÃO pode ser tocado, em hipótese alguma:** os 8 clientes reais e seus
dados operacionais. São **1.653 leads** acumulados desde dezembro/2025 — Casa
Flow 487, Solo Energia 444, Cinemas Benficas 334, Walter Inglez 246, Jornada do
R1 118, Be My Guest 16, Rema Digital 4, Lucas Castelo 4 — além de conversas,
mensagens, oportunidades e configuração de agente. Isso é o produto deles
funcionando; um "reset" que encoste nisso é perda de cliente, não limpeza.

**Escopo, em três níveis separados** — cada um decidido de propósito, não um
botão só:

1. **Limpar artefatos de teste.** Equipe `Solo Teste` e tudo pendurado nela,
   propostas de teste, instância de teste, notificações de teste. Não toca em
   cliente real.

2. **Zerar o estado de cobrança, mantendo os clientes.** Apagar
   `credit_ledger`, `invoices`, `invoice_items`, `contracts`, `contract_items`,
   `payment_events`, `consumo_creditos`, `notification_deliveries`,
   `notifications` — e então **recomeçar deliberadamente**: anexar o plano de
   cada cliente real com `admin_set_contract_item` e conceder o crédito inicial
   com `admin_grant_credits`. Hoje os 8 clientes reais estão todos com
   `contract_status = none`; nenhum tem plano. Isto é menos "limpeza" e mais
   "finalmente começar a cobrar".

3. **Reset de fábrica.** Só faz sentido num ambiente de staging. Em produção,
   nunca.

**Guardas que o script precisa ter, ou não deve existir:**
- Recusar-se a rodar se existir **qualquer fatura com `status = 'paid'`** — é o
  gatilho que diz "a janela fechou".
- Rodar em modo simulação por padrão, listando o que apagaria e contando linhas,
  e só executar com uma confirmação explícita.
- Receber a lista de equipes a preservar **por id**, não por heurística de nome.
- Rodar dentro de uma transação, para que um erro no meio não deixe metade do
  sistema num estado que ninguém desenhou.
- Nunca mexer em `auth.users`: apagar um usuário é irreversível e não é
  necessário para nenhum dos três níveis.
- Registrar o que fez numa migration, não num script solto — o reset é um evento
  do histórico do sistema.

**Antes de rodar qualquer nível:** desligar os três crons
(`sprint8_billing_tick`, `sprint8_dispatch_tick`, `sprint8_reconcile_tick`) e
religar depois. Um reset com o reconciliador rodando no meio recria exatamente o
buraco que o 8.5 acabou de tapar.
