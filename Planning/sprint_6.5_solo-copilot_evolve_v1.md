# Sprint 6.5 Copilot UX Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Copilot feel like a product-grade CRM operator: visible in the right CRM place, fast feedback on Sync, compact readable execution telemetry, precise audit logs, elegant approval cards, clean Kanban cards, and Excel-like contact columns.

**Architecture:** Keep the Python agent as the action source, but normalize every UI surface through one shared frontend activity formatter. Move Copilot from a buried pipeline subsection into the CRM top-level workspace, while keeping pipeline context filters where useful. Make Base de Contatos columns schema-driven so users can add/delete/resize contact columns directly in the grid instead of being stuck with agent-created enrichment columns.

**Tech Stack:** React, Vite, TypeScript, TanStack Query, TanStack Table, shadcn/ui, Radix Dialog/Sheet primitives, Supabase, FastAPI agent at `https://agent.soloventures.com.br`.

---

## Production Env Rule

`VITE_COPILOT_URL=https://agent.soloventures.com.br` belongs in **Netlify** if Netlify builds/deploys the React frontend. Add it in Netlify -> Site configuration -> Environment variables, then redeploy the frontend.

Dokploy should have backend/agent env vars, not the Vite frontend build env, unless Dokploy also builds a frontend app. For the Python agent Dokploy app, verify:

```env
COPILOT_WORKFLOW_ENABLED=true
CORS_ORIGINS=https://app.soloventures.com.br
SUPABASE_URL=<use the existing Supabase project URL already stored in Dokploy>
SUPABASE_SERVICE_ROLE_KEY=<use the existing service-role key already stored in Dokploy>
SUPABASE_JWT_SECRET=<use the existing JWT secret already stored in Dokploy>
```

Acceptance:
- Netlify production build includes `VITE_COPILOT_URL=https://agent.soloventures.com.br`.
- Browser Sync calls go to `https://agent.soloventures.com.br/api/v1/...`, never `undefined/api/v1/...`.
- Dokploy agent health responds at `https://agent.soloventures.com.br/api/v1/health`.

---

## Current UX Problems From 2026-06-19 Screenshots

1. Kanban card face is clipped: footer actions overflow and only part of `Touchpoint` is visible.
2. CRM has `Central do Copiloto` buried inside a selected pipeline instead of a high-level CRM `Copilot` area.
3. Toggle label says `Agente de CRM`; user wants the product label to be `Copilot`.
4. Telemetry drawer is too large, technical, delayed, and visually heavy.
5. Telemetry says `set_contact_field` / `add_note` without field, output, target stage, reason, or result.
6. Control Room logs need precise audit columns: action verb, field/target, result/output, source, status, payload behind details.
7. Approval cards need precise language: `Marcar Lauro como perdido?` instead of `Marcar este lead como novo status?`.
8. Base de Contatos has agent-created/enrichment columns in the wrong place; users need to delete/create/resize columns directly in the table like a spreadsheet.

---

## File Ownership Map

| Area | Files | Responsibility |
|---|---|---|
| CRM top-level navigation | `src/pages/CRM.tsx`, `src/components/AIAgentToggle.tsx` | Add top-level `Copilot` tab and rename toggle label. |
| Pipeline tab cleanup | `src/components/crm/PipelineWorkspace.tsx`, `src/components/crm/copilot/CopilotCentralPanel.tsx` | Remove buried `Central do Copiloto` pipeline tab; keep pipeline-specific rules separate. |
| Copilot cockpit | `src/pages/CopilotCockpit.tsx`, `src/components/crm/copilot/ControlRoom.tsx`, `src/components/crm/copilot/CopilotApprovalsPanel.tsx` | High-level CRM Copilot workspace with Overview, Queue, Approvals, Logs, Setup/Training. |
| Activity formatting | `src/lib/copilotActivity.ts`, `src/lib/copilotHumanize.ts` | One shared formatter for HUD, approvals, and logs. |
| Sync telemetry | `src/components/crm/copilot/SyncButton.tsx`, `src/components/crm/copilot/TelemetryHUD.tsx`, `src/hooks/useCopilotSync.ts`, `src/hooks/useCopilotSweep.ts` | Fast feedback, compact queue, minimize/close behavior, screen-independent fixed panel. |
| Kanban card face | `src/components/crm/OpportunityCard.tsx` | Prevent footer clipping and keep card actions compact. |
| Contact spreadsheet columns | `src/components/crm/DatabaseView.tsx`, `src/components/crm/ContactColumnsToolbar.tsx`, `src/hooks/useContactFields.ts`, `src/components/crm/pipeline-settings/ContactFieldsEditor.tsx` | Create/delete/resize contact columns from Base de Contatos. |
| Tests / verification | no FE test runner today; use `npm.cmd run build`, targeted `eslint`, optional local browser smoke | Compile and manually smoke critical flows. |

---

## Wave Map

