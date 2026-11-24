# Sprint 17 — Integração nativa Meta (Lead Ads + CAPI)

Origem: `Planning/Sprints/sprint_17_meta_ads_intregration.md` + brief de planejamento
de 24/11/2026 (segurança desde o dia 1, base extensível do "Rev Gateway").
Status: **rascunho para aprovação do Mateus** — nada de código antes do OK.

## 1. Por quê

Hoje cada cliente monta o próprio workflow no n8n para trazer lead de formulário do
Meta: chega por "Importação / API", com `ag:120…` no lugar do ID, sem `leadgen_id`, às
vezes com uma mensagem de erro do Meta no lugar do ID. A proposta de valor do Rev é
**"conecte seus anúncios → comece a vender → gerencie no CRM → otimize a campanha com
a API de Conversões"**. Isso exige uma conexão de **1 clique, que continua funcionando
sozinha**, sem token copiado e sem workflow por cliente.

Esta sprint é o **passo 1 da camada nativa de conexões (Rev Gateway)**: o mesmo app do
Meta vai receber depois WhatsApp oficial (WABA) e Instagram, e o padrão se repete para
TikTok Shop, Mercado Livre e widget próprio.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
1. "Conectar com Meta" em `/integracoes`, por equipe (multi-tenant, um app só).
2. Lead de formulário instantâneo chega no Rev em segundos, pelo **mesmo caminho** do
   webhook de entrada (identidade, negócio, responsável, toque), já ligado a anúncio →
   criativo → campanha, com `leadgen_id` guardado.
3. Uma entrada (`crm_entries`) por formulário, configurável em Growth › Entradas.
4. Importar leads recentes por formulário (backfill) com a mesma deduplicação.
5. Infra da CAPI pronta ponta a ponta: dataset escolhido, mapeamento etapa → evento
   (tudo **desligado**), fila com deduplicação, registro por lead, evento de teste.
6. Kit da App Review + endpoint de exclusão de dados.

**Não-objetivos (sprints seguintes)**: definir MQL/SQL e ligar eventos reais; WhatsApp
oficial/IG; Google (gclid, Lead Form); tela de mapeamento de campos por formulário
(fica opcional — ver §6.4).

**Anti-objetivos (falharia mesmo "funcionando")**
- Lead de uma equipe cair em outra (página ligada a duas equipes, `equipe_id` do body).
- Token aparecendo em log, resposta, commit ou tabela comum.
- Conexão que expira em silêncio e para de trazer lead sem ninguém ver.
- Um segundo jeito de criar lead, divergente do webhook de entrada.
- Evento CAPI duplicado contando conversão em dobro.
- Qualquer coisa específica da Solo Energia no código.

## 3. O que confirmei na documentação oficial do Meta (24/11/2026)

