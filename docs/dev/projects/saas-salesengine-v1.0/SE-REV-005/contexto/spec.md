# SE-REV-005 — Task Contract

Project: saas-salesengine-v1.0
Agent: claude
Branch: task/SE-REV-005-outreach-ui-entries-opening-guard
Base: origin/main @ e4bb00a
Risk: medium (toca UI de Outreach + caminho de abertura de conversa em produção)
Origin: Discord #solo-dev 2026-09-26 (reporte do dono, 4 pontos)
Continues: SE-REV-001 (#44), SE-REV-002 (#45), SE-REV-003 (#46), SE-REV-004 (#47)

## Outcome

Fechar o ciclo do motor de Outreach para o dono conseguir OPERAR pela tela, e garantir
que o fluxo lead -> evento -> mensagem -> chat -> agente funcione sem mandar mensagem
de abertura para quem já está em atendimento.

## Pontos do dono (verbatim)

1. "Você fez uma mensagem inicial mas deixou configurada mas eu nao to vendo na ui?
   Precisa esta na UI para eu editar também deve ter uma forma de apagar alguém sequência."
2. "E na porta de entrada precisa ter somente os webhooks ou sources daquela equipe
   acredito que ta puxando do geral. Entao precisa ser somente os daquela equipe e
   também os que estão ativos se tiver alguma porta tipo webhook que foi apagado ou
   inativo nao deve aparecer"
3. "E também devemos garantir que o fluxo vai funcionar corretamente: O lead entrou ->
   disparou o evento -> enviou mensagem definida para o número definido, mensagem
   aparece também no chat e continua com atendimento do agente assim quando o cliente
   responder então agente entra em ação."
4. "Temos que ver um caso onde o cliente faz o cadastro mas tambem enviou mensagem nessa
   caso poderíamos fazer uma análise para saber se já está em atendimento se sim não
   manda mensagem de abertura."
5. "E para construir a mensagem seria interessante o usuário poder ver quais são as
   variáveis possíveis de colocar na mensagem. Tipo lead.name, etc."

## Evidência JÁ coletada pelo orquestrador (confirme, não redescubra)

### Ponto 1 — a mensagem inicial não tem UI nenhuma
`grep -rn 'first_message' src/` -> **zero resultados**. A `first_message` existe na tabela
`conversation_opener_settings`, é lida por `action=get-settings` e gravada por
`action=update-profile`, mas nenhuma tela a mostra ou edita. O dono está certo.
Também **não existe** nenhuma ação de apagar sequência: `grep -rn 'delete-sequence' src/ supabase/functions/outreach/`
-> zero. As ações de `outreach/index.ts` hoje são: `enroll`, `cancel`, `opt-out`,
`list-sequences`, `upsert-sequence`, `update-profile`, `get-trace`.

Estado real do perfil da Casa Flow (`equipe_id = aa33b576-3959-4a81-8e73-4027039ea2ce`):
```
enabled = true
first_message = 'Oi {{lead.first_name}}! Aqui é da {{tenant.name}}. Vi que você se cadastrou — posso te ajudar?'
channel_id = '3F32F1093C8681A460108E59734FC41E'  (Z_API, Casa Flow - WPP (API))
provider = 'gptmaker'
send_window 08:00-22:00, timezone America/Sao_Paulo, max_sends_per_line_hour = 30
trigger_entry_ids = ['5a0349b1-efd4-4d17-b9ab-4f8502ff8574']
```

### Ponto 2 — o palpite do dono está ERRADO; o problema é outro (corrija o diagnóstico)
`list-sequences` em `supabase/functions/outreach/index.ts` **já** filtra
`.eq("equipe_id", caller.equipeId)` e `.eq("active", true)`, com
`.in("kind", ["webhook","import","manual"])`. Provei chamando a função em produção com o
`x-webhook-secret` do tenant: ela devolveu exatamente 4 portas ativas daquela equipe.
O que **está** errado e explica o que o dono viu:

- A equipe Casa Flow tem **5** `crm_entries`, e a função devolve uma que é
  **webhook órfã**: `dcf93cfc-fe10-4570-804b-5e542ebde515` "Meta ADS - Cadastro",
  `kind=webhook`, `active=true`, mas `webhook_config_id = NULL`. Não existe
  `webhook_configs` correspondente -> a porta não recebe tráfego de verdade.
  Em `webhook_configs` a equipe tem só 2 configs (`ca544dfe` "Meta ADS - Cadastro" ativa,
  `6b1d64eb` "Notificação de novo lead - Whatsapp" ativa).
  A entry real que casa com config é `5a0349b1-efd4-4d17-b9ab-4f8502ff8574`.
- Existem **duas portas com o nome idêntico** "Meta ADS - Cadastro" (`dcf93cfc` órfã e
  `5a0349b1` real) — indistinguíveis no Select.
- `kind='agent'` ("Agente de IA") fica de fora, mas isso é decisão a justificar, não bug.

Decida e documente: (a) filtrar `kind='webhook'` por existência de `webhook_configs` ativa
da mesma equipe; (b) desambiguar nomes repetidos na UI; (c) o que fazer com a entry órfã —
o filtro é read-only, **não apague dado de cliente sem o dono mandar**.

### Ponto 5 — as variáveis que existem de verdade
`renderFirstMessage` em `supabase/functions/_shared/start-conversation.ts` (linhas 165-187)
suporta **exatamente quatro**: `lead.name`, `lead.first_name`, `lead.source`,
`tenant.name`. Chave desconhecida vira string vazia, silenciosamente — o dono não tem como
saber que errou. Não invente variáveis novas sem implementar o valor correspondente.

### Ponto 3/4 — o que o orquestrador já provou do fluxo (produção, 2026-09-26)
- Lead real entrou pela porta `5a0349b1` às 00:42:49Z -> `conversation_open_events`
  `9c2d4fb0` = `opened` / `channel_type=Z_API` / `provider_status=200` às 00:50:57Z.
- `conversations` `e64e7601`: `opened_at=00:50:57`, `opened_via=start_conversation`,
  `provider_channel_id=3F32F1093C8681A460108E59734FC41E`,
  `gpt_maker_chat_id=3F32F1093C8681A460108E59734FC41E-554999253901`.
- A mensagem ficou em `messages` com `sender_type='agent'`, `provider='gptmaker'`.
- **Ou seja: o opener grava `conversations.opened_at` no mesmo ato em que abre a conversa.**
  Esse é o sinal de "já existe atendimento" disponível. Use-o (ou um equivalente provado)
  para a guarda do ponto 4 — **não invente um estado novo se já existe sinal persistido**.
- Gap conhecido e NÃO resolvido: a sequência ativa "Novo Lead - Meta ADS (Cadastro)"
  aponta para a porta "Manual" (`7e6576a0`), não para `5a0349b1`. Decisão do dono —
  **não mude silenciosamente**; reporte.

## Escopo (o que fazer)

1. **UI: editar a mensagem inicial** — a tela de Outreach precisa mostrar e salvar
   `first_message` do perfil do tenant (já existe `update-profile`), com preview do
   resultado renderizado usando um lead de exemplo.
2. **UI: apagar sequência** — nova ação na edge function + botão na tela, com confirmação.
   Ação destrutiva: exige confirmação explícita do usuário na UI, e a função precisa
   recusar sequência de outro time. Decida e documente o que acontece com inscrições e
   jobs pendentes dessa sequência (cancele-os de forma coerente e idempotente).
3. **UI: portas corretas** — só portas da equipe, ativas e que existam de fato (ver ponto 2),
   com nomes desambiguados quando repetidos.
4. **UI: variáveis disponíveis** — mostrar a lista real (`lead.name`, `lead.first_name`,
   `lead.source`, `tenant.name`) nos dois lugares onde se escreve mensagem: a mensagem
   inicial do perfil e o `message_template` dos passos da sequência. Melhor ainda: avisar
   quando o texto usa uma variável que não existe (hoje falha em silêncio).
5. **Guarda de abertura (ponto 4)** — antes de abrir conversa/mandar a mensagem inicial,
   checar se o lead já está em atendimento; se estiver, não abrir e registrar o motivo no
   ledger (`conversation_open_events.error_code`). Precisa cobrir o caso do dono: lead que
   se cadastra **e** já mandou mensagem. Idempotência atual (`UNIQUE (equipe_id, event_key)`)
   deve continuar valendo.
6. **Fluxo ponta a ponta** — garantir e PROVAR que: lead entra -> evento dispara -> mensagem
   definida vai para o número definido -> aparece no chat -> o atendimento do agente continua
   quando o cliente responde.

## Verificação obrigatória (não negociável)

`typecheck`/`lint`/`build` não provam nada disto.

1. **UI real:** rode o build de verdade com Playwright (o caminho já foi usado na SE-REV-004;
   há scripts em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-004/claude/evidencias/scripts/`)
   e capture: editar a mensagem inicial, apagar uma sequência, e a lista de portas.
   Screenshot + o estado no banco antes/depois.
2. **Guarda:** prove com dados reais que um lead já em atendimento NÃO abre conversa nova,
   e que um lead novo abre. Mostre as linhas de `conversation_open_events` antes/depois.
3. **Variáveis:** teste que a variável inválida é sinalizada (ou documente por que não dá).
4. Salve tudo em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-005/claude/evidencias/`.
5. Se algo não puder ser provado no sandbox, diga explicitamente o quê e por quê.

## Restrições

- Não editar `main` diretamente, não fazer commit/push/PR/deploy (o orquestrador faz).
- Não apagar dado real de cliente (nem `crm_entries`, nem sequências de produção).
  Testes que escrevem em produção: use tenant/conta de teste, sequências inativas com
  prefixo `[SE-REV-005 …]`, e **limpe no fim** como na SE-REV-004. Registre o que tocou.
- Não tocar no workflow n8n do dono (é contexto, não alvo).
- Sem migrations sem justificativa mínima.
- Não mudar comportamento de outros tenants.
- Artifacts em português do Brasil.

## Ambiente (verificado pelo orquestrador)

- `deno` em `/usr/local/bin/deno`: `deno check <file>`, `deno test -A --no-check <paths>`.
- `NODE_ENV=production` no host faz `npm ci` omitir devDependencies: use
  `NODE_ENV=development npm ci --include=dev` e invoque `./node_modules/.bin/tsc -b` e
  `./node_modules/.bin/vitest run` (suites `.tsx` precisam de `NODE_ENV=test`). Não use `npx`.
- Projeto Supabase: `egxzsivzqlqadoqpgfby`. As functions JÁ estão deployadas e o cron
  `outreach-tick` está ATIVO em produção (roda a cada minuto) — cuidado com efeitos reais.
- Management API para leitura: `SUPABASE_ACCESS_TOKEN` em `/data/.openclaw/.env`;
  `POST https://api.supabase.com/v1/projects/egxzsivzqlqadoqpgfby/database/query`.
- Smoke autenticado sem segredo novo: `x-webhook-secret` = `equipes.webhook_secret` do tenant.

## Acceptance

- [ ] A mensagem inicial é editável na UI e persiste (prova: banco antes/depois + screenshot).
- [ ] Existe forma de apagar sequência, com confirmação, escopo de time e tratamento de
      inscrições/jobs documentado.
- [ ] O Select de portas lista só portas da equipe, ativas e existentes; homônimas
      desambiguadas; a órfã `dcf93cfc` não aparece (ou o motivo de aparecer está justificado).
- [ ] As variáveis disponíveis aparecem na UI nos dois lugares onde se escreve mensagem.
- [ ] Lead já em atendimento NÃO recebe mensagem de abertura; lead novo recebe (prova real).
- [ ] Fluxo ponta a ponta verificado com evidência (mensagem no chat + agente segue atuando).
- [ ] `deno check`/`deno test`, `tsc -b`, `eslint`, `vitest`, `vite build` — baseline
      registrado sem mascarar.
- [ ] Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-005/claude/` +
      `README.md` da task com header `Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências`.

## Do not touch

- Production secrets
- Main branch directly
- O workflow n8n do dono (contexto, não alvo)
- Dados reais de cliente (só leitura)
- Infraestrutura destrutiva
