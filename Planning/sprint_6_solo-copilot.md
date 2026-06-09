# 🏎️ SPRINT 6: THE AGNO IGNITION · EXECUTIVE VISION

**Sovereign Engine Block for the Agent-First Sales OS**

---

### 🌌 THE MISSION: FROM PASSIVE PLATFORM TO DYNAMIC ENGINE

In standard CRM software, the chassis is entirely rigid. The user spends their
life performing data entry, configuring tables, clicking through pages, and
mapping forms. It feels like an administrative chore—the opposite of a race
context.

**Sprint 6 is the moment the machine wakes up.** We are moving away from
treating artificial intelligence as a set of loose, static helper endpoints. We
are establishing **Solo Copilot** as the core mechanical engine block of the
platform. The software shifts from a configuration ledger into an **Autonomous
Sales Operating System (Sales OS)**.

The salesperson is no longer an administrative data typist; they are an elite
driver sitting inside a carbon-fiber cockpit. The software handles data entry,
keeps parameters optimized, parses text inputs, calculates timelines, and shapes
pipelines under the hood. The pilot focuses entirely on pressing the throttle,
engaging with clients, and winning the closing race.

---

### 🛡️ THE FOUNDATIONAL PILLARS (Our Decided Architecture)

To engineer an engine that scales fluidly from **V1 to V4** without needing
structural rebuilds, we have locked down two uncompromising architectural
decisions:

1. **Absolute Data Sovereignty (Dokploy on VPS):** We reject commercial platform
   clouds and variable traffic pricing models. The runtime environment will run
   entirely inside lightweight Docker containers managed by **Dokploy** directly
   on our private VPS metal. Costs are fixed, bandwidth latency is eliminated,
   and our customer knowledge assets are permanently protected.
2. **Surgical Isolation (Raw FastAPI + Injected Context Guards):** We drop all
   heavy, opaque frameworks like AgentOS. The service layer is constructed using
   **Raw Asynchronous FastAPI** for maximum speed. Since we run on a privileged
   `service_role` connection to execute modifications in less than 40
   milliseconds, security is strictly managed at the code entry point. The
   system decodes the incoming, verified Supabase JWT token and injects a
   mandatory `equipe_id` context parameter directly into the root of every
   single Agno skill. Cross-tenant data leaks are mathematically impossible.

---

### 🎯 THE JOBS-TO-BE-DONE (JTBD) FOR THIS CYCLE

The client does not buy a FastAPI service, a Pydantic schema, or a Python
package manager. The client buys automated business operations. This sprint is
focused entirely on delivering three definitive outcomes:

- **JTBD 1: The Automated Pipeline Architect (Self-Shaping Track)**
- _The Need:_ Initial users are sales experts, not system architects. They do
  not know how to map database structures or code automation webhooks.
- _The Outcome:_ The user talks to the setup dashboard in plain Portuguese,
  explaining how their funnel operates. Solo Copilot interviews them, parses
  their business goals against strict Pydantic rules, and automatically
  generates the entire CRM architecture—minting the stages, calculating optimal
  SLA timers, and registering data variables instantly.

- **JTBD 2: The Continuous Triage Agent (The Cascade Doorman)**
- _The Need:_ Sales teams are choked by incoming noise, text dumps, and
  unorganized WhatsApp leads, leading to dropped SLAs.
- _The Outcome:_ A structured execution cascade. A cheap, hyper-fast **Tower
  Doorman** identifies incoming contacts, filters out spam, and matches them to
  a process. Then, a specialized **Floor Doorman** reads conversational contexts
  and chooses the exact mechanical tool required to execute structural updates.

- **JTBD 3: The Frictionless Operator (The Sniper CRM Tools)**
- _The Need:_ Reps skip logging critical details because updating fields
  manually introduces friction.
- _The Outcome:_ Solo Copilot operates the CRM layout on behalf of the rep. It
  reads real-time client messages and directly executes row adjustments:
  shifting kanban column keys, capturing numbers (like system capacity capacity
  fields for Solo Energia or apartment details for Be My Guest), and dynamically
  recalculating cadence clocks.

---

### 🏆 THE HERO STORIES: "THE MECHANIZED SHIFT"

#### Story A: The Self-Shaping Track Setup

Mateus logs into a brand-new workspace channel for a luxury real estate partner.
Instead of facing a blank canvas with confusing configuration columns, he is
greeted by a clean, minimalistic dark input dashboard.

He types a single, natural paragraph:

> _"Eu preciso capturar proprietários de imóveis na planta em Florianópolis,
> descobrir o número de dormitórios e o valor do condomínio, agendar uma
> vistoria técnica presencial com no máximo 24 horas de prazo, e depois enviar o
> contrato padrão."_

He clicks save. The system does not load an administrative loader wheel. Under
the hood, Solo Copilot analyzes the paragraph, verifies the business intent, and
uses its relational primitives to shape the workspace.

Instantly, the interface shifts layout styles. Four clean Kanban columns snap
into view:
`[Novo Proprietário ➔ Qualificação Técnica ➔ Vistoria Agendada ➔ Contrato Pendente]`.
The system automatically registers the exact variables inside the hidden JSON
data columns, and customizes the agent's background extraction rules. The track
has shaped itself to match the user's mind in seconds.

#### Story B: The Autonomous Handover Loop

A cold lead hits the WhatsApp channel for Be My Guest at 11:30 PM. The lead
types: _"Gostei da proposta de gestão para o meu apartamento no Cumbuco. São 3
quartos e o condomínio já tem mobília básica de alto padrão. Conseguimos marcar
para olhar na segunda de manhã?"_

The representative is asleep, but the **Sales Engine OS** is wide awake. The
incoming message triggers our silent telemetry plane. It debounces until the
client stops typing, then wakes up the **Agno Workflow Cascade**.

The doorman matches the conversation, reads the intent, and instantly triggers
its specialized CRM tools. Without a single human interaction:

1. It shifts the opportunity card from `Novo Lead` smoothly into
   `Visita Agendada`.
2. It surgically writes to the opportunity custom variables table:
   `{"quartos": 3, "mobilia_status": "basica_alto_padrao"}`.
3. It sets a chronological calendar alert flag for Monday morning.

When the sales representative opens their dashboard at 8:00 AM, they don't find
a cold unorganized text box. They see an active card waiting in the correct
lane, glowing with a precision metric indicator, pre-populated with all
properties extracted from the text. The system logs show a clear notification:
_Solo Copilot performed 3 mechanical updates. Vendedor no Loop initialized._ The
rep simply clicks the row and closes the deal.

---

### 🧭 THE COCKPIT METRICS (Definition of Done)

- [ ] **Engine Ignition:** The asynchronous Python environment lifts on the
      self-hosted VPS via Dokploy with zero dependency mismatches or environment
      leak paths.
