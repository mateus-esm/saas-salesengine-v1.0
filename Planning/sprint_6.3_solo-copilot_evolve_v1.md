# Sprint 6.2 Product Strategy: Agentic Sales OS Cockpit Refinement & Reactive Execution

This specification establishes the blueprint for **Sprint 6.2**, focusing
entirely on moving your **Agentic Sales OS** away from blockages and raw
technical outputs toward a low-latency **Formula 1 Cockpit experience**. Guided
by a strict **Job-To-Be-Done (JTBD)** methodology, this sprint optimizes the
interaction flow for your sales team, shields sellers from raw technical
parameters, introduces event-driven instant automation, and builds a robust
conversational safety net to capture high-intent buyers.

---

## 🏎️ Executive Core Architecture Paradigm

```text
[Incoming Message / Ad Webhook]
               │
               ▼
   Is Toggle ON? (is_crm_agent_enabled)
       ├── YES ➔ Instant Reactive Loop ➔ Auto-updates Kanban (Sub-2s latency)
       └── NO  ➔ Standing State ➔ Wait for Sidebar Click [⚡ Sync]
                                                │
                                                ▼
                            ┌──────────────────────────────────────┐
                            │ Retractable HUD Telemetry Sidebar    │
                            ├──────────────────────────────────────┤
                            │ • Runs asynchronously inside cache   │
                            │ • Minimizable / No desktop lockouts   │
                            │ • Streams itemized logs sequentially │
                            └──────────────────────────────────────┘
```

---

## 🧭 Epic 1: The Asynchronous Telemetry HUD Drawer (UI/UX)

- **The Friction:** Clicking the `⚡ Sync` button currently triggers a
  full-screen blocking dark modal displaying text like _"Telemetria do copiloto,
  aguardando motor cognitivo..."_. This freezes layout navigation and forces
  salespeople to stop working while the agent processes data.
- **The Solution:** Replace the center modal with a **Retractable Side Sheet
  Component (Drawer)** that slides out from the right margin. It removes the
  dark layout blur cover, leaving the background pipeline interactive.
- **Background Processing Persistence:** Users can close or minimize the sidebar
  tracker at any time. The underlying cognitive mutations continue running
  safely as a background thread. Once the processing sequence settles, a small
  non-intrusive toast notification surfaces on the layout:
  `✓ Copilot completed updates for Lead Lucas Castelo`.
- **Sequential Execution Flow Logs:** Inside the panel, actions stream
  sequentially as a real-time log queue:
- _“Reading active WhatsApp history string parameters...”_
- _“Intent Classification settled: Scheduled Meeting requested.”_
- _“Executing Core-Table Skill: Modifying stage to 'Proposal'.”_

---

## 🧠 Epic 2: Humanized Cognitive Approvals (No Raw JSON)

- **The Friction:** When an agent requires human validation before completing a
  disruptive action, it displays raw developer code objects directly to
  salespeople on their cards:
  `{"args":{"status":"lost","opportunity_id":"998a8467..."},"verb":"set_status","skill":"core_table"}`
  Sellers think in business results, not in database query notation.
- **The Solution:** Build an automated translation abstraction layer inside the
  approval component card. It parses internal system action keys and renders
  clear, structured text:

```text
[Raw Payload: "set_status" + "lost"]  ➔ [UX Translation Layer] ➔ "Marcar Oportunidade como Perdida"
[Raw Payload: "move_stage" + "won"]   ➔ [UX Translation Layer] ➔ "Avançar Card para a etapa: Ganho"
```

---

## ⚡ Epic 3: Event-Driven Reactive Execution Loop (Backend)

- **The Friction:** Background automation parameters currently rely on batch
  intervals or cron schedules, creating processing bottlenecks for live
  operations.
- **The Solution:** Wire up an immediate database consumer loop. The moment a
  fresh chat segment or ad form submission registers on a workspace, the system
  evaluates the state of the toggle `is_crm_agent_enabled`.
- **Reactive Loop (Toggle ON):** The engine bypasses batch delays and handles
  incoming payloads instantly. It streams the data through your **Agno
  Multi-Agent Matrix** on the fly, updates custom fields, re-orders Kanban
  cards, and launches deal timers in under 2 seconds.

---

## 🎯 Epic 4: Intent Safety Net & Few-Shot Prompt Calibration

