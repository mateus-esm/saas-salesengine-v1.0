# Sprint 6.7 — The Revenue Powertrain: Consolidating Solo Copilot V1 + CRM V1

> **Status:** Strategic Vision Document (pre-planning)
> **Objective:** Close the Copilot V1 + CRM V1 chapter by fusing both into a single, cohesive Revenue Powertrain — then move to the next frontier.
> **Philosophy:** Predictable Revenue DNA embedded at the code level. Groq-speed inference. McLaren-precision engineering. Service-as-a-Software (SaaS) business model.

---

## The Big Picture: Why Sprint 6.7 Exists

Sprints 6.1 through 6.6 built two parallel tracks:

| Track | What was built | Current state |
|---|---|---|
| **CRM V1** | Base de Contatos, Pipelines (Kanban + Leads table), Empresas, Imóveis, Tarefas, dynamic columns, bulk actions, inline editing, card telemetry pillars, entity linking (contact↔company↔property) | Functional but raw — no Predictable Revenue math, no ICP scoring, no velocity tracking |
| **Copilot V1** | Agno-powered agent cascade (Tower→Floor→Worker), Copilot Cockpit (Setup/Treinamento/Aprovações/Logs), Sync engine, Credit Ledger, field dictionary, approval cards, telemetry HUD | Functional but isolated — lives in its own tab, not woven into the CRM fabric |

**The problem:** They exist as *separate features* rather than as a *unified revenue system*. The Copilot enriches contacts and moves cards, but the CRM doesn't *think* in revenue terms. There's no mathematical feedback loop between what the Copilot does and what the CRM displays.

**Sprint 6.7 exists to fuse them.** The CRM becomes the instrument panel. The Copilot becomes the engine. Together they form the **Revenue Powertrain** — a system where every contact, every pipeline movement, every automation is measured, scored, and optimized for one thing: **predictable revenue generation.**

---

## 🏎️ 1. The Core Drivetrain: Service-as-a-Software Architectural Blueprint

The **Service-as-a-Software (SaaS)** model is the ultimate framework for maximizing enterprise leverage and code maintainability. Instead of cluttering the product dashboard with countless input forms, specialized settings menus, and configuration wizards, the application acts as a streamlined, ultra-responsive core system out of the box.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                    HIGH-PERFORMANCE STANDARD CORE                          │
│   (Base de Contatos │ Pipelines │ Empresas │ Tarefas │ Imóveis │ Copilot) │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │
               🏆 [Premium Custom Workspace Upgrade Trigger]
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    OUTSOURCED PIT-CREW ENGINEERING                         │
│  (Relational Table Linkages, Bespoke n8n Engines, Complex JSONB Maps)      │
└────────────────────────────────────────────────────────────────────────────┘
```

### The Core Chassis

Standardize development on an optimized, highly uniform environment focused entirely on sales execution speed. The visible layout is limited to exactly **six top-level workspace tabs** to maintain low visual friction and prevent cognitive fatigue:

1. **Base de Contatos** — The global interactive master sheet for unified contact records. Universal lead pool and historical interaction matrix.
2. **Pipelines** — The visual sales funnel managing opportunity states via Kanban cards or grid lists. The physical funnel where active opportunities move through milestone-driven stages.
3. **Empresas** — A streamlined directory mapping individual opportunities to B2B corporate entities.
4. **Tarefas** — A high-leverage task control center governing operational actions, deadlines, and follow-ups.
5. **Imóveis** — Niche-specific property tracking for real estate verticals (hidden by default, toggleable).
6. **Copilot** — The automated operational nervous system managing the workspace backend logic. Centralized operational dashboard to manage automated business logic.

### The Custom Upgrades Moat

Niche-specific database entities and structural customizations are kept out of the default codebase. If a client requires specialized entity cross-linking, relational data schemas, or custom API logic, they hire your elite engineering team to deploy those features as a premium configuration service.

### The Operational Target

Eradicate administrative drag, context fragmentation, and manual entry, placing the closer at the point of peak performance: closing qualified deals.

---

## 🛠️ 2. High-Priority Workspace Restructuring & UI/UX Technical Debt Eradication

### ⚡ The Async Ticker Sync Sheet (Groq-Speed Feedback)

The layout-blocking full-screen dark modal triggered during sync processes is deprecated. It is replaced with a right-aligned sliding panel using the `src/components/ui/sheet.tsx` component.

- **Background Momentum:** Clicking sync opens the sheet natively without blocking the main dashboard layout. Mutations execute asynchronously in background worker threads, allowing the user to view pipelines or alter rows simultaneously.
- **Monospaced Log Streams:** The sheet renders a minified, scrolling text log utilizing a high-contrast monospaced font style (`font-mono text-[10px] text-muted-foreground/60`) that outputs explicit execution metrics instead of abstract database references:

```text
[14:21:02] ⚡ Ingestion loop handshake established.
[14:21:03] 🎯 Evaluating intent profile matrix...
[14:21:03] 🔥 Lead Score updated: 88 | Lifecycle: SQL
[14:21:04] 💾 Committing custom_fields JSONB block to public.leads
```

### 🗂️ Top-Level Navigation Re-engineering

The visible layout is limited to exactly six top-level workspace tabs to maintain low visual friction and prevent cognitive fatigue:

1. **Base de Contatos:** The global interactive master sheet for unified contact records.
2. **Pipelines:** The visual sales funnel managing opportunity states via Kanban cards or grid lists.
3. **Empresas:** A streamlined directory mapping individual opportunities to B2B corporate entities.
4. **Tarefas:** A high-leverage task control center governing operational actions, deadlines, and follow-ups.
5. **Imóveis:** Niche-specific property tracking for real estate verticals (hidden by default, toggleable via feature activation grid).
6. **Copilot:** The automated operational nervous system managing the workspace backend logic.

### 🧠 Copilot Interface Refactor (McLaren Cockpit Design)

Remove all scattered visual configuration cards, informational text boxes, and dense description blocks from the view layout.

The refactored interface is structured as a **vertical list of active business pipelines**. Clicking a pipeline row smoothly expands an interactive accordion menu using the `src/components/ui/accordion.tsx` layer, exposing exactly three functional parameters per pipeline:

- **Prompt & Knowledge Base:** Direct access to backend instruction configurations and localized vector knowledge tables.
- **Local Automations:** High-velocity deterministic stage-gate trigger rules.
- **Local Logs:** Segmented, real-time debugging streams capturing changes specific to that funnel.

The Copilot Cockpit (Setup/Treinamento/Aprovações/Logs) stays as the **global view**. The per-pipeline accordion is the **tactical view**.

### 🔒 Isolation of Specialized Multi-Table Modules

Niche-specific industry matrices (such as *Usinas Solares* for solar asset tracking or *Imóveis* for real estate variables) must not exist as top-level dashboard tabs by default.

They are managed within an explicit **feature activation grid**. Toggling a niche on exposes a clean, standardized spreadsheet layout. Advanced cross-relational data mapping or deep business automations for these tables are restricted behind a premium upgrade button, driving immediate consulting service revenue.

### 🎨 Groq + McLaren Design Language Applied

From the study of both brands' design systems, here are the patterns we incorporate:

| Element | Groq Inspiration | McLaren Inspiration | Our Application |
|---|---|---|---|
| **Color Palette** | `#1E1E1E` (near-black), `#F55036` (signature red-orange), `#F8F8F7` (off-white), `#E7E5E4` (subtle border) | `#FF8000` (papaya orange), `#53565A` (anthracite gray), `#FFFFFF` (white), `#FF8000` accent | Keep our `--primary: 28 100% 50%` (orange), add `--racing-dark: 0 0% 6%` for HUD bars, `--papaya: 28 100% 59%` for accents |
| **Typography** | Inter + Montserrat system font stack, `font-weight: 500` for buttons, `font-size: 14px` body | Soho Gothic Pro + system sans, `font-mcl-regular` / `font-mcl-bold` | Our Inter stack is solid — add `font-mono` for telemetry logs, `font-semibold` for HUD headers |
| **Border Radius** | `8px` buttons, `12px` containers | `chamfer-lg` (angled cut corners on cards) | Keep `--radius: 0.5rem` (8px), add chamfered corner option for premium cards |
| **Shadows** | `0 4px 6px -1px rgba(0,0,0,0.1)` | `nav-shadow`, `sub-nav-shadow` | Our `--shadow-elegant` is good — add `--shadow-hud: 0 4px 24px rgba(0,0,0,0.3)` for bottom HUD |
| **Hover Effects** | `transition: all 0.2s ease`, darken on hover | `group-hover:translate-x-[4px] group-hover:-translate-y-[4px]` (arrow lift), `group-hover:animate-side-to-side-bounce` | Add micro-lift animations on interactive cards, arrow rotation on expandable rows |
| **Navigation** | Clean top bar with dropdown chevrons, minimal chrome | Mega-menu with content blocks grid, `border-s-[1px]` dividers, `focus-visible:outline-papaya` | Our tab bar is clean — add keyboard focus rings with orange outline |
| **Dark Mode** | `--dg-consent-background-color: rgb(18, 20, 24)` for dark, `--dg-body-font-color: rgb(165, 160, 156)` | `bg-anthracite` (`#53565A`), `text-white` on dark sections | Already have `.dark` — enhance with racing-inspired dark palette |
| **Pattern Elements** | Minimal, content-first layout, generous whitespace | Thick diagonal line pattern (`thick-line` SVG pattern), used as section dividers | Add subtle diagonal line pattern as decorative divider between major sections |
| **Button Design** | `border-radius: 8px`, `padding: 8px 16px`, `font-weight: 500`, `transition: all 0.2s ease` | `bg-papaya` (`#FF8000`) primary CTA, `bg-black` secondary, `focus-visible:outline-papaya` | Our buttons are solid — add papaya orange as secondary accent for HUD actions |
| **Loading States** | Clean spinner, minimal skeleton | Skeleton loaders with `bg-light-grey` shimmer | Already have `Loader2` — add skeleton rows for table loading |
| **Card Design** | Clean white cards, subtle border, `12px` radius | `chamfer-lg` corners, content blocks grid, gradient overlays on images | Add chamfered corner option for Kanban cards, gradient overlays for hero sections |

---

