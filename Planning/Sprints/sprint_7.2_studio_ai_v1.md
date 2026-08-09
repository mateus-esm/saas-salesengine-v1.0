# Sprint 7.2 — Studio AI: Truth & Parity

> **Design spec:** `docs/superpowers/specs/2026-08-08-studio-ai-truth-and-parity-design.md` — read it before your task. If a task contradicts the spec, the spec wins; tell the PM.
> **Workflow:** `Planning/Workflow/agent_workflow.md` is mandatory. PM = **Claude**.

---

# 🎯 ZONE 1 — VISION (Product Owner)

View of Product Owner:

1. Studio AI -> Uso & Dados not sync with agent_provider;
2. Some sessions in en another in pt-br, we need to have the option to the
   system language;
3. Ex: Context of the enterprise use an Solo Energia example of writing, for all
   tenants we need to have an example more generic or fit with the niche,this
   for all types of examples in the system;
4. Treinamento personalizado -> Blocos i want that we can personalize the name
   of the block like: BL09 - Personalized (Apresnetação Coemrcial) for example;
5. Videos/Docs in sync with gpt maker and the possibiltie on to up the file in
   docs like is in the gpt maker;
6. Skills and intenções in an more logic, clear and intuitive way;
7. Crie um canal em Novo canal ou conecte uma instancia Solo API abaixo.

Conexão Direta (Solo API) +R$ 100/mês por instância conectada

I want this information in an better way an so an way to update when i want.

8. About the billing has differente things: Subscribe, Agent_provider credits
   that is the credits consuption in gpt maker, copilot credits that is the
   credits consuption of our crm internal agent and another services lime the
   wpp instances i want that the client can see and manage it like buy,canccel
   each one in the billing directly.

9. the config -> studio_ai dont make sense we need to be fit and sync with the
   agent_provider == gpt_maker so study the configs availble in the api of the
   agent_provider and make it fit and sync with the studio_ai;

10. studio_ai -> canais is not sync and not working in the real production

11. in chat changed the way of looking to the filter of channels i dont like
    this side roll bar i want like the another filters the simple list selection
    with the available channels.

08/08/2026:

1. Page: Uso & Analytics dont fetch the real data.
2. Knowledge Base: dont fetch the real data in real time and also i need that be
   equal for example in the files i need can input an file not only online
   hospedated file.
3. Intenções:need be more similar to gpt maker:Coletar dados do cliente
   (opcional)

Adicionar campo Ação que deve ser feita: Webhook POST

Digite a url do webhook, use @ para variáveis Headers Params Body

Adicionar header

4. Canais: Dont fetch the real channels

5. Configurações: Preferências da conversa Conversa Ações de inatividade
   Webhooks Regras de transferência Transferir para humano ... (lista completa
   de settings — ver spec §1) need to be more similar to the gpt maker

6. Be possible to integrate the google calendar trought the gpt make (…)

think better, but also cut all type of the reference an gpt maket, this is
internal our they are our current agent and channel provider,

- Solo API, in the side of the intance i think that can have the date of
  connectio,aldo if is deleted send an request to my vps to delete the instance
  to maintain the docker enviroment clean, also have the price of the instance
  of the side, this price can be setup trough the admin in the another phases,
  and also in billing need to have an space to show the instances connection
  billing.

---

## 🚦 SCOPE DECISIONS (founder, 2026-08-08)

