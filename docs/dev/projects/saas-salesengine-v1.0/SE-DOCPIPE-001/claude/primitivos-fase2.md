# SE-DOCPIPE-001 — Fase 2: primitivos da esteira de documentos

Desenho, não construção. Objetivo: tirar do n8n, **um passo de cada vez e com
volta**, o que hoje o Proposal Engine e o Contract Engine fazem, sem mudar o que
a tela, o banco e os relatórios já entendem.

---

## 1. Ponto de partida: o que a Fase 1 já fixou

A Fase 1 não é descartável; ela vira o esqueleto dos primitivos.

| Já existe | Papel na Fase 2 |
| :-- | :-- |
| Tabela de artefato (`custom_tables.artifact_kind`) + registro preso ao negócio | O **documento de negócio**. Continua sendo onde tudo termina. |
| `artifact_status` + `_crm_apply_artifact_status` (T43) | A **máquina de estados** e os marcos (`proposal_sent`, `contract_sent`, `contract_signed`). Nenhum primitivo novo muda status por fora disso. |
| `_crm_artifact_apply(record, status, fields, files)` (Fase 1) | O **único ponto de escrita** do resultado de qualquer motor, externo ou nativo. |
| `artifact_action_runs` (token, `keep_open`, `event_ids`) | O **job**: uma execução com começo, respostas intermediárias e fim. |
| Payload v1 + `deal_artifacts` | O **DocumentContext**: os dados que qualquer template consome. |
| `artifact_inbound_events` (idempotência por `event_id`) | O **livro de eventos** de provedores (assinatura, re-sync). |
| Bucket privado `artifacts` + `storeArtifactFiles` / `file_url` | O **FileRef**: todo PDF, gerado aqui ou fora, mora no Rev. |

Invariantes que os primitivos herdam:

1. Resultado só entra por `_crm_artifact_apply` (campos por key, arquivo no
   bucket, status pela regra do marco).
2. Todo evento externo tem `event_id` e é aplicado uma vez.
3. Todo arquivo é copiado para o bucket privado; URL de terceiro nunca é a
   fonte da verdade.
4. Dados por `field_id` no banco; por `key` nas bordas.
5. Segredo de provedor nunca em código nem em `custom_tables`: no Vault, por
   equipe.

---

## 2. Os três primitivos

### 2.1 `DocumentTemplate` — "que documento, com que dados, por qual motor"

Hoje está implícito no botão (rótulo + URL) e no workflow do n8n. Vira
configuração explícita da tabela de artefato.

```ts
type DocumentEngine =
  | { kind: "external_http"; webhook_config_id: string }          // Fase 1: o n8n
  | { kind: "apitemplate"; template_id: string; credential: string } // Vault ref
  | { kind: "native_html"; html_template_id: string };             // futuro

interface DocumentTemplate {
  id: string;
  equipe_id: string;
  table_id: string;            // tabela de artefato de destino
  name: string;                // "Proposta comercial 2026"
  engine: DocumentEngine;
  /** key do template → caminho no DocumentContext (ex.: "cliente" → "contact.name"). */
  field_map: Record<string, string>;
  output: {
    file_key: string;          // coluna de arquivo que recebe o PDF (ex.: "pdf")
    status_on_success: string | null; // ex.: "sent"
  };
  version: number;             // muda a cada edição; o job guarda a versão usada
  active: boolean;
}
```

Schema proposto (não criado):

```sql
create table public.document_templates (
  id          uuid primary key default gen_random_uuid(),
  equipe_id   uuid not null references public.equipes(id) on delete cascade,
  table_id    uuid not null references public.custom_tables(id) on delete cascade,
  name        text not null,
  engine      jsonb not null,          -- DocumentEngine
  field_map   jsonb not null default '{}',
  output      jsonb not null,
  version     integer not null default 1,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
```

A ação da tabela (`custom_tables.actions[]`) passa a poder apontar para um
template (`{ id, label, template_id }`) em vez de só para uma URL. Ação com
`webhook_config_id` continua valendo — é o `engine.kind = "external_http"`.

### 2.2 `MergeEngine` — "junte estes PDFs nesta ordem"

Hoje é um passo dentro do Contract Engine. Vira um passo nomeado.

```ts
interface FileRef {
  path: string;                // no bucket privado: <equipe>/<tabela>/<registro>/<id>-<nome>
  name: string;
  type: string | null;
  size: number;
}

/** De onde vem cada peça, resolvido no DocumentContext do job. */
type MergeInput =
  | { from: "record"; file_key: string }                                   // o próprio registro
  | { from: "deal_artifact"; kind: "proposal" | "contract" | "document"; file_key: string; pick: "latest" | "latest_sent" }
  | { from: "rendered"; step: string };                                    // saída de um passo anterior

interface MergeSpec {
  inputs: MergeInput[];        // na ordem da junção
  output_file_key: string;     // ex.: "contrato_pdf"
}

interface MergeEngine {
  merge(inputs: FileRef[], outputName: string): Promise<FileRef>;
}
```

Implementações: `external_http` (o n8n, como hoje — ele já recebe os `path` via
`deal_artifacts` e baixa por `file_url`) e `native` (edge function com uma
biblioteca de PDF em Deno, lendo e gravando direto no bucket). A seleção da
proposta (`pick: "latest_sent"`) sai do código do n8n e vira regra declarada.

### 2.3 `ESignatureConnector` — "mande para assinar e me avise"

Hoje: o Contract Engine fala com o Clicksign e devolve pelo callback / pela
entrada por ID.