## 📊 3. High-Performance Excel Grid Controls & Massive Action Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                  SPREADSHEET PERSISTENCE LAYER                             │
│                                                                            │
│   [lead_id] ➔ [custom_fields JSONB] ➔ { dynamic_metadata_properties }     │
│   [opp_id]  ➔ [custom_data JSONB]   ➔ { dynamic_stage_parameters }        │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │ (Checkbox Selection Event)
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     MASSIVE ACTION FOOTER HUD                              │
│   [✓] 14 Selected │ ⚡ Bulk Sync │ 📋 Bulk Proposal │ 👤 Assign Owner │ 🗑️ │
└────────────────────────────────────────────────────────────────────────────┘
```

### The Flexible JSONB Core Matrix

Every workspace row functions as an interactive spreadsheet matrix. To support dynamic personalization without triggering continuous database schema migrations, fields are read and written straight from structural `JSONB` parameters on the database layer:

- `public.leads.custom_fields`: Stores specific demographic variables, campaign parameters, and custom column attributes.
- `public.opportunities.custom_data`: Captures stage-specific attributes, commercial details, and custom pipeline parameters.

### Progressive Field Controls

- **Dynamic Column Projections:** Users add, delete, or reorder column layouts through an inline metadata dropdown. The frontend projects these columns dynamically, fetching only the requested JSONB parameters.
- **Inline Cell Editing:** Double-clicking a grid cell transitions it into an input field instantly. Blurring or pressing Enter pushes a background mutation to the database layer via real-time hooks, preserving grid context with zero layout refresh delay.

### The Massive Action Bottom HUD (McLaren Pit-Crew Style)

Checking row targets on any grid component pushes an active collection array to frontend state management, smoothly sliding up a dark, high-contrast command bar at the very bottom edge of the screen viewport:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [✓] 14 Opportunities Selected  │  ⚡ Bulk Sync  │  📋 Bulk Proposal        │
│ 👤 Assign Closer  │  🔗 Link to Company  │  🗑️ Archive                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Clicking an action button unloads the target ID array into an asynchronous worker queue, executing batch modifications on the database instantly while rows transition to their updated state on screen.

### Relational Table Architecture: The Entity Link System

Already partially built (`EntityLinker.tsx`, `EntityChips.tsx`, `contact_company_links`, `property_owner_links`, `opportunity_company_links`), this system enables **relational power within a sales context**:

| Relationship | Current State | Sprint 6.7 Target |
|---|---|---|
| **Contact ↔ Company** (N:1) | ✅ Built via `contact_company_links` with role + is_primary | Add inline column in Base de Contatos showing linked company as a chip |
| **Contact ↔ Property** (N:1) | ✅ Built via `property_owner_links` | Add inline column showing linked property |
| **Opportunity ↔ Company** (N:1) | ✅ Built via `opportunity_company_links` | Surface company name in Kanban card and Leads table |
| **Opportunity ↔ Contact** (1:1) | ✅ Built via `opportunities.lead_id` FK | Already working — primary contact on card face |
| **Company ↔ Properties** (1:N) | ✅ Built via `properties.company_id` | Show property count in Empresas table |
| **Custom Table Creation** | ❌ Not built | Feature activation grid: toggle on a new table → basic spreadsheet appears. Premium upgrade for relational mapping |

**The vision:** When inside a Pipeline view, a user can add a column that shows "Empresa" (looked up from the linked company), "Imóvel" (looked up from linked property), or any future custom table. This gives the power of relational databases but focused entirely on selling — not on database administration.

---

## 🧠 4. Predictable Revenue DNA & Real-Time Telemetry Mathematics

To build a truly repeatable revenue engine, the system's core DNA separates conversational triage from human execution, utilizing automated database calculations to evaluate deal velocity and sales targets.

### The Specialization Layer (Predictable Revenue Model)

- **The Chat Agent (Automated MDR — Marketing Development Rep):** Intercepts raw interaction payloads from channel webhooks, processes conversation strings, maps semantic intent, and extracts structural variables into the lead's contact row without requiring human intervention.
- **The Solo Copilot (Automated SDR — Sales Development Rep):** Scans database layers in background threads to calculate parameters, check SLA timers, track custom properties, and route deals. It never sends direct messages to the final client.
- **The Account Executive (Human Closer):** Steps into the workspace view *only* when the machine updates an opportunity's hidden classification to an authenticated Sales Qualified Lead (SQL) state, ensuring human energy is focused entirely on closing.

### The Telemetry Engineering Math

To eliminate compute latency on the frontend application layer, all mathematical scoring weight runs natively within the database via PostgreSQL functions and automated row triggers:

#### 1. The ICP Vector Fit Percentage

Calculates an immediate structural match value comparing custom metadata fields against target profile parameter weights. Let $W_i$ represent the fixed strategic weight of an engineering field, and $V_i$ represent the normalized match value computed by the agent $(0 \text{ to } 1)$. The absolute **ICP Score ($I$)** outputs as a percentage badge:

$$I = \left( \sum_{i=1}^{n} (W_i \times V_i) \right) \times 100$$

#### 2. The Dynamic Lead Velocity Score

Tracks customer engagement momentum over time. Let $A_j$ represent the positive score added by an event milestone (e.g., uploading an energy bill, scheduling a validation call), and $D_k$ represent a fixed time-decay factor based on days of total buyer silence ($t$):

$$S = \left( \sum_{j=1}^{m} A_j \right) - (D_k \times t)$$

- **Visual Badge Integration:** Both indicators render inside the spreadsheet grid rows using ultra-minimalist micro-badges (`🎯 95%` / `🔥 85`) with variable text opacities, preserving an elegant racing-console aesthetic.

#### 3. Reverse-Engineered Intake Tracking

Calculates required inbound volume trends against historical stage conversion probabilities ($P_s$) to automatically warn the operator if intake velocity drops below structural thresholds:

$$\text{Required Inbound Leads} = \frac{\text{Target Closed Deals}}{\prod_{s=1}^{n} P_s}$$

#### 4. Invisible Funnel Qualification

The application automatically tracks and shifts hidden lead lifecycle classifications in the background, identifying raw contacts as **Marketing Qualified Leads (MQL)** and **Sales Qualified Leads (SQL)** based on metadata matches — no manual triage required.

---

## 🔌 5. Non-Blocking Cadence Workflows & External Orchestration Routing

```text
                                [INBOUND WEBHOOK ENDPOINT]
                                             │
                                             ▼ (<50ms Ingestion Handshake)
                                    [BASE DE CONTATOS]
                                             │
              ┌──────────────────────────────┴──────────────────────────────┐
              ▼ (Deterministic Trigger)                                     ▼ (08:00 AM Cron Script)
   [LOCAL STAGE-GATE ENGINE]                                       [MULTI-CHANNEL CADENCE]
   • Update SLA Timers                                             • Odd Days: WhatsApp Template
   • Append Local Log Rows                                         • Even Days: Resend HTML Email
   • Trigger n8n Webhooks ➔ (APITemplate, Asaas, Clicksign)        • Cold Leads: Auto-Recycle Loop
