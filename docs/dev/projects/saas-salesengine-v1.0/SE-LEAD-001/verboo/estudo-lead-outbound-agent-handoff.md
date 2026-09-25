# SE-LEAD-001 — Estudo: outbound iniciado pela equipe + handoff automático do agente

Projeto: `saas-salesengine-v1.0` · Tarefa: SE-LEAD-001 · Branch: `task/SE-LEAD-001-lead-agent-handoff`
Base lida: `68dd0a9` · Worktree lido em 2026-09-22 · Modo: **leitura de código**, sem acesso a banco,
produção, secret ou dado real. Nada foi implementado.

Convenção deste documento: afirmações com `arquivo:linha` são **fato lido no repo**. O que não pôde
ser confirmado está marcado explicitamente como **[hipótese]** ou **[não verificado]**.

---

## 0. Sumário executivo

O objetivo da task tem duas metades e o repo está em estágios muito diferentes em cada uma:

| Metade | Estado hoje | Esforço para MVP |
|---|---|---|
| **A. Vendedor dispara a primeira mensagem** para um lead sem conversa | 🟡 Quase pronto — existe a "Rota C (outbound-initiated)" em `send-chat-message`, mas ela só funciona **com um humano autenticado na UI** | Baixo |
| **B. Cliente responde → agente assume automaticamente** | 🔴 Inexistente para números Solo. O agente de WhatsApp é **externo** (GPT Maker) e não cobre as conversas iniciadas por outbound | Médio |

**A conclusão que muda o desenho:** o SalesEngine **não tem** um runtime de atendimento próprio. Quem
conversa com o cliente no WhatsApp é o **GPT Maker**, um SaaS externo cujos eventos o repo apenas
**espelha** (`gpt-maker-webhook`). O `analyze-message` não responde ninguém — ele só extrai campos de
CRM de uma conversa que o GPT Maker já conduziu. E o `python-agent` ("Solo Copilot") é analytics de
pipeline, não atendimento.

Consequência prática: **para uma conversa iniciada pelo vendedor via Solo (Whatsmiau), hoje ninguém
responde o cliente automaticamente.** O `solo-wpp-webhook` ingere a resposta, grava a mensagem e para
(`supabase/functions/solo-wpp-webhook/index.ts:749-754` só dispara extração de CRM, nunca um envio).

**Recomendação** (§9): MVP em três ondas, começando por uma **fila leve em tabela + um worker
`service-role`** que reusa o sender que já existe (`_shared/solo-sender.ts`), porque é o único caminho
comprovadamente capaz de iniciar conversa. O "agente" do P1 é um responder in-repo para conversas
Solo, não uma integração nova com o GPT Maker.

---

## 1. Diagnóstico do estado atual

### 1.1 Entidades e tabelas

O modelo tem **três camadas** que importam para esta feature:

```
leads ──1:N──> conversations ──1:N──> messages
  │
  └──1:N──> opportunities ──N:1──> pipelines ──1:N──> pipeline_stages_v2
```

| Tabela | Criação (migration) | Papel nesta feature |
|---|---|---|
| `leads` | `supabase/migrations/20251207215011_b027b01d-….sql:63` | O contato. Colunas atuais em `src/integrations/supabase/types.ts:4549-4598` |
| `conversations` | `supabase/migrations/20260417000000_epic1_conversations.sql:16-38` | **A sessão de atendimento.** É aqui que mora o estado de handoff |
| `messages` | `supabase/migrations/20251224215400_c565ab2a-….sql:20` | O histórico. `conversation_id` é **nullable** e foi adicionado depois (`supabase/migrations/20260417000000_epic1_conversations.sql:46-48`); `provider`/`provider_message_id` vieram em `20260705000000_sprint7_solo_instances.sql:35-36` |
| `wpp_instances` | `supabase/migrations/20260705000000_sprint7_solo_instances.sql:4-17` | O número de WhatsApp (Solo/Whatsmiau) que envia e recebe |
| `pipelines` / `pipeline_stages_v2` / `opportunities` | `supabase/migrations/20260419110000_epic2_pipelines.sql:18,85` | Onde o deal vive |
| `crm_entries` / `lead_touches` / `crm_campaigns` | `supabase/migrations/20260913000100_sprint11_w5_attribution.sql:92,120,51` | Atribuição: "por qual porta o lead entrou" e o round-robin de responsável |
| `notifications` / `notification_types` / `notification_deliveries` | `supabase/migrations/20260819000400_sprint8_notifications.sql:13,88,51` | Avisos internos (in_app/email/whatsapp) |
| `equipes` | `supabase/migrations/20251207215011_b027b01d-….sql:11` | Tenant. Flags de agente e pipeline padrão |

**Colunas que decidem o desenho** (lidas em `src/integrations/supabase/types.ts`):

- `conversations` (`:2182-2200`): `lead_id` (FK obrigatória), `equipe_id`, `channel` (default
  `'whatsapp'`), `status` CHECK `('active','archived','deleted')`, `responsible_id` (FK `profiles`),
  **`atendido_por_agente` boolean NOT NULL default false**, `agent_name`, `gpt_maker_chat_id`,
  `solo_instance_id` (FK `wpp_instances`), `last_message_at`, `unread_count`, timestamps.
- `messages` (`:5293-5309`): `lead_id` (obrigatória), `conversation_id` (nullable), `sender_type`
  CHECK `('customer','agent','member','system')`, `sender_id`, `content`, `media_url`, `media_type`,
  `provider` (`'gptmaker' | 'solo'`), `provider_message_id`, `read_at`, `created_at`.
  **Não existe coluna de status de entrega.**
- `leads` (`:4549-4598`): `phone`, `phone_normalized`, `source`, `origem`, `origin`,
  `origin_category`, `creation_source`, `lead_type`, `contact_type`, `lifecycle_stage`, `stage_id`,
  `responsible_id`, `assigned_to`, `atendido_por_agente`, `channel`, `gpt_maker_chat_id`,
  `entry_id`, `first_touch_id`, `last_message_at`, `deleted_at`. **Não existe coluna de
  consentimento/opt-in.**
- `equipes`: `is_crm_agent_enabled` (`20260117000000_add_crm_agent_toggle.sql:2`),
  `default_pipeline_id` (`20260421000000_sprint4_epic0_cutover.sql:19`), `gpt_maker_agent_id`,
  `workspace_id` (lidos em `supabase/functions/_shared/agent-context.ts:58-63`).

### 1.2 As quatro portas de entrada de lead

