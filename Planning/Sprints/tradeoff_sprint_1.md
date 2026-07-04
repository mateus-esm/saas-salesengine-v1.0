## Sprint 6.2 Strategy: Pure Relational Ingest & Webhook Relay

This strategy focuses on execution speed and simplicity. By stripping out the
agent layer for this specific task, we turn the system into a high-performance
database router. It will swallow raw ad payloads, directly populate your CRM
tables via Supabase, and immediately dispatch a standardized outbound payload to
your **n8n workflow** using your existing webhooks system [cite:
uploaded:mateus-esm/saas-salesengine-v1.0/saas-salesengine-v1.0-29a84d1c2d6a1c9e0b5de14d056965fc1bd1a89a/src/pages/Webhooks.tsx,
uploaded:mateus-esm/saas-salesengine-v1.0/saas-salesengine-v1.0-29a84d1c2d6a1c9e0b5de14d056965fc1bd1a89a/supabase/migrations/20260605000002_sprint5_3_stage_webhooks.sql].

---

## 🏎️ The Direct Ingest Architecture (No Agents, Pure Speed)

```text
[Incoming Ad Webhook] ➔ [Supabase Edge Function]
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼ (Write 1)                                     ▼ (Write 2)
┌──────────────────────────┐                    ┌──────────────────────────┐
│ public.leads             │                    │ public.opportunities     │
│ (Base de Contatos)       │                    │ (Pipeline Card)          │
└──────────────────────────┘                    └──────────────────────────┘
                                                        │
                                                        ▼ (Trigger)
                                                ┌──────────────────────────┐
                                                │ Outbound Webhook Relay   │ ➔ [Dispatches to n8n]
                                                │ (Existing Config Module) │
                                                └──────────────────────────┘
```

---

## 🛠️ How to Execute It in 2 Steps

### Step 1: The Inbound Intake & Dual-Table Creation (Supabase Edge Function)

Instead of dynamic semantic parsing, we create a lightweight Supabase Edge
Function (e.g., `supabase/functions/ads-ingest/index.ts`) or an API route
focused on common ad form parameters (Name, Email, Phone, Campaign ID).

When the ad network fires the payload to your inbound URL, the backend code
executes two rapid relational database operations:

1. **The Contact Insertion (_Base de Contatos_):** It maps the incoming payload
   keys straight into your global leads/contacts table. It uses a conflict
   resolution clause (`ON CONFLICT (phone) DO UPDATE`) to prevent duplicate
   contact creation.
2. **The Card Creation (_Pipeline Workspace_):** It immediately uses the
   returned `lead_id` to generate a new row inside the opportunities table. This
   card lands directly in the initial stage of the target pipeline,
   automatically initiating the SLA tracking system.

---

### Step 2: The Outbound Relay to n8n (Leveraging Existing Webhooks)

You do not need to construct a new webhook dispatching engine. Your architecture
already features a robust webhook infrastructure (`public.webhook_configs` and
stage webhooks) [cite:
uploaded:mateus-esm/saas-salesengine-v1.0/saas-salesengine-v1.0-29a84d1c2d6a1c9e0b5de14d056965fc1bd1a89a/src/pages/Webhooks.tsx,
uploaded:mateus-esm/saas-salesengine-v1.0/saas-salesengine-v1.0-29a84d1c2d6a1c9e0b5de14d056965fc1bd1a89a/supabase/migrations/20260605000002_sprint5_3_stage_webhooks.sql].

Here is how you link the ingest directly to your n8n workflow:

1. **Get the n8n Workflow URL:** Create a Webhook trigger node inside **n8n**
   and copy its unique production URL.
2. **Register it in the Webhook Section:** Open your CRM webhooks management
   page (`src/pages/Webhooks.tsx`).
3. **Configure the Event Trigger:** Click **Add Webhook**, paste the n8n URL,
   and bind it to the entry stage of your ads pipeline.

### 🔄 The Execution Loop

When a new lead lands from an ad, Step 1 creates the contact row and inserts the
card into the pipeline [cite:
uploaded:mateus-esm/saas-salesengine-v1.0/saas-salesengine-v1.0-29a84d1c2d6a1c9e0b5de14d056965fc1bd1a89a/supabase/migrations/20260419100000_epic1_global_leads.sql,
uploaded:mateus-esm/saas-salesengine-v1.0/saas-salesengine-v1.0-29a84d1c2d6a1c9e0b5de14d056965fc1bd1a89a/supabase/migrations/20260419110000_epic2_pipelines.sql].
Because your database automatically monitors insertions at that specific stage,
Supabase's native trigger instantly fires, fetches the active n8n webhook
configuration, and relays the clean data payload directly to your automation
workflow.

---

## 🎯 The Tactical Advantages of this Sprint

- **Zero Cognitive Overhead:** No agent prompts are executed, and no credit
  meters are consumed during this pass-through step.
- **Complete Decoupling:** Your core application remains lightweight and fast.
  Any complex enrichment rules, email triggers, or custom notifications can be
  designed inside n8n without modifying a single line of your core Python
  codebase.

Should I map out the database payload parameters for your team to implement the
inbound intake endpoint?

---

## ✅ Handoff: Inbound Webhook Lead Ingest

> **Status:** Implementation complete · **Date:** 2026-06-16
> **Plan:** `docs/superpowers/plans/2026-06-16-inbound-webhook-lead-ingest.md`
> **Spec:** `docs/superpowers/specs/2026-06-16-inbound-webhook-lead-ingest-design.md`