```

### Local Deterministic Trigger Engine

Basic stage-gate actions — such as mutating status variables, executing row formatting, updating internal log trails, or initiating SLA timers when an opportunity enters a new stage — run natively within the database layer. This eliminates network round-trip latency and prevents dependency on external tools for core state changes.

### Hook Routing & Ingestion Architecture

- **The Ingest Loop:** Leveraging your existing inbound webhook infrastructure to map incoming communication payloads straight into the database core.
- **Lean Ingestion Poka-Yoke:** The ingestion endpoint runs a regex filtering routine on primary data properties — specifically cleaning phone number strings (`replace(/\D/g, '')`) before committing the rows to prevent duplicate contact records.

### Multi-Channel Cadence Execution

The system implements a structured **10-day multi-channel sales sequence** driven by background cron jobs that run at 08:00 AM daily:

- **Odd Days (1, 3, 5, 7, 9):** Programmatic distribution of interactive WhatsApp notification templates via connected API channels.
- **Even Days (2, 4, 6, 8, 10):** Distribution of stylized HTML operational emails routed through a native **Resend** integration layer.
- **The Continuous Recovery Loop:** When a lead cools down and transitions to a "Recycle" status, the system tracks its automated `next_contact` target date. On that exact timestamp, a local trigger moves the opportunity back to Stage 1, automatically re-initiating the follow-up sequence.

### One-Click External Automations & Partner Gateways

- **The Workflow Overdrive Engine:** Selecting an item inside the Massive Action HUD drops a clean data payload straight out to a self-hosted **n8n container script**. This background process automatically maps proposal contracts via **APITemplate**, issues signature links through **Clicksign**, and instantiates customer accounts inside the **Asaas** billing engine.
- **The Referral Partner Gateway:** When an inbound row includes a verified identifier tag, the system issues an outbound confirmation notification to your partner and reveals a secure, isolated portal layout where they track deal milestones without accessing sensitive database columns.

---

## 📅 6. Agenda Inteligente: Calendar Agent + Google Agenda Integration

**Q: Is it possible to have an agenda area where the client can have a calendar agent or integrate with Google Agenda, with the view inside our app?**

**A: Yes — and the foundation is already partially in place.**

### What Already Exists

| Component | Status | Location |
|---|---|---|
| `Calendar` UI component (DayPicker) | ✅ Built | `src/components/ui/calendar.tsx` |
| `date-fns` with ptBR locale | ✅ Built | Used across Tasks, NextContactBadge, TouchpointsList |
| `next_contact` field on leads | ✅ Built | Already used for follow-up date tracking |
| Task system with `due_date` | ✅ Built | `TasksView.tsx`, `TaskDialog.tsx` |
| Google OAuth infrastructure | ✅ Built | `src/integrations/supabase` has Google auth provider configured |

### What We Need to Build

#### Phase 1: Internal CRM Calendar View (Sprint 6.7 scope)

A **Calendar tab** inside the CRM that displays:

- **Tasks** with `due_date` rendered on their due day
- **Contacts** with `next_contact` rendered as a follow-up flag
- **Opportunities** with `stage_entered_at` / expected close dates
- **Touchpoints** logged on specific dates
- Color-coded by type (task = blue, follow-up = orange, touchpoint = green, opportunity = purple)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◀ June 2026 ▶                                              [Today] [+]    │
│  Sun  Mon  Tue  Wed  Thu  Fri  Sat                                         │
│       1    2    3    4    5    6                                            │
│            [📞]      [📋]                                                   │
│   7    8    9   10   11   12   13                                           │
│  [🔥]      [📞]      [📋]      [📞]                                        │
│  14   15   16   17   18   19   20                                           │
│       [📞]      [📋]                                                        │
│  21   22   23   24   25   26   27                                           │
│  [🔥]                                                                       │
│  28   29   30                                                               │
│       [📞]                                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation approach:**
- New route: `?tab=agenda` in the CRM top-level tabs
- New component: `AgendaView.tsx` using `react-day-picker` (already installed) with custom day rendering
- Query: aggregate `tasks`, `leads.next_contact`, `opportunities.expected_close_date`, `touchpoints.date` into a unified calendar event list
- Click a day → show event list panel on the right side

#### Phase 2: Google Calendar Integration (Post-Sprint 6.7)

- Use Google Calendar API with existing OAuth credentials
- Two-way sync: CRM tasks ↔ Google Calendar events
- When a `next_contact` date is set, optionally create a Google Calendar event
- When a Google Calendar event is created with a lead's name, optionally create a task in CRM

#### Phase 3: Calendar Agent (Future)

- The Copilot can read the calendar and suggest optimal contact times
- "Schedule follow-up with João next Tuesday at 10am" → agent creates both the CRM task AND the Google Calendar event
- Automated daily briefing: "You have 3 follow-ups today, 2 proposals due this week"

---

## 🏁 7. Sprint 6.7 Actionable Implementation Tasks & File Handoff Specifications

To implement this architecture smoothly, execute the codebase updates using this targeted engineering checklist:

### 🗂️ 1. Database Schema & Migration Enhancements (`supabase/migrations/`)

- [ ] **Refactor Core Schemas:** Add `tasks` table primitives and update `public.leads.custom_fields` and `public.opportunities.custom_data` to ensure deep GIN index coverage on JSONB columns.
- [ ] **Write `fn_calculate_icp_score`:** Implement the automated PL/pgSQL vector function inside the database layer to compute percentage matches based on custom JSONB fields.
- [ ] **Write `fn_calculate_lead_velocity`:** Implement the automated time-decay activity function to evaluate engagement velocity directly inside database records.
- [ ] **Deploy Stage-Gate Triggers:** Write native Row-Level triggers to automate internal stage changes, log updates, and SLA tracking directly inside pipeline tables.
- [ ] **Add MQL/SQL lifecycle columns:** Add `lifecycle_stage` enum to `leads` table (raw → mql → sql → opportunity → client → lost).
- [ ] **Create calendar events bridge table:** `calendar_events` table with `source_type` (task/lead/opportunity/touchpoint), `source_id`, `date`, `title`, `type` for unified agenda view.

### 🐍 2. Backend Application Layer Refactoring (`python-agent/app/`)

- [ ] **Integrate Webhook Poka-Yoke:** Add regex data-cleansing routines inside the ingestion endpoints (`app/routers/ingest.py`) to sanitize phone parameters on arrival.
- [ ] **Decouple Agent Execution:** Optimize Agno agent roles (`app/cascade/`) to establish a clear structural boundary: the Chat Agent triages conversational intent, while the Solo Copilot runs backend analytics asynchronously.
- [ ] **Deploy Non-Blocking Fast Paths:** Update FastAPI endpoint handlers to wrap long-running analytics and n8n webhook posts inside standard `BackgroundTasks` calls, ensuring response execution speeds stay under 50ms.
- [ ] **Build Cadence Cron Timers:** Deploy the daily 08:00 AM multi-channel sequence logic inside the scheduler module (`app/routers/sync.py`), handling alternating WhatsApp and Resend email paths.
- [ ] **ICP Score API Endpoint:** Create `GET /api/v1/icp-score/{lead_id}` that calls the Postgres function and returns the score + breakdown.
- [ ] **Lead Velocity API Endpoint:** Create `GET /api/v1/lead-velocity/{lead_id}` that calls the Postgres function and returns velocity + trend.

### ⚛️ 3. Frontend Cockpit Component Engineering (`src/components/`)

- [ ] **Deploy the Async Ticker Sheet:** Replace the full-screen sync modal inside `src/components/crm/copilot/SyncButton.tsx` with a right-aligned sliding panel rendering a continuous monospaced log stream (`font-mono text-[10px]`).
- [ ] **Re-engineer Top Navigation:** Enforce a clean 6-tab core workspace layout in `src/pages/CRM.tsx` (Base de Contatos, Pipelines, Empresas, Tarefas, Imóveis, Copilot).
- [ ] **Refactor Copilot Section Layout:** Clear the scattered layout cards from `src/pages/CopilotCockpit.tsx` and implement a polished accordion directory displaying active pipeline controls.
- [ ] **Build the Excel Spreadsheet Matrix:** Update data rows inside `src/components/crm/OpportunityTable.tsx` to handle inline cell text modification, dynamic column selection options, and embed the minimalist telemetry badges (`🎯` / `🔥`).
- [ ] **Deploy the Massive Action Bottom HUD:** Engineer the high-contrast sliding command drawer inside `src/components/crm/BulkActions.tsx`, wiring checkbox selections to async batch operations.
- [ ] **Build ICP & Velocity Badge Components:** Create `ICPScoreBadge.tsx` and `VelocityScoreBadge.tsx` micro-components that render inside table rows and Kanban cards.
- [ ] **Build Agenda View:** Create `AgendaView.tsx` — a calendar component using `react-day-picker` that aggregates tasks, follow-ups, and touchpoints into a unified day-by-day view. Add `?tab=agenda` route.
- [ ] **Apply McLaren/Groq Design Polish:** Add chamfered corner option for premium cards, papaya orange accent for HUD elements, subtle diagonal line pattern dividers, micro-lift animations on interactive cards, keyboard focus rings with orange outline.

### 🧪 4. Testing & Verification

- [ ] **Backend tests:** `python -m pytest tests/ -q` — all pass, 0 new failures.
- [ ] **Frontend build:** `npm run build` — must be green.
- [ ] **Browser smoke:** Manual smoke of all 6 tabs, sync flow, bulk actions, ICP badge rendering, agenda view.

---

## 🧭 Strategic Questions for Sprint Planning

These are NOT tasks — they are the design tensions we need to resolve before writing the implementation plan:

1. **ICP Scoring:** Do we compute scores via a Postgres function (fast, no network) or via the Agno agent (context-aware, slower)? Trade-off: speed vs. intelligence.

2. **MQL/SQL Classification:** Rule-based (metadata matches) or ML-assisted (pattern recognition on historical conversions)? The current codebase has no ML infra — rule-based is faster to ship.

3. **Table Controls Unification:** Build a shared `SpreadsheetGrid` component that all 6 CRM sections use, or enhance each section independently? Shared component = higher upfront cost, lower maintenance.

4. **Cadence Engine:** Run inside the Python agent (Agno workflow) or as a separate Supabase Edge Function (scheduled)? Edge Function = no dependency on agent being up.

5. **Copilot Per-Pipeline Accordion:** Replace the current `CopilotConfigCard` grid entirely, or add the accordion as an alternative view? Progressive enhancement vs. clean break.

6. **External Integration HUD:** Build the bottom command bar as a generic `BulkActionBar` component that any table can invoke, or keep it specific to Base de Contatos?

7. **Calendar Integration Depth:** Phase 1 only (internal CRM calendar) or start Phase 2 (Google Calendar sync) in this sprint? Google Calendar API requires OAuth scope changes.

8. **Custom Table Creation:** Build the feature activation grid (toggle on/off existing niche tables) or also build the "create a new table from scratch" UI? The latter is significantly more complex.

---

## 📐 Architectural Principles That Carry Forward

| Principle | Why |
|---|---|
| **Tenant-scoped everything** | Every query filtered by `equipe_id` — hard requirement from Supabase RLS |
| **Field dictionary boundary** | Copilot never writes to an undefined field — prevents data corruption |
| **Additive migrations only** | Never drop or rewrite columns — zero-downtime compatible |
| **PT-BR for all user-facing strings** | Matches existing convention and user base |
| **Async non-blocking UI** | Sync, approvals, and automations never lock the interface |
| **Build gate before merge** | `npm run build` must pass — tsc alone is not sufficient |
| **JSONB for dynamic fields** | No schema migrations for custom columns — `custom_fields` / `custom_data` handle it |
| **Entity links via bridge tables** | `contact_company_links`, `property_owner_links`, `opportunity_company_links` — relational power without rigid schemas |

---

## 🔗 Relationship to Previous Sprints

| Sprint | Delivered | Feeds into 6.7 |
|---|---|---|
| **6.1** | Credit ledger, sync button, telemetry HUD concept, multi-agent matrix vision | Foundation for monetization + sync UX |
| **6.2** | Async HUD drawer, humanized approvals, reactive execution loop, F1 cockpit paradigm | Approval cards + non-blocking sync |
| **6.3** | Central do Copiloto tab, credit ledger panel | Copilot Cockpit foundation |
| **6.4** | Field dictionary, precision spine, attach_file, deal-scoped notes | Predictable Revenue math needs bounded fields |
| **6.5** | Copilot top-level tab, training panel, contact columns, Kanban card fixes | CRM + Copilot unification |
| **6.6** | Cockpit close-out: Setup/Treinamento/Aprovações/Logs tabs, billing backfill | Clean foundation for 6.7 |

---

## 🚀 Beyond Sprint 6.7: The Next Frontiers

Once Copilot V1 + CRM V1 are consolidated, the roadmap opens to:

- **Multi-channel campaign orchestration** (beyond the 10-day cadence)
- **Predictive forecasting** (ML models on pipeline velocity data)
- **Partner portal** (self-service referral tracking)
- **Mobile CRM** (field sales companion)
- **Advanced analytics dashboard** (revenue intelligence, cohort analysis)
- **Vertical-specific modules** (Usinas for solar, Imóveis for real estate)
- **Google Calendar full sync** (bidirectional event synchronization)
- **Calendar Agent** (AI-powered scheduling and daily briefing)

But first: **consolidate. Fuse. Ship.**

---

*This document is the strategic north star. The implementation plan will break this into waves, tasks, and acceptance criteria.*

---
---

# Sprint 6.7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Junior-engineer contract:** Assume the implementer knows React/TypeScript/FastAPI/Postgres but knows *nothing* about this codebase. Every task gives exact paths, the interface neighbors depend on, and a concrete gate. **Before editing any large existing file (e.g. `OpportunityTable.tsx` is 706 lines), READ it fully first and follow its existing patterns — do not restructure it.**
>
> **Wave-gated planning:** Waves 1 and 3 are fully detailed below. Waves 2, 4, 5 carry a **PM RE-PLAN AT WAVE START** marker: their objective, files, and acceptance criteria are fixed here, but the bite-sized task breakdown is produced by the PM at the moment that wave begins — because the exact code depends on artifacts the earlier waves produce, and writing it now would be guesswork. This is deliberate, not an omission.

**Goal:** Fuse Copilot V1 + CRM V1 into one Revenue Powertrain — a shared Excel-style grid across every section, a Predictable-Revenue math layer living in the database, a collapsible per-pipeline scoreboard, and a reorganised Copilot cockpit — shipping CRM V1 + Copilot V1 on a foundation built to evolve (Jestor-for-sales: conditional/formula/relational tables in v2+).

**Architecture:** Two primitives carry everything. (1) A shared `SpreadsheetGrid` component with an **extensible column-type registry** that every CRM section and every future custom table renders. (2) A **Predictable-Revenue math layer** of native Postgres functions + triggers (ICP fit, lead velocity, MQL→SQL lifecycle, stage-conversion rates) so the frontend stays fast and the "revenue DNA" lives in the schema. Custom tables, relations, mass actions, badges, and the scoreboard all compose on top of these two.

**Tech Stack:** React 18 + TypeScript + Vite (no FE test runner — gate is `npm run build` + browser smoke), Tailwind + shadcn/ui (Radix), Supabase Postgres (RLS, JSONB, PL/pgSQL), FastAPI + Agno (`python-agent/`, pytest suite), `@dnd-kit` for drag, `react-day-picker` for calendar.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from the spec's "Architectural Principles That Carry Forward":

- **Tenant-scoped everything** — every query filtered by `equipe_id` (Supabase RLS hard requirement).
- **Field dictionary boundary** — the Copilot never writes to an undefined field.
- **Additive migrations only** — never drop or rewrite columns; zero-downtime compatible. `lifecycle_stage` is a NEW column, separate from the existing `leads.contact_type` (`lead/opportunity/contact/spam/archived`).
- **PT-BR for all user-facing strings.**
- **Async non-blocking UI** — sync, approvals, automations never lock the interface.
- **Build gate before merge** — `npm run build` must pass; `tsc` alone is NOT sufficient. There is no FE unit-test runner, so the FE gate for every frontend task is: `npm run build` green **and** a browser smoke of the changed surface.
- **Backend gate** — `cd python-agent && python -m pytest tests/ -q` passes with 0 new failures. (Windows: may need `pip install psycopg[binary]` for the full suite.)
- **JSONB for dynamic fields** — `leads.custom_fields`/`leads.personal_custom_data`, `opportunities.custom_data`, `custom_table_records.record` carry custom columns; no schema migration per custom column.
- **Entity links via bridge tables** — `contact_company_links`, `property_owner_links`, `opportunity_company_links` already exist; the relation column type reads/writes through them for core entities.
- **Commit frequently** — one commit per task minimum, conventional-commit prefix (`feat(crm):`, `feat(copilot):`, `feat(db):`).

## Wave Map & Dependency Spine

| Wave | Name | Detail level | Status | Depends on |
|---|---|---|---|---|
| **W1** | Grid Engine + Mass Action HUD | Full | ✅ Complete (9 commits) | — |
| **W2** | Custom Tables + Relations | Full (expanded 2026-06-22) | Planned | W1 |
| **W3** | Predictable Revenue DNA | Full | ✅ Complete (5 commits) | — (parallel to W1) |
| **W4** | Scoreboard + Pipeline Cockpit fusion + Async Ticker Sheet | Full (expanded 2026-06-22) | Planned · folds W3-review fixes F1/F2 | W1, W3 |
| **W5** | Agenda (internal calendar) | Full (expanded 2026-06-22) | Planned | W1 |
| **polish** | McLaren/Groq design language | woven into each wave + final pass | ongoing | all |

**W1/W3 verification (2026-06-22):** frontend build green (3590 modules); backend 290/290 pytest passing; 14 commits; all migrations additive. W1 review: clean (minor non-atomic JSONB read-modify-write noted, acceptable for single-user V1). W3 review: passes, with two fixes folded into W4 — **F1** lifecycle trigger event-blindness (leads stall in `mql`) → W4 Task 4.2 sweep recompute; **F2** velocity formula duplicated in SQL + Python → W4 Task 4.0 single-source via `rpc`.

W1 and W3 are independent and may run concurrently. W2 needs the grid. W4 needs the grid (scoreboard renders over it) and the math (the numbers it shows). W5 needs the grid pattern but is otherwise standalone.

---

## WAVE 1 — Grid Engine + Mass Action HUD

**Wave goal:** A single `SpreadsheetGrid` primitive — inline editing, dynamic JSONB columns, an extensible column-type registry, row selection wired to a bottom Mass Action HUD — adopted first by Base de Contatos (`DatabaseView.tsx`), then by the Pipeline leads table (`OpportunityTable.tsx`). After this wave, adding a column or a bulk action is a registry/config change, not a new component.

**File structure (new files own one responsibility each):**
- Create `src/components/crm/grid/types.ts` — shared types (`ColumnDef`, `GridRow`, `ColumnKind`).
- Create `src/components/crm/grid/columnTypes.tsx` — the column-type registry (render + parse/format per kind; v2 kinds registered but `implemented: false`).
- Create `src/components/crm/grid/InlineCell.tsx` — one editable cell (double-click → input, Enter/blur → mutate).
- Create `src/components/crm/grid/useGridSelection.ts` — selection state hook (`selectedIds`, toggle, selectAll, clear).
- Create `src/components/crm/grid/MassActionBar.tsx` — the bottom HUD (slides up when `selectedIds.size > 0`).
- Create `src/components/crm/grid/SpreadsheetGrid.tsx` — composes the above into the reusable grid.
- Modify `src/components/crm/DatabaseView.tsx` — render `SpreadsheetGrid` for Base de Contatos.
- Modify `src/components/crm/OpportunityTable.tsx` — render `SpreadsheetGrid` for pipeline leads; retire ad-hoc bulk code.
- Modify `src/components/crm/BulkActions.tsx` — fold its actions into `MassActionBar` (keep action handlers, drop the standalone bar).

### Task 1.1: Grid type contracts

**Files:** Create `src/components/crm/grid/types.ts`

**Interfaces — Produces** (every later W1/W2/W4 task imports these exact names):
```ts
export type ColumnKind =
  | "text" | "number" | "select" | "date" | "relation"
  | "formula" | "rollup" | "conditional"; // v2 slots — registered, not implemented

