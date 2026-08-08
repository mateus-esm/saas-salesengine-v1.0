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
- [ ] All 13 agent-settings fields are exposed and round-trip correctly.
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
- Every edge function must `deno check` clean; every frontend task must `npm run build` clean.
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
| T0 | Live API spike | M | Codex | `Planning/Sprints/sprint_7.2_api_reference.md` |
| T1 | `manage-agent-settings` → `/settings` + catalog | **XL** | Claude | `supabase/functions/manage-agent-settings/index.ts` |
| T2 | `manage-agent-channels` real fetch | M | Gemini | `supabase/functions/manage-agent-channels/index.ts` |
| T3 | `fetch-gpt-credits` real data | M | Gemini | `supabase/functions/fetch-gpt-credits/index.ts` |
| T4 | `manage-agent-training` DOCUMENT + Storage | **L** | Codex | `supabase/functions/manage-agent-training/index.ts` · `supabase/migrations/20260808000000_agent_training_docs_bucket.sql` |
| T5 | Env fail-fast + `netlify.toml` | S | Antigravity | `src/integrations/supabase/client.ts` · `netlify.toml` |
| T6 | Settings page full parity | **L** | Claude | `src/pages/ai-studio/SettingsPage.tsx` · `src/components/ai-studio/BehaviorSettings.tsx` |
| T7 | Model selector fix | M | Gemini | `src/components/ai-studio/ModelSelector.tsx` · `src/services/ai-studio/providers/GPTMakerProvider.ts` |
| T8 | Channels page + Solo card | **L** | Codex | `src/pages/ai-studio/ChannelsPage.tsx` · `src/components/ai-studio/CreateChannelDialog.tsx` |
| T9 | Knowledge Base upload UI | M | Antigravity | `src/pages/ai-studio/KnowledgePage.tsx` · `src/components/ai-studio/AIKnowledgeBase.tsx` |
| T10 | Usage page real data | M | Gemini | `src/pages/ai-studio/UsagePage.tsx` · `src/components/ai-studio/AIUsageDashboard.tsx` |
| T11 | Billing — instances section | M | Antigravity | `src/pages/Billing.tsx` |
| T12 | White-label sweep + guard | M | Codex | 9 files (see task) — **runs alone** |

> **Ownership rule:** touch only your files. If another file looks wrong, tell the PM — do not fix it.

---

## WAVE 0

### T0 · Live API spike — **M** — Codex

**Files:** Create `Planning/Sprints/sprint_7.2_api_reference.md`

**Why:** The published docs and our Sprint 7 reference disagree on the channels endpoint (`/workspace/{id}/channels?agentId=` vs `/agent/{id}/search`). Every task behind this depends on the real shapes. Capture reality once.

**Interfaces — Produces:** the reference doc every other task reads.

- [ ] **Step 1: Get a token.** Read `GPT_MAKER_TOKEN` from Supabase edge secrets (Dashboard → Edge Functions → Secrets). Do **not** commit it. Export locally: `export GPT_MAKER_TOKEN=...`. Get the agent id: it is `equipes.gpt_maker_agent_id` for *Solo Energia* (`939d7dd8-592c-4fda-946e-3568f2909904`), and `workspace_id` from the same row.

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

---

## WAVE 1 — edge functions

### T1 · `manage-agent-settings` → `/settings` + model catalog — **XL** — Claude

