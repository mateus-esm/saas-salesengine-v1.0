# SE-REV-002 — Task Contract

Project: saas-salesengine-v1.0
Agent: claude
Branch: feat/rev-crm-chat-cadence
Base: feat/rev-start-conversation (b8f16bb, PR #44) — empilhada, nao em main
Risk: medio-alto (toca integracao externa de mensageria + eventos de CRM)

## Outcome

Rev conectado ao chat de ponta a ponta: um evento de CRM (lead novo, mudanca de
estagio, idle breach) dispara conversa/mensagem no WhatsApp do lead, roteando
pelo provider que o tenant tem (GPT Maker nao-oficial OU Solo API), com
cadencia e follow-up automatizados, reutilizavel para qualquer tenant.

Caso concreto que precisa funcionar agora: Casa Flow Ads — formulario -> planilha
-> n8n -> `crm-webhook/inbound/{config}` com source `Meta Ads - Cadastro (Social Pago)`.

## Context

- SE-REV-001 (PR #44) entregou `start-conversation` para GPT Maker nao-oficial:
  idempotencia no banco (`conversation_open_events`), rastreio (`provider_chat_id`),
  tres credenciais, multi-tenant via `conversation_opener_settings`.
- O cliente Casa Flow pode ter Solo API em vez de GPT Maker. O caminho precisa
  suportar os dois sem duplicar logica.
- `cadence-check` ja dispara webhooks em deadlines (on_stage_entered,
  on_idle_breach, on_cadence_deadline) — gancho existente a aproveitar.
- Existem `manage-solo-instances`, `solo-wpp-webhook`, `_shared/solo-sender.ts`
  (Rota A solo-native, B fallback, C outbound-initiated) no repo.
- Workflow n8n real do cliente exportado em `contexto/n8n-workflow-casa-flow.json`.

## Acceptance

- [ ] Roteamento por provider: tenant GPT Maker e tenant Solo API usam o mesmo
      caminho de disparo, com provider resolvido por configuracao (sem hardcode).
- [ ] Cadencia/follow-up: sequencia de mensagens com atraso, cancelavel, idempotente.
- [ ] Eventos de CRM (lead novo / estagio / idle) alimentam o motor sem breaking
      change nos fluxos existentes.
- [ ] n8n continua conseguindo chamar por HTTP autenticado.
- [ ] Validações reais reportadas; baseline nao mascarado; NÃO EXECUTADO explicito.
- [ ] Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-002/claude/`.

## Do not touch

- Producao (deploy e etapa posterior com aprovacao)
- `main` direto
- Segredos no codigo