export type JsonbField =
  | "custom_fields" | "personal_custom_data" | "custom_data" | "record";

export interface ColumnDef {
  key: string;                 // native column name OR JSONB property key
  label: string;               // PT-BR header text
  kind: ColumnKind;
  source: "native" | "jsonb";
  jsonbField?: JsonbField;      // required when source === "jsonb"
  options?: { value: string; label: string }[]; // for kind "select"
  relation?: { table: string; displayField: string; linkTable?: string }; // for kind "relation"
  editable?: boolean;          // default true
  width?: number;
}

export interface GridRow {
  id: string;
  equipe_id: string;
  [key: string]: unknown;
}

export type CellMutation = {
  rowId: string;
  column: ColumnDef;
  value: unknown;
};
```

- [ ] **Step 1:** Create the file with the block above verbatim.
- [ ] **Step 2:** Run `npm run build`. Expected: green (types-only file, no consumers yet).
- [ ] **Step 3:** Commit: `git add src/components/crm/grid/types.ts && git commit -m "feat(crm): grid type contracts"`

### Task 1.2: Column-type registry

**Files:** Create `src/components/crm/grid/columnTypes.tsx`

**Interfaces — Consumes:** `ColumnDef`, `ColumnKind`, `GridRow` from `./types`.
**Produces:**
```ts
export interface ColumnTypeHandler {
  kind: ColumnKind;
  menuLabel: string;                 // PT-BR label in the "add column" menu
  implemented: boolean;              // false → shown disabled ("em breve")
  format: (value: unknown, col: ColumnDef) => string;   // display string
  parse: (raw: string, col: ColumnDef) => unknown;      // input string → stored value
}
export const COLUMN_TYPES: Record<ColumnKind, ColumnTypeHandler>;
export function getHandler(kind: ColumnKind): ColumnTypeHandler;
```

- [ ] **Step 1:** Implement handlers for `text` (identity format/parse), `number` (`Number()` parse, `pt-BR` `toLocaleString` format, NaN→""), `select` (format = matching option label, parse = raw), `date` (format via `date-fns` `format(d,"dd/MM/yyyy",{locale: ptBR})`, parse = ISO string), `relation` (format = display label passed through, parse = raw id). Set `implemented: true` for these five.
- [ ] **Step 2:** Register `formula`, `rollup`, `conditional` with `implemented: false`, `menuLabel: "… (em breve)"`, and `format`/`parse` that return the raw value unchanged. These are the v2 extensibility slots — do not implement logic.
- [ ] **Step 3:** `getHandler` returns `COLUMN_TYPES[kind]`; throw a clear `Error` for an unknown kind.
- [ ] **Step 4:** Run `npm run build`. Expected: green.
- [ ] **Step 5:** Commit: `feat(crm): column-type registry with v2 slots`

### Task 1.3: Inline-editable cell

**Files:** Create `src/components/crm/grid/InlineCell.tsx`

**Interfaces — Consumes:** `ColumnDef`, `GridRow`, `getHandler`.
**Produces:**
```tsx
export function InlineCell(props: {
  row: GridRow;
  column: ColumnDef;
  value: unknown;
  onCommit: (value: unknown) => void; // fired on Enter or blur, only if changed
}): JSX.Element;
```

- [ ] **Step 1:** Render display state = `getHandler(column.kind).format(value, column)`. If `column.editable === false`, render display-only (no edit affordance).
- [ ] **Step 2:** Double-click → switch to edit mode. For `text`/`number`/`date` render an `<input>`; for `select` render the shadcn `Select` (`@/components/ui/select`) seeded from `column.options`; for `relation` render a placeholder button "Vincular…" (the real picker arrives in W2 — wire `onCommit` but leave the picker as a no-op `// TODO(W2): relation picker`).
- [ ] **Step 3:** On Enter or blur: `const parsed = getHandler(column.kind).parse(inputValue, column)`. Call `onCommit(parsed)` **only if** `parsed !== value`. On Escape: revert, no commit. Keep grid layout stable (cell keeps its width; no row reflow).
- [ ] **Step 4:** Run `npm run build`. Expected: green.
- [ ] **Step 5:** Commit: `feat(crm): inline-editable grid cell`

### Task 1.4: Selection hook

**Files:** Create `src/components/crm/grid/useGridSelection.ts`

**Produces:**
```ts
export function useGridSelection(allIds: string[]): {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;     // selects all if none/some selected, clears if all selected
  clear: () => void;
  count: number;
};
```

- [ ] **Step 1:** Implement with `useState<Set<string>>`. `toggleAll`: if `selectedIds.size === allIds.length` → clear, else select all `allIds`. `count = selectedIds.size`.
- [ ] **Step 2:** Run `npm run build`. Expected: green.
- [ ] **Step 3:** Commit: `feat(crm): grid selection hook`

### Task 1.5: Mass Action HUD

**Files:** Create `src/components/crm/grid/MassActionBar.tsx`; READ `src/components/crm/BulkActions.tsx` (128 lines) first to reuse its existing action handlers.

**Interfaces — Consumes:** selection `count`, `selectedIds`, `clear`.
**Produces:**
```tsx
export interface MassAction {
  id: string;
  label: string;            // PT-BR
  icon: ReactNode;
  run: (ids: string[]) => Promise<void>;
  destructive?: boolean;
}
export function MassActionBar(props: {
  count: number;
  selectedIds: Set<string>;
  actions: MassAction[];
  onClear: () => void;
}): JSX.Element | null;   // returns null when count === 0
```

- [ ] **Step 1:** When `count === 0` return `null`. When `count > 0`, render a fixed bottom bar (`fixed bottom-0 inset-x-0 z-50`), dark high-contrast (`bg-[hsl(0_0%_6%)] text-white`), sliding up via `data-[state]` transition. Left: `✓ {count} selecionado(s)`. Middle: one button per `action`. Right: an `X` calling `onClear`.
- [ ] **Step 2:** Each action button calls `await action.run([...selectedIds])` then `onClear()`. Disable all buttons while any action is in-flight (local `running` state). Destructive actions get `text-red-400`.
- [ ] **Step 3:** Run `npm run build`. Expected: green.
- [ ] **Step 4:** Browser smoke: temporarily mount with `count=2` and confirm the bar slides up, buttons render, `X` clears. Remove the temporary mount.
- [ ] **Step 5:** Commit: `feat(crm): massive action bottom HUD`

### Task 1.6: SpreadsheetGrid composition

**Files:** Create `src/components/crm/grid/SpreadsheetGrid.tsx`

**Interfaces — Consumes:** all of the above.
**Produces:**
```tsx
export function SpreadsheetGrid(props: {
  rows: GridRow[];
  columns: ColumnDef[];
  onCellCommit: (m: CellMutation) => Promise<void>;   // persists one cell
  massActions: MassAction[];
  onAddColumn?: () => void;       // opens the column manager (host-provided)
  loading?: boolean;
}): JSX.Element;
```

