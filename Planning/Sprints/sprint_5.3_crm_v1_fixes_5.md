### 🏁 SPRINT 5.3: CRM CONSOLIDATION & FOUNDATIONS (The Information Architecture Sprint)

Mateus, sprint 5.2 locked the telemetry chassis. Now we consolidate the app
information architecture: bring tasks into CRM, make tables customizable, give
pipelines per-stage cadence automation, and build the foundation for the
Jestor/Airtable-style personalized table vision.

This sprint is about **reducing cognitive load** — less page switching, more
context where you need it, configurable surfaces that adapt to each team's
workflow.

---

### 🎯 1. NAVIGATION & INFORMATION ARCHITECTURE

#### 📐 1.1 Move Tasks into CRM Page

- **The Problem:** Tasks has its own top-level page and sidebar entry, but it's
  a CRM function. Users context-switch between CRM and Tasks to manage deals.
- **The Vision:** Tasks becomes a 4th tab inside the CRM page, alongside
  Pipeline, Base de Contatos, Empresas. The standalone `/tasks` route redirects
  to `/crm?tab=tasks`. The sidebar "Tasks" entry now points to `/crm?tab=tasks`.
- **What changes:**
  - Add `"tasks"` to `TopTab` union in `CRM.tsx`
  - Add `TabsTrigger` for Tasks with `ListChecks` icon
  - Render `<TasksView />` component when `tab === "tasks"`
  - Extract the current Tasks page content into a `TasksView` component
  - Keep `useAllTasks` hook as-is
  - Sidebar entry `{ title: "Tarefas", url: "/crm?tab=tasks", icon: ListChecks }`

#### 📐 1.2 Add "Imóveis" as a CRM Tab

- **The Problem:** Properties exist in the data model and are linkable from
  contact/company/opportunity modals, but there's no dedicated page to browse,
  search, and manage all properties.
- **The Vision:** A new "Imóveis" tab in the CRM page shows all properties in
  a TanStack Table with search, inline editing, and deep-link to detail modal.
- **What changes:**
  - New component `PropertiesDatabaseView.tsx` (in properties/ folder, mirrors
    `CompaniesDatabaseView.tsx` pattern)
  - Add `"properties"` to `TopTab` in `CRM.tsx`
  - New `TabsTrigger` with `Home` icon
  - Uses existing `useProperties` hook

#### 📐 1.3 Personalized Tables Vision (Foundation)

- **The Vision (Long-term):** Users can create custom table types per
  tenant/team, define columns with types, and create relationships between
  tables (Jestor/Airtable pattern). This sprint builds the **data model
  foundation** only.
- **Sprint 5.3 scope:** Add a `custom_tables` metadata table to store table
  definitions, and a `custom_table_columns` table for column schemas. No UI
  yet — just the schema so future sprints can build the visual builder.
- **What changes:**
  - Migration: `CREATE TABLE public.custom_tables` (id, equipe_id, name, slug,
    icon, description, table_schema JSONB, created_at, updated_at, deleted_at)
  - Migration: `CREATE TABLE public.custom_table_records` (id, equipe_id,
    table_id FK, data JSONB, created_at, updated_at, deleted_at)
  - RLS policies per equipe
  - Basic hooks: `useCustomTables.ts`, `useCustomTableRecords.ts`
  - This is **P2** — only if Wave 1-2 tasks finish early

---

### 📋 2. TASK SYSTEM OVERHAUL

#### 📋 2.1 New Task Status Model

- **Current statuses:** `pending`, `in_progress`, `done`, `completed`
- **New statuses (enum):** `a_fazer`, `fazendo`, `feito`, `parado`
- **What changes:**
  - Migration: add CHECK constraint or new column with new values
  - Migration: update existing tasks mapping:
    - `pending` → `a_fazer`
    - `in_progress` → `fazendo`
    - `done`/`completed` → `feito`
  - Update `STATUS_LABEL` in all task surfaces
  - Add status colors: `a_fazer`=slate, `fazendo`=amber, `feito`=emerald, `parado`=rose

#### 📋 2.2 Task CRUD Everywhere

- **The Problem:** Tasks can only be created from the chat sidebar and the
  dedicated page (read-only). No editing, no assignment, no subtasks.
- **The Vision:** Full task management surfaces across the app:
  - **In Chat sidebar** (`CRMContextPanel`): Upgrade from simple checkbox toggle
    to editable task rows (click to edit title, status dropdown, deadline picker,
    assignee selector, delete)
  - **In Opportunity Detail Modal:** Tasks tab with full CRUD
  - **In Contact Details Modal:** Tasks section with CRUD
  - **In Tasks View (CRM tab):** Inline editing on all columns, create new task
    with lead selector, assignee, deadline, description
  - **In Pipeline Kanban card:** Show task count with quick-add
