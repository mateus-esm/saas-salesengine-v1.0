Você é o harness de EXECUÇÃO da task SE-REV-002 no repo `saas-salesengine-v1.0`. Esta é uma **RETOMADA**.

Modo: **effort médio**. Uma execução anterior foi interrompida pelo limite de sessão da conta. Ela já entregou parte do trabalho. Continue de onde parou — **não recomece**.

---

## Leia primeiro, nesta ordem

1. `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/contexto/decisions.md` — **decisões novas do dono do produto**, tomadas depois do plano. Elas restringem o que você pode fazer. Leia antes de qualquer coisa.
2. `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/plano.md` — o plano (974 linhas). A seção 6 é a sua ordem de execução.
3. `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/contexto/spec.md` — o contrato.

## Estado atual do worktree (confira você mesmo antes de agir)

Rode `git log --oneline b8f16bb..HEAD` e `git status`. O esperado:

**Já commitado (Fase 0 — passos 1 e 2 do plano):**
- `bad1824` fix(rev): tratar 200 {success:false} do provider como recusa
- `7b7e492` fix(rev): abertura automática filtra pela porta de entrada e pelo source do evento
  (inclui `supabase/migrations/20260926000050_serev002_opener_entry_filter.sql`, testes Deno e SQL, e atualização do `integracao-n8n.md` da SE-REV-001)

**Escrito mas NÃO commitado (passo 3 — a migration do motor):**
- `supabase/migrations/20260926000100_serev002_outreach.sql` (~966 linhas: 5 tabelas, ~18 funções, 9 gatilhos)

**Também não commitado:** `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/pg-local/` (stubs + runner do Postgres local), `plano.md` e `contexto/`.

**Sua primeira tarefa:** verificar se a migration do motor está completa e coerente com o plano (§3), rodar o teste SQL dela em Postgres local, e **commitar o passo 3**. Depois siga para os passos 4 a 12 da seção 6 do plano, na ordem.

## Fatos de produção já confirmados (NÃO precisa repetir)

- **Casa Flow** = `equipe_id aa33b576-3959-4a81-8e73-4027039ea2ce`, tem `workspace_id` **e** `gpt_maker_agent_id` → **tenant GPT Maker**.
- **Porta do n8n**: `webhook_configs.id ca544dfe-b643-4df0-addb-345992a2abdc` ("Meta ADS - Cadastro") → `crm_entries.id 5a0349b1-efd4-4d17-b9ab-4f8502ff8574`, `kind='webhook'`.
- **`leads.source` da Casa Flow (30 dias)**: `webhook_inbound` 42 · `IA` 146 · `Manual` 1. A string `"Meta Ads - Cadastro (Social Pago)"` **não existe** como `source` — o gatilho é **pela porta**. Isso confirma a Correção 3.
- **Casa Flow tem 0 instâncias Solo** (`wpp_instances`). Hoje é 100% GPT Maker; o caminho Solo é para escalar.
- `conversations.gpt_maker_chat_id` é populado **pelo webhook**, não pelo start-conversation.
- Esses ids são **contexto de leitura**. **Não entram no código.**
- **Pendência (não bloqueia):** o *tipo* do canal da Casa Flow (não oficial vs Cloud API) vive na API do provider. Decide se a Fase 0 resolve a Casa Flow ou se ela precisa de linha Solo. Registre como pendência.

## Regras que não se negociam

- **NÃO altere nenhum workflow do n8n.** Nem em produção, nem em arquivo. O n8n é contexto: o dono o construiu como serviço à parte e ele **permanece** como caminho padronizado de envio/recebimento por enquanto (decisões D1 e D2). Se o `integracao-n8n.md` citar a recomendação de baixar o Schedule Trigger de 10 para 2 min, marque-a explicitamente como **"não aplicar nesta entrega"**.
- **Não faça push, não faça deploy, não rode `scripts/sqltest.sh`** (aponta para produção). A entrega é código + commits locais. O orquestrador faz push/PR.
- **Não quebre** `crm-webhook`, `gpt-maker-webhook`, `send-chat-message`, `cadence-check`, `solo-wpp-webhook`. O `cadence-check` **não é tocado nem usado**.
- **Multi-tenant**: nada hardcoded de Casa Flow.
- **Sem segredos no código.**
- **Idempotência no banco**, não em TypeScript (§3.5 do plano).
- **Os 25 testes da SE-REV-001 continuam passando sem edição.**
- **Validação honesta**: resultado real. Runner que não rodar → `NÃO EXECUTADO`. Nunca invente. Baseline pré-existente: `cadence-check/index.ts` TS2352, `useOnboarding.ts:192`, `Chat.tsx:378` (não toque nesses).
- **Bloqueio real que mude decisão de produto/arquitetura** → pare e reporte, não improvise contra o plano.

## Idioma

TUDO em português do Brasil. Nunca espanhol.

## Entrega

