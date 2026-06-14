Sprint 6.1 Product Strategy: Agentic Sales OS Sprint 6.1 moves the Sales Engine
OS away from basic automation toward a high-performance, low-touch Agentic Sales
Operating System. Inspired by the efficiency of a Formula 1 cockpit, this sprint
focuses on removing data entry friction for sales teams, delivering high-level
strategic visibility to management, and introducing a predictable credit-based
model to monetize AI capabilities.

The core product design principle is simple: The system shouldn't require manual
data entry; it should dynamically process actions and deliver immediate revenue
metrics.

🏎️ Top-Down Strategic Framework (JTBD Breakdown)

1. The Ubiquitous Cockpit: Zero-Friction Sync & Real-Time HUD Vendors often
   abandon CRMs because manually updating accounts creates constant operational
   friction. This sprint places control buttons directly within the workflow to
   automate tracking at every key checkpoint:

On-Card Trigger: A rapid-action button placed directly on the face of the Kanban
card, allowing instant state evaluation without forcing the user to open full
detail modals.

Chat Sidebar Trigger: Located directly next to active WhatsApp conversations,
allowing a salesperson to align CRM properties instantly as the customer speaks.

Global Pipeline Sweep: A master synchronization button at the top of the
pipeline dashboard. With one click, it sweeps every active opportunity,
evaluates pipeline health, catches out-of-SLA deals, and updates metrics across
the workspace.

The Telemetry HUD Modal: When a synchronization is triggered, the user sees a
clean, live stream of executive logs instead of a generic loading spinner. This
HUD displays exactly what the cognitive layer is evaluating and executing (e.g.,
“Analyzing message intent... Extracting budget parameters... Moving card to
'Proposal' stage”).

2. The Collaborative Multi-Agent Matrix (Role Definition) To deliver true value,
   the system operates as a unified group of specialized AI agents rather than
   single, isolated prompts. Each agent handles a distinct part of the user
   journey:

Plaintext [Incoming Chaos / WhatsApp Message] │ ▼
┌────────────────────────────────────────────────────────┐ │ Agent 1: Chat
Broker Agent │ ➔ Triages concepts & intercepts strings
└────────────────────────────────────────────────────────┘ │ ┌───────┴───────┐ ▼
▼ ┌──────────────┐ ┌──────────────┐ │ Agent 2 │ │ Agent 3 │ │ Contact Base │ │
Pipeline │ ➔ Enriches properties, triggers multi-actions, │ Enricher │ │ Track
Driver │ and manages sequential execution queues └──────────────┘
└──────────────┘ │ │ └───────┬───────┘ ▼
┌────────────────────────────────────────────────────────┐ │ Agent 4: Multi-Step
Track Architect │ ➔ Self-shapes pipelines & cadences during onboarding
└────────────────────────────────────────────────────────┘ Agent 1: The Chat
Broker Agent (The Traffic Controller): Continuously monitors text streams and
webhooks. It classifies incoming intents and decides whether a contact
represents a cold lead to be enriched or an active deal requiring structural
pipeline movement.

Agent 2: The Contact Base Enricher (The Qualitative Database): Focuses entirely
on context accumulation. It reads message histories to identify and extract key
business properties (e.g., historical tariff rates, decision-maker profiles, and
active pain points), automatically populating custom fields without manual data
entry.

Agent 3: The Pipeline Track Driver (The Execution Engine): Manages live
workspace state modifications. It updates Kanban stages, enforces SLA timers,
and generates next-step tasks for human salespeople to keep deals moving
forward.

Agent 4: The Multi-Step Track Architect (The System Onboarder): Handles
workspace initialization. During onboarding, a manager can describe their unique
sales cycle in plain text. This agent then automatically structures columns,
creates custom data fields, and sets up automated operational rules.

🪙 3. The Dual-Mode Automation Engine & Credit Ledger To make AI usage clear,
sustainable, and highly profitable as a SaaS utility, Sprint 6.1 introduces a
straightforward pricing and automation structure for users.

The Single Toggle Governance (Automation vs. On-Demand Control) The pipeline
toggle defines how autonomously the agents operate in the background. However,
manual control remains available to ensure users can always access AI
capabilities on demand:

Toggle ON (Fully Autonomous Mode): The multi-agent matrix acts as an automated
background team. Webhooks and timed cron tickers trigger execution automatically
for every contact and opportunity, running workflows without human intervention.

Toggle OFF (Copilot / Passive Mode): Background automation is paused. The system
does not alter properties on its own, but the salesperson retains full manual
control. Clicking any ubiquitous ⚡ Sync button immediately invokes the agent
cluster to process the selected card or workspace, billing usage directly to the
account.

The Predictable Monetization Model (1 Action = 1 Credit) Token pricing models
can be confusing for end users. To make billing intuitive, Sprint 6.1 introduces
a simple pricing rule: Each structural action executed costs exactly 1 Credit.
While the backend optimizes API usage costs by utilizing efficient models for
initial sorting, the customer is billed based on a predictable,
easy-to-understand credit tier.

The Sequential Queue Execution Ledger High-velocity workspaces often process
multiple concurrent events, which can cause data conflicts. This sprint
introduces a clear, row-by-row tracking interface that processes updates
reliably:

Sequential Queueing (Filas): Updates are processed in an ordered, one-by-one
queue. This prevents race conditions and ensures data is saved reliably.

The Transparency Ledger Panel: Managers have access to a clean billing overview
showing exactly how credits are used:

Date / Time	Opportunity / Channel	Cognitive Actions Executed	Pipeline
Mode	Consumption Cost Jun 14, 05:42	Solar Usina - WhatsApp	Enrich Field (12kWp),
Move Stage (Won)	Toggle ON (Auto)	-2.000 Credits Jun 14, 05:45	Corporate Lead -
Click Sync	Create Task (Follow-up Decision Maker)	Toggle OFF (Manual)	-1.000
Credit 🚀 Strategic Execution Plan for Sprint 6.1 To implement these updates
efficiently, your development team should focus on four distinct building
blocks:

Data Schema Extension: Update database tables to support credit balances
(agent_credits_balance), introduce a toggle for autonomous background processing
(is_crm_agent_enabled), and establish an action ledger table to track individual
updates.

Multi-Action Backend Logic: Update the core processing workflow to support
executing multiple actions per sync pulse, validate available credit balances
before processing, and save results sequentially to the ledger.

Ubiquitous UI Integration: Add the sync button to the Kanban card faces, the
chat side panel, and the pipeline header, linking them to a real-time terminal
HUD modal to display active execution steps.

Customer Billing Interface: Build a transparent credit usage dashboard and
ledger history, providing managers with clear visibility into system utilization
and operational costs.

---
---

# Sprint 6.1 Implementation Plan — Solo Copilot v1 (Agno-Native "F1 Engine")

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Companion design spec:** `Planning/sprint_6.1_design_spec.md` (architecture rationale + Agno API references, verified 2026-06-14). Read it before starting.

**Goal:** Evolve the deployed Solo Copilot cascade into a monetized, multi-action, cost-tiered, Agno-native Sales OS with a credit ledger, persistent lead memory, native human-in-the-loop, real streaming telemetry HUD, ubiquitous ⚡ Sync, and an Evals dyno — laying the RAG/messaging foundation to bring the customer agent in-house.

**Architecture:** The hand-rolled `cascade/workflow.py` orchestration is ported onto an **Agno `Workflow`** (Step/Router/Condition/Loop/Parallel) behind a feature flag. A `Router` selector implements cost-tiering (free heuristic → cheap verboo classify/triage → deterministic verbs → strategic reasoning model only on high-stakes leaves). Metering is woven in via Agno `tool_hooks` that charge **1 credit + record real token/cost** to a new ledger on every successful structural action. The Floor doorman emits a multi-action `ActionPlan` run by a sequential executor. The Enricher gains persistent per-contact memory (`enable_agentic_memory` + `MemoryManager`). High-stakes verbs use native `requires_confirmation` HITL. The frontend gains ⚡ Sync on the card/chat/header plus a real event-streaming HUD (SSE for single, Supabase Realtime for sweep) and a billing/transparency UI.

**Tech Stack:** Python 3.12 · FastAPI · Agno 2.x · Supabase (Postgres + pgvector + Realtime) · asyncpg/supabase-py · pytest + respx · React + Vite + TypeScript + TanStack Query · Dokploy/Traefik. LLM provider via env (`LLM_BASE_URL`/`LLM_API_KEY`) — Verboo today.

---

## Conventions (read once)

- **Backend tests:** `cd python-agent && python -m pytest tests/<file>::<test> -v`. Tests are flat in `python-agent/tests/`. HTTP is mocked with `respx`; Supabase clients are faked (see existing `tests/test_core_table.py` for the fake-client pattern — reuse it, do **not** hit a live DB).
- **Migrations:** one file per task, `supabase/migrations/20260614000NNN_sprint6_1_<slug>.sql`. Every table carries `equipe_id uuid not null` and an RLS policy `equipe_id IN (SELECT equipe_id FROM profiles WHERE id = auth.uid())`. RPCs that the service-role agent calls are `SECURITY DEFINER` with `set search_path = public`.
- **Frontend gate:** `npm run build` is the real gate (tsc passing ≠ vite build passing). Run it before every frontend commit.
- **Guard layer is non-negotiable:** the agent uses `service_role` (RLS bypassed). Every query carries `WHERE equipe_id = <server-derived>`; `equipe_id` comes from the verified JWT (`app/security.py`), never from the model or client.
- **Commits:** frequent, one per task minimum. This repo is **not** a git repo on the PM's disk — engineers committing in their own worktrees should branch per task and deliver per the handoff protocol.
- **Feature flag:** the Workflow backbone ships behind `COPILOT_WORKFLOW_ENABLED` (default `false`). The legacy `run_cascade` stays until Wave 5 Evals reach parity, then the flag flips and legacy is removed.

---

## File Structure (created / modified this sprint)

**Backend — `python-agent/app/`**
- Create: `credits.py` — credit balance read + `charge_credits` RPC wrapper.
- Create: `metering.py` — Agno tool-hook that charges 1 credit + records ledger row with real metrics.
- Create: `cognition/__init__.py`, `cognition/router.py` — stakes → model-tier selection policy.
- Create: `cascade/executor.py` — sequential `ActionPlan` executor (credit-aware, streams events).
- Create: `cascade/enricher.py` — Contact Base Enricher agent + Lead Memory wiring.
- Create: `cascade/agno_workflow.py` — the Agno `Workflow` backbone (Steps + Router) behind the flag.
- Create: `knowledge.py` — per-tenant `PgVector` Knowledge factory (foundation).
- Create: `events.py` — run-event emitter (SSE buffer + `copilot_run_events` writer).
- Create: `routers/sweep.py` — `POST /sync/sweep` + `GET /sync/stream` (SSE).
- Create: `evals/` — Agno eval suites (accuracy/reliability/performance) + fixtures.
- Modify: `schemas.py` — add `ActionPlan`, `PlannedAction`, run-event models.
- Modify: `cascade/floor_doorman.py` — emit `ActionPlan` (multi-action) instead of single `IntentDecision`.
- Modify: `cascade/autonomous_team.py` — attach metering hook + reasoning-tier model from router.
- Modify: `skills/core_table.py` — mark high-stakes verbs `requires_confirmation`.
- Modify: `llm.py` — add `build_reasoning_model` / tier-aware construction.
- Modify: `config.py` — new settings (flag, strategic model defaults, knowledge embedder).
- Modify: `cascade/workflow.py` — delegate to `agno_workflow` when flag on (parity wrapper).
- Modify: `main.py` — mount sweep router + private AgentOS admin stub.

**Database — `supabase/migrations/`**
- `20260614000100_sprint6_1_credit_ledger.sql` — `agent_credits_balance`, `agent_action_ledger`, `charge_credits` RPC.
- `20260614000200_sprint6_1_router_config.sql` — extend `pipeline_agent_rules` (strategic tiering).
- `20260614000300_sprint6_1_run_events.sql` — `copilot_run_events` (+ Realtime publication).
- `20260614000400_sprint6_1_knowledge_pgvector.sql` — pgvector extension + per-tenant knowledge table (foundation).

