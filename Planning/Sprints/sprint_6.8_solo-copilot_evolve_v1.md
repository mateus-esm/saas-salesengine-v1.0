# Sprint 6.8 — The Premium Pass: Making the Revenue Powertrain *Feel* Like One

> **Status:** Strategy + full implementation plan (approved shape, 2026-06-23)
> **Design spec:** `Planning/sprint_6.8_premium_evolve_spec.md` (this file consolidates spec + plan).
> **Founder's raw critique (source input):** Appendix A below (18 points, verbatim).
> **Predecessor:** `sprint_6.7_solo-copilot_evolve_v1.md` — built the plumbing this sprint refines.

---

# PART I — STRATEGY & DESIGN

## 1. Why this sprint exists

Sprint 6.7 shipped the **plumbing** of the Revenue Powertrain: a shared grid, revenue math in Postgres, lifecycle, custom tables, a scoreboard, a sync sheet. Every task passed its gate. **It still missed the bar** — the result does not feel premium, several surfaces confuse a non-technical client, the workflow gets blocked, and a few things are broken.

### Root cause

6.7's acceptance criteria were **functional, not experiential**. A task passed when `npm run build` was green and a value "persisted after refresh." Nothing said *"feels premium, a non-technical client understands it instantly, nothing blocks the workflow, the math is honest."* So the engineer shipped correct plumbing with wrong craft.

### The one structural change in 6.8

Every wave carries a **"Definição de Premium"** — explicit *experiential* acceptance (look, clarity, non-blocking, client-readability, honest numbers) as first-class pass/fail conditions.

**Execution model (founder decision):** the agent **works straight through all waves and tasks** — no stop-the-line gate per wave/task. Mid-flight checks **only for critical/irreversible things** (data loss, destructive migrations) plus one light review near the end. The real quality gate is the **end-of-sprint pass**: a **backend review** (correctness, tenant-scoping, migrations, `pytest`, API contracts) and a **frontend refinement with a frontier model** evaluating every surface against its Definição de Premium. Commit per task for safety.

## 2. Wave map (priority order)

| Wave | Name | Founder points |
|---|---|---|
| **W1** | Copilot Redesign (sidebar → view → boxes) + Card detail layout | 17, 18, 13 |
| **W2** | Copilot Live Experience (elegant, fast, non-blocking, readable) + note-dedup bug | 1, 2, 4 |
| **W3** | Revenue Intelligence Redesign (Lead Score 0–10 + honest scoreboard) | 5, 6, 7, 10, 12 |
| **W4** | True Excel Grid (resize / drag-reorder / add-remove inline / bulk move) | 8, 9, 14 |
| **W5** | Sort & Filter | 15 |
| **W6** | Stage Engine (Aberto / Ganho / Perdido / Ciclo + cycle timer + webhook) | 11 |
| **W7** | Custom Tables fixed (no slug prompt, inline columns/rows, cross-table live link) | 16 |
| **W8** | Agenda views (Dia / Semana / Mês) | todo.md |
| **defer** | State persistence (no full-page reloads, draft autosave) | 3 → own sprint (`todo.md`) |

## 3. Key design decisions (founder-confirmed)

- **Lead Score 0–10** — one calm numeric signal derived from the existing ICP + velocity math, replacing the cryptic `🎯 ICP` / `🔥 Vel` badges everywhere.
- **Honest scoreboard** — only Meta + Fechados X/Y always; derived metrics (inbound necessário, conversão) only with sufficient history; otherwise `—  dados insuficientes`. No more `2600%`. Renamed on-brand.
- **Stage types** — Aberto / Ganho / Perdido / **Ciclo**. Ciclo fires after X days → moves the lead to a **configurable return stage** + optional **webhook**.
- **Card detail** — Oportunidade data + Notas in the wide **center**; Identidade / Linha do tempo / Vínculos / Tarefas / Decisões do Copilot / Agenda in a collapsible **rail**.
- **Custom-table linked columns** — **live-linked** (relation is source of truth; edits in source reflect through), not a frozen snapshot.

## 4. Global Constraints (carry over from 6.7, verbatim)

- **Tenant-scoped everything** — every query filtered by `equipe_id` (Supabase RLS).
- **Field-dictionary boundary** — the Copilot never writes an undefined field.
- **Additive migrations only** — never drop/rewrite columns; zero-downtime.
- **PT-BR for all user-facing strings.**
- **Async non-blocking UI** — sync, approvals, automations never lock the interface.
- **Build gate** — `npm run build` must pass; `tsc` alone insufficient. No FE unit runner → FE gate = `npm run build` green + browser smoke of the changed surface.
- **Backend gate** — `cd python-agent && python -m pytest tests/ -q` → 0 new failures.
- **JSONB for dynamic fields**; **entity links via bridge tables**.
- **Commit per task** — conventional-commit prefix (`feat(crm):`, `feat(copilot):`, `feat(db):`, `fix(...)`).

---

# PART II — IMPLEMENTATION PLAN

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. **Before editing any existing file, READ it fully and follow its patterns. Do not restructure unrelated code.**

**Goal:** Refine the 6.7 Revenue Powertrain into a premium, client-readable, non-blocking, correct product across 8 waves.

**Tech Stack:** React 18 + TS + Vite, Tailwind + shadcn/ui (Radix), `@dnd-kit`, `react-day-picker`, TanStack Query; Supabase Postgres (RLS, JSONB, PL/pgSQL); FastAPI + Agno (`python-agent/`, pytest).

---

## WAVE 1 — Copilot Redesign + Card Detail  (points 17, 18, 13)

**Wave goal:** Copilot becomes a sidebar-of-agents that opens one focused view at a time (options in collapsible boxes); pipeline config is redesigned clean & sectioned; the opportunity card puts data + notes center with a collapsible context rail.

**Definição de Premium:** never more than one agent view on screen; boxes open one-at-a-time and close to clean space; pipeline config reads calm (find "SLA"/"metas" without scanning a wall); card centers Oportunidade + Notas, context is one glance to the side and collapsible.

**File structure:**

| File | Responsibility | Action |
|---|---|---|
| `src/components/crm/copilot/CopilotSidebar.tsx` | Left nav: Base de Contatos + each active pipeline; reports selection up. | Create |
| `src/components/crm/copilot/agentBoxes.tsx` | Per-scope box registry (label + render fn). | Create |
| `src/components/crm/copilot/AgentDetailView.tsx` | Right pane: selected agent's collapsible boxes (one open at a time). | Create |
| `src/pages/CopilotCockpit.tsx` | Recompose body into sidebar + detail two-pane. | Modify |
| `src/components/crm/pipeline-settings/StageCard.tsx` | Vertical readable single-stage editor. | Create |
| `src/components/crm/pipeline-settings/StagesEditor.tsx` | Swap horizontal row for `StageCard`; keep dnd + hooks. | Modify |
| `src/components/crm/pipeline-settings/PipelineConfigPanel.tsx` | Clean sectioned config (Etapas/Metas/Campos/Origem). | Create |
| `src/components/crm/OpportunityDetailModal.tsx` | Flip 60/40: center = Oportunidade + Notas; rail = context. | Modify |