- **The Friction:** High-intent message triggers (such as _“gostaria de agendar
  uma reunião”_ or _“vamos marcar uma call”_) can return false negatives. If the
  semantic classification drops slightly below the confidence threshold, the
  agent falls back to a passive state (`automation_kind: "none"`), leaving hot
  leads unattended.
- **The Solution:** Calibrate the system prompt instructions inside
  `floor_doorman.py` using explicit few-shot semantic examples. Instruct the
  model that specific high-conversion keywords (e.g., _reunião, call, agendar,
  marcar, call, zoom_) carry maximum structural priority and must immediately
  trigger an active agentic decision.
- **⚠️ The Intent Omission Guard (UI Fallback):** If an active commercial intent
  word is detected but overall classification confidence falls just below the
  action threshold, the system displays a clear warning badge on the Kanban card
  face: `⚠️ Intenção Detectada pelo Copilot`. Inside the sidebar chat panel, a
  prompt appears: _"The lead mentioned 'reunião'. Click here to manually force
  Copilot Sync and schedule a task."_

---

## 📊 Epic 5: The Consolidated CRM Copilot Log Ledger (Data Area)

- **The Friction:** The agent tracking table is hidden inside the Billing area
  and displays unreadable raw system entity hashes
  (`opportunity_id: "998a8467-b7b9..."`), making rapid business auditing
  impossible.
- **The Solution:** Move the ledger log dashboard out of the billing section and
  display it as a core component named **"Central do Copiloto" directly inside
  the CRM panel layout**.
- **Relational Query Joins:** Update the backend selector data mutations.
  Instead of reading the opportunity UUID, the database selector performs a
  direct inner relation join on `leads(name)` via the associated `lead_id`
  pointer. The system now clearly logs: **Date/Time, Active Agent Role, Human
  Lead Name, Action Executed, and Credit Cost**.

---

## 📝 Epic 6: Unified Cross-Relational Notes Timeline

- **The Friction:** Registering a text note inside an active Kanban opportunity
  modal registers it strictly to that specific opportunity row. To check
  historic annotations, sellers have to switch views back to the contact table
  page, which slows down operations.
- **The Solution:** Build a unified database listener function. Whenever a note
  or timeline event is registered inside a pipeline opportunity modal, the data
  is automatically mirrored onto the parent contact profile timeline view. This
  keeps the contextual timeline unified across both interfaces, saving
  salespeople time and clicks.

---

## 🚀 Actionable Engineering Handoff Prompt

Copy and paste this concise, target-driven directive block directly to your
developers or development AI tool to initialize the implementation of Sprint
6.2:

---

### 📋 SPRINT 6.2 INSTRUCTION COMMAND BLOCK

**Goal:** Refactor CRM Copilot telemetry interfaces, humanize code parameters,
wire event-driven re-execution, and establish logging metrics.

**Task Checklist:**

1. **Frontend Layout Drawer (`TelemetryHUD.tsx`):** Swap the center `Dialog`
   component with a right-aligned `Sheet` wrapper. Remove screen lock overlays.
   Let queries process as asynchronous background threats if the sidebar sheet
   is closed, utilizing standard toast components for completion updates.
2. **UX String Abstraction (`CopilotApprovalCard.tsx`):** Map incoming code
   method keys to natural text descriptions before rendering strings to users
   (e.g., convert `set_status: lost` to **"Marcar Oportunidade como Perdida"**;
   convert `create_task` to **"Agendar Nova Tarefa"**).
3. **Reactive Back-end Listeners (`workflow.py`):** Refactor processing chains.
   If `is_crm_agent_enabled` matches TRUE, new messaging triggers must
   immediately execute the Agno agent matrix on the fly without waiting for cron
   intervals.
4. **Few-Shot Prompt Calibrations (`floor_doorman.py`):** Append rigid text
   anchor examples inside system instructions. High-intent schedule keywords
   (_reunião, call, marcar, call, zoom_) must trigger active execution rules.
   Render a high-visibility badge fallback
   (`⚠️ Intenção Detectada pelo Copilot`) on cards if confidence targets fall
   short.
5. **Enriched Audit Panel View (`CRM.tsx`):** Move the log element inside a tab
   viewport inside the CRM interface. Adjust selection parameters to perform a
   join statement, fetching human-readable `leads.name` strings to replace raw
   entity UUID headers inside the ledger row blocks.

---

# 🛠️ IMPLEMENTATION PLAN (PM)

> **PM:** Claude / Opus 4.8 · **Process contract:** `Planning/agent_workflow.md`
> (tiers, branch isolation, handoff block, gate protocol). Engineers: read your
> task **and** the matching Epic above, then follow the flow. **L / XL tasks
> require a short plan approved by the PM before any code.**