**Frontend — `src/`**
- Create: `components/crm/copilot/SyncButton.tsx` — reusable ⚡ button (card/chat/header variants).
- Create: `components/crm/copilot/TelemetryHUD.tsx` — live streaming HUD modal.
- Create: `components/crm/copilot/CreditBalanceBadge.tsx` — header wallet widget.
- Create: `components/crm/copilot/CreditLedgerPanel.tsx` — transparency ledger table.
- Create: `hooks/useCopilotSync.ts` — SSE consumer for single sync.
- Create: `hooks/useCopilotSweep.ts` — sweep trigger + Realtime event consumer.
- Create: `hooks/useCopilotCredits.ts` — balance + ledger queries.
- Modify: `services/copilot.ts` — `sweep()`, `streamSync()`, credit/ledger fetchers.
- Modify: Kanban card component (card-face ⚡), inbox chat sidebar (⚡), pipeline header (sweep ⚡).

---

## Swarm Protocol (per `Planning/agent_workflow.md`)

- **PM:** Claude/Opus (this plan's author). Engineers: **codex, opus, sonnet, gemini, verboo (deepseek-v4-flash)**.
- **Tier → model routing (cost lever):** **S** → verboo · **M** → gemini · **L** → sonnet/codex · **XL** → opus/codex. Never run S/M on a premium model.
- **Plan approval before code:** L/XL engineers post a short plan (files + logic) and wait for PM approval; S/M proceed straight to branch if the spec is clear.
- **Branch isolation:** one branch per task, `<agent>/sprint6.1/<epic>/<short-desc>` (e.g. `codex/sprint6.1/epicA/credit-rpc`). Edit **only** your owned files; flag out-of-scope problems to the PM, never refactor them.
- **Completion gates (all five) + structured HANDOFF block** required — see `agent_workflow.md` §6. Tick `[x]` in this plan, add a row to `Planning/billing.md` (date · sprint · task · agent/model · tier), all on your branch.
- **PM never checks `main`** — I check out your branch, diff `main...<branch> --stat`, run your tests, verify files/billing/DoD, then merge and announce `WAVE <N> MERGED`.

## Task Assignment & Tiering Matrix

> **File-ownership rule enforced:** within a wave, no two parallel tasks touch the same file. Where two tasks must share a file (e.g. `services/copilot.ts`, `PipelineWorkspace.tsx`), they are **sequenced** (`→`), not parallelized.

### Wave 1 — Foundations
| Task | Tier | Engineer | Owns (created/modified) | Depends |
| :-- | :-- | :-- | :-- | :-- |
| **A1** Credit ledger + atomic `charge_credits` RPC | **XL** | **codex** | `migrations/20260614000100_sprint6_1_credit_ledger.sql` | — |
| **A2** `credits.py` wrapper | **M** | **gemini** | `app/credits.py`, `tests/test_credits.py` | A1 (logical) |
| **A3** Metering tool-hook | **L** | **codex** | `app/metering.py`, `tests/test_metering.py` | — |
| **C1** Router config migration | **S** | **verboo** | `migrations/20260614000200_sprint6_1_router_config.sql` | — |
| **C2** `cognition/router.py` policy | **L** | **sonnet** | `app/cognition/__init__.py`, `app/cognition/router.py`, `tests/test_router.py`, `app/config.py` | — |
| **C3** `build_reasoning_model` | **M** | **gemini** | `app/llm.py`, `tests/test_llm.py` | — |
| **W0.1** Agno Workflow parity shell + flag | **XL** | **opus** | `app/cascade/agno_workflow.py`, `app/cascade/workflow.py`, `app/routers/sync.py`, `tests/test_agno_workflow.py` | C2 (flag in config) |

*Parallel-safe: A1‖A2‖A3‖C1‖C2‖C3‖W0.1 (all own distinct files; `config.py` is C2-only this wave).*

### Wave 2 — Intelligence (needs A, C, W0)
| Task | Tier | Engineer | Owns | Depends |
| :-- | :-- | :-- | :-- | :-- |
| **B1** `ActionPlan`/`PlannedAction` schema | **M** | **verboo** | `app/schemas.py`, `tests/test_schemas.py` | — (lands first) |
| **B2** Floor emits `ActionPlan` | **L** | **sonnet** | `app/cascade/floor_doorman.py`, `tests/test_floor_doorman.py` | B1 |
| **B3** Sequential credit-aware executor | **XL** | **codex** | `app/cascade/executor.py`, `tests/test_executor.py` | B1, A2/A3 |
| **B4** Enricher + Lead Memory | **L** | **sonnet** | `app/cascade/enricher.py`, `tests/test_enricher.py` | B1 |
| **B5** HITL verbs + Workflow assembly | **XL** | **opus** | `app/skills/core_table.py`, `app/cascade/agno_workflow.py`, `app/audit.py`, `tests/*` | B2,B3,B4,C2,W0.1 |

*Order: B1 → (B2 ‖ B3 ‖ B4) → B5. B5 is the only Wave-2 task that re-opens `agno_workflow.py`.*

### Wave 3 — Surfaces & Foundation (D needs B; G independent)
| Task | Tier | Engineer | Owns | Depends |
| :-- | :-- | :-- | :-- | :-- |
| **D1** `copilot_run_events` + Realtime migration | **S** | **verboo** | `migrations/20260614000300_sprint6_1_run_events.sql` | — |
| **D2** `events.py` RunEmitter | **M** | **gemini** | `app/events.py`, `tests/test_events.py` | D1 |
| **D3** `/sync/stream` SSE + `/sync/sweep` | **L** | **sonnet** | `app/routers/sweep.py`, `app/main.py`, `tests/test_sweep_router.py` | D2, B5 |
| **D4** SSE hook + `TelemetryHUD` | **L** | **sonnet** | `src/hooks/useCopilotSync.ts`, `src/components/crm/copilot/TelemetryHUD.tsx`, `src/services/copilot.ts` | D3 |
| **D5** Sweep hook (Realtime) | **M** | **sonnet** | `src/hooks/useCopilotSweep.ts`, `src/services/copilot.ts` | **D4** (shares `copilot.ts`) |
| **G1** pgvector + knowledge table | **S** | **verboo** | `migrations/20260614000400_sprint6_1_knowledge_pgvector.sql` | — |
| **G2** `knowledge.py` PgVector factory | **M** | **gemini** | `app/knowledge.py`, `tests/test_knowledge.py` | G1 |
| **G3** Messaging I/O contract doc | **M** | **opus** | `python-agent/docs/INBOUND_AGENT_CONTRACT.md` | — |

*`services/copilot.ts` is shared by D4→D5 (sequenced, both sonnet). `main.py` is D3-only this wave.*

### Wave 4 — UX (E needs D; F needs A)
| Task | Tier | Engineer | Owns | Depends |
| :-- | :-- | :-- | :-- | :-- |
| **E1** Reusable `SyncButton` | **M** | **gemini** | `src/components/crm/copilot/SyncButton.tsx` | D4,D5 |
| **E2** On-card ⚡ mount | **M** | **sonnet** | `src/components/crm/PipelineWorkspace.tsx` | E1 |
| **E3** Chat-sidebar ⚡ mount | **M** | **gemini** | `src/components/inbox/ChatInput.tsx` | E1 |
| **E4** Header sweep ⚡ mount | **M** | **sonnet** | `src/components/crm/PipelineWorkspace.tsx` | **E2** (shares file) |
| **F1** Credit hooks | **M** | **gemini** | `src/hooks/useCopilotCredits.ts`, `src/services/copilot.ts` | A1 |
| **F2** Balance badge | **S** | **verboo** | `src/components/crm/copilot/CreditBalanceBadge.tsx`, app header/layout file | F1 |
| **F3** Transparency ledger panel | **M** | **gemini** | `src/components/crm/copilot/CreditLedgerPanel.tsx`, `src/pages/Billing.tsx` | F1 |

*`PipelineWorkspace.tsx` shared by E2→E4 (sequenced, both sonnet). `services/copilot.ts` is F1-only this wave. E1 lands before E2/E3/E4.*

### Wave 5 — Trust & Ship
| Task | Tier | Engineer | Owns | Depends |
| :-- | :-- | :-- | :-- | :-- |
| **H1a** Eval fixtures | **S** | **verboo** | `python-agent/evals/__init__.py`, `python-agent/evals/fixtures.py` | — |
| **H1b** Accuracy + reliability eval suites | **L** | **codex** | `python-agent/evals/test_eval_doorman_accuracy.py`, `python-agent/evals/test_eval_reliability.py` | H1a, B5 |
| **H2** Private AgentOS admin stub | **L** | **codex** | `app/main.py`, `tests/test_main.py` | D3 (main.py merged) |
| **H3** CI gates | **M** | **gemini** | CI workflow / `Makefile` | — |
| **H4** Workflow flag cutover (parity-gated) | **XL** | **opus** | `app/config.py`, Dokploy env | H1b |
| **H5** Dokploy deploy + prod verification | **infra** | **Mateus (Human Orchestrator)** | Dokploy env vars, remote DB migrations | all |

*`main.py`: D3 (Wave 3) and H2 (Wave 5) — different waves, sequential, safe.*

## Wave Map (dependency-ordered; `‖` = parallel · `→` = sequenced)

- **Wave 1:** A1‖A2‖A3‖C1‖C2‖C3‖W0.1
- **Wave 2:** B1 → (B2‖B3‖B4) → B5
- **Wave 3:** (D1→D2→D3→D4→D5) ‖ (G1→G2) ‖ G3
- **Wave 4:** (E1 → (E2‖E3) → E4) ‖ (F1 → (F2‖F3))
- **Wave 5:** (H1a→H1b)‖H2‖H3 → H4 → H5

---

# WAVE 1 — Foundations

## EPIC A — Credit Ledger & Auto-Metering *(codex A1/A3 security-critical · gemini A2)*

### Task A1: Credit ledger schema + atomic `charge_credits` RPC

**Files:**
- Create: `supabase/migrations/20260614000100_sprint6_1_credit_ledger.sql`
- Test: `supabase/migrations/tests/test_credit_ledger.sql` (pgTAP-style assertions run via `supabase db` or psql; if no pgTAP harness exists, deliver the verification queries in the PR description and run them against a local `supabase db reset`).

- [ ] **Step 1: Write the migration**

```sql
-- 20260614000100_sprint6_1_credit_ledger.sql
-- Copilot credit wallet (SEPARATE from GPT-Maker/Asaas credits) + action ledger.

create table if not exists public.agent_credits_balance (
  equipe_id  uuid primary key references public.equipes(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_action_ledger (
  id                 uuid primary key default gen_random_uuid(),
  equipe_id          uuid not null references public.equipes(id) on delete cascade,
  opportunity_id     uuid,
  lead_id            uuid,
  decision_id        uuid,
  verb               text not null,
  credits_charged    integer not null default 1,
  model              text,
  real_input_tokens  integer,
  real_output_tokens integer,
  real_cost_usd      numeric(12,6),
  mode               text not null check (mode in ('auto','manual')),
  idempotency_key    text not null,
  created_at         timestamptz not null default now(),
  unique (equipe_id, idempotency_key)
);

create index if not exists idx_action_ledger_equipe_created
  on public.agent_action_ledger (equipe_id, created_at desc);

alter table public.agent_credits_balance enable row level security;
alter table public.agent_action_ledger  enable row level security;

create policy agent_credits_balance_tenant on public.agent_credits_balance
  for select using (equipe_id in (select equipe_id from public.profiles where id = auth.uid()));
create policy agent_action_ledger_tenant on public.agent_action_ledger
  for select using (equipe_id in (select equipe_id from public.profiles where id = auth.uid()));

-- Atomic, idempotent, charge-on-success-only debit + ledger insert.
-- Returns the inserted ledger id, OR the EXISTING id on idempotency-key replay,
-- OR raises 'insufficient_credits' when the balance cannot cover p_credits.
create or replace function public.charge_credits(
  p_equipe_id       uuid,
  p_credits         integer,
  p_idempotency_key text,
  p_ledger          jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_balance  integer;
  v_id       uuid;
begin
  -- Idempotent replay: if this key already charged, return the prior row, no double-debit.
  select id into v_existing
    from public.agent_action_ledger
   where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Lock the wallet row to serialize concurrent sweep charges.
  select balance into v_balance
    from public.agent_credits_balance
   where equipe_id = p_equipe_id
   for update;

  if v_balance is null then
    raise exception 'no_wallet' using errcode = 'P0002';
  end if;
  if v_balance < p_credits then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.agent_credits_balance
     set balance = balance - p_credits, updated_at = now()
   where equipe_id = p_equipe_id;

  insert into public.agent_action_ledger (
    equipe_id, opportunity_id, lead_id, decision_id, verb, credits_charged,
    model, real_input_tokens, real_output_tokens, real_cost_usd, mode, idempotency_key
  ) values (
    p_equipe_id,
    nullif(p_ledger->>'opportunity_id','')::uuid,
    nullif(p_ledger->>'lead_id','')::uuid,
    nullif(p_ledger->>'decision_id','')::uuid,
    p_ledger->>'verb',
    p_credits,
    p_ledger->>'model',
    nullif(p_ledger->>'real_input_tokens','')::int,
    nullif(p_ledger->>'real_output_tokens','')::int,
    nullif(p_ledger->>'real_cost_usd','')::numeric,
    coalesce(p_ledger->>'mode','manual'),
    p_idempotency_key
  ) returning id into v_id;

  return v_id;
end;
$$;
```

- [ ] **Step 2: Apply locally and verify**

Run: `cd saas-salesengine-v1.0 && supabase db reset` (or apply the single migration against your local shadow DB).
Expected: migration applies cleanly; `\d public.agent_action_ledger` shows the UNIQUE `(equipe_id, idempotency_key)`.

- [ ] **Step 3: Verify the three behaviors with SQL**

Run these against a local DB seeded with one equipe + a wallet of 5 credits:
```sql
-- a) happy path debits and inserts
select public.charge_credits('<equipe>', 1, 'k1', '{"verb":"move_stage","mode":"manual"}');
select balance from public.agent_credits_balance where equipe_id='<equipe>'; -- expect 4
-- b) idempotent replay does NOT double-charge
select public.charge_credits('<equipe>', 1, 'k1', '{"verb":"move_stage","mode":"manual"}');
select balance from public.agent_credits_balance where equipe_id='<equipe>'; -- still 4
-- c) insufficient credits raises
select public.charge_credits('<equipe>', 99, 'k2', '{"verb":"x","mode":"manual"}'); -- ERROR insufficient_credits
```
Expected: balance 4 after (a) and (b); (c) raises `insufficient_credits`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260614000100_sprint6_1_credit_ledger.sql
git commit -m "feat(copilot): credit wallet + atomic idempotent charge_credits RPC"
```

---

### Task A2: `credits.py` — RPC wrapper + balance read

**Files:**
- Create: `python-agent/app/credits.py`
- Test: `python-agent/tests/test_credits.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_credits.py
import pytest
from app.credits import charge_credit, InsufficientCredits, get_balance


class _FakeRPC:
    def __init__(self, result=None, error=None):
        self._result = result
        self._error = error
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return self

    def execute(self):
        if self._error:
            raise RuntimeError(self._error)
        class _R:  # mimic supabase response
            data = self._result
            error = None
        return _R()


@pytest.mark.asyncio
async def test_charge_credit_returns_ledger_id():
    client = _FakeRPC(result="ledger-123")
    ledger_id = await charge_credit(
        client, equipe_id="e1", idempotency_key="k1",
        ledger={"verb": "move_stage", "mode": "manual"},
    )
    assert ledger_id == "ledger-123"
    name, params = client.calls[0]
    assert name == "charge_credits"
    assert params["p_equipe_id"] == "e1"
    assert params["p_credits"] == 1
    assert params["p_idempotency_key"] == "k1"


@pytest.mark.asyncio
async def test_insufficient_credits_raises_typed_error():
    client = _FakeRPC(error="insufficient_credits")
    with pytest.raises(InsufficientCredits):
        await charge_credit(client, equipe_id="e1", idempotency_key="k2", ledger={"verb": "x"})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_credits.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.credits'`.

- [ ] **Step 3: Write the implementation**

```python
# app/credits.py
"""Copilot credit metering — thin wrapper over the charge_credits RPC."""
from __future__ import annotations

import asyncio
from typing import Any


class InsufficientCredits(Exception):
    """Raised when the wallet cannot cover the requested charge."""


async def charge_credit(
    client: Any,
    *,
    equipe_id: str,
    idempotency_key: str,
    ledger: dict[str, Any],
    credits: int = 1,
) -> str:
    """Charge `credits` (default 1) atomically; return the ledger row id.

    Raises InsufficientCredits when the balance is too low. Idempotent on
    `idempotency_key` — a replay returns the original ledger id without re-debiting.
    """
    def _call() -> Any:
        resp = client.rpc(
            "charge_credits",
            {
                "p_equipe_id": equipe_id,
                "p_credits": credits,
                "p_idempotency_key": idempotency_key,
                "p_ledger": ledger,
            },
        ).execute()
        error = getattr(resp, "error", None)
        if error:
            raise RuntimeError(str(error))
        return getattr(resp, "data", None)

    try:
        return await asyncio.to_thread(_call)
    except RuntimeError as exc:
        if "insufficient_credits" in str(exc) or "no_wallet" in str(exc):
            raise InsufficientCredits(str(exc)) from exc
        raise


async def get_balance(client: Any, *, equipe_id: str) -> int:
    """Return the current wallet balance (0 if no wallet row exists)."""
    def _call() -> Any:
        resp = (
            client.table("agent_credits_balance")
            .select("balance")
            .eq("equipe_id", equipe_id)
            .limit(1)
            .execute()
        )
        return getattr(resp, "data", None)

    data = await asyncio.to_thread(_call)
    if not data:
        return 0
    row = data[0] if isinstance(data, list) else data
    return int(row.get("balance", 0))
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd python-agent && python -m pytest tests/test_credits.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add python-agent/app/credits.py python-agent/tests/test_credits.py
git commit -m "feat(copilot): credits.py charge_credit/get_balance wrapper"
```

---

### Task A3: Metering tool-hook (charge + real-metrics capture)

**Files:**
- Create: `python-agent/app/metering.py`
- Test: `python-agent/tests/test_metering.py`

**Contract:** Agno tool hooks have signature `hook(function_name, func, args)` and must call `func(**args)`.
The metering hook wraps a Core-Table verb call: it runs the verb, and **only when the returned
`ActionResult.success is True`** charges 1 credit via `charge_credit`, building a deterministic
idempotency key from `equipe_id + verb + opportunity/lead id + a per-run nonce`. A failed verb is never charged.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_metering.py
import pytest
from app.schemas import ActionResult
from app.metering import make_metering_hook


class _Recorder:
    def __init__(self): self.charges = []
    async def charge(self, **kw): self.charges.append(kw); return "ledger-1"


@pytest.mark.asyncio
async def test_hook_charges_only_on_success():
    rec = _Recorder()
    hook = make_metering_hook(
        equipe_id="e1", mode="manual", run_id="r1",
        context={"opportunity_id": "o1"}, charge_fn=rec.charge, model="deepseek-v4-flash",
    )

    async def ok_verb(**kw): return ActionResult(success=True, detail={"action": "move_stage"})
    res = await hook("move_stage", ok_verb, {"opportunity_id": "o1"})
    assert res.success is True
    assert len(rec.charges) == 1
    assert rec.charges[0]["ledger"]["verb"] == "move_stage"
    assert rec.charges[0]["ledger"]["model"] == "deepseek-v4-flash"
    assert rec.charges[0]["idempotency_key"].startswith("r1:move_stage:")


@pytest.mark.asyncio
async def test_hook_does_not_charge_on_failure():
    rec = _Recorder()
    hook = make_metering_hook(equipe_id="e1", mode="auto", run_id="r1", context={}, charge_fn=rec.charge)

    async def bad_verb(**kw): return ActionResult(success=False, error="boom")
    res = await hook("set_field", bad_verb, {})
    assert res.success is False
    assert rec.charges == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_metering.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.metering'`.

- [ ] **Step 3: Write the implementation**

```python
# app/metering.py
"""Agno tool-hook that meters successful Core-Table verbs into the credit ledger.

Hook signature follows Agno: hook(function_name, func, args) -> result, and MUST
call func(**args). We charge exactly 1 credit per SUCCESSFUL structural action.
"""
from __future__ import annotations

import inspect
from typing import Any, Awaitable, Callable

from app.schemas import ActionResult

ChargeFn = Callable[..., Awaitable[str]]


def make_metering_hook(
    *,
    equipe_id: str,
    mode: str,
    run_id: str,
    context: dict[str, Any],
    charge_fn: ChargeFn,
    model: str | None = None,
):
    """Build a tenant/run-scoped async metering hook."""
    seq = {"n": 0}

    async def hook(function_name: str, func: Callable[..., Any], args: dict[str, Any]):
        result = func(**args)
        if inspect.isawaitable(result):
            result = await result

        success = isinstance(result, ActionResult) and result.success
        if success:
            seq["n"] += 1
            opp = args.get("opportunity_id") or context.get("opportunity_id") or ""
            lead = args.get("lead_id") or context.get("lead_id") or ""
            idem = f"{run_id}:{function_name}:{opp or lead}:{seq['n']}"
            try:
                await charge_fn(
                    equipe_id=equipe_id,
                    idempotency_key=idem,
                    ledger={
                        "verb": function_name,
                        "opportunity_id": opp,
                        "lead_id": lead,
                        "decision_id": context.get("decision_id", ""),
                        "model": model or "",
                        "mode": mode,
                    },
                )
            except Exception as exc:  # never let metering crash an applied action
                if isinstance(result, ActionResult):
                    result.detail = {**(result.detail or {}), "metering_error": str(exc)}
        return result

    return hook
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd python-agent && python -m pytest tests/test_metering.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add python-agent/app/metering.py python-agent/tests/test_metering.py
git commit -m "feat(copilot): metering tool-hook (charge 1 credit on successful verb)"
```

> **Note for A4 (integration, done as part of Wave 2 B3/executor):** the executor and `autonomous_team`
> build the hook via `make_metering_hook(..., charge_fn=lambda **kw: charge_credit(client, **kw))` and pass
> it as `tool_hooks=[hook]` on the Agno `Agent`, and the deterministic executor calls it directly around
> each verb. Real token/cost (`real_input_tokens`/`real_output_tokens`/`real_cost_usd`) is filled from the
> Agno `RunOutput.metrics` after the agent run (see B3 Step "enrich ledger with metrics").

---

## EPIC C — Cost-Tiered Cognition Router *(verboo C1 · sonnet C2 · gemini C3)*

### Task C1: Router config migration (strategic tiering on `pipeline_agent_rules`)

**Files:**
- Create: `supabase/migrations/20260614000200_sprint6_1_router_config.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260614000200_sprint6_1_router_config.sql
alter table public.pipeline_agent_rules
  add column if not exists strategic_model               text,
  add column if not exists escalate_threshold            numeric(3,2) default 0.60,
  add column if not exists deal_value_strategic_threshold numeric(14,2);
-- strategic_model NULL → fall back to Settings.shaper/worker strategic default.
-- escalate_threshold: when a cheap-tier decision's confidence is below this AND the
--   branch is high-stakes, the router re-runs the leaf on strategic_model.
-- deal_value_strategic_threshold NULL → value alone never forces the strategic tier.
```

- [ ] **Step 2: Apply & verify**

Run: `cd saas-salesengine-v1.0 && supabase db reset`
Expected: columns present in `\d public.pipeline_agent_rules`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260614000200_sprint6_1_router_config.sql
git commit -m "feat(copilot): pipeline_agent_rules strategic-tier router config"
```

---

### Task C2: `cognition/router.py` — stakes → model-tier policy

**Files:**
- Create: `python-agent/app/cognition/__init__.py` (empty)
- Create: `python-agent/app/cognition/router.py`
- Test: `python-agent/tests/test_router.py`

**Contract:** `select_tier(stakes) -> Tier` and `select_model(stakes, rules, settings) -> str`.
`Tier` is `"cheap" | "strategic"`. The decision is strategic when ANY of:
(1) `stakes.stage_type in {"won","lost"}`, (2) `stakes.deal_value` ≥ `rules.deal_value_strategic_threshold`
(when set), (3) `stakes.cheap_confidence` is not None and `< rules.escalate_threshold`. Otherwise cheap.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_router.py
from app.cognition.router import Stakes, select_tier, select_model


def _rules(**kw):
    base = {"escalate_threshold": 0.60, "deal_value_strategic_threshold": None,
            "strategic_model": None, "doorman_model": None}
    base.update(kw); return base


def test_won_lost_is_strategic():
    assert select_tier(Stakes(stage_type="won")) == "strategic"
    assert select_tier(Stakes(stage_type="lost")) == "strategic"


def test_open_low_value_high_confidence_is_cheap():
    assert select_tier(Stakes(stage_type="open", deal_value=10, cheap_confidence=0.9)) == "cheap"


def test_low_cheap_confidence_escalates():
    s = Stakes(stage_type="open", cheap_confidence=0.4)
    assert select_tier(s, escalate_threshold=0.60) == "strategic"


def test_high_deal_value_escalates():
    s = Stakes(stage_type="open", deal_value=100000, cheap_confidence=0.95)
    assert select_tier(s, deal_value_strategic_threshold=50000) == "strategic"


def test_select_model_uses_rules_then_settings():
    class S: doorman_model = "deepseek-v4-flash"; worker_model = "gpt-4o"; strategic_model = "o4-mini"
    cheap = select_model(Stakes(stage_type="open", cheap_confidence=0.9), _rules(), S())
    strat = select_model(Stakes(stage_type="won"), _rules(strategic_model="o4-reasoning"), S())
    assert cheap == "deepseek-v4-flash"
    assert strat == "o4-reasoning"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_router.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.cognition.router'`.

- [ ] **Step 3: Write the implementation**

```python
# app/cognition/router.py
"""Cost-tiered cognition router: pick the cheapest model that the stakes allow.

Tier 0 (heuristic prefilter) lives in worker.is_pipeline_relevant — free, no model.
This module decides between the CHEAP tier (verboo doormen) and the STRATEGIC tier
(reasoning model) for a given decision leaf.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Tier = Literal["cheap", "strategic"]


@dataclass(frozen=True)
class Stakes:
    stage_type: str = "open"            # open | won | lost
    deal_value: float | None = None
    cheap_confidence: float | None = None  # the cheap tier's own confidence, if already run


def select_tier(
    stakes: Stakes,
    *,
    escalate_threshold: float = 0.60,
    deal_value_strategic_threshold: float | None = None,
) -> Tier:
    if stakes.stage_type in {"won", "lost"}:
        return "strategic"
    if (
        deal_value_strategic_threshold is not None
        and stakes.deal_value is not None
        and stakes.deal_value >= deal_value_strategic_threshold
    ):
        return "strategic"
    if stakes.cheap_confidence is not None and stakes.cheap_confidence < escalate_threshold:
        return "strategic"
    return "cheap"


def _rule(rules: Any, key: str, default: Any = None) -> Any:
    if isinstance(rules, dict):
        return rules.get(key, default)
    return getattr(rules, key, default)


def select_model(stakes: Stakes, rules: Any, settings: Any) -> str:
    """Resolve the concrete model id for the chosen tier (per-pipeline override → settings)."""
    tier = select_tier(
        stakes,
        escalate_threshold=float(_rule(rules, "escalate_threshold", 0.60) or 0.60),
        deal_value_strategic_threshold=_rule(rules, "deal_value_strategic_threshold"),
    )
    if tier == "strategic":
        return (
            _rule(rules, "strategic_model")
            or getattr(settings, "strategic_model", None)
            or getattr(settings, "worker_model")
        )
    return _rule(rules, "doorman_model") or getattr(settings, "doorman_model")
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd python-agent && python -m pytest tests/test_router.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Add `strategic_model` to Settings**

In `python-agent/app/config.py`, add below `shaper_model`:
```python
    strategic_model: str = "o4-mini"  # reasoning tier; override per-pipeline via rules.strategic_model
    copilot_workflow_enabled: bool = False  # Wave-1 keystone flag (see W0)
```

- [ ] **Step 6: Run config test + commit**

Run: `cd python-agent && python -m pytest tests/test_config.py tests/test_router.py -v`
Expected: PASS.
```bash
git add python-agent/app/cognition python-agent/tests/test_router.py python-agent/app/config.py
git commit -m "feat(copilot): cost-tiered cognition router (cheap vs strategic)"
```

---

### Task C3: `build_reasoning_model` in `llm.py`

**Files:**
- Modify: `python-agent/app/llm.py`
- Test: `python-agent/tests/test_llm.py` (add cases)

- [ ] **Step 1: Write the failing test (append to tests/test_llm.py)**

```python
def test_build_reasoning_model_sets_reasoning_flag(monkeypatch):
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    from app.llm import build_reasoning_model
    model = build_reasoning_model("o4-mini")
    assert model.id == "o4-mini"
    # reasoning tier requests reasoning effort where the provider supports it
    assert getattr(model, "reasoning_effort", None) in {"medium", "high", None}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_llm.py::test_build_reasoning_model_sets_reasoning_flag -v`
Expected: FAIL with `ImportError: cannot import name 'build_reasoning_model'`.

- [ ] **Step 3: Implement (append to app/llm.py)**

```python
def build_reasoning_model(model_id: str, *, effort: str = "medium") -> OpenAIChat:
    """Strategic tier model. On real OpenAI reasoning models we pass reasoning_effort;
    on OpenAI-compatible routers (Verboo) we degrade to a plain chat model so the call
    never 400s on an unknown param."""
    model = build_chat_model(model_id)
    if not os.getenv("LLM_BASE_URL"):  # only native OpenAI honors reasoning_effort
        try:
            model.reasoning_effort = effort
        except Exception:
            pass
    return model
```

- [ ] **Step 4: Run to verify it passes + commit**

Run: `cd python-agent && python -m pytest tests/test_llm.py -v`
Expected: PASS.
```bash
git add python-agent/app/llm.py python-agent/tests/test_llm.py
git commit -m "feat(copilot): build_reasoning_model for the strategic tier"
```

---

## W0 — Agno Workflow Skeleton + Feature Flag *(opus — XL keystone)*

### Task W0.1: Workflow backbone that wraps existing steps (parity-first)

**Files:**
- Create: `python-agent/app/cascade/agno_workflow.py`
- Modify: `python-agent/app/cascade/workflow.py` (delegate when flag on)
- Test: `python-agent/tests/test_agno_workflow.py`

**Intent:** Build the Agno `Workflow` shell now, wired to call the SAME doorman/worker functions the
legacy cascade uses, so behavior is identical. Cost-router, multi-action, and memory are slotted into this
shell in Wave 2. The legacy `run_cascade` remains the default until Wave 5 cutover.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_agno_workflow.py
import pytest
from app.security import TenantContext


@pytest.mark.asyncio
async def test_workflow_runs_same_outcome_as_legacy(monkeypatch):
    # The Workflow path must return the legacy cascade dict shape.
    from app.cascade import agno_workflow

    async def fake_legacy(**kwargs):
        return {"status": "executed", "decision_id": "d1", "result": None}
    monkeypatch.setattr(agno_workflow, "_legacy_run_cascade", fake_legacy)

    ctx = TenantContext(equipe_id="e1", actor_user_id="u1")
    out = await agno_workflow.run_workflow(
        ctx=ctx, lead_id="l1", opportunity_id=None, pipeline_id=None, trigger="sync",
    )
    assert out["status"] == "executed"
    assert "decision_id" in out
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_agno_workflow.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.cascade.agno_workflow'`.

- [ ] **Step 3: Implement the skeleton**

```python
# app/cascade/agno_workflow.py
"""Agno Workflow backbone (keystone). Wave-1: a parity shell delegating to the
legacy cascade so we can flip COPILOT_WORKFLOW_ENABLED with zero behavior change.
Wave-2 replaces the body with declarative Steps + the cost Router."""
from __future__ import annotations

from typing import Any

from app.security import TenantContext


async def _legacy_run_cascade(**kwargs: Any) -> dict:
    from app.cascade.workflow import run_cascade  # imported lazily to avoid cycles
    return await run_cascade(**kwargs)


async def run_workflow(
    *,
    ctx: TenantContext,
    lead_id: str,
    opportunity_id: str | None,
    pipeline_id: str | None,
    trigger: str,
    client: Any = None,
    emit: Any = None,  # Wave-3 event sink; ignored in the parity shell
) -> dict:
    """Run the cascade via the Workflow path. Parity shell for now."""
    return await _legacy_run_cascade(
        ctx=ctx, lead_id=lead_id, opportunity_id=opportunity_id,
        pipeline_id=pipeline_id, trigger=trigger, client=client,
    )
```

- [ ] **Step 4: Add the flag dispatch in `routers/sync.py`**

Modify `sync_lead` to choose the path:
```python
    from app.config import get_settings
    if get_settings().copilot_workflow_enabled:
        from app.cascade.agno_workflow import run_workflow
        return await run_workflow(ctx=ctx, lead_id=body.lead_id,
            opportunity_id=body.opportunity_id, pipeline_id=body.pipeline_id, trigger="sync")
    return await run_cascade(ctx=ctx, lead_id=body.lead_id,
        opportunity_id=body.opportunity_id, pipeline_id=body.pipeline_id, trigger="sync")
```

- [ ] **Step 5: Run tests + commit**

Run: `cd python-agent && python -m pytest tests/test_agno_workflow.py tests/test_sync_router.py -v`
Expected: PASS.
```bash
git add python-agent/app/cascade/agno_workflow.py python-agent/app/routers/sync.py python-agent/tests/test_agno_workflow.py
git commit -m "feat(copilot): Agno Workflow parity shell behind COPILOT_WORKFLOW_ENABLED"
```

**Wave 1 checkpoint:** credits + metering hook + cost router + reasoning model + workflow flag all green and independently committed. Nothing user-visible changed yet (flag off).

---

# WAVE 2 — Intelligence (EPIC B) *(verboo B1 · sonnet B2/B4 · codex B3 · opus B5)*

> Depends on Wave 1 (A, C, W0). All work here is slotted into the Workflow shell and remains behind the flag.

### Task B1: `ActionPlan` / `PlannedAction` schemas

**Files:**
- Modify: `python-agent/app/schemas.py`
- Test: `python-agent/tests/test_schemas.py` (append)

- [ ] **Step 1: Write the failing test (append)**

```python
def test_action_plan_orders_and_defaults():
    from app.schemas import ActionPlan, PlannedAction
    plan = ActionPlan(
        relevant=True,
        actions=[
            PlannedAction(verb="set_field", args={"field_id": "f1", "value": "12kWp"}),
            PlannedAction(verb="move_stage", args={"stage_type": "open"}, requires_confirmation=True),
        ],
        confidence=0.82, reason="enrich then advance",
    )
    assert len(plan.actions) == 2
    assert plan.actions[1].requires_confirmation is True
    assert plan.actions[0].requires_confirmation is False


def test_action_plan_empty_is_valid_noop():
    from app.schemas import ActionPlan
    plan = ActionPlan(relevant=False, actions=[], confidence=0.0, reason="nothing to do")
    assert plan.actions == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_schemas.py -k action_plan -v`
Expected: FAIL with `ImportError: cannot import name 'ActionPlan'`.

- [ ] **Step 3: Implement (append to app/schemas.py)**

```python
class PlannedAction(BaseModel):
    verb: str                                   # a CoreTableSkill method name
    args: dict[str, Any] = Field(default_factory=dict)
    requires_confirmation: bool = False         # high-stakes → HITL gate
    skill: str = "core_table"

    _coerce_args = field_validator("args", mode="before")(_none_to_empty_dict)


class ActionPlan(BaseModel):
    """A Floor-doorman output: an ORDERED list of actions for one pulse."""
    relevant: bool
    actions: list[PlannedAction] = Field(default_factory=list)
    automation_kind: Literal["none", "deterministic", "agentic"] = "deterministic"
    urgency: Literal["normal", "urgent"] = "normal"
    confidence: float = Field(ge=0, le=1)
    reason: str
```

- [ ] **Step 4: Run to verify it passes + commit**

Run: `cd python-agent && python -m pytest tests/test_schemas.py -v`
Expected: PASS.
```bash
git add python-agent/app/schemas.py python-agent/tests/test_schemas.py
git commit -m "feat(copilot): ActionPlan/PlannedAction multi-action schema"
```

---

### Task B2: Floor doorman emits an `ActionPlan`

**Files:**
- Modify: `python-agent/app/cascade/floor_doorman.py`
- Test: `python-agent/tests/test_floor_doorman.py` (add multi-action case)

**Intent:** Replace the single-`IntentDecision` `output_schema` with `ActionPlan`, keeping a
back-compat shim `triage_intent` that wraps the first action as an `IntentDecision` so the legacy
cascade still works until cutover. Add `triage_plan(...) -> ActionPlan`.

- [ ] **Step 1: Write the failing test (append)**

```python
@pytest.mark.asyncio
async def test_triage_plan_returns_actionplan(monkeypatch):
    from app.cascade import floor_doorman
    from app.schemas import ActionPlan, PlannedAction

    async def fake_run(agent, message):  # patch the Agno run boundary
        return type("R", (), {"content": ActionPlan(
            relevant=True,
            actions=[PlannedAction(verb="set_field", args={"field_id": "f1", "value": "x"})],
            confidence=0.8, reason="ok")})()
    monkeypatch.setattr(floor_doorman, "_arun_agent", fake_run)

    plan = await floor_doorman.triage_plan(
        ctx=_ctx(), conversation="oi", opportunity={"id": "o1", "pipeline_id": "p1", "stage_id": "s1"},
        pipeline_rules={}, model_id="deepseek-v4-flash",
    )
    assert isinstance(plan, ActionPlan)
    assert plan.actions[0].verb == "set_field"
```

(Reuse the existing test file's `_ctx()` helper / Agno-run patch point. If the current code calls
`agent.arun` inline, refactor it to a module-level `_arun_agent(agent, message)` seam first — see
[[agno-agent-api-and-mock-blindspot]]: assert against the real Agno API, not only mocks.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_floor_doorman.py -k triage_plan -v`
Expected: FAIL (`triage_plan` undefined).

- [ ] **Step 3: Implement** — add `triage_plan` building an Agno `Agent(output_schema=ActionPlan, ...)` via `build_chat_model(model_id)`, mirroring the existing `triage_intent` construction (system_message in PT, `use_json_mode=True` for Verboo). Keep `triage_intent` delegating to `triage_plan` and collapsing to the first action for back-compat.

- [ ] **Step 4: Run to verify it passes + commit**

Run: `cd python-agent && python -m pytest tests/test_floor_doorman.py -v`
Expected: PASS.
```bash
git add python-agent/app/cascade/floor_doorman.py python-agent/tests/test_floor_doorman.py
git commit -m "feat(copilot): Floor doorman emits multi-action ActionPlan"
```

---

### Task B3: Sequential credit-aware executor

**Files:**
- Create: `python-agent/app/cascade/executor.py`
- Test: `python-agent/tests/test_executor.py`

**Contract:** `run_plan(plan, *, ctx, opportunity, lead, rules, client, charge_fn, emit=None) -> ExecResult`.
Iterates actions **in order**. For each non-confirmation action: dispatch the Core-Table verb, and on
success charge 1 credit (via the metering hook semantics). Stops early on `InsufficientCredits` (records a
`halted_no_credits` outcome). Actions with `requires_confirmation=True` are **not executed** here — they are
returned as `pending_confirmations` for the HITL path (B5). Emits a run-event per step when `emit` is given.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_executor.py
import pytest
from app.schemas import ActionPlan, PlannedAction, ActionResult
from app.credits import InsufficientCredits
from app.cascade.executor import run_plan


class _Skill:
    name = "core_table"
    def __init__(self, **kw): self.applied = []
    async def set_field(self, opportunity_id, field_id, value):
        self.applied.append(("set_field", field_id)); return ActionResult(success=True, detail={})
    async def move_stage(self, opportunity_id, stage_type="open", stage_name_hint=None):
        self.applied.append(("move_stage", stage_type)); return ActionResult(success=True, detail={})


@pytest.mark.asyncio
async def test_runs_actions_in_order_and_charges_each(monkeypatch):
    charges = []
    async def charge(**kw): charges.append(kw); return "L"
    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: _Skill())
    plan = ActionPlan(relevant=True, confidence=0.9, reason="x", actions=[
        PlannedAction(verb="set_field", args={"field_id": "f1", "value": "v"}),
        PlannedAction(verb="move_stage", args={"stage_type": "open"}),
    ])
    res = await run_plan(plan, ctx=_ctx(), opportunity={"id": "o1"}, lead={"id": "l1"},
                         rules={}, client=object(), charge_fn=charge)
    assert [a["ledger"]["verb"] for a in charges] == ["set_field", "move_stage"]
    assert res.applied_count == 2 and res.halted is False


@pytest.mark.asyncio
async def test_halts_on_insufficient_credits(monkeypatch):
    calls = {"n": 0}
    async def charge(**kw):
        calls["n"] += 1
        if calls["n"] == 2: raise InsufficientCredits("insufficient_credits")
        return "L"
    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: _Skill())
    plan = ActionPlan(relevant=True, confidence=0.9, reason="x", actions=[
        PlannedAction(verb="set_field", args={"field_id": "f1", "value": "v"}),
        PlannedAction(verb="move_stage", args={"stage_type": "open"}),
    ])
    res = await run_plan(plan, ctx=_ctx(), opportunity={"id": "o1"}, lead={"id": "l1"},
                         rules={}, client=object(), charge_fn=charge)
    assert res.applied_count == 1 and res.halted is True and res.halt_reason == "no_credits"


@pytest.mark.asyncio
async def test_confirmation_actions_are_deferred(monkeypatch):
    async def charge(**kw): return "L"
    monkeypatch.setattr("app.cascade.executor._skill_for", lambda *a, **k: _Skill())
    plan = ActionPlan(relevant=True, confidence=0.9, reason="x", actions=[
        PlannedAction(verb="move_stage", args={"stage_type": "won"}, requires_confirmation=True),
    ])
    res = await run_plan(plan, ctx=_ctx(), opportunity={"id": "o1"}, lead={"id": "l1"},
                         rules={}, client=object(), charge_fn=charge)
    assert res.applied_count == 0 and len(res.pending_confirmations) == 1
```

(Add a local `_ctx()` returning a `TenantContext(equipe_id="e1", actor_user_id="u1")`.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_executor.py -v`
Expected: FAIL (`ModuleNotFoundError: app.cascade.executor`).

- [ ] **Step 3: Implement**

```python
# app/cascade/executor.py
from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from app.credits import InsufficientCredits
from app.schemas import ActionPlan, ActionResult, PlannedAction
from app.security import TenantContext
from app.skills import registry


@dataclass
class ExecResult:
    applied_count: int = 0
    results: list[ActionResult] = field(default_factory=list)
    pending_confirmations: list[PlannedAction] = field(default_factory=list)
    halted: bool = False
    halt_reason: str | None = None


def _skill_for(skill_name: str, *, client: Any, equipe_id: str, actor: str):
    return registry.get_skill(skill_name)(client=client, equipe_id=equipe_id, actor=actor)


async def _dispatch(skill: Any, action: PlannedAction, *, opportunity: dict | None, lead: dict | None) -> ActionResult:
    method = getattr(skill, action.verb, None)
    if not callable(method):
        return ActionResult(success=False, error=f"unknown_verb:{action.verb}")
    args = dict(action.args)
    sig = inspect.signature(method).parameters
    if "opportunity_id" in sig and "opportunity_id" not in args and opportunity:
        args["opportunity_id"] = opportunity.get("id")
    if "lead_id" in sig and "lead_id" not in args and lead:
        args["lead_id"] = lead.get("id")
    out = method(**args)
    if inspect.isawaitable(out):
        out = await out
    return out if isinstance(out, ActionResult) else ActionResult(success=True, detail={"result": out})


async def run_plan(
    plan: ActionPlan,
    *,
    ctx: TenantContext,
    opportunity: dict | None,
    lead: dict | None,
    rules: dict | None,
    client: Any,
    charge_fn: Callable[..., Awaitable[str]],
    mode: str = "manual",
    run_id: str = "run",
    emit: Callable[[str, dict], Awaitable[None]] | None = None,
) -> ExecResult:
    res = ExecResult()
    actor = ctx.actor_user_id or "copilot"
    seq = 0
    for action in plan.actions:
        if action.requires_confirmation:
            res.pending_confirmations.append(action)
            if emit:
                await emit("awaiting_confirmation", {"verb": action.verb, "args": action.args})
            continue

        skill = _skill_for(action.skill, client=client, equipe_id=ctx.equipe_id, actor=actor)
        if emit:
            await emit("action_start", {"verb": action.verb, "args": action.args})
        result = await _dispatch(skill, action, opportunity=opportunity, lead=lead)
        res.results.append(result)

        if result.success:
            seq += 1
            opp = (opportunity or {}).get("id", "")
            try:
                await charge_fn(
                    equipe_id=ctx.equipe_id,
                    idempotency_key=f"{run_id}:{action.verb}:{opp}:{seq}",
                    ledger={"verb": action.verb, "opportunity_id": opp,
                            "lead_id": (lead or {}).get("id", ""), "mode": mode},
                )
            except InsufficientCredits:
                res.halted = True
                res.halt_reason = "no_credits"
                if emit:
                    await emit("halted", {"reason": "no_credits"})
                break
            res.applied_count += 1
            if emit:
                await emit("action_done", {"verb": action.verb, "ok": True})
        else:
            if emit:
                await emit("action_done", {"verb": action.verb, "ok": False, "error": result.error})
    return res
```

- [ ] **Step 4: Run to verify it passes + commit**

Run: `cd python-agent && python -m pytest tests/test_executor.py -v`
Expected: PASS (3 passed).
```bash
git add python-agent/app/cascade/executor.py python-agent/tests/test_executor.py
git commit -m "feat(copilot): sequential credit-aware ActionPlan executor"
```

---

### Task B4: Contact Base Enricher + persistent Lead Memory

**Files:**
- Create: `python-agent/app/cascade/enricher.py`
- Test: `python-agent/tests/test_enricher.py`

**Contract:** `enrich(*, ctx, conversation, lead, opportunity, rules, client) -> ActionPlan`. Runs a cheap
Agno `Agent` with `enable_agentic_memory=True` + a `MemoryManager(db=agno_store, model=cheap)` keyed by
`user_id = lead_id`, so contact facts persist across syncs. The agent's `output_schema=ActionPlan` proposes
`set_field`/`set_contact_field` actions extracted from the conversation. Memory persistence is optional —
degrade gracefully (mirror `autonomous_team._get_storage`) so unit tests run without a DB.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_enricher.py
import pytest
from app.schemas import ActionPlan, PlannedAction
from app.cascade import enricher


@pytest.mark.asyncio
async def test_enricher_extracts_fields_into_plan(monkeypatch):
    async def fake_run(agent, message):
        return type("R", (), {"content": ActionPlan(
            relevant=True, confidence=0.77, reason="extracted kWh",
            actions=[PlannedAction(verb="set_contact_field", args={"key": "kwh", "value": "12"})])})()
    monkeypatch.setattr(enricher, "_arun_agent", fake_run)

    plan = await enricher.enrich(
        ctx=_ctx(), conversation="consumo 12 kWp", lead={"id": "l1"},
        opportunity={"id": "o1"}, rules={}, client=object())
    assert plan.actions[0].verb == "set_contact_field"


@pytest.mark.asyncio
async def test_enricher_passes_memory_user_id(monkeypatch):
    captured = {}
    def fake_agent(**kw): captured.update(kw); 
    # ... assert enable_agentic_memory True and user_id == lead id when storage present
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_enricher.py -k extracts -v`
Expected: FAIL (`app.cascade.enricher` missing).

- [ ] **Step 3: Implement** — build the Enricher agent:
```python
# app/cascade/enricher.py  (core of the implementation)
from agno.agent import Agent
from app.llm import build_chat_model
from app.schemas import ActionPlan

_SYSTEM_PT = """Você é o Enriquecedor de Contatos do Solo Copilot. Leia a conversa e
extraia propriedades de negócio (dores, perfil do decisor, consumo/tarifa, orçamento).
Proponha apenas ações set_field/set_contact_field com valores que você TEM evidência na
conversa. Nunca invente. Use a sua memória do contato para evitar repetir o que já sabe."""

async def _arun_agent(agent, message):   # seam for tests
    return await agent.arun(message)

def _build_agent(*, model_id, client, equipe_id, lead_id):
    kwargs = dict(model=build_chat_model(model_id), output_schema=ActionPlan,
                  system_message=_SYSTEM_PT, telemetry=False, use_json_mode=True)
    try:
        from app.agno_store import get_storage
        storage = get_storage()
        if storage is not None:
            kwargs.update(db=storage, enable_agentic_memory=True, user_id=lead_id)
    except Exception:
        pass
    return Agent(**kwargs)

async def enrich(*, ctx, conversation, lead, opportunity, rules, client) -> ActionPlan:
    model_id = (rules or {}).get("doorman_model") or _settings().doorman_model
    agent = _build_agent(model_id=model_id, client=client,
                         equipe_id=ctx.equipe_id, lead_id=(lead or {}).get("id", ""))
    resp = await _arun_agent(agent, conversation or "")
    plan = resp.content
    return plan if isinstance(plan, ActionPlan) else ActionPlan(relevant=False, actions=[], confidence=0.0, reason="no content")
```
(Import `get_settings` as `_settings`; mirror Verboo handling used elsewhere.)

- [ ] **Step 4: Run to verify it passes + commit**

Run: `cd python-agent && python -m pytest tests/test_enricher.py -v`
Expected: PASS.
```bash
git add python-agent/app/cascade/enricher.py python-agent/tests/test_enricher.py
git commit -m "feat(copilot): Contact Base Enricher with persistent Lead Memory"
```

---

### Task B5: Native HITL on high-stakes verbs + Workflow assembly

**Files:**
- Modify: `python-agent/app/skills/core_table.py` (mark high-stakes verbs)
- Modify: `python-agent/app/cascade/agno_workflow.py` (assemble real Steps)
- Modify: `python-agent/app/audit.py` (record pending confirmations)
- Test: `python-agent/tests/test_agno_workflow.py` (add multi-action + confirmation cases)

- [ ] **Step 1: Mark high-stakes verbs — write the failing test (append to test_core_table.py)**

```python
def test_high_stakes_verbs_require_confirmation():
    from app.skills.core_table import CoreTableSkill
    meta = CoreTableSkill.confirmation_required_verbs()
    assert "set_status" in meta            # won/lost close
    assert "trigger_webhook" in meta       # external side effect
    assert "set_field" not in meta         # routine enrichment is auto
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_core_table.py -k high_stakes -v`
Expected: FAIL (`confirmation_required_verbs` undefined).

- [ ] **Step 3: Implement** — add a classmethod on `CoreTableSkill`:
```python
    _CONFIRM_VERBS = frozenset({"set_status", "trigger_webhook"})

    @classmethod
    def confirmation_required_verbs(cls) -> frozenset[str]:
        """Verbs that must pause for human approval when the plan marks them so."""
        return cls._CONFIRM_VERBS
```
The Floor doorman (B2) sets `PlannedAction.requires_confirmation=True` whenever the proposed verb is in this
set OR the target stage is `won`/`lost`. The executor (B3) already defers those to `pending_confirmations`.

- [ ] **Step 4: Assemble the real Workflow body** — replace `agno_workflow.run_workflow`'s parity delegation with the declarative pipeline:

```
load → prefilter (Tier 0) → Tower(cheap) → resolve/create opp
     → Enricher(cheap) ── actions ─┐
     → Floor(cheap) → ActionPlan ──┤→ Router(select_tier): cheap stays; strategic re-plans the
                                    │   high-stakes leaf on build_reasoning_model
     → executor.run_plan(charge_fn=charge_credit, emit=emit)
     → pending_confirmations → record_decision(status="pending_approval") + add_note
     → record executed/failed decision(s)
```
Build the `charge_fn` as `lambda **kw: charge_credit(client, **kw)`. Pass `emit` through (no-op until Wave 3). Keep the legacy `run_cascade` untouched.

- [ ] **Step 5: Tests for multi-action + confirmation (append to test_agno_workflow.py)** — patch the doorman/enricher/executor seams; assert (a) a 2-action plan applies both and returns `status="executed"`; (b) a plan with a `won` move returns `status="pending_approval"` with a decision row; (c) the cost Router picks `strategic` for the `won` leaf (assert `build_reasoning_model` was used).

- [ ] **Step 6: Run the whole cascade suite + commit**

Run: `cd python-agent && python -m pytest tests/test_agno_workflow.py tests/test_core_table.py tests/test_executor.py -v`
Expected: PASS.
```bash
git add python-agent/app/skills/core_table.py python-agent/app/cascade/agno_workflow.py python-agent/app/audit.py python-agent/tests/
git commit -m "feat(copilot): native HITL high-stakes verbs + assemble multi-action Workflow"
```

**Wave 2 checkpoint:** with `COPILOT_WORKFLOW_ENABLED=true` in a local `.env`, a single `/sync` now runs the Enricher + multi-action Floor plan, charges credits per applied action, defers high-stakes verbs to approval, and escalates won/lost leaves to the strategic model. Flag stays **off** in production until Wave 5.

---

# WAVE 3 — Surfaces & Foundation

## EPIC D — Global Sweep + Real Telemetry HUD *(verboo D1 · gemini D2 · sonnet D3/D4/D5)*

### Task D1: `copilot_run_events` table + Realtime publication

**Files:**
- Create: `supabase/migrations/20260614000300_sprint6_1_run_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260614000300_sprint6_1_run_events.sql
create table if not exists public.copilot_run_events (
  id             uuid primary key default gen_random_uuid(),
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  run_id         text not null,
  opportunity_id uuid,
  seq            integer not null,
  kind           text not null,         -- action_start | action_done | awaiting_confirmation | halted | sweep_progress | done
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_run_events_run on public.copilot_run_events (equipe_id, run_id, seq);

alter table public.copilot_run_events enable row level security;
create policy run_events_tenant on public.copilot_run_events
  for select using (equipe_id in (select equipe_id from public.profiles where id = auth.uid()));

-- Realtime: stream inserts to subscribed clients.
alter publication supabase_realtime add table public.copilot_run_events;
```

- [ ] **Step 2: Apply & verify**

Run: `cd saas-salesengine-v1.0 && supabase db reset`
Expected: table present; `select * from pg_publication_tables where tablename='copilot_run_events';` returns a row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260614000300_sprint6_1_run_events.sql
git commit -m "feat(copilot): copilot_run_events table + Realtime publication"
```

---

### Task D2: `events.py` — run-event emitter (SSE buffer + Realtime writer)

**Files:**
- Create: `python-agent/app/events.py`
- Test: `python-agent/tests/test_events.py`

**Contract:** `RunEmitter(equipe_id, run_id, opportunity_id, client)` exposes `async emit(kind, payload)`
which (a) appends to an in-memory `asyncio.Queue` for the SSE stream and (b) inserts a `copilot_run_events`
row for Realtime/sweep. `aiter()` yields queued events for SSE; a sentinel `done` closes the stream.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_events.py
import pytest
from app.events import RunEmitter


class _FakeTable:
    def __init__(self): self.rows = []
    def table(self, _): return self
    def insert(self, row): self.rows.append(row); return self
    def execute(self): 
        class R: data = None; error = None
        return R()


@pytest.mark.asyncio
async def test_emit_queues_and_persists():
    db = _FakeTable()
    em = RunEmitter(equipe_id="e1", run_id="r1", opportunity_id="o1", client=db)
    await em.emit("action_start", {"verb": "set_field"})
    await em.emit("done", {})
    seen = [ev async for ev in em.aiter()]
    assert seen[0]["kind"] == "action_start"
    assert seen[-1]["kind"] == "done"
    assert db.rows[0]["run_id"] == "r1" and db.rows[0]["seq"] == 0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_events.py -v`
Expected: FAIL (`app.events` missing).

- [ ] **Step 3: Implement**

```python
# app/events.py
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator


class RunEmitter:
    def __init__(self, *, equipe_id: str, run_id: str, opportunity_id: str | None, client: Any):
        self.equipe_id = equipe_id
        self.run_id = run_id
        self.opportunity_id = opportunity_id
        self.client = client
        self._q: asyncio.Queue[dict | None] = asyncio.Queue()
        self._seq = 0

    async def emit(self, kind: str, payload: dict[str, Any]) -> None:
        ev = {"kind": kind, "seq": self._seq, "run_id": self.run_id,
              "opportunity_id": self.opportunity_id, "payload": payload}
        await self._q.put(ev)
        try:
            await asyncio.to_thread(self._persist, ev)
        except Exception:
            pass  # Realtime persistence is best-effort; never block the run
        self._seq += 1
        if kind == "done":
            await self._q.put(None)  # close sentinel

    def _persist(self, ev: dict) -> None:
        self.client.table("copilot_run_events").insert({
            "equipe_id": self.equipe_id, "run_id": ev["run_id"], "seq": ev["seq"],
            "opportunity_id": ev["opportunity_id"], "kind": ev["kind"], "payload": ev["payload"],
        }).execute()

    async def aiter(self) -> AsyncIterator[dict]:
        while True:
            ev = await self._q.get()
            if ev is None:
                return
            yield ev
```

- [ ] **Step 4: Run to verify it passes + commit**

Run: `cd python-agent && python -m pytest tests/test_events.py -v`
Expected: PASS.
```bash
git add python-agent/app/events.py python-agent/tests/test_events.py
git commit -m "feat(copilot): RunEmitter (SSE queue + copilot_run_events persistence)"
```

---

### Task D3: `/sync/stream` (SSE) + `/sync/sweep` (sequential queue)

**Files:**
- Create: `python-agent/app/routers/sweep.py`
- Modify: `python-agent/app/main.py` (mount router)
- Test: `python-agent/tests/test_sweep_router.py`

**Contract:**
- `GET /api/v1/sync/stream?lead_id=&opportunity_id=&pipeline_id=` → `text/event-stream`. Runs the Workflow
  with a `RunEmitter`; streams each event as `data: {json}\n\n`; ends with a `done` event.
- `POST /api/v1/sync/sweep` `{pipeline_id}` → loads all open opportunities for the tenant+pipeline, processes
  them **one-by-one** (sequential queue — no race conditions), emitting `sweep_progress` per card to
  `copilot_run_events` (frontend reads via Realtime). Returns `{run_id, total}` immediately-ish (sweep runs
  to completion server-side; for large tenants this can be a background task — acceptable for v1 single-replica).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_sweep_router.py
import pytest
from fastapi.testclient import TestClient


def test_sweep_processes_each_open_opportunity(monkeypatch):
    from app import main
    # fake tenant ctx + fake client returning 2 open opps; patch run_workflow to a counter
    processed = []
    async def fake_workflow(**kw): processed.append(kw["opportunity_id"]); return {"status": "executed"}
    monkeypatch.setattr("app.routers.sweep.run_workflow", fake_workflow)
    # ... patch get_tenant_context + service client with 2 opportunities o1,o2
    client = TestClient(main.app)
    r = client.post("/api/v1/sync/sweep", json={"pipeline_id": "p1"},
                    headers={"Authorization": "Bearer test"})
    assert r.status_code == 200
    assert r.json()["total"] == 2
    assert processed == ["o1", "o2"]   # sequential, in order
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd python-agent && python -m pytest tests/test_sweep_router.py -v`
Expected: FAIL (`app.routers.sweep` missing).

- [ ] **Step 3: Implement** the router:
```python
# app/routers/sweep.py  (shape)
import json, uuid
from typing import Annotated
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.cascade.agno_workflow import run_workflow
from app.deps import get_tenant_context
from app.security import TenantContext
from app.events import RunEmitter
from app.db import get_service_client

router = APIRouter(prefix="/sync", tags=["sync"])

@router.get("/stream")
async def sync_stream(ctx: Annotated[TenantContext, Depends(get_tenant_context)],
                      lead_id: str = Query(...), opportunity_id: str | None = Query(None),
                      pipeline_id: str | None = Query(None)):
    client = get_service_client()
    emitter = RunEmitter(equipe_id=ctx.equipe_id, run_id=str(uuid.uuid4()),
                         opportunity_id=opportunity_id, client=client)
    async def gen():
        import asyncio
        task = asyncio.create_task(run_workflow(ctx=ctx, lead_id=lead_id,
            opportunity_id=opportunity_id, pipeline_id=pipeline_id, trigger="sync",
            client=client, emit=emitter.emit))
        async for ev in emitter.aiter():
            yield f"data: {json.dumps(ev)}\n\n"
        await task
    return StreamingResponse(gen(), media_type="text/event-stream")

class SweepRequest(BaseModel):
    pipeline_id: str

@router.post("/sweep")
async def sync_sweep(body: SweepRequest, ctx: Annotated[TenantContext, Depends(get_tenant_context)]):
    client = get_service_client()
    run_id = str(uuid.uuid4())
    opps = (client.table("opportunities").select("id,lead_id,pipeline_id")
            .eq("equipe_id", ctx.equipe_id).eq("pipeline_id", body.pipeline_id)
            .eq("status", "open").execute()).data or []
    emitter = RunEmitter(equipe_id=ctx.equipe_id, run_id=run_id, opportunity_id=None, client=client)
    for opp in opps:                          # SEQUENTIAL — one at a time
        await emitter.emit("sweep_progress", {"opportunity_id": opp["id"], "state": "start"})
        await run_workflow(ctx=ctx, lead_id=opp["lead_id"], opportunity_id=opp["id"],
                           pipeline_id=opp["pipeline_id"], trigger="sync", client=client)
        await emitter.emit("sweep_progress", {"opportunity_id": opp["id"], "state": "done"})
    await emitter.emit("done", {"total": len(opps)})
    return {"run_id": run_id, "total": len(opps)}
```
Wire `emit` through `run_workflow` (the `emit` kwarg added in W0/B5). Mount in `main.py`:
`app.include_router(sweep.router, prefix="/api/v1")`.

- [ ] **Step 4: Run to verify it passes + commit**

Run: `cd python-agent && python -m pytest tests/test_sweep_router.py tests/test_main.py -v`
Expected: PASS.
```bash
git add python-agent/app/routers/sweep.py python-agent/app/main.py python-agent/tests/test_sweep_router.py
git commit -m "feat(copilot): /sync/stream SSE + sequential /sync/sweep"
```

---

### Task D4: Frontend — `useCopilotSync` (SSE) + `TelemetryHUD` modal

**Files:**
- Create: `src/hooks/useCopilotSync.ts`
- Create: `src/components/crm/copilot/TelemetryHUD.tsx`
- Modify: `src/services/copilot.ts` (add `streamSyncUrl()` helper)
- Test: manual via the app (no FE unit-test harness for hooks here) + `npm run build`.

- [ ] **Step 1: `useCopilotSync` consumes the SSE stream**

```ts
// src/hooks/useCopilotSync.ts
import { useCallback, useRef, useState } from "react";
import { COPILOT_URL } from "@/services/copilot";

export type HudEvent = { kind: string; seq: number; payload: any };

export function useCopilotSync() {
  const [events, setEvents] = useState<HudEvent[]>([]);
  const [running, setRunning] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const start = useCallback((token: string, q: { lead_id: string; opportunity_id?: string; pipeline_id?: string }) => {
    setEvents([]); setRunning(true);
    const params = new URLSearchParams({ lead_id: q.lead_id, ...(q.opportunity_id && { opportunity_id: q.opportunity_id }), ...(q.pipeline_id && { pipeline_id: q.pipeline_id }) });
    // EventSource can't set headers; pass the JWT as a query param the backend also accepts,
    // OR use fetch+ReadableStream. Use fetch streaming to keep the Authorization header:
    fetchStream(`${COPILOT_URL}/api/v1/sync/stream?${params}`, token, (ev) => {
      setEvents((prev) => [...prev, ev]);
      if (ev.kind === "done") setRunning(false);
    });
  }, []);

  return { events, running, start };
}

async function fetchStream(url: string, token: string, onEvent: (e: HudEvent) => void) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const c of chunks) {
      const line = c.replace(/^data: /, "").trim();
      if (line) onEvent(JSON.parse(line));
    }
  }
}
```
> Note: native `EventSource` cannot send the `Authorization` header — use the `fetch`+`ReadableStream`
> reader shown above (the backend `/sync/stream` already authenticates via the `Authorization` header).

- [ ] **Step 2: `TelemetryHUD` renders the live cognition stream**

Build a modal (reuse the project's `Dialog` from `components/ui`) that maps each `HudEvent` to a
cockpit log line: `action_start` → "Executando {verb}…", `action_done(ok)` → "✓ {verb}",
`action_done(!ok)` → "✗ {verb}: {error}", `awaiting_confirmation` → "⏸ Aguardando aprovação: {verb}",
`halted` → "⛔ Sem créditos", `done` → "Concluído". Auto-scroll; show a spinner while `running`.

- [ ] **Step 3: Build gate + commit**

Run: `cd saas-salesengine-v1.0 && npm run build`
Expected: build succeeds (no TS/vite errors).
```bash
git add src/hooks/useCopilotSync.ts src/components/crm/copilot/TelemetryHUD.tsx src/services/copilot.ts
git commit -m "feat(copilot): SSE sync hook + live Telemetry HUD modal"
```

---

### Task D5: Frontend — `useCopilotSweep` (Realtime) + sweep wiring

**Files:**
- Create: `src/hooks/useCopilotSweep.ts`
- Modify: `src/services/copilot.ts` (add `sweep(pipelineId)`)

- [ ] **Step 1:** `sweep()` POSTs `/api/v1/sync/sweep`; `useCopilotSweep` subscribes to `copilot_run_events` filtered by `run_id` via the existing Supabase client (mirror `useCopilotRealtime.ts`), feeding the same `HudEvent[]` shape into the HUD so the sweep reuses the D4 modal.
- [ ] **Step 2:** `npm run build` passes; commit.

```bash
git add src/hooks/useCopilotSweep.ts src/services/copilot.ts
git commit -m "feat(copilot): sweep trigger + Realtime HUD consumer"
```

---

## EPIC G — In-House Agent Foundation (RAG + messaging contract) *(verboo G1 · gemini G2 · opus G3)*

> **Foundation only.** No conversational agent ships this sprint — we lay schema + contract so 6.2 can.

### Task G1: pgvector + per-tenant knowledge table

**Files:**
- Create: `supabase/migrations/20260614000400_sprint6_1_knowledge_pgvector.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260614000400_sprint6_1_knowledge_pgvector.sql
create extension if not exists vector;