Reused as-is inside boxes: `CopilotConfigCard`, `CopilotTrainingPanel`, `CopilotApprovalsPanel`, `ControlRoom`, `RevenueGoalsForm`.

### Task 1.1: Copilot sidebar

**Files:** Create `src/components/crm/copilot/CopilotSidebar.tsx`

**Produces:**
```ts
export type AgentSelection =
  | { scope: "contact_base"; pipelineId: null }
  | { scope: "pipeline"; pipelineId: string };
export function CopilotSidebar(props: { selected: AgentSelection; onSelect: (s: AgentSelection) => void }): JSX.Element;
```

- [ ] **Step 1:** Create the nav (`w-60 shrink-0 border-r border-border/60`). Section `Agentes` with one button **Base de Contatos** (`Contact` icon), then group **Pipelines** mapping `usePipelines().activePipelines` to buttons (`Workflow` icon). Active state when matches `selected` (`bg-muted font-medium`). `isLoading` → 3 `Skeleton` rows. PT-BR.
```tsx
import { Contact, Workflow } from "lucide-react";
import { usePipelines } from "@/hooks/usePipelines";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AgentSelection =
  | { scope: "contact_base"; pipelineId: null }
  | { scope: "pipeline"; pipelineId: string };

export function CopilotSidebar({ selected, onSelect }: {
  selected: AgentSelection; onSelect: (s: AgentSelection) => void;
}) {
  const { activePipelines, isLoading } = usePipelines();
  const isActive = (s: AgentSelection) => s.scope === selected.scope && s.pipelineId === selected.pipelineId;
  const itemCls = (a: boolean) => cn(
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors",
    a ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/50");
  return (
    <nav className="w-60 shrink-0 border-r border-border/60 h-full overflow-y-auto p-3 space-y-4">
      <div className="space-y-1">
        <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Agentes</p>
        <button className={itemCls(isActive({ scope: "contact_base", pipelineId: null }))}
          onClick={() => onSelect({ scope: "contact_base", pipelineId: null })}>
          <Contact className="h-4 w-4 shrink-0" /> Base de Contatos
        </button>
      </div>
      <div className="space-y-1">
        <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Pipelines</p>
        {isLoading ? (
          <div className="space-y-2 px-1"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : activePipelines.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground italic">Nenhum pipeline ativo.</p>
        ) : activePipelines.map((p) => (
          <button key={p.id} className={itemCls(isActive({ scope: "pipeline", pipelineId: p.id }))}
            onClick={() => onSelect({ scope: "pipeline", pipelineId: p.id })}>
            <Workflow className="h-4 w-4 shrink-0" /><span className="truncate">{p.name}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
```
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(copilot): agent sidebar nav`

### Task 1.2: Agent box registry

**Files:** Create `src/components/crm/copilot/agentBoxes.tsx`

**Produces:** `AgentBox`, `AgentBoxContext`, `boxesForScope(scope)`.

- [ ] **Step 1:** READ `CopilotConfigCard.tsx` to confirm its props. Implement the registry: both scopes start with **Prompt & Base de Conhecimento** (`CopilotConfigCard`); `pipeline` scope adds **Receita & Metas** (`RevenueGoalsForm pipelineId`), **Automações Determinísticas** (`Soon` stub "Regras determinísticas (em breve)"), **Trabalho Agêntico** (`Soon` "Comportamento autônomo (em breve)"), **Aprovações** (`CopilotApprovalsPanel pipelineId`). Order: prompt, revenue, automations, agentic, approvals.
```tsx
import { CopilotConfigCard } from "@/components/crm/copilot/CopilotConfigCard";
import { RevenueGoalsForm } from "@/components/crm/revenue/RevenueGoalsForm";
import { CopilotApprovalsPanel } from "@/components/crm/copilot/CopilotApprovalsPanel";
import type { AutonomyMode } from "@/types/copilot";

export interface AgentBoxContext {
  scope: "contact_base" | "pipeline"; pipelineId: string | null; pipelineName?: string;
  agent: { name?: string; system_prompt?: string | null; autonomy_mode?: AutonomyMode; scope: string; pipeline_id: string | null } | undefined;
  onSaveAgent: (patch: { name: string; system_prompt: string | null; autonomy_mode: AutonomyMode }) => Promise<void>;
}
export interface AgentBox { id: string; label: string; render: (ctx: AgentBoxContext) => JSX.Element; }
const Soon = ({ text }: { text: string }) => <p className="text-xs text-muted-foreground p-2">{text}</p>;
const promptBox: AgentBox = {
  id: "prompt", label: "Prompt & Base de Conhecimento",
  render: (ctx) => (
    <CopilotConfigCard
      agent={ctx.agent ?? { scope: ctx.scope, pipeline_id: ctx.pipelineId }}
      title={ctx.scope === "contact_base" ? "Base de Contatos" : ctx.pipelineName ?? "Pipeline"}
      subtitle="Instruções e conhecimento do agente" onSave={ctx.onSaveAgent} />
  ),
};
export function boxesForScope(scope: "contact_base" | "pipeline"): AgentBox[] {
  if (scope === "contact_base") return [promptBox];
  return [
    promptBox,
    { id: "revenue", label: "Receita & Metas", render: (c) => <RevenueGoalsForm pipelineId={c.pipelineId!} /> },
    { id: "automations", label: "Automações Determinísticas", render: () => <Soon text="Regras determinísticas (em breve)" /> },
    { id: "agentic", label: "Trabalho Agêntico", render: () => <Soon text="Comportamento autônomo (em breve)" /> },
    { id: "approvals", label: "Aprovações", render: (c) => <CopilotApprovalsPanel pipelineId={c.pipelineId!} /> },
  ];
}
```
- [ ] **Step 2:** `npm run build` → green (match `CopilotConfigCard` real prop names if they differ).
- [ ] **Step 3:** Commit: `feat(copilot): per-agent box registry`

### Task 1.3: Agent detail view (one box open at a time)

**Files:** Create `src/components/crm/copilot/AgentDetailView.tsx`

**Produces:** `export function AgentDetailView(props: { selection: AgentSelection }): JSX.Element;`

- [ ] **Step 1:** Resolve agent via `useCopilotAgents()` (`agents.find(scope+pipeline_id)` — mirror `CopilotCockpit.tsx:65-89`); `onSaveAgent = upsert.mutateAsync({scope,pipeline_id,...patch})`. Render header + `Accordion type="single" collapsible` (enforces one-open) over `boxesForScope(selection.scope)`.
```tsx
import { useMemo } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useCopilotAgents } from "@/hooks/useCopilotAgents";
import { usePipelines } from "@/hooks/usePipelines";
import type { AutonomyMode } from "@/types/copilot";
import type { AgentSelection } from "./CopilotSidebar";
import { boxesForScope, type AgentBoxContext } from "./agentBoxes";

