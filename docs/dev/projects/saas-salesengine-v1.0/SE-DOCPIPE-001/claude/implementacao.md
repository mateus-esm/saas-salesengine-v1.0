# SE-DOCPIPE-001 — Implementação (Fase 1) e desenho (Fase 2)

Projeto | Tarefa | Agente | Data
---|---|---|---
saas-salesengine-v1.0 | SE-DOCPIPE-001 | Claude (Opus 5.5) | 26/09/2026

Artefatos desta pasta:

- `implementacao.md` — este documento (crítica, decisões, arquivos, validações, pendências).
- `integracao-n8n.md` — contrato HTTP (ida e volta, autenticação, idempotência, deploy, smoke, rollback).
- `primitivos-fase2.md` — `DocumentTemplate`, `MergeEngine`, `ESignatureConnector` e o caminho de internalização.

---

## 1. Crítica da base: o que ACEITO e o que REJEITO do pedido

Antes de desenhar, li a infra de artefatos da Sprint 11 · Onda 4 (T39–T46). **Ela
já implementa a maior parte do fluxo pedido.** A esteira do Jestor já tinha sido
modelada no Rev: tabelas "Propostas Comerciais" e "Contratos" da Solo Energia
(semente da T46, aplicada em 12/09), botões de automação com retorno por token
(T44), formulário público "Dados para Contrato" (T45), status do artefato movendo
o negócio pelos marcos (T43). O que faltava era pouco e está listado em "Lacunas
reais" abaixo.

### Já existia (reaproveitado, não reimplementado)

| Pedido | Já no Rev |
| :-- | :-- |
| Fluxo `Form/Record → Outbound → n8n → Inbound → Update` | T44: `crm_run_artifact_action` → `enqueue_crm_webhooks` → `deliver-crm-webhook` → n8n → `artifact-callback` → `_crm_artifact_callback_finish`. |
| Botão "Generate Proposal" (manda o ID, loading, salva o PDF) | Ação da tabela + `ArtifactActionsPanel` (payload com `record.id`, `deal.id`; polling a cada 5 s enquanto espera; PDF baixado para o bucket privado e gravado na coluna de arquivo). |
| Botão "Send Contract" (dispara ao Clicksign, status reflete) | Mesma ação, com `keep_open` (enviado agora, assinado depois) e `status: sent/signed` movendo o negócio. |
| Entrada recebe URL do PDF e status, atualiza o registro | `artifact-callback`: token de uso único, valida antes de baixar, baixa com proteção de SSRF, aplica em transação. |
| Formulário de entrada ligado a Opportunities | (a) `crm-webhook` já cria/atualiza lead + oportunidade, com `custom_data` por `field_id` via `field_mappings`; (b) o formulário público do Rev grava no artefato preso ao negócio. |

### ACEITO (e entregue)

1. O fluxo alvo, **sobre a infra existente**.
2. **O envio do formulário dispara o n8n** — era a lacuna mais visível em relação
   ao Jestor. Entregue como `form_config.on_submit_action_id` (a tabela escolhe
   qual botão o envio aciona).
3. **Entrada que atualiza "por ID" com idempotência** — entregue como a edge
   `artifact-inbound`, com `x-webhook-secret` do tenant (padrão SE-REV-001/002)
   e `event_id` obrigatório.
4. **"Send Contract" faz merge proposta + contrato** — o Rev agora entrega a
   proposta no payload do contrato (`deal_artifacts`) e um jeito de o n8n baixar
   o PDF privado (`file_url`). O merge em si continua no n8n (Fase 1).
5. **Loading do botão** — agora o botão gira e fica travado enquanto a última
   execução espera o primeiro retorno (evita a segunda proposta / o segundo
   envelope por clique duplo).
6. **Primitivos da Fase 2** — desenhados em `primitivos-fase2.md`.

### REJEITO (ou divirjo) — e por quê

1. **Quatro colunas fixas em `opportunities`** (`proposal_pdf_url`,
   `contract_pdf_url`, `clicksign_document_id`, `signature_status`). Rejeitado;
   decisão completa em §2.