create table if not exists public.copilot_knowledge (
  id          uuid primary key default gen_random_uuid(),
  equipe_id   uuid not null references public.equipes(id) on delete cascade,
  source      text,                          -- doc title / url / channel
  content     text not null,
  embedding   vector(1536),                  -- text-embedding-3-small
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_knowledge_equipe on public.copilot_knowledge (equipe_id);
-- ANN index for hybrid search (built once data exists):
create index if not exists idx_knowledge_embedding on public.copilot_knowledge
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.copilot_knowledge enable row level security;
create policy knowledge_tenant on public.copilot_knowledge
  for select using (equipe_id in (select equipe_id from public.profiles where id = auth.uid()));
```

- [ ] **Step 2: Apply & verify + commit**

Run: `cd saas-salesengine-v1.0 && supabase db reset`
Expected: `vector` extension present; table + indexes created.
```bash
git add supabase/migrations/20260614000400_sprint6_1_knowledge_pgvector.sql
git commit -m "feat(copilot): pgvector + per-tenant knowledge table (RAG foundation)"
```

---

### Task G2: `knowledge.py` — per-tenant PgVector factory + ingest

**Files:**
- Create: `python-agent/app/knowledge.py`
- Test: `python-agent/tests/test_knowledge.py`

**Contract:** `build_knowledge(equipe_id) -> Knowledge` configures Agno `PgVector(table_name="copilot_knowledge",
db_url=settings.database_url, search_type=hybrid, embedder=OpenAIEmbedder("text-embedding-3-small"))` with a
**tenant filter** on `equipe_id`. `ingest(equipe_id, source, text)` upserts rows. This is wired into NO agent
this sprint — it's exercised only by a unit test that asserts the factory configures the right table + filter.

- [ ] **Step 1: Write the failing test** asserting `build_knowledge("e1")` returns an object whose vector store points at `copilot_knowledge` and whose tenant filter is `{"equipe_id": "e1"}` (patch/stub `PgVector` so no DB is needed).
- [ ] **Step 2: Run → fails** (`app.knowledge` missing).
- [ ] **Step 3: Implement** the factory + a thin `ingest` that embeds and inserts. Degrade gracefully if Agno knowledge deps are absent.
- [ ] **Step 4: Run → passes; commit**

```bash
git add python-agent/app/knowledge.py python-agent/tests/test_knowledge.py
git commit -m "feat(copilot): per-tenant PgVector Knowledge factory (foundation)"
```

---

### Task G3: Messaging I/O contract doc

**Files:**
- Create: `python-agent/docs/INBOUND_AGENT_CONTRACT.md`

- [ ] **Step 1:** Document the inbound/outbound contract for the future in-house conversational agent: the
  webhook envelope (channel, tenant, contact, message), how `equipe_id` is derived, the outbound reply shape,
  session keying (`session_id = conversation_id`), and where it plugs into the Workflow (a new `conversation`
  trigger alongside `sync`/background). No code — this is the 6.2 on-ramp. Reference `routers/ingest.py` (today
  disabled, `ingest_enabled=False`) as the existing inbound seam.
- [ ] **Step 2: Commit**

```bash
git add python-agent/docs/INBOUND_AGENT_CONTRACT.md
git commit -m "docs(copilot): inbound conversational-agent messaging contract (6.2 on-ramp)"
```

**Wave 3 checkpoint:** ⚡ single sync streams real Agno events into the HUD; the sweep walks every open opportunity sequentially with live Realtime progress; the RAG schema + messaging contract exist as the in-house-agent foundation.

---

# WAVE 4 — UX

## EPIC E — Ubiquitous ⚡ Sync surfaces *(gemini E1/E3 · sonnet E2/E4)*

> All three surfaces share one `SyncButton` and one `TelemetryHUD`. The button only renders when the team's `is_crm_agent_enabled` ("Agente de CRM") toggle is on — reuse the existing guard from `OpportunityDetailModal`.

### Task E1: Reusable `SyncButton` component

**Files:**
- Create: `src/components/crm/copilot/SyncButton.tsx`

- [ ] **Step 1:** Build a `SyncButton` with `variant: "card" | "chat" | "header"` and props
  `{ leadId, opportunityId?, pipelineId?, mode: "single" | "sweep" }`. On click it opens the `TelemetryHUD`
  and calls `useCopilotSync().start(...)` (single) or `useCopilotSweep().sweep(...)` (sweep). `card` variant is
  a compact ⚡ icon button; `chat` variant sits inline in the inbox composer; `header` variant is a labeled
  "Sincronizar Pipeline" button. Disable + tooltip when `is_crm_agent_enabled` is false. Optimistically
  invalidate the relevant TanStack Query keys (`opportunities`, `leadActivities`, credits) on `done`.
- [ ] **Step 2:** `npm run build` passes; commit.

```bash
git add src/components/crm/copilot/SyncButton.tsx
git commit -m "feat(copilot): reusable ⚡ SyncButton (card/chat/header variants)"
```

---

### Task E2: Mount ⚡ on the Kanban card face

**Files:**
- Modify: the Kanban card component (find via `grep -rl "stage_entered_at\|OpportunityCard\|kanban" src/components/crm`; likely rendered by `PipelineWorkspace.tsx`).

- [ ] **Step 1:** Render `<SyncButton variant="card" mode="single" leadId opportunityId pipelineId />` on the
  card face (top-right corner), `stopPropagation` so it doesn't open the detail modal. Verify it does not break
  drag-and-drop.
- [ ] **Step 2:** `npm run build` passes; manual check the card renders + click opens HUD; commit.

```bash
git add src/components/crm/PipelineWorkspace.tsx
git commit -m "feat(copilot): on-card ⚡ Sync button"
```

---

### Task E3: Mount ⚡ in the chat sidebar

**Files:**
- Modify: `src/components/inbox/ChatInput.tsx` (or the inbox conversation header — choose the spot next to the active WhatsApp conversation).

- [ ] **Step 1:** Render `<SyncButton variant="chat" mode="single" leadId pipelineId />` adjacent to the
  composer so a salesperson can align CRM properties mid-conversation. Resolve `leadId`/`pipelineId` from the
  active conversation context.
- [ ] **Step 2:** `npm run build` passes; commit.

```bash
git add src/components/inbox/ChatInput.tsx
git commit -m "feat(copilot): chat-sidebar ⚡ Sync button"
```

---

### Task E4: Mount Global Sweep ⚡ on the pipeline header

**Files:**
- Modify: `src/components/crm/PipelineWorkspace.tsx` (pipeline header area).

- [ ] **Step 1:** Render `<SyncButton variant="header" mode="sweep" pipelineId />` in the pipeline header.
  Confirm action (this can spend many credits): a `Dialog` "Sincronizar N oportunidades? Custo estimado: N
  créditos." before firing `sweep()`. Show progress in the shared HUD via the Realtime consumer.
- [ ] **Step 2:** `npm run build` passes; commit.

```bash
git add src/components/crm/PipelineWorkspace.tsx
git commit -m "feat(copilot): global pipeline sweep ⚡ button with credit confirm"
```

---

## EPIC F — Billing & Transparency UI *(gemini F1/F3 · verboo F2)*

### Task F1: `useCopilotCredits` — balance + ledger queries

**Files:**
- Create: `src/hooks/useCopilotCredits.ts`
- Modify: `src/services/copilot.ts`

- [ ] **Step 1:** Two TanStack Query hooks reading via the Supabase client (RLS-scoped, no backend call
  needed): `useCreditBalance()` → `agent_credits_balance.balance`; `useCreditLedger({ from, to })` →
  `agent_action_ledger` ordered by `created_at desc`. Both keyed by tenant; invalidate on sync `done`.
- [ ] **Step 2:** `npm run build` passes; commit.

```bash
git add src/hooks/useCopilotCredits.ts src/services/copilot.ts
git commit -m "feat(copilot): credit balance + ledger query hooks"
```

---

### Task F2: `CreditBalanceBadge` (header wallet widget)

**Files:**
- Create: `src/components/crm/copilot/CreditBalanceBadge.tsx`
- Modify: the CRM/app header where the team context lives (e.g. near `TenantContext` consumer in the layout).

- [ ] **Step 1:** A compact badge showing the current credit balance with a low-balance warning state
  (amber under a threshold, e.g. < 50) linking to the top-up flow (reuse the existing Asaas buy-credits path
  from `Billing.tsx` / `asaas-buy-credits` — Copilot wallet is a separate balance but the same payment rail).
- [ ] **Step 2:** `npm run build` passes; commit.

```bash
git add src/components/crm/copilot/CreditBalanceBadge.tsx
git commit -m "feat(copilot): header credit balance badge with low-balance warning"
```

---

### Task F3: `CreditLedgerPanel` (transparency ledger)

**Files:**
- Create: `src/components/crm/copilot/CreditLedgerPanel.tsx`
- Modify: `src/pages/Billing.tsx` (add a "Copilot" tab/section) OR `src/pages/Admin.tsx`.

- [ ] **Step 1:** A table matching the 6.1 vision's Transparency Ledger: columns **Data/Hora ·
  Oportunidade/Canal · Ações Executadas · Modo (Auto/Manual) · Custo (créditos)**. Source `useCreditLedger`.
  Group rows by `run_id` where present so one sync pulse reads as one line with its action count. Paginate by
  date range. Managers-only (reuse `useRole`).
- [ ] **Step 2:** `npm run build` passes; commit.

```bash
git add src/components/crm/copilot/CreditLedgerPanel.tsx src/pages/Billing.tsx
git commit -m "feat(copilot): transparency credit-ledger panel"
```

**Wave 4 checkpoint:** ⚡ Sync is reachable from the card, the chat, and the pipeline header; the HUD shows real cognition; the wallet badge + transparency ledger give managers full credit visibility.

---

# WAVE 5 — Trust & Ship (EPIC H) *(verboo H1a · codex H1b/H2 · gemini H3 · opus H4 · Mateus H5)*

### Task H1: Evals dyno — accuracy + reliability suites

**Files:**
- Create: `python-agent/evals/__init__.py`
- Create: `python-agent/evals/fixtures.py` (seed conversations + expected routes/plans) *(verboo can generate the bulk of fixtures)*
- Create: `python-agent/evals/test_eval_doorman_accuracy.py`
- Create: `python-agent/evals/test_eval_reliability.py`

- [ ] **Step 1: Write the accuracy eval** using Agno `AccuracyEval` (LLM-as-judge) over a fixture set: feed N
  seeded conversations through the Tower+Floor path and judge whether the chosen `contact_type` / first
  `ActionPlan.verb` matches the expected. Assert mean score ≥ a committed baseline (e.g. 0.8).

```python
# evals/test_eval_doorman_accuracy.py  (shape)
from agno.eval.accuracy import AccuracyEval
from app.llm import build_chat_model
from evals.fixtures import DOORMAN_CASES

def test_doorman_accuracy_meets_baseline():
    for case in DOORMAN_CASES:
        result = AccuracyEval(
            model=build_chat_model("gpt-4o"),         # judge
            input=case.conversation,
            expected_output=case.expected_route,
            # the agent under test wraps Tower+Floor; see fixtures for the runner
        ).run(print_results=False)
        assert result.avg_score >= 0.8
```

- [ ] **Step 2: Write the reliability eval** asserting the executor only calls tools that exist and never
  fabricates `equipe_id` — feed a plan with a bogus verb and assert it is reported, not executed.

- [ ] **Step 3: Run the eval suite**

Run: `cd python-agent && python -m pytest evals/ -v`
Expected: PASS at/above baseline. (These are marked slow; they hit a model — run them in CI, not the unit gate.)

- [ ] **Step 4: Seed a regression guard** — add one fixture with a known-correct expected output, then a test
  that fails if the doorman misclassifies it. Commit.

```bash
git add python-agent/evals
git commit -m "test(copilot): Evals dyno (accuracy + reliability) with baseline gate"
```

---

### Task H2: Private AgentOS admin stub

**Files:**
- Modify: `python-agent/app/main.py`

- [ ] **Step 1:** Mount AgentOS **admin-only**, gated behind `AGENT_INTERNAL_TOKEN` (never tenant-JWT, never
  public). Expose only traces/sessions/eval surfaces, under a non-tenant path prefix (e.g. `/admin/agentos`)
  protected by a header-token dependency. If mounting AgentOS proves heavy for v1, ship a minimal read-only
  `/admin/runs` endpoint listing recent `copilot_run_events` + `ai_decisions` for an internal token instead —
  the goal is ops visibility, not the full console.
- [ ] **Step 2:** Test the token guard (401 without the internal token); `npm`-free backend test:
  `python -m pytest tests/test_main.py -v`. Commit.

```bash
git add python-agent/app/main.py python-agent/tests/test_main.py
git commit -m "feat(copilot): private admin ops surface (internal-token gated)"
```

---

### Task H3: CI gate — full backend suite + FE build

**Files:**
- Modify: `python-agent` CI workflow (or `.github/workflows/*` if present) + a `Makefile`/script target.

- [ ] **Step 1:** Ensure `python -m pytest` (unit) runs on PR; `python -m pytest evals/` runs nightly/pre-deploy.
- [ ] **Step 2:** Ensure `npm run build` is the FE gate in CI.
- [ ] **Step 3:** Commit.

```bash
git commit -am "ci(copilot): backend pytest + evals + frontend build gates"
```

---

### Task H4: Workflow flag cutover (parity-gated)

**Files:**
- Modify: `python-agent/app/config.py` (default `copilot_workflow_enabled = True` only after parity)
- Modify: Dokploy env (`COPILOT_WORKFLOW_ENABLED=true`)

- [ ] **Step 1:** Run the Evals dyno against BOTH paths (legacy `run_cascade` vs `agno_workflow.run_workflow`)
  on the same fixtures; confirm the Workflow path scores ≥ legacy on accuracy and reliability.
- [ ] **Step 2:** Flip `COPILOT_WORKFLOW_ENABLED=true` in Dokploy; smoke-test a real `/sync` (a known lead)
  and confirm an `agent_action_ledger` row + `copilot_run_events` stream + HUD.
- [ ] **Step 3:** Once stable for one deploy cycle, remove the legacy `run_cascade` body (keep the function as a
  thin alias to `run_workflow` for one release, then delete). Commit each step.

```bash
git commit -am "feat(copilot): cut over to Agno Workflow backbone (parity-gated)"
```

---

### Task H5: Dokploy deploy + production verification

**Files:**
- Modify: Dokploy env vars (Mateus — Human Orchestrator does the infra).

- [ ] **Step 1:** Add new env vars in Dokploy: `STRATEGIC_MODEL` (e.g. a Verboo reasoning model or an OpenAI
  reasoning id), confirm `DATABASE_URL` is correct (URL-encode password — see [[sprint6-secrets-rotation-deferred]]),
  embedder key for Knowledge. Apply the four migrations to the remote DB.
- [ ] **Step 2:** Seed a starting credit balance for the pilot team(s) in `agent_credits_balance`.
- [ ] **Step 3:** Production smoke test: ⚡ single sync (HUD streams, ledger charges, balance decrements);
  sweep (sequential, Realtime); a won-move triggers an approval card; verify the strategic model appears in the
  ledger `model` column for that won leaf.
- [ ] **Step 4:** Update the live-deployment memory + `sprint_6.1` status note with the production state.

```bash
git commit -am "chore(copilot): Sprint 6.1 production deploy + verification notes"
```

**Wave 5 checkpoint (Definition of Done):** Workflow backbone live in production; ⚡ sync streams real cognition and applies multi-action plans, each metered; sweep is sequential with no double-charges; the cost router provably uses verboo for the high-volume tier and the strategic reasoning model only on configured high-stakes leaves (visible in `ledger.model`); credit balance decrements idempotently and the transparency UI matches; Lead Memory persists across sessions; high-stakes verbs pause for approval; the Evals dyno gates regressions in CI; the RAG/messaging foundation is documented as the 6.2 on-ramp.

---

## Plan Self-Review (PM)

- **Spec coverage:** every §4 in-scope item maps to a task — Workflow keystone (W0/B5/H4), cost router (C1–C3), credit ledger + auto-meter (A1–A3), multi-action (B1–B3), Enricher+Memory (B4), HITL (B5), ubiquitous Sync (E1–E4), real HUD (D2–D5), billing UI (F1–F3), Evals (H1), AgentOS stub (H2), Dokploy deploy (H5). Foundation items (RAG/messaging) → G1–G3. Deferred items (conversational agent, unified wallet, scale-out, skills-registry UI) are explicitly out and not tasked.
- **Type consistency:** `ActionPlan`/`PlannedAction` (B1) are the contract used by Floor (B2), executor (B3), Enricher (B4). `charge_credit(...)` signature (A2) matches the executor's `charge_fn` and the metering hook (A3). `RunEmitter.emit(kind, payload)` (D2) matches the `emit` kwarg threaded through `run_workflow` (W0/B5) and consumed by `HudEvent` (D4). `Stakes`/`select_model` (C2) feed the Workflow Router (B5) and `build_reasoning_model` (C3).
- **Placeholder scan:** no TBD/“handle errors”/“similar to” — each step carries the actual schema, SQL, code, command, or a precise component spec. Where a step is a spec rather than literal code (routine UI in D4/E/F, the Workflow assembly in B5), the contract, file, and acceptance check are explicit.
- **Known seams to honor during execution:** refactor inline `agent.arun` calls to a `_arun_agent` seam before testing (B2/B4) — assert against the real Agno API, not only mocks ([[agno-agent-api-and-mock-blindspot]]); list/dict Settings need `NoDecode` ([[pydantic-settings-list-env-nodecode]]); `npm run build` (not tsc) is the FE gate ([[frontend-build-gate-vs-tsc]]).

---

## Execution Handoff

Plan complete and saved to `Planning/sprint_6.1_solo-copilot_evolve_v1.md` (appended beneath your F1 Ignition vision). Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Maps cleanly to your roster: codex on EPIC A/H-security, opus on the Workflow/router/cutover, sonnet on Agno+frontend (D/E), gemini on billing UI (F), verboo on eval fixtures + boilerplate tests.
2. **Inline Execution** — execute tasks in this session with batch checkpoints at each wave boundary.

Which approach?
