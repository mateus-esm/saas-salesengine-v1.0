# Sprint 5.1 — CRM Calibration Lap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purify the CRM cockpit: split Identity from Process in the contact ledger, kill navigation friction, surface live commercial telemetry inside pipelines, and rebuild the opportunity drawer into a flow-state cockpit.

**Architecture:** Pure frontend refactor with one targeted DB migration (`pipeline_stages_v2.max_idle_hours` for SLA red-pulse). State management stays on TanStack Query + Supabase Realtime. The Identity Router becomes one atomic client transaction (create lead → create opportunity), wrapped in a single `useMutation` that already invalidates both caches. The opportunity drawer becomes a 60/40 split-pane with paddle-shifter navigation driven by a `useSiblingNavigation` hook reading the same ordered Kanban column the parent already computes.

**Tech Stack:** React 18 · TypeScript · TanStack Table & Query · dnd-kit · Supabase (Postgres + Realtime) · shadcn/ui · Tailwind · date-fns · lucide-react

---

## Engineer Roster & Routing Policy

| Engineer | Tier | Strengths | Routing |
|---|---|---|---|
| **Claude** | Senior | Architecture, hooks, atomic transactions, navigation primitives, multi-pane layouts | Owns Identity Router (atomic create), bi-partilhado modal shell, paddle-shifter navigation hook |
| **Codex** | Pleno | Feature integration, data plumbing, query layer | Owns SLA migration + telemetry hook, OpportunityTable raio-X polish, CardFieldsPicker extension |
| **Gemini** | Pleno | UI assembly, TanStack Table, visual polish | Owns DatabaseView purification, Kanban card telemetry pillars, enrichment summary column |
| **Verboo** | Junior (low cost) | Mechanical edits, copy changes, simple removals | Owns column deletions, AddContactModal hygiene audit, @lid mask audit across surfaces, doc updates |

**Conflict policy:** Engineers MUST NOT touch files outside their assigned tasks. Where two tasks edit the same file, the dependency arrow (`→`) below dictates merge order. The senior (Claude) resolves any concrete conflict.

---

## Wave Plan (parallelization map)

```
Wave 1 (parallel — no shared files)
 ├─ T1  Verboo  · DatabaseView column purge ⚠️ PARTIAL — needs T1.1
 ├─ T1.1 Verboo · Remove residual process columns (Tipo/Pipelines/Valor Total)
 ├─ T2  Verboo  · @lid mask audit (Kanban, OpportunityDetail, Chat)
 ├─ T3  Verboo  · AddContactModal final hygiene audit
 ├─ T4  Codex   · DB migration · pipeline_stages_v2.max_idle_hours
 └─ T5  Gemini  · Enrichment summary column (DatabaseView) — depends on T1.1

Wave 2 (depends on T4)
 ├─ T6  Codex   · useStageTelemetry hook (time-in-phase + touchpoints + next contact)
 └─ T7  Claude  · Identity Router — useCreateContactAtomic mutation

Wave 3 (depends on T6, T1, T5)
 ├─ T8  Gemini  · OpportunityCard telemetry pillars + dynamic field surface
 ├─ T9  Gemini  · OpportunityKanbanColumn SLA red-pulse styling
 ├─ T10 Codex   · CardFieldsPicker — add native field toggles (T8 cards must read them)
 └─ T11 Claude  · AddContactModal switch-toggle integration with T7 mutation

Wave 4 (depends on T8)
 ├─ T12 Codex   · OpportunityTable — telemetry columns + custom field parity confirmation
 └─ T13 Claude  · OpportunityDetailModal — bi-partilhado 60/40 shell

Wave 5 (depends on T13)
 └─ T14 Claude  · useSiblingNavigation hook + paddle-shifter buttons

Wave 6 (depends on everything)
 └─ T15 Verboo  · Manual acceptance pass against Definition of Done checklist
```

---

## File Structure

**Create:**
- `supabase/migrations/20260525000000_sprint5_1_stage_sla.sql`
- `src/hooks/useStageTelemetry.ts`
- `src/hooks/useCreateContactAtomic.ts`
- `src/hooks/useSiblingNavigation.ts`
- `src/components/crm/CardTelemetryPillars.tsx`
- `src/components/crm/PaddleShifterNav.tsx`

**Modify:**
- `src/components/crm/DatabaseView.tsx` (T1, T5)
- `src/components/crm/AddContactModal.tsx` (T3, T11)
- `src/components/crm/OpportunityCard.tsx` (T2, T8)
- `src/components/crm/OpportunityKanbanColumn.tsx` (T9)
- `src/components/crm/OpportunityKanban.tsx` (T14)
- `src/components/crm/OpportunityTable.tsx` (T12, T14)
- `src/components/crm/OpportunityDetailModal.tsx` (T2, T13, T14)
- `src/components/crm/pipeline-settings/CardFieldsPicker.tsx` (T10)
- `src/types/pipelines.ts` (T4 — add `max_idle_hours` to `PipelineStageV2`)
- `src/types/crm.ts` (T11 — extend `CreateLeadData` for the router payload, if needed)

---

# WAVE 1

---

### Task T1 · DatabaseView column purge — **Verboo** — ⚠️ PARTIAL (see T1.1)

**Spec ref:** EPIC 1 §1.1 — "Base de Contatos exibe exclusivamente parâmetros estáveis de perfil."

**Status:** Verboo's commit `bf8dcc2` on branch `feat/base-contatos-cleanup` did **the legacy purge** correctly:
- Removed `stage_id`, `responsible_id`, `opportunity_value` (editable), `meeting_scheduled`, `meeting_done`, `no_show`, `creation_source` columns ✅
- Removed stage and responsible filters ✅
- Added `Empresa` (company_link) and `Imóveis` (property_count) columns from the new `useLeadEntitySummary` hook ✅
- Migrated `source` → `origin_category` (MECE taxonomy) ✅

**But also added three columns that the spec forbids** — caught during review:
- `contact_type` (Tipo) — lifecycle process flag, not identity
- `opportunity_count` (Pipelines) — process count
- `opportunity_total_value` (Valor Total) — explicitly forbidden by spec ("valores comerciais")

**Decision:** branch NOT merged. Fix-up task T1.1 below.

---

### Task T1.1 · Remove residual process columns — **Verboo (redo)**

**Spec ref:** EPIC 1 §1.1.

**Files:**
- Modify: `src/components/crm/DatabaseView.tsx`

**Branch:** continue on `feat/base-contatos-cleanup` (do **not** revert `bf8dcc2`; build on top).

- [ ] **Step 1: Delete the three forbidden column defs**

In `src/components/crm/DatabaseView.tsx`, inside the `columns` `useMemo`, **remove these three column objects entirely**:

1. The `accessorKey: "contact_type"` block (header "Tipo")
2. The `id: "opportunity_count"` block (header "Pipelines")
3. The `id: "opportunity_total_value"` block (header "Valor Total")

The neighbouring `company_link`, `property_count`, `origin_category`, `channel`, etc. columns stay.

- [ ] **Step 2: Remove orphaned `typeOptions` + `typeFilter` state**

`typeOptions` and `typeFilter`/`setTypeFilter` only exist to power the Tipo column and its filter dropdown. Both go.

1. Delete the `typeOptions: { id: ContactType; label: string }[] = [...]` declaration.
2. Delete the `useState<string>("all")` for `typeFilter`.
3. Inside `filteredLeads` (the `useMemo`), delete the `if (typeFilter && typeFilter !== "all") { ... }` filter branch.
4. In the JSX, delete the entire "Type Filter" `<Select value={typeFilter} ...>` block in the filter row.
5. In the `columns` `useMemo` deps array, drop `typeOptions`.
6. Drop the unused `import { ContactType } from "@/types/crm"` if it no longer has consumers.

- [ ] **Step 3: Trim `labelMap` in the Columns visibility dropdown**

Remove these three keys from `labelMap`:
```ts
contact_type: "Tipo",
opportunity_count: "Pipelines",
opportunity_total_value: "Valor Total",
```

- [ ] **Step 4: Keep `useLeadEntitySummary` calls**

The hook is still used by `company_link` (companyName / companyCount) and `property_count`. Do **not** remove it. Confirm the `filteredLeadIds` memo and `entitySummary` destructure remain.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: SUCCESS, no TS errors, no unused-import warnings.

- [ ] **Step 6: Visual smoke**

Run `npm run dev`, open Base de Contatos. Verify the column count drops by three (Tipo / Pipelines / Valor Total gone) and the Type filter chip in the toolbar disappears. Other columns (Empresa, Imóveis, Origem, Canal, etc.) stay intact.

- [ ] **Step 7: Commit**