- Passos 3 a 12 commitados, um commit por passo.
- `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/implementacao.md` — o que foi feito, decisões, validações com resultado real, baseline não mascarado, `NÃO EXECUTADO` explícito.
- `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/integracao-n8n.md` — contrato do `outreach`, exemplo de sequência da Casa Flow (como configuração, **sem dados da Casa Flow no código**), plano de deploy e smoke.
- Não commite `.claude/settings.local.json` nem `*.tsbuildinfo`.

Ao final, resuma o que ficou pronto, o que ficou pendente e o próximo passo.

---

## ADENDO — escopo confirmado pelo dono (leia antes de fechar)

O dono respondeu à pergunta de escopo: **"Motor agora + tela mínima de configuração"**.
Está registrado como **D6** em `contexto/decisions.md`.

**O que isso muda:** depois do passo 8 do plano (API `outreach`), adicione **um passo 8b**:

**Passo 8b — tela mínima de configuração (UI).**
Uma página no app onde o cliente consegue, sozinho:
- ligar/desligar a sequência;
- escolher a **porta de entrada** que dispara (o gatilho);
- escolher o **canal/provider**;
- editar as **mensagens** de cada passo (texto + offset).

Ela consome **apenas** a API `outreach` já construída no passo 8:
`list-sequences`, `upsert-sequence`, `update-profile`, `get-trace`.
Não introduza lógica de disparo na tela — ela só lê e escreve configuração.

Siga o padrão do repo para páginas: veja `src/pages/Webhooks.tsx` e
`src/pages/PipelineSettings.tsx` como referência de estrutura, e o roteamento em
`src/App.tsx`. Respeite o `PageRouteGuard`.

**O que NÃO entra:** superfície completa de regras estilo Jestor (condições
compostas, ramos, editor visual de eventos, ações arbitrárias). Isso é Fase 2.
Se a tentação de generalizar aparecer, pare no caso "porta X → canal Y → texto Z".

**Validação da UI:** `NODE_ENV=test ./node_modules/.bin/vitest run <arquivo>` (sem
essa variável todo `.tsx` falha com `jsxDEV is not a function` — é ambiente, não
o seu código). E `tsc -b` + `npm run build`, que são o que o CI do repo realmente
usa como gate.

---

## ADENDO 2 — passo 2b: enviar mensagem para lead SEM conversa ativa

Requisito novo do dono (áudio, registrado como **D7** em `contexto/decisions.md`).

**O problema, com a causa raiz já localizada** (não precisa redescobrir):
`supabase/functions/send-chat-message/index.ts` só consegue enviar pelo GPT Maker
quando **já existe** `conversations.gpt_maker_chat_id` — é esse id que alimenta
`/v2/chat/{id}/send-message`. Lead sem conversa → `resolvedChatId = null` → o
bloco `if (resolvedChatId)` não roda → cai no ramo Solo
(`if (connectedInstance && soloPhone)`) → sem instância Solo conectada →
termina em `no_route | delivered=false | reason=no_delivery_route` (linha ~435).
A UI mostra "Mensagem salva, mas não entregue — verifique os canais conectados."
(`Chat.tsx:328`).

**Casa Flow é exatamente esse caso**: GPT Maker, **0 instâncias Solo**.

**O que fazer (passo 2b, junto da Fase 0):**
Quando **não existe** `chat_id` e o tenant é GPT Maker, o caminho correto é
**abrir a conversa** com o texto, via
`POST /v2/channel/{channelId}/start-conversation` com `{phone, message}` — a
mesma capacidade da SE-REV-001 (`callStartConversation`, que você já corrigiu no
passo 1). Não é `send-message`.

- No GPT Maker: sem `chat_id` → `start-conversation` com o texto do usuário.
- Na Solo: sem `chat_id` → o `sendText` outbound já existente (nada novo).
- Com `chat_id` (GPT Maker): **comportamento atual idêntico** — `start-human` +
  `send-message`. Não mexa nesse caminho.

**Restrições:**
- **Aditivo.** Quem já tem `chat_id` continua exatamente igual.
- Reusar `callStartConversation` e o resolvedor de canal do passo 1/5; não
  escreva um segundo caminho de abertura.
- **Idempotência:** o envio manual **não** deve passar pela trava de
  `conversation_open_events` (é uma ação humana deliberada, e o usuário pode
  querer mandar mais de uma mensagem). Mas a **abertura de conversa** registra o
  `conversation_open_events` como qualquer outra, para o motor não abrir uma
  segunda conversa depois.
- Se o tenant tiver `provider='solo'` mas nenhuma instância conectada, ou se o
  tipo de canal não suportar start-conversation, **falhe explícito** com razão
  legível (não `no_delivery_route` genérico). A UI precisa poder dizer o que
  fazer.
- Sem quebrar os testes existentes de `send-chat-message`.

**Validação:** testes Deno do novo ramo (sem chat → chama start-conversation com
o texto; com chat → continua em send-message; tenant Solo sem instância → razão
explícita). Registrar o que não der para rodar como `NÃO EXECUTADO`.