2. **Guardar só a URL do PDF** (`*_pdf_url`). A URL do APITemplate/Clicksign é de
   terceiro e pode expirar; a v1 já copia o arquivo para o bucket privado e é
   isso que vale. A URL pode ficar num campo `url` (`link_pdf`) como conveniência,
   nunca como fonte da verdade.
3. **Botões "Generate Proposal" e "Send Contract" no código.** Rejeitado: o Rev
   é multi-tenant; botão é configuração da tabela de artefato (rótulo + URL), e
   para a Solo se chamam "Gerar proposta" e "Enviar contrato". Nenhum nome, id
   ou URL da Solo entra na lógica.
4. **Um webhook de saída novo.** Rejeitado: a saída usa a fila que já existe
   (`webhook_configs` → `webhook_logs` → `deliver-crm-webhook`), com rastro nos
   logs de webhook. Nenhum caminho paralelo de saída.
5. **Uma entrada genérica substituindo o callback.** Rejeitado: o callback por
   token continua sendo o caminho principal (credencial por execução, amarrada a
   um registro, sem segredo compartilhado). A entrada por ID é **complemento**,
   para o que chega fora de uma execução (assinatura depois do token vencer,
   re-sync).
6. **Formulário gravando direto em `opportunities.custom_data`.** Divirjo: os
   dados do contrato (CPF, endereço, UC…) são do **documento**, não do negócio, e
   um negócio pode ter mais de um contrato (revisões). Eles ficam no registro do
   Contrato, que está preso ao negócio (N:1) e vai inteiro no payload. A entrada
   de lead/negócio continua pelo `crm-webhook` (fora do escopo de mudança).

### Lacunas reais que esta entrega fecha

| # | Lacuna | Solução |
| :-- | :-- | :-- |
| 1 | Envio do formulário não dispara nada | `form_config.on_submit_action_id` + `_crm_public_form_submit` chama `_crm_start_artifact_run(..., 'form_submit')`; falha na automação não derruba o envio do cliente. |
| 2 | O Contract Engine não recebe a proposta nem consegue baixar o PDF | `deal_artifacts` no payload + `artifact-inbound` `file_url` (URL assinada de 5 min). |
| 3 | Assinatura depois de 7 dias era recusada (`token_expired`) | `keep_open` renova o token (30 dias a partir da resposta, teto de 90 desde o clique) **e** a entrada por ID não depende de token. |
| 4 | Reentrega do Clicksign reaplicava a resposta `keep_open` (arquivo duplicado) | `event_id` no callback; guardado em `result.event_ids`; repetido = `duplicate`. |
| 5 | Não havia "atualiza por ID" com segredo do tenant | `artifact-inbound` `update` por `record_id` ou `match { key, value }` (ex.: `clicksign_document_id`), idempotente por `artifact_inbound_events`. |
| 6 | Clique duplo gerava duas execuções | `isActionBusy` trava o botão até o primeiro retorno (janela de 15 min). |
| 7 | Contratos sem `clicksign_document_id` nem coluna para o PDF enviado | Script idempotente da Solo acrescenta `clicksign_document_id` (texto) e `contrato_pdf` (arquivo). |

---

## 2. Decisão: colunas fixas ou campos do artefato?

**Campos do artefato** (tabela personalizada marcada como artefato), mais o
`artifact_status` nativo. Nenhuma coluna nova em `opportunities`.

| Pedido | Onde fica | Por quê |
| :-- | :-- | :-- |
| `proposal_pdf_url` | Propostas Comerciais · `pdf` (arquivo) + `link_pdf` (url, opcional) | Já existiam na semente. O PDF é copiado para o bucket privado. |
| `contract_pdf_url` | Contratos · `contrato_pdf` (arquivo, novo) e `contrato_assinado` (arquivo, já existia) | O documento enviado e o assinado são arquivos diferentes; os dois ficam. |
| `clicksign_document_id` | Contratos · `clicksign_document_id` (texto, novo) | É dado do contrato, não do negócio; é também a chave de `match` da entrada por ID. |
| `signature_status` | `custom_table_records.artifact_status` do Contrato | Já é coluna de verdade, com os estados `draft/sent/signed/rejected`, só muda pelo verbo e **move o negócio pelos marcos** `contract_sent` / `contract_signed`. Um campo paralelo divergiria dela. |

Razões, a partir do que o repo já faz:

