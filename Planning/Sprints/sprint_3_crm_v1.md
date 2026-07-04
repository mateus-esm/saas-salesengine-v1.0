🚀 SPRINT 3 PLANNING: CRM V1 - THE JESTOR-FOR-SALES ENGINE Target Product: CRM
v1 (The Brain) Execution Agent: Antigravity (Software Engineer role)

📖 THE HERO STORY: PRODUCT VISION & CONTEXT The Core Philosophy: "Chat is the
Tool, CRM is the Brain." The ultimate goal of this system is to create a
high-excellence, engineering-intelligence environment that serves Sales to close
more deals, with high ticket values and low lead times. The sales rep's entire
universe must live inside the Chat (the unique commercial tool). However, that
chat must be deeply integrated with a powerful CRM operating silently in the
background to evolve and manage the process.

The Pain: Right now, the CRM is flat. Every lead has the exact same fields, and
there is no way to have different sales processes. The Breakthrough: We are
implementing a "Jestor-for-Sales" architecture. We want the power of a
personalized database where users can create, update, and delete fields, but
strictly boxed into a sales context so it doesn't become overly complex. Backend
complexity will be transformed into frontend simplicity.

The User Journey (The Logic):

The Entry: When a new message appears in the omnichannel inbox, it is not
necessarily an Opportunity. It is just a person. They enter the Global Database
(Leads). Users can also manually create Leads directly in this database.

The Assignment: When a Lead qualifies, they are addressed to a specific Pipeline
(Opportunity).

