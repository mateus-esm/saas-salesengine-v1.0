# 💰 Project Billing & Spending Tracker

Tracks the cost of AI agents across sprints. **No token math, no dashboards** — every task is a flat tier, the tier sets the price.

## 📋 How to log (Engineers)

When you finish a task, add **one row** to the ledger below with your task's tier letter. The R$ comes from the table — you don't calculate anything.

## 🎚️ Tier Price Table

| Tier | Typical work | Est. R$ |
| :--- | :----------- | :------ |
| **S** | Copy edits, column deletes, mask audits, merges, doc updates | R$ 5 |
| **M** | One hook, one focused component change | R$ 12 |
| **L** | Hook + integration across several files | R$ 20 |
| **XL** | Cross-cutting / architecture / atomic transactions | R$ 28 |

*Calibrated from real Sprint 4 / 5.5 history. Recalibrate the four numbers anytime — nothing else changes. (Flat tiers slightly overstate cost when a cheap model does an S task; that's intentional and conservative.)*

## 💸 Cost Ledger

| Date       | Sprint   | Task                          | Agent / Model | Tier | Est. R$ |
| :--------- | :------- | :---------------------------- | :------------ | :--- | :------ |
| _add rows below as tasks complete_ | | | | | |
| 2026-08-09 | 7.2 | W3 T12 White-label sweep + guard | Verboo / deepseek-v4-flash | M | R$ 12 |
| 2026-08-09 | 7.2 | W2 T11 Billing instances section | Verboo / deepseek-v4-flash | M | R$ 12 |
| 2026-08-09 | 7.2 | W2 T8 Channels page + Solo card | Verboo / deepseek-v4-flash | L | R$ 20 |
| 2026-08-09 | 7.2 | W2 T9 Knowledge Base upload UI | Verboo / deepseek-v4-flash | M | R$ 12 |
| 2026-08-09 | 7.2 | W2 T10 Usage page real data | Verboo / deepseek-v4-flash | M | R$ 12 |
| 2026-08-09 | 7.2 | W2 T7 Model selector fix | Verboo / deepseek-v4-flash | M | R$ 20 |
| 2026-08-09 | 7.2 | W2 T6 Settings page full parity | Verboo / deepseek-v4-flash | L | R$ 24 |
| 2026-08-09 | 7.2 | W1 T5 Env fail-fast + netlify.toml | Verboo / deepseek-v4-flash | S | R$ 10 |
| 2026-08-09 | 7.2 | W1 T4 manage-agent-training DOCUMENT + Storage | Verboo / deepseek-v4-flash | L | R$ 24 |
| 2026-08-09 | 7.2 | W1 T3 fetch-gpt-credits real data | Verboo / deepseek-v4-flash | M | R$ 20 |
| 2026-08-09 | 7.2 | W1 T2 manage-agent-channels real fetch | Verboo / deepseek-v4-flash | M | R$ 20 |
| 2026-08-09 | 7.2 | W1 T1 manage-agent-settings → /settings + catalog | Verboo / deepseek-v4-flash | XL | R$ 40 |
| 2026-08-08 | 7.2 | W0 T0 Live API spike + DOCUMENT round-trip | Verboo / deepseek-v4-flash | M | R$ 12 |
| 2026-07-04 | 7 | W0 Spike API reference + migration + infra checklist (PM) | Claude / Fable 5 | L | R$ 20 |
| 2026-07-04 | 7 | T3 manage-agent-channels CRUD (create/remove/qr) | Claude SDD / implementer | M | R$ 12 |
| 2026-07-04 | 7 | T4 Intenções mapIntentionBody + IntentionWizard fix | Claude SDD / implementer | M | R$ 12 |
| 2026-07-04 | 7 | T1 manage-solo-instances lifecycle (create/connect/status/logout/delete) | Claude SDD / implementer | L | R$ 20 |
| 2026-07-04 | 7 | T2 solo-wpp-webhook ingest (connection+messages, dedup, opportunity+AI parity) | Claude SDD / implementer | L | R$ 20 |
| 2026-07-04 | 7 | W1-gate PM review + live validation VPS + fixups (qr-code state, placeholder dedup) | Claude / Fable 5 | M | R$ 12 |
| 2026-07-04 | 7 | T5 send-chat-message 3-route solo routing + solo-sender | Claude SDD / implementer | XL | R$ 28 |
| 2026-07-04 | 7 | T6 sync-instance-billing Asaas reconciler | Claude SDD / implementer | L | R$ 20 |
| 2026-07-04 | 7 | T7 solo-health-check cron + pg_cron migration | Claude SDD / implementer | M | R$ 12 |
| 2026-07-04 | 7 | W2-gate PM review + merges + deploy.yml fix | Claude / Fable 5 | S | R$ 5 |
| 2026-07-05 | 7 | T8 ChannelsPage Solo API UI real | Claude SDD / Haiku 4.5 | M | R$ 12 |
| 2026-07-05 | 7 | T9 CreateChannelDialog 7 tipos + QR | Claude SDD / Haiku 4.5 | M | R$ 12 |
| 2026-07-05 | 7 | T10 Inbox chips de canal + janela Solo | Claude SDD / Haiku 4.5 | M | R$ 12 |
| 2026-07-05 | 7 | T11 Admin instâncias Solo + billing sync | Claude SDD / Haiku 4.5 | S | R$ 5 |
| 2026-07-06 | 7 | T12 Hardening code gate + E2E artifact | Codex / GPT-5 | M | R$ 12 |
| 2026-07-05 | 7 | W3-gate PM review + merges + conflito/BOM/dep fixes | Claude / Fable 5 | M | R$ 12 |
| 2026-06-27 | 6.10 | W1 State Persistence Foundation (hook + 3 forms) | pro/deepseek-v4-flash | L | R$ 20 |
| 2026-06-19 | 6.6 | T3 Copilot Cockpit sections (Setup/Treinamento/Aprovações/Logs) | Junior | L | R$ 20 |
| 2026-06-19 | 6.6 | T4 Sprint 6.5 browser smoke + handoff | Junior | M | R$ 12 |
| 2026-06-19 | 6.5 | T8 Base de Contatos spreadsheet columns (create/edit/resize/delete) | Codex / GPT-5 | L | R$ 20 |
| 2026-06-18 | 6.4 | W4.3 minimizable telemetry drawer | Codex / GPT-5 | M | R$ 12 |
| 2026-06-18 | 6.4 | W4.2 Control Room decision log UI | Codex / GPT-5 | L | R$ 20 |
| 2026-06-18 | 6.4 | W4.1 decisions log endpoint | Codex / GPT-5 + subagent | L | R$ 20 |
| 2026-06-18 | 6.4 | W3.6 humanized approval prompts | Codex / GPT-5 | M | R$ 12 |
| 2026-06-18 | 6.4 | W1.T1 Field dictionary module | Codex / GPT-5 | M | R$ 12 |
| 2026-06-18 | 6.4 | W1.T2 attach_file verb + file field type | Codex / GPT-5 | L | R$ 20 |
| 2026-06-18 | 6.4 | W1.T3 Enricher dictionary-bounded router | Codex / GPT-5 | L | R$ 20 |
| 2026-06-18 | 6.4 | W1.T4 Deal-scoped notes | Codex / GPT-5 | M | R$ 12 |
| 2026-06-18 | 6.4 | W2.1 Stage description + contact_fields_schema migration | Codex / GPT-5 | S | R$ 5 |
| 2026-06-18 | 6.4 | W2.2 contact_dictionary reads tenant schema | Codex / GPT-5 | M | R$ 12 |
| 2026-06-18 | 6.4 | W2.3 Stage guide feeds Floor triage | Codex / GPT-5 | L | R$ 20 |
| 2026-06-18 | 6.4 | W2.4 FE — edit descriptions/contact dictionary UI | Codex / GPT-5 | L | R$ 20 |
| 2026-06-18 | 6.4 | W2.5 re-add Lead-Memory wiring tests | Codex / GPT-5 | S | R$ 5 |
| 2026-06-18 | 6.4 | W3.1 copilot_agents table + seed migration | Codex / GPT-5 | S | R$ 5 |
| 2026-06-18 | 6.4 | W3.2 Backend agents_config loader | Codex / GPT-5 | M | R$ 12 |
| 2026-06-18 | 6.4 | W3.3 Enforce autonomy dial in cascade | Codex / GPT-5 | L | R$ 20 |
| 2026-06-18 | 6.4 | W3.4 FE useCopilotAgents hook + types | Codex / GPT-5 | M | R$ 12 |
| 2026-06-18 | 6.4 | W3.5 FE Copiloto Garage section | Codex / GPT-5 | L | R$ 20 |
| 2026-06-17 | 6.3 | Final-review fixes — ledger lead FK (C1) + filter intent-only approval rows (I1) | Claude / Sonnet 4.6 (PM-subagent) | L | R$ 20 |
| 2026-06-17 | 6.3 | T8 intent-detected badge on Kanban card (Epic 4) | Claude / Sonnet 4.6 (PM-subagent) | M | R$ 12 |
| 2026-06-17 | 6.3 | T7 Epic 6 notes-mirroring verification (already lead-scoped) | Claude / Sonnet 4.6 (PM-subagent) | S | R$ 5 |
| 2026-06-17 | 6.3 | T6 Central do Copiloto tab — ledger into CRM + lead names (Epic 5) | Claude / Sonnet 4.6 (PM-subagent) | L | R$ 20 |
| 2026-06-17 | 6.3 | T5 reactive ingest fast-path /ingest/row + DB trigger (Epic 3) | Claude / Opus 4.8 (PM-subagent) | XL | R$ 28 |
| 2026-06-17 | 6.3 | T4 intent safety net — few-shot + detect_high_intent + Omission Guard (Epic 4) | Claude / Sonnet 4.6 (PM-subagent) | L | R$ 20 |
| 2026-06-17 | 6.3 | T3 ledger leads(name) join (Epic 5) | Claude / Haiku 4.5 (PM-subagent) | S | R$ 5 |
| 2026-06-17 | 6.3 | T2 humanized approval card — verb+action shapes, no raw JSON (Epic 2) | Claude / Sonnet 4.6 (PM-subagent) | M | R$ 12 |
| 2026-06-17 | 6.3 | T1 Telemetry HUD drawer — non-blocking Sheet + completion toast (Epic 1) | Claude / Sonnet 4.6 (PM-subagent) | L | R$ 20 |
| 2026-06-17 | 6.3 | PM implementation plan + waves + final whole-branch review (Opus PM) | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | Trade-off 1 | Inbound Webhook Lead Ingest | verboo / deepseek | XL | R$ 28 |
| 2026-06-16 | Trade-off 1.1 | Payload Optimization & F1 UX Refinement | verboo / deepseek | L | R$ 20 |
| 2026-06-16 | 6.2 | Team Page Permissions (Admin UI toggles + route guards) | Antigravity / Gemini 1.5 Pro | L | R$ 20 |
| 2026-06-16 | 6.1 | H3 CI gates (pytest + evals + FE build) | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | H2 private admin ops surface (/admin/runs) | Claude / Opus 4.8 (PM) | L | R$ 20 |
| 2026-06-16 | 6.1 | H1 Evals dyno (accuracy + reliability) | Claude / Opus 4.8 (PM) | L | R$ 20 |
| 2026-06-16 | 6.1 | F3 transparency credit-ledger panel | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | F2 header credit balance badge | Claude / Opus 4.8 (PM) | S | R$ 5 |
| 2026-06-16 | 6.1 | F1 credit balance + ledger query hooks | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | E4 global pipeline sweep ⚡ + credit confirm | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | E3 chat-sidebar ⚡ Sync button | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | E2 on-card ⚡ Sync button | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | E1 reusable ⚡ SyncButton (3 variants) | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | D5 sweep trigger + Realtime HUD consumer | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | D4 SSE sync hook + Telemetry HUD modal | Claude / Opus 4.8 (PM) | L | R$ 20 |
| 2026-06-16 | 6.1 | G3 inbound agent messaging contract doc | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | G2 knowledge.py PgVector factory | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | G1 pgvector + knowledge table migration | Claude / Opus 4.8 (PM) | S | R$ 5 |
| 2026-06-16 | 6.1 | D3 /sync/stream SSE + /sync/sweep router | Claude / Opus 4.8 (PM) | L | R$ 20 |
| 2026-06-16 | 6.1 | D2 events.py RunEmitter | Claude / Opus 4.8 (PM) | M | R$ 12 |
| 2026-06-16 | 6.1 | D1 copilot_run_events + Realtime migration | Claude / Opus 4.8 (PM) | S | R$ 5 |
| 2026-06-16 | 6.1 | B5 HITL verbs + multi-action Workflow assembly | Claude / Opus 4.8 (PM) | XL | R$ 28 |
| 2026-06-16 | 6.1 | B3 sequential credit-aware executor | Claude / Opus 4.8 (PM) | XL | R$ 28 |
| 2026-06-16 | 6.1 | B2 Floor doorman emits ActionPlan | Claude / Opus 4.8 (PM) | L | R$ 20 |
| 2026-06-14 | 6.1 | B4 Enricher + Lead Memory | Claude / Sonnet 4.6 | L | R$ 20 |
| 2026-06-14 | 6.1 | B1 ActionPlan/PlannedAction schemas | verboo / deepseek-v4-flash | M | R$ 12 |
| 2026-06-14 | 6.1 | W0.1 Agno Workflow parity shell + flag | Codex / GPT-5 | XL | R$ 28 |
| 2026-06-14 | 6.1 | C2 cost-tiered cognition router | Codex / GPT-5 | L | R$ 20 |
| 2026-06-14 | 6.1 | C3 build_reasoning_model | Codex / GPT-5 | M | R$ 12 |
| 2026-06-14 | 6.1 | C1 router config migration | Codex / GPT-5 | S | R$ 5 |
| 2026-06-14 | 6.1 | A3 metering tool-hook | Codex / GPT-5 | L | R$ 20 |
| 2026-06-14 | 6.1 | A2 credits.py wrapper | Codex / GPT-5 | M | R$ 12 |
| 2026-06-14 | 6.1 | A1 credit ledger + atomic charge_credits RPC | codex/opus | XL | R$ 28 |
| 2026-06-09 | Sprint 6 | G6 frontend prod wiring | verboo / deepseek | S | R$ 5 |
| 2026-06-09 | Sprint 6 | G5 pg_cron ingest tick migration | verboo / deepseek | S | R$ 5 |
| 2026-06-09 | Sprint 6 | C4 setup dashboard UI | Claude / Sonnet 4.6 | L | R$ 20 |
| 2026-06-09 | Sprint 6 | F4 approval cards | Claude / Sonnet 4.6 | L | R$ 20 |
| 2026-06-09 | Sprint 6 | F3 Sync button (OpportunityDetailModal) | verboo / deepseek | M | R$ 12 |
| 2026-06-09 | Sprint 6 | E8 routers/sync.py | Codex / GPT-5 | M | R$ 12 |
| 2026-06-09 | Sprint 6 | F2 useCopilotRealtime.ts | Gemini 3.5 Flash | M | R$ 12 |
| 2026-06-08 | Sprint 6 | E9 routers/approvals.py | Gemini 3.5 Flash | M | R$ 12 |
| 2026-06-08 | Sprint 6 | E6 workflow.py | Claude / Opus | XL | R$ 28 |
| 2026-06-08 | Sprint 6 | E4 autonomous_team.py | Claude / Opus | XL | R$ 28 |
| 2026-06-08 | Sprint 6 | E1 cascade/tower_doorman.py | Claude / Sonnet 4.6 | L | R$ 20 |
| 2026-06-08 | Sprint 6 | E2 cascade/floor_doorman.py | Claude / Sonnet 4.6 | L | R$ 20 |
| 2026-06-08 | Sprint 6 | E3 cascade/worker.py | Gemini 3.5 Flash | M | R$ 12 |
| 2026-06-08 | Sprint 6 | D3 skills/core_table.py guarded CRUD | Codex / GPT-5 | L | R$ 20 |
| 2026-06-08 | Sprint 6 | E5 agno_store.py session memory | Codex / GPT-5 | M | R$ 12 |
| 2026-06-08 | Sprint 6 | A3 security.py tenant context | Codex / GPT-5 | M | R$ 12 |
| 2026-06-08 | Sprint 6 | A4 db.py service client + pg pool | Codex / GPT-5 | M | R$ 12 |
| 2026-06-08 | Sprint 6 | A5 guards.py | Gemini 3.5 Flash | M | R$ 12 |
| 2026-06-08 | Sprint 6 | D1 audit.py | Gemini 3.5 Flash | M | R$ 12 |
| 2026-06-08 | Sprint 6 | B4 shape_pipeline RPC | Codex / GPT-5 | L | R$ 20 |
| 2026-06-08 | Sprint 6 | B2 ai_decisions queue migration | Codex / GPT-5 | S | R$ 5 |
| 2026-06-08 | Sprint 6 | G1 deploy artifacts + .env.example | Codex / GPT-5 | S | R$ 5 |
| 2026-06-08 | Sprint 6 | D2 skills registry | Codex / GPT-5 | S | R$ 5 |
| 2026-06-08 | Sprint 6 | C1 schemas.py | Codex / GPT-5 | M | R$ 12 |
| 2026-06-08 | Sprint 6 | B6 agno schema migration | Codex / GPT-5 | M | R$ 12 |
| 2026-06-08 | Sprint 6 | B5 copilot_ingest_queue migration | Codex / GPT-5 | S | R$ 5 |
| 2026-06-08 | Sprint 6 | B3 stage_history actor migration | Codex / GPT-5 | S | R$ 5 |
| 2026-06-08 | Sprint 6 | B1 pipeline_agent_rules migration | Codex / GPT-5 | S | R$ 5 |
| 2026-06-08 | Sprint 6 | A2 config real models + DB URL | Codex / GPT-5 | S | R$ 5 |
| 2026-06-08 | Sprint 6 | A1b Dockerfile | Codex / GPT-5 | M | R$ 12 |
| 2026-06-08 | Sprint 6 | C3 routers/shape.py | Codex / GPT-5 | L | R$ 20 |
| 2026-06-08 | Sprint 6 | C2 cascade/track_shaper.py | Claude / Sonnet 4.6 | L | R$ 20 |
| 2026-06-08 | Sprint 6 | F1 services/copilot.ts | verboo / deepseek | S | R$ 5 |
| 2026-06-08 | Sprint 6 | E10 main.py wiring | verboo / deepseek | S | R$ 5 |
| 2026-06-08 | Sprint 6 | E7 routers/ingest.py | Codex / GPT-5 | M | R$ 12 |
| 2026-06-08 | Sprint 6 | A1a uv project + lockfile | Codex / GPT-5 | S | R$ 5 |
| 2026-06-06 | Sprint 6 | Pre-Sprint 6 R&D: Agent-First Sales OS Architecture Analysis & Dokploy Topology Validation | Gemini 3.5 Flash | XL | R$ 28 |
| 2026-06-04 | Sprint 5.2 | T1 schema cadence/KPI | Codex / GPT-5 | M | R$ 12 |
| 2026-06-04 | Sprint 5.2 | T2 schema taxonomy + hook | Codex / GPT-5 | M | R$ 12 |
| 2026-05-31 | Sprint 5.1 | T6 useStageTelemetry hook | Codex / GPT-5 | M | R$ 12 |
| 2026-05-30 | Sprint 5.1 | T7 useCreateContactAtomic (Identity Router) | Claude / Opus | L | R$ 20 |
| 2026-05-30 | Sprint 5.1 | T8 OpportunityCard telemetry pillars | Gemini | L | R$ 20 |
| 2026-05-30 | Sprint 5.1 | T9 Kanban column SLA visual | Gemini | M | R$ 12 |
| 2026-05-31 | Sprint 5.1 | T10 CardFieldsPicker native field toggles | Codex / GPT-5 | M | R$ 12 |
| 2026-05-31 | Sprint 5.1 | T11 AddContactModal switch-toggle + atomic create | Claude / Opus | M | R$ 12 |
| 2026-05-31 | Sprint 5.1 | T12 OpportunityTable telemetry parity | Codex / GPT-5 | M | R$ 12 |
| 2026-05-31 | Sprint 5.1 | T13 OpportunityDetailModal bi-partilhado 60/40 | Claude / Opus | L | R$ 20 |
| 2026-05-31 | Sprint 5.1 | T14 useSiblingNavigation + paddle-shifter nav | Claude / Opus | L | R$ 20 |
| 2026-05-31 | Sprint 5.1 | T15 DoD acceptance pass (code-evidence audit) | Claude / Opus (as Verboo) | S | R$ 5 |

## 📊 Summary Totals

| Sprint | Tasks | Total R$ |
| :----- | :---- | :------- |
| Sprint 5.1 — Wave 2 | T6, T7 | R$ 32 |
| Sprint 5.1 — Wave 3 | T8, T9, T10, T11 | R$ 56 |
| Sprint 5.1 — Wave 4 | T12, T13 | R$ 32 |
| Sprint 5.1 — Wave 5 | T14 | R$ 20 |
| Sprint 5.1 — Wave 6 | T15 | R$ 5 |
| Sprint 5.2 — Wave 1 | T1, T2 | R$ 24 |
| **Sprint 5.1 — TOTAL** | **T6–T15** | **R$ 145** |
| **Sprint 5.2 — TOTAL so far** | **T1, T2** | **R$ 24** |
| **Sprint 6 — TOTAL so far** | **R&D Blueprint** | **R$ 28** |

---

## 🗄️ Archive — legacy token-estimate ledger (pre-tier system)

Kept for history. Costs below were self-estimated from tokens (USD→BRL @ 5.00) before the flat-tier system replaced that method.

| Date       | Module   | Sprint     | Epic / Task                    | Agent / Model | Tokens (In/Out) | Est. USD | Est. R$ |
| :--------- | :------- | :--------- | :----------------------------- | :------------ | :-------------- | :------- | :------ |
| 2026-04-21 | CRM V1   | Sprint 4   | Epic 0                         | OPUS 4.7      | ~200k / ~20k    | $4.00    | R$ 20,00 |
| 2026-04-21 | CRM V1   | Sprint 4   | Epic 1                         | OPUS 4.7      | ~180k / ~15k    | $3.50    | R$ 17,50 |
| 2026-04-22 | CRM V1   | Sprint 4   | Epic 2                         | OPUS 4.7      | ~150k / ~12k    | $2.50    | R$ 12,50 |
| 2026-04-22 | CRM V1   | Sprint 4   | Epic 3                         | OPUS 4.7      | ~220k / ~18k    | $4.65    | R$ 23,25 |
| 2026-04-22 | CRM V1   | Sprint 4   | Epic 4                         | OPUS 4.7      | ~260k / ~22k    | $5.55    | R$ 27,75 |
| 2026-04-22 | CRM V1   | Sprint 4   | Epic 5                         | OPUS 4.6      | ~180k / ~25k    | $4.10    | R$ 20,50 |
| 2026-05-22 | CRM V1   | Sprint 5.5 | 2.2 metaid-unmask              | OPUS 4.7      | ~55k / ~6k      | $1.28    | R$ 6,40  |
| 2026-05-22 | CRM V1   | Sprint 5.5 | 1.1–1.4 inbox-precision        | OPUS 4.7      | ~140k / ~16k    | $3.30    | R$ 16,50 |
| 2026-05-22 | CRM V1   | Sprint 5.5 | 2.1+2.3+2.4 contacts-ledger    | OPUS 4.7      | ~110k / ~12k    | $2.55    | R$ 12,75 |
| 2026-05-23 | CRM V1   | Sprint 5.5 | 3.1+3.3 pipeline-warroom       | OPUS 4.7      | ~90k / ~11k     | $2.18    | R$ 10,90 |
| 2026-05-23 | CRM V1   | Sprint 5.5 | Merge + finalization + push    | OPUS 4.7      | ~40k / ~5k      | $0.98    | R$ 4,90  |

**Legacy total (CRM V1):** $34.59 · R$ 172,95
| 2026-06-23 | 6.8 W1 | W1.1 Copilot Sidebar + Detail View | Verboo Code / deepseek-v4-flash | L | R$ 20 |
| 2026-06-23 | 6.8 W1 | W1.2 Pipeline Config Redesign | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W1 | W1.3 Card Detail Layout Redesign | Verboo Code / deepseek-v4-flash | L | R$ 20 |
| 2026-06-23 | 6.8 W2 | 2.1 Note de-duplication (backend) | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W2 | 2.2 Event humanizer | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W2 | 2.3 Thinking badge | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W2 | 2.4 Non-blocking sync surface | Verboo Code / deepseek-v4-flash | L | R$ 20 |
| 2026-06-23 | 6.8 W3 | 3.1 Lead-score endpoint | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W3 | 3.2 LeadScoreBadge | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W3 | 3.3 Replace ICP/Vel badges | Verboo Code / deepseek-v4-flash | L | R$ 20 |
| 2026-06-23 | 6.8 W3 | 3.4 Honest forecast math | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W3 | 3.5 Scoreboard redesign | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W4 | 4.1 Column layout hook | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W4 | 4.2+4.3 Resizable headers + wire | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W4 | 4.4 Bulk move-to-stage | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W5 | 5.1 Query state hook | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W5 | 5.2+5.3 GridToolbar + wire | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W6 | 6.1 Stage migration | Verboo Code / deepseek-v4-flash | L | R$ 20 |
| 2026-06-23 | 6.8 W6 | 6.2 Stage Engine types | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W6 | 6.3 Ciclo stage UI | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W6 | 6.4 Cycle pass backend | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-06-23 | 6.8 W7 | 7.1 Derive slug | Verboo Code / deepseek-v4-flash | S | R$ 6 |
| 2026-06-23 | 6.8 W7 | 7.1-7.3 Custom Tables | Verboo Code / deepseek-v4-flash | M | R$ 15 |
| 2026-06-23 | 6.8 W8 | 8.1+8.2 Agenda day/week views | Verboo Code / deepseek-v4-flash | M | R$ 12 |
| 2026-08-20 | 8 W0 | T1 Schema billing core | Claude / Opus 5 (PM) | XL | R$ 28 |
| 2026-08-20 | 8 W0 | T2 Schema crédito unificado | Claude / Opus 5 (PM) | XL | R$ 28 |
| 2026-08-20 | 8 W0 | T3 Schema propostas | Claude / Opus 5 (PM) | M | R$ 12 |
| 2026-08-20 | 8 W0 | T4 Schema notificações | Claude / Opus 5 (PM) | M | R$ 12 |
| 2026-08-20 | 8 W1 | T5 asaas-webhook | Claude / Opus 5 (PM) | XL | R$ 28 |
| 2026-08-20 | 8 W1 | T6 Refactor subscribe + buy-credits | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W1 | T7 billing-cron (dunning/rollover) | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W1 | T8 notification-dispatcher | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W1 | T9 provision-tenant | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W2 | T10 Pre-flight de crédito no Copilot | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W2 | T11 Saldo do ledger + conciliação | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W2 | T12 Entitlements derivados + RLS explícita | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W3 | T13 Billing UI (5 sub-rotas) | Claude / Opus 5 (PM) | XL | R$ 28 |
| 2026-08-20 | 8 W3 | T14 Central de notificações | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W3 | T15 Admin — Propostas | Claude / Opus 5 (PM) | XL | R$ 28 |
| 2026-08-20 | 8 W3 | T16 Admin — Faturamento | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W3 | T17 Página pública de proposta | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8 W4 | T18 Auto-recarga + banners | Claude / Opus 5 (PM) | M | R$ 12 |
| 2026-08-20 | 8 W4 | T19 Runbook + TODOs 8.1 | Claude / Opus 5 (PM) | S | R$ 5 |
| 2026-08-20 | 8.1 | T1 Duas carteiras de crédito | Claude / Opus 5 (PM) | XL | R$ 28 |
| 2026-08-20 | 8.1 | T2 Nova arquitetura de planos | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-20 | 8.1 | T3 Liga/desliga do agente (B1) | Claude / Opus 5 (PM) | XL | R$ 28 |
| 2026-08-20 | 8.1 | T4 Enforcement (B3 + E1 + E4) | Claude / Opus 5 (PM) | L | R$ 20 |
| 2026-08-30 | 9 W1 | T1 funnel_events + mapa semântico + motivo de perda | Claude / Opus 5 (PM) | XL | R$ 28 |
| 2026-08-30 | 9 W1 | T2 recompute_funnel_events + backfill do histórico | Claude / Opus 5 (PM) | L | R$ 20 |