### What was built

A configurable inbound lead ingestion endpoint with field mapping, pipeline targeting, and outbound relay to n8n. Extends the existing `crm-webhook` Edge Function with a new `/inbound/{config_id}` route and adds the corresponding UI in the Webhooks page.

### Files changed (6 files)

| Layer | File | What changed |
|-------|------|-------------|
| **Migration** | `supabase/migrations/20260616000001_inbound_webhook_config.sql` | Adds `inbound_function`, `pipeline_id`, `field_mappings` columns to `webhook_configs` |
| **Types** | `src/types/webhook.ts` | Added `FieldMapping`, `FieldMappingTargetType`, `INBOUND_FUNCTIONS`, `LEAD_FIELD_OPTIONS`, `PIPELINE_FIELD_OPTIONS`. Extended `WebhookConfig` with `inbound_function?`, `pipeline_id?`, `field_mappings?` |
| **Hook** | `src/hooks/useWebhookConfigs.ts` | Extended `CreateWebhookData`/`UpdateWebhookData` with `inbound_function`, `pipeline_id`, `field_mappings`. Wires them through to `insert()`/`update()` |
| **Edge Function** | `supabase/functions/crm-webhook/index.ts` | Added `applyFieldMappings()`, `dispatchOutboundWebhooks()`, and full inbound route handler |
| **Modal** | `src/components/webhooks/WebhookConfigModal.tsx` | Added inbound/outbound RadioGroup toggle, pipeline dropdown (fetched via `useQuery`), dynamic field mapping rows with add/remove |
| **Page** | `src/pages/Webhooks.tsx` | Separates inbound/outbound configs. Inbound tab shows per-config cards with copyable `{supabaseUrl}/functions/v1/crm-webhook/inbound/{config_id}` URLs, pipeline name, and field mapping badges |

### Architecture

```
[Ad Platform] → POST /functions/v1/crm-webhook/inbound/{config_id}
                    │
                    ▼
              ┌─────────────────────────────┐
              │   crm-webhook Edge Function  │
              │                              │
              │  1. Lookup webhook_config    │
              │  2. Apply field_mappings     │
              │  3. Dedup by phone           │
              │  4. Create/update lead       │
              │  5. Resolve pipeline         │
              │  6. Create/update opp        │
              │  7. Log lead_activity        │
              │  8. Dispatch outbound → n8n  │
              └─────────────────────────────┘
```

### Inbound route flow (detailed)

1. **Guard:** `pathParts.includes('inbound')` — runs BEFORE webhook secret auth
2. **Lookup:** Fetches `webhook_configs` by `{config_id}` WHERE `inbound_function = 'receive_lead'`
3. **Map:** `applyFieldMappings()` splits payload into three buckets: `leadData`, `oppNativeData`, `oppCustomData`
4. **Dedup:** Strips non-digits from phone, checks existing lead by `equipe_id + phone`. Found → updates email/observations/tags/custom_fields. Not found → inserts new
5. **Pipeline:** Uses `config.pipeline_id` → falls back to `equipe.default_pipeline_id`
6. **Opportunity:** Calls `resolveActiveOpportunity()` with `createIfMissing: true`. Writes `oppNativeData.value` and `oppCustomData` to the opportunity's `custom_data`
7. **Activity:** Logs `lead_activities` row with `tipo: 'webhook_inbound'`
8. **Outbound:** `dispatchOutboundWebhooks()` fires to all active `trigger_event = 'lead_created'` webhooks for that equipe. Logs each dispatch to `webhook_logs`

### Verification results

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ Pass (0 errors) |
| Deno check (`deno check`) | ✅ Pass (0 errors) |
| Backward compatibility | ✅ Outbound secret-based flow untouched |
| Imports/component resolution | ✅ All paths valid |
| Migration safety | ✅ `IF NOT EXISTS` + `ON DELETE SET NULL` + JSONB default |

### How to deploy

```bash
# 1. Apply the migration
supabase migration up

# 2. Deploy the Edge Function
supabase functions deploy crm-webhook

# 3. Create an inbound config via UI:
#    Webhooks → Entrada → "Novo Webhook" → toggle "Entrada"
#    → set pipeline + field mappings → copy generated URL

# 4. Configure the URL in your ad platform (Facebook, Google, LinkedIn etc.)
#    POST to: https://padduteanashekmereof.supabase.co/functions/v1/crm-webhook/inbound/{config_id}
```

### Field mapping target types

| Target Type | Where it lands |
|-------------|---------------|
| `lead` | Top-level `public.leads` column (name, email, phone, source, tags, observations) |
| `lead_custom` | `leads.custom_fields` JSONB (merged with existing on dedup) |
| `opportunity` | `opportunities.value` (numeric) |
| `custom_data` | `opportunities.custom_data` JSONB (merged with existing) |

### Known edges / caveats

- **Dedup by phone only.** If the same person arrives with different/no phone, a duplicate is created.
- **Field mapping `name` is required.** 400 error if no field maps to `name`.
- **Outbound dispatch is fire-and-forget.** Errors are logged to `webhook_logs` but not retried.
- **Body gets parsed upfront.** Moved `await req.json()` before auth checks. Invalid JSON now fails faster, before auth verification.
