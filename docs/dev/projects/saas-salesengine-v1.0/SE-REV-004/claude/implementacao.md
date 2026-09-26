# SE-REV-004 — Implementação

Branch: `task/SE-REV-004-fix-event-save-and-send` · Agente: claude · Data: 2026-09-26

Resumo: os dois bugs têm causa raiz provada com dados de produção e reprodução
real. O Bug 1 **não** era perda de dados no servidor: a tela abria sempre em
"Nova sequência", e o segundo "salvar" do dono criou outra sequência em vez de
editar a primeira. O Bug 2 é a checagem de tipo de canal estreita demais
(`Z_API` recusado). Os dois estão corrigidos; o Bug 1 foi provado corrigido no
build real contra o banco real. O Bug 2 foi provado com a lista real de canais,
mas a transição `failed → opened` em produção **depende do deploy** (ver §5).

Achado extra, fora do código e bloqueante para o outreach: **o cron
`outreach-tick` nunca foi agendado** — nenhum job de sequência é enviado (§4.1).

---

## 1. Bug 1 — "O evento não está sendo salvo: clico, ele diz que salvou, mas não salva"

### 1.1 Causa raiz (provada por evidência, não por leitura de código)

`src/pages/OutreachSettings.tsx` iniciava com `selectedId = "new"`. Toda vez
que o componente monta (entrar na tela, ou voltar do Chat), o painel da direita
mostra um formulário **em branco** ("Nova sequência", sem porta, sem texto),
mesmo com a regra salva listada à esquerda. Nada na tela diz que salvar vai
**criar** outra. O dono "ajusta a regra" nesse formulário, clica em salvar, o
front manda `upsert-sequence` **sem `id`**, o servidor faz INSERT e o toast diz
"Sequência salva.". A regra original nunca muda.

Reconstrução do que o dono fez (logs de edge function `function_edge_logs` +
banco; as chamadas do navegador são as precedidas de `OPTIONS`):

| UTC 2026-09-25 | Chamada do navegador | Efeito no banco |
|---|---|---|
| 23:10:46 | `update-profile` → 200 | `conversation_opener_settings.updated_at = 23:10:46` |
| 23:10:58 | `upsert-sequence` → 200 | **cria** seq "Novo Lead - Meta ADS (Cadastro)" (porta Manual, texto "Oi") |
| 23:12–23:14 | (Chat: cria lead manual, envia "Oi" e "Ola teste" — Bug 2) | — |
| 23:13:39 | só `list-sequences` → 200 | tela **remontada** ao voltar para Outreach |
| 23:14:28 | `upsert-sequence` → 200 | **cria** seq "Novo Lead" (mesma porta Manual, mesmo texto "Oi") |

Depois disso não há mais nenhum `upsert-sequence` do navegador. As duas
sequências têm `updated_at == created_at` e o trigger `update_updated_at_column`
existe — então a primeira **nunca recebeu UPDATE**. Todos os saves chegaram ao
servidor e foram gravados; o que "não salvou" foi a edição que o dono achava
estar fazendo. Arquivos: `evidencias/bug1/logs-edge-outreach-2026-09-25.txt`,
`evidencias/banco-casa-flow.md`.

### 1.2 Reprodução no app real (build de produção + Playwright + Supabase real)

Conta usada: `mateus@soloenergia.com.br` (dono do SaaS, time Solo Energia), com
sequências de teste **inativas** chamadas `[SE-REV-004 …]`, apagadas no fim. Não
usei conta de cliente da Casa Flow. Sessão criada por magic link administrativo
(nenhum e-mail enviado) e revogada no fim (as 2 linhas de `auth.sessions`).

| Passo | Baseline (`main`) | Corrigido |
|---|---|---|
| 1. cria a regra e salva | `id: null` → INSERT | `id: null` → INSERT |
| 2. vai ao `/chat` e volta ao `/outreach` (SPA) | formulário **"Nova sequência" em branco** | abre **"Editando: [regra]"** com porta e texto |
| 3. ajusta o nome e salva | envia `id: null` → **2ª sequência** | envia o `id` → **UPDATE** |
| toast | "Sequência salva." | "Alterações salvas." |
| banco após o passo 3 | 2 linhas; a original com `updated_at == created_at` | 1 linha; `updated_at` 00:32:18 → 00:32:30, nome novo |

Capturas e logs: `evidencias/bug1/antes-*`, `evidencias/bug1/depois-*`.

