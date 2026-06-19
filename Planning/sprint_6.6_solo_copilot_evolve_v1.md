# Sprint 6.6 — Copilot Cockpit: Close-Out & Cleanup

> **Roles:** PM = Claude (Opus). Engineer = Junior model (cheapest that clears the tier).
> **Mode:** Execute → Validate **loop**. The junior does ONE task, posts the handoff block, then STOPS. The PM validates against that task's **PM VALIDATION** block before opening the next task. Never run two tasks at once.
> **Read first:** `Planning/agent_workflow.md` (the swarm rules) and this whole file.

---

## 🎯 Why this sprint exists (the contract)

Sprints 6.4 and 6.5 delivered most of the Copilot Cockpit, but a PM review on 2026-06-19 found loose ends. The **code that exists is correct** (backend `262 passed`, `npm run build` green, `validate_field_action` enforced at both the enricher and executor seams). What is missing is the *finish*:

| # | Gap found in review | Addressed by |
|---|---|---|
| 1 | Sprint 6.5 **T9 never built** — Copilot Cockpit still shows old `Garage` / `Control Room` tabs instead of `Setup / Treinamento / Aprovações / Logs`; `CopilotTrainingPanel` does not exist. | **T3** |
| 2 | Sprint 6.5 **T10 never run** — no browser smoke, no FINAL HANDOFF section, no 6.5 billing closure. | **T4** |
| 3 | Sprint 6.4 **billing ledger incomplete** — only 4 of ~19 tasks have a billing row; 0 checkboxes ticked despite a "done" handoff. | **T1** |
| 4 | **Working tree had stray changes** unrelated to any task (a 112-line deletion in `tradeoff_sprint_1.1.md`, line-ending churn in a webhook spec). | **T2** |
| 5 | **Production env unverified** — Netlify `VITE_COPILOT_URL`, Dokploy `COPILOT_WORKFLOW_ENABLED` / `CORS_ORIGINS`. | **T5 (Human)** |
| 6 | **Local `main` diverged from `origin/main`** (8 ahead / 3 behind) after the local merge of 6.4+6.5. | **T6 (Human)** |

> **Already done before this sprint opened (PM, 2026-06-19):** T8 (contact spreadsheet columns) was committed (`84b842f`) with its billing row, and the 6.4+6.5 branch was fast-forward **merged into local `main`**. So `main` now contains everything through T8. This sprint starts from `main @ 84b842f`.

---

## 🎚️ Tier reference (from `agent_workflow.md`)

| Tier | Means | Plan approval before coding? |
| :--- | :--- | :--- |
| **S** | Doc edits, ledger rows, small cleanups | ❌ No — just do it |
| **M** | One component / one focused change | ❌ No — spec is clear |
| **L** | A feature across several files | ✅ Yes — PM approves the plan first |

---

## 🗺️ Wave map

| Wave | Tasks | Why grouped | Parallel? |
|---|---|---|---|
| **Wave 1** | T1, T2 | Doc + hygiene only — zero code risk, warms up the loop. Touch different files. | ✅ Independent |
| **Wave 2** | T3 | The one real feature (6.5 T9 cockpit sections). Owns the cockpit FE files alone. | — single task |
| **Wave 3** | T4 | Smoke + close-out. Needs T3 merged so there is something to smoke. | — single task |
| **Wave 4** | T5, T6 | **Human / infra** (env + git remote). Not junior-executable. PM/Mateus run these. | Human |

**File ownership is exclusive per task — no two tasks edit the same file.**

---

## 🌳 Branching (every task)

- Branch off `main`: `junior/sprint6.6/<task-id>/<short-desc>` (e.g. `junior/sprint6.6/t3/cockpit-sections`).
- Edit **only** the files your task owns. If another file looks wrong, **flag it to the PM** — do not touch it.
- Gates before handoff (run locally on your branch):
  - Frontend tasks: `npm run build` → exits 0.
  - Doc tasks: no build needed.
- Then post the **HANDOFF block** (format at the bottom of `agent_workflow.md`) and STOP.

---

# WAVE 1 — Doc + Hygiene

## Task T1 [S] — Backfill the Sprint 6.4 billing ledger + reconcile status

