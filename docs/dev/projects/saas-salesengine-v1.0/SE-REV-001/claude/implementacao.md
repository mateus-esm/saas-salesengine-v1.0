# SE-REV-001 — Implementação

**Branch:** `feat/rev-start-conversation` · **Base:** `origin/main` (633b4b0)
**Data:** 2026-09-25 · **Agente:** claude

---

## 1. O que foi feito

Um lead novo que entra no Rev por formulário/anúncio passa a receber a primeira
mensagem de WhatsApp automaticamente, pelo canal do próprio tenant, para o
agente de IA começar o atendimento sem ninguém clicar em nada.

O caminho é aditivo: nada do que já funcionava mudou de comportamento para quem
não ligar o recurso.

### 1.1 Capacidade nativa — `supabase/functions/start-conversation`

Edge function Deno que chama o endpoint documentado do provider:

```
POST https://api.gptmaker.ai/v2/channel/{channelId}/start-conversation
body { "phone": "...", "message": "..." }
```

Sequência: resolve tenant → configuração do tenant → lead → telefone → primeira
mensagem → canal (lido ao vivo no provider) → chamada → persistência.

Três formas de chamar, **um único caminho de execução** — validar uma valida as
três:

| Credencial | Quem usa | Como identifica o tenant |
| --- | --- | --- |
| `Authorization: Bearer <SERVICE_ROLE_KEY>` | gatilho interno do `crm-webhook` | `equipe_id` no corpo |
| `x-webhook-secret` (ou `?secret=`) | **o n8n do cliente** | `equipes.webhook_secret`, o mesmo que o `crm-webhook` já usa |
| JWT de usuário | abertura manual, configuração | `profiles.equipe_id` |

Actions: `open` (default), `get-settings`, `update-settings`.

### 1.2 Gatilho de entrada idempotente

`crm-webhook` — as duas rotas que criam lead (`/inbound/{config_id}` e a rota
autenticada por segredo do time) — chama `dispatchConversationOpen()` depois de
criar/atualizar o lead e a oportunidade.

O gatilho decide com **uma leitura de configuração, sem rede**: tenant que não
ligou o recurso paga só essa consulta. Ele nunca lança — a porta de entrada de
lead não pode cair porque o provider está fora do ar.

Dispara tanto para lead novo quanto para lead que voltou: quem decide se abre é
a idempotência, não a novidade do cadastro (alguém digitado à mão ontem que hoje
preencheu o anúncio também merece atendimento).

### 1.3 Idempotência — no banco, não no código

`conversation_open_events` tem `UNIQUE (equipe_id, event_key)`, e **o INSERT é a
reserva**. Duas chamadas simultâneas: uma insere, a outra recebe 23505, lê a
linha vencedora e devolve o que já existe.

Isso é deliberado. Se a trava fosse um `if` em TypeScript, duas chamadas
paralelas passariam pelo `if` juntas e o lead receberia duas mensagens.

Sem chave explícita, a chave é `lead:<id>` — **uma conversa aberta por lead,
para sempre**. Quem tem id de evento de verdade (execution id do n8n, id da
linha da planilha) manda em `event_key` e aí o bloqueio é por evento.

Uma reserva `pending` abandonada (a função morreu no meio, o provider pendurou)
é reassumível depois de 5 minutos, e uma tentativa `failed` é reassumível na
hora — senão um timeout deixaria o lead sem conversa e sem caminho de retry. A
retomada é exclusiva: `UPDATE … WHERE status = <status lido>`, então quem chega
depois afeta zero linhas e desiste.

### 1.4 Rastreio persistido

`conversation_open_events` guarda, por evento: tenant, lead, conversa, canal e
tipo do canal, telefone, mensagem enviada, status
(`pending|opened|failed|skipped`), **`provider_chat_id`** (o identificador
devolvido pelo provider), `provider_response` (corpo cru), `provider_status`,
`error_code`, `error_message`, `attempts`, `opened_at`.

`conversations` ganhou `opened_at`, `opened_via` e `provider_channel_id`.
`opened_via = 'start_conversation'` é o gancho da cadência futura: "conversa
aberta às 14h02 e o lead não respondeu" é uma pergunta que só dá para fazer com
essas colunas. O `gpt_maker_chat_id` gravado é o mesmo id que o
`send-chat-message` usa em `/v2/chat/{id}/send-message`, então o follow-up
nasce em cima de dado que já tem consumidor.

