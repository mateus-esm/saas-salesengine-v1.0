# Sprint 7.3 — Studio AI: Provider Parity

> Design spec. Source: `Planning/Sprints/sprint_7.3_fixes.md` (founder's four points).
> Live API ground truth captured 2026-08-14 against `https://api.gptmaker.ai/v2`
> on the Solo Energia agent. Where this doc and the provider's published docs
> disagree, **this doc wins** — the published docs are demonstrably stale.

## Problem

Four founder-reported gaps between Studio AI and the upstream provider:

1. Model catalog does not match the provider's model list.
2. Knowledge Base "Perfil do agente" and "Contexto da empresa" do not sync.
3. Canais does not show the real channels.
4. Config lacks parity with the provider's settings screen.

Points 2 and 3 are **regressions with identified root causes**, not missing
features. Point 4 is mostly a build. Point 1 cannot be automated.

---

## Ground truth established 2026-08-14

Probed live with a real token. Recorded so the next session need not re-probe.

| Resource | Path | Status |
|---|---|---|
| Agent settings | `GET/PUT /agent/{id}/settings` | 200 — 13 keys |
| Agent webhooks | `GET/PUT /agent/{id}/webhooks` | 200 — 8 event keys |
| Idle actions | `/agent/{id}/idle-actions` | 200 — full CRUD documented |
| Transfer rules | `/agent/{id}/transfer-rules` | 200 — full CRUD documented |
| Channels | `GET /workspace/{ws}/channels?agentId=` | 200 — `agentId` filter **is** enforced |
| Workspace team | `GET /workspace/{ws}/team` | 200 — human transfer targets |
| Model list | `/models`, `/workspace/{ws}/models`, `/agent/{id}/models` | **all 404** |
| Working hours | 8 path variants probed | **all 404** |
| Content moderation | 4 path variants probed | **all 404** |

The provider's endpoint index (`developer.gptmaker.ai/llms.txt`) confirms no
model-list and no working-hours/moderation route exists. Its "Moderation"
section is human-takeover (`/chats/start-human`), not content moderation.

Live shapes:

```jsonc
// GET /agent/{id}/webhooks — 8 keys, all string URLs ("" when unset)
{ "onNewMessage": "...", "onFirstInteraction": "...", "onCreateEvent": "...",
  "onFinishInteraction": "", "onCancelEvent": "", "onStartInteraction": "",
  "onTransfer": "", "onLackKnowLedge": "" }

// GET /agent/{id}/transfer-rules — array
[{ "id": "...", "createdAt": 1747750445270, "instructions": "...",
   "returnOnFinish": false, "notInformWhenTransfer": false,
   "type": "HUMAN", "agentId": null, "userId": "..." }]

// GET /agent/{id}/idle-actions — object with actions[] + finishAction
{ "id": "...", "actions": [],
  "finishAction": { "seconds": 600, "sequence": 0, "type": "FINISH_INTERACTION",
    "instructions": null, "workingHours": null, "allowAllHours": true,
    "targetBoardId": null, "targetStageId": null, "targetDealId": null,
    "targetStatus": null, "templateId": null, "templateVariables": null,
    "templateHeaderMediaUrl": null } }
```

**`onLackKnowLedge` lives on the webhooks resource, not on settings.** This
resolves the Sprint 7.2 open question ("documented but absent from the live
`/settings` GET") — it was never a settings key.

---

## W1 · Canais — root-cause fix

### Root cause

`ChannelsPage.tsx:60` calls `supabase.functions.invoke("manage-agent-channels")`
with no options. supabase-js sends **POST** by default
(`@supabase/functions-js/dist/main/FunctionsClient.js:115` — `method: method || 'POST'`),
with `body: undefined`.

`manage-agent-channels/index.ts:80` branches on `req.method === 'POST'` **before**
resolving an action, then runs `await req.json()` on an empty body. That throws,
the outer catch returns 500, and the GET listing branch at line 188 is
**unreachable from the app**.

Every sibling function (`manage-agent-settings`, `manage-agent-training`,
`manage-agent-intentions`) resolves `action` with a default *before* touching the
body, which is why only this one breaks. The bug is isolated — verified by
sweeping all edge functions for the pattern.

### Fix

- Route on **action**, never on HTTP method. Body parse becomes
  `await req.json().catch(() => ({}))`.
- Extract an exported pure `resolveAction(req, body): string` returning `'list'`
  when nothing is specified. Follows the existing precedent of the exported
  `upstreamFor` in `manage-agent-settings`.
- `ChannelsPage` passes `method: 'GET'` explicitly on the list call so the
  intent is legible at the call site, not just tolerated by the server.
- Widen the normalised channel shape to carry `username` (phone / @handle) and
  `departmentName`. The provider returns them and the UI currently drops them;
  GPT Maker displays them.

### Testing

Unit-test `resolveAction` directly against the four inputs that matter:
body-less POST, POST with `{action:'create'}`, GET, and `?action=` query form.
The body-less-POST case is the regression test — it is the exact failure.

---

## W2 · Knowledge Base sync

### Root cause

`PerfilFolder` (`KnowledgePage.tsx:45`) and `EmpresaFolder` (`:160`) are
**write-only**. Both initialise state to `""` and never issue a GET. The edge
function already returns `agent.behavior` and `agent.description` correctly
(the latter mapped from upstream `jobDescription`) — the UI never asks.

The correct fetch logic exists in `BehaviorSettings.tsx:19` and
`AIKnowledgeBase.tsx:38`, both of which are **dead code** (no importers). The
AI Studio v2 rewrite reimplemented these panels and dropped the fetch.

### Fix

- Both folders fetch on mount from `manage-agent-settings`, render a loading
  state, and re-fetch after save so the UI shows what upstream actually holds.
- **Default to "Texto Livre" mode when a behavior already exists.** The wizard
  builds a prompt from structured answers and cannot reverse-parse a free-form
  one; opening in wizard mode would show empty fields on top of real content and
  invite the user to overwrite it with a blank prompt.
- **Remove the 3000-char `.slice()` from the load path.** Solon's live
  `behavior` is a long prompt. Loading it into a capped textarea and saving
  would silently truncate the founder's production prompt. The cap governs
  typing only, never loaded content.
- Delete `BehaviorSettings.tsx` and `AIKnowledgeBase.tsx` once the fix lands —
  keeping two divergent implementations is what produced this regression.

---

## W3 · Config parity

### Scope decision (founder, 2026-08-14)

- **Horário de atendimento** and **Moderação de conteúdo**: deferred. No
  provider API exists. The existing honest note in the UI stays.
- **Idle actions, transfer rules, webhooks**: build all three, full CRUD.

### New edge functions

Three functions, each following the established shape in this repo: JWT auth →
`profiles.equipe_id` → `equipes` lookup → `.trim()` every id → bearer call →
`upstreamError` surfacing the provider body verbatim.

| Function | Upstream | Verbs |
|---|---|---|
| `manage-agent-webhooks` | `/agent/{id}/webhooks` | GET, PUT |
| `manage-agent-idle-actions` | `/agent/{id}/idle-actions` | GET, POST, PUT, DELETE |
| `manage-agent-transfer-rules` | `/agent/{id}/transfer-rules` | GET, POST, PUT, DELETE |

All three route on **action with a default**, per W1. This is the convention.

**Webhooks always PUT the complete 8-key object** (founder decision). Partial
PUT merge-vs-replace semantics are therefore untested and irrelevant. This also
fixes a latent bug: `manage-agent-channels/index.ts:68`'s `ensureAgentWebhook`
currently PUTs `{onNewMessage}` alone — under replace semantics that would wipe
the tenant's other 7 events. It becomes read → merge → PUT all 8.

### UI

`SettingsPage.tsx` (287 lines) splits into `src/pages/ai-studio/settings/`, one
component per tab, mirroring the provider's own tabs:

- **Conversa** — the existing settings grid, plus the missing
  `resumeTransferHumanAI` switch ("Resumo ao transferir para humano"), minus
  `onLackKnowLedge`.
- **Ações de inatividade** — timed actions + finish action.
- **Webhooks** — 8 event URLs. `onLackKnowLedge` moves here, where it works.
  Our own endpoint URL is offered as a one-click fill, derived from env
  (never hardcoded — see commit `f9910cc`).
- **Regras de transferência** — CRUD over rules; human targets populated from
  `GET /workspace/{ws}/team`.

### Fixes folded in

- `resumeTransferHumanAI` is in the settings contract but absent from the UI.
- `onLackKnowLedge` at `SettingsPage.tsx:85` posts to `update-settings`, a
  resource that does not own the key. The field silently does nothing today.

---

## W4 · Models

No list endpoint exists, so the catalog stays hand-maintained (founder chose
this over an admin-editable table).

- Add the two Anthropic models the founder confirmed are in GPT Maker's
  dropdown: **Claude Sonnet 4.6** and **Claude Sonnet 5**.
- ⚠️ Their slugs are **derived from the provider's naming convention**
  (`CLAUDE_4_5_SONNET` → `CLAUDE_4_6_SONNET`, `CLAUDE_5_SONNET`), not observed
  live. Marked as unverified in code. `upstreamError` already surfaces the
  provider's response body verbatim, so a wrong slug produces a diagnosable 502
  on first select rather than silent failure.
- Resolve a docs/code mismatch: the published enum lists `OPEN_AI_04` and
  `OPEN_AI_03_MINI_BETA` (digit zero); our catalog has `OPEN_AI_O4` and
  `OPEN_AI_O3_MINI_BETA` (letter O). One form fails on select. **Adopt the
  docs' spelling** for these two ids: unlike the model list — where live data
  positively contradicts the docs — there is no live evidence for either form,
  so the only evidence available wins. Comment the ambiguity at the call site.
- Keep the live-only slugs (`GPT_5_6_SOL`, `GPT_5_6_TERRA`, `GPT_5_4`) — they
  appear in no published enum but are what the provider actually runs. Credit
  costs for these three remain estimates.
- Never validate a selection against the catalog. The catalog is display
  metadata; the provider is the authority. This is already correct
  (`manage-agent-settings/index.ts:206`) and must not regress.

---

## Out of scope

- Horário de atendimento, Moderação de conteúdo (no API — deferred by decision).
- Intentions rebuild, named training blocks, i18n — carried from the 7.2
  deferral list, untouched here.
- Renaming the `gpt-maker-webhook` edge function (needs its own migration).

## Risks

| Risk | Mitigation |
|---|---|
| Claude 4.6 / 5 slugs are convention-derived, unverified | Provider error body surfaced verbatim; first select confirms or fails loudly |
| Loading a long `behavior` into a capped textarea truncates production prompts | Cap removed from the load path (W2) |
| Deploy is manual — fixes are inert until deployed | Every task lists its function; deploy checklist in the plan |
| `SettingsPage` split touches a working page | Split is mechanical (extract per tab), behavior-preserving; existing controls keep their current save semantics including the `maxDailyMessages` coupling |

## Success criteria

1. Canais lists the real channels in the running app (5 on Solo Energia).
2. Perfil and Contexto load the live values on open, and a reload after save
   shows the saved value.
3. Settings exposes every provider-backed item from the founder's list, with
   the two no-API items honestly marked.
4. Idle actions, transfer rules and webhooks are readable and editable, and
   changes survive a reload.
5. The model dropdown includes Sonnet 4.6 and Sonnet 5.
