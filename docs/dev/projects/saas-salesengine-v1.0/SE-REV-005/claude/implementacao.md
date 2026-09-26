# SE-REV-005 — Implementação (Claude)

Branch `task/SE-REV-005-outreach-ui-entries-opening-guard` · base `e4bb00a` · 2026-09-26.
Sem commit, push, PR, deploy ou migration (o orquestrador é dono disso).

## 1. Crítica inicial do spec — veredito

Conferi cada afirmação do spec com consulta própria em produção antes de escrever código.

### Aceito (confirmado)

- **Ponto 1:** `grep -rn first_message src/` = 0; não existia ação de apagar sequência.
- **Ponto 2, palpite do dono errado:** `list-sequences` já filtrava por `equipe_id` e `active`.
  A causa real é a porta **órfã**: `crm_entries.webhook_config_id` é FK `on delete set null`,
  então apagar o webhook deixa a porta viva, ativa e com o mesmo nome. Só que o `crm-webhook`
  encontra a porta por `webhook_config_id` (`entryForWebhook`), então **nenhum lead chega mais por
  ela**. `lead_touches` confirma: zero toques em `dcf93cfc` e `10a34b8d`, e 94 em `5a0349b1`.
- **Ponto 5:** `renderFirstMessage` resolve exatamente 4 variáveis; qualquer chave desconhecida
  vira `""` sem avisar ninguém.

### Corrijo (o spec estava incompleto ou errado)

1. **São DUAS portas órfãs na Casa Flow, não uma.** Além de `dcf93cfc` "Meta ADS - Cadastro",
   a `10a34b8d` "Landing Page - Lead Land" também tem `webhook_config_id = NULL`. No banco
   inteiro existem só essas duas órfãs do tipo webhook, e as duas são da Casa Flow
   (`evidencias/portas/casa-flow-antes-depois.json`).
2. **`update-profile` não grava `first_message`.** O `validateProfileInput` não tem esse campo,
   então o upsert o ignora. Quem grava `first_message`, `enabled` e `trigger_entry_ids` é o
   `start-conversation?action=update-settings`, e é por ele que a tela salva agora.
3. **REJEITO `conversations.opened_at` como sinal de "em atendimento".** O próprio evento que o
   spec usa como prova (`9c2d4fb0`) **é o caso do dono** e mostra que esse sinal falha:
   - A lead "Vale" mandou mensagem às 00:42:46.
   - Conversou com o agente até 00:44:41 ("Até logo, Vale!").
   - O cadastro chegou às 00:50:54.
   - Às 00:50:57 o Rev mandou "Vi que você se cadastrou — posso te ajudar?".

   Nesse momento `opened_at` era **nulo**, porque a conversa tinha sido criada pela mensagem de
   entrada e `opened_at` só é gravado quando o Rev abre a conversa. Com a lead "Ineida"
   (`33bf42b1`) aconteceu o mesmo, com o agente respondendo no mesmo segundo. Um segundo envio
   de abertura feito pelo próprio Rev já é barrado pela chave `lead:<id>`, então `opened_at` não
   acrescentaria nada. Uso outro sinal que **já está gravado**: `messages.sender_type='customer'`
   do lead nas últimas 24 h. Não criei estado novo nem migration.
   (`evidencias/guarda/caso-do-dono-timeline-*.json`)
4. **O caso do dono não é exceção, é a maioria.** Apliquei a regra nova, só lendo o banco, a
   todos os eventos reais da Casa Flow. Dos 7 eventos automáticos (`lead_intake`), **4** foram
   para leads que já estavam conversando. O formulário da Meta abre o WhatsApp com "Olá!
   Preenchi seu formulário…" antes de o cadastro chegar
   (`evidencias/guarda/replay-casa-flow-eventos-reais.json`).

### Hipóteses sem prova

- **Corrida de segundos:** o lead manda a mensagem e se cadastra quase ao mesmo tempo, e a
  mensagem ainda não foi gravada quando a guarda consulta. Nos casos reais o intervalo foi de
  4 a 12 s e a mensagem já estava gravada. Não provei que a janela de corrida é zero.
- **Janela de 24 h:** é a janela de atendimento do WhatsApp. É decisão de produto e o dono
  precisa confirmar. Hoje é a constante `IN_SERVICE_WINDOW_HOURS`.

## 2. Causa raiz por ponto