A mensagem enviada também entra em `messages` como saída (`sender_type: 'agent'`,
`provider: 'gptmaker'`), para aparecer no inbox. O eco que o provider devolve
depois pelo `gpt-maker-webhook` é descartado lá pela dedup de conteúdo em janela
de 5 min para remetente `agent` — verificado no código, não presumido.

### 1.5 Multi-tenant, nada fixo de cliente

`conversation_opener_settings`, uma linha por tenant: `enabled`, `channel_id`,
`channel_type`, `trigger_sources[]`, `first_message`.

Nasce **desligada, sem canal e sem filtro**. Não existe nome de tenant, id de
canal, número de telefone ou texto de mensagem de Casa Flow em nenhum arquivo
desta entrega. Casa Flow é uma linha nessa tabela.

O interruptor `enabled` vale para os **três** caminhos de chamada, de propósito:
ele é a autorização do tenant para o Rev mandar a primeira mensagem, então um
n8n mal apontado não abre conversa num tenant que não pediu isso.

### 1.6 Falha explícita e registrada, nunca em silêncio

A documentação do provider diz que start-conversation só existe para WhatsApp
**não oficial**. O tipo do canal é conferido antes da chamada — e o tipo do
provider **não é confiável** como discriminador (está registrado em
`src/lib/channel-capabilities.ts`: `/workspace/{id}/channels` reporta `WHATSAPP`
para canais que `/agent/{id}/search` reporta como `CLOUD_API`).

Então há duas camadas: a checagem local recusa o que sabemos que não serve, e a
recusa do provider é gravada com status + corpo em
`conversation_open_events`, com uma `hint` no 404 apontando a causa provável.

Códigos de erro: `disabled`, `source_not_triggered`, `lead_not_found`,
`missing_phone`, `technical_phone`, `missing_message`,
`workspace_not_configured`, `agent_not_configured`, `engine_token_missing`,
`channel_list_failed`, `channel_not_found`, `channel_not_connected`,
`channel_ambiguous`, `no_whatsapp_channel`, `channel_type_unsupported`,
`provider_rejected`, `provider_unreachable`, `contract_suspended`.

---

## 2. Arquivos tocados

### Novos

| Arquivo | O que é |
| --- | --- |
| `supabase/migrations/20260925000100_serev001_start_conversation.sql` | as duas tabelas + 3 colunas em `conversations` |
| `supabase/functions/_shared/start-conversation.ts` | núcleo: configuração, escolha de canal, mensagem, chamada ao provider, gatilho |
| `supabase/functions/_shared/start-conversation.test.ts` | 25 testes das funções puras |
| `supabase/functions/start-conversation/index.ts` | a edge function (auth, idempotência, persistência) |
| `supabase/tests/serev001_start_conversation.test.sql` | 10 testes do esquema (idempotência, RLS, domínios) |
| `docs/.../SE-REV-001/claude/implementacao.md` | este arquivo |
| `docs/.../SE-REV-001/claude/integracao-n8n.md` | contrato HTTP, configuração e plano de deploy/smoke |

### Modificados

| Arquivo | Mudança |
| --- | --- |
| `supabase/functions/crm-webhook/index.ts` | import + 2 chamadas de `dispatchConversationOpen()`; resposta ganhou `conversation_open_dispatched` (campo novo, aditivo) |
| `supabase/config.toml` | `[functions.start-conversation] verify_jwt = false` — a função autentica sozinha e o n8n não tem sessão |

Nada em `gpt-maker-webhook`, `send-chat-message` ou `manage-agent-channels`.

---

## 3. Decisões tomadas

**A idempotência é do banco.** Único ponto onde vale gastar um índice: é o que
separa "uma mensagem" de "duas mensagens" para uma pessoa real.

**A chave default é o lead, não uma janela de tempo.** Janela esconde o problema
por alguns minutos; a planilha reprocessada uma semana depois voltaria a mandar
mensagem. Uma abertura por lead é o que o critério de aceite pede.

**Não se adivinha o número.** Com `channel_id` configurado, é aquele canal ou
erro — nunca um vizinho parecido. Sem configuração, só decide sozinho se existe
exatamente **um** WhatsApp conectado; dois viram `channel_ambiguous` pedindo
escolha explícita. Mandar a mensagem do número errado é pior que não mandar.