Controle: o caminho feliz (criar e editar sem sair da tela) **já funcionava** no
baseline — `updated_at` avança e o nome/passos novos aparecem após reload
(`controle-caminho-feliz-*`). Isso descarta as suspeitas (a) id perdido no
mesmo draft, (b) Select gravando porta errada, (c) passos não persistindo e
(d) toast sem persistência.

Hipótese testada e **descartada**: editar a sequência e clicar "Salvar canal"
apagaria a edição não salva (o `useEffect([selected])` recarrega o rascunho no
refetch). No build real a edição sobreviveu — o React Query preserva a
identidade dos objetos quando os dados não mudam (`hipotese-descartada-salvar-canal.png`).
A correção abaixo remove esse risco de qualquer forma.

Sobre a porta "Manual" numa sequência chamada "Meta ADS (Cadastro)": o lead de
teste foi criado **manualmente** às 23:12:26 e foi inscrito nessa sequência em
23:12:27 — o dono escolheu "Manual" para testar com contato manual. Não é bug
do Select (o Select gravou a porta escolhida em todos os testes).

### 1.3 Correção (front)

`src/pages/OutreachSettings.tsx`:

- ao montar, se existem sequências, abre a **primeira** em vez de "new";
  "new" só quando a lista está vazia ou o usuário clica "Nova sequência";
- o rascunho só é recarregado quando muda **qual** sequência está aberta
  (refetch da lista não sobrescreve o que está sendo digitado);
- após salvar, a tela mostra o que o **servidor devolveu**;
- criar × editar ficam explícitos: título "Nova sequência" / "Editando: X",
  descrição "Salvar cria uma sequência nova." / "Salvar altera esta sequência.",
  botão "Criar sequência" / "Salvar alterações", toast "Sequência criada." /
  "Alterações salvas.";
- textos visíveis "GPT Maker" → "Provedor de IA" (regra de produto já testada em
  `no-provider-branding.test.ts`, que estava vermelho por causa desta tela).

Compatível com a função `outreach` deployada hoje (v2) e com a nova (§3).

### 1.4 Dados atuais da Casa Flow

Não alterei. Há duas sequências (`5396de90…` ativa, `ad36c612…` inativa), ambas
na porta Manual. Cabe ao dono decidir qual manter; com a correção, abrir a tela
mostra a primeira e salvar a edita.

---

## 2. Bug 2 — mensagem manual no chat não envia

### 2.1 Causa raiz (confirmada)

`conversation_open_events` da Casa Flow: 5 eventos `failed / channel_type_unsupported`
(23:13, 23:14 manuais — as mensagens "Oi" e "Ola teste" do lead manual; 23:20,
23:31 e 00:11 automáticos de `lead_intake`). Nenhum `opened`. As mensagens
ficaram gravadas em `messages` sem `provider`/`provider_message_id`.

Caminho: `send-chat-message` (conversa sem chat) → `openManualGptConversation`
→ `pickStartConversationChannel` → `supportsStartConversation("Z_API") = false`.

Canal real (lido da função `outreach` deployada, `list-sequences`):
`3F32F1093C8681A460108E59734FC41E` "Casa Flow - WPP (API)", `Z_API`,
`connected: true` — e é exatamente o `channel_id` do perfil do tenant.

### 2.2 Decisão sobre tipos (com fonte)

Documentação oficial do provider:
- `POST /v2/channel/{channelId}/start-conversation`: "atualmente iniciar a
  conversa só está disponível para canais do tipo **Whatsapp não oficial**".
- Enum de tipo de canal em "Criar canal no workspace": `Z_API`, `WHATSAPP`, …,
  `CLOUD_API`. Em "Canais": Cloud API = "WhatsApp **Oficial** da Meta";
  WhatsApp = WhatsApp Web (QR).

Portanto **não oficiais = `WHATSAPP` e `Z_API`** → aceitos.
**`CLOUD_API` continua recusado**: é o oficial da Meta, fora do que o endpoint
atende. Ressalva registrada em `channel-config.ts`/`channel-capabilities.ts`:
`/workspace/{id}/channels` pode reportar `WHATSAPP` para um canal que é oficial
(CLOUD_API em `/agent/{id}/search`). Esse caso já era aceito antes e continua
igual; se o provider recusar, vira `provider_rejected` com o corpo gravado — não
é mascarado.

### 2.3 Correção

`supabase/functions/_shared/outreach/gptmaker.ts`:
`START_CONVERSATION_CHANNEL_TYPES = ["WHATSAPP", "Z_API"]` e a mensagem de erro
passa a listar os tipos aceitos. Uma linha de regra; vale para os 5 caminhos que
importam o módulo: `send-chat-message`, `start-conversation`, `crm-webhook`,
`outreach-worker`, `outreach`.

