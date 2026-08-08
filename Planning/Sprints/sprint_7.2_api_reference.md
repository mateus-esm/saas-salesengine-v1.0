# 📖 Sprint 7.2 — Live API Reference (Ground Truth)

> **T0 spike deliverable (engineer, 2026-08-08).** Every task in `sprint_7.2_studio_ai_v1.md` reads this doc. Captured **live** against `https://api.gptmaker.ai/v2` with a real token on the *Solo Energia* agent. If a task contradicts this doc, this doc wins — tell the PM.
>
> **Method:** live `curl` capture (2026-08-08). IDs masked to first 8 chars per T0 Step 5. The raw verbatim payloads live in the spike notes (`/tmp/spike/*.json`) — not committed.
>
> **⚠️ Two provider docs are stale vs. the live API** (details in §3 and §4): the docs' `prefferModel` enum is outdated, and the docs' channels-list docs describe fewer fields than the API returns.

---

## 1. Endpoints captured

| # | Endpoint | Status | Notes |
|---|---|---|---|
| 1 | `GET /v2/agent/{agentId}` | 200 | agent object |
| 2 | `GET /v2/agent/{agentId}/settings` | 200 | **the settings sub-resource — the bug** |
| 3 | `GET /v2/agent/{agentId}/search?page=1&pageSize=50` | 200 | channels via docs endpoint |
| 4 | `GET /v2/workspace/{workspaceId}/channels?agentId={agentId}&page=1&pageSize=50` | 200 | channels via current code |
| 5 | `GET /v2/agent/{agentId}/trainings?page=1&pageSize=50` | 200 | trainings (see §4 for `type` filter!) |
| 6 | `GET /v2/agent/{agentId}/credits-spent?year=2026&month=8` | 200 | per-model credits |
| 7 | `GET /v2/workspace/{workspaceId}/credits` | 200 | account credits |
| 8 | `POST /v2/agent/{agentId}/trainings` | 200 | DOCUMENT round-trip (§5) |
| 9 | `DELETE /v2/training/{trainingId}` | 200 | **delete path is `/training/{id}`, NOT `/agent/{id}/trainings/{id}`** |

**Auth:** `Authorization: Bearer <GPT_MAKER_TOKEN>`, `Content-Type: application/json`. Always `.trim()` agent id read from `equipes` (pasted ids carry whitespace/newline — several rows in the DB have a literal trailing `\n` in `workspace_id`).

**Test tenant (masked):**
- `agentId` = `3DF0B5F1…`
- `workspaceId` = `3DF0B518…`

---

## 2. Agent object — answer to Q1

`GET /v2/agent/{agentId}` returns **no** `splitMessages`, **no** `prefferModel`. Confirmed. The object only carries identity + persona:

```json
{
  "id": "3DF0B5F1…",
  "avatar": "https://gpt-files.com/file/3DF0B5F1…/3F13648D505203270A95AEDC19671B3F.jpg",
  "name": "Solon",
  "status": "ACTIVE",
  "communicationType": "NORMAL",
  "type": "SALE",
  "jobName": "Solo Energia",
  "jobDescription": "…",
  "jobSite": "https://www.soloenergia.com.br",
  "behavior": "IDENTIDADE: …"
}
```

Every operational setting lives on the sub-resource `/agent/{agentId}/settings`. The design spec's root-cause is confirmed by live capture.

---

## 3. `/settings` — answer to Q2

### 3.1 GET — exact key names and live values (Solo Energia, 2026-08-08)

```json
{
  "prefferModel": "GPT_5_6_SOL",
  "timezone": "America/Fortaleza",
  "enabledHumanTransfer": true,
  "enabledReminder": false,
  "splitMessages": false,
  "enabledEmoji": false,
  "limitSubjects": true,
  "messageGroupingTime": "TEN_SEC",
  "signMessages": false,
  "maxDailyMessages": null,
  "maxDailyMessagesLimitAction": null,
  "knowledgeByFunction": true,
  "resumeTransferHumanAI": false
}
```