> ⚠️ **Doc naming note (for the Human):** this file is `sprint_6.3_…` but the
> Vision header above says "Sprint 6.2". The plan below treats this as
> **Sprint 6.3** and branches use `sprint6.3/…`. Tell me if you want the header
> relabelled.

## 🔎 PM Reconciliation Notes (spec vs. live code — read before assigning)

I grounded every Epic against the actual repo. Three deltas change scope — none
block the sprint, but they keep us from paying to rebuild what already ships:

1. **Epic 2 is ~70% built.** `CopilotApprovalCard.tsx:37 formatAction()` already
   translates the `action`-keyed verb shape (`move_stage`, `set_status`, …). The
   real gap: the cascade persists the **`verb`-keyed** shape via
   `workflow.py:_output_action_for_decision` (`{verb, skill, args, …}`), and that
   shape falls through to raw `JSON.stringify`. **Task T2 = bridge the
   `verb`-keyed shape + cover the few missing verbs.** Not a from-scratch build →
   tiered **M**, not L.

2. **Epic 6 is effectively already solved.** The opportunity modal's "Notas" tab
   renders `<TouchpointsList leadId={lead.id} />` (`OpportunityDetailModal.tsx:344`),
   and `touchpoints` rows are **lead-scoped** (`useTouchpoints.ts`), so a note
   added in the Kanban modal already appears on the contact timeline (same
   lead-scoped query). **Task T7 = verify + document this**, and only patch if a
   real opportunity-scoped write path is found. Tiered **S**.

3. **Epic 3 today = 1-min poll, not reactive.** `pg_cron` ticks
   `POST /api/v1/ingest` every minute (`20260608000600_sprint6_ingest_cron.sql`),
   which drains `copilot_ingest_queue`. "Sub-2s reactive" = add a **DB-trigger
   fast path** that fires the cascade on insert instead of waiting for the tick.
   Cross-cutting (migration + endpoint + wiring) → **XL**, PM-approved plan first.

Also note: the active orchestration is **`agno_workflow.py`** (behind
`COPILOT_WORKFLOW_ENABLED`); `workflow.py` is the legacy fallback. Backend tasks
must touch the path that's actually live — confirm the flag state with the PM
before assuming.

## 🎚️ Task Table (tier · owner · file ownership)

| ID | Epic | Task | Tier | Owner (model) | Owns (only these files) |
| :- | :--- | :--- | :--- | :------------ | :---------------------- |
| **T1** | 1 | HUD modal → retractable right `Sheet`; no overlay/blur; run persists when closed; completion toast | **L** | Claude / Sonnet 4.6 | `src/components/crm/copilot/TelemetryHUD.tsx`, `src/components/crm/copilot/SyncButton.tsx` |
| **T2** | 2 | Humanize approval card: map the `verb`-keyed payload shape + fill missing verbs (no raw JSON ever shown) | **M** | Gemini 3.5 Flash | `src/components/crm/copilot/CopilotApprovalCard.tsx` |
| **T3** | 5 | Ledger query: inner-join `leads(name)` so the panel can show the human name | **S** | verboo / deepseek | `src/hooks/useCopilotCredits.ts` |
| **T4** | 4 | Few-shot calibration in Floor doorman prompts; emit an `intent_detected` signal when a high-intent keyword fires below threshold | **L** | Claude / Sonnet 4.6 | `python-agent/app/cascade/floor_doorman.py`, `python-agent/app/schemas.py`, `python-agent/tests/test_floor_doorman.py` |
| **T5** | 3 | Reactive fast-path: DB trigger on new chat/ad row → immediate per-row ingest endpoint (sub-2s), gated by `is_crm_agent_enabled` | **XL** | Codex / GPT-5 | `python-agent/app/routers/ingest.py`, `python-agent/app/main.py`, `supabase/migrations/<new>_sprint63_reactive_ingest.sql`, `python-agent/tests/test_ingest_router.py` |
| **T6** | 5 | "Central do Copiloto" tab in the pipeline workspace; mount the ledger there; render `leads.name`; unmount from Billing | **L** | Claude / Sonnet 4.6 | `src/components/crm/PipelineWorkspace.tsx`, `src/components/crm/copilot/CopilotCentralPanel.tsx` (create), `src/components/crm/copilot/CreditLedgerPanel.tsx`, `src/pages/Billing.tsx` |
| **T7** | 6 | Verify lead-scoped notes already mirror across modal ↔ contact; document, or patch only a real gap | **S** | verboo / deepseek | `Planning/sprint_6.3_solo-copilot_evolve_v1.md` (findings), + a focused fix only if a gap is confirmed (flag PM first) |
| **T8** | 4 | `⚠️ Intenção Detectada pelo Copilot` badge on the Kanban card when the backend `intent_detected` signal is set | **M** | Antigravity / Gemini | `src/components/crm/OpportunityCard.tsx` |

