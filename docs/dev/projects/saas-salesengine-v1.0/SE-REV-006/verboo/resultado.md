# SE-REV-006 — Janela de atendimento sempre aberta em conexão NÃO OFICIAL

Branch: `task/SE-REV-006-window-always-open-nonofficial`
Base: `bd01a35` (`feat(outreach): mensagem de abertura e apagar sequência na tela…` — PR #48)
Data: 2026-09-26

---

## 1. Veredito

**O pedido cabe no software.** A janela aberta/fechada é, hoje, **puramente
apresentação no front** — não existe gate de envio no backend (evidência na §4).
Então "a janela está sempre aberta" é uma regra de domínio que se resolve no
front, sem migration e sem tocar o motor de outreach.

**O que eu CORRIJO na leitura inicial do contrato.**

O contrato supõe que dá para decidir os quatro casos — `WHATSAPP`, `Z_API`,
Solo API e `CLOUD_API` — a partir de dado que a ponta já teria ("canal do
provider"). **Isso não se sustenta para o braço do provider.** Três evidências,
todas no próprio repositório:

1. **Não existe tipo do canal do provider por conversa.** `conversations` tem só
   `channel` normalizado (`'whatsapp'` tanto para o não oficial quanto para o
   `CLOUD_API`) e `solo_instance_id`
   (`src/integrations/supabase/types.ts:2182-2200`). Não há coluna com o tipo do
   canal do provider, então não há como atribuir oficial/não oficial a uma
   conversa do provider.
2. **O `type` de `/workspace/{id}/channels` é documentado como não confiável
   como discriminador.** `src/lib/channel-capabilities.ts:56-61`: *"`type` is not
   a reliable discriminator: `/workspace/{id}/channels` reports WHATSAPP for
   channels that `/agent/{id}/search` reports as CLOUD_API (…) they are
   officially-connected ones wearing this type."* O mesmo aviso reaparece em
   `supabase/functions/_shared/outreach/gptmaker.ts:11-16`. Ligar esse `type` na
   decisão marcaria **conta oficial da Meta como "sempre aberta"** — exatamente o
   erro oposto, e num número oficial, onde a Meta recusa envio fora das 24 h.
3. **`conversation_opener_settings.channel_type` não pode ser a base.**
   A própria migration que cria a coluna a rotula: *"Tipo do canal na última
   verificação, para diagnóstico. **Não é fonte de verdade**"*
   (`supabase/migrations/20260925000100_serev001_start_conversation.sql:44-45`),
   e ela só existe quando o tenant configurou o mensageiro de abertura.

**O que eu entrego então:** a regra completa e testada mora na fonte de verdade
(inclusive o braço do provider), e em runtime eu ligo o sinal **confiável e
sempre presente**: a conexão **Solo API**, que é não oficial por construção
(`wpp_instances.status='connected'` no tenant e `conversations.solo_instance_id`
na conversa). O braço WHATSAPP/Z_API do provider fica **pendente de dado** — não
inventei gate nem migration —, nomeado na §5 com o caminho de correção.

Consequência a declarar sem rodeio: a aceitação *"conexão não oficial nunca
mostra Janela Fechada"* fica **cumprida para Solo API** e **não cumprida para
WHATSAPP/Z_API do provider** enquanto esse dado não existir. É a única lacuna
do pacote.

---

## 2. Decisão de desenho — onde ficou a fonte de verdade

**`src/lib/service-window.ts` é a única decisão.** Nenhum componente ou hook
repete a conta de 24 h nem decide "não oficial" por conta própria: todos chamam
`resolveServiceWindow(...)` e leem `{ alwaysOpen, open }`.

```
resolveServiceWindow({ providerChannelType, conversationSoloInstanceId,
                       hasConnectedSoloInstance, lastCustomerMessageAt, now })
  → { alwaysOpen, open }
```

- `alwaysOpen` = `isNonOfficialConnection(...)`: `conversationSoloInstanceId` **ou**
  `hasConnectedSoloInstance` **ou** `providerChannelType ∈ {WHATSAPP, Z_API}`.
- `open` = `alwaysOpen` **ou** `isWithinServiceWindow(lastCustomerMessageAt)`
  (≤ 24 h). Ausência de mensagem ou data inválida conta como **fechada** — nunca
  abre por falta de dado.
- `NON_OFFICIAL_CHANNEL_TYPES = ["WHATSAPP", "Z_API"]` **espelha** o ponto de
  verdade que já existia no repo, `START_CONVERSATION_CHANNEL_TYPES`
  (`supabase/functions/_shared/outreach/gptmaker.ts:17`), com a mesma
  normalização (`trim().toUpperCase()`) de `supportsStartConversation`
  (`gptmaker.ts:59-66`). Não importo de lá: é módulo Deno, fora do glob do
  vitest (`vite.config.ts:30`), e aquele arquivo está na lista de "não tocar".
  O comentário no topo do módulo aponta para a origem.

**Sinal de relógio, agora um só.** Antes cada ponta usava um sinal diferente:

| ponta | antes | agora |
|---|---|---|
| header (`selectedSession`) | varria `messages` e pegava a última `sender_type='customer'` | `lastCustomerMessageAtByConversation[c.id]` |
| sidebar (`sessionsAdapter`) | `conversations.last_message_at < 86_400_000` | `lastCustomerMessageAtByConversation[c.id]` |

O sinal da sidebar era **errado por construção**: `conversations.last_message_at`
é empurrado também pelo **envio do time** (`send-chat-message/index.ts:503`),
não só pela mensagem do cliente — então uma conversa "se mantinha aberta" pela
resposta do agente. Agora as duas pontas leem o mesmo mapa, que é
"última mensagem **do cliente** nas últimas 24 h, por conversa".

**Por que o sinal virou uma query nova.** `useConversations` ganhou
`fetchCustomerWindowSignal()`: uma leitura em `messages`
(`sender_type='customer'` e `created_at >= now-24h`) reduzida para a mais recente
por conversa. Três razões para essa forma:
- a RLS de `messages` é por equipe (`supabase/schema_remoto.sql:952`, via
  `leads.equipe_id`), então **não** é preciso enumerar ids de conversa nem
  paginar por `IN (...)`;
- o corte de 24 h **limita o resultado** ao que interessa (não é varrer o
  histórico);
- a query key repete o prefixo `["conversations", equipeId]` de propósito:
  toda invalidação que já existe (canal realtime de `messages` e as mutations)
  alcança o novo query por prefixo, então o sinal anda junto com a lista.
- Se a leitura falhar, o mapa fica vazio → conversa oficial aparece **fechada**;
  degrada para o lado conservador e não derruba o Inbox (o query da lista é
  separado).

---

## 3. O que mudou, arquivo por arquivo

| arquivo | mudança |
|---|---|
| **`src/lib/service-window.ts`** (novo, 119 linhas) | A fonte de verdade. `NON_OFFICIAL_CHANNEL_TYPES`, `SERVICE_WINDOW_MS`, `isNonOfficialConnection`, `isWithinServiceWindow`, `resolveServiceWindow` + os tipos `ConnectionDescriptor` / `ServiceWindow`. |
| **`src/lib/__tests__/service-window.test.ts`** (novo, 148 linhas) | 16 blocos `it(...)` (36 asserções): não oficial sempre aberta (com e sem mensagem do cliente); Solo API pelos dois sinais (tenant e conversa); `CLOUD_API` dentro e fora das 24 h; `CLOUD_API` sem mensagem; tipo desconhecido cai na regra de 24 h; limite exato de 24 h; data inválida; normalização caixa/espaço; `Date` vs ISO. |
| `src/hooks/useConversations.ts` | `Conversation.solo_instance_id` declarado (já vinha do `select *`; o tipo só não declarava). Novo `CustomerWindowSignal` + `fetchCustomerWindowSignal()` + query `["conversations", equipeId, "customer-window-signal"]`. O hook passa a devolver `lastCustomerMessageAtByConversation`. Nada do optimistic update existente foi tocado. |
| `src/pages/Chat.tsx` | `selectedSession` e `sessionsAdapter` passam a chamar `resolveServiceWindow(...)` com o mesmo sinal. Saíram as duas contas inline (`86_400_000`) e a varredura de `messages` do header; o adapter da sidebar deixou de olhar `last_message_at`. Ambos passam `isWindowAlwaysOpen`. |
| `src/types/chat.ts` | `ChatSession.isWindowAlwaysOpen?: boolean` — a flag existe para o indicador dizer **por que** está aberta. |
| `src/components/inbox/ConversationHeader.tsx` | Badge verde: `Sempre aberta` quando `isWindowAlwaysOpen`, senão `Online (24h)`. `Janela Fechada` continua existindo e continua aparecendo **só** no caso oficial fora das 24 h. |

Não mexi em `ChatInput.tsx`: o compositor **nunca foi bloqueado por janela**
(`disabled={loadingMessages}` apenas) e a prop `hasSoloInstance` ali é só o selo
informativo "Envio garantido via Solo API". Preservei.

Verificação de que nenhuma ponta sobrou calculando janela ignorando o canal:

```
$ grep -rn "isOnline\|isWindowAlwaysOpen" src/
src/types/chat.ts:36,42                       (tipo)
src/pages/Chat.tsx:231,232,290,291            (as duas pontas → resolveServiceWindow)
src/components/inbox/ChatListItem.tsx:186     (só renderiza o ponto)
src/components/inbox/ConversationHeader.tsx:121,140,148 (só renderiza o badge)

$ grep -rn "86_400_000\|86400000" src/
src/lib/service-window.ts:19                  (comentário do módulo)
src/lib/natures.ts:95 · AIUsageDashboard.tsx:342 · CRMContextPanel.tsx:203
GoLiveDialog.tsx:111 · useOnboarding.ts:246 · useBilling.ts:75
                                              (todos: cobrança/onboarding/idade — nada a ver com janela de chat)
```

`ConversationHeader` e `ChatListItem` **não calculam** nada: recebem
`isOnline` / `isWindowAlwaysOpen` prontos da fonte de verdade. Nenhum arquivo de
`supabase/functions/` foi tocado (`git status` na §4).

---

## 4. Evidência

### 4.1 Não existe bloqueio REAL de envio no backend (pedido do contrato, §4.3)

Confirmado: **não existe gate**. O indicador visual é a única coisa que codifica
a janela.

```
$ grep -n "24\|window\|janela\|service_window\|outside" supabase/functions/send-chat-message/index.ts
(sem resultado)

$ grep -rn "canSend|windowClosed|outOfWindow|outside_window|fora da janela|message_window" supabase/functions
supabase/functions/start-conversation/index.ts:619   "cadastro futuro, fora da janela, ainda abre. `force` é a exceção explícita."
supabase/functions/_shared/outreach/worker.test.ts:114  "fora da janela adia sem chamar provider"
supabase/functions/_shared/invoice-effects.test.ts:14   (faturamento)
```

Os únicos conceitos de janela no backend são **outros dois**, ambos preservados:
`_shared/outreach/in-service.ts` (`IN_SERVICE_WINDOW_HOURS = 24`, guarda de
abertura do outreach — SE-REV-005) e `_shared/outreach/schedule.ts` (horário de
disparo do outreach, 08:00–20:00). Nenhum dos dois foi tocado. **Não inventei
gate nenhum.**

### 4.2 Escopo real da mudança

```
$ git status --short
 M .claude/settings.local.json      ← já vinha modificado ao abrir a task; NÃO é meu
 M src/components/inbox/ConversationHeader.tsx
 M src/hooks/useConversations.ts
 M src/pages/Chat.tsx
 M src/types/chat.ts
?? docs/dev/projects/saas-salesengine-v1.0/SE-REV-006/
?? src/lib/__tests__/service-window.test.ts
?? src/lib/service-window.ts

$ git diff --stat
 src/components/inbox/ConversationHeader.tsx |  4 +-
 src/hooks/useConversations.ts               | 57 +++++++++++++++++++++++++++++
 src/pages/Chat.tsx                          | 46 +++++++++++++++++++-------
 src/types/chat.ts                           |  6 +++
```

Nenhum arquivo em `supabase/functions/` aparece. Nenhuma migration foi criada.
Nada foi commitado, pushado ou virou PR.

### 4.3 Validação — **NÃO EXECUTADA (bloqueio de sandbox)**

O ambiente não tem `node_modules` e o harness nega execução de npm/node com
arquivo. Registro a saída literal, **sem inventar baseline**:

```
$ node --version
v22.23.2

$ ls -d node_modules
ls: cannot access 'node_modules': No such file or directory

$ npm test
This command requires approval

$ npm run typecheck
This command requires approval

$ npm run lint
This command requires approval

$ npm run build
This command requires approval

$ node --experimental-strip-types docs/dev/projects/saas-salesengine-v1.0/SE-REV-006/verboo/service-window.check.mjs
This command requires approval

$ tsc --version
This command requires approval

$ deno --version
This command requires approval
```

| comando | baseline | depois |
|---|---|---|
| `npm test` | **não executado** (baseline conhecido do repo, dado pelo contrato: ~14 arquivos / 40 falhos / 333 passam — **não reproduzi**) | **não executado** |
| `npm run typecheck` | não executado | não executado |
| `npm run lint` | não executado | não executado |
| `npm run build` | não executado | não executado |

Ou seja: os itens de aceitação *"typecheck OK / lint sem novos errors / build OK /
`npm test` sem regressão"* e *"baseline registrado ANTES"* **não são
verificáveis neste sandbox**. Não afirmei que passam.

**O que consegui fazer no lugar:** deixei
`docs/…/SE-REV-006/verboo/service-window.check.mjs` — um harness que roda a
fonte de verdade **real** (o `.ts` não importa nada, então o
`--experimental-strip-types` do node 22 o carrega sem bundler) e repete caso a
caso as asserções do arquivo de vitest. Ele **não foi executado** (comando
negado) e **não substitui** a suíte; é para rodar na máquina do orquestrador:

```
node --experimental-strip-types \
  docs/dev/projects/saas-salesengine-v1.0/SE-REV-006/verboo/service-window.check.mjs
# esperado: pass=36 fail=0   (contagem das chamadas a eq(); se der FAIL, a
#                      linha "FAIL <caso>: got … want …" diz qual)
```

---

## 5. Pendências e bloqueios nomeados

1. **PENDÊNCIA (bloqueia a aceitação parcial) — não oficial do provider
   (`WHATSAPP`/`Z_API`) não entra na decisão em runtime.**
   *Falta dado no cliente:* não existe, por conversa nem por tenant, um campo
   confiável de "a conexão deste canal é oficial ou não".
   *Por que não improvisei:* as duas fontes candidatas estão documentadas como
   não confiáveis no próprio repo (o `type` de `/channels` reporta WHATSAPP para
   canal oficial — `channel-capabilities.ts:56-61`, `gptmaker.ts:11-16`; e
   `conversation_opener_settings.channel_type` é "não é fonte de verdade" —
   migration SE-REV-001). Usá-las marcaria número **oficial** como "sempre
   aberta".
   *Caminho de correção (exige decisão do dono, provavelmente migration):*
   persistir por conversa (ou por canal) o tipo de conexão real no momento em que
   a conversa nasce — em `gpt-maker-webhook`, que já fala com o provider — e
   então alimentar `providerChannelType` em `resolveServiceWindow`. O outro
   candidato registrado no repo é `/agent/{id}/search`, que reporta `CLOUD_API`
   onde `/channels` mente; usar isso **muda contrato de leitura do provider** e
   está fora do permitido por esta task.
   Enquanto isso não existir, tenant com canal não oficial do provider continua
   vendo "Janela Fechada" — o bug original segue vivo **só nesse caso**.

2. **LIMITAÇÃO CONHECIDA — granularidade do sinal Solo API é do tenant.**
   `hasConnectedSoloInstance` marca **todas** as conversas do tenant como sempre
   abertas, inclusive as que chegaram por um canal oficial. É coerente com o
   significado que a UI já dava a `hasSoloInstance` ("composer is never blocked by
   24h window"), e no caso misto o envio pela Solo API realmente está livre. Se o
   dono quiser granular por conversa, o sinal já existe
   (`conversations.solo_instance_id`) e basta não passar
   `hasConnectedSoloInstance` no adapter — mudança de uma linha, mas o
   comportamento do tenant misto precisa ser decidido por ele.

3. **LIMITAÇÃO MENOR — borda das 24 h no caso oficial.** O mapa é montado com
   corte `now-24h` no momento do fetch e reavaliado com o `now` do render. Se o
   cache ficar velho alguns minutos, uma conversa oficial a poucos minutos do
   limite pode aparecer fechada antes da hora (nunca o contrário). O canal
   realtime de `messages` já invalida o query a cada mensagem nova, então na
   prática o atraso é curto.

4. **BLOQUEIO — validação dinâmica indisponível no sandbox** (§4.3). Sem
   `node_modules` e com npm/node-de-arquivo negados, não rodei typecheck, lint,
   build nem a suíte, e não reproduzi o baseline. Precisa ser rodado onde as
   dependências existem.

5. **FORA DE ESCOPO, preservado de propósito:** `IN_SERVICE_WINDOW_HOURS = 24` e
   a guarda de abertura do outreach (`_shared/outreach/*`), `_shared/solo-sender.ts`,
   `send-chat-message`, `start-conversation`, `crm-webhook`, `outreach-worker` —
   nenhum foi tocado. `src/lib/channel-capabilities.ts` também não mudou: ele é
   configuração de UI por tipo de canal, e a regra de janela é domínio — deixei a
   fonte de verdade única em `service-window.ts` em vez de derivar de lá (derivar
   inverteria a dependência e espalharia a decisão).

---

## 6. Checklist do contrato

| # | Critério | Situação |
|---|---|---|
| 1 | UMA fonte de verdade pura e testável cobrindo WHATSAPP/Z_API/Solo/CLOUD_API | **feito** — `src/lib/service-window.ts` (+ comentário apontando o ponto de verdade preexistente) |
| 2 | Indicador nunca mostra "Janela Fechada" em conexão não oficial; CLOUD_API mantém 24 h | **parcial** — Solo API ✅ (badge "Sempre aberta"); CLOUD_API ✅ (24 h intactas); WHATSAPP/Z_API do provider ❌ por falta de dado (pendência 1) |
| 3 | Nenhum ponto calcula a janela ignorando o canal; sem duplicação divergente | **feito** — as duas pontas chamam a fonte de verdade com o mesmo sinal; as duas contas inline sumiram |
| 4 | Testes novos cobrem a decisão pura | **feito** — 18 casos em `src/lib/__tests__/service-window.test.ts` (**não executados**: pendência 4) |
| 5 | typecheck / lint / build / test sem regressão | **não executado** (pendência 4) |
| 6 | Baseline de `npm test` registrado antes | **não executado** — registrei o bloqueio literal, sem inventar número |
| 7 | Artefatos em pt-BR | feito |
| — | Sem migration / sem tocar motor de outreach / sem commit | feito |

---

## 7. Como revisar rápido

1. `src/lib/service-window.ts` — leia a decisão inteira; é o coração da task.
2. `src/lib/__tests__/service-window.test.ts` — é a especificação executável.
3. `src/pages/Chat.tsx:207-216` e `:264-271` — as duas pontas lendo a mesma
   decisão com o mesmo sinal.
4. `src/hooks/useConversations.ts:60-94` — de onde vem o sinal de relógio.
5. `src/components/inbox/ConversationHeader.tsx:148` — o badge.

DONE-SE-REV-006