| Ponto | Causa raiz |
|---|---|
| 1. mensagem inicial invisível | A configuração existia só no banco e em `start-conversation/update-settings`. Nenhuma tela lia ou escrevia `first_message`, `enabled` ou `trigger_entry_ids`. |
| 1b. apagar sequência | A ação nunca foi implementada. |
| 2. portas erradas | Não era falta de filtro de equipe. Uma porta de webhook cujo webhook foi apagado continua `active=true` (FK `set null`). Com duas portas de mesmo nome, o Select ficava ambíguo. |
| 3. fluxo | Funciona até "mensagem no chat" (prova em §5.4). O trecho "cliente responde → agente" depende de um cliente real responder. |
| 4. já em atendimento | A abertura não consultava o histórico de mensagens do lead. |
| 5. variáveis | A lista não aparecia em lugar nenhum da tela, e o renderizador troca chave desconhecida por `""`. |

## 3. O que mudou

### Backend (edge functions, sem migration)

- `supabase/functions/_shared/outreach/template.ts` **(novo)**
  - `MESSAGE_VARIABLES` traz as 4 variáveis reais.
  - `templateProblems`/`templateError` apontam variável inexistente e chaves mal fechadas:
    `{{x}`, `{x.y}`, `{{a b}}`, `x}}`.
- `supabase/functions/_shared/outreach/entries.ts` **(novo)** — `classifyEntries`: a porta
  aparece só se for do time, estiver ativa e for de tipo `webhook`/`import`/`manual`. Se for
  webhook, precisa de `webhook_configs` existente, ativa e do mesmo time. As demais voltam em
  `hidden_entries` com o motivo. O rótulo é `nome (Tipo)`, com o começo do id quando o nome se
  repete. Tudo aqui é **somente leitura**: nenhuma porta é apagada ou desativada.
- `supabase/functions/_shared/outreach/in-service.ts` **(novo)** — `checkLeadInService` lê a
  última mensagem `customer` do lead pelo índice `idx_messages_lead_created`. Se a leitura
  falhar, trata o lead como em atendimento e **não envia**.
- `supabase/functions/start-conversation/index.ts`
  - **Guarda:** depois do `claimEvent`, um lead em atendimento fica com `status='skipped'`,
    `error_code='already_in_service'` e a última mensagem registrada em `error_message`, e a
    abertura não é enviada. A idempotência `UNIQUE (equipe_id, event_key)` continua valendo.
    Como `skipped` é reassumível, um cadastro futuro, fora da janela, ainda abre. `force: true`
    é a exceção explícita.
  - `update-settings` recusa `first_message` com variável inválida (400 `invalid_template`) e
    porta inelegível quando a abertura não está sendo desligada.
- `supabase/functions/_shared/outreach/worker.ts` e `supabase/functions/outreach-worker/index.ts`
  - A mesma guarda vale no **passo 0** da cadência. O job é fechado como `skipped` com
    `already_in_service`, e a inscrição é cancelada com o motivo `lead_replied`, que já existia.
    Sem a mensagem de abertura, os follow-ups não fazem sentido.
  - Se a checagem falhar, o job é adiado 5 min.
  - Os passos seguintes continuam com o `stop_on_reply` de sempre.
- `supabase/functions/outreach/index.ts`
  - `list-sequences` devolve `entries` (filtradas e com rótulo), `hidden_entries` e
    `tenant_name`.
  - `upsert-sequence` recusa variável inválida nos passos e recusa sequência **ativa** em porta
    inelegível. Salvar a sequência desligada continua permitido.
  - **`delete-sequence` (novo):** exige usuário autenticado e escopo de time (id de outro time
    recebe 404). O que acontece com inscrições e jobs, em ordem:
    1. Desliga a sequência. O gatilho existente cancela as inscrições ativas e os jobs na fila,
       com o motivo `sequence_disabled`.
    2. Cancela o que ainda estiver ativo, o que cobre sequência que já estava desligada.
    3. Responde **409** se algum job estiver `running` (envio em curso). A sequência fica
       desligada e o usuário tenta de novo.
    4. Apaga. As FKs `on delete cascade` levam passos, inscrições e jobs.

    Cada etapa é idempotente, então uma parada no meio deixa um estado coerente e repetir a
    chamada termina o serviço. As mensagens já enviadas **ficam** no chat (`messages`) e na
    timeline (`lead_activities`). **Custo assumido:** o registro de envio (`outreach_jobs`)
    daquela sequência some. Por isso o `crm_outreach_line_usage` pode contar a menos por até
    1 h. Escolhi o delete de verdade, que já é o comportamento declarado pelas FKs, em vez de
    soft-delete, que exigiria migration e deploy de schema.

