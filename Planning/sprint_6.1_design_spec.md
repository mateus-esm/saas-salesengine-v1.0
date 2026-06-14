# Sprint 6.1 — Solo Copilot v1 (Production) · Design Spec

> **Status:** Design / brainstorming output. The bite-sized wave/task breakdown is appended beneath the
> F1 Ignition vision in `Planning/sprint_6.1_solo-copilot_evolve_v1.md` (produced by writing-plans).
> This document is the *architecture* and *scope* contract — altitude is design, not tasks.
>
> **Author:** PM (Opus) · **Date:** 2026-06-14 · Repo is not a git repo, so this file is saved, not committed.

---

## 0. North Star

Evolve the **deployed Sprint-6 cascade** (prefilter → Tower → Floor → Worker) into a
**monetized, multi-action, cost-tiered Agentic Sales OS** whose engine is *Agno-native to the DNA* —
and lay the concrete foundation to bring the external conversational agent **in-house** at
`agent.soloventures.com.br`, retiring the GPT-Maker dependency over time.

Two non-negotiable properties, held simultaneously:

1. **High value** — the system *feels* like the team's best salesperson (remembers context, acts, reasons strategically).
2. **Cost efficiency** — cheap models do the high-volume work; strategic/reasoning models fire *only* where value justifies cost.

The product metaphor is an **F1 engine**: maximum useful output per unit of fuel, with real telemetry.

---

## 1. Where we are today (verified against live code)

| Capability | Current state | File |
| :-- | :-- | :-- |
| Cascade orchestration | Hand-rolled, ~330 lines | `python-agent/app/cascade/workflow.py` |
| Routing / triage | Tower Doorman + Floor Doorman (cheap model) | `cascade/tower_doorman.py`, `floor_doorman.py` |
| Execution | Single deterministic action **or** cost-capped autonomous Agno Team | `cascade/worker.py`, `cascade/autonomous_team.py` |
| Guarded CRUD verbs | `CoreTableSkill` (move_stage, set_field, set_contact_field, add_note, create_task, add_tag, …) | `skills/core_table.py` |
| Model tiering | **Static** per-role env vars (`doorman_model`/`worker_model`/`shaper_model`), per-pipeline override | `config.py`, `llm.py` |
| Provider switch | Env-only (Verboo today) | `llm.py::build_chat_model` |
| Confidence gate | ≥0.75 auto-apply, else `pending_approval` | `cascade/workflow.py` |
| Audit | `ai_decisions` via `record_decision` | `audit.py` |
| Sync endpoint | `POST /api/v1/sync` (single lead/opp) | `routers/sync.py` |
| Frontend Copilot | `OpportunityDetailModal` ⚡ Sync, approvals panel, Realtime | `src/services/copilot.ts`, `src/hooks/useCopilotRealtime.ts`, `src/components/crm/copilot/*` |
| Credits (existing) | **GPT-Maker only** (Asaas top-ups), *not* the Copilot | `supabase/functions/asaas-buy-credits`, `fetch-gpt-credits` |

**Key gaps for 6.1:** the cascade executes exactly **one** action per run; model tiering is static (no
stakes-based escalation); there is **no Copilot metering**; the HUD/streaming, ubiquitous Sync surfaces,
persistent memory, evals, and RAG foundation do not exist.

**Core principle for this sprint: reuse over rewrite.** The 6.1 "4-agent matrix" maps onto existing roles
plus one new step — we do **not** build four separate agents:

| 6.1 doc "agent" | What it actually is | Action |
| :-- | :-- | :-- |
| Agent 1 — Chat Broker | Tower Doorman (classify + route) | reuse |
| Agent 2 — Contact Base Enricher | **NEW** enrichment step (extract → `set_field`/`set_contact_field` + Lead Memory) | add |
| Agent 3 — Pipeline Track Driver | Floor Doorman + Worker | reuse → upgrade to multi-action |
| Agent 4 — Track Architect | Track Shaper | reuse |