| Wave | Tasks | Parallelism |
|---|---|---|
| Wave 1 | T1, T2, T3 | Independent frontend UX fixes. |
| Wave 2 | T4, T5, T6 | Depends on T3 shared formatter. |
| Wave 3 | T7, T8 | Contact table column system; separate from Copilot UI. |
| Wave 4 | T9, T10 | Browser smoke, Netlify/Dokploy env verification, handoff. |

---

## Task T1 [S] - Production Env Clarification Checklist

**Files:**
- Modify: `Planning/sprint_6.5_solo-copilot_evolve_v1.md`

**Execution note (2026-06-19):**
- Public health smoke passed: `Invoke-RestMethod -Uri "https://agent.soloventures.com.br/api/v1/health"` returned `status: ok`.
- Netlify and Dokploy dashboard variables still require human/dashboard confirmation from the deployment owners.

- [ ] **Step 1: Confirm Netlify frontend env**

In Netlify, set:

```env
VITE_COPILOT_URL=https://agent.soloventures.com.br
```

Expected: frontend production bundle calls `https://agent.soloventures.com.br/api/v1/sync/stream`.

- [ ] **Step 2: Confirm Dokploy agent env**

In the Dokploy app rooted at `python-agent`, confirm:

```env
COPILOT_WORKFLOW_ENABLED=true
CORS_ORIGINS=https://<frontend-production-domain>
```

Expected: the Python agent allows browser requests from the Netlify domain.

- [ ] **Step 3: Smoke test agent health**

Run:

```powershell
Invoke-RestMethod -Uri "https://agent.soloventures.com.br/api/v1/health"
```

Expected:

```json
{"status":"ok"}
```

- [ ] **Step 4: Commit**

```powershell
git add Planning/sprint_6.5_solo-copilot_evolve_v1.md
git commit -m "docs(copilot): define Sprint 6.5 env checks"
```

---

## Task T2 [M] - CRM-Level Copilot Area and Product Naming

**Files:**
- Modify: `src/pages/CRM.tsx`
- Modify: `src/components/AIAgentToggle.tsx`
- Modify: `src/components/crm/PipelineWorkspace.tsx`
- Keep: `src/pages/CopilotCockpit.tsx`

Goal: CRM top navigation must have `Copilot` as a first-class tab next to Pipeline/Base de Contatos/Empresas/Imóveis/Tarefas. Remove the pipeline subsection named `Central do Copiloto`. Rename visible `Agente de CRM` labels to `Copilot`.

- [ ] **Step 1: Update CRM tab type**

In `src/pages/CRM.tsx`, change:

```ts
type TopTab = "pipeline" | "contacts" | "companies" | "properties" | "tasks";

const TOP_TABS: TopTab[] = ["pipeline", "contacts", "companies", "properties", "tasks"];
```

to:

```ts
type TopTab = "pipeline" | "contacts" | "companies" | "properties" | "tasks" | "copilot";

const TOP_TABS: TopTab[] = ["pipeline", "contacts", "companies", "properties", "tasks", "copilot"];
```

- [ ] **Step 2: Import icon and cockpit**

In `src/pages/CRM.tsx`, add:

```ts
import { Bot } from "lucide-react";
import CopilotCockpit from "@/pages/CopilotCockpit";
```

If `Bot` conflicts with existing imports, merge it into the existing `lucide-react` import.

- [ ] **Step 3: Add top-level Copilot trigger**

Inside `<TabsList>`, add after `Tarefas`:

```tsx
<TabsTrigger value="copilot" className="flex items-center gap-2">
  <Bot className="h-4 w-4" />
  Copilot
</TabsTrigger>
```

- [ ] **Step 4: Render Copilot top-level workspace**

In the content switch in `CRM.tsx`, add before the empty pipeline state:

```tsx
{tab === "contacts" ? (
  <DatabaseView />
) : tab === "companies" ? (
  <CompaniesDatabaseView />
) : tab === "properties" ? (
  <PropertiesDatabaseView />
) : tab === "tasks" ? (
  <TasksView />
) : tab === "copilot" ? (
  <CopilotCockpit />
) : !isLoading && pipelines.length === 0 ? (
  <EmptyPipelinesState />
) : pipelineId ? (
  <PipelineWorkspace pipelineId={pipelineId} />
) : null}
```

- [ ] **Step 5: Remove buried pipeline Copilot tab**

In `src/components/crm/PipelineWorkspace.tsx`, change:

```ts
export type PipelineView = "kanban" | "leads" | "agent" | "copilot";
const PIPELINE_VIEWS: PipelineView[] = ["kanban", "leads", "agent", "copilot"];
```

to:

```ts
export type PipelineView = "kanban" | "leads" | "agent";
const PIPELINE_VIEWS: PipelineView[] = ["kanban", "leads", "agent"];
```

Remove the `ScrollText` import, remove the `CopilotCentralPanel` import, remove the `Central do Copiloto` `<TabsTrigger>`, and remove:

```tsx
{view === "copilot" && <CopilotCentralPanel />}
```

