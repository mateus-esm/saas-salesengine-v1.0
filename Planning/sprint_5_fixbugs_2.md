### 🏎️ The Vision: The "F1 Pit Stop" Overhaul

Imagine a driver entering an F1 pit stop. They don't look at a dashboard full of
flashing, mismatched buttons from last year’s engine model. They don't want a
steering wheel that jerkily snaps out of their hands while they are trying to
check their coordinates. They want micro-precision, instant clarity, and
absolute authority over their terrain.

Right now, our software chassis is incredibly robust—the multi-tenant database
infrastructure is there. But the control panel has friction. V1 isn't about
loading new components; it’s about making the cockpit feel like a **McLaren** or
a **Ferrari**. Everything should move with tight tolerances, clicking into place
without friction.

Here is your executive overview plan for **Sprint 5.5: The Elite Calibration**,
designed to achieve ultimate simplicity and power before we fire up the Agno AI
engine.

---

### 💬 PART 1: THE INBOX COMMAND CENTER (Chat Fixes)

#### ⚓ 1.1 The Scroll Anchor (Frictionless History)

- **The Problem:** When an operator scrolls up to analyze past customer
  knowledge or read historical context, the interface violently snaps back to
  the bottom. It feels unstable and creates intense user fatigue.
- **The Vision:** Telepathic scrolling. When you scroll up, the UI locks exactly
  where your eyes are. It stays anchored until _you_ choose to snap it back down
  or a new message arrives.

#### 🧹 1.2 Multi-Select Demolition (Mass Clean Up)

- **The Problem:** The mass-selection button exists visually, but it’s a
  non-functional decoration. Operators are forced to clear noise and archive
  threads one tedious click at a time.
- **The Vision:** Ruthless sweeping. The selection mechanism is wired up to your
  backend. Select 10 spam threads, click "Excluir," and they vanish instantly
  from the viewport.

#### ⚡ 1.3 Latency Deceleration (Speed Optimization)

- **The Problem:** In peak moments, the communication latency spikes. The
  time-to-render stretches, slowing down the sales rep's conversational speed.
- **The Vision:** Supercar throttle response. We optimize how message feeds
  cache locally. Clicking a chat must load the dialogue timeline under 100ms.

#### 🎚️ 1.4 The Chat Context HUD (Sidebar Refinement)

- **The Problem:** The side panel in the chat view still contains confusing
  legacy metrics and lacks scroll ergonomics. It feels cramped and lacks
  aesthetic space.
- **The Vision:** A beautifully spaced dark glass component. Legacy inputs are
  dropped. Active fields (Identity, Connected Properties) get breathing room
  with fluid independent scrolling. It feels high-density but perfectly calm.

---

### 🗄️ PART 2: THE SOVEREIGN GENERAL LEDGER (Base de Contatos)

#### 💎 2.1 Pure Identity View (The Infinite Table)

- **The Problem:** The central contacts database is fragmented across pages
  (Page 1, 2, 3), forcing unnecessary pagination clicks. Furthermore, ghost
  fields from the old sales process are creating visual clutter.
- **The Vision:** An infinite, seamless dark viewport. As you scroll down, the
  data smoothly flows into view without interruption. Legacy fields are dropped;
  the data is clean and absolute.

#### 🆔 Unmasking the Meta-Names (`264162450083898@lid`)

- **Why It Happens:** This occurs because when a brand new, cold lead enters
  from a Meta/WhatsApp API webhook, the system instantly grabs their technical
  account identifier (`@lid` or Meta ID) because the human hasn't typed a
  display name yet.
- **The Solution:** The system must use a formatting fallback. If no custom name
  exists, instead of a raw technical ID string, it dynamically renders a clean
  phone marker or custom tag like `[WhatsApp New Lead - Blocked Number]`. The
  moment the Agno engine or a human saves a real name, the interface replaces it
  fluidly.

#### 📊 The High-Density Control Dashboard (Column Customization)

- **The Problem:** Critical contextual variables—like **Canal** (Channel),
  **Origem** (Origin), and **Enriquecimento** (AI Enrichment Data)—are locked
  inside individual slide-out cards. Vendedors have to click open every single
  contact just to check where they came from.
- **The Vision:** Bring the motor parameters to the dashboard. These parameters
  are extracted directly into explicit, sorting columns on the main ledger
  screen. You scan the table and see your entire pipeline origin landscape in
  one look.

#### 🏢 Multi-Entity Links & Entry Systems

- **The Blueprint:** Fully expose the relational links directly in the grid. You
  can see the **Associated Company** chip and the **Properties/Apartments**
  inventory count right in the table row.
