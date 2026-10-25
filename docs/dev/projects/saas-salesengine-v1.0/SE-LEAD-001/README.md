# SE-LEAD-001 — Outbound iniciado pela equipe + handoff automático do agente

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LEAD-001 |
| Tipo | Estudo / arquitetura (sem implementação) |
| Branch | `task/SE-LEAD-001-lead-agent-handoff` |
| Base lida | `68dd0a9` (merge #32 — sprint82/discovery-qa) |
| Agente | verboo |
| Status | ✅ Estudo entregue · ✅ `typecheck`/`lint`/`build` executados · ⚠️ `test` falha em baseline não relacionado a esta task (ver §Validações) |
| Artefatos | `verboo/estudo-lead-outbound-agent-handoff.md` · este README |

## Objetivo

Permitir que a equipe comercial **dispare a primeira mensagem** para um lead que entrou por
cadastro/formulário/outra fonte e que, **se o cliente responder, o agente entre em atendimento
automaticamente** — sem que o vendedor precise abrir a conversa e digitar.

## Veredito em cinco linhas

1. O SalesEngine **já tem** o envio outbound para um lead sem conversa: é a "Rota C
   (outbound-initiated)" de `send-chat-message` (`supabase/functions/send-chat-message/index.ts:403-431`).
2. Mas ela **exige um vendedor autenticado** (JWT + `profiles`), então não serve para disparo
   automático a partir de um job, webhook ou regra de etapa.
3. O inbound **já é ingerido** com conversa e mensagem (`solo-wpp-webhook`, `gpt-maker-webhook`),
   e o handoff **já existe** como um booleano: `conversations.atendido_por_agente`.
4. O que **não existe**: ninguém responde automaticamente um número Solo. O agente de WhatsApp é
   o **GPT Maker (externo)**; o `analyze-message` só extrai dados de CRM e o `python-agent` é
   analytics (Copilot), não atendimento.
5. Recomendação: **fila leve no banco + um worker service-role** (`outbound_attempts` +
   `dispatch-outbound` + `agent-reply`), reusando `_shared/solo-sender.ts`. Faseado em 3 ondas,
   com o P0 entregando o disparo e o P1 o atendimento automático.

## O que foi lido (evidência)

- **Migrations**: `supabase/migrations/` (176 arquivos) — em especial `20260417000000_epic1_conversations.sql`,
  `20260419110000_epic2_pipelines.sql`, `20260705000000_sprint7_solo_instances.sql`,
  `20260117000000_add_crm_agent_toggle.sql`, `20260913000100_sprint11_w5_attribution.sql`,
  `20260819000400_sprint8_notifications.sql`, `20260605000002_sprint5_3_stage_webhooks.sql`.
- **Edge functions**: `send-chat-message`, `solo-wpp-webhook`, `gpt-maker-webhook`, `analyze-message`,
  `cadence-check`, `process-automations`, `notification-dispatcher`, `crm-webhook`, `manage-agent-webhooks`,
  e `_shared/{solo-sender,agent-context,agent-webhooks,opportunities,attribution,rule-engine,channel-config}.ts`.
- **Frontend**: `src/pages/Chat.tsx`, `src/hooks/useConversations.ts`, `src/hooks/useCreateContactAtomic.ts`,
  `src/components/AIAgentToggle.tsx`, `src/components/crm/OpportunityCard.tsx`,
  `src/components/crm/OpportunityDetailModal.tsx`, `src/components/inbox/ConversationHeader.tsx`.
- **Runtime Python**: `python-agent/app/main.py`, `python-agent/app/routers/ingest.py`.
- **Schema vigente**: `src/integrations/supabase/types.ts` (gerado) — mais atual que `supabase/schema_remoto.sql`.

## Entregáveis

| Arquivo | Conteúdo |
|---|---|
| `verboo/estudo-lead-outbound-agent-handoff.md` | Estudo completo: diagnóstico, UX, modelo de estados, arquitetura MVP, alternativas/tradeoffs, riscos, critérios de aceite, plano faseado, recomendação |
| `README.md` | Este resumo |

## Validações

| Validação | Resultado |
|---|---|
| `git status --short --branch` | ✅ `## task/SE-LEAD-001-lead-agent-handoff...origin/main` — worktree limpo antes dos artefatos; a única entrada não rastreada é o próprio diretório `docs/dev/projects/saas-salesengine-v1.0/SE-LEAD-001/` |
| Scripts do `package.json` | ✅ inspecionados — `dev`, `build`, `build:dev`, `lint` (`eslint src`), `preview`, `test` (`vitest run`), `typecheck` (`tsc -b`) |
| `NODE_ENV=development npm ci --include=dev` | ✅ dependências instaladas para validação; `npm audit` reportou 24 vulnerabilidades (1 baixa, 6 moderadas, 17 altas), pré-existentes à task |
| `npm run typecheck` | ✅ passou |
| `npm run lint` | ✅ passou com 85 warnings pré-existentes (unused eslint-disable, exhaustive-deps, react-refresh) |
| `npm run build` | ✅ passou; warning de chunk >500 kB |
| `npm test` | ⚠️ falhou em baseline de testes do app: 12 arquivos falhos, 25 testes falhos, 320 passaram. Causas principais: `jsxDEV is not a function`, env ausente `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, e testes que importam `node:fs`/`node:path` no ambiente browser do Vite. Esta task só adiciona docs |

> Nenhuma alteração de código foi feita. Esta task é estudo/documentação. Nenhum acesso a banco,
> produção, secret ou dado real.
