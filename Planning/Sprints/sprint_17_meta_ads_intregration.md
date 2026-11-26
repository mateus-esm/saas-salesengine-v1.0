# Sprint 17 — Integração Meta Ads: leads dos formulários direto no Rev + API de Conversões

> Prompt para o agente que vai executar esta sprint. Leia tudo antes de começar.

## Missão

Construir no Rev um botão **"Conectar com Meta"** em Integrações (`/integracoes`) para que
**cada equipe (tenant) conecte a própria conta do Meta** e:

1. **Receba os leads dos formulários instantâneos (Lead Ads) direto no Rev**, em tempo real,
   já ligados ao anúncio, ao criativo e à campanha. Sem n8n, sem Zapier, sem copiar token.
2. **Deixe pronta a comunicação com a API de Conversões (CAPI)** do Meta: conexão, escolha
   do Pixel/Dataset, fila de envio, evento de teste e mapeamento etapa do funil → evento.
   **Os eventos de MQL/SQL ficam desligados**: a definição de MQL/SQL da Solo vem depois.
   O que importa nesta sprint é a integração funcionando ponta a ponta.

É um produto SaaS **multi-tenant**: um único app do Meta do Rev, e cada cliente autoriza esse
app na conta dele. Nada pode ser específico da Solo Energia, embora ela seja o primeiro
cliente e o caso de teste em produção.

## Por quê

Hoje os leads de formulário do Meta chegam por fora ("Importação / API"), com o ID do
anúncio prefixado (`ag:120250…`), sem `leadgen_id`, e às vezes com uma mensagem de erro do
Meta no lugar do ID ("Você não tem permissão suficiente…"). Com a entrada direta o lead
chega completo e na hora. O `leadgen_id` é também a chave que a CAPI exige para devolver a
qualificação depois (MQL, SQL, venda), para o algoritmo buscar lead que compra.

## Contexto do projeto (leia antes de codar)

- Repo: `SaaS Sales Engine - v1.0 (Supabase)/saas-salesengine-v1.0`, GitHub
  `mateus-esm/saas-salesengine-v1.0`. Frontend Vite + React + TS + shadcn (deploy Netlify a
  partir da `main`). Backend Supabase (Postgres + Edge Functions Deno). Projeto
  `egxzsivzqlqadoqpgfby`.
