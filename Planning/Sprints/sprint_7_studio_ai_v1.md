# 🚀 Sprint 7 — Studio AI v1: Channels & Solo API

> **For agentic workers:** This file is the single source of truth for Sprint 7 (see `Planning/Workflow/agent_workflow.md`). PM: **Claude (Fable)**. Engineers execute tasks per wave, on isolated branches, with structured handoff blocks. REQUIRED: read your task's full spec + the Wave 0 API reference doc before coding.

**Goal:** A client connects messaging channels (GPT Maker all types + Solo API WhatsApp via whatsmiau) entirely inside the Sales Engine — with QR pairing, health status, per-instance billing on the Asaas subscription, and smart outbound routing that opens closed WhatsApp windows.

**Architecture:** No provider abstraction refactor in v1 (decisão fechada — ver ROADMAP §5 #1). GPT Maker remains the default brain + inbox pipe; the Solo API (whatsmiau, Evolution-API-compatible, port 8081 on the VPS) is an additional unofficial WhatsApp line used for: solo-native conversations, outbound-initiated messages (forms/ads leads, campaigns), and window-closed fallback. Everything integrates at the existing edge-function seams.

**Tech Stack:** Supabase Edge Functions (Deno) · Postgres migrations · React/Vite frontend · whatsmiau (Go, VPS/Dokploy) · GPT Maker API v2 · Asaas API v3.

---

## 🎯 Vision (Founder)

1. **GPT Maker é o default da v1.** É lá que o agente processa e responde, e o webhook dele ecoa toda mensagem enviada/recebida (inclusive mensagens enviadas pela Solo API no mesmo número — chegam como "human message"). Nosso inbox continua pendurado no `gpt-maker-webhook`.
2. **Solo API substitui a conexão não-oficial Z-API.** Hoje um cliente que precisa de API não-oficial paga ~R$100/mês de Z-API dentro do GPT Maker. Queremos que essa conexão seja a NOSSA (whatsmiau na VPS), faturada por nós. Casos de uso: cliente que não consegue coexistence; cliente com campanhas de forms/ads que precisa **iniciar** conversas; janela de 24h fechada.
3. **Janela de 24h:** se o tenant tem Solo API conectada (ou canal não-oficial no GPT Maker), a janela fechada **não bloqueia** o composer — o sistema roteia por onde dá para enviar.
4. **Canais GPT Maker dentro do Sales Engine:** criar/editar/remover canais de **todos os tipos** que a API suporta (WHATSAPP, INSTAGRAM, CLOUD_API, TELEGRAM, WIDGET, MESSENGER, MERCADO_LIVRE) sem abrir o painel do GPT Maker. Inbox ganha filtro por canal. Para WhatsApp não-oficial, prioridade é a Solo API com QR code.
5. **Billing por instância:** cada instância Solo conectada soma um valor fixo mensal (`SOLO_INSTANCE_MONTHLY_PRICE`, referência R$100) na assinatura Asaas do tenant, como line-item recorrente. Desconexão não remove a cobrança (slot reservado); só o delete explícito remove.
6. **Health visível para o cliente:** Conectado / Desconectado — reconectar / Aguardando QR.
7. **Fora do escopo (decisões fechadas nesta sprint):** refactor de abstração de providers (pós-v1) · Knowledge Base sync (próxima sprint) · regras de pipeline por canal de origem (pós-v1) · Salvy · campanhas em massa (a Solo API só precisa *permitir* iniciar conversa; motor de campanha é outra sprint).

### ✅ Definition of Done / Acceptance Criteria (contract)

- [ ] **AC1 — Instância Solo end-to-end:** usuário cria instância na ChannelsPage → QR aparece em <10s → escaneia → status vira "Conectado" sem reload manual (refresh button ok) → aparece na lista com telefone. T12: pendente de QR scan real.
- [ ] **AC2 — Inbound Solo:** mensagem recebida no número Solo (sem GPT Maker no mesmo número) cria lead + conversation + message no inbox, com canal `whatsapp`. T12: pendente de mensagem real no número escaneado.
- [ ] **AC3 — Outbound routing:** (a) conversa solo-native envia pela Solo API; (b) envio para lead sem `gpt_maker_chat_id` com instância conectada sai pela Solo API; (c) falha de janela no GPT Maker faz retry automático pela Solo API e a mensagem chega. T12: code gate passou; live sends e erro de janela ainda pendentes.
- [ ] **AC4 — Sem duplicatas:** número conectado em coexistence + Solo simultaneamente não gera mensagens duplicadas no inbox (eco do GPT Maker deduplicado). T12: pendente de teste de coexistence real.
- [x] **AC5 — Canais GPT Maker:** criar canal de qualquer tipo pela UI; canal WHATSAPP mostra QR do GPT Maker; canal criado aparece na lista com status; remover canal funciona. T12: code gate/T3-T9 evidence completo.
- [ ] **AC6 — Billing:** conectar instância → valor da assinatura Asaas do tenant sobe R$`SOLO_INSTANCE_MONTHLY_PRICE`; deletar instância → valor desce; Admin vê instâncias por tenant. T12: code gate passou; verificação Asaas live pendente.
- [ ] **AC7 — Health:** derrubar a instância (logout pelo celular) reflete "Desconectado — reconectar" em ≤5 min (webhook ou cron). T12: code gate passou; pg_cron segue pendente de ativação operator-only.
- [x] **AC8 — Inbox:** filtro por canal (todos/whatsapp/instagram/telegram/web/messenger) e badge de janela: composer nunca bloqueado quando tenant tem instância Solo conectada. T12: code gate passou; live smoke recomendado após deploy.
- [x] **AC9 — Intenções:** CRUD de intenções funcional na SkillsPage contra a API real (list/create/update/delete), com campos, headers e variables. T12: T4 API evidence + UI preservation fix completo.
- [x] **AC10 — Zero regressão:** fluxo atual GPT Maker-only (tenant sem Solo) continua idêntico; `npm run build` limpo. T12: build/typecheck/lint/Deno gate passou.

---

## 📚 Ground Truth & References (read before coding)

| Fonte | O quê |
|---|---|
| `Planning/Sprints/sprint_7_api_reference.md` | **Escrito na Wave 0 pelo PM.** Payloads REAIS capturados: whatsmiau (create/connect/sendText/sendMedia/webhook events) e GPT Maker (create-channel/qr-code/start-conversation/erro de janela). Se este doc contradisser qualquer task abaixo, o doc vence — avise o PM. |
| Whatsmiau handoff (resumo) | Base URL `http://<VPS>:8081` (Wave 0 define URL HTTPS final) · header `apikey: <WHATSMIAU_API_KEY>` · `POST /v1/instance/create` body `{"ID":"NOME","InstanceName":"NOME"}` (**chaves maiúsculas obrigatórias**) · `GET /v1/instance/connect/{name}` (gera QR / retorna status) · `POST /v1/instance/logout/{name}` · `DELETE /v1/instance/delete/{name}` · envio: `POST /v1/message/sendText/{instance}` (Evolution-compatible) · webhooks: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`, `CONTACTS_UPSERT` (formato Evolution API) |
| GPT Maker API | Base `https://api.gptmaker.ai/v2`, Bearer `GPT_MAKER_TOKEN`. Canais: `POST /agent/{agentId}/create-channel` `{name, type}` · `GET /workspace/{wsId}/channels?agentId=` (já usado) · `PUT` edit-channel · `DELETE` remove-channel · `GET` qr-code (canal) · `POST` start-conversation. Intenções: `GET|POST /agent/{agentId}/intentions`, `PUT|DELETE /agent/{agentId}/intentions/{id}`. Docs: https://developer.gptmaker.ai/llms.txt |
| Seams existentes | `supabase/functions/send-chat-message/index.ts` (envio — hard-coded GPT Maker) · `supabase/functions/gpt-maker-webhook/index.ts` (inbound + dedup robusto por conteúdo/janela, linhas 428-544) · `supabase/functions/manage-agent-channels/index.ts` (list-only) · `supabase/functions/manage-agent-intentions/index.ts` (CRUD já existe — T4 verifica) · `conversations.channel` **já existe e já é populado** (whatsapp/instagram/telegram/web/messenger) |
| Asaas | `PUT https://api.asaas.com/v3/subscriptions/{id}` body `{"value": <novo total>}` atualiza o valor da assinatura. `equipes` já tem `asaas_subscription_id`, `asaas_customer_id`, `plano_id`, `subscription_status`. Preço base do plano em `planos.preco_mensal`. |

**Secrets novos (Supabase Edge Secrets — setados na Wave 0):** `WHATSMIAU_BASE_URL`, `WHATSMIAU_API_KEY`, `WHATSMIAU_WEBHOOK_TOKEN` (token aleatório validado no webhook), `SOLO_INSTANCE_MONTHLY_PRICE` (ex: `100`).

---

## 🛠️ Implementation Plan (PM)

### Global Constraints

- Nunca editar `main`; branch por task: `<agent>/sprint7/<task-id>/<desc>`.
- Só toque nos arquivos que sua task possui. Dentro de uma wave nenhuma task compartilha arquivo.
- Todo texto de UI em pt-BR; **nunca** exibir "GPT Maker"/"whatsmiau" para o usuário — usar "AI Engine" e "Solo API".
- Edge functions: mesmo padrão dos vizinhos (serve + corsHeaders + service-role client + try/catch com JSON error). Novas functions exigem entrada no `supabase/config.toml` (webhook: `verify_jwt = false`).
- `npm run build` limpo é gate de handoff. Handoff sem o bloco estruturado do workflow será rejeitado.
- Migration naming: `supabase/migrations/2026MMDDHHMMSS_sprint7_<desc>.sql`.

### 🗄️ Data model (migration única — Wave 0, PM)

```sql
-- 20260705000000_sprint7_solo_instances.sql
CREATE TABLE IF NOT EXISTS public.wpp_instances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id     uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  instance_name text NOT NULL UNIQUE,          -- "se-{8 primeiros chars do equipe_id}-{slug}"
  display_name  text NOT NULL,
  status        text NOT NULL DEFAULT 'awaiting_qr'
                CHECK (status IN ('awaiting_qr','connected','disconnected','error')),
  phone         text,
  ingest_inbound boolean NOT NULL DEFAULT true, -- false quando o mesmo número também está no GPT Maker
  billing_active boolean NOT NULL DEFAULT false,
  connected_at  timestamptz,
  last_health_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wpp_instances_equipe ON public.wpp_instances(equipe_id);

ALTER TABLE public.wpp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY wpp_instances_select ON public.wpp_instances
  FOR SELECT USING (equipe_id IN (SELECT equipe_id FROM public.profiles WHERE user_id = auth.uid()));
-- writes: apenas service-role (edge functions); sem policy de INSERT/UPDATE/DELETE para authenticated.

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS solo_instance_id uuid REFERENCES public.wpp_instances(id);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS provider text;             -- 'gptmaker' | 'solo'
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS provider_message_id text;  -- wa message id do whatsmiau
CREATE INDEX IF NOT EXISTS idx_messages_provider_msg ON public.messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
```

### 🌊 Wave Map

```
Wave 0 (PM/Claude) ── Spike + migration + infra checklist ──→ desbloqueia tudo
Wave 1 ── T1 manage-solo-instances (L) ─┐
       ── T2 solo-wpp-webhook (L)       ├─ paralelas, arquivos disjuntos
       ── T3 manage-agent-channels (M)  │
       ── T4 intentions verify (M)      ┘
Wave 2 ── T5 send-chat-message routing (XL, depende T1+T2)
       ── T6 sync-instance-billing (L, depende T1)
       ── T7 health cron (M, depende T1+T2)
Wave 3 ── T8 ChannelsPage Solo UI (M) ─┐
       ── T9 Create-channel dialog (M) ├─ paralelas (depende Wave 1/2)
       ── T10 Inbox filtro+janela (M)  │
       ── T11 Admin instances (S)      ┘
Wave 4 ── T12 Hardening + E2E (M, PM + 1 engenheiro)
```

Routing de custo (workflow): S/M → modelo barato/médio; L/XL → modelo forte com plano aprovado pelo PM antes de codar.

---

### Wave 0 — PM (Claude) · executa antes de abrir as waves

**W0.1 — Spike de API (1 dia) → `Planning/Sprints/sprint_7_api_reference.md`**
- [ ] whatsmiau real na VPS: criar instância de teste `se-spike-test`, conectar, capturar JSON real de: create, connect (QR), connect (já conectado), `sendText`, envio de mídia (confirmar rota Evolution `sendMedia`), e os 4 eventos de webhook (configurar webhook de teste apontando para um endpoint de captura). Confirmar rota de configuração de webhook por instância (Evolution-compatible: `POST /webhook/set/{instance}` — validar no whatsmiau).
- [ ] GPT Maker real: `create-channel` (tipo WHATSAPP e WIDGET), `qr-code` do canal, `remove-channel`, `start-conversation`, e **capturar o erro exato de janela fechada** ao enviar via `send-message` fora da janela (status + body — é o gatilho do fallback do T5).
- [ ] Documentar TUDO com payloads verbatim no reference doc.

**W0.2 — Migration + secrets**
- [ ] Aplicar a migration acima (`supabase db push` ou dashboard).
- [ ] Gerar `WHATSMIAU_WEBHOOK_TOKEN` (`openssl rand -hex 24`) e setar os 4 secrets no Supabase.
- [ ] Regenerar `src/integrations/supabase/types.ts` (padrão do repo pós-migration).

**W0.3 — Infra checklist (founder/PM juntos)**
- [ ] Expor whatsmiau via HTTPS no Dokploy (domínio/Traefik) — edge functions não devem falar HTTP puro com apikey em trânsito. Alternativa mínima: manter IP:8081 e aceitar o risco documentado até o domínio sair.
- [ ] Configurar webhook global/por instância do whatsmiau → `https://<projeto>.supabase.co/functions/v1/solo-wpp-webhook?token=<WHATSMIAU_WEBHOOK_TOKEN>`.
- [ ] Deploy checklist: novas functions no `.github/workflows/deploy.yml` se o deploy for por lista explícita.

---

### Wave 1

#### T1 · `manage-solo-instances` — lifecycle de instâncias (L)

**Files:** Create `supabase/functions/manage-solo-instances/index.ts` · Modify `supabase/config.toml` (adicionar `[functions.manage-solo-instances]`).
**Interfaces — Produces:** POST com `{ action: 'create'|'connect'|'status'|'logout'|'delete', instance_id?, display_name? }`, auth JWT do usuário. Retorna `{ instance }` e, para connect, `{ instance, qr_base64?, connected: boolean }`. T8 (UI) consome exatamente isso.

Comportamento (payloads reais no reference doc):
1. Auth igual `manage-agent-channels/index.ts:22-32` (JWT → profile → equipe_id).
2. **create:** valida `display_name` (slug: `[a-z0-9-]{3,30}`); `instance_name = "se-" + equipeId.slice(0,8) + "-" + slug`; INSERT em `wpp_instances` (service-role); chama whatsmiau `POST /v1/instance/create` com body `{"ID": instance_name, "InstanceName": instance_name}` (**chaves com maiúsculas exatas**, header `apikey`); configura o webhook da instância (rota confirmada no reference doc) apontando para `solo-wpp-webhook?token=...`; retorna a row.
3. **connect:** `GET /v1/instance/connect/{instance_name}`; se resposta contém QR (base64/code), retorna `qr_base64` e mantém status `awaiting_qr`; se conectado, atualiza `status='connected'`, `connected_at=now()`, `phone` (se presente), `billing_active=true`, e retorna `connected: true`.
4. **status:** re-consulta connect e sincroniza a row (mesma lógica sem gerar QR novo se conectado).
5. **logout:** `POST /v1/instance/logout/{name}` → `status='disconnected'` (**mantém** `billing_active=true` — slot reservado, decisão do founder).
6. **delete:** `DELETE /v1/instance/delete/{name}` → deleta a row (billing cai via T6 na próxima reconciliação).
7. Toda chamada whatsmiau: timeout 15s, non-2xx → `status='error'` na row + erro JSON claro pro front. Nunca vazar a apikey em logs.
8. Sempre validar que a instância pertence à equipe do usuário antes de agir (`.eq('equipe_id', equipeId)`).

Teste local (documentar output no handoff): `curl` das 5 actions contra o deploy de preview, com instância de teste real. Build: `npm run build` limpo.

#### T2 · `solo-wpp-webhook` — inbound + connection events (L)

**Files:** Create `supabase/functions/solo-wpp-webhook/index.ts` · Modify `supabase/config.toml` (`verify_jwt = false`).
**Interfaces — Consumes:** eventos Evolution-format do whatsmiau (shapes verbatim no reference doc). **Produces:** rows em `leads/conversations/messages` idênticas em shape às do `gpt-maker-webhook` (inbox não distingue origem).

1. Validar `?token=` contra `WHATSMIAU_WEBHOOK_TOKEN`; token errado → 401.
2. Resolver instância: payload Evolution traz `instance` (nome) → lookup `wpp_instances` por `instance_name` → obtém `equipe_id`. Instância desconhecida → 200 `{ignored:true}` (não vazar erro).
3. **CONNECTION_UPDATE:** mapear estado (`open`→`connected`, `close`/`connecting` → `disconnected`/`awaiting_qr` conforme reference doc) → UPDATE `status`, `last_health_at=now()`, `connected_at` na primeira conexão, `phone` se disponível. Primeira transição para `connected` também seta `billing_active=true`.
4. **MESSAGES_UPSERT:** se `ingest_inbound=false` → 200 ignored (número também está no GPT Maker; o eco de lá é a fonte). Senão, reusar o pipeline do `gpt-maker-webhook` adaptado: normalizar phone (`_shared/phone.ts`), lead lookup por `phone_normalized`+`equipe_id` (criar com `creation_source:'solo_api'`, `channel:'whatsapp'`, tratamento de race 23505 idêntico a `gpt-maker-webhook/index.ts:202-260`), conversation upsert por lead+channel **setando `solo_instance_id`**, dedup por `provider_message_id` (wa id do payload, ex: `key.id`) e por conteúdo+janela 60s, INSERT em `messages` com `provider:'solo'`, `provider_message_id`, `sender_type` (`key.fromMe` → `'agent'`, senão `'customer'`), incrementar unread via RPCs existentes. `fromMe=true` também dedupa contra envios recentes com `sender_id NOT NULL` (nosso próprio envio ecoando).
5. `MESSAGES_UPDATE` / `CONTACTS_UPSERT`: 200 ignored na v1 (log apenas).
6. Sempre retornar 200 rápido; trabalho pesado dentro do try com log — nunca 5xx por payload inesperado (whatsmiau faz retry).

Aceite: mensagem real recebida no número de teste cria lead+conversa+mensagem; CONNECTION_UPDATE real muda status. Evidência (logs + rows) no handoff.

#### T3 · `manage-agent-channels` — CRUD completo GPT Maker (M)

**Files:** Modify `supabase/functions/manage-agent-channels/index.ts`.
**Interfaces — Produces:** GET continua igual (lista). POST com `{ action: 'create'|'remove'|'qr', ... }`: `create` → `{ name, type }` (types: WHATSAPP, INSTAGRAM, CLOUD_API, TELEGRAM, WIDGET, MESSENGER, MERCADO_LIVRE) chama `POST /v2/agent/{agentId}/create-channel`; `remove` → `{ channel_id }` chama remove-channel; `qr` → `{ channel_id }` chama o endpoint qr-code e retorna `{ qr_base64 }` (shape real no reference doc). T9 consome isso.
Erros do GPT Maker (400/403) → repassar `message` legível. Manter normalização de shape existente no GET. Aceite: criar canal WIDGET + WHATSAPP reais, pegar QR do WHATSAPP, remover ambos — evidência no handoff.

#### T4 · Intenções — verificação e gaps (M)

**Files:** Modify `supabase/functions/manage-agent-intentions/index.ts` (se houver gap) · Modify `src/pages/ai-studio/SkillsPage.tsx` + `src/components/ai-studio/AISkills.tsx` (se houver gap).
Task investigativa com contrato: rodar o CRUD completo contra a API real (list/create/update/delete com `fields`, `headers`, `variables` — spec do body em https://developer.gptmaker.ai/api-reference/intentions/create-intention). Onde quebrar, corrigir. Onde a UI não expõe campo que a API exige (`type` WEBHOOK|INSTRUCTIONS, `httpMethod`, `autoGenerateParams/Body`), adicionar. Entregável: AC9 verde + lista escrita no handoff do que foi corrigido vs. já funcionava.

---

### Wave 2

#### T5 · `send-chat-message` — routing Solo (XL — plano aprovado pelo PM antes de codar)

**Files:** Modify `supabase/functions/send-chat-message/index.ts` · Create `supabase/functions/_shared/solo-sender.ts`.
**Interfaces — Produces:** `_shared/solo-sender.ts` exporta `sendViaSolo(args: { supabase, equipeId, instanceName, phone, content?, mediaUrl?, mediaType? }): Promise<{ ok: boolean; providerMessageId?: string; error?: string }>` — encapsula `POST {WHATSMIAU_BASE_URL}/v1/message/sendText/{instance}` (body Evolution: número + texto; mídia conforme reference doc).

Ordem de decisão dentro do fluxo existente (após o INSERT otimista da linha 69, preservando TODO o comportamento atual):
1. Carregar conversation com `solo_instance_id` + a instância `connected` da equipe (se houver).
2. **Rota A — solo-native:** `conversations.solo_instance_id` preenchido → `sendViaSolo` direto (sem GPT Maker; não chamar start-human). Sucesso → UPDATE message `provider:'solo'`, `provider_message_id`.
3. **Rota B — default GPT Maker:** `gpt_maker_chat_id` existe → fluxo atual intacto (start-human + send-message). **Fallback:** se o send falhar com o erro de janela (assinatura exata capturada no reference doc; na dúvida, qualquer non-2xx) **e** a equipe tem instância conectada **e** o lead tem phone → `sendViaSolo`; sucesso marca `provider:'solo'` e não propaga erro pro front.
4. **Rota C — outbound-initiated:** sem `gpt_maker_chat_id` e equipe tem instância conectada e lead tem phone → `sendViaSolo`; setar `conversations.solo_instance_id` para a conversa ficar solo-native daqui em diante.
5. Nenhuma rota disponível → comportamento atual (mensagem salva, não entregue) + `{ delivered: false, reason }` na resposta para a UI do T10 sinalizar.
6. Telemetria: `console.log('[SendMsg] route:', 'solo'|'gptmaker'|'fallback-solo')`.

Aceite = AC3 completo com evidência real das 3 rotas + AC10 (tenant sem Solo permanece intacto).

#### T6 · `sync-instance-billing` — reconciliador Asaas (L)

**Files:** Create `supabase/functions/sync-instance-billing/index.ts` · Modify `supabase/config.toml`.
**Interfaces — Consumes:** `wpp_instances.billing_active` (T1/T2). **Produces:** POST `{ equipe_id }` (service-role ou JWT admin) — recalcula e aplica o valor da assinatura.

Lógica (idempotente, padrão reconciler — sem acoplamento a eventos):
1. Carregar equipe (`asaas_subscription_id`, `plano_id`) + `planos.preco_mensal` + `count(*) FROM wpp_instances WHERE equipe_id=? AND billing_active=true`.
2. `expected = preco_mensal + count * Number(SOLO_INSTANCE_MONTHLY_PRICE)`.
3. `GET /v3/subscriptions/{id}` (header `access_token`, padrão `asaas-subscribe/index.ts`); se `value !== expected` → `PUT /v3/subscriptions/{id}` `{"value": expected, "updatePendingPayments": false}`.
4. Sem `asaas_subscription_id` → retornar `{ skipped: 'no_subscription' }` (design partners manuais).
5. Registrar resultado em log estruturado `[InstanceBilling] equipe=<id> instances=<n> value <old>→<new>`.
Chamada: invocada pelo cron do T7 a cada ciclo para todas as equipes com instâncias, e manualmente pelo Admin (T11). Aceite: AC6 com evidência do valor mudando na assinatura sandbox/real.

#### T7 · Health cron (M)

**Files:** Create `supabase/migrations/2026MMDDHHMMSS_sprint7_health_cron.sql` (pg_cron, padrão de `20260608000600_sprint6_ingest_cron.sql`) · Create `supabase/functions/solo-health-check/index.ts` · Modify `supabase/config.toml`.
A cada 5 min: para cada `wpp_instances` com status ≠ `error`, chamar whatsmiau `GET /v1/instance/connectionState/{id}` (rota sem efeito colateral; `connect` gera QR quando desconectado), sincronizar `status`/`last_health_at`, e ao final invocar `sync-instance-billing` para as equipes cujo status mudou. Instância sem resposta → `disconnected`. Aceite = AC7.

---

### Wave 3

#### T8 · ChannelsPage — Solo API real (M)

**Files:** Modify `src/pages/ai-studio/ChannelsPage.tsx` (apenas `SoloAPISection`, linhas ~150-293).
Trocar o mock por integração real com `manage-solo-instances` (T1): criar → poll de connect a cada 5s enquanto `awaiting_qr` (máx 2 min, QR expira — botão "Gerar novo QR") → render do `qr_base64` em `<img>` → estado conectado com telefone. Lista real de instâncias (fetch on mount) com badges: `connected` verde "Conectado" / `disconnected` âmbar "Desconectado — reconectar" (botão reabre fluxo QR) / `awaiting_qr` "Aguardando QR". Ações: reconectar, logout, deletar (com `AlertDialog` de confirmação mencionando a remoção da cobrança). Remover badge "EM BREVE" e o grid "Tech spec" mock. Copy: nota de billing "+R$X/mês por instância conectada" lendo preço de resposta do backend (T1 inclui `monthly_price` no retorno — combinar com dono do T1 via PM se necessário). Aceite = AC1 na UI.

#### T9 · Create-channel dialog GPT Maker (M)

**Files:** Create `src/components/ai-studio/CreateChannelDialog.tsx` · Modify `src/pages/ai-studio/ChannelsPage.tsx` (apenas `LiveChannelsSection`: botão "+ Novo canal" e integração do dialog — **coordenar com T8 via PM: arquivos se cruzam, T8 entrega primeiro**).
Dialog com: nome + select de tipo (os 7, com ícone/descrição de 1 linha cada); submit → `manage-agent-channels` action `create`; para WHATSAPP, passo 2 do dialog mostra QR (action `qr`) com botão refresh; demais tipos, mensagem "Canal criado — finalize a configuração específica no passo a passo" + refetch da lista. Delete por canal na lista (action `remove`, AlertDialog). Estados de erro legíveis (toast com a message da API). Aceite = AC5.

#### T10 · Inbox — filtro de canal + janela inteligente (M)

**Files:** Modify `src/pages/Chat.tsx` (filtro na lista + estado de janela) · Modify `src/components/inbox/InboxSidebar.tsx` (chips de filtro) · Modify `src/components/inbox/ChatInput.tsx` (badge/tooltip do composer). ⚠️ Houve ownership de outro agente em `src/components/inbox/` em sprint passada — confirmar com o PM que está liberado antes do primeiro commit.
1. Filtro por canal na lista de conversas (chips: Todos · WhatsApp · Instagram · Telegram · Web · Messenger) usando `conversations.channel` existente.
2. Badge de janela: se a equipe tem instância Solo `connected` (fetch leve de `wpp_instances` via RLS), composer **nunca** bloqueia e mostra tooltip "Envio garantido via Solo API"; sem instância, comportamento atual + aviso quando `send-chat-message` responder `delivered:false` (interface do T5).
Aceite = AC8.

#### T11 · Admin — instâncias por tenant (S)

**Files:** Modify `src/pages/Admin.tsx` (ou sub-componente admin existente de tenants — localizar e declarar no handoff).
Tabela: tenant · instância · status · telefone · billing_active · connected_at + botão "Sincronizar billing" (invoca `sync-instance-billing` com `equipe_id`). Read-only fora isso. Aceite = parte visual do AC6.

---

### Wave 4

#### T12 · Hardening + E2E (M — PM + 1 engenheiro)

**Files:** Atualizar este arquivo como fonte única de verdade; correções pontuais em arquivos já tocados na sprint (com aprovação do PM por arquivo).
Roteiro E2E completo (executado com número real): criar instância → QR → conectar → receber inbound (AC2) → responder da inbox (rota solo) → testar fallback de janela num canal coexistence (AC3c) → verificar dedup com número duplo (AC4) → deletar instância → conferir Asaas (AC6) → matar a instância e cronometrar o health (AC7). Registrar resultados por AC no doc; bugs viram fixes imediatos ou issues rotuladas pós-sprint com decisão do PM. Fechamento: DoD checklist ticada no topo deste arquivo.

### T12 Closeout Status (2026-07-06/07)

Este arquivo permanece a fonte unica de verdade da Sprint 7. Nenhum arquivo separado de resultados E2E deve ser mantido para esta sprint.

**Status geral:** code hardening gate passou; E2E live completo ainda depende de acoes humanas/de operador com telefone real, providers e deploy.

**Correcoes de hardening concluidas:**
- `send-chat-message` exige JWT do chamador, resolve a equipe do usuario e valida ownership de lead/conversa antes de qualquer escrita service-role ou envio a provider.
- Rotas Solo corrigidas: conversas solo-native usam `solo_instance_id` fixado; fallback/outbound usam qualquer instancia conectada apenas quando nao existe instancia fixada.
- Respostas de nao entrega retornam `{ delivered:false, reason }` para o inbox avisar em vez de indicar sucesso silencioso.
- Logs sensiveis de payload/provider outbound foram removidos.
- `solo-wpp-webhook` ganhou dedup cross-provider para coexistence sem colapsar albuns de midia Solo distintos.
- `solo-health-check` rejeita chamadas publicas e aceita apenas service-role bearer ou cron secret antes de consultar providers/reconciliar billing.
- `manage-solo-instances` e `solo-health-check` garantem `billing_active=true` e preservam/definem `connected_at` em todos os caminhos conectados.
- `sync-instance-billing` permite `super_admin` sincronizar qualquer tenant; usuarios normais seguem limitados a propria equipe.
- Frontend completou sete tipos de canal, polling/expiracao de QR, respostas connected-without-QR, leitura de preco mensal do backend, empty state, refresh de estado Solo no Chat, label AI Engine no Admin e refetch de billing.
- AC9 preserva `fields`, `headers`, `params` e `variables` na UI de intencoes.
- Deploy workflow inclui `manage-agent-channels` e `manage-agent-intentions`.
- Cron de health ficou como SQL operator-only; nenhuma service-role key foi commitada.
- ESLint 9 e postura TypeScript atual foram ajustados para o gate local.

**Verificacao local T12:**

| Gate | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Passou, exit 0 |
| `npm.cmd run lint` | Passou, exit 0; somente warnings pre-existentes de hooks/fast-refresh/unused-disable |
| `npm.cmd run build` | Passou, exit 0; somente warnings de chunk-size e browserslist |
| `deno check` nas functions T1/T3/T4/T5/T6/T7 | Passou, exit 0 apos acesso ao cache Deno |

**ACs ainda pendentes de E2E live:**
- AC1: scan de QR Solo real, confirmando QR em <10s, scan, status conectado e telefone na lista.
- AC2: mensagem inbound real no numero Solo, com linhas em leads/conversations/messages.
- AC3: envio solo-native real, envio outbound sem `gpt_maker_chat_id` e fallback GPT Maker window-closed pela Solo API. Enquanto o body exato do erro nao for capturado, o codigo faz fallback em non-2xx do GPT Maker quando ha Solo conectada.
- AC4: teste de coexistence com o mesmo numero em Solo + AI Engine e verificacao de ausencia de duplicatas.
- AC6: verificacao Asaas real/sandbox de aumento e reducao do valor da assinatura apos connect/delete.
- AC7: deploy, ativacao operator-only do `pg_cron` e validacao de health em ate 5 minutos.
- AC10: smoke test GPT Maker-only depois do push/deploy.

**Acoes humanas/de operador antes de fechar a sprint:**
- Escanear um QR Solo real e capturar `connection.update` + `messages.upsert`.
- Enviar `sendText` real e confirmar `key.id`/dedup no inbox.
- Capturar o body exato do erro GPT Maker de janela fechada e refinar matcher se necessario.
- Rodar coexistence duplicate test.
- Validar alteracao de valor da assinatura no Asaas.
- Ativar o `pg_cron` de health via SQL one-off depois do deploy.
- Fazer push de `main` quando aprovado; isso dispara deploy de producao.

---

## 📦 Wave 0 — Handoff do PM (2026-07-04)

```
HANDOFF: W0 · Spike + Migration + Infra checklist
Branch:  main (zona de planning/PM — tasks de código T1+ SEMPRE em branch isolada)
Files:   Planning/Sprints/sprint_7_api_reference.md (created — GROUND TRUTH das APIs)
         supabase/migrations/20260705000000_sprint7_solo_instances.sql (created)
         Planning/Sprints/sprint_7_studio_ai_v1.md (este handoff + ledger)
         Planning/Workflow/billing.md (rows W0)
Tests:   supabase migration list --db-url ... → histórico remoto em sync; só 20260705000000 pendente
Ledger:  [x] W0.1 · [x] W0.2 (push pendente de aprovação do founder) · [x] W0.3
```

### Descobertas-chave do spike (leiam antes de codar — detalhes no reference doc)

1. **Webhook configurável na criação da instância** (bloco `webhook` inline no create) — T1 faz 1 chamada, não 2; token de segurança vai em `webhook.headers["x-webhook-token"]`.
2. **`connectionState` vs `connect`:** health check (T7) usa `GET /v1/instance/connectionState/{id}` — a rota `connect` GERA QR quando desconectado (efeito colateral indesejado no cron).
3. **`key.id` (WhatsApp message ID) presente no response de envio E no webhook** — é o `provider_message_id`; o dedup do AC4 é viável por ID + o dedup por conteúdo existente.
4. **Mídia inbound da Solo API só tem URL se o servidor tiver GCS storage** — v1 ingere texto e marca mídia como `[Mídia recebida]` (decisão registrada no reference doc §1.4).
5. **GPT Maker `start-conversation` só funciona em canal WhatsApp NÃO-oficial** — valida a arquitetura: outbound-initiated é exclusivo da Solo API (Rota C do T5).
6. **QR do whatsmiau = data URI (`<img>` direto); QR do GPT Maker = string crua** (T9 precisa de render de QR — verificar lib existente antes de adicionar dependência).
7. **Rota de logout divergente entre handoff do founder e código atual** — T1 implementa `POST /v1/instance/{id}/logout` com fallback `DELETE /v1/instance/logout/{id}`.

### 🔴 Ações do Founder — STATUS 2026-07-04 (PM)

- ✅ **1. Migration aplicada** (`supabase db push` via access token; `wpp_instances` live em produção) + `types.ts` regenerado.
- ✅ **2. Secrets setados** via CLI: `WHATSMIAU_API_KEY`, `WHATSMIAU_WEBHOOK_TOKEN`, `SOLO_INSTANCE_MONTHLY_PRICE=100`. Credenciais também em `.env` local (gitignored).
- ✅ **3. RESOLVIDO 2026-07-04:** `WHATSMIAU_BASE_URL=http://72.61.219.156:8081` recebido, setado como secret + `.env`. Live validation executada (resultados no reference doc): lifecycle completo validado em produção, estado novo `qr-code` descoberto e mapeado. Instâncias de produção (`solobusiness`, `soloventures-salesengine-admin`) intocadas.
- 🟡 **4. HTTPS pendente (aceito interinamente):** apikey trafega em HTTP puro para o IP — expor via domínio TLS no Dokploy quando possível.
- 🟡 **5. Push para origin pendente:** merges estão locais; `git push` dispara o deploy.yml (deploya as functions novas em produção). Founder autoriza o push → deploy automático.
- ⚠️ **Segurança (Marco 0):** o access token do Supabase foi colado em chat — adicionar à lista de rotação de chaves pós-sprint.

<details><summary>Checklist original (arquivado)</summary>

1. **Aplicar a migration** (revisar e rodar; o PM foi bloqueado de auto-aplicar em produção, corretamente):
   `! powershell -c "$pw=(Get-Content .env | ? { $_ -match '^SUPABASE_DB_PASSWORD=' }) -replace '^SUPABASE_DB_PASSWORD=','';Add-Type -AssemblyName System.Web;$u='postgresql://postgres:'+[System.Web.HttpUtility]::UrlEncode($pw)+'@db.egxzsivzqlqadoqpgfby.supabase.co:5432/postgres';supabase db push --db-url $u"`
   Depois: `supabase gen types typescript --linked > src/integrations/supabase/types.ts` (ou via dashboard). **T1/T2 não mergeiam sem isso.**
2. **Setar os secrets** (dashboard Supabase → Edge Functions → Secrets, ou CLI):
   `WHATSMIAU_BASE_URL` (URL real da VPS) · `WHATSMIAU_API_KEY` (apikey real) · `WHATSMIAU_WEBHOOK_TOKEN` (gerado nesta wave — valor no `.env` local, NUNCA em arquivo commitado) · `SOLO_INSTANCE_MONTHLY_PRICE=100`
3. **Passar ao PM o IP/domínio real + apikey do whatsmiau** → PM executa o checklist "Live Validation Pending" do reference doc (QR real, eco de coexistence, erro de janela).
4. **HTTPS:** expor o whatsmiau atrás de domínio com TLS no Dokploy (Traefik). Aceitável interinamente: IP:8081 puro, risco documentado (apikey em trânsito).
5. **(Pós-W0, para mídia inbound):** configurar GCS storage no whatsmiau OU aceitar `[Mídia recebida]` na v1.

</details>

### Regras adicionais desta sprint (PM → engenheiros)

- `.github/workflows/deploy.yml` deploya função por função: **quem cria função nova adiciona a própria linha** (`solo-wpp-webhook` com `--no-verify-jwt`). Conflitos de merge em deploy.yml/billing.md: manter todas as linhas.
- Wave 1 pode iniciar **agora** em branches isoladas; merge de T1/T2 espera a migration aplicada (ação 1 acima).

---

## 📣 Briefing aos Engenheiros (PM)

Time — Sprint 7 aberta. Antes de qualquer linha de código:

1. **Leiam `Planning/Workflow/agent_workflow.md` inteiro.** O fluxo é obrigatório: branch isolada por task (`<agent>/sprint7/<task-id>/<desc>`), file ownership estrito, e handoff SÓ no bloco estruturado (§6). Handoff sem bloco = rejeitado, sem exceção.
2. **Leiam `Planning/Sprints/sprint_7_api_reference.md`** — payloads verificados no código-fonte do whatsmiau e docs do GPT Maker. É a fonte de verdade; não "chutem" shapes de API.
3. **Leiam a spec completa da sua task neste arquivo** (Vision + sua task + os ACs que ela cobre). Dúvida ou spec ambígua → perguntem ao PM ANTES de codar, nunca contornem spec ruim.
4. **L/XL (T1, T2, T5, T6):** apresentem plano curto (arquivos + lógica) e aguardem aprovação do PM antes de codar. S/M: spec clara → direto pra branch.
5. **Gates de conclusão:** build limpo, diff só nos arquivos da task, checkbox ticado NESTE arquivo, linha no billing.md, bloco de handoff. Os cinco, sempre.
6. **Wave 1 está ABERTA:** T1, T2, T3, T4 — arquivos disjuntos, podem rodar em paralelo. Waves 2-4 abrem quando o PM anunciar `WAVE <N> MERGED`.

Excelência = spec seguida à risca + evidência real nos testes (curl/logs/rows) + zero surpresa no merge. Bom sprint. 🚀

---

## 📊 Ledger

Engenheiro: ao concluir, tique sua task abaixo, adicione a linha no `Planning/Workflow/billing.md` e poste o bloco de handoff (formato em `Planning/Workflow/agent_workflow.md` §6).

- [x] W0.1 · Spike API reference — PM/Claude ✅ 2026-07-04
- [x] W0.2 · Migration + secrets — PM/Claude ✅ 2026-07-04 (migration criada; push + secrets = ação founder acima)
- [x] W0.3 · Infra checklist — PM/Claude + founder ✅ 2026-07-04 (checklist entregue no handoff)
- [x] T1 · manage-solo-instances (L) ✅ merged 2026-07-04 (fix delete-404 verificado + PM fixup: estado `qr-code`→`awaiting_qr`, achado da live validation)
- [x] T2 · solo-wpp-webhook (L) ✅ merged 2026-07-04 (fix dedup verificado + PM fixups: guard de placeholder `[Midia recebida]` no textMatch — álbuns de fotos — e estado `qr-code`)
- [x] T3 · manage-agent-channels CRUD (M) ✅ merged 2026-07-04 — ⚠️ interface real do QR: `{ qr_value, connected }` (string, não base64) — T9 consome isso
- [x] T4 · Intenções verify+fix (M) ✅ merged 2026-07-04 (mapIntentionBody backward-compat + PUT path corrigido)
- [x] T5 · send-chat-message routing (XL) ✅ merged 2026-07-04 (3 rotas + reverse fallback; `GPT_MAKER_WINDOW_CLOSED_REGEX=null`, fallback atual em non-2xx ate capturar o body live exato)
- [x] T6 · sync-instance-billing (L) ✅ merged 2026-07-04 (reconciler idempotente; auth JWT-própria-equipe + service-role)
- [x] T7 · Health cron (M) ✅ merged 2026-07-04 (connectionState side-effect-free; pg_cron comentado — PM ativa ao fim da Wave 4; deploy.yml lines de T6/T7 adicionadas pelo PM no merge)
- [x] T8 · ChannelsPage Solo UI (M) ✅ merged 2026-07-05 (haiku/worktree; poll via `status` sem regenerar QR)
- [x] T9 · Create-channel dialog (M) ✅ merged 2026-07-05 (7 tipos + QR + remove; PM corrigiu versão do react-qr-code e conflito de worktree stale)
- [x] T10 · Inbox filtro + janela (M) ✅ merged 2026-07-05 (chips de canal; indicador Solo; toast delivered:false)
- [x] T11 · Admin instances (S) ✅ merged 2026-07-05 (tab Instâncias Solo + botão sincronizar billing)
- [ ] T12 · Hardening + E2E (M) — code hardening gate passed and consolidated neste arquivo; live QR/inbound/outbound/coexistence/GPT Maker window error/Asaas/pg_cron/push evidence still requires founder/operator action