| # | Porta | Arquivo | Cria conversa? | Cria oportunidade? | Dispara algo? |
|---|---|---|---|---|---|
| 1 | Webhook do GPT Maker (o agente externo ecoa a conversa) | `supabase/functions/gpt-maker-webhook/index.ts` | ✅ `:433-444` | ✅ `:473` | `analyze-message` se `is_crm_agent_enabled` (`:664`) |
| 2 | Webhook do Solo/Whatsmiau (mensagem recebida no número próprio) | `supabase/functions/solo-wpp-webhook/index.ts` | ✅ `:553-564` | ✅ `:591` | `analyze-message` se gate ligado (`:749-754`) |
| 3 | Webhook de CRM externo (integração genérica) | `supabase/functions/crm-webhook/index.ts` | ❌ | ❌ | webhooks de saída |
| 4 | Cadastro manual pela UI | `src/hooks/useCreateContactAtomic.ts:136-157` | ❌ | ✅ `:185-197` | toque de atribuição (`crm_record_touch`) |

Os pontos que importam:

- Nas duas portas de WhatsApp a conversa nasce com **`atendido_por_agente: false`**
  (`gpt-maker-webhook/index.ts:444`, `solo-wpp-webhook/index.ts:564`). Ou seja: **o default do sistema
  é "o agente está no loop"** — mesmo quando não há agente nenhum para responder.
- As portas 3 e 4 **não criam conversa**. Um lead que entra por cadastro/manual/webhook existe no CRM
  mas não tem thread no inbox. É exatamente o lead-alvo desta task: ele precisa de uma primeira
  mensagem para virar conversa.
- Ambas as portas de WhatsApp fazem *fallback multi-nível* para não duplicar conversa
  (`gpt-maker-webhook/index.ts:351-408`) — o padrão de resolução já está escrito e é reutilizável,
  na ordem: **(1)** por `lead_id` + canal → **(2)** por `gpt_maker_chat_id` → **(3)** por `lead_id`
  sozinho (qualquer conversa não deletada) → **(4)** só então cria uma nova. Não há nível por
  telefone (`:351-355, 358, 376, 393`).

### 1.3 O que já existe de outbound — e por que não basta

Existe **um único** caminho de envio: `supabase/functions/send-chat-message/index.ts` (442 linhas).
Ele tem quatro rotas:

| Rota | Condição | Destino | Evidência |
|---|---|---|---|
| `take_control` / `stop_control` | `action` no body | GPT Maker `start-human` / `stop-human` | `:246-255` |
| Solo pinada | `conversations.solo_instance_id` definido e conectado | `sendViaSolo` | `:282-314` |
| GPT Maker | `conversations.gpt_maker_chat_id` definido | GPT Maker `send-message`, com fallback Solo | `:318-401` |
| **Solo (outbound-initiated)** | **sem `chat_id`**, mas com instância conectada + telefone | **`sendViaSolo`** e pina `solo_instance_id` na conversa | **`:403-431`** |

A quarta rota é literalmente a feature pedida — **"mandar a primeira mensagem para quem ainda não tem
conversa"** — e já está em produção. Duas coisas a tornam insuficiente:

1. **Ela exige um humano autenticado.** `getCallerProfile` (`:41-65`) valida JWT via
   `auth.getUser()` e lê `profiles.equipe_id`; `loadAuthorizedContext` valida o vínculo do lead com a
   equipe (`:143-145`) e ainda bloqueia conta suspensa (`:151-159`). **Não há variante
   `service-role`.** Logo, um cron, um trigger de etapa ou um webhook **não conseguem** chamá-la.
2. **Ela pressupõe que a conversa já existe.** A UI é quem cria a conversa vazia
   (`src/pages/Chat.tsx:98-133`, "T15 — Zero-Friction Chat Link"). Se o body traz só `lead_id` sem
   conversa, o código deixa `resolvedConversationId` em `null` e zera `resolvedChatId` (`:88-98` e
   `:128-130`) e segue — o envio
   funciona, mas o `last_message_at` da conversa não é atualizado (`:273-278` só roda se houver
   `resolvedConversationId`).

**Como o vendedor chega nessa rota hoje** (o funil de UX existente):

- Card do Kanban → ícone de chat: `src/components/crm/OpportunityCard.tsx:338-352`
  (`navigate('/chat?contact=<leadId>')`).
- Modal do deal → botão "Chat": `src/components/crm/OpportunityDetailModal.tsx:575-585`.
- `Chat.tsx:98-133` cria a conversa interna; o vendedor digita; `handleSendMessage`
  (`Chat.tsx:289-338`) invoca `send-chat-message`.
- Existe ainda um atalho **fora do produto**: `wa.me` em `OpportunityCard.tsx:301-312` e
  `OpportunityDetailModal.tsx:588-599` — abre o WhatsApp Web **do celular/navegador do vendedor**,
  fora do CRM, sem gravar nada. Isso é um vazamento de processo que a feature deve fechar.

**Como o envio sai de fato:** `supabase/functions/_shared/solo-sender.ts:108-110,129-157` →
Whatsmiau ("Solo") `POST /v1/message/sendText|sendMedia|sendWhatsAppAudio/{instance}`. **Não há
template/HSM em lugar nenhum** — uma busca por `hsm|whatsapp_template|template_name|message_template`
em `supabase/` retornou zero ocorrências. Todo outbound é texto livre por uma API **não-oficial**
(baseada em Baileys). Isso é o risco central do §6.

### 1.4 Handoff hoje: um booleano

O estado "humano vs agente" **já existe** e é `conversations.atendido_por_agente`.

| Peça | Onde | Comportamento |
|---|---|---|
| Semântica | `conversations.atendido_por_agente` | `false` = agente no loop; `true` = humano no loop |
| Rótulo na UI | `src/components/inbox/ConversationHeader.tsx:270-291` | Botão "Assumir" / "Devolver Controle ao Agente" |
| Alternar | `src/pages/Chat.tsx:340-365` (`handleToggleHandoff`) | Atualiza a coluna e, **se houver `gpt_maker_chat_id`**, chama `send-chat-message` com `take_control`/`stop_control` |
| Assumir ao digitar | `src/pages/Chat.tsx:306-314` ("T14") | Se o vendedor digita, `atendido_por_agente` vira `true` automaticamente |
| Mutation | `src/hooks/useConversations.ts:272-290` (`toggleHandoff`) | Só a coluna |
| Gate por equipe | `equipes.is_crm_agent_enabled` + `src/components/AIAgentToggle.tsx:25,37-40` | Liga/desliga o "Copilot" da equipe inteira |

**Limitações do estado atual (todas relevantes para auditoria e para o MVP):**

- É **binário** e **sem ator nem timestamp**: não se sabe *quem* assumiu, *quando*, nem *por quê*.
  Não há tabela de eventos de handoff.
- O controle no provider **só é enviado quando existe `gpt_maker_chat_id`**
  (`Chat.tsx:350-358`). Para conversas Solo, virar `atendido_por_agente = true` é um estado **só
  local** — o provider Solo não tem noção de "humano no loop" e, como não há agente Solo, o efeito
  prático é nulo.