- **Universal Ingestion:** Create two pristine input mechanisms: A highly
  premium, singular "Quick Add Contact" drawer for immediate manual logging, and
  an advanced batch upload engine that maps raw lists straight into your clean
  schema.

---

### 🌋 PART 3: THE PIPELINE WAR ROOM (Inside Pipelines)

#### 🎯 3.1 Mass Purge for Deals

- **The Problem:** If a marketing channel yields low-quality prospects, the
  pipeline gets jammed with dead opportunities that must be manually removed one
  by one.
- **The Vision:** Select all matching rows inside a stage or list view and
  delete them concurrently.

#### 🩻 3.2 Total X-Ray View (The Lead Matrix)

- **The Vision:** Inside the table layout of a specific pipeline, _all_
  extracted custom parameters (such as `kWp` for Solo Energia or `Acomodações`
  for Be My Guest) must exist as visible columns and match the card view
  perfectly. No hidden information.

#### 🎛️ 3.3 The McLaren Dashboard Tuner (Kanban Customization)

- **The Vision:** Give the manager absolute aesthetic control. Inside the
  Pipeline settings, an elegant toggle grid lets you check boxes to design your
  own Kanban card cover layout. Want to show the phone number and the custom
  energy metric on the card face? Toggle it on. Want a ultra-minimal look with
  just the name and countdown clock? Toggle everything else off.

---

### 🏆 The Hero Story: "The Scale Up Shift"

**The Setup:** Mateus opens the updated Sales Engine workspace at 8:00 AM.
Today, a digital prospecting loop has just ingested 150 new short-stay property
owners from a targeted real estate scraping run in Ceará.

**The Old Way (The Grind):** Mateus would have spent the first two hours
clicking through page pagination, closing accidental duplicate threads caused by
returning clients, opening individual profiles just to see which owners had
properties in the same building, and frantically closing layout drawers to clear
his workspace view. He would be exhausted before sending his first pitch.

**The New Way (Invisible Efficiency):** Mateus fires up the interface. The
canvas loads instantly in a smooth matte dark color palette. He looks at the
global **Base de Contatos**. Thanks to the _Infinite Scroll Layout_, he slides
downward through the data effortlessly.

He scans the new data columns: **Origem**, **Canal**, and **Empresa** are fully
visible right on the main spreadsheet layout. He notices 15 junk rows captured
by mistake. He checks their selection boxes on the left margin, clicks the top
command bar, and with a clean mechanical confirmation click, the rows are
deleted from the system forever.

He switches to his **Be My Guest Sales Pipeline**. He pulls up the _Dashboard
Card Configuration Panel_, selects `Apartamentos Totais` and `Status de Mobilia`
from his customized variables, and hits save. Instantly, his Kanban cards shift
layout styles. Without opening a single card profile, he can see exactly which
leads possess over 5 apartments needing rapid management onboarding.

The workspace is quiet, lethal, and completely organized. The data is entirely
under his command. He clicks back over to the unified WhatsApp box, filters by
**All Chats**, and begins closing deals with perfect visual velocity.

**Chassis secured. The car is now ready for the Agno AI Engine.**

---

## Verboo Recommendation (Junior Software Engineer)

### Branch Map

```
main
 ├── branch_inbox_v2          (Part 1 — Inbox)
 ├── branch_contacts_ledger   (Part 2 + Part 3 — Contacts + Pipeline)
 └── branch_metajix_bugfix    (2.2 — Meta @lid unmasking, cross-cutting)
```

### Branch 1: `branch_inbox_v2` — Part 1 (Inbox)
| # | Task | Notes |
|---|------|-------|
| 1.1 | Scroll Anchor | `useRef` + scroll event lock — independent |
| 1.2 | Multi-Select Demolition | Wire bulk actions to backend — independent of 1.1 |
| 1.3 | Latency Deceleration | Message feed cache optimization — independent |
| 1.4 | Chat Context HUD | Sidebar refinement — depends on 1.1 being merged first |

**Merge order:** 1.1 → 1.4 (same branch, sequential)

### Branch 2: `branch_contacts_ledger` — Part 2 + Part 3
| # | Task | Notes |
|---|------|-------|
| 2.1 | Infinite Scroll Table | Foundation — do first |
| 2.3 | Column Customization | Depends on 2.1 table structure |
| 2.4 | Multi-Entity Links + Quick Add | Independent of 2.1/2.3 |
| 3.1 | Mass Purge Deals | Independent bulk delete |
| 3.2 | Lead Matrix (custom params as columns) | Independent |
| 3.3 | Kanban Card Customization | Pure UI toggle — independent |