**13 keys.** Note two deviations from the published docs / T1 plan:
- `onLackKnowLedge` is **documented** but **absent** from the live GET response. Do not forward it blindly on PUT.
- `resumeTransferHumanAI` and `signMessages` are present live but **not** in T1's planned `SETTINGS_KEYS` whitelist. Decide in T1 whether to add them to the whitelist (recommended: yes for `signMessages`; investigate `resumeTransferHumanAI`).

**Enum notes:**
- `prefferModel` live value is `GPT_5_6_SOL` — **not in** the published docs enum and **not in** T1's `MODEL_CATALOG` (plan lines 250–277). T1 Step 1 says "Ids are the exact enum from `/settings`" — see §6 reconcile list.
- `messageGroupingTime` enum: `NO_GROUP`, `FIVE_SEC`, `TEN_SEC`, `THIRD_SEC`, `ONE_MINUTE`.
- `maxDailyMessagesLimitAction` enum: `TEMP_BLOCK_30S`, `TEMP_BLOCK_5M`, `TEMP_BLOCK_10M`, `TEMP_BLOCK_30M`, `TEMP_BLOCK_1H`, `BLOCK`, `TRANSFER`.
- `maxDailyMessages` accepted values: `20`, `50`, `100`, `200`, `500`, `1000`, or `null`.

### 3.2 PUT — request body

PUT accepts any subset of the settings keys; partial updates are OK (the provider accepts a partial body). `prefferModel` PUT accepts the same (stale) documented enum — but the live `GPT_5_6_SOL` is what actually works for current generation, so the model list should be sourced from what the provider really runs. Response: `{ "success": true }` (200).

---

## 4. Channels — answer to Q3

**Both endpoints return the real channels.** They are not mutually exclusive — they return the same 5 channels with different field sets and a type discrepancy.

### 4.1 Docs endpoint — `GET /agent/{agentId}/search?page=1&pageSize=50`

```json
{
  "data": [
    { "id": "3F5C52D22169509816822AC3025531C4", "name": "Teste", "type": "CLOUD_API", "connected": false,
      "waitingMessageEnabled": null, "waitingMessageText": null, "createdAt": 1783443431525,
      "subscriptionAt": null, "subscriptionCancelAt": null, "trialExpiredAt": null },
    { "id": "3E88D75021F6D0146D3FF2AF9A4FB162", "name": "Solon - Wpp Solo Energia", "type": "CLOUD_API", "connected": true, "…": "…" },
    { "id": "3DF92B6F3982E656CF56CEE8C4E7B69C", "name": "Solo Energia", "type": "INSTAGRAM", "connected": true, "…": "…" },
    { "id": "3DF17E104487D69BED4C7EF3B2532F51", "name": "calculadora-solo", "type": "WIDGET", "connected": true, "…": "…" },
    { "id": "3DF0B7EA0A3956F326336AA4C19A70EA", "name": "Solon - MSM Business", "type": "CLOUD_API", "connected": false, "…": "…" }
  ],
  "count": 5
}
```

Fields per channel: `id`, `name`, `type`, `connected`, `waitingMessageEnabled`, `waitingMessageText`, `createdAt`, `subscriptionAt`, `subscriptionCancelAt`, `trialExpiredAt`.

### 4.2 Current-code endpoint — `GET /workspace/{workspaceId}/channels?agentId={agentId}&page=1&pageSize=50`

Same 5 channels, richer shape — adds `username`, `agentName`, `agentId`, `agentPicture`, `departmentId`, `departmentName`, `facebookPageId`, `tiktokUsername`. **This is the endpoint the current `manage-agent-channels` uses for listing.**

