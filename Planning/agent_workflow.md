# 🤖 MULTI-AGENT SWARM WORKFLOW (MANDATORY READ)

**ATTENTION CLAUDE, CODEX, GEMINI AND ANTIGRAVITY:** 
You are operating in a multi-agent environment overseen by a Human Orchestrator. To avoid conflicts and maintain stability, follow this EXACT flow:

## 🔄 THE SPRINT EXECUTION FLOW

### 1. 📖 Context Initialization
Always read this file (`Planning/agent_workflow.md`) and the active sprint document (e.g., `Planning/sprint_chat_v1.md`) to understand the complete context and constraints before doing anything.

### 2. 🎯 Task Assignment & Micro-Planning
- Wait for the Human Orchestrator to assign you a specific task from the sprint.
- **Do not code immediately.** Formulate an Implementation Plan specific to your task and present it to the Orchestrator for Approval.
- The plan must detail which files you will touch and what logic you will change.

### 3. 🔀 Branch Isolation
- Once the Orchestrator **Approves** your plan, create a new branch.
- **Do NOT edit code on the `main` branch.**
- Use convention: `git checkout -b feat/<agent_name>-<feature_or_fix>`

### 4. 📝 Execution
- **ONLY** edit the files directly related to your approved plan.
- Respect other agents: Do not refactor out-of-scope files.

### 5. ✅ Completion & Handoff
- Mark your specific sub-task as completed (`[x]`) in the active sprint document (e.g., `Planning/sprint_chat_v1.md`).
- **💰 Log your execution cost:** Open `Planning/billing.md` and add a new row to the tracking table. Calculate your token usage for the task and estimate the cost in BRL (R$).
- Commit your changes locally to your branch.
- Explicitly tell the Orchestrator your work is done.
- The Orchestrator will handle the merge back to main and command agents to synchronize (`git pull`).

---
*Acknowledge these rules, review the sprint file, and wait for the Orchestrator's assignment.*
