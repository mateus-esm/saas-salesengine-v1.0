# Sprint 7 - T12 Hardening + E2E Results

Date: 2026-07-06
Owner: Codex PM continuation
Status: code hardening gate passed; live-provider E2E still requires human actions.

## Summary

T12 recovered the failed final review by splitting review into backend, frontend, and deploy/docs gates. Critical and Important findings were fixed, then verified locally.

## Code Hardening Fixes

- Secured `send-chat-message`: requires caller JWT, resolves caller equipe, verifies lead/conversation ownership before any service-role writes or provider sends.
- Fixed Solo outbound routing: solo-native conversations use their pinned `solo_instance_id`; fallback/outbound routes use any connected instance only when no pinned instance exists.
- Added `{ delivered:false, reason }` responses for non-delivery branches so the inbox can warn instead of showing a silent success.
- Removed sensitive outbound payload/provider-body logging from `send-chat-message`.
- Added cross-provider inbound media dedup in `solo-wpp-webhook` for the coexistence duplicate case without collapsing separate Solo media album items.
- Hardened `solo-health-check`: rejects public requests; accepts service-role bearer or cron secret before polling providers or reconciling billing.
- Ensured `manage-solo-instances` and `solo-health-check` set `billing_active=true` and preserve/set `connected_at` on every `open`/connected sync path.
- Allowed `super_admin` users to run `sync-instance-billing` for arbitrary tenants while normal users remain limited to their own equipe.
- Completed frontend fixes for all seven channel types, QR polling/expiry, connected-without-QR responses, backend monthly price reads, in-app empty state, Chat Solo state refresh, Admin AI Engine label, and Admin billing refetch.
- Completed AC9 UI preservation for intention `fields`, `headers`, `params`, and `variables`.
- Added missing deploy workflow lines for `manage-agent-channels` and `manage-agent-intentions`.
- Rewrote the health cron migration instructions so activation is an operator-only SQL run and no service-role key is committed to git.
- Updated lint configuration for ESLint 9 and the current non-strict TypeScript posture.

## Verification

| Gate | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed, exit 0 |
| `npm.cmd run lint` | Passed, exit 0; warnings only from pre-existing hook/fast-refresh/unused-disable debt |
| `npm.cmd run build` | Passed, exit 0; Vite chunk-size and browserslist age warnings only |
| `deno check supabase/functions/send-chat-message/index.ts supabase/functions/manage-solo-instances/index.ts supabase/functions/solo-health-check/index.ts supabase/functions/sync-instance-billing/index.ts supabase/functions/manage-agent-intentions/index.ts supabase/functions/manage-agent-channels/index.ts` | Passed, exit 0 after escalation for Deno cache access |

## Acceptance Criteria Status

| AC | Status | Evidence / blocker |
| --- | --- | --- |
| AC1 - Solo instance end-to-end | Pending live E2E | Code/UI hardened. Needs real QR scan on a test number to confirm QR appears, scan succeeds, status flips to connected, and phone appears. |
| AC2 - Inbound Solo | Pending live E2E | Webhook code type-checks. Needs real `messages.upsert` from a scanned Solo number and row verification in leads/conversations/messages. |
| AC3 - Outbound routing | Pending live E2E | Routing code hardened. Needs real solo-native send, outbound lead-without-chat send, and GPT Maker window-closed fallback send. |
| AC4 - No duplicates | Pending live E2E | Dedup code exists. Needs coexistence test with same number on Solo plus AI Engine and inbox row verification. |
| AC5 - AI Engine channels | Code gate passed | Backend deploy line fixed; all seven channel types are available in UI; WhatsApp QR polling added. Prior T3/T9 evidence covered real channel create/QR/remove. |
| AC6 - Billing | Pending live billing E2E | Reconciler and Admin sync hardened. Needs real/sandbox Asaas value verification after connect/delete. |
| AC7 - Health | Pending operator activation/live E2E | Health function hardened. pg_cron remains intentionally inactive until operator enables it with one-off SQL after deploy. |
| AC8 - Inbox | Code gate passed | Channel chips, Solo smart-window indicator, and stale-state refresh are implemented and type/build verified. |
| AC9 - Intentions | Code gate passed | CRUD UI now preserves fields/headers/params/variables; edge mapper passes these arrays. Prior T4 evidence covered real API CRUD. |
| AC10 - Zero regression | Code gate passed | Build, typecheck, lint, and Deno checks passed. Live GPT Maker-only regression still should be smoke-tested after deploy. |

## Human Required Before Full Sprint Close

- Scan a real Solo QR on a test number and capture `connection.update` plus `messages.upsert` payloads.
- Send a real Solo `sendText` and confirm `key.id` in response/inbox dedup behavior.
- Capture the exact GPT Maker window-closed error body and refine the fallback matcher if needed.
- Run coexistence duplicate test with the same number connected through Solo and AI Engine.
- Verify Asaas subscription value increases/decreases in sandbox or production-safe tenant.
- Activate the health pg_cron with a one-off operator SQL run after functions are deployed.
- Push local `main` to origin when approved; this triggers production function deploy.

## Verdict

The code side of T12 is ready for deploy review. Full Sprint 7 E2E remains blocked on the live phone/provider/operator steps above.
