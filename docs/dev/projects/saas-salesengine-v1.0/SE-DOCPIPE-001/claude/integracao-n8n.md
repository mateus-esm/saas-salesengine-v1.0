# SE-DOCPIPE-001 — Contrato HTTP da esteira de propostas e contratos

Documento operacional: o que o Rev manda ao n8n, o que o n8n devolve, como se
autentica, como a idempotência funciona e o que configurar na Solo Energia.
Nada aqui foi executado contra produção.

Base: o contrato do artefato v1 da Sprint 11 · Onda 4
(`Planning/Architecture/contrato_artefato_v1.md`). Esta entrega **estende** esse
contrato (tudo é aditivo: quem segue a v1 continua funcionando) e acrescenta uma
porta de entrada por ID.

---

## 1. Limite desta entrega

Os workflows `Solo Energia | Proposal Engine v1` e `Solo Energia | Contract
Engine v1` são infraestrutura operada e vendida pelo dono. **Nenhum workflow n8n
foi alterado.** A integração é pelo contrato HTTP do Rev, descrito abaixo. As
adaptações que o dono precisa fazer nos nós HTTP estão listadas na seção 8.

Fluxo alvo:

```
Formulário do Rev / Registro (botão)
  → fila de saída do CRM (webhook_configs → webhook_logs → deliver-crm-webhook)
  → n8n (APITemplate / merge / Clicksign)
  → artifact-callback (token da execução)  ou  artifact-inbound (segredo do tenant, por ID)
  → registro atualizado (campos, arquivos no bucket privado, status → marco do negócio)
```

---

## 2. As quatro informações pedidas, no Rev

| Pedido (Jestor) | Onde mora no Rev | Tipo |
| :-- | :-- | :-- |
| `proposal_pdf_url` | Propostas Comerciais · `pdf` (+ `link_pdf`, opcional) | arquivo no bucket privado (+ URL) |
| `contract_pdf_url` | Contratos · `contrato_pdf` (enviado) e `contrato_assinado` (assinado) | arquivo no bucket privado |
| `clicksign_document_id` | Contratos · `clicksign_document_id` | texto |
| `signature_status` | status do artefato do Contrato (`draft` → `sent` → `signed` / `rejected`) | coluna nativa `artifact_status` |

Os registros de proposta e contrato ficam **presos ao negócio**
(`custom_table_records.opportunity_id`) e aparecem no painel do negócio. O
porquê desta escolha está em `implementacao.md` §2.

Nas respostas ao Rev, **tudo é por `key`** (os nomes da tabela acima), nunca
pelo rótulo nem pelo `field_id`.

---

## 3. Saída: Rev → n8n

### 3.1 Quando sai

- **Clique no botão** do registro (ex.: "Gerar proposta", "Enviar contrato").
  `trigger: "button"`.
- **Envio do formulário público** do registro, quando a tabela configura
  "Ao enviar, disparar" (ex.: o cliente envia os Dados para Contrato → o
  Contract Engine é chamado). `trigger: "form_submit"`.

Cada botão é um `webhook_configs` da equipe com evento `artifact_action:<id>`;
a entrega é a da fila de saída de sempre (`deliver-crm-webhook`), e aparece nos
logs de webhook. Um POST por clique.

### 3.2 O payload

`POST <URL configurada no botão>`, `Content-Type: application/json`. É o
payload v1 com duas chaves novas: `trigger` e `deal_artifacts`.