### 2.4 Outros tenants

Varredura só-leitura dos 6 tenants com provider configurado
(`evidencias/bug2/varredura-tenants-tipos-de-canal.txt`): só a Casa Flow tem
`Z_API`; nenhum tenant tem `WHATSAPP` + `Z_API` conectados ao mesmo tempo (o
único caso em que a escolha automática mudaria de "o único WHATSAPP" para
"ambíguo"). **Nenhum outro tenant muda de comportamento.**

### 2.5 Prova

`evidencias/bug2/antes-depois-selecao-de-canal.txt` — mesma entrada real (canais
da Casa Flow + `channel_id` do perfil) no caminho manual, com o envio
interceptado:

- ANTES: `channel_type_unsupported` — texto **idêntico** ao gravado em produção;
- DEPOIS: `ok`, canal `3F32F…` `Z_API`, chamaria `start-conversation` nesse canal.

**Não provado no sandbox:** `conversation_open_events` passando de `failed` para
`opened` em produção. Exige (1) deploy das funções — proibido para mim — e
(2) enviar um WhatsApp real a um contato real. Roteiro pós-deploy no §5.

---

## 3. Revisão SE-REV-001/002 — o que entrou

**Atomicidade do `upsert-sequence`** (revisão adversarial SE-REV-002 §3):
nova RPC `public.crm_outreach_save_sequence(p_equipe_id, p_sequence, p_steps)`
(`supabase/migrations/20260926000200_serev004_save_sequence_atomic.sql`) faz
sequência + passos + desativação dos removidos numa transação, confere o time do
`id` (não deixa um `id` de outro time virar UPDATE nem INSERT), e só
`service_role` executa. A validação de negócio continua na edge function. A
`outreach` passa a chamá-la (`supabase/functions/outreach/index.ts`), com a mesma
resposta `{ sequence: { …, steps } }` e o mesmo 404 "Sequência inexistente neste
time". Justificativa da migration: é a única forma de ter transação a partir da
edge function (PostgREST não abre transação entre chamadas); é aditiva
(`create or replace function`), sem mudança de tabela; rollback = `drop function`
+ função anterior.

Testada em PostgreSQL 15 local (`supabase/tests/serev004_save_sequence.test.sql`,
harness `SE-REV-002/claude/pg-local/run.sh`): cria; edita a mesma linha e
`updated_at` anda; troca porta/texto; desativa passo removido; **falha no meio
desfaz tudo**; recusa id de outro time; gatilho de desligar ainda cancela
inscrições; privilégios. **PASS.** Não aplicada em produção.

**Branding**: `no-provider-branding.test.ts` estava vermelho por causa desta tela;
textos corrigidos e a tela/teste entram na allowlist pelo identificador interno
`gptmaker` (valor que a API espera), como a allowlist já faz para outros casos.

## 4. O que NÃO coube (pendências)

### 4.1 Bloqueante operacional — outreach nunca envia
`cron.job` não tem `outreach-tick`. O script
`supabase/scripts/2026-09-26_serev002_schedule_outreach_tick.sql` é inerte e não
foi aplicado (e os segredos `outreach_worker_url`/`outreach_worker_secret` no
Vault precisam existir). Resultado: o job da inscrição do lead manual
(`outreach_jobs`, `queued`, `run_after` 2026-09-25 23:12:28, 0 tentativas,
nunca reivindicado) está parado. **Atenção antes de ligar o cron:** esse job
vencido será enviado imediatamente (texto "Oi" ao contato de teste do dono);
cancele-o antes se não for desejado. Também não configurei nada no Vault/cron —
é produção e é do orquestrador.

### 4.2 Deploy desta correção liga envio real para a Casa Flow
`conversation_opener_settings` da Casa Flow está `enabled = true`, porta
"Meta ADS - Cadastro" (`5a0349b1…`). Hoje todo lead dessa porta falha por
`channel_type_unsupported`; depois do deploy, **leads reais passam a receber a
primeira mensagem automaticamente**. É o comportamento pedido na ativação de
teste, mas é uma mudança visível ao cliente. Os eventos `failed` já gravados não
são reprocessados sozinhos.

### 4.3 `sent` não comprova entrega
O provider devolve só `{ success: boolean }` no `start-conversation`, sem id de
mensagem nem webhook de status. Não há como comprovar entrega com a API
documentada; renomear `sent → accepted` mexe em enum/constraint, worker, RPCs e
telas — fora do escopo de "menor mudança coerente". Recomendo tratar numa task
própria (modelo `accepted → delivered|failed` quando houver recibo).

