Você é o harness de implementação da task SE-REV-001 no repo `saas-salesengine-v1.0` (Rev / AI Studio).

# Objetivo (WHAT — não prescrevo COMO)

Quando um lead novo entra no Rev vindo de formulário/anúncio (ex.: source `Meta Ads - Cadastro (Social Pago)`), o sistema deve abrir automaticamente uma conversa de WhatsApp com esse lead através do provider do tenant, para o agente de IA iniciar o atendimento sem intervenção humana.

Entregáveis:
1. Capacidade nativa (edge function Deno/Supabase) que, dado um tenant/lead, abre a conversa no canal WhatsApp daquele tenant usando o endpoint documentado do provider.
2. Gatilho de entrada idempotente: o evento de cadastro/lead novo dispara essa capacidade; reenvio do MESMO evento NÃO abre uma segunda conversa.
3. Rastreio persistido: registrar que a conversa foi aberta, com o identificador devolvido pelo provider, de forma que cadências e follow-ups futuros possam ser construídos sobre esse dado.
4. Caminho de fallback temporário: o mesmo serviço exposto como endpoint HTTP autenticado que o n8n do cliente possa chamar, para os fluxos que hoje passam por planilha + n8n.
5. Multi-tenant e reutilizável: cada tenant usa seu próprio canal/configuração. NADA hardcoded para Casa Flow — Casa Flow é apenas o primeiro caso.

# Contexto

- Rev = AI Studio do Sales Engine. SaaS multi-tenant.
- Fluxo atual do cliente (Casa Flow Ads): formulário → planilha → workflow n8n → Rev via webhook, source `Meta Ads - Cadastro (Social Pago)`.

Código que JÁ existe no repo (leia antes de decidir qualquer coisa):
- `supabase/functions/gpt-maker-webhook/index.ts` (681 linhas) — webhook inbound de mensagens; normalizePhone, lookup de lead por phone_normalized, canal por conversationType/channelType/platform/source.
- `supabase/functions/send-chat-message/index.ts` (442 linhas) — já chama `https://api.gptmaker.ai/v2/chat/{id}/send-message` e `start-human`/`stop-human`. Use este arquivo como referência de padrão de chamada ao engine.
- `supabase/functions/manage-agent-channels/index.ts` (348 linhas) — padrão `AI_ENGINE_BASE` + `engineHeaders`; actions list/create/remove/qr/config/update-config/widget-links/rename.
- `supabase/functions/cadence-check/index.ts` (152 linhas) — dispara webhooks em deadlines de cadência (on_stage_entered, on_idle_breach, on_cadence_deadline).
- `src/lib/channel-capabilities.ts` — o que cada tipo de canal suporta e como se conecta (qr/instant/credentials/oauth). Leia os comentários: o provider NÃO expõe campos de credencial nem rota OAuth; só `qr` e `instant` fecham dentro do app.

# API do provider (documentação oficial)

`POST /v2/channel/{channelId}/start-conversation`
Corpo: `{ "phone": "...", "message": "..." }`
Base: `https://api.gptmaker.ai`
Auth: `Authorization: Bearer <token>`

A doc declara explicitamente que hoje isso só está disponível para canais do tipo WhatsApp NÃO OFICIAL. Esse é o método documentado — use como caminho principal. Se o tipo de canal do tenant não suportar, FALHE de forma explícita e registrada, nunca em silêncio.

# Restrições

- Sem breaking changes nos fluxos existentes (gpt-maker-webhook, send-chat-message, canais já conectados).
- Multi-tenant obrigatório: resolver tenant → canal → credencial pela configuração existente. Nunca hardcode de tenant, canal ou número.
- Idempotência obrigatória no disparo de abertura de conversa.
- Siga os padrões do repo: Deno edge functions, Supabase, esquema de tenant/RLS existente.
- Sem segredos no código.
- Se os runners de validação não puderem rodar no seu sandbox, reporte explicitamente "NÃO EXECUTADO" — NUNCA invente resultado nem baseline.

# Fora de escopo

- UI nova (salvo se trivial e necessária).
- Desligar o n8n agora — ele permanece como caminho temporário até a solução nativa estar validada.
- Motor completo de cadências/follow-ups: apenas deixe o dado e o gancho prontos.
- Deploy: a entrega é o PR. Deploy é etapa posterior com aprovação.

# Critérios de aceite

1. Caminho nativo que, a partir de um lead novo, abre a conversa no provider — parametrizado por tenant e canal, sem valor fixo de cliente.
2. Idempotente: disparar o mesmo evento duas vezes resulta em UMA conversa aberta.
3. Resultado registrado (identificador do provider + estado), consultável depois.
4. O n8n consegue chamar o mesmo caminho por HTTP autenticado, como solução temporária.
5. Validações: typecheck, lint, build, testes existentes. Baseline failures registradas, nunca mascaradas.
6. Artefatos em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-001/claude/`.

# Idioma

Escreva TODOS os artefatos em PORTUGUÊS DO BRASIL. Nunca espanhol.

# Entrega

Escreva os arquivos no worktree. Não precisa commitar — o orquestrador faz commit/push/PR. Ao final, escreva um resumo em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-001/claude/implementacao.md` com: o que foi feito, arquivos tocados, decisões tomadas, validações executadas (com resultado real), e pendências.
