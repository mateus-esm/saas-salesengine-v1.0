# SE-DOCPIPE-001 — Task Contract

Projeto | Tarefa | Agent | Status
---|---|---|---
saas-salesengine-v1.0 | SE-DOCPIPE-001 | claude | pending

## Outcome

Migrar a **esteira de propostas e contratos da Solo Energia** do Jestor para o Rev, aproveitando a infraestrutura n8n que já existe, e desenhar a estrutura em torno de **primitivos reaproveitáveis** para a migração nativa futura.

Visão do dono (verbatim): "Hoje no Jestor nosso fluxo roda assim: os dados do cliente entram por formulário e disparam o workflow no n8n (`Solo Energia | Proposal Engine v1`), que gera a proposta via APITemplate e devolve o link no registro. Temos o mesmo fluxo para contratos (`Solo Energia | Contract Engine v1`), que mescla proposta + contrato e despacha para assinatura no Clicksign. Quero fazer a migração completa do Jestor para o Rev rodando na Solo Energia, aproveitando a infraestrutura atual do n8n."

Fluxo alvo: `Rev Form / Opp Record` ➔ `Outbound Webhook` ➔ `n8n (APITemplate / Merge / Clicksign)` ➔ `Inbound Webhook` ➔ `Update Record`.

### Fase 1 (implementar agora)

- **Schema / Oportunidades**: ligar formulários de entrada diretamente a `Opportunities`; ter os dados `proposal_pdf_url`, `contract_pdf_url`, `clicksign_document_id`, `signature_status` no registro.
- **Webhooks**: saída (dispara n8n no submit do formulário e no clique do botão) e entrada (recebe URL de PDF / status de assinatura e atualiza o registro por ID).
- **Botões de ação (UI)**: `Generate Proposal` (envia o record ID ao n8n, mostra loading, salva o PDF retornado) e `Send Contract` (dispara merge proposta+contrato e despacha ao Clicksign).

### Fase 2 (preparar, não construir tudo)

Estruturar endpoints e schemas em torno dos primitivos genéricos `DocumentTemplate`, `E-Signature Connector`, `MergeEngine`, para permitir a internalização nativa no Rev Toolkit depois.

## Context

**LEIA ISTO ANTES DE DESENHAR QUALQUER COISA.** O Rev já tem uma infraestrutura de automação de artefatos (Sprint 11, Onda 4, T44) que provavelmente resolve boa parte do pedido. O harness deve lê-la, decidir o que REAPROVEITA e o que FALTA, e abrir o artefato dizendo o que aceita e o que rejeita do que o dono pediu — não reimplemente o que já existe.

Reconhecimento feito pelo orquestrador (reconfirme no repo):

