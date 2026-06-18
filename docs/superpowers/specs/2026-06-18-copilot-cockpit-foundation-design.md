# Copilot Cockpit — Foundation Design Spec

**Date:** 2026-06-18
**Author:** Opus (PM/architect) with Mateus (product vision)
**Status:** Draft for review
**Builds on:** Sprint 6 (Solo Copilot live), Sprint 6.1 (Agno F1 engine), Sprint 6.3 (cockpit UX)

---

## 1. Why this exists

The Solo Copilot is deployed and the Agno cascade runs, but three lived problems break the
illusion that the system is *alive and trustworthy*, and the configuration surface is buried
inside individual pipelines instead of being a place the user commands like an F1 engineer.

**The three bugs (observed by Mateus):**

1. **Sync feels dead.** Clicking ⚡ Sync on a chat, a card, or a pipeline header produces no
   visible feedback. The user wants a *discreet, elegant* right-side drawer that streams the
   agents' progress and actions, minimizable, persisting until the agent stops.
   - *Root cause (to confirm):* the streaming path (`/sync/stream`) only does real work when
     `COPILOT_WORKFLOW_ENABLED=true`; status notes say the flag is still `false` in prod and the
     `20260614000*` migrations were never applied to the remote DB (H4/H5 pending). The HUD
     machinery (`SyncButton` → `useCopilotSync` → `TelemetryHUD`) already exists in code.

2. **The agent pollutes the contact base.** It *appears* to "create tables/fields" in base de
   contatos. It cannot create tables (verbs are locked + `assert_table`). The real cause: the
   **enricher writes arbitrary keys into `leads.personal_custom_data`**, which is schemaless —
   there is no dictionary bounding it, so every invented key shows up as a new property.

3. **Notes land on the contact, not the deal.** `core_table.add_note` inserts into
   `lead_activities` keyed by `lead_id` only — no `opportunity_id`/pipeline scope. Notes about a
   specific deal are invisible in the pipeline context.

**The vision:** promote "Agente de CRM" out of the pipeline into a **top-level Copilot section** —
a cockpit where the user configures a small team of named specialist copilots and watches them work.

---

## 2. North star & scope boundary

> **Build a precision-engineered operational spine first — gears that mesh with excellence and
> reliability — *then* evolve to strategic intelligence.**

**In scope (the foundation):** route messages to the right copilot, enrich the right field in the
right place, move the right stage, execute detected intents, and make every gear **observable and
controllable**.

**Explicitly out of scope (deferred to a later floor):** strategic recommendations, suggested
message drafts, "next best action" coaching, autonomous multi-step deal strategy. The foundation
earns the right to build the brain by first making the arms trustworthy.

---

## 3. Architecture — a configurable team over the existing cascade

This is **one cascade with three configurable faces**, not three new engines. The friendly
frontend personas map directly onto today's backend agents.

| Frontend persona | Job | Backend today |
|---|---|---|
| 🗗 **Chat Copilot** (global, 1) | Front door. Reads source + intent + who the contact is. Hosts the **Enricher subagent**. Dispatches to the right arm. Writes nothing to the CRM itself. | Tower Doorman |
| 📇 **Base de Contatos Copilot** (global, 1) | Arm for contact-level fields. Qualifies, enriches contact fields, drops new leads into the right pipeline. Runs contact-base automations/crons. | enricher + general worker |
| 🏭 **Pipeline Copilot** (1 per pipeline, named) | Arm for one pipeline. Executes pipeline-field writes, detects intents, moves stages — guided by that pipeline's stage/field descriptions + SLA. | Floor Doorman + Worker |

### 3.1 Cognition / execution split (the keystone)

The **Enricher is a router, not a hand.** It is a subagent of the Chat Copilot. For each inbound
message it:

1. Identifies the contact and whether they already have an opportunity (and in which pipeline).
2. Loads **both dictionaries**: the contact-field dictionary + the dictionary of *the pipeline
   that opportunity lives in*.
3. Extracts facts and **matches each against the dictionaries**, producing routed directives:
   - `valor_conta = 1000` → Pipeline X opportunity field
   - photo of bill → Pipeline X `Conta de Energia` **file field**
   - "sou o CFO" → contact field `cargo`
   - **no dictionary match → dropped, never written**