### Frontend

- `src/components/outreach/MessageTemplateField.tsx` **(novo)** — campo de texto com as 4
  variáveis como botões (o clique insere no cursor), erro por variável inválida e preview com um
  lead de exemplo ("Maria Souza", origem "Meta Ads", nome real do tenant).
- `src/lib/message-variables.ts` **(novo)** — espelho da lista e do render. Um teste lê o
  `template.ts` do servidor e falha se as duas listas divergirem.
- `src/pages/OutreachSettings.tsx`
  - Card novo **"Mensagem de abertura"**: ligado/desligado, portas que disparam (com aviso de
    porta indisponível), texto com variáveis e preview, e a regra dos 24 h explicada. Avisa
    quando uma sequência ativa usa a mesma porta, porque nesse caso a cadência envia no lugar
    da mensagem de abertura.
  - Os passos da sequência usam o mesmo campo de variáveis. Salvar fica bloqueado enquanto
    houver variável inválida.
  - Select de portas com rótulo desambiguado, item "Porta indisponível" quando a porta salva
    saiu da lista, e a nota "Fora da lista por não receberem lead: …".
  - Botão **Apagar** com `AlertDialog`: mostra quantos leads têm envio pendente e diz que as
    mensagens já enviadas continuam no chat e que não dá para desfazer.
  - Erros das functions mostram a mensagem do servidor, em vez do genérico "non-2xx".

### Testes

- **Deno:**
  - `template.test.ts`, `entries.test.ts` (espelha a Casa Flow real) e `in-service.test.ts`
    são novos.
  - `worker.test.ts` ganhou 4 casos da guarda e `api-validation.test.ts` 1 caso de variável.
- **Vitest:**
  - `message-variables.test.ts` é novo: sincronia com o servidor, problemas e preview.
  - `OutreachSettings.test.tsx` ganhou 5 casos: abertura editável, variável inválida bloqueia
    (abertura e passo), variáveis nos dois lugares com clique inserindo, portas e órfã, e apagar
    com confirmação.

## 4. Verificação real (produção, sem deploy)

**Como:** `vite build` real, servido por `vite preview`, com a sessão real de
`mateus@soloenergia.com.br` (time **Solo Energia**, o de teste; link mágico gerado pelo admin,
nenhum e-mail enviado). O Playwright desvia `/functions/v1/outreach` e
`/functions/v1/start-conversation` para o **código novo** rodando em `deno` local contra o banco
de produção, **sem `GPT_MAKER_TOKEN`**, então nada pode ser enviado a provider. Em
`list-sequences`, só os canais do provedor vêm da função deployada. Scripts em
`evidencias/scripts/`.

### 4.1 Mensagem de abertura editável (`evidencias/ui/`, `log.json`)

- A tela mostra o texto salvo e o preview "Oi Maria! Aqui é da Solo Energia. Vi que você se
  cadastrou — posso te ajudar?" (`01`).
- Com `{{lead.nome}}`, a tela avisa "{{lead.nome}} não existe — sairia em branco para o
  cliente." e o botão fica desabilitado (`02`).
- Na edição, o clique em `{{lead.first_name}}` inseriu a variável no cursor. Salvar gravou no
  banco: `first_message` passou de "Oi …" para "Olá …" e `updated_at` mudou (`03`, log
  "persistiu o texto editado? true").
- Depois do reload, a tela mostra o texto do banco.
- **Restaurado pela tela ao original** (log "restaurado igual ao original? true").

### 4.2 Apagar sequência (`evidencias/ui/04`–`07`, `log.json`)

- **Preparação:** criei a sequência **inativa** "[SE-REV-005] apagar pela tela", com passos para
  +1 dia e +2 dias. Ela tem 1 inscrição ativa e 2 jobs `queued`, de um lead real do time de
  teste. Os jobs só venceriam amanhã, então havia duas travas contra envio.
- **Escopo de time:** `delete-sequence` com o id da sequência "Novo Lead" da **Casa Flow**
  devolveu **404**, e a sequência continua no banco.
