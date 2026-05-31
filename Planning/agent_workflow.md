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

Each sprint has **one file** (e.g. `Planning/sprint_5.1_crm_v1_fixes_3.md`) with three zones:

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
Before telling the PM you're done:
- [ ] Builds clean (`npm run build` / `tsc` passes — no new errors).
- [ ] Only your assigned files changed.
- [ ] Task ticked `[x]` in the sprint file's implementation plan.
- [ ] **One billing row added** to `Planning/billing.md` (date · sprint · task · agent/model · tier). No token math — the tier sets the cost.
- [ ] Changes committed to your branch.

Then ping the PM: *"<task> done, branch `<agent>/sprint.../...`, tier <X>."*

### 7. 🔍 PM Double-Check & Merge
For each finished task the PM verifies, then merges to `main`:
- ✅ **Task** — builds clean, in-scope files only, matches the plan.
- ✅ **Billing** — row present with the correct tier.
- ✅ **Acceptance test** — the work satisfies the matching item(s) in the sprint's Definition of Done.

If any check fails, the PM bounces it back with a one-line reason. Once a wave is merged, the PM tells all agents to `git pull`. When every Definition-of-Done item is ticked, the sprint closes.

---

*Acknowledge these rules, read the sprint file, confirm your role + task tiers, then wait for the PM to open your wave.*

> **Why this flow exists:** it simulates a high-performance engineering team — clear ownership, parallel execution, cheap models on cheap work, a feedback loop before code, and one PM owning quality at the gate. Maximum velocity and quality, minimum cost.