**Owns:** `Planning/billing.md`, `Planning/sprint_6.4_solo-copilot_evolve_v1.md`
**Branch:** `junior/sprint6.6/t1/ledger-backfill`

**Problem:** Sprint 6.4 shipped ~19 tasks but only 4 billing rows exist (W3.6, W4.1, W4.2, W4.3). The other tasks (all of Wave 1, Wave 2, and W3.1–W3.5) have no row, and no task checkbox is ticked.

- [ ] **Step 1** — Open `Planning/sprint_6.4_solo-copilot_evolve_v1.md`. List every task id that has a deliverable: `W1.T1, W1.T2, W1.T3, W1.T4` (Wave 1 tasks 1–4; T5 is human/infra — skip), `W2.1, W2.2, W2.3, W2.4, W2.5`, `W3.1, W3.2, W3.3, W3.4, W3.5`. (W3.6, W4.1, W4.2, W4.3 already have rows — do NOT duplicate them.)
- [ ] **Step 2** — In `Planning/billing.md`, under the existing 6.4 rows, add **one row per missing task**, dated `2026-06-18`, agent `Codex / GPT-5`, using the tier the task carries in the 6.4 doc (Wave 1 dictionary/enricher tasks were `M`–`L`; migrations are `S`; FE editor tasks `M`–`L`). If a task's tier is not explicit, use this rule: pure migration/doc = `S`; one module + tests = `M`; module across several files + FE = `L`. Match the exact row format already in the file:
  `| 2026-06-18 | 6.4 | W2.1 stage description + contact_fields_schema migration | Codex / GPT-5 | S | R$ 5 |`
- [ ] **Step 3** — In `Planning/sprint_6.4_solo-copilot_evolve_v1.md`, do NOT try to tick all sub-step boxes. Instead add a single line directly under each Task heading that shipped: `**Status:** [x] Done (verified by PM 2026-06-19 — code on main, 262 tests pass).` (Mirror the existing `**Status:** [x] Completed by Codex...` lines already on W3.6/W4.x.)
- [ ] **Step 4** — Commit: `docs(billing): backfill Sprint 6.4 ledger + status markers`.

**Completion gate:** every 6.4 task with code has exactly one billing row (no duplicates) and a `**Status:**` line.

> ### 🔍 PM VALIDATION (T1)
> - `grep -cE "\| 6\.4 \|" Planning/billing.md` → count equals (4 existing + new rows), one per shipped task, **no duplicate task ids**.
> - Spot-check 3 rows: tier matches the task's tier in the 6.4 doc; R$ matches the tier table (S=5, M=12, L=20, XL=28).
> - Each shipped 6.4 task has a `**Status:** [x]` line.
> - `git diff main...HEAD --stat` shows ONLY the two owned files changed.

---

## Task T2 [S] — Resolve the stray working-tree changes

**Owns:** `Planning/tradeoff_sprint_1.1.md`, `docs/superpowers/specs/2026-06-16-inbound-webhook-lead-ingest-design.md`
**Branch:** `junior/sprint6.6/t2/worktree-hygiene`

**Problem:** Two files were left modified in the working tree, unrelated to any committed task: a **112-line deletion** in `tradeoff_sprint_1.1.md` (suspicious — looks like accidental truncation) and line-ending (LF→CRLF) churn in the webhook spec. They must be either intentionally committed or reverted — not left dangling.

- [ ] **Step 1** — Run `git diff Planning/tradeoff_sprint_1.1.md`. Read what the 112 deleted lines are.
  - If the deletion looks like **accidental truncation / lost content** → revert it: `git checkout -- Planning/tradeoff_sprint_1.1.md`.
  - If it looks like a **deliberate trim the team wanted** → keep it and note why in the commit message.
  - **If unsure → STOP and ask the PM.** Do not guess on content deletion.
- [ ] **Step 2** — Run `git diff docs/superpowers/specs/2026-06-16-inbound-webhook-lead-ingest-design.md`. If the only change is line endings (CRLF/LF) with no real content change → revert it: `git checkout -- docs/superpowers/specs/2026-06-16-inbound-webhook-lead-ingest-design.md`. If there is real content change → STOP and ask the PM.
- [ ] **Step 3** — Confirm a clean tree: `git status --short` shows nothing left from these two files.
- [ ] **Step 4** — If anything was intentionally kept/committed, commit it: `chore(docs): resolve stray working-tree changes`. If everything was reverted, there is nothing to commit — report that in the handoff.