```json
{
  "data": [
    { "name": "Teste", "id": "3F5C52D22169509816822AC3025531C4", "type": "WHATSAPP", "facebookPageId": null,
      "tiktokUsername": null, "username": null, "connected": false,
      "agentId": "3DF0B5F1…", "departmentId": null,
      "agentPicture": "https://gpt-files.com/file/3DF0B5F1…/3F13648D505203270A95AEDC19671B3F.jpg",
      "departmentName": null, "agentName": "Solon" },
    { "name": "Solon - Wpp Solo Energia", "id": "3E88D75021F6D0146D3FF2AF9A4FB162", "type": "WHATSAPP",
      "username": "+55 85 8181-3110", "connected": true, "…": "…" },
    { "name": "Solo Energia", "id": "3DF92B6F3982E656CF56CEE8C4E7B69C", "type": "INSTAGRAM",
      "username": "soloenergiabr", "connected": true, "…": "…" },
    { "name": "calculadora-solo", "id": "3DF17E104487D69BED4C7EF3B2532F51", "type": "WIDGET", "connected": true, "…": "…" },
    { "name": "Solon - MSM Business", "id": "3DF0B7EA0A3956F326336AA4C19A70EA", "type": "WHATSAPP", "connected": false, "…": "…" }
  ],
  "count": 5
}
```

**⚠️ Type discrepancy between the two endpoints for the same channel id:** `search` reports the two WhatsApp-style channels as `CLOUD_API`, while `/workspace/…/channels` reports them as `WHATSAPP`. Same channel (`3E88D750…`) → `search` says `CLOUD_API`, workspace says `WHATSAPP`. If a UI displays channel type, pick **one** endpoint as source of truth and be aware the raw `type` value depends on which you call.

`type` enum (per docs): `Z_API`, `WHATSAPP`, `INSTAGRAM`, `CLOUD_API`, `TELEGRAM`, `WIDGET`, `MESSENGER`, `MERCADO_LIVRE`, `TWILIO_SMS`.

---

## 5. DOCUMENT training round-trip — verified ✅

**POST** `{ "type":"DOCUMENT", "documentUrl":"https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", "documentName":"teste-spike.pdf", "documentMimetype":"application/pdf" }` → **200**:

```json
{ "id": "3F7589…", "tenant": "3DF0B518…" }
```

> The POST response's `tenant` field is a **different id** than the workspace id we use (`3DF0B518…`). Not the workspace id. Worth a note in T9 if the Knowledge UI needs to correlate.

**List check:** the training appears in the list **only when the list is filtered by `type`**:

```json
GET /agent/{agentId}/trainings?type=DOCUMENT&page=1&pageSize=50
{ "data": [ { "id": "3F7589…", "text": null, "image": null, "audio": null, "video": null, "website": null,
  "trainingSubPages": "DISABLED", "trainingInterval": "NEVER",
  "documentUrl": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  "documentName": "teste-spike.pdf", "documentMimetype": "application/pdf", "type": "DOCUMENT", "callbackUrl": null } ], "count": 1 }
```

**Cleanup:** `DELETE /v2/training/{trainingId}` → 200 `{ "success": true }`. The agent-scoped path `DELETE /agent/{agentId}/trainings/{id}` returns **404** — the current `manage-agent-training` already uses the correct `/training/{id}` for update/delete. Same for GET-by-id: `/agent/{agentId}/trainings/{id}` → 404 (there is no GET-single; list with `type` filter instead).

---

## 6. Credits — answer to Q4

### 6.1 Per-agent — `GET /agent/{agentId}/credits-spent?year=2026&month=8`

**Yes — per-model breakdown.** Shape: `{ total, data: [ { month, credits, year, model, day }, … ] }` (one row per model per day).