---

## 2. The Agno-in-the-DNA architecture (the F1 engine)

Every capability below is grounded in current Agno docs (APIs verified 2026-06-14).

| Engine component | Agno primitive (verified API) | Product value |
| :-- | :-- | :-- |
| **Chassis** | `Workflow` with `Step` / `Router` / `Condition` / `Loop` / `Parallel` | Cascade becomes declarative; streaming, session-state, step-caching, parallelism for free |
| **Gearbox** (cost-tiering) | `Router(name, selector, choices)` — `selector(StepInput) -> List[Step]` | Cheap gear by default; shift to strategic-reasoning gear only when stakes demand |
| **Fuel-flow sensor** (metering) | `tool_hooks=[hook]` — `hook(function_name, func, args)` middleware | 1 credit + real `RunOutput.metrics` (tokens/cost) recorded on every successful action, automatically |
| **Cockpit telemetry** (HUD) | `agent.arun(stream=True)` event stream | HUD shows *real* reasoning/tool events, not scripted logs |
| **Driver memory** | `enable_agentic_memory=True` + `MemoryManager(db, model=cheap)` | CRM remembers each contact like a top closer; compounding, cheap-model |
| **Pit-wall authority** (HITL) | `@tool(requires_confirmation=True)` → `active_requirements` → `confirm()/reject()` → `continue_run()` | High-stakes verbs pause for human approval natively |
| **Race strategist** | Reasoning model / ReasoningTools at Tier-3 | Strategic calls (deal-at-risk, next-best-action) where opus-class cost is justified |
| **Engine dyno** (trust) | `AccuracyEval` / Reliability / Performance evals, `.run()` | Prove cheap model is good enough; catch regressions; tune router boundary from data |
| **Knowledge core** | `Knowledge` + `PgVector(search_type=hybrid, embedder=...)` + `search_knowledge=True` | Per-tenant RAG = foundation to bring the customer agent in-house |
| **Garage control plane** | private AgentOS mount (admin-only) | Production traces, sessions, eval runs, playground |
| **Specialist crew** (complex leaf) | Agno `Team` (coordinate mode), cost-capped | Only at genuinely complex opportunities |

---

## 3. Locked architecture decisions

1. **Agno Workflow is the cascade backbone.** Port `run_cascade` to a declarative `Workflow`.
   Deterministic steps stay Python; agentic steps are Agno agents. The hand-rolled orchestration retires.
2. **Cost-tiered cognition via the Router primitive.**
   - **Tier 0** — heuristic prefilter (free, no LLM). *Keep.*
   - **Tier 1** — cheap (verboo) models: classify / route / triage / extract. High volume.
   - **Tier 2** — deterministic verbs (no model). Execution where no reasoning is needed.
   - **Tier 3** — strategic **reasoning** model: high-stakes leaves only — `won`/`lost`, deal value over a
     configurable threshold, **or** Tier-1 confidence below an escalation threshold, **or** the autonomous Team.
   - Implemented as the Workflow `Router` `selector`; per-pipeline overridable via `pipeline_agent_rules`.
3. **Metering by tool hook, not per-verb code.** A post-execution `tool_hook` charges **1 credit** and
   records the action + Agno `metrics` (real tokens/cost) to the ledger **only on success**. Idempotent.
4. **Credit ledger.** New tables `agent_credits_balance` (per `equipe_id`) and `agent_action_ledger`
   (per executed action: `credits_charged`, model, real token/cost, idempotency_key, mode auto/manual).
   Atomic `charge_credits(equipe_id, n, idempotency_key, …)` `SECURITY DEFINER` RPC: decrement + insert in
   one transaction, reject on insufficient balance, retry-safe on key. **Customer sees flat credits; the
   real-cost column is internal margin analytics.**
   **Wallet scope (assumption, override if wrong): SEPARATE from the GPT-Maker/Asaas credits** — clean
   Copilot economics now, unify later. Asaas top-up flow is reused as the payment rail.