**Completion gate:** `git status --short` is clean of both files; the decision (revert vs keep) is stated in the handoff with the reason.

> ### 🔍 PM VALIDATION (T2)
> - `git status --short` on `main` after merge shows neither stray file.
> - If `tradeoff_sprint_1.1.md` was reverted, `git diff main -- Planning/tradeoff_sprint_1.1.md` is empty (matches main).
> - The junior's handoff explains the revert/keep decision for each file — no silent content loss.

---

# WAVE 2 — The Cockpit Sections (6.5 T9)

## Task T3 [L] — Copilot Cockpit: Setup / Treinamento / Aprovações / Logs

**Owns:** `src/pages/CopilotCockpit.tsx`, `src/components/crm/copilot/CopilotTrainingPanel.tsx` (create)
**Branch:** `junior/sprint6.6/t3/cockpit-sections`
**Tier L → present a 5-line plan (files + which tabs) to the PM and get approval BEFORE coding.**

**Problem:** The top-level Copilot area still shows the old developer-facing `Garage` / `Control Room` tabs. The product needs operator-facing sections: **Setup** (the existing agent config cards), **Treinamento** (explains how the Copilot learns), **Aprovações** (the approval queue), **Logs** (the Control Room table).

**Current state (already read by PM):** `CopilotCockpit.tsx` has `<Tabs defaultValue="garage">` with `TabsTrigger value="garage"` (line 108) and `value="control-room"` (line 109); the config cards live inside `<TabsContent value="garage">` (line 112); `<ControlRoom>` lives inside `<TabsContent value="control-room">` (line 193). `CopilotApprovalsPanel` takes a single prop `pipelineId: string`. `usePipelines()` returns `activePipelines`.

- [ ] **Step 1 — Plan approval.** Post to the PM: the 4 tab values you will use (`setup`, `training`, `approvals`, `logs`), the default tab (`setup`), and that you will create `CopilotTrainingPanel.tsx`. Wait for PM "go".
- [ ] **Step 2 — Header copy.** In `CopilotCockpit.tsx`, replace both occurrences of the header block text `Copiloto <span...>Garage</span>` + `Configure os agentes do seu time de copiloto` (the one in the feature-flag-off gate near line 30 AND the main one near line 97) with title `Copilot` and subtitle `Central de operação, treinamento e auditoria dos agentes.`
- [ ] **Step 3 — Tab list.** Replace the `<TabsList>` (lines 107–110) with four triggers:
  ```tsx
  <TabsList>
    <TabsTrigger value="setup">Setup</TabsTrigger>
    <TabsTrigger value="training">Treinamento</TabsTrigger>
    <TabsTrigger value="approvals">Aprovações</TabsTrigger>
    <TabsTrigger value="logs">Logs</TabsTrigger>
  </TabsList>
  ```
  and change `<Tabs defaultValue="garage"` to `<Tabs defaultValue="setup"`.
- [ ] **Step 4 — Setup tab.** Change `<TabsContent value="garage"` (line 112) to `<TabsContent value="setup"`. Leave the config-card content inside it unchanged.
- [ ] **Step 5 — Logs tab.** Change `<TabsContent value="control-room">` (line 193) to `<TabsContent value="logs">`. Leave `<ControlRoom pipelines={activePipelines} />` inside it unchanged.
- [ ] **Step 6 — Create the Training panel.** Create `src/components/crm/copilot/CopilotTrainingPanel.tsx`:
  ```tsx
  export function CopilotTrainingPanel() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Treinamento do Copilot</h2>
          <p className="text-sm text-muted-foreground">
            O Copilot aprende pelos campos, etapas, descrições e prompts configurados no CRM.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border p-4">
            <h3 className="text-sm font-medium">Comportamento</h3>
            <p className="mt-1 text-xs text-muted-foreground">Prompt do agente e modo de autonomia (aba Setup).</p>
          </div>
          <div className="rounded-md border border-border p-4">
            <h3 className="text-sm font-medium">Blocos de treinamento</h3>
            <p className="mt-1 text-xs text-muted-foreground">Descrições dos campos e etapas do pipeline.</p>
          </div>
          <div className="rounded-md border border-border p-4">
            <h3 className="text-sm font-medium">Trabalho permitido</h3>
            <p className="mt-1 text-xs text-muted-foreground">Observar, sugerir aprovação ou agir sozinho.</p>
          </div>
        </div>
      </div>
    );
  }
  ```