4. **Hands each directive to the owning arm.** It does not execute writes itself.

The owning copilots (Base de Contatos / Pipeline) **execute** the directives. The Pipeline Copilot
additionally applies its own intent + stage-move judgment from its training. This separation is
testable: the routing decision can be verified without touching the database.

### 3.2 Message flow

```
Inbound message
   │
   ▼
🗗 Chat Copilot ── Enricher subagent (extract + match both dictionaries → routed directives)
   │
   ├── contact NOT yet in a pipeline ──► 📇 Base de Contatos Copilot
   │        • enrich contact fields (dictionary-bounded)
   │        • qualify → when it becomes an opportunity, create it in the right pipeline
   │
   └── contact IS an opportunity ──────► 🏭 Pipeline Copilot (the one owning that opportunity)
            • execute pipeline-field writes (incl. file fields)
            • detect intent vs stage descriptions → move stage
            • add deal-scoped notes/touchpoints
```

---

## 4. The five gears (the precision spine)

1. **Two dictionaries, generated live from CRM setup.** Not a separately-maintained list — read
   from the current schema + config every run, so editing a field/stage updates the agent's
   knowledge instantly.
2. **Enricher = router, not hand.** Extract → match → route. No match → no write.
3. **Right-place writes.** Pipeline facts → `opportunities.custom_data` (incl. file fields);
   contact facts → `leads.personal_custom_data` (bounded by the contact dictionary); notes →
   scoped to the opportunity where the deal lives.
4. **Autonomy dial per copilot.** Observe → Suggest → Autonomous, promoted by hand.
5. **Everything observable.** Every decision + action streams to a live feed and lands in a
   filterable log (lead, time, field changed, credits).

---

## 5. Training-via-descriptions (the data the agent learns from)

**Principle:** the user never opens a "training console." They *describe their own CRM well*, and
those descriptions ARE the training, read live.

### 5.1 Pipeline fields — extend `custom_fields_schema`
Today each field is `{field_id, key, label, type, required, options, position, is_deleted}`.
**Add `description`** (and confirm `type` supports `file`). The description tells the Enricher what
the field means and how to fill it assertively.

### 5.2 Stages — extend `pipeline_stages_v2`
Today: `name, color, position, stage_type, max_idle_hours (SLA)`. **Add `description`.** The
description + SLA together teach the Pipeline Copilot *when to move a deal here* and *when a deal is
overstaying*.

### 5.3 Pipeline objective — reuse `pipelines.description`
Already exists. Becomes the Pipeline Copilot's high-level context.

### 5.4 Contact-field dictionary — NEW (fixes Bug 2)
`leads.personal_custom_data` is schemaless today. Introduce a **contact-field dictionary**:
**canonical baseline fields** (ship with sensible defaults + descriptions) **+ user-created custom
fields** (each with key, label, type, description). The Enricher may only write contact facts into
fields that exist in this dictionary. *(Open question 9.1: per-tenant table vs. a JSONB schema
column on `equipes` — decide at Wave 2 planning.)*

---

## 6. Autonomy dial + humanized approvals

### 6.1 Per-copilot autonomy ladder
A new mode on each copilot's config (`pipeline_agent_rules` for pipeline copilots; a new global
config row for Chat + Base de Contatos):

- **🔭 Observe (shadow):** proposes in telemetry, writes nothing. Zero risk.
- **✋ Suggest (approve):** prepares the action, waits for one-tap human approval.
- **⚡ Autonomous:** executes confidently, pausing only for high-stakes verbs (won/lost), logs all.

Every new Pipeline Copilot **starts in Observe**; the user watches its telemetry and promotes it by
hand. The existing `confidence_threshold` / `autonomy_cost_ceiling` continue to govern the
auto-vs-queue decision *within* Autonomous mode.

### 6.2 Humanized approval prompts
Approval cards must be natural-language, contact-named, action-named — never raw JSON:
- *"Mover Mateus para Reunião de Apresentação?"*
- *"Adicionar essa nota para Mateus?"*

---

## 7. The Copilot Cockpit section (two faces)

A new **top-level CRM section** (sibling to pipelines / base de contatos), not nested inside a
pipeline.