**Files:** Modify `supabase/functions/manage-agent-settings/index.ts` (whole file rewrite)

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
    maxDailyMessagesLimitAction: 'TEMP_BLOCK_30S'|'TEMP_BLOCK_5M'|'TEMP_BLOCK_10M'|'TEMP_BLOCK_30M'|'TEMP_BLOCK_1H'|'BLOCK'|'TRANSFER';
    knowledgeByFunction: boolean; onLackKnowLedge: string;
  }
}
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
];
```

> **Reconcile with T0.** If the spike's `/settings` response shows an enum value missing here, add it. If it shows one here that the API rejects, remove it and note it in the handoff.

- [ ] **Step 2: Add the settings whitelist and a URL helper.**

```ts
const SETTINGS_KEYS = [
  'prefferModel', 'timezone', 'enabledHumanTransfer', 'enabledReminder',
  'splitMessages', 'enabledEmoji', 'limitSubjects', 'signMessages',
  'messageGroupingTime', 'maxDailyMessages', 'maxDailyMessagesLimitAction',
  'knowledgeByFunction', 'onLackKnowLedge',
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

  return new Response(JSON.stringify({
    agent: {
      name: agent.name ?? '',
      behavior: agent.behavior ?? '',
      description: agent.description ?? '',
    },
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
      maxDailyMessagesLimitAction: s.maxDailyMessagesLimitAction ?? 'TEMP_BLOCK_30S',
      knowledgeByFunction: s.knowledgeByFunction ?? false,
      onLackKnowLedge: s.onLackKnowLedge ?? '',
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
  if (!MODEL_CATALOG.some(m => m.id === body.model)) {
    return new Response(JSON.stringify({ error: `Unknown model: ${body.model}`, status: 400 }),
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

---

### T2 · `manage-agent-channels` real fetch — **M** — Gemini

**Files:** Modify `supabase/functions/manage-agent-channels/index.ts` (list branch only, ~line 186)

**Interfaces — Consumes:** T0's answer to "which channels endpoint returns real channels".
**Produces:** `GET` → `{ channels: Array<{ id: string; name: string; type: string; connected: boolean }> }`

- [ ] **Step 1: Read T0's finding.** Open `Planning/Sprints/sprint_7.2_api_reference.md` and find which of the two endpoints returned real channels. Use that one. If **both** work, prefer the agent-scoped `/v2/agent/{agentId}/search` — it needs no `workspace_id`, removing a config dependency.

- [ ] **Step 2: Replace the list branch.**

```ts
// --- GET: list channels ---
const apiUrl = `${AI_ENGINE_BASE}/agent/${agentId}/search?page=1&pageSize=50`;
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

---

### T3 · `fetch-gpt-credits` real data — **M** — Gemini

**Files:** Modify `supabase/functions/fetch-gpt-credits/index.ts`

**Interfaces — Produces:** `{ balance: number, total: number, details: Array<{ model: string; credits: number; date: string }> }` — T10 consumes this.

- [ ] **Step 1: Read T0's answers** to questions 4 (does `credits-spent` return a per-model breakdown, and are model keys enum or slug?).
- [ ] **Step 2: Normalize model keys to the enum.** If the spike shows slugs, map them to enum ids so T10 can join against the catalog from T1. If it shows enums, pass through unchanged. Document which case applied in the handoff.
- [ ] **Step 3: Return the real balance.** Confirm `GET /v2/workspace/{wsId}/credits` is called and its value is returned as `balance` rather than a hardcoded default. The current UI defaults `totalCredits` to `1000` — the real value must come from the API.
- [ ] **Step 4: Surface upstream errors** as `{ error, status }` with status 502 instead of a generic message, matching T1's shape.
- [ ] **Step 5: Typecheck, deploy, verify.** Compare the returned balance against the provider dashboard; record both in the handoff.
- [ ] **Step 6: Commit.** `git commit -m "fix(studio-ai): return real credit balance and usage breakdown"`

---

### T4 · `manage-agent-training` DOCUMENT + Storage — **L** — Codex

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

- [ ] **Step 2: Apply the migration.** `supabase db push --linked --dns-resolver https`. Verify the bucket exists in the Dashboard. (If DNS fails, add `--dns-resolver https`; the founder's system resolver is unreliable.)

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

- [ ] **Step 5: Delete the Storage object when a training is deleted.** In the `delete` branch, after the provider call succeeds, remove the object if the training was a DOCUMENT whose URL points at our bucket. Parse the object path from the URL suffix after `/agent-training-docs/` and call `supabase.storage.from('agent-training-docs').remove([path])`. Without this the bucket grows without bound.

- [ ] **Step 6: Typecheck.** `deno check --no-lock manage-agent-training/index.ts` → clean.
- [ ] **Step 7: Deploy.** `supabase functions deploy manage-agent-training --no-verify-jwt --project-ref egxzsivzqlqadoqpgfby`
- [ ] **Step 8: End-to-end verify.** Upload a small PDF to the bucket, call `create` with its public URL, confirm the training appears in the provider dashboard, then delete it and confirm both the training and the Storage object are gone. Record this in the handoff.
- [ ] **Step 9: Commit.** `git commit -m "feat(studio-ai): support document upload for agent training"`

---

### T5 · Env fail-fast + `netlify.toml` — **S** — Antigravity

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
- [ ] **Step 5: Commit.** `git commit -m "fix: fail fast when Supabase env vars are missing"`

---

## WAVE 2 — frontend

> **Gate:** the PM merges all of W1 to `main` and announces `WAVE 1 MERGED` before W2 starts. W2 consumes W1's response shapes. `git pull origin main` first.

### T6 · Settings page full parity — **L** — Claude

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

---

### T7 · Model selector fix — **M** — Gemini

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

---

### T8 · Channels page + Solo instance card — **L** — Codex

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

---

### T9 · Knowledge Base upload UI — **M** — Antigravity

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

### T10 · Usage page real data — **M** — Gemini

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

### T11 · Billing — instances section — **M** — Antigravity

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

- [x] T0 · Live API spike · Codex · M
- [ ] T1 · manage-agent-settings → /settings + catalog · Claude · XL
- [ ] T2 · manage-agent-channels real fetch · Gemini · M
- [ ] T3 · fetch-gpt-credits real data · Gemini · M
- [ ] T4 · manage-agent-training DOCUMENT + Storage · Codex · L
- [ ] T5 · Env fail-fast + netlify.toml · Antigravity · S
- [ ] T6 · Settings page full parity · Claude · L
- [ ] T7 · Model selector fix · Gemini · M
- [ ] T8 · Channels page + Solo card · Codex · L
- [ ] T9 · Knowledge Base upload UI · Antigravity · M
- [ ] T10 · Usage page real data · Gemini · M
- [ ] T11 · Billing instances section · Antigravity · M
- [ ] T12 · White-label sweep + guard · Codex · M

## ⚠️ KNOWN GAPS (carried to 7.3, not forgotten)

- **Horário de atendimento** — no provider API field; would need enforcement in our own webhook layer.
- **Moderação de conteúdo** — no provider API field.
- **Google Calendar** — no API at all; dashboard-only. Revisit as a native scheduling intention.
- **`ASAAS_API_KEY` missing in prod** — `sync-instance-billing` fails, so no instance charge is ever posted. Founder action, tracked in `sprint_7.1_studio_ai_v1_fixes_1.md`.
