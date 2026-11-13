# Sprint 15 — CRM UI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM look and read like a high-end product: a sidebar shell, a light mode with real contrast, cards with clear hierarchy, one well-built table everywhere, the proposal status telling the truth (Gerado → Enviado) and a written design for the automation building blocks.

**Architecture:** Three layers, bottom-up. (1) Tokens in `src/index.css`, checked by a contrast test, so every screen gets better at once. (2) A navigation model in a pure module (`src/lib/navigation.ts`) drawn by a new sidebar shell that replaces `TopNavbar` and the CRM tab bar. (3) Surfaces built on the existing shared pieces: `SpreadsheetGrid` becomes the only table (Companies and Properties move to it), and `OpportunityCard` is redrawn on top of `buildCardModel`. The proposal fix adds one status to the two twin lists (SQL `_crm_artifact_statuses` and TS `artifactStatusesFor`). Automations get a design document and no code.

**Tech Stack:** React 18 + Vite, Tailwind 3 + shadcn/ui (`src/components/ui/sidebar.tsx` already in the repo), TanStack Query, Vitest + Testing Library, Supabase Postgres (SQL tests in `supabase/tests/*.test.sql`, begin…rollback).

**Spec:** `Planning/Sprints/sprint_15_crm_ui.md` (founder note). Context: `Planning/Project Management/ROADMAP.md` §6 (design track), `Planning/Benchmark/Jestor/Jestor.md` §4 (UI/UX patterns).

> **Order versus the roadmap:** on 12/11 the founder chose to run this UI sprint now. The roadmap's "Chão firme" (security, single sources of truth, golden flows) moves to the next sprint. Update `ROADMAP.md` §5 in Task 11.

## Global Constraints

- All user-facing copy is in pt-BR, with accents. Status labels must read exactly: `Rascunho`, `Gerado`, `Enviado`, `Aceito`, `Assinado`, `Recusado`.
- Colors are HSL tokens in `src/index.css` (`:root` and `.dark`). No hex values in components; use Tailwind token classes (`bg-card`, `text-muted-foreground`…).
- WCAG AA in **both** themes: body and muted text ≥ 4.5:1 on `--background`, `--card` and `--muted`; input borders and the focus ring ≥ 3:1 on `--card`.
- The tenant color (`useTenantTheme`) can be any HSL. The foreground chosen for it must reach ≥ 4.5:1.
- Every screen touched works at 1440×900 and 390×844 and has all four states (loading, empty, error, data) — ROADMAP §6.3.
- No new npm dependencies. Icons come from `lucide-react@0.462`.
- Route URLs stay the same (`/crm?tab=…&custom_table=…`), so existing deep links, help articles and notifications keep working.
- The milestone `proposal_sent` / `contract_sent` fires **only** on `sent`. Gerado never marks a milestone.
- A task is done only once it has been seen working in the browser on the Solo Energia tenant (ROADMAP §8.4).

## Review Focus

1. **A tenant color whose white text is unreadable** (the Solo orange `28 100% 50%` with white gives 2.5:1). The button text turns dark. The founder must see that in the prototype before it ships. *Test: Task 3 `pickForeground`.*
2. **Wide tables on a laptop** (a custom table with 15+ columns). The header and the first column must stay put while scrolling both ways. Today `thead sticky` sits inside a wrapper with no height, so it never sticks. *Test: Task 7 `grid root is the scroll container`.*
3. **A user without admin, or with a permission set to false.** The sidebar must hide exactly what `TopNavbar` hides today, and a hidden CRM section must not come back through the sidebar. *Test: Task 4 `visibleNav` role/permission cases.*
4. **An n8n callback still sending `sent` on generation** after the deploy. Nothing must break, the status just stays wrong until the flow changes. And a callback sending `generated` before the migration is applied gets refused (`invalid_artifact_status`). That's why the migration ships before the n8n change. *Test: Task 1 SQL test, plus the deploy order in Task 1 Step 7.*
5. **A deep link straight to `/crm?tab=tabelas&custom_table=propostas`.** The sidebar must open with that item active and its group expanded. *Test: Task 4 `isNavItemActive`.*

---

## Wave 0 — The proposal tells the truth

### Task 1: The `generated` status ("Gerado")

Today a proposal has `draft → sent → accepted/rejected`. Solo's "Gerar" automation returns `sent` because no other status exists, so a proposal that was only generated shows as Enviado and marks the deal's `proposal_sent` milestone.