1. **N:1.** Um negócio pode ter várias propostas (revisões) e mais de um
   contrato. Colunas fixas no negócio guardam só "o último" e perdem histórico.
   O artefato já é N:1 por `custom_table_records.opportunity_id`.
2. **`custom_data` é por `field_id` e por pipeline.** Pôr esses dados em
   `opportunities.custom_data` exigiria declarar os campos no schema de cada
   pipeline e resolver `key → field_id` em cada escrita — exatamente o que o
   artefato já faz, e com escrita restrita aos tipos graváveis.
3. **Status com regra.** `artifact_status` só muda pelo verbo, que dispara os
   marcos do funil (relatórios e automações de etapa). Uma coluna
   `signature_status` solta não passaria por essa regra.
4. **Multi-tenant.** Colunas `clicksign_*` em `opportunities` seriam esquema de
   um cliente e de um provedor dentro da tabela central de todos.
5. **Não criar esquema paralelo.** A infra da T40–T45 cobre; a única mudança de
   estrutura necessária foram duas colunas na tabela da Solo (configuração do
   tenant, por script), não no esquema do produto.

No registro do negócio, esses dados aparecem no painel de artefatos
(`DealArtifactsSection` / `crm_deal_artifacts`), com os botões e o status.

---

## 3. O que foi feito

### Banco — `supabase/migrations/20260926100000_sedocpipe001_document_pipeline.sql`

Só `create or replace` e `create table/index if not exists`. Nenhuma coluna ou
função removida; as assinaturas antigas continuam valendo.

| Objeto | O que é |
| :-- | :-- |
| `_crm_artifact_record_fields(record)` | Campos por key de um registro (extraído do payload v1, sem mudança de regra). |
| `_crm_artifact_payload(record)` | Payload v1 + `deal_artifacts`. |
| `_crm_start_artifact_run(equipe, record, action, autor, trigger)` | Núcleo do clique (corpo da T44 parametrizado); payload ganha `trigger`. |
| `crm_run_artifact_action` | Mesmo verbo e mesmas respostas; agora delega ao núcleo. |
| `_crm_artifact_apply(record, status, fields, files)` | Núcleo único de aplicação (miolo da `_crm_artifact_callback_finish` da T44). |
| `_crm_artifact_callback_seen`, `_crm_artifact_callback_apply` | Idempotência por `event_id` e renovação no `keep_open`. |
| `_crm_artifact_callback_finish` | Mantida (edge antiga), delega ao `_apply` sem `event_id`. |
| `crm_save_form_config`, `_crm_public_form_submit` | + `on_submit_action_id` e o disparo no envio. Validação por tipo idêntica à T45. |
| `artifact_inbound_events` (tabela nova, RLS de leitura por equipe) | Livro de eventos da entrada por ID. |
| `_crm_artifact_inbound_begin/finish/release` | Entrada por ID: resolve o registro, segura o evento, aplica. |
| `_crm_artifact_run_equipe(token)` | Equipe de uma execução aberta (para o `file_url`). |

Todas as funções internas: `revoke` de `public/anon/authenticated`, `grant` só
ao `service_role`.

### Edge functions

- `supabase/functions/artifact-callback/index.ts` — `event_id`, checagem de
  duplicado antes de baixar, chama `_crm_artifact_callback_apply`. Download e
  upload movidos para o módulo compartilhado (mesmo comportamento).
- `supabase/functions/artifact-inbound/index.ts` — **nova**: `update` e `file_url`.
- `supabase/functions/_shared/artifact-callback.ts` — `eventId`/`parseEventId`,
  `downloadArtifactFile`, `storeArtifactFiles`, `removeArtifactFiles`; tipos dos
  helpers estreitados (`Pick<…>`) para servir às duas edges.
- `supabase/functions/_shared/artifact-inbound.ts` — **novo**: parse do corpo,
  `isTenantArtifactPath`, erros → HTTP.
- `supabase/config.toml` — `[functions.artifact-inbound] verify_jwt = false`.

### Frontend

- `src/lib/publicForm.ts` — `FormConfig.on_submit_action_id`.
- `src/components/crm/customtables/FormConfigEditor.tsx` — "Ao enviar, disparar"
  (lista as ações da tabela; ação removida lê como "Nenhuma").