- **Diálogo** (`06`): "1 lead(s) ainda têm mensagens desta sequência para receber. Esses envios
  são cancelados…".
- **Resposta:** `{"deleted":true,"enrollments_removed":1,"enrollments_cancelled":1,
  "jobs_removed":{"cancelled":2}}`. Os jobs foram cancelados antes do delete. Depois, o banco
  tem 0 sequências, 0 inscrições e 0 jobs de teste.
- **Idempotência:** a segunda chamada devolve 404 e não muda nada.
- A primeira execução do script parou antes do navegador (outra sessão ocupava a porta 4173).
  A sequência criada nela foi apagada pela mesma ação (`ui/00-limpeza-tentativa-anterior.txt`).

### 4.3 Portas (`evidencias/portas/`)

- **Casa Flow:** a função deployada devolve 4 portas, com as duas órfãs e as duas "Meta ADS -
  Cadastro". O código novo devolve **Manual (Manual)** e **Meta ADS - Cadastro (Webhook)**
  (`5a0349b1`), e em `hidden_entries` as duas órfãs com o motivo `webhook_deleted`.
- **Captura da tela com os dados da Casa Flow:** somente leitura. O script recusa qualquer
  chamada que não seja `list-sequences`, e nenhuma foi feita (`casa-flow-*.png`,
  `casa-flow-tela.json`).
- **Solo Energia:** as 3 portas continuam, porque nenhuma é órfã. A tela da Solo Energia lista
  as 3 (`ui/05-select-de-portas.png`).

### 4.4 Variáveis no servidor (`evidencias/variaveis/`)

- `update-settings` com `{{lead.nome}}` devolveu 400 `invalid_template`, e com `{lead.first_name}`
  também 400.
- `upsert-sequence` com `{{cliente.nome}}` devolveu 400.
- O banco ficou idêntico antes e depois (`nada_mudou: true`).

### 4.5 Guarda com leads reais (`evidencias/guarda/guarda-leads-reais.json`)

Leads existentes do time de teste, com `event_key` explícito `SE-REV-005-…` (apagado no fim).

| Lead | Última mensagem dele | Resultado | Linha em `conversation_open_events` |
|---|---|---|---|
| `896321ee` (conversando) | 25/09 19:52 (~6 h antes) | 200 `skipped/already_in_service` | `skipped`, `error_code=already_in_service` |
| mesma chamada repetida | — | igual | **1 linha**, `attempts=2` (UNIQUE mantido) |
| `3c06f9cc` (sem mensagem em 24 h; a última foi há ~26 h) | 24/09 23:45 | **passa a guarda**; para em `engine_token_missing` (não há token local) | `failed/engine_token_missing` |

Nas duas conversas, antes e depois, não houve mensagem nova nem mudança em `opened_at`. As
linhas de teste foram apagadas, e o estado "após limpeza" é igual ao "antes".

O caso "lead novo **abre de verdade**" está provado na produção atual com leads sem mensagem
anterior: `d1fdb4ef` e `fcbda052`. A guarda nova deixaria esses dois abrirem (coluna
"abre" no replay).

## 5. Fluxo ponta a ponta (ponto 3)

Lead real da Casa Flow `746745c5`, evento `fcbda052`, sem mensagem anterior
(`evidencias/fluxo/`):

1. `01:30:56` — toque na porta `5a0349b1` (Meta ADS - Cadastro).
2. `01:30:59` — `conversation_open_events` = `opened`, canal `Z_API`, HTTP 200, para o telefone
   do cadastro.
