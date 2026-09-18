# SE-LID-002 — Mensagem iniciada pela equipe (outbound) criava lead "Desconhecido"

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LID-002 |
| Origem | Relato do usuário em 2026-09-18: "Continua o mesmo erro de desconhecido lead na equipe do Casa Flow. O que eu analisei: são mensagens que foram iniciadas pelo próprio usuário, e essas mensagens ficam como desconhecido." (continuação do SE-LID-001 / #29, que tratou o `@lid` técnico) |
| Agentes | verboo (diagnóstico + fix com código, branch `fix/desconhecido-outbound-leads`) |
| Status | ✅ Fix implementado nos 4 arquivos de código + testes atualizados · ⚠️ validação (`deno test` / `typecheck` / `lint` / `test`) **NÃO EXECUTADA** neste sandbox (permissão negada — ver `verboo/fix.md` §5) · ⛔ sem commit/push (conforme o contrato) |
| Artefatos | `contexto/spec.md` (contrato) · `verboo/diagnostico.md` · `verboo/fix.md` · este README |
| Pendências | backfill das linhas antigas `"Desconhecido"` (SQL proposto em `verboo/fix.md` §7.1, **não executado**) · enriquecimento do nome pelo `pushName` inbound do provider (§7.2) · `@lid` ainda gravado em `leads.phone` no canal solo (§7.3) · `creation_source` de lead outbound no gpt-maker (§7.4) · índice UNIQUE parcial em `(equipe_id, gpt_maker_chat_id)` (§7.5) · rodar os runners fora do sandbox (§5) |

## O que foi encontrado

A mensagem outbound (a equipe inicia a conversa) **cria o lead**, e isso está certo — `messages.lead_id` é
`NOT NULL`, então sem lead a mensagem outbound seria perdida. O defeito era o **rótulo**: o payload de uma
mensagem outbound não traz nome de contato (o contato não é quem escreveu), e o fallback para "sem nome" era
o literal `"Desconhecido"`, gravado em `leads.name` (`gpt-maker-webhook:254`). Dali ele vai cru para a
notificação da equipe, porque o texto é montado **fora deste repositório**: `dispatch_contact_created_webhooks`
(trigger `AFTER INSERT` em `public.leads`, migration `20260807000000:177-179`) → `{{lead.name}}` no
`payload_template` → automação externa em `webhook_configs.url`. Não existe máscara depois do banco.

O SE-LID-001 blindou o caminho contra **IDs técnicos** (`@lid`); "campo de nome vazio" não é id técnico, e
aquela task **preservou de propósito** essa linha como `"Desconhecido"` (com teste pinando o comportamento).
Este era o buraco restante. Detalhes, cadeia causal e prova `arquivo:linha` em `verboo/diagnostico.md`.

**Pergunta de domínio respondida:** mensagem outbound **deve criar lead** (opção *b*: cria, com nome
derivado do telefone). Justificativa em `verboo/diagnostico.md` §5 — recusar a criação não "pularia uma
mensagem", apagaria a conversa (o guard `if (!lead) throw` estoura antes do INSERT da mensagem).

## O que foi corrigido

| Situação (`contactName` / `contactPhone`) | Antes | Depois |
|---|---|---|
| **vazio / telefone real** — o caso do relato | `name = "Desconhecido"` | `name = "Lead 5585996487923"` (dígitos canônicos) |
| vazio / vazio | `name = "Desconhecido"` | `name = "[WhatsApp - Lead Anônimo]"` |
| vazio / `@lid` · `@lid` / `@lid` · `@lid` / telefone · `@lid` / vazio | SE-LID-001 | **inalterado** |
| nome real / qualquer | nome real | **inalterado** |

`phone`, `phone_normalized` e a chave de dedup **não mudaram em nenhum caminho**. O literal `"Desconhecido"`
deixou de ser produzido por qualquer combinação de payload — há um teste-invariante que varre 12 formatos.

Também foi fechada a **mesma classe de defeito** nos dois webhooks: o `pushName` é o nome de **quem
enviou**, e em mensagem outbound o remetente é a própria conta da equipe. Ele deixou de rotular o contato
(`gpt-maker-webhook:47,53-54` e `solo-wpp-webhook:438`) e o rótulo passa a vir do número, pela mesma função
(`leadNameFromPhone()`), sem duplicar a regra. Isso **não** é o que corrige o sintoma relatado — o payload
do incidente não trazia `pushName` nenhum —, mas elimina a assimetria entre os dois canais e a possibilidade
de o contato ser nomeado com o nome da equipe.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/functions/_shared/lead-identity.ts` | `leadNameFromPhone()` (novo, reusado pelos dois webhooks) + precedência do nome sem o placeholder |
| `supabase/functions/gpt-maker-webhook/index.ts` | predicado único `isAgentMessage` (`:47`) reusado pelo `senderType` e pelo nome — `pushName` do remetente não rotula mais o contato; nota no passo 9 explicando por que **não** há gate `senderType === 'customer'` na criação do lead (`:236-245`) + log quando o lead nasce de mensagem da equipe |
| `supabase/functions/solo-wpp-webhook/index.ts` | `pushName` só rotula lead em mensagem inbound (`senderType === 'customer'`, `:438`) |
| `supabase/functions/_shared/lead-identity.test.ts` | 5 asserções do SE-LID-001 reescritas + 3 testes novos (seção OUTBOUND + invariante `"Desconhecido"` + helper); 13 → 16 `Deno.test`, nenhum perdido |

## Como validar (fora do sandbox)

⚠️ **Os scripts npm deste repo não cobrem `supabase/`**: `tsconfig.json:15-17` exclui `supabase`,
`eslint.config.js:13` ignora `supabase/functions` e `vite.config.ts:30` exclui `supabase/functions/**` do
vitest. Rodar só `npm run typecheck/lint/test` e ver verde **não** valida este fix — o runner que cobre é o
**Deno**.

```bash
# 1) o que realmente cobre este fix
deno check supabase/functions/_shared/lead-identity.ts
deno test supabase/functions/_shared/
# 2) sanidade do resto do repo (não cobre supabase/, só confirma que nada quebrou)
npm run typecheck
npm run lint
NODE_ENV=test npm test
```

Os testes `.tsx` do frontend exigem `NODE_ENV=test` (sem isso falham com `jsxDEV is not a function`); os
arquivos alterados nesta task não são `.tsx`.