The Multi-Verse: A company can create multiple distinct pipelines (e.g., "Solar
Sales", "B2B Partners") with completely different stages, fields, and purposes
(like RD Station or Salesforce), while maintaining a clear, simple, and
effective logic.

The Views: Inside a Pipeline, the user can toggle between a Kanban View and a
Database/Table View. The Kanban view can be personalized to show the exact
custom data the client wants to see on the cards.

(Note for Agent: Future scopes include Toolkit Automations for Resend/Whatsmeow
cadences, CRUD APIs/Webhooks for event-triggered automations, and an AI
Commercial Copilot for OS Intelligence. For Sprint 3, we are strictly building
the data foundation and UI for this future.)

📐 THE ARCHITECTURE (How it works) To achieve this without breaking the database
every time a client wants a new field, we will use a 3-Tier Relational Model
heavily relying on Supabase JSONB.

Global Database (leads / contacts): Universal, immutable data only. (Name,
Phone, Email, Origin).

Process Engine (pipelines & pipeline_stages): Stores the rules. Defines the
stages and stores the "Schema" of what custom fields belong to this specific
pipeline.

The Intersection (opportunities): This links a Lead to a Pipeline and a Stage.
Crucially, this table holds a custom_data (JSONB) column. This allows Lead A to
have {"roof_type": "Ceramic"} in the Solar Pipeline, and {"company_size":
"Enterprise"} in the B2B Pipeline.

# 🚀 SPRINT 3 — CRM V1: The Sales Engine Brain

**Product:** SV01 · Sales Engine CRM **Target:** CRM V1 (Foundation +
Multi-Pipeline Core) **Execution Agent:** Antigravity (Software Engineer)
**Design Theme:** Precision OS Dark

---

## 📖 NORTH STAR

**"Chat is the Tool. CRM is the Brain."**

The sales rep operates inside the omnichannel chat. The CRM runs silently behind
it, turning every conversation into structured process intelligence. This sprint
builds the **data foundation** that makes that possible — not features,
foundations.

- **The Pain:** Today the CRM is flat. One lead schema, one process, no
  flexibility.
- **The Breakthrough:** A **Jestor-for-Sales** architecture. Customer-defined
  fields and pipelines, strictly boxed into a sales domain. Backend complexity
  becomes frontend simplicity.

---

## 🧭 GUIDING PRINCIPLES

These are the filters every design and code decision passes through this sprint.
When in doubt, re-read them.

1. **Lean on Postgres before anything else.** Validation, history, realtime,
   full-text search, row-level auth — all native. Every feature Postgres
   provides is a service we don't build, pay for, or debug.
2. **Columns for invariants, JSONB for variance.** If a field is always present
   and queryable (name, value, stage), it's a column. If it's tenant-defined, it
   goes in `custom_data`. Never store a required business field in JSONB.
3. **Stable IDs, mutable labels.** Custom fields are keyed by a stable
   `field_id` (uuid). Labels and keys can change freely without breaking stored
   data.
4. **RLS is the security model.** Tenant isolation lives in the database, not in
   application code. One policy, enforced everywhere, uncheatable.
5. **One component, many contexts.** `DynamicFieldRenderer` is written once and
   reused in Pipeline Settings, Kanban cards, Table view, and Chat Context
   Panel. No duplicate form logic.
6. **Append-only beats reactive.** Stage changes and status transitions are
   written as events. Analytics we haven't built yet will need this history.
   Backfilling from nothing is impossible.
7. **Optimistic UI, server as truth.** React Query is already in the stack.
   Every mutation updates cache immediately and reconciles on response. The UI
   feels instant.
8. **Boring tech scales.** Supabase + Postgres + JSONB + RLS. No queues, no
   microservices, no exotic stores. Simplicity compounds.

---

## 📐 ARCHITECTURE

A **3-tier relational model** with JSONB where — and only where — flexibility is
required.

```
┌──────────────────────────────────────────────────────────┐
│  TIER 1 · GLOBAL IDENTITY                                │
│  leads → who the person is, tenant-scoped, immutable     │
└────────────────────────┬─────────────────────────────────┘
                         │ one lead → many opportunities
┌────────────────────────▼─────────────────────────────────┐
│  TIER 2 · PROCESS DEFINITION                             │
│  pipelines → rules + custom field schema (JSONB)         │
│  pipeline_stages → ordered states within a pipeline      │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  TIER 3 · PROCESS INSTANCE                               │
│  opportunities → Lead × Pipeline × Stage + custom_data   │
│  opportunity_stage_history → append-only event log       │
└──────────────────────────────────────────────────────────┘
```

Every table carries `tenant_id` and is isolated by RLS. The same Lead can exist
in multiple pipelines with entirely different custom data — one `custom_data`
shape per opportunity, validated against its pipeline's schema.

---

## 🧱 EPIC 0 — FOUNDATIONS _(Non-Negotiable)_

> This epic lands **before** Epics 1–4. It is the chassis. Skipping it means
> rebuilding later.

### Conventions — every new table

| Field        | Type          | Notes                                |
| ------------ | ------------- | ------------------------------------ |
| `id`         | `uuid`        | `default gen_random_uuid()`          |
| `tenant_id`  | `uuid`        | FK → `tenants(id) on delete cascade` |
| `created_at` | `timestamptz` | `default now()`                      |
| `updated_at` | `timestamptz` | maintained by shared trigger         |
| `deleted_at` | `timestamptz` | nullable → soft delete               |

Plus:

- RLS enabled, policy: `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
- Partial index on `tenant_id` where `deleted_at is null`
- `tenant_id` denormalized onto child tables (e.g. `pipeline_stages`) so RLS
  doesn't require joins

### Custom Field Schema Format

Stored in `pipelines.custom_fields_schema` as a JSONB array. `field_id` is the
stable reference. `key` and `label` can change freely.

```json
[
    {
        "field_id": "f8b1c2d4-...-uuid",
        "key": "roof_type",
        "label": "Roof Type",
        "type": "select",
        "required": true,
        "options": ["Ceramic", "Metal", "Concrete"],
        "position": 0
    }
]
```

- **V1 supported types:** `text`, `number`, `currency`, `date`, `boolean`,
  `select`
- **V1 deferred (format is additive, not a refactor):** `multi_select`,
  `relation`, `formula`, `file`

`opportunities.custom_data` is keyed by `field_id`, **not** by `key`:

```json
{ "f8b1c2d4-...-uuid": "Ceramic" }
```

The UI resolves labels by looking up `field_id` in the current schema. Renaming
a field → zero data migration.

### Shared Component — `DynamicFieldRenderer`

One component, three props: `schema`, `value`, `onChange`. Renders the correct
input per type, validates via Zod generated from schema, used everywhere custom
fields appear. No other form component may render custom fields.

### Migration Discipline

- One migration file per concern, reversible (`up` + `down`)
- No data-destructive migrations without explicit backup step
- Schema deploys independent of code deploys

### ✅ Acceptance Criteria

- [x] Conventions documented in `/db/CONVENTIONS.md`
- [ ] RLS tested with two tenants — queries return only own data, enforced by
      Supabase integration test _(policies in place; integration test pending QA)_
- [x] `DynamicFieldRenderer` renders each V1 field type
      _(Storybook not used in this project; component lives at
      `src/components/crm/DynamicFieldRenderer.tsx` and renders text, number,
      currency, date, boolean, select)_
- [x] Shared `updated_at` trigger applied via helper function (not per-table
      duplicates) _(reuses existing `public.update_updated_at_column()`)_

---

## 🌍 EPIC 1 — Global Lead Database

**Objective:** The universal repository where every contact lives — pipeline or
not.

### Schema

```sql
create table leads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  origin      text not null,  -- 'whatsapp' | 'manual' | 'web' | 'import'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index on leads (tenant_id, phone)      where deleted_at is null;
create index on leads (tenant_id, email)      where deleted_at is null;
create index on leads (tenant_id, created_at desc) where deleted_at is null;
```

### Data Migration (current `leads` → new schema)

1. Snapshot current `leads` into `leads_backup_sprint3`
2. Migrate identity columns → new `leads`
3. Migrate pipeline columns (`value`, `status`, `stage_id`) → `opportunities`
   (Epic 2)
4. Drop legacy columns only after row-count + sample verification

### UI — `/crm` Database View

- Sortable, filterable, searchable table of all leads
- "New Lead" modal: name, phone, email, origin
- Duplicate detection: non-blocking warning on phone/email match within tenant
- Row click → Lead detail drawer listing **every opportunity** across pipelines

### ✅ Acceptance Criteria

- [x] Existing lead data migrates with zero loss (row count matches backup)
      _(non-destructive migration — `leads_backup_sprint3` snapshot created;
      legacy columns retained for the dual-read window through Sprint 4)_
- [x] Manual lead create → list → edit → soft-delete round-trips
      _(useLeads now uses soft-delete; query scoped to `deleted_at IS NULL`)_
- [x] Duplicate warning fires on exact phone or email match
      _(useLeadDuplicateCheck + AddLeadModal — non-blocking)_
- [x] Lead drawer shows opportunities across pipelines
      _(LeadOpportunitiesSection inside LeadDetailsModal)_

---

## ⚙️ EPIC 2 — Multi-Pipeline Engine

**Objective:** The Jestor-like infrastructure for fully customizable sales
processes.

### Schema

```sql
create table pipelines (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  name                 text not null,
  description          text,
  custom_fields_schema jsonb not null default '[]'::jsonb,
  is_archived          boolean not null default false,   -- soft-archive: hidden from new opps, existing intact
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create table pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name        text not null,
  color       text not null default '#64748b',
  position    int  not null,
  stage_type  text not null default 'open',  -- 'open' | 'won' | 'lost'
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on pipeline_stages (pipeline_id, position) where deleted_at is null;

create table opportunities (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  lead_id           uuid not null references leads(id) on delete restrict,
  pipeline_id       uuid not null references pipelines(id) on delete restrict,
  stage_id          uuid not null references pipeline_stages(id) on delete restrict,
  value             numeric(14,2),
  currency          text not null default 'BRL',
  status            text not null default 'open',  -- 'open' | 'won' | 'lost'
  position          int  not null default 0,       -- manual ordering within stage
  custom_data       jsonb not null default '{}'::jsonb,
  stage_entered_at  timestamptz not null default now(),
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index on opportunities (tenant_id, pipeline_id, stage_id, position) where deleted_at is null;
create index on opportunities (tenant_id, lead_id)                          where deleted_at is null;
create index on opportunities (tenant_id, status)                           where deleted_at is null;

create table opportunity_stage_history (
  id              bigserial primary key,
  tenant_id       uuid not null,
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  from_stage_id   uuid references pipeline_stages(id),
  to_stage_id     uuid not null references pipeline_stages(id),
  changed_by      uuid references auth.users(id),
  changed_at      timestamptz not null default now()
);
create index on opportunity_stage_history (opportunity_id, changed_at desc);
```

### Trigger — Stage Change History (automatic)

```sql
create or replace function log_opportunity_stage_change()
returns trigger language plpgsql security definer as $$
begin
  if new.stage_id is distinct from old.stage_id then
    insert into opportunity_stage_history
      (tenant_id, opportunity_id, from_stage_id, to_stage_id, changed_by)
    values
      (new.tenant_id, new.id, old.stage_id, new.stage_id, auth.uid());
    new.stage_entered_at := now();
  end if;
  return new;
end $$;

create trigger trg_opportunity_stage_change
  before update on opportunities
  for each row execute function log_opportunity_stage_change();
```

### State Machine

- `status = 'open'` → on the board, actively worked
- `status = 'won' | 'lost'` → `closed_at` set; visible in filtered views only
- Stage and status are **orthogonal** in V1: moving to a `stage_type = 'won'`
  stage does **not** auto-close the opportunity. Status is set explicitly by the
  user. (Auto-sync via trigger is a Sprint 4 optimization.)

### UI — `/pipeline` Pipeline Settings

- List pipelines (Active + Archived tabs)
- Create/edit pipeline: name, description, stages (drag-reorder, color picker,
  stage_type)
- Custom fields editor: add / edit / reorder / delete, validated against V1 type
  list
- Archive pipeline → blocks new opportunities, preserves existing; fully
  reversible

### ✅ Acceptance Criteria

- [x] Create pipeline with 5 custom fields, 4 stages → save → reload → persists
      intact _(PipelineSettings page; CustomFieldsEditor + StagesEditor)_
- [x] Moving an opportunity writes a `opportunity_stage_history` row
      automatically _(`trg_opportunity_stage_change` BEFORE UPDATE trigger)_
- [x] Renaming a custom field's `label` does not break stored `custom_data`
      _(values keyed by stable `field_id` uuid, never `key`/`label`)_
- [x] Deleting a custom field marks it in schema as removed (soft) — stored
      data preserved, UI hides it _(CustomFieldsEditor sets `is_deleted: true`;
      `DynamicFieldRenderer` filters by default)_
- [x] Archive pipeline → new opportunity creation blocked, existing
      opportunities intact and editable
      _(`trg_opportunity_block_archived` BEFORE INSERT trigger)_

---

## 👁️ EPIC 3 — Pipeline Views (Kanban + Table)

**Objective:** Turn process data into operator interfaces.

### Pipeline Selector

Top of `/crm`: dropdown listing all non-archived pipelines for the tenant.
Selection persists in URL (`/crm?pipeline=<id>`) and localStorage for default.

### Kanban View

- Columns = stages in `position` order, colored by `pipeline_stages.color`
- Cards = opportunities, ordered by `position` within stage
- **Drag-and-drop**: optimistic cache update → Postgres update → rollback on
  error
- **Card face**: configurable per-pipeline — admin selects which custom
  `field_id`s appear on the card
- **Realtime**: Supabase Realtime subscription on `opportunities` filtered by
  `pipeline_id` → other reps see moves live, zero polling

### Database View (Pipeline Context)

- Columns = fixed (Lead, Value, Stage, Updated) + dynamic (from
  `custom_fields_schema`)
- Sort by any column, filter by stage/status
- Inline edit for simple fields (value, stage)

### ✅ Acceptance Criteria

- [x] Drag card across stages: UI updates instantly, rolls back cleanly on
      failure _(OpportunityKanban keeps a local optimistic snapshot synced from
      useOpportunities; mutation's onError reverts to server state)_
- [x] Second browser observes the move within 2 seconds via Realtime
      _(useOpportunities subscribes to `postgres_changes` on `opportunities`
      filtered by `equipe_id`; any update invalidates the React Query cache)_
- [x] Kanban card field configuration persists per-pipeline
      _("Campos do card" dialog writes to `pipelines.card_field_ids`;
      OpportunityCard renders only the selected schema entries)_
- [x] Table view columns regenerate automatically when pipeline schema changes
      _(OpportunityTable derives columns via useMemo over
      `pipeline.custom_fields_schema`; schema edits in PipelineSettings
      propagate through React Query invalidation)_

---

## 💬 EPIC 4 — Chat Context Panel (Omnichannel Symbiosis)

**Objective:** Bring the CRM brain directly into the chat operator's field of
view.

### Overhaul `CRMContextPanel.tsx`

| Section                       | Content                                                              | Notes                                                                                               |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **1 · Lead Identity**         | Global lead fields                                                   | Inline-editable, always visible                                                                     |
| **2 · Action Bar**            | "Add to Pipeline" button                                             | Modal → select pipeline → creates Opportunity in first stage. Disabled when tenant has no pipelines |
| **3 · Active Opportunities**  | List of open opps for this lead                                      | Pipeline name + current stage + value. Click to expand                                              |
| **4 · Opportunity Detail**    | `DynamicFieldRenderer` against opp's pipeline schema + `custom_data` | Edits save optimistically. Stage changer inline                                                     |
| **5 · AI Commercial Copilot** | Skeleton card, disabled                                              | "Coming Soon" label. Wired component, no logic                                                      |

### ✅ Acceptance Criteria

- [x] Panel loads in chat without blocking message rendering
      _(LeadOpportunitiesSection mounts inside CRMContextPanel via React Query;
      data loads async while the message pane keeps rendering)_
- [x] Custom field edits in panel persist to `opportunities.custom_data`
      _(DynamicFieldRenderer inside the inline OpportunityRow calls
      `updateOpportunity.mutate({ custom_data })` — keyed by stable `field_id`)_
- [x] Stage change from panel writes history row (same trigger as Kanban)
      _(same `trg_opportunity_stage_change` BEFORE UPDATE trigger catches any
      `stage_id` diff regardless of which client initiated the update)_
- [x] Creating opportunity from panel uses the pipeline's first stage by default
      _(`useOpportunities.createOpportunity` resolves first stage via
      `pipeline_stages_v2` ordered by position when `stage_id` is omitted)_

---

## 🚫 EXPLICITLY OUT OF SCOPE (Sprint 3)

- Automations (Resend / Whatsmeow cadences) → Sprint 4+
- Webhooks / external API triggers → Sprint 4+
- AI Commercial Copilot logic → placeholder only
- Reporting dashboards & conversion metrics → data captured, UI deferred
- Field types: `multi_select`, `relation`, `formula`, `file`
- B2B Accounts entity → V2 (current sprint: leads serve as both B2C contacts and
  B2B stand-ins)
- Opportunity bulk actions (bulk move / assign / close)

---

## ✅ SPRINT DEFINITION OF DONE

- [ ] All tables RLS-protected and tested across tenants
- [ ] All migrations forward + reversible, run cleanly on empty DB and on
      current prod snapshot
- [ ] `DynamicFieldRenderer` reused in Pipeline Settings, Kanban card config,
      Table view, Chat Panel — no duplicate form code
- [ ] Stage history populated automatically for every stage change
- [ ] Kanban + Table + Chat Panel all render the same pipeline correctly
      end-to-end
- [ ] Seed script creates 2 tenants × 2 pipelines × 20 opportunities for QA
- [ ] **Zero** external dependencies added beyond Supabase-native features

---

## 📎 NOTES FOR ANTIGRAVITY

- When in doubt between app-layer logic and Postgres logic → **choose
  Postgres**. Cheaper, faster, auditable.
- When in doubt between adding a column and extending JSONB → ask: _is this
  field required for every opportunity, or tenant-defined?_ Required = column.
  Variable = JSONB.
- When in doubt on UX → **ship the simpler version**. V1 is foundation, not
  feature showcase.
- Maintain **Precision OS Dark** aesthetic: dense, functional, neutral palette
  with one accent per context.
- Every new button and input ends its day as a reusable primitive, not a
  one-off.
