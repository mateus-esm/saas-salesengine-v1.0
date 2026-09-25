# Task SE-REV-001 — Abrir conversa (start-conversation) a partir de evento de entrada de lead

**Projeto | Tarefa | Agent:** saas-salesengine-v1.0 | SE-REV-001 | claude
**Repo:** `saas-salesengine-v1.0` (base `origin/main`, HEAD 633b4b0)
**Worktree:** `/srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-REV-001`
**Branch:** `feat/rev-start-conversation`
**Origem:** Telegram (2026-09-25) — necessidade real do cliente Casa Flow Ads
**Idioma dos artefatos:** português do Brasil (nunca espanhol)

---

## Objetivo (WHAT)

Quando um lead novo entra no Rev vindo de um formulário/anúncio (ex.: source `Meta Ads - Cadastro (Social Pago)`), o sistema deve **abrir automaticamente uma conversa de WhatsApp com esse lead através do provider do tenant**, para o agente de IA iniciar o atendimento sem intervenção humana.

Entregáveis:

1. **Capacidade nativa** (edge function) que, dado um tenant/lead, abre a conversa no canal WhatsApp daquele tenant usando o endpoint documentado de start-conversation do provider.
2. **Gatilho de entrada idempotente:** o evento de cadastro/lead novo dispara essa capacidade; reenvio do mesmo evento NÃO abre uma segunda conversa.
3. **Rastreio persistido:** registrar que a conversa foi aberta, com o identificador devolvido pelo provider, de forma que cadências e follow-ups futuros possam ser construídos sobre esse dado.
4. **Caminho de fallback temporário:** o mesmo serviço exposto como endpoint HTTP autenticado que o n8n do cliente possa chamar, para os fluxos que hoje passam por planilha + n8n.
5. **Multi-tenant e reutilizável:** cada tenant usa o seu próprio canal/configuração. NADA hardcoded para Casa Flow — Casa Flow é apenas o primeiro caso.

## Contexto

- **Rev** = AI Studio do Sales Engine (`saas-salesengine-v1.0`), SaaS multi-tenant.
- **Fluxo atual do cliente (Casa Flow Ads):** formulário → planilha → workflow n8n → Rev via webhook, com source `Meta Ads - Cadastro (Social Pago)`.
- **O que já existe no repo (leia antes de decidir):**
  - `supabase/functions/gpt-maker-webhook/` — webhook inbound de mensagens (681 linhas)
  - `supabase/functions/send-chat-message/` — envio de mensagem; já chama `api.gptmaker.ai/v2/chat/{id}/send-message` e `start-human`
  - `supabase/functions/manage-agent-channels/` — padrão de base URL + headers do engine (`AI_ENGINE_BASE`, `engineHeaders`); actions `list/create/remove/qr/config/update-config/widget-links/rename`
  - `supabase/functions/cadence-check/` — dispara webhooks em deadlines de cadência
  - `src/lib/channel-capabilities.ts` — o que cada tipo de canal suporta, e como se conecta (`qr`/`instant`/`credentials`/`oauth`)
- **API do provider (documentação oficial):** `POST /v2/channel/{channelId}/start-conversation`, corpo `{ "phone": "...", "message": "..." }`. A doc declara explicitamente que hoje isso só está disponível para canais do tipo **WhatsApp não oficial**. Esse é o método documentado — use-o como caminho principal.

## Restrições

- **Sem breaking changes** nos fluxos existentes (`gpt-maker-webhook`, `send-chat-message`, canais já conectados).
- **Multi-tenant obrigatório:** resolver tenant → canal → credencial pela configuração existente; nunca hardcode de tenant, canal ou número.
- **Idempotência obrigatória** no disparo de abertura de conversa.
- Seguir os padrões do repo: Deno edge functions, Supabase, o esquema de tenant/RLS já existente.
- **Sem segredos no código**; usar o cofre/variáveis já usadas pelo repo.
- Se o provider não expõe o endpoint para um tipo de canal, **falhe de forma explícita e registrada**, não em silêncio.

## Fora de escopo

- UI nova (a menos que seja trivial e necessária para o fluxo).
- Desligar o n8n agora — o n8n permanece como caminho temporário até a solução nativa estar validada.
- Motor completo de cadências/follow-ups: apenas deixar o dado e o gancho prontos para isso.
- Alterar a produção nesta task: a entrega é o PR. Deploy fica para etapa posterior, com aprovação.

## Critérios de aceite

1. Existe um caminho nativo que, a partir de um lead novo, abre a conversa no provider — parametrizado por tenant e por canal, sem valor fixo de cliente.
2. **Idempotente:** disparar o mesmo evento duas vezes resulta em UMA conversa aberta.
3. O resultado é **registrado** (identificador do provider + estado), consultável depois.
4. O **n8n consegue chamar** o mesmo caminho por HTTP autenticado, como solução temporária.
5. Validações executadas e reportadas: typecheck, lint, build, testes existentes — **baseline failures registradas, nunca mascaradas**. Se o sandbox do harness impedir rodar os runners, reporte `NÃO EXECUTADO` explicitamente em vez de inventar resultado.
6. Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-001/claude/` no worktree.

## Risco

Médio. Toca integração externa (provider) e um evento de entrada que já existe. Mitigação: caminho aditivo, idempotente, sem alterar o webhook existente.

## Validação em produção

Nenhuma nesta task. PR apenas, com o plano de deploy e smoke test descrito no `result.md` para execução posterior.