export function AgentDetailView({ selection }: { selection: AgentSelection }) {
  const { agents, upsert } = useCopilotAgents();
  const { activePipelines } = usePipelines();
  const pipeline = selection.scope === "pipeline" ? activePipelines.find((p) => p.id === selection.pipelineId) : undefined;
  const agent = useMemo(() => agents.find((a) => a.scope === selection.scope && a.pipeline_id === selection.pipelineId), [agents, selection]);
  const onSaveAgent = async (patch: { name: string; system_prompt: string | null; autonomy_mode: AutonomyMode }) =>
    { await upsert.mutateAsync({ scope: selection.scope, pipeline_id: selection.pipelineId, ...patch }); };
  const ctx: AgentBoxContext = { scope: selection.scope, pipelineId: selection.pipelineId, pipelineName: pipeline?.name, agent, onSaveAgent };
  return (
    <div className="flex-1 min-w-0 p-6 space-y-4 overflow-y-auto">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{selection.scope === "contact_base" ? "Base de Contatos" : pipeline?.name ?? "Pipeline"}</h2>
        <p className="text-sm text-muted-foreground">Configure este agente. Abra um bloco por vez.</p>
      </div>
      <Accordion type="single" collapsible className="w-full space-y-2">
        {boxesForScope(selection.scope).map((box) => (
          <AccordionItem key={box.id} value={box.id} className="border border-border/60 rounded-md px-3">
            <AccordionTrigger className="text-sm font-medium">{box.label}</AccordionTrigger>
            <AccordionContent className="pt-1 pb-3">{box.render(ctx)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
```
- [ ] **Step 2:** `npm run build` → green (confirm `useCopilotAgents` shape vs `CopilotCockpit.tsx`).
- [ ] **Step 3:** Commit: `feat(copilot): focused agent detail view`

### Task 1.4: Recompose CopilotCockpit

**Files:** Modify `src/pages/CopilotCockpit.tsx` (READ fully; 238 lines)

- [ ] **Step 1:** Keep the feature gate (`:27-54`), loading block (`:56-62`), header (`:97-106`). Keep `usePipelines` (for default selection).
- [ ] **Step 2:** Replace the body (`:108-232`, the whole `<Tabs>`…) with a two-pane layout driven by `useState<AgentSelection>` (default = first active pipeline, else contact_base). Remove now-unused imports (`Tabs*`, `CopilotConfigCard`, `ControlRoom`, `CopilotTrainingPanel`, `CopilotApprovalsPanel`, `PipelineCockpitAccordion`, the `findAgent`/`makeSaveHandler` helpers). The chat agent is intentionally dropped.
```tsx
import { useState } from "react";
import { CopilotSidebar, type AgentSelection } from "@/components/crm/copilot/CopilotSidebar";
import { AgentDetailView } from "@/components/crm/copilot/AgentDetailView";
// inside component:
const [selection, setSelection] = useState<AgentSelection>(
  activePipelines.length > 0 ? { scope: "pipeline", pipelineId: activePipelines[0].id } : { scope: "contact_base", pipelineId: null });
// body:
<div className="flex-1 min-h-0 flex">
  <CopilotSidebar selected={selection} onSelect={setSelection} />
  <AgentDetailView selection={selection} />
</div>
```
- [ ] **Step 3:** `npm run build` → green. Grep file for dangling references.
- [ ] **Step 4:** Browser smoke: sidebar lists agents; selecting swaps the pane; one box opens at a time; prompt saves + persists; Receita & Metas renders. Record.
- [ ] **Step 5:** Commit: `refactor(copilot): cockpit becomes sidebar + focused agent view`

### Task 1.5: StageCard (vertical readable editor)

**Files:** Create `src/components/crm/pipeline-settings/StageCard.tsx`

**Produces:** `StageCard({ stage, dragHandleProps?, onChange, onDelete })` — same `onChange` patch union as `StagesEditor.tsx:149-164`.

- [ ] **Step 1:** Lift the field logic from `SortableStageRow` (`StagesEditor.tsx:168-323`) into a **vertical, labelled-section card** (`p-4 rounded-lg border`): Header (grip via `dragHandleProps`, color, name `Input`, delete). Section **Tipo & Metas** (stage_type Select [Aberto/Ganho/Perdido — Ciclo arrives W6], SLA `max_idle_hours`, Máx. interações, each with a `<Label>`). Section **Cadência** (value + h/d unit). Section **Webhooks** (reuse `StageWebhookPopover` — add `export` to it in `StagesEditor.tsx` and import). Section **Descrição (treina o copiloto)** (Textarea). Copy `parsePositiveIntOrNull` + `NONE` verbatim. Keep all aria-labels and persisted patch keys identical (layout refactor only).
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(crm): vertical readable stage card`

### Task 1.6: StagesEditor uses StageCard

**Files:** Modify `src/components/crm/pipeline-settings/StagesEditor.tsx`

- [ ] **Step 1:** Keep `usePipelineStagesV2`, `DndContext`/`SortableContext`, `handleDragEnd`/`handleAdd`. `SortableStageRow` stays the sortable wrapper (`useSortable`) but its return becomes `<div ref={setNodeRef} style={style}><StageCard stage={stage} dragHandleProps={{...attributes,...listeners}} onChange={onChange} onDelete={onDelete} /></div>`. Delete the dead inline JSX. Add `import { StageCard } from "./StageCard";`.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Browser smoke: stages render as vertical cards; drag-reorder works; edits persist; webhook popover works. Record.
- [ ] **Step 4:** Commit: `refactor(crm): stages editor uses readable vertical cards`

### Task 1.7: PipelineConfigPanel (sectioned shell)

**Files:** Create `src/components/crm/pipeline-settings/PipelineConfigPanel.tsx`

- [ ] **Step 1:** READ `CustomFieldsEditor.tsx`, `CardFieldsPicker.tsx`, `OriginTaxonomyEditor.tsx` to confirm props. Render `Accordion type="single" collapsible defaultValue="stages"` with sections: **Etapas & SLA** (`StagesEditor`), **Metas de Receita** (`RevenueGoalsForm`), **Campos do Card** (`CardFieldsPicker`), **Campos Personalizados** (`CustomFieldsEditor`), **Origem / Canais** (`OriginTaxonomyEditor`) — each `<AccordionItem>` passing `pipelineId`.
- [ ] **Step 2:** `npm run build` → green (match each child's real props; don't change children).
- [ ] **Step 3:** Mount it: grep where pipeline settings render these editors today (likely a settings page rendering `StagesEditor` for a selected pipeline); replace that block with `<PipelineConfigPanel pipelineId={…} />`. Leave other `StagesEditor` usages.
- [ ] **Step 4:** `npm run build` → green; browser smoke: sections open one at a time, each editor works. Record.
- [ ] **Step 5:** Commit: `feat(crm): clean sectioned pipeline config panel`

### Task 1.8: Flip the card layout

**Files:** Modify `src/components/crm/OpportunityDetailModal.tsx` (split at `:230-366`)

- [ ] **Step 1:** Make the **`lg:col-span-3` center** render: `EntityChips` (header stays), the **Oportunidade** section (`:258-317`, stage/status/value/custom-fields), then **Notas** (`lead?.id ? <TouchpointsList leadId={lead.id}/> : fallback`). Keep `ScrollArea`.
- [ ] **Step 2:** Make the **`lg:col-span-2` rail** a stack of `Collapsible` sections (reuse the chevron pattern at `:320-332`): **Identidade Conectada** (`IdentityBlock`, default open), **Linha do tempo** (`TouchpointsList`), **Vínculos (Empresas e Imóveis)** (`CompanySection`/`PropertySection`), **Tarefas** (`TasksTabPane`), **Decisões do Copilot** (stub "em breve" — wires in W2), **Agenda do card** (stub "em breve" — wires in W8).
- [ ] **Step 3:** Delete the old Notas/Tarefas `<Tabs>` (`:335-362`). Keep `TasksTabPane`/`IdentityBlock` definitions. Grep for dangling refs.
- [ ] **Step 4:** `npm run build` → green.
- [ ] **Step 5:** Browser smoke: center = Oportunidade + Notas; save persists; rail collapsibles work; footer + paddle-shifter intact. Record.
- [ ] **Step 6:** Commit: `feat(crm): card detail — data + notas center, context rail side`

---

## WAVE 2 — Copilot Live Experience + note-dedup  (points 1, 2, 4)

**Wave goal:** the Copilot feels alive, fast, non-blocking, and its telemetry is client-readable; re-syncing with no new info no longer duplicates notes.

**Definição de Premium:** a client watching a sync sees calm human PT-BR sentences + a live pulse — never "down", never blocked; the big technical panel only appears behind "ver detalhes técnicos"; syncing twice with no new data adds zero notes.

**Grounding:** `sweep.py` streams SSE (`/sync/stream`) and runs `run_workflow` per card. The blocking telemetry is `TelemetryHUD.tsx` + the `SyncButton.tsx` AlertDialog. Notes are added by an `add_note` action executed inside the cascade (`python-agent/app/cascade/`). Human-readable mapping lives FE-side; the technical log stays toggle-gated.

**File structure:**
- Modify `python-agent/app/cascade/` (the action executor that applies `add_note`) — add idempotency.
- Create `python-agent/tests/test_note_dedup.py`.
- Create `src/components/crm/copilot/CopilotThinkingBadge.tsx` — the elegant live pill (expand on demand).
- Create `src/components/crm/copilot/humanizeEvent.ts` — maps raw events → PT-BR sentences.
- Modify `src/components/crm/copilot/SyncButton.tsx` / `TelemetryHUD.tsx` — non-blocking + readable + "detalhes técnicos" toggle.

### Task 2.1: Note de-duplication (backend, TDD)

**Files:** Locate the `add_note` executor (grep `add_note` under `python-agent/app/cascade/`); Modify it; Create `python-agent/tests/test_note_dedup.py` (mirror existing cascade/sweep tests).

- [ ] **Step 1 (failing test):** `test_resync_with_no_new_info_adds_no_duplicate_note`: seed a lead + an existing note with content C; run the note-add path with the same content C; assert the note count is unchanged. `pytest` → FAIL.
- [ ] **Step 2 (implement):** Before inserting a note, query existing touchpoints/notes for the lead within the current run/window and skip insert when an equivalent note exists (normalize whitespace/case; compare content, or a stored content hash). Tenant-scoped by `equipe_id`.
- [ ] **Step 3:** `pytest` → PASS. Add `test_note_with_new_info_is_added`. → PASS. Full suite → 0 new failures.
- [ ] **Step 4:** Commit: `fix(copilot): de-duplicate copilot notes on re-sync`

### Task 2.2: Event humanizer

**Files:** Create `src/components/crm/copilot/humanizeEvent.ts`

**Produces:** `export function humanizeEvent(ev: { type: string; payload?: Record<string, unknown> }): { text: string; technical: string } | null;`

- [ ] **Step 1:** Map raw event types → PT-BR sentences, e.g. `move_stage` → "Movi este lead para {stage_name}."; `add_note` → "Adicionei uma nota."; `set_field`/`set_contact_field` → "Atualizei {label}."; `sweep_progress` → null (suppress from client view); `done` → "Sincronização concluída." Return both the friendly `text` and a raw `technical` string (the JSON) for the toggle. No raw IDs in `text`.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(copilot): humanize telemetry events`

### Task 2.3: Thinking badge

**Files:** Create `src/components/crm/copilot/CopilotThinkingBadge.tsx`

**Produces:** `CopilotThinkingBadge({ events, running }: { events: RunEvent[]; running: boolean }): JSX.Element` — small pill showing the latest humanized step + a pulse while `running`; click expands a popover/sheet with the full humanized stream and a "ver detalhes técnicos" toggle revealing the raw log (`font-mono text-[10px]`).

- [ ] **Step 1:** Build the pill (compact, `rounded-full`, papaya/primary pulse dot while running). Use `humanizeEvent`; skip null-mapped events. Default collapsed.
- [ ] **Step 2:** Expand → list of friendly sentences; a `Collapsible` "ver detalhes técnicos" → raw events. Non-blocking (popover, not modal).
- [ ] **Step 3:** `npm run build` → green.
- [ ] **Step 4:** Commit: `feat(copilot): elegant live thinking badge`

### Task 2.4: Non-blocking + readable sync surface

**Files:** Modify `src/components/crm/copilot/SyncButton.tsx` and `TelemetryHUD.tsx` (READ both fully)

- [ ] **Step 1:** Replace any blocking `AlertDialog`/full-screen telemetry with the `CopilotThinkingBadge` (and, where a fuller view is wanted, a right `@/components/ui/sheet` with `modal={false}` so the dashboard stays interactive). Feed it the existing SSE stream events.
- [ ] **Step 2:** Ensure immediate feedback on action start (pulse appears < ~300ms; no blank "dead" state). The big technical HUD content moves behind the "detalhes técnicos" toggle.
- [ ] **Step 3:** Apply the SAME badge in the chat-session telemetry context (point 1) — not the big panel.
- [ ] **Step 4:** `npm run build` → green; browser smoke: start a sync → calm pill streams human sentences, dashboard stays clickable; technical log only on toggle; second sync with no new data adds no note. Record.
- [ ] **Step 5:** Commit: `feat(copilot): non-blocking readable live telemetry`

---

## WAVE 3 — Revenue Intelligence Redesign  (points 5, 6, 7, 10, 12)

**Wave goal:** one **Lead Score 0–10** signal replaces `🎯 ICP`/`🔥 Vel` everywhere; the scoreboard shows honest numbers and an on-brand name.

**Definição de Premium:** a non-technical client instantly reads "Score do Lead: 8/10"; no impossible numbers anywhere; thin data says "dados insuficientes"; card faces show one calm signal, not two faded emojis.

**Grounding:** `SpreadsheetGrid.tsx` hardcodes an **"ICP Vel"** column (`:62,121,187`) rendering `ICPScoreBadge`+`VelocityScoreBadge` from `row._icp_score`/`row._velocity`. Card faces use the same two badges (grep). `PipelineScoreboard.tsx` hardcodes "Placar de Receita" and renders `(r.rate*100)` chips. `forecast.py` computes `required_inbound = goal/∏rate` with no clamp → "2600%".

**File structure:**
- Create `src/components/crm/LeadScoreBadge.tsx` — the single 0–10 badge (+ tooltip breakdown).
- Modify `src/components/crm/grid/SpreadsheetGrid.tsx` — replace the "ICP Vel" column with one "Score" column.
- Modify Kanban card component(s) using the old badges (grep) — swap to `LeadScoreBadge`.
- Modify `python-agent/app/routers/forecast.py` — clamp rates to [0,1]; guard required_inbound; flag insufficient data.
- Create `python-agent/app/routers/lead_score.py` (or extend `revenue.py`) — `GET /api/v1/lead-score/{lead_id}` → `{ score: 0-10, breakdown }`.
- Modify `src/components/crm/revenue/PipelineScoreboard.tsx` — honest, renamed, on-brand.
- Tests: `python-agent/tests/test_revenue_math.py` (extend).

### Task 3.1: Lead-score endpoint (TDD)

**Files:** Create/extend a router; tests in `test_revenue_math.py`.

**Produces:** `GET /api/v1/lead-score/{lead_id}` → `{ "lead_id", "score": number (0-10), "breakdown": [{label, contribution}] }`. Score = normalize(existing ICP 0–100 + velocity) → 0–10 (e.g. `round((icp/100 * 0.7 + clamp(velocity)/V_MAX * 0.3) * 10)` — confirm weights at impl; deterministic, tenant-scoped).

- [ ] **Step 1 (failing test):** `test_lead_score_is_0_to_10`: seed a lead with known ICP + velocity; assert score in `[0,10]` and matches the formula. → FAIL.
- [ ] **Step 2 (implement):** thin handler reusing the existing ICP + velocity functions/RPCs; normalize to 0–10; return breakdown. → PASS.
- [ ] **Step 3:** `test_lead_score_zero_when_no_signal` → PASS. Full suite green.
- [ ] **Step 4:** Commit: `feat(copilot): lead-score 0-10 endpoint`

### Task 3.2: LeadScoreBadge

**Files:** Create `src/components/crm/LeadScoreBadge.tsx`

**Produces:** `LeadScoreBadge({ score, breakdown? }: { score: number | null; breakdown?: {label:string;contribution:number}[] })` — a calm chip `Score {n}/10` (color ramp by score, NOT faded emojis); hover/tap = breakdown tooltip; `null` → muted "—".

- [ ] **Step 1:** Build it (shadcn `Tooltip`/`Popover`). `text-xs`, clear label "Score do Lead". PT-BR.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(crm): single lead-score badge`

### Task 3.3: Replace ICP/Vel in grid + cards

**Files:** Modify `src/components/crm/grid/SpreadsheetGrid.tsx`; grep+modify Kanban card usages of `ICPScoreBadge`/`VelocityScoreBadge`.

- [ ] **Step 1:** In `SpreadsheetGrid.tsx`, replace the three hardcoded `ICP Vel` header cells (`:62,121,187`) with a single `Score` header, and the per-row badge cell (`:229-234`) with `<LeadScoreBadge score={(row._lead_score as number|null) ?? null} />`. Update the host queries to provide `row._lead_score` (from the new endpoint/RPC) instead of `_icp_score`/`_velocity`.
- [ ] **Step 2:** Grep `ICPScoreBadge`/`VelocityScoreBadge` across `src/`; replace each remaining usage (Kanban card face etc.) with `LeadScoreBadge`. Delete `ICPScoreBadge.tsx`/`VelocityScoreBadge.tsx` if nothing imports them (grep to confirm).
- [ ] **Step 3:** `npm run build` → green; browser smoke: grid + Kanban show one Score chip, no faded emojis. Record.
- [ ] **Step 4:** Commit: `feat(crm): one lead-score signal replaces ICP/Vel badges`

### Task 3.4: Honest forecast math (TDD)

**Files:** Modify `python-agent/app/routers/forecast.py`; tests in `test_revenue_math.py`.

- [ ] **Step 1 (failing test):** `test_forecast_clamps_and_flags_insufficient_data`: seed a pipeline with no history (rates default) → assert each rate ∈ [0,1], `required_inbound` is null/None (not a huge number) and a `sufficient_data: false` flag is returned. → FAIL.
- [ ] **Step 2 (implement):** clamp every effective rate to `[0,1]`; compute `required_inbound` only when `goal_deals>0` AND all open-stage rates come from real history AND `cumulative>0`, else return `required_inbound: None` + `sufficient_data: False`. Add `sufficient_data` to the response. → PASS.
- [ ] **Step 3:** `test_forecast_required_inbound_with_history` (goal 10, two stages 0.5 → 40). → PASS. Full suite green.
- [ ] **Step 4:** Commit: `fix(copilot): clamp + guard forecast math, flag insufficient data`

### Task 3.5: Scoreboard redesign

**Files:** Modify `src/components/crm/revenue/PipelineScoreboard.tsx`

- [ ] **Step 1:** Rename "Placar de Receita" → **"Painel de Receita"**. Always show **Meta** + **Fechados X/Y** with the progress bar. Show **Inbound necessário** and the conversion chips ONLY when `data.sufficient_data`; otherwise render `—  dados insuficientes` in those slots. Never render a rate without `%` guarded to `[0,100]`.
- [ ] **Step 2:** On-brand polish: keep collapsible-to-thin-strip; calm spacing; remove the cramped overflow row feel.
- [ ] **Step 3:** `npm run build` → green; browser smoke with a real + an empty pipeline: empty shows "dados insuficientes", no 2600%. Record.
- [ ] **Step 4:** Commit: `feat(crm): honest on-brand revenue panel`

---

## WAVE 4 — True Excel Grid  (points 8, 9, 14)

**Wave goal:** `SpreadsheetGrid` gains column **resize**, **drag-reorder**, **add/remove inline**, persisted layout, and a **"mover para etapa"** bulk action — inherited by Base de Contatos, Pipeline leads, and all custom/default tables.

**Definição de Premium:** resize/reorder feel native and survive refresh; adding a column is a 2-click inline action; bulk "mover para etapa" updates rows visibly.

**Grounding:** `SpreadsheetGrid.tsx` is a plain `<table>` with `col.width` already on `ColumnDef`. `@dnd-kit` is a dependency. `MassActionBar` + `useGridSelection` exist. Hosts: `DatabaseView.tsx`, `OpportunityTable.tsx`, `customtables/CustomTableView.tsx`.

**File structure:**
- Create `src/components/crm/grid/useColumnLayout.ts` — width+order+visibility, persisted to `localStorage` by `layoutKey`.
- Create `src/components/crm/grid/ColumnHeader.tsx` — sortable + resizable header cell.
- Modify `src/components/crm/grid/SpreadsheetGrid.tsx` — adopt layout + dnd header + resize; accept `layoutKey` + `onRemoveColumn`.
- Modify `src/components/crm/OpportunityTable.tsx` — add `mover para etapa` MassAction.

### Task 4.1: Column-layout hook

**Files:** Create `src/components/crm/grid/useColumnLayout.ts`

**Produces:**
```ts
export function useColumnLayout(layoutKey: string, columns: ColumnDef[]): {
  ordered: ColumnDef[];
  widths: Record<string, number>;
  setWidth: (key: string, px: number) => void;
  moveColumn: (activeKey: string, overKey: string) => void;
  hidden: Set<string>;
  toggleHidden: (key: string) => void;
};
```
- [ ] **Step 1:** Persist `{ order: string[]; widths: Record<string,number>; hidden: string[] }` to `localStorage[layoutKey]`. `ordered` = columns sorted by stored order (new columns appended); `moveColumn` uses `arrayMove`. Merge gracefully when `columns` change.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(crm): persisted column-layout hook`

### Task 4.2: Resizable + sortable header

**Files:** Create `src/components/crm/grid/ColumnHeader.tsx`

**Produces:** `ColumnHeader({ column, width, onResize, onRemove, dragHandleProps })` — a `<th>` with the label, a drag handle (reorder), a right-edge resize grabber (`onPointerDown` → track `clientX` delta → `onResize(px)`), and a small menu (`⋯`) with "Remover coluna".

- [ ] **Step 1:** Implement resize via pointer events (min width ~80px). Reorder via `@dnd-kit` `useSortable` on the column key (horizontal). Menu item calls `onRemove`. PT-BR.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(crm): resizable + draggable column header`

### Task 4.3: Wire into SpreadsheetGrid

**Files:** Modify `src/components/crm/grid/SpreadsheetGrid.tsx`

- [ ] **Step 1:** Add props `layoutKey: string` and `onRemoveColumn?: (key:string)=>void`. Use `useColumnLayout(layoutKey, columns)`; render `ordered` minus `hidden`; wrap the header row in `DndContext`+horizontal `SortableContext`, rendering `ColumnHeader` per column; apply `widths[col.key]` to `<th>`/`<td>` via `style={{width}}`. Keep the selection checkbox + Score column + `onAddColumn` `+`.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Update the 3 hosts (`DatabaseView`, `OpportunityTable`, `CustomTableView`) to pass a stable `layoutKey` (e.g. `contacts`, `pipeline:{id}`, `customtable:{id}`) and an `onRemoveColumn` that soft-removes the column from that surface's schema/config.
- [ ] **Step 4:** `npm run build` → green; browser smoke: resize + reorder + remove → survives refresh on all three surfaces. Record.
- [ ] **Step 5:** Commit: `feat(crm): excel-style resize/reorder/remove on shared grid`

### Task 4.4: Bulk "mover para etapa"

**Files:** Modify `src/components/crm/OpportunityTable.tsx` (READ fully)

- [ ] **Step 1:** Add a `MassAction` "Mover para etapa" whose `run(ids)` opens a stage `Select` (the pipeline's stages) and batch-updates `opportunities.stage_id` for all selected ids (tenant-scoped), then refreshes. Keep existing bulk actions.
- [ ] **Step 2:** `npm run build` → green; browser smoke: select N leads → Mover para etapa → choose stage → rows move. Record.
- [ ] **Step 3:** Commit: `feat(crm): bulk move opportunities to a stage`

---

## WAVE 5 — Sort & Filter  (point 15)

**Wave goal:** order rows by creation (asc/desc, newest first) and filter by data de criação / canal / owner — in pipelines, Base de Contatos, and inside Kanban.

**Definição de Premium:** newest leads to the top in one click; filters read clearly in PT-BR and combine predictably; clearing is obvious.

**File structure:**
- Create `src/hooks/useGridQuery.ts` — `{ sort, filters }`, persisted per scope; `apply(rows)`.
- Create `src/components/crm/grid/GridToolbar.tsx` — sort control + filter chips.
- Modify `DatabaseView.tsx`, `OpportunityTable.tsx`, `OpportunityKanban.tsx` — mount toolbar + apply.

### Task 5.1: Query state hook

**Files:** Create `src/hooks/useGridQuery.ts`

**Produces:**
```ts
export interface GridSort { key: string; dir: "asc" | "desc"; }
export interface GridFilter { key: string; op: "eq" | "contains" | "between"; value: unknown; }
export function useGridQuery(scopeKey: string): {
  sort: GridSort; setSort: (s: GridSort) => void;
  filters: GridFilter[]; setFilters: (f: GridFilter[]) => void;
  apply<T extends Record<string, unknown>>(rows: T[]): T[];
};
```
- [ ] **Step 1:** Default `sort = { key: "created_at", dir: "desc" }`. `apply` filters (AND) then sorts. Persist to `localStorage[scopeKey]`.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(crm): grid sort/filter state hook`

### Task 5.2: GridToolbar

**Files:** Create `src/components/crm/grid/GridToolbar.tsx`

- [ ] **Step 1:** Render a sort dropdown (campo + asc/desc, default "Mais recentes") and filter controls for **Data de criação** (range), **Canal** (`origin`), **Owner** (assigned user) — extensible via a `fields` prop. Active filters show as removable chips + a "Limpar" button. PT-BR.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(crm): grid sort/filter toolbar`

### Task 5.3: Apply across surfaces

**Files:** Modify `DatabaseView.tsx`, `OpportunityTable.tsx`, `OpportunityKanban.tsx` (READ each)

- [ ] **Step 1:** In each, `const q = useGridQuery(scopeKey)`, mount `<GridToolbar>`, and feed rows through `q.apply(rows)` before rendering (Kanban applies within each column).
- [ ] **Step 2:** `npm run build` → green; browser smoke: newest-first works; canal/owner/date filters combine + clear; Kanban honors them. Record.
- [ ] **Step 3:** Commit: `feat(crm): sort + filter on contacts, pipeline list, kanban`

---

## WAVE 6 — Stage Engine  (point 11)

**Wave goal:** stage types gain **Ciclo**; a Ciclo stage, after X days, moves the lead to a **configurable return stage** and optionally fires a **webhook**.

**Definição de Premium:** configuring "60 dias → volta para Prospecção + webhook" is clear & guided; the return + webhook fire reliably and exactly once per cycle.

**Grounding:** `StageType = "open"|"won"|"lost"` (`types/pipelines.ts:48`). `pipeline_stages_v2` already has `webhook_triggers` + cadence + SLA. The cycle pass fits alongside the sweep's lifecycle-recompute (`sweep.py:113-129`). Webhook infra exists (`useWebhookConfigs`, `StageWebhookTrigger`).

**File structure:**
- Create `supabase/migrations/<ts>_sprint68_stage_ciclo.sql` — extend `stage_type` CHECK to include `'ciclo'`; additive `cycle_days int`, `cycle_target_stage_id uuid` on `pipeline_stages_v2`.
- Modify `src/types/pipelines.ts` — add `"ciclo"` to `StageType`; add cycle fields + payloads.
- Modify `src/components/crm/pipeline-settings/StageCard.tsx` — Ciclo option + cycle config UI.
- Create `python-agent/app/routers/cycle.py` (or extend `sweep.py`) — the cycle pass.
- Tests: `python-agent/tests/test_stage_cycle.py`.

### Task 6.1: Migration (additive) — ⚠ CRITICAL (founder-gated)

**Files:** Create `supabase/migrations/<ts>_sprint68_stage_ciclo.sql`

- [ ] **Step 1:** Additive: alter the `stage_type` CHECK to allow `('open','won','lost','ciclo')`; `ADD COLUMN IF NOT EXISTS cycle_days int`, `cycle_target_stage_id uuid REFERENCES pipeline_stages_v2(id)`. **Before applying, confirm no existing rows violate the new CHECK; never drop data.** This is a critical/irreversible step — get founder confirmation before applying to any shared DB.
- [ ] **Step 2:** Apply locally; verify columns + constraint.
- [ ] **Step 3:** Commit: `feat(db): additive ciclo stage type + cycle config`

### Task 6.2: Types

**Files:** Modify `src/types/pipelines.ts`

- [ ] **Step 1:** `StageType = "open"|"won"|"lost"|"ciclo"`; add `cycle_days: number|null` + `cycle_target_stage_id: string|null` to `PipelineStageV2`, `UpdateStageV2Data`, `CreateStageV2Data`.
- [ ] **Step 2:** `npm run build` → green (fix any exhaustive switch on `StageType`).
- [ ] **Step 3:** Commit: `feat(crm): ciclo stage type + cycle config types`

### Task 6.3: StageCard cycle UI

**Files:** Modify `src/components/crm/pipeline-settings/StageCard.tsx`

- [ ] **Step 1:** Add "Ciclo" to the stage-type Select. When `stage_type === "ciclo"`, reveal a **Ciclo** section: `cycle_days` number input ("Dias até reciclar") + `cycle_target_stage_id` Select ("Voltar para a etapa") from the pipeline's stages + a hint that the configured webhook fires on the cycle. Persist via `onChange`.
- [ ] **Step 2:** `npm run build` → green; browser smoke: set a stage to Ciclo, choose days + return stage, persist. Record.
- [ ] **Step 3:** Commit: `feat(crm): ciclo stage configuration UI`

### Task 6.4: Cycle pass (backend, TDD)

**Files:** Create `python-agent/app/routers/cycle.py` (or extend `sweep.py`); tests `python-agent/tests/test_stage_cycle.py`.

- [ ] **Step 1 (failing test):** `test_ciclo_returns_lead_after_days`: seed an opp in a ciclo stage with `cycle_days=30`, `stage_entered_at` 31 days ago, `cycle_target_stage_id=S1`; run the cycle pass; assert the opp moved to S1. → FAIL.
- [ ] **Step 2 (implement):** the pass loads opps in ciclo stages where `now - stage_entered_at >= cycle_days`, moves them to `cycle_target_stage_id` (resets `stage_entered_at`), and POSTs the configured webhook with the lead payload. Idempotent (the stage move itself prevents re-trigger). Tenant-scoped.
- [ ] **Step 3:** `pytest` → PASS. Add `test_ciclo_does_not_fire_before_days` + `test_ciclo_webhook_fires_once`. → PASS. Full suite green.
- [ ] **Step 4:** Commit: `feat(copilot): ciclo stage return + webhook pass`

---

## WAVE 7 — Custom Tables fixed  (point 16)

**Wave goal:** no slug prompt (derive it); create columns + rows inline inside a table; cross-table **live-linked** columns.

**Definição de Premium:** creating a table is name-only; columns/rows added directly in the table; linking a column to another table populates the new table via a live link (no re-entry, no stale data).

**Grounding:** `CustomTableManager.tsx` requires `newName` AND `newSlug` (`:46-55`). `CustomTableView.tsx` renders the table. The grid `relation` kind + `custom_table_links` + `RelationPicker`/`RelationChip`/`useRelationResolver` exist from 6.7 W2.

**File structure:**
- Modify `src/components/crm/customtables/CustomTableManager.tsx` — drop the slug input; derive slug from name.
- Modify `src/components/crm/customtables/CustomTableView.tsx` — inline add-column (column-type registry, incl. relation) + add-row.
- Modify `src/hooks/useCustomTables.ts` (if needed) — accept name-only create; slugify + dedupe.

### Task 7.1: Derive slug

**Files:** Modify `CustomTableManager.tsx` (+ `useCustomTables.ts` if create requires slug)

- [ ] **Step 1:** Remove the slug `Input` (`:46-50`) and `newSlug` state. In `handleCreate`, derive `slug = slugify(newName)` (`toLowerCase`, strip accents, `\s+`→`_`, drop non-`[a-z0-9_]`); ensure uniqueness (append `_2` etc. if needed). Enable "Criar" on `newName` only.
- [ ] **Step 2:** `npm run build` → green; browser smoke: create a table by name only. Record.
- [ ] **Step 3:** Commit: `feat(crm): derive custom-table slug from name`

### Task 7.2: Inline columns + rows

**Files:** Modify `CustomTableView.tsx` (READ fully)

- [ ] **Step 1:** Wire the grid `onAddColumn` (`+` header button already in `SpreadsheetGrid`) to a column creator using `COLUMN_TYPES` (implemented kinds, incl. `relation`); persist new columns to `custom_tables.table_schema`. Add an "Adicionar linha" affordance inserting a blank `custom_table_records` row.
- [ ] **Step 2:** `npm run build` → green; browser smoke: add a text column + a row inline; persists after refresh. Record.
- [ ] **Step 3:** Commit: `feat(crm): inline column + row creation in custom tables`

### Task 7.3: Live-linked relation column

**Files:** Modify `CustomTableView.tsx` (+ confirm `useRelationResolver`/`custom_table_links`)

- [ ] **Step 1:** When a new column is `kind:"relation"` linked to another table, create it live: the column resolves rows through `custom_table_links`/`useRelationResolver` (source of truth = the linked table). On creation, **seed** the new table's rows from the source via the live link so it starts populated; edits in the source reflect through (no snapshot). Use `RelationPicker`/`RelationChip`.
- [ ] **Step 2:** `npm run build` → green; browser smoke: add a relation column to Table B linking Table A → B shows A's rows live; edit a value in A → reflects in B. Record.
- [ ] **Step 3:** Commit: `feat(crm): live-linked cross-table relation columns`

---

## WAVE 8 — Agenda views  (todo.md)

**Wave goal:** Agenda supports **Dia / Semana / Mês**.

**Definição de Premium:** switching Dia/Semana/Mês is instant; the same events render correctly in each.

**Grounding:** `AgendaView.tsx` + `useAgendaEvents.ts` exist (6.7 W5, month grid). `react-day-picker` + `date-fns`+`ptBR` installed.

**File structure:**
- Create `src/components/crm/agenda/AgendaDayView.tsx`, `AgendaWeekView.tsx`.
- Modify `src/components/crm/agenda/AgendaView.tsx` — add the Dia/Semana/Mês toggle.

### Task 8.1: Day + week views

**Files:** Create `AgendaDayView.tsx`, `AgendaWeekView.tsx`

- [ ] **Step 1:** `AgendaDayView({ date, events })` = single-day timeline list; `AgendaWeekView({ date, events })` = 7-column grid (Seg–Dom) with events per day. Reuse `useAgendaEvents` data + the color map. `ptBR`.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit: `feat(crm): agenda day + week views`

### Task 8.2: View toggle

**Files:** Modify `AgendaView.tsx`

- [ ] **Step 1:** Add a `Tabs`/segmented control **Dia / Semana / Mês** (`useState`, default Mês); render the matching view; keep month nav + `[Hoje]`.
- [ ] **Step 2:** `npm run build` → green; browser smoke: toggle all three; events render in each. Record.
- [ ] **Step 3:** Commit: `feat(crm): agenda dia/semana/mês toggle`

---

## Self-Review (plan vs spec)

- **Coverage:** 17/18→W1; 13→W1.8; 1,2,4→W2; 5,6,7,10,12→W3; 8,9,14→W4; 15→W5; 11→W6; 16→W7; agenda views→W8; persistence(3)→deferred (`todo.md`). All 18 points + the two todo items mapped.
- **Placeholders:** the only stubs are honest "em breve" v2 boxes the spec defers (W1 automations/agentic/decisões/agenda-on-card → wired in W2/W8). Every code task ships working code + a gate.
- **Type consistency:** `AgentSelection`(1.1)→1.3/1.4; `AgentBox`/`AgentBoxContext`(1.2)→1.3; `StageCard`(1.5)→1.6; `useColumnLayout`(4.1)→4.3; `ColumnHeader`(4.2)→4.3; `GridSort/GridFilter`(5.1)→5.2/5.3; `StageType` extended(6.2)→6.3/6.4; lead-score endpoint(3.1)→`LeadScoreBadge`(3.2)→grid/cards(3.3).
- **Verify-at-impl risks (flagged in-task):** exact child-component prop signatures and the `add_note`/cascade executor location are read-and-matched at implementation; the W6 CHECK migration is founder-gated (no data loss).

---

# APPENDIX A — Founder's raw critique (verbatim source input)

> The original 18 points exactly as written, preserved as the source of truth for intent. The plan above is the engineered response.

```text
Iam looking to the result of the sprint 6.7 and here some points:

1. Em chat session the telemtry of the cockpit window is exactly the same thing, big, ugly and stop the workflow of the enduser this isn the premium experience that we want,with an elegant badge showin the reasoning for enduser fell the system alive and the client can open and see bigger if he wants.

2. The time to have some response its high and the enduser see nothing in the screen the felling is that the systema down, so need some more dynamic way and be more fast,like input the answers.

3. The system dont have persistence everything that i change the scree lost the thing that iam doing.

4. Telemetria do Copilot Minimizar Fechar Mover este lead para Qualificação move_stage Definindo etapa do pipeline como Qualificação. Mover este lead para - Concluido / ## Adicionar nota add_note Cliente solicita orçamento para sistema de 2000 watts e equipamentos. Agente está esclarecendo se é potência ou consumo. Adicionar nota Concluido / Sincronizacao concluida done executed — here is an example of the cockpit telemetry we can see many tecnical logs with the ids,we want something more precise and clear in an way that the client can understand: also need to see that has duplicate notes for example i sync now and the system add an note, so i sync again even that dont have any new information and the systme add another note with the same information.

5. In the CRM -> Pipeline View the frontend of the changes was very very bad dont fit with what i want the Placar de Receita Meta0 Inbound0 Fechados 0/0 2600% 5% 0% 0% 33% this dont make any sense to me we need somethign better.

6. also have 2 emoticos in the face of the card that i dont undersntadn and even the client will understand i think that is maybe the lead score but dont make sense.

7. In base de contatos also has some broken frontend: ICP Vel lije what is it,has 2 emoticion an little bit "apagado" that dont fit

8. Dont has the excel style that i ask for where i can adjust the size of the columns, add and remove directly on the table: base de contatos, pipelines, and new tables.

9. in the pipeline -> leads table view i want the option of make bulk actions and for example move many leads to an stage, alo the excel style with drag and drop columns and adjust size columns and remove columns

10. Also this information:ICP Vel dont make so sense

11. When we define the objective of an stage we need: aberto,fechado and something like define that this stage is about cycle where when fit some criteria trigger an event like reciclo where in count of days they where alive again this can be fit for something like cycle sales process like nutritionists where gain is cycle and in 60 days the client can retyrn and also for and reciclo stage where the client can be touchd again after x days.

12. Again i dont like this name and style of section: Placar de Receita Meta0 Inbound0 Fechados 0/0 2600% 5% 0% 0% 33% we can do something more elgant and fit with our vision and style.

13. I prefer change this positions: Identidade Conectada ... like see the data of the opporunitie in the cente and notes, touchpoints, historical, agenda of the card, copilot decisons, in the side.

14. I want the excel style to all tables like the news personalized tables and default tables.

15. In the pipeline and base de contatos and also inside the kanban view i want to option to change the ordered buy creation for example, ascendent and descendt, to see the news on the top and make some filters like data creating, channel, owner, etc.

16. in Tabelas Personalizadas dont need ask for the slug the slug is the name adpataded for it, inside the table i cannot create the columns and rows i need it and also when active the table i need that i can conect them when creating an new columns from another table, like the pipelines, when create new columns the rows are copied to the new table.

17. and now about our copilot session this is very very important and we need remadeit because was not it that iam asking for: when click in copilot session i want an side bar with the agents: base de contatos agent, pipelines agents, dont have for now this option of chat and so we can setup all the thing of this pipeline agent, the deterministic auotmations and agentic working. everything is inside that: Copilot -> Sidebar [Base de Contatos, Pipelines] -> Open the pipeline for example so have the setup button, logs, everything in your box, when click so open,whr close disappear for an elegant design.

18. And in the Pipeline config page we can setup the pipeline, stages, funcitosn of each stage, sla, goals, fields but in an more elegant and organized way,the current way is very ugly and disorganized.
```

---

*This document is the contract for Sprint 6.8. Execute wave-by-wave, commit per task, run straight through; the quality gate is the end-of-sprint backend review + frontier-model frontend refinement.*