- [ ] **Step 6: Rename visible Agente de CRM toggle**

In `src/components/AIAgentToggle.tsx`, replace visible strings:

```tsx
Agente de CRM
```

with:

```tsx
Copilot
```

Replace toast copy:

```ts
"Agente de CRM ativado com sucesso!"
"Agente de CRM desativado."
```

with:

```ts
"Copilot ativado com sucesso."
"Copilot desativado."
```

- [ ] **Step 7: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 8: Commit**

```powershell
git add src/pages/CRM.tsx src/components/AIAgentToggle.tsx src/components/crm/PipelineWorkspace.tsx
git commit -m "feat(copilot): move Copilot to CRM top-level tab"
```

---

## Task T3 [L] - Shared Copilot Activity Formatter

**Files:**
- Create: `src/lib/copilotActivity.ts`
- Modify: `src/lib/copilotHumanize.ts`
- Modify consumers in T4/T5/T6 after this formatter exists.

Goal: One formatter must describe actions precisely everywhere: HUD queue, approval cards, Control Room logs.

- [ ] **Step 1: Create `src/lib/copilotActivity.ts`**

Add:

```ts
export type CopilotTone = "info" | "success" | "warning" | "error" | "muted";

export interface CopilotActivityText {
  verb: string;
  title: string;
  description: string;
  field: string;
  result: string;
  source: string;
  tone: CopilotTone;
  technical: string;
}

type Payload = Record<string, unknown>;

function asRecord(value: unknown): Payload | null {
  return value && typeof value === "object" ? (value as Payload) : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function valueText(value: unknown): string {
  const direct = text(value);
  if (direct) return direct;
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  const record = asRecord(value);
  return (
    text(record?.name) ??
    text(record?.label) ??
    text(record?.title) ??
    text(record?.stage_name) ??
    text(record?.url) ??
    "Dados preenchidos"
  );
}

function fieldText(action: Payload, args: Payload | null): string {
  return (
    text(action.field_label) ??
    text(action.label) ??
    text(args?.field_label) ??
    text(args?.label) ??
    text(action.field_name) ??
    text(args?.field_name) ??
    text(action.field_id) ??
    text(args?.field_id) ??
    text(action.key) ??
    text(args?.key) ??
    "-"
  );
}

function stageText(action: Payload, args: Payload | null): string {
  const stageType = text(action.stage_type) ?? text(args?.stage_type);
  return (
    text(action.stage_name) ??
    text(action.stage_name_hint) ??
    text(args?.stage_name) ??
    text(args?.stage_name_hint) ??
    (stageType === "won" ? "Ganho" : stageType === "lost" ? "Perdido" : stageType ?? "-")
  );
}

function statusText(action: Payload, args: Payload | null): string {
  const status = text(action.status) ?? text(args?.status);
  if (status === "won") return "Ganho";
  if (status === "lost") return "Perdido";
  if (status === "open") return "Aberto";
  return status ?? "-";
}

export function formatCopilotActivity(
  action: unknown,
  options: { leadName?: string; source?: string } = {},
): CopilotActivityText {
  const leadName = options.leadName || "este lead";
  const actionRecord = asRecord(action);
  const args = asRecord(actionRecord?.args);
  const verb =
    text(actionRecord?.verb) ??
    text(actionRecord?.action) ??
    text(args?.verb) ??
    text(args?.action) ??
    "manual";

  const source = options.source || text(actionRecord?.mode) || "Copilot";
  const technical = stringifyCopilotPayload(action);

  switch (verb) {
    case "move_stage": {
      const result = stageText(actionRecord ?? {}, args);
      return {
        verb,
        title: `Mover ${leadName} para ${result}`,
        description: `Definindo etapa do pipeline como ${result}.`,
        field: "Etapa",
        result,
        source,
        tone: "info",
        technical,
      };
    }
    case "set_status": {
      const result = statusText(actionRecord ?? {}, args);
      return {
        verb,
        title: `Marcar ${leadName} como ${result}`,
        description: `Atualizando status comercial para ${result}.`,
        field: "Status",
        result,
        source,
        tone: result === "Perdido" ? "warning" : "info",
        technical,
      };
    }
    case "set_contact_field":
    case "set_field": {
      const field = fieldText(actionRecord ?? {}, args);
      const result = valueText(actionRecord?.value ?? args?.value);
      return {
        verb,
        title: `Atualizar ${field}`,
        description: `Definindo ${field} como ${result}.`,
        field,
        result,
        source,
        tone: "info",
        technical,
      };
    }
    case "add_touchpoint": {
      const result = valueText(actionRecord?.content ?? actionRecord?.content_template ?? args?.content);
      return {
        verb,
        title: `Registrar touchpoint`,
        description: result === "-" ? `Registrando novo contato com ${leadName}.` : result,
        field: "Touchpoint",
        result,
        source,
        tone: "info",
        technical,
      };
    }
    case "add_note": {
      const result = valueText(actionRecord?.content ?? actionRecord?.content_template ?? args?.content);
      return {
        verb,
        title: `Adicionar nota`,
        description: result === "-" ? `Registrando nota sobre ${leadName}.` : result,
        field: "Nota",
        result,
        source,
        tone: "info",
        technical,
      };
    }
    case "create_task": {
      const result = valueText(actionRecord?.title ?? actionRecord?.title_template ?? args?.title);
      return {
        verb,
        title: `Criar tarefa`,
        description: result,
        field: "Tarefa",
        result,
        source,
        tone: "info",
        technical,
      };
    }
    default:
      return {
        verb,
        title: text(actionRecord?.summary) ?? `Aplicar ação do Copilot`,
        description: text(actionRecord?.reason) ?? `Executando ${verb}.`,
        field: fieldText(actionRecord ?? {}, args),
        result: valueText(actionRecord?.value ?? actionRecord?.summary ?? actionRecord?.reason),
        source,
        tone: "muted",
        technical,
      };
  }
}

export function stringifyCopilotPayload(action: unknown): string {
  try {
    return JSON.stringify(action ?? {}, null, 2);
  } catch {
    return String(action);
  }
}
```