- [ ] **Step 7 — Mount Training + Approvals tabs.** Import at top of `CopilotCockpit.tsx`:
  ```tsx
  import { CopilotTrainingPanel } from "@/components/crm/copilot/CopilotTrainingPanel";
  import { CopilotApprovalsPanel } from "@/components/crm/copilot/CopilotApprovalsPanel";
  ```
  Then, right after the `setup` `</TabsContent>` (before the `logs` one), add:
  ```tsx
  <TabsContent value="training">
    <CopilotTrainingPanel />
  </TabsContent>

  <TabsContent value="approvals" className="space-y-4">
    {activePipelines.length === 0 && (
      <p className="text-sm text-muted-foreground italic">Nenhum pipeline ativo.</p>
    )}
    {activePipelines.map((pipeline) => (
      <section key={pipeline.id} className="space-y-2">
        <h3 className="text-sm font-medium">{pipeline.name}</h3>
        <CopilotApprovalsPanel pipelineId={pipeline.id} />
      </section>
    ))}
  </TabsContent>
  ```
- [ ] **Step 8 — Build.** `npm run build` → exits 0. Fix any type error before handoff.
- [ ] **Step 9 — Billing + commit.** Add to `Planning/billing.md`: `| 2026-06-19 | 6.6 | T3 Copilot Cockpit sections (Setup/Treinamento/Aprovações/Logs) | Junior | L | R$ 20 |`. Commit: `feat(copilot): cockpit Setup/Treinamento/Aprovações/Logs sections`.

**Completion gate:** build green; no `garage`/`control-room`/`Garage` strings remain in `CopilotCockpit.tsx`; the four new tabs render.

> ### 🔍 PM VALIDATION (T3)
> - Check out branch; `npm run build` → exits 0 (PM re-runs it, does not trust the claim).
> - `grep -nE "garage|control-room|Garage" src/pages/CopilotCockpit.tsx` → **no matches**.
> - `grep -nE 'value="(setup|training|approvals|logs)"' src/pages/CopilotCockpit.tsx` → all four present.
> - `CopilotTrainingPanel.tsx` exists and is imported + rendered.
> - `CopilotApprovalsPanel` is rendered per active pipeline with the `pipelineId` prop.
> - `git diff main...HEAD --stat` → only the 2 owned files + `billing.md` changed. No other files touched.
> - Billing row present with tier `L`.

---

# WAVE 3 — Smoke & Close-Out (6.5 T10)

## Task T4 [M] — Browser smoke + Sprint 6.5 FINAL HANDOFF

**Owns:** `Planning/sprint_6.5_solo-copilot_evolve_v1.md`, `Planning/billing.md`
**Branch:** `junior/sprint6.6/t4/smoke-handoff`
**Precondition:** T3 merged to `main`.

- [ ] **Step 1 — Build from main.** `git checkout main && git pull` (after T3 merge), then `npm run build` → exits 0.
- [ ] **Step 2 — Browser smoke.** Using a dev server (`npm run dev`) with valid Supabase env, walk the 6.5 DoD checklist (it is at the bottom of `sprint_6.5_solo-copilot_evolve_v1.md`). For each item, record **pass/fail + a one-line note**:
  1. CRM top nav includes `Copilot`.
  2. Pipeline subnav no longer has `Central do Copiloto`.
  3. Toggle label says `Copilot`.
  4. Kanban card footer shows `Chat` and `Touchpoint` fully (no clip).
  5. Sync on a card → compact HUD appears immediately.
  6. HUD lines show readable field/result, not only `set_contact_field`.
  7. Minimize HUD → run continues.
  8. Copilot → **Logs**: columns include action, field, result/output.
  9. Copilot → **Aprovações**: cards show exact status/stage/field.
  10. Copilot → **Setup** and **Treinamento** tabs render.
  11. Base de Contatos: create a column, edit a cell, resize, delete.
  - **If a step fails**, do NOT fix it here — record it and flag to the PM (it becomes a new task).