```json
{
  "version": 1,
  "run_id": "5f0c…",
  "trigger": "button",
  "action": { "id": "9b1e…", "label": "Enviar contrato" },
  "table": { "id": "c2d4…", "name": "Contratos", "kind": "contract" },
  "record": {
    "id": "a7f3…",
    "status": "draft",
    "created_at": "2026-09-26T14:03:11Z",
    "fields": {
      "nome_completo": "João da Silva",
      "cpf_cnpj": "000.000.000-00",
      "clicksign_document_id": null,
      "contrato_pdf": null,
      "contrato_assinado": null
    }
  },
  "deal": { "id": "e81a…", "value": 32000, "status": "open", "stage": { "id": "…", "name": "Proposta" }, "pipeline": { "id": "…", "name": "Vendas" }, "owner": { "id": "…", "name": "Luiz", "email": "luiz@solo.test" }, "fields": { "consumo_kwh": 850 } },
  "contact": { "id": "…", "name": "João da Silva", "phone": "5585999990000", "email": "joao@solar.test" },
  "items": [{ "name": "Usina 8 kWp", "quantity": 1, "unit_price": 32000, "total": 32000 }],
  "deal_artifacts": [
    {
      "table": { "id": "…", "name": "Propostas Comerciais", "kind": "proposal" },
      "record": {
        "id": "…",
        "status": "sent",
        "created_at": "2026-09-20T10:00:00Z",
        "fields": {
          "potencia_kwp": 8,
          "link_pdf": "https://…/proposta.pdf",
          "pdf": [{ "name": "Proposta João.pdf", "size": 120331, "type": "application/pdf",
                    "path": "939d…/c1…/a1…/7e2…-proposta-joao.pdf" }]
        }
      }
    }
  ],
  "callback": {
    "url": "https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/artifact-callback",
    "token": "64 caracteres hexadecimais",
    "expires_at": "2026-10-03T14:05:00Z"
  }
}
```

- `deal_artifacts`: os **outros** artefatos vivos do mesmo negócio (até 20),
  propostas primeiro, mais recentes primeiro. É assim que o Contract Engine acha
  a proposta para mesclar com o contrato.
- Arquivo sai como `[{ name, size, type, path }]`. O armazenamento é privado:
  para baixar, troque o `path` por uma URL curta na §6.
- `record.fields` / `deal.fields` continuam por `key`; consulta sai com o valor
  de agora; relação sai como `[{ id, label }]`.

### 3.3 Autenticação da saída

O Rev não assina o POST de saída na v1: a URL do webhook do n8n (caminho
aleatório) é o segredo, e o n8n só age sobre o que o Rev mandou pelo `run_id` +
`callback.token`. Se o dono quiser um header fixo (ex.: `x-rev-secret`), a fila
de saída já envia `webhook_configs.headers` — hoje o editor de botões não expõe
esse campo; ver pendências em `implementacao.md`.

---

## 4. Retorno por token: n8n → `artifact-callback`

Caminho principal, igual à v1, com duas extensões.

```http
POST https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/artifact-callback
Content-Type: application/json

{
  "token": "<callback.token recebido>",
  "event_id": "clicksign:<id do evento>",
  "status": "sent",
  "fields": { "clicksign_document_id": "…" },
  "files": [{ "url": "https://…/contrato-mesclado.pdf", "field": "contrato_pdf", "name": "Contrato João.pdf" }],
  "keep_open": true
}
```

Sem header de autenticação: **o token é a credencial** (uso único por
execução, guardado só como hash, amarrado a um registro).

| Campo | O que faz |
| :-- | :-- |
| `token` | Obrigatório. |
| `status` | Proposta: `draft`, `sent`, `accepted`, `rejected`. Contrato: `draft`, `sent`, `signed`, `rejected`. Proposta `sent` e contrato `sent`/`signed` movem o negócio pelo marco. |
| `fields` | Por `key`. Consulta, relação e arquivo não se escrevem assim; key desconhecida é ignorada e listada em `fields_ignored`. |
| `files` | Até 10, https, host público, 25 MB, até 3 redirecionamentos. Baixados para o bucket privado. `field` = key da coluna de arquivo; sem `field`, vai para a **primeira** coluna de arquivo da tabela (em Contratos: `contrato_assinado`). |
| `error` | A automação falhou: a execução fecha como falha, nada é aplicado. |
| `keep_open` | Ainda vem outra resposta (enviado agora, assinado depois). **Novo:** renova o token para 30 dias a partir de agora (nunca menos do que já valia; teto de 90 dias desde o clique). |
| `event_id` | **Novo, opcional, recomendado com `keep_open`.** Texto (ou número) até 200 caracteres. O mesmo `event_id` duas vezes na mesma execução é aplicado uma vez só. |

### Idempotência

- Resposta **final** (sem `keep_open`): o token é de uso único. Repetir devolve
  `410 token_used` — trate como "já aplicado".