| Fato | Fonte |
|---|---|
| Graph API atual: **v27.0** (04/11/2026). | [changelog](https://developers.facebook.com/docs/graph-api/changelog) |
| Login for Business tem 2 tipos de configuração: *User access token* (curto, herda o acesso da pessoa) e *System-user access token* (**não expira** por padrão, acesso delegado explicitamente aos ativos escolhidos, **só authorization code grant**, só web, exige app ligado a um portfólio empresarial). Para system-user: `response_type=code` + `override_default_response_type=true`; o código é trocado no servidor em `GET /v27.0/oauth/access_token?client_id&client_secret&code`. `config_id` substitui `scope`. | [Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business) |
| O token system-user é indicado para **Tech Providers** (quem constrói solução para outras empresas com as APIs de negócio — é o caso do Rev). Servir empresas que não são suas exige **Advanced Access via App Review**; Advanced Access exige **Verificação do Negócio**. | idem + [permissions](https://developers.facebook.com/docs/permissions) |
| `GET /me?fields=client_business_id` com o token system-user devolve o portfólio do cliente. | Login for Business |
| Ler lead exige `leads_retrieval`; dados de anúncio (ad_id, campaign_id) exigem token de quem anuncia na conta e na página + `ads_management`, `pages_read_engagement`, `pages_show_list`; webhooks exigem `pages_manage_metadata`; o conjunto completo inclui `pages_manage_ads`. | [Retrieving leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving) |
| `GET /{form-id}/leads?fields=created_time,id,ad_id,form_id,field_data`, paginado por `paging.cursors.after`; filtro `time_created` `GREATER_THAN`. `field_data[] = {name, values[]}`. | idem |
| Inscrição: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` com **token da página**; cancelamento: `DELETE /{page-id}/subscribed_apps` com **token do app**. | [Webhooks quickstart](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/quickstart/webhooks-integration), [subscribed_apps](https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/) |
| Webhook: `{"object":"page","entry":[{"id","time","changes":[{"field":"leadgen","value":{leadgen_id,page_id,form_id,adgroup_id,ad_id,created_time}}]}]}` — **`adgroup_id`, não `adset_id`**. Até 1000 mudanças por POST. | idem |
| Verificação GET `hub.mode=subscribe`, `hub.verify_token`, devolver `hub.challenge`. Assinatura `X-Hub-Signature-256: sha256=<hmac>` com o app secret sobre o corpo. Sem 200, o Meta **reenvia por até 36 h** → deduplicar. | [Webhooks getting started](https://developers.facebook.com/docs/graph-api/webhooks/getting-started) |
| Gerenciador de acesso a leads: se o Business customizou o acesso, o app do Rev precisa ser liberado lá; senão todo admin da página tem acesso. | Retrieving leads |
| Exclusão de dados: POST com `signed_request` (`sig.payload` base64url, HMAC-SHA256 com o app secret; payload traz `user_id`); responder `{ "url", "confirmation_code" }`; URL deve mostrar o status para humano. | [Data deletion callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback) |
| CAPI para CRM (Conversion Leads): `action_source: "system_generated"`, `custom_data.event_source: "crm"`, `custom_data.lead_event_source: "<nome do CRM>"`, `user_data.lead_id` (inteiro de 15–17 dígitos = `leadgen_id`), `event_name` livre por etapa ("envie todas as etapas, inclusive o lead cru"), `event_time` **depois da criação do lead e no máximo 7 dias atrás** (um evento velho derruba o lote inteiro). Enviar ao menos 1×/dia; lote de até 1000. | [CRM integration](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration) |
| Hash: `em` trim+lowercase+SHA-256; `ph` só dígitos com DDI, sem zeros à esquerda, SHA-256; **não** hashear `lead_id`, `fbc`, `fbp`, `ctwa_clid`, IP, user agent. `fbc = fb.1.<ms>.<fbclid>`. `event_id`+`event_name` deduplica (fica o primeiro). `test_event_code` aparece em Gerenciador de Eventos › Testar eventos. | [customer info](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters), [server event](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event), [using the API](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api) |
| Enviar à CAPI com o app próprio: system user com o **pixel atribuído** como ativo — "não precisa pedir permissão" extra. Pixels: `GET /act_{id}/adspixels`, `GET /{business}/owned_pixels`. | [CAPI get started](https://developers.facebook.com/docs/marketing-api/conversions-api/get-started), [adspixels](https://developers.facebook.com/docs/marketing-api/reference/ad-account/adspixels/) |
| CAPI de mensagens (`ctwa_clid`): `action_source: "business_messaging"`, `messaging_channel: "whatsapp"`, exige **WABA na Cloud API oficial** + `whatsapp_business_manage_events`. A Solo usa API própria (Evolution/Baileys) → **implementado e desligado**. | [business messaging](https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging) |

**Não confirmado na doc (vira verificação empírica na Fase 1, com a conta da Solo)**
- Como obter **token de página** a partir do token system-user (`/me/accounts` ou
  `/{page-id}?fields=access_token`) e se ele também não expira. A doc não diz.
- Lista completa de campos do nó Lead (`ad_name`, `adset_*`, `campaign_*`,
  `is_organic`, `platform`): as páginas de referência dão 404.
- Leitura de `GET /{page-id}/leadgen_forms` (a referência só documenta criação).

O desenho abaixo não depende dessas respostas: cada uma tem plano B (§6).

## 4. Abordagens consideradas

**Tipo de token (decidido com o Mateus em 24/11):**
- **System-user (Login for Business, config "System-user access token") — escolhida.**
  Não expira, não depende da pessoa que conectou, o cliente escolhe no diálogo quais
  páginas/contas/pixel compartilha (privilégio mínimo por ativo), e a CAPI continua
  enviando para sempre. Custo: o cliente entra com um portfólio empresarial (todo
  anunciante tem) e o Rev se posiciona como Tech Provider na App Review — o que já é
  pré-requisito do WhatsApp oficial no roadmap.
- User token: ~60 dias, preso à pessoa; quando ela sai da empresa os leads param sem
  aviso. Descartada.
- Token colado à mão (como n8n): é exatamente o que queremos eliminar.

**Fluxo OAuth:** diálogo OAuth por **redirecionamento** (`/dialog/oauth` com
`config_id`, `state`, `response_type=code`) em vez do popup do JS SDK — o `state`
faz a volta completa pelo Meta (proteção CSRF de verdade), não carrega script de
terceiro e o `redirect_uri` registrado amarra a troca do código. Escolha minha.

**Ingestão:** extrair o núcleo do `crm-webhook` para `_shared/ingest-lead.ts` e usá-lo
nos dois lugares (pedido no brief). Alternativas descartadas: o worker chamar o
`crm-webhook` por HTTP (salto extra, autenticação por config_id que não existe para o
Meta) e criar lead por um verbo SQL novo (segundo caminho).

**Processamento:** webhook grava na fila e responde 200; `EdgeRuntime.waitUntil`
processa na hora; `pg_cron` a cada 5 min varre pendentes/erros (padrão
`solo-wpp-webhook` + Windsor).

## 5. Modelo de dados (migration `20261124000100_sprint17_meta.sql`)

Pensado para o Gateway: **conta** (uma por equipe e provider) → **ativos** (páginas,
contas de anúncio, datasets; depois WABA, números, contas IG) → **eventos de entrada**
e **eventos de conversão**, todos com `provider`.

### 5.1 Conta: `crm_integrations` (existente)
- `provider` passa a aceitar `'meta'`. O token system-user vai no Vault pelo
  `_crm_integration_store_key` existente (nome `meta_api_key:<equipe>`).
- `settings` (sem segredo): `business_id`, `business_name`, `fb_user_id` (ID do
  usuário no app, para a exclusão de dados), `token_type: "system_user"`,
  `granted_scopes[]`, `graph_version`, `dataset_id`, `capi_enabled` (false),
  `lead_event_source` ("Rev").
- `status` ganha `'reauth'`? → não: uso `'error'` + `last_sync_error` com código
  (`token_invalid`, `permission_missing`), e a tela mostra "Reconectar".

### 5.2 Ativos: `crm_integration_assets` (nova, genérica)
| coluna | |
|---|---|
| `id`, `equipe_id`, `integration_id` (fk, cascade) | |
| `provider` (`'meta'`), `asset_type` (`'page' \| 'ad_account' \| 'dataset'`; futuro `'waba' \| 'phone_number' \| 'ig_account'`) | check por função `_crm_asset_types()` para crescer sem refazer |
| `external_id`, `name`, `secret_id` (Vault; token da página, quando houver) | |
| `status` `'available' \| 'active' \| 'error' \| 'disconnected'` | available = o cliente compartilhou; active = escolhida para receber |
| `subscribed_at`, `last_event_at`, `last_error`, `last_error_at`, `settings jsonb` | |
- `unique (integration_id, asset_type, external_id)`.
- **`unique (provider, asset_type, external_id) where status = 'active'`** — uma página
  só pode estar ativa em uma equipe. É o que garante que o webhook (que só sabe o
  `page_id`) nunca entregue lead à equipe errada. Ativar uma página já ativa em outra
  equipe → erro claro na tela.
- RLS: leitura pela equipe, **sem `secret_id`** (view/verbo `crm_integration_assets_list`).

### 5.3 Estado do OAuth: `crm_oauth_states` (nova)
`id`, `provider`, `equipe_id`, `user_id`, `nonce_hash` (SHA-256 do nonce),
`expires_at` (10 min), `used_at`. O nonce aleatório (32 bytes) vai no `state`; o banco
guarda só o hash; uso único. Sem RLS de leitura (só service role).

### 5.4 Fila de entrada: `crm_inbound_events` (nova, genérica)
`id`, `equipe_id`, `provider`, `kind` (`'leadgen'`), `external_id` (`leadgen_id`),
`asset_id` (página), `payload jsonb` (o `value` do webhook — só IDs, sem PII),
`status` `'queued' \| 'processing' \| 'done' \| 'error' \| 'dead'`, `attempts`,
`next_attempt_at`, `last_error`, `lead_id`, `opportunity_id`, `received_at`,
`processed_at`, `origin` (`'webhook' \| 'backfill'`).
- **`unique (equipe_id, provider, kind, external_id)`** → reenvio/replay do Meta e
  backfill que repete lead são no-op.
- Backoff: `next_attempt_at = now() + least(2^attempts min, 6 h)`; 8 tentativas →
  `dead`, visível na tela. Erro de token (190/102) não queima tentativa: marca a
  integração em erro e para a fila daquela equipe até reconectar.
- Claim com `for update skip locked` (`_crm_inbound_claim(limit)`).
- Página desconhecida/inativa: **não grava** (não guardamos dado de quem não é
  cliente); conta em log agregado.

### 5.5 Lead e entrada
- `lead_touches.leadgen_id text` + índice `(equipe_id, leadgen_id)`;
  `_crm_touch_fields` passa a ler `leadgen_id`/`leadgenId`; `crm_record_touch` grava.
- `crm_entries.kind` aceita `'meta_form'`; colunas `meta_form_id`, `meta_page_id`;
  `unique (equipe_id, meta_form_id)`. Verbo `_crm_entry_for_meta_form(equipe, page,
  form, form_name)` cria na primeira vez com canal **Social Pago · Meta**
  (`origin_category` paga social, `platform 'meta'`), linha = padrão da equipe.
- `crm_ads.source` aceita `'meta'`: anúncio que chega no lead e não existe no Rev é
  criado com os IDs/nomes que vieram ("a completar"); o Windsor completa depois.
- O ID do anúncio vem limpo do Meta → o `ag:` some para esses leads.

### 5.6 CAPI
- `crm_conversion_mappings`: `equipe_id`, `provider`, `pipeline_id`, `stage_id`,
  `event_name` (texto livre; sugestão = nome da etapa em snake_case), `active`
  (**false**), `unique (equipe_id, provider, stage_id)`.
- `crm_conversion_events`: `equipe_id`, `provider`, `lead_id`, `opportunity_id`,
  `stage_id`, `event_name`, **`event_id unique`** = hex(SHA-256(`equipe:opp:stage:event_name`))
  (negócio que volta para a etapa não conta de novo), `event_time`, `match_key`
  (`'lead_id' \| 'fbc' \| 'hashed_pii' \| 'ctwa'`), `payload jsonb` (**só o que foi
  enviado: IDs e hashes**), `status` `'queued' \| 'sent' \| 'error' \| 'skipped'`,
  `skip_reason` (`no_match_key`, `too_old`, `capi_off`, `whatsapp_requires_waba`),
  `attempts`, `next_attempt_at`, `response jsonb` (`events_received`, `fbtrace_id`,
  erro), `test_event_code`, `sent_at`.
- Gatilho: `after insert on opportunity_stage_history` → se existe mapeamento
  **ativo** para `to_stage_id` **e** `capi_enabled` na integração → enfileira (on
  conflict do nothing). É o mesmo ponto que alimenta `funnel_events`/`stage_entered`.
- Registro por lead (LGPD): verbo `crm_lead_conversion_events(lead_id)` para a aba do
  lead.

### 5.7 Exclusão de dados: `crm_data_deletion_requests`
`confirmation_code` (aleatório), `provider`, `external_user_id`, `received_at`,
`status`, `affected_integrations int`. Status público só por código.

## 6. Fluxos

### 6.1 Conectar (edge `integrations-meta`, JWT de admin/owner)
1. `config` → `{ app_id, config_id, graph_version, redirect_uri }` (segredos nunca).
2. `start` → cria `crm_oauth_states` e devolve a URL do diálogo
   `https://www.facebook.com/v27.0/dialog/oauth?client_id&config_id&redirect_uri&response_type=code&override_default_response_type=true&state`.
3. O Meta volta para `/integracoes/meta/callback?code&state` (rota do front), que chama
   `connect { code, state }`. A edge: valida o `state` (hash, não expirado, não usado,
   **mesmo usuário e equipe da sessão**) → troca o código no servidor → `GET /me
   ?fields=id,name,client_business_id` → `debug_token` (escopos concedidos, tipo) →
   guarda o token no Vault → descobre ativos (páginas, contas de anúncio, pixels) e
   grava como `available` → devolve a lista.
4. Token de página (plano A → B, confirmado na Fase 1): `GET /me/accounts
   ?fields=id,name,access_token,tasks`; senão `GET /{page-id}?fields=access_token`;
   senão usar o próprio token system-user nas leituras da página. Uma função
   `tokenForPage()` esconde isso do resto.
5. `activate_page { page_id }` → `POST /{page}/subscribed_apps subscribed_fields=leadgen`
   → `active`, `subscribed_at`; pré-sincroniza formulários (`GET /{page}/leadgen_forms
   ?fields=id,name,status`, tolerante a falha) criando as entradas `meta_form`.
   `deactivate_page` → `DELETE` com token do app → `available`.
6. `status` → páginas, último lead por página, fila (pendentes/erros/dead), dataset,
   erros traduzidos. `disconnect` → cancela todas as inscrições, apaga do Vault conta e
   ativos, marca `disconnected` (lead e histórico ficam).
7. Erros do Meta → mensagem clara (`_shared/meta.ts: metaErrorMessage`): 190 token
   expirado/revogado → "Reconectar"; 200/10 permissão → qual permissão; página sem
   acesso a leads → aviso do **Gerenciador de acesso a leads**; 4/17/613 limite → "vai
   tentar de novo".

### 6.2 Receber (edge pública `meta-webhook`, `verify_jwt = false`)
- **GET**: `hub.mode === 'subscribe'` e `hub.verify_token` igual (tempo constante) →
  devolve `hub.challenge`; senão 403.
- **POST**: `raw = await req.text()` → `X-Hub-Signature-256` obrigatório →
  HMAC-SHA256(raw, `META_APP_SECRET`) comparado em tempo constante → só então
  `JSON.parse`. Sem assinatura válida → 401. Corpo > 1 MB → 413.
- Para cada `changes[].field === 'leadgen'`: `_crm_meta_enqueue_leadgen(page_id,
  value)` resolve a página **ativa** → equipe e grava na fila (idempotente). Responde
  200 e dispara `EdgeRuntime.waitUntil(processBatch(ids))`.
- Rota `?purpose=deletion` / `deauthorize` fica em edge própria (§6.6).

### 6.3 Processar (`_shared/meta-ingest.ts`, usado pelo webhook e pelo worker)
1. Claim do evento → token da página.
2. `GET /{leadgen_id}?fields=id,created_time,ad_id,ad_name,adset_id,adset_name,
   campaign_id,campaign_name,form_id,field_data,is_organic,platform` — se o Meta
   recusar algum campo (#100), repete com o núcleo documentado
   (`id,created_time,ad_id,form_id,field_data`) e completa por
   `GET /{ad_id}?fields=name,adset{id,name},campaign{id,name}`.
3. Nome do formulário: da entrada (cache) ou `GET /{form_id}?fields=name`.
4. `fieldDataToLead(field_data)` (puro): `full_name`/`first_name`+`last_name` → nome;
   `email`; `phone_number` → `normalizePhone`; demais perguntas → `observations`
   ("Pergunta: resposta", uma por linha) e `custom_fields.meta_form` (pares
   originais). Sem nome → `leadNameFromPhone`/nome anônimo do `lead-identity`.
5. `ingestLead()` (núcleo extraído do `crm-webhook`): dedup por telefone normalizado
   (+ e-mail como 2ª chave, só nesta porta), lead novo/atualizado, negócio na linha da
   entrada (`entryLine`), toque via `crm_record_touch` com `ad_id`, `adset_id`
   (= `adgroup_id`), `campaign_id`, `campaign_name`, `ad_name`, `form_id`,
   `form_name`, `leadgen_id`, `utm_source=facebook`, `utm_medium=paid_social`,
   `occurred_at = created_time`; responsável pela regra da entrada; atividade no lead;
   abertura de conversa pelo agente (`dispatchConversationOpen`), igual ao webhook.
6. Anúncio inexistente → cria `crm_ads` (`source 'meta'`) e religa.
7. `done` com `lead_id`; `last_event_at` na página. Erro → backoff (§5.4).

O `crm-webhook` passa a chamar o mesmo `ingestLead()` na rota `/inbound`, sem mudar o
comportamento (testes de caracterização antes de mexer).

### 6.4 Backfill
`import_recent { form_id, days ≤ 90 }` → `GET /{form}/leads` paginado com filtro
`time_created > now-days` → cada lead entra na fila com `origin 'backfill'` (mesma
unicidade) → worker processa. Lead importado **não** gera evento CAPI retroativo (a
regra dos 7 dias derrubaria o lote). Mapeamento de campos por formulário: fora; o
padrão (§6.3.4) cobre os campos nativos, e o resto vai para observações.

### 6.5 CAPI
- Tela: escolher dataset (`available` → `active`), tabela etapa → evento por linha
  (todos off), interruptor geral `capi_enabled` (off), "Enviar evento de teste".
- Worker (`meta-worker`, cron 5 min + `waitUntil` no enfileiramento): lotes de até
  1000 por dataset → `POST /{dataset}/events`. `buildCapiEvent()` (puro):
  - formulário (toque com `leadgen_id`) → `user_data.lead_id` (inteiro);
  - site (`fbclid`) → `fbc = fb.1.<ms do toque>.<fbclid>` + `em`/`ph` com hash;
  - só e-mail/telefone → `em`/`ph` com hash;
  - `ctwa_clid` → `skipped: whatsapp_requires_waba` (código pronto, desligado);
  - `action_source: system_generated`, `custom_data: { event_source: "crm",
    lead_event_source: "Rev" }`, `event_time` = entrada na etapa; > 7 dias ou antes da
    criação do lead → `skipped: too_old`, **fora do lote**.
- Evento de teste: payload sintético com `test_event_code` do usuário, sem lead real,
  grava em `crm_conversion_events` com `test_event_code` e mostra `fbtrace_id`.

### 6.6 Exclusão de dados (edge pública `meta-data-deletion`)
POST `signed_request` → valida HMAC com o app secret (tempo constante) → localiza
integrações com `settings.fb_user_id` = `user_id` → desconecta (Vault + inscrições) →
grava `crm_data_deletion_requests` → `{ url: "<APP_URL>/exclusao-de-dados?code=…",
confirmation_code }`. GET `?code=` devolve o status. O mesmo endpoint atende o
**deauthorize callback**. Nota: os leads são do cliente (controlador); o que o Rev
apaga aqui é a conexão e os tokens daquela pessoa.

## 7. Lógica pura e testes

`_shared/meta.ts` (Deno, sem rede): `verifySignature`, `verifyChallenge`,
`parseLeadgenWebhook`, `parseSignedRequest`, `fieldDataToLead`, `normalizeEmail`,
`normalizePhoneE164`, `sha256Hex`, `buildFbc`, `buildCapiEvent`, `capiEventId`,
`metaErrorMessage`, `backoffDelay`, `oauthDialogUrl`. Testes com vetores conhecidos
(HMAC, hash do e-mail de exemplo do Meta, payload real do webhook).

SQL (`supabase/tests/sprint17_meta*.test.sql`, `-- @include` da migration, fixtures
filtradas por equipe): unicidade de página ativa entre equipes; enqueue idempotente;
página inativa não grava; entrada `meta_form` criada uma vez; `leadgen_id` no toque;
gatilho CAPI só com mapeamento ativo + `capi_enabled`; `event_id` estável; RLS sem
`secret_id`; state de uso único/expirado.

Front: `vitest` dos helpers da tela; `tsc -b`, `eslint`, `npm run build`.

## 8. Segurança

| Ameaça | Dia 1 (esta sprint) | Backlog Security Sprints |
|---|---|---|
| Lead entregue à equipe errada | página ativa única global; webhook resolve equipe só pela página ativa; nada de `equipe_id` do body | auditoria periódica de ativos órfãos |
| Webhook forjado / replay | HMAC-SHA256 sobre o corpo cru, tempo constante, 401 sem assinatura; idempotência `(equipe, leadgen_id)`; limite de 1 MB | rate limit por IP; alerta de pico de assinaturas inválidas |
| CSRF / sequestro da conexão | `state` aleatório, hash no banco, 10 min, uso único, amarrado a usuário+equipe da sessão; `redirect_uri` fixo | PKCE se o Meta suportar; re-autenticação para desconectar |
| Vazamento de token | Vault (conta e páginas), nunca em resposta/log; `appsecret_proof` nas chamadas; logs só com IDs e código de erro | rotação automática; alerta de token prestes a invalidar |
| Escalada de privilégio | ações só admin/owner (padrão Windsor); escrita só por verbos `security definer` validando equipe | trilha de auditoria de quem conectou/desconectou (já fica `connected_by`; tela de auditoria depois) |
| PII na fila CAPI | só hash SHA-256 de e-mail/telefone e IDs; `crm_inbound_events.payload` só IDs | retenção/expurgo automático das filas (90 dias) |
| Excesso de permissão | só as 8 permissões da config, cada uma justificada no kit | revisão a cada nova feature (WABA/IG) |
| Exclusão de dados / LGPD | endpoint de exclusão + deauthorize; registro CAPI por lead | DSAR completo pelo titular do lead |
| Abuso do worker/cron | `x-cron-secret` em tempo constante | — |

## 9. Fases (cada uma funciona sozinha)

1. **Fundação + conexão** — migration (conta, ativos, state, exclusão), `_shared/meta.ts`
   (OAuth, erros), `integrations-meta` (`config/start/connect/status/disconnect`),
   `meta-data-deletion`, rota de callback e card "Conectar com Meta".
   **Verificação empírica com a Solo**: token de página, campos do lead, leitura de
   formulários → ajusta §3 da spec. **Trilha paralela**: kit da App Review, páginas
   públicas de privacidade/exclusão, verificação do negócio.
2. **Webhook e fila** — `meta-webhook` (GET/POST, assinatura), `crm_inbound_events`,
   `activate_page/deactivate_page`, pré-sync de formulários. Teste: Lead Ads Testing
   Tool chega na fila.
3. **Lead e backfill** — extrair `ingestLead()` (testes de caracterização do
   `crm-webhook` antes), `meta-ingest`, `meta-worker` + cron, `kind meta_form` em
   Growth › Entradas, `leadgen_id` no toque, `crm_ads source 'meta'`, "Importar leads
   recentes". Teste: lead de teste no Rev com anúncio/campanha.
4. **CAPI** — mapeamentos, fila, gatilho, `buildCapiEvent`, worker de envio, evento de
   teste, registro no lead. Teste: evento visível em Testar eventos.
5. **Tela e fechamento** — erros/estados na tela, kit final, deploy, conclusão na sprint.

Cada fase: testes + `tsc` + build, PR para `main`, deploy (migration pela Management
API + `migration repair`; edges com `--use-api`).

## 10. O que fica com quem constrói (decisões minhas, corrigíveis)
- Redirecionamento OAuth em vez de JS SDK; e-mail como 2ª chave de dedup só na porta
  Meta; perguntas extras em observações + `custom_fields.meta_form`; `event_name`
  sugerido = etapa em snake_case; `lead_event_source = "Rev"`; backoff 2^n até 6 h,
  8 tentativas; filas sem expurgo nesta sprint.
