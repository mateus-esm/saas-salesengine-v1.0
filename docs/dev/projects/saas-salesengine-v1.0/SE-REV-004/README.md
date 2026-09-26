# SE-REV-004 — Consertar "evento não salva" e "mensagem manual não envia"

| Projeto | Tarefa | Origem | Agentes | Status | Artefatos | Pendências |
|---|---|---|---|---|---|---|
| saas-salesengine-v1.0 | SE-REV-004 — Bug 1 (sequência de Outreach "salva mas não salva") e Bug 2 (mensagem manual no chat não envia), + revisão SE-REV-001/002 | Discord #solo-dev 2026-09-26, reporte do dono | claude (execução) | Código pronto e testado; Bug 1 provado corrigido no build real; Bug 2 provado com dados reais, **aguarda deploy** para a prova `failed → opened` | [`contexto/spec.md`](contexto/spec.md), [`claude/implementacao.md`](claude/implementacao.md), [`claude/evidencias/`](claude/evidencias/) | Cron `outreach-tick` nunca agendado (outreach não envia); deploy (migration antes da `outreach`); prova do Bug 2 em produção; `sent` ≠ entrega; ver §4 da implementação |

## Causas raiz

- **Bug 1:** a tela de Outreach sempre abria em "Nova sequência". Quando o dono
  voltava à tela e ajustava a regra, salvar **criava uma segunda sequência** e a
  original nunca era editada (`updated_at == created_at`). Os logs mostram os 2
  saves do dono com 200 e gravados, e os 2 como INSERT.
- **Bug 2:** `supportsStartConversation` só aceitava `WHATSAPP`; o canal real da
  Casa Flow é `Z_API` (WhatsApp não oficial, que o endpoint atende). `CLOUD_API`
  (oficial da Meta) continua recusado.

## Arquivos

- `src/pages/OutreachSettings.tsx` (+ `OutreachSettings.test.tsx`)
- `src/__tests__/no-provider-branding.test.ts` (allowlist)
- `supabase/functions/_shared/outreach/gptmaker.ts`
- `supabase/functions/_shared/start-conversation.test.ts`, `manual-conversation.test.ts`
- `supabase/functions/outreach/index.ts` (usa a RPC atômica)
- `supabase/migrations/20260926000200_serev004_save_sequence_atomic.sql`
  (+ `supabase/tests/serev004_save_sequence.test.sql`)

## Deploy (orquestrador)

1. migration `20260926000200` → 2. funções `outreach`, `send-chat-message`,
`start-conversation`, `crm-webhook`, `outreach-worker` → 3. front.
Depois do deploy, leads reais da porta "Meta ADS - Cadastro" da Casa Flow passam
a receber a primeira mensagem automática (hoje falham) — ver implementação §4.2.