- [ ] **Step 1:** Render a header row (checkbox for `toggleAll`, one `<th>` per column with `column.label`, a trailing `+` button calling `onAddColumn` when provided). Render one row per `rows` item: a selection checkbox bound to the selection hook, then an `InlineCell` per column whose `onCommit` builds a `CellMutation` and calls `onCellCommit`.
- [ ] **Step 2:** Mount `MassActionBar` with the selection hook's `count`/`selectedIds`/`clear` and `props.massActions`.
- [ ] **Step 3:** `loading` → render shadcn skeleton rows (`@/components/ui/skeleton`).
- [ ] **Step 4:** Run `npm run build`. Expected: green.
- [ ] **Step 5:** Commit: `feat(crm): SpreadsheetGrid composition`

### Task 1.7: Adopt grid in Base de Contatos

**Files:** Modify `src/components/crm/DatabaseView.tsx` (READ fully first); reuse `ContactColumnsToolbar.tsx` for the add-column flow.

- [ ] **Step 1:** Map the existing contact list + its column config into `ColumnDef[]` (native fields `source:"native"`; custom columns `source:"jsonb", jsonbField:"personal_custom_data"`). Keep the existing column-management toolbar as `onAddColumn`.
- [ ] **Step 2:** Implement `onCellCommit`: for native → `supabase.from("leads").update({ [key]: value }).eq("id", rowId)`; for jsonb → update the `personal_custom_data` object (read-merge-write the single key). Always scoped by `equipe_id` (RLS enforces; include in filter for safety).
- [ ] **Step 3:** Wire `massActions` from the existing `BulkActions` handlers (assign owner, archive, bulk sync) into `MassAction[]`.
- [ ] **Step 4:** Run `npm run build`. Expected: green.
- [ ] **Step 5:** Browser smoke: open Base de Contatos → double-click a cell, edit, Enter → value persists after refresh; select 2 rows → HUD appears → run "assign owner" → rows update. Record result.
- [ ] **Step 6:** Commit: `feat(crm): Base de Contatos on shared grid`

### Task 1.8: Adopt grid in Pipeline leads table

**Files:** Modify `src/components/crm/OpportunityTable.tsx` (706 lines — READ fully first; follow its data-loading and mutation patterns, do not restructure unrelated code); Modify `src/components/crm/BulkActions.tsx` (fold remaining actions into `MassAction[]`, delete the now-dead standalone bar if nothing else imports it — grep first).

- [ ] **Step 1:** Build `ColumnDef[]` for opportunity rows (native fields + `source:"jsonb", jsonbField:"custom_data"` for custom columns). Replace the bespoke table body with `<SpreadsheetGrid>`.
- [ ] **Step 2:** `onCellCommit`: native → `opportunities` update; jsonb → merge into `custom_data`. Scoped by `equipe_id`.
- [ ] **Step 3:** Move pipeline-specific bulk actions (assign closer, link to company, archive, bulk sync, bulk proposal) into `MassAction[]`.
- [ ] **Step 4:** Run `npm run build`. Expected: green.
- [ ] **Step 5:** Browser smoke: Pipelines → list view → inline edit persists; bulk select → HUD actions work; Kanban view still renders (no regression). Record result.
- [ ] **Step 6:** Commit: `feat(crm): pipeline leads table on shared grid`

**Wave 1 acceptance:** `npm run build` green; Base de Contatos and Pipeline list both render via `SpreadsheetGrid`; inline edit persists for native + JSONB columns; selection raises the Mass Action HUD and bulk actions mutate rows; column-type registry exposes the 5 implemented kinds + 3 disabled v2 slots; Kanban unaffected.

---

## WAVE 2 — Custom Tables + Relations  ✅ PLANNED (expanded 2026-06-22, after W1 review)

**Wave goal:** Users can create new tables (Excel-style) and define relations between tables — the bounded V1 slice of the Jestor-for-sales foundation. Conditional logic / formulas / rollups stay as registered-but-unimplemented v2 slots.

**Grounding from W1 (verified in code):** the grid `relation` kind already exists in `types.ts` (`relation: { table; displayField; linkTable? }`) and `InlineCell.tsx` Task 1.3 left a `// TODO(W2): relation picker` no-op button — W2 fills it. `EntityLinker.tsx` + `EntityChips.tsx` already implement core-entity linking UI — reuse, don't reinvent. Bridge tables confirmed: `contact_company_links(equipe_id, contact_id, company_id, role, is_primary, deleted_at)`, `opportunity_company_links`, `property_owner_links(equipe_id, property_id, owner_type, owner_id, deleted_at)`. Custom-table schema already in DB: `custom_tables(id, equipe_id, name, slug, icon, description, table_schema jsonb, …, deleted_at)` + `custom_table_records`.

**Fixed scope (build the primitive once, right):** feature-activation grid; create-blank-table; functional `relation` column type; lookup columns/chips in pipeline + Kanban. **No formula/conditional logic this wave.**

**File structure:**
- Create `supabase/migrations/2026XXXX_sprint67_custom_table_links.sql` — the one generic link store.
- Create `src/components/crm/grid/RelationChip.tsx` — read-only chip (wraps `EntityChips` pattern).
- Create `src/components/crm/grid/RelationPicker.tsx` — record search/select (wraps `EntityLinker` pattern).
- Create `src/hooks/useRelationResolver.ts` — resolve link `to_id` → display label for a relation column.
- Create `src/components/crm/customtables/CustomTableManager.tsx` — list/create/activate custom tables.
- Create `src/components/crm/customtables/CustomTableView.tsx` — render one custom table via `SpreadsheetGrid`.
- Create `src/components/crm/customtables/FeatureActivationGrid.tsx` — toggle niche/custom tables on/off.
- Modify `src/components/crm/grid/InlineCell.tsx` — make the `relation` kind functional.
- Modify `src/components/crm/DatabaseView.tsx`, `OpportunityTable.tsx`, `OpportunityKanban.tsx` — render relation columns/chips.
- Modify `src/pages/CRM.tsx` — surface activated custom tables.

### Task 2.1: Generic link store migration (+ RLS tenant test)

**Files:** Create `supabase/migrations/2026XXXX_sprint67_custom_table_links.sql`; test in `python-agent/tests/test_custom_table_links.py` (DB-level, mirrors `test_db.py` patterns — READ it first).

**Interfaces — Produces:** table `public.custom_table_links` with columns `(id uuid pk, equipe_id uuid, from_table text, from_id uuid, to_table text, to_id uuid, relation_key text, created_at, deleted_at)`. `from_table`/`to_table` hold a core table name (`leads`/`opportunities`/`companies`/`properties`) or a `custom_tables.slug`. `relation_key` = the owning `ColumnDef.key`.

- [ ] **Step 1:** Write the migration — additive, RLS via the `equipe_id`-through-`profiles` pattern (copy verbatim from `20260422000000_sprint4_epic1_foundations.sql`):
```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.custom_table_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id    uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  from_table   text NOT NULL,
  from_id      uuid NOT NULL,
  to_table     text NOT NULL,
  to_id        uuid NOT NULL,
  relation_key text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ctl_from ON public.custom_table_links (equipe_id, from_table, from_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ctl_to   ON public.custom_table_links (equipe_id, to_table, to_id)   WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctl_edge ON public.custom_table_links (equipe_id, from_table, from_id, to_table, to_id, relation_key) WHERE deleted_at IS NULL;
ALTER TABLE public.custom_table_links ENABLE ROW LEVEL SECURITY;
-- RLS policy: equipe_id must match the caller's profile equipe_id (copy the exact USING/WITH CHECK clause from the foundations migration).
COMMIT;
```
- [ ] **Step 2 (failing test):** `test_link_store_is_tenant_scoped`: insert a link for equipe A, query as equipe B → 0 rows. Run pytest → FAIL (table missing).
- [ ] **Step 3:** Apply migration locally; run pytest → PASS.
- [ ] **Step 4:** Commit: `feat(db): generic custom_table_links store with RLS`

### Task 2.2: RelationChip (display)

**Files:** Create `src/components/crm/grid/RelationChip.tsx`; READ `src/components/crm/EntityChips.tsx` first and match its visual style.

**Produces:** `export function RelationChip(props: { label: string; onRemove?: () => void }): JSX.Element;`

- [ ] **Step 1:** Render a small chip (label + optional `×` calling `onRemove`), reusing the `EntityChips` look (rounded, `text-xs`, muted bg). PT-BR title attribute.
- [ ] **Step 2:** `npm run build` green.
- [ ] **Step 3:** Commit: `feat(crm): relation chip display`

### Task 2.3: Relation resolver hook

**Files:** Create `src/hooks/useRelationResolver.ts`

**Interfaces — Consumes:** `ColumnDef` (uses `relation.table`, `relation.displayField`). **Produces:**
```ts
export function useRelationResolver(column: ColumnDef, rowId: string): {
  links: { toId: string; label: string }[];
  loading: boolean;
};
```

- [ ] **Step 1:** Query `custom_table_links` for `from_table = host table`, `from_id = rowId`, `relation_key = column.key`, `deleted_at IS NULL` (tenant-scoped). For each `to_id`, fetch `relation.displayField` from `relation.table`. Return `{toId,label}[]`. (For core-entity columns the host passes a `linkTable` override — see Task 2.5.)
- [ ] **Step 2:** `npm run build` green.
- [ ] **Step 3:** Commit: `feat(crm): relation resolver hook`

### Task 2.4: RelationPicker (record select)

**Files:** Create `src/components/crm/grid/RelationPicker.tsx`; READ `src/components/crm/EntityLinker.tsx` first and reuse its search/select pattern.

**Produces:**
```tsx
export function RelationPicker(props: {
  column: ColumnDef;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (toId: string, label: string) => void;
}): JSX.Element;
```

- [ ] **Step 1:** A popover/dialog that searches records of `column.relation.table` (by `displayField`), tenant-scoped, and calls `onPick(toId, label)` on select. Reuse `EntityLinker`'s query/debounce approach.
- [ ] **Step 2:** `npm run build` green.
- [ ] **Step 3:** Commit: `feat(crm): relation record picker`

### Task 2.5: Make the relation kind functional in the grid

**Files:** Modify `src/components/crm/grid/InlineCell.tsx` (replace the `// TODO(W2): relation picker` no-op); extend the host `onCellCommit` contract. READ `InlineCell.tsx` first.

**Design note (resolves the W1 commit-shape gap):** relations are NOT a scalar JSONB write — they write the link store. So when `column.kind === "relation"`, `InlineCell` renders resolved `RelationChip`s + a "Vincular…" button opening `RelationPicker`; on pick it calls `onCommit(toId)`, and the host's `onCellCommit` branches: `kind === "relation"` → write/soft-delete a `custom_table_links` row (or, when `column.relation.linkTable` is set, the core bridge table) instead of a column update.

- [ ] **Step 1:** In `InlineCell`, for `kind === "relation"` render `useRelationResolver` chips + the picker; wire `onPick` → `onCommit(toId)`. Remove the no-op TODO.
- [ ] **Step 2:** `npm run build` green.
- [ ] **Step 3:** Commit: `feat(crm): functional relation cell`

### Task 2.6: Surface core relations in pipeline + Kanban

**Files:** Modify `src/components/crm/OpportunityTable.tsx`, `src/components/crm/OpportunityKanban.tsx`. READ both first.

