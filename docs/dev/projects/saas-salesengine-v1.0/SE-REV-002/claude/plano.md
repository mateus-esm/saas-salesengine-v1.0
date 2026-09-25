# SE-REV-002 — Plano: Rev conectado ao chat (CRM ↔ WhatsApp), com cadência

**Branch:** `feat/rev-crm-chat-cadence` · **Base:** `b8f16bb` (SE-REV-001, PR #44)
**Data:** 2026-09-25 · **Autor:** harness de planejamento (claude)
**Entrega deste documento:** só o plano. Nenhum código de produto foi escrito.

---

## 0. Veredito

### 0.1 A visão encaixa no software?

**Sim, e melhor do que o pedido supõe.** O repositório já tem quase todas as peças.
Falta a parte que as liga. O que já existe e foi lido:

| Peça | Onde | Estado |
| --- | --- | --- |
| Abrir conversa no GPT Maker (não oficial) com idempotência no banco | `start-conversation/`, `_shared/start-conversation.ts`, `conversation_open_events` | pronto, **nunca rodou contra o provider** |
| Enviar pela Solo API (Whatsmiau) para qualquer número, sem conversa prévia | `_shared/solo-sender.ts` (Rota C do `send-chat-message`) | em produção |
| Toda resposta do lead, de qualquer provider, vira `messages.sender_type = 'customer'` | `gpt-maker-webhook`, `solo-wpp-webhook` | em produção |
| Toda chegada de lead vira uma linha em `lead_touches` com `entry_id` (a "porta") | `crm_record_touch` (chamado por `crm-webhook`, `gpt-maker-webhook`, `solo-wpp-webhook`) | em produção |
| Toda mudança de etapa vira uma linha em `opportunity_stage_history` | gatilho em `opportunities` | em produção |
| Fila com `run_after`, claim com `FOR UPDATE SKIP LOCKED`, retry com espera crescente, tick do pg_cron que busca segredo no Vault | `copilot_jobs`, `crm_copilot_claim`, `_copilot_tick` (Sprint 11 W6) | em produção |

A visão ("evento de CRM → mensagem no WhatsApp → follow-up automático, para
qualquer cliente") é a ligação dessas peças. Não é preciso nenhuma tecnologia
nova, só **um motor de disparo com fila no Postgres e dois adaptadores de
provider**.

### 0.2 A abordagem proposta é a melhor?

Vale estender a SE-REV-001 com roteamento de provider e um motor de cadência,
mas **não do jeito que o pedido sugere**. Seguem as correções, em ordem de
importância.

#### Correção 1 — "Solo API ou GPT Maker" não é só escolher por qual API sai a mensagem. É escolher **quem responde o lead**.

Isto é o que o dono mais precisa saber antes de vender a solução para outros
clientes:

- **GPT Maker:** a conversa aberta pertence ao agente de IA do provider. Quando o
  lead responde, a IA atende.
- **Solo API:** é uma linha de WhatsApp crua. O `solo-wpp-webhook` grava a
  resposta e chama o `analyze-message`, que **só extrai dados para o CRM**
  (OpenAI + regras de pipeline). Ele **não responde o lead**. Procurei no
  repositório inteiro e não achei nenhum caminho que gere resposta de IA para
  uma linha Solo (`sendViaSolo` só é usado por `send-chat-message`,
  `admin-notifications` e `notification-dispatcher`). Num tenant só com Solo, a
  resposta do lead cai no **inbox humano**.
- Existe um caso híbrido que eu **não consegui verificar**: o mesmo número
  pareado na Solo e no GPT Maker (`wpp_instances.ingest_inbound = false` existe
  justamente para isso). Nesse caso a Solo manda e o agente do GPT Maker
  responde. Precisa ser testado com um aparelho real antes de ser prometido.

**Consequência:** o roteamento é por configuração explícita do tenant
(`provider` + linha). Não é "tenta um e cai no outro". O fallback entre providers
que o `send-chat-message` faz (Rota B: GPT falhou → Solo) é **errado para
disparo automático**: o lead receberia a mensagem de outro número, e a resposta
dele iria para outra linha e outro atendente.

#### Correção 2 — O GPT Maker **não devolve id de chat** no start-conversation. E a SE-REV-001 tem um bug por causa disso.

Conferi na documentação oficial (`developer.gptmaker.ai/api-reference/channels/start-conversation`,
lida nesta sessão). A resposta 200 é **só `{"success": boolean}`**, e os erros
são 400/403 com `{error}`. Três consequências:

1. **Bug na SE-REV-001:** `callStartConversation` trata qualquer HTTP 2xx como
   sucesso. Um `200 {"success": false}` é gravado como `opened`, e o lead nunca
   recebe a mensagem. **Precisa ser corrigido antes do deploy.**
2. `provider_chat_id` vai ficar `null` quase sempre. O `extractProviderChatId`
   procura um campo que a documentação diz que não existe. A conversa só ganha
   `gpt_maker_chat_id` quando o webhook do provider trouxer o eco ou a resposta.
3. O follow-up para um lead que **não respondeu** não tem como usar
   `/v2/chat/{id}/send-message`, porque não tem `chatId`. O único caminho
   documentado é **chamar o start-conversation de novo**. A documentação não diz
   o que acontece quando já existe chat com aquele número (outra mensagem no
   mesmo chat? erro? chat novo?). **Isso é o risco nº 1 e precisa de smoke
   test** (§8).

#### Correção 3 — O filtro por `source` é frágil, e a SE-REV-001 tem uma inconsistência nele.

- `"Meta Ads - Cadastro (Social Pago)"` **não aparece em nenhum lugar do
  código**. Pelo que vi, é o **nome da porta de entrada**: o `webhook_configs.name`
  que o gatilho do Sprint 11 copia para `crm_entries.name`. **Não** é o
  `leads.source`. O n8n manda `channel: "Social Pago"`, não `source`. O
  `leads.source` sai dos `field_mappings` do webhook (que estão no banco de
  produção e eu não li) e, sem mapeamento, vira `'webhook_inbound'`. Se for esse
  o caso, o `trigger_sources = ['Meta Ads - Cadastro (Social Pago)']` que a
  documentação da SE-REV-001 sugere **nunca casaria**.
- Há também uma inconsistência. O `dispatchConversationOpen` filtra pelo
  `source` **do payload**, e o `start-conversation` filtra de novo pelo
  `lead.source` **do banco**. Num lead que voltou, o `leads.source` é o original
  (o `crm-webhook` não o atualiza), e aí o resultado é `source_not_triggered`.
  Isso contradiz o que o `implementacao.md` da SE-REV-001 promete ("alguém
  digitado à mão ontem que hoje preencheu o anúncio também merece
  atendimento").
- **Correção:** o gatilho passa a ser **pela porta (`crm_entries.id`)**. É um
  UUID estável, que já existe para toda chegada de lead e que a UI já lista. O
  `trigger_sources` fica como compatibilidade.

#### Correção 4 — O `cadence-check` **não serve de fundação**.

Li o arquivo inteiro. Os motivos:

- **Sem autenticação:** `verify_jwt = false` no `config.toml` e nenhuma checagem
  de segredo no código. Qualquer um que saiba a URL dispara os webhooks de todos
  os tenants.
- **A idempotência é uma janela de tempo em código** (`?window_minutes`),
  exatamente o erro que a SE-REV-001 evitou. Um cron atrasado perde disparos, e
  dois ticks sobrepostos duplicam.
- É fire-and-forget, sem nenhum log do que foi disparado.
- `on_stage_entered` é declarado (tipo, UI em `StagesEditor.tsx`, comentário da
  migration), mas **ninguém dispara esse evento**: o `cadence-check` só trata
  idle e cadence, e não há gatilho SQL para ele.
- Tem uma falha de typecheck de baseline (TS2352, linha 110).
- **Não achei script que o agende** em `supabase/scripts/`. É provável que nem
  esteja rodando em produção (não verificável daqui).

**Decisão:** o `cadence-check` **não é tocado** (é uma restrição) e **não é
usado**. A fundação é o padrão da fila do Copilot, que já foi testado em
produção. A "quebra de ociosidade" (idle) vira **uma etapa com atraso numa
sequência disparada por entrada na etapa, cancelada quando a etapa muda**. É o
mesmo resultado sem varredura, e com idempotência no banco.

#### Correção 5 — O n8n **não deve** disparar mensagem, nem como solução temporária.

O pedido oferece "disparar pelo n8n" como caminho temporário. Isso seria um
passo atrás:

- O n8n do cliente **já chama o `crm-webhook`**, e o `crm-webhook` **já dispara
  a abertura nativa** (SE-REV-001). O caminho "temporário" já é nativo. Só falta
  ligar e validar.
- Um workflow n8n que manda mensagem direto no provider **passa por fora** do
  registro de idempotência, do opt-out, do horário permitido e do
  cancelamento-por-resposta. Duas fontes de disparo para o mesmo lead é
  exatamente como o lead acaba recebendo mensagem duplicada.
- O papel do n8n é só **levar o lead da planilha para o Rev**, e isso continua
  igual. Não é preciso mudar nada no workflow (§4.4).
- **Não consegui abrir o n8n:** o conector n8n desta sessão pede autorização
  OAuth, e a sessão não é interativa. Trabalhei só com o JSON exportado em
  `contexto/n8n-workflow-casa-flow.json`. Para eu ler o n8n ao vivo, é preciso
  autorizar o conector nas configurações de conectores do claude.ai.

#### Correção 6 — O que o dono não mencionou e que é obrigatório: risco de banimento e opt-out.

**Os dois providers são WhatsApp não oficial.** O GPT Maker só abre conversa em
canal não oficial (documentado), e a Solo/Whatsmiau é pareamento por QR, ou seja,
também não oficial. Mandar mensagem automática em série para números que nunca
falaram com a linha é o comportamento que o WhatsApp mais bane. Um motor de
cadência sem freio **queima o número do cliente**. Por isso o MVP já precisa ter:

- janela de horário por tenant (padrão 08:00–20:00, `America/Sao_Paulo`);
- limite de envios por hora **por linha**;
- opt-out por palavra-chave ("sair", "parar"...), registrado no banco e
  conferido antes de cada envio;
- nenhum reenvio automático quando o resultado do envio é incerto (§3.5).

#### Correção 7 — Abrir conversa pelo WhatsApp **oficial** é impossível com o provider atual.

A documentação do GPT Maker é explícita: start-conversation "só está disponível
para canais do tipo WhatsApp não oficial". Para iniciar conversa pela Cloud API
da Meta seria preciso mandar **template aprovado (HSM)**, e o provider não expõe
isso. Um tenant cuja única linha é `CLOUD_API` **não tem como receber abertura
automática** nem nesta entrega nem na Fase 2. A resposta honesta para esse
cliente é: "conecte uma linha Solo (QR) para o disparo".

#### Correção 8 — A ordem certa.

O pedido é "resolver o job agora e escalar depois". A ordem que protege as duas
coisas:

1. **Fase 0 (dias):** corrigir os três defeitos da SE-REV-001 (success:false,
   filtro por porta, inconsistência do source), fazer o deploy e o smoke com a
   Casa Flow. **Isso resolve o job da Casa Flow**: uma primeira mensagem em até
   ~10 min do cadastro (o intervalo do n8n).
2. **Fase 1 (MVP da SE-REV-002):** motor de cadência + roteamento Solo/GPT
   Maker + cancelamentos + freios. **Isso é o que escala.**
3. **Fase 2:** UI, mídia, ramificação, IA gerando follow-up, ingestão nativa de
   Meta Lead Ads (aposentar planilha + n8n).

Construir a cadência **em cima de uma abertura que nunca falou com o provider**
é o maior risco deste projeto. As respostas da Fase 0 (o provider aceita
start-conversation repetido? o eco volta como `assistant` ou como `customer`?)
mudam decisões da Fase 1. A Fase 0 tem de ser commitável e deployável sozinha.

### 0.3 O que eu **não** consegui verificar (e onde isso pesa)

| Não verificado | Por quê | Onde pesa |
| --- | --- | --- |
| Qual provider/canal a Casa Flow tem de fato (GPT Maker não oficial? Cloud API? tem `wpp_instances`?) | só no banco de produção | define se a Fase 0 funciona para ela. **Indício:** o incidente SE-LID-001 da Casa Flow chegou pelo `gpt-maker-webhook`, então ela usa GPT Maker, mas o **tipo** do canal é desconhecido |
| `field_mappings` do webhook `ca544dfe-…` e o nome da `crm_entries` dele | banco de produção | Correção 3 |
| Comportamento do start-conversation repetido no mesmo número | não documentado, sem token aqui | follow-up no GPT Maker |
| Se o eco do start-conversation chega ao `gpt-maker-webhook` com `role: assistant`/`fromMe` | sem tráfego real | cancelamento por resposta (§3.4, risco R3) |
| Se o agente do GPT Maker responde num número pareado também na Solo | sem aparelho | caso híbrido (Correção 1) |
| Se `public-form` grava `lead_touches` | não li a função a fundo | cobertura do gatilho de entrada |
| n8n ao vivo | conector sem autorização nesta sessão | só o JSON exportado foi lido |

Consultas para o operador rodar **antes da Fase 0** estão em §6, passo 0.

---

## 1. Arquitetura alvo

### 1.1 Desenho de ponta a ponta

```
FONTES DE EVENTO (CRM)                 MOTOR (Postgres)                         ENTREGA (edge)
─────────────────────                  ────────────────                         ──────────────
crm-webhook ─┐
gpt-maker-wh ├─► crm_record_touch ─► lead_touches ──(trigger)──┐
solo-wpp-wh ─┘                                                 │
                                                               ▼
UPDATE opportunities.stage_id ─► opportunity_stage_history ─(trigger)─► cadence_enrollments
                                                               ▲          (UNIQUE = idempotência
n8n / UI ─► POST /outreach {action: enroll} ───────────────────┘           da inscrição)
                                                                              │ materializa
                                                                              ▼
messages (sender_type='customer') ──(trigger)──► CANCELA ──────────► outreach_jobs
opportunities.status won/lost ──────(trigger)──► CANCELA              (UNIQUE enrollment+step =
lead diz "SAIR" ────────────────────(trigger)──► contact_opt_outs      idempotência do envio)
                                                                              │
pg_cron (1 min) ─► _outreach_tick() ─► (só se houver job vencido) ─► outreach-worker
                                                                              │ crm_outreach_claim()
                                                                              │ (revalida TUDO no SQL)
                                                                              ▼
                                                                   router: provider do tenant
                                                                     ├─ gptmaker adapter ─► start-conversation (provider)
                                                                     └─ solo adapter ────► sendText (Whatsmiau)
                                                                              │
                                                                   persiste: messages, conversations,
                                                                   lead_activities, crm_outreach_finish()
```

### 1.2 Onde mora cada decisão

| Decisão | Onde | Por quê |
| --- | --- | --- |
| **"Este evento deve gerar contato?"** | SQL: gatilhos que inscrevem em `cadence_sequences` ativas cujo gatilho casa (porta ou etapa) | uma regra, no mesmo lugar para todas as fontes; nenhuma edge function nova precisa lembrar de chamar nada |
| **"Pode mandar agora?"** | SQL: `crm_outreach_claim()` revalida inscrição ativa, lead sem resposta desde o início, sem opt-out, lead não apagado. No worker: tenant não suspenso, janela de horário, limite por linha | a garantia de correção fica no banco, na hora do envio. Os gatilhos de cancelamento são o caminho rápido, o claim é a garantia |
| **"Abrir conversa ou mandar mensagem?"** | **no adaptador do provider**, não na cadência | a cadência só diz "entregue este texto a este lead por esta linha". No GPT Maker, sem `chatId` só existe start-conversation. Na Solo, abrir e mandar são o mesmo `sendText`. É uma diferença de provider, não de negócio |
| **"Por qual provider e qual linha?"** | `conversation_opener_settings` do tenant (`provider`, `channel_id` ou `solo_instance_id`) | explícito por tenant, sem adivinhar e sem fallback entre providers |
| **Texto** | `cadence_steps.message_template`, renderizado na hora do envio com o `renderFirstMessage` existente | um só renderizador de placeholders |

### 1.3 Como isso sobrevive ao 2º e ao 3º cliente

- Tenant novo = **linhas de configuração**: uma em `conversation_opener_settings`
  (provider + linha + janela + limite), N em `cadence_sequences`/`cadence_steps`.
  Nenhum deploy, nenhum código.
- A porta de entrada é a unidade de gatilho. Um cliente com três formulários
  (três webhooks) escolhe quais disparam, e cada porta pode ter sua sequência.
- Um tenant com GPT Maker e outro com Solo usam o mesmo worker. O provider que
  falha (token ausente, Whatsmiau fora do ar) só afeta os jobs dos tenants
  daquele provider (§2.3).
- O limite por linha protege cada número individualmente. O cliente grande não
  consome a cota do pequeno.
- Fase 2: mais providers entram como novo adaptador (`OutreachProvider`), sem
  mudar fila nem gatilhos.

---

## 2. Roteamento de provider

### 2.1 Interface única (`supabase/functions/_shared/outreach/providers.ts`)

```ts
export type ProviderId = "gptmaker" | "solo";

/** A linha física que fala com o lead. `key` é o que o limite por hora conta. */
export interface OutreachLine {
  provider: ProviderId;
  ref: string;        // gptmaker: channelId · solo: wpp_instances.instance_name
  lineId: string;     // gptmaker: channelId · solo: wpp_instances.id
  key: string;        // `${provider}:${lineId}`
  channelType?: string | null;
}

export type DeliveryOutcome =
  | "sent"          // provider aceitou
  | "rejected"      // provider recusou de forma explícita → certamente NÃO entregue
  | "unreachable"   // não conectou/DNS → certamente NÃO entregue
  | "unknown";      // timeout depois de enviar / resposta ilegível → PODE ter entregue

export interface DeliveryResult {
  outcome: DeliveryOutcome;
  retryable: boolean;            // só true para rejected-transitório (429/503) e unreachable
  errorCode?: string;            // reusa OpenFailureCode + 'solo_send_failed' etc.
  errorMessage?: string;
  providerStatus: number | null;
  providerBody: unknown;         // cru, para o rastro
  providerMessageId: string | null;  // solo: key.id · gptmaker: null
  providerChatId: string | null;     // gptmaker: extractProviderChatId (quase sempre null)
}

export interface OutreachProvider {
  id: ProviderId;
  /** Resolve a linha do tenant AGORA (ao vivo). Nunca adivinha entre duas. */
  resolveLine(ctx: ResolveCtx): Promise<{ line: OutreachLine } | { errorCode: string; detail: string }>;
  /** Entrega texto. Nunca lança: todo erro vira DeliveryResult. */
  deliver(line: OutreachLine, req: { phone: string; text: string }): Promise<DeliveryResult>;
}
```

### 2.2 O que é comum e o que é específico

**Comum (fica no worker e no `_shared/outreach/`):** resolução do lead,
normalização de telefone (`normalizePhone` / `isTechnicalPhone` de
`_shared/phone.ts`), renderização do texto, checagem de suspensão
(`tenant_is_suspended`), janela de horário, limite por linha, persistência
(`messages`, `conversations`, `lead_activities`) e fechamento do job.

**GPT Maker (`_shared/outreach/gptmaker.ts`):**
- `resolveLine`: `listEngineChannels` + `pickStartConversationChannel` (**mover**
  de `_shared/start-conversation.ts` e reexportar de lá, para não quebrar os 25
  testes existentes). Precisa de `equipes.workspace_id` e `gpt_maker_agent_id`, e
  de `GPT_MAKER_TOKEN`.
- `deliver`: `callStartConversation`, **corrigido** para exigir
  `body.success === true` quando o corpo for JSON com `success`. Com
  `success: false` o resultado é `rejected` com `errorCode: 'provider_rejected'`.
- Mapeamento: 2xx+success → `sent`; 400/403/404 → `rejected`,
  `retryable=false`; 429/502/503 → `rejected`, `retryable=true`; erro de rede
  antes da resposta → `unreachable`, `retryable=true`; `AbortSignal.timeout`
  disparado → **`unknown`**, `retryable=false`.
- **Não chama `start-human`.** O `send-chat-message` chama `start-human` antes de
  mandar. Isso **tira a IA da conversa**, e é o oposto do que o disparo
  automático quer.

**Solo (`_shared/outreach/solo.ts`):**
- `resolveLine`: `conversation_opener_settings.solo_instance_id`. Se estiver
  preenchido, é essa instância ou erro: `line_not_found`, `line_other_team`,
  `line_not_connected` (lê `wpp_instances.status`). Se for nulo, só decide
  sozinho quando há **exatamente uma** instância `connected` no tenant.
  Com duas, `line_ambiguous`. É a mesma regra do `channel_ambiguous` da
  SE-REV-001, pelo mesmo motivo.
- `deliver`: **reusa `sendViaSolo` sem alterar**. Hoje ele devolve
  `{ok, providerMessageId, error}` com o erro em texto
  (`"Solo API returned 4xx: …"`, `"Solo API error: …"`). O adaptador
  classifica pelo texto. **Ressalva:** o `sendViaSolo` usa `AbortController`
  e um timeout de 15 s vira `"Solo API error: …aborted…"`. Isso deve ser
  classificado como **`unknown`**, não como `unreachable`. Se o executor achar
  a classificação por texto frágil demais, a alternativa é acrescentar um campo
  **opcional** `kind` ao `SendViaSoloResult`. Isso é aditivo, e os três
  consumidores atuais ignoram o campo.
- Depois de `sent`, a conversa recebe `solo_instance_id = line.lineId`. Assim o
  `send-chat-message` do humano usa a Rota A (instância fixada), e o eco
  `fromMe` do `solo-wpp-webhook` é descartado pelo Dedup 1 (`provider_message_id`),
  que **precisa** estar gravado em `messages.provider_message_id`.

**Nada é fallback cruzado.** Um provider que falhou gera job `failed`, com o
motivo registrado, e nunca uma tentativa pelo outro provider.

### 2.3 Isolamento de falha

- `router.ts` escolhe o adaptador por `settings.provider`. Um adaptador só lê as
  variáveis de ambiente dele (`GPT_MAKER_TOKEN` / `WHATSMIAU_BASE_URL` +
  `WHATSMIAU_API_KEY`). Uma variável ausente vira `engine_token_missing` /
  `solo_env_missing` **no job** e não derruba o worker.
- O worker processa cada job em `try/catch` próprio. Uma exceção num job vira
  `crm_outreach_finish(job, 'failed', erro)`, e o lote continua.
- Um job `unknown` **não é reenviado automaticamente** (§3.5).
- O limite por linha evita que uma linha instável acumule tentativas.

---

## 3. Cadência / follow-up

### 3.1 Modelo de dados (migration `20260926000100_serev002_outreach.sql`)

Aditivo, no mesmo padrão da SE-REV-001: RLS de leitura para o time, escrita só
por `service_role`/RPC `security definer`.

**(a) `conversation_opener_settings` + colunas** (a tabela vira "perfil de
disparo do tenant"; o nome fica, para não quebrar a SE-REV-001):

| coluna | tipo | default | nota |
| --- | --- | --- | --- |
| `provider` | text check in (`gptmaker`,`solo`) | `'gptmaker'` | tenants atuais continuam GPT Maker |
| `solo_instance_id` | uuid → `wpp_instances(id)` on delete set null | null | |
| `trigger_entry_ids` | uuid[] | `'{}'` | porta(s) que disparam a abertura **legada** (Fase 0) |
| `send_window_start` / `send_window_end` | time | `'08:00'` / `'20:00'` | |
| `timezone` | text | `'America/Sao_Paulo'` | |
| `max_sends_per_line_hour` | integer check 1..500 | `30` | freio anti-banimento (valor conservador, ajustável) |
| `opt_out_keywords` | text[] | `'{sair,parar,pare,stop,cancelar,descadastrar}'` | comparação: mensagem inteira normalizada (trim, minúscula, sem acento, sem pontuação) **igual** a uma palavra. Não é "contém": "não quero parar de receber" não pode virar opt-out |

**(b) `cadence_sequences`**, a definição:

```
id uuid pk, equipe_id uuid not null → equipes on delete cascade,
name text not null,
active boolean not null default false,          -- nasce desligada, como a SE-REV-001
trigger_event text not null check in ('lead_intake','stage_entered'),
trigger_entry_ids uuid[] not null default '{}', -- lead_intake: portas (vazio = NENHUMA, não "todas")
trigger_stage_id uuid → pipeline_stages_v2,     -- stage_entered
reenroll text not null default 'once_per_lead' check in ('once_per_lead','per_event'),
stop_on_reply boolean not null default true,
stop_on_stage_change boolean not null default true,
created_at, updated_at (+ trigger update_updated_at_column)
check: (trigger_event='lead_intake' and trigger_stage_id is null)
    or (trigger_event='stage_entered' and trigger_stage_id is not null)
```

**Nota:** aqui `trigger_entry_ids` vazio **não** significa "todas as portas".
Significaria mandar WhatsApp para quem chegou por **qualquer** porta, inclusive
o lead que acabou de mandar mensagem para a linha (porta `whatsapp`). Vazio =
não dispara. O `upsert-sequence` só aceita entradas de `kind in
('webhook','import','manual')`.

**(c) `cadence_steps`:**

```
id uuid pk, sequence_id uuid → cadence_sequences on delete cascade,
equipe_id uuid not null,
position smallint not null check (position >= 0),
offset_minutes integer not null check (offset_minutes between 0 and 60*24*60),
message_template text not null check (length(btrim(message_template)) > 0),
active boolean not null default true,
unique (sequence_id, position)
```

`offset_minutes` conta **a partir do início da inscrição**, não do passo
anterior. Isso deixa o agendamento previsível e o cancelamento simples, e uma
janela de horário que empurra um passo não empurra os seguintes em cascata.

**(d) `cadence_enrollments`**, a inscrição de um lead numa sequência:

```
id uuid pk, equipe_id, sequence_id → cadence_sequences on delete cascade,
lead_id → leads on delete cascade, opportunity_id → opportunities on delete set null,
enrollment_key text not null,     -- 'lead:<id>' | 'touch:<id>' | 'stage_history:<id>' | 'api:<chave do chamador>'
trigger_ref jsonb,                -- {entry_id, touch_id} | {stage_history_id, to_stage_id}
status text not null default 'active' check in ('active','completed','cancelled'),
cancel_reason text check in ('lead_replied','stage_changed','opportunity_closed','opted_out','manual','lead_deleted','sequence_disabled'),
started_at timestamptz not null default clock_timestamp(),
finished_at timestamptz, created_at, updated_at
UNIQUE (sequence_id, enrollment_key)                                  -- idempotência da inscrição
UNIQUE (sequence_id, lead_id) WHERE status = 'active'                  -- nunca duas ativas
```

**(e) `outreach_jobs`**, a fila **e** o registro de envio (espelha `copilot_jobs`):

```
id uuid pk, equipe_id, enrollment_id → cadence_enrollments on delete cascade,
step_id → cadence_steps on delete set null, step_position smallint not null,
lead_id → leads on delete cascade,
run_after timestamptz not null,
status text not null default 'queued'
  check in ('queued','running','sent','failed','cancelled','skipped','unknown'),
attempts smallint not null default 0, last_error text, skip_reason text,
claimed_at, finished_at,
provider text, line_key text, rendered_message text,
provider_status integer, provider_response jsonb, provider_message_id text, provider_chat_id text,
conversation_id → conversations on delete set null,
created_at, updated_at
UNIQUE (enrollment_id, step_position)                                 -- idempotência do envio
index (run_after) where status = 'queued'
index (line_key, finished_at) where status = 'sent'                  -- limite por linha
index (lead_id, status)
```

**(f) `contact_opt_outs`:**

```
id uuid pk, equipe_id, phone_normalized text not null, lead_id → leads on delete set null,
reason text not null check in ('keyword','manual','api'), source_message_id uuid,
created_at
UNIQUE (equipe_id, phone_normalized)
```

Chave por **telefone normalizado**, não por lead. Um lead apagado e recriado com
o mesmo número continua descadastrado.

### 3.2 Inscrição (quem cria `cadence_enrollments`)

Uma função SQL, `public._outreach_enroll(p_sequence_id, p_lead_id,
p_opportunity_id, p_enrollment_key, p_trigger_ref) returns uuid`
(`security definer`):
1. `insert … on conflict do nothing returning id`. Se não inseriu (chave
   repetida ou já existe inscrição ativa), devolve null. **O INSERT é a trava**,
   como na SE-REV-001.
2. Se inseriu, materializa **todos** os passos ativos em `outreach_jobs`, com
   `run_after = started_at + offset_minutes`.
3. Não checa opt-out nem janela: isso é trabalho do claim e do worker. A
   inscrição de alguém descadastrado é permitida, e os jobs saem `skipped` com
   `skip_reason='opted_out'`, o que fica visível no rastro.

Os gatilhos que chamam `_outreach_enroll` (todos com `exception when others then
raise warning … ; return new;`, **nunca derrubam a escrita de origem**, como o
`_copilot_enqueue_from_message`):

| Gatilho | Tabela / evento | Sequências casadas | `enrollment_key` |
| --- | --- | --- | --- |
| `trg_lead_touches_outreach` | `after insert on lead_touches` | `active and trigger_event='lead_intake' and new.entry_id = any(trigger_entry_ids)` e mesmo `equipe_id` | `once_per_lead` → `lead:<lead_id>` · `per_event` → `touch:<touch_id>` |
| `trg_stage_history_outreach` | `after insert on opportunity_stage_history` | `active and trigger_event='stage_entered' and trigger_stage_id = new.to_stage_id` | `once_per_lead` → `lead:<lead_id>` · `per_event` → `stage_history:<id>` |
| RPC/HTTP | `outreach` action `enroll` (n8n, UI) | a sequência pedida | `api:<event_key do chamador>` ou `lead:<id>` |

**Por que o gatilho fica em `lead_touches` e não no `crm-webhook`:** toda
chegada de lead já passa por `crm_record_touch` (conferido: `crm-webhook` nas
duas rotas, `gpt-maker-webhook`, `solo-wpp-webhook`), e o `insert into
lead_touches` é incondicional. Um gatilho ali cobre todas as portas **sem
tocar em nenhuma edge function**, e resolve a pendência 4 da SE-REV-001
("outros criadores de lead não disparam"). O filtro por porta impede que uma
mensagem recebida no WhatsApp inscreva o lead numa sequência de abertura.

**Limitação conhecida:** o `recordTouch` pode falhar (entrada sem `crm_entries`,
RPC com erro), e ele só registra log. Nesse caso não há inscrição. É o mesmo
modo de falha da atribuição, que já é monitorada. Lead nascido **direto numa
etapa** (sem linha de histórico) não dispara `stage_entered`. É a mesma lacuna
que o Sprint 9 tratou com um gatilho à parte para o funil. Fica para a Fase 2.

### 3.3 Disparo (fila → worker)

**Tick:** `public._outreach_tick()` é uma cópia do `_copilot_tick`. Só chama
quando existe `outreach_jobs` com `status='queued' and run_after <= now()`. A
URL e o segredo vêm do Vault (`outreach_worker_url`, `outreach_worker_secret`),
e sem eles só emite warning. O `cron.schedule('outreach-tick', '* * * * *', …)`
fica em **`supabase/scripts/2026-09-26_serev002_schedule_outreach_tick.sql`**,
que é inerte e só é aplicado pelo operador, com aprovação. É o padrão do
repositório.

**Claim:** `public.crm_outreach_claim(p_limit int default 20) returns setof
outreach_jobs`, `security definer`, com execute só para `service_role`:

1. Jobs `running` com `claimed_at` de mais de 5 min passam para **`unknown`**
   (não para `queued`!), com `last_error='interrompido: entrega incerta'`. Esta é
   a diferença deliberada em relação ao Copilot: reprocessar uma leitura é
   barato, mas mandar a mesma mensagem duas vezes para uma pessoa não é.
2. Jobs `queued` vencidos cuja inscrição **não está `active`** passam para
   `cancelled`.
3. Jobs `queued` vencidos cujo lead **respondeu** passam para `cancelled` e a
   inscrição para `cancelled/lead_replied`. "Respondeu" aqui é `exists messages
   where lead_id = j.lead_id and sender_type='customer' and created_at >
   enrollment.started_at`, e só vale quando `stop_on_reply`. É a **garantia**,
   porque o gatilho de §3.4 pode ter falhado em silêncio.
4. Jobs `queued` vencidos com telefone em `contact_opt_outs`, ou com lead
   `deleted_at is not null`, passam para `skipped` com o motivo.
5. Os demais: `for update skip locked`, `limit p_limit`, e passam para
   `running`, com `attempts+1`, `claimed_at=now()`.

**Worker** (`supabase/functions/outreach-worker/index.ts`, `verify_jwt =
false`). Autentica por `x-outreach-secret` comparado com a env
`OUTREACH_WORKER_SECRET` (o mesmo valor guardado no Vault). **Recusa sem o
segredo**, ao contrário do `cadence-check`. Para cada job reivindicado:

1. Carrega o lead, as settings do tenant, o passo e a conversa.
2. `tenant_is_suspended` = true → `finish(skipped, 'contract_suspended')`.
3. Checa `isTechnicalPhone` / telefone ausente → `finish(skipped, …)`.
4. Janela de horário: se `now` está fora de `[start,end)` no fuso do tenant,
   chama `crm_outreach_defer(job, próximo_início_da_janela)`. O job volta para
   `queued` e **não conta tentativa** (é uma função pura em `schedule.ts`, com
   teste).
5. Resolve a linha (`router → provider.resolveLine`). Com erro →
   `finish(failed, código)` (sem retry, porque é erro de configuração).
6. Limite por linha: `count(*) from outreach_jobs where line_key = X and status
   = 'sent' and finished_at > now() - 1h` ≥ o limite → `defer(now + 5 min)`.
7. Renderiza (`renderFirstMessage(step.message_template, ctx)`). Vazio →
   `finish(failed, 'missing_message')`.
8. `provider.deliver(line, {phone, text})`.
9. Com `sent`: persiste (§3.6) e chama `finish(sent, …)`. Com `rejected` ou
   `unreachable`: `finish(failed, …, retryable)`. Com `unknown`:
   `finish(unknown, …)`.

**Finish:** `public.crm_outreach_finish(p_job_id, p_status, p_error, p_result
jsonb, p_retryable boolean)`. Um `failed` com `retryable` e `attempts < 3` volta
para `queued`, com `run_after = now() + attempts² min` (o mesmo padrão do
Copilot). Quando é o último job da inscrição e ele saiu `sent`, `skipped` ou
`failed`, a inscrição passa a `completed`. Só fecha se `status='running'`, senão
devolve `'not_running'` (dois finishes não se atropelam).

### 3.4 Cancelamento

| Motivo | Caminho rápido (gatilho) | Garantia |
| --- | --- | --- |
| **Lead respondeu** | `trg_messages_outreach_cancel` `after insert on messages` quando `sender_type='customer'`: cancela as inscrições ativas do lead (com `stop_on_reply`) e os jobs `queued` delas | passo 3 do claim |
| **Opt-out por palavra** | no mesmo gatilho: se o texto normalizado é igual a uma palavra de `opt_out_keywords` do tenant, faz `insert into contact_opt_outs … on conflict do nothing` e cancela **todas** as inscrições do lead com `opted_out` | passo 4 do claim |
| **Mudou de etapa** | `trg_stage_history_outreach` (o mesmo de §3.2): antes de inscrever, cancela as inscrições ativas **da mesma oportunidade** com `stop_on_stage_change` cuja origem não seja esta etapa | a inscrição não está mais `active` (passo 2) |
| **Negócio ganho/perdido** | `after update of status on opportunities` quando `status in ('won','lost')` → `opportunity_closed` | passo 2 |
| **Manual / n8n** | `outreach` action `cancel` (por `enrollment_id` ou `lead_id`) → RPC `crm_outreach_cancel` | passo 2 |
| **Sequência desligada** | `after update of active on cadence_sequences` quando vira false → `sequence_disabled` | passo 2 |
| **Lead apagado** | — | passo 4 (`deleted_at`) |

Todos os gatilhos têm `exception when others then raise warning`. Uma falha de
cancelamento **nunca** impede gravar mensagem, mudar etapa ou fechar negócio. A
correção fica garantida pelo claim.

**Janela que sobra (aceita e documentada):** o lead responde no mesmo segundo em
que o worker está com o job em `running` chamando o provider. A mensagem sai.
Isso dura segundos e é inerente a qualquer sistema com rede no meio.

### 3.5 Idempotência — onde exatamente ela mora

| O que não pode duplicar | Mecanismo no banco |
| --- | --- |
| a mesma pessoa inscrita duas vezes pelo mesmo evento | `UNIQUE (sequence_id, enrollment_key)` |
| duas inscrições ativas da mesma pessoa na mesma sequência | `UNIQUE (sequence_id, lead_id) WHERE status='active'` |
| o mesmo passo enviado duas vezes | `UNIQUE (enrollment_id, step_position)` |
| dois workers pegando o mesmo job | `FOR UPDATE SKIP LOCKED` + transição `queued→running` |
| reenvio depois de uma entrega incerta | job `running` abandonado vira **`unknown`, nunca `queued`** · timeout pós-envio vira `unknown` · o retry automático só acontece em `rejected` transitório e `unreachable` |
| opt-out ignorado | `contact_opt_outs` conferido **no claim**, dentro do mesmo SQL que reivindica |

**Semântica escolhida: no máximo uma vez.** Um job `unknown` aparece no rastro
para uma pessoa decidir. **Esta é a correção de um risco que já existe na
SE-REV-001:** lá, `claimEvent` reassume uma reserva `pending` de mais de 5 min.
Se o provider aceitou e a função morreu antes de gravar `opened`, a retomada
**manda de novo**. O plano não altera esse comportamento no caminho HTTP legado
(a correção seria mudar semântica, e o dono decide). O motor novo não herda o
problema. Está registrado como risco R6.

### 3.6 Persistência depois de `sent`

Generaliza o `persistOpenedConversation` da SE-REV-001 em
`_shared/outreach/persist.ts`:
- **conversa:** reaproveita a conversa de WhatsApp do lead (a mesma busca que
  os dois webhooks usam: `lead_id + channel='whatsapp' + status != 'deleted'`) ou
  cria uma. Grava `opened_at` (só se for nulo), `opened_via = 'cadence'` (o valor
  novo convive com `'start_conversation'`; a coluna é `text` livre, conferido),
  `provider_channel_id`, `last_message_at`, e `solo_instance_id` quando for Solo.
  O `gpt_maker_chat_id` só é gravado se vier não nulo.
- **mensagem:** `messages` com `sender_type='agent'`, `sender_id = null`,
  `provider = 'gptmaker' | 'solo'`, `provider_message_id` (Solo). **Não** grava
  `sender_id`: a dedup de mídia do `gpt-maker-webhook` usa `sender_id != null`
  como "envio humano", e não queremos cair nesse caminho.
- **timeline:** `lead_activities` com `tipo='cadence_message_sent'` e metadata
  `{job_id, enrollment_id, sequence_id, step_position, provider, line_key}`.
- **job:** `rendered_message`, `provider_*`, `conversation_id`.

---

## 4. Eventos de CRM — de onde saem e como plugar sem quebrar

### 4.1 Eventos do MVP

| Evento | Fonte real | Plugue |
| --- | --- | --- |
| **Lead chegou por uma porta** (novo ou voltando) | `lead_touches` (via `crm_record_touch`) | gatilho SQL (§3.2) |
| **Oportunidade entrou numa etapa** | `opportunity_stage_history` | gatilho SQL (§3.2) |
| **Ficou parado na etapa N horas** ("idle") | modelado como `stage_entered` + passo com `offset_minutes = N*60` + `stop_on_stage_change` | nenhum scanner |
| **Lead respondeu** | `messages.sender_type='customer'` | gatilho SQL (§3.4) |
| **Negócio fechado** | `opportunities.status` | gatilho SQL (§3.4) |
| **Pedido explícito** (n8n, botão) | HTTP `outreach` action `enroll` | edge function nova |

### 4.2 Contrato de "não quebrar"

| Arquivo | Toque | Por quê é seguro |
| --- | --- | --- |
| `crm-webhook/index.ts` | **mínimo:** passar `entryId` (já calculado para `recordTouch`, basta guardar numa variável) e `source` do payload para `dispatchConversationOpen`. A resposta mantém exatamente os mesmos campos, `conversation_open_dispatched` incluído | nenhum campo novo, nenhum removido, nenhum status HTTP diferente |
| `gpt-maker-webhook` | **não tocado** | os gatilhos ficam em `messages` e `lead_touches` |
| `solo-wpp-webhook` | **não tocado** | idem |
| `send-chat-message` | **não tocado**, **não chamado** | é só JWT, faz `start-human` e fallback entre providers, e as três coisas são erradas para automação |
| `cadence-check` | **não tocado** | Correção 4 |
| `_shared/solo-sender.ts` | **reusado sem mudança** (ou com um campo opcional aditivo, ver §2.2) | |
| `start-conversation/index.ts` | **mínimo:** o filtro de `lead_intake` passa a usar o `source` recebido no corpo quando ele vier (Correção 3), e o filtro por porta (`entry_id` no corpo contra `trigger_entry_ids`) | as chamadas do n8n (`trigger_source='http'`) não passam por esses filtros hoje e continuam não passando |
| `_shared/start-conversation.ts` | `callStartConversation` exige `success === true` (bug). O `dispatchConversationOpen` aceita `entryId`, filtra por `trigger_entry_ids` quando não vazio, e **não chama a abertura legada se o tenant tiver sequência `lead_intake` ativa para aquela porta** (evita duas primeiras mensagens: a legada e o passo 0 da cadência). Nesse caso devolve `dispatched: true, reason: 'cadence'` se existir inscrição do lead | assinatura continua compatível (parâmetros novos opcionais) |

**Regra de convivência legado × motor, por tenant e por porta:** se a porta tem
sequência `lead_intake` ativa, quem manda a primeira mensagem é a cadência (o
passo 0). Senão, e se `conversation_opener_settings.enabled`, é a abertura
legada imediata. Nunca as duas.

### 4.3 API HTTP nova — `supabase/functions/outreach/index.ts`

Mesmas três credenciais da SE-REV-001. O `resolveCaller` sai de
`start-conversation/index.ts` para `_shared/tenant-auth.ts` e é importado pelos
dois, com um teste de regressão garantindo o mesmo comportamento.

| action | credencial | faz |
| --- | --- | --- |
| `enroll` `{sequence_id, lead_id \| phone, event_key?}` | secret / JWT / service | `_outreach_enroll` com `api:<event_key>` ou `lead:<id>` |
| `cancel` `{enrollment_id \| lead_id, sequence_id?}` | secret / JWT | `crm_outreach_cancel(..., 'manual')` |
| `opt-out` `{phone \| lead_id}` | secret / JWT | insere em `contact_opt_outs` (`api`/`manual`) + cancela |
| `list-sequences` | JWT / secret | sequências + passos + contagem de inscrições por status |
| `upsert-sequence` `{sequence, steps[]}` | **só JWT** | valida (portas do próprio tenant e de `kind` permitido; etapa do próprio tenant; `offset` crescente; `position 0..N`) e grava |
| `update-profile` `{provider, solo_instance_id, janela, limite, keywords}` | **só JWT** | grava em `conversation_opener_settings` |
| `get-trace` `{lead_id}` | JWT / secret | inscrições + jobs do lead (para suporte: "por que não recebeu?") |

### 4.4 n8n (caminho temporário)

- **Nenhuma mudança obrigatória no workflow da Casa Flow.** Ele chama
  `crm-webhook/inbound/<config>`, isso grava o touch com a porta, e o gatilho
  inscreve o lead. O reenvio da mesma linha da planilha é seguro graças a
  `lead:<id>`.
- Como o workflow se comporta hoje (lido no JSON): o `Update row` (`crm = sim`)
  só roda depois do HTTP. Se o HTTP falha, o nó falha e a linha é tentada de
  novo no próximo ciclo (10 min). Isso é correto e continua correto.
- **Recomendação (não obrigatória):** baixar o Schedule Trigger de 10 para 2 min.
  A velocidade do primeiro contato é o que converte lead de formulário, e o
  motor responde em até 1 min depois que o lead existe.
- A rota `/inbound/<config_id>` se autentica pelo UUID na URL (é o comportamento
  atual, que não muda). O critério "n8n chama por HTTP autenticado" vale para
  `outreach` e `start-conversation` via `x-webhook-secret`.
- **Fase 2:** ingestão nativa de Meta Lead Ads (webhook `leadgen` → porta),
  aposentando planilha + n8n.

---

## 5. Fronteira MVP × Fase 2

### Fase 0 — "resolver a Casa Flow agora" (commits separados no início da branch, deployáveis sozinhos)

1. `callStartConversation`: `success: false` com 200 → `provider_rejected`.
2. Filtro por porta: `trigger_entry_ids` em `conversation_opener_settings` +
   `entryId` do `crm-webhook` para o dispatcher e para o `start-conversation`.
3. Inconsistência do source: o `lead_intake` filtra pelo source do evento, não
   pelo `leads.source` antigo.
4. Testes Deno das três correções + atualização do `integracao-n8n.md` da
   SE-REV-001 (o exemplo `trigger_sources` passa a ser `trigger_entry_ids`).

**Por que isso já resolve o job:** a Casa Flow recebe a primeira mensagem
automaticamente, pelo canal dela, em minutos, sem duplicar. Depende de o canal
dela ser **WhatsApp não oficial** (§6 passo 0). Se não for, a Fase 0 não resolve
a Casa Flow, e o caminho é uma linha Solo pela Fase 1.

### Fase 1 — MVP da SE-REV-002 (escala)

- Migration: settings + 5 tabelas + gatilhos + RPCs (`_outreach_enroll`,
  `crm_outreach_claim`, `crm_outreach_defer`, `crm_outreach_finish`,
  `crm_outreach_cancel`, `_outreach_tick`).
- Adaptadores GPT Maker e Solo atrás de uma interface, **sem fallback cruzado**.
- `outreach-worker` + `outreach` (API).
- Gatilhos: porta (`lead_intake`), etapa (`stage_entered`, cobrindo idle por atraso).
- Cancelamento: resposta, opt-out por palavra, mudança de etapa, ganho/perda,
  manual, sequência desligada, lead apagado.
- Freios: janela de horário, limite por linha e por hora, no-máximo-uma-vez.
- Só texto.
- Configuração por API/SQL, **sem UI**.
- Script inerte de agendamento do tick.
- Documentação operacional (`implementacao.md`, `integracao-n8n.md` da SE-REV-002).

**Por que a fronteira fica aqui:** é o menor conjunto que atende os quatro
critérios do spec (roteamento por configuração; sequência com atraso,
cancelável e idempotente; eventos de CRM alimentando o motor; n8n chamando por
HTTP autenticado) **e** não queima o número do cliente. Tudo o que está abaixo
ou é conforto (UI), ou depende de resposta do smoke (send-message por chatId),
ou é produto novo (IA, ramificação).

### Fase 2 — depois do MVP validado em produção

- **UI** do construtor de sequências (aba em Canais/Agente) + painel do rastro.
- **Mídia** (imagem/vídeo/áudio/documento): o provider aceita no
  start-conversation (`image`, `video`, `audio`, `document` +
  `documentName`/`documentMimetype`), e o `sendViaSolo` já suporta.
- **`send-message` por `chatId`** para sequências que continuam depois da resposta
  (lembrete de reunião, reengajamento). Depende de confirmar que funciona sem
  `start-human`.
- Gatilho **"conversa esfriou"** (última mensagem do cliente há N horas e a IA
  não fechou): reengajamento.
- Lead nascido direto numa etapa disparando `stage_entered`.
- Ramificação (se respondeu X → sequência Y), teste A/B de texto, **follow-up
  escrito por IA** com o contexto do Copilot (`crm_copilot_context`).
- Sobreposição de linha por sequência. Rodízio entre várias linhas Solo.
- Calendário de dias úteis/feriados.
- Métricas: taxa de resposta por passo e por sequência.
- Kick imediato do worker ao inscrever (pg_net no gatilho), para latência menor
  que 1 min.
- Aposentar o `cadence-check`, ou fazê-lo só inscrever. Decidir o destino do
  `on_stage_entered` morto.
- Ingestão nativa de Meta Lead Ads (aposentar planilha + n8n).
- Resolver a retomada de `pending` da SE-REV-001 (R6).
- **Fora de alcance com o provider atual:** abrir conversa em Cloud API
  (Correção 7).

---

## 6. Ordem de implementação (cada passo verificável)

> Convenção: um commit por passo, mensagem `feat(rev): …`/`fix(rev): …`. Nada de
> push, deploy ou `sqltest.sh` contra produção.

**Passo 0 — pré-voo (operador, fora do sandbox; o executor só registra que é
necessário).** Leitura em produção, com aprovação:
```sql
-- canal/provider da Casa Flow
select e.id, e.nome, e.workspace_id is not null as has_ws, e.gpt_maker_agent_id is not null as has_agent
  from equipes e where e.nome ilike '%casa flow%';
select id, instance_name, status, ingest_inbound from wpp_instances where equipe_id = '<casa_flow>';
-- a porta do webhook do n8n e o que vira leads.source
select id, name, field_mappings from webhook_configs where id = 'ca544dfe-b643-4df0-addb-345992a2abdc';
select id, kind, name from crm_entries where webhook_config_id = 'ca544dfe-b643-4df0-addb-345992a2abdc';
select source, count(*) from leads where equipe_id = '<casa_flow>' and created_at > now() - interval '14 days' group by 1;
```
E, com o token, `GET /v2/workspace/{ws}/channels?agentId=…` para ver o `type` do
canal. **Critério:** saber se a Casa Flow vai por GPT Maker não oficial (Fase 0
resolve) ou precisa de Solo (Fase 1).

**Passo 1 — Fase 0: correção `success:false`.** `_shared/start-conversation.ts`
+ testes (`200 {success:false}` → não ok; `200 {success:true}` → ok; `200` sem
corpo → ok, porque a documentação só define o corpo com `success`, e **registrar
esta suposição**).
✔ `deno test --allow-net --allow-env supabase/functions/_shared/` (baseline: 160 passed).

**Passo 2 — Fase 0: filtro por porta + source do evento.** Migration pequena
`20260926000050_serev002_opener_entry_filter.sql` (só
`trigger_entry_ids uuid[] default '{}'`), dispatcher, `crm-webhook` passando
`entryId`/`source`, `start-conversation` usando o source do corpo em
`lead_intake`, e `update-settings` aceitando `trigger_entry_ids` (validando que
as portas são do tenant).
✔ Testes Deno de `sourceMatches`/`entryMatches` · `deno check` nos três arquivos ·
teste SQL local da coluna.
Aqui a Fase 0 pode ser **cortada** para deploy.

**Passo 3 — Migration do motor** `20260926000100_serev002_outreach.sql`:
colunas de settings, 5 tabelas, índices, RLS, `_outreach_enroll`, claim, defer,
finish, cancel, gatilhos (touches, stage history, messages, opportunities
status, sequences active), `_outreach_tick` (com `revoke`/`grant` como o
Copilot).
✔ `supabase/tests/serev002_outreach.test.sql` rodado em **PG 15 local efêmero**
(`/usr/lib/postgresql/15/bin/initdb` existe neste sandbox), com os stubs mínimos
(`equipes`, `profiles`, `leads`, `conversations`, `messages`, `opportunities`,
`opportunity_stage_history`, `pipeline_stages_v2`, `lead_touches`,
`crm_entries`, `wpp_instances`, `update_updated_at_column`, `auth.uid()`, roles,
e um stub de `vault.decrypted_secrets` e `net.http_post`) e o `-- @include` da
migration expandido, como a SE-REV-001 fez. Casos mínimos:
- T1 touch da porta certa inscreve e materializa N jobs com `run_after` correto;
  porta errada não inscreve; array vazio não inscreve.
- T2 mesmo touch duas vezes (`once_per_lead`) = 1 inscrição; `per_event` = 2 só
  depois que a primeira terminar.
- T3 `UNIQUE (enrollment_id, step_position)` barra um job duplicado.
- T4 mensagem `customer` cancela a inscrição e os jobs queued; mensagem `agent`
  não cancela.
- T5 "SAIR" gera opt-out e cancela; "não quero parar" não gera.
- T6 mudança de etapa cancela `stop_on_stage_change` e inscreve na sequência da
  nova etapa.
- T7 claim: devolve só os vencidos; `skip locked` (duas sessões não dá para
  testar num arquivo, então testar a transição de status); job de inscrição
  cancelada sai `cancelled`; lead que respondeu (mensagem inserida **com o
  gatilho desligado**, para provar a garantia do claim) sai `cancelled`;
  opt-out sai `skipped`.
- T8 `running` de mais de 5 min vira `unknown`, **não** `queued`.
- T9 finish: `failed` retryable volta com espera; na 3ª tentativa fica `failed`;
  o último passo fecha a inscrição como `completed`.
- T10 falha dentro de um gatilho (forçada) **não** impede o INSERT em `messages`.
- T11 RLS ligada, com política de leitura por equipe em todas as tabelas novas;
  `_outreach_tick`/claim sem execute para `authenticated`.
- T12 `_outreach_tick` sem job vencido devolve null sem chamar `net.http_post`.

**Passo 4 — Funções puras** (`_shared/outreach/schedule.ts`, `optout.ts`,
`classify.ts`): `nextAllowedSendTime(now, start, end, tz)` (dentro, antes,
depois, virada de dia, janela que cruza meia-noite recusada na validação),
`normalizeForOptOut`, `isOptOut`, a classificação de `DeliveryResult` a partir de
status/erro (GPT Maker e o texto do `sendViaSolo`, incluindo abort → `unknown`).
**Nota:** o opt-out é decidido **no gatilho SQL** (§3.4). A versão TS existe para
a validação de `upsert` e para testes de equivalência. As duas têm de concordar,
então escrever um caso de teste espelhado nos dois lados.
✔ `deno test` com os casos acima.

**Passo 5 — Adaptadores + router** (`_shared/outreach/providers.ts`,
`gptmaker.ts`, `solo.ts`, `router.ts`). Mover `listEngineChannels`,
`pickStartConversationChannel`, `callStartConversation`, `engineHeaders` e
`extractProviderChatId` para `gptmaker.ts`, **reexportando** de
`start-conversation.ts`. O `solo.ts` usa `sendViaSolo`.
✔ `deno test` com `fetch` stubado (`globalThis.fetch` substituído no teste):
GPT Maker `200 {success:true}` → sent, `200 {success:false}` → rejected, 403 →
rejected não retryable, 503 → retryable, abort → unknown; Solo com `key.id` →
sent + `providerMessageId`, sem `key.id` → **unknown** (o provider aceitou o
HTTP mas não deu id; tratar como entrega incerta), 4xx → rejected. Resolução de
linha Solo: fixada, ambígua, desconectada, de outro time. **E os 25 testes da
SE-REV-001 continuam passando sem edição.**

**Passo 6 — `_shared/tenant-auth.ts`** (extrair `resolveCaller`) +
`start-conversation` passando a importá-lo.
✔ `deno check supabase/functions/start-conversation/index.ts` + teste da
precedência do segredo sobre o JWT.

**Passo 7 — `outreach-worker`** + `_shared/outreach/persist.ts`.
✔ `deno check`. Teste de unidade do loop com um cliente Supabase falso (um objeto
com `rpc`/`from` que grava as chamadas): um job `sent` chama o finish com `sent`
e insere a mensagem com `provider_message_id`; uma exceção num job não
interrompe o próximo; fora da janela chama o defer sem chamar o provider.

**Passo 8 — `outreach` (API)** + `config.toml` (`[functions.outreach-worker]` e
`[functions.outreach]` com `verify_jwt = false`, e comentário dizendo que a
função se autentica sozinha).
✔ `deno check` + testes de validação do `upsert-sequence` (porta de outro time
recusada, porta `whatsapp` recusada, offsets fora de ordem recusados).

**Passo 9 — convivência legado × motor no `dispatchConversationOpen`** (§4.2).
✔ Teste: tenant com sequência ativa para a porta → não chama o HTTP legado.

**Passo 10 — Script inerte** `supabase/scripts/2026-09-26_serev002_schedule_outreach_tick.sql`
(com o `vault.create_secret` comentado, sem valores, e o unschedule), no molde de
`2026-09-14_sprint11_schedule_copilot_tick.sql`.

**Passo 11 — Documentação:** `SE-REV-002/claude/implementacao.md` (o que foi
feito, decisões, validações reais, baseline, NÃO EXECUTADO) e
`SE-REV-002/claude/integracao-n8n.md` (contrato do `outreach`, exemplo da
sequência da Casa Flow em SQL/HTTP **sem dados da Casa Flow no código**, plano
de deploy e smoke). Atualizar o exemplo de `trigger_sources` na documentação da
SE-REV-001.

**Passo 12 — Rodada final de validação** (§7) e registro dos resultados.

Exemplo de sequência (vai **só na documentação**, como configuração, nunca em
código):
`lead_intake` na porta do webhook do n8n. Passo 0 (+0 min): "Oi {{lead.first_name}}, aqui é da {{tenant.name}}…".
Passo 1 (+1 dia): follow-up curto. Passo 2 (+3 dias): último toque com
opt-out explícito ("se não quiser mais receber, responda SAIR").

---

## 7. Validações

| Validação | Comando | Expectativa / baseline |
| --- | --- | --- |
| Testes Deno `_shared` | `deno test --allow-net --allow-env supabase/functions/_shared/` | baseline **160 passed**. Esperado: 160 + os novos, 0 falhas |
| Typecheck Deno, arquivos novos e tocados | `deno check supabase/functions/{start-conversation,crm-webhook,outreach,outreach-worker}/index.ts supabase/functions/_shared/outreach/*.ts supabase/functions/_shared/start-conversation.ts supabase/functions/_shared/tenant-auth.ts` | OK |
| Typecheck Deno, todas as funções | `for f in supabase/functions/*/index.ts; do deno check "$f"; done` | **baseline: 1 falha** em `cadence-check/index.ts:110` (TS2352), arquivo não tocado |
| Lint Deno dos arquivos novos | `deno lint supabase/functions/_shared/outreach supabase/functions/outreach supabase/functions/outreach-worker` | 0 erros (conferir se há `deno.json` com regras em `supabase/functions/deno.json`, que existe) |
| Teste SQL | PG 15 local efêmero (`/usr/lib/postgresql/15/bin/initdb` em `/tmp`, destruído no fim), com stubs e o `@include` expandido | todos os asserts + `PASS` |
| Frontend | **não se aplica se `src/` não for tocado** (o MVP não tem UI). Se o executor tocar em `src/`: `node_modules` **está vazio** neste worktree, então `npm install --legacy-peer-deps --include=dev` + `npm i --no-save @testing-library/dom`, e restaurar o `package-lock.json` depois. Baselines da SE-REV-001: typecheck 2 erros (`useOnboarding.ts:192`, `Chat.tsx:378`), lint 0 erros/82 warnings, testes 397/397 com env dummy | idem baseline |
| `git diff --stat` nos arquivos proibidos | `git diff b8f16bb -- supabase/functions/{gpt-maker-webhook,send-chat-message,cadence-check,solo-wpp-webhook}` | **vazio** |
| Sem segredos | `git diff b8f16bb \| grep -iE 'eyJ\|sk-\|apikey.*[A-Za-z0-9]{20}\|egxzsivzqlqadoqpgfby'` | nada novo (o project id já está no `config.toml`, que não entra nas mudanças) |
| Sem hardcode de cliente | `git diff b8f16bb -- supabase/ \| grep -i 'casa.\?flow\|ca544dfe'` | só em comentários que citam o incidente, nunca em lógica ou dado |

**O que não dá para rodar neste sandbox (declarar NÃO EXECUTADO):**
- Chamada real ao GPT Maker e à Whatsmiau (sem tokens, sem autorização).
- `scripts/sqltest.sh` (roda **contra produção**, sem `.env` aqui).
- pg_cron, pg_net e Vault de verdade (no local são stubs, então o tick só é
  testado pela lógica "tem job ou não").
- Deploy e o `cron.schedule`.
- Leitura do n8n ao vivo (conector sem autorização).
- Concorrência real de dois workers (`SKIP LOCKED` só é validável com duas
  sessões simultâneas; dá para fazer com dois `psql` em background no PG local,
  **opcional**, e declarar o resultado se feito).

**Smoke em produção (depois, com aprovação), nesta ordem:**
1. Fase 0: os seis passos do `integracao-n8n.md` da SE-REV-001, **mais**:
   (a) forçar um canal que devolva `success:false` (se possível) e ver `failed`;
   (b) **chamar o start-conversation duas vezes com `event_key` diferentes para o
   mesmo aparelho e observar o que chega** (segunda mensagem no mesmo chat? erro?).
   Isso decide o follow-up no GPT Maker. (c) Observar no
   `gpt-maker-webhook`/`messages` com que `sender_type` o eco da abertura chega
   (R3).
2. Fase 1: uma sequência de teste com passos de +0, +2 e +4 min num aparelho da
   equipe. Deixar chegar o passo 1, responder e confirmar que o passo 2 **não**
   sai. Repetir com "SAIR". Repetir numa linha Solo. Repetir fora da janela
   (ajustando a janela) e confirmar o adiamento.

---

## 8. Riscos

| # | Risco | Prob. | Impacto | Mitigação |
| --- | --- | --- | --- | --- |
| R1 | **start-conversation repetido no mesmo número** não se comporta como follow-up (erro, chat duplicado, ou o provider ignora) | média | follow-up no GPT Maker não funciona | smoke 1(b) **antes** de ligar sequências de vários passos para tenants GPT Maker. Se falhar: o follow-up no GPT Maker fica restrito ao passo 0 até a Fase 2 (send-message por chatId), ou o tenant usa Solo para a cadência. O motor não muda, só a configuração |
| R2 | **Canal da Casa Flow não é WhatsApp não oficial** (é CLOUD_API "vestido" de WHATSAPP, como já aconteceu na Solo Energia) | média | Fase 0 não resolve a Casa Flow | passo 0 do §6 + a `hint` do 404 que já existe. O caminho vira uma linha Solo (Fase 1) |
| R3 | **O eco da nossa mensagem chega como `customer`** em algum provider/caso (ex.: `fromMe` ausente) e o gatilho cancela a cadência logo depois do passo 0 | baixa-média | follow-ups nunca saem (falha silenciosa, mas segura: manda menos, não mais) | smoke 1(c). Se acontecer: o cancelamento por resposta ignora mensagem `customer` cujo conteúdo é igual a um `outreach_jobs.rendered_message` enviado ao lead nos últimos 10 min. Isso é uma regra no SQL, mas só entra **se o smoke mostrar o problema** |
| R4 | **Banimento do número** por disparo automático em WhatsApp não oficial | média | cliente perde a linha | janela, limite por linha, opt-out, texto com saída explícita no último passo, **nenhum reenvio incerto**. Recomendar volumes baixos no começo. Não há mitigação completa: é inerente ao canal não oficial, e o dono precisa saber disso |
| R5 | **Tenant só Solo espera que "a IA responda"** | alta, se não for comunicado | expectativa errada do cliente | Correção 1 na documentação operacional e na venda. O caso híbrido precisa de teste com aparelho |
| R6 | **Reenvio pela retomada de `pending` da SE-REV-001** (reserva de mais de 5 min reassumida quando o provider aceitou e a função morreu) | baixa | lead recebe a primeira mensagem duas vezes | o motor novo não herda o problema (`unknown`). No legado fica documentado, e a mudança é decisão do dono (Fase 2) |
| R7 | **Gatilho em tabela quente** (`messages`, `lead_touches`, `opportunity_stage_history`) deixa escrita mais lenta ou falha | baixa | latência do inbox/webhook | gatilhos com `exception when others`, consultas por índice (`lead_id`, `status='active'`), saída cedo quando o tenant não tem sequência ativa (um `exists` indexado por `equipe_id, active`). T10 prova que falha não derruba o INSERT |
| R8 | **`recordTouch` falha** e a chegada não inscreve | baixa | lead sem contato | log existente. `get-trace` mostra "sem inscrição". Fase 2: alerta |
| R9 | **Schema de produção diferente dos stubs** (ex.: colunas de `opportunity_stage_history`, `lead_touches`) | média | migration não aplica | os stubs copiam as colunas lidas nas migrations do repo. `sqltest.sh` contra produção em `BEGIN…ROLLBACK` é a confirmação que falta (NÃO EXECUTADO aqui) |
| R10 | **Cron não ligado** depois do deploy (pg_cron/pg_net/Vault são passos manuais) | média | jobs acumulam em `queued` e nada sai | o script inerte com checklist, e `select public._outreach_tick()` manual no smoke. O `get-trace` mostra `queued` vencido |
| R11 | **Classificação por texto do erro do `sendViaSolo`** quebra se a mensagem mudar | baixa | retry indevido ou falta de retry | teste fixa as strings atuais. Alternativa aditiva: campo `kind` opcional (§2.2) |
| R12 | **Hora/fuso**: `time` sem fuso + `timezone` do tenant; horário de verão (o Brasil não tem hoje, mas outros fusos têm) | baixa | envio 1 h fora da janela | cálculo com `Intl.DateTimeFormat` no fuso. Teste com fuso que tem horário de verão |
| R13 | **Custo/crédito do provider por mensagem** (GPT Maker cobra créditos? Solo tem cobrança por instância) | não sei | cobrança inesperada do cliente | **não verificado**. Perguntar ao dono antes de ligar sequências longas |
| R14 | **Dedup por conteúdo do `gpt-maker-webhook`** descarta mensagem do lead igual a uma nossa recente, na janela de 5 min | baixa | uma resposta "ok" do lead igual ao nosso texto não seria vista | irrelevante na prática: nossos textos não são respostas curtas |
| R15 | **`cadence-check` sem autenticação** (pré-existente) | — | qualquer um dispara webhooks de stage | **fora do escopo** (arquivo intocável nesta task), mas registrado para o dono: é um problema de segurança real |

---

## 9. Resumo para o executor

1. Leia §0 inteiro antes de codar. Ele muda decisões que o pedido original daria
   como certas.
2. Siga o §6 na ordem. Os passos 1–2 (Fase 0) são commits que precisam poder
   ir para deploy sozinhos.
3. Não toque nos arquivos da lista de §4.2 marcados "não tocado". Confira com o
   `git diff` do §7.
4. Idempotência e cancelamento **no SQL**: os gatilhos são o caminho rápido, o
   claim é a garantia. Entrega incerta vira `unknown`, nunca uma segunda
   tentativa.
5. Nenhum id, nome, telefone ou texto de cliente em código. A Casa Flow é
   configuração.
6. Relate as validações com o resultado real. Baseline não é mascarado, e o que
   não rodou é marcado **NÃO EXECUTADO** com o motivo.