> **Cost lever:** S/M work (T2, T3, T7, T8) routes to cheap models; only the
> genuinely cross-cutting backend (T5) and integration tasks (T1, T4, T6) get a
> strong model. No premium model on an S task.

## 🌊 Wave Map

Tasks within a wave touch **non-overlapping files** → run in parallel. `→` = hard
dependency across waves.

**Wave 1 — independent foundations (all parallel):**
- **T1** (HUD Sheet) — FE, isolated copilot components.
- **T2** (humanize card) — FE, single component.
- **T3** (ledger join) — FE hook. → unblocks T6.
- **T4** (Floor few-shot + intent signal) — backend. → unblocks T8.
- **T5** (reactive ingest) — backend, separate files. **XL → PM-approved plan first.**
- **T7** (notes verification) — analysis/doc, no app-file collision.

**Wave 2 — integrations (open after their deps merge):**
- **T6** (Central do Copiloto tab) — needs **T3** merged (joined query in `useCopilotCredits`).
- **T8** (intent badge) — needs **T4** merged (backend writes the `intent_detected` flag the card reads).

```text
Wave 1:  T1   T2   T3 ─┐   T4 ─┐   T5(XL)   T7
                       │        │
Wave 2:            T6 ◀┘    T8 ◀┘
```

**Interface contracts across the wave boundary (so Wave-2 owners aren't guessing):**
- **T4 → T8:** Floor writes the below-threshold-but-intent case into the decision's
  `output_action` as `{"intent_detected": true, "intent_keyword": "<word>"}` (alongside
  existing `urgent`). T8 reads it via the existing `useCopilotApprovals` / Realtime
  decision feed keyed by `opportunity_id` and renders the amber badge on the card face.
- **T3 → T6:** `useCreditLedger` rows gain `lead: { name: string } | null` from a
  `select("*, leads(name)")` join; `CreditLedgerPanel` renders `lead?.name` in the
  "Oportunidade / Canal" column, falling back to the 8-char id when null.

## ✅ Definition of Done (acceptance contract)

A task is accepted only when its box here is satisfied **and** the handoff block
(`agent_workflow.md` §6) is posted.

- [ ] **DoD-1 (Epic 1):** `⚡ Sync` opens a right-side drawer; the background
      pipeline stays clickable (no full-screen blur/lock); closing the drawer
      does **not** abort the run; a `✓ Copilot concluiu…` toast fires on `done`.
- [ ] **DoD-2 (Epic 2):** No approval card ever shows raw JSON / brace notation.
      Both payload shapes (`action`-keyed and `verb`-keyed) render as Portuguese
      business text. `set_status:lost` → "Marcar Oportunidade como Perdida".
- [ ] **DoD-3 (Epic 3):** A fresh chat/ad row on an agent-enabled team triggers
      the cascade **without** waiting for the 1-min cron tick (observed sub-2s in
      a manual trace); `is_crm_agent_enabled = false` still skips. The cron poll
      remains as a safety-net backstop.
- [ ] **DoD-4 (Epic 4):** Messages containing `reunião / call / agendar / marcar /
      zoom` drive an active decision; new few-shot tests pass. When confidence is
      below threshold but a keyword is present, the card shows
      `⚠️ Intenção Detectada pelo Copilot`.
- [ ] **DoD-5 (Epic 5):** The ledger lives in a "Central do Copiloto" tab inside
      the CRM (not Billing) and shows the **lead's name**, not a UUID slice.
- [ ] **DoD-6 (Epic 6):** Confirmed (with code evidence) that a note added in the
      opportunity modal appears on the contact timeline and vice-versa; finding
      documented. Any real gap patched.

## 📊 Ledger Hooks (engineers tick on handoff)

- [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5 · [ ] T6 · [ ] T7 · [ ] T8
- Each engineer adds **one** row to `Planning/billing.md`
  (`date · 6.3 · <task> · <agent/model> · <tier> · R$`) on their branch before handoff.

---