- [ ] **Step 1:** Add an "Empresa" relation `ColumnDef` to the pipeline grid with `relation: { table: "companies", displayField: "name", linkTable: "opportunity_company_links" }`. In `onCellCommit`, the `linkTable` branch writes/soft-deletes the bridge row (`opportunity_id`, `company_id`, `equipe_id`).
- [ ] **Step 2:** On the Kanban card face, render the linked company as a `RelationChip` (read-only) via `useRelationResolver`.
- [ ] **Step 3:** `npm run build` green; browser smoke: link a company in the list → chip appears on the card. Record result.
- [ ] **Step 4:** Commit: `feat(crm): company relation in pipeline + kanban`

### Task 2.7: Custom table manager + view

**Files:** Create `src/components/crm/customtables/CustomTableManager.tsx`, `src/components/crm/customtables/CustomTableView.tsx`. READ the `custom_tables` migration first to confirm `table_schema`/record column names.

- [ ] **Step 1:** `CustomTableManager`: list `custom_tables` (where `deleted_at IS NULL`); "Nova tabela" → name + add columns via the column-type registry (`COLUMN_TYPES`, implemented kinds only); persist to `custom_tables.table_schema`.
- [ ] **Step 2:** `CustomTableView({ tableId })`: map `table_schema` → `ColumnDef[]` (`source:"jsonb", jsonbField:"record"`), load `custom_table_records` rows, render `SpreadsheetGrid`. `onCellCommit` merges the single key into `record` (read-merge-write, exactly like `DatabaseView.handleCellCommit`); `relation` kind uses `custom_table_links`.
- [ ] **Step 3:** `npm run build` green; browser smoke: create a table, add a text + a relation column, edit a cell, add a relation → persists after refresh. Record result.
- [ ] **Step 4:** Commit: `feat(crm): custom table manager + grid view`

### Task 2.8: Feature-activation grid + navigation

**Files:** Create `src/components/crm/customtables/FeatureActivationGrid.tsx`; Modify `src/pages/CRM.tsx`. READ `CRM.tsx` tab structure first (tabs at lines ~60–83).

- [ ] **Step 1:** `FeatureActivationGrid`: toggle cards for niche/custom tables (Imóveis + each `custom_tables` row). Toggling on marks the table active (a `custom_tables` flag or absence of `deleted_at`); toggling off soft-hides. Per spec §1.4: deep relational mapping stays behind a "premium" CTA (non-functional placeholder button — copy only, no logic).
- [ ] **Step 2:** In `CRM.tsx`, render activated custom tables as sub-views (keep the 6 top-level tabs uncluttered — custom tables live under a "Tabelas" entry or the Imóveis-style toggle, NOT new top-level tabs). PT-BR labels.
- [ ] **Step 3:** `npm run build` green; browser smoke: toggle a custom table on → it appears; off → it hides. Record result.
- [ ] **Step 4:** Commit: `feat(crm): feature-activation grid for custom tables`

**Wave 2 acceptance:** `npm run build` green; a user can create a table, add typed columns, edit cells (persist to `record` JSONB), and add a relation column linking to another table; core-entity relations surface as chips in pipeline + Kanban; `custom_table_links` is tenant-scoped (RLS, pytest-proven) and additive; activation grid toggles tables without adding top-level tabs. **No formula/conditional logic this wave.**

---

## WAVE 3 — Predictable Revenue DNA (database + backend)

**Wave goal:** The revenue math lives in Postgres. A NEW `lifecycle_stage` funnel column on `leads` advances raw→mql→sql automatically via trigger; `fn_calculate_lead_velocity` scores engagement momentum; `fn_calculate_icp_score` scores structural fit; FastAPI exposes both; micro-badges render in grid rows + Kanban. This wave is backend-heavy and TDD-driven (pytest exists). It runs parallel to W1.

**File structure:**
- Create `supabase/migrations/2026XXXX_sprint67_lifecycle_stage.sql` — additive `lifecycle_stage` + transition trigger.
- Create `supabase/migrations/2026XXXX_sprint67_lead_velocity.sql` — `fn_calculate_lead_velocity` + read view.
- Create `supabase/migrations/2026XXXX_sprint67_icp_score.sql` — `fn_calculate_icp_score` + ICP weight config. **(ICP weight model — see Task 3.5 note.)**
- Create `python-agent/app/routers/revenue.py` — `GET /api/v1/lead-velocity/{lead_id}`, `GET /api/v1/icp-score/{lead_id}`.
- Create `python-agent/tests/test_revenue_math.py` — endpoint + function-contract tests.
- Create `src/components/crm/ICPScoreBadge.tsx`, `src/components/crm/VelocityScoreBadge.tsx`.

### Task 3.1: lifecycle_stage column (additive)

**Files:** Create `supabase/migrations/<ts>_sprint67_lifecycle_stage.sql`

- [ ] **Step 1:** Write the migration (additive only; distinct from `contact_type`):
```sql
BEGIN;
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'raw'
    CHECK (lifecycle_stage IN ('raw','mql','sql','opportunity','client','lost'));
COMMENT ON COLUMN public.leads.lifecycle_stage IS
  'Sprint 6.7: invisible Predictable-Revenue funnel. Distinct from contact_type. Advanced by trigger fn_advance_lifecycle.';
CREATE INDEX IF NOT EXISTS idx_leads_lifecycle ON public.leads (equipe_id, lifecycle_stage);
COMMIT;
```
- [ ] **Step 2:** Apply locally (`supabase db reset` or the project's migration runner) and verify the column exists with default `raw`.
- [ ] **Step 3:** Commit: `feat(db): additive lifecycle_stage funnel on leads`

### Task 3.2: Lead-velocity function (TDD)

**Files:** Create `supabase/migrations/<ts>_sprint67_lead_velocity.sql`; test via `python-agent/tests/test_revenue_math.py`.

**Formula (from spec §4.2):** `S = (Σ Aj) − (Dk × t)` where `Aj` = positive points per activity event, `t` = days since last activity, `Dk` = fixed decay factor.

- [ ] **Step 1 (failing test):** In `test_revenue_math.py`, write `test_velocity_decays_with_silence`: seed a lead with two activities (points sum known), set last activity 5 days ago, assert `fn_calculate_lead_velocity(lead_id)` returns `sum_points - (DECAY * 5)`. Run pytest → FAIL (function missing).
- [ ] **Step 2 (implement):** Write `fn_calculate_lead_velocity(p_lead_id uuid) returns numeric` in PL/pgSQL: sum activity points from `lead_activities` for the lead (define a points map — e.g. each activity = +10; refine in review), compute `t = EXTRACT(day FROM now() - max(created_at))`, return `coalesce(sum_points,0) - (DECAY_FACTOR * coalesce(t,0))` with `DECAY_FACTOR` a constant (start `2.0`). Tenant safety: function filters `lead_activities` by the lead's `equipe_id`.
- [ ] **Step 3:** Run pytest → PASS.
- [ ] **Step 4:** Add `test_velocity_zero_for_no_activity` (returns 0, not negative/null). Implement guard. Run → PASS.
- [ ] **Step 5:** Commit: `feat(db): fn_calculate_lead_velocity with time decay`

### Task 3.3: Lifecycle-advance trigger (TDD)

**Files:** Append to the lifecycle migration or a new `<ts>_sprint67_lifecycle_trigger.sql`.

- [ ] **Step 1 (failing test):** `test_lifecycle_advances_to_mql_on_match`: insert a lead with `personal_custom_data` matching the MQL rule (e.g. has email + a qualifying field), assert trigger set `lifecycle_stage='mql'`. Run → FAIL.
- [ ] **Step 2 (implement):** Write `fn_advance_lifecycle()` trigger function: rule-based (NO ML — per spec §strategic-Q2). Rules (start simple, refine in review): raw→mql when contact has email AND ≥1 enrichment field present; mql→sql when an opportunity exists for the lead AND velocity ≥ threshold. Never downgrade automatically except to `lost` (explicit). Attach `BEFORE INSERT OR UPDATE` trigger on `leads`.
- [ ] **Step 3:** Run pytest → PASS. Add `test_lifecycle_never_downgrades_silently`. Implement guard. Run → PASS.
- [ ] **Step 4:** Commit: `feat(db): rule-based MQL/SQL lifecycle trigger`

### Task 3.4: Revenue API endpoints (TDD)

**Files:** Create `python-agent/app/routers/revenue.py`; register in the app router; tests in `test_revenue_math.py`. READ an existing router (e.g. `app/routers/decisions.py`) first to copy the auth/tenant/DB-session pattern exactly.

**Produces:** `GET /api/v1/lead-velocity/{lead_id}` → `{ "lead_id", "velocity": number, "trend": "up"|"down"|"flat" }`; `GET /api/v1/icp-score/{lead_id}` → `{ "lead_id", "score": number, "breakdown": [{field,weight,value,contribution}] }`.

- [ ] **Step 1 (failing test):** `test_get_lead_velocity_endpoint` calls the route with a seeded lead, asserts 200 + `velocity` matches the function. Run → FAIL.
- [ ] **Step 2 (implement velocity route):** thin handler calling `fn_calculate_lead_velocity`, tenant-scoped via the caller's `equipe_id`, wrapped non-blocking. Run → PASS.
- [ ] **Step 3:** `test_get_icp_score_endpoint` (depends on 3.5) — write after 3.5 lands; for now stub returns 404 if no ICP profile. Implement, run → PASS.
- [ ] **Step 4:** Run full suite `python -m pytest tests/ -q` → 0 new failures.
- [ ] **Step 5:** Commit: `feat(copilot): revenue math API endpoints`

### Task 3.5: ICP-score function  ⟳ DESIGN DECISION AT WAVE START

> **One real design decision must be made before coding this task** (do not guess): *where ICP weights live.* Options surfaced in the spec's strategic-Q1: (a) `icp_weights` JSONB on `pipelines` mapping `field_key → {weight, target_value}`; (b) a dedicated `icp_profiles` table per equipe. Recommendation: (a) — additive, per-pipeline, no new table. PM confirms at wave start, THEN the TDD breakdown (mirroring 3.2's test-first shape) is written. Formula is fixed: `I = (Σ Wi·Vi) × 100`, weights normalised, `Vi ∈ [0,1]` = per-field match (1 = exact target, partial for fuzzy). Postgres-native (spec chose speed over agent round-trip).

### Task 3.6: ICP + Velocity badge components

**Files:** Create `src/components/crm/ICPScoreBadge.tsx`, `src/components/crm/VelocityScoreBadge.tsx`; render inside `SpreadsheetGrid` rows (via a `relation`-style read-only column or a fixed leading column) and on `OpportunityKanban` cards.

- [ ] **Step 1:** `ICPScoreBadge({ score }: { score: number })` → `🎯 {score}%` micro-badge; opacity scales with score (`score>=80` full, `>=50` 70%, else 40%) — racing-console aesthetic, `text-[10px] font-mono`.
- [ ] **Step 2:** `VelocityScoreBadge({ velocity }: { velocity: number })` → `🔥 {Math.round(velocity)}`; same opacity ramp.
- [ ] **Step 3:** Render both as a read-only badge column in the pipeline grid and on the Kanban card face. Fetch from the W3 endpoints (or directly from the function via a Supabase RPC view) — pick the lower-latency path during the wave.
- [ ] **Step 4:** `npm run build` green; browser smoke: badges visible in list + Kanban. Record result.
- [ ] **Step 5:** Commit: `feat(crm): ICP and velocity micro-badges`

