# Contrato do artefato · v1

> Sprint 11 · Onda 4 · T44 (decisão 26). Vale para qualquer automação (n8n, Make,
> um servidor próprio) que responda a um botão de ação de uma tabela de artefato.
> Os fluxos da Solo Energia (APITemplate, ClickSign) se adaptam a este contrato.

## Como funciona

1. Numa tabela de artefato (Propostas, Contratos), **Ações** define botões:
   rótulo + URL (o webhook do n8n).
2. No registro, o botão manda o **payload** abaixo para a URL, pela fila de saída
   do CRM (a mesma dos outros webhooks; a entrega aparece nos logs de webhook).
3. A automação faz o trabalho (gera o PDF, manda para assinatura) e **responde**
   com um POST para `callback.url`, levando `callback.token`.
4. O CRM aplica a resposta: campos, arquivos (baixados para o armazenamento
   privado) e status. O status pode mover o negócio (proposta enviada, contrato
   enviado/assinado).

O token é de **uso único**, vale **7 dias** e só existe no payload (o CRM guarda
o hash). Sem o token, a resposta é recusada.

## O payload (CRM → automação)

`POST` na URL da ação, `Content-Type: application/json`.

```json
{
  "version": 1,
  "run_id": "5f0c…",
  "action": { "id": "9b1e…", "label": "Gerar proposta" },
  "table": { "id": "c2d4…", "name": "Propostas Comerciais", "kind": "proposal" },
  "record": {
    "id": "a7f3…",
    "status": "draft",
    "created_at": "2026-09-12T14:03:11Z",
    "fields": {
      "titulo": "Proposta 8 kWp",
      "potencia_kwp": 8,
      "cliente": "João Solar",
      "pdf": [{ "name": "rascunho.pdf", "size": 120331, "type": "application/pdf", "path": "…" }],
      "usina": [{ "id": "0b9d…", "label": "Usina Norte" }]
    }
  },
  "deal": {
    "id": "e81a…",
    "value": 32000,
    "status": "open",
    "stage": { "id": "…", "name": "Proposta" },
    "pipeline": { "id": "…", "name": "Vendas" },
    "owner": { "id": "…", "name": "Luiz", "email": "luiz@solo.test" },
    "fields": { "consumo_kwh": 850, "concessionaria": "Enel" }
  },
  "contact": { "id": "…", "name": "João Solar", "phone": "5585999990000", "email": "joao@solar.test" },
  "items": [{ "name": "Usina 8 kWp", "quantity": 1, "unit_price": 32000, "total": 32000 }],
  "callback": {
    "url": "https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/artifact-callback",
    "token": "64 caracteres hexadecimais",
    "expires_at": "2026-09-19T14:05:00Z"
  }
}
```

- **Tudo por key** — o nome público do campo, que nunca muda (renomear o rótulo
  não quebra o fluxo). `record.fields` traz toda coluna da tabela; `deal.fields`,
  todo campo do pipeline.
- **Consulta** (ex.: `cliente`) vem com o valor de agora, lido do negócio.
- **Relação** vem como `[{ id, label }]`.
- **Arquivo** vem como `[{ name, size, type, path }]`. Baixar o arquivo do CRM
  pela automação **não** faz parte da v1 (o armazenamento é privado).
- `deal`, `contact` e `items` ficam `null`/`[]` se o registro não está preso a
  um negócio.

## A resposta (automação → CRM)

`POST callback.url`, `Content-Type: application/json`. Só `token` é obrigatório.

```json
{
  "token": "o callback.token recebido",
  "status": "sent",
  "fields": { "link_pdf": "https://…/proposta.pdf", "numero": "P-2026-081" },
  "files": [
    { "url": "https://api.apitemplate.io/…/proposta.pdf", "name": "Proposta João.pdf", "field": "pdf" }
  ]
}
```

| Campo | O que faz |
| :-- | :-- |
| `status` | Muda o status do artefato. Proposta: `draft`, `sent`, `accepted`, `rejected`. Contrato: `draft`, `sent`, `signed`, `rejected`. Documento: todos. Proposta `sent` = marco "Proposta enviada"; contrato `sent`/`signed` = "Contrato enviado"/"Contrato assinado" — se a linha tem a etapa do marco e o negócio está antes, o negócio avança (autor: automação). |
| `fields` | Grava por key. Consulta, relação e arquivo não se escrevem assim; key desconhecida é ignorada (a resposta diz quais). |
| `files` | Até 10. Cada `url` é baixada (https, host público, até 25 MB, até 3 redirecionamentos) para o armazenamento privado e entra na coluna de arquivo `field` (key) — ou na primeira coluna de arquivo da tabela. `name` é opcional. |
| `error` | A automação avisa que falhou (ex.: `"APITemplate fora do ar"`): a execução fecha como falha e nada é aplicado. |
| `keep_open` | `true` = ainda vem outra resposta (contrato enviado agora, assinado depois): aplica esta e **o token continua valendo** até vencer. Sem ele, a resposta encerra a execução. |

### Respostas do CRM

| HTTP | `error` | Quando |
| :-- | :-- | :-- |
| 200 | — | Aplicado. Corpo: `{ ok, run_id, status: "completed" \| "open", fields_applied, fields_ignored, files, artifact_status, moved, event }` (`open` com `keep_open`) |
| 400 | `token_required`, `fields_must_be_object`, `file_needs_url`… | O corpo não é do contrato. |
| 404 | `token_invalid` | Token desconhecido. |
| 409 | `callback_in_progress` | Outra resposta com o mesmo token está sendo aplicada (tente em 5 minutos). |
| 410 | `token_used`, `token_expired` | Já respondido, ou passou dos 7 dias. |
| 422 | `invalid_artifact_status`, `invalid_file_field`, `unsafe_file_url`, `file_download_failed` | O registro não aceita o que veio. **O token continua valendo**: corrija e mande de novo. |

## Exemplos da Solo Energia

**Gerar proposta (APITemplate).** Botão "Gerar proposta" na tabela Propostas
Comerciais → o n8n monta o PDF com `contact`, `items` e `record.fields` → responde
`{ token, status: "sent", files: [{ url: <pdf do APITemplate>, field: "pdf" }] }` →
a proposta fica "Enviada", o PDF no registro e o negócio vai para a etapa
"Proposta enviada".

**Enviar para assinatura (ClickSign).** Botão na tabela Contratos → o n8n cria o
envelope com os Dados para Contrato (`record.fields`) → responde
`{ token, status: "sent", fields: { clicksign_id: "…" }, keep_open: true }` (o
contrato fica "Enviado", o negócio vai a "Contrato enviado" e o token continua
valendo) → quando o ClickSign avisa que assinou, o n8n responde de novo com o
mesmo token: `{ token, status: "signed", files: [{ url: <PDF assinado> }] }` →
"Contrato assinado". A assinatura precisa chegar dentro dos 7 dias do token;
depois disso, um novo clique gera outro.
