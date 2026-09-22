# SE-LEAD-001 — Result

> Atualizado pelo orquestrador OpenClaw após o retorno do Verboo: o sandbox do Verboo bloqueou
> commit/push/PR e validações reais, mas o orquestrador executou essas etapas fora do harness.

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LEAD-001 |
| Tipo | Estudo / arquitetura (**sem implementação**) |
| Branch | `task/SE-LEAD-001-lead-agent-handoff` |
| Base lida | `68dd0a9` |
| Agente | verboo |
| Status | ✅ Estudo entregue · ✅ validações reais executadas · 🔁 commit/push/PR em execução pelo orquestrador |

## Objetivo

Produzir estudo para permitir que a equipe comercial **dispare a primeira mensagem** para um lead
recebido por cadastro/formulário/outra fonte e que, **se o cliente responder, o agente entre em
atendimento automaticamente**.

## Entregáveis

| Arquivo | Conteúdo |
|---|---|
| `README.md` | Resumo, evidência lida, validações |
| `verboo/estudo-lead-outbound-agent-handoff.md` | Estudo completo — 9 seções |
| `result.md` | Este arquivo (cópia do canônico) |

## Cobertura do escopo exigido

| Item exigido pela task | Seção |
|---|---|
| 1. Diagnóstico do estado atual (entidades, componentes, tabelas, webhooks/jobs/agent runtime) | §1 |
| 2. Fluxo UX recomendado para o vendedor iniciar contato a partir de lead/opportunity | §2 |
| 3. Modelo de estados (lead, opportunity, conversation, outbound attempt, inbound reply, handoff) | §3 |
| 4. Arquitetura recomendada para MVP (onde encaixar, dados, gatilhos, idempotência, observabilidade) | §4 |
| 5. Alternativas técnicas e tradeoffs (template/outbound, inbox trigger, job background, webhook inbound, fila/event bus, incremental sem fila) | §5 (5.1–5.7) |
| 6. Riscos e mitigações (opt-in, template WhatsApp, LGPD, spam, rate limit, duplicidade, humano vs agente, auditoria) | §6 (6.1–6.8) |
| 7. Critérios de aceite testáveis para implementação P0/MVP | §7 (CA-1 a CA-15) |
| 8. Plano faseado com arquivos prováveis, testes e validações | §8 (P0/P1/P2) |
| 9. Recomendação final | §9 |

## Achados principais (com evidência)

1. **O outbound já existe parcialmente.** `supabase/functions/send-chat-message/index.ts:403-431` é a
   "Rota C (outbound-initiated)": envia a primeira mensagem via Solo/Whatsmiau para um lead sem
   conversa. **Mas exige JWT de vendedor** (`:41-65`) — não serve para disparo automático por
   cron/webhook/regra.
2. **O handoff já existe como booleano.** `conversations.atendido_por_agente`
   (`supabase/migrations/20260417000000_epic1_conversations.sql:26`), alternado em
   `src/pages/Chat.tsx:306-314,340-365` e `src/components/inbox/ConversationHeader.tsx:270-291`.
   Sem ator, timestamp ou histórico.
3. **O agente de WhatsApp é externo (GPT Maker).** `analyze-message` só extrai dados de CRM — o tipo
   `AgentAction` (`supabase/functions/_shared/rule-engine.ts:25-40`) não tem ação de envio. O
   `python-agent` é analytics/Copilot (`python-agent/app/main.py`, `app/routers/ingest.py`).
4. **Lacuna central:** para números Solo, o inbound é ingerido pelo `solo-wpp-webhook` e **ninguém
   responde** — `:749-754` só dispara extração de CRM.
5. **Sem template/HSM, sem status de entrega, sem opt-in.** O canal é API não-oficial (Solo/Baileys);
   `messages` não tem coluna de status de entrega; `leads` não tem coluna de consentimento.

## Recomendação

