# Sprint 6.8 — Handoff

> **Sprint:** The Premium Pass (`sprint_6.8_solo-copilot_evolve_v1.md`)
> **Closed:** 2026-06-24
> **Branch:** `main` (committed straight to main; pushed to `origin/main`)
> **Verification:** `npm run build` green · `pytest` 321 passed / 21 skipped / 0 failures

---

## 1. What this sprint was

A quality/correctness/redesign pass over Sprint 6.7's "Revenue Powertrain" plumbing. 6.7 shipped capability but missed the craft bar; 6.8's contract was that every wave meets a **Definição de Premium** (experiential acceptance), not just "build green." Full plan + the founder's 18 raw points are in `sprint_6.8_solo-copilot_evolve_v1.md`; design rationale in `sprint_6.8_premium_evolve_spec.md`.

## 2. Delivered (by the engineer) — 8 waves

W1 Copilot sidebar+detail / pipeline-config sections / card 3-col · W2 note-dedup + humanized non-blocking telemetry + thinking badge · W3 LeadScoreBadge + scoreboard redesign · W4 column resize + bulk move-to-stage · W5 GridToolbar + query-state hook · W6 ciclo stage type + cycle pass · W7 custom-table auto-slug + inline columns/rows · W8 agenda day/week. (Commits `5c79023`…`69853e3`.)

## 3. End-of-sprint review — found & FIXED (this handoff's work)

The "all green" summary hid **4 critical correctness bugs**; the review (2 reviewer agents + manual) caught them and they are now fixed, verified, committed.

**`66bca08` — critical correctness:**
- **Stage enum desync** — engineer had rewritten `stage_type` to PT-BR values (`aberto/ganho/perdido`) but only half-propagated it; the Python agent + one card component still used English, breaking against the new DB CHECK. **Founder decision: revert to additive English values (`open/won/lost/ciclo`) + PT-BR labels.** Migration no longer rewrites data; whole Python agent + tests back to correct.
- **Cycle engine** (`cycle_pass.py`) — inserted history with non-existent columns → threw → **silently swallowed the webhook**. Removed the manual insert (DB trigger records history); webhook now awaited and fires.
- **Note de-dup** — queried `lead_activities.equipe_id` (no such column) → errored on real Postgres (passed on the fake test client). Now scoped by `lead_id` + null-guarded.
- **Forecast "2600%"** — `useForecast.ts` had no rate clamp / insufficient-data guard. Clamped to [0,1] + `sufficient_data` flag; scoreboard shows "dados insuficientes" instead of impossible numbers.

**`cba0ac5` / `c213e41` / craft in `66bca08`:**
- Card detail flipped (pt 13): Oportunidade + Notas centered, context in collapsible rail.
- Pipeline list (pt 15): newest-first default + Mais recentes/antigos + Canal filter.
- Agenda Mês view (Dia/Semana/Mês).
- Scoreboard → **Painel de Receita**; custom-table slug prompt removed (pt 16); chat agent removed from Copilot (pt 17); grid header LS → Score.

## 4. Deferred (NOT done — see `todo.md` "Sprint 6.8 — deferred items")

Genuine feature builds, intentionally not half-implemented:
- **W7 live-linked cross-table relation column** (pt 16 headline) — relation column is non-functional (no target picker).
- **W4** column drag-reorder + remove-header; extend resize/sort to Base de Contatos & Custom Tables (pt 8/14).
- **W5** sort/filter inside Kanban + Base de Contatos (pt 15; pipeline done).
- **W1** vertical StageCard (pt 18; config still the cramped row).
- Minor: dead-code cleanup, PT-BR accents, wire the two card "em breve" rail stubs.

## 5. Deploy / DB state

- **GitHub:** `origin/main` pushed.
- **Edge functions:** `analyze-message` (+ `_shared`) changed this sprint → deployed.
- **DB migration:** `20260623000001_sprint68_stage_engine.sql` — additive (adds `ciclo` to the `stage_type` CHECK + `cycle_days` / `cycle_target_stage_id` / `cycle_webhook_url`), no data rewrite → pushed via `supabase db push`.
- **python-agent** (FastAPI: revenue/lead-score/cycle endpoints) is **not** part of Supabase deploy — it runs as its own service; redeploy it wherever it's hosted to pick up the `cycle_pass` + dedup + lead-score changes.

## 6. Known follow-ups outside this sprint
- State persistence (full-page-reload loses input) — own architectural sprint (`todo.md`).
- Key rotation (`todo.md`).