- Resposta **com `keep_open`**: mande `event_id` (o id do evento do Clicksign, ou
  `n8n:<execution id>`). Repetir devolve `200 { status: "duplicate" }` e nada é
  reaplicado (nem campo, nem arquivo, nem status).
- `409 callback_in_progress`: outra resposta com o mesmo token está sendo
  aplicada agora. Tente de novo em até 5 minutos.

### Respostas

| HTTP | Corpo | Quando |
| :-- | :-- | :-- |
| 200 | `{ ok, run_id, status: "completed" \| "open", fields_applied, fields_ignored, files, artifact_status, moved, event, event_id?, expires_at? }` | Aplicado (`open` com `keep_open`, com a nova validade em `expires_at`). |
| 200 | `{ ok: true, run_id, status: "duplicate", event_id }` | Esse `event_id` já tinha sido aplicado. |
| 200 | `{ ok, run_id, status: "failed", error }` | Veio `error`: a execução fechou como falha. |
| 400 | `token_required`, `event_id_invalid`, `fields_must_be_object`, `file_needs_url`… | O corpo não é do contrato. |
| 404 | `token_invalid` | Token desconhecido. |
| 409 | `callback_in_progress` | Outra resposta do mesmo token em andamento. |
| 410 | `token_used`, `token_expired` | Já encerrado, ou passou da validade. Para status depois disso, use a §5. |
| 422 | `invalid_artifact_status`, `invalid_file_field`, `unsafe_file_url`, `file_download_failed` | O registro não aceita o que veio. O token continua valendo: corrija e reenvie. |

---

## 5. Entrada por ID: n8n → `artifact-inbound` (`action: "update"`)

Para o que chega **fora de uma execução aberta**: o Clicksign avisa que assinou
depois que o token venceu, o n8n re-sincroniza um status, ou o fluxo prefere
atualizar "por ID" como fazia no Jestor.

```http
POST https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/artifact-inbound
x-webhook-secret: <equipes.webhook_secret da Solo Energia>
Content-Type: application/json

{
  "action": "update",
  "event_id": "clicksign:<id do evento>",
  "match": { "key": "clicksign_document_id", "value": "<id do documento no Clicksign>" },
  "status": "signed",
  "files": [{ "url": "https://…/contrato-assinado.pdf", "field": "contrato_assinado" }]
}
```

### Autenticação

A mesma do `start-conversation` e do `outreach` (`_shared/tenant-auth.ts`):

- `x-webhook-secret: <equipes.webhook_secret>` — o segredo que o tenant já usa
  no `crm-webhook`; não há segredo novo para distribuir. `?secret=<…>` na query
  também funciona, para nós HTTP que não deixam definir header.
- `Authorization: Bearer <SERVICE_ROLE_KEY>` com `equipe_id` no corpo, para
  chamadas internas.
- `Authorization: Bearer <JWT de usuário>` do time.

O segredo identifica a equipe; registro de outra equipe responde
`404 record_not_found`.

### O registro

Um dos dois:

- `record_id`: o `record.id` que veio no payload da §3.
- `match: { key, value, table_id? }`: um campo gravável (texto, número…) com
  esse valor, só em tabelas de artefato da equipe; `table_id` restringe a uma
  tabela. Nenhum registro → `404`; mais de um → `409 record_ambiguous`.

### O corpo

`status`, `fields` e `files` com as mesmas regras da §4 (é o mesmo núcleo de
aplicação no banco: `_crm_artifact_apply`). Pelo menos um dos três é
obrigatório. Não há `keep_open` nem `error`: não existe execução para abrir ou
fechar.

### Idempotência

`event_id` é **obrigatório** (até 200 caracteres). Chave única por equipe:

- já aplicado → `200 { duplicate: true, … resultado anterior }`, nada muda;
- em andamento há menos de 5 minutos → `409 event_in_progress`;
- falhou antes (corpo recusado, download falho) → o mesmo `event_id` pode voltar;
- o mesmo `event_id` para **outro** registro → `409 event_id_reused`.

Use o id do evento do provedor (`clicksign:<id>`) ou `n8n:<execution id>:<item>`.
Retry no n8n é seguro.

### Respostas