Fila leve em tabela (`outbound_attempts` com `UNIQUE (idempotency_key)`) + worker `service-role`
(`dispatch-outbound`) + worker de resposta (`agent-reply`), reusando `_shared/solo-sender.ts`.
Faseado: **P0** = disparo manual + opt-in + observabilidade; **P1** = agente responde + handoff
auditável; **P2** = gatilhos automáticos + rate limit + templates.

## Validações realizadas

| Validação | Resultado |
|---|---|
| `git status --short --branch` | ✅ `## task/SE-LEAD-001-lead-agent-handoff...origin/main` — worktree limpo antes dos artefatos |
| Scripts do `package.json` | ✅ inspecionados: `dev`, `build`, `build:dev`, `lint` (`eslint src`), `preview`, `test` (`vitest run`), `typecheck` (`tsc -b`) |
| `NODE_ENV=development npm ci --include=dev` | ✅ passou; `npm audit` reportou 24 vulnerabilidades (1 baixa, 6 moderadas, 17 altas), pré-existentes à task |
| `npm run typecheck` | ✅ passou |
| `npm run lint` | ✅ passou com 85 warnings pré-existentes (unused eslint-disable, exhaustive-deps, react-refresh) |
| `npm run build` | ✅ passou; warning de chunk >500 kB |
| `npm test` | ⚠️ falhou em baseline do app: 12 arquivos falhos, 25 testes falhos, 320 passaram. Causas principais: `jsxDEV is not a function`, env ausente `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, e testes que importam `node:fs`/`node:path` no ambiente browser do Vite |
| Verificação das citações `arquivo:linha` | ✅ **PASS** por agente de verificação independente (3 rodadas) — ~70+ citações conferidas linha a linha, 6 afirmações negativas testadas adversarialmente. 4 defeitos de citação encontrados e corrigidos antes do PASS |

## Verificação (detalhe)

O agente de verificação conferiu cada citação `arquivo:linha` do estudo e testou adversarialmente as
afirmações **negativas** (ausência de template/HSM, ausência de status de entrega em `messages`,
ausência de tipo de notificação de lead/atendimento, ausência de executor de `on_stage_entered`,
ausência de ação de envio no rule-engine, ausência de auto-resposta inbound para Solo).

Defeitos encontrados e corrigidos antes do PASS:

1. `messages.conversation_id` estava atribuído a `20260705000000_sprint7_solo_instances.sql:35-36`;
   o correto é `20260417000000_epic1_conversations.sql:46-48` (as linhas de sprint7 são
   `provider`/`provider_message_id`).
2. O round-robin de responsável estava atribuído a `_shared/attribution.ts:100-107` (que é
   `entryOfKind`); o correto é `_crm_pick_owner` em
   `20260913000100_sprint11_w5_attribution.sql:546-579`, acionado por `crm_record_touch`
   (`_shared/attribution.ts:143-168`).
3. A ordem do algoritmo de fallback de conversa estava invertida e citava um nível "por telefone"
   que **não existe**; corrigida para `lead_id`+canal → `gpt_maker_chat_id` → `lead_id` → cria nova
   (`gpt-maker-webhook/index.ts:351-408`).
4. Resíduo da ordem antiga na tabela do plano P0 (§8) — corrigido.

## Pendências

1. **Pergunta ao produto:** o GPT Maker permite **iniciar** conversa por API (não só responder)?
   Decide o desenho do P1 para números GPT Maker.
2. **Pergunta ao produto:** "agente entra em atendimento" = o agente do GPT Maker ou um agente novo
   do SalesEngine?
3. **Pergunta ao produto:** o lead de formulário chega com consentimento (opt-in)? Se não, o P0
   precisa coletá-lo na UI antes de qualquer disparo automático.
4. **Implementação (P0/P1/P2)** — não faz parte desta task.

## Restrições respeitadas

Nenhuma alteração de código. Nenhum acesso a secrets, produção, dados reais, configs destrutivas ou
branch `main`. Apenas dois arquivos de documentação criados no worktree da task.