```json
{
  "total": 938,
  "data": [
    { "month": 8, "credits": 56, "year": 2026, "model": "GPT_5_4", "day": 7 },
    { "month": 8, "credits": 63, "year": 2026, "model": "GPT_5_6_TERRA", "day": 7 },
    { "month": 8, "credits": 294, "year": 2026, "model": "GPT_5_6_SOL", "day": 7 },
    { "month": 8, "credits": 161, "year": 2026, "model": "GPT_5_4", "day": 6 },
    { "month": 8, "credits": 133, "year": 2026, "model": "GPT_5_4", "day": 5 },
    { "month": 8, "credits": 49, "year": 2026, "model": "GPT_5_4", "day": 4 },
    { "month": 8, "credits": 105, "year": 2026, "model": "GPT_5_4", "day": 3 },
    { "month": 8, "credits": 21, "year": 2026, "model": "GPT_5_4", "day": 2 },
    { "month": 8, "credits": 56, "year": 2026, "model": "GPT_5_4", "day": 1 }
  ]
}
```

**Model keys are slugs of the concrete model variant, not the generic enum.** Observed in live data: `GPT_5_4`, `GPT_5_6_TERRA`, `GPT_5_6_SOL`. These match the live `prefferModel` namespace (`GPT_5_6_SOL`) but **do not appear** in T1's `MODEL_CATALOG` nor in the published docs enum. T10 (Usage page) should group by `model` and be prepared for slugs outside any hardcoded list — degrade gracefully to the raw slug as display label.

### 6.2 Account — `GET /workspace/{workspaceId}/credits`

```json
{ "status": "ACTIVE", "credits": 324 }
```

Minimal: `status` + `credits` (integer). No subscription/cancel metadata here.

---

## 7. Trainings list shape — answer to Q5

`GET /agent/{agentId}/trainings` requires the `type` query param filter (`TEXT` | `WEBSITE` | `VIDEO` | `DOCUMENT`). Without it, the API appears to default to `TEXT`-only (23 TEXT items returned, count 23).

Response shape (all types):

```json
{ "data": [ { "id": "…", "text": "…", "image": null, "audio": null, "video": null, "website": null,
  "trainingSubPages": "DISABLED", "trainingInterval": "NEVER",
  "documentUrl": null, "documentName": null, "documentMimetype": null,
  "type": "TEXT", "callbackUrl": null } ], "count": 23 }
```

**There is no `title`/`name` field on a training** — except `documentName` (only set for DOCUMENT type). TEXT trainings are identified by their `text` content and `id`; the UI must not rely on a name/title field. Current `manage-agent-training` caches to `agent_trainings.content` from `t.text` — consistent.

---

## 8. Reconcile list for downstream tasks (PM flags)

| # | Finding | Affects | Action |
|---|---|---|---|
| 1 | `prefferModel` live value `GPT_5_6_SOL` missing from T1 `MODEL_CATALOG` and docs enum | T1, T7 | Add the live slugs to the catalog; keep docs-listed ids that still exist |
| 2 | `credits-spent` model slugs `GPT_5_4`, `GPT_5_6_TERRA`, `GPT_5_6_SOL` outside catalog | T10 | Group by `model`; fall back to raw slug label |
| 3 | `onLackKnowLedge` documented but absent from live `/settings` GET | T1 | Don't require it on GET; on PUT only forward if the UI actually sets it |
| 4 | `signMessages` / `resumeTransferHumanAI` live but not in T1 whitelist | T1 | Decide whether to whitelist (recommend `signMessages` yes) |
| 5 | Channel `type` differs between `/search` (CLOUD_API) and `/workspace/…/channels` (WHATSAPP) | T2, T8 | Pick one endpoint as truth for `type`; workspace endpoint is richer and is what current code lists |
| 6 | Training POST response `tenant` id ≠ `workspace_id` | T9 | Don't assume tenant == workspace id |
| 7 | Trainings list needs `type` filter; unfiltered defaults to TEXT | T4, T9 | Always pass `type` when listing |
| 8 | No GET-single for trainings; DELETE/PUT are `/training/{id}` | T4, T9 | Already correct in current code |
