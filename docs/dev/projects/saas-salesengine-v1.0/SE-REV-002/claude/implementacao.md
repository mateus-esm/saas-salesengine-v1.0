# SE-REV-002 — Implementação

Data: 2026-09-25  
Branch: `feat/rev-crm-chat-cadence`  
Base empilhada: SE-REV-001, commit `b8f16bb`, PR #44

## 1. Resultado entregue

A entrega implementa um motor multi-tenant de outreach que transforma uma
entrada de CRM ou mudança de etapa em uma sequência cancelável de mensagens. A
fila, a idempotência, os cancelamentos e a recuperação de jobs abandonados
ficam no PostgreSQL. Um worker resolve o provider configurado pelo tenant e
envia exclusivamente por GPT Maker não oficial ou Solo API, sem fallback entre
providers.

Também foram entregues:

- correções da Fase 0 para `success:false` e filtro por porta de entrada;
- envio manual para lead sem conversa ativa, abrindo conversa pelo GPT Maker ou
  pela Solo API e persistindo a conversa;
- API autenticada `outreach` para configuração, inscrição, cancelamento,
  opt-out e consulta do rastro;
- tela mínima em `/outreach` para escolher porta, provider/linha, janela,
  limite e mensagens, além de ligar/desligar a sequência;
- script inerte para o cron; nada agenda ou dispara até um operador configurar
  os segredos, aplicar o script e ativar uma sequência;
- documentação operacional e review adversarial independente.

O `cadence-check` não foi alterado nem é usado pelo motor novo. Nenhum workflow
do n8n foi alterado.

## 2. Arquitetura implementada

Fluxo de entrada automático:

```text
crm-webhook → crm_record_touch → lead_touches
                              → trigger SQL → enrollment + jobs únicos
pg_cron → _outreach_tick → outreach-worker
                           → resolve linha → aplica freios → provider
                           → conversa + mensagem + atividade + rastro do job
resposta/SAIR/mudança de etapa/fechamento → triggers SQL → cancelamento
```

As garantias centrais estão no banco:

- `UNIQUE (sequence_id, enrollment_key)` evita reinscrição do mesmo evento;
- índice único parcial impede duas inscrições ativas do mesmo lead na mesma
  sequência;
- `UNIQUE (enrollment_id, step_position)` impede dois jobs para o mesmo passo;
- `FOR UPDATE SKIP LOCKED` impede dois workers de reivindicarem o mesmo job;
- job `running` abandonado vira `unknown` e nunca é reenfileirado;
- o claim revalida resposta, opt-out, lead apagado, sequência desligada e
  inscrição cancelada antes de liberar um envio.

Tabelas novas: `cadence_sequences`, `cadence_steps`,
`cadence_enrollments`, `outreach_jobs` e `contact_opt_outs`.

## 3. Passos e commits

| Passo | Commit | Entrega |
| --- | --- | --- |
| 1 | `bad1824` | `200 {success:false}` passa a ser recusa do provider |
| 2 | `7b7e492` | abertura automática filtrada pela porta e pelo source do evento |
| 3 | `6eb28a5` | migration, teste SQL e runner PostgreSQL 15 local |
| 2b | `e0e2762` | envio manual sem chat pelo provider configurado |
| 4 | `3aeb59f` | janela, opt-out e classificação de entrega em funções puras |
| 5 | `a374277` | adaptadores GPT Maker/Solo e router sem fallback |
| 6 | `8950edf` | autenticação multi-tenant compartilhada |
| 7 | `78c29d6` | worker, persistência e freios |
| 8 | `0c91752` | API `outreach` |
| 8b | `ded9a52` | tela mínima de configuração |
| 9 | `5515b92` | convivência do legado com o motor por propriedade da porta |
| 10 | `001a79a` | script inerte do agendamento |
| correção da auditoria | `668b557` | conversa manual reativada/criada, compatibilidade Solo e Fase 0 |

O commit do passo 11 contém estes artefatos. O passo 12 registra a rodada final
de validação em commit próprio.

## 4. Decisões do dono refletidas

| Decisão | Implementação |
| --- | --- |
| D1 | nenhum workflow n8n foi escrito ou alterado; mudar o Schedule Trigger está marcado como **não aplicar nesta entrega** |
| D2 | o n8n continua chamando `crm-webhook`; o motor nativo é aditivo e não substitui o Lead Engine em big-bang |
| D3 | regra `lead_intake` por `crm_entries.id`, canal e texto são configurados dentro do Rev |
| D4 | router explícito GPT Maker/Solo; sem fallback; Cloud API/template fica fora de escopo |
| D5 | idempotência, janela, limite, opt-out e cancelamento foram implementados; a confirmação de entrega real ainda é bloqueio do go-live, conforme §8 |
| D6 | tela mínima `/outreach`, sem lógica de disparo no frontend |
| D7 | `send-chat-message` abre conversa quando não há chat; o ramo com `chat_id` continua no caminho legado `start-human` + `send-message` |

## 5. Comportamentos deliberados

- Sequências nascem desligadas e `trigger_entry_ids = {}` não dispara nenhuma
  porta.