**Wave 3 acceptance:** pytest suite green (0 new failures); `lifecycle_stage` advances raw→mql→sql by trigger and never downgrades silently; velocity decays with silence and floors at 0; ICP endpoint returns score + breakdown; badges render in grid + Kanban with opacity ramp; all functions tenant-scoped; all migrations additive.

---

## WAVE 4 — Scoreboard + Pipeline Cockpit fusion + Async Ticker Sheet  ✅ PLANNED (expanded 2026-06-22, after W3 review)

**Wave goal:** The pipeline becomes the instrument panel. Three fusions plus two W3-review fixes: (1) a **collapsible Revenue HUD strip** atop each pipeline; (2) the **per-pipeline accordion cockpit** housing copilot config AND revenue config; (3) the **async ticker Sheet** replacing the blocking sync modal.

**Grounding (verified in code):** `SyncButton.tsx` already streams from the SSE endpoint `GET /sync/stream` (`sweep.py` line 38, a generator) and already has `hudOpen`/`confirmOpen` state — W4 swaps the blocking `AlertDialog` (line 160) for a non-blocking right `sheet` over the *same* stream. `accordion.tsx` + `sheet.tsx` exist. `CopilotCockpit.tsx` has global tabs Setup/Treinamento/Aprovações/Logs (`defaultValue="setup"`). Per-pipeline copilot config lives in `copilot_agents(scope, pipeline_id, name, system_prompt, autonomy_mode)`. `pipeline_stages_v2(equipe_id, pipeline_id, name, position, stage_type)` + the stage-history table (from `20260608000200_sprint6_stage_history_actor.sql` — READ it to confirm the table/columns) feed conversion rates. The cadence/sweep entry is `POST /sync/sweep` (`sweep.py` line 90).

> **W3-review fixes folded into this wave** (see review notes): **(F1)** lifecycle is event-blind — leads stall in `mql` because mql→sql depends on opportunity+velocity which never touch the `leads` trigger columns → fix by recomputing lifecycle during the sweep (Task 4.2). **(F2)** velocity formula is duplicated in SQL + Python → fix by having the endpoint call the SQL function via `rpc` (Task 4.0).

**File structure:**
- Modify `python-agent/app/routers/revenue.py` — velocity endpoint calls `fn_calculate_lead_velocity` via `rpc` (kill the duplicate `_compute_velocity`).
- Create `supabase/migrations/2026XXXX_sprint67_stage_conversion.sql` — `fn_stage_conversion_rates(pipeline_id)`.
- Modify `python-agent/app/routers/sweep.py` — recompute `lifecycle_stage` for swept leads.
- Create `supabase/migrations/2026XXXX_sprint67_pipeline_revenue_config.sql` — additive `pipelines.revenue_config` JSONB.
- Create `python-agent/app/routers/forecast.py` (or extend `revenue.py`) — `GET /api/v1/revenue/forecast/{pipeline_id}`.
- Create `src/components/crm/revenue/PipelineScoreboard.tsx` — the collapsible strip.
- Create `src/components/crm/revenue/RevenueGoalsForm.tsx` — goal + manual override editor (used in the cockpit).
- Create `src/components/crm/copilot/PipelineCockpitAccordion.tsx` — the per-pipeline tactical view.
- Modify `src/pages/CopilotCockpit.tsx`, `src/components/crm/copilot/SyncButton.tsx`, `src/components/crm/PipelineWorkspace.tsx`.

### Task 4.0: Velocity endpoint single-source-of-truth (fix F2)

**Files:** Modify `python-agent/app/routers/revenue.py`; update `python-agent/tests/test_revenue_math.py`.

- [ ] **Step 1 (failing test):** Change `test_get_lead_velocity_endpoint` to assert the endpoint result equals a stubbed `rpc("fn_calculate_lead_velocity")` return (not the Python recompute). Run → FAIL.
- [ ] **Step 2:** Replace the in-handler activity fetch + `_compute_velocity` call with `client.rpc("fn_calculate_lead_velocity", {"p_lead_id": lead_id}).execute()`; keep `_compute_trend` for the trend label. Delete `_compute_velocity` + `_days_since` if now unused (grep first). Run → PASS.
- [ ] **Step 3:** Full suite `python -m pytest tests/ -q` → 0 new failures.
- [ ] **Step 4:** Commit: `refactor(copilot): velocity endpoint uses SQL function (single source)`

### Task 4.1: Stage-conversion-rate function (TDD)

**Files:** Create `supabase/migrations/2026XXXX_sprint67_stage_conversion.sql`; test in `test_revenue_math.py`. READ the stage-history migration first to confirm the table + columns.