| HTTP | Corpo | Quando |
| :-- | :-- | :-- |
| 200 | `{ ok, duplicate: false, event_id, record_id, fields_applied, fields_ignored, files, artifact_status, moved, event }` | Aplicado. |
| 200 | `{ ok, duplicate: true, event_id, record_id, …resultado anterior }` | Evento já aplicado. |
| 400 | `event_id_required`, `record_required`, `record_id_invalid`, `match_needs_key_and_value`, `nothing_to_apply`… | Corpo fora do contrato. |
| 401 | `invalid_secret`, `unauthorized` | Credencial errada ou ausente. |
| 404 | `record_not_found` | Registro não existe nessa equipe (ou não é artefato). |
| 409 | `record_ambiguous`, `event_in_progress`, `event_id_reused` | Ver acima. |
| 422 | `invalid_artifact_status`, `invalid_file_field`, `unsafe_file_url`, `file_download_failed` | O registro não aceita; corrija e reenvie com o mesmo `event_id`. |

O rastro fica em `public.artifact_inbound_events` (equipe, `event_id`,
registro, status, resultado, erro).

---

## 6. Arquivo do Rev para o n8n: `artifact-inbound` (`action: "file_url"`)

O Contract Engine precisa do PDF da proposta para mesclar. O bucket é privado;
esta chamada troca o `path` que veio no payload por uma URL assinada de 5 minutos.

```http
POST https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/artifact-inbound
Content-Type: application/json

{
  "action": "file_url",
  "token": "<callback.token da execução em andamento>",
  "path": "939d…/c1…/a1…/7e2…-proposta-joao.pdf"
}
```

Autenticação: o `token` de uma execução **ainda aberta** (não encerrada, não
vencida) — é o caso natural dentro do Contract Engine — **ou** o
`x-webhook-secret` do tenant. Só assina caminho dentro da pasta da própria
equipe no bucket (`<equipe_id>/…`).

| HTTP | Corpo |
| :-- | :-- |
| 200 | `{ ok: true, url, expires_in: 300 }` |
| 401 | `token_invalid` / `invalid_secret` |
| 403 | `path_not_allowed` |
| 404 | `file_not_found` |

---

## 7. Configurar a Solo Energia (tela, sem código)

As tabelas "Propostas Comerciais" e "Contratos" já existem (semente da T46,
aplicada em 12/09). Depois do deploy:

1. **Colunas novas dos Contratos** — `supabase/scripts/2026-09-26_sedocpipe001_solo_contract_columns.sql`
   (idempotente; acrescenta `clicksign_document_id` e `contrato_pdf`).
2. **Propostas Comerciais → Ações**: botão "Gerar proposta" → URL do webhook do
   Proposal Engine.
3. **Contratos → Ações**: botão "Enviar contrato" → URL do webhook do Contract
   Engine.
4. **Contratos → Formulário → "Ao enviar, disparar"**: "Enviar contrato", se o
   dono quiser que o envio dos Dados para Contrato já dispare o contrato (como no
   Jestor). Deixar em "Nenhuma automação" mantém o disparo manual pelo botão.

---

## 8. O que o n8n precisa ler/mandar (adaptação do dono, não feita aqui)

**Proposal Engine** (botão "Gerar proposta"):

1. Webhook de entrada recebe o payload da §3 (dados em `record.fields`,
   `contact`, `items`, `deal.fields`).
2. Gera o PDF no APITemplate.
3. `POST callback.url` com
   `{ token, status: "sent", files: [{ url: <download_url do APITemplate>, field: "pdf" }], fields: { link_pdf: <mesma URL> } }`.
   Em falha: `{ token, error: "<motivo>" }`.

**Contract Engine** (botão "Enviar contrato" ou envio do formulário):

1. Webhook de entrada recebe o payload da §3. A proposta está em
   `deal_artifacts[]` com `table.kind = "proposal"` (a primeira é a mais recente).
2. Para o PDF da proposta: `POST artifact-inbound { action: "file_url", token: callback.token, path: <pdf[0].path> }` → baixa pela `url`.
3. Gera o contrato, mescla proposta + contrato, cria o documento no Clicksign.
   **Guarde `record.id` (e o `callback.token`) nos metadados do documento do
   Clicksign ou num Data Store do n8n** — é o que liga o evento de assinatura de
   volta ao registro.