- [ ] **Step 2: Bridge existing humanize helper**

In `src/lib/copilotHumanize.ts`, import the new formatter and replace action sentence logic with:

```ts
import { formatCopilotActivity, stringifyCopilotPayload } from "@/lib/copilotActivity";

const DEFAULT_LEAD_NAME = "este lead";

export function humanizeCopilotAction(action: unknown, leadName = DEFAULT_LEAD_NAME): string {
  return `${formatCopilotActivity(action, { leadName }).title}?`;
}

export function stringifyActionDetails(action: unknown): string {
  return stringifyCopilotPayload(action);
}
```

- [ ] **Step 3: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/copilotActivity.ts src/lib/copilotHumanize.ts
git commit -m "feat(copilot): add precise activity formatter"
```

---

## Task T4 [M] - Compact Fast Telemetry HUD

**Files:**
- Modify: `src/components/crm/copilot/TelemetryHUD.tsx`
- Modify: `src/components/crm/copilot/SyncButton.tsx`

Goal: The HUD must open immediately after click, be compact/minimal, show readable queue items, work from Chat/CRM/Kanban, and be minimizable without stopping the run.

- [ ] **Step 1: Add immediate optimistic event**

In `SyncButton.tsx`, before calling `single.start` or `sweepHook.start`, keep the HUD opening immediately:

```ts
setHudOpen(true);
```

Do not wait for the network stream before showing feedback.

- [ ] **Step 2: Replace large drawer classes**

In `TelemetryHUD.tsx`, change the content class from a full-height `w-3/4` drawer to a compact panel:

```tsx
className={cn(
  "fixed right-4 top-20 z-50 w-[min(420px,calc(100vw-2rem))] max-h-[min(560px,calc(100vh-7rem))]",
  "rounded-lg border border-border bg-background p-4 shadow-2xl",
  "transition ease-in-out",
  "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-right-4",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-right-4",
)}
```

- [ ] **Step 3: Replace technical line formatter**

Import:

```ts
import { formatCopilotActivity } from "@/lib/copilotActivity";
```

Replace `lineFor` with a formatter that exposes action title and result:

```ts
function lineFor(ev: HudEvent): {
  title: string;
  detail: string;
  meta: string;
  tone: "info" | "ok" | "err" | "warn" | "muted";
} {
  if (ev.kind === "action_start") {
    const a = formatCopilotActivity(ev.payload);
    return { title: a.title, detail: a.description, meta: a.verb, tone: "info" };
  }
  if (ev.kind === "action_done") {
    const a = formatCopilotActivity(ev.payload);
    return ev.payload?.ok
      ? { title: a.title, detail: a.result, meta: "Concluído", tone: "ok" }
      : { title: a.title, detail: String(ev.payload?.error ?? "Falhou"), meta: "Erro", tone: "err" };
  }
  if (ev.kind === "awaiting_confirmation") {
    const a = formatCopilotActivity(ev.payload);
    return { title: "Aguardando aprovação", detail: a.title, meta: a.verb, tone: "warn" };
  }
  if (ev.kind === "sweep_progress") {
    const state = String(ev.payload?.state ?? "processando");
    return { title: "Sincronizando pipeline", detail: state, meta: String(ev.payload?.opportunity_id ?? "").slice(0, 8), tone: "muted" };
  }
  if (ev.kind === "done") {
    return { title: "Sincronização concluída", detail: String(ev.payload?.status ?? "concluído"), meta: "done", tone: "ok" };
  }
  return { title: ev.kind, detail: "", meta: "", tone: "muted" };
}
```

- [ ] **Step 4: Render readable queue items**

Replace the monospace scroll area with:

```tsx
<ScrollArea className="mt-3 max-h-[420px] pr-2">
  {events.length === 0 && (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <div className="font-medium">Conectando ao Copilot</div>
      <div className="text-xs text-muted-foreground">Preparando a análise...</div>
    </div>
  )}
  <div className="space-y-2">
    {events.map((ev, i) => {
      const item = lineFor(ev);
      return (
        <div key={`${ev.seq}-${i}`} className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{item.title}</span>
            <span className="text-[10px] text-muted-foreground uppercase">{item.meta}</span>
          </div>
          {item.detail && <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>}
        </div>
      );
    })}
  </div>
  <div ref={bottomRef} />