**Files:**
- Create: `supabase/migrations/20261112000100_sprint15_artifact_generated_status.sql`
- Create: `supabase/tests/sprint15_artifact_generated_status.test.sql`
- Create: `supabase/scripts/2026-11-12_solo_proposals_sent_audit.sql` (read-only diagnosis)
- Modify: `src/lib/artifacts.ts:13-57`
- Test: `src/lib/__tests__/artifacts.test.ts`

**Interfaces:**
- Produces: `ArtifactStatus = "draft" | "generated" | "sent" | "accepted" | "signed" | "rejected"`. `artifactStatusesFor("proposal")` returns `["draft","generated","sent","accepted","rejected"]`, contract `["draft","generated","sent","signed","rejected"]`, document `["draft","generated","sent","accepted","signed","rejected"]`. SQL `_crm_artifact_statuses(kind)` returns the same arrays, in the same order.

- [ ] **Step 1: Write the failing TS tests** in `artifacts.test.ts`:
  - `statuses include generated right after draft` → `expect(artifactStatusesFor("proposal")).toEqual(["draft","generated","sent","accepted","rejected"])`, plus the contract and document arrays above.
  - `generated is labelled Gerado` → `expect(ARTIFACT_STATUS_LABEL.generated).toBe("Gerado")`.
  - `generated marks no milestone` → `expect(artifactMilestone("proposal","generated")).toBeNull()` and `expect(artifactMilestone("contract","generated")).toBeNull()`.
  - `artifactStatusOf keeps generated` → `expect(artifactStatusOf("generated")).toBe("generated")`.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/artifacts.test.ts`. Expected: FAIL on the four new tests.
- [ ] **Step 3: Implement in `src/lib/artifacts.ts`.** Add `generated` to the type, the label `"Gerado"`, the style `"bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"` and the three arrays. `artifactMilestone` stays as it is.
- [ ] **Step 4: Write the failing SQL test** `sprint15_artifact_generated_status.test.sql`, following the pattern of `sprint11_w4_artifact_lifecycle.test.sql`. Inside begin…rollback:
  - `_crm_artifact_statuses('proposal') = array['draft','generated','sent','accepted','rejected']`, plus the contract and document arrays.
  - `_crm_apply_artifact_status(rec, 'generated', 'automation')` on a proposal record → `moved` true, `event` null, and no `funnel_events` row with `event = 'proposal_sent'` for the deal.
  - then `'sent'` → `event = 'proposal_sent'`.
- [ ] **Step 5: Write the migration.** `create or replace function public._crm_artifact_statuses` with the arrays above, nothing else. `_crm_artifact_milestone` stays untouched. Run the SQL test the way the `supabase/tests` suite is run today. It hits production in rollback, so **ask the founder before running.** Expected: PASS.
- [ ] **Step 6: Write the audit script** (read-only, no writes). It lists, for the Solo Energia tenant, the `custom_table_records` of tables with `artifact_kind = 'proposal'` in status `sent`, the last `artifact_action_runs.action_label` of each, and the `funnel_events` `proposal_sent` linked to them. It answers "how many proposals say Enviado but only went through Gerar". The repair is **decision D15.1** (below). Don't fix the data in this task.
- [ ] **Step 7: Deploy order** (document it in the PR body): (1) migration, (2) front end, (3) in Solo's n8n, the "Gerar proposta" flow returns `status: "generated"` and the "Enviar" flow returns `status: "sent"`. The n8n MCP doesn't connect in this session, so the founder makes the change or reconnects it. (4) In the browser: generate a proposal → pill shows **Gerado**, the deal has no "Proposta enviada" milestone. Click Enviar → **Enviado** and the milestone appears.
- [ ] **Step 8: Commit** `fix(sprint15/T1): proposta gerada não é proposta enviada — status Gerado`

---

## Wave 1 — Look first, then build

### Task 2: Prototype of the shell, a card and a table (founder gate)

No UI code from Wave 2 on gets merged before the founder approves this prototype (ROADMAP §6.2).

**Files:**
- Create: a private artifact (Artifact tool), source in the scratchpad. The repo doesn't change.

- [ ] **Step 1:** Build a navigable HTML page. It has the sidebar (groups from Task 4, collapsed and expanded, the mobile sheet at 390 px), the header (breadcrumb, notifications, credit, user), one Kanban column with three cards in the Task 6 layout, and the Contacts table in the Task 7 layout, with sticky header and first column. It shows the tokens from Task 3 in **light and dark**, the Solo orange applied with its foreground (Review Focus #1), and the Gerado/Enviado pills.
- [ ] **Step 2:** Publish it and send the link to the founder. Record the approval, and any adjustment to tokens or layout, in this file under "Approved decisions" before Task 3.

**Approved decisions:** _(fill in after the founder's review)_

### Task 3: Tokens with contrast, and the tenant color with the right foreground

**Files:**
- Create: `src/lib/contrast.ts`
- Create: `src/lib/__tests__/contrast.test.ts`
- Create: `src/lib/__tests__/themeTokens.test.ts`
- Modify: `src/index.css:14-79` (`:root`) and `:80-…` (`.dark`)
- Modify: `src/hooks/useTenantTheme.ts`

**Interfaces:**
- Produces: `hslToRgb(hsl: string): [number, number, number]`, `contrastRatio(a: string, b: string): number` (inputs in the token format `"240 5% 96%"`), `pickForeground(bg: string): "0 0% 100%" | "240 10% 3.9%"` (whichever gives the higher ratio).

- [ ] **Step 1: Failing tests** in `contrast.test.ts`: `contrastRatio("0 0% 100%","0 0% 0%")` ≈ 21 (`toBeCloseTo(21, 1)`); `contrastRatio("0 0% 100%","0 0% 100%")` = 1; `pickForeground("28 100% 50%")` = `"240 10% 3.9%"` (Solo orange gets dark text); `pickForeground("221 83% 40%")` = `"0 0% 100%"`.
- [ ] **Step 2: Failing tests** in `themeTokens.test.ts`. Read `src/index.css` with `fs` and extract the `:root` and `.dark` blocks with a regex. For **each** theme assert: `foreground` and `muted-foreground` ≥ 4.5 on `background`, `card` and `muted`; `card-foreground` ≥ 4.5 on `card`; `input` ≥ 3 on `card`; `ring` ≥ 3 on `card`; `border` ≥ 1.35 on `card` (the line has to show; today it's 1.24).
- [ ] **Step 3: Run** `npx vitest run src/lib/__tests__/contrast.test.ts src/lib/__tests__/themeTokens.test.ts`. Expected: contrast fails (module missing); themeTokens fails on light `muted-foreground` on `background` (4.2), `border` and `input`.
- [ ] **Step 4: Implement `contrast.ts`** (WCAG 2.x relative luminance) and adjust the light tokens. Starting values, which the prototype confirms: `--muted-foreground: 240 5% 34%`, `--border: 220 13% 85%`, `--input: 220 9% 62%`, `--ring` = tenant color only if it reaches 3:1, otherwise `240 10% 3.9%`, `--muted`/`--secondary: 240 5% 93%` (it has to differ from the 96% background). Fix the dark tokens until the test passes.
- [ ] **Step 5: `useTenantTheme`** uses `pickForeground(tenant.primaryColor)` instead of `l > 50`. When `contrastRatio(primary, "0 0% 100%") < 3`, set `--ring` to `240 10% 3.9%`.
- [ ] **Step 6: Run** the two tests plus `npm run test`. Expected: PASS, with no test elsewhere broken.
- [ ] **Step 7: Commit** `feat(sprint15/T3): modo claro com contraste AA e cor do tenant com texto legível`

---

## Wave 2 — The shell with a sidebar

### Task 4: Navigation model (pure, testable)

**Files:**
- Create: `src/lib/navigation.ts`
- Create: `src/lib/crmTabs.ts` (moves `TopTab`, `TOP_TABS`, `isTopTab`, `TAB_LABELS` out of `src/pages/CRM.tsx:34-50`)
- Create: `src/lib/__tests__/navigation.test.ts`
- Modify: `src/pages/CRM.tsx` (import from `crmTabs.ts`)

**Interfaces:**
- Consumes: `TopTab`, `TOP_TABS`, `TAB_LABELS` from `src/lib/crmTabs.ts`.
- Produces:
  - `interface NavItem { id: string; title: string; url: string; icon: LucideIcon; external?: boolean; requiredRole?: "user"|"admin"|"owner"|"super_admin"; permissionKey?: string; children?: NavItem[] }`
  - `interface NavGroup { id: string; label: string | null; items: NavItem[] }`
  - `interface NavContext { hasRole(r): boolean; isSuperAdmin: boolean; permissions: Record<string, boolean> | null; chatHref: string; crmTabs: TopTab[]; customTables: { slug: string; name: string }[] }`
  - `buildNav(ctx: NavContext): NavGroup[]` — already filtered; drops empty groups.
  - `isNavItemActive(item: NavItem, loc: { pathname: string; search: string }): boolean`

Groups (same items and the same rules as `TopNavbar.tsx:53-170` today):

| Group | Items |
| :-- | :-- |
| (no label) | Início `/home` · Dashboard `/dashboard` · Chat (`chatHref`, external if `http…`) |
| CRM | one item per allowed `crmTabs` entry, in `TOP_TABS` order, url `/crm?tab=<tab>`. "Tabelas" has a child for each `customTables` entry: `/crm?tab=tabelas&custom_table=<slug>` |
| Automação | AI Studio · Outreach · Webhooks |
| Conta | Equipe · Billing · Suporte · Central de Ajuda |
| Em breve | Toolkit · Clube Solo (keep today's badge) |

- [ ] **Step 1: Failing tests:**
  - `admin sees every group` → labels `[null,"CRM","Automação","Conta","Em breve"]`.
  - `user without admin` → no "Automação" group (all its items are admin), no Equipe/Billing/Suporte; Central de Ajuda stays.
  - `permission false hides even for admin` → `permissions.webhooks=false` takes out Webhooks **and** Outreach (both use `webhooks` today); with `isSuperAdmin` it shows.
  - `crm items follow crmTabs` → `crmTabs: ["pipeline","contacts"]` gives exactly two CRM items.
  - `custom tables become children of Tabelas` → `{slug:"propostas",name:"Propostas"}` gives child url `/crm?tab=tabelas&custom_table=propostas`.
  - `isNavItemActive`: `/crm?tab=contacts` activates Contatos and not Pipeline; `/crm?tab=tabelas&custom_table=propostas` activates the Propostas child **and** its parent Tabelas; `/crm` with no tab activates Pipeline; `/home` activates Início.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/navigation.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `crmTabs.ts` (pure move, nothing changes in CRM.tsx except the import) and `navigation.ts`. Copy the role and permission rules exactly as they are in `TopNavbar`.
- [ ] **Step 4: Run** the test plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sprint15/T4): modelo de navegação por grupos, testável`

