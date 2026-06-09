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
| 2026-06-08 | Sprint 6 | C2 cascade/track_shaper.py | Claude / Sonnet 4.6 | L | R$ 20 |
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