</ScrollArea>
```

- [ ] **Step 5: Improve minimized pill**

When minimized, show:

```tsx
<span className="font-medium">Copilot</span>
<span className="max-w-56 truncate text-muted-foreground">{lastLine}</span>
```

Expected: minimized state is understandable and not just a technical verb.

- [ ] **Step 6: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 7: Commit**

```powershell
git add src/components/crm/copilot/TelemetryHUD.tsx src/components/crm/copilot/SyncButton.tsx
git commit -m "feat(copilot): compact readable sync telemetry"
```

---

## Task T5 [M] - Precise Control Room Logs

**Files:**
- Modify: `src/components/crm/copilot/ControlRoom.tsx`
- Modify: `src/hooks/useCopilotDecisions.ts` only if types need fields.

Goal: Logs must show action, field, result/output, origin, and details. Example row: `18/06/2026, 23:16:14 | Marcos | move_stage | Etapa | Qualificação | Manual`.

- [ ] **Step 1: Import formatter**

In `ControlRoom.tsx`:

```ts
import { formatCopilotActivity } from "@/lib/copilotActivity";
```

- [ ] **Step 2: Replace row derivation**

Inside `rows.map`, derive:

```ts
const activity = formatCopilotActivity(row.output_action, {
  leadName: row.lead_name ?? "este lead",
  source: originLabel(row),
});
```

- [ ] **Step 3: Render columns**

Use this column order:

```tsx
<TableHead>Data</TableHead>
<TableHead>Lead</TableHead>
<TableHead>Ação</TableHead>
<TableHead>Campo</TableHead>
<TableHead>Resultado</TableHead>
<TableHead>Origem</TableHead>
<TableHead>Status</TableHead>
<TableHead />
```

For row cells:

```tsx
<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
  {formatTime(row.created_at)}
</TableCell>
<TableCell className="min-w-32 text-xs">
  <div className="font-medium text-foreground">{row.lead_name ?? "-"}</div>
  <div className="text-[10px] text-muted-foreground">
    {row.pipeline_id ? pipelineNames.get(row.pipeline_id) ?? row.pipeline_id.slice(0, 8) : "-"}
  </div>
</TableCell>
<TableCell className="text-xs font-mono">{activity.verb}</TableCell>
<TableCell className="text-xs">{activity.field}</TableCell>
<TableCell className="max-w-64 truncate text-xs" title={activity.result}>
  {activity.result}
</TableCell>
<TableCell className="text-xs">
  <Badge variant="outline" className="text-[10px]">{activity.source}</Badge>
</TableCell>
<TableCell>
  <Badge variant={statusVariant(row.status)} className="text-[10px]">{row.status}</Badge>
</TableCell>
<TableCell className="text-right">
  <details className="text-xs">
    <summary className="cursor-pointer text-muted-foreground">Payload</summary>
    <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-left text-[11px]">
      {activity.technical}
    </pre>
  </details>
</TableCell>
```

- [ ] **Step 4: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/crm/copilot/ControlRoom.tsx
git commit -m "feat(copilot): show precise decision log outputs"
```

---

## Task T6 [M] - Minimal Approval Cards With Precise Language

**Files:**
- Modify: `src/components/crm/copilot/CopilotApprovalCard.tsx`
- Modify: `src/components/crm/copilot/CopilotApprovalsPanel.tsx` if spacing/list presentation needs adjustment.

Goal: Approval cards must say exactly what will happen, with result visible and raw payload hidden behind details.

- [ ] **Step 1: Use shared formatter**

In `CopilotApprovalCard.tsx`, import:

```ts
import { formatCopilotActivity } from "@/lib/copilotActivity";
```

Replace:

```ts
const actionSentence = humanizeCopilotAction(decision.output_action, leadName);
const actionDetails = stringifyActionDetails(decision.output_action);
```

with:

```ts
const activity = formatCopilotActivity(decision.output_action, { leadName });
const actionSentence = `${activity.title}?`;
const actionDetails = activity.technical;
```

- [ ] **Step 2: Add result line**

Inside `CardContent`, before agent/reason, add:

```tsx
<div className="grid grid-cols-2 gap-2 text-xs">
  <div className="rounded-md bg-muted/40 p-2">
    <p className="text-[10px] uppercase text-muted-foreground">Campo</p>
    <p className="font-medium text-foreground truncate">{activity.field}</p>
  </div>
  <div className="rounded-md bg-muted/40 p-2">
    <p className="text-[10px] uppercase text-muted-foreground">Resultado</p>
    <p className="font-medium text-foreground truncate" title={activity.result}>
      {activity.result}
    </p>
  </div>
</div>
```

