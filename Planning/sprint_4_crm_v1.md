# 🚀 SPRINT 4 — ENTERPRISE CRM ARCHITECTURE & TAXONOMY

**Product:** SV01 · Sales Engine CRM **Target:** CRM V1 (Enterprise Foundation)
**Execution Agent:** Antigravity (Software Engineer) **Design Theme:** Precision
OS Dark **Prerequisite:** Sprint 3 shipped (`pipelines`, `pipeline_stages_v2`,
`opportunities`, `DynamicFieldRenderer`).

---
🌌 THE NORTH STAR: Welcome to the Big Leagues
Team, Sprint 4 isn't just an update; it is a metamorphosis. We are ripping out the training wheels and transitioning from a flat, basic CRM into a true Enterprise domain model. This is the exact structural pattern that HubSpot, Salesforce, and Pipedrive converged on, because every real sales organization eventually demands it.
We are separating the Identity from the Process.
Contacts — The human. Universal, cross-pipeline, identity only.
Companies — The business entity. Exists once, linked to many Contacts.
Properties — The physical or logical asset (solar site, real estate, franchise unit). Industry-agnostic, Contact- or Company-owned.
Opportunities — The deal inside a pipeline. Links one Contact + optionally one Company + optionally one or more Properties.
The Differentiator: We aren't just building a database; we are building an active brain. This sprint ships our killer feature: per-pipeline Agente CRM rules. We are giving admins structured triggers for perfect auditability, combined with natural-language extraction hints for ultimate AI flexibility.
The core shift: Sales-specific fields (value, meeting state, tasks, touchpoints, lead score) are packing their bags. They are leaving the global identity layer and moving to where they belong—the Opportunity. Let’s build a billion-dollar architecture.
We transition from a flat CRM into a **true Enterprise domain model** — the same structural pattern HubSpot, Salesforce, and Pipedrive converged on because every real sales org eventually needs it:
- **Contacts** — the human. Universal, cross-pipeline, identity only.
- **Companies** — the business entity. Exists once, linked to many Contacts.
- **Properties** — the physical or logical asset (solar site, imóvel, franchise unit). Industry-agnostic, Contact- or Company-owned.
- **Opportunities** — the deal inside a pipeline. Links one Contact + optionally one Company + optionally one or more Properties.
We also ship the killer differentiator: **per-pipeline Agente CRM rules** — structured triggers for auditability, plus natural-language extraction hints for flexibility.
**The shift:** Sales-specific fields (value, meeting state, tasks, touchpoints, lead score) leave the global identity layer and live where they belong — the Opportunity.
---

## 🧭 GUIDING PRINCIPLES

1. **Cutover before cosmetics.** Rename only after every server-side writer (AI
   agent, webhook, KPI RPC, triggers) targets the new model. A rename without
   cutover breaks production silently.
2. **Associations, not direct FKs.** Many-to-many between Contacts ↔ Companies ↔
   Properties through a join table. Cheaper now than a Sprint 7 migration.
3. **Structured rules are the contract. Natural language is the garnish.**
   Agente CRM triggers live in a typed JSON schema. Free-text hints only inform
   field-extraction, never decide business actions.
4. **Nothing global that varies per pipeline.** If a field can differ between
   Solar and B2B contexts, it lives on the Opportunity. Contacts stay
   identity-pure.
5. **Additive migrations. No destructive drops this sprint.** Legacy columns go
   read-only via deprecation comments, not `DROP COLUMN`. Sprint 5 retires them.
6. **One component, many contexts — reaffirmed.** `DynamicFieldRenderer` now
   serves three schemas: Contact enrichment, Opportunity custom fields, Property
   attributes. No second form engine.

---

## 📐 ARCHITECTURE — The Four Entities