5. **Multi-action per pulse.** Floor produces an ordered **`ActionPlan`** (list of actions) instead of a
   single `IntentDecision`. A **sequential executor** runs them one-by-one (no race conditions), each
   charging 1 credit, each streamed to the HUD. Pre-flight: stop when balance reaches 0; never charge a
   failed action.
6. **Persistent Lead Memory.** The Enricher runs with `enable_agentic_memory` + a `MemoryManager` on a
   cheap model, keyed per contact, persisted in the existing `agno` Postgres schema. Memory is *read* by
   downstream agents (Floor/strategist) so decisions improve over time.
7. **Native HITL replaces the bespoke gate for high-stakes verbs.** Mark `move_stage(→won/lost)`,
   destructive verbs, and large-value writes `requires_confirmation`. The run pauses; the existing
   approval-card UI resumes it via `continue_run`. The numeric confidence gate remains for *background*
   auto-vs-queue routing; HITL is the *high-stakes* safety valve. Both write to `ai_decisions`.
8. **Toggle governance unchanged.** `equipes.is_crm_agent_enabled` gates background automation (Toggle ON
   = webhooks/cron auto-run; OFF = manual Sync only, still billed). Per-pipeline `enabled_skills` scopes
   what the Copilot may do.
9. **Real streaming HUD.** Single-card Sync streams Agno events over **SSE** (`/sync/stream`); the **sweep**
   streams per-opportunity progress over **Supabase Realtime** (a `copilot_run_events` row stream). The HUD
   modal renders live cognition: intent → extraction → action, with the real verb + result per step.
10. **Ubiquitous Sync surfaces.** ⚡ button on the Kanban card face, in the chat sidebar (inbox), and a
    **Global Pipeline Sweep** in the pipeline header. Single-card → `/sync`; sweep → new `/sync/sweep`
    (sequential queue across all active opportunities).
11. **Evals dyno in CI + scheduled.** `AccuracyEval` for doorman classification + Floor action selection,
    `Reliability` for tool-call correctness, `Performance` for latency. Run on deploy; gate regressions.
12. **In-house agent foundation only.** Per-tenant `Knowledge`/`PgVector` schema + ingestion path + a
    documented messaging I/O contract. The conversational customer agent itself is **Sprint 6.2+**.
13. **Private AgentOS stub.** Mount AgentOS admin-only (behind `AGENT_INTERNAL_TOKEN`) for traces/sessions/
    eval runs. Never the public mutation surface (Sprint-6 decision holds).

---

## 4. Scope — in v1 vs foundation vs deferred

**In Sprint 6.1 (Layers 0–3):**
- Agno Workflow cascade backbone (keystone)
- Cost-tiered Router (verboo → strategic reasoning)
- Credit ledger + `charge_credits` RPC + tool-hook auto-metering + real-cost capture
- Multi-action `ActionPlan` sequential executor
- Contact Base Enricher + **persistent Lead Memory**
- Native HITL confirmation for high-stakes verbs
- Reasoning strategist at the high-stakes leaf
- Ubiquitous ⚡ Sync (card / chat / header) + Global Pipeline Sweep
- Real streaming Telemetry HUD (SSE + Realtime)
- Billing / transparency ledger UI + balance widget
- Evals dyno (accuracy / reliability / performance) in CI
- Private AgentOS admin stub
- Dokploy deploy + hardening

**Foundation only (laid this sprint, not finished):**
- Per-tenant `Knowledge` / `PgVector` schema + ingestion path
- Messaging I/O contract for the future in-house conversational agent
- Session/memory store hardening to production grade

**Deferred to 6.2+:**
- The conversational customer-facing agent that replaces GPT-Maker
- Unified Copilot + GPT-Maker credit wallet
- Horizontal scale-out / Redis cache fan-out (single-replica + short TTL until then)
- UI-managed `copilot_skills` registry table