- [ ] **Step 3 — Billing.** Add: `| 2026-06-19 | 6.6 | T4 Sprint 6.5 browser smoke + handoff | Junior | M | R$ 12 |`.
- [ ] **Step 4 — FINAL HANDOFF section.** Append to `sprint_6.5_solo-copilot_evolve_v1.md` a `## FINAL HANDOFF - Sprint 6.5` block with: date, branch, first→last commit, the smoke results table from Step 2, and the production-env status (mark Netlify/Dokploy as **pending T5** — do not claim them done).
- [ ] **Step 5 — Commit:** `docs(copilot): Sprint 6.5 smoke results + final handoff`.

**Completion gate:** every 6.5 DoD line has a recorded pass/fail; failures are listed as follow-ups, not silently passed.

> ### 🔍 PM VALIDATION (T4)
> - The FINAL HANDOFF table has all 11 smoke items with an explicit pass/fail (no blanks, no "probably").
> - Any failure is captured as a named follow-up, not marked pass.
> - Production-env lines say **pending** (not "done") since T5 has not run.
> - Billing row present; `git diff main...HEAD --stat` shows only the 2 owned docs changed.

---

# WAVE 4 — Human / Infra (not junior-executable)

## Task T5 [Human] — Production env verification

**Owner:** Mateus (dashboards). Not codeable by the junior.

- [ ] Netlify → Site config → Environment: `VITE_COPILOT_URL=https://agent.soloventures.com.br`; redeploy frontend.
- [ ] Dokploy (python-agent app): `COPILOT_WORKFLOW_ENABLED=true`, `CORS_ORIGINS=<frontend prod domain>`; redeploy agent.
- [ ] Verify in browser: Sync calls go to `https://agent.soloventures.com.br/api/v1/...` (never `undefined/api/v1/...`).
- [ ] Record Y/N + evidence in the 6.5 FINAL HANDOFF.

## Task T6 [Human] — Reconcile local `main` with `origin/main`

**Owner:** Mateus / PM with push rights. Not codeable by the junior.

**Context:** After the local merge, `main` is **8 ahead / 3 behind** `origin/main`. The 3 remote commits are the earlier Copilot hotfix-handoff merge (`5f6f82f`). A plain push will be rejected.

- [ ] Decide strategy: `git rebase origin/main` (linear) **or** `git merge origin/main` (merge commit), resolving any ledger conflicts by **keeping all billing rows** (per `agent_workflow.md` merge rule).
- [ ] Re-run gates after reconcile: `cd python-agent && ./.venv/Scripts/python.exe -m pytest tests/ -q` (expect 262+ passed) and `npm run build` (green).
- [ ] Push `main`. Confirm `origin/main` contains the 6.4+6.5+6.6 work.

---

## ✅ Sprint 6.6 Definition of Done

- [ ] **T1** — every shipped 6.4 task has one billing row (no dupes) + a `[x]` status line.
- [ ] **T2** — working tree clean of the two stray files; revert/keep decision documented.
- [ ] **T3** — Copilot Cockpit shows `Setup / Treinamento / Aprovações / Logs`; no `Garage`/`Control Room` strings; `npm run build` green.
- [ ] **T4** — all 11 Sprint 6.5 DoD smoke items recorded pass/fail; 6.5 FINAL HANDOFF written.
- [ ] **T5 (Human)** — Netlify + Dokploy env confirmed; Sync hits the real agent URL.
- [ ] **T6 (Human)** — local `main` reconciled with `origin/main`; pushed; gates green post-reconcile.
- [ ] Every junior task added its billing row and used the HANDOFF block.

---

## 🔁 The execution loop (how PM + junior run this)

1. **PM** opens ONE task: "Junior, start T1. Here is the task + its PM VALIDATION block."
2. **Junior** branches, does only that task's steps, runs the gate, posts the HANDOFF block, STOPS.
3. **PM** checks out the branch, runs the gates itself, walks the PM VALIDATION block. Pass → merge + announce. Fail → bounce with a one-line reason; task stays on its branch.
4. Repeat for the next task. Wave 1 (T1, T2) may run as two iterations back-to-back; T3 needs plan-approval first; T4 needs T3 merged.

**Order:** T1 → T2 → T3 (plan-approve, then build) → T4 → [Human: T5, T6].