### Task 5: Sidebar shell (replaces TopNavbar and the CRM tab bar)

**Files:**
- Create: `src/components/shell/AppShellSidebar.tsx`, `src/components/shell/AppHeader.tsx`
- Modify: `src/components/AuthenticatedLayout.tsx`
- Modify: `src/pages/CRM.tsx:66-165` (the `TabsList` leaves the page; the tab is still read from `?tab=`, and `setTab` still exists for internal links)
- Delete: `src/components/TopNavbar.tsx`, `src/components/AppSidebar.tsx` (the old one, unused)
- Test: `src/components/shell/__tests__/AppShellSidebar.test.tsx`

**Interfaces:**
- Consumes: `buildNav`, `isNavItemActive` (Task 4); `SidebarProvider`, `Sidebar collapsible="icon"`, `SidebarInset` from `src/components/ui/sidebar.tsx`. The collapsed/expanded state already persists in a cookie there.
- Produces: `AuthenticatedLayout` = `SidebarProvider` › `AppShellSidebar` + `SidebarInset` (`AppHeader` + `<Outlet/>`). The footer goes away (the copyright moves to the bottom of the sidebar, `text-xs`). `WhatsAppButton` stays.

- [ ] **Step 1: Failing test** (Testing Library + MemoryRouter at `/crm?tab=tabelas&custom_table=propostas`, mocked context): the "Propostas" link has `aria-current="page"`; the "CRM" group is expanded; the "Webhooks" link isn't in the DOM when `permissions.webhooks=false`.
- [ ] **Step 2: Run** `npx vitest run src/components/shell`. Expected: FAIL.
- [ ] **Step 3: Implement.** Sidebar 248 px expanded, 56 px as icons. Each item is 36 px tall, `text-sm`. The active item gets `bg-sidebar-accent font-medium` with a 2 px bar in the tenant color. Groups with a `text-xs` label in `text-muted-foreground`. The `TenantLogo` sits at the top. Header 56 px: `SidebarTrigger`, breadcrumb (group › item, built from `buildNav` + `isNavItemActive`), and on the right `CreditBalanceBadge`, `NotificationBell`, `ModeToggle`, `UserMenu`. Below 768 px the sidebar opens as a sheet (the `ui/sidebar` default) and closes on navigation. The CRM page header shows the active tab's title (`TAB_LABELS[tab]`), like today on mobile.
- [ ] **Step 4: Run** the test, `npm run test`, `npm run typecheck`, `npm run lint`. Expected: PASS.
- [ ] **Step 5: Browser** (Solo, admin and seller user, 1440 and 390): every old menu link opens the same page; the help article link `/crm?tab=contacts` lands on Contatos; collapsing and reloading keeps the sidebar collapsed.
- [ ] **Step 6: Commit** `feat(sprint15/T5): casca com barra lateral; menu de 14 itens vira grupos`