**O canal é lido ao vivo no provider, não cacheado.** Um canal desconectado
ontem à noite não pode virar mensagem perdida hoje. `channel_type` na tabela é
diagnóstico, não fonte de verdade.

**O filtro de `source` vale só para o gatilho automático.** Ele separa "lead veio
do anúncio" de "lead digitado à mão por um vendedor". Chamada explícita (n8n,
botão) já é intenção declarada e não passa pelo filtro.

**A função não cria lead.** Quem recebe cadastro (crm-webhook, formulário) cria;
esta abre conversa com lead que existe, ou responde 404. Dois criadores de lead
seriam dois caminhos de deduplicação.

**Reusa `equipes.webhook_secret` para o n8n.** Nenhum segredo novo para gerar,
distribuir e rotacionar — é o segredo que o cliente já usa no `crm-webhook`.

**Reusa `normalizePhone()` e `isTechnicalPhone()`.** O número usado na abertura é
o mesmo pelo qual a resposta do lead vai ser reconhecida depois, e um LID da
Meta (`...@lid`, incidente SE-LID-001) é recusado antes de virar mensagem no
vazio.

**Conta suspensa não manda mensagem** — mesma regra e mesmo 402 do
`send-chat-message`.

**Reaproveita a conversa de WhatsApp existente do lead** em vez de criar outra:
o `gpt-maker-webhook` procura por (lead, canal) antes de criar, e duas conversas
de WhatsApp para o mesmo lead fariam a resposta dele cair numa e a nossa
mensagem ficar na outra.

---

## 4. Validações executadas (resultado real)

Ambiente: worktree sem `.env`; `node_modules` reconstruído nesta sessão (ver
ressalva abaixo).

| Validação | Comando | Resultado |
| --- | --- | --- |
| Testes Deno (funções puras novas) | `deno test --allow-net --allow-env supabase/functions/_shared/start-conversation.test.ts` | **25 passed, 0 failed** |
| Testes Deno (todo o `_shared`) | `deno test --allow-net --allow-env supabase/functions/_shared/` | **160 passed, 0 failed** |
| Typecheck Deno dos arquivos novos/tocados | `deno check` em `start-conversation/index.ts`, `_shared/start-conversation.ts`, `crm-webhook/index.ts` | **OK** |
| Typecheck Deno de todas as edge functions | `deno check` em cada `supabase/functions/*/index.ts` | 1 falha, **baseline** (ver abaixo) |
| Teste SQL do esquema | ver "como foi rodado" abaixo | **10/10 asserts ok, `PASS`** |
| Typecheck frontend | `npm run typecheck` | 2 erros, **baseline** (ver abaixo) |
| Lint | `npm run lint` | **0 errors**, 82 warnings (baseline) |
| Build | `npm run build` | **✓ built in 32.58s** |
| Testes frontend | `npm test` | **52 arquivos, 397 testes, todos passando** (com `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` dummy) |

### Baseline failures (pré-existentes, não mascaradas)

1. **`deno check supabase/functions/cadence-check/index.ts`** — `TS2352` na linha
   110: o cast de `opps` declara `lead` como objeto e o cliente infere array.
   Arquivo **não tocado** por esta entrega (`git diff` vazio nele).

2. **`npm run typecheck`** — 2 erros `TS2345`, ambos em arquivos **não tocados**:
   - `src/hooks/useOnboarding.ts:192`
   - `src/pages/Chat.tsx:378`

3. **`npm run lint`** — 82 warnings, 0 errors. Consistente com o
   `lint_errors.txt` versionado no repo.

4. **`npm test` sem variáveis de ambiente** — 3 arquivos falham no import de
   `src/integrations/supabase/client.ts`, que lança quando `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` não existem. É ausência de `.env` no worktree, não
   código: com valores dummy, **52/52 arquivos e 397/397 testes passam**.

### Como o teste SQL foi rodado — e o que isso NÃO prova

`scripts/sqltest.sh` roda contra o **projeto Supabase de produção** pela
Management API (dentro de `BEGIN … ROLLBACK`). Não foi usado: não há `.env` neste
worktree e apontar para a produção não é decisão deste harness.