- **What changes:**
  - `useTasks.ts` rewrite: use TanStack Query instead of raw state, add
    `updateTask` mutation, add `assignTask`, add subtask support
  - `CRMContextPanel.tsx`: Upgrade tasks tab with editable rows
  - `OpportunityDetailModal.tsx`: Add tasks tab with CRUD
  - `ContactDetailsModal.tsx`: Add tasks section
  - New `TaskDialog.tsx` component: modal for creating/editing tasks with full
    fields (title, description, status, deadline, assignee, lead)
  - New `TaskRow.tsx` component: inline editable task row
  - `useAllTasks.ts`: Add `updateTask` and `deleteTask` mutations

#### 📋 2.3 Subtasks

- Add `parent_task_id` column to `tasks` table (self-referencing FK)
- `useTasks.ts`: Add `createSubtask` and `loadSubtasks`
- `TaskDialog.tsx`: Show subtask list, add subtask input
- Display subtask count on parent task

#### 📋 2.4 Tasks API for External Automation

- Supabase Edge Function: `POST /tasks` to create tasks from external systems
- Accept: `title`, `description`, `due_date`, `assigned_to` (email or ID),
  `lead_id` or `lead_phone`, `status`
- Validate: auth token, equipe scoping
- Webhook trigger: `task_created` event for outbound notification

---

### 🔄 3. PIPELINE CADENCE AUTOMATION

#### 🔄 3.1 Per-Stage Cadence (Not Just Pipeline Level)

- **Current state:** `pipelines.cadence_days` applies to ALL stages equally
- **Vision:** Each stage has its own cadence configuration:
  - `cadence_hours` / `cadence_days` per stage (e.g., 1h in "Contato Inicial",
    2 days in "Qualificação Inicial", 10 days max in "Proposta")
  - `next_contact` auto-calculator: when touchpoint is logged, look at which
    stage the opportunity is in, use that stage's cadence
  - Color per stage — already implemented
  - Max time limit per stage — already have `max_idle_hours`
- **What changes:**
  - Migration: Add `cadence_value integer` and `cadence_unit text CHECK IN
    ('hours','days')` to `pipeline_stages_v2`
  - `usePipelineStagesV2.ts`: Include cadence fields in CRUD
  - `StagesEditor.tsx`: Add cadence input (number + unit selector)
  - `useTouchpoints.ts`: `applyCadenceShift` — read stage-specific cadence
    instead of pipeline-level `cadence_days`
  - `NextContactBadge.tsx`: Already working, no changes needed

#### 🔄 3.2 Cadence Webhook Triggers