---

## Wave 3 — Cards

### Task 6: Deal card with hierarchy and bigger text

**Files:**
- Modify: `src/lib/cardModel.ts` (add `splitBadges`)
- Modify: `src/components/crm/OpportunityCard.tsx`, `src/components/crm/OpportunityKanbanColumn.tsx`
- Test: `src/lib/__tests__/cardModel.test.ts`

**Interfaces:**
- Produces: `splitBadges<T>(badges: T[], max: number): { shown: T[]; overflow: number }`. It keeps the order `buildCardModel` already returns.

- [ ] **Step 1: Failing test** `splitBadges shows at most max and counts the rest`: 4 badges, max 2 → `shown.length === 2`, `overflow === 2`; 1 badge → `overflow === 0`.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/cardModel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `splitBadges`, then redraw the card. Top line: name `text-[15px] font-semibold leading-snug line-clamp-2`, owner avatar 24 px on the right. Second line: value `text-base font-semibold tabular-nums` (when `flags.value`). Meta line `text-[13px] text-muted-foreground`: time in stage · next contact. Badges via `splitBadges(…, 2)` + "+N" with a tooltip listing the rest. Actions (WhatsApp, touchpoint, sync) only on hover/focus on desktop, always visible on mobile. Card `rounded-lg border bg-card p-3.5 shadow-sm hover:shadow-md transition-shadow`. Column header: stage name `text-sm font-semibold`, count, and the sum of `value` across the column's cards (`formatCurrency`).
- [ ] **Step 4: Run** `npm run test`. Expected: PASS (the existing `cardModel` and `board` tests keep passing).
- [ ] **Step 5: Browser:** Solo's Kanban with 50+ cards in a column at 1440 and 390, dragging between columns still works, light and dark.
- [ ] **Step 6: Commit** `feat(sprint15/T6): card do negócio com hierarquia e leitura maior`