- Como a conversa nasce com `false`, uma conversa Solo recém-criada declara "o agente está
  atendendo" quando **ninguém** está.

### 1.5 O runtime do agente (a peça que não existe)

Três coisas se chamam "agente" no repo e **nenhuma** responde o cliente:

| Nome | O que é | Responde WhatsApp? |
|---|---|---|
| **GPT Maker** | SaaS externo. `gpt-maker-webhook` é o eco dos eventos dele; `manage-agent-*` são proxies de configuração (`_shared/agent-context.ts`) | ✅ Sim — **mas fora do repo**, e só para números registrados nele |
| `analyze-message` (512 linhas) | Extrai campos de CRM de mensagens já trocadas, via LLM (`openai`), e aplica regras | ❌ **Nunca envia.** Grava lead/opportunity/stage/custom fields |
| `python-agent` ("Solo Copilot", FastAPI) | Cascade de enriquecimento, forecast, copilot chat | ❌ Lê `copilot_ingest_queue` (`python-agent/app/routers/ingest.py:63-72`), gate `is_crm_agent_enabled` (`:75-86,157-160`) |

Confirmação de que `analyze-message` não envia: o motor de regras que ele usa,
`supabase/functions/_shared/rule-engine.ts:25-40`, define o tipo `AgentAction` com
`stage_type`, `status`, `field_id`, `touchpoint_type`, `title_template`, `due_in_hours`, `tag`,
`url`, `body_template` — **não há ação de mensagem**. O `body_template` é corpo de webhook/tarefa.

Consequência direta: **uma resposta de cliente numa conversa Solo é ingerida e ninguém a responde.**
O `solo-wpp-webhook` grava a mensagem (`:715`), resolve a oportunidade (`:591`) e, no máximo, chama
`analyze-message` (`:749-754`) — que só atualiza o CRM.

### 1.6 Jobs, crons e filas que já existem