3. `01:31:00` — a mensagem definida ("Oi mendesregina! Aqui é da Casa Flow. Vi que você se
   cadastrou…") é gravada em `messages` (`agent/gptmaker`) na conversa `683e1045`, que
   **aparece no chat**.
4. A conversa fica com `gpt_maker_chat_id = <canal>-<telefone>`, **o mesmo formato** das
   conversas iniciadas pelo cliente no mesmo canal, em que o agente responde em segundos (Vale,
   Ineida). Então a resposta do cliente cai nessa conversa.

**Não provado — "cliente responde → agente age":** até 01:45Z nenhum dos leads que o Rev abriu
tinha respondido. Não dá para simular sem alguém mandar WhatsApp de um número real para a linha
da Casa Flow. O indício é forte (mesmo canal, mesmo chat, agente ativo nesse canal), mas não é
prova. Para o dono verificar, depois de o próprio celular dele se cadastrar pelo formulário e
responder:

```sql
select e.created_at, m.sender_type, m.created_at, left(m.content,80)
from conversation_open_events e join messages m on m.lead_id = e.lead_id and m.created_at > e.created_at
where e.equipe_id='aa33b576-3959-4a81-8e73-4027039ea2ce' and e.status='opened' order by m.created_at;
```

O esperado é um `customer` seguido de um `agent` segundos depois. Uma configuração do dono pode
afetar esse trecho: o agente precisa estar **ativo no canal** `3F32F1093C8681A460108E59734FC41E`
no provedor. Hoje está, porque responde às conversas de entrada.

## 6. Validações

| Comando | Resultado |
|---|---|
| `deno check` (outreach, outreach-worker, start-conversation, `_shared/outreach/*`) | OK |
| `deno test -A --no-check supabase/functions/_shared/` | **213 passed, 0 failed** |
| `deno fmt` nos arquivos tocados | aplicado (os originais já seguiam `deno fmt`) |
| `deno lint` nos arquivos tocados | 2 erros `no-import-prefix` **pré-existentes** (`start-conversation/index.ts` linhas 30/34, imports não tocados) |
| `tsc -b` | OK |
| `eslint .` | 0 erros, 85 warnings (pré-existentes; o warning novo foi corrigido) |
| `NODE_ENV=test vitest run` | **390/390 testes**; 3 arquivos falham ao **carregar** (`useForecast`, `usePipelines`, `InlineCell`, exigem `VITE_SUPABASE_*`), igual à baseline da SE-REV-004 |
| `vite build` | OK |
| SQL local | não se aplica: nenhuma migration |

## 7. O que toquei em produção (tudo limpo)

- `conversation_opener_settings` da **Solo Energia**: `first_message` editada pela tela e
  **restaurada** pela tela ao texto original. `enabled` e `trigger_entry_ids` não mudaram. Só
  `updated_at` ficou diferente.
- `cadence_sequences`: duas sequências **inativas** "[SE-REV-005] apagar pela tela" na Solo
  Energia, com inscrição via `_outreach_enroll` e jobs para +1 e +2 dias. As duas foram
  **apagadas** pela ação nova, junto com inscrições e jobs (cascade), e nenhuma mensagem saiu.
- `conversation_open_events`: 2 linhas `SE-REV-005-guarda-*` (Solo Energia), **apagadas**.
- Casa Flow: **somente leitura**, inclusive a captura de tela. O único pedido que tocou dados
  dela foi o `delete-sequence` de outro time, recusado com 404 antes de qualquer escrita.
- Verificação final (`evidencias/verificacao-limpeza.json`): 0 sequências, 0 eventos e 0
  inscrições de teste; mensagem da Solo Energia igual à original.
- Nada de deploy, migration, n8n, `crm_entries` ou segredo.

## 8. Pendências

1. **Deploy** (orquestrador) de `outreach`, `start-conversation`, `outreach-worker` e do front.
   Sem ele, a produção continua mandando abertura para quem já está conversando: **4 de 7**
   casos reais até agora.
2. **Portas órfãs da Casa Flow** (`dcf93cfc` "Meta ADS - Cadastro" e `10a34b8d` "Landing Page -
   Lead Land"): agora estão escondidas e explicadas na tela, mas **continuam no banco**. O dono
   decide se desativa ou apaga.
3. **Sequência "Novo Lead - Meta ADS (Cadastro)"** (ativa) aponta para a porta **Manual**
   (`7e6576a0`), não para a real (`5a0349b1`). Não mexi. Se o dono trocar para `5a0349b1`, a
   cadência passa a enviar **no lugar** da mensagem de abertura, e a tela avisa.
4. **"Cliente responde → agente"**: não provado (§5). Precisa de uma resposta real.
5. **Janela de 24 h**: o dono confirma ou ajusta.
6. **Guarda no worker de cadência**: provada só por testes unitários. Rodar o worker local
   reivindicaria a fila **global** de produção.
7. **409 de `delete-sequence`** com job `running`: coberto pelo código, não exercitado ao vivo.
8. **Observação da Solo Energia:** a abertura está ligada (`enabled=true`, porta `5c8aca32`)
   com `channel_id` nulo ("escolher automaticamente"). Não mexi.