4. `POST callback.url` com
   `{ token, event_id: "n8n:<execution id>", status: "sent", keep_open: true, fields: { clicksign_document_id: "<id>" }, files: [{ url: <PDF mesclado>, field: "contrato_pdf" }] }`
   → contrato "Enviado", negócio para "Contrato enviado", token renovado por 30 dias.
5. Webhook do Clicksign (assinado/recusado):
   - com o token ainda válido: `POST callback.url` com `{ token, event_id: "clicksign:<evento>", status: "signed", files: [{ url: <PDF assinado>, field: "contrato_assinado" }] }` (sem `keep_open`: encerra);
   - sem token (ou vencido, `410`): `POST artifact-inbound` com `x-webhook-secret`,
     `{ event_id: "clicksign:<evento>", match: { key: "clicksign_document_id", value: "<id>" }, status: "signed", files: [...] }`.
   - recusado/cancelado: `status: "rejected"`.

---

## 9. Deploy (etapa posterior, com aprovação)

```bash
# 1. esquema (aditivo: create or replace / add if not exists)
supabase db push            # aplica 20260926100000_sedocpipe001_document_pipeline.sql

# 2. ensaio do esquema contra o projeto linkado (BEGIN … ROLLBACK)
bash scripts/sqltest.sh supabase/tests/sedocpipe001_document_pipeline.test.sql
bash scripts/sqltest.sh supabase/tests/sprint11_w4_artifact_actions.test.sql supabase/tests/sprint11_w4_public_forms.test.sql

# 3. as funções (verify_jwt = false já está no config.toml)
supabase functions deploy artifact-callback
supabase functions deploy artifact-inbound

# 4. frontend (editor do formulário + trava do botão)

# 5. colunas da Solo (com aprovação do dono)
#    supabase/scripts/2026-09-26_sedocpipe001_solo_contract_columns.sql
```

Ordem importa: a migration vem **antes** da edge `artifact-callback` nova (ela
chama `_crm_artifact_callback_apply`). A edge antiga continua funcionando com a
migration aplicada (a assinatura `_crm_artifact_callback_finish` foi mantida).
Nenhum segredo novo.

### Smoke, nesta ordem

1. **Botão sem URL real.** Configurar "Gerar proposta" apontando para um
   webhook de teste do n8n que só registra o corpo. Clicar num negócio de teste:
   o botão gira e fica desabilitado; o log de webhook mostra `trigger: "button"`.
2. **Callback de proposta.** Responder à mão com `{ token, status: "sent", files: [{ url: <um PDF público>, field: "pdf" }] }`
   → PDF no registro, proposta "Enviada", negócio na etapa do marco.
3. **Contrato com `deal_artifacts`.** Clicar "Enviar contrato" no mesmo negócio:
   o payload traz a proposta; `file_url` com o `path` devolve uma URL que baixa o PDF.
4. **keep_open + idempotência.** Responder `{ token, event_id: "t-1", status: "sent", keep_open: true }`
   duas vezes: a segunda volta `duplicate`; `expires_at` passou a ~30 dias.
5. **Entrada por ID.** `artifact-inbound` com o segredo da equipe,
   `match: clicksign_document_id`, `status: "signed"`, `event_id: "t-2"`; repetir
   → `duplicate: true`. Segredo errado → `401`.
6. **Formulário.** Ligar "Ao enviar, disparar" nos Contratos, gerar link, enviar
   pelo `/f/:token`: o log de webhook mostra `trigger: "form_submit"` com os dados
   recém-preenchidos.
7. **Ponta a ponta com o dono**, apontando para os workflows reais adaptados e
   um documento de teste no Clicksign.

### Rollback

- Parar os disparos: remover os botões na tela (o webhook fica desligado) e pôr
  "Ao enviar, disparar" em "Nenhuma automação".
- Funções: republicar a versão anterior de `artifact-callback`; `artifact-inbound`
  pode ficar publicada sem uso (sem segredo, nada entra).
- Esquema: nada a desfazer — a migration não remove nada; as funções antigas
  continuam com as mesmas assinaturas. Não apagar `artifact_inbound_events` (é
  o rastro).