- [ ] **Step 3: Keep technical payload hidden**

Ensure the raw JSON only appears inside the existing `CollapsibleContent`.

- [ ] **Step 4: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/crm/copilot/CopilotApprovalCard.tsx src/components/crm/copilot/CopilotApprovalsPanel.tsx
git commit -m "feat(copilot): clarify approval action cards"
```

---

## Task T7 [S] - Fix Kanban Card Face Clipping

**Files:**
- Modify: `src/components/crm/OpportunityCard.tsx`

Goal: Card footer actions must fit on narrow cards. The screenshot shows `Touchpoint` clipped.

- [ ] **Step 1: Make footer actions responsive**

In `CardQuickActions`, replace button layout classes:

```tsx
className="flex items-center gap-1 pt-1.5 border-t border-border/60"
```

with:

```tsx
className="grid grid-cols-2 gap-1 pt-1.5 border-t border-border/60"
```

For each action button, replace `flex-1` with:

```tsx
className="min-w-0 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[11px] ..."
```

- [ ] **Step 2: Hide long footer text on very narrow cards**

Wrap button labels:

```tsx
<span className="truncate">Chat</span>
<span className="truncate">Touchpoint</span>
```

Expected: icons and text no longer overflow out of the card.

- [ ] **Step 3: Keep card data rows compact**

In custom field rows, keep:

```tsx
<span className="truncate text-foreground/90" title={display}>{display}</span>
```

- [ ] **Step 4: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/components/crm/OpportunityCard.tsx
git commit -m "fix(crm): prevent Kanban card action clipping"
```

---

## Task T8 [L] - Base de Contatos Spreadsheet Columns

**Files:**
- Create: `src/components/crm/ContactColumnsToolbar.tsx`
- Modify: `src/components/crm/DatabaseView.tsx`
- Modify: `src/hooks/useContactFields.ts`
- Modify: `src/components/crm/pipeline-settings/ContactFieldsEditor.tsx`

Goal: Users can create/delete contact columns directly in Base de Contatos, and resize columns like a spreadsheet. Agent/enrichment columns should not be forced into the grid if the user deletes/hides them.

- [ ] **Step 1: Extend contact fields hook with single-column helpers**

In `src/hooks/useContactFields.ts`, add helper mutations that reuse `upsertFields`:

```ts
const saveFields = async (next: CustomFieldSchema[]) => {
  if (!equipeId) throw new Error("No equipe_id");
  const { error } = await sb.from(TABLE).update({ contact_fields_schema: next }).eq("id", equipeId);
  if (error) throw error;
};

const createField = useMutation({
  mutationFn: async (field: CustomFieldSchema) => saveFields([...(query.data ?? []), field]),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey });
    toast.success("Coluna criada.");
  },
  onError: (e: Error) => toast.error("Erro ao criar coluna: " + e.message),
});

const deleteField = useMutation({
  mutationFn: async (fieldId: string) =>
    saveFields((query.data ?? []).map((f) => (f.field_id === fieldId ? { ...f, is_deleted: true } : f))),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey });
    toast.success("Coluna removida.");
  },
  onError: (e: Error) => toast.error("Erro ao remover coluna: " + e.message),
});
```

Return:

```ts
createField,
deleteField,
```

- [ ] **Step 2: Create toolbar**

Create `src/components/crm/ContactColumnsToolbar.tsx`:

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { newFieldId, slugify, TYPE_LABELS } from "@/components/crm/pipeline-settings/CustomFieldsEditor";
import type { CustomFieldSchema, CustomFieldType } from "@/types/pipelines";

interface ContactColumnsToolbarProps {
  onCreate: (field: CustomFieldSchema) => void;
  disabled?: boolean;
}