- [ ] **Sovereign Gateway:** The FastAPI automated interface is accessible and
      secure, routing inbound telemetry streams using structural log traces.
- [ ] **Deterministic Clean Outputs:** The pipeline shaper successfully
      translates loose text descriptions into error-free Pydantic blueprint JSON
      structures 100% of the time.
- [ ] **Guarded Execution:** Every mechanical data tool enforces strict tenant
      checking logic, amassing automated audit lines directly to the system
      queue.

The car is fueled, the track is mapped, and the chassis modifications are
certified. We are shifting from building configurations to deploying true
execution intelligence.

**Let's hand this executive blueprint to the engineering team and activate
Sprint 6.**

---
---

# 🛠️ IMPLEMENTATION PLAN (PM-owned · v2 — full Agno layer + infra)

> **Flow:** `Planning/agent_workflow.md`. **R&D:** `Planning/pré_sprint_6_copilot.md`.
> Every task is tagged **S/M/L/XL**, owns an explicit file set, lives in a wave (disjoint file ownership inside a wave). **L/XL** need PM sign-off before code; **S/M** branch and go if the contract is clear. Tick your box + add a billing row when merged (§Ledger).
>
> **v2 changes (this revision):** ① the **entire Agno/agent layer** is in scope — autonomous cost-capped **Team worker** + **Agno session/memory** (no more Sprint-7 deferral); ② new **EPIC G — Infrastructure & Deployment** (Dokploy on the VPS) with a human guide; ③ roles formalized and **verboo** loaded with the S/M volume; ④ PM blind spots resolved — **real model IDs** (no `gpt-5.2`) + **UI hydration** (React Query invalidation + Supabase Realtime).

## §R — Roles & Cost Model

**Mateus — Human Orchestrator (Diretor de Prova).** Owns the Vision + final acceptance. Authorizes each wave. Performs the **human-only infra** (EPIC G): VPS shell, Dokploy dashboard, DNS, provider API keys, secrets, GitHub deploy webhook, enabling the `pg_cron` extension. Has final say on scope and merges-of-record sign-off.

**Claude / Opus — PM.** Maintains this plan; reviews **L/XL** task-plans before any code; double-checks finished tasks against the DoD; merges to `main`; opens waves; keeps the wave map conflict-free. Personally implements only the **XL** architectural keystones (E4 autonomous Team, E6 workflow).

