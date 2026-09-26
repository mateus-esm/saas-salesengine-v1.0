# SE-REV-006 — Task Contract

Projeto | Tarefa | Agent | Status
---|---|---|---
saas-salesengine-v1.0 | SE-REV-006 | verboo | running

## Outcome

A janela de atendimento do chat (o indicador aberta/fechada e qualquer regra que dependa dela) passa a ser decidida pelo TIPO DE CONEXAO do canal do tenant:

- Conexao NAO OFICIAL — canal `WHATSAPP` (WhatsApp Web/QR) e `Z_API` no provider, e a conexao via **Solo API** — a janela esta **SEMPRE ABERTA**. O chat nunca exibe "Janela Fechada" e o envio nunca e bloqueado/condicionado por janela.
- Conexao OFICIAL — `CLOUD_API` (WhatsApp oficial da Meta) — a regra de 24h e MANTIDA: janela aberta enquanto houver mensagem do cliente nas ultimas 24h; fechada depois.

## Visao do dono (VERBATIM — nao parafrasear)

> "Quando um cliente tem o canal, API nao oficial conectada — atraves do canal fornecido ou atraves da Solo API — no chat, a janela fechada/aberta: nesse caso, quando eles tem essa conexao com uma API nao oficial, a janela esta SEMPRE aberta, porque na conexao de WhatsApp (nao oficial) eles podem enviar pela API que esta sempre aberta."

## Contexto

- **Estado atual: a janela e calculada SEM olhar o canal.** `src/pages/Chat.tsx` (~L205-227) monta `isOnline24h` a partir da ultima mensagem `sender_type='customer'` e o adapter da sidebar (~L271-273) usa `last_message_at < 86_400_000`. `src/components/inbox/ConversationHeader.tsx` (~L140-154) renderiza "Online (24h)" ou "Janela Fechada". Nenhum desses pontos consulta o tipo de conexao.
- **O conceito de "nao oficial" ja existe no repositorio.** `supabase/functions/_shared/outreach/gptmaker.ts` define `START_CONVERSATION_CHANNEL_TYPES = ["WHATSAPP","Z_API"]`, com comentario explicito de que `CLOUD_API` e o WhatsApp oficial da Meta. `src/lib/channel-capabilities.ts` ja indexa capabilities por tipo de canal (`Z_API`, `CLOUD_API`, ...). Procure o ponto de verdade existente antes de criar um novo.
- **Solo API.** A conexao Solo aparece como `wpp_instances` (status `connected`) e a UI ja a sinaliza por `hasSoloInstance` — `src/components/inbox/ChatInput.tsx` ja declara "composer is never blocked by 24h window" quando ela existe. A regra nova deve ser coerente com esse indicador, nao concorrente.
- **Onde a janela importa hoje.** Verifique se existe bloqueio real de envio (backend) alem do indicador visual; se so houver apresentacao, diga isso explicitamente no resultado em vez de inventar gate.

## Excluido (NAO TOCAR)

- `supabase/functions/_shared/outreach/in-service.ts` (`IN_SERVICE_WINDOW_HOURS = 24`) e a guarda de abertura do outreach (SE-REV-005). E outro conceito — "o lead ja esta em atendimento" para nao mandar mensagem automatica — e NAO faz parte desta task. Preserve o comportamento atual.
- `supabase/functions/_shared/outreach/*` (motor de outreach), `_shared/solo-sender.ts`, `send-chat-message`, `start-conversation`, `crm-webhook`, `outreach-worker`: sem mudanca.
- Sem migration de banco. Sem alteracao de contrato do provider.
- Nada de `main` direto; branch protegida continua proibida.

## Acceptance

- [ ] Existe UMA fonte de verdade (funcao pura, testavel) que decide "janela sempre aberta?" a partir do tipo de conexao do canal, cobrindo: `WHATSAPP`, `Z_API`, Solo API (`wpp_instances connected`) -> sempre aberta; `CLOUD_API` -> regra de 24h.
- [ ] O indicador do chat reflete a regra: conexao nao oficial nunca mostra "Janela Fechada"; `CLOUD_API` mantem o comportamento de 24h.
- [ ] Nenhum ponto do front calcula a janela ignorando o canal (remover a duplicacao/logica divergente).
- [ ] Testes novos cobrem a decisao pura (casos nao oficial sempre aberta; CLOUD_API dentro/fora das 24h).
- [ ] `npm run typecheck` OK, `npm run lint` sem novos errors, `npm run build` OK, `npm test` sem regressao vs baseline.
- [ ] Baseline de `npm test` registrado ANTES da mudanca (baseline conhecido do repo: ~14 arquivos / 40 testes falhos / 333 passam) e comparado DEPOIS.
- [ ] Idioma dos artefatos: pt-BR.

## Risk

Baixo — mudanca de apresentacao/regra de dominio no front, sem migration e sem tocar o motor de outreach.

## Artefatos esperados

- Codigo na branch `task/SE-REV-006-window-always-open-nonofficial`.
- Estudo/resultado em `docs/dev/projects/saas-salesengine-v1.0/SE-REV-006/verboo/` (resultado final + evidencias dos comandos).
- Nao commitar/pushar nem abrir PR: o orquestrador (OpenClaw) faz isso. Escreva os arquivos e pare.