- O provider vem de `conversation_opener_settings.provider`. Sem o schema/perfil
  novo, o envio manual mantém compatibilidade: uma única Solo conectada é usada;
  sem Solo, tenta GPT Maker. Isso permite publicar o passo 2b junto da Fase 0.
- Não existe fallback GPT Maker → Solo ou Solo → GPT Maker no motor de cadência.
- A janela não pode cruzar meia-noite. Offsets contam desde o começo da
  inscrição, e não desde o passo anterior.
- Opt-out compara a mensagem inteira normalizada; não usa `contains`.
- `sent` no banco representa aceitação síncrona classificada pelo adaptador.
  Não representa recibo assíncrono do WhatsApp; ver bloqueio D5 em §8.
- O caminho Solo encaminha resposta nova ao `analyze-message` somente quando
  `equipes.is_crm_agent_enabled` está ativo, comportamento já existente em
  `solo-wpp-webhook`.

## 6. Validações executadas durante a implementação

Resultados intermediários reais:

- migration do motor em PostgreSQL 15 local efêmero: T1–T12 e `PASS`;
- 25 testes originais da SE-REV-001: preservados sem edição e aprovados;
- conjunto focado dos adaptadores/SE-REV-001: 49 aprovados;
- testes do `start-conversation` após a convivência: 36/36 aprovados;
- teste do envio manual sem chat: 4/4 aprovados;
- teste da configuração do frontend: 3/3 aprovados;
- `deno check` nos arquivos tocados executados durante cada passo: aprovados;
- `npx tsc -b --pretty false`: aprovado após a tela mínima;
- `npm run build`: aprovado após a tela mínima;
- lint dos arquivos da UI tocados: aprovado.

A tabela completa com comandos e resultados da rodada final é atualizada no
passo 12. Baselines pré-existentes que não podem ser mascarados:

- `supabase/functions/cadence-check/index.ts:110` — TS2352;
- `src/hooks/useOnboarding.ts:192`;
- `src/pages/Chat.tsx:378`.

### NÃO EXECUTADO

- chamada real ao GPT Maker e à Whatsmiau: sem token/autorização para tráfego;
- `scripts/sqltest.sh`: aponta para produção e foi expressamente proibido;
- migration, pg_cron, pg_net e Vault reais em produção;
- deploy, push, merge, criação de PR e agendamento do cron;
- alteração ou leitura ao vivo do n8n;
- confirmação de recibo real no aparelho;
- concorrência real de dois workers contra produção.

## 7. Plano completo de deploy — preparar, não executar

### 7.1 Pré-condições e ordem de merge

1. Revisar e mergear primeiro a SE-REV-001, PR #44, porque esta branch está
   empilhada sobre `b8f16bb` e depende da migration/função
   `start-conversation` daquela entrega.
2. Atualizar/rebasear a SE-REV-002 sobre a main que já contém a PR #44 e rodar
   novamente a validação final.
3. Resolver os bloqueios do §8. O código pode ser publicado inerte, mas nenhuma
   sequência deve ser ativada antes deles.
4. Mergear a PR da SE-REV-002.

### 7.2 Comandos de pré-voo

```bash
git fetch origin
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
supabase migration list
supabase functions list
```

Confirmar fora do código, para o tenant piloto, o tipo real retornado pela API
do provider. Um canal `CLOUD_API` não é suportado nesta entrega.

### 7.3 Banco

A ordem das migrations é:

1. `20260925000100_serev001_start_conversation.sql` — vem da PR #44;
2. `20260926000050_serev002_opener_entry_filter.sql`;
3. `20260926000100_serev002_outreach.sql`.

Depois do merge da base e da revisão do diff do banco:

```bash
supabase db push --dry-run
supabase db push
supabase migration list
```

Não executar `scripts/sqltest.sh` como parte automática deste handoff. Quando o
operador tiver autorização explícita para a produção, ele pode executar o teste
transacional separadamente.

### 7.4 Segredos e Edge Functions

Pré-requisitos de runtime: `GPT_MAKER_TOKEN` já usado pelas funções existentes e
um novo `OUTREACH_WORKER_SECRET`, gerado fora do repositório.

```bash
# OUTREACH_WORKER_SECRET deve existir apenas no ambiente seguro do operador.
supabase secrets set OUTREACH_WORKER_SECRET="$OUTREACH_WORKER_SECRET"

supabase functions deploy start-conversation
supabase functions deploy crm-webhook
supabase functions deploy send-chat-message
supabase functions deploy outreach
supabase functions deploy outreach-worker
```

`outreach` e `outreach-worker` têm `verify_jwt = false` porque fazem autenticação
própria; isso não as torna públicas sem controle: `outreach` usa
`resolveCaller`, e o worker exige `x-outreach-secret`.

Publicar o frontend pelo pipeline normal do app somente depois de as funções
`outreach` e a migration existirem. A rota nova é `/outreach`.

### 7.5 Vault e cron

