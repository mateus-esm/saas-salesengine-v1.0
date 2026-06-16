# Inbound Conversational-Agent Contract (Sprint 6.2 on-ramp)

> **Status: foundation only.** No conversational agent ships in Sprint 6.1. This
> document fixes the I/O contract so 6.2 can bring the customer-facing agent
> in-house without re-litigating shapes. It pairs with the RAG foundation
> (`copilot_knowledge` + `app/knowledge.py`) and the existing inbound seam
> (`app/routers/ingest.py`, today gated by `settings.ingest_enabled = False`).

---

## 1. Why this exists

Today the customer-facing conversation lives in an external provider
(GPT-Maker). Sprint 6.1 builds the internal Sales OS (multi-action Workflow,
credit ledger, Lead Memory, telemetry). Sprint 6.2 will move the *conversation*
in-house: an Agno agent that reads inbound messages, answers the customer, and
feeds the same Workflow that the ⚡ Sync button already drives.

This contract is the boundary between **message transport** (webhooks/channels)
and **cognition** (the Workflow).

---

## 2. Inbound envelope

The channel adapter (WhatsApp/Instagram/webchat) normalizes every inbound
message to this envelope before it reaches cognition:

```jsonc
{
  "channel": "whatsapp",              // whatsapp | instagram | webchat | ...
  "tenant_ref": {                     // how we resolve equipe_id (see §4)
    "kind": "channel_account",        // channel_account | api_key | subdomain
    "value": "5511999998888"          // the WhatsApp business number, etc.
  },
  "contact": {
    "external_id": "5511911112222",   // the customer's channel identity
    "display_name": "Maria Solar",
    "lead_id": null                   // filled after lead resolution (§5)
  },
  "message": {
    "id": "wamid.ABC123",             // provider message id (idempotency key)
    "text": "quanto custa um sistema de 12 kWp?",
    "media": [],                      // [{type,url,mime}] — optional
    "ts": "2026-06-16T05:42:00Z"
  },
  "conversation_ref": "conv_abc"      // stable per customer thread (→ session_id)
}
```

`message.id` is the **idempotency key**: the same provider id MUST NOT be
processed twice (mirror the `idempotency_key` discipline in `charge_credits`).

---

## 3. Outbound reply shape

Cognition returns zero or more outbound actions. The transport adapter renders
them back to the channel:

```jsonc
{
  "replies": [
    { "type": "text", "text": "Um sistema de 12 kWp custa a partir de R$ ..." }
  ],
  "workflow": {                       // optional — the CRM side-effects that ran
    "status": "executed",             // mirrors run_workflow() return
    "applied_count": 1,
    "pending": 0,
    "run_id": "..."
  }
}
```

A turn MAY produce only `replies` (pure answer), only `workflow` (silent CRM
update), or both. An empty `replies` array is valid (the agent chose not to
respond).

---

## 4. Deriving `equipe_id` (security boundary — non-negotiable)

`equipe_id` is **never** taken from the model or the message body. It is resolved
server-side from `tenant_ref`:

- `channel_account` → look up the registered channel account → its `equipe_id`.
- `api_key` → the webhook's pre-shared key maps to one tenant.
- `subdomain` → host header maps to a tenant (webchat).

The resolved `equipe_id` becomes a `TenantContext(equipe_id=..., role="service")`
exactly as `routers/ingest.py` builds it today. Every downstream query carries
`WHERE equipe_id = <resolved>`. This is the same guard layer the Workflow already
enforces — the conversational agent adds **no** new trust in client input.

---

## 5. Lead / contact resolution

1. Resolve `contact.external_id` (+ channel) to an existing `leads` row for the
   tenant; create one if absent (reuse the atomic identity-router path).
2. Set `contact.lead_id`.
3. `session_id = conversation_ref` — this keys both Agno session memory
   (`agno_store`) and the per-contact **Lead Memory** (`enable_agentic_memory`,
   `user_id = lead_id`) already wired in `cascade/enricher.py`.

---

## 6. Where it plugs into the Workflow

`agno_workflow.run_workflow(...)` gains a new `trigger="conversation"` alongside
the existing `sync` (manual ⚡) and `ingest`/background triggers:

| trigger        | source                     | mode    | auto-apply |
| :------------- | :------------------------- | :------ | :--------- |
| `sync`         | ⚡ button (single/sweep)    | manual  | yes        |
| `ingest`       | background queue poll      | auto    | gated by toggle |
| `conversation` | inbound message (6.2)      | auto    | gated by toggle + reply path |

The `conversation` trigger:
1. Runs the same Tower → Enricher → Floor → executor pipeline (CRM side effects,
   metered to the credit ledger like any other action).
2. Additionally produces `replies` via a responder step that may consult
   `app/knowledge.py` (RAG over `copilot_knowledge`) for tenant-specific answers.
3. Emits the same `copilot_run_events` so the Telemetry HUD shows conversation
   turns too.

---

## 7. Sequencing & idempotency

- Inbound messages for one `conversation_ref` are processed **in order**
  (reuse the sequential-queue discipline the sweep already uses).
- Replays (same `message.id`) are no-ops.
- Credit charges remain idempotent via `charge_credits(idempotency_key=...)`.

---

## 8. Explicitly out of scope for 6.1

- The responder agent, prompt, and channel adapters (6.2).
- Outbound delivery / provider SDKs.
- Knowledge ingestion pipeline beyond the `app/knowledge.py` factory stub.

This file is the contract those 6.2 pieces must satisfy.