```ts
interface Signer {
  name: string;
  email: string;
  phone?: string;
  /** De onde vem no DocumentContext (ex.: "record.fields.email_contrato"). */
  source?: string;
  auth: "email" | "whatsapp" | "sms";
}

interface EnvelopeRequest {
  file: FileRef;
  signers: Signer[];
  deadline_at: string;         // ISO
  external_ref: string;        // record_id — volta no webhook do provedor
}

type SignatureStatus = "sent" | "signed" | "rejected" | "expired" | "canceled";

interface SignatureEvent {
  event_id: string;            // id do evento no provedor → idempotência
  provider_document_id: string;
  status: SignatureStatus;
  signed_file_url?: string;    // baixado para o bucket pelo storeArtifactFiles
  occurred_at: string;
}

interface ESignatureConnector {
  provider: "clicksign";       // outros depois
  createEnvelope(req: EnvelopeRequest): Promise<{ provider_document_id: string; sign_url?: string }>;
  /** Valida a assinatura do webhook do provedor (HMAC) e normaliza o evento. */
  parseWebhook(req: Request, secret: string): Promise<SignatureEvent | null>;
}
```

Mapeamento para o artefato (fixo, no Rev): `sent → sent`, `signed → signed`,
`rejected | canceled → rejected`, `expired → rejected` (com o motivo em campo de
texto). Assim `signature_status` continua sendo o `artifact_status`, e os marcos
seguem saindo sozinhos.

Schema proposto (não criado):

```sql
create table public.esign_envelopes (
  id                    uuid primary key default gen_random_uuid(),
  equipe_id             uuid not null references public.equipes(id) on delete cascade,
  record_id             uuid not null references public.custom_table_records(id) on delete cascade,
  provider              text not null check (provider in ('clicksign')),
  provider_document_id  text not null,
  status                text not null,
  signers               jsonb not null default '[]',
  deadline_at           timestamptz,
  created_at            timestamptz not null default now(),
  unique (provider, provider_document_id)
);
```

Os eventos vão para o `artifact_inbound_events` que já existe (`event_id =
"clicksign:<id>"`), então a idempotência é a mesma da Fase 1.

---

## 3. O job: a esteira como composição

```ts
type PipelineStep =
  | { id: string; kind: "render"; template_id: string }
  | { id: string; kind: "merge"; spec: MergeSpec }
  | { id: string; kind: "sign"; connector: "clicksign"; signers: Signer[]; deadline_days: number };

interface DocumentPipeline {
  id: string;
  table_id: string;
  label: string;               // o botão: "Enviar contrato"
  steps: PipelineStep[];       // ex.: [render contrato] → [merge proposta+contrato] → [sign]
}
```

- **Proposal Engine** = `[render(proposta)]`.
- **Contract Engine** = `[render(contrato), merge(proposta.latest_sent + contrato), sign(clicksign)]`.

O job continua sendo uma linha de `artifact_action_runs` (ganharia `pipeline_id`,
`step` atual e o resultado por passo em `result`). Um passo `external_http`
termina quando chega o callback; um passo nativo termina na própria edge. O
`keep_open` da Fase 1 é exatamente o "passo sign ainda esperando o provedor".

---

## 4. Endpoints (a forma final, compatível com a Fase 1)

| Endpoint | Hoje (Fase 1) | Fase 2 |
| :-- | :-- | :-- |
| `crm_run_artifact_action(record, action)` | Enfileira o POST ao n8n. | Se a ação tem `pipeline_id`, cria o job e roda o primeiro passo (nativo ou externo). |
| `artifact-callback` | Retorno por token. | Igual; passa a fechar **o passo** externo corrente e avançar o job. |
| `artifact-inbound` `update` / `file_url` | Entrada por ID; URL curta de arquivo. | Igual (continua sendo a porta para integrações do tenant). |
| `esign-webhook/{provider}` | — | **Novo.** O Clicksign chama o Rev direto; HMAC validado com o segredo da equipe no Vault; evento normalizado vira `_crm_artifact_inbound_*` com `event_id`. |
| `document-render` (interno) | — | **Novo.** Service role: resolve o `DocumentContext`, chama o motor do template, grava o PDF no bucket, aplica por `_crm_artifact_apply`. |

---

## 5. Caminho de internalização (cada degrau com volta)

A troca é **por ação da tabela**, não por equipe inteira: um botão pode ir para
o motor nativo enquanto o outro segue no n8n. Voltar = apontar a ação de novo
para o `webhook_config_id` antigo.

| Degrau | O que sai do n8n | O que entra no Rev | Pré-requisito |
| :-- | :-- | :-- | :-- |
| 0 (Fase 1, agora) | nada | contrato HTTP, `deal_artifacts`, `file_url`, entrada por ID, idempotência | — |
| 1 | a chamada ao APITemplate | `DocumentTemplate` com `engine: apitemplate` + `document-render` | chave do APITemplate da Solo no Vault; ids dos templates |
| 2 | o merge | `MergeEngine` nativo (edge + lib de PDF) | biblioteca de PDF validada em Deno com os PDFs reais da Solo |
| 3 | o Clicksign | `ESignatureConnector` clicksign + `esign-webhook/clicksign` | token de API e segredo HMAC do Clicksign da Solo no Vault; confirmar a versão da API da conta |
| 4 | o workflow inteiro | `DocumentPipeline` configurável na tela | degraus 1–3 estáveis em produção |
| 5 (opcional) | o APITemplate | `engine: native_html` (HTML → PDF próprio) | decisão de produto; custo por documento |

Em todos os degraus: o registro, o status, os marcos e o painel do negócio não
mudam. O que muda é quem executa o passo.

---

## 6. O que fica fora

- Editor visual de template (degrau 5).
- Assinatura com outros provedores (a interface já prevê `provider`).
- Cobrança por documento gerado — se virar produto, liga-se ao
  `credit-pricing` existente, não a um medidor novo.