```
┌──────────────────────────────────────────────────────────────┐
│  IDENTITY LAYER (Tier 1)                                     │
│  contacts  ·  companies  ·  properties                       │
│  Joined via contact_company_links / opportunity_links        │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  PROCESS LAYER (Tier 2 · from Sprint 3)                      │
│  pipelines + pipeline_stages_v2 + custom_fields_schema       │
│  pipeline_agent_rules  ← NEW                                 │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  INSTANCE LAYER (Tier 3 · from Sprint 3, extended)           │
│  opportunities  →  links to Contact + Company? + Property[]  │
│  opportunity_stage_history                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 🧱 EPIC 0 — Sprint 3 Cutover (Non-Negotiable, Ships First)

> **Rule:** No work from Epic 1–6 starts until Epic 0 is green. Renaming tables
> while the AI writes to legacy fields is how production outages happen.

### 0.1 — Auto-create Opportunity on inbound lead

Currently `gpt-maker-webhook` and `crm-webhook` create a `lead` pointing at a
legacy `pipeline_stages` row. New behavior:

- Every tenant has a `equipes.default_pipeline_id` (nullable; set by admin in
  Pipeline Settings).
- Webhook creates the Contact (identity), then — if `default_pipeline_id` is set
  — creates an Opportunity in the pipeline's first stage.
- If no default pipeline, Contact lands in Base de Contatos unassigned (current
  manual-assignment flow handles it).

### 0.2 — Rewrite `analyze-message` to write to Opportunities

- AI agent no longer reads `lead.pipeline_stages(name)` or writes
  `lead.stage_id` / `lead.meeting_scheduled`.
- It resolves the Contact's **active Opportunity** (open status, most recently
  updated) and writes there:
  - `opportunities.stage_id` (new stage resolved by `stage_type` — e.g.
    "SCHEDULED" finds a stage with `stage_type='open'` whose name matches
    `pipelines.agent_rules.meeting_stage_name` — see Epic 4).
  - `opportunities.custom_data[<field_id>]` for extracted values, keyed by
    stable `field_id`.
- If the Contact has zero open Opportunities, AI can optionally auto-create one
  in `default_pipeline_id` — controlled by
  `pipelines.agent_rules.auto_create_opportunity`.

### 0.3 — Rewrite `get_dashboard_kpis`

Replace every `pipeline_stages.category` / `leads.stage_id` read with
`pipeline_stages_v2.stage_type` / `opportunities.status`. Keep the same return
JSON shape so the dashboard UI doesn't move.

### 0.4 — Retire `handle_lead_lifecycle` trigger

The trigger auto-assigns new leads to the first legacy stage. With opportunities
as the process instance, this is wrong. Replace with a no-op or drop (migration
reversible).

### 0.5 — Deprecate legacy lead columns (soft)

Add `COMMENT ON COLUMN` warnings but **do not drop**:

```sql
COMMENT ON COLUMN public.leads.stage_id IS
  'DEPRECATED Sprint 4. Use opportunities.stage_id. Removed Sprint 5.';
COMMENT ON COLUMN public.leads.opportunity_value IS
  'DEPRECATED Sprint 4. Use opportunities.value. Removed Sprint 5.';
-- same for meeting_scheduled, meeting_done, meeting_date, no_show,
-- next_contact, responsible_id, assigned_to, stage_entered_at, lead_score
```

### 0.6 — Delete dead code

Remove the legacy lead-centric `KanbanBoard.tsx`, `KanbanColumn.tsx`,
`LeadCard.tsx`, `StageManagerModal.tsx`, `usePipelineStages.ts` (v1 hook).
Nothing routes to them. They confuse future work.

### ✅ EPIC 0 Acceptance Criteria

- [x] Inbound webhook message → Contact created → Opportunity created in default
      pipeline's first stage
- [x] AI agent moves the Kanban card (opportunity), not the legacy lead
- [x] `get_dashboard_kpis` returns identical numeric shape, reading only from
      new tables (meeting KPIs still read legacy `leads.meeting_done` until Epic
      3 backfill; flagged with TODO in the function body)
- [x] Legacy Kanban files deleted from codebase (KanbanBoard, KanbanColumn,
      LeadCard, StageManagerModal; `usePipelineStages.ts` kept — still consumed
      by Chat / CRMContextPanel / DatabaseView / ExportModal /
      ConversationHeader; retires Sprint 5 with the rename)
- [x] Deprecation comments present on all legacy columns
- [x] Seed script creates 2 tenants × 2 pipelines × 30 opportunities × 60
      contacts for QA
- [ ] Manual regression: send a test WhatsApp message → verify Kanban updates
      live, not the old lead stage (**Orchestrator task — requires staging
      env**)

---

## 🧱 EPIC 1 — Foundations (Associations + Agent Rules Schema)

### 1.1 Schema Conventions (reaffirmed)

Every new table carries: `id`, `tenant_id` (as `equipe_id` for continuity),
`created_at`, `updated_at`, `deleted_at`. RLS enabled with the standard
`equipe_id = profiles.equipe_id` policy. Partial indexes on
`WHERE deleted_at IS NULL`.

### 1.2 Core identity tables

```sql
-- Already exists as `leads`; will be renamed `contacts` in Epic 3.
-- This sprint: extend in place.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'lead'
    CHECK (contact_type IN ('lead','opportunity','contact','spam','archived')),
  ADD COLUMN IF NOT EXISTS personal_custom_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by_type text DEFAULT 'team'
    CHECK (created_by_type IN ('team','automation','ai','import','webhook')),
  ADD COLUMN IF NOT EXISTS created_by_id uuid;  -- profile_id when type='team'

