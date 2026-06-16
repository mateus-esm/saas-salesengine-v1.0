# Inbound Webhook Lead Ingest — Design Spec

> **Status:** Design spec · **Date:** 2026-06-16
> **Context:** Trade-off sprint — fast inbound lead ingestion from ad platforms
> (Facebook, Google, LinkedIn, etc.) with configurable field mapping and
> outbound relay to n8n.

---

## 1. Problem

Ad platforms (Facebook Lead Ads, Google Ads, LinkedIn, etc.) send lead payloads
with varying field structures. The CRM needs a **configurable inbound webhook**
that:

1. Receives payloads from any external source
2. Maps incoming fields to CRM columns (leads + opportunities)
3. Creates the lead and opportunity atomically
4. Relays the event to n8n (or other external systems) for downstream automation

The existing `crm-webhook` Edge Function handles basic lead creation but has
hardcoded field mapping, no outbound dispatch mechanism, and no per-config
URLs.

---

## 2. Solution Overview

```
[Ad Platform / External App]
        │
        ▼ POST /functions/v1/crm-webhook/inbound/{config_id}
┌─────────────────────────────────────────────┐
│          crm-webhook Edge Function           │
│                                             │
│  1. Look up webhook_config by {config_id}   │
│  2. Apply field_mappings to payload         │
│  3. Resolve pipeline (config or default)    │
│  4. Create lead + opportunity               │
│  5. Dispatch outbound webhooks (→ n8n)      │
│  6. Log to webhook_logs                     │
└─────────────────────────────────────────────┘
        │
        ▼
┌──────────────┐    ┌──────────────────┐    ┌───────────────┐
│ public.leads │    │ public.webhook_   │    │ n8n workflow  │
│ (Base de     │    │ logs (auditoria)  │    │ (outbound)    │
│  Contatos)   │    └──────────────────┘    └───────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ public.      │
│ opportunities│
│ (Pipeline)   │
└──────────────┘
```

---

## 3. Schema Changes

### webhook_configs — new columns

```sql
ALTER TABLE public.webhook_configs
  ADD COLUMN inbound_function text
    CHECK (inbound_function IS NULL OR inbound_function = 'receive_lead'),
  ADD COLUMN pipeline_id uuid REFERENCES public.pipelines(id)
    ON DELETE SET NULL,
  ADD COLUMN field_mappings jsonb NOT NULL DEFAULT '[]'::jsonb;
```

**`field_mappings` format:**

```json
[
  {
    "source_field": "full_name",
    "target_field": "name",
    "target_type": "lead"
  },
  {
    "source_field": "campaign_id",
    "target_field": "campaign",
    "target_type": "custom_data"
  }
]
```

- `target_type: "lead"` → field on `public.leads` (e.g., name, email, phone, observations, tags, source)
- `target_type: "custom_data"` → field inside `opportunities.custom_data` JSONB
- `target_type: "lead_custom"` → field inside `leads.custom_fields` JSONB

---

## 4. New Route: POST /functions/v1/crm-webhook/inbound/{config_id}

### Authentication

No additional auth beyond the URL itself being non-guessable (UUID `config_id`).
The config is scoped to an equipe internally.

### Request Flow

```
  1. Extract config_id from URL path
  2. Look up webhook_config by id
     - 404 if not found
     - 400 if inbound_function != 'receive_lead'
  3. Load field_mappings from config
  4. Transform raw payload using mappings:
     - For each mapping: payload[source_field] → lead[target_field]
     - If target_type = 'custom_data': merge into custom_data object
  5. Resolve target pipeline:
     - config.pipeline_id if set, else equipe.default_pipeline_id
     - If neither: 400 "No pipeline configured"
  6. Create lead (using identity fields from #4)
  7. Create/resolve opportunity in target pipeline with custom_data from #4
  8. Dispatch outbound: query webhook_configs WHERE
       trigger_event = 'lead_created' AND active = true
     - HTTP POST each URL with lead + opportunity data
     - Log results to webhook_logs
  9. Return { success, lead_id, opportunity_id }
```

### Outbound Payload (sent to n8n)

