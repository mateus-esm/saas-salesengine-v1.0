# 🤖 MULTI-AGENT SWARM WORKFLOW (MANDATORY READ)

**ATTENTION CLAUDE, CODEX, GEMINI AND ANTIGRAVITY:**
You operate in a multi-agent environment. Each sprint, the Human Orchestrator names **one agent as PM** (Project Manager) and the rest as **Engineers**. Roles, tasks, and file ownership live in that sprint's PRD / spec / planning doc. Follow this flow exactly — it exists to keep work fast, cheap, and conflict-free.

---

## 🎚️ TASK TIERS (drives cost + who does what)

Every task in the sprint doc is tagged **S / M / L / XL**. The tier decides which model runs it and whether a plan needs approval.

| Tier | Looks like | Route to | Plan approval before coding? |
| :--- | :--------- | :------- | :--------------------------- |
| **S** | Copy edits, column deletes, mask audits, merges, doc updates | Cheapest model (junior) | ❌ No — just do it |
| **M** | One hook, one focused component change | Mid model (pleno) | ❌ No — if the spec is clear |
| **L** | A hook + integration across several files | Strong model | ✅ Yes — PM approves |
| **XL** | Cross-cutting / architecture / atomic transactions | Senior model | ✅ Yes — PM approves |

> 💡 **Cost rule of thumb:** never run an S/M task on a premium model. Routing cheap work to cheap models is the single biggest cost lever.

---

## 📄 THE SPRINT FILE (single source of truth)

Each sprint has **one file** (e.g. `Planning/Sprints/sprint_7_studio_ai_v1.md`) with three zones:

1. **🎯 Vision** — written by the **Human**. The EPICs, intent, and a **Definition of Done / Acceptance Criteria** checklist at the bottom. This is the contract.
2. **🛠️ Implementation Plan** — written by the **PM** in a separate section of the same file. Breaks the vision into tasks/workloads, tags each task's **tier**, assigns an engineer, sets **file ownership**, and lays out the **wave map**.
3. **📊 Ledger hooks** — engineers tick their task `[x]` here and add a billing row when done.

---

## 🔄 THE SPRINT EXECUTION FLOW

### 1. 🎯 Vision (Human)
The Human seeds the sprint file with the vision + acceptance criteria.

### 2. 🛠️ Implementation Plan (PM)
The PM reads the vision and writes the implementation plan **into the same sprint file**:
- Break each EPIC into discrete tasks/workloads.
- Tag every task **S / M / L / XL** and assign the right engineer (route cheap tiers to cheap models).
- Declare **file ownership** per task — no two parallel tasks share a file.
- Build the **wave map**: tasks grouped into waves; everything in a wave touches non-overlapping files; dependencies shown with `→`.

### 3. 🧐 Engineer Review (feedback loop — before any code)
The assigned engineer reads their task and the relevant vision.
- If something is wrong, ambiguous, or could be done better → **ask questions / request a correction to the plan first.** Do not code around a bad spec.
- **L / XL:** present a short plan (files + logic) and get PM approval.
- **S / M:** if the plan is clear, proceed straight to branch.

### 4. 🔀 Branch Isolation
- Never edit `main`.
- One isolated branch per task, named for traceability:
  `<agent>/sprint<x>/<workload>/<short-task-desc>`
  *(e.g. `gemini/sprint5.1/epic1/column-purge`)*
- **Only** edit the files your task owns. Never refactor out-of-scope files — even if they look wrong. Flag them to the PM instead.

### 5. 📝 Execution
Do the work on your branch. Stay inside your file ownership. Keep commits scoped to your task.

### 6. ✅ Completion & Handoff

Before signalling the PM, verify **all five gates** locally on your branch:

- [ ] Builds clean (`npm run build` / `tsc` / `uv run pytest` — no new errors).
- [ ] Only your assigned files changed (`git diff main...HEAD --stat`).
- [ ] Task ticked `[x]` in the sprint file's implementation plan (committed to your branch).
- [ ] **One billing row added** to `Planning/Workflow/billing.md` (date · sprint · task · agent/model · tier) — committed to your branch.
- [ ] All changes committed; branch is ahead of `main` by at least 1 commit.

Then post the following **structured handoff block** — nothing less will be accepted:

```
HANDOFF: <task-id> · <task-name>
Branch:  <agent>/sprint<x>/<epic>/<desc>
Commit:  <short-sha> <commit message>
Files:   <list of created/modified files, one per line>
Tests:   <test command> → <N passed, 0 failed>
Ledger:  sprint checkbox [x] ticked · billing row added
```

**Example:**
```
HANDOFF: A3 · security.py + deps.py
Branch:  engineer/sprint6/epicA/security
Commit:  4e613be Add tenant JWT security context
Files:   python-agent/app/security.py (created)
         python-agent/app/deps.py (created)
         python-agent/tests/test_security.py (created)
         Planning/Sprints/sprint_6_solo-copilot.md ([x] A3)
         Planning/Workflow/billing.md (A3 row added)
Tests:   uv run pytest tests/test_security.py → 12 passed, 0 failed
Ledger:  [x] A3 ticked · billing row 2026-06-08 Sprint 6 A3 M R$12
```

> ⚠️ **If you skip the handoff block the PM will not accept the task.** Saying "it's done" or "I finished" without the structured block is not a valid handoff — the PM checks branches, not memory.

### 7. 🔍 PM Double-Check & Merge

The PM **never checks `main` to verify engineer work** — all work lives on the engineer's feature branch until the PM merges it. The PM's protocol for each finished task:

1. **Receive the handoff block** — reject immediately if the block is missing or incomplete.
2. **Check out the branch** and diff against main:
   ```bash
   git diff main...<branch> --stat
   git show <branch>:python-agent/app/<file>.py   # read the key files
   ```
3. **Run the tests on the branch:**
   ```bash
   git checkout <branch>
   uv run pytest tests/  # or npm run build — whatever the task owns
   ```
4. **Verify the three acceptance gates:**
   - ✅ **Files** — only the task's owned files changed; implementation matches the contract in the sprint doc.
   - ✅ **Billing** — row present in `Planning/Workflow/billing.md` with the correct tier and agent.
   - ✅ **DoD** — the work satisfies the matching acceptance criteria in the sprint's Definition of Done.
5. **Merge to `main`** — resolve any ledger/billing conflicts by keeping all rows (each branch adds its own row; the merge result must contain all of them).
6. **Announce wave completion** to all agents using this format:

```
WAVE <N> MERGED · git pull origin main
Ready: <list of tasks now on main>
Next wave opens: <wave N+1 tasks and assignees>
```

If any gate fails, the PM bounces it back with a one-line reason and the task stays on its branch until fixed.

---

*Acknowledge these rules, read the sprint file, confirm your role + task tiers, then wait for the PM to open your wave.*

> **Why this flow exists:** it simulates a high-performance engineering team — clear ownership, parallel execution, cheap models on cheap work, a feedback loop before code, and one PM owning quality at the gate. Maximum velocity and quality, minimum cost.