- **🔧 Garage (config):** for each copilot — name, system prompt, autonomy dial, allowed verbs,
  deterministic + cron automations. Pipeline copilots listed per pipeline; Chat + Base de Contatos
  as the two global specialists.
- **📟 Control Room (telemetry):** the live "alive" drawer + a filterable decision/action log —
  per pipeline, showing action executed, lead associated, timestamp, field changed, credits spent.
  *This is the Bug-1 fix and the F1 feeling.*

---

## 8. Concrete schema deltas (grounded in current schema)

| Change | Where | Note |
|---|---|---|
| Add `description` to each field | `pipelines.custom_fields_schema` (JSONB items) | training |
| Confirm/allow `type: "file"` | `custom_fields_schema` | enables file-field attach |
| Add `description` | `pipeline_stages_v2` | training (SLA `max_idle_hours` already exists) |
| Contact-field dictionary | NEW (table or `equipes` JSONB) | canonical + custom; bounds enrichment |
| `autonomy_mode` | `pipeline_agent_rules` + new global copilot config | Observe/Suggest/Autonomous |
| Per-copilot `system_prompt` | `pipeline_agent_rules` + global config | configurable behavior |
| Global copilot config row | NEW | home for Chat + Base de Contatos copilots |
| `opportunity_id` scope on notes | `lead_activities` (or query layer) | Bug 3 — deal-scoped notes |
| `attach_file` verb | `core_table.py` | write media into a file-type field |
| Confirm prod deploy | Dokploy env + remote migrations | Bug 1 — H4/H5 gap |

*(Exact column types and the contact-dictionary home are decided at each wave's planning step,
against the live DB.)*

---

## 9. Wave decomposition + chaining logic

One spec (this document); **planning is done one wave at a time.** Each wave's plan declares what it
consumes from the previous wave, so the foundation never becomes a single unmanageable plan.

- **Wave 1 — The Precision Spine (backend correctness).** Enricher-as-router + dictionary-bounded
  writes + right-place scoping (incl. deal-scoped notes) + `attach_file` verb + planner/executor
  split. **Confirm & close the prod deploy/flag gap so the engine actually runs end-to-end.**
  → Fixes Bugs 2 & 3; makes the arms trustworthy. **Spec'd & planned first.**
  *Depends on:* nothing new. *Produces:* a trustworthy execution spine + the directive contract.

- **Wave 2 — Training-via-descriptions.** Add `description` to fields/stages; build the
  contact-field dictionary (canonical + custom); feed all of it into the dictionaries the Enricher
  reads. *Depends on:* Wave 1's dictionary-reading contract. *Produces:* live training surface.

- **Wave 3 — The Cockpit: Garage + autonomy dial + humanized approvals.** Top-level section; per-
  copilot config (name, system prompt, autonomy mode); humanized approval cards.
  *Depends on:* Wave 1 (verbs/confidence) + Wave 2 (config fields). *Produces:* user control.

- **Wave 4 — The Control Room + live "alive" HUD.** Filterable decision/action log; the elegant
  streaming drawer; verify the alive feeling end-to-end.
  *Depends on:* Wave 1 (events) + Wave 3 (section shell). *Produces:* the F1 telemetry experience.

**Chaining rule:** a wave is not planned until the previous wave is implemented and verified
(backend gate `pytest`; frontend gate `npm run build`).

---

## 10. Out of scope / deferred
- Strategic recommendations, suggested messages, next-best-action coaching.
- Multi-step autonomous deal strategy / nested Agno Team strategy work.
- Unifying the agent credit wallet with GPT-Maker/Asaas credits.
- Horizontal scale-out / Redis.

---

## 11. Open questions (resolve at wave planning, not now)
1. **Contact-field dictionary home:** dedicated per-tenant table vs. JSONB schema column on
   `equipes`. (Wave 2)
2. **Deal-scoped notes:** add `opportunity_id` column to `lead_activities` vs. resolve scope at the
   query/UI layer. (Wave 1)
3. **Global copilot config home:** new table vs. extend an existing config table for the Chat +
   Base de Contatos copilots. (Wave 1/3)
4. **Confirm Bug-1 root cause** is the deploy/flag gap (vs. a code path) before Wave 4 design.