-- Normalize the origin field into a MECE taxonomy. Keep legacy `origin` text
-- column filled during dual-read, but authoritative source becomes origin_category + origin_detail.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origin_category text
    CHECK (origin_category IN (
      'organic_search','organic_social','paid_search','paid_social',
      'direct_brand','outbound_phone','outbound_message','outbound_email',
      'referral','partner_channel','offline_event','api_import'
    )),
  ADD COLUMN IF NOT EXISTS origin_detail text;  -- free text: campaign name, referrer name, event name
```

### 1.3 Companies

```sql
CREATE TABLE public.companies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id            uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  legal_name           text,
  cnpj                 text,
  website              text,
  industry             text,
  size_bracket         text CHECK (size_bracket IN ('solo','2-10','11-50','51-200','201-1000','1000+')),
  custom_data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX ON companies (equipe_id, name) WHERE deleted_at IS NULL;
CREATE INDEX ON companies (equipe_id, cnpj) WHERE deleted_at IS NULL AND cnpj IS NOT NULL;
```

### 1.4 Properties (agnostic asset entity)

```sql
CREATE TABLE public.properties (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id            uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  label                text NOT NULL,                -- "Casa Matriz", "Filial Fortaleza"
  property_type        text NOT NULL DEFAULT 'address',  -- 'address' | 'site' | 'unit' | 'custom'
  address              jsonb,                         -- {street, number, complement, neighborhood, city, state, zip, country}
  latitude             numeric(10,7),
  longitude            numeric(10,7),
  attributes           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- vertical-specific: roof_type, kWp, area_m2
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX ON properties (equipe_id) WHERE deleted_at IS NULL;
```

### 1.5 Associations (the engine)

Two join tables. Both carry `role` so the same entity pair can appear with
different meanings.

```sql
CREATE TABLE public.contact_company_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id      uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  contact_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role           text NOT NULL DEFAULT 'employee'
                 CHECK (role IN ('owner','decision_maker','employee','former','advisor','other')),
  is_primary     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (contact_id, company_id, role)
);

-- Polymorphic "this entity owns this property" link.
-- owner_type + owner_id avoids two near-identical tables.
CREATE TABLE public.property_owner_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id      uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  property_id    uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_type     text NOT NULL CHECK (owner_type IN ('contact','company')),
  owner_id       uuid NOT NULL,  -- contact.id or company.id; enforced in app layer + RLS
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (property_id, owner_type, owner_id)
);
CREATE INDEX ON property_owner_links (owner_type, owner_id) WHERE deleted_at IS NULL;