```json
{
  "event": "lead_created",
  "lead_id": "uuid",
  "opportunity_id": "uuid",
  "equipe_id": "uuid",
  "data": {
    "name": "João Silva",
    "email": "joao@email.com",
    "phone": "11999999999",
    "custom_data": { "campaign": "fb_camp_123" }
  },
  "created_at": "2026-06-16T12:00:00Z"
}
```

---

## 5. UI Changes

### WebhookConfigModal.tsx

New section when creating/editing a webhook config:

| Field | Type | Notes |
|-------|------|-------|
| **Tipo** | Toggle | "Saída" (default) / **"Entrada (Receber Lead)"** |
| **Pipeline alvo** | Dropdown | Only shown when Tipo = Entrada. Lists equipe's pipelines |
| **Mapeamento de campos** | Dynamic rows | Only shown when Tipo = Entrada |

Each mapping row:

```
[ Campo de origem (texto) ] → [ Campo destino (dropdown/custom) ]
```

Destino dropdown: `name`, `email`, `phone`, `source`, `tags`, `observations`,
ou digitar `custom_fields.xxx` ou `opportunity.xxx`.

### Webhooks.tsx — Inbound Tab

After save, the inbound tab shows:

```
┌───────────────────────────────────────────┐
│ Webhook: Facebook Ads - Cliente ABC       │
│ URL: https://.../crm-webhook/inbound/...  │
│ Pipeline: Funil Comercial                 │
│ [Copiar URL]                              │
└───────────────────────────────────────────┘
```

Each configured inbound webhook appears as a card with its unique URL.

---

## 6. Outbound Dispatch (the gap being closed)

### Current state

`webhook_configs` and `webhook_logs` tables exist. UI reads/writes them. But no
code ever queries active configs and fires HTTP requests.

### Implementation

Inside `crm-webhook/index.ts`, after lead creation:

```typescript
async function dispatchOutboundWebhooks(
  supabase: SupabaseClient,
  equipeId: string,
  event: string,
  payload: object
) {
  const { data: configs } = await supabase
    .from('webhook_configs')
    .select('*')
    .eq('equipe_id', equipeId)
    .eq('trigger_event', event)
    .eq('active', true);

  for (const config of configs || []) {
    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...config.headers },
        body: JSON.stringify({ event, ...payload }),
      });
      await supabase.from('webhook_logs').insert({
        equipe_id: equipeId,
        webhook_config_id: config.id,
        direction: 'outbound',
        event_type: event,
        payload,
        response_status: res.status,
        response_body: await res.text(),
      });
    } catch (err) {
      await supabase.from('webhook_logs').insert({
        equipe_id: equipeId,
        webhook_config_id: config.id,
        direction: 'outbound',
        event_type: event,
        payload,
        error_message: err.message,
      });
    }
  }
}
```

This is called after lead + opportunity creation succeeds.

---

## 7. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260616000001_inbound_webhook_config.sql` | New migration: ADD COLUMNS to webhook_configs |
| `supabase/functions/crm-webhook/index.ts` | Add `/inbound/{config_id}` route + field mapping + outbound dispatch |
| `src/types/webhook.ts` | Add `InboundWebhookConfig` type, `field_mappings` to `WebhookConfig` |
| `src/components/webhooks/WebhookConfigModal.tsx` | Add inbound toggle, pipeline selector, field mapping rows |
| `src/pages/Webhooks.tsx` | Show inbound configs with URLs in Inbound tab |

---

## 8. Success Criteria

- A webhook config with `inbound_function = 'receive_lead'` generates a unique URL
- POSTing a payload to that URL creates lead + opportunity with correctly mapped fields
- The opportunity lands in the configured pipeline (or default if not set)
- An active `webhook_config` with `trigger_event = 'lead_created'` receives the lead data (n8n)
- All outbound dispatches are logged in `webhook_logs` with success/error status
- Backwards compatible: existing `crm-webhook` usage (create/update by secret) continues to work

---

## 9. Out of Scope

- Webhook retry logic (n8n handles downstream retries)
- Authentication per config (URL secrecy is the auth — UUID-based)
- Per-stage webhook triggers (stage_entered, idle_breach — those are Sprint 5.3 foundation, implemented separately)
- Rate limiting (Supabase Edge Function handles this at platform level)