export function ContactColumnsToolbar({ onCreate, disabled }: ContactColumnsToolbarProps) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");

  const create = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onCreate({
      field_id: newFieldId(),
      key: slugify(trimmed) || `campo_${Date.now()}`,
      label: trimmed,
      type,
      required: false,
      position: Date.now(),
    });
    setLabel("");
    setType("text");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Nova coluna"
        className="h-8 w-44"
      />
      <Select value={type} onValueChange={(value) => setType(value as CustomFieldType)}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((item) => (
            <SelectItem key={item} value={item}>
              {TYPE_LABELS[item]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" onClick={create} disabled={disabled || !label.trim()}>
        <Plus className="mr-1 h-4 w-4" />
        Coluna
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Use schema-driven dynamic columns**

In `DatabaseView.tsx`, import:

```ts
import { useContactFields } from "@/hooks/useContactFields";
import { ContactColumnsToolbar } from "@/components/crm/ContactColumnsToolbar";
```

Inside `DatabaseView`:

```ts
const { fields: contactFields, createField, deleteField } = useContactFields();
const visibleContactFields = useMemo(
  () => contactFields.filter((field) => !field.is_deleted).sort((a, b) => a.position - b.position),
  [contactFields],
);
```

Replace enrichment column generation source with `visibleContactFields`, not `CONTACT_ENRICHMENT_SCHEMA` plus every discovered key.

- [ ] **Step 4: Make contact custom cells editable**

For each dynamic contact column:

```tsx
cell: ({ row }) => {
  const data = (row.original.personal_custom_data ?? {}) as Record<string, unknown>;
  const value = data[field.key] == null ? "" : String(data[field.key]);
  return (
    <EditableCell
      value={value}
      onSave={(next) =>
        handleUpdateField(row.original.id, "personal_custom_data", {
          ...data,
          [field.key]: next,
        })
      }
      placeholder="-"
    />
  );
}
```

- [ ] **Step 5: Add header delete action**

For dynamic column header:

```tsx
header: () => (
  <div className="flex items-center justify-between gap-2">
    <span className="truncate">{field.label}</span>
    <button
      type="button"
      className="text-muted-foreground hover:text-destructive"
      onClick={(event) => {
        event.stopPropagation();
        deleteField.mutate(field.field_id);
      }}
      aria-label={`Remover coluna ${field.label}`}
    >
      ×
    </button>
  </div>
)
```

- [ ] **Step 6: Enable TanStack column resizing**

In `useReactTable`, add:

```ts
columnResizeMode: "onChange",
enableColumnResizing: true,
```

In `<TableHead>`, add a resize handle:

```tsx
{header.column.getCanResize() && (
  <div
    onMouseDown={header.getResizeHandler()}
    onTouchStart={header.getResizeHandler()}
    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-transparent hover:bg-primary/40"
  />
)}
```

Ensure the header cell has:

```tsx
style={{ width: header.getSize() }}
className="relative"
```

- [ ] **Step 7: Add toolbar to Base de Contatos**

In the DatabaseView toolbar row, render:

```tsx
<ContactColumnsToolbar
  onCreate={(field) => createField.mutate(field)}
  disabled={createField.isPending}
/>
```

- [ ] **Step 8: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 9: Commit**

```powershell
git add src/components/crm/ContactColumnsToolbar.tsx src/components/crm/DatabaseView.tsx src/hooks/useContactFields.ts src/components/crm/pipeline-settings/ContactFieldsEditor.tsx
git commit -m "feat(crm): manage contact columns from the contacts grid"
```

---

## Task T9 [M] - Copilot Cockpit IA/Training/Setup Sections

**Files:**
- Modify: `src/pages/CopilotCockpit.tsx`
- Modify: `src/components/crm/copilot/CopilotConfigCard.tsx`
- Optionally create: `src/components/crm/copilot/CopilotTrainingPanel.tsx`

Goal: Top-level Copilot area must contain the high-level setup/training concepts: behavior, work mode, training blocks, agent setup, approvals, logs.

- [ ] **Step 1: Rename page**

In `CopilotCockpit.tsx`, replace `Copiloto Garage` with:

```tsx
Copilot
```

and supporting copy with:

```tsx
Central de operação, treinamento e auditoria dos agentes.
```

- [ ] **Step 2: Rename tabs**

Replace:

```tsx
<TabsTrigger value="garage">Garage</TabsTrigger>
<TabsTrigger value="control-room">Control Room</TabsTrigger>
```

with:

```tsx
<TabsTrigger value="setup">Setup</TabsTrigger>
<TabsTrigger value="training">Treinamento</TabsTrigger>
<TabsTrigger value="approvals">Aprovações</TabsTrigger>
<TabsTrigger value="logs">Logs</TabsTrigger>
```

- [ ] **Step 3: Move existing config cards to Setup**

Change `TabsContent value="garage"` to:

```tsx
<TabsContent value="setup" className="space-y-6">
```

- [ ] **Step 4: Add Training tab**

Create `CopilotTrainingPanel` with static links to the exact existing training sources:

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
          <p className="mt-1 text-xs text-muted-foreground">Prompt do agente e modo de autonomia.</p>
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

- [ ] **Step 5: Use logs tab for ControlRoom**

Change:

```tsx
<TabsContent value="control-room">
  <ControlRoom pipelines={activePipelines} />
</TabsContent>
```

to:

```tsx
<TabsContent value="logs">
  <ControlRoom pipelines={activePipelines} />
</TabsContent>
```

- [ ] **Step 6: Mount approvals tab**

Render a pipeline selector or all active pipeline approvals. Minimal version:

```tsx
<TabsContent value="approvals" className="space-y-4">
  {activePipelines.map((pipeline) => (
    <section key={pipeline.id} className="space-y-2">
      <h3 className="text-sm font-medium">{pipeline.name}</h3>
      <CopilotApprovalsPanel pipelineId={pipeline.id} />
    </section>
  ))}
</TabsContent>
```

- [ ] **Step 7: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 8: Commit**

```powershell
git add src/pages/CopilotCockpit.tsx src/components/crm/copilot/CopilotConfigCard.tsx src/components/crm/copilot/CopilotTrainingPanel.tsx
git commit -m "feat(copilot): add high-level cockpit sections"
```

---

## Task T10 [M] - End-to-End Browser Smoke and Handoff

**Files:**
- Modify: `Planning/sprint_6.5_solo-copilot_evolve_v1.md`
- Modify: `Planning/billing.md`

- [ ] **Step 1: Build**

Run:

```powershell
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 2: Targeted lint**

Run:

```powershell
.\node_modules\.bin\eslint.cmd src/pages/CRM.tsx src/pages/CopilotCockpit.tsx src/components/AIAgentToggle.tsx src/components/crm/PipelineWorkspace.tsx src/components/crm/OpportunityCard.tsx src/components/crm/DatabaseView.tsx src/components/crm/ContactColumnsToolbar.tsx src/components/crm/copilot/TelemetryHUD.tsx src/components/crm/copilot/ControlRoom.tsx src/components/crm/copilot/CopilotApprovalCard.tsx src/lib/copilotActivity.ts src/lib/copilotHumanize.ts
```

Expected: 0 errors. Existing Fast Refresh warnings are acceptable only if they predate this sprint.

- [ ] **Step 3: Manual browser smoke**

Use production or local dev with valid Supabase env:

1. Open CRM.
2. Confirm top nav includes `Copilot`.
3. Confirm pipeline subnav no longer includes `Central do Copiloto`.
4. Confirm toggle label says `Copilot`.
5. Open Kanban; card footer shows `Chat` and `Touchpoint` fully.
6. Click Sync on a card; compact HUD appears immediately.
7. Confirm HUD line items show readable field/result, not only `set_contact_field`.
8. Minimize HUD; run continues.
9. Open Copilot -> Logs; confirm columns include action, field, result/output.
10. Open Copilot -> Aprovações; approval cards show exact status/stage/field result.
11. Open Base de Contatos; create a column, edit a cell, resize the column, delete the column.

- [ ] **Step 4: Add billing row**

Append to `Planning/billing.md`:

```md
| 2026-06-19 | Sprint 6.5 | Copilot UX Recovery: cockpit, telemetry, logs, contact columns | Codex GPT-5 | XL | R$ 28 |
```

- [ ] **Step 5: Mark sprint handoff**

Append a final handoff section to this file:

```md
## FINAL HANDOFF - Sprint 6.5 Copilot UX Recovery

**Date:** 2026-06-19
**Branch:** `<branch>`
**Commits:** `<first>` -> `<last>`

**Verified:**
- `npm.cmd run build` -> passed.
- Targeted ESLint -> passed with 0 errors.
- Browser smoke -> passed / failed with notes.

**Production env:**
- Netlify `VITE_COPILOT_URL=https://agent.soloventures.com.br` -> confirmed / pending.
- Dokploy `COPILOT_WORKFLOW_ENABLED=true` -> confirmed / pending.
- Dokploy `CORS_ORIGINS=<frontend-domain>` -> confirmed / pending.
```

- [ ] **Step 6: Commit**

```powershell
git add Planning/sprint_6.5_solo-copilot_evolve_v1.md Planning/billing.md
git commit -m "docs(copilot): complete Sprint 6.5 handoff"
```

---

## Definition of Done

- [ ] `VITE_COPILOT_URL` is configured in Netlify and frontend was redeployed.
- [ ] Dokploy agent has `COPILOT_WORKFLOW_ENABLED=true` and correct CORS origin.
- [ ] CRM has a top-level `Copilot` tab.
- [ ] Pipeline subnav no longer buries Copilot under `Central do Copiloto`.
- [ ] Visible product label says `Copilot`, not `Agente de CRM`.
- [ ] Kanban card face no longer clips action buttons.
- [ ] Sync HUD appears immediately after click.
- [ ] Sync HUD is compact, elegant, minimizable, and readable.
- [ ] HUD lines explain action + field/result, not only technical verbs.
- [ ] Control Room logs include action verb, field, result/output, source, status, and optional payload details.
- [ ] Approval cards use precise language for status/stage/field changes.
- [ ] Base de Contatos lets users create, edit, resize, and delete contact columns directly from the grid.
- [ ] `npm.cmd run build` passes.
- [ ] Targeted ESLint on changed frontend files has 0 errors.

---

## Execution Recommendation

Use **Subagent-Driven** execution:

1. Dispatch Wave 1 tasks in parallel: T1, T2, T3.
2. PM reviews and merges Wave 1.
3. Dispatch Wave 2 tasks: T4, T5, T6.
4. Dispatch Wave 3 task T7 and T8 separately; T8 is larger and should own the contacts grid files alone.
5. Finish with T9/T10 and one browser smoke pass.