- `src/lib/artifactActions.ts` — `ArtifactRun.action_id`, `isActionBusy`,
  `BUSY_WINDOW_MS`.
- `src/hooks/useArtifactActions.ts` — lê `action_id` das execuções.
- `src/components/crm/customtables/ArtifactActionsPanel.tsx` — botão gira e trava
  enquanto a execução espera o primeiro retorno.

### Scripts, testes e documentação

- `supabase/scripts/2026-09-26_sedocpipe001_solo_contract_columns.sql` — colunas
  da Solo (idempotente; aplicar com aprovação do dono).
- `supabase/tests/sedocpipe001_document_pipeline.test.sql` — ensaio SQL (convenção `scripts/sqltest.sh`).
- `supabase/functions/_shared/artifact-inbound.test.ts` (novo), `artifact-callback.test.ts` (+`event_id`, download, rollback do upload).
- `src/lib/__tests__/artifactActions.test.ts` (+`isActionBusy`), `publicForm.test.ts` (+`on_submit_action_id`).
- `Planning/Architecture/contrato_artefato_v1.md` — adendo "Extensões SE-DOCPIPE-001".

### Não tocado

Workflows n8n; `_shared/outreach/*`, `outreach`, `outreach-worker`,
`send-chat-message`, `start-conversation`, `crm-webhook`, `gpt-maker-webhook`;
`deliver-crm-webhook` (reaproveitado sem mudança). `_shared/tenant-auth.ts` foi
só importado.

---

## 4. Validações (resultados reais)

Ambiente: este worktree. `node_modules` não existia; rodei `npm ci --include=dev`
(o ambiente tem `NODE_ENV=production`, que omite as devDependencies).

| Validação | Antes (baseline) | Depois |
| :-- | :-- | :-- |
| `npm test` (vitest) | 56 arquivos: **53 ok, 3 falham**; **406 testes ok** | 56 arquivos: **53 ok, 3 falham**; **410 testes ok** (+4 novos) |
| `npm run typecheck` | — | **OK** (sem erros) |
| `npm run lint` | — | **0 erros**, 85 avisos; os 7 arquivos `src/` tocados não geram nenhum aviso (`npx eslint <arquivos>` sem saída) |
| `npm run build` | — | **OK** (só o aviso de tamanho de chunk, pré-existente) |
| `deno test` (artifact-callback, artifact-inbound, public-form, tenant-auth) | 15 ok (callback + public-form + tenant-auth) | **26 ok, 0 falhas** |
| `deno test` (todas as funções, `--allow-env --allow-read --allow-net`) | — | **247 ok, 0 falhas** |
| `deno check` (artifact-callback, artifact-inbound, public-form) | — | **OK** |
| `deno lint` (arquivos tocados) | — | só `no-import-prefix` (import `https:` inline), o mesmo padrão do código existente — o `artifact-callback` original dá o mesmo aviso |

As 3 falhas do vitest são as mesmas antes e depois e não são de código:
`useForecast.test.ts`, `usePipelines.test.ts` e `InlineCell.test.tsx` falham ao
importar o cliente Supabase por falta de `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` no ambiente.

### SQL

- **`scripts/sqltest.sh` contra o projeto linkado: NÃO EXECUTADO.** O runner roda
  contra a produção (em BEGIN…ROLLBACK) pela Management API; não executei nada
  contra produção nesta tarefa. Fica para o orquestrador no deploy (§9 do
  `integracao-n8n.md`).
- **Ensaio local: EXECUTADO**, num Postgres 15 descartável em `/tmp` com um
  esquema-base **mínimo** feito à mão (tabelas-base simplificadas, `auth.uid()`
  lendo `request.jwt.claims`, fila de saída que só grava o `webhook_logs`). As
  migrations reais da Onda 4 e a desta tarefa foram aplicadas por cima, pelo
  mesmo `@include` do runner:
  - `sedocpipe001_document_pipeline.test.sql` → **PASS**;
  - `sprint11_w4_artifact_actions.test.sql` (T44) **com esta migration por cima** → **PASS** (o callback antigo e o clique continuam iguais);
  - `sprint11_w4_public_forms.test.sql` (T45) **com esta migration por cima** → **PASS** (o envio do formulário continua igual);
  - semente da Solo (T46) + script de colunas **duas vezes** → **PASS** (idempotente, `field_id` único, `contrato_assinado` continua sendo a primeira coluna de arquivo);
  - `sprint11_w4_artifacts`, `artifact_lifecycle` e `artifact_files` **falham igual com e sem esta migration** — dependem de RLS de `opportunities`, do gatilho etapa→funil e das colunas do Storage, que o esquema mínimo não tem. Não é regressão, mas também não é prova: rodar esses três no `sqltest.sh`.

  O esquema mínimo **não é** o de produção; o ensaio real é o `sqltest.sh`.