**Engineers (route cheap work to cheap models — the #1 cost lever):**

| Engineer | Cost | Model(s) | Best at / gets |
| :-- | :-- | :-- | :-- |
| **codex** | high | strong coding model | **L** security-critical Python: `security.py`, `core_table.py`, RPC, routers, Agno store |
| **claude (Sonnet)** | mid-high | Sonnet 4.6 | **L** tasks needing product taste: Agno agents (doormen, shaper), autonomous-Team prompts, frontend dashboard/cards |
| **gemini** | mid | Gemini Pro/Flash | **M** tasks: `guards.py`, `audit.py`, realtime hooks, mid routers, Agno schema |
| **verboo** | **low** | **deepseek / MiMo / GLM / MiniMax (swappable)** | **the volume:** all **S** + most straightforward **M** — migrations, config, schemas, registry, client, wiring, deploy artifacts |

> Branch naming: `<engineer>/sprint6/<epic>/<desc>` — e.g. `verboo/sprint6/epicB/ai-decisions-queue`, `codex/sprint6/epicD/core-table-skill`.

## §P0 — DoD ↔ JTBD ↔ Tasks

| Cockpit Metric (Vision DoD) | JTBD | Delivered by |
| :-- | :-- | :-- |
| **Engine Ignition** (Dokploy boot, no leaks) | infra | A1, A2, **EPIC G** |
| **Sovereign Gateway** (FastAPI secure, JWT→`equipe_id`) | infra | A3–A5, E10 |
| **Deterministic Clean Outputs** (text→blueprint 100%) | **JTBD 1** | B4, C1–C4 |
| **Guarded Execution** (tenant-checked tools + audit queue) | **JTBD 3** | B1–B3, D1–D3 |
| *(Hero Story B — Autonomous Handover Loop + full Agno cognition)* | **JTBD 2** | E1–E10 (incl. **E4 autonomous Team**, **E5 memory**) + F1–F4 |

## §P1 — Scope (v2)

**In scope — all 3 JTBDs + the complete Agno cognition layer:**
1. **JTBD 1 Self-Shaping Track:** NL → validated `PipelineBlueprint` (Agno `output_schema`) → atomic `shape_pipeline` RPC → setup dashboard.
2. **JTBD 3 Sniper Tools:** guarded **Core-Table Skill** (Python port of `_shared/rule-engine.ts::executeActions`) + audit.
3. **JTBD 2 Cascade Doorman (full):** Tower→Floor→Worker Agno **Workflow**, with the **deterministic** dispatch *and* the **autonomous cost-capped Team** leaf, backed by **Agno session/memory persistence**. Driven by the **⚡ Sync button** and the **gated autonomous ingest loop**.
4. **Infra:** containerized service **deployed on Dokploy/VPS**, reachable over HTTPS via Traefik, secrets in Dokploy, `pg_cron` debounce tick.

**Still out of scope (Sprint 7):** a UI-managed `copilot_skills` table (v1 uses JSONB `enabled_skills`); horizontal scale-out + Redis cache fan-out (start at **1 replica**, in-process 60s TTL); multi-channel Realtime push beyond the in-app stream.

**PM note:** the autonomous loop ships **gated by `equipes.is_crm_agent_enabled` (off by default)**. The Sync button is the always-on, rep-supervised path and the primary demo for "Guarded Execution".

## §P2 — Locked technical answers

| Topic | Lock |
| :-- | :-- |
| Debounce | Stateless `due_at` marker on `copilot_ingest_queue` (B5) + `pg_cron` tick → `/ingest` (G5). No in-memory timers. |
| Pre-filter | Heuristic `worker.is_pipeline_relevant` (no tiny-model call). |
| Router↔identity | Tower Doorman routes by creating an `opportunity` (dedup on `(lead_id, pipeline_id)`). |
| DB access | `service_role` supabase-py for verbs; **`psycopg` pool to `DATABASE_URL` (session mode `:5432`)** only for **Agno storage/memory** (A4, E5). `shape_pipeline` is an in-DB RPC (atomic). |
| Agno session/memory | **Supabase Postgres, dedicated `agno` schema** (R&D Q5 Option A). Session keyed by `opportunity_id`. |
| Runtime models (blind spot B) | **No `gpt-5.2`.** Defaults: `doorman_model="gpt-4o-mini"`, `worker_model="gpt-4o"`, `shaper_model="gpt-4o"` — all overridable per-pipeline (`pipeline_agent_rules`) and via env. Documented cheap swaps: `deepseek-chat`, `glm-4-flash`, `claude-haiku` (doorman); `claude-sonnet-4-6`, `deepseek-reasoner` (worker/shaper). |
| UI hydration (blind spot A) | Mutations from `/sync` & `/approvals` are reflected via **React Query `invalidateQueries`** *and* a **Supabase Realtime** subscription on `opportunities` + `ai_decisions` (F2). No full-page refreshes. |

## §P3 — Reconciliation with existing scaffold

> **PM CORRECTION (2026-06-08):** the `python-agent/` scaffold **does not exist** on disk or in git — the Python service is **greenfield**. Bullets ①–② below were written against a presumed scaffold that was never committed. Net effect: every task that said *"Modify"* or *"Delete"* a `python-agent/app/*` file is a **Create** instead. There is no `main.py`/`jwt.py`/`deps.py`/`config.py` to reconcile or delete. No work added; this only removes a false premise. Affected: **A2** (create `config.py`), **A3** (create `security.py`+`deps.py`; no `jwt.py` to delete), **A4** (`get_supabase_admin` is authored fresh in `db.py`, not "moved"), **E10** (create `main.py`). All `Create` file sets and contracts otherwise stand.

- ~~`python-agent/app/main.py` imports non-existent routers~~ → **E10 creates `main.py` fresh** wiring `shape, sync, ingest, approvals`.
- ~~`python-agent/app/jwt.py` uses network `auth.get_user()`~~ → **A3 creates `security.py`** with local `SUPABASE_JWT_SECRET` HS256 decode (Vision Pillar 2). Nothing to delete.
- Migrations follow `db/CONVENTIONS.md` (additive, `equipe_id`, RLS, `updated_at`).
- Core-Table (**D3**) is a verb-for-verb port of `supabase/functions/_shared/rule-engine.ts::executeActions` — read it as the reference.

## §P4 — Canonical contracts (define once; all tasks reference these)

**`app/schemas.py`** (C1) — JTBD 1 blueprint **must** mirror `src/types/pipelines.ts`:
```python
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

CustomFieldType = Literal[
    "text", "number", "currency", "date", "boolean", "select",
    "multi_select", "url", "phone", "address",
    "property_ref", "company_ref", "contact_ref",   # exact union from src/types/pipelines.ts
]

class CustomFieldBlueprint(BaseModel):
    key: str                                          # LLM emits key; RPC mints field_id
    label: str
    type: CustomFieldType
    required: bool = False
    options: Optional[list[str]] = None               # only when type in {select, multi_select}
    position: int = Field(..., ge=0)
    description: Optional[str] = None

    @field_validator("key")
    @classmethod
    def snake_case(cls, v: str) -> str:
        if not v.islower() or not v.replace("_", "").isalnum():
            raise ValueError("key must be lowercase snake_case")
        return v

class StageBlueprint(BaseModel):
    name: str
    position: int = Field(..., ge=0)
    stage_type: Literal["open", "won", "lost"] = "open"
    color: str = "#64748b"
    max_idle_hours: Optional[int] = Field(None, gt=0)
    cadence_value: Optional[int] = Field(None, gt=0)
    cadence_unit: Optional[Literal["hours", "days"]] = None

    @model_validator(mode="after")
    def cadence_pair(self):
        if (self.cadence_value is None) != (self.cadence_unit is None):
            raise ValueError("cadence_value and cadence_unit must be set together")
        return self

class PipelineBlueprint(BaseModel):
    pipeline_name: str
    description: Optional[str] = None
    stages: list[StageBlueprint] = Field(..., min_length=1)
    custom_fields: list[CustomFieldBlueprint] = Field(default_factory=list)

    @model_validator(mode="after")
    def contiguous_positions(self):
        if sorted(s.position for s in self.stages) != list(range(len(self.stages))):
            raise ValueError("stage positions must be contiguous from 0")
        return self

# ---- JTBD 2 cascade decisions ----
class RouteDecision(BaseModel):
    contact_type: Literal["lead", "contact", "spam", "other"]
    pipeline_id: Optional[str] = None
    stage_id: Optional[str] = None
    confidence: float = Field(ge=0, le=1)
    extracted: dict = {}
    reason: str

class IntentDecision(BaseModel):
    relevant: bool
    automation_kind: Literal["none", "deterministic", "agentic"] = "none"
    skill: Optional[str] = None
    args: dict = {}
    urgency: Literal["normal", "urgent"] = "normal"
    confidence: float = Field(ge=0, le=1)
    reason: str

class ActionResult(BaseModel):
    success: bool
    detail: dict = {}
    error: Optional[str] = None
```

**Core-Table Skill** — `app/skills/core_table.py` (D3), bound to `(client, equipe_id, actor)`; every query carries `.eq("equipe_id", self.equipe_id)`:
```python
class CoreTableSkill:
    name = "core_table"
    def __init__(self, client, equipe_id: str, actor: str): ...   # actor='copilot' | rep uuid
    async def move_stage(self, opportunity_id, stage_type="open", stage_name_hint=None) -> ActionResult: ...
    async def set_status(self, opportunity_id, status) -> ActionResult: ...
    async def set_field(self, opportunity_id, field_id, value) -> ActionResult: ...           # opportunities.custom_data[field_id]
    async def set_contact_field(self, lead_id, key, value) -> ActionResult: ...               # leads.personal_custom_data[key]
    async def add_touchpoint(self, lead_id, touchpoint_type, content) -> ActionResult: ...
    async def add_note(self, lead_id, content) -> ActionResult: ...
    async def create_task(self, lead_id, title, due_in_hours=None) -> ActionResult: ...
    async def add_tag(self, lead_id, tag) -> ActionResult: ...
    async def trigger_webhook(self, url, payload) -> ActionResult: ...
    async def create_opportunity(self, lead_id, pipeline_id, stage_id=None) -> ActionResult: ...   # routing, dedup
```

**Guards** — `app/guards.py` (A5): `ALLOWED_TABLES = {opportunities, pipeline_stages_v2, custom_table_records, leads, tasks, lead_activities, touchpoints, opportunity_stage_history}`; `assert_table`, `assert_equipe(row, equipe_id)`, `GuardError`. **(PM correction 2026-06-08: `opportunity_stage_history` added to the whitelist during Wave 2 — D3's `move_stage` must follow-up-stamp `actor`/`changed_by_type` on the trigger-created history row, which the original §P4 set omitted. `tasks`/`lead_activities`/`touchpoints` have no `equipe_id` column; they are tenant-guarded via the `lead_id → leads` pre-fetch, not a row-level `equipe_id` filter.)**

**Security** — `app/security.py` (A3): `TenantContext(equipe_id, actor_user_id, role)`; `tenant_from_jwt(authorization)` — HS256 decode with `SUPABASE_JWT_SECRET` (`audience="authenticated"`), `actor_user_id = sub`, resolve `equipe_id` from `profiles`.

**Audit** — `app/audit.py` (D1): `record_decision(client, *, equipe_id, lead_id, opportunity_id, pipeline_id, agent_role, decision_type, output_action, confidence, status, actor) -> id`. `status ∈ {auto_applied, pending_approval, approved, rejected, executed, failed}`.

**Agno store** — `app/agno_store.py` (E5): `get_storage()` / `get_memory()` returning Agno Postgres backends pointed at `DATABASE_URL`, schema `agno`, sessions keyed by `opportunity_id`.

**Autonomous Team** — `app/cascade/autonomous_team.py` (E4): `async def run_autonomous(*, ctx, decision, opportunity, lead, rules) -> ActionResult` — an Agno `Team`/reasoning `Agent` whose **only tools are the pipeline's active skills** (Core-Table verbs), bounded by `rules["autonomy_cost_ceiling"]` (max tool-calls/iterations; `None` ⇒ skip, deterministic-only) and `worker_model`. Returns a single `ActionResult` summarizing applied mutations; **all** writes still go through the guarded Core-Table tools.

---

## §P5 — Task catalogue

### EPIC A — Engine Ignition & Sovereign Gateway

#### A1a — Python project + lockfile · **S** · verboo
**Create:** `python-agent/pyproject.toml`, `python-agent/.dockerignore`, `python-agent/uv.lock`, `python-agent/README.md`
**Contract:** deps `fastapi, uvicorn[standard], agno, openai, pyjwt, pydantic>=2, pydantic-settings, supabase, psycopg[binary], python-dotenv`; dev `pytest, pytest-asyncio, httpx, respx`; Python 3.12. `.dockerignore` excludes `.git .venv .env __pycache__/ *.pyc node_modules/ dist/`. Run `uv lock`.
**Accept:** `uv sync --frozen` succeeds.

#### A1b — Production Dockerfile (uv multi-stage) · **M** · codex
**Create:** `python-agent/Dockerfile`
**Contract:** pinned `ghcr.io/astral-sh/uv:0.11.19-python3.12-trixie-slim` builder → `python:3.12-slim-trixie` runtime; non-root `appuser`; `CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--workers","2","--proxy-headers","--no-access-log"]`. No secrets baked.
**Accept:** `docker build python-agent` succeeds; image runs as non-root; no `.env` in image.

#### A2 — Config surface (real model IDs + DB URL) · **S** · verboo
**Modify:** `python-agent/app/config.py`
**Contract:** add `supabase_jwt_secret`, `agent_internal_token`, `database_url` (session-mode `:5432`), `agno_schema="agno"`, `doorman_model="gpt-4o-mini"`, `worker_model="gpt-4o"`, `shaper_model="gpt-4o"`, `ingest_enabled=False`. Keep existing keys. Comment the documented cheap swaps (§P2). **Resolves PM blind spot B — no `gpt-5.2`.**
**Accept:** imports; all keys present; loads from `.env`.

#### A3 — Security: local JWT decode → tenant context · **M** · codex
**Create:** `python-agent/app/security.py` · **Modify:** `python-agent/app/deps.py` · **Delete:** `python-agent/app/jwt.py`
**Contract:** `TenantContext` + `tenant_from_jwt` per §P4; `deps.get_tenant_context` returns `TenantContext`. (`get_supabase_admin` moves to `db.py`/A4 before deletion.)
**Accept:** valid token → context; tampered/expired/bad-audience → 401; no tenant → 403; self-signed HS256 unit tests.

#### A4 — DB access (service client + psycopg pool) · **M** · codex
**Create:** `python-agent/app/db.py`
**Contract:** memoised `get_service_client() -> Client` (supabase-py) + `get_db()` dependency; **plus** a lazily-initialised `psycopg` connection pool to `DATABASE_URL` (session mode) exposed as `get_pg_pool()` for Agno storage (E5). No `pg_cron` here.
**Accept:** memoised client; pool created lazily; no network at import.

#### A5 — Guard layer · **M** · gemini
**Create:** `python-agent/app/guards.py`
**Contract:** `ALLOWED_TABLES`, `assert_table`, `assert_equipe`, `GuardError` per §P4.
**Accept:** non-whitelisted table / cross-tenant / None row raise; matches pass; full unit coverage.

### EPIC B — Schema Deltas (per `db/CONVENTIONS.md`)

#### B1 — Extend `pipeline_agent_rules` · **S** · verboo
**Create:** `supabase/migrations/20260608000000_sprint6_copilot_config.sql`
**Contract:** R&D §5.1 `ALTER TABLE` — `reasoning_enabled, tools_enabled, enabled_skills, confidence_threshold (CHECK 0..1), autonomy_cost_ceiling, doorman_model, worker_model`. Idempotent + comments.
**Accept:** idempotent apply; defaults/checks correct.

#### B2 — `ai_decisions` → audit + approval queue · **S** · verboo
**Create:** `supabase/migrations/20260608000100_sprint6_ai_decisions_queue.sql`
**Contract:** R&D §5.2 `ALTER TABLE` — `equipe_id, opportunity_id, pipeline_id, agent_role, status (CHECK), actor, resolved_by, resolved_at`; partial index `where status='pending_approval'`; backfill nulls → `auto_applied`.
**Accept:** idempotent; CHECK rejects bad status; index present.

#### B3 — Audit-actor on stage history · **S** · verboo
**Create:** `supabase/migrations/20260608000200_sprint6_stage_history_actor.sql`
**Contract:** on `public.opportunity_stage_history` add `actor text` + `changed_by_type text default 'team' CHECK (in 'team','copilot','automation','import')` (R&D §5.3).
**Accept:** idempotent; existing trigger unaffected.

#### B4 — `shape_pipeline` atomic RPC · **L** · codex · **PM approval**
**Create:** `supabase/migrations/20260608000300_sprint6_shape_pipeline_rpc.sql`
**Contract:** `create or replace function public.shape_pipeline(p_equipe_id uuid, p_payload jsonb) returns uuid language plpgsql security definer set search_path=public` — adapt R&D Addendum §E to **live columns**: insert `pipelines (equipe_id, name, description, custom_fields_schema)` with **server-minted `field_id`** per field (`{field_id,key,label,type,required,options,position,is_deleted:false}`), then loop `stages` → `pipeline_stages_v2 (equipe_id, pipeline_id, name, color, position, stage_type, max_idle_hours, cadence_value, cadence_unit)`. One transaction. Return `pipeline_id`. `grant execute to service_role`.
**Accept:** valid payload → 1 pipeline + N stages + minted field_ids, all-or-nothing; mid-payload error rolls back; positions preserved.

#### B5 — `copilot_ingest_queue` (stateless debounce) · **S** · verboo
**Create:** `supabase/migrations/20260608000400_sprint6_ingest_queue.sql`
**Contract:** table `copilot_ingest_queue (id, equipe_id, lead_id, pipeline_id, conversation_ref text, due_at timestamptz, processed_at timestamptz, created_at)` + standard `equipe_id`/RLS + index on `(due_at) where processed_at is null`. (The `pg_cron` tick that consumes it is G5.)
**Accept:** idempotent; index present; RLS enabled.

#### B6 — Agno session/memory schema · **M** · gemini
**Create:** `supabase/migrations/20260608000500_sprint6_agno_schema.sql`
**Contract:** `create schema if not exists agno;` + `grant usage on schema agno to service_role;` + `alter default privileges in schema agno grant all on tables to service_role;`. Agno auto-creates its own session/memory tables here at runtime (E5); this migration only provisions the schema + grants. Document that no public RLS applies (service_role only, never client-exposed).
**Accept:** schema exists; service_role can create/select tables in it.

### EPIC C — JTBD 1: Self-Shaping Track  *(DoD: Deterministic Clean Outputs)*

#### C1 — Schemas (blueprint + decisions) · **M** · verboo
**Create:** `python-agent/app/schemas.py`
**Contract:** the full §P4 schemas block. Union **must equal** `src/types/pipelines.ts::CustomFieldType`.
**Accept:** non-contiguous positions raise; mismatched cadence pair raises; non-snake key raises; valid blueprint round-trips `.model_dump()`.

#### C2 — Track Shaper agent · **L** · claude (Sonnet) · **PM approval**
**Create:** `python-agent/app/cascade/track_shaper.py`, `python-agent/app/cascade/__init__.py`
**Contract:** `async def shape_track(*, prompt, locale="pt-BR", model_id) -> PipelineBlueprint`. Agno `Agent(model=OpenAIChat(id=model_id), output_schema=PipelineBlueprint, telemetry=False)`; PT-BR system prompt (snake_case keys, contiguous positions, infer SLA/cadence). Pure generation (no DB). Validation failure → typed error for 422.
**Accept:** stubbed model → valid blueprint; Story-A prompt yields ≥3 stages + ≥2 fields; invalid output surfaces `ValidationError`.

#### C3 — Shape route (preview + apply) · **L** · codex · **PM approval**
**Create:** `python-agent/app/routers/shape.py`
**Contract:** `POST /api/v1/shape/preview {prompt}` → blueprint JSON (no write); `POST /api/v1/shape/apply {blueprint}` → re-validate → `shape_pipeline` RPC with `ctx.equipe_id` → `{pipeline_id}`. Validation failure → `422` (never partial). `ctx = Depends(get_tenant_context)`.
**Accept:** preview returns valid blueprint; apply asserts `p_equipe_id = ctx.equipe_id` (mocked RPC); bad blueprint → 422.

#### C4 — Setup dashboard UI · **L** · claude (Sonnet) · **PM approval**
**Create:** `src/components/crm/copilot/TrackShaperDialog.tsx`, `src/hooks/useTrackShaper.ts` · **Modify:** `src/components/crm/pipeline-settings/PipelineList.tsx` (one insertion: "✨ Criar com Copilot")
**Contract:** dark minimal dialog (Story A): `Textarea` → "Gerar" → `copilot.shapePreview` → render proposed columns + fields → "Criar pipeline" → `copilot.shapeApply` → invalidate pipelines query + toast.
**Accept:** `npm run build` clean; paragraph → live preview; confirm → pipeline appears; only owned files changed.

### EPIC D — JTBD 3: Sniper CRM Tools  *(DoD: Guarded Execution)*

#### D1 — Audit writer · **M** · gemini
**Create:** `python-agent/app/audit.py`
**Contract:** `record_decision(...)` per §P4 (`confidence`→`confidence_score`, `output_action` jsonb, new cols). **Depends:** B2, A4.
**Accept:** mocked-client test asserts key mapping + returned id.

#### D2 — Skill registry · **S** · verboo
**Create:** `python-agent/app/skills/registry.py`, `python-agent/app/skills/__init__.py`
**Contract:** `register(skill_cls)`, `get_skill(name)`, `active_skills(enabled_skills)` — in-process, driven by JSONB `pipeline_agent_rules.enabled_skills`.
**Accept:** register→get round-trips; unknown raises; `active_skills([])` empty.

#### D3 — Core-Table Skill (Guarded CRUD) · **L** · codex · **PM approval**
**Create:** `python-agent/app/skills/core_table.py`
**Reference:** `_shared/rule-engine.ts::executeActions` (port verb-for-verb).
**Contract:** `CoreTableSkill` per §P4. Every query `.eq("equipe_id", self.equipe_id)`; per-verb try/except → `ActionResult`. `set_field`/`set_contact_field` fetch-merge-write JSONB (preserve siblings; `custom_data` by `field_id`, `personal_custom_data` by `key`). `move_stage` resolves stage by `(equipe_id, pipeline_id, stage_type, name_hint)`, updates `stage_id`+`stage_entered_at`, then stamps `opportunity_stage_history.actor`/`changed_by_type` (B3). `create_opportunity` dedups `(lead_id, pipeline_id)`. `guards.assert_table` before any touch; `guards.assert_equipe` on every fetched row.
**Accept:** per-verb tests: correct table, `equipe_id` filter everywhere, JSONB merge preserves siblings, cross-tenant → guard fail, `add_tag` dedups, `move_stage` stamps actor.

### EPIC E — JTBD 2: Cascade Doorman + Full Agno Cognition  *(Hero Story B)*

#### E1 — Tower Doorman · **L** · claude (Sonnet) · **PM approval**
**Create:** `python-agent/app/cascade/tower_doorman.py`
**Contract:** `async def classify_and_route(*, ctx, conversation, lead, pipelines, model_id) -> RouteDecision`. Agno `Agent(output_schema=RouteDecision, telemetry=False)`. No DB writes.
**Accept:** stubbed model → valid `RouteDecision`; `pipeline_id` ∈ supplied set or `None`; confidence ∈ [0,1].

#### E2 — Floor Doorman · **L** · claude (Sonnet) · **PM approval**
**Create:** `python-agent/app/cascade/floor_doorman.py`
**Contract:** `async def triage_intent(*, ctx, conversation, opportunity, pipeline_rules, model_id) -> IntentDecision`. Prompt carries `extraction_hints` + `enabled_skills`. Out-of-registry skill → downgrade to `relevant=False`. No DB writes.
**Accept:** stubbed model → valid `IntentDecision`; out-of-registry skill downgraded with reason.

#### E3 — Worker (deterministic dispatch + escalation router) · **M** · gemini
**Create:** `python-agent/app/cascade/worker.py`
**Contract:** `async def run_worker(*, ctx, decision, opportunity, lead, rules) -> ActionResult`. `deterministic` → `registry.get_skill(decision.skill)` bound to `(client, ctx.equipe_id, actor)`, dispatch the verb in `decision.args`. `agentic` → **delegate to `autonomous_team.run_autonomous(...)`** (E4). `none` → no-op success. Includes `is_pipeline_relevant(conversation) -> bool` heuristic.
**Accept:** deterministic dispatches the right verb; agentic calls `run_autonomous` (mocked); none is no-op.

#### E4 — Autonomous Team worker (cost-capped) · **XL** · claude (Opus) · **PM approval**
**Create:** `python-agent/app/cascade/autonomous_team.py`
**Contract:** `run_autonomous` per §P4. Agno `Team`/reasoning `Agent` whose tools are the pipeline's **active Core-Table skills only**, bounded by `rules["autonomy_cost_ceiling"]` (`None` ⇒ return `ActionResult(success=False, error="autonomy_disabled")`), capped iterations/tool-calls, `worker_model`. Persists session via Agno memory (E5) keyed by `opportunity_id`. **All** mutations route through guarded Core-Table tools (no raw DB). Returns one summarizing `ActionResult`.
**Accept:** with `autonomy_cost_ceiling=None` → disabled result; with a ceiling + stubbed model that calls a tool → mutation runs via Core-Table and is audited; exceeding the cap halts gracefully.

#### E5 — Agno session/memory wiring · **M** · codex
**Create:** `python-agent/app/agno_store.py`
**Contract:** `get_storage()`/`get_memory()` per §P4 — Agno Postgres backends on `get_pg_pool()` (A4), schema `agno` (B6), session id = `opportunity_id`. Doormen/Team accept an optional storage so context persists across bursts.
**Accept:** storage initialises against a test PG (or mocked); two calls with the same `opportunity_id` share session state.

#### E6 — Agno Workflow orchestration · **XL** · claude (Opus) · **PM approval**
**Create:** `python-agent/app/cascade/workflow.py`
**Contract:** `async def run_cascade(*, ctx, lead_id, opportunity_id, pipeline_id, trigger) -> dict`. ①→②→③: load lead/conversation/rules → pre-filter (skip if irrelevant & `trigger!="sync"`) → Tower (route via `create_opportunity` if `conf≥threshold` or sync; else `record_decision(pending_approval, tower_doorman)`) → Floor → gate on per-pipeline `confidence_threshold` (sync forces auto-apply): ≥ run Worker (which may escalate to E4) + `record_decision(executed)`; < `record_decision(pending_approval, floor_doorman)` → notify (note via Core-Table; `urgent` flags the decision for Realtime). `actor = ctx.actor_user_id if trigger=="sync" else "copilot"`.
**Accept:** integration test (stubbed doormen + mocked client): (a) sync → route+execute+audit `executed`; (b) low-conf background → `pending_approval`, no mutation; (c) irrelevant background → no agent calls; (d) agentic intent → Worker delegates to E4.

#### E7 — Ingest route (gated debounce consumer) · **M** · codex
**Create:** `python-agent/app/routers/ingest.py`
**Contract:** `POST /api/v1/ingest`: if `not settings.ingest_enabled` → `503`; auth via `agent_internal_token` header; act only when `equipes.is_crm_agent_enabled` → `run_cascade(trigger="ingest")`. Consumes settled `copilot_ingest_queue` rows (B5), marks `processed_at`.
**Accept:** default → 503; flag on + valid token + agent-enabled team + mocked cascade → 202; bad token → 401; toggle-off team → no cascade.

#### E8 — Sync route · **M** · codex
**Create:** `python-agent/app/routers/sync.py`, `python-agent/app/routers/__init__.py`
**Contract:** `POST /api/v1/sync {opportunity_id?, lead_id, pipeline_id?}`; `ctx = Depends(get_tenant_context)`; `run_cascade(trigger="sync")` (forces auto-apply, ignores team toggle). Returns `{decision_id, status, result}`.
**Accept:** mocked cascade → 200 + body; no JWT → 401; cross-tenant lead blocked by guard.

#### E9 — Approvals route · **M** · gemini
**Create:** `python-agent/app/routers/approvals.py`
**Contract:** `POST /api/v1/approvals/{decision_id}/resolve {action}`; load row, `assert_equipe`. Approve → execute stored `output_action` via Worker/Core-Table → `status='executed'|'failed'`, set `resolved_by/resolved_at`. Reject → `status='rejected'` only.
**Accept:** approve runs+flips; reject flips without mutation; cross-tenant → 403; unknown → 404.

#### E10 — Wire `main.py` · **S** · verboo · *(after C3, E7, E8, E9)*
**Modify:** `python-agent/app/main.py`
**Contract:** replace dead imports with `shape, sync, ingest, approvals`; `include_router` each under `/api/v1`; keep `/health` + CORS.
**Accept:** boots clean; OpenAPI lists `/shape/preview`, `/shape/apply`, `/sync`, `/ingest`, `/approvals/{id}/resolve`; `/health` ok.

### EPIC F — Frontend operator surfaces

#### F1 — Copilot API client · **S** · verboo
**Create:** `src/services/copilot.ts`
**Contract:** base URL `import.meta.env.VITE_COPILOT_URL`; bearer = `supabase.auth.getSession()` token. Export `shapePreview`, `shapeApply`, `syncOpportunity`, `resolveApproval`. Add `VITE_COPILOT_URL` to `.env.example`.
**Accept:** `tsc` clean; attaches bearer; throws on non-2xx.

#### F2 — Realtime hydration hooks (blind spot A) · **M** · gemini
**Create:** `src/hooks/useCopilotRealtime.ts`
**Contract:** subscribe to Supabase Realtime on `opportunities` and `ai_decisions` (filtered by `equipe_id`); on change → `queryClient.invalidateQueries` for the opportunities + approvals query keys. Export a hook the Kanban/workspace mounts once. **No full-page refresh.**
**Accept:** `tsc` clean; a simulated row change invalidates the right query keys; subscription cleaned up on unmount.

#### F3 — Sync button on the deal · **M** · verboo
**Modify:** `src/components/crm/OpportunityDetailModal.tsx`
**Contract:** "⚡ Sync com Copilot" button in `DialogFooter` (reuse imported `Sparkles`/`Button`/`toast`/`Loader2`) → `copilot.syncOpportunity(...)` → loading → success toast + invalidate opportunities query (works with F2). Only this file.
**Accept:** `npm run build` clean; button works; card refreshes live.

#### F4 — Approval cards · **L** · claude (Sonnet) · **PM approval**
**Create:** `src/components/crm/copilot/CopilotApprovalCard.tsx`, `src/components/crm/copilot/CopilotApprovalsPanel.tsx`, `src/hooks/useCopilotApprovals.ts` · **Modify:** `src/components/crm/PipelineWorkspace.tsx` (mount panel + the F2 realtime hook — one insertion)
**Contract:** `useCopilotApprovals(pipelineId)` reads `ai_decisions` where `status='pending_approval'` (RLS scopes `equipe_id`) via React Query, kept live by F2. Card shows `output_action`/`reason`/`confidence` + Approve/Reject → `copilot.resolveApproval`. Panel lists cards; mount in `PipelineWorkspace`.
**Accept:** `npm run build` clean; pending decisions render; resolve removes the card live; no console errors.

### EPIC G — Infrastructure & Deployment (Dokploy on the VPS)

> Most of EPIC G is **Mateus's hands-on work** (VPS/dashboard access). Engineers prepare the artifacts and SQL; Mateus performs the dashboard/DNS/secret steps. The step-by-step is in **§INFRA GUIDE** below.

#### G1 — Deploy artifacts + env template · **S** · verboo
**Create:** `python-agent/.env.example`, `python-agent/DEPLOY.md`
**Contract:** `.env.example` lists every runtime var (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`, `OPENAI_API_KEY`, `AGENT_INTERNAL_TOKEN`, `INGEST_ENABLED`, model overrides, `CORS_ORIGINS`). `DEPLOY.md` = condensed copy of §INFRA GUIDE.
**Accept:** every var the code reads appears in `.env.example`.

#### G2 — [HUMAN] Dokploy application + Git auto-deploy · **Mateus**
Create the Dokploy **Application** linked to the repo, root `/python-agent`, enable **Auto Deploy**, register the generated webhook in GitHub (`push` → `main`). *(Guide step 1–2.)*

#### G3 — [HUMAN] Domain + Traefik SSL · **Mateus**
Point a subdomain (e.g. `agent.solosales.io`) at the VPS; add it in the app's **Domains** tab → Traefik issues Let's Encrypt SSL → proxies `:443` to container `:8000`. *(Guide step 3.)*

#### G4 — [HUMAN] Secrets in Dokploy · **Mateus**
Add all `.env.example` vars in the app **Environment** tab (never in the image). `INGEST_ENABLED=false` for first deploy. *(Guide step 4.)*

#### G5 — pg_cron debounce tick · **S (SQL) · verboo** + **[HUMAN] enable extension · Mateus**
**Create:** `supabase/migrations/20260608000600_sprint6_ingest_cron.sql`
**Contract:** `create extension if not exists pg_cron;` then `cron.schedule` a 1-minute job that `select net.http_post(...)` to `<agent-domain>/api/v1/ingest` for settled `copilot_ingest_queue` rows (with the `agent_internal_token`). Ship **commented/disabled** until the domain + token exist; Mateus enables `pg_cron`/`pg_net` in the Supabase dashboard and uncomments. *(Guide step 6.)*
**Accept:** migration applies; job is documented; stays inert until enabled.

#### G6 — Frontend prod wiring · **S** · verboo
**Modify:** `python-agent/app/config.py` CORS default note + frontend `.env.example` (root) adding `VITE_COPILOT_URL`
**Contract:** set production `CORS_ORIGINS` to include the app domain; document `VITE_COPILOT_URL=https://agent.<domain>` for the Vite build.
**Accept:** CORS allows the prod origin; `VITE_COPILOT_URL` documented.

#### G7 — [HUMAN] Deploy smoke test · **Mateus** (verboo provides the script)
`curl https://agent.<domain>/api/v1/health` → `{"status":"ok"}`; then a real ⚡ Sync from the UI writes an `ai_decisions` row. *(Guide step 7.)*

---

## §INFRA GUIDE — what **Mateus** does, click by click

1. **VPS + Dokploy ready.** Confirm Dokploy is installed on the VPS and reachable. Have the repo connected to your Git provider.
2. **Create the app + auto-deploy.** Dokploy → **Create Application** → link repo → set **Build Path / Root** to `python-agent` → **Deployments → enable Auto Deploy** → copy the webhook URL → GitHub repo **Settings → Webhooks** → add it (`application/json`, event: `push`) → branch `main`. Push to `main` now triggers a rebuild.
3. **Domain + SSL.** In your DNS, add an `A` record `agent.<yourdomain>` → VPS IP. In Dokploy app → **Domains** → add `agent.<yourdomain>`, container port `8000`, enable HTTPS → Traefik auto-provisions Let's Encrypt.
4. **Secrets.** Dokploy app → **Environment** → paste every var from `python-agent/.env.example` (real values). Keep `INGEST_ENABLED=false` for the first deploy. **Never** put secrets in the Dockerfile or repo.
5. **First deploy.** Trigger a deploy (push or the dashboard button). Watch logs for a clean Uvicorn boot. Hit `https://agent.<yourdomain>/api/v1/health`.
6. **Turn on the autonomous loop (only when ready).** In Supabase dashboard → **Database → Extensions** enable `pg_cron` + `pg_net`. Uncomment the G5 cron migration (set the domain + `agent_internal_token`), apply it. Flip `INGEST_ENABLED=true` and turn on `equipes.is_crm_agent_enabled` for a pilot team.
7. **Smoke test.** `curl …/health`; open a deal → **⚡ Sync com Copilot** → confirm the card updates live and a row lands in `ai_decisions`.

> Tell the PM when steps 2–5 are done so the team can run G7 + the live acceptance pass.

---

## §P6 — Wave Map (disjoint file ownership within each wave)

```
Wave 0  Foundations & migrations (parallel)
  A1a uv·verboo  A1b Dockerfile·codex  A2 config·verboo
  B1·verboo  B2·verboo  B3·verboo  B4 RPC·codex  B5 queue·verboo  B6 agno-schema·gemini
  C1 schemas·verboo  D2 registry·verboo  G1 deploy-artifacts·verboo
        ▼
Wave 1  Service core (parallel)              ▶ A2
  A3 security(+del jwt)·codex  A4 db+pool·codex  A5 guards·gemini  D1 audit·gemini
        ▼
Wave 2  Skills · shaper · memory (parallel)  ▶ W1
  D3 core_table·codex  C2 track_shaper·claude  E5 agno_store·codex
        ▼
Wave 3  Doormen (parallel)                   ▶ W2
  E1 tower·claude  E2 floor·claude  E3 worker·gemini
        ▼
Wave 4  Autonomous Team (solo, the Agno keystone)  ▶ W3
  E4 autonomous_team·claude(Opus)
        ▼
Wave 5  Orchestration (solo)                 ▶ W4
  E6 workflow·claude(Opus)
        ▼
Wave 6  Routers (C3,E7,E8,E9 parallel → E10 solo)  ▶ W5 (+B4,C2)
  C3 shape·codex  E7 ingest·codex  E8 sync·codex  E9 approvals·gemini  →  E10 main·verboo
        ▼
Wave 7  Frontend (F1 → F2,F3,F4,C4 parallel)       ▶ W6
  F1 client·verboo  →  F2 realtime·gemini  F3 sync-btn·verboo  F4 cards·claude  C4 dashboard·claude
        ▼
Wave 8  Deploy (Human-led)                    ▶ W7 merged + built
  G2,G3,G4·Mateus  G5 cron(SQL verboo + enable Mateus)  G6 fe-env·verboo  G7 smoke·Mateus
```

**Critical paths:** JTBD 1 → `A2→A4→B4→C2→C3→F1→C4`; JTBD 3 → `A2→A4/A5→D3→E6→E8→F1→F3`; Agno cognition → `D3→E5→E4→E6`.

**verboo load (the volume):** A1a, A2, B1, B2, B3, B5, C1, D2, G1, E10, F1, F3, G5(SQL), G6 — 14 tasks. **codex:** A1b, A3, A4, B4, D3, C3, E5, E7, E8 — 9. **gemini:** A5, D1, B6, E3, E9, F2 — 6. **claude (Sonnet):** C2, C4, E1, E2, F4 — 5. **claude (Opus / PM):** E4, E6 — 2 + all reviews/merges.

---

## §P7 — Definition of Done (maps to the Vision's 4 Cockpit Metrics)

- [ ] **Engine Ignition** — `docker build` ok; service **deployed on Dokploy/VPS**, reachable at `https://agent.<domain>/api/v1/health`; non-root; secrets only in Dokploy env (A1, A2, EPIC G).
- [ ] **Sovereign Gateway** — JWT verified locally via `SUPABASE_JWT_SECRET`; `equipe_id` injected from token, never the client; `jwt.py` deleted; every Core-Table query carries `equipe_id`; non-whitelisted/cross-tenant rejected by tests (A3–A5, D3).
- [ ] **Deterministic Clean Outputs (JTBD 1)** — `/shape/preview` turns a PT-BR paragraph into a valid `PipelineBlueprint`; `/shape/apply` mints pipeline + stages + `field_id`s atomically; invalid → 422 (never partial); setup dashboard demos Story A (B4, C1–C4, F1).
- [ ] **Guarded Execution (JTBD 3)** — all `executeActions` verbs ported with tenant guards + sibling-safe JSONB merges; ⚡ Sync runs Tower→Floor→Worker on one deal and writes an `ai_decisions` row with `actor = rep uuid`; low-confidence background → `pending_approval` → approval card resolves it (B1–B3, D1–D3, E1–E9, F2–F4).
- [ ] **Full Agno cognition** — Worker escalates `agentic` intents to the **cost-capped autonomous Team** (E4), bounded by `autonomy_cost_ceiling`, with all writes through guarded tools; **Agno session/memory** persists per `opportunity_id` in the `agno` schema (E5, B6).
- [ ] **UI hydration (blind spot A)** — Sync/approval mutations reflect live via React Query invalidation + Supabase Realtime on `opportunities`/`ai_decisions`; no full-page refresh (F2–F4).
- [ ] **Coexistence** — `analyze-message` + all edge functions untouched and passing; `/ingest` + autonomous loop gated by `is_crm_agent_enabled` (off by default).
- [ ] **Frontend builds** — `npm run build` / `tsc` clean; only assigned files changed.
- [ ] **Ledger** — one billing row per merged task in `Planning/billing.md` with the correct tier.

---

## 📊 LEDGER HOOKS

Tick `[x]` when merged + add a row to `Planning/billing.md` (date · sprint · task · engineer/model · tier).

- [x] A1a · uv project + lockfile · S · verboo
- [x] A1b · Dockerfile · M · codex
- [x] A2 · config (real models + DB URL) · S · verboo
- [x] A3 · security.py (+del jwt.py) · M · codex
- [x] A4 · db.py (client + pg pool) · M · codex
- [x] A5 · guards.py · M · gemini
- [x] B1 · pipeline_agent_rules migration · S · verboo
- [x] B2 · ai_decisions queue migration · S · verboo
- [x] B3 · stage_history actor migration · S · verboo
- [x] B4 · shape_pipeline RPC · L · codex
- [x] B5 · copilot_ingest_queue migration · S · verboo
- [x] B6 · agno schema migration · M · gemini
- [x] C1 · schemas.py · M · verboo
- [x] C2 · cascade/track_shaper.py · L · claude (Sonnet)
- [ ] C3 · routers/shape.py · L · codex
- [ ] C4 · setup dashboard UI · L · claude (Sonnet)
- [x] D1 · audit.py · M · gemini
- [x] D2 · skills/registry.py · S · verboo
- [x] D3 · skills/core_table.py · L · codex
- [x] E1 · cascade/tower_doorman.py · L · claude (Sonnet)
- [x] E2 · cascade/floor_doorman.py · L · claude (Sonnet)
- [x] E3 · cascade/worker.py · M · gemini
- [x] E4 · cascade/autonomous_team.py · XL · claude (Opus)
- [x] E5 · agno_store.py (session/memory) · M · codex
- [x] E6 · cascade/workflow.py · XL · claude (Opus)
- [ ] E7 · routers/ingest.py · M · codex
- [ ] E8 · routers/sync.py · M · codex
- [ ] E9 · routers/approvals.py · M · gemini
- [ ] E10 · main.py wiring · S · verboo
- [ ] F1 · services/copilot.ts · S · verboo
- [ ] F2 · useCopilotRealtime.ts · M · gemini
- [ ] F3 · Sync button (OpportunityDetailModal) · M · verboo
- [ ] F4 · approval cards · L · claude (Sonnet)
- [x] G1 · deploy artifacts + .env.example · S · verboo
- [ ] G2 · [HUMAN] Dokploy app + auto-deploy · Mateus
- [ ] G3 · [HUMAN] domain + Traefik SSL · Mateus
- [ ] G4 · [HUMAN] secrets in Dokploy · Mateus
- [ ] G5 · pg_cron debounce tick (SQL verboo + enable Mateus) · S
- [ ] G6 · frontend prod wiring · S · verboo
- [ ] G7 · [HUMAN] deploy smoke test · Mateus

---

*Plan v2 by PM (Claude / Opus) · 2026-06-07 · full Agno cognition layer + Dokploy infra; verboo loaded with the S/M volume; PM blind spots A (UI hydration) & B (real model IDs) resolved. Grounded against live v2 schema, `src/types/pipelines.ts`, the `python-agent/` scaffold, and `_shared/rule-engine.ts`. Engineers: read your task + the Vision, raise plan corrections before code (L/XL need PM sign-off), then wait for the PM to open your wave.*