| Decision | Choice |
|---|---|
| Sprint shape | **Fix-first + full settings parity** (Option B) |
| Google Calendar (vision #6) | **Dropped** — provider has no API; dashboard-only |
| `Horário de atendimento`, `Moderação de conteúdo` | **Ship what the API supports**, record as known gaps |
| Model list | **Must reflect the provider's real catalog** |

**Deferred to Sprint 7.3:** vision #2 (i18n) · #3 (niche-generic examples) · #4 (named training blocks) · #6 (Intentions rebuild) · #11 (chat channel filter) · Transfer Rules · Idle Actions.

---

## ✅ DEFINITION OF DONE

- [ ] Every control in Studio AI reads real provider state and persists real changes (verified by reload + provider dashboard).
- [x] All agent-settings fields are exposed and round-trip correctly — **12
      controls** on the Settings page + `prefferModel` in the model selector
      (T7). *(The earlier "13 fields" wording conflated the two surfaces;
      corrected after T6. `resumeTransferHumanAI` exists live but is not in the
      PO's list, so it is returned by the API layer and deliberately not
      rendered.)*
- [ ] Model selector lists the provider's real enum catalog, shows the current model, and saving it sticks.
- [ ] Knowledge Base ingests an uploaded file (not only a hosted URL) and reflects trainings in real time.
- [ ] Uso & Analytics and Canais display real data.
- [ ] No user-visible reference to the provider's brand anywhere in the UI.
- [ ] Solo instance cards show connection date + monthly price; delete removes the instance from the VPS; Billing has an instances section.
- [ ] A missing `VITE_SUPABASE_*` env var fails the app loudly at boot instead of silently using a placeholder host.

---

# 🛠️ ZONE 2 — IMPLEMENTATION PLAN (PM: Claude)

**Goal:** Make Studio AI tell the truth — every surface reads real provider state and every control persists — and bring agent settings to full provider parity.

**Architecture:** No structural change. The seam stays `React page → supabase.functions.invoke → edge function → provider API`. The work is correcting *which upstream resource* each edge function targets and completing field sets. The central defect: `manage-agent-settings` talks to `/v2/agent/{id}`, but all operational settings and `prefferModel` live on `/v2/agent/{id}/settings`, which we never call — so the page renders defaults and discards writes.

**Tech Stack:** Deno edge functions (`supabase/functions/**`) · React 18 + Vite + TypeScript · TanStack Query · shadcn/ui · Supabase Storage.

## Global Constraints

- Provider base URL is `https://api.gptmaker.ai/v2`; auth is `Authorization: Bearer ${GPT_MAKER_TOKEN}`. Always `.trim()` the agent id read from `equipes` — pasted ids carry whitespace.
- Model ids are the provider's **UPPER_SNAKE enum** (`GPT_4_O_MINI`), never lowercase slugs. Never derive a display name by transforming an id.
- **No user-visible string may name the provider's brand.** Internal identifiers (`GPTMakerProvider`, `GPT_MAKER_TOKEN`, `gpt_maker_agent_id`) stay unchanged.
- New edge functions need an entry in `supabase/config.toml`. This sprint adds none — only modifies existing ones.
- Every edge function must `deno check` clean.
- **Every frontend task must pass `npx tsc -b` AND `npm run build`.** ⚠️ *Gate
  corrected 2026-08-09 (PM):* `npm run build` alone is **not** a typecheck —
  Vite uses esbuild, which strips types without checking them. T7 shipped a real
  `TS2515` error that the build reported as clean. The project already learned
  this in 6.9/6.10 and added the `typecheck` script; the plan wrongly specified
  the weaker gate. `npx tsc -b` is the real gate.
- UI copy is **pt-BR**.
- Deploys are **manual**: `supabase functions deploy <fn> [--no-verify-jwt] --project-ref egxzsivzqlqadoqpgfby`. There is no CI deploy.

---

## 🌊 WAVE MAP

```
W0 ── T0 spike (blocks everything)
        ↓
W1 ── T1 settings fn · T2 channels fn · T3 credits fn · T4 training fn · T5 env
        ↓ (PM merges W1 before W2 opens — W2 consumes W1 contracts)
W2 ── T6 SettingsPage · T7 ModelSelector · T8 ChannelsPage · T9 KnowledgePage
      T10 UsagePage · T11 Billing
        ↓
W3 ── T12 white-label sweep (runs ALONE — touches files owned by W2)
```

## 📋 TASK TABLE

| # | Task | Tier | Engineer | Owns (exclusive) |
|---|---|---|---|---|
| T0 | Live API spike | M | Verboo ✅ | `Planning/Sprints/sprint_7.2_api_reference.md` |
| T1 | `manage-agent-settings` → `/settings` + catalog | **XL** | **Verboo** | `supabase/functions/manage-agent-settings/index.ts` |
| T2 | `manage-agent-channels` real fetch | M | **Verboo** | `supabase/functions/manage-agent-channels/index.ts` |
| T3 | `fetch-gpt-credits` real data | M | **Verboo** | `supabase/functions/fetch-gpt-credits/index.ts` |
| T4 | `manage-agent-training` DOCUMENT + Storage | **L** | **Verboo** | `supabase/functions/manage-agent-training/index.ts` · `supabase/migrations/20260808000000_agent_training_docs_bucket.sql` |
| T5 | Env fail-fast + `netlify.toml` | S | **Verboo** | `src/integrations/supabase/client.ts` · `netlify.toml` |
| T6 | Settings page full parity | **L** | **Verboo** | `src/pages/ai-studio/SettingsPage.tsx` · `src/components/ai-studio/BehaviorSettings.tsx` |
| T7 | Model selector fix | M | **Verboo** | `src/components/ai-studio/ModelSelector.tsx` · `src/services/ai-studio/providers/GPTMakerProvider.ts` |
| T8 | Channels page + Solo card | **L** | **Verboo** | `src/pages/ai-studio/ChannelsPage.tsx` · `src/components/ai-studio/CreateChannelDialog.tsx` |
| T9 | Knowledge Base upload UI | M | **Verboo** | `src/pages/ai-studio/KnowledgePage.tsx` · `src/components/ai-studio/AIKnowledgeBase.tsx` |
| T10 | Usage page real data | M | **Verboo** | `src/pages/ai-studio/UsagePage.tsx` · `src/components/ai-studio/AIUsageDashboard.tsx` |
| T11 | Billing — instances section | M | **Verboo** | `src/pages/Billing.tsx` |
| T12 | White-label sweep + guard | M | Codex | 9 files (see task) — **runs alone** |

> **Ownership rule:** touch only your files. If another file looks wrong, tell the PM — do not fix it.

---

## WAVE 0

### T0 · Live API spike — **M** — Verboo ✅ merged

**Files:** Create `Planning/Sprints/sprint_7.2_api_reference.md`

**Why:** The published docs and our Sprint 7 reference disagree on the channels endpoint (`/workspace/{id}/channels?agentId=` vs `/agent/{id}/search`). Every task behind this depends on the real shapes. Capture reality once.

**Interfaces — Produces:** the reference doc every other task reads.

- [ ] **Step 1: Get a token.** Read `GPT_MAKER_TOKEN` from Supabase edge secrets (Dashboard → Edge Functions → Secrets). Do **not** commit it. Export locally: `export GPT_MAKER_TOKEN=...`. Read `gpt_maker_agent_id` and `workspace_id` from the `equipes` row whose `id` is `939d7dd8-592c-4fda-946e-3568f2909904` (*Solo Energia*).

  > **PM correction (2026-08-08).** An earlier draft of this step presented that UUID as if it were the agent id. It is the **equipe id**; the real `gpt_maker_agent_id` is a 32-char provider id beginning `3DF0B5F1`. Caught by the T0 engineer.

- [ ] **Step 2: Capture each endpoint.** Run each and save the verbatim response:

```bash
A=$GPT_MAKER_AGENT_ID; W=$GPT_MAKER_WORKSPACE_ID
H="Authorization: Bearer $GPT_MAKER_TOKEN"
curl -s -H "$H" "https://api.gptmaker.ai/v2/agent/$A"                     # agent object
curl -s -H "$H" "https://api.gptmaker.ai/v2/agent/$A/settings"            # settings (KEY)
curl -s -H "$H" "https://api.gptmaker.ai/v2/agent/$A/search?page=1&pageSize=50"   # channels (docs)
curl -s -H "$H" "https://api.gptmaker.ai/v2/workspace/$W/channels?agentId=$A&page=1&pageSize=50"  # channels (current code)
curl -s -H "$H" "https://api.gptmaker.ai/v2/agent/$A/trainings?page=1&pageSize=50"
curl -s -H "$H" "https://api.gptmaker.ai/v2/agent/$A/credits-spent?year=2026&month=8"
curl -s -H "$H" "https://api.gptmaker.ai/v2/workspace/$W/credits"
```

- [ ] **Step 3: Answer these questions explicitly in the doc.**
  1. Does the agent object contain `splitMessages` / `prefferModel`? (Expected: **no** — confirm.)
  2. Exact key names and current values returned by `/settings`.
  3. Which channels endpoint returns real channels, and its exact response shape.
  4. Does `credits-spent` return per-model breakdown? What are the model keys — enum or slug?
  5. What shape does `trainings` return, and is there a title/name field on a training?

- [ ] **Step 4: Verify a DOCUMENT training round-trip.** Upload any small PDF to a public URL, then:

```bash
curl -s -X POST -H "$H" -H "Content-Type: application/json" \
  "https://api.gptmaker.ai/v2/agent/$A/trainings" \
  -d '{"type":"DOCUMENT","documentUrl":"<public-url>","documentName":"teste.pdf","documentMimetype":"application/pdf"}'
```
Record the response and whether the training appears in the list. Delete it afterwards.

- [ ] **Step 5: Mask and commit.** Never commit the token, and mask the agent/workspace ids to their first 8 chars in the doc.

```bash
git add Planning/Sprints/sprint_7.2_api_reference.md
git commit -m "docs(sprint7.2): live API reference captured"
```

**Handoff must include:** the answers to all five Step-3 questions inline — the PM gates W1 on them.

---

## 📦 Wave 0 — Handoff (Verboo-deepseek)

```
HANDOFF: W0 · T0 Live API spike
Flag:    Verboo-deepseek  (engineer que executou a T0 nesta wave)
Branch:  codex/sprint7.2/wave0/api-spike
Commit:  2cc2d43 docs(sprint7.2): live API reference captured
Files:   Planning/Sprints/sprint_7.2_api_reference.md (created — GROUND TRUTH das APIs)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T0 ticked + este handoff)
         Planning/Workflow/billing.md (row T0: 2026-08-08 · 7.2 · W0 T0 · Claude engineer / deepseek-v4-flash · M · R$ 12)
Verification: 7 endpoints live 200 + DOCUMENT round-trip (POST→list type=DOCUMENT→DELETE /training/{id}) + git show HEAD sem token/id
Ledger:  [x] T0
Merge:   PR para main após aprovação do PM; nenhuma dependência de migration/secrets nova (token já em .env gitignored)
```

### Respostas às 5 perguntas do Step 3 (gate do W1)

1. **Agent object** (`GET /agent/{id}`): **não** contém `splitMessages` nem `prefferModel`. Confirmado ao vivo — só identidade/persona (`name`, `jobName`, `behavior`, etc.).
2. **`/settings`** (`GET /agent/{id}/settings`): 13 chaves — `prefferModel: "GPT_5_6_SOL"`, `timezone: "America/Fortaleza"`, `enabledHumanTransfer: true`, `enabledReminder: false`, `splitMessages: false`, `enabledEmoji: false`, `limitSubjects: true`, `messageGroupingTime: "TEN_SEC"`, `signMessages: false`, `maxDailyMessages: null`, `maxDailyMessagesLimitAction: null`, `knowledgeByFunction: true`, `resumeTransferHumanAI: false`. **`onLackKnowLedge` não retorna no GET** (documentado na doc do provider, mas ausente ao vivo).
3. **Channels**: **ambos** os endpoints retornam os canais reais (5). `/workspace/{id}/channels?agentId=` é o mais rico (username, agentName, agentPicture) e é o que o código atual usa. **Discrepância de `type`:** `/agent/{id}/search` reporta `CLOUD_API`, `/workspace/…/channels` reporta `WHATSAPP` para o mesmo canal.
4. **`credits-spent`**: retorna breakdown por modelo — `{ total, data: [{month, credits, year, model, day}] }`. **Model keys são slugs** (`GPT_5_4`, `GPT_5_6_TERRA`, `GPT_5_6_SOL`) — não são o enum genérico dos docs nem o `MODEL_CATALOG` da T1.
5. **`trainings`**: shape `{ data: [{id, text, image, audio, video, website, trainingSubPages, trainingInterval, documentUrl, documentName, documentMimetype, type, callbackUrl}], count }`. **Não existe campo title/name** — só `documentName` (para DOCUMENT). List exige filtro `type` (sem ele, default TEXT).

### 🔴 Flags para o PM (W1 deve ler antes de codar)

1. **`prefferModel` ao vivo = `GPT_5_6_SOL` — não existe no `MODEL_CATALOG` da T1 nem no enum dos docs.** T1 precisa reconciliar o catálogo (instrução do próprio plano: "Reconcile with T0").
2. **`onLackKnowLedge` documentado mas ausente no GET ao vivo** — não exigir no GET; no PUT só repassar se a UI realmente setar.
3. **`signMessages`/`resumeTransferHumanAI` presentes ao vivo, fora da whitelist planejada da T1** — decidir adicionar (recomendo `signMessages` sim).
4. **Discrepância de `type` entre endpoints de channels** — T2/T8 devem escolher UMA fonte de verdade.
5. **`tenant` no response do POST /trainings ≠ `workspace_id`** — não assumir igualdade (relevante para T9).
6. **DELETE de training é `/training/{id}` (não `/agent/{id}/trainings/{id}` — que dá 404)** — código atual da `manage-agent-training` já está correto.
7. **Correção ao plano:** o "agent id" citado no Step 1 (`939d7dd8…`) é na verdade o `equipe.id`; o `gpt_maker_agent_id` real da Solo Energia é `3DF0B5F1…`. Usei o real.

### ✅ PM VERDICT — T0 ACCEPTED (Claude, 2026-08-08)

Gates per `agent_workflow.md` §7, verified on branch `codex/sprint7.2/wave0/api-spike` @ `2cc2d43` — not from the handoff text:

| Gate | Result |
|---|---|
| Handoff block complete | ✅ (`Tests:` rendered as `Verification:` — acceptable for a spike with no suite) |
| Files — only owned files | ✅ reference doc + ledger tick + billing row; nothing out of scope |
| Billing row | ✅ line 25, `7.2 · W0 T0 · M · R$ 12` (ledger is newest-first) |
| DoD — all 5 Q's answered | ✅ all five, with verbatim payloads |
| Working tree clean | ✅ |
| No secret material committed | ✅ scanned for bearer tokens / JWTs — clean |

**Independent PM verification** (the spike could have been fabricated; it wasn't):
- `equipes.gpt_maker_agent_id` for Solo Energia really does start `3DF0B5F1` — matches the doc, proving a real capture.
- The "`\n` in `workspace_id`" claim is **true** — exactly 2 of 8 tenants (*Rema Digital*, *Be My Guest*) carry a literal newline. Already defended by the `.trim()` at `manage-agent-channels/index.ts:53`; **T2 must not "fix" it again.**

**Deviations accepted:** ids masked to 12 chars in §5 rather than 8 — necessary to show the tenant/workspace divergence, and not sensitive.

**Two things the spike changed in this plan** (both were real defects in my draft):
1. **T1 would have rejected the tenant's own model.** Step 6 validated `update-model` against `MODEL_CATALOG`, but the live `prefferModel` is `GPT_5_6_SOL`, which is in no published enum. Now a format check only — the provider is the authority, the catalog is display metadata.
2. **T4/T9's list call was silently TEXT-only.** `GET /trainings` without `type` returns only TEXT, so uploaded documents were invisible. This is very likely a direct cause of "Knowledge Base doesn't fetch real data".

**Branch-base note:** this branch descends from `fix/solo-webhook-token-delivery`, not `main`, so its diff against `main` also carries the Sprint 7.1 fixes, spec and plan. That is intentional — those commits need to land anyway — but the founder should merge PR #4 first so W1 branches cut cleanly from `main`.

```
WAVE 0 MERGED · git pull origin main
Ready:  T0 — Planning/Sprints/sprint_7.2_api_reference.md is GROUND TRUTH; read it before coding
Next wave opens: W1 — T1 (Claude) · T2 (Gemini) · T3 (Gemini) · T4 (Codex) · T5 (Antigravity)
Amended by T0 findings: T1 (catalog + validation + whitelist), T2 (endpoint decision), T3 (no slug mapping), T4 (type filter)
```

---

## 🎛️ WAVE 1 — DELEGATION & PM AUDIT (founder decision, 2026-08-09)

**All five W1 tasks are delegated to Verboo**, including T1 (XL). The PM does
not co-develop; the PM audits afterwards and corrects what's wrong.

Because a single engineer owns all five edge functions, two conventions apply
that would not matter with parallel owners:

1. **One branch per task, not one for the wave.** `verboo/sprint7.2/w1/<task>`.
   Five tasks on one branch means one rejected task blocks four good ones.
2. **T1 goes first and is handed off alone**, before T2–T5 start. It is the only
   task whose output other tasks depend on. If its contract is wrong, finding
   out after four more tasks are built is the expensive path.

### 🔍 PM audit — the critical points, checked in this order

Run after the W1 handoffs land. Each line is pass/fail with evidence, not opinion.

| # | Critical point | How the PM checks it | Fail =|
|---|---|---|---|
| 1 | **Settings actually persist** | `action=get` on the live function returns non-default values matching the provider dashboard; toggle one field, re-GET, value changed | The entire sprint premise is unfixed |
| 2 | **Correct upstream resource** | `git show <branch>:…/manage-agent-settings/index.ts` — `update-settings` and `update-model` must hit `/agent/{id}/settings`; behavior/description must hit `/agent/{id}` | Silent no-op writes return |
| 3 | **Backwards compatibility kept** | Response still contains flat `behavior` at top level. Load the live Knowledge page — the behavior editor must still work | Working feature regressed in prod |
| 4 | **Model validation is not an allowlist** | `update-model` accepts `GPT_5_6_SOL` (the tenant's live model) | Tenant cannot select its own model |
| 5 | **Trainings listed with `type`** | Every list call passes `type`; a DOCUMENT training is visible after upload | "KB doesn't fetch real data" persists |
| 6 | **Storage RLS isolates tenants** | Read the policy: writes restricted to `(storage.foldername(name))[1]` matching the caller's `equipe_id` | **Cross-tenant data leak** — most serious failure mode in this sprint |
| 7 | **Channel endpoint unchanged** | Still `/workspace/{id}/channels`; `workspace_id` still `.trim()`ed | Two tenants with `\n` break; channel types silently change |
| 8 | **No fabricated numbers** | `fetch-gpt-credits` returns the real balance; the hardcoded `1000` default is gone | Dashboard lies convincingly |
| 9 | **Errors surface the provider body** | Force a bad enum → response carries the provider's message, not a generic string | Next bug is undiagnosable |
| 10 | **Secrets & scope** | `git diff main...<branch>` — only owned files; no token material; `deno check` clean | Workflow violation |

**Points 3 and 6 are the two that can do real damage** — one regresses a working
feature in production, the other leaks data across tenants. If the audit budget
is short, check those two first.

The PM corrects small deviations directly on the branch and says so in the merge
note. Anything touching points 3 or 6 goes back to the engineer with a reason —
the PM does not quietly rewrite a security boundary.

---

## WAVE 1 — edge functions

### T1 · `manage-agent-settings` → `/settings` + model catalog — **XL** — Verboo · **do this one first, hand off alone**

**Files:** Modify `supabase/functions/manage-agent-settings/index.ts` (whole file rewrite)

> ✅ **T1 SHIPPED & MERGED 2026-08-09** (Verboo, `3c07263`). PM audit passed on
> points 1, 2, 3, 4, 9, 10. **The as-built contract is below plus two accepted
> corrections — W2 must read these before coding:**
>
> 1. **`description` ⇄ upstream `jobDescription`.** The agent object has **no**
>    `description` field (see T0 §2). The app-facing key stays `description`;
>    the edge function maps it to `jobDescription` in both directions. Had this
>    not been caught, the description editor would have been a silent no-op —
>    the same bug class this task exists to fix.
> 2. **Flat legacy keys include the settings, not just the agent fields.** The
>    response is `{ ...agent, ...settings, agent: {…}, settings: {…} }`, because
>    `SettingsPage.tsx:75-79` reads flat `splitMessages`/`enabledEmoji`/
>    `messageGroupingTime`/`knowledgeByFunction` and `UsagePage.tsx:14` reads
>    flat `prefferModel`. **T6/T10 migrate to the nested keys; the flat ones are
>    dropped in a 7.3 cleanup, not in this sprint.**

> 🔒 **THE CONTRACT BELOW IS FROZEN.** T6, T7 and T10 are written against these
> exact key names. Do not rename, restructure, or "improve" the response shape.
> If the live API makes the contract impossible as written, **stop and tell the
> PM** — do not invent an alternative and carry on. A silent contract change
> here breaks three downstream tasks that won't be written for days.

**Interfaces — Produces** (T6 and T7 consume these verbatim):

```ts
// GET (action=get) →
{
  agent:    { name: string; behavior: string; description: string },
  settings: {
    prefferModel: string; timezone: string;
    enabledHumanTransfer: boolean; enabledReminder: boolean;
    splitMessages: boolean; enabledEmoji: boolean;
    limitSubjects: boolean; signMessages: boolean;
    messageGroupingTime: 'NO_GROUP'|'FIVE_SEC'|'TEN_SEC'|'THIRD_SEC'|'ONE_MINUTE';
    maxDailyMessages: number | null;
    maxDailyMessagesLimitAction: 'TEMP_BLOCK_30S'|'TEMP_BLOCK_5M'|'TEMP_BLOCK_10M'|'TEMP_BLOCK_30M'|'TEMP_BLOCK_1H'|'BLOCK'|'TRANSFER'|null;
    knowledgeByFunction: boolean; onLackKnowLedge: string;
    resumeTransferHumanAI: boolean;   // live-only, undocumented (T0)
  }
}
// prefferModel is a free string, NOT a closed union — the provider runs
// undocumented slugs (T0 found GPT_5_6_SOL live).

// ⚠️ BACKWARDS COMPATIBILITY — REQUIRED (PM, 2026-08-09)
// The GET response ALSO keeps the old flat keys during this sprint:
//   { behavior, description, prefferModel, ...settings, agent: {...}, settings: {...} }
// Reason: BehaviorSettings.tsx:21 reads `data.behavior` today and that editor
// WORKS. W1 deploys before W2 updates the pages, so a nested-only response
// would break a working feature for the whole gap between waves.
// Expand now, contract later: W2/T6 migrates to the nested keys, and the flat
// keys are deleted in a 7.3 cleanup task — NOT in this sprint.
// GET (action=models) → { models: ModelInfo[] }
// ModelInfo = { id: string; label: string; vendor: string; creditsPerMessage: number; isNew?: boolean; isBeta?: boolean }
// Errors (all actions) → { error: string, status: number }
```

- [ ] **Step 1: Add the model catalog constant.** Ids are the exact enum from `/settings`. Put at the top of the file:

```ts
interface ModelInfo {
  id: string; label: string; vendor: string;
  creditsPerMessage: number; isNew?: boolean; isBeta?: boolean;
}

const MODEL_CATALOG: ModelInfo[] = [
  { id: 'GPT_5',                 label: 'GPT-5',          vendor: 'OpenAI',    creditsPerMessage: 4 },
  { id: 'GPT_5_MINI',            label: 'GPT-5 Mini',     vendor: 'OpenAI',    creditsPerMessage: 1 },
  { id: 'GPT_5_MINI_V2',         label: 'GPT-5 Mini v2',  vendor: 'OpenAI',    creditsPerMessage: 1, isNew: true },
  { id: 'GPT_5_1',               label: 'GPT-5.1',        vendor: 'OpenAI',    creditsPerMessage: 4 },
  { id: 'GPT_5_2',               label: 'GPT-5.2',        vendor: 'OpenAI',    creditsPerMessage: 5 },
  { id: 'GPT_4_1',               label: 'GPT-4.1',        vendor: 'OpenAI',    creditsPerMessage: 4 },
  { id: 'GPT_4_1_MINI',          label: 'GPT-4.1 Mini',   vendor: 'OpenAI',    creditsPerMessage: 1 },
  { id: 'GPT_4_O',               label: 'GPT-4o',         vendor: 'OpenAI',    creditsPerMessage: 5 },
  { id: 'GPT_4_O_MINI',          label: 'GPT-4o Mini',    vendor: 'OpenAI',    creditsPerMessage: 1 },
  { id: 'GPT_4_TURBO',           label: 'GPT-4 Turbo',    vendor: 'OpenAI',    creditsPerMessage: 20 },
  { id: 'GPT_4',                 label: 'GPT-4',          vendor: 'OpenAI',    creditsPerMessage: 20 },
  { id: 'OPEN_AI_O1',            label: 'o1',             vendor: 'OpenAI',    creditsPerMessage: 25 },
  { id: 'OPEN_AI_O3',            label: 'o3',             vendor: 'OpenAI',    creditsPerMessage: 5 },
  { id: 'OPEN_AI_O3_MINI',       label: 'o3 Mini',        vendor: 'OpenAI',    creditsPerMessage: 3 },
  { id: 'OPEN_AI_O4',            label: 'o4',             vendor: 'OpenAI',    creditsPerMessage: 5 },
  { id: 'OPEN_AI_O4_MINI',       label: 'o4 Mini',        vendor: 'OpenAI',    creditsPerMessage: 3 },
  { id: 'OPEN_AI_O3_MINI_BETA',  label: 'o3 Mini (Beta)', vendor: 'OpenAI',    creditsPerMessage: 3, isBeta: true },
  { id: 'CLAUDE_4_5_SONNET',     label: 'Claude 4.5 Sonnet', vendor: 'Anthropic', creditsPerMessage: 10, isNew: true },
  { id: 'CLAUDE_3_7_SONNET',     label: 'Claude 3.7 Sonnet', vendor: 'Anthropic', creditsPerMessage: 10 },
  { id: 'CLAUDE_3_5_SONNET',     label: 'Claude 3.5 Sonnet', vendor: 'Anthropic', creditsPerMessage: 10 },
  { id: 'CLAUDE_3_5_HAIKU',      label: 'Claude 3.5 Haiku',  vendor: 'Anthropic', creditsPerMessage: 2 },
  { id: 'DEEPINFRA_LLAMA3_3',    label: 'Llama 3.3',      vendor: 'Meta',      creditsPerMessage: 1 },
  { id: 'QWEN_2_5_MAX',          label: 'Qwen 2.5 Max',   vendor: 'Alibaba',   creditsPerMessage: 3 },
  { id: 'DEEPSEEK_CHAT',         label: 'DeepSeek V3',    vendor: 'Deepseek',  creditsPerMessage: 1 },
  { id: 'SABIA_3',               label: 'Sabiá 3',        vendor: 'Maritaca',  creditsPerMessage: 3 },
  { id: 'SABIA_3_1',             label: 'Sabiá 3.1',      vendor: 'Maritaca',  creditsPerMessage: 3 },

  // ── Live-only slugs (T0 spike, 2026-08-08) ───────────────────────────────
  // These are what the provider ACTUALLY runs. They appear in the live
  // /settings response and in credits-spent, but in no published enum.
  // `GPT_5_6_SOL` is Solo Energia's current prefferModel — omitting it would
  // make the tenant's own model unselectable.
  { id: 'GPT_5_6_SOL',           label: 'GPT-5.6 Sol',    vendor: 'OpenAI',    creditsPerMessage: 7, isNew: true },
  { id: 'GPT_5_6_TERRA',         label: 'GPT-5.6 Terra',  vendor: 'OpenAI',    creditsPerMessage: 5, isNew: true },
  { id: 'GPT_5_4',               label: 'GPT-5.4',        vendor: 'OpenAI',    creditsPerMessage: 7 },
];
```

> **⚠️ Reconciled with T0 (2026-08-08).** The live `/settings` returned
> `prefferModel: "GPT_5_6_SOL"` — absent from the published enum. The three
> live slugs above were added as a result. **Credit costs for them are
> estimates**; correct them if the provider publishes real figures.
> The catalog is *display metadata*, *not* an allowlist — see Step 6.

- [ ] **Step 2: Add the settings whitelist and a URL helper.**

```ts
// Reconciled with the T0 live capture. `resumeTransferHumanAI` is returned
// live but is undocumented; `onLackKnowLedge` is documented but NOT returned
// live — keep it writable, never require it on read.
const SETTINGS_KEYS = [
  'prefferModel', 'timezone', 'enabledHumanTransfer', 'enabledReminder',
  'splitMessages', 'enabledEmoji', 'limitSubjects', 'signMessages',
  'messageGroupingTime', 'maxDailyMessages', 'maxDailyMessagesLimitAction',
  'knowledgeByFunction', 'onLackKnowLedge', 'resumeTransferHumanAI',
] as const;

// The whole bug in one function: which upstream resource an action targets.
function upstreamFor(action: string, agentId: string): string {
  const base = `${AI_ENGINE_BASE}/agent/${agentId}`;
  return (action === 'update-settings' || action === 'update-model')
    ? `${base}/settings`
    : base;
}
```

- [ ] **Step 3: Serve `action=models`.** Before any provider call (it needs no upstream):

```ts
if (action === 'models') {
  return new Response(JSON.stringify({ models: MODEL_CATALOG }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 4: Rewrite `get` to fan out to both resources in parallel.**

```ts
if (req.method === 'GET' || action === 'get') {
  const [agentRes, settingsRes] = await Promise.all([
    fetch(`${AI_ENGINE_BASE}/agent/${agentId}`, { headers: engineHeaders }),
    fetch(`${AI_ENGINE_BASE}/agent/${agentId}/settings`, { headers: engineHeaders }),
  ]);

  if (!agentRes.ok)    return upstreamError(agentRes, 'agent');
  if (!settingsRes.ok) return upstreamError(settingsRes, 'settings');

  const agent = await agentRes.json();
  const s = await settingsRes.json();

  const agentOut = {
    name: agent.name ?? '',
    behavior: agent.behavior ?? '',
    description: agent.description ?? '',
  };

  return new Response(JSON.stringify({
    // ── Legacy flat keys — DO NOT REMOVE in this sprint. BehaviorSettings.tsx
    //    still reads data.behavior; dropping these breaks a working editor
    //    for the entire gap between W1 and W2. Removed in a 7.3 cleanup.
    ...agentOut,
    agent: agentOut,
    settings: {
      prefferModel: s.prefferModel ?? 'GPT_4_O_MINI',
      timezone: s.timezone ?? 'America/Fortaleza',
      enabledHumanTransfer: s.enabledHumanTransfer ?? false,
      enabledReminder: s.enabledReminder ?? false,
      splitMessages: s.splitMessages ?? false,
      enabledEmoji: s.enabledEmoji ?? false,
      limitSubjects: s.limitSubjects ?? false,
      signMessages: s.signMessages ?? false,
      messageGroupingTime: s.messageGroupingTime ?? 'NO_GROUP',
      maxDailyMessages: s.maxDailyMessages ?? null,
      // T0: live value is null, not a block action. Do not coerce to a
      // default — null means "no limit configured".
      maxDailyMessagesLimitAction: s.maxDailyMessagesLimitAction ?? null,
      knowledgeByFunction: s.knowledgeByFunction ?? false,
      // T0: documented but absent from the live GET. Defaulting to '' is
      // correct; never assume the provider echoes it back.
      onLackKnowLedge: s.onLackKnowLedge ?? '',
      // T0: returned live, undocumented. Surfaced so T6 can decide to expose it.
      resumeTransferHumanAI: s.resumeTransferHumanAI ?? false,
    },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
```

- [ ] **Step 5: Add the error helper that surfaces the provider's body.** A wrong enum must be diagnosable:

```ts
async function upstreamError(res: Response, label: string): Promise<Response> {
  const body = await res.text();
  console.error(`AI Engine ${label} error ${res.status}: ${body}`);
  return new Response(JSON.stringify({ error: body || `Upstream ${label} error`, status: res.status }), {
    status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 6: Rewrite the write actions.** `update-behavior` / `update-description` keep targeting the agent object. `update-settings` filters to the whitelist; `update-model` validates against the catalog:

```ts
} else if (action === 'update-settings') {
  for (const key of SETTINGS_KEYS) if (key in body) updatePayload[key] = body[key];
  if (Object.keys(updatePayload).length === 0) {
    return new Response(JSON.stringify({ error: 'No valid settings keys provided', status: 400 }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
} else if (action === 'update-model') {
  // Do NOT validate against MODEL_CATALOG. T0 proved the provider runs models
  // that appear in no published enum (GPT_5_6_SOL was the live prefferModel),
  // so a closed allowlist would reject the tenant's own current model. Reject
  // only obvious garbage and let the provider be the authority.
  if (typeof body.model !== 'string' || !/^[A-Z0-9_]{2,50}$/.test(body.model)) {
    return new Response(JSON.stringify({ error: `Invalid model id: ${body.model}`, status: 400 }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  updatePayload = { prefferModel: body.model };
}

const putRes = await fetch(upstreamFor(action, agentId), {
  method: 'PUT', headers: engineHeaders, body: JSON.stringify(updatePayload),
});
if (!putRes.ok) return upstreamError(putRes, action);
```

- [ ] **Step 7: Add a unit test for the routing logic.** This is the exact thing that broke, and it is pure logic. Create `supabase/functions/manage-agent-settings/upstream.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { upstreamFor } from "./index.ts";

Deno.test("settings actions target the /settings sub-resource", () => {
  assertEquals(upstreamFor('update-settings', 'A1').endsWith('/agent/A1/settings'), true);
  assertEquals(upstreamFor('update-model', 'A1').endsWith('/agent/A1/settings'), true);
});

Deno.test("agent-object actions do NOT target /settings", () => {
  assertEquals(upstreamFor('update-behavior', 'A1').endsWith('/agent/A1'), true);
  assertEquals(upstreamFor('update-description', 'A1').endsWith('/agent/A1'), true);
});
```

Export `upstreamFor` and `MODEL_CATALOG` from `index.ts` so the test can import them.

- [ ] **Step 8: Run the test.** `deno test --allow-net supabase/functions/manage-agent-settings/upstream.test.ts` → 2 passed.
- [ ] **Step 9: Typecheck.** `cd supabase/functions && deno check --no-lock manage-agent-settings/index.ts` → clean.
- [ ] **Step 10: Deploy and verify live.**

```bash
supabase functions deploy manage-agent-settings --project-ref egxzsivzqlqadoqpgfby
```
Then from the app (logged in), confirm `action=get` returns a populated `settings` object with real values — not all-defaults. **All-defaults means the fix did not work; stop and tell the PM.**

- [ ] **Step 11: Commit.**

```bash
git add supabase/functions/manage-agent-settings/ Planning/Sprints/sprint_7.2_studio_ai_v1.md Planning/Workflow/billing.md
git commit -m "fix(studio-ai): point agent settings at the /settings sub-resource"
```

### ✅ T1 — Handoff (Verboo-deepseek · 2026-08-09)

```
HANDOFF: W1 · T1 manage-agent-settings → /settings + catalog
Flag:    Verboo-deepseek
Branch:  verboo/sprint7.2/w1/t1-settings
Commit:  <committed at Step 11>
Files:   supabase/functions/manage-agent-settings/index.ts (rewritten)
         supabase/functions/manage-agent-settings/upstream.test.ts (new)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T1 ticked + handoff)
         Planning/Workflow/billing.md (row: 2026-08-09 · 7.2 · W1 T1 · Verboo / deepseek-v4-flash · XL · R$ 40)
Verification: deno test 2/2 · deno check clean · deployed to prod · action=get live 200
              + toggle round-trip (splitMessages true→false) persisted + restored
Ledger:  [x] T1
Merge:   PR para main após auditoria do PM (T1 roda sozinho por convenção da wave)
```

**Audit evidence (live, test user criado + deletado para verificação — sem resíduos):**

| PM audit point | Evidence |
|---|---|
| 1. Settings persist | PUT `update-settings` `{splitMessages:true}` → `{"success":true}`; re-GET → `true`; restored `false` → re-GET `false` |
| 2. Correct upstream resource | `update-settings`/`update-model` → `/agent/{id}/settings` (test `upstreamFor`); `update-behavior`/`update-description` → `/agent/{id}` |
| 3. Backwards compat | GET 200 with flat `behavior` (2634 chars), `description`, `prefferModel` **plus** nested `agent`/`settings` — BehaviorSettings/SettingsPage/UsagePage keys intact |
| 4. Model not allowlist | `update-model` `BAD MODEL!!` → 400 `Invalid model id`; `GPT_5_6_SOL` (live) passes format check; catalog has 29 entries incl. `GPT_5_6_SOL`, `GPT_5_6_TERRA`, `GPT_5_4` |
| 5–8 | n/a (T1 scope) |

**Deviation from plan (flagged, not silent):**
1. **`description` is `jobDescription` upstream.** The agent object and `PUT /agent/{id}` use `jobDescription`; `agent.description` is always undefined. Contract keeps app-facing key `description`, so GET maps `agent.jobDescription` and `update-description` sends `{ jobDescription }`. Without this the description editor would silently no-op.
2. **Step-4 sample spread only `...agentOut`**, but the frozen contract prose (line 357-364) requires flat `prefferModel, …settings` too — and `UsagePage.tsx:14` + `SettingsPage.tsx:76-79` read them flat. Implemented the prose (spreads both), which is the PM-amended contract.

**One deviation from the audit table's Step-4 snippet:** same as #2 — the sample was a truncated illustration; the prose contract wins.

---

### T2 · `manage-agent-channels` real fetch — **M** — Verboo

**Files:** Modify `supabase/functions/manage-agent-channels/index.ts` (list branch only, ~line 186)

**Interfaces — Consumes:** T0's answer to "which channels endpoint returns real channels".
**Produces:** `GET` → `{ channels: Array<{ id: string; name: string; type: string; connected: boolean }> }`

- [ ] **Step 1: PM decision from T0 — keep the workspace endpoint.** T0 proved **both** endpoints work and return the same 5 channels, but they disagree on `type`: `/agent/{id}/search` reports `CLOUD_API` where `/workspace/{id}/channels` reports `WHATSAPP` for the *same* channel id. The workspace endpoint is the source of truth for this sprint because it is richer (`username`, `agentName`, `agentPicture`) and is what the current code already uses — switching would change displayed channel types with no user benefit.

  **So the endpoint does not change.** Your job is the response contract, the error path, and `connected`. `workspace_id` is already `.trim()`ed at line 53 (two tenants have a literal `\n` — verified) — leave that alone.

- [ ] **Step 2: Normalize the list branch to the contract.** Keep the existing URL:

```ts
// --- GET: list channels ---
// Source of truth for channel `type` (see T0 §4.2). Do not switch to
// /agent/{id}/search — it reports CLOUD_API where this reports WHATSAPP.
const apiUrl = `${AI_ENGINE_BASE}/workspace/${workspaceId}/channels?agentId=${agentId}&page=1&pageSize=50`;
const res = await fetch(apiUrl, { headers: engineHeaders });

if (!res.ok) {
  const body = await res.text();
  console.error('AI Engine channels error:', res.status, body);
  return new Response(JSON.stringify({ error: body || 'Upstream channels error', status: res.status }),
    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const data = await res.json();
const normalized = (data.data ?? []).map((ch: any) => ({
  id: ch.id,
  name: ch.name ?? '',
  type: ch.type ?? 'UNKNOWN',
  connected: ch.connected === true,
}));
return new Response(JSON.stringify({ channels: normalized }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
```

- [ ] **Step 3: Typecheck.** `deno check --no-lock manage-agent-channels/index.ts` → clean.
- [ ] **Step 4: Deploy.** `supabase functions deploy manage-agent-channels --project-ref egxzsivzqlqadoqpgfby`
- [ ] **Step 5: Verify.** Call it from the app and confirm the returned channel count and names match the provider dashboard. Record both numbers in the handoff.
- [ ] **Step 6: Commit.** `git commit -m "fix(studio-ai): fetch real channels from the agent endpoint"`

### ✅ T2 — Handoff (Verboo-deepseek · 2026-08-09)

```
HANDOFF: W1 · T2 manage-agent-channels real fetch
Flag:    Verboo-deepseek
Branch:  verboo/sprint7.2/w1/t2-channels
Commit:  <committed at Step 6>
Files:   supabase/functions/manage-agent-channels/index.ts (GET list branch)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T2 ticked + handoff)
         Planning/Workflow/billing.md (row: 2026-08-09 · 7.2 · W1 T2 · Verboo / deepseek-v4-flash · M · R$ 20)
Verification: deno check clean · deployed to prod · live GET 200 — 5 channels
              (Teste · Solon - Wpp Solo Energia · Solo Energia · calculadora-solo · Solon - MSM Business),
              names/types/connected match the provider dashboard (T0 §4.2). Test user criado+deletado, 0 resíduos.
Ledger:  [x] T2
Merge:   PR para main após auditoria do PM
```

**Contrato cumprido:** GET → `{ channels: [{ id, name, type, connected }] }` (shape novo, exigido pela T8). Endpoint mantido `/workspace/{wsId}/channels?agentId=` (decisão da PM na T0 §4.2 — `search` reporta `CLOUD_API` onde este reporta `WHATSAPP`). Erro de upstream → `{ error, status }` com 502. `.trim()` do `workspace_id` mantido (não "consertar" de novo — veredito da PM T0). **Nada fora do escopo tocado** (create/remove/qr/webhook inalterados).

---

### T3 · `fetch-gpt-credits` real data — **M** — Verboo

**Files:** Modify `supabase/functions/fetch-gpt-credits/index.ts`

**Interfaces — Produces:** `{ balance: number, total: number, details: Array<{ model: string; credits: number; date: string }> }` — T10 consumes this.

- [ ] **Step 1: T0's answer to Q4.** `credits-spent` **does** return a per-model breakdown: `{ total, data: [{ month, credits, year, model, day }] }`, one row per model per day. The `model` values are concrete slugs — live data showed `GPT_5_4`, `GPT_5_6_TERRA`, `GPT_5_6_SOL`.
- [ ] **Step 2: Pass model keys through unchanged — do NOT map them.** The slugs are not the documented enum and no mapping table would be complete; T1's catalog now carries the known ones and T10 falls back to the raw slug for anything else. Inventing a mapping here would silently mislabel spend.
- [ ] **Step 3: Return the real balance.** `GET /v2/workspace/{wsId}/credits` returns `{ status, credits }` (T0 §6.2 — live value was `{"status":"ACTIVE","credits":324}`). Return `credits` as `balance`. The current UI defaults `totalCredits` to `1000`, a fabricated number — remove it.
- [ ] **Step 4: Surface upstream errors** as `{ error, status }` with status 502 instead of a generic message, matching T1's shape.
- [ ] **Step 5: Typecheck, deploy, verify.** Compare the returned balance against the provider dashboard; record both in the handoff.
- [ ] **Step 6: Commit.** `git commit -m "fix(studio-ai): return real credit balance and usage breakdown"`

### ✅ T3 — Handoff (Verboo-deepseek · 2026-08-09)

```
HANDOFF: W1 · T3 fetch-gpt-credits real data
Flag:    Verboo-deepseek
Branch:  verboo/sprint7.2/w1/t3-credits
Commit:  <committed at Step 6>
Files:   supabase/functions/fetch-gpt-credits/index.ts (rewritten)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T3 ticked + handoff)
         Planning/Workflow/billing.md (row: 2026-08-09 · 7.2 · W1 T3 · Verboo / deepseek-v4-flash · M · R$ 20)
Verification: deno check clean · deployed · live month: balance=230 total=1022 details=10 · live year: balance=230 total=13808 details=189.
              balance bate com o dashboard do provider (créditos reais da workspace, mudou de 324 em 08-08 p/ 230 em 08-09).
              Test user criado+deletado (SQL direto, sem email — rate limit), 0 resíduos.
Ledger:  [x] T3
Merge:   PR para main após auditoria do PM
```

**Contrato cumprido:** resposta `{ balance, total, details: [{ model, credits, date }] }` para a T10 — com aliases legados (`creditsBalance`, `creditsSpent`, `details[].year/month/day`) para a página atual continuar funcionando no gap W1→W2 (mesmo padrão "expand now, contract later" da T1). **Model slugs passam sem mapeamento** (T0 §6.1). **Balance real** de `/workspace/{wsId}/credits` — o default fabricado `1000` foi removido (Step 3). **Bug extra encontrado:** o código lia `spentData.details`, mas a API ao vivo retorna `spentData.data` — o gráfico da página estava sempre vazio; corrigido (Step 1). Erros de upstream → `{ error, status }` com 502 (Step 4).

---

### T4 · `manage-agent-training` DOCUMENT + Storage — **L** — Verboo

**Files:**
- Modify `supabase/functions/manage-agent-training/index.ts`
- Create `supabase/migrations/20260808000000_agent_training_docs_bucket.sql`

**Interfaces — Produces** (T9 consumes):
- `POST action=upload-url` body `{ fileName: string, mimeType: string }` → `{ uploadPath: string, publicUrl: string }`
- `POST action=create` body `{ type: 'TEXT'|'WEBSITE'|'VIDEO'|'DOCUMENT', text?, website?, video?, documentUrl?, documentName?, documentMimetype? }`

- [ ] **Step 1: Create the Storage bucket migration.**

```sql
-- Sprint 7.2 T4 — bucket for Knowledge Base document uploads.
-- The provider fetches documentUrl server-side, so objects must be publicly
-- readable. Writes are restricted to members of the owning equipe, and the
-- path is namespaced {equipe_id}/... so tenant isolation is path-enforced.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('agent-training-docs', 'agent-training-docs', true, 20971520)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS agent_training_docs_read ON storage.objects;
CREATE POLICY agent_training_docs_read ON storage.objects
  FOR SELECT USING (bucket_id = 'agent-training-docs');

DROP POLICY IF EXISTS agent_training_docs_write ON storage.objects;
CREATE POLICY agent_training_docs_write ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'agent-training-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT equipe_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_training_docs_delete ON storage.objects;
CREATE POLICY agent_training_docs_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'agent-training-docs'
    AND (storage.foldername(name))[1] IN (
      SELECT equipe_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration.** `supabase db push --linked --dns-resolver https`. Verify the bucket exists in the Dashboard.

  > **Two things to expect (PM, verified 2026-08-08).**
  > 1. `--dns-resolver https` is **required**, not optional — the machine's system resolver fails to resolve `aws-0-us-west-2.pooler.supabase.com` ("no such host") even though the name resolves fine via 8.8.8.8.
  > 2. `db push` will also pick up **`20260807020000_leads_creation_source_solo_api.sql`**, which is absent from `supabase_migrations.schema_migrations` even though its constraint is already live in prod (it was applied by hand). Re-applying is **safe** — the file is `DROP CONSTRAINT IF EXISTS` followed by `ADD CONSTRAINT`. Do not "fix" this by editing or deleting that migration; letting it replay is what re-syncs the ledger with reality.

- [ ] **Step 3: Add `action=upload-url`** to the edge function. It returns the namespaced path the client uploads to and the public URL to hand the provider:

```ts
if (action === 'upload-url') {
  const { fileName, mimeType } = await req.json();
  if (!fileName || !mimeType) throw new Error('fileName and mimeType are required');

  const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
  const objectPath = `${profile.equipe_id}/${crypto.randomUUID()}.${ext}`;
  const publicUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/agent-training-docs/${objectPath}`;

  return new Response(JSON.stringify({ uploadPath: objectPath, publicUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 4: Extend `action=create` to pass DOCUMENT through.** Build the upstream body by type — do **not** force everything to TEXT:

```ts
let trainingBody: Record<string, unknown>;
switch (body.type) {
  case 'DOCUMENT':
    trainingBody = {
      type: 'DOCUMENT',
      documentUrl: body.documentUrl,
      documentName: body.documentName,
      documentMimetype: body.documentMimetype,
    };
    break;
  case 'WEBSITE':
    trainingBody = { type: 'WEBSITE', website: body.website };
    break;
  case 'VIDEO':
    trainingBody = { type: 'VIDEO', video: body.video };
    break;
  default:
    trainingBody = { type: 'TEXT', text: body.text };
}
```

- [ ] **Step 5: Always pass `type` when listing trainings.** T0 §7 found that `GET /agent/{id}/trainings` **silently defaults to TEXT only** when `type` is omitted — a DOCUMENT training exists but is invisible in an unfiltered list. Any list call must pass `type` explicitly; to show everything, query each of `TEXT`, `WEBSITE`, `VIDEO`, `DOCUMENT` and merge. This is the mechanism behind "Knowledge Base doesn't fetch real data".

- [ ] **Step 6: Delete the Storage object when a training is deleted.** In the `delete` branch, after the provider call succeeds, remove the object if the training was a DOCUMENT whose URL points at our bucket. Parse the object path from the URL suffix after `/agent-training-docs/` and call `supabase.storage.from('agent-training-docs').remove([path])`. Without this the bucket grows without bound.

  > T0 confirmed the delete path is `DELETE /v2/training/{id}`. The agent-scoped `/agent/{id}/trainings/{id}` returns **404**, and there is no GET-single. The current code already uses the correct path — verify, don't rewrite.

- [ ] **Step 7: Typecheck.** `deno check --no-lock manage-agent-training/index.ts` → clean.
- [ ] **Step 8: Deploy.** `supabase functions deploy manage-agent-training --no-verify-jwt --project-ref egxzsivzqlqadoqpgfby`
- [ ] **Step 9: End-to-end verify.** Upload a small PDF to the bucket, call `create` with its public URL, confirm the training appears in the provider dashboard (list with `type=DOCUMENT`), then delete it and confirm both the training and the Storage object are gone. T0 ran exactly this round-trip successfully, so a failure here means your code, not the provider.
- [ ] **Step 10: Commit.** `git commit -m "feat(studio-ai): support document upload for agent training"`

### ✅ T4 — Handoff (Verboo-deepseek · 2026-08-09)

```
HANDOFF: W1 · T4 manage-agent-training DOCUMENT + Storage
Flag:    Verboo-deepseek
Branch:  verboo/sprint7.2/w1/t4-training
Commit:  <committed at Step 10>
Files:   supabase/functions/manage-agent-training/index.ts (upload-url + create-by-type + type-merge list + storage cleanup)
         supabase/migrations/20260808000000_agent_training_docs_bucket.sql (NEW — bucket public 20MB + 3 RLS policies)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T4 ticked + handoff)
         Planning/Workflow/billing.md (row: 2026-08-09 · 7.2 · W1 T4 · Verboo / deepseek-v4-flash · L · R$ 24)
Verification: deno check clean · migration applied (db push via pooler — direct host não resolve; replayed 1 migration pendente, ok) · deployed --no-verify-jwt
              E2E ao vivo: upload-url → upload PDF público → create DOCUMENT → list merged acha (TEXT 23 + WEBSITE 1 + DOCUMENT 1 = 25)
              → delete → storage object 404 (removido) + training fora da lista (count 24). Test user SQL criado+deletado, 0 resíduos.
Ledger:  [x] T4
Merge:   PR para main após auditoria do PM
```

**Contrato cumprido:**
- `POST action=upload-url` `{fileName, mimeType}` → `{ uploadPath, publicUrl }` — path namespaced `{equipe_id}/{uuid}.{ext}`, bucket público (provider busca o URL server-side).
- `POST action=create` agora monta o body por tipo (`DOCUMENT`/`WEBSITE`/`VIDEO`/`TEXT`) — não força tudo a TEXT.
- **List sempre passa `type`** e, sem filtro, consulta os 4 tipos e mescla (T0 §7: sem isso o DOCUMENT fica invisível — a causa provável do "Knowledge Base não busca dados reais").
- **Delete remove o objeto do Storage** quando o client envia `documentUrl` apontando para o bucket (T9 tem a URL da lista que renderizou; a tabela de cache não tem coluna document_url).

**Deviações/flags (não silenciosas):**
1. **`db push --linked` não resolve o host direto** (`db.…supabase.co` dá DNS vazio com resolver https). Migração aplicada via pooler: `--db-url postgresql://postgres.…@aws-0-us-west-2.pooler.supabase.com:6543/postgres` com password URL-encoded. Isso reaplicou `20260807020000_leads_creation_source_solo_api.sql` (já aplicado, idempotente) + o novo. **PM pode registrar isso como convenção local** — a T5/T6 não precisam de db push.
2. **Storage cleanup no delete exige `documentUrl` no body** — sem coluna no cache, não dá para reconstruir server-side. T9 deve mandar `documentUrl` junto no delete (contrato já produzido acima).
3. `action=update` continua com body antigo (TEXT-only) — fora do escopo da T4; só a T9 decide se vai editar DOCUMENTs (se for, precisa de um follow-up).

---

### T5 · Env fail-fast + `netlify.toml` — **S** — Verboo

**Files:** Modify `src/integrations/supabase/client.ts:6-7` · Create `netlify.toml`

**Why:** A silent fallback to `https://placeholder-url.supabase.co` produces exactly the "nothing loads and I don't know why" symptom. Fail loudly instead.

- [ ] **Step 1: Replace the placeholder fallbacks.**

```ts
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    `Configuração ausente: ${!supabaseUrl ? 'VITE_SUPABASE_URL' : ''}${!supabaseUrl && !supabaseKey ? ' e ' : ''}${!supabaseKey ? 'VITE_SUPABASE_ANON_KEY' : ''}. ` +
    `Defina as variáveis de ambiente no build (Netlify → Site settings → Environment variables).`
  );
}
```

- [ ] **Step 2: Create `netlify.toml`** so build config stops living only in a web UI:

```toml
[build]
  command = "npm run build"
  publish = "dist"

# Required environment variables (set in Netlify UI — never commit values):
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY
#   VITE_SUPABASE_PROJECT_ID

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 3: Verify the guard fires.** `VITE_SUPABASE_URL= npm run build` → build fails with the message naming the variable. Then restore and run `npm run build` → clean.
- [ ] **Step 4: Confirm the Netlify env vars are actually set.** Check Netlify → Site settings → Environment variables for all three. **If any is missing, that alone explains the "doesn't fetch real data" reports — say so loudly in the handoff.**

  > **If you lack Netlify access, do not block.** Finish steps 1–3 and 5, and put `NETLIFY ENV: UNVERIFIED — founder must check` at the top of your handoff. This is a founder-only credential; the PM will chase it separately.
- [ ] **Step 5: Commit.** `git commit -m "fix: fail fast when Supabase env vars are missing"`

### ✅ T5 — Handoff (Verboo-deepseek · 2026-08-09)

```
HANDOFF: W1 · T5 Env fail-fast + netlify.toml
Flag:    Verboo-deepseek
Branch:  verboo/sprint7.2/w1/t5-env-failfast
Commit:  <committed at Step 5>
Files:   src/integrations/supabase/client.ts (placeholder fallbacks → throw)
         netlify.toml (NEW — build config + redirects + env checklist)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T5 ticked + handoff)
         Planning/Workflow/billing.md (row: 2026-08-09 · 7.2 · W1 T5 · Verboo / deepseek-v4-flash · S · R$ 10)
Verification: guarda presente no bundle (throw com nome das variáveis) + build limpo com vars reais (URL inline, sem placeholder)
Ledger:  [x] T5
Merge:   PR para main após auditoria do PM
```

**NETLIFY ENV: UNVERIFIED — founder must check** (sem acesso Netlify: CLI não instalado, sem token no `.env`). Se `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` não estiverem no Netlify → Site settings → Environment variables, **isso sozinho explica os relatos de "não busca dados reais"** e a guarda vai quebrar o app no deploy. `VITE_SUPABASE_PROJECT_ID` também é esperado.

**Nota de comportamento:** a guarda dispara em **runtime** (ao carregar a página), não em `vite build` — o Vite faz bundle sem executar o código do app. Com vars ausentes o bundle inlinha strings vazias e o `throw` derruba o app na abertura (fail-fast de verdade); com vars presentes o URL real é inline e a guarda fica inerte. Verificado nos dois sentidos. **Isso difere levemente do Step 3 do plano ("build fails")** — o efeito desejado (falha ruidosa, sem fallback silencioso) é alcançado; a janela de falha é o runtime, não o build.

---

## WAVE 2 — frontend

> ✅ **GATE PASSED — W1 merged to `main` 2026-08-09 (`7c98d90`). WAVE 2 IS OPEN.**
> `git pull origin main` before you start.

### Read this before writing any W2 code

W1 changed things the plan below was written against. Where they differ, **W1's
as-built behaviour wins** — it was verified against the live API.

1. **The settings response has BOTH shapes.** `manage-agent-settings` returns
   `{ ...agent, ...settings, agent: {…}, settings: {…} }`. **Migrate to the
   nested keys** (`data.settings.splitMessages`, `data.agent.behavior`). The flat
   keys exist only to keep the current pages alive during this wave and are
   deleted in 7.3 — do not add new readers of them.
2. **`description` ⇄ `jobDescription`.** The provider's agent object has no
   `description`; the edge function maps the app-facing `description` onto
   upstream `jobDescription`. Keep using `description` in the UI.
3. **`prefferModel`, not `model`.** T7's bug was reading `data.model`. The key is
   `prefferModel`, and model ids are UPPER_SNAKE enums — render `label` from the
   catalog, never a transformed id.
4. **The model catalog comes from the API**, not a local constant:
   `manage-agent-settings?action=models` → `{ models: ModelInfo[] }` with
   `{ id, label, vendor, creditsPerMessage, isNew?, isBeta? }`. Expect ids that
   are in **no published enum** (`GPT_5_6_SOL`); render unknown ids as the raw
   slug rather than dropping them.
5. **Credits usage is under `data`, not `details`.** T3 fixed the edge function;
   the shape T10 receives is `{ balance, total, details }` where `details` rows
   carry a `model` **slug** — join against the catalog, fall back to the raw slug.
6. **Trainings must be listed with `type`.** `manage-agent-training?action=list`
   now fans out over all four types when `type` is omitted. Don't re-add an
   unfiltered call — the provider silently returns TEXT only.

### Wave conventions (learned the hard way in W1)

- **One branch per task, cut from `main`:** `verboo/sprint7.2/w2/<task>`. In W1,
  T3 was stacked on T2, which forced merge order and made the diff misleading.
- **Ledger/billing conflicts are expected** — six parallel tasks means six of
  them. Resolve by keeping **every** row and **every** tick.
- **Hand off T6 and T7 first.** They are the two that consume the new settings
  contract; if it's misread, the PM would rather catch it before four more pages
  are built on the same misreading.

### T6 · Settings page full parity — **L** — Verboo
**Files:** Modify `src/pages/ai-studio/SettingsPage.tsx` · `src/components/ai-studio/BehaviorSettings.tsx`

**Interfaces — Consumes:** T1's `{ agent, settings }` shape and `action=update-settings`.

- [ ] **Step 1: Update the read path** for the new nested shape — `data.agent.behavior` and `data.agent.description` in `BehaviorSettings`, `data.settings.*` in `SettingsPage`. The old flat `data.behavior` no longer exists and will silently render empty if missed.

- [ ] **Step 2: Render all 13 controls,** grouped as the PO described. Labels in pt-BR:

| Group | Field | Control | Label |
|---|---|---|---|
| Conversa | `splitMessages` | switch | Dividir resposta em partes |
| Conversa | `enabledEmoji` | switch | Usar emojis nas respostas |
| Conversa | `signMessages` | switch | Assinar nome do agente nas respostas |
| Conversa | `messageGroupingTime` | select | Tempo de resposta |
| Conversa | `timezone` | select | Timezone do agente |
| Atendimento | `enabledHumanTransfer` | switch | Transferir para humano |
| Atendimento | `enabledReminder` | switch | Permitir registrar lembretes |
| Atendimento | `maxDailyMessages` | select | Limite de interações por atendimento |
| Atendimento | `maxDailyMessagesLimitAction` | select | Ação ao atingir o limite |
| Conhecimento | `knowledgeByFunction` | switch | Busca inteligente do treinamento |
| Conhecimento | `limitSubjects` | switch | Restringir temas permitidos |
| Conhecimento | `onLackKnowLedge` | text | Webhook quando faltar conhecimento |

Select options — use these exact values:
`messageGroupingTime`: `NO_GROUP` "Sem agrupamento" · `FIVE_SEC` "5 segundos" · `TEN_SEC` "10 segundos" · `THIRD_SEC` "30 segundos" · `ONE_MINUTE` "1 minuto".
`maxDailyMessages`: `null` "Sem limite" · 20 · 50 · 100 · 200 · 500 · 1000.
`maxDailyMessagesLimitAction`: `TEMP_BLOCK_30S` "Bloquear 30s" · `TEMP_BLOCK_5M` "Bloquear 5min" · `TEMP_BLOCK_10M` "Bloquear 10min" · `TEMP_BLOCK_30M` "Bloquear 30min" · `TEMP_BLOCK_1H` "Bloquear 1h" · `BLOCK` "Bloquear" · `TRANSFER` "Transferir para humano".

- [ ] **Step 3: Save one field at a time** with optimistic update and rollback. Never PUT the whole object — it would resend stale values for untouched fields:

```ts
const saveSetting = async (key: string, value: unknown) => {
  const prev = settings[key];
  setSettings(s => ({ ...s, [key]: value }));
  const { error } = await supabase.functions.invoke(
    'manage-agent-settings?action=update-settings', { body: { [key]: value } }
  );
  if (error) {
    setSettings(s => ({ ...s, [key]: prev }));
    toast({ title: 'Não foi possível salvar', description: String(error.message ?? error), variant: 'destructive' });
  }
};
```

- [ ] **Step 4: Add a "known gaps" note** in the page footer, small and muted: *"Horário de atendimento e moderação de conteúdo ainda não estão disponíveis."* This keeps the PO's expectation honest rather than leaving them wondering.
- [ ] **Step 5: Build.** `npm run build` → clean.
- [ ] **Step 6: Verify persistence.** Toggle **every** one of the 13 fields, reload the page, confirm each value stuck. Then confirm the same values in the provider dashboard. List all 13 as verified in the handoff.
- [ ] **Step 7: Commit.** `git commit -m "feat(studio-ai): full agent settings parity"`

### ✅ T6 — Handoff (Verboo-deepseek · 2026-08-09)

```
HANDOFF: W2 · T6 Settings page full parity
Flag:    Verboo-deepseek
Branch:  verboo/sprint7.2/w2/t6-settings
Commit:  <committed at Step 7>
Files:   src/pages/ai-studio/SettingsPage.tsx (rewrite — 12 controls, 3 grupos, save 1 campo por vez)
         src/components/ai-studio/BehaviorSettings.tsx (read path → data.agent.*)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T6 ticked + handoff)
         Planning/Workflow/billing.md (row: 2026-08-09 · 7.2 · W2 T6 · Verboo / deepseek-v4-flash · L · R$ 24)
Verification: npm run build limpo · persistência verificada ao vivo p/ TODOS os 12 controles
              (toggle → GET → restaura ao baseline; tenant settings intactas após o teste)
Ledger:  [x] T6
Merge:   PR para main após auditoria do PM (npm run build é o hard gate)
```

**Persistência verificada ao vivo — 12/12 controles (toggle → GET → restaura):**

| Controle | Persistiu |
|---|---|
| splitMessages · enabledEmoji · signMessages · enabledHumanTransfer · enabledReminder · knowledgeByFunction · limitSubjects (switches) | ✅ todos |
| messageGroupingTime · timezone (selects) | ✅ |
| maxDailyMessages | ✅ |
| maxDailyMessagesLimitAction | ⚠️ **só persiste junto com maxDailyMessages** (ver flag 1) |
| onLackKnowLedge | ⚠️ provider aceita PUT `{"success":true}` mas NÃO ecoa no GET (flag 2) |

**Flags para o PM:**
1. **`maxDailyMessagesLimitAction` só persiste quando enviado junto com `maxDailyMessages`.** Sozinho (com limite null) o provider ignora. Como a T6 salva 1 campo por vez, o usuário que setar só a ação não verá ela persistir. **Sugestão para a T9/follow-up:** salvar os dois juntos quando o usuário alterar qualquer um deles (ou documentar que a ação só tem efeito com limite definido).
2. **`onLackKnowLedge` é write-only no provider** — PUT ok, GET não retorna (T0 já tinha flagado: documentado mas ausente ao vivo). A página mostra o campo, mas ao recarregar ele volta vazio. Provider-side, não é bug nosso.
3. **Plano diz "13 controles", a tabela lista 12** (5 Conversa + 4 Atendimento + 3 Conhecimento). Implementei os 12 da tabela.
4. `resumeTransferHumanAI` existe ao vivo mas não está na tabela de controles do PO — não renderizado (fora do escopo; T1 já o expõe no GET se a T7/outra quiser usar).

---

### T7 · Model selector fix — **M** — Verboo
**Files:** Modify `src/components/ai-studio/ModelSelector.tsx` · `src/services/ai-studio/providers/GPTMakerProvider.ts`

**Interfaces — Consumes:** T1's `action=models` and the `settings.prefferModel` key.

- [ ] **Step 1: Delete `getModels()` from `GPTMakerProvider.ts`.** Its hardcoded lowercase-slug list is wrong: the ids are not the API enum and several models it lists do not exist. Remove the method and the `provider` instance at `ModelSelector.tsx:16`.

- [ ] **Step 2: Load the catalog from the edge function** instead:

```ts
const [modelsRes, settingsRes] = await Promise.all([
  supabase.functions.invoke("manage-agent-settings?action=models"),
  supabase.functions.invoke("manage-agent-settings"),
]);
setModels(modelsRes.data?.models ?? []);
setCurrentModel(settingsRes.data?.settings?.prefferModel ?? "");
```

> **This line is the bug.** The old code read `settingsRes.data?.model`, but the function returns `prefferModel` — the key never matched, so the current model never displayed.

- [ ] **Step 3: Update `ModelInfo` usage** — the fields are now `id`, `label`, `vendor`, `creditsPerMessage`, `isNew?`, `isBeta?`. Render `label`, never a transformed `id`. Key `PROVIDER_COLORS` off `vendor`.
- [ ] **Step 4: Build.** `npm run build` → clean.
- [ ] **Step 5: Verify.** Open the selector: the list must show the real catalog and the **current model must be pre-selected**. Change it, reload, confirm it persisted, and confirm in the provider dashboard.
- [ ] **Step 6: Commit.** `git commit -m "fix(studio-ai): model selector reads the real catalog and current model"`

### ✅ T7 — Handoff (Verboo-deepseek · 2026-08-09)

```
HANDOFF: W2 · T7 Model selector fix
Flag:    Verboo-deepseek
Branch:  verboo/sprint7.2/w2/t7-modelselector
Commit:  <committed at Step 6>
Files:   src/components/ai-studio/ModelSelector.tsx (catálogo vem da API; prefferModel; label/vendor/creditsPerMessage)
         src/services/ai-studio/providers/GPTMakerProvider.ts (getModels hardcoded REMOVIDO)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T7 ticked + handoff)
         Planning/Workflow/billing.md (row: 2026-08-09 · 7.2 · W2 T7 · Verboo / deepseek-v4-flash · M · R$ 20)
Verification: npm run build limpo · action=models → 29 models {id,label,vendor,creditsPerMessage} incl. GPT_5_6_SOL
              GET settings.prefferModel = GPT_5_6_SOL (casa com o catálogo → pré-seleção funciona)
              update-model GPT_5 → persistiu → restaurado GPT_5_6_SOL. Test user SQL criado+deletado, 0 resíduos.
Ledger:  [x] T7
Merge:   PR para main após auditoria do PM
```

**O bug era o Step 2:** o código antigo lia `settingsRes.data?.model`, mas a função retorna `settingsRes.data.settings.prefferModel` — a chave nunca batia e o modelo atual nunca aparecia pré-selecionado. Corrigido.

**Flag — `AIProvider.ts` (fora do escopo, ownership rule):** `AIProvider` ainda declara `abstract getModels(): Promise<ModelInfo[]>`, e `GPTMakerProvider` (que o estende) não implementa mais. `vite build` (esbuild) não faz typecheck, então o hard gate passa — mas **um follow-up deve remover o método abstrato de `AIProvider.ts`** (não era arquivo da T7; touro só os meus). O `ModelInfo` de `types.ts` (name/costPerRequest/provider) também ficou órfão — a T10 ainda usa? Se sim, T10 decide.

---

### T8 · Channels page + Solo instance card — **L** — Verboo
**Files:** Modify `src/pages/ai-studio/ChannelsPage.tsx` · `src/components/ai-studio/CreateChannelDialog.tsx`

**Interfaces — Consumes:** T2's `{ channels: [...] }`.

- [ ] **Step 1: Update the channels read path** to T2's shape (`data.channels`, each with `connected: boolean`). Show connection state per channel.
- [ ] **Step 2: Empty and error states.** If zero channels, show "Nenhum canal conectado" with the create CTA — not a blank area. If the call errored, show the message and a retry button. A blank page is indistinguishable from "no data", which is what made this feel broken.
- [ ] **Step 3: Solo instance card — connection date.** `wpp_instances.connected_at` is already selected by the existing query. Render it as `Conectado em {dd/MM/yyyy HH:mm}` when status is `connected`; when it is not, show the status label instead.
- [ ] **Step 4: Solo instance card — price.** `manage-solo-instances` already returns `monthly_price` on every action. Render it per card as `R$ {price}/mês`, replacing the current single block of prose. The PO asked for this to be per-instance and legible.
- [ ] **Step 5: Confirm delete removes the VPS instance.** `manage-solo-instances` action `delete` already calls `DELETE /v1/instance/delete/{name}` on the VPS, so the Docker environment is cleaned. **Do not reimplement it** — verify it, and add a confirmation dialog stating the instance will be permanently removed and billing will stop.
- [ ] **Step 6: Build.** `npm run build` → clean.
- [ ] **Step 7: Verify.** Confirm the channel list matches the provider dashboard, the Solo card shows date + price, and deleting a throwaway instance removes it from both the DB and the VPS (`GET /v1/instance/fetchInstances` no longer lists it). **Never touch `solobusiness` or `soloventures-salesengine-admin`.**
- [ ] **Step 8: Commit.** `git commit -m "feat(studio-ai): real channels list and richer Solo instance cards"`

### ✅ T8 — Handoff (Verboo-deepseek · 2026-08-09)

```
HANDOFF: W2 · T8 Channels page + Solo instance card
Flag:    Verboo-deepseek
Branch:  verboo/sprint7.2/w2/t8-channels
Commit:  <committed at Step 8>
Files:   src/pages/ai-studio/ChannelsPage.tsx (channels shape T2 + empty/error states + Solo card date/price + delete dialog)
         src/components/ai-studio/CreateChannelDialog.tsx (verificado compatível — sem mudança)
         Planning/Sprints/sprint_7.2_studio_ai_v1.md (ledger T8 ticked + handoff)
         Planning/Workflow/billing.md (row: 2026-08-09 · 7.2 · W2 T8 · Verboo / deepseek-v4-flash · L · R$ 20)
Verification: npm run build limpo · canais = {channels:[5]} batem com dashboard (Teste, Solon - Wpp Solo Energia, Solo Energia, calculadora-solo, Solon - MSM Business)
              Solo card: connected_at + R$/mês per-instance (100). Delete E2E: criei se-939d7dd8-t8-delete-test → VPS listou →
              delete via edge fn → {"deleted":true} → DB 0 rows → VPS não lista mais. soloventures-salesengine-admin e se-a43f3b4a-teste NÃO tocados.
              Test user SQL criado+deletado, 0 resíduos.
Ledger:  [x] T8
Merge:   PR para main após auditoria do PM (gate: npx tsc -b + npm run build)
```

**Contrato cumprido:**
1. **Channels read path** → `data.channels` com `connected: boolean` (T2 shape). Estado por canal mostrado (conectado/desconectado). `phone`/`connectedAt` antigos removidos do shape (não existem mais).
2. **Empty state**: "Nenhum canal conectado" + CTA "Novo canal". **Error state**: mensagem + botão "Tentar novamente" (nada de página em branco).
3. **Solo card — conexão**: `Conectado em {dd/MM/yyyy HH:mm}` quando `status === "connected"`; senão mostra o label do status.
4. **Solo card — preço**: `R$ {price}/mês` por card (o bloco de prosa único foi removido). Fonte: `manage-solo-instances.monthly_price` (env `SOLO_INSTANCE_MONTHLY_PRICE=100`) — mergeado nos cards via status/connect/create.
5. **Delete**: diálogo de confirmação agora diz explicitamente que a instância é removida **permanentemente do VPS (Docker) e do banco**, e que a cobrança mensal cessa. O `manage-solo-instances` já chama `DELETE /v1/instance/delete/{name}` — não reimplementado, só verificado ao vivo.

**Notas:**
- `CreateChannelDialog` não precisou de mudança (create/qr já batem com a T2).
- Instância Solo existente `se-a43f3b4a-teste` pertence a outra equipe ("Jornada do R1") — não toquei; a verificação de delete foi com throwaway próprio da equipe Solo Energia, criado e removido no teste.

---

### T9 · Knowledge Base upload UI — **M** — Verboo
**Files:** Modify `src/pages/ai-studio/KnowledgePage.tsx` · `src/components/ai-studio/AIKnowledgeBase.tsx`

**Interfaces — Consumes:** T4's `action=upload-url` and the extended `action=create`.

- [ ] **Step 1: Add a file input** to the document training flow, accepting `.pdf,.doc,.docx,.txt,.csv`, max 20 MB. Keep the existing URL field — the PO wants *both*, not a replacement.
- [ ] **Step 2: Wire the three-step upload.**

```ts
const { data: signed } = await supabase.functions.invoke(
  'manage-agent-training?action=upload-url',
  { body: { fileName: file.name, mimeType: file.type } }
);
const { error: upErr } = await supabase.storage
  .from('agent-training-docs')
  .upload(signed.uploadPath, file, { contentType: file.type });
if (upErr) throw upErr;

await supabase.functions.invoke('manage-agent-training?action=create', {
  body: {
    type: 'DOCUMENT',
    documentUrl: signed.publicUrl,
    documentName: file.name,
    documentMimetype: file.type,
  },
});
```

- [ ] **Step 3: Show upload progress and refetch on success** so the new training appears without a manual reload — this is the "real time" the PO asked for.
- [ ] **Step 4: Validate before upload.** Reject oversize or unsupported files client-side with a clear toast naming the limit.
- [ ] **Step 5: Build.** `npm run build` → clean.
- [ ] **Step 6: Verify.** Upload a real PDF, confirm it appears in the list without reloading and in the provider dashboard. Delete it and confirm it disappears from both.
- [ ] **Step 7: Commit.** `git commit -m "feat(studio-ai): upload documents to the knowledge base"`

---

### T10 · Usage page real data — **M** — Verboo
**Files:** Modify `src/pages/ai-studio/UsagePage.tsx` · `src/components/ai-studio/AIUsageDashboard.tsx`

**Interfaces — Consumes:** T3's `{ balance, total, details }` and T1's `action=models`.

- [ ] **Step 1: Delete the duplicated `MODEL_COSTS` map** (`AIUsageDashboard.tsx:16-25`) and source credit costs from `action=models` instead. Two hand-maintained copies of the same catalog is how they drifted apart.
- [ ] **Step 2: Use the real balance.** Replace the hardcoded `totalCredits` default of `1000` with the API value from T3. If it is unavailable, show "—", never a fabricated number.
- [ ] **Step 3: Map model keys to display labels** via the catalog. Unknown keys render as the raw key rather than being dropped, so gaps are visible instead of silently hidden.
- [ ] **Step 4: Empty state.** When there is no usage in the period, show "Sem consumo neste período" — not an empty chart that reads as broken.
- [ ] **Step 5: Build.** `npm run build` → clean.
- [ ] **Step 6: Verify.** Compare the displayed balance and per-model totals against the provider dashboard for the current month; record both sets of numbers in the handoff.
- [ ] **Step 7: Commit.** `git commit -m "fix(studio-ai): usage dashboard shows real credit data"`

---

### T11 · Billing — instances section — **M** — Verboo
**Files:** Modify `src/pages/Billing.tsx`

- [ ] **Step 1: Add a "Conexões WhatsApp (Solo API)" section** listing each `wpp_instances` row for the team: display name, status, connection date, and monthly price.
- [ ] **Step 2: Show the monthly total** for instances where `billing_active = true` — this is what the customer is actually charged.
- [ ] **Step 3: Explain the billing rule** in one muted line: *"A cobrança começa na primeira conexão e continua enquanto a instância existir. Desconectar não cancela — exclua a instância para encerrar a cobrança."* This is the rule already implemented in `sync-instance-billing`; state it so it is not a surprise.
- [ ] **Step 4: Note the known blocker.** If `subscription_status` is null for the team, show "Assinatura não configurada". As of 2026-08-08 the `ASAAS_API_KEY` edge secret does not exist, so `sync-instance-billing` fails and no charge is ever posted — flag this in your handoff so the PM tracks it.
- [ ] **Step 5: Build.** `npm run build` → clean.
- [ ] **Step 6: Commit.** `git commit -m "feat(billing): show Solo API instance charges"`

---

## WAVE 3 — runs alone

### T12 · White-label sweep + regression guard — **M** — Codex

**Files (all nine — this is why it runs alone):** `src/components/agent/AgentTraining.tsx` · `src/components/ai-studio/ModelSelector.tsx` · `src/components/inbox/ConversationHeader.tsx` · `src/hooks/useMessages.ts` · `src/lib/displayName.ts` · `src/pages/Webhooks.tsx` · `src/services/ai-studio/ProviderFactory.ts` · `src/services/ai-studio/providers/GPTMakerProvider.ts` · `src/types/crm.ts`

**Rule:** replace **user-visible strings only**. Internal identifiers — the `GPTMakerProvider` class name, `GPT_MAKER_TOKEN`, `gpt_maker_agent_id`, `gpt_maker_chat_id` — stay exactly as they are. Renaming them is churn with migration risk and zero user benefit.

- [ ] **Step 1: Find every occurrence.** `grep -rn "GPT Maker\|GPTMaker\|gptmaker\|gpt maker" src/ --include=*.ts --include=*.tsx`
- [ ] **Step 2: Classify each hit** as rendered string vs internal identifier. Only rendered strings change.
- [ ] **Step 3: Replace rendered strings** with neutral wording: "Agente de IA", "provedor de IA", or simply drop the vendor name where the sentence reads fine without it. Never invent a fake vendor name.
- [ ] **Step 4: Add the regression guard.** Create `src/__tests__/no-provider-branding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The provider is an implementation detail. Its brand must never reach the UI.
// Internal service-layer identifiers are allowed and listed here explicitly.
const ALLOWLIST = [
  'src/services/ai-studio/providers/GPTMakerProvider.ts',
  'src/services/ai-studio/ProviderFactory.ts',
];

// node:fs recursive readdir — the repo has no `glob` dependency and this
// guard is not worth adding one for.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => join(dir, f).replace(/\\/g, '/'))
    .filter((f) => /\.(ts|tsx)$/.test(f));
}

describe('provider branding', () => {
  it('never appears in user-visible source', () => {
    const offenders = sourceFiles('src').filter(
      (f) => !ALLOWLIST.includes(f) && /gpt\s*maker/i.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
```

> Requires Node 18.17+ for `readdirSync`'s `recursive` option. Verify with `node -v` before writing the test; if the runtime is older, walk the tree with a small recursive helper instead of adding a dependency.

- [ ] **Step 5: Run it.** `npx vitest run src/__tests__/no-provider-branding.test.ts` → 1 passed. If it fails, it prints the offending files — fix them and rerun.
- [ ] **Step 6: Build.** `npm run build` → clean.
- [ ] **Step 7: Click through every Studio AI page** plus Chat and Webhooks, confirming no brand name is visible anywhere. List the pages checked in the handoff.
- [ ] **Step 8: Commit.** `git commit -m "chore(ui): remove provider branding from user-visible strings"`

---

## 📊 ZONE 3 — LEDGER

Tick your task and add one row to `Planning/Workflow/billing.md` on your branch before handing off.

- [x] T0 · Live API spike · Verboo · M
- [x] T1 · manage-agent-settings → /settings + catalog · Verboo · XL
- [x] T2 · manage-agent-channels real fetch · Verboo · M
- [x] T3 · fetch-gpt-credits real data · Verboo · M
- [x] T4 · manage-agent-training DOCUMENT + Storage · Verboo · L
- [x] T5 · Env fail-fast + netlify.toml · Verboo · S
- [x] T6 · Settings page full parity · Verboo · L
- [x] T7 · Model selector fix · Verboo · M
- [x] T8 · Channels page + Solo card · Verboo · L
- [ ] T9 · Knowledge Base upload UI · Verboo · M
- [ ] T10 · Usage page real data · Verboo · M
- [ ] T11 · Billing instances section · Verboo · M
- [ ] T12 · White-label sweep + guard · Codex · M

## ⚠️ KNOWN GAPS (carried to 7.3, not forgotten)

- **Horário de atendimento** — no provider API field; would need enforcement in our own webhook layer.
- **Moderação de conteúdo** — no provider API field.
- **Google Calendar** — no API at all; dashboard-only. Revisit as a native scheduling intention.
- **`ASAAS_API_KEY` missing in prod** — `sync-instance-billing` fails, so no instance charge is ever posted. Founder action, tracked in `sprint_7.1_studio_ai_v1_fixes_1.md`.