---

## 5. Decisões registradas

1. **Estender, não substituir** (`create or replace` com assinaturas antigas
   preservadas). A edge antiga funciona com a migration nova; a edge nova exige
   a migration (ordem de deploy: migration → edges → frontend).
2. **Um núcleo de aplicação** (`_crm_artifact_apply`) para callback e entrada
   por ID: mesma regra de campos, arquivos e marcos nos dois caminhos.
3. **Idempotência:** no callback, `event_id` opcional por execução (o token já
   dá uso único na resposta final); na entrada por ID, `event_id` obrigatório e
   único por equipe (não há token).
4. **Validade do token no `keep_open`:** 30 dias a partir da resposta, teto de
   90 dias do clique. A v1 dizia "7 dias"; o adendo do contrato registra a mudança.
5. **Disparo pelo formulário não derruba o envio do cliente** (sub-bloco com
   `exception`); a ação pulada vai para o log do banco (`warning`) e o campo
   `automation: "skipped"` na resposta.
6. **`file_url` aceita o token de uma execução aberta** além do segredo: é o
   caso natural dentro do Contract Engine e dá acesso só à pasta da equipe, por
   5 minutos. Registro: um token aberto dá leitura a qualquer arquivo de
   artefato **da mesma equipe**, não só do registro da execução.
7. **Trava do botão:** só até o primeiro retorno e por no máximo 15 minutos — um
   contrato esperando assinatura por dias não prende o botão.

---

## 6. Pendências

### Dependem de credencial/decisão do dono

1. **URLs dos webhooks do n8n** (Proposal Engine e Contract Engine) para
   configurar os botões "Gerar proposta" e "Enviar contrato" na tela. Não
   inventei endpoint.
2. **Adaptar os nós HTTP dos workflows** ao contrato (ler o payload v1, responder
   no `callback.url`, usar `file_url`, guardar `record.id` nos metadados do
   Clicksign). Roteiro em `integracao-n8n.md` §8. Os workflows não foram tocados.
3. **`equipes.webhook_secret` da Solo** no n8n, para a entrada por ID (é o mesmo
   segredo que o `crm-webhook` já usa).
4. **Aprovar e aplicar** `supabase/scripts/2026-09-26_sedocpipe001_solo_contract_columns.sql`.
5. **Decidir** se o envio dos Dados para Contrato dispara o contrato
   automaticamente ("Ao enviar, disparar") ou se fica no botão.
6. **Smoke ponta a ponta** com um documento de teste no Clicksign da Solo.
7. **Fase 2** (degraus 1–3): chave do APITemplate e token/segredo HMAC do
   Clicksign da Solo, no Vault.

### Técnicas

1. Rodar `scripts/sqltest.sh` com `sedocpipe001_document_pipeline.test.sql` e os
   testes da Onda 4 no deploy (não executado aqui).
2. Header de autenticação na saída: `webhook_configs.headers` já é enviado pela
   fila, mas o editor de botões não expõe o campo. Se o dono quiser `x-rev-secret`
   no n8n, hoje é um `update webhook_configs set headers = …` pontual; expor no
   editor é uma melhoria pequena.
3. `src/integrations/supabase/types.ts` não foi regenerado (os hooks de artefato
   usam `supabase as any`, como antes). Regenerar após o `db push` inclui
   `artifact_inbound_events`.
4. **Histórico do Jestor** (≈213 propostas, achado 9 do plano da Sprint 11): a
   importação dos registros antigos não faz parte desta entrega e depende de
   acesso à API/exportação do Jestor da Solo. A esteira nova vale para os
   negócios daqui em diante.
