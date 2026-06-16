# Inbound Webhook Lead Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Transform the `crm-webhook` Edge Function into a configurable inbound lead ingestion endpoint with field mapping, pipeline targeting, and outbound relay to n8n.

**Architecture:** Extend `webhook_configs` with inbound function config, add a new route `/inbound/{config_id}` to the existing `crm-webhook` Edge Function, and implement the outbound webhook dispatch that was never built. The Webhooks UI gains field mapping configuration and auto-generated per-config URLs.

**Tech Stack:** Supabase Edge Function (Deno/TypeScript), Supabase JS client, React/TypeScript frontend, PostgreSQL (migration)

## Global Constraints

- All new SQL must be backward-compatible — existing `crm-webhook` usage (create/update by secret) must continue working
- Edge Function uses Deno std@0.168.0 and esm.sh @supabase/supabase-js@2 (existing imports)
- Frontend follows existing patterns: Radix UI primitives, Tailwind CSS, shadcn/ui components
- No new npm packages — use existing react-hook-form for the field mapping form

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260616000001_inbound_webhook_config.sql`

**Interfaces:**
- Consumes: existing `webhook_configs` table
- Produces: `inbound_function`, `pipeline_id`, `field_mappings` columns on `webhook_configs`

- [x] **Step 1: Write the migration**

```sql
-- Sprint: Trade-off — Inbound Webhook Lead Ingest
-- Adds inbound function config, pipeline targeting, and field mappings
-- to webhook_configs for configurable ad lead ingestion.

ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS inbound_function text
    CHECK (inbound_function IS NULL OR inbound_function = 'receive_lead');

ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id)
    ON DELETE SET NULL;

ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS field_mappings jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.webhook_configs.inbound_function
  IS 'If set to ''receive_lead'', this config acts as an inbound lead ingestion webhook';
COMMENT ON COLUMN public.webhook_configs.pipeline_id
  IS 'Target pipeline for opportunity creation when inbound_function = ''receive_lead''';
COMMENT ON COLUMN public.webhook_configs.field_mappings
  IS 'Array of { source_field, target_field, target_type } mappings for inbound payload transformation';
```

- [x] **Step 2: Run migration to verify**

```bash
# Verify migration file exists:
ls supabase/migrations/20260616000001_inbound_webhook_config.sql
```

---

### Task 2: Shared Types — FieldMapping + InboundConfig

**Files:**
- Modify: `src/types/webhook.ts`

**Interfaces:**
- Consumes: existing `WebhookConfig` and `WebhookTriggerEvent`
- Produces: `FieldMapping`, `FieldMappingTargetType`, extended `WebhookConfig` with inbound fields

- [x] **Step 1: Add FieldMapping types**

```typescript
// src/types/webhook.ts — add after existing types

export type FieldMappingTargetType = 'lead' | 'lead_custom' | 'custom_data' | 'opportunity';

export interface FieldMapping {
  source_field: string;
  target_field: string;
  target_type: FieldMappingTargetType;
}

export const LEAD_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'name', label: 'Nome (name)' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefone (phone)' },
  { value: 'source', label: 'Origem (source)' },
  { value: 'tags', label: 'Tags' },
  { value: 'observations', label: 'Observações (observations)' },
  { value: 'custom_fields', label: 'Campo Personalizado (custom_fields.*)' },
];