---

## Wave 4 — One table, well built

### Task 7: `SpreadsheetGrid` — fixed structure, sticky header and first column, readable type

Today the grid repeats the header in three states (loading, empty, data, `SpreadsheetGrid.tsx:411-560`). It uses `table w-full` with no `table-layout`, so columns jump with the content. Its `thead sticky` doesn't stick, because the wrapper `overflow-auto` has no height. Headers are `text-xs uppercase tracking-wider`.

**Files:**
- Create: `src/components/crm/grid/GridHeader.tsx`
- Modify: `src/components/crm/grid/SpreadsheetGrid.tsx`, `src/components/crm/grid/columnTypes.tsx`, `src/components/crm/grid/InlineCell.tsx`, `src/components/crm/grid/RelationChip.tsx`
- Modify: the three callers so the grid lives in a `flex-1 min-h-0` container: `src/components/crm/DatabaseView.tsx`, `src/components/crm/OpportunityTable.tsx`, `src/components/crm/customtables/CustomTableView.tsx`
- Test: `src/components/crm/grid/__tests__/SpreadsheetGrid.test.tsx`

**Interfaces:**
- Consumes: the current `ColumnDef` (`grid/types.ts`) and `SpreadsheetGridProps`, without breaking them.
- Produces: `GridHeader` (one header for the three states); `columnIcon(type: string): LucideIcon` in `columnTypes.tsx`; default widths `CHECKBOX_W = 40`, `PRIMARY_W = 260`, `DEFAULT_W = 180`.

- [ ] **Step 1: Failing tests:**
  - `grid root is the scroll container` → the root element has the classes `h-full`, `min-h-0` and `overflow-auto`.
  - `table uses fixed layout with a colgroup` → `table` has `table-fixed`; `colgroup > col` count = visible columns + checkbox (+ score / + add / + menu when present); the primary `col` has `width: 260px` when the column has no `width`.
  - `checkbox and primary cells are sticky` → the first two `td` of a row have `sticky` and `left-0` / `left-10`.
  - `header shows type icon and sentence-case label` → the `th` for a column `{label:"Telefone", type:"phone"}` contains an `svg` and the text "Telefone"; it does not have the `uppercase` class.
  - `footer counts rows` → 3 rows with `hasMore` → text "3+ registros"; without `hasMore` → "3 registros".
  - `one header in all states` → with `loading`, with `rows=[]` and with data, `getAllByRole("columnheader")` gives the same labels.