---

## 5. Data model deltas (high level — RPC/column detail lives in the plan)

- `agent_credits_balance(equipe_id PK, balance integer, updated_at)` — per-tenant Copilot wallet.
- `agent_action_ledger(id, equipe_id, opportunity_id, lead_id, decision_id, verb, credits_charged,
  model, real_input_tokens, real_output_tokens, real_cost_usd, mode 'auto'|'manual', idempotency_key
  UNIQUE, created_at)` — one row per executed structural action; powers billing UI + margin analytics.
- `copilot_run_events(id, equipe_id, run_id, opportunity_id, seq, kind, payload jsonb, created_at)` —
  Realtime stream backing the sweep HUD.
- `pipeline_agent_rules` — extend with strategic-tier config: `strategic_model`, `escalate_threshold`,
  `deal_value_strategic_threshold`.
- Knowledge: per-tenant `PgVector` table(s) under a dedicated schema (foundation).
- `agno` schema — already present for sessions/memory; hardened, now also stores Lead Memory.
- RPC `charge_credits(p_equipe_id, p_n, p_idempotency_key, p_ledger_row jsonb)` — atomic, `SECURITY DEFINER`.

---

## 6. Risks & mitigations

1. **Workflow port regression** — the cascade is live and deployed. Mitigation: port behind a feature flag;
   keep `run_cascade` until the Workflow passes the Evals dyno at parity, then cut over.
2. **Double-charging credits** — retries / concurrent sweep. Mitigation: `idempotency_key` UNIQUE +
   charge-on-success-only inside the atomic RPC.
3. **HITL resume state loss** — `continue_run` needs the paused run persisted. Mitigation: require session
   storage for any pipeline with `requires_confirmation` verbs enabled; surface clearly in the approval card.
4. **Strategic-tier cost blowout** — reasoning models are expensive. Mitigation: Router gates Tier-3 on
   explicit stakes + per-pipeline ceiling; Evals continuously check whether Tier-1 already suffices.
5. **Verboo compatibility** — Router/hooks/structured-output must work through the OpenAI-compatible router.
   Mitigation: keep the existing `role_map` + JSON-mode handling; add SDK contract tests for the new paths.
6. **Memory cost/noise** — agentic memory can over-write. Mitigation: cheap MemoryManager model + scoped
   per-contact; eval the memory-extraction quality.

---

## 7. Success criteria (Definition of Done)

- A single ⚡ Sync streams **real** Agno cognition to the HUD and applies **multiple** actions, each metered.
- The Global Sweep processes every active opportunity sequentially, no double-charges, live HUD per card.
- Cost router demonstrably uses verboo for ≥ the high-volume tier and only escalates to the strategic
  reasoning model on configured high-stakes branches (provable in the ledger's `model` column).
- Credit balance decrements correctly and idempotently; the transparency ledger UI matches the wallet.
- Lead Memory persists across sessions and visibly improves a downstream decision in a demo.
- High-stakes verbs pause for approval and resume on confirm.
- Evals dyno runs in CI and fails the build on a seeded regression.
- The RAG/messaging foundation exists and is documented as the 6.2 on-ramp.
- Deployed on Dokploy at `agent.soloventures.com.br` with the Workflow backbone live.

---

## 8. Team / model roster (assignment detail deferred to the plan)

- **opus** — hardest architecture & orchestration (Workflow keystone, cost Router, multi-action, reasoning tier) + reviews
- **codex** — security-critical Python (credit RPC atomicity, idempotency, guard layer, metering hook)
- **sonnet** — Agno agents + frontend (HUD streaming, ubiquitous Sync, memory wiring)
- **gemini** — mid-complexity UI (billing/ledger panels, settings)
- **verboo** — high-volume low-stakes (boilerplate tests, repetitive CRUD, docs, eval fixtures)