export const PIPELINE_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'value', label: 'Valor Financeiro (opportunity.value)' },
  { value: 'custom_data', label: 'Dado Personalizado (custom_data.*)' },
];
```

- [x] **Step 2: Extend WebhookConfig interface**

```typescript
// In the existing WebhookConfig interface, add:
export interface WebhookConfig {
  id: string;
  equipe_id: string;
  name: string;
  url: string;
  trigger_event: string;
  active: boolean;
  headers: Record<string, string>;
  created_at: string;
  // --- inbound fields below ---
  inbound_function?: string | null;
  pipeline_id?: string | null;
  field_mappings?: FieldMapping[];
}
```

- [x] **Step 3: Add inbound event constant**

```typescript
// After WEBHOOK_TRIGGER_EVENTS:
export const INBOUND_FUNCTIONS: { value: string; label: string }[] = [
  { value: 'receive_lead', label: 'Receber Lead' },
];
```

- [x] **Step 3: (no-op — not a git repo)**

---

### Task 3: Edge Function — Inbound Route + Field Mapping

**Files:**
- Modify: `supabase/functions/crm-webhook/index.ts`

**Interfaces:**
- Consumes: `FieldMapping` structure, `webhook_configs.inbound_function`, `webhook_configs.field_mappings`
- Produces: `POST /functions/v1/crm-webhook/inbound/{config_id}` that returns `{ success, lead_id, opportunity_id, message }`
- Depends on: Task 1 (migration applied)

- [x] **Step 1: Add type for field mapping config lookup result**

```typescript
// After the existing SALES_FIELDS_ON_OPPORTUNITY constant
interface InboundWebhookConfig {
  id: string;
  equipe_id: string;
  pipeline_id: string | null;
  field_mappings: Array<{
    source_field: string;
    target_field: string;
    target_type: string;
  }>;
}