- **The Problem:** When a cadence deadline hits (e.g., "10 days in Proposta
  without action"), nothing happens outside the app.
- **The Vision:** Each stage can have webhook triggers on cadence events:
  - `on_stage_entered` — when an opportunity enters this stage
  - `on_idle_breach` — when `max_idle_hours` is exceeded
  - `on_cadence_deadline` — when `cadence_value` time passes without touchpoint
- **What changes:**
  - Migration: Add `webhook_triggers JSONB` to `pipeline_stages_v2` — stores
    array of `{ event: string, webhook_id: uuid }`
  - `StagesEditor.tsx`: Add webhook trigger configuration per stage
  - Supabase Edge Function or DB trigger: check cadence deadlines and fire
    webhooks periodically (P1 — may be deferred to sprint 5.4 if complex)

#### 🔄 3.3 Auto-Update Next Contact from Pipeline Stage

- Already partially implemented: touchpoint → `applyCadenceShift`
- **Enhancement:** When an opportunity moves stages, recalculate `next_contact`
  using the new stage's cadence
- **What changes:**
  - `useOpportunities.ts`: On stage change mutation, call cadence recalculation
  - Opportunity stage change trigger: add function to recalculate

---

### 🎨 4. TABLE CUSTOMIZATION & COLUMN VISIBILITY

#### 🎨 4.1 Remove Aberta/Ganha/Perdida from Leads Table (OpportunityTable.tsx)

- **The Problem:** `opportunities.status` duplicates what `stage_type` already
  indicates. "Aberta/Ganha/Perdida" is noise when the stage name + color is
  visible.
- **The Better Solution (per user request):** Don't hard-remove — instead add
  a **column visibility toggle** system to the Opportunity Table (Leads view),
  letting users decide what columns to show. Default to hiding the status column.
- **What changes:**
  - `OpportunityTable.tsx`: Add `columnVisibility` state (like DatabaseView)
  - Add "Colunas" dropdown with toggleable columns
  - Default: `status` column starts hidden
  - All columns become toggleable (except name/actions)

#### 🎨 4.2 Column Visibility on All Tables

- **Current:** Only `DatabaseView.tsx` has column visibility toggle
- **Add to:**
  - `OpportunityTable.tsx` (Leads table in Pipeline workspace)
  - `CompaniesDatabaseView.tsx`
  - New `PropertiesDatabaseView.tsx`
  - `TasksView` component
- **Reuse pattern:** Extract a shared `ColumnVisibilityDropdown` component from
  the DatabaseView pattern so all tables use the same UI

#### 🎨 4.3 Enriquecimento Fields in Base de Contatos Table

- **Status:** Already implemented in Sprint 5.2 T6 (dynamic columns from
  `personal_custom_data` JSONB)
- **Sprint 5.3:** Audit that it works correctly with column visibility toggle.
  Ensure enrichment columns appear in the "Colunas" dropdown with their key
  names as labels.

---

### 🖱️ 5. TOUCHPOINT IMPROVEMENTS

#### 🖱️ 5.1 Edit Touchpoints After Creation

- **Current:** Touchpoints can be deleted (trash icon on hover) but not edited
- **Vision:** Click a touchpoint to open inline editing (content, type, date)
- **What changes:**
  - `useTouchpoints.ts`: Add `updateTouchpoint` mutation
  - `TouchpointsList.tsx`: Click touchpoint text → becomes editable input;
    click date → date picker; click type → type selector. Save on blur or
    Enter. Cancel on Escape.
  - Pattern: inline edit (like `EditableCell` in DatabaseView)

---

### 🔗 6. CRM ↔ CHAT INTEGRATION

#### 🔗 6.1 Audit & Polish CRM→Chat Gate

- **Current:** Sprint 5.2 T15 already implemented the "Sales Engine Chat Route
  Button" — click goes to `/chat?contact=<id>` and opens the thread.
- **Sprint 5.3:** Audit all surfaces for consistency:
  - `DatabaseView.tsx` — phone column has WhatsApp + Chat button ✓
  - `ContactDetailsModal.tsx` — has "Abrir no Chat" button ✓
  - `OpportunityDetailModal.tsx` — identity block needs Chat button (verify)
  - `CompaniesDatabaseView.tsx` — contact entries need Chat button
  - `PropertiesDatabaseView.tsx` — linked contacts need Chat button
- Add missing buttons where they don't exist

#### 🔗 6.2 Next Contact Info in Chat Sidebar CRM View

- **The Problem:** `CRMContextPanel.tsx` (Chat right sidebar) doesn't show the
  next contact date, requiring users to open the full CRM to see it.
- **The Vision:** Show `próximo contato` badge in the identity card area of
  the CRMContextPanel, reusing the `NextContactBadge` component from Sprint 5.2.
- **What changes:**
  - `CRMContextPanel.tsx`: Add next_contact display in the identity card area
  - Needs `next_contact` from the lead data (pass via session or fetch)

---

### 🏗️ 7. DATABASE MIGRATIONS SUMMARY

| # | Table | Change | Priority |
|:-|:------|:-------|:---------|
| M1 | `tasks` | Change status CHECK to `a_fazer/fazendo/feito/parado` | P0 |
| M2 | `tasks` | Add `parent_task_id uuid REFERENCES tasks(id)` | P1 |
| M3 | `tasks` | Add `observations text` column | P1 |
| M4 | `pipeline_stages_v2` | Add `cadence_value integer`, `cadence_unit text` | P0 |
| M5 | `pipeline_stages_v2` | Add `webhook_triggers JSONB` | P1 |
| M6 | `custom_tables` | New table (id, equipe_id, name, slug, icon, description, table_schema, timestamps) | P2 |
| M7 | `custom_table_records` | New table (id, equipe_id, table_id FK, data JSONB, timestamps) | P2 |

---

### 📋 TASK TABLE

| ID | Epic / § | Task | Tier | Owner | Files | Status |
|:-:|:---------|:-----|:----:|:------|:------|:-----:|
| T1 | 1.1 | Move Tasks into CRM as 4th tab, keep existing `/tasks` as redirect | M | Claude | `src/pages/CRM.tsx`, `src/pages/Tasks.tsx`→extract to `src/components/crm/TasksView.tsx`, `src/components/AppSidebar.tsx`, `src/App.tsx` | Done |
| T2 | 1.2 | Add Imóveis tab with PropertiesDatabaseView | M | Claude | `src/pages/CRM.tsx`, `src/components/crm/properties/PropertiesDatabaseView.tsx` (new), `src/components/crm/properties/PropertyDetailModal.tsx` | Done |
| T3 | 2.1 | Task status migration + new enum everywhere | M | Codex | Migration, `src/hooks/useTasks.ts`, `src/hooks/useAllTasks.ts`, `src/types/chat.ts`, `src/components/crm/TasksView.tsx`, `src/components/inbox/CRMContextPanel.tsx`, `src/components/crm/OpportunityDetailModal.tsx` | Done |
| T4 | 2.2 | Task CRUD surfaces (edit, assign, delete across all surfaces) | L | Claude | `src/hooks/useTasks.ts` (rewrite to TanStack Query), new `TaskDialog.tsx`, `CRMContextPanel.tsx` upgrade, `OpportunityDetailModal.tsx` tasks tab, `ContactDetailsModal.tsx` tasks section, `TasksView.tsx` inline edit | Done |
| T5 | 2.3 | Subtasks (`parent_task_id` + UI) | M | Codex | Migration M2, `useTasks.ts` subtask methods, `TaskDialog.tsx` subtask section | Done |
| T6 | 2.4 | Tasks API Edge Function for external automation | M | Claude | `supabase/functions/tasks-api/index.ts` (new) | Done |
| T7 | 3.1 | Per-stage cadence configuration (schema + editor + consumer) | L | Claude | Migration M4, `StagesEditor.tsx` cadence UI, `usePipelineStagesV2.ts`, `useTouchpoints.ts` applyCadenceShift update | Done |
| T8 | 3.2 | Per-stage webhook triggers on cadence events | L | Claude | Migration M5, `StagesEditor.tsx` webhook picker, cadence-check Edge Function or DB trigger | Done |
| T9 | 4.1 | Column visibility toggle on OpportunityTable (Leads table) | M | Claude | `OpportunityTable.tsx` add columnVisibility + Colunas dropdown | Done |
| T10 | 4.2 | Column visibility on all tables (shared component) | M | Claude | Extract `ColumnVisibilityDropdown.tsx`, apply to Companies, Properties, Tasks tables | Done |
| T11 | 4.3 | Audit enrichment columns in Base de Contatos | S | Claude | `DatabaseView.tsx` — verify T6 still works with visibility toggle, fix if needed | Done |
| T12 | 5.1 | Touchpoint inline editing | M | Claude | `useTouchpoints.ts` add updateTouchpoint, `TouchpointsList.tsx` inline edit mode | Done |
| T13 | 6.1 | Audit CRM→Chat gate buttons across all surfaces | M | Claude | Check all modals + tables for Chat button, add where missing | Done |
| T14 | 6.2 | Next contact info in Chat sidebar CRM view | M | Claude | `CRMContextPanel.tsx` add `NextContactBadge` from lead data | Done |
| T15 | 1.3 | Custom tables foundation schema + hooks (P2 — stretch) | M | Claude | Migrations M6+M7, `useCustomTables.ts`, `useCustomTableRecords.ts` | Done |
| T16 | DoD | Acceptance audit + sprint close | S | Claude | Read-only + document | Done |

---

### 🌊 WAVES

#### 🟦 Wave 1 — Foundation (schema + extract)
*Non-controversial schema changes and component extractions.*

| Task | Owner | Delivery |
|:----|:------|:---------|
| T1 | Claude | Move Tasks into CRM |
| T3 | Codex | Task status migration |
| M1-M3 | Codex | Task schema migrations |

#### 🟩 Wave 2 — Features in parallel
*Archives disjoint — all run simultaneously.*

| Task | Owner | Delivery |
|:----|:------|:---------|
| T2 | Claude | Imóveis tab |
| T4 | Claude | Task CRUD everywhere |
| T5 | Codex | Subtasks |
| T7 | Claude | Per-stage cadence |
| T9 | Claude | Column visibility on OpportunityTable |
| T12 | Claude | Touchpoint editing |

#### 🟨 Wave 3 — Integration + automation
*Depends on Wave 2 merges.*

| Task | Owner | Delivery |
|:----|:------|:---------|
| T6 | Claude | Tasks API |
| T8 | Claude | Cadence webhook triggers |
| T10 | Claude | Column visibility component extract |
| T11 | Claude | Enrichment audit |
| T13 | Claude | Chat gate audit |
| T14 | Claude | Next contact in chat sidebar |

#### 🟪 Wave 4 — Stretch + close
| Task | Owner | Delivery |
|:----|:------|:---------|
| T15 | Claude | Custom tables foundation |
| T16 | Claude | DoD audit |

---

### 🔍 VERIFICATION

1. **Build:** `npx tsc --noEmit` and `npx vite build` must pass with zero errors
2. **Tasks in CRM:** Navigate to CRM → see Tasks tab → creates, edits, deletes tasks
3. **Task statuses:** Old `pending` tasks show as `A Fazer`, can change to `Fazendo`, `Feito`, `Parado`
4. **Per-stage cadence:** Pipeline settings shows cadence per stage; logging touchpoint uses stage cadence
5. **Column visibility:** All tables have "Colunas" dropdown, status column hidden by default in Leads table
6. **Touchpoint editing:** Click touchpoint text to edit inline, save on blur
7. **Imóveis tab:** Browse, search, create, edit properties
8. **Chat CRM context:** Shows next contact badge
9. **Chat gate:** Chat button visible on all contact surfaces, navigates to correct thread

---

### 🧠 ARCHITECTURE CRITIQUE (What I'd Build Differently)

Mateus, you asked what I think about the system and what I'd build differently.
Here's my honest assessment:

**What's strong:**
- The `leads` = `contacts` universal identity model is the right foundation.
  One table, not fragmented. Most CRMs get this wrong.
- The opportunity/stage separation (Tier 2/3) is clean — opportunities are
  pipeline instances, stages are definitions. Good relational design.
- The realtime subscriptions via Supabase postgres_changes are well-placed.
- The component extraction (shadcn/ui patterns) is consistent and maintainable.

**What I'd change (or what sprint 5.4+ should address):**

1. **useTasks.ts is still using raw useState instead of TanStack Query.**
   This is an anomaly — every other hook uses `@tanstack/react-query`. The
   Sprint 5.3 rewrite (T4) fixes this. After that, all data hooks are uniform.

2. **The tasks table schema is too thin.**
   No `observations`, no `parent_task_id` (subtasks), no `tags`, no
   `pipeline_id`/`stage_id` context. The current schema was built for a simple
   todo list, not the task management system you're envisioning. Sprint 5.3
   addresses this.

3. **Column visibility is implemented once (DatabaseView) but not reused.**
   Every other table needs it. The planned `ColumnVisibilityDropdown` extract
   (T10) solves this — one component, five consumers.

4. **Pipeline cadence is pipeline-level, not stage-level.**
   This is a meaningful limitation. A lead in "Contato Inicial" needs 1h
   follow-up, but a lead in "Proposta Enviada" needs 10 day follow-up. You
   can't set both with a single `cadence_days`. Sprint 5.3 fixes this.

5. **`opportunities.status` (Aberta/Ganha/Perdida) is architecturally
   redundant** with `pipeline_stages_v2.stage_type` (open/won/lost). The
   status field is a denormalized convenience. The real source of truth is
   the stage. T9 addresses this by giving users the choice to hide it.

6. **The sidebar navigation is static.** The Jestor/Airtable vision requires
   dynamic sidebar items (custom tables appear as nav items). T15 starts this
   with the custom_tables schema. A future sprint should make `AppSidebar.tsx`
   read from `custom_tables` and render entries dynamically.

7. **No cross-table relationship UI.** Jestor's superpower is linking records
   across custom tables. Our current linking (`opportunity_links`,
   `property_owner_links`, `contact_company_links`) is hardcoded per entity
   type. Future: a generic `entity_links` table with polymorphic
   `source_type/source_id/target_type/target_id/relation_type`.

8. **The chat → CRM data bridge is fragile.**
   `CRMContextPanel` uses a `ChatSession.crmData` interface that partially
   mirrors `leads` columns. The `handleUpdateCRM` writes back to `leads`.
   This works but couples chat to the leads schema directly. Future: a
   dedicated `chat_crm_context` table or a cleaner abstraction layer.

9. **No field-level permission model.** In a multi-tenant sales OS, different
   roles should see/hide different fields. This isn't needed yet, but the
   custom_tables schema should support it eventually.

10. **Webhook triggers are not connected to pipeline cadence events.** You
    already have webhook_configs, and you have pipeline agent rules that can
    `trigger_webhook`. But there's no "cadence deadline reached" event being
    emitted. T8 closes this gap.

**Bottom line:** The architecture is fundamentally sound. The data model
separations (identity vs pipeline vs opportunities) are correct. The issues are
largely about:
- **Completeness** (missing features you're now adding)
- **Reusability** (patterns implemented once but not propagated)
- **Configuration** (hardcoded values that should be per-stage or per-table)

Sprint 5.3 addresses all three categories. The foundation you've built is solid
enough to support the Sales OS vision — it just needs the personalized-table
layer (sprint 5.4+) to truly become a Jestor/Airtable competitor.