- [ ] **Step 2: Run** `npx vitest run src/components/crm/grid`. Expected: FAIL.
- [ ] **Step 3: Implement.** `GridHeader` takes `state: "loading" | "empty" | "data"`. Headers `h-9 text-xs font-medium text-foreground/70` with the type icon `h-3.5 w-3.5 text-muted-foreground`. Rows `h-10 text-sm`. Cells `truncate` with `title` set to the formatted value. The sticky first column gets `bg-card` and a right shadow (`shadow-[1px_0_0_hsl(var(--border))]`). Selected row `bg-primary/5`, hover `bg-muted/60`. `RelationChip` becomes a pill `h-6 rounded-full border bg-muted px-2 text-xs` with ellipsis; when there's more than one value: the first + "+N". A sticky footer `h-9 border-t text-xs text-muted-foreground` holds the count. The empty state copy stays "Nenhum registro encontrado.", now with an icon and room around it.
- [ ] **Step 4: Run** `npm run test` and `npm run typecheck`. Expected: PASS, `InlineCell.test.tsx` included.
- [ ] **Step 5: Browser** (Solo): Contatos, the Pipeline table view and Propostas (`custom_table`). Scroll down and right, and the header plus the name column stay put. Edit a cell inline, select all with mass actions, reorder and resize a column, reload (layout kept). Mobile 390 still shows `MobileRowList`.
- [ ] **Step 6: Commit** `feat(sprint15/T7): grade com estrutura fixa, cabeçalho e coluna presos, tipo legível`

### Task 8: Companies and Properties move to the shared grid

**Files:**
- Modify: `src/components/crm/companies/CompaniesDatabaseView.tsx`, `src/components/crm/properties/PropertiesDatabaseView.tsx`
- Test: `src/components/crm/companies/__tests__/CompaniesDatabaseView.test.tsx`

**Interfaces:**
- Consumes: `SpreadsheetGrid` (Task 7) with `onRowOpen` opening the existing `CompanyDetailModal` / `PropertyDetailModal`; `renderMobileRow` the way `DatabaseView` does it.

