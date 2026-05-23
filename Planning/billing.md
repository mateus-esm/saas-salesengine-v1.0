# 💰 Project Billing & Spending Tracker

This document tracks the cumulative cost of AI agents executing sprints and epics across the SaaS Sales Engine project.

## 📋 Tracking Rules
**ATTENTION ALL AGENTS:** At the end of every Epic/Task handoff, you **MUST** calculate your approximate token usage and cost for the session, and add a row to the ledger below.

- **Tokens:** Estimate your Input (prompt) and Output (completion) tokens used while executing the epic.
- **Cost estimation:** Apply current API pricing for your assigned model (e.g., Claude 3.5 Sonnet, Gemini 1.5 Pro, GPT-4o).
- **Currency Conversion:** Convert the final USD value to BRL (R$). Use an approximate standard rate (e.g., USD 1.00 = BRL 5.00) unless directed otherwise.

## 💸 Cost Ledger

| Date       | Module   | Sprint   | Epic / Task | Agent / Model | Tokens (In/Out) | Est. Cost (USD) | Est. Cost (R$) |
| :--------- | :------- | :------- | :---------- | :------------ | :-------------- | :-------------- | :------------- |
| 2026-04-21 | CRM V1   | Sprint 4 | Epic 0      | OPUS 4.7      | ~200k / ~20k    | $4.00           | R$ 20,00       |
| 2026-04-21 | CRM V1   | Sprint 4 | Epic 1      | OPUS 4.7      | ~180k / ~15k    | $3.50           | R$ 17,50       |
| 2026-04-22 | CRM V1   | Sprint 4 | Epic 2      | OPUS 4.7      | ~150k / ~12k    | $2.50           | R$ 12,50       |
| 2026-04-22 | CRM V1   | Sprint 4 | Epic 3      | OPUS 4.7      | ~220k / ~18k    | $4.65           | R$ 23,25       |
| 2026-04-22 | CRM V1   | Sprint 4 | Epic 4      | OPUS 4.7      | ~260k / ~22k    | $5.55           | R$ 27,75       |
| 2026-04-22 | CRM V1   | Sprint 4 | Epic 5      | OPUS 4.6      | ~180k / ~25k    | $4.10           | R$ 20,50       |
| 2026-05-22 | CRM V1   | Sprint 5.5 | 2.2 metaid-unmask | OPUS 4.7    | ~55k / ~6k      | $1.28           | R$ 6,40        |

## 📊 Summary Totals

| Module   | Total Cost (USD) | Total Cost (R$) |
| :------- | :--------------- | :-------------- |
| CRM V1   | $25.58           | R$ 127,90       |

*(Agents: Please update the Summary Totals table as well when adding a new row to the Cost Ledger)*