### 4.4 Outros itens da revisão adversarial, não tratados
Rate limit por linha não atômico; corrida job `running` × resposta do lead;
edição em voo do template; observabilidade/alertas; anti-banimento. Sem mudança.

### 4.5 Menores
- O seletor "Linha/canal" do Outreach lista todos os canais (inclusive Telegram,
  Widget, Instagram); escolher um deles falha com `channel_type_unsupported`.
  Filtrar por tipo suportado é melhoria de UX simples, não feita aqui.
- Casa Flow tem duas portas com o mesmo nome "Meta ADS - Cadastro"
  (`dcf93cfc…` e `5a0349b1…`), indistinguíveis no Select. Dado do cliente.
- Duas sequências na Casa Flow (§1.4) — decisão do dono.

## 5. Deploy e verificação pós-deploy (para o orquestrador)

Ordem obrigatória:
1. migration `20260926000200_serev004_save_sequence_atomic.sql`
   (**antes** da `outreach`, senão `upsert-sequence` responde 500 por função
   inexistente);
2. funções: `outreach`, `send-chat-message`, `start-conversation`,
   `crm-webhook`, `outreach-worker`;
3. front (Netlify).

Verificação do Bug 2 em produção (envia WhatsApp real — combinar com o dono):
abrir no Chat a conversa do lead manual de teste, enviar uma mensagem, e
conferir
```sql
select created_at, status, error_code, channel_id, channel_type, provider_status
  from public.conversation_open_events
 where equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
 order by created_at desc limit 3;
```
Esperado: `opened`, `channel_type = 'Z_API'`, `provider_status = 200`. Se vier
`provider_rejected`, o corpo do provider fica em `provider_response`.

## 6. Validações rodadas

| Validação | Baseline (`main` @ 9041591) | Depois |
|---|---|---|
| `deno test -A --no-check supabase/functions/_shared/` | 193 passed / 0 failed | **196 passed / 0 failed** |
| `deno check` (outreach, send-chat-message, start-conversation, outreach-worker, crm-webhook) | — | OK |
| `deno lint` (outreach, _shared/outreach, testes tocados) | 5 problemas (testes) | 5 problemas (os mesmos) |
| SQL local `serev004_save_sequence.test.sql` | — | **PASS** |
| SQL local `serev001_start_conversation`, `serev002_opener_entry_filter` | PASS | PASS |
| SQL local `serev002_outreach` | **FAIL** T5 "SAIR normalizado" | FAIL igual — pré-existente, não inclui minha migration; provável causa o cluster local `SQL_ASCII`/`C`; não investigado |
| `tsc -b` | — | OK (exit 0) |
| `eslint src` | 0 errors / 52 warnings | 0 errors / 52 warnings |
| `NODE_ENV=test vitest run` | 4 arquivos falhando, 1 teste falhando (379/380) | 3 arquivos falhando, **382/382 testes** |
| `vite build` | OK | OK |
| Playwright no build real (Bug 1) | reproduz o bug | corrigido (§1.2) |

As 3 suítes vitest que ainda falham (`useForecast`, `usePipelines`,
`InlineCell`) falham ao **carregar**: exigem `VITE_SUPABASE_URL`/`ANON_KEY` no
ambiente de teste. Pré-existentes; não mexi.

Testes novos/alterados: `start-conversation.test.ts` (Z_API aceito, CLOUD_API
recusado, canais reais da Casa Flow, ambiguidade WHATSAPP+Z_API),
`manual-conversation.test.ts` (caminho manual com Z_API), `OutreachSettings.test.tsx`
(remontar abre a regra e salvar manda o id; tela vazia diz "Criar sequência" —
falha no componente antigo, passa no novo), `serev004_save_sequence.test.sql`.

## 7. Efeitos que deixei em produção (todos de teste, registrados)

- Sequências `[SE-REV-004 …]` criadas/editadas no time **Solo Energia**, todas
  inativas, **todas apagadas** no fim (0 restantes; nenhuma inscrição gerada).
- `conversation_opener_settings` da Solo Energia regravado com os **mesmos
  valores** (teste do "Salvar canal"); só `updated_at` mudou (2026-09-26 00:24:37).
- 2 sessões de login da conta `mateus@soloenergia.com.br` criadas por magic link
  administrativo (sem e-mail) e **revogadas** no fim.
- Leituras: SQL via Management API, logs de edge, `list-sequences` via segredo de
  webhook dos tenants (só leitura). Nenhum deploy, nenhuma migration aplicada,
  nenhum WhatsApp enviado, n8n não tocado.