Criar no Vault, pelo canal administrativo aprovado, os segredos
`outreach_worker_url` e `outreach_worker_secret`. O primeiro é a URL pública da
função; o segundo deve ter exatamente o mesmo valor de
`OUTREACH_WORKER_SECRET`. Nenhum valor deve ir para arquivo versionado.

Com a fila vazia, validar antes de agendar:

```sql
select public._outreach_tick(); -- esperado: null
```

Somente após o smoke dos providers e com sequências ainda desligadas:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/scripts/2026-09-26_serev002_schedule_outreach_tick.sql
```

### 7.6 Smoke em produção

Usar um tenant/aparelho interno e mensagens inequívocas de teste.

1. Com todas as sequências desligadas, chamar `list-sequences` e confirmar
   isolamento do tenant, portas e linhas.
2. Enviar manualmente para um lead sem conversa via GPT Maker; confirmar uma
   única mensagem no aparelho, conversa ativa no Rev e rastro de abertura.
3. Repetir o envio manual em Solo; responder pelo aparelho e confirmar que o
   webhook cria a mensagem `customer` e que o agente CRM é chamado quando
   habilitado.
4. No GPT Maker, chamar `start-conversation` duas vezes com chaves diferentes
   para o mesmo aparelho. Só habilitar sequência de múltiplos passos se o
   segundo texto chegar corretamente sem conversa duplicada problemática.
5. Criar sequência de teste desligada com passos `+0`, `+2`, `+4` minutos,
   provider e porta de teste. Revisar os registros; só então ativar.
6. Gerar uma entrada pela porta correta e outra por porta diferente. Esperado:
   somente a correta cria uma inscrição e cada passo gera um job único.
7. Deixar o primeiro passo chegar ao aparelho. Verificar `outreach_jobs`,
   `messages`, `conversations` e `lead_activities`.
8. Responder antes do segundo passo. Esperado: inscrição `cancelled` por
   `lead_replied` e nenhum segundo envio.
9. Repetir respondendo `SAIR`. Esperado: `contact_opt_outs`, cancelamento e
   nenhuma nova sequência para o mesmo telefone.
10. Ajustar a janela para fora do horário e confirmar defer sem chamada ao
    provider. Testar o limite da linha com volume controlado.
11. Repetir o fluxo completo uma vez em GPT Maker e uma vez em Solo.
12. Observar pelo menos dois ticks e confirmar que não existem jobs `running`
    abandonados, mensagens duplicadas nem erros silenciosos.

Consultas operacionais:

```sql
select status, count(*) from public.outreach_jobs group by 1 order by 1;

select id, equipe_id, lead_id, enrollment_id, step_position, status,
       attempts, provider, line_key, run_after, finished_at, last_error
  from public.outreach_jobs
 order by created_at desc
 limit 100;

select id, sequence_id, lead_id, status, cancel_reason, started_at, finished_at
  from public.cadence_enrollments
 order by created_at desc
 limit 100;
```

### 7.7 Rollback operacional

Primeiro parar novos envios; não apagar dados nem fazer downgrade destrutivo:

```sql
select cron.unschedule('outreach-tick');
update public.cadence_sequences set active = false where active;
```

O segundo comando aciona o cancelamento dos jobs ainda em fila. Depois, reverter
frontend e Edge Functions para as versões anteriores pelo mecanismo de release.
As migrations são aditivas e devem permanecer até existir uma migration de
rollback revisada. O n8n não precisa de rollback porque não foi alterado.

## 8. Bloqueios de deploy e confirmações de produção

### Bloqueiam o go-live/ativação

- PR #44 ainda precisa estar mergeada antes da SE-REV-002.
- O review adversarial termina em `CHANGES_REQUESTED`: tornar o upsert de
  sequência + passos transacional, ou salvar sempre inativa e ativar somente
  após os passos estarem completos.
- D5 exige entrega real, mas os adaptadores hoje provam apenas aceitação
  síncrona. É necessário obter recibo assíncrono quando o provider o oferecer ou
  redefinir formalmente o estado como `accepted`, além do smoke em aparelho.
- Confirmar que chamadas repetidas de `start-conversation` funcionam como
  follow-up no GPT Maker. Até lá, tenant GPT Maker só deve usar passo 0.
- Confirmar que o eco do envio não chega como `customer`, o que cancelaria a
  sequência de forma segura porém silenciosa.

### Podem ser confirmados somente em produção/ambiente integrado

- tipo real do canal do tenant piloto na API do GPT Maker; `WHATSAPP` não
  oficial funciona, `CLOUD_API` não entra nesta entrega;
- tokens, conectividade, créditos/custo e formato real das respostas dos
  providers;
- webhook inbound e início do agente para GPT Maker e Solo;
- funcionamento real de pg_cron + pg_net + Vault;
- comportamento sob dois workers concorrentes e limite por linha;
- entrega no aparelho e ausência de duplicação ponta a ponta.

### Não bloqueiam merge inerte, mas exigem operação

- gerar/configurar `OUTREACH_WORKER_SECRET` e os dois segredos no Vault;
- publicar o frontend e as cinco Edge Functions listadas;
- executar o smoke antes de ativar qualquer sequência;
- começar com limite baixo e acompanhar risco de banimento da linha.