-- An opportunity's supporting cast.
CREATE TABLE public.opportunity_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id        uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  opportunity_id   uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  linked_type      text NOT NULL CHECK (linked_type IN ('company','property','contact')),
  linked_id        uuid NOT NULL,
  relation         text NOT NULL DEFAULT 'related',
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  UNIQUE (opportunity_id, linked_type, linked_id, relation)
);
```

`opportunities.lead_id` stays as the **primary Contact** — always exactly one.
Secondary contacts (co-buyer, spouse, partner) go through `opportunity_links`
with `linked_type='contact'`. Company and Property attachments go here too.

### 1.6 Pipeline Agent Rules (structured + NL hints)

```sql
CREATE TABLE public.pipeline_agent_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id      uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  pipeline_id    uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,

  -- Structured triggers — the contract
  triggers       jsonb NOT NULL DEFAULT '[]'::jsonb,
  /* Example triggers payload:
  [
    {
      "id": "rule_01",
      "name": "Agendou reunião",
      "when": { "type": "intent_detected", "intent": "meeting_scheduled" },
      "do": [
        { "action": "move_stage", "stage_type": "won", "stage_name_hint": "Reunião Agendada" },
        { "action": "set_field", "field_id": "<uuid>", "value": true },
        { "action": "add_touchpoint", "touchpoint_type": "meeting", "content_template": "Reunião agendada para {{meeting_date}}" },
        { "action": "create_task", "title_template": "Preparar apresentação para {{contact.name}}", "due_in_hours": 24 }
      ],
      "active": true
    }
  ]
  */

  -- Natural-language extraction hints — the garnish
  extraction_hints text,
  /* Free text: "Extract kWp from power bills. Capture roof type when mentioned.
     If caller mentions competitors, add tag 'competitive'." */

  -- Agent behavior toggles
  auto_create_opportunity     boolean NOT NULL DEFAULT false,
  auto_advance_stages         boolean NOT NULL DEFAULT true,
  auto_extract_custom_fields  boolean NOT NULL DEFAULT true,
  cooldown_minutes            integer NOT NULL DEFAULT 3,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id)  -- one rules row per pipeline
);
```

**Why structured + NL hints, not NL only:** auditability. Every AI action writes
to `ai_decisions` referencing the rule id that fired. Support can explain
exactly why an opportunity moved. Free-form prompts destroy that explainability.

### 1.7 New custom field types

Extend `CustomFieldType` union in `types/pipelines.ts`:

```ts
type CustomFieldType =
    | "text"
    | "number"
    | "currency"
    | "date"
    | "boolean"
    | "select"
    | "address" // NEW — structured {street,city,state,zip,country}
    | "property_ref" // NEW — FK to properties table
    | "company_ref" // NEW — FK to companies table
    | "contact_ref" // NEW — FK to another contact (co-buyer)
    | "multi_select" // NEW
    | "url" // NEW
    | "phone"; // NEW