- `supabase/functions/artifact-callback/index.ts` — **callback público** (`verify_jwt = false`): o token de uso único no corpo é a única chave. O n8n posta `{ token, status?, fields?, files?, error?, keep_open? }`. A função: (1) reivindica a run pelo token (hash/uso/expiração no banco); (2) valida o corpo contra o que o registro aceita, **antes** de baixar; (3) baixa cada arquivo (https, host público, 25 MB) para bucket privado; (4) aplica tudo em uma transação (campos, arquivos, status → milestone). Corpo ruim ou download falho libera a claim para o n8n tentar de novo. Contrato em `Planning/Architecture/contrato_artefato_v1.md`.
- `src/lib/artifactActions.ts` — partes puras dos botões de automação: `ArtifactAction {id,label}`, `ArtifactActionDraft {id,label,url}`, `ArtifactRunStatus = queued|claimed|completed|failed`, `ArtifactRun`, `MAX_ACTIONS = 10`, `actionDraftError`, `isRunWaiting`, `runStatusText`. Um clique manda o registro pela fila de saída; a automação responde no callback.
- `src/components/crm/customtables/ArtifactActionsEditor.tsx` — editor de botões na UI.
- `supabase/functions/deliver-crm-webhook/index.ts` — reivindica a entrega de saída em `webhook_logs` via `dispatch_token`, `direction = 'outbound'`.
- `webhook_configs` (id, equipe_id, name, url, trigger_event, active, headers jsonb) e `webhook_logs` (direction inbound/outbound, dispatch_token, response_status, error_message).
- `custom_tables` / `custom_table_records` com `table_schema jsonb` e `data jsonb` (chaveado pelos `key` do schema).
- `opportunities` (id, equipe_id, lead_id, pipeline_id, stage_id, value, currency, status open/won/lost, position, `custom_data jsonb` — chaveado por `CustomFieldSchema.field_id`, NUNCA por key/label —, stage_entered_at, closed_at, created_at, updated_at, deleted_at).
- Existem `public-form`, `public-proposal`, `public-report`, `public-discovery` (edge functions públicas por token).
- Contratos de integração n8n já documentados: `docs/dev/projects/saas-salesengine-v1.0/SE-REV-001/claude/integracao-n8n.md` e `.../SE-REV-002/claude/integracao-n8n.md` — siga o mesmo padrão de autenticação (`x-webhook-secret` do tenant) e idempotência.

Ponto de decisão que o harness DEVE resolver e justificar no artefato: os quatro campos pedidos (`proposal_pdf_url`, `contract_pdf_url`, `clicksign_document_id`, `signature_status`) são **campos fixos de coluna** ou **campos customizados / artefatos** do sistema existente? Decida a partir do que o repo já faz, e diga o porquê. Não invente schema paralelo se o existente cobre.

## Excluído (NÃO TOCAR)

- **Os workflows n8n são CONTEXTO, não alvo.** `Solo Energia | Proposal Engine v1` e `Solo Energia | Contract Engine v1` são infraestrutura operada/vendida pelo dono. Não altere nenhum workflow n8n nesta entrega; a integração é pelo contrato HTTP do Rev.
- Motor de outreach (`_shared/outreach/*`, `outreach`, `outreach-worker`), `send-chat-message`, `start-conversation`, `crm-webhook`, `gpt-maker-webhook`: sem mudança.
- Não quebrar a infra de artefatos existente (`artifact-callback`, `artifactActions`, `deliver-crm-webhook`) — estenda, não substitua.
- Sem segredos no código. Sem `main` direto. Sem migration destrutiva.

## Acceptance

- [ ] Submissões via Formulários do Rev criam/atualizam `Opportunities` sem perda de dado.
- [ ] PDFs de proposta e contrato são gerados e persistidos nos campos corretos do registro.
- [ ] O botão de ação envia o documento mesclado ao Clicksign e o status reflete no Rev.
- [ ] Fase 2: os primitivos `DocumentTemplate`, `E-Signature Connector`, `MergeEngine` estão desenhados (interfaces/schema/documento), com o caminho de internalização nativa descrito.
- [ ] Contrato HTTP documentado (o que o n8n manda e recebe, com autenticação e idempotência), no padrão dos docs existentes.
- [ ] `npm run typecheck` OK, `npm run lint` sem novos errors, `npm run build` OK, `npm test` sem regressão vs baseline (registrar baseline ANTES); `deno test` nas funções tocadas.
- [ ] Idioma dos artefatos: pt-BR.
- [ ] Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-DOCPIPE-001/claude/`.

## Risk

Médio-alto — toca schema de oportunidades, webhooks e assinatura de contrato de cliente real. Exige validação cuidadosa e ativação controlada.

## Nota de deploy

O dono autorizou colocar em produção. O harness entrega código + artefatos; o orquestrador faz commit/push/PR e executa o deploy (migration + edge functions) após auditoria. **Ativação real** (apontar para os workflows n8n reais e o Clicksign) depende de URLs/credenciais que só o dono tem — registre isso como pendência nomeada, não invente endpoint.