```bash
git add src/components/crm/DatabaseView.tsx
git commit -m "fix(crm): drop residual process columns (Tipo / Pipelines / Valor Total) per Sprint 5.1 §1.1"
```

- [ ] **Step 8: Hand off**

Once committed, ping the senior for re-review before merging `feat/base-contatos-cleanup`. T5 (Gemini, enrichment summary column) merges **after** this fix lands so both Base de Contatos changes ship together.

---

## Post-Wave-1 Review Log

**2026-05-28 — review across `feat/codex-stage-sla` branch (which carries Verboo + Codex commits stacked over `feat/base-contatos-cleanup`).**

### ✅ Verboo · commit `b01aa55` "identity-only Base de Contatos + @lid mask" — T1.1 + T2 + T3 + early T5

Clean execution. Removed the three forbidden columns, deleted the `typeFilter` plumbing, masked `@lid` on `OpportunityCard`/`OpportunityTable` (cell + accessorFn + search haystack)/`OpportunityDetailModal`, also masked the `AssignToPipelineDialog` label, and shipped the enrichment-summary column ahead of schedule (originally Gemini's T5). **Merge candidate.**

### ⚠️ Codex · commit `3b46289` "add pipeline_stages_v2.max_idle_hours" — T4

Migration SQL is exactly to spec (idempotent, constraint-checked, commented). The TS type was extended too — but the consumer **`src/hooks/usePipelineStagesV2.ts` was not updated**. Because `max_idle_hours` was added as a **required** field on `PipelineStageV2`, every `normalize()` call now returns an object missing the property and `tsc -p tsconfig.app.json` fails:

```
src/hooks/usePipelineStagesV2.ts(30,56): error TS2741: Property 'max_idle_hours' is missing in type ... but required in type 'PipelineStageV2'.
```

**Redo:** see T4.1 below.

### ❌ Verboo · commit `44f55b7` "pipeline routing toggle + type cleanup" — labelled T4-T5, actually T11

Five problems caught by `tsc -p tsconfig.app.json` plus a design defect not visible to the compiler.

1. **Field name typo — `s.order` does not exist.** `AddContactModal.tsx:381` sorts stages by `a.order - b.order`. The interface has `position`, not `order`. Two TS2339 errors at columns 45 and 55. At runtime the sort silently no-ops (NaN comparisons), so stages appear in insertion order — usually correct by luck because the hook already orders by `position` server-side.
2. **Fake atomicity.** The hand-off between `AddContactModal` and `DatabaseView` is wired via three underscore-prefixed sentinel fields (`_routeToPipeline`, `_pipelineId`, `_stageId`) added to the contact payload through an `as` cast. Inside the parent's `onSuccess`, `createOpportunity.mutate(...)` and `updateLead.mutate({ contact_type: "opportunity" })` are **fire-and-forget** — not awaited, no error handling, no compensating delete. The success toast in the modal resolves immediately regardless of whether the opportunity ever lands. A failure leaves an orphan contact in Base de Contatos.
3. **Dead imports in the modal.** `useOpportunities` and `useLeads` are destructured (`createOpportunity`, `leads`, `updateLead`) and never used — the work was punted to the parent.
4. **Type strip cascade broke `ImportModal`.** Removing `stage_id` / `opportunity_value` / `responsible_id` from `CreateLeadData` is correct, but `ImportModal.tsx` still writes them on lines 166/175/179. Three TS2339 errors.
5. **Orphaned destructure in `DatabaseView`.** Earlier Verboo commit removed `usePipelineStages` and `useTeamMembers` imports but the lines `const { stages } = usePipelineStages(); const { teamMembers: members } = useTeamMembers();` were left behind (`DatabaseView.tsx:194-195`).
6. **`lead_type` still passed in `createLead.mutate(...)`** at `DatabaseView.tsx:740` and `:767` — but T5 removed it from `CreateLeadData`. Two TS2353 errors.
7. **`OriginOption[]` vs `{id,label,color?}[]` shape mismatch** at `DatabaseView.tsx:442` — pre-existing latent issue surfaced by the same surface.

**Redo:** see T11.1 below. The atomic write must move into the dedicated hook the plan specified (`useCreateContactAtomic`) — not a sentinel-field hack.

### ⚠️ AGY (Lovable / `gpt-engineer-app[bot]`) · `dcd935a` + `98fda32` + `db8296f` on `origin/main`

Three commits totalling: 3-line addition to `bun.lock` + full rewrite of `src/integrations/supabase/types.ts` (143976 → 62011 bytes).

The size shrink looked alarming but turned out to be **a legitimate fix**: the previous file was UTF-16 LE with BOM (Windows PowerShell artifact); AGY's regeneration is proper UTF-8. **Same schema content, half the bytes — that's correct.**

However, **AGY's regeneration does NOT contain `max_idle_hours`** under `pipeline_stages_v2`. The regen was run against a database where Codex's migration `20260525000000_sprint5_1_stage_sla.sql` had not been applied. After merging `feat/codex-stage-sla` over `origin/main`, the generated types and the hand-written TS interface will drift.

**Redo:** see T4.1 below (same task that fixes Codex's hook also forces a types regen against the migrated schema).

---

### Task T4.1 · Sync stage-SLA across consumers + regenerated types — **Codex (redo)**

**Depends on:** T4 already shipped; AGY's `gen types` regen on origin/main.

**Files:**
- Modify: `src/hooks/usePipelineStagesV2.ts`
- Modify: `src/integrations/supabase/types.ts` (after `supabase gen types` reruns)

- [ ] **Step 1: Add `max_idle_hours` to the normalize function**

In `src/hooks/usePipelineStagesV2.ts`, around line 18 add `max_idle_hours: number | null` to `StageRow`, and around line 30 set it in `normalize`:

```ts
interface StageRow {
  // ...existing fields...
  max_idle_hours: number | null;
}

const normalize = (row: StageRow): PipelineStageV2 => ({
  // ...existing fields...
  max_idle_hours: row.max_idle_hours ?? null,
});
```

- [ ] **Step 2: Apply Codex's migration to the dev DB**

Confirm `20260525000000_sprint5_1_stage_sla.sql` ran against the same Supabase project AGY regenerates from. If unsure: `npx supabase db push` (local) or `npx supabase migration up` (remote, with the right --linked target).

- [ ] **Step 3: Regenerate Supabase types in UTF-8**

```bash
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

On PowerShell, redirect via `Out-File -Encoding utf8` or pipe through `iconv`; otherwise the BOM/encoding regression returns. Verify with `file src/integrations/supabase/types.ts` — must report UTF-8.

- [ ] **Step 4: Verify `max_idle_hours` is in the generated types**

```bash
grep "max_idle_hours" src/integrations/supabase/types.ts
```
Expected: three matches (Row / Insert / Update).

- [ ] **Step 5: Typecheck must pass for both the hook and the types**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: the two errors at `usePipelineStagesV2.ts:30` are gone. Other pre-existing errors stay scoped to other tasks.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePipelineStagesV2.ts src/integrations/supabase/types.ts
git commit -m "fix(crm): wire max_idle_hours through normalize + regen generated types (Sprint 5.1 T4 follow-up)"
```

---

### Task T11.1 · Replace pipeline-routing hack with the planned `useCreateContactAtomic` — **Claude (redo)**

**Why senior:** T11 was originally assigned to Claude. Verboo took it, shipped a fire-and-forget hack with type errors. Reassigning to senior.

**Files:**
- Create (or finish): `src/hooks/useCreateContactAtomic.ts` (the version specified in T7)
- Modify: `src/components/crm/AddContactModal.tsx`
- Modify: `src/components/crm/DatabaseView.tsx`
- Modify: `src/components/crm/ImportModal.tsx`

- [ ] **Step 1: Land T7's hook exactly as specified**

Create `src/hooks/useCreateContactAtomic.ts` per T7's full body (Identity Router with compensating rollback). Do not skip the `await sb.from("leads").update({ deleted_at: ... })` rollback branches — that's the difference between a router and a leaky abstraction.

- [ ] **Step 2: Strip the sentinel-field hack from `AddContactModal`**

Open `src/components/crm/AddContactModal.tsx` and:
1. Remove `useOpportunities`, `useLeads` imports (they were dead).
2. Replace the `interface AddContactModalProps` `onAdd` callback with `onCreated?: (result: { leadId: string; opportunityId: string | null }) => void`.
3. Replace the entire `handleSubmit` body with the version specified in T11 Step 3 (calls `createAtomic.mutate(...)` with a typed `routing` object — no underscore sentinel fields).
4. Fix the stage sort: `a.position - b.position` (not `a.order - b.order`).
5. Verify `Switch`, `usePipelines`, `usePipelineStagesV2` imports stay.

- [ ] **Step 3: Adapt `DatabaseView` caller**

In `src/components/crm/DatabaseView.tsx`:
1. Delete the orphaned `const { stages } = usePipelineStages();` and `const { teamMembers: members } = useTeamMembers();` lines (≈ 194-195) AND remove the missing imports if they were never re-added.
2. Delete the entire `onAdd={(data) => { ... }}` callback (the routing-if-else and the bare-create branch). Replace the modal usage with:
   ```tsx
   <AddContactModal
     open={showAddModal}
     onClose={() => setShowAddModal(false)}
     onCreated={() => setShowAddModal(false)}
   />
   ```
3. Drop `createLead` from the `useLeads` destructure if no longer used here.
4. Drop the now-unused `useOpportunities` destructure.

- [ ] **Step 4: Fix `ImportModal` against the new `CreateLeadData`**

In `src/components/crm/ImportModal.tsx`:
1. Remove the `stages` / `members` props (the older Verboo commit already untied them from the parent, but the prop names remain in the file).
2. Remove the lines that write `opportunity_value`, `stage_id`, `responsible_id` to `CreateLeadData` (lines 166, 175, 179) — those fields no longer exist on the type. CSV importers create identity-only contacts; users route them to pipelines after via the bulk Assign flow.

- [ ] **Step 5: Fix the `OriginOption` typing**

At `DatabaseView.tsx:442`, the `options={ORIGIN_CATEGORY_OPTIONS}` prop on `EditableSelect` expects `{ id: string; label: string; color?: string }[]` but `ORIGIN_CATEGORY_OPTIONS` is `OriginOption[]` (likely `{ value, label }`). Either map shape at the call site:

```tsx
options={ORIGIN_CATEGORY_OPTIONS.map(o => ({ id: o.value, label: o.label }))}
```

…or — preferred — widen `EditableSelectProps.options` to accept the existing shape. Pick whichever change touches fewer call sites.

- [ ] **Step 6: Remove `lead_type` from any remaining `createLead.mutate(...)` calls**

In `DatabaseView.tsx` lines 740 / 767 (the two `createLead.mutate({ ... lead_type: "lead" ... })` blocks) — drop the `lead_type` key. The hook hardcodes it server-side already.

- [ ] **Step 7: Typecheck — every error from T11/T4 must be gone**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: zero errors in `AddContactModal.tsx`, `DatabaseView.tsx`, `ImportModal.tsx`, `usePipelineStagesV2.ts`. (Pre-existing errors in `IntentionWizard.tsx`, `TenantContext.tsx`, `Admin.tsx` are out of scope.)

- [ ] **Step 8: Manual smoke**

Run `npm run dev`. From Base de Contatos:
1. Open "Adicionar Contato", fill in name + phone, leave the switch OFF, click "Adicionar Contato". Toast: "Contato criado!". The contact appears in the ledger.
2. Open the modal again, fill identity fields, flip "Encaminhar para Funil de Vendas" ON, choose a pipeline and stage, click "Criar e Encaminhar". Toast: "Contato criado e adicionado à pipeline!". Switch to the pipeline's Kanban — a card is at the chosen stage.
3. Negative path: choose a pipeline that has zero stages (use SQL to soft-delete all stages of a test pipeline first). The mutation should reject, the lead should not appear in Base de Contatos (compensating rollback).

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useCreateContactAtomic.ts src/components/crm/AddContactModal.tsx src/components/crm/DatabaseView.tsx src/components/crm/ImportModal.tsx
git commit -m "fix(crm): replace pipeline-routing sentinel hack with useCreateContactAtomic (Sprint 5.1 T11 redo)"
```

---

### Task T2 · @lid mask audit — **Verboo**

**Spec ref:** EPIC 1 §1.4 — "Mascaramento inteligente do @lid".

**The problem:** `isTechnicalId` + `formatDisplayName` exist in `src/lib/displayName.ts` and are already used in `DatabaseView`. They must be applied **everywhere** a lead's name renders.

**Files:**
- Modify: `src/components/crm/OpportunityCard.tsx`
- Modify: `src/components/crm/OpportunityDetailModal.tsx`
- Modify: `src/components/crm/OpportunityTable.tsx`

- [ ] **Step 1: Patch OpportunityCard**

In `src/components/crm/OpportunityCard.tsx`, replace:

```tsx
<span className="truncate">{lead?.name ?? "Lead sem nome"}</span>
```

with:

```tsx
<span className="truncate">{formatDisplayName(lead?.name, lead?.phone, "[Novo Contato - WhatsApp]")}</span>
```

Add at top:
```tsx
import { formatDisplayName } from "@/lib/displayName";
```

- [ ] **Step 2: Patch OpportunityDetailModal**

In `src/components/crm/OpportunityDetailModal.tsx`, replace:
```tsx
<DialogTitle ...>{lead?.name ?? "Lead"}</DialogTitle>
```
with:
```tsx
<DialogTitle ...>{formatDisplayName(lead?.name, lead?.phone, "[Novo Contato - WhatsApp]")}</DialogTitle>
```
Add the same import.

- [ ] **Step 3: Patch OpportunityTable**

In `src/components/crm/OpportunityTable.tsx`, in the `lead` column `cell`:
```tsx
cell: ({ row }) => (
  <span className="font-medium">
    {formatDisplayName(row.original.lead?.name, row.original.lead?.phone, "[Novo Contato - WhatsApp]")}
  </span>
),
```
Also update the `accessorFn: (r) => r.lead?.name ?? ""` to feed the same masked value so search/sort matches what the user sees:
```tsx
accessorFn: (r) => formatDisplayName(r.lead?.name, r.lead?.phone, ""),
```
Add the import.

- [ ] **Step 4: Grep for any remaining `lead?.name ??` or `lead.name ||` patterns in CRM components**

Run: `grep -rn "lead?\.name \?\?\|lead\.name ||" src/components/crm/`
For every hit, decide if it renders to the user; if yes, swap to `formatDisplayName`. Conversation list (`src/components/inbox`) and Chat (`src/pages/Chat.tsx`) are **out of scope** for this sprint.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 6: Commit**

```bash
git add src/components/crm/
git commit -m "feat(crm): mask Meta @lid technical IDs across opportunity surfaces (Sprint 5.1 §1.4)"
```

---

### Task T3 · AddContactModal hygiene audit — **Verboo**

**Spec ref:** EPIC 2 §2.1 — "Formulários Higienizados".

**The problem:** Verify the drawer has zero funnel/financial fields. The Sprint 4 rewrite already dropped them, but the spec calls for an explicit verification pass.

**Files:**
- Modify: `src/components/crm/AddContactModal.tsx` (read-only audit; only edit if violations found)
- Modify: `src/components/crm/ContactDetailsModal.tsx` (same audit, edit only if violations)

- [ ] **Step 1: Audit AddContactModal**

Open `src/components/crm/AddContactModal.tsx`. Confirm there is no input/select for: `stage_id`, `opportunity_value`, `pipeline_id`, `meeting_scheduled`, `next_contact`, `responsible_id`. If any are present, delete them and their handlers.

- [ ] **Step 2: Audit ContactDetailsModal**

Open `src/components/crm/ContactDetailsModal.tsx` and read it fully. Per Sprint 4 EPIC 3 §3.4 the drawer is already identity-only; flag any process-coloured input you find (stage picker, value picker outside the embedded `LeadOpportunitiesSection`).

- [ ] **Step 3: Report**

If you found and removed violations, run `npm run build` and commit:
```bash
git add src/components/crm/AddContactModal.tsx src/components/crm/ContactDetailsModal.tsx
git commit -m "chore(crm): re-confirm identity-only contact forms (Sprint 5.1 §2.1)"
```
If you found nothing, leave a one-line note in your PR description: "T3: clean — no process fields present" and commit nothing.

---

### Task T4 · DB migration · stage SLA — **Codex**

**Spec ref:** EPIC 3 §3.1 — "Se ultrapassar o tempo limite estabelecido pelo gestor para aquela fase, o contador deve acender em Precision Red pulsante".

**Files:**
- Create: `supabase/migrations/20260525000000_sprint5_1_stage_sla.sql`
- Modify: `src/types/pipelines.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260525000000_sprint5_1_stage_sla.sql`:

```sql
-- Sprint 5.1 EPIC 3 §3.1 — per-stage SLA threshold.
-- NULL = no limit (default). Positive integer = max hours an opportunity may
-- sit in this stage before the UI flips into Precision Red pulsing mode.
-- Hours (not days) to keep parity with stage_entered_at granularity.
ALTER TABLE public.pipeline_stages_v2
  ADD COLUMN IF NOT EXISTS max_idle_hours integer
    CHECK (max_idle_hours IS NULL OR max_idle_hours > 0);

COMMENT ON COLUMN public.pipeline_stages_v2.max_idle_hours IS
  'Sprint 5.1 — SLA threshold in hours. NULL disables the red-pulse signal.';
```

- [ ] **Step 2: Extend the TS type**

In `src/types/pipelines.ts`, add to `PipelineStageV2` interface:

```ts
export interface PipelineStageV2 {
  // ...existing fields...
  /** Sprint 5.1 §3.1 — null = no SLA; positive integer = hours before red-pulse. */
  max_idle_hours: number | null;
}
```

And to `CreateStageV2Data` / `UpdateStageV2Data`:
```ts
max_idle_hours?: number | null;
```

- [ ] **Step 3: Apply the migration locally**

Run: `npx supabase db push` (or your team's preferred local apply command).
Expected: migration applied, no errors.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260525000000_sprint5_1_stage_sla.sql src/types/pipelines.ts
git commit -m "feat(db): add pipeline_stages_v2.max_idle_hours for SLA red-pulse (Sprint 5.1 §3.1)"
```

---

### Task T5 · Enrichment summary column — **Gemini**

**Spec ref:** EPIC 1 §1.3 — "Resumo do Enriquecimento de IA".

**The problem:** `leads.personal_custom_data` (JSONB) is populated by the AI agent (Sprint 4 §3.4 — `CONTACT_ENRICHMENT_SCHEMA`: job_title, linkedin, instagram, etc.). The ledger must show a one-glance summary chip instead of forcing a drawer open.

**Files:**
- Modify: `src/components/crm/DatabaseView.tsx`

- [ ] **Step 1: Build the helper**

Inside `DatabaseView.tsx`, before the `columns` `useMemo`, add:

```tsx
const summarizeEnrichment = (data: Record<string, unknown> | null | undefined): string | null => {
  if (!data) return null;
  const fragments: string[] = [];
  if (typeof data["job_title"] === "string" && data["job_title"]) fragments.push(String(data["job_title"]));
  if (typeof data["linkedin_url"] === "string" && data["linkedin_url"]) fragments.push("LinkedIn");
  if (typeof data["instagram_url"] === "string" && data["instagram_url"]) fragments.push("Instagram");
  if (typeof data["birthday"] === "string" && data["birthday"]) fragments.push("Aniv.");
  if (fragments.length === 0) return null;
  return fragments.slice(0, 3).join(" · ");
};
```

- [ ] **Step 2: Add the column def**

Right after the existing `channel` column (≈ line 517), insert:

```tsx
{
  id: "enrichment_summary",
  header: "Enriquecimento IA",
  cell: ({ row }) => {
    const summary = summarizeEnrichment(row.original.personal_custom_data);
    if (!summary) return <span className="text-muted-foreground">-</span>;
    return (
      <Badge variant="outline" className="text-[11px] gap-1 max-w-[200px] truncate" title={summary}>
        <Sparkles className="h-3 w-3 shrink-0" />
        <span className="truncate">{summary}</span>
      </Badge>
    );
  },
  enableSorting: false,
},
```

- [ ] **Step 3: Import the icon**

Add `Sparkles` to the existing `lucide-react` import line.

- [ ] **Step 4: Update labelMap**

In the column visibility dropdown's `labelMap`, add:
```ts
enrichment_summary: "Enriquecimento IA",
```

- [ ] **Step 5: Verify build + run app**

Run: `npm run build` then `npm run dev`.
Expected: SUCCESS; the Base de Contatos shows the new column. If you have no leads with `personal_custom_data` populated, manually set one row's value via Supabase SQL Editor:
```sql
UPDATE leads SET personal_custom_data = '{"job_title":"CTO","linkedin_url":"https://..."}'
WHERE id = '<a known lead id>';
```

- [ ] **Step 6: Commit**

```bash
git add src/components/crm/DatabaseView.tsx
git commit -m "feat(crm): surface AI enrichment summary in Base de Contatos (Sprint 5.1 §1.3)"
```

---

# WAVE 2

---

### Task T6 · `useStageTelemetry` hook — **Codex**

**Depends on:** T4 (`max_idle_hours` field must exist).

**Spec ref:** EPIC 3 §3.1 — Time in Phase, Touchpoints counter, Next Contact, Mirrored Identity.

**Files:**
- Create: `src/hooks/useStageTelemetry.ts`

- [x] **Step 1: Design the contract**

The hook accepts an opportunity + its stage and returns the four pillars **pre-computed**. Touchpoint counts come from `touchpoints.lead_id` (already indexed). Next-contact uses `leads.next_contact`. Time-in-phase derives from `opportunity.stage_entered_at` and `stage.max_idle_hours`.

For performance, batch-fetch touchpoint counts once for an array of `lead_id`s — not per-card.

- [x] **Step 2: Write the hook**

Create `src/hooks/useStageTelemetry.ts`:

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface StageTelemetry {
  /** Hours since the opportunity entered its current stage. */
  hoursInPhase: number;
  /** true when hoursInPhase >= stage.max_idle_hours and the stage has a threshold set. */
  slaBreached: boolean;
  /** Human-readable label, e.g. "3d 4h" or "2h" or "45min". */
  hoursInPhaseLabel: string;
  /** Total touchpoints associated to the lead. */
  touchpointCount: number;
  /** "Hoje 14:00" | "Amanhã" | "Atrasado" | null. */
  nextContactLabel: string | null;
  /** true when next_contact is in the past. */
  nextContactOverdue: boolean;
}

const formatDuration = (hours: number): string => {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}min`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours - days * 24);
  return rem ? `${days}d ${rem}h` : `${days}d`;
};

const formatNextContact = (iso: string | null): { label: string | null; overdue: boolean } => {
  if (!iso) return { label: null, overdue: false };
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return { label: null, overdue: false };
  const now = new Date();
  const ms = target.getTime() - now.getTime();
  if (ms < 0) return { label: "Atrasado", overdue: true };
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();
  if (sameDay) {
    const hh = String(target.getHours()).padStart(2, "0");
    const mm = String(target.getMinutes()).padStart(2, "0");
    return { label: `Hoje ${hh}:${mm}`, overdue: false };
  }
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();
  if (isTomorrow) return { label: "Amanhã", overdue: false };
  return { label: target.toLocaleDateString("pt-BR"), overdue: false };
};

/**
 * Sprint 5.1 §3.1 — batched touchpoint counts for an array of lead ids.
 * Returns a map { [lead_id]: count }. Empty array short-circuits without
 * hitting the network.
 */
export const useTouchpointCounts = (leadIds: string[]): Record<string, number> => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const sortedKey = useMemo(() => [...leadIds].sort().join(","), [leadIds]);

  const { data } = useQuery({
    queryKey: ["touchpoint-counts", equipeId, sortedKey],
    enabled: !!equipeId && leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("touchpoints")
        .select("lead_id")
        .in("lead_id", leadIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { lead_id: string }[]) {
        counts[row.lead_id] = (counts[row.lead_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  return data ?? {};
};

interface TelemetryInputs {
  stageEnteredAt: string;
  maxIdleHours: number | null;
  touchpointCount: number;
  nextContact: string | null;
}

/**
 * Pure computation — kept separate from the data hook so cards that already
 * have the inputs (Kanban list maps once over leads) don't pay extra renders.
 */
export const computeStageTelemetry = (input: TelemetryInputs): StageTelemetry => {
  const enteredMs = new Date(input.stageEnteredAt).getTime();
  const hoursInPhase = Math.max(0, (Date.now() - enteredMs) / 36e5);
  const slaBreached =
    typeof input.maxIdleHours === "number" && input.maxIdleHours > 0 && hoursInPhase >= input.maxIdleHours;
  const { label: nextContactLabel, overdue: nextContactOverdue } = formatNextContact(input.nextContact);
  return {
    hoursInPhase,
    slaBreached,
    hoursInPhaseLabel: formatDuration(hoursInPhase),
    touchpointCount: input.touchpointCount,
    nextContactLabel,
    nextContactOverdue,
  };
};
```

- [x] **Step 3: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [x] **Step 4: Commit**

```bash
git add src/hooks/useStageTelemetry.ts
git commit -m "feat(crm): add useStageTelemetry + useTouchpointCounts batching hook (Sprint 5.1 §3.1)"
```

---

### Task T7 · Identity Router atomic mutation — **Claude**

**Spec ref:** EPIC 2 §2.2 — "transação atômica em segundo plano: cria o Contato permanente e injeta instantaneamente o card de Oportunidade no funil correto".

**Files:**
- Create: `src/hooks/useCreateContactAtomic.ts`

**Note:** Postgres-side atomicity would require a SECURITY DEFINER RPC. To keep migration scope minimal, the mutation is client-side compensating: if `createOpportunity` fails, we soft-delete the just-created lead. Real RPC can land in Sprint 5.2 without touching callers since they consume the hook interface.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useCreateContactAtomic.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { CreateLeadData } from "@/types/crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface CreateContactAtomicInput {
  contact: CreateLeadData;
  /** When provided, an opportunity is created in this pipeline's first stage
   *  (or `stageId` when set) right after the lead. */
  routing?: {
    pipelineId: string;
    stageId?: string | null;
  };
}

export interface CreateContactAtomicResult {
  leadId: string;
  opportunityId: string | null;
}

/**
 * Sprint 5.1 §2.2 — Identity Router. Creates a lead and (optionally) an
 * opportunity in a single user-facing operation. Compensating rollback: if
 * the opportunity insert fails, the lead is soft-deleted so the operator
 * doesn't end up with an orphan ghost row in Base de Contatos.
 */
export const useCreateContactAtomic = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  return useMutation({
    mutationFn: async (input: CreateContactAtomicInput): Promise<CreateContactAtomicResult> => {
      if (!equipeId) throw new Error("No equipe_id");

      // ── Step 1: create the lead
      const { data: lead, error: leadErr } = await sb
        .from("leads")
        .insert({
          equipe_id: equipeId,
          name: input.contact.name,
          email: input.contact.email ?? null,
          phone: input.contact.phone ?? null,
          observations: input.contact.observations ?? null,
          tags: input.contact.tags ?? [],
          source: input.contact.source ?? "Manual",
          origem: input.contact.source ?? "Manual",
          origin: input.contact.origin ?? "manual",
          creation_source: "manual",
          lead_type: "lead",
          contact_type: input.routing ? "opportunity" : "lead",
          atendido_por_agente: false,
          custom_fields: {},
        })
        .select()
        .single();

      if (leadErr) throw leadErr;
      const leadId = lead.id as string;

      // ── Step 2: optional opportunity
      if (!input.routing) return { leadId, opportunityId: null };

      let stageId = input.routing.stageId ?? null;
      if (!stageId) {
        const { data: stage, error: sErr } = await sb
          .from("pipeline_stages_v2")
          .select("id")
          .eq("pipeline_id", input.routing.pipelineId)
          .is("deleted_at", null)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (sErr || !stage) {
          // Compensating rollback
          await sb.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", leadId);
          throw sErr ?? new Error("Pipeline sem etapas configuradas.");
        }
        stageId = stage.id as string;
      }

      const { data: opp, error: oppErr } = await sb
        .from("opportunities")
        .insert({
          equipe_id: equipeId,
          lead_id: leadId,
          pipeline_id: input.routing.pipelineId,
          stage_id: stageId,
          custom_data: {},
        })
        .select()
        .single();

      if (oppErr) {
        await sb.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", leadId);
        throw oppErr;
      }
      return { leadId, opportunityId: opp.id as string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["leads", equipeId] });
      if (result.opportunityId) {
        queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
        toast.success("Contato criado e adicionado à pipeline!");
      } else {
        toast.success("Contato criado!");
      }
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreateContactAtomic.ts
git commit -m "feat(crm): add useCreateContactAtomic identity router hook (Sprint 5.1 §2.2)"
```

---

# WAVE 3

---

### Task T8 · OpportunityCard telemetry pillars — **Gemini**

**Depends on:** T6 (`useStageTelemetry`), T1 (verifies the ledger no longer competes for these visuals).

**Spec ref:** EPIC 3 §3.1 — four pillars on every Kanban card cover.

**Files:**
- Create: `src/components/crm/CardTelemetryPillars.tsx`
- Modify: `src/components/crm/OpportunityCard.tsx`
- Modify: `src/components/crm/OpportunityKanban.tsx` (only to pass batched touchpoint counts down)

- [x] **Step 1: Create the pillars component**

Create `src/components/crm/CardTelemetryPillars.tsx`:

```tsx
import { Clock, MessageSquare, Calendar, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeStageTelemetry } from "@/hooks/useStageTelemetry";
import type { Lead } from "@/types/crm";
import type { Opportunity, PipelineStageV2 } from "@/types/pipelines";
import { formatBrPhone } from "@/lib/displayName";

interface CardTelemetryPillarsProps {
  opportunity: Opportunity;
  stage: PipelineStageV2 | undefined;
  lead: Lead | undefined;
  touchpointCount: number;
}

export const CardTelemetryPillars = ({
  opportunity,
  stage,
  lead,
  touchpointCount,
}: CardTelemetryPillarsProps) => {
  const t = computeStageTelemetry({
    stageEnteredAt: opportunity.stage_entered_at,
    maxIdleHours: stage?.max_idle_hours ?? null,
    touchpointCount,
    nextContact: lead?.next_contact ?? null,
  });

  const hasPhone = !!lead?.phone;

  return (
    <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-border/60 text-[11px]">
      {/* Pillar 1 — Time in Phase */}
      <div
        className={cn(
          "flex items-center gap-1 px-1.5 py-1 rounded-md",
          t.slaBreached
            ? "text-destructive-foreground bg-destructive/15 animate-pulse"
            : "text-muted-foreground bg-muted/50",
        )}
        title={`Em fase há ${t.hoursInPhaseLabel}`}
      >
        <Clock className="h-3 w-3 shrink-0" />
        <span className="truncate">{t.hoursInPhaseLabel}</span>
      </div>

      {/* Pillar 2 — Touchpoints */}
      <div
        className="flex items-center gap-1 px-1.5 py-1 rounded-md text-muted-foreground bg-muted/50"
        title={`${t.touchpointCount} interações`}
      >
        <MessageSquare className="h-3 w-3 shrink-0" />
        <span className="truncate">{t.touchpointCount}</span>
      </div>

      {/* Pillar 3 — Next Contact */}
      {t.nextContactLabel && (
        <div
          className={cn(
            "flex items-center gap-1 px-1.5 py-1 rounded-md col-span-2",
            t.nextContactOverdue
              ? "text-destructive-foreground bg-destructive/15"
              : "text-muted-foreground bg-muted/50",
          )}
          title="Próximo contato"
        >
          <Calendar className="h-3 w-3 shrink-0" />
          <span className="truncate">{t.nextContactLabel}</span>
        </div>
      )}

      {/* Pillar 4 — Mirrored identity shortcut */}
      {hasPhone && (
        <a
          href={`https://wa.me/${lead!.phone!.replace(/\D/g, "").replace(/^(?!55)/, "55$&")}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="col-span-2 flex items-center gap-1 px-1.5 py-1 rounded-md text-green-700 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20"
          title={formatBrPhone(lead!.phone) ?? lead!.phone!}
        >
          <MessageCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{formatBrPhone(lead!.phone) ?? lead!.phone}</span>
        </a>
      )}
    </div>
  );
};
```

- [x] **Step 2: Update OpportunityCard signature**

In `src/components/crm/OpportunityCard.tsx`, extend the props:

```tsx
interface OpportunityCardProps {
  opportunity: Opportunity;
  lead: Lead | undefined;
  stage: PipelineStageV2 | undefined;            // NEW
  cardFields: CustomFieldSchema[];
  touchpointCount: number;                       // NEW — supplied by parent (batched)
  onClick: () => void;
  isDragOverlay?: boolean;
}
```

Render `<CardTelemetryPillars ... />` directly under the existing value text and above the cardFields block. Replace the old value `<DollarSign>` line — value is now optional eye-candy at top, telemetry takes the dominant footer real estate. Required imports:

```tsx
import { CardTelemetryPillars } from "./CardTelemetryPillars";
import type { PipelineStageV2 } from "@/types/pipelines";
```

- [x] **Step 3: Wire OpportunityKanban**

In `src/components/crm/OpportunityKanban.tsx`:

1. Import `useTouchpointCounts`:
   ```tsx
   import { useTouchpointCounts } from "@/hooks/useStageTelemetry";
   ```
2. After `leadsById` memo, batch lead ids and fetch counts:
   ```tsx
   const leadIdsForCounts = useMemo(() => Array.from(new Set(localOpps.map(o => o.lead_id))), [localOpps]);
   const touchpointCounts = useTouchpointCounts(leadIdsForCounts);
   ```
3. Pass counts into `OpportunityKanbanColumn`:
   ```tsx
   <OpportunityKanbanColumn
     key={stage.id}
     stage={stage}
     opportunities={oppsByStage[stage.id] ?? []}
     leadsById={leadsById}
     cardFields={cardFields}
     touchpointCounts={touchpointCounts}
     onCardClick={setSelectedOpp}
   />
   ```
4. Also pass `stage` to the `DragOverlay` card render:
   ```tsx
   <OpportunityCard
     opportunity={activeOpp}
     lead={leadsById[activeOpp.lead_id]}
     stage={orderedStages.find(s => s.id === activeOpp.stage_id)}
     cardFields={cardFields}
     touchpointCount={touchpointCounts[activeOpp.lead_id] ?? 0}
     onClick={() => {}}
     isDragOverlay
   />
   ```

- [x] **Step 4: Patch OpportunityKanbanColumn**

In `src/components/crm/OpportunityKanbanColumn.tsx`, extend props with `touchpointCounts: Record<string, number>` and pass each card:
```tsx
<OpportunityCard
  key={opp.id}
  opportunity={opp}
  lead={leadsById[opp.lead_id]}
  stage={stage}
  cardFields={cardFields}
  touchpointCount={touchpointCounts[opp.lead_id] ?? 0}
  onClick={() => onCardClick(opp)}
/>
```

- [x] **Step 5: Verify build + visual smoke test**

Run: `npm run build` then `npm run dev`. Open a Kanban with at least one opportunity. Confirm: time-in-phase chip, touchpoint count, next-contact chip (if set), WhatsApp pill. If you have an SLA set on a stage, the time chip pulses red when the threshold is breached.

- [x] **Step 6: Commit**

```bash
git add src/components/crm/CardTelemetryPillars.tsx src/components/crm/OpportunityCard.tsx src/components/crm/OpportunityKanban.tsx src/components/crm/OpportunityKanbanColumn.tsx
git commit -m "feat(crm): kanban card telemetry pillars (Sprint 5.1 §3.1)"
```

---

### Task T9 · Kanban column SLA visual — **Gemini**

**Depends on:** T4 (field), T8 (consumes telemetry).

**Spec ref:** EPIC 3 §3.1 — visual reinforcement at column level.

**Files:**
- Modify: `src/components/crm/OpportunityKanbanColumn.tsx`

- [x] **Step 1: Show a column-level SLA badge**

In `src/components/crm/OpportunityKanbanColumn.tsx`, in the column header (right next to the row count badge), conditionally render:

```tsx
{stage.max_idle_hours && (
  <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
    SLA {stage.max_idle_hours}h
  </span>
)}
```

- [x] **Step 2: Verify build**

Run: `npm run build`
Expected: SUCCESS.

- [x] **Step 3: Commit**

```bash
git add src/components/crm/OpportunityKanbanColumn.tsx
git commit -m "feat(crm): show stage SLA threshold in column header (Sprint 5.1 §3.1)"
```

---

### Task T10 · CardFieldsPicker — native field toggles — **Codex**

**Depends on:** T8 (cards must read these toggles).

**Spec ref:** EPIC 4 §4.1 — picker should govern **native** fields too (Nome, Próximo Contato, Tempo na Fase, Potência kWp).

**The problem:** Today `CardFieldsPicker` only handles `pipeline.custom_fields_schema`. The spec calls for an admin matrix combining **native + custom**. We model native fields as a constant list with reserved `field_id`s (prefixed `native:`).

**Files:**
- Modify: `src/components/crm/pipeline-settings/CardFieldsPicker.tsx`
- Modify: `src/components/crm/OpportunityCard.tsx` (read flags)
- Modify: `src/components/crm/OpportunityKanban.tsx` (compute the merged list once)

- [x] **Step 1: Define native fields**

Inside `CardFieldsPicker.tsx`, top-of-file:

```tsx
export const NATIVE_CARD_FIELDS = [
  { field_id: "native:value", label: "Valor da oportunidade", group: "Nativo" },
  { field_id: "native:time_in_phase", label: "Tempo na Fase", group: "Nativo" },
  { field_id: "native:touchpoints", label: "Interações", group: "Nativo" },
  { field_id: "native:next_contact", label: "Próximo Contato", group: "Nativo" },
  { field_id: "native:whatsapp", label: "WhatsApp do contato", group: "Nativo" },
] as const;

export type NativeCardFieldId = (typeof NATIVE_CARD_FIELDS)[number]["field_id"];
```

- [x] **Step 2: Render native + custom together**

Replace the JSX body with a two-section matrix (Nativo / Personalizado). Keep the existing custom-field branch; prefix it with the native section:

```tsx
<div className="space-y-4">
  <section className="space-y-2">
    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Nativos</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {NATIVE_CARD_FIELDS.map((f) => {
        const checked = cardFieldIds.includes(f.field_id);
        return (
          <label key={f.field_id} className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/30 cursor-pointer">
            <Checkbox checked={checked} onCheckedChange={(v) => toggle(f.field_id, !!v)} />
            <Label className="text-sm font-medium cursor-pointer">{f.label}</Label>
          </label>
        );
      })}
    </div>
  </section>
  {/* existing custom-field block here, under its own header */}
</div>
```

- [x] **Step 3: Make OpportunityCard respect the flags**

In `OpportunityCard.tsx`, accept a `nativeFlags: { value: boolean; timeInPhase: boolean; touchpoints: boolean; nextContact: boolean; whatsapp: boolean }` prop. Render each block only when its flag is true. Inside `CardTelemetryPillars`, accept the four boolean flags and short-circuit the pillars that are toggled off.

- [x] **Step 4: Compute flags in OpportunityKanban once**

In `OpportunityKanban.tsx`, after the `cardFields` memo, derive:

```tsx
const ids = pipeline?.card_field_ids ?? [];
const nativeFlags = {
  value: ids.includes("native:value"),
  timeInPhase: ids.includes("native:time_in_phase"),
  touchpoints: ids.includes("native:touchpoints"),
  nextContact: ids.includes("native:next_contact"),
  whatsapp: ids.includes("native:whatsapp"),
};
```

Pass `nativeFlags` down to each `OpportunityKanbanColumn` → `OpportunityCard`.

- [x] **Step 5: Backfill defaults**

For pipelines that have an empty or pre-existing `card_field_ids`, default the four telemetry pillars to ON in `OpportunityKanban`:
```tsx
const hasNativeConfig = ids.some(i => i.startsWith("native:"));
const effectiveNativeFlags = hasNativeConfig ? nativeFlags : {
  value: true, timeInPhase: true, touchpoints: true, nextContact: true, whatsapp: true,
};
```
Use `effectiveNativeFlags` downstream.

- [x] **Step 6: Verify build + dev test**

Run: `npm run build` and `npm run dev`. Open the picker, toggle "Tempo na Fase" off, save. Confirm cards now hide that pillar.

- [x] **Step 7: Commit**

```bash
git add src/components/crm/pipeline-settings/CardFieldsPicker.tsx src/components/crm/OpportunityCard.tsx src/components/crm/OpportunityKanban.tsx src/components/crm/OpportunityKanbanColumn.tsx src/components/crm/CardTelemetryPillars.tsx
git commit -m "feat(crm): admin-configurable native card fields (Sprint 5.1 §4.1)"
```

---

### Task T11 · AddContactModal switch-toggle + atomic create — **Claude**

**Depends on:** T7 (mutation), T3 (modal hygiene done).

**Spec ref:** EPIC 2 §2.2 — "Switch toggle 'Encaminhar para um Funil de Vendas'".

**Files:**
- Modify: `src/components/crm/AddContactModal.tsx`
- Modify: `src/components/crm/DatabaseView.tsx` (rewire its `onAdd` to use the new mutation directly OR keep current `createLead` + add second path; recommended: the modal itself owns the mutation)

- [ ] **Step 1: Move ownership of mutation into the modal**

Currently `DatabaseView` owns `createLead.mutate(...)`. Refactor so `AddContactModal` calls `useCreateContactAtomic` directly. Parent only opens/closes the modal.

In `AddContactModal.tsx`, replace the existing `onAdd` callback prop with `onCreated?: (result: { leadId: string; opportunityId: string | null }) => void`. Inside the modal:

```tsx
import { useCreateContactAtomic } from "@/hooks/useCreateContactAtomic";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { Switch } from "@/components/ui/switch";

const createAtomic = useCreateContactAtomic();
const { activePipelines } = usePipelines();
const [routeToPipeline, setRouteToPipeline] = useState(false);
const [pipelineId, setPipelineId] = useState<string>("");
const [stageId, setStageId] = useState<string | "">("");
const { stages } = usePipelineStagesV2(routeToPipeline ? pipelineId : undefined);
```

- [ ] **Step 2: Add the switch + expandable panel**

Below the existing Observations textarea (before the DialogFooter), add:

```tsx
<div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
  <div className="flex items-center justify-between">
    <div>
      <Label className="text-sm font-medium">Encaminhar para um Funil de Vendas</Label>
      <p className="text-[11px] text-muted-foreground">Cria o contato e injeta a oportunidade na pipeline escolhida.</p>
    </div>
    <Switch checked={routeToPipeline} onCheckedChange={setRouteToPipeline} />
  </div>

  {routeToPipeline && (
    <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="space-y-1">
        <Label className="text-xs">Pipeline</Label>
        <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(""); }}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {activePipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Etapa (opcional)</Label>
        <Select value={stageId || "__first__"} onValueChange={(v) => setStageId(v === "__first__" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__first__">Primeira etapa</SelectItem>
            {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 3: Rewrite handleSubmit**

```tsx
const handleSubmit = () => {
  if (!formData.name.trim()) return;
  if (routeToPipeline && !pipelineId) {
    toast.error("Selecione uma pipeline ou desligue o encaminhamento.");
    return;
  }
  createAtomic.mutate(
    {
      contact: {
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        observations: formData.observations || undefined,
        source: formData.origin_category || "Manual",
        origin: "manual",
      },
      routing: routeToPipeline
        ? { pipelineId, stageId: stageId || null }
        : undefined,
    },
    {
      onSuccess: (result) => {
        onCreated?.(result);
        // reset state
        setFormData({ name: "", email: "", phone: "", observations: "", origin_category: "", origin_detail: "" });
        setRouteToPipeline(false);
        setPipelineId("");
        setStageId("");
        onClose();
      },
    },
  );
};
```

(`toast` import already present elsewhere — re-import if needed.)

- [ ] **Step 4: Adapt DatabaseView caller**

In `src/components/crm/DatabaseView.tsx`, replace the `<AddContactModal ... onAdd={...} />` block with:
```tsx
<AddContactModal
  open={showAddModal}
  onClose={() => setShowAddModal(false)}
  onCreated={() => setShowAddModal(false)}
/>
```
Also drop `createLead` from the `useLeads` destructure if it's now unused here.

- [ ] **Step 5: Verify**

Run: `npm run build` and `npm run dev`. Open Base de Contatos, click "Adicionar Contato", fill in name + phone, flip the switch, pick a pipeline, save. Confirm:
1. Toast says "Contato criado e adicionado à pipeline!"
2. The new contact appears in Base de Contatos (refresh if needed).
3. Switching to the Kanban for that pipeline shows a fresh card at the first stage.
4. Switch OFF + save creates contact only.

- [ ] **Step 6: Commit**

```bash
git add src/components/crm/AddContactModal.tsx src/components/crm/DatabaseView.tsx
git commit -m "feat(crm): unified identity router in AddContactModal (Sprint 5.1 §2.2)"
```

---

# WAVE 4

---

### Task T12 · OpportunityTable telemetry parity — **Codex**

**Depends on:** T6.

**Spec ref:** EPIC 3 §3.1 + §3.2 — telemetry on table view too, and ensure all `custom_data` fields show as columns.

**Files:**
- Modify: `src/components/crm/OpportunityTable.tsx`

- [ ] **Step 1: Add telemetry columns**

In `OpportunityTable.tsx`, import:
```tsx
import { computeStageTelemetry, useTouchpointCounts } from "@/hooks/useStageTelemetry";
import { Clock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
```

After the existing `leadsById`/`stagesById` memos, batch counts:
```tsx
const leadIds = useMemo(() => Array.from(new Set(opportunities.map(o => o.lead_id))), [opportunities]);
const touchpointCounts = useTouchpointCounts(leadIds);
```

In the `fixed` columns array, insert (between `stage` and `status`):
```tsx
{
  id: "time_in_phase",
  header: "Tempo na Fase",
  accessorFn: (r) => new Date(r.opp.stage_entered_at).getTime(),
  cell: ({ row }) => {
    const t = computeStageTelemetry({
      stageEnteredAt: row.original.opp.stage_entered_at,
      maxIdleHours: row.original.stage?.max_idle_hours ?? null,
      touchpointCount: 0,
      nextContact: null,
    });
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs",
        t.slaBreached ? "text-destructive font-medium animate-pulse" : "text-muted-foreground"
      )}>
        <Clock className="h-3 w-3" />{t.hoursInPhaseLabel}
      </span>
    );
  },
},
{
  id: "touchpoints",
  header: "Interações",
  accessorFn: (r) => touchpointCounts[r.opp.lead_id] ?? 0,
  cell: ({ row }) => (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MessageSquare className="h-3 w-3" />{touchpointCounts[row.original.opp.lead_id] ?? 0}
    </span>
  ),
},
```
Don't forget `touchpointCounts` in the `columns` deps array.

- [ ] **Step 2: Audit custom fields column generation**

Re-read the existing `dynamic` columns map (≈ lines 310-315). It already covers all non-deleted schema fields — confirm by toggling a custom field's `is_deleted` flag in the DB and checking the column disappears.

- [ ] **Step 3: Verify build + dev test**

Run: `npm run build` then `npm run dev`. Open the pipeline list view (the one with the table). Confirm Tempo na Fase + Interações columns render with sensible numbers.

- [ ] **Step 4: Commit**

```bash
git add src/components/crm/OpportunityTable.tsx
git commit -m "feat(crm): time-in-phase + touchpoints columns in OpportunityTable (Sprint 5.1 §3.1)"
```

---

### Task T13 · OpportunityDetailModal — bi-partilhado 60/40 — **Claude**

**Depends on:** T2 (mask), T6 (telemetry).

**Spec ref:** EPIC 5 §5.1 — "Painel Bi-Partilhado": 60% timeline left, 40% data right.

**The redesign:** Replace the current tabbed Dialog with a wide split panel. Left scroll = conversation messages + activities chronologically. Right scroll = identity card on top + opportunity engineering data on bottom. Two independent vertical scrolls.

**Files:**
- Modify: `src/components/crm/OpportunityDetailModal.tsx`

- [ ] **Step 1: Widen the dialog + restructure layout**

In `OpportunityDetailModal.tsx`, change `DialogContent`'s class from `max-w-2xl` to `max-w-5xl w-[min(96vw,1100px)] h-[88vh] flex flex-col p-0 gap-0 overflow-hidden`.

Replace the `<Tabs>...</Tabs>` block with a new layout:

```tsx
<div className="flex-1 min-h-0 grid grid-cols-5 divide-x divide-border/60">
  {/* Left 60% — Linha do Tempo Viva */}
  <div className="col-span-3 min-h-0 flex flex-col">
    <ScrollArea className="flex-1">
      <OpportunityTimeline leadId={lead?.id ?? null} opportunityId={opportunity.id} />
    </ScrollArea>
  </div>

  {/* Right 40% — Bloco de Engenharia de Dados */}
  <div className="col-span-2 min-h-0 flex flex-col">
    <ScrollArea className="flex-1">
      <div className="p-5 space-y-6">
        <IdentityBlock lead={lead} onOpenContact={onOpenContact} />
        <OpportunityEngineeringBlock
          opportunity={opportunity}
          schema={schema}
          stages={stages}
          stageId={stageId}
          setStageId={setStageId}
          status={status}
          setStatus={setStatus}
          value={value}
          setValue={setValue}
          customData={customData}
          setCustomData={setCustomData}
        />
      </div>
    </ScrollArea>
  </div>
</div>
```

- [ ] **Step 2: Extract subcomponents inline (same file, kept small)**

At the bottom of the file (still default-exported from the same module), define the three subcomponents. Skeletons:

```tsx
// ─── Timeline (left pane) ──────────────────────────────────────
function OpportunityTimeline({ leadId, opportunityId }: { leadId: string | null; opportunityId: string }) {
  const { activities } = useLeadActivities(leadId ?? undefined);
  const { touchpoints } = useTouchpoints(leadId ?? undefined);
  // Merge messages + touchpoints + activities by timestamp; render chronologically.
  // Implementation: union the three arrays into `{ ts, kind, content }[]`, sort desc, render.
  // Keep each row to 60-80px max-height to preserve scrolling rhythm.
  return (
    <div className="p-5 space-y-3">
      {/* TODO during impl: actual chronological union — see existing TouchpointsList for style cues */}
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Linha do tempo</h4>
      {/* render items */}
    </div>
  );
}

// ─── Identity Block (right top) ────────────────────────────────
function IdentityBlock({ lead, onOpenContact }: { lead: Lead | undefined; onOpenContact?: (id: string) => void }) {
  // Show name (masked), phone (WhatsApp shortcut), email, company chip, enrichment summary.
  // Reuse EntityChips for the company/property chips.
  return (...);
}

// ─── Opportunity engineering (right bottom) ────────────────────
function OpportunityEngineeringBlock(props: { /* all the existing controlled inputs */ }) {
  // Render the stage/status/value/custom_data controls that previously lived in TabsContent value="dados".
  return (...);
}
```

> The senior implementing this task fills in the marked subcomponent bodies pulling code from the *existing* `TabsContent value="dados"` block (no behavior change) — only the chrome around them moves. The Empresas/Imóveis tab content moves into `IdentityBlock` (chips) and a "Vínculos" expander inside the right pane.

- [ ] **Step 3: Drop Tabs imports**

Remove `Tabs, TabsContent, TabsList, TabsTrigger` from the lucide/ui imports if no longer used.

- [ ] **Step 4: Verify build + dev visual check**

Run: `npm run build` and `npm run dev`. Open any opportunity. Confirm both panes scroll independently, the right pane fits sensibly at narrow widths (≥ 1024px target — at < 1024 the layout falls back acceptably).

- [ ] **Step 5: Commit**

```bash
git add src/components/crm/OpportunityDetailModal.tsx
git commit -m "feat(crm): bi-partilhado 60/40 opportunity drawer (Sprint 5.1 §5.1)"
```

---

# WAVE 5

---

### Task T14 · Paddle-shifter navigation — **Claude**

**Depends on:** T13.

**Spec ref:** EPIC 5 §5.2 — `<` / `>` siblings inside the same column.

**Files:**
- Create: `src/hooks/useSiblingNavigation.ts`
- Create: `src/components/crm/PaddleShifterNav.tsx`
- Modify: `src/components/crm/OpportunityDetailModal.tsx`
- Modify: `src/components/crm/OpportunityKanban.tsx`
- Modify: `src/components/crm/OpportunityTable.tsx`

- [ ] **Step 1: Hook**

Create `src/hooks/useSiblingNavigation.ts`:

```ts
import { useCallback, useMemo } from "react";
import type { Opportunity } from "@/types/pipelines";

/**
 * Sprint 5.1 §5.2 — Paddle shifters. The parent (Kanban / Table) supplies the
 * ordered sibling list (already filtered/sorted the way the user sees it).
 * The hook returns prev/next ids so the modal can swap without remounting.
 */
export const useSiblingNavigation = (
  siblings: Opportunity[],
  currentId: string | null,
) => {
  const idx = useMemo(() => siblings.findIndex(o => o.id === currentId), [siblings, currentId]);
  const prevId = idx > 0 ? siblings[idx - 1].id : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;
  const canPrev = !!prevId;
  const canNext = !!nextId;
  const indexLabel = idx >= 0 ? `${idx + 1} / ${siblings.length}` : "";
  return { prevId, nextId, canPrev, canNext, indexLabel };
};
```

- [ ] **Step 2: Buttons component**

Create `src/components/crm/PaddleShifterNav.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

interface PaddleShifterNavProps {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  label?: string;
}

export const PaddleShifterNav = ({ canPrev, canNext, onPrev, onNext, label }: PaddleShifterNavProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && canPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && canNext) { e.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canPrev, canNext, onPrev, onNext]);

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canPrev} onClick={onPrev} title="Anterior (←)">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {label && <span className="text-[11px] text-muted-foreground tabular-nums px-1">{label}</span>}
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canNext} onClick={onNext} title="Próximo (→)">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
```

- [ ] **Step 3: Wire modal to accept siblings**

In `OpportunityDetailModal.tsx`, add to props:
```tsx
siblings?: Opportunity[];
onNavigate?: (opportunityId: string) => void;
```
At the top of the component:
```tsx
const { prevId, nextId, canPrev, canNext, indexLabel } = useSiblingNavigation(siblings ?? [], opportunity?.id ?? null);
```
Insert `<PaddleShifterNav ... />` inside the `DialogHeader` right of the title.

```tsx
<PaddleShifterNav
  canPrev={canPrev}
  canNext={canNext}
  onPrev={() => prevId && onNavigate?.(prevId)}
  onNext={() => nextId && onNavigate?.(nextId)}
  label={indexLabel}
/>
```

- [ ] **Step 4: Wire Kanban**

In `OpportunityKanban.tsx`:
```tsx
const siblingsForSelected = useMemo(() => {
  if (!selectedOpp) return [];
  return oppsByStage[selectedOpp.stage_id] ?? [];
}, [selectedOpp, oppsByStage]);
```
Pass to the drawer:
```tsx
<OpportunityDetailModal
  ...existing props
  siblings={siblingsForSelected}
  onNavigate={(id) => {
    const next = localOpps.find(o => o.id === id);
    if (next) setSelectedOpp(next);
  }}
/>
```

- [ ] **Step 5: Wire Table**

In `OpportunityTable.tsx`, derive siblings from the **currently rendered, filtered, sorted** rows so paddle order matches what the user sees:
```tsx
const siblingsForSelected = useMemo(
  () => table.getSortedRowModel().rows.map(r => r.original.opp),
  [table, rows, sorting, globalFilter, stageFilter, statusFilter],
);
```
Pass the same `siblings` + `onNavigate` props.

- [ ] **Step 6: Verify build + UX smoke**

Run: `npm run build` and `npm run dev`. In a Kanban column with ≥3 cards, open one and press `→` — the modal stays open, the next card loads, focus persists. Same with `←` and with the visible buttons.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useSiblingNavigation.ts src/components/crm/PaddleShifterNav.tsx src/components/crm/OpportunityDetailModal.tsx src/components/crm/OpportunityKanban.tsx src/components/crm/OpportunityTable.tsx
git commit -m "feat(crm): paddle-shifter sibling navigation in opportunity drawer (Sprint 5.1 §5.2)"
```

---

# WAVE 6

---

### Task T15 · Definition of Done acceptance pass — **Verboo**

**Depends on:** Everything.

**Files:** None (verification only)

- [ ] **Step 1: Walk the checklist**

For each item below, open the relevant screen in `npm run dev` and confirm pass/fail:

- [ ] Base de Contatos shows **no** stage or financial value columns.
- [ ] Base de Contatos scrolls continuously (no Next/Prev pagination).
- [ ] `@lid` and bare 11-13 digit IDs render as `[Novo Contato - WhatsApp]` (or formatted phone) on Kanban cards, opportunity drawer title, and OpportunityTable rows.
- [ ] AddContactModal exposes the "Encaminhar para um Funil de Vendas" switch. Saving with the switch ON creates lead **and** opportunity; toast confirms; both surfaces refresh.
- [ ] OpportunityTable shows every non-deleted `custom_fields_schema` field as an explicit column, plus the two new telemetry columns.
- [ ] CardFieldsPicker lets admin toggle native + custom; flipping toggles rerenders the card cover instantly after save.
- [ ] Opening any opportunity reveals a 60/40 split panel. Both sides scroll independently. `←` / `→` (keyboard) and the on-screen arrows swap the active card without closing the modal.

- [ ] **Step 2: Log gaps**

For any failing item, file a one-line note in a new section "DoD gaps" of the PR description. Senior (Claude) routes the fix to the original engineer.

---

## Self-Review Notes (writer's own check)

**Spec coverage map:**
- §1.1 Column purge → T1 ⚠️ + T1.1 ✅ (Verboo's first pass left three forbidden columns)
- §1.2 Infinite scroll → **already shipped Sprint 5.5 2.1** (no task — confirmed in code)
- §1.3 Telemetry on surface (channel, origin, enrichment) → channel + origin already present; T5 adds enrichment ✅
- §1.4 @lid mask → T2 ✅
- §2.1 Hygienized forms → T3 ✅
- §2.2 Identity Router → T7 + T11 ✅
- §3.1 Four telemetry pillars → T4 + T6 + T8 + T9 + T12 ✅
- §3.2 Custom field columns parity → already shipped; T12 confirms ✅
- §3.3 Mass deletion → **already shipped Sprint 5.5 3.1** (no task — confirmed in code)
- §4.1 CardFieldsPicker native + custom → T10 ✅
- §5.1 Bi-partilhado modal → T13 ✅
- §5.2 Paddle shifters → T14 ✅

**Placeholder scan:** no `TBD` / `fill in details` in steps. Subcomponent bodies in T13 reference *existing code* the senior is moving, not novel logic.

**Type consistency:** `max_idle_hours` (T4) ↔ `computeStageTelemetry({ maxIdleHours })` (T6) ↔ `stage?.max_idle_hours` (T8/T9/T12) — snake_case at the data layer, camelCase at the function boundary. Confirmed.