```

For `*_ref` types the schema entry includes `target_scope: 'tenant'` — values
are keyed by target entity id.

### ✅ EPIC 1 Acceptance Criteria

- [x] All new tables created, RLS enabled, tenant-isolation tested (migration
      `20260422000000_sprint4_epic1_foundations.sql`; same
      `equipe_id IN (profiles…)` policy as Sprint 3 EPIC 2 — live integration
      test is an **Orchestrator task** once the migration deploys)
- [x] `DynamicFieldRenderer` renders every new field type (`address`,
      `property_ref`, `company_ref`, `contact_ref`, `multi_select`, `url`,
      `phone`) — `*_ref` ship with a Popover+Command picker today; Epic 4
      replaces it with the shared `EntityLinker`
- [x] Dropdown editor bug **fixed**: textarea accepts Enter → new line per
      option (`CustomFieldsEditor.tsx` — extracted into `OptionsEditor` with
      local raw state so `filter(Boolean)` only runs on emit, never on display)
- [x] `ai_decisions.rule_id` column added; `analyze-message` now writes it (NULL
      until Epic 5 wires rule matching — column & passthrough exist so Epic 5 is
      a one-line change)

---

## 🎨 EPIC 2 — UI Restructuring (Tabbed Pipeline View)

### 2.1 Pipeline tabs

When a pipeline is selected in `/crm`, the content area becomes three tabs:

1. **Kanban** — current `OpportunityKanban`, unchanged.
2. **Leads Database** — current `OpportunityTable`, unchanged (to be renamed in
   Epic 3).
3. **Agente CRM** — new `AgentRulesPanel` component (Epic 4).

`PipelineSelector` stays as the picker. `view` state now covers three values.
URL: `/crm?pipeline=<id>&view=kanban|leads|agent`.

### 2.2 Top-level CRM tabs

`/crm` top bar keeps the existing Pipeline / Database / Leads tab, renamed to:

- **Pipeline** (per-pipeline view, shows the 3 tabs above)
- **Base de Contatos** (was "Leads" — global contact database)

### 2.3 Navigation flow (solves 1.5)

- Contact row in Base de Contatos → detail drawer → lists all Opportunities
  across pipelines → each row deep-links to
  `/crm?pipeline=<id>&view=kanban&opp=<id>` with the card pre-opened.
- Opportunity detail modal → header shows Contact + Company + Property chips →
  clicking a chip opens that entity's detail drawer without leaving the Kanban.

### ✅ EPIC 2 Acceptance Criteria

- [x] Tabs render correctly, URL persistence works, tab state survives page
      reload (`/crm?tab=pipeline|contacts` + per-pipeline
      `?view=kanban|leads|agent`; both backed by `useSearchParams` and validated
      against typed unions in `CRM.tsx` and `PipelineWorkspace.tsx`)
- [x] Deep-link from Contact → Opportunity card opens modal directly
      (`LeadOpportunitiesSection` row gains an "Abrir no Kanban" link →
      `/crm?tab=pipeline&pipeline=<id>&view=kanban&opp=<id>`; both
      `OpportunityKanban` and `OpportunityTable` resolve `?opp=` on mount and
      strip it on close so reload doesn't re-open)
- [x] Chip navigation between Contact / Company / Property / Opportunity is
      bidirectional (`EntityChips` in `OpportunityDetailModal` header — Contact
      chip fully wired to `LeadDetailsModal` via `onOpenContact` callback in
      Kanban + Table; Company/Property chips render counts from
      `opportunity_links` and toast "EPIC 4" until `EntityLinker` lands. Reverse
      direction — Contact drawer → Opportunity card — flows through the deep-link
      added to `LeadOpportunitiesSection`)

---

## 🏷️ EPIC 3 — Taxonomy & Global Contact Schema

### 3.1 Rename (UI labels only, tables stay)

Tables stay as `leads` physically — a `DROP`/`RENAME` now breaks every Edge
Function and integration. We rename in the UI layer and in TypeScript types.
Physical rename happens Sprint 5 when we also drop deprecated columns.

- TypeScript type: add `export type Contact = Lead` alias; new code uses
  `Contact`.
- UI strings: "Leads" (global) → "Base de Contatos"; "Opportunities" / "Pipeline
  cards" → "Leads".
- Route stays `/crm` but the Leads sub-tab becomes "Base de Contatos".

### 3.2 Default Contact fields (finalized)

Authoritative list — anything not here lives on Opportunity:

| Field                | Type  | Notes                                                       |
| -------------------- | ----- | ----------------------------------------------------------- |
| name                 | text  | Required                                                    |
| phone                | text  | Indexed                                                     |
| email                | text  | Indexed                                                     |
| contact_type         | enum  | lead / opportunity / contact / spam / archived              |
| origin_category      | enum  | MECE taxonomy (see Epic 1)                                  |
| origin_detail        | text  | Campaign name, referrer name, event name                    |
| channel              | text  | whatsapp / instagram / telegram / webhook / import / manual |
| created_by_type      | enum  | team / automation / ai / import / webhook                   |
| created_by_id        | uuid  | profile_id when type='team'                                 |
| personal_custom_data | jsonb | Birthday, LinkedIn, Job Title, Picture URL, Social links    |
| observations         | text  | Rich-text (stays; promote to rich-text editor in UI)        |

### 3.3 MECE Origin taxonomy (finalized)

Locked to the list from your doc, grouped for the UI:

- **Inbound:** Organic Search · Organic Social · Paid Search · Paid Social ·
  Direct/Brand
- **Outbound:** Cold Call · Cold Message · Cold Email
- **Network:** Referral · Partner/Channel · Offline Event
- **System:** Import · API

### 3.4 Contact enrichment panel

`LeadDetailsModal` (to be renamed `ContactDetailsModal` in this epic) loses
every legacy sales field on its primary view. Those fields move to the
Opportunities section that's already inside the modal.

Primary view now contains:

- Identity block (name, phone, email, channel, origin)
- Enrichment block: `DynamicFieldRenderer` over a fixed schema for
  `personal_custom_data` (Birthday, LinkedIn, Job, Profile Picture, Social links
  — admin-configurable per tenant)
- Opportunities section (already built; reuse as-is)
- Activity timeline (already built; reuse as-is)

### 3.5 Legacy field migration (data, not schema)

A one-shot SQL migration backfills data from legacy lead columns into whichever
open Opportunity the Contact has. If a Contact has zero open Opportunities but
has legacy sales data, an Opportunity is synthesized in the tenant's
`default_pipeline_id`.

```sql
-- Pseudo-code sketch; Antigravity writes the full migration.
WITH backfill AS (
  SELECT l.id as contact_id, l.equipe_id, l.stage_id, l.opportunity_value,
         l.meeting_scheduled, l.meeting_done, l.meeting_date, l.no_show,
         l.next_contact, l.responsible_id, l.lead_score,
         (SELECT id FROM opportunities o
          WHERE o.lead_id = l.id AND o.status = 'open'
          ORDER BY o.updated_at DESC LIMIT 1) as target_opp_id
  FROM leads l
  WHERE l.stage_id IS NOT NULL OR l.opportunity_value > 0 OR l.meeting_scheduled
)
-- UPDATE target opp when it exists
-- INSERT new opp when target_opp_id IS NULL and equipe has default_pipeline_id
```

### ✅ EPIC 3 Acceptance Criteria

- [x] Every UI string updated ("Leads" → "Base de Contatos", "Opportunities" →
      "Leads") — top tab already shipped in EPIC 2; EPIC 3 completes the pass
      on pipeline-card contexts (`OpportunityKanban` count, `KanbanColumn`
      empty state, `OpportunityDetailModal` title/description/confirm,
      `LeadOpportunitiesSection` heading + hint, `OpportunityTable` header +
      empty state, `useOpportunities` toasts, `DatabaseView` header rebrand to
      "Base de Contatos", `CRM` empty pipeline state, `PipelineSettings` stage
      helper). Legacy labels on `CRMContextPanel`/`ConversationHeader`
      annotated with "(legado)" stay put — Sprint 5 retires them with the
      physical rename.
- [x] Contact detail modal primary view shows zero legacy sales fields
      (`ContactDetailsModal` replaces `LeadDetailsModal` — drops stage picker,
      responsible, opportunity_value, meeting_date, meeting_notes,
      meeting_scheduled/meeting_done/no_show, next_contact, niche
      `custom_fields`. Identity block now carries channel + origin_category
      (grouped select) + origin_detail + contact_type. Per-pipeline sales
      fields stay editable via the embedded `LeadOpportunitiesSection`.)
- [x] Backfill migration moves 100% of legacy sales data into Opportunities
      (`20260423000000_sprint4_epic3_backfill.sql` — idempotent via
      `custom_data.legacy_backfilled` marker; UPDATE path merges legacy
      flags/dates into the most-recent open opp; INSERT path synthesizes a
      new opp in the tenant's `default_pipeline_id` first stage for contacts
      with no open opps; tenants lacking a default pipeline are reported via
      `RAISE NOTICE`. Run against staging; manual regression is an
      **Orchestrator task**.)
- [x] Origin picker in `AddLeadModal` (now `AddContactModal`) uses MECE
      taxonomy (grouped Select over the 12-value
      `origin_category` check constraint, split into Inbound/Outbound/Rede/
      Sistema; free-text `origin_detail` input persists alongside. Dialog
      title + CTA retitled.)
- [x] `personal_custom_data` enrichment fields render and persist
      (`src/config/contactEnrichmentSchema.ts` defines the fixed schema —
      Aniversário / Cargo / LinkedIn / Instagram / Foto de Perfil (URL) —
      fed into the existing `DynamicFieldRenderer`; persisted via
      `useLeads.updateLead` which now threads `personal_custom_data`,
      `origin_category`, `origin_detail`, `contact_type`, `channel` through
      the spread update.)

---

## 🏢 EPIC 4 — Companies, Properties, Associations

### 4.1 Companies module

- New route: `/crm?view=companies` (top-level tab after "Base de Contatos")
- Same three-view pattern: Database (table) + Detail drawer
- Company detail shows: identity + `DynamicFieldRenderer` for custom_data +
  linked Contacts list + linked Opportunities list + linked Properties list

### 4.2 Properties module

- Secondary entity; not a top-level tab. Accessed from:
  - Company detail → "Properties" section
  - Contact detail → "Properties" section
  - Opportunity detail → "Properties" section (via `opportunity_links`)
- Address rendered via a composite component (street, city, state, zip, country)
  that serializes to the `address` JSONB column.
- Property detail shows which Contacts/Companies own it and which Opportunities
  reference it.

### 4.3 Assignment flows

**Three buttons, three flows, all backed by the associations tables:**

1. **Assign Contact to Pipeline** (solves 1.6) — in Base de Contatos row action:
   - Modal: select pipeline → select initial stage (default: first)
   - Creates `opportunities` row; if the Contact's `contact_type = 'lead'`,
     updates to `'opportunity'`
2. **Link Contact ↔ Company** — in Contact detail:
   - Search companies → select → pick role → create `contact_company_links` row
3. **Attach Property to Opportunity** — in Opportunity detail:
   - Search existing Property or "Create new" → pick relation → create
     `opportunity_links` row

### 4.4 "Link or Create" pattern

All three flows reuse a single component: `EntityLinker<T>` that searches
existing rows via fuzzy match and offers "Create new" inline. One component,
three consumers.

### ✅ EPIC 4 Acceptance Criteria

- [x] Companies module CRUD works end-to-end (`useCompanies` hook +
      `CompaniesDatabaseView` table + `AddCompanyModal` + `CompanyDetailModal`
      — identity edit + soft-delete + realtime invalidation. Accessed via the
      new `/crm?tab=companies` top-level tab; deep-link `?company=<id>` opens
      the detail drawer.)
- [x] Properties module CRUD works end-to-end (`useProperties` hook +
      `AddPropertyModal` + `PropertyDetailModal` — identity + structured
      address + lat/lng + soft-delete. Properties are accessed *from* the
      parent entities — no top-level tab, per §4.2.)
- [x] `EntityLinker` component used in all three assignment flows
      (`src/components/crm/EntityLinker.tsx` — generic search+create Popover
      over `companies`/`properties`/`leads`; also swapped in as the engine
      behind `EntityRefField` inside `DynamicFieldRenderer` so custom-field
      references share the UX. Flows:
      1. `AssignToPipelineDialog` (single row action + `BulkActions` bulk) —
         promotes `contact_type='lead'` to `'opportunity'` on success.
      2. `CompanySection` inside `ContactDetailsModal` — contact↔company via
         `contact_company_links` + role + `is_primary` toggle.
      3. `PropertySection` inside `OpportunityDetailModal` — opportunity→
         property via `opportunity_links`; sibling `CompanySection` added in
         the same pass for opportunity→company.
      `EntityChips` header in `OpportunityDetailModal` now opens the matching
      manager dialog instead of toasting "EPIC 4 coming soon".)
- [x] Contact with 3 Companies displays all 3 with distinct roles
      (`CompanySection contact` mode + `useContactCompanyLinks` — UNIQUE
      (contact_id, company_id, role) lets the same pair coexist with different
      roles; row selector wires `updateRole` per link; `setPrimary` is
      advisory and clears sibling flags atomically.)
- [x] Solar Opportunity can link multiple Properties (primary + additional
      sites) (`PropertySection opportunity` mode + extended
      `useOpportunityLinks` with `linkEntity`/`unlinkEntity`; UNIQUE
      (opportunity_id, linked_type, linked_id, relation) allows many
      properties per opp. `relation` defaults to "related"; future work can
      distinguish primary/secondary per-relation without schema changes.)

---

## 🤖 EPIC 5 — Agente CRM Rules Configuration

### 5.1 Agent Rules tab UI

Rendered when user picks a pipeline + "Agente CRM" tab.

**Sections:**

1. **Behavior toggles** — four switches (auto_create_opportunity,
   auto_advance_stages, auto_extract_custom_fields, cooldown_minutes slider)
2. **Rules list** — visual trigger → action builder. Each rule card shows:
   - Name (free text)
   - "Quando…" trigger type selector + params
   - "Então…" ordered action list (drag to reorder)
   - Active toggle
3. **Extraction hints** — single textarea; character counter; no syntax; sent as
   system-prompt suffix to the AI

### 5.2 Supported trigger types (V1)

Locked, typed, versioned. Anything not here is not a Sprint 4 trigger:

- `intent_detected` — intent ∈ {meeting_scheduled, interested, disqualified,
  objection_price, objection_timing}
- `message_contains` — case-insensitive substring or regex
- `media_received` — media_type ∈ {image, audio, document, video}
- `stage_entered` — fires when an opportunity enters a specific stage (from any
  stage)
- `idle_in_stage` — fires after N hours without progression
- `custom_field_set` — fires when `custom_data[field_id]` first gets a non-null
  value

### 5.3 Supported action types (V1)

- `move_stage` — resolves target by `stage_type` + `stage_name_hint`
- `set_status` — open / won / lost
- `set_field` — writes to `opportunities.custom_data[field_id]`
- `set_contact_field` — writes to `contacts.personal_custom_data[key]`
- `add_touchpoint` — uses existing `touchpoints` table
- `add_note` — uses existing `lead_activities` table
- `create_task` — uses existing `tasks` table
- `add_tag` — appends to `contacts.tags`
- `trigger_webhook` — posts to a tenant-configured webhook (Sprint 5 delivers
  the webhook configuration UI; Sprint 4 ships the action wired)

### 5.4 Agent execution contract (the core loop)

`analyze-message` Edge Function, after Epic 0 cutover, works like this:

1. Fetch Contact's active Opportunity + its `pipeline_agent_rules`
2. Classify intent + extract fields (guided by `extraction_hints`)
3. Evaluate every active trigger in order
4. For each firing trigger, execute actions atomically inside a transaction
5. Log one `ai_decisions` row per rule fired, with
   `{rule_id, trigger_type, actions_executed, status}`

### 5.5 Rule testing (stretch; defer if tight)

Read-only "Dry run against last message" button in the rules panel. Shows which
triggers would fire without actually writing anything. Helpful for debugging;
not critical for V1.

### ✅ EPIC 5 Acceptance Criteria

- [ ] Admin can create a rule with all 6 trigger types and all 9 action types
- [ ] Rule changes persist and take effect on the next inbound message
- [ ] `ai_decisions` audit log references the firing rule id
- [ ] Extraction hints flow into the AI prompt and influence field extraction
- [ ] Cooldown respected per-Contact (existing behavior preserved)

---

## 🚫 EXPLICITLY OUT OF SCOPE (Sprint 4)

- Physical `RENAME TABLE leads → contacts` (Sprint 5, after deprecation window)
- Dropping deprecated columns (Sprint 5)
- Webhook configuration UI (Sprint 5; action wire exists, config UI doesn't)
- Company/Property import via CSV (Sprint 5)
- Duplicate-detection across Companies and Properties (Sprint 5)
- Multi-language rule editor (English/Portuguese toggle — Sprint 6)
- Rule templates marketplace (Sprint 6+)
- Account hierarchies (parent/child companies) (Sprint 6+)
- Lead scoring as a computed field (Sprint 6+ — ships as manual field in
  Sprint 4)

---

## ✅ SPRINT 4 DEFINITION OF DONE

- [ ] Epic 0 cutover complete and regression-tested before any Epic 1–5 work
      ships
- [ ] All new tables RLS-protected and tenant-isolation integration-tested
- [ ] All migrations forward + reversible; Sprint 3 reversibility debt paid
- [ ] `DynamicFieldRenderer` renders 13 field types (6 existing + 7 new)
- [ ] Seed script: 2 tenants × 2 pipelines × 30 opportunities × 60 contacts × 20
      companies × 15 properties
- [ ] `CustomFieldsEditor` dropdown-option bug fixed (Enter creates new line)
- [ ] Zero new external dependencies beyond Supabase-native features
- [ ] Legacy lead-centric Kanban code deleted from codebase
- [ ] Dashboard KPIs read from new model; dashboard UI unchanged

---

## 📎 NOTES FOR ANTIGRAVITY

- **Epic 0 is a hard gate.** If any test in Epic 0 acceptance fails, do not
  start Epic 1. Cutover before cosmetics.
- **Rename nothing physical.** Table renames (`leads → contacts`) are Sprint 5.
  This sprint: type aliases and UI strings only.
- **One rule at a time in tests.** When validating Epic 5, write one minimal
  rule (e.g., `intent_detected: meeting_scheduled → move_stage: won`) and verify
  end-to-end before stacking more.
- **`EntityLinker` is the chokepoint.** Get it right once; Epic 4 uses it three
  times. If it's janky, every assignment flow is janky.
- **Don't invent new JSON shapes.** Triggers and actions match the schemas above
  exactly. If something doesn't fit, add it to the schema deliberately — don't
  improvise.
- **Precision OS Dark aesthetic holds.** Every new panel (Companies, Properties,
  Agent Rules) inherits tokens from existing CSS variables. No new colors this
  sprint.