- **Leia primeiro:**
  - `Planning/Sprints/sprint_16_track_marketing.md`: o problema original e a seção
    "Conclusão da Sprint 16" (o que já existe, números e próximos passos).
  - `docs/superpowers/specs/2026-11-23-sprint16-growth-design.md`
  - `supabase/migrations/20261123000100_sprint16_growth.sql` até `…000400…`: tabelas
    `crm_ads`, `crm_creatives`, `crm_ad_metrics`, `crm_integrations` (chave no Vault),
    `crm_record_touch` (resolve anúncio → criativo → campanha), `_crm_ad_ref`,
    `_crm_relink_touches`, `_crm_integration_store_key` / `_crm_integration_key`.
  - `supabase/migrations/20260913000100_sprint11_w5_attribution.sql`: `lead_touches`,
    `crm_entries` (portas de entrada, regra de responsável `_crm_pick_owner`),
    `_crm_touch_fields` (já lê `ad_id`, `adset_id`, `campaign_id`, `form_id`, `form_name`…).
  - `supabase/functions/integrations-windsor/index.ts` e `_shared/windsor.ts`: **é o padrão a
    seguir** (auth de admin, chave por equipe no Vault, cron com `x-cron-secret`, funções
    puras testáveis em `_shared`).
  - `supabase/functions/crm-webhook/index.ts` + `_shared/attribution.ts`,
    `_shared/opportunities.ts`, `_shared/lead-identity.ts`, `_shared/phone.ts`,
    `_shared/inbound-filter.ts`: como um lead de entrada é criado hoje (identidade por
    telefone/e-mail, negócio, linha da entrada, toque). **Reuse esse caminho**, não crie
    um segundo jeito de criar lead.
  - `src/pages/Integrations.tsx` (galeria; os cards "Meta Lead Ads" e "Meta · API de
    Conversões" estão como "Em breve"), `src/hooks/useGrowth.ts`, `src/lib/growth.ts`.
- **Convenções:**
  - Escrita no banco só por verbos `security definer`, RLS de leitura por equipe, segredos
    no Vault (nunca em migration, log ou resposta).
  - Testes SQL: `bash scripts/sqltest.sh supabase/tests/<x>.test.sql`. Roda **contra
    produção dentro de BEGIN…ROLLBACK** (não há Docker). Use `-- @include` da migration e
    filtre sempre por `equipe_id` das fixtures (produção tem dados reais).
  - Deno: `cd supabase/functions && deno test _shared/<x>.test.ts`. Front: `npx vitest run`,
    `npx tsc -b`, `npx eslint`, `npm run build`.
  - Comentários e textos de tela em português; nomes de código em inglês.
  - Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Deploy (importante):**
  - **Não use `supabase db push`**: o histórico de migrations de produção está desalinhado
    e ele re-rodaria migrations antigas.
  - Aplique **só o arquivo novo** pela Management API
    (`POST https://api.supabase.com/v1/projects/<ref>/database/query`, com begin/commit,
    lendo `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_ID` do `.env` sem o `\r`), depois rode
    `supabase migration repair --status applied <versão> --linked`.
  - Edge functions: `supabase functions deploy <nome> --project-ref <ref> --use-api`.
    Função pública (webhook) precisa de `verify_jwt = false` em `supabase/config.toml`.
  - `main` é protegida: abra o PR, espere "Frontend build gate" e "Backend unit tests"
    passarem e faça `gh pr merge <n> --squash --delete-branch` (auto-merge não está
    habilitado no repo).
- Equipe Solo Energia: `equipe_id = 939d7dd8-592c-4fda-946e-3568f2909904`.

## Arquitetura pedida

### 1. App do Meta (um só, do Rev)

- O app é criado pelo Mateus em developers.facebook.com, no Business da Solo Ventures, com
  **Facebook Login for Business** (configuration ID). Você precisa receber dele:
  `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID` e um
  `META_WEBHOOK_VERIFY_TOKEN` (você pode gerar e pedir para ele colar no app).
  - Segredos da edge vão por `supabase secrets set`.
  - O front precisa de `VITE_META_APP_ID` e `VITE_META_LOGIN_CONFIG_ID` no Netlify. Peça
    ao Mateus, ou coloque num endpoint público de config da edge para não depender do
    Netlify.
- Permissões prováveis: `pages_show_list`, `pages_read_engagement`,
  `pages_manage_metadata`, `leads_retrieval`, `ads_read` (nomes de anúncio/campanha),
  `business_management`, e para CAPI o que a doc atual exigir para enviar eventos ao
  dataset.
- **Confirme na documentação oficial atual do Meta antes de codar**: permissões, versão da
  Graph API, formato do webhook, campos do lead e requisitos da CAPI para CRM. Use o agente
  `web-fetch` para ler as páginas. Não confie na memória para nomes de campos e versões.
- **App Review e verificação do negócio** são necessários para clientes que não têm papel no
  app. Até lá, a conexão funciona para quem tem papel no app (Mateus/Solo Energia): teste com
  ela. Prepare o que a revisão pede: texto de uso de cada permissão, roteiro do vídeo, URL de
  política de privacidade e **URL/callback de exclusão de dados** (implemente o endpoint se
  ainda não existir).

### 2. Conectar (por equipe)

- Card "Meta" em Integrações → **"Conectar com Meta"** (Login for Business com o config ID)
  → o front recebe o código/token e manda para uma edge nova (sugestão: `integrations-meta`,
  ação `connect`, só admin/owner, mesmo padrão do Windsor). A edge:
  1. troca por token de longa duração (ou usa o token de system user da config, se a
     configuração de Login for Business entregar um);
  2. lista as páginas (`/me/accounts`, com os tokens de página) e as contas de anúncio /
     datasets que o usuário pode usar;
  3. guarda os tokens **no Vault** (estender `crm_integrations.provider` para `'meta'` e
     reusar `_crm_integration_store_key`, ou criar uma tabela `crm_meta_pages` com
     `secret_id` por página, já que cada página tem o próprio token);
  4. devolve a lista de páginas para a tela.
- Na tela o admin **escolhe as páginas** a receber leads. Para cada uma a edge faz
  `POST /{page-id}/subscribed_apps` com `subscribed_fields=leadgen` e guarda o estado
  (inscrita, erro, quando).
- Mostre na tela: páginas conectadas, último lead recebido, erros, botão "Reconectar"
  (token expirado/revogado), "Desconectar" (apaga do Vault e cancela a inscrição) e o aviso
  sobre o **Gerenciador de acesso a leads** do Business (se estiver ativo, o cliente precisa
  liberar o app do Rev lá).

### 3. Receber o lead (webhook público, um só para todos os tenants)

- Edge pública (sugestão: `meta-webhook`, `verify_jwt = false`):
  - **GET**: verificação do Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`).
  - **POST**: valida a assinatura `X-Hub-Signature-256` (HMAC-SHA256 do corpo com o app
    secret, comparação em tempo constante; recuse sem assinatura válida). Para cada mudança
    `leadgen` (`leadgen_id`, `page_id`, `form_id`, `ad_id`, `adgroup_id`, `created_time`):
    descubra a equipe pela página, **grave o evento numa fila** e responda 200 rápido.
- Processamento (worker/cron, padrão `outreach-worker`/Windsor):
  - busca o lead completo na Graph API com o token da página: `field_data`, `ad_id`,
    `ad_name`, `adset_*`, `campaign_*`, `form_id`, `created_time`, `is_organic`,
    `platform`;
  - pega o nome do formulário;
  - cria/atualiza o lead pelo caminho existente (identidade por telefone/e-mail, negócio
    na linha certa, responsável pela regra da entrada) e registra o toque com
    `crm_record_touch` passando `ad_id`, `adset_id`, `campaign_id`, `campaign_name`,
    `ad_name`, `form_id`, `form_name`, `leadgen_id`.
  - O anúncio casa pelo ID e herda campanha e criativo. Se o anúncio ainda não existir no
    Rev, crie o `crm_ads` (`source` novo, ex. `meta`) com os IDs que vieram, para o Windsor
    completar depois.
- **Idempotência**: `leadgen_id` único por equipe (o Meta reenvia). Erro na Graph API → nova
  tentativa com backoff, e o erro fica visível na tela.
- **Guarde o `leadgen_id`** no toque: coluna nova em `lead_touches` e no `_crm_touch_fields`.
  É a chave da CAPI.
- **Uma entrada por formulário**: estenda `crm_entries` (novo `kind`, ex. `meta_form`, com
  `meta_form_id`/`page_id`), criada no primeiro lead do formulário. Assim o admin escolhe em
  **Growth › Entradas** o funil, o responsável, a campanha padrão e o carimbo de cada
  formulário. Canal padrão: Social Pago · Meta.
- **Mapeamento de campos do formulário**: nome, e-mail e telefone pelos nomes padrão do Meta
  (`full_name`, `email`, `phone_number`…); as demais perguntas vão para observações ou campo
  personalizado. Opcional: tela de mapeamento por formulário, reaproveitando a ideia do
  "Mapeamento de campos" do webhook de entrada.
- **Backfill**: botão "Importar leads recentes" por formulário (`GET /{form-id}/leads`, o
  Meta guarda cerca de 90 dias) com a mesma deduplicação. Útil para a Solo não perder o que
  chegou antes da conexão.

### 4. API de Conversões (infra pronta, eventos de MQL/SQL desligados)

- Na mesma conexão o admin escolhe o **Pixel/Dataset** (confirme na doc qual
  permissão/token envia eventos ao dataset).
- Tabela de **mapeamento etapa do funil → evento** (por linha/pipeline: etapa, nome do
  evento, ativo sim/não), com a tela em Integrações › Meta. Tudo desligado por padrão.
- Fila de envio `crm_conversion_events`: equipe, lead, negócio, evento, `event_id` único
  (deduplicação no Meta), payload enviado (só dados com hash), status, tentativas, resposta,
  enviado_em. **Registro por lead** (LGPD) visível no lead.
- Gatilho: quando o negócio entra numa etapa mapeada e ativa (use `funnel_events` / o mesmo
  ponto que dispara o webhook `stage_entered`), enfileira; um worker envia para
  `POST /{dataset-id}/events`.
  - Chave pela origem: formulário → `lead_id` (= `leadgen_id`); site → `fbc` do `fbclid` +
    e-mail/telefone normalizados e com SHA-256; WhatsApp (`ctwa_clid`) → **verifique na doc**
    se exige conta oficial do WhatsApp Business; se exigir, deixe implementado mas
    desabilitado e documente.
  - `action_source` / `custom_data` conforme a doc de "CAPI para CRM" (ex.
    `event_source: crm`, `lead_event_source: Rev`).
- Botão **"Enviar evento de teste"** com `test_event_code` (aparece no Gerenciador de
  Eventos) para validar a conexão sem ligar nada.
- Fora desta sprint: definir MQL/SQL e ligar os eventos reais; Google (conversões
  offline/gclid); Lead Form do Google Ads.

## Entregáveis

1. Spec curta em `docs/superpowers/specs/2026-11-24-sprint17-meta-integration-design.md`
   (decisões, o que confirmou na doc do Meta, com links).
2. Migration(s) `supabase/migrations/2026112400xxxx_sprint17_meta_*.sql` + testes SQL.
3. Edges `integrations-meta` (conectar, páginas, inscrever, datasets, evento de teste,
   backfill, desconectar) e `meta-webhook` (verificação, assinatura, fila) + worker/cron de
   processamento e de envio CAPI. Lógica pura em `_shared/meta.ts` com testes Deno
   (assinatura, parsing do webhook, `field_data` → lead, normalização e hash de e-mail e
   telefone, montagem do evento CAPI).
4. Tela em Integrações (card Meta: conectar, páginas, formulários, Pixel/Dataset,
   mapeamento etapa → evento, teste, erros) e o `kind` novo em Growth › Entradas.
5. Kit da App Review: texto por permissão, roteiro do vídeo, URLs necessárias.
6. Deploy completo (seguindo "Deploy" acima) e teste real com a Solo Energia: um lead de
   teste pela **Ferramenta de teste de anúncios de cadastro do Meta** (Lead Ads Testing
   Tool) chegando no Rev com anúncio/campanha, e um evento de teste visível no Gerenciador
   de Eventos.
7. Atualizar `Planning/Sprints/sprint_17_meta_ads_intregration.md` com uma seção
   "Conclusão" (o que foi entregue, números, pendências da App Review, próximos passos).

## Como trabalhar

- Comece lendo o código citado e a doc oficial atual do Meta. Depois escreva a spec e um
  plano curto e **mostre ao Mateus antes de codar**, junto com a lista do que precisa dele
  (credenciais do app, se o Business é verificado, URLs de privacidade/exclusão).
- Trabalhe em branch (`feat/sprint17-meta`) e em fases que já funcionam sozinhas:
  1. conexão e páginas;
  2. webhook e fila;
  3. criação do lead e backfill;
  4. CAPI e evento de teste;
  5. tela e kit da revisão.
- Nunca imprima tokens ou segredos em log, saída de terminal, resposta de API ou commit.
- Erros do Meta (token expirado, permissão faltando, página sem acesso a leads) precisam
  virar mensagem clara na tela, não só log.
- Ao terminar cada fase: testes, `tsc`, build. Só declare pronto com evidência.

## Conclusão (25/11/2026)

### Entregue
- **Fase 1** (PR #76, em produção desde 24/11): Login for Business (token system-user), ativos
  (páginas, contas de anúncio, pixels) no Vault, state do OAuth de uso único, exclusão de dados
  (`meta-data-deletion` + página `/exclusao-de-dados`), card "Conectar com Meta", kit da App Review.
- **Fases 2–5** (branch `feat/sprint17-meta-leads`, 6 commits):
  - `meta-webhook` (público): verificação GET, assinatura `X-Hub-Signature-256` sobre o corpo cru,
    limite de 1 MB, equipe só pela página **ativa**, fila idempotente por equipe + `leadgen_id`,
    processamento na hora (`waitUntil`). `leadgen_id` de 17 dígitos preservado (nunca `Number`).
  - Fila `crm_inbound_events` com backoff 2^n min até 6 h, 8 tentativas → `dead`, erro de token
    não queima tentativa e para a fila da equipe até reconectar. Botão "Tentar de novo".
  - Lead pelo **mesmo caminho** do webhook de entrada: núcleo extraído para
    `_shared/ingest-lead.ts` (caracterizado em teste) e usado pela rota `/inbound` do `crm-webhook`
    e pelo Meta. E-mail como 2ª chave só na porta Meta; perguntas extras → observações +
    `custom_fields.meta_form`. Anúncio criado/completado (`crm_ads.source 'meta'`, campanha ligada)
    **antes** do toque, para o toque herdar campanha e criativo. `leadgen_id` em `lead_touches`.
  - Uma entrada `meta_form` por formulário (Growth › Entradas: linha, responsável, campanha,
    canal Social Pago · Meta). Importar leads recentes (7/30/90 dias), sem saudação automática.
  - CAPI: `crm_conversion_mappings` (tudo desligado), fila `crm_conversion_events` com `event_id` =
    sha256(equipe:negócio:etapa:evento), gatilho em `opportunity_stage_history` (nunca derruba a
    mudança de etapa), envio em lote por dataset, chave formulário → `lead_id`; site → `fbc` +
    hash; WhatsApp (`ctwa_clid`) → pulado `whatsapp_requires_waba` (exige WABA oficial). Evento de
    teste com `test_event_code`. Registro por lead (LGPD) no bloco Origem do lead.
  - `meta-worker` (cron 5 min via `_crm_meta_tick`, segredo no Vault) para a fila de entrada e a CAPI.
  - Tela: páginas com "receber leads", fila/erros, formulários + importar, CAPI (pixel, interruptor,
    etapa → evento, teste, últimos envios).

### Números
- Testes Deno: 41 (meta, meta-graph, meta-leads, meta-ingest, meta-capi) + 5 ingest-lead + 7 crm-webhook.
- Testes SQL: `sprint17_meta_leads` e `sprint17_meta_capi` PASS (contra produção, rollback).
- Front: vitest 34/34 nos arquivos tocados; suíte completa 832/833 (1 flaky antigo); `tsc`, eslint e build OK.

### Pendências
- **Deploy das Fases 2–5**: migrations `20261124000200`/`000300` (Management API + `migration repair`),
  segredo `META_WORKER_SECRET` + Vault `meta_worker_url`/`meta_worker_secret`, deploy de
  `meta-webhook meta-worker integrations-meta crm-webhook`, PR → checks → merge.
- **Credenciais do app** (Mateus): `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`,
  `META_REDIRECT_URI` ainda não estão nos segredos. Sem elas o card mostra "app não configurado".
- **Teste real com a Solo** (depois das credenciais): conectar, ligar a página, Lead Ads Testing Tool
  → lead no Rev com anúncio/campanha; "Enviar evento de teste" → Gerenciador de Eventos. Rodar o
  "Diagnóstico" e atualizar §3 da spec (token de página, campos do lead, `leadgen_forms`).
- **App Review / Verificação do Negócio**: ver `docs/meta-app-review-kit.md` (URLs, texto por
  permissão, roteiro do vídeo, checklist).

### Próximos passos
- Definir MQL/SQL da Solo e ligar os eventos reais na tela da CAPI.
- Tela de mapeamento de campos por formulário (hoje: padrão do Meta + observações).
- Expurgo automático das filas (90 dias); WhatsApp oficial (WABA) e Instagram no mesmo app.
