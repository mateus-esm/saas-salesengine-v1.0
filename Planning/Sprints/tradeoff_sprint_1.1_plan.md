# Inbound Payload Optimization & F1 UX Refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Refine the Inbound Lead Ingest engine to eliminate configuration friction in the Webhooks interface, enforce dropdown-driven configuration mapping, and bulletproof the Edge Function against duplicate entries, dirty phone formats, and URL tracking parameters.

**Architecture:** 
1. **Frontend:** Refactor [WebhookConfigModal.tsx](file:///C:/Users/mateus/SaaS%20Sales%20Engine%20-%20v1.0%20%28Supabase%29/saas-salesengine-v1.0/src/components/webhooks/WebhookConfigModal.tsx) to use `react-hook-form` and `useFieldArray` for form state management. Replace the free-text input for `target_field` with a contextual selector (Select dropdown with `LEAD_FIELD_OPTIONS` for `lead` type, Select dropdown with `PIPELINE_FIELD_OPTIONS` for `opportunity` type, and a clean text `<Input>` for dynamic custom keys on `lead_custom` and `custom_data` types).
2. **Backend:** Bulletproof the `crm-webhook` Edge Function ([index.ts](file:///C:/Users/mateus/SaaS%20Sales%20Engine%20-%20v1.0%20%28Supabase%29/saas-salesengine-v1.0/supabase/functions/crm-webhook/index.ts)) by ensuring URL trailing slash and query param sanitization, robust phone normalization (`replace(/\D/g, '')`), duplicate detection with update/merge logic instead of throwing DB errors, and robust conversion of financial values (like `value` on opportunity) into numeric values.

**Tech Stack:** React + Vite + TypeScript + `react-hook-form` · Deno + Supabase Edge Functions (TypeScript)

---

## 🛠️ Task 1: Interface Refinement (`WebhookConfigModal.tsx`)

**Files:**
- Modify: [WebhookConfigModal.tsx](file:///C:/Users/mateus/SaaS%20Sales%20Engine%20-%20v1.0%20%28Supabase%29/saas-salesengine-v1.0/src/components/webhooks/WebhookConfigModal.tsx)

- [x] **Step 1: Install / Import react-hook-form elements**
  Import `useForm`, `useFieldArray`, and `Controller` from `react-hook-form`. Add icons or UI components if missing. Ensure `FieldMapping` types are loaded correctly.

- [x] **Step 2: Initialize Form State and useFieldArray**
  Refactor the form state from local `useState` variables (`formData`, `fieldMappings`) into a `react-hook-form` hook.
  Set the schema defaults on load / mount via `useEffect`:
  ```typescript
  const { register, control, handleSubmit, watch, setValue, reset, getValues } = useForm({
    defaultValues: {
      name: "",
      url: "",
      trigger_event: "",
      headers: "{}",
      active: true,
      webhookType: "outbound" as "outbound" | "inbound",
      pipelineId: "",
      fieldMappings: [] as FieldMapping[],
    }
  });
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "fieldMappings",
  });
  ```

- [x] **Step 3: Update Modal Data Binding and Event Handlers**
  * Wire up form reset and load parameters inside `useEffect` when `config` changes.
  * Implement `addMapping`, `removeMapping`, and dynamic `updateMapping` callbacks using `useFieldArray`'s `append`, `remove`, and `update` routines to prevent rendering/synchronization bugs.

- [x] **Step 4: Implement Contextual Destination Parameter Selector**
  Replace the free-text `target_field` input in mapping rows with the conditional render:
  * **If `target_type === 'lead'`**: Render a `<Select>` dropdown displaying core system contact fields (filtered to exclude `custom_fields` placeholder option since `lead_custom` handles it):
    * `name` (Nome)
    * `email` (Email)
    * `phone` (Telefone)
    * `source` (Origem)
    * `tags` (Tags)
    * `observations` (Observações)
  * **If `target_type === 'opportunity'`**: Render a `<Select>` dropdown displaying native pipeline opportunity columns:
    * `value` (Valor Financeiro)
    * (Optionally `title` / others if required, but primarily `value`)
  * **If `target_type === 'lead_custom'` or `'custom_data'`**: Render a clean `<Input>` text box allowing the user to type dynamic custom field keys (e.g. `capacidade_kwp`, `divida_bruta`).

- [x] **Step 5: Form Validation and Submission Refinement**
  * Enforce non-empty field names on submit.
  * Ensure that if the type is inbound, the target pipeline is selected, and at least a mapping for the contact name (`name` field under `lead`) is defined.
  * Map headers string JSON validation (`JSON.parse` guard).
  * Submit values correctly via `createConfig` / `updateConfig` API mutations.

- [x] **Step 6: Verify Frontend Build compiles successfully**
  Run: `npm run build`
  Verify: Vite build output contains no TypeScript errors.

---

## 🛠️ Task 2: Ingestion Route Bulletproofing (`crm-webhook/index.ts`)

**Files:**
- Modify: [index.ts](file:///C:/Users/mateus/SaaS%20Sales%20Engine%20-%20v1.0%20%28Supabase%29/saas-salesengine-v1.0/supabase/functions/crm-webhook/index.ts)

- [x] **Step 1: Sanitize configId URL Lookup**
  Refactor the config UUID parser inside the `/inbound/{config_id}` endpoint.
  Ensure it strips out trailing slashes and trailing query strings (e.g., matching Meta Click ID parameters like `?fbclid=MetaPixelTracking123...` or Google parameters `?gclid=...`) before querying the database:
  ```typescript
  const sanitizeConfigId = (raw: string) => raw.split('?')[0].replace(/\/$/, '');
  ```

- [x] **Step 2: Refactor applyFieldMappings and Parameter Parsing**
  Ensure values passed into `applyFieldMappings` are type-coerced correctly:
  * String values mapped to `target_type === 'opportunity'` and `target_field === 'value'` must be converted to numeric float/integer types (`Number(val)`) after cleaning up common formatting symbols (like currency symbols `R$`, `$`, or spacing).
  * Map variables cleanly into `leadData`, `oppNativeData`, and `oppCustomData`.

- [x] **Step 3: Implement Sanity Guards & Phone-based Lead Deduplication**
  Before trying to insert a new contact:
  1. Strip non-digits from the phone payload: `leadData.phone ? String(leadData.phone).replace(/\D/g, '') : null`.
  2. If the sanitized number is present, query the tenant database scope for an existing record:
     `supabase.from('leads').select('id, custom_fields').eq('equipe_id', config.equipe_id).eq('phone', sanitizedPhone).maybeSingle()`
  3. If a record exists:
     * Fetch `leadId` from it.
     * Execute an update on that lead: merge observations, append tags, and deeply merge the existing `custom_fields` JSONB with the new mapped inputs.
     * Skip creating a new lead row (preventing database key collisions).
  4. If no record exists:
     * Insert a new row in `public.leads` and retrieve the new `leadId`.

- [x] **Step 4: Resolve Active Opportunity & Value Assignment**
  After lead identification:
  1. Resolve or create the active opportunity inside the pipeline (using `resolveActiveOpportunity`).
  2. If found or created:
     * Update the opportunity value if defined in the mapped parameters.
     * Deeply merge opportunity `custom_data` with any new mapped parameters.
  3. Fire the outbound webhook relay and log the execution event in `webhook_logs`.

- [x] **Step 5: Verify Deno Code compilation**
  Run: `deno check supabase/functions/crm-webhook/index.ts`
  Verify: Deno type-checking passes cleanly.

---

## 🏁 Verification & Handoff Checklist

Before completing the handoff, verify the following gates:

- [x] Run backend unit tests: `cd python-agent && uv run pytest` → 212 passed, 0 failed.
- [x] Run frontend compiler checks: `npm run build` → no type errors.
- [x] Verify local database migrations applied: `supabase db reset` → schema applies clean.
- [x] Append one billing row to [billing.md](file:///C:/Users/mateus/SaaS%20Sales%20Engine%20-%20v1.0%20%28Supabase%29/saas-salesengine-v1.0/Planning/billing.md).
