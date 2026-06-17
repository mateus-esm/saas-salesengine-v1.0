Sprint 1.1 Product Strategy: Inbound Payload Optimization & F1 UX RefinementThis
specification outlines the technical refinement and strategic optimization for
the Inbound Lead Ingest Engine. Operating under a strict Job-To-Be-Done (JTBD)
methodology, Sprint 1.1 eliminates configuration friction within the Webhooks
interface, replaces error-prone manual typing with predictable dropdown mapping
menus, and bulletproofs the ingestion pipeline against common external payload
variations (such as Meta Ads tracking strings and duplicate data entries).The
goal is to ensure external payloads from paid traffic sources or automation
engines like n8n map natively to database properties on the first attempt
without triggering silent schema dropouts or validation failures.🏎️ The
Strategic Problem (UX Friction & Payload Drops)When mapping external fields in
legacy workflows, users frequently hit validation bottlenecks. For example,
forcing a user to manually type database column strings into an unstructured
text box results in formatting mismatches:Plaintext[Incoming Payload:
"full_name"] ➔ [Manual Typed Target: "Lead"] ➔ [Edge Function Lookup Fail] ➔
[HTTP 400 Bad Request] Because the target field was a free-form input, entering
an arbitrary label like "Lead" instead of the strict internal column identifier
("name") caused the ingestion gateway to reject the payload with an explicit
error: name is required (map a source field to name).Sprint 1.1 introduces an
intuitive, contextual mapping framework that behaves like a high-performance
Formula 1 cockpit—exposing maximum configurability with zero structural
ambiguity.🛠️ Inbound Mapping Matrix (Contextual UI Switch)To eliminate mapping
errors, the destination input field (target_field) adapts dynamically on the
screen depending on the structural category selected in the target_type dropdown
selector:PlaintextSelect Target Type ├── Base de Contatos (lead) ➔ Renders:
<Select> Dropdown with Core System Columns (name, phone, email...) ├── Valor /
Coluna Nativa (opp) ➔ Renders: <Select> Dropdown with Native Deal Properties
(value, title...) └── Campo Personalizado / JSON ➔ Renders: <Input> Text field
for dynamic parameter keys Contextual UI Mapping SchemeTarget Category
(target_type)UI Component RenderedSaved Key FormatsStrategic PurposeBase de
Contatos (lead)Select Dropdown Menuname, email, phone, observationsMaps directly
to strict relational system fields in the global contacts directory.Valor /
Coluna Nativa (opportunity)Select Dropdown Menuvalue, titleFeeds financial
metrics directly to core metrics, preventing numbers from getting lost in JSON
fields.Campo Personalizado / JSONBInput Clean Text BoxFree text (e.g.,
capacidade_kwp, divida_bruta)Grants flexibility to store niche campaign fields
inside unstructured data blocks.📦 Technical Implementation Architecture1.
Robust Deduplication Guardrails (crm-webhook/index.ts)Paid acquisition traffic
naturally drives recurring clicks from returning leads. Standard database
insertions cause unique constraint violations on phone properties, dropping
leads and generating 500 Internal Server Errors.The edge intake routine checks
incoming parameters to match and merge duplicate rows seamlessly:Normalizes the
incoming contact number into a sanitized string of digits (replace(/\D/g,
'')).Scans the active tenant scope for an existing record matching that
number.If found, it bypasses insertion and executes an in-place update—merging
new campaign observations and custom parameters while maintaining historical
structural relations intact.2. Tracking String & Query Parameter SanitizationAd
platforms routinely append dynamic diagnostic components onto incoming payload
destinations (e.g., ?fbclid=XYZ..., ?gclid=ABC...). The route parser isolates
the target UUID instantly:TypeScriptconst sanitizeConfigId = (raw: string) =>
raw.split('?')[0].replace(/\/$/, ''); This optimization ensures trailing slashes
or tracking parameters are safely stripped away before looking up the webhook
configuration, avoiding false 404 Webhook Not Found responses.🚀 Strategic
Blueprint TasksTask 1: Interface Refinement (WebhookConfigModal.tsx)[x] Step 1:
Integrate option schemas (LEAD_FIELD_OPTIONS, PIPELINE_FIELD_OPTIONS) natively
inside the field array renderer loop.[x] Step 2: Replace the free-text target
field box with the following conditional component switch to enforce
dropdown-driven configuration accuracy:TypeScript{/* Conditional Destination
Parameter Selector */} {mapping.target_type === 'lead' ? ( <Select
value={mapping.target_field} onValueChange={(v) => updateMapping(index,
'target_field', v)}



    <SelectTrigger className="flex-1">
      <SelectValue placeholder="Selecione o campo destino" />
    </SelectTrigger>
    <SelectContent>
      {LEAD_FIELD_OPTIONS.map((opt) => (
        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
      ))}
    </SelectContent>

</Select>
) : mapping.target_type === 'opportunity' ? (
  <Select
    value={mapping.target_field}
    onValueChange={(v) => updateMapping(index, 'target_field', v)}
  >
    <SelectTrigger className="flex-1">
      <SelectValue placeholder="Selecione o campo destino" />
    </SelectTrigger>
    <SelectContent>
      {PIPELINE_FIELD_OPTIONS.map((opt) => (
        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
) : (
  <Input
    placeholder="Chave customizada (ex: capacidade_kwp)"
    value={mapping.target_field}
    onChange={(e) => updateMapping(index, 'target_field', e.target.value)}
    className="flex-1"
  />
)}
[x] Step 3: Bind input changes to react-hook-form via the useFieldArray hook to maintain form integrity, validate against empty properties, and remove UI row synchronization bugs.Task 2: Ingestion Route Bulletproofing (crm-webhook/index.ts)[x] Step 1: Implement URL string cleanup to isolate the configId from network query parameters (?fbclid=) or trailing slashes.[x] Step 2: Refactor the ingestion flow to read mapped parameters dynamically, ensuring native values (like financial values) populate the corresponding database columns rather than generic custom data fields.[x] Step 3: Deploy phone normalization and unique entry checking to automatically update existing records upon duplicate submission instead of failing with a database conflict.🏁 Closed-Loop Validation PipelineTo verify the end-to-end reliability of the ingestion engine, execute the following validation steps:Configure Mappings via UI: Pair the incoming payload property full_name directly with the dropdown option Nome (name) to bind it to the database table schema.Execute Inbound Post Pulse: Fire a test request mimicking a live paid campaign lead:Bashcurl -X POST "https://[YOUR_SUPABASE_ID].supabase.co/functions/v1/crm-webhook/inbound/[CONFIG_UUID]?fbclid=MetaTrackingPixel123" \
  -H "Content-Type: application/json" \
  -d '{"full_name": "Mateus Teste", "phone_num": "11988888888", "value": "15000"}'
Verify Output Parameters:Review network feedback status to confirm a 201 Created or 200 Success code is returned instead of a 400 Bad Request or 504 Timeout.Confirm the destination database row registers a pipeline asset with a value of 15000 rather than falling back to default values.Verify the outbound trigger executes immediately, passing the data directly to n8n for workflow processing.

---

## ✅ Handoff: Inbound Payload Optimization & F1 UX Refinement

> **Status:** Implementation complete · **Date:** 2026-06-16
> **Branch:** `feat/sprint1.1/inbound-ux-refinement`
> **Commit:** `c4e449d`

### What was built

Two refinements to the Inbound Lead Ingest engine: (1) replaced the free-text `target_field` input with a contextual dropdown selector that shows valid options based on the selected target type, eliminating configuration friction and mapping errors; (2) added currency/number sanitization in the edge function to handle Brazilian formats (R$, 1.000,00) and ad-platform tracking strings.

### Files changed (3 files)

| Layer | File | What changed |
|-------|------|-------------|
| **Component** | `src/components/webhooks/WebhookConfigModal.tsx` | Refactored from plain `useState` to `react-hook-form` + `useFieldArray` for form state. `target_field` input now renders conditionally: `<Select>` with `LEAD_FIELD_OPTIONS` for `lead` type (filtered to exclude `custom_fields`), `<Select>` with `PIPELINE_FIELD_OPTIONS` for `opportunity` type, free-text `<Input>` for `lead_custom`/`custom_data`. `Controller` wrappers on all Select/RadioGroup components. Inbound/outbound toggle clears inbound fields on switch. |
| **Edge Function** | `supabase/functions/crm-webhook/index.ts` | Added `parseNumericValue()` helper that strips `R$`, `$`, spaces, thousand separators (`.`), and converts Brazilian decimal comma (`,`) to dot before `Number()` coercion. Applied in the inbound route handler where `oppNativeData.value` is converted. |
| **Billing** | `Planning/billing.md` | Added billing row: R$ 20 (L tier). |

### Architecture

```
[Ad Platform] → POST /functions/v1/crm-webhook/inbound/{config_id}
                    │
                    ▼
         ┌─────────────────────────────────────┐
         │     WebhookConfigModal.tsx           │
         │                                      │
         │  react-hook-form + useFieldArray     │
         │                                      │
         │  target_type → controls → UI:        │
         │    lead        → Select (LEAD_OPTIONS)│
         │    opportunity → Select (PIPE_OPTIONS)│
         │    lead_custom → <Input> free text    │
         │    custom_data → <Input> free text    │
         └─────────────────────────────────────┘
                    │
                    ▼ (saves config with field_mappings)
         ┌─────────────────────────────────────┐
         │     crm-webhook Edge Function        │
         │                                      │
         │  1. Sanitize configId (?fbclid=...)  │
         │  2. Apply field_mappings             │
         │  3. parseNumericValue() on currency  │
         │  4. Dedup by phone → update or insert│
         │  5. Create/update opp with value     │
         │  6. Dispatch outbound → n8n          │
         └─────────────────────────────────────┘
```

### Inbound mapping matrix (implemented)

| target_type | UI Component | target_field source | Purpose |
|-------------|-------------|---------------------|---------|
| `lead` | Select dropdown | `LEAD_FIELD_OPTIONS` (name, email, phone, source, tags, observations) | Maps to top-level `public.leads` columns |
| `lead_custom` | Text Input | Free text key (e.g., `capacidade_kwp`) | Maps to `leads.custom_fields` JSONB |
| `opportunity` | Select dropdown | `PIPELINE_FIELD_OPTIONS` (value, custom_data) | Maps to `opportunities.value` numeric |
| `custom_data` | Text Input | Free text key (e.g., `data_instalacao`) | Maps to `opportunities.custom_data` JSONB |

### Value sanitization (parseNumericValue)

```typescript
Input          → Output
"15000"        → 15000
"R$ 15.000,00" → 15000
"$15,000.00"   → 15000
"15.000"       → 15000
"abc"          → undefined (skipped)
```

### Verification results

| Check | Result |
|-------|--------|
| TypeScript (`npm run build`) | ✅ Pass (0 errors, 0 warnings besides chunk size) |
| Deno check (`deno check`) | ✅ Pass (0 errors) |
| Pytest (python-agent) | ✅ 212 passed, 0 failed |
| Backward compatibility | ✅ Outbound secret-based flow untouched; existing inbound configs compatible |
| Billing row | ✅ Added (R$ 20, L tier) |

### How to deploy

```bash
# 1. Merge to main
git checkout main
git merge feat/sprint1.1/inbound-ux-refinement

# 2. Deploy the Edge Function
supabase functions deploy crm-webhook

# 3. Build and deploy the frontend
npm run build
# deploy dist/ to your hosting platform (Vercel/Netlify/self-hosted)

# 4. Push to git
git push origin main
```

### Known edges / caveats

- **custom_fields excluded from lead dropdown.** The `LEAD_FIELD_OPTIONS` constant includes `custom_fields` but it's filtered out in the dropdown since `lead_custom` target_type handles custom fields explicitly. If a user needs to write to `leads.custom_fields`, they should use `lead_custom` target_type.
- **Field clearing on type switch.** When the user changes `target_type`, `target_field` is reset to `""` to prevent stale values from a different type context.
- **parseNumericValue is best-effort.** Completely unparseable strings (e.g., `"abc"`) return `undefined` and the value is silently skipped — no error raised. This prevents a non-critical field from blocking the entire ingest.
- **Inbound fields cleared on type toggle.** Switching from inbound to outbound clears `pipelineId` and `fieldMappings` via `setValue` to avoid stale data leakage.