| Mecanismo | Arquivo | O que faz |
|---|---|---|
| `cadence-check` | `supabase/functions/cadence-check/index.ts` (152 l.) | Acha oportunidades que furaram SLA/cadência e dispara `webhook_configs` mapeados em `pipeline_stages_v2.webhook_triggers` (`:46-49`) |
| `process-automations` | `supabase/functions/process-automations/index.ts` (154 l.) | Drena `scheduled_automations` (`executed = false`, `scheduled_for <= now()`) |
| `notification-dispatcher` | `supabase/functions/notification-dispatcher/index.ts` (446 l.) | Drena `notification_deliveries` (in_app/email/**whatsapp via Solo**) com backoff de 3 tentativas |
| Fila do Copilot | `copilot_ingest_queue` + cron + trigger reativo | `python-agent/app/routers/ingest.py`; trigger `AFTER INSERT` via `net.http_post` (`20260617000100_sprint63_reactive_ingest_trigger.sql`) |

Duas leituras importantes:

1. **O padrão "tabela-fila + cron + edge function idempotente" já é nativo do projeto.** Não é preciso
   introduzir Kafka/SQS/Redis para o MVP — ver §5.
2. **`on_stage_entered` é uma promessa não cumprida.** Ele aparece como opção de UI
   (`src/components/crm/pipeline-settings/StagesEditor.tsx:77`), no tipo
   (`src/types/pipelines.ts:86`) e no comentário da migration
   (`20260605000002_sprint5_3_stage_webhooks.sql:4`), mas o único executor (`cadence-check`) só
   implementa `on_idle_breach` e `on_cadence_deadline` (`:20`). **"Disparar quando o card entra na
   etapa X" não funciona hoje.** Isso importa porque é o gatilho mais natural para "primeira
   mensagem" (§2).

### 1.7 Notificações internas

Os 16 tipos semeados (`20260819000400_sprint8_notifications.sql:97-112`) são **todos de billing**
(`invoice.*`, `credits.*`, `contract.*`, `proposal.*`, `tenant.provisioned`). **Não existe** tipo
para "lead novo", "lead respondeu" ou "atendimento aguardando humano". O `notification-dispatcher`
já sabe entregar por WhatsApp via Solo (`_shared/solo-sender.ts`), então criar o tipo é barato.

### 1.8 Síntese das lacunas

| # | Lacuna | Evidência | Impacto |
|---|---|---|---|
| G1 | Nenhum envio outbound server-side (só com JWT humano) | `send-chat-message/index.ts:41-65` | Bloqueia disparo por regra/cron/webhook |
| G2 | Portas 3 e 4 não criam conversa | `crm-webhook`, `useCreateContactAtomic.ts` | Lead de cadastro não tem thread |
| G3 | Ninguém responde inbound de número Solo | `solo-wpp-webhook/index.ts:749-754` | **Objetivo central não atendido** |
| G4 | Handoff binário, sem ator/timestamp/histórico | `conversations.atendido_por_agente` | Sem auditoria, sem SLA, sem "quem atendeu" |
| G5 | `messages` sem status de entrega | `types.ts:5293-5309`; `markUndelivered` só no retorno (`send-chat-message:206-208`) | "Enviado mas não entregue" não é consultável |
| G6 | Sem template WhatsApp (HSM) | busca `hsm|whatsapp_template` em `supabase/` = 0 resultados | 1ª mensagem é texto livre em API não-oficial |
| G7 | Sem opt-in/consentimento | nenhuma coluna em `leads` | Risco LGPD e de ban (§6) |
| G8 | Sem idempotência de disparo | não há lock nem unique de "primeiro outbound" | Dois vendedores disparam em duplicidade |
| G9 | Sem aviso ao vendedor de "lead respondeu" | tipos de notificação são só billing | Resposta esfria sem ninguém ver |
| G10 | `on_stage_entered` sem executor | `cadence-check/index.ts:20` | Gatilho mais natural indisponível |

---

## 2. Fluxo UX recomendado

### 2.1 Princípios

1. **O vendedor dispara de onde ele já está**: card do Kanban e modal do deal. Não criar uma tela nova.
2. **Um clique, com prévia editável** — a mensagem sai do CRM, não do WhatsApp Web. Fechar o vazamento
   do `wa.me` (`OpportunityCard.tsx:301-312`).
3. **O CRM é a fonte da verdade**: toda mensagem enviada tem que virar `messages` + `conversations`.
4. **O agente é o default; o humano é a exceção** — e essa exceção precisa ser explícita e visível.

### 2.2 Fluxo A — vendedor dispara a primeira mensagem

```
Kanban (card) ou Modal do deal
        │
        ├─ hoje: ícone "Chat" ──────────► /chat?contact=<leadId> (conversa vazia)
        │        ícone "WhatsApp" ──────► wa.me (FORA do CRM, não grava)  ← fechar
        │
        └─ novo: "Enviar primeira mensagem"
                 │
                 ▼
        Dialog de composição
          • destinatário: nome + telefone (formatDisplayName / formatBrPhone)
          • instância de saída: wpp_instances conectada da equipe (pré-selecionada)
          • texto: pré-preenchido de um template da equipe (editável)
          • aviso de consentimento: "Este contato autorizou contato por WhatsApp?"
          • botão "Enviar" (desabilitado sem telefone válido ou instância conectada)
                 │
                 ▼
        dispatch-outbound (edge, service-role ou JWT — ver §4)
          • resolve/cria conversation (channel 'whatsapp', solo_instance_id)
          • grava messages (sender_type 'agent', provider 'solo')
          • registra outbound_attempt (idempotente)
          • envia via sendViaSolo
                 │
                 ▼
        Toast "Mensagem enviada" + conversa aparece no Inbox já com a thread
        + notificação in-app para o responsável ("Você iniciou um atendimento")
```

### 2.3 Fluxo B — cliente responde e o agente assume

```
Cliente responde no WhatsApp
        │
        ▼
solo-wpp-webhook (MESSAGES_UPSERT)
  • resolve lead (phone_normalized) e conversa (mesmo algoritmo do gpt-maker-webhook:351-408)
  • grava messages (sender_type 'customer')
  • incrementa unread_count, atualiza last_message_at
        │
        ▼
  conversa.atendido_por_agente == false ?
        │
        ├─ NÃO (humano no loop) ──► notifica o responsável ("cliente respondeu") e para
        │
        └─ SIM ──► agent-reply (novo worker)
                      • monta contexto: últimas N mensagens + dados do lead/oportunidade
                        + knowledge do agente da equipe
                      • gera resposta (LLM) OU aplica resposta de primeiro contato (determinística)
                      • grava messages (sender_type 'agent') e envia via sendViaSolo
                      • registra a decisão em agent_events (auditoria)
                      • se o cliente pedir humano / a confiança for baixa:
                            atendido_por_agente = true + atribui responsável + notifica
```

### 2.4 Estados visíveis no Inbox (evolução do que já existe)

Hoje o header mostra dois estados (`ConversationHeader.tsx:270-291`). Proposta:

| Estado | Condição | Rótulo | Ação principal |
|---|---|---|---|
| `aguardando_envio` | conversa criada, nenhuma mensagem nossa | "Aguardando 1ª mensagem" | "Enviar" |
| `agente` | `atendido_por_agente = false` e há agente configurado | "Agente no loop" | "Assumir" |
| `humano` | `atendido_por_agente = true` | "Vendedor no loop" | "Devolver" |
| `aguardando_humano` | agente pediu transferência | "Aguardando você" | "Assumir" |

O estado `aguardando_humano` é o que falta e é o que evita o pior cenário: o cliente pergunta algo
que o agente não sabe e a conversa morre sem ninguém perceber.

---

## 3. Modelo de estados

### 3.1 Estados por entidade

**`leads` (contato)** — já existe `lifecycle_stage` (`types.ts:4572`); não mexer.

**`opportunities`** — `open | won | lost | ciclo` (`_shared/opportunities.ts:12-25`); não mexer.

**`conversations`** — hoje: `status ∈ {active, archived, deleted}` +
`atendido_por_agente ∈ {false, true}`. Proposta de **campos aditivos** (não substituir):

| Campo novo | Tipo | Para quê |
|---|---|---|
| `agent_mode` | `text` CHECK `('agent','human','awaiting_human','none')` | Substitui o booleano com semântica explícita; `atendido_por_agente` fica como derivado por compatibilidade |
| `first_outbound_at` | `timestamptz` | Quando a equipe falou primeiro (marca "conversa iniciada por nós") |
| `first_inbound_at` | `timestamptz` | Quando o cliente respondeu pela primeira vez |
| `handoff_at` | `timestamptz` | Última troca de agente↔humano |
| `handoff_by` | `uuid` FK `profiles` | Quem executou a troca |
| `handoff_reason` | `text` | `manual | low_confidence | customer_request | automation` |

> `atendido_por_agente` **não deve ser removido** neste momento: `Chat.tsx`, `useConversations.ts`,
> `gpt-maker-webhook` e `solo-wpp-webhook` o leem. Migrar por dual-write e só depois limpar.

**`outbound_attempts` (tabela nova)** — a unidade de idempotência e observabilidade:

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `equipe_id` | uuid FK | |
| `lead_id` | uuid FK | |
| `conversation_id` | uuid FK **nullable** | null = conversa ainda não existia quando enfileirou |
| `kind` | text CHECK `('first_contact','follow_up','agent_reply')` | |
| `status` | text CHECK `('queued','sending','sent','delivered','failed','skipped')` | |
| `channel` | text | `'whatsapp'` |
| `provider` | text | `'solo'` |
| `provider_message_id` | text | id no provedor |
| `idempotency_key` | text **UNIQUE** | ex.: `first_contact:<lead_id>` |
| `attempts` | int default 0 | |
| `last_error` | text | |
| `scheduled_for` / `sent_at` | timestamptz | |
| `created_by` | uuid FK `profiles` nullable | null = automático |
| `created_at` / `updated_at` | timestamptz | |

O `UNIQUE` em `idempotency_key` é **a** garantia de "não mandar duas vezes" (G8).

### 3.2 Máquina de estados do handoff

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
   [lead entra]     │                                          ▼
        │           │                                   ┌────────────┐
        ▼           │        humano responde no Chat    │   human    │
  ┌──────────┐      │   ┌───────────────────────────────►│            │
  │   none   │──────┘   │                                └─────┬──────┘
  │(sem conv)│          │                                      │ "Devolver"
  └────┬─────┘          │                                      ▼
       │ outbound       │                                ┌────────────┐
       │ enviado        │                                │   agent    │
       ▼                │                                │            │
  ┌──────────┐  inbound │  ┌──────────────────┐          └─────┬──────┘
  │ awaiting │──────────┴─►│  agent responde  │                │
  │  reply   │             └────────┬─────────┘                │
  └──────────┘                      │                          │
                                    │ pedido de humano /       │
                                    │ baixa confiança          │
                                    ▼                          │
                            ┌──────────────────┐               │
                            │ awaiting_human   │───────────────┘
                            └──────────────────┘   humano assume
```

Regras:

- `none → awaiting_reply`: criado o `outbound_attempt` de `first_contact`.
- `awaiting_reply → agent`: chegou o **primeiro** inbound (`first_inbound_at`).
- `agent → awaiting_human`: o agente decidiu transferir, **ou** o cliente pediu humano, **ou** o
  número de turnos do agente estourou.
- `* → human`: sempre que um `profiles.id` envia mensagem (`sender_type = 'agent'`), como já faz o
  "T14" (`Chat.tsx:306-314`).
- `human → agent`: só por ação explícita (botão "Devolver"), nunca automático.

### 3.3 Transições que precisam ser atômicas

Três pontos de corrida reais:

1. **Dois vendedores clicam "Enviar"** → resolvido pelo `UNIQUE (idempotency_key)` com
   `idempotency_key = 'first_contact:<lead_id>'`; o segundo `INSERT` falha e a UI mostra "já
   iniciado por <nome>".
2. **Resposta chega enquanto o worker de outbound está enviando** → o `solo-wpp-webhook` já resolve a
   conversa por fallback (`:512-564`); precisa **reler** `atendido_por_agente` *depois* de gravar a
   mensagem, não antes.
3. **Agente e humano respondem ao mesmo tempo** → o worker de reply deve fazer um
   `UPDATE conversations SET agent_mode='human' WHERE id=? AND agent_mode='agent'` e só enviar se
   afetou 1 linha (compare-and-swap). Sem isso, o cliente recebe duas respostas.

---

## 4. Arquitetura recomendada para o MVP

### 4.1 Onde encaixar no código atual

```
┌─ UI ─────────────────────────────────────────────────────────────────────┐
│ OpportunityCard.tsx / OpportunityDetailModal.tsx                         │
│   + botão "Enviar primeira mensagem" → <FirstContactDialog/>             │
│ Chat.tsx / ConversationHeader.tsx                                        │
│   + estados agent_mode (aguardando_humano) e "Devolver" já existente      │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │ supabase.functions.invoke('dispatch-outbound')
┌──────────────────────────▼───────────────────────────────────────────────┐
│ NOVO  supabase/functions/dispatch-outbound/index.ts                      │
│   • aceita JWT de vendedor OU X-Internal-Token (service-role path)       │
│   • resolve/cria conversation (channel, solo_instance_id, agent_mode)    │
│   • insere outbound_attempts (idempotency_key) ← 23505 = já existe        │
│   • grava messages + envia via _shared/solo-sender.ts                    │
│   • atualiza status sent/failed e messages.provider_message_id           │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │ (mesmo módulo, mesma função de envio)
┌──────────────────────────▼───────────────────────────────────────────────┐
│ EXISTENTE  _shared/solo-sender.ts   ← não muda                            │
│ EXISTENTE  send-chat-message        ← continua sendo o caminho do Inbox   │
└──────────────────────────────────────────────────────────────────────────┘

┌─ INBOUND ────────────────────────────────────────────────────────────────┐
│ EXISTENTE  solo-wpp-webhook  (+ hook após gravar a mensagem)             │
│   └─ se conversa.agent_mode == 'agent' → invoca agent-reply              │
│ NOVO  supabase/functions/agent-reply/index.ts                            │
│   • CAS: agent_mode 'agent' → 'agent' (garante exclusão mútua)            │
│   • contexto: últimas N messages + lead + opportunity + knowledge        │
│   • gera resposta (LLM) ou aplica resposta determinística de 1º contato   │
│   • grava messages + envia via _shared/solo-sender.ts                    │
│   • registra agent_events (auditoria)                                    │
│   • se transferir → agent_mode='awaiting_human' + notifica responsável   │
└──────────────────────────────────────────────────────────────────────────┘

┌─ FALLBACK / RETRY ───────────────────────────────────────────────────────┐
│ NOVO  outbound-retry (cron a cada minuto, service-role)                  │
│   • drena outbound_attempts status in ('queued','failed') e attempts<3   │
│   • backoff igual ao notification-dispatcher (1/5/30 min)                │
│   • garante entrega mesmo se a edge function morrer no meio              │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dados necessários

- **Novos**: `outbound_attempts` (§3.1), `agent_events` (log append-only de decisão do agente),
  colunas aditivas em `conversations` (§3.1).
- **Reuso**: `wpp_instances` (qual número envia), `crm_entries`/`lead_touches` (atribuição —
  `_shared/attribution.ts:100-168`), `notifications` (avisar o vendedor),
  `scheduled_automations` (se optar pelo caminho "sem fila nova", §5.6).
- **Reuso de algoritmo**: a resolução de conversa por fallback já escrita em
  `gpt-maker-webhook/index.ts:351-408` (ordem `lead_id`+canal → `gpt_maker_chat_id` → `lead_id`).
  Extrair para `_shared/conversation-resolver.ts` evita a terceira cópia da mesma lógica
  (`solo-wpp-webhook:512-564` já é a segunda).

### 4.3 Gatilhos

| Gatilho | Como | Observação |
|---|---|---|
| **Manual** (P0) | Botão no card/modal → `dispatch-outbound` | É o único gatilho que funciona hoje sem dependências novas |
| **Etapa do pipeline** (P1) | Implementar `on_stage_entered` no `cadence-check` (hoje só existe na UI) | Alto valor: "quando o card entra em *Novo Lead*, dispara" |
| **Cadência/SLA** (P2) | `pipeline_stages_v2.webhook_triggers` já suporta `on_cadence_deadline` | Reusa o motor existente |
| **Lead novo** (P2) | Trigger `AFTER INSERT ON leads` → `net.http_post` | Já há precedente: `20260617000100_sprint63_reactive_ingest_trigger.sql` |

> **Opinião:** começar pelo gatilho **manual**. Automatizar o disparo antes de existir opt-in
> registrado (§6) é construir a fábrica de spam antes do freio.

### 4.4 Idempotência

Quatro camadas, da mais forte para a mais fraca:

1. **`UNIQUE (idempotency_key)`** em `outbound_attempts` — impede disparo duplicado na origem.
2. **Compare-and-swap** em `conversations.agent_mode` no `agent-reply` — impede resposta dupla
   agente+humano (§3.3).
3. **Releitura do estado** após gravar a mensagem inbound — evita corrida outbound/inbound.
4. **`provider_message_id`** gravado — permite reconciliar com o provedor sem reenviar.

### 4.5 Observabilidade

| Sinal | Onde |
|---|---|
| Status por tentativa | `outbound_attempts.status` + `attempts` + `last_error` |
| Trilha de decisão do agente | `agent_events` (append-only: prompt resumido, decisão, confiança, motivo) |
| Status de entrega da mensagem | **adicionar** `messages.delivery_status` — hoje `delivered:false` só existe no retorno HTTP (`send-chat-message:206-208`) e se perde |
| Contadores | `unread_count`, `first_outbound_at`, `first_inbound_at`, `handoff_at` |
| Alerta operacional | novo tipo `lead.replied` / `handoff.requested` no `notification_types` |

Sem `messages.delivery_status`, um envio que falha silenciosamente é indistinguível de um envio
bem-sucedido na consulta ao banco. Esse é o item de observabilidade mais barato e de maior retorno.

---

## 5. Alternativas técnicas e tradeoffs

### 5.1 Mensagem por template/outbound

| | |
|---|---|
| **A favor** | Determinístico, testável, sem custo de LLM, sem risco de alucinação. É o que o WhatsApp oficial exige para iniciar conversa. |
| **Contra** | **Não existe infraestrutura de template no repo** (0 ocorrências de `hsm|whatsapp_template`). O canal é Solo/Whatsmiau, API não-oficial — não há "template aprovado" a submeter. |
| **Veredito** | ✅ **Usar como P0**, mas como *template de texto livre editável guardado no banco* (uma coluna/campo por equipe), não como HSM. Se o produto migrar para WhatsApp Cloud API, isso vira HSM naturalmente. |

### 5.2 Inbox / conversation trigger

| | |
|---|---|
| **A favor** | O estado já existe (`conversations.atendido_por_agente`); a UI já tem o toggle; o `Chat.tsx` já cria a conversa. Zero modelagem nova. |
| **Contra** | Um trigger de banco sobre `messages` não tem como chamar a API do provedor com segurança (a edge function é quem tem os secrets) — teria que sair por `net.http_post` com token interno. E hoje o envio exige JWT humano (G1). |
| **Veredito** | 🟡 **Usar como ponto de integração do inbound** (hook no `solo-wpp-webhook`), não como mecanismo de envio. |

### 5.3 Job background

| | |
|---|---|
| **A favor** | Desacopla a resposta ao usuário do envio; permite retry e backoff; o projeto **já tem** o padrão (`process-automations`, `notification-dispatcher` com `MAX_ATTEMPTS=3` e backoff `[1,5,30]` min). |
| **Contra** | Latência adicional (cron de 1 min) se não houver disparo imediato. |
| **Veredito** | ✅ **Usar para retry**, combinado com disparo imediato (fire-and-forget) para o caminho feliz — exatamente o que o `notification-dispatcher` já faz (`:7-13`). |

### 5.4 Webhook inbound

| | |
|---|---|
| **A favor** | Já existe e é robusto: `solo-wpp-webhook` **sempre retorna 200** para não sofrer retry do provedor (`:12-16`), ignora grupo/broadcast, não loga o envelope cru (contém `apikey`), trata `CONNECTION_UPDATE` para sincronizar `wpp_instances`. |
| **Contra** | É o ponto mais sensível a latência: se o agente responder de forma síncrona ali, o provedor pode dar timeout. |
| **Veredito** | ✅ **É o gatilho do handoff.** Mas o trabalho do agente deve sair em background (`EdgeRuntime.waitUntil`, padrão já usado em `gpt-maker-webhook:7-9` e `solo-wpp-webhook:26-28`). |

### 5.5 Fila / event bus

| | |
|---|---|
| **A favor** | Escala, desacopla, dá replay. |
| **Contra** | **Não existe nada disso no repo.** Introduzir Redis/Kafka/SQS para um volume que hoje é de dezenas de mensagens por dia é custo operacional puro. O projeto resolveu o mesmo problema duas vezes com **tabela + cron + `net.http_post`** (`copilot_ingest_queue`, `notification_deliveries`) e funcionou. |
| **Veredito** | ❌ **Não introduzir agora.** A tabela `outbound_attempts` *é* a fila. Se o volume justificar, ela já tem o formato certo (`status`, `attempts`, `scheduled_for`) para virar consumidor de um broker depois. |

### 5.6 Opção incremental sem fila (o caminho mais curto)

> **Não criar tabela nenhuma.** Botão no card → chama **`send-chat-message` como está** (JWT do
> vendedor), criando a conversa antes pela UI (o `Chat.tsx:98-133` já sabe fazer isso). No inbound,
> `solo-wpp-webhook` apenas marca `atendido_por_agente = true`, atribui `responsible_id` pelo
> round-robin que já existe (`_crm_pick_owner`, `supabase/migrations/20260913000100_sprint11_w5_attribution.sql:546-579`,
> com `owner_rule {mode: round_robin}` em `:519-521`, acionado por `crm_record_touch` /
> `_shared/attribution.ts:143-168`) e dispara uma notificação
> `lead.replied`.

| | |
|---|---|
| **A favor** | **Um PR.** Zero migration. Reusa tudo. Entrega a metade A inteira e a metade B na forma "um humano assume", com aviso. |
| **Contra** | **Não cumpre o objetivo literal** — o agente não atende; o vendedor atende. E mantém G5/G8/G9. |
| **Veredito** | 🟡 **Recomendado como P0 se a prioridade for "parar de vazar para o `wa.me`"**, e como *fallback* do P1 se o agente automático atrasar. Não é a recomendação principal porque a task pede explicitamente o atendimento automático. |

### 5.7 Comparativo

| Critério | 5.6 Sem fila | 5.1+5.3 Template + job (recomendado) | 5.5 Fila/event bus |
|---|---|---|---|
| Esforço | 1 PR | 3 ondas | Alto |
| Atende o objetivo literal | ❌ | ✅ | ✅ |
| Idempotência | ❌ | ✅ (UNIQUE) | ✅ |
| Auditoria de handoff | ❌ | ✅ (`agent_events`) | ✅ |
| Observabilidade de entrega | ❌ | ✅ | ✅ |
| Infra nova | Nenhuma | 1 tabela + 1 cron | Broker + infra |
| Risco operacional | Baixo | Baixo | Médio |

---

## 6. Riscos e mitigações

### 6.1 Opt-in / consentimento (LGPD) — **risco alto, lacuna confirmada**

O repo **não tem nenhuma coluna de consentimento** em `leads` nem registro de origem de opt-in. Um
lead que entrou por importação ou por webhook de terceiro pode nunca ter consentido em receber
mensagem.

**Mitigação (obrigatória antes do disparo automático):**
- Coluna `leads.whatsapp_opt_in` (`boolean`) + `whatsapp_opt_in_at` + `whatsapp_opt_in_source`.
- O Dialog de primeira mensagem exige confirmação explícita do vendedor e grava a fonte
  (`manual_confirmation`, `form_checkbox`, `import:<arquivo>`).
- Bloquear `first_contact` automático para lead sem opt-in; permitir apenas o disparo manual com
  confirmação registrada.
- Base legal: execução de contrato/legítimo interesse só cobre B2B com relação preexistente —
  **não** um lead frio importado.

### 6.2 Template WhatsApp / canal não-oficial — **risco alto, estrutural**

Todo o outbound usa `_shared/solo-sender.ts` → Whatsmiau Solo (`/v1/message/sendText|sendMedia|
sendWhatsAppAudio`), uma API **não-oficial** (Baileys). Mensagem iniciada por nós, em número
não-oficial, para contato frio é a combinação de maior risco de bloqueio.

**Mitigação:**
- **Rate limit por instância e por hora** no `dispatch-outbound` (ex.: 20 primeiras mensagens/hora
  por `wpp_instances.id`), com `outbound_attempts.status = 'skipped'` + motivo quando estourar.
- Aquecimento de número: limitar disparos nos primeiros dias de uma instância nova.
- Nunca disparar em massa no MVP: só 1:1 com revisão humana do texto.
- Se o volume crescer, migrar para WhatsApp Cloud API (aí sim com HSM — §5.1).

### 6.3 Spam e duplicidade de atendimento — **risco médio**

G8 (sem idempotência) e a ausência de `agent_mode` fazem com que dois vendedores — ou um vendedor e o
agente — possam responder a mesma conversa.

**Mitigação:** `UNIQUE (idempotency_key)` + CAS em `agent_mode` (§3.3) + a UI mostrar
"Aguardando 1ª mensagem" antes do clique e "Iniciado por <nome>" depois.

### 6.4 Rate limit / falha do provedor — **risco médio**

`send-chat-message` **não persiste** `delivered:false` (G5). O provedor pode recusar (instância
desconectada, número inválido) e ninguém fica sabendo depois do toast.

**Mitigação:** `messages.delivery_status` + `outbound_attempts.last_error` + retry com backoff
copiando o `notification-dispatcher` (`MAX_ATTEMPTS=3`, `BACKOFF_MIN=[1,5,30]`).

### 6.5 Humano vs agente — **risco médio**

O agente responder algo errado a um cliente é pior do que não responder.

**Mitigação:**
- `agent_mode` explícito por conversa, default conservador: **`none`** para conversas criadas por
  outbound, e só vira `agent` quando a equipe liga o agente *daquele canal*.
- Kill switch por equipe (`equipes.is_crm_agent_enabled` já existe) **e** por conversa.
- Transferência automática para humano em: pedido explícito, baixa confiança, N turnos sem
  progresso, ou assunto fora do knowledge.
- **Sempre** deixar o humano ver o que o agente respondeu (`sender_type='agent'` + `agent_events`).

### 6.6 Auditoria — **risco médio**

`atendido_por_agente` é um booleano sem ator/timestamp (G4). Não dá para responder "quem falou com
esse cliente às 14h?" nem "quanto tempo o agente atendeu antes de transferir?".

**Mitigação:** `conversations.handoff_at/handoff_by/handoff_reason` + `agent_events` append-only.
Como `messages` já grava `sender_id`, o histórico de *quem* já existe — falta o *porquê*.

### 6.7 Resposta do cliente não é percebida — **risco alto de produto**

Sem notificação `lead.replied` (G9), a resposta chega no Inbox e esfria. Pior: como a conversa nasce
com `atendido_por_agente=false`, a UI pode sugerir que "o agente está cuidando" quando ninguém está.

**Mitigação:** novo tipo de notificação + badge de não lidas (já existe `unread_count`) + o estado
`aguardando_humano` visível.

### 6.8 Matriz de risco

| Risco | Prob. | Impacto | Mitigação principal | Fase |
|---|---|---|---|---|
| Envio sem opt-in (LGPD) | Alta | Alto | `whatsapp_opt_in` + confirmação no Dialog | P0 |
| Bloqueio do número (API não-oficial) | Média | Alto | Rate limit + aquecimento + 1:1 | P0 |
| Disparo duplicado | Média | Médio | `UNIQUE (idempotency_key)` | P0 |
| Agente responde errado | Média | Alto | `agent_mode` conservador + transferência | P1 |
| Falha de envio invisível | Alta | Médio | `messages.delivery_status` + retry | P1 |
| Sem auditoria de handoff | Alta | Médio | `agent_events` + colunas de handoff | P1 |
| Resposta não percebida | Alta | Alto | notificação `lead.replied` | P0 |

---

## 7. Critérios de aceite testáveis (P0/MVP)

Formato: dado / quando / então, com o ponto de verificação.

**Disparo da primeira mensagem**

1. **CA-1** — Dado um lead com `phone_normalized` válido e nenhuma conversa, quando o vendedor
   confirma o Dialog de primeira mensagem, então existe **1** linha em `outbound_attempts`
   (`kind='first_contact'`, `status='sent'`), **1** linha em `conversations` (`channel='whatsapp'`,
   `solo_instance_id` preenchido, `first_outbound_at IS NOT NULL`) e **1** linha em `messages`
   (`sender_type='agent'`, `provider='solo'`, `provider_message_id IS NOT NULL`).
2. **CA-2 (idempotência)** — Quando o mesmo lead recebe dois cliques simultâneos, então apenas **1**
   `outbound_attempts` é criado e o segundo retorna erro tratado (não 500), com a UI informando quem
   iniciou.
3. **CA-3** — Dado um lead **sem telefone** ou sem instância `connected`, quando o vendedor tenta
   enviar, então o botão está desabilitado e nenhum `outbound_attempts` é criado.
4. **CA-4** — Dado um lead **sem opt-in registrado**, quando o vendedor tenta enviar sem marcar a
   confirmação de consentimento, então o envio é bloqueado e nada é gravado.
5. **CA-5** — Dado `contract_suspended = true`, quando o vendedor tenta enviar, então a resposta é
   `402` e nenhuma mensagem sai (comportamento já existente em `send-chat-message:151-159` — deve ser
   preservado no novo caminho).

**Handoff automático**

6. **CA-6** — Dada uma conversa com `agent_mode='agent'` e nenhuma resposta do agente ainda, quando
   chega uma mensagem do cliente pelo `solo-wpp-webhook`, então em até 60s existe uma `messages` de
   `sender_type='agent'` **posterior** à do cliente, com `provider_message_id` preenchido.
7. **CA-7** — Dada uma conversa com `agent_mode='human'`, quando chega mensagem do cliente, então o
   agente **não** responde e o `responsible_id` é notificado.
8. **CA-8 (corrida)** — Dado que o vendedor envia uma mensagem pelo Inbox **no mesmo instante** em que
   o agente ia responder, então o cliente recebe **exatamente uma** resposta e `agent_mode='human'`.
9. **CA-9 (transferência)** — Dado que o cliente escreve "quero falar com um humano", quando o agente
   processa a mensagem, então `agent_mode='awaiting_human'`, `handoff_reason='customer_request'`,
   `handoff_at` preenchido e o responsável recebe notificação.

**Observabilidade e auditoria**

10. **CA-10** — Toda tentativa de envio tem `outbound_attempts.status ∈ {sent, failed, skipped}` e,
    em caso de falha, `last_error` não vazio.
11. **CA-11** — Existe uma linha em `agent_events` por decisão do agente, com o motivo da
    transferência quando houver.
12. **CA-12** — Falha do provedor com `delivered=false` grava `messages.delivery_status='failed'`
    (hoje esse dado se perde — `send-chat-message:206-208`).

**Regressão (não quebrar o que existe)**

13. **CA-13** — O fluxo atual do Inbox continua funcionando: digitar no `ChatInput` envia, cria
    `messages` e marca `atendido_por_agente=true` (`Chat.tsx:306-314`).
14. **CA-14** — `gpt-maker-webhook` continua criando lead/conversa/oportunidade e chamando
    `analyze-message` quando `is_crm_agent_enabled` — nenhuma mudança de comportamento para números
    GPT Maker.
15. **CA-15** — `solo-wpp-webhook` continua retornando **200** em todos os casos, inclusive instância
    desconhecida e payload inválido (`:12-16`).

---

## 8. Plano faseado de implementação

### P0 — "A equipe consegue iniciar o atendimento" (sem agente automático)

| Item | Arquivo provável | Teste |
|---|---|---|
| Migration: `outbound_attempts` + `leads.whatsapp_opt_in*` + `messages.delivery_status` + `conversations.first_outbound_at/first_inbound_at` | `supabase/migrations/<ts>_selead001_outbound.sql` | `supabase/tests/selead001_outbound.test.sql` (padrão dos `sprint11_*`) |
| Resolver de conversa extraído | `supabase/functions/_shared/conversation-resolver.ts` (+ `.test.ts`) | unit: dedupe na ordem `lead_id`+canal → `gpt_maker_chat_id` → `lead_id`; cria nova só se todas falharem (sem nível por telefone) |
| Edge function de disparo | `supabase/functions/dispatch-outbound/index.ts` | Deno test com cliente mockado |
| Retry/cron | `supabase/functions/outbound-retry/index.ts` + entrada em `supabase/config.toml` | idempotência e backoff |
| Botão + Dialog | `src/components/crm/FirstContactDialog.tsx`; ligar em `OpportunityCard.tsx:338-352` e `OpportunityDetailModal.tsx:575-585` | manual no preview |
| Notificação `lead.replied` | `notification_types` (seed) + hook em `solo-wpp-webhook/index.ts` | assert de enfileiramento |

**Critério de saída:** CA-1 a CA-5 e CA-10, CA-13 a CA-15.

### P1 — "O agente entra em atendimento automaticamente"

| Item | Arquivo provável |
|---|---|
| `conversations.agent_mode` + `handoff_*` + backfill de `atendido_por_agente` | migration aditiva com dual-write |
| Worker de resposta | `supabase/functions/agent-reply/index.ts` |
| CAS + auditoria | `agent_events` + `UPDATE ... WHERE agent_mode='agent'` |
| Knowledge/contexto do agente | reusar `manage-agent-training` / `python-agent/app/knowledge.py` |
| Estados novos no Inbox | `src/components/inbox/ConversationHeader.tsx:270-291`, `Chat.tsx:340-365` |

**Critério de saída:** CA-6 a CA-9, CA-11, CA-12.

### P2 — Automação e escala

| Item | Arquivo provável |
|---|---|
| Implementar `on_stage_entered` | `supabase/functions/cadence-check/index.ts` |
| Disparo por lead novo | trigger `AFTER INSERT ON leads` → `net.http_post` (padrão `20260617000100_sprint63_reactive_ingest_trigger.sql`) |
| Templates de primeira mensagem por equipe | nova tabela `outbound_templates` ou `crm_entries.config` |
| Rate limit e aquecimento | `dispatch-outbound` |
| Métricas de funil outbound | RPC no padrão `20260830000600_sprint9_metrics_rpcs.sql` |

### Ordem recomendada

```
P0 (disparo manual + opt-in + observabilidade)
   └─► P1 (agente responde + handoff auditável)
          └─► P2 (gatilhos automáticos + rate limit + templates)
```

**Não pular para o P2.** Disparo automático em massa sem opt-in (P0) e sem transferência confiável
(P1) é a receita do §6.1 + §6.2 combinados.

---

## 9. Recomendação final

### A melhor solução

**"Fila leve em tabela + worker `service-role` que reusa o sender existente"**, em três ondas (§8),
com estas decisões estruturais:

1. **Não construir um runtime de agente novo.** Para números GPT Maker, o agente já existe e é
   externo — o trabalho é garantir que o outbound iniciado pelo CRM caia numa conversa que o GPT
   Maker reconheça (`gpt_maker_chat_id`) **[hipótese — não verifiquei se o GPT Maker expõe endpoint
   para iniciar conversa; é a primeira pergunta a responder antes do P1]**. Para números Solo, o
   agente do P1 é um responder **in-repo** que reusa `_shared/solo-sender.ts`.
2. **`outbound_attempts` é a fila.** Não introduzir broker (§5.5). O projeto já provou o padrão duas
   vezes (`copilot_ingest_queue`, `notification_deliveries`).
3. **`UNIQUE (idempotency_key)` é a trava.** Sem ela, a feature nasce com um bug de duplicidade que
   é caro de corrigir depois (mensagem já enviada não volta).
4. **Opt-in antes de automação.** `leads.whatsapp_opt_in` no P0, e o P2 (disparo automático) só
   depois.
5. **Observabilidade no P0, não no P1.** `messages.delivery_status` é uma coluna e evita meses de
   "o cliente jura que não recebeu".

### Por que não a alternativa mais barata (§5.6)

A opção "sem fila" entrega a metade A em um PR e é tentadora. **Recomendo usá-la apenas como
plano B** do P0 se o prazo apertar, porque:
- ela não atende o objetivo literal da task (o agente não atende — o vendedor atende);
- ela deixa G5, G8 e G9 intactos, e essas três lacunas voltam como incidente assim que o volume
  crescer (mensagem duplicada, envio que falhou sem ninguém saber, resposta esfriando);
- o custo de adicionar a tabela depois é maior do que adicionar agora, porque a migration de
  `outbound_attempts` precisa **backfillar** os disparos que já aconteceram por fora.

### O maior risco desta recomendação

**O canal.** Todo o outbound depende de uma API de WhatsApp **não-oficial** (`_shared/solo-sender.ts`)
e o repo **não tem nenhum suporte a template/HSM**. Uma feature cujo propósito é *iniciar* conversas
com contatos que não escreveram primeiro é exatamente o padrão que provedores não-oficiais e o
próprio WhatsApp penalizam. **Se o produto pretende escalar isso, a decisão de migrar para WhatsApp
Cloud API (com templates aprovados) precede a arquitetura descrita aqui** — o resto do desenho
(tabela, worker, idempotência, handoff) continua válido, mas o sender muda.

### Perguntas abertas para o dono do produto

1. O GPT Maker permite **iniciar** uma conversa por API (não só responder)? Se sim, o P1 fica muito
   mais barato para números GPT Maker.
2. Qual o volume esperado de primeiras mensagens/dia por equipe? Isso decide se o rate limit do §6.2
   é 20/hora ou 200/hora.
3. O lead de formulário chega com checkbox de consentimento? Se não, o P0 tem que coletá-lo na UI.
4. "Agente entra em atendimento" significa *o mesmo agente do GPT Maker* ou *um agente novo do
   SalesEngine*? A resposta muda o P1 de "hook" para "runtime novo".