**Produces:** `fn_stage_conversion_rates(p_pipeline_id uuid) RETURNS TABLE(stage_id uuid, stage_name text, position int, conversion_rate numeric)` — for each stage, `conversion_rate` = (# opportunities that advanced beyond this stage) ÷ (# that ever entered it); `1.0` when denominator is 0 (no history yet → neutral, lets the manual override drive). Tenant-scoped via the pipeline's `equipe_id`.

- [ ] **Step 1 (failing test):** `test_conversion_rate_from_history`: seed a pipeline with 3 stages, 10 opps entering stage 1, 5 reaching stage 2 → assert stage-1 rate ≈ 0.5. Run → FAIL.
- [ ] **Step 2:** Implement the function reading the stage-history table. Run → PASS.
- [ ] **Step 3:** Add `test_conversion_rate_neutral_without_history` (returns 1.0). Implement guard. Run → PASS.
- [ ] **Step 4:** Commit: `feat(db): fn_stage_conversion_rates from pipeline history`

### Task 4.2: Lifecycle recompute in sweep (fix F1, TDD)

**Files:** Modify `python-agent/app/routers/sweep.py`; test in `python-agent/tests/test_sweep_lifecycle.py` (READ `test_main.py`/existing sweep tests for the harness).

**Why:** the `trg_advance_lifecycle` trigger only fires on `leads` column changes, so `mql→sql` (which depends on an opportunity existing + velocity ≥ 10) never triggers on its own. The sweep is the periodic backend pass — it must nudge each candidate lead so the trigger re-evaluates.

- [ ] **Step 1 (failing test):** `test_sweep_promotes_mql_to_sql`: seed an `mql` lead with an opportunity + enough activity for velocity ≥ 10; run the sweep; assert `lifecycle_stage == 'sql'`. Run → FAIL.
- [ ] **Step 2:** In the sweep, for each `mql` lead with an opportunity, issue a no-op touch that fires the trigger — e.g. `UPDATE leads SET lifecycle_stage = lifecycle_stage WHERE id = …` (the trigger is `BEFORE UPDATE OF … lifecycle_stage`), OR call a new `fn_advance_lifecycle_for(lead_id)` helper. Tenant-scoped. Run → PASS.
- [ ] **Step 3:** Add `test_sweep_leaves_unqualified_mql_untouched`. Run → PASS. Full suite green.
- [ ] **Step 4:** Commit: `fix(copilot): sweep promotes mql→sql (lifecycle recompute)`

### Task 4.3: Pipeline revenue config + forecast endpoint (TDD)

**Files:** Create `supabase/migrations/2026XXXX_sprint67_pipeline_revenue_config.sql`; create/extend `python-agent/app/routers/forecast.py`; test in `test_revenue_math.py`.

**Produces:** additive `pipelines.revenue_config jsonb NOT NULL DEFAULT '{}'::jsonb` storing `{ goal_deals: int, period: 'month'|'quarter', conversion_overrides: { [stage_id]: number } }`. Endpoint `GET /api/v1/revenue/forecast/{pipeline_id}` → `{ pipeline_id, goal_deals, required_inbound, conversion_rates: [{stage_id, rate, source: 'history'|'manual'}], placar: { closed, in_progress, goal } }`. `required_inbound = goal_deals ÷ ∏(effective rate per open stage)`; effective rate = override if present else history.

- [ ] **Step 1:** Write the additive migration. Apply locally.
- [ ] **Step 2 (failing test):** `test_forecast_required_inbound`: goal 10, two open stages at 0.5 each → required_inbound = 10 / 0.25 = 40. Run → FAIL.
- [ ] **Step 3:** Implement the endpoint: load `revenue_config`, call `fn_stage_conversion_rates`, merge overrides, compute required_inbound + placar (count opps by won/open). Tenant-scoped (verify pipeline belongs to caller's equipe). Run → PASS.
- [ ] **Step 4:** Full suite green. Commit: `feat(copilot): pipeline revenue config + forecast endpoint`

### Task 4.4: PipelineScoreboard strip

**Files:** Create `src/components/crm/revenue/PipelineScoreboard.tsx`

**Produces:** `export function PipelineScoreboard(props: { pipelineId: string }): JSX.Element;`

- [ ] **Step 1:** Fetch the forecast endpoint. Render a horizontal HUD strip (racing-console aesthetic, `--racing-dark` bg from the polish tokens): **Meta** (goal_deals), **Inbound necessário** (required_inbound), **Placar** (closed/goal progress bar), per-stage conversion chips. PT-BR labels.
- [ ] **Step 2:** Collapsible to a thin line ("shadow" mode) via `@/components/ui/collapsible` (installed); persist the open/closed preference in `localStorage` keyed by pipelineId so it never pollutes the view unless wanted.
- [ ] **Step 3:** `npm run build` green; browser smoke with a real pipeline. Record result.
- [ ] **Step 4:** Commit: `feat(crm): collapsible pipeline revenue scoreboard`

### Task 4.5: Mount scoreboard atop the pipeline

**Files:** Modify `src/components/crm/PipelineWorkspace.tsx` (READ first).

- [ ] **Step 1:** Render `<PipelineScoreboard pipelineId={…} />` above the Kanban/grid for the active pipeline. Ensure collapsed state leaves the board layout unchanged.
- [ ] **Step 2:** `npm run build` green; browser smoke: strip shows above board, collapses cleanly. Record result.
- [ ] **Step 3:** Commit: `feat(crm): scoreboard atop pipeline workspace`

### Task 4.6: Per-pipeline accordion cockpit

**Files:** Create `src/components/crm/revenue/RevenueGoalsForm.tsx`, `src/components/crm/copilot/PipelineCockpitAccordion.tsx`; Modify `src/pages/CopilotCockpit.tsx` (READ fully first — keep the global Setup/Treinamento/Aprovações/Logs tabs intact).

- [ ] **Step 1:** `RevenueGoalsForm({ pipelineId })`: edit `pipelines.revenue_config` (goal_deals, period, per-stage manual overrides). Saves via Supabase update (tenant-scoped).
- [ ] **Step 2:** `PipelineCockpitAccordion`: a vertical list of the team's pipelines; each row expands (`accordion.tsx`) into four boxes — *Prompt & Base de Conhecimento* (reads `copilot_agents.system_prompt` for `scope='pipeline'`), *Automações Locais*, *Logs Locais*, *Receita & Metas* (`RevenueGoalsForm`). Structure so more boxes can be added later (map over a box config array).
- [ ] **Step 3:** In `CopilotCockpit.tsx`, add the accordion as the per-pipeline **tactical** view (e.g. inside the Setup tab or a new "Pipelines" sub-area) without removing the global tabs. Clear the scattered config cards the spec §2 calls out.
- [ ] **Step 4:** `npm run build` green; browser smoke: expand a pipeline → 4 boxes; edit a goal → persists. Record result.
- [ ] **Step 5:** Commit: `feat(copilot): per-pipeline accordion cockpit with revenue box`

### Task 4.7: Async ticker Sheet (replace the modal)

**Files:** Modify `src/components/crm/copilot/SyncButton.tsx` (READ fully first; reuse the existing `/sync/stream` SSE wiring).

- [ ] **Step 1:** Replace the blocking `AlertDialog` (line ~160) with a right-aligned `@/components/ui/sheet`. Clicking sync opens the sheet and starts the stream immediately (keep an optional inline confirm inside the sheet, not a blocking modal).
- [ ] **Step 2:** Render the stream as a scrolling monospaced log: `font-mono text-[10px] text-muted-foreground/60`, autoscroll to bottom on each line, explicit execution metrics per spec §2. The main dashboard stays fully interactive (sheet is non-modal / `modal={false}`).
- [ ] **Step 3:** `npm run build` green; browser smoke: start sync → sheet streams lines, pipelines remain clickable underneath. Record result.
- [ ] **Step 4:** Commit: `feat(copilot): non-blocking async ticker sheet for sync`

**Wave 4 acceptance:** `npm run build` green + full pytest suite green; velocity has a single source of truth (SQL fn); sweep promotes mql→sql; `fn_stage_conversion_rates` + forecast endpoint compute required_inbound; scoreboard strip shows meta/inbound/placar and collapses to a thin line without disturbing the board; cockpit is a per-pipeline accordion with the 4 boxes incl. Receita & Metas while global tabs remain; sync opens a non-blocking right sheet with a live monospaced log and the dashboard stays interactive during sync.

---

## WAVE 5 — Agenda (internal calendar)  ✅ PLANNED (expanded 2026-06-22)

**Wave goal:** A high-level internal calendar view (peer of Tarefas) that aggregates and schedules work — tasks, touchpoints, meetings, compromissos — and is connected to Tasks (reserve a calendar block to do a task).

**Decisions resolved at wave start (were deferred):**
- **Aggregation, not a bridge table** (YAGNI) — read existing sources at query time (`tasks.due_date`, `leads.next_contact`, `opportunities` expected close / `stage_entered_at`, `touchpoints`). No `calendar_events` denormalization.
- **One small additive table — `agenda_events`** — only for things that aren't already records: user-created **meetings / compromissos** and **reserved task-blocks**. A nullable `task_id` FK gives the Task↔Agenda link.
- **Agenda is a top-level section** (founder override of the "exactly 6 tabs" line — they explicitly want it peer to Tarefas). With Imóveis toggle-hidden by default, the visible tab count stays manageable.

**Grounding (verified in code):** `react-day-picker` + `src/components/ui/calendar.tsx` installed; `date-fns` + `ptBR` already used in `TasksView.tsx` (`format(d,"dd/MM/yyyy",{locale: ptBR})`). `TasksView.tsx` is the structural template for a CRM list section.

**File structure:**
- Create `supabase/migrations/2026XXXX_sprint67_agenda_events.sql` — additive `agenda_events`.
- Create `src/hooks/useAgendaEvents.ts` — unified `CalendarEvent[]` aggregator.
- Create `src/components/crm/agenda/AgendaView.tsx` — calendar + day panel.
- Create `src/components/crm/agenda/AgendaEventDialog.tsx` — create/reserve a block (+ optional task link).
- Modify `src/pages/CRM.tsx` — add the Agenda tab.

### Task 5.1: agenda_events migration (+ RLS test)

**Files:** Create `supabase/migrations/2026XXXX_sprint67_agenda_events.sql`; test in `python-agent/tests/test_agenda_events.py` (mirror `test_custom_table_links.py` from Task 2.1).

**Produces:** `agenda_events(id uuid pk, equipe_id uuid, title text, type text CHECK in ('meeting','compromisso','block'), starts_at timestamptz, ends_at timestamptz, task_id uuid NULL REFERENCES tasks(id) ON DELETE SET NULL, lead_id uuid NULL, notes text, created_at, deleted_at)`, RLS via the `equipe_id`-through-`profiles` pattern.

- [ ] **Step 1:** Write the additive migration with indexes on `(equipe_id, starts_at)` and RLS (copy the policy clause from the foundations migration). READ the `tasks` table migration first to confirm its name/PK for the FK.
- [ ] **Step 2 (failing test):** `test_agenda_events_tenant_scoped`. Run → FAIL.
- [ ] **Step 3:** Apply locally; run → PASS.
- [ ] **Step 4:** Commit: `feat(db): agenda_events with RLS`

### Task 5.2: Unified agenda aggregator hook

**Files:** Create `src/hooks/useAgendaEvents.ts`

**Produces:**
```ts
export type CalendarEventType = "task" | "follow_up" | "touchpoint" | "opportunity" | "meeting" | "compromisso" | "block";
export interface CalendarEvent {
  id: string;
  date: string;            // ISO date (day granularity)
  title: string;
  type: CalendarEventType;
  color: string;           // task=blue follow_up=orange touchpoint=green opportunity=purple meeting/compromisso/block=papaya
  sourceId: string;
}
export function useAgendaEvents(month: Date): { events: CalendarEvent[]; loading: boolean };
```

- [ ] **Step 1:** Query the month window from each source (tenant-scoped): `tasks.due_date`, `leads.next_contact`, `opportunities` expected-close/`stage_entered_at`, `touchpoints.date`, `agenda_events.starts_at`. Map each into `CalendarEvent` with the color map above.
- [ ] **Step 2:** `npm run build` green.
- [ ] **Step 3:** Commit: `feat(crm): unified agenda event aggregator`

### Task 5.3: AgendaView

**Files:** Create `src/components/crm/agenda/AgendaView.tsx`; READ `TasksView.tsx` (section shell) + `src/components/ui/calendar.tsx` (DayPicker) first.

- [ ] **Step 1:** Render `react-day-picker` month view with custom day rendering: each day shows up to N colored dots (one per event type present). Use `ptBR` locale.
- [ ] **Step 2:** Click a day → right-side panel listing that day's events (icon + title + type), color-coded. PT-BR labels. `[Hoje]` button + month nav.
- [ ] **Step 3:** `npm run build` green; browser smoke once wired (Task 5.5). Commit: `feat(crm): agenda calendar view with day panel`

### Task 5.4: Create/reserve a block (Task↔Agenda link)

**Files:** Create `src/components/crm/agenda/AgendaEventDialog.tsx`

- [ ] **Step 1:** A dialog to create an `agenda_events` row (title, type, starts_at/ends_at, optional notes). When type is a task-block, allow selecting an existing Task → set `task_id`; offer "criar tarefa" to make a `tasks` row with matching `due_date` and link it.
- [ ] **Step 2:** Wire the day panel "+" and a day-cell click to open the dialog prefilled with that date.
- [ ] **Step 3:** `npm run build` green. Commit: `feat(crm): create/reserve agenda block linked to task`

### Task 5.5: Navigation integration

**Files:** Modify `src/pages/CRM.tsx` (tabs at ~60–83).

- [ ] **Step 1:** Add an `agenda` tab (PT-BR "Agenda", calendar icon) rendering `<AgendaView />`. Place it next to Tarefas.
- [ ] **Step 2:** `npm run build` green; browser smoke: Agenda tab shows aggregated events color-coded; click a day → events list; create a meeting → appears; reserve a task-block → linked task created. Record result.
- [ ] **Step 3:** Commit: `feat(crm): agenda top-level tab`

**Out of scope (later sprint):** Google Calendar sync, the Calendar Agent, daily AI briefing.

**Wave 5 acceptance:** `npm run build` green + agenda RLS test passing; Agenda is a top-level tab showing tasks/follow-ups/touchpoints/opportunities/meetings color-coded; clicking a day lists its events; a calendar block can be created and linked to a Task; no external sync.

---

## Cross-cutting: McLaren/Groq design polish

Applied *within* each wave (not a separate big-bang) plus a final pass. From spec §2 "Design Language Applied":
- New CSS tokens in `src/index.css`: `--racing-dark: 0 0% 6%` (HUD bars), `--papaya: 28 100% 59%` (accents), `--shadow-hud: 0 4px 24px rgba(0,0,0,0.3)`. (Today only `--primary: 28 100% 50%` exists.)
- Chamfered-corner option for premium cards; papaya secondary accent on HUD actions; subtle diagonal-line divider between major sections; micro-lift hover (`group-hover:-translate-y-[2px]`) on interactive cards; orange keyboard focus rings (`focus-visible:outline-[hsl(var(--papaya))]`); skeleton loaders for table loading.
- Each wave's UI tasks adopt these tokens as they build; a final polish pass sweeps any missed surfaces. `npm run build` green + browser smoke per surface.

---

## Self-Review (against the spec)

- **Spec coverage:** §1–2 core chassis/6-tabs → W1 (grid) + W4 (cockpit) + polish. §2 async ticker → W4. §3 grid/JSONB/mass-action/entity-links → W1 + W2. §4 ICP/velocity/MQL-SQL/forecast → W3 + W4. §5 cadence/n8n/partner → **explicitly cut** (founder decision; later sprint). §6 Agenda → W5 (Phase 1 only). §7 task checklist → distributed across W1–W5. Custom-table creation (strategic-Q8, level C) → W2.
- **Placeholder scan:** All five waves now carry full bite-sized tasks (W1/W3 shipped; W2/W4/W5 expanded 2026-06-22 against the real W1/W3 artifacts). No `⟳` markers remain. Two open decisions still legitimately deferred to wave start are explicit in-task notes (ICP weight model Task 3.5; stage-history table confirmation in W4 Task 4.1), not silent gaps.
- **Type consistency:** `ColumnDef`/`GridRow`/`ColumnKind`/`MassAction`/`CellMutation` defined in Task 1.1, consumed unchanged through 1.2–1.8, W2 (relation kind), and W4. Endpoint shapes in 3.4 consumed by badges 3.6; velocity single-sourced via `rpc` in 4.0; `CalendarEvent` defined in W5 Task 5.2.
- **Prior open decisions now resolved:** `calendar_events` bridge → query-time aggregation + small `agenda_events` table (W5); Agenda tab vs sub-view → top-level tab (W5); custom↔custom relations → generic `custom_table_links` store (W2 Task 2.1); revenue-goal storage → additive `pipelines.revenue_config` JSONB (W4 Task 4.3).

## Execution & review-loop discipline (founder's requirement)

This plan is executed by a **junior engineer**, reviewed by the PM, looped until it meets the excellence bar:
1. Engineer implements one task → opens for review.
2. PM reviews against the task's acceptance + Global Constraints + the Groq/McLaren bar (use `superpowers:requesting-code-review` / `receiving-code-review`).
3. If below bar → specific feedback → engineer iterates → re-review. Repeat until it passes. Only then move to the next task.
4. At each wave boundary, PM runs the wave acceptance checklist before starting the next wave; for `⟳` waves, PM writes that wave's bite-sized tasks *now that the prior artifacts exist*.
