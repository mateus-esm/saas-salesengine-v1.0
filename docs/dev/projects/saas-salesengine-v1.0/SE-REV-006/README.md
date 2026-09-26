# SE-REV-006 — Janela de atendimento sempre aberta em conexão NÃO OFICIAL

| Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências |
|---|---|---|---|---|---|---|
| saas-salesengine-v1.0 | SE-REV-006 — janela do chat decidida pelo tipo de conexão: não oficial (WHATSAPP/Z_API/Solo API) sempre aberta, CLOUD_API mantém 24h | Discord #solo-dev 2026-09-26, pedido do dono (verbatim em spec) | verboo (execução) | Código pronto e validado pelo orquestrador. **Aguarda PR** | [`contexto/spec.md`](contexto/spec.md), [`verboo/resultado.md`](verboo/resultado.md), [`verboo/service-window.check.mjs`](verboo/service-window.check.mjs) | PR + merge + deploy do front; braço WHATSAPP/Z_API do provider sem dado confiável em runtime (só Solo API liga o "sempre aberta"); decisão do dono sobre granularidade tenant vs conversa e sobre persistir tipo de conexão por conversa (migration futura) |

## O que foi feito

- **Fonte de verdade única** `src/lib/service-window.ts`: `resolveServiceWindow({ providerChannelType, conversationSoloInstanceId, hasConnectedSoloInstance, lastCustomerMessageAt, now })` → `{ alwaysOpen, open }`. Não oficial (WHATSAPP/Z_API/Solo API) sempre aberta; CLOUD_API e desconhecido caem na regra de 24h.
- **Chat nas duas pontas** (`src/pages/Chat.tsx` header + sidebar) lendo a mesma decisão com o mesmo sinal; contas inline `86_400_000` removidas; `ChatSession.isWindowAlwaysOpen` em `src/types/chat.ts`; badge "Sempre aberta" em `ConversationHeader.tsx`.
- **Sinal de relógio unificado** (`src/hooks/useConversations.ts`): query `customer-window-signal` (última mensagem DO CLIENTE nas últimas 24h por conversa); a sidebar lia `last_message_at` (que o envio do time também empurra) — corrigido.
- **Testes novos** `src/lib/__tests__/service-window.test.ts` (16 its, 36 asserções) + harness executável `verboo/service-window.check.mjs` (mesmos casos, sem bundler).
- **Sem migration, sem tocar o motor de outreach** (`in-service.ts`, `_shared/outreach/*`, solo-sender, functions) — verificado por `git status`.

## Validação do orquestrador

- `service-window.check.mjs`: **pass=36 fail=0**
- `tsc -b`: **exit 0**
- `eslint` nos 6 arquivos tocados: **0 errors** (2 warnings pré-existentes de `eslint-disable` não usado)
- `vitest` direcionado (`service-window.test.ts` + `no-provider-branding.test.ts`): **17/17 passam**
- `npm run build`: **exit 0** (bundle `index-C9NEP6bY.js`)
- Full suite: último full (15:33Z) = 4 arquivos falhos (3 por `VITE_SUPABASE_*` ausente + branding que já passa isolado) — sem mascarar, registrado no result.
