# Studio AI — Truth & Parity (Sprint 7.2) — Design

**Date:** 2026-08-08 · **Author:** Claude (PM) · **Status:** awaiting founder review
**Vision source:** `Planning/Sprints/sprint_7.2_studio_ai_v1.md` (Product Owner, 08/08/2026)
**Scope decision:** Option B — *fix-first* (make every existing surface truthful) **plus** full agent-settings parity. Google Calendar dropped. Intentions rebuild, Transfer Rules and Idle Actions deferred to 7.3.

---

## 1. Problem

The Product Owner's verdict is *"Studio AI doesn't achieve my expectations."* Investigation on 2026-08-08 found the cause is not missing UI — the pages exist and call real edge functions. The cause is that **several of those calls target the wrong upstream resource, so the UI displays defaults and silently discards writes.**

### Root cause: settings live on a sub-resource we never call

`manage-agent-settings` reads and writes `GET/PUT /v2/agent/{agentId}`. Per the provider's API reference, that object contains only:

```
id · name · behavior · avatar · communicationType · type · jobName · jobSite · jobDescription
```

Every operational setting lives on a **separate sub-resource**, `GET/PUT /v2/agent/{agentId}/settings`, which we have never called. Consequences, all verified against the API reference:

| Symptom (PO's words) | Mechanism |
|---|---|
| "Configurações need to be more similar to gpt maker" | `splitMessages`, `enabledEmoji`, `messageGroupingTime`, `knowledgeByFunction` are read from the agent object, which does not carry them → always render as defaults; PUTs are silently dropped |
| Model selection doesn't stick | `prefferModel` is also on `/settings`, not the agent object — same silent drop |
| Model selector never shows the current model | `ModelSelector.tsx:43` reads `settingsRes.data?.model`, but the function returns `prefferModel`. The key never matches, so `currentModel` stays `""` |
| Model list is wrong | `GPTMakerProvider.getModels()` is a hardcoded client list of lowercase slugs (`gpt-5.4-mini`, `claude-4.5-sonnet`). The API enum is UPPER_SNAKE (`GPT_5_MINI_V2`, `CLAUDE_4_5_SONNET`) and does not contain several of our entries |

**One page of the product has never worked.** This is the sprint's centre of gravity.

### Secondary findings

- **No model-list endpoint exists.** The catalog is a fixed enum documented on the settings endpoint. It must live somewhere we control.
- **`DOCUMENT` training is URL-only** (`documentUrl` + name + mimetype). "Upload a file" therefore means: upload to Supabase Storage, pass the resulting public URL.
- **Google Calendar has no API.** Provider integrations (Eleven Labs, Google Agenda, Plug Chat, E-Vendi) are dashboard-configured only. Dropped from this sprint by founder decision.
- **`horário de atendimento` and `moderação de conteúdo` have no API fields.** Recorded as known gaps (§7).
- **Silent env fallback.** `src/integrations/supabase/client.ts:6-7` falls back to `https://placeholder-url.supabase.co` when `VITE_SUPABASE_URL` is unset. On a Netlify build with missing env vars the whole app fails silently against a fake host. There is no `netlify.toml`, so build config lives only in the Netlify UI.
- **Docs may lag the API.** Our Sprint 7 reference doc and the current docs disagree on the channels endpoint (`/workspace/{id}/channels?agentId=` vs `/agent/{id}/search`). This justifies a live spike before committing task scope.

---

## 2. Goals / Non-goals

**Goals**
1. Every control in Studio AI reads real state and persists real changes.
2. Agent settings reach full parity with the provider's settings API.
3. The model catalog is correct, current, and updatable without a frontend rebuild.
4. Knowledge Base accepts an uploaded file, not only a hosted URL.
5. No user-visible reference to the provider's brand anywhere in the UI.
6. Solo API instances show connection date and price, and deleting one cleans up the VPS.

**Non-goals (explicitly deferred)**
- Google Calendar / scheduling (no API — revisit as its own sprint)
- Intentions UI rebuild, Transfer Rules, Idle Actions → Sprint 7.3
- i18n / system language option → Sprint 7.3
- Niche-generic example copy → Sprint 7.3
- Chat channel-filter restyle → Sprint 7.3

---

## 3. Architecture

Nothing structural changes. The seam stays where it already is: **React page → `supabase.functions.invoke` → edge function → provider API**. The work is correcting which upstream resource each edge function talks to, and completing the field sets.

### 3.1 `manage-agent-settings` — two upstream resources, one function

The function must stop pretending there is a single agent resource. It fans out to two:

```
Agent object      GET/PUT /v2/agent/{id}
                  → name, behavior, description, jobName, jobSite,
                    jobDescription, communicationType, type

Settings resource GET/PUT /v2/agent/{id}/settings
                  → prefferModel, timezone, enabledHumanTransfer,
                    enabledReminder, splitMessages, enabledEmoji,
                    limitSubjects, signMessages, messageGroupingTime,
                    maxDailyMessages, maxDailyMessagesLimitAction,
                    knowledgeByFunction, onLackKnowLedge
```

**Contract**

| Action | Method | Upstream | Notes |
|---|---|---|---|
| `get` (default) | GET | both, in parallel | Returns `{ agent: {...}, settings: {...} }`. Breaking shape change — frontend updated in the same sprint |
| `update-behavior` | PUT | agent | unchanged |
| `update-description` | PUT | agent | unchanged |
| `update-settings` | PUT | **settings** | Selective patch over the 13 whitelisted keys |
| `update-model` | PUT | **settings** | Writes `prefferModel`; validates against the catalog |
| `models` | GET | none | Returns the catalog (§3.2) |

`update-model` is kept as a distinct action rather than folded into `update-settings` because `ModelSelector` is a separate component with its own optimistic-update and rollback path.

**Error handling.** Today a non-2xx becomes a generic `AI Engine API error: {status}`. Since a wrong field name now fails loudly rather than silently, the function must surface the provider's response body so a bad enum is diagnosable. Errors are returned as `{ error: string, status: number }` and rendered in the page's existing toast.

### 3.2 Model catalog — server-owned

No list endpoint exists, so the catalog is a constant. It lives **in the edge function**, exposed via `?action=models`, returning:

```ts
{ id: "GPT_5_MINI_V2", label: "GPT-5 Mini v2", vendor: "OpenAI", creditsPerMessage: 1, isNew?: true }
```

Server-owned for two reasons: adding a model becomes one function deploy with no frontend rebuild, and it gives one definition instead of the three we have today (`GPTMakerProvider.getModels()`, `AIUsageDashboard.MODEL_COSTS`, `AIUsageDashboard.getColor`). Both of those duplicates are deleted and re-sourced from this endpoint.

`id` is the exact API enum. Display formatting never round-trips through the id.

### 3.3 Knowledge Base file upload

```
File picker → upload to Supabase Storage bucket `agent-training-docs`
            → obtain public URL
            → POST /v2/agent/{id}/trainings { type: "DOCUMENT", documentUrl, documentName, documentMimetype }
```

New bucket, public-read (the provider must fetch the URL server-side), write restricted to authenticated users of the owning team. Files are namespaced `{equipe_id}/{uuid}.{ext}` so tenant isolation is path-enforced. Accepted types follow the provider's document support; size cap 20 MB, enforced client-side and by the bucket.

Deleting a training deletes the Storage object too — otherwise the bucket grows without bound.

### 3.4 White-labeling

The provider is an implementation detail. User-visible strings must not name it; internal identifiers (class `GPTMakerProvider`, secret `GPT_MAKER_TOKEN`, column `gpt_maker_agent_id`) stay as-is — renaming them is churn with migration risk and no user benefit.

Nine files contain references. The sweep covers rendered strings, labels, tooltips, placeholders and toasts. Because it touches files owned by other tasks, it runs **alone in the final wave**.

Guard against regression: a test that greps `src/` for the brand in string literals, allowing an explicit file-level allowlist for the internal service layer.

### 3.5 Environment hardening

`client.ts` stops falling back to a placeholder. Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` throws at module load with a message naming the missing variable. A silent fallback to a nonexistent host is strictly worse than a hard failure at boot — it produces exactly the "nothing loads and I don't know why" symptom under investigation.

A committed `netlify.toml` records build command, publish directory and the required env var names, so build config stops living only in a web UI.

---

## 4. Data flow — settings read

```
SettingsPage mount
  └─ invoke manage-agent-settings            (action=get)
       ├─ GET /v2/agent/{id}           ─┐ parallel
       └─ GET /v2/agent/{id}/settings  ─┘
     → { agent, settings }
  └─ invoke manage-agent-settings?action=models
     → catalog
  └─ render; each control bound to settings.<key>

toggle change
  └─ optimistic set
  └─ invoke ...?action=update-settings { key: value }
       └─ PUT /v2/agent/{id}/settings
     → ok: keep · error: roll back + toast provider message
```

Writes are per-control selective patches, not a whole-object PUT. Two people editing different toggles must not clobber each other, and a whole-object PUT would resend stale values for every field the user didn't touch.

---

## 5. Testing

Edge functions have no test harness today, and this sprint is not the place to build one. Verification is therefore explicit and manual, recorded per task:

- **Wave 0 spike** produces `Planning/Sprints/sprint_7.2_api_reference.md` with real captured responses for every endpoint the sprint touches — the same technique that made Sprint 7's reference reliable.
- **Per task:** `npm run build` clean; `deno check` clean on any edge function touched.
- **Settings acceptance:** toggle each of the 13 fields, reload the page, confirm the value persisted; confirm the same value in the provider dashboard.
- **Model acceptance:** select a model, reload, confirm it displays; confirm the enum reached the provider.
- **Regression guard:** the brand-string test from §3.4 runs in CI.

The settings work is the one place a real automated test is worth it: a small unit test over the action→upstream-URL mapping, which is pure logic and is exactly the thing that broke.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Docs lag the live API; field names differ | Wave 0 spike captures real responses before any task starts |
| `action=get` shape change breaks pages mid-sprint | Edge function and its consumer pages land in adjacent waves; PM merges the function wave before opening the UI wave |
| Netlify build lacks env vars → sprint "fixes" appear to do nothing | Env fail-fast ships in Wave 1 so the failure is visible immediately |
| Storage bucket misconfigured → provider cannot fetch document | Spike verifies with one real document before the UI task starts |
| White-label sweep conflicts with every other task | Runs alone in the final wave |

---

## 7. Known gaps (accepted, not silently dropped)

- **Horário de atendimento** — no API field. Would require enforcement in our own webhook layer before handing off to the agent.
- **Moderação de conteúdo** — no API field.
- **Google Calendar** — no API at all; dashboard-only.

These are recorded in the sprint doc so they surface in 7.3 planning rather than being lost.