**Merge order:** 2.1 → 2.3 (same branch, sequential); 2.4, 3.1, 3.2, 3.3 can be done in any order

### Branch 3: `branch_metajix_bugfix` — 2.2 (Meta Names Bug Fix)
| # | Task | Notes |
|---|------|-------|
| 2.2 | Unmask `@lid` Meta IDs | Format fallback in webhook + display — **cross-cutting**, merge early to avoid conflicts |

**Merge order:** Merge this branch **first** (or earliest) — it's a targeted bug fix that touches webhook + contact display, low risk of conflicts.

### Merge Sequence
```
1. branch_metajix_bugfix  → merge to main first (small, isolated)
2. branch_inbox_v2         → merge after (sidebar changes)
3. branch_contacts_ledger  → merge last (table + pipeline changes)
```

### Summary
| Branch | Scope | Parallel with |
|--------|-------|---------------|
| `branch_metajix_bugfix` | 2.2 Meta names fix | Both other branches |
| `branch_inbox_v2` | Part 1 — Inbox | `branch_contacts_ledger` |
| `branch_contacts_ledger` | Part 2 + Part 3 | `branch_inbox_v2` |

**3 branches total, 2 can run in parallel** (`branch_inbox_v2` + `branch_contacts_ledger`), with `branch_metajix_bugfix` as a quick isolated fix merged first.

---

## Execution Plan (Claude — Solo Sequential)

Decomposed into 4 branches per `Planning/agent_workflow.md` convention. Merge in order; Orchestrator handles merges to `main`.

| # | Branch | Scope | Status |
|---|--------|-------|--------|
| 1 | `feat/claude-sprint5-metaid-unmask` | 2.2 only — surgical bug fix, merge first | [x] **Merged** (`b83176b`) |
| 2 | `feat/claude-sprint5-inbox-precision` | 1.1, 1.2, 1.3, 1.4 — chat domain | [x] **Merged** (`6f25bfb`) |
| 3 | `feat/claude-sprint5-contacts-ledger` | 2.1, 2.3, 2.4 — Base de Contatos | [x] **Merged** (`bee725c`) |
| 4 | `feat/claude-sprint5-pipeline-warroom` | 3.1, 3.2, 3.3 — Pipeline | [x] **Merged** (`f3bd724`) |

### Sub-task Checklist

- [x] **2.2** Meta `@lid` unmask — webhook refuses technical IDs, `formatDisplayName` util normalizes display in Chat + Contacts table (branch 1)
- [x] **1.1** Scroll anchor — `isNearBottomRef` + `onScroll`; auto-scroll gated on user-at-bottom OR conversation-switched; "Ir para o final" pill (branch 2)
- [x] **1.2** Multi-select bulk delete — `bulkUpdateStatus` + `bulkMarkRead` single-PATCH mutations with optimistic cache, plus "Todas (N)" selector that respects filters (branch 2)
- [x] **1.3** Message-feed cache / latency — `prefetchConversationMessages` warms cache on hover, in-flight dedup (branch 2)
- [x] **1.4** Chat Context HUD sidebar refinement — legacy quick-edit block removed; Identity/Properties/Copiloto scroll independently from Tabs (branch 2)
- [x] **2.1** Infinite scroll Contacts table — pagination model + footer dropped (branch 3)
- [x] **2.3** Column customization for Canal/Origem/Enriquecimento — Canal + Enriquecimento are now first-class columns; Origem already existed (branch 3)
- [x] **2.4** Quick Add drawer wired into Base de Contatos header; batch upload already in `ImportModal`. Multi-entity link chips column **deferred** — needs new per-lead link queries (`useOpportunityLinks` is keyed by opportunity_id) (branch 3)
- [x] **3.1** Mass purge deals — `bulkDeleteOpportunities` + select column + bulk action bar + confirm dialog (branch 4)
- [x] **3.2** Lead Matrix — already implemented in `OpportunityTable.tsx:268-273` (dynamic column per custom field); no code change needed (branch 4)
- [x] **3.3** Kanban card cover customization — wired existing `CardFieldsPicker` as dedicated "Card do Kanban" section in `PipelineSettings` (branch 4)

### Deferred for Sprint 6+

- **2.4 multi-entity chips column** — show Associated Company chip + Properties count directly in the Contacts table row. Requires a per-lead links hook (analog of `useOpportunityLinks` but keyed by `lead_id`) plus a dedicated table column. Captured here so the sprint vision isn't lost.