No lugar, o arquivo foi rodado num **PostgreSQL 15.19 local e efêmero**
(`initdb` em `/tmp`, destruído no fim), com as dependências mínimas criadas como
stubs (`equipes`, `profiles`, `leads`, `conversations`,
`update_updated_at_column`, `auth.uid()`, roles `authenticated`/`anon`/
`service_role`), o `-- @include` da migration expandido igual ao runner faz.

Resultado real: **os 10 asserts passaram e o marcador `PASS` saiu** — T1
idempotência por evento, T2 chave explícita independente, T3 idempotência por
tenant, T4 domínio fechado de `status`, T5 configuração nasce desligada, T6 uma
configuração por tenant, T7 id do provider consultável, T8 rastro sobrevive à
conversa, T9 retomada exclusiva, T10 RLS ligada com política por equipe.

O que isso **não** prova: que a migration aplica sobre o esquema real de
produção (os stubs são aproximações das tabelas de verdade). Rodar
`bash scripts/sqltest.sh supabase/tests/serev001_start_conversation.test.sql`
com o `.env` do projeto é a confirmação que falta — **NÃO EXECUTADO** aqui.

### Ressalva sobre o `node_modules` desta sessão

O `package-lock.json` versionado está **desatualizado** em relação ao
`package.json` (não contém `typescript`, `eslint`, `vitest`, `react`…): o
lockfile real do repo é o do bun, e o bun não existe neste sandbox. `npm ci`
instalou 287 pacotes e nenhuma ferramenta de build.

O que foi feito: `npm install --legacy-peer-deps --include=dev` (o
`--legacy-peer-deps` é obrigatório — o npm 10.9.8 quebra com
`Cannot read properties of null (reading 'edgesOut')` no peer set do vitest 4),
mais `@testing-library/dom` com `--no-save`, que o `--legacy-peer-deps` deixa de
fora e sem o qual `@testing-library/react@16` não reexporta `fireEvent` (isso
produzia 12 erros de typecheck que **não** são baseline do projeto).

Consequência: as versões usadas (`typescript@5.9.3`, `vitest@4.1.11`,
`eslint@9.39.5`, `vite@5.4.21`) satisfazem o `package.json` mas podem não ser
exatamente as do bun.lock. O `package-lock.json` foi **restaurado ao original**
e não aparece no diff.

### O que não foi executado

- **Chamada real ao provider.** Nenhum `POST /start-conversation` foi disparado:
  não há `GPT_MAKER_TOKEN` neste ambiente e a task não autoriza tocar produção.
  **NÃO EXECUTADO** — o smoke test está descrito em `integracao-n8n.md`.
- **Deploy.** Fora de escopo; a entrega é o PR.

---

## 5. Pendências

1. **Smoke test contra o provider** (o item de risco desta entrega): o shape da
   resposta do start-conversation não está documentado. `extractProviderChatId()`
   cobre `chatId`, `contextId`, `conversationId`, `id` e os aninhados em
   `chat`/`conversation`/`data`, e o corpo cru fica em
   `provider_response` — então um nome novo é descoberto olhando a tabela, sem
   reproduzir o caso. Se vier `null`, a conversa é criada sem
   `gpt_maker_chat_id` e o inbox só amarra quando o lead responder (o
   `gpt-maker-webhook` preenche o id nesse momento).
2. **`bash scripts/sqltest.sh supabase/tests/serev001_start_conversation.test.sql`**
   com o `.env` do projeto, para validar a migration contra o esquema real.
3. **UI de configuração.** Não entrou (fora de escopo). Hoje se configura por
   `action: update-settings` ou SQL. Uma aba em Canais/Agente é o passo natural.
4. **Outros criadores de lead não disparam o gatilho.** Só o `crm-webhook` (as
   duas rotas). `public-form` não escreve em `leads` diretamente e não foi
   investigado a fundo; lead criado pela UI ou por importação também não
   dispara. Quando entrar, é uma linha: `dispatchConversationOpen()`.
5. **Cadência/follow-up.** Só o dado e o gancho, como pedido:
   `conversations.opened_at` / `opened_via` e o `provider_chat_id` do evento. O
   `cadence-check` não foi tocado.
6. **`conversations.atendido_por_agente` continua `false`** ao abrir. É
   defensável marcar `true` (o agente de IA está atendendo), mas essa flag move
   badges na UI e o efeito não foi verificado — ficou como está.
7. **Desligar o n8n.** Continua sendo o caminho do cliente até o nativo estar
   validado em produção, exatamente como a task pede.