interface InboundPayload {
  [key: string]: unknown;
}
```

- [x] **Step 2: Add the field mapping applier function**

```typescript
/** Apply field_mappings to transform an inbound payload into lead + opportunity data. */
function applyFieldMappings(
  payload: InboundPayload,
  mappings: InboundWebhookConfig['field_mappings'],
): { leadData: Record<string, unknown>; oppNativeData: Record<string, unknown>; oppCustomData: Record<string, unknown> } {
  const leadData: Record<string, unknown> = {};
  const oppNativeData: Record<string, unknown> = {};
  const oppCustomData: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const value = payload[mapping.source_field];
    if (value === undefined || value === null) continue;

    if (mapping.target_type === 'lead') {
      leadData[mapping.target_field] = value;
    } else if (mapping.target_type === 'lead_custom') {
      leadData.custom_fields = { ...(leadData.custom_fields as Record<string, unknown> || {}), [mapping.target_field]: value };
    } else if (mapping.target_type === 'opportunity') {
      // Native opportunity columns (value, title, etc.) — NOT dumped into custom_data
      oppNativeData[mapping.target_field] = value;
    } else if (mapping.target_type === 'custom_data') {
      oppCustomData[mapping.target_field] = value;
    }
  }

  return { leadData, oppNativeData, oppCustomData };
}
```

- [x] **Step 3: Add the outbound dispatch function**

```typescript
/** After lead creation, fire configured outbound webhooks and log results. */
async function dispatchOutboundWebhooks(
  supabase: SupabaseClient,
  equipeId: string,
  leadId: string,
  opportunityId: string | null,
  leadData: Record<string, unknown>,
) {
  const { data: configs, error } = await supabase
    .from('webhook_configs')
    .select('id, url, headers')
    .eq('equipe_id', equipeId)
    .eq('trigger_event', 'lead_created')
    .eq('active', true);

  if (error) {
    console.error('[crm-webhook] Error fetching outbound webhook configs:', error);
    return;
  }

  const payload = {
    event: 'lead_created',
    lead_id: leadId,
    opportunity_id: opportunityId,
    equipe_id: equipeId,
    data: leadData,
    created_at: new Date().toISOString(),
  };

  for (const config of configs || []) {
    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.headers as Record<string, string> || {}),
        },
        body: JSON.stringify(payload),
      });

      await supabase.from('webhook_logs').insert({
        equipe_id: equipeId,
        webhook_config_id: config.id,
        direction: 'outbound',
        event_type: 'lead_created',
        payload,
        response_status: res.status,
        response_body: await res.text(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[crm-webhook] Error dispatching to webhook ${config.id}:`, message);

      await supabase.from('webhook_logs').insert({
        equipe_id: equipeId,
        webhook_config_id: config.id,
        direction: 'outbound',
        event_type: 'lead_created',
        payload,
        error_message: message,
      });
    }
  }
}
```

- [x] **Step 4: Add the inbound route handler before the existing create/update logic**

```typescript
// Inside serve(), after parsing the URL path, add:

// --- URL sanitization: strip query params (?fbclid=) and trailing slashes ---
const sanitizeConfigId = (raw: string) => raw.split('?')[0].replace(/\/$/, '');

// --- Inbound route (configurable field mappings) ---
if (pathParts.includes('inbound') && pathParts.length >= 2) {
  const configId = sanitizeConfigId(pathParts[pathParts.length - 1]);

  // 1. Look up webhook_config
  const { data: config, error: configError } = await supabase
    .from('webhook_configs')
    .select('id, equipe_id, pipeline_id, field_mappings')
    .eq('id', configId)
    .eq('inbound_function', 'receive_lead')
    .maybeSingle();

  if (configError || !config) {
    return new Response(
      JSON.stringify({ error: 'Webhook config not found or not configured for inbound' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const payload = body as InboundPayload;

  // 2. Apply field mappings (separates lead, native opp, and custom_data)
  const { leadData, oppNativeData, oppCustomData } = applyFieldMappings(
    payload,
    (config.field_mappings || []) as InboundWebhookConfig['field_mappings'],
  );

  // 3. Ensure minimum required fields
  if (!leadData.name) {
    return new Response(
      JSON.stringify({ error: 'name is required (map a source field to name)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Create or update lead (dedup by phone to avoid unique constraint crash)
  const checkPhone = leadData.phone ? String(leadData.phone).replace(/\D/g, '') : null;
  let leadId: string;
  let isNewLead = true;

  if (checkPhone) {
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, custom_fields')
      .eq('equipe_id', config.equipe_id)
      .eq('phone', checkPhone)
      .maybeSingle();

    if (existingLead) {
      leadId = existingLead.id;
      isNewLead = false;
      // Update: merge incoming metadata into existing lead
      const leadUpdate: Record<string, unknown> = {};
      if (leadData.email) leadUpdate.email = leadData.email;
      if (leadData.observations) leadUpdate.observations = leadData.observations;
      if (leadData.tags) leadUpdate.tags = leadData.tags;
      leadUpdate.custom_fields = {
        ...(existingLead.custom_fields as Record<string, unknown> || {}),
        ...(leadData.custom_fields as Record<string, unknown> || {}),
      };

      const { error: updateErr } = await supabase
        .from('leads')
        .update(leadUpdate)
        .eq('id', leadId);
      if (updateErr) console.error('[crm-webhook] Error updating existing lead:', updateErr);
    }
  }

  if (!leadId) {
    // No duplicate found — create new lead
    const leadRow = {
      equipe_id: config.equipe_id,
      name: leadData.name,
      email: leadData.email || null,
      phone: checkPhone || leadData.phone || null,
      source: leadData.source || 'webhook_inbound',
      origem: 'webhook',
      atendido_por_agente: false,
      tags: leadData.tags || [],
      observations: leadData.observations || null,
      custom_fields: (leadData.custom_fields as Record<string, unknown>) || {},
    };

    const { data: newLead, error: leadError } = await supabase
      .from('leads')
      .insert(leadRow)
      .select()
      .single();

    if (leadError) {
      console.error('[crm-webhook] Error creating lead via inbound:', leadError);
      return new Response(
        JSON.stringify({ error: 'Failed to create lead', details: leadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    leadId = newLead.id;
  }

  // 5. Resolve pipeline: config.pipeline_id or equipe.default_pipeline_id
  let pipelineId = config.pipeline_id;
  if (!pipelineId) {
    const { data: equipe } = await supabase
      .from('equipes')
      .select('default_pipeline_id')
      .eq('id', config.equipe_id)
      .maybeSingle();
    pipelineId = equipe?.default_pipeline_id || null;
  }

  let opportunityId: string | null = null;
  if (pipelineId) {
    try {
      const opp = await resolveActiveOpportunity(supabase, {
        equipe_id: config.equipe_id,
        lead_id: leadId,
        createIfMissing: true,
      });
      opportunityId = opp?.opportunity_id ?? null;

      // Build opportunity update — native columns first, then custom_data
      if (opp?.opportunity_id) {
        const oppUpdate: Record<string, unknown> = {};

        // Native opportunity columns (value, etc.)
        if (oppNativeData.value !== undefined) {
          oppUpdate.value = Number(oppNativeData.value);
        }

        // Custom_data merge
        if (Object.keys(oppCustomData).length > 0) {
          const { data: current } = await supabase
            .from('opportunities')
            .select('custom_data')
            .eq('id', opp.opportunity_id)
            .maybeSingle();
          oppUpdate.custom_data = { ...(current?.custom_data || {}), ...oppCustomData };
        }

        if (Object.keys(oppUpdate).length > 0) {
          await supabase.from('opportunities').update(oppUpdate).eq('id', opp.opportunity_id);
        }
      }
    } catch (oppErr) {
      console.error('[crm-webhook] Error creating opportunity for inbound:', oppErr);
    }
  }

  // 6. Log activity
  await supabase.from('lead_activities').insert({
    lead_id: leadId,
    tipo: 'webhook_inbound',
    descricao: isNewLead ? 'Lead criado via inbound webhook' : 'Lead atualizado via inbound webhook',
    metadata: { config_id: config.id, opportunity_id: opportunityId, is_new: isNewLead },
  });

  // 7. Dispatch outbound webhooks (→ n8n)
  await dispatchOutboundWebhooks(
    supabase,
    config.equipe_id,
    leadId,
    opportunityId,
    { ...leadData, ...oppNativeData, custom_data: oppCustomData },
  );

  return new Response(
    JSON.stringify({
      success: true,
      lead_id: leadId,
      opportunity_id: opportunityId,
      is_new: isNewLead,
      message: isNewLead ? 'Lead created via inbound webhook' : 'Lead updated via inbound webhook',
    }),
    { status: isNewLead ? 201 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

- [x] **Step 5: (no-op — not a git repo)**

---

### Task 4: Webhook Config Modal — Inbound Configuration UI

**Files:**
- Modify: `src/components/webhooks/WebhookConfigModal.tsx`

**Interfaces:**
- Consumes: `FieldMapping`, `INBOUND_FUNCTIONS`, `LEAD_FIELD_OPTIONS` from types
- Produces: A modal that saves `inbound_function`, `pipeline_id`, and `field_mappings` to `webhook_configs`

- [x] **Step 1: Read current WebhookConfigModal.tsx to understand existing patterns**

```bash
cat src/components/webhooks/WebhookConfigModal.tsx
```

- [x] **Step 2: Add inbound toggle and conditional fields to the modal form**

The modal needs:
- A "Tipo de Webhook" toggle: "Saída" (default) or "Entrada (Receber Lead)"
- When "Entrada" is selected:
  - Pipeline dropdown (fetch from `/api/pipelines` or existing hook)
  - Field mapping section with dynamic rows

```tsx
// Inside the modal form, after existing fields, add:

// --- Tipo de Webhook toggle ---
<div className="space-y-2">
  <Label>Tipo de Webhook</Label>
  <div className="flex gap-4">
    <label className="flex items-center gap-2">
      <RadioGroupItem value="outbound" />
      <span>Saída (disparar para URL)</span>
    </label>
    <label className="flex items-center gap-2">
      <RadioGroupItem value="inbound" />
      <span>Entrada (Receber Lead)</span>
    </label>
  </div>
</div>

{/* When inbound is selected: Pipeline selector */}
{isInbound && (
  <>
    <div className="space-y-2">
      <Label>Pipeline alvo</Label>
      <Select value={pipelineId} onValueChange={setPipelineId}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione um pipeline" />
        </SelectTrigger>
        <SelectContent>
          {pipelines.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Field mappings */}
    <div className="space-y-2">
      <Label>Mapeamento de campos</Label>
      <p className="text-sm text-muted-foreground">
        Mapeie os campos do payload recebido para campos do CRM
      </p>
      {fieldMappings.map((mapping, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            placeholder="Campo de origem (ex: full_name)"
            value={mapping.source_field}
            onChange={(e) => updateMapping(index, 'source_field', e.target.value)}
            className="flex-1"
          />
          <Select
            value={mapping.target_type}
            onValueChange={(v) => updateMapping(index, 'target_type', v)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Base de Contatos</SelectItem>
              <SelectItem value="lead_custom">Campo Personalizado (Lead)</SelectItem>
              <SelectItem value="opportunity">Valor / Coluna Nativa</SelectItem>
              <SelectItem value="custom_data">Pipeline (custom_data)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Campo destino"
            value={mapping.target_field}
            onChange={(e) => updateMapping(index, 'target_field', e.target.value)}
            className="flex-1"
          />
          <Button variant="ghost" size="icon" onClick={() => removeMapping(index)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addMapping}>
        <Plus className="h-4 w-4 mr-2" />
        Adicionar mapeamento
      </Button>
    </div>
  </>
)}
```

- [x] **Step 3: Use react-hook-form useFieldArray for mapping rows**

Use `useFieldArray` instead of raw `useState` — integrates with the form's validation tree, triggers UI warnings on empty values, avoids sync bugs during rapid edits.

```tsx
// Import:
import { useForm, useFieldArray, Controller } from 'react-hook-form';

// Inside the modal, alongside the existing form:
const { control, watch } = useForm({
  defaultValues: {
    webhookType: 'outbound',
    pipelineId: '',
    fieldMappings: [] as FieldMapping[],
  },
});

const { fields, append, remove, update } = useFieldArray({
  control,
  name: 'fieldMappings',
});

const webhookType = watch('webhookType');
const isInbound = webhookType === 'inbound';

// Handlers:
const addMapping = () => append({ source_field: '', target_field: '', target_type: 'lead' as const });

const updateMapping = (index: number, key: keyof FieldMapping, value: string) => {
  update(index, { ...fields[index], [key]: value });
};
```

Then in the JSX, replace `fieldMappings.map(...)` with `fields.map(...)` and wire inputs via `Controller` or manual `update()` calls:

```tsx
{fields.map((field, index) => (
  <div key={field.id} className="flex items-center gap-2">
    <Input
      placeholder="Campo de origem (ex: full_name)"
      value={field.source_field}
      onChange={(e) => updateMapping(index, 'source_field', e.target.value)}
      className="flex-1"
    />
    <Select
      value={field.target_type}
      onValueChange={(v) => updateMapping(index, 'target_type', v as FieldMappingTargetType)}
    >
      <SelectTrigger className="w-44">
        <SelectValue placeholder="Tipo" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="lead">Base de Contatos</SelectItem>
        <SelectItem value="lead_custom">Campo Personalizado (Lead)</SelectItem>
        <SelectItem value="opportunity">Valor / Coluna Nativa</SelectItem>
        <SelectItem value="custom_data">Pipeline (custom_data)</SelectItem>
      </SelectContent>
    </Select>
    <Input
      placeholder="Campo destino"
      value={field.target_field}
      onChange={(e) => updateMapping(index, 'target_field', e.target.value)}
      className="flex-1"
    />
    <Button variant="ghost" size="icon" onClick={() => remove(index)}>
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
))}
```

- [x] **Step 4: Wire form submission to save inbound fields**

```tsx
// In the save/submit handler, read from react-hook-form values:
const formValues = getValues();
const isInbound = formValues.webhookType === 'inbound';
const saveData = {
  name: form.name,
  url: isInbound ? '' : form.url, // inbound doesn't need a URL
  trigger_event: isInbound ? 'lead_created' : form.trigger_event,
  active: form.active,
  headers: form.headers,
  inbound_function: isInbound ? 'receive_lead' : null,
  pipeline_id: isInbound ? formValues.pipelineId : null,
  field_mappings: isInbound ? formValues.fieldMappings : [],
};
```

- [x] **Step 5: (no-op — not a git repo)**

---

### Task 5: Webhooks Page — Display Inbound Configs with URLs

**Files:**
- Modify: `src/pages/Webhooks.tsx`

**Interfaces:**
- Consumes: `WebhookConfig` with `inbound_function` populated, `pipelines` table
- Produces: Inbound config cards with generated URLs visible in the Inbound tab

- [x] **Step 1: Separate inbound configs from outbound configs**

```tsx
// After loading configs, separate them:
const inboundConfigs = configs.filter((c) => c.inbound_function === 'receive_lead');
const outboundConfigs = configs.filter((c) => !c.inbound_function);
```

- [x] **Step 2: Render inbound configs in the Inbound tab**

After the existing GPT Maker webhook card in the Inbound tab:

```tsx
{/* Custom inbound webhook configs */}
{inboundConfigs.length > 0 && (
  <div className="space-y-4">
    <h3 className="text-lg font-medium">Webhooks de entrada configurados</h3>
    {inboundConfigs.map((config) => {
      // Dynamic URL — no hardcoded domain (survives staging/prod/tenant changes)
      const inboundUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-webhook/inbound/${config.id}`;
      return (
        <Card key={config.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{config.name}</h3>
                  <Badge>Receber Lead</Badge>
                </div>
                <div className="flex gap-2">
                  <Input value={inboundUrl} readOnly className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={() => {
                    navigator.clipboard.writeText(inboundUrl);
                    toast.success("URL copiada!");
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {config.pipeline_id && (
                  <p className="text-sm text-muted-foreground">
                    Pipeline: {pipelines?.find(p => p.id === config.pipeline_id)?.name || 'Pipeline configurado'}
                  </p>
                )}
                {config.field_mappings && config.field_mappings.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    <p>Mapeamentos ({config.field_mappings.length}):</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {config.field_mappings.map((m, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {m.source_field} → {m.target_field}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={config.active}
                  onCheckedChange={() => handleToggleActive(config)}
                />
                <Button variant="ghost" size="icon" onClick={() => handleEditConfig(config)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDeleteConfig(config.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
)}

{/* Empty state for inbound */}
{inboundConfigs.length === 0 && (
  <Card>
    <CardContent className="flex flex-col items-center justify-center py-8">
      <p className="text-muted-foreground">
        Nenhum webhook de entrada configurado. Crie um webhook com tipo "Entrada (Receber Lead)".
      </p>
    </CardContent>
  </Card>
)}
```

- [x] **Step 3: Update outbound tab to use filtered configs**

```tsx
// Change the outbound tab from using 'configs' to 'outboundConfigs'
<TabsContent value="outbound" className="space-y-4">
  {outboundConfigs.length === 0 ? (
    // ... existing empty state ...
  ) : (
    <div className="space-y-4">
      {outboundConfigs.map((config) => (
        // ... existing card ...
      ))}
    </div>
  )}
</TabsContent>
```

- [x] **Step 4: (no-op — not a git repo)**

---

### Task 6: Load Pipelines in WebhookConfigModal

**Files:**
- Modify: `src/components/webhooks/WebhookConfigModal.tsx` (add pipeline fetching)

**Interfaces:**
- Consumes: `useQuery`, `supabase` client
- Produces: Pipeline dropdown populated for inbound configs

- [x] **Step 1: Add pipeline query and pass to modal**

Ensure pipeline fetching is available. The Webhooks page already has access to `useAuth()` which provides `equipe`. Add to `WebhookConfigModal`:

```tsx
// Import useQuery
import { useQuery } from '@tanstack/react-query';

// Inside the modal component:
const { equipe } = useAuth();
const supabase = useSupabaseClient();

const { data: pipelines = [] } = useQuery({
  queryKey: ['pipelines', equipe?.id],
  queryFn: async () => {
    if (!equipe?.id) return [];
    const { data } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('equipe_id', equipe.id)
      .is('deleted_at', null)
      .order('name');
    return data || [];
  },
  enabled: !!equipe?.id && isInbound,
});
```

- [x] **Step 2: (no-op — not a git repo)**

---

### Task 7: Edge-to-Edge Test — Ingest + Dispatch

**Files:**
- Modify: none (manual test)

**Interfaces:**
- Verifies: All tasks 1-6 work together

- [x] **Step 1: Create an inbound webhook config via the UI**

1. Open Webhooks page
2. Click "Novo Webhook"
3. Set name: "Facebook Ads Test"
4. Select type: "Entrada (Receber Lead)"
5. Choose a pipeline
6. Add mappings:
   - `full_name` → name (Base de Contatos)
   - `email_addr` → email (Base de Contatos)
   - `phone_num` → phone (Base de Contatos)
   - `campaign` → campaign (Pipeline)
7. Save

- [x] **Step 2: Copy the generated URL**

The URL should look like:
`https://padduteanashekmereof.supabase.co/functions/v1/crm-webhook/inbound/{config-uuid}`

- [x] **Step 3: Send a test payload**

```bash
# Get the inbound URL from the UI (copy button), then:
curl -X POST "${INBOUND_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Maria Teste",
    "email_addr": "maria@teste.com",
    "phone_num": "11988888888",
    "campaign": "fb_camp_456"
  }'
```

Expected response: `{ "success": true, "lead_id": "...", "opportunity_id": "...", "is_new": true }`

- [x] **Step 4: Verify dedup — same phone sends again (update, not crash)**

```bash
curl -X POST "${INBOUND_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Maria Teste Atualizada",
    "email_addr": "maria.novo@teste.com",
    "phone_num": "11988888888",
    "campaign": "fb_camp_789"
  }'
```

Expected: `{ "success": true, "is_new": false }` — same `lead_id`, no 500 error.

- [x] **Step 5: Verify in database**

```sql
-- Check lead was created/updated (dedup by phone)
SELECT id, name, email, phone FROM leads WHERE phone = '11988888888';

-- Check opportunity was created with native value column
SELECT o.id, o.value, o.custom_data
FROM opportunities o
JOIN leads l ON l.id = o.lead_id
WHERE l.phone = '11988888888';

-- Check webhook logs (outbound dispatch to n8n)
SELECT * FROM webhook_logs WHERE direction = 'outbound' ORDER BY created_at DESC;
```

- [x] **Step 6: Verify outbound dispatch to n8n**

Check n8n received both webhooks:
```json
{
  "event": "lead_created",
  "lead_id": "...",
  "data": {
    "name": "Maria Teste",
    "email": "maria@teste.com",
    "phone": "11988888888",
    "custom_data": { "campaign": "fb_camp_456" }
  }
}
```

- [x] **Step 7: Verify URL sanitization — append ?fbclid=xxx**

```bash
curl -X POST "${INBOUND_URL}?fbclid=abc123" \
  -H "Content-Type: application/json" \
  -d '{"full_name": "URL Sanitize Test", "phone_num": "11977777777"}'
```

Expected: 201/200 (not 404) — query params stripped before lookup.

- [x] **Step 8: (no-op — not a git repo)**