- [ ] **Step 1: Failing test:** it renders `CompaniesDatabaseView` with 2 mocked companies, expects `getAllByRole("columnheader")` to include "Nome", and checks that clicking the name opens the dialog (`getByRole("dialog")`).
- [ ] **Step 2: Run.** Expected: FAIL (today it's `ui/table` with no `columnheader` from the grid, and no inline editing).
- [ ] **Step 3: Implement.** Columns = today's fields, with `primary` on the name. Inline editing only for the columns these views already save (same mutation they use today; no new mutation). Delete the `@/components/ui/table` imports from these two views.
- [ ] **Step 4: Run** `npm run test`. Expected: PASS.
- [ ] **Step 5: Browser:** Empresas and Imóveis on Solo, desktop and mobile.
- [ ] **Step 6: Commit** `feat(sprint15/T8): Empresas e Imóveis na mesma grade do CRM`

### Task 9: Sweep of the "broken" tables (list in hand)

The note says the tables "break", without saying where. This task starts from a list, not from guesses.

- [x] **Step 1:** (replaced by a code-level audit — see the list) Do a browser pass on Solo after Tasks 7–8 over Contatos, Pipeline (table), Propostas, Empresas, Imóveis and one more custom table: filter, sort, inline-edit every field type, relations, paging to the end, mass actions, 390 px. **Ask the founder** for the cases they've seen break and add them. Write the list here, one line each: screen · step · expected · observed.
- [x] **Step 2:** For each item, a failing test in the owning component (`InlineCell.test.tsx`, `SpreadsheetGrid.test.tsx` or the view's own test), then the fix, then one commit per item: `fix(sprint15/T9): <what>`.
- [ ] **Step 3:** Repeat the browser pass and tick the list.

**Defect list:** _(Step 1 replaced by a code-level audit of the grid and its five callers — controller ruling; the browser re-pass of Step 3 stays with the controller. Format: screen/component · step · expected · observed · status.)_

1. Todas as grades (useColumnLayout) · arrastar uma coluna depois de recarregar a página · a coluna muda de lugar · nada muda (a ordem salva vazia `[]`), ou move a coluna errada (chave de coluna apagada na ordem salva / coluna criada depois) · corrigido (a76cfa6)
2. Todas as grades (useColumnLayout) · abrir uma tela com layout salvo · coluna sem largura própria usa 180px, a principal 260px · toda coluna sem largura com 150px · corrigido (89b2807)
3. Todas as grades (useGridSelection) · selecionar linhas, depois filtrar/buscar · linhas que saíram deixam a seleção · continuavam selecionadas: barra contava registros invisíveis e "Excluir" agia sobre eles · corrigido (2caa67e)
4. Número/Moeda (InlineCell) · digitar texto que não é número e Enter/sair · nada é salvo e a célula avisa · o valor era apagado (gravava null) sem aviso · corrigido (5c10788)
5. Data/Número (InlineCell) · abrir a célula e sair sem mudar · nada é gravado · gravava: DATE volta "2026-03-14" e o editor devolve ISO; número guardado como texto volta número · corrigido (56ee338)
6. Relação (InlineCell) · vincular/desvincular e o servidor recusar · erro na célula · rejeição não tratada, célula como se tivesse salvo · corrigido (a5c35cf)
7. Pipeline tabela · coluna Empresa · escolher empresa já vinculada · nada acontece · insert batia na UNIQUE de opportunity_links e falhava em silêncio · corrigido (c923408)
8. Relação (InlineCell) · duplo clique, remover um vínculo · Esc ou clique fora sai da edição · célula presa em edição para sempre (× e "Vincular..." até escolher algo) · corrigido (4f38933)
9. Contatos · campo de contato do tipo Usuário · nome do membro · "Usuário removido" em toda linha (coluna sem o diretório da equipe) · corrigido (432d50d)
10. Empresas e Imóveis · marcar uma linha · sem seleção onde não há ação em massa · barra "1 selecionado" sem ação nenhuma, só o X · corrigido (e427ca2)
11. Pipeline tabela · desvincular uma empresa e vincular a mesma de novo · volta a ficar vinculada · a UNIQUE (opportunity_id, linked_type, linked_id, relation) não é parcial em deleted_at: o insert falha (agora com erro na célula); o modal do negócio tem o mesmo buraco; o índice no servidor (parcial em deleted_at) é opcional, não bloqueia a sprint · aberto
12. Pipeline tabela · vincular empresa pela célula · a empresa aparece também no contato (Contatos › Empresa) · a célula grava só opportunity_links; o modal (useOpportunityLinks) também faz o cascade para o contato · aberto
13. Todas as grades · clicar no cabeçalho de coluna que o servidor não ordena (Status, Empresa, Situação…) · cabeçalho não parece clicável · cursor de clique e nenhum efeito (ColumnDef não diz se ordena) · aberto
14. Todas as grades · "Selecionar todos" com mais páginas · seleciona tudo que bate no filtro · seleciona só as linhas carregadas (o rodapé mostra "50+ registros") · aberto (servidor)
15. Todas as grades · Excluir/Mover em massa e Cancelar no diálogo · a seleção continua · a barra limpa a seleção antes do diálogo · aberto
16. Todas as grades · editar com o teclado (Enter/F2, depois Enter/Esc) · o foco volta à célula · o foco cai no body; seguir pelo teclado exige clicar · aberto
17. Multi-seleção (InlineCell) · marcar opções e apertar Esc · cancela · grava as marcações (Esc fecha o popover = Pronto) · aberto
18. Pipeline tabela · coluna Etapa com etapa apagada/de outro pipeline · nome da etapa ou "—" · mostra o uuid cru · aberto
19. Pipeline tabela · ordenar por "Atualizada" e editar enquanto pagina · nenhuma linha repetida/sumida · paginação por offset desloca quando a ordem muda entre páginas · aberto (servidor)

---

## Wave 5 — Automation building blocks (design, no code)

### Task 10: `automacao_primitivas_v1.md` — the contract Sprint 17 builds

**Files:**
- Create: `Planning/Architecture/automacao_primitivas_v1.md`

- [ ] **Step 1:** Write the document with these sections, using `motores_revops.md` §6 (the six questions) as the frame:
  1. **The five blocks:** *Trigger* (event · time · webhook · button · Copilot signal) → *Condition* (the filter language that already exists in `src/lib/crmFilters.ts`, compiled on the server) → *Action* (only existing business verbs: `move_stage`, `update_field`, `set_responsible`, `call_webhook` from `crm_automations`, plus `send_whatsapp`, `enroll_sequence`, `create_task`, `notify`, `ai_step`) → *Wait* (duration, or until a condition with a timeout) → *Branch* (if/else on one condition).
  2. **The trigger catalog**, with the payload of each one: `stage_entered`, `field_changed`, `record_created`, `artifact_status_changed` (includes `generated` from Task 1), `message_received`, `form_submitted`, `date_relative` (N days before/after a date field), `inactivity`, `webhook_received`, `button_clicked`, `copilot_signal`.
  3. **JSON shape** of an automation with N steps (versioned), and **the run log** per step (input, output, error, duration) — the evolution of `crm_automations` + its runs.
  4. **Map of the five mechanisms that exist today** (Agente de CRM rules, `crm_automations`, outreach sequences, recycle/recurrence scheduler, stage webhooks, artifact buttons). For each: which blocks it becomes, and what migrates or stays.
  5. **What the client can personalize** without us: ready-made templates (the ROADMAP Sprint 17 list) plus editing every block in the UI. **What stays with us:** new verbs, credentials.
  6. **Open decisions** for the founder, each with a recommendation.
- [ ] **Step 2:** Founder review. Record the decisions at the end of the document.
- [ ] **Step 3: Commit** `docs(sprint15/T10): primitivas de automação — gatilho, condição, ação, espera, ramo`

---

## Wave 6 — Close-out

### Task 11: Real-tenant pass and handoff

- [ ] **Step 1:** On Solo Energia and WI Advogados, with an admin user and a seller user, at 1440 and 390, in light and dark: sidebar, Kanban, Contatos, Propostas (generate → Gerado, send → Enviado), Empresas, Imóveis. Record a GIF of the proposal flow.
- [ ] **Step 2:** Run `npm run test && npm run typecheck && npm run lint && npm run build`. Expected: everything green; write down the main bundle size before and after (today 2.66 MB). No regression expected; reducing it is not this sprint's goal.
- [ ] **Step 3:** Update `Planning/Project Management/ROADMAP.md` §5 (Sprint 15 = CRM UI, delivered; "Chão firme" becomes Sprint 16 and the rest shifts by one) and §6 (the design foundation was delivered here). Commit `docs(sprint15): roadmap reflete a sprint de UI`.

---

## Founder decisions

| # | Decision | Recommendation | Blocks |
| :-- | :-- | :-- | :-- |
| D15.1 | Solo proposals that are in `sent` but only went through "Gerar": move them back to `generated` and remove the false `proposal_sent` milestone? | Yes, using the Task 1 audit list, reviewed by the manager. The milestone feeds the funnel report | after Task 1 |
| D15.2 | Dark text on the Solo orange button (white is 2.5:1) | Accept, or darken the orange to `22 100% 36%` (≈5.2:1 with white) to keep white text — choose in the prototype | Task 3 |
| D15.3 | CRM sections in the sidebar (no tab bar) | Yes, as Jestor does; the tab bar disappears | Task 5 |

### Rulings (12/11, the founder delegated the decisions)

- **D15.1 → yes, revert.** Records in `sent` whose runs only include "Gerar" go back to `generated`, and their `proposal_sent` milestone is removed. This sprint delivers the repair script (`supabase/scripts/2026-11-12_solo_proposals_generated_repair.sql`, in a transaction, with a dry run that only counts) next to the audit. **Running it in production is up to the founder**, because it's a write to real data.
- **D15.2 → automatic foreground.** `pickForeground` picks the text color for any tenant color; Solo gets dark text on the orange. No tenant color changes.
- **D15.3 → yes.** CRM sections in the sidebar, no tab bar.
- **Task 2 (prototype) → dropped as a gate.** The founder delegated approval and the plan already pins the values. The design gets checked in the Task 11 browser pass.
- **Browser steps of each task → consolidated in Task 11**, done by the controller (Claude in Chrome) or the founder. Implementers close their tasks on tests, typecheck and lint.
- **Task 9 → code-level audit.** The implementer sweeps the grid by field type (each `columnTypes` kind through `InlineCell`: render, edit, save, empty value) and through paging, sorting and selection, with one test per defect found. The founder's list, when it comes, enters as a follow-up.
- **SQL tests → written, not run by the implementers.** The suite runs against production in rollback; the controller asks before running it. The migration is not deployed in this sprint (deploy is manual).
