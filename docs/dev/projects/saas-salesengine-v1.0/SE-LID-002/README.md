# SE-LID-002 — Mensagem iniciada pela equipe (outbound) criava lead "Desconhecido"

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LID-002 |
| Origem | Relato do usuário em 2026-09-18: "Continua o mesmo erro de desconhecido lead na equipe do Casa Flow. O que eu analisei: são mensagens que foram iniciadas pelo próprio usuário, e essas mensagens ficam como desconhecido." (continuação do SE-LID-001 / #29, que tratou o `@lid` técnico) |
| Agentes | verboo (diagnóstico + fix com código, commit `2c1bd38`, proposta) → claude (revisão crítica + fechamento do requisito de dedup + validação executada, harness final) |
| Status | ✅ Fix revisado e aceito, com refinamento (comentários + 1 teste) · ✅ validação **EXECUTADA** neste ambiente: `deno test` (136 passed), `deno check` (5 arquivos ok), `npm run typecheck`/`lint` limpos · ⛔ sem commit/push (conforme o contrato) |
| Artefatos | `contexto/spec.md` (contrato) · `verboo/diagnostico.md` · `verboo/fix.md` · `claude/revisao-do-fix-verboo.md` · `claude/solucao.md` · este README |
| Pendências | backfill das linhas antigas `"Desconhecido"` (SQL proposto em `verboo/fix.md` §7.1, **não executado**) · enriquecimento do nome pelo `pushName` inbound do provider (§7.2) · `@lid` ainda gravado em `leads.phone` no canal solo (§7.3) · `creation_source` de lead outbound no gpt-maker (§7.4) · índice UNIQUE parcial em `(equipe_id, gpt_maker_chat_id)` (§7.5) · payload outbound real e canal ativo da Casa Flow não capturados (hipóteses, ver `claude/solucao.md` §7) |

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

## Requisito (b) — dedup por telefone — verificado, não implementado de novo

O contrato pedia para checar explicitamente se "o telefone passa no teste de duplicidade contra a
base de contatos". O fix do Verboo não verificava isso por escrito. Tracei o código: `public.leads` É
a base de contatos (não existe tabela `contacts` separada), e os dois webhooks já fazem
`SELECT ... WHERE phone_normalized = ?` **antes** de criar um lead, **sem** gate de `senderType` —
ou seja, isso já cobria mensagem outbound antes desta task inteira (Sprint 5.5 EPIC 1). O requisito
(b) estava satisfeito pela arquitetura existente; o que faltava era essa verificação por escrito.
Detalhes com linha exata em `claude/solucao.md` §1.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/functions/_shared/lead-identity.ts` | (verboo) `leadNameFromPhone()` (novo, reusado pelos dois webhooks) + precedência do nome sem o placeholder |
| `supabase/functions/gpt-maker-webhook/index.ts` | (verboo) predicado único `isAgentMessage` reusado pelo `senderType` e pelo nome — `pushName` do remetente não rotula mais o contato; nota no passo 9 explicando por que **não** há gate `senderType === 'customer'` na criação do lead + log quando o lead nasce de mensagem da equipe. (claude) +comentário no passo 8 documentando que o dedup por telefone já cobre outbound |
| `supabase/functions/solo-wpp-webhook/index.ts` | (verboo) `pushName` só rotula lead em mensagem inbound (`senderType === 'customer'`). (claude) +comentário no lookup por `phoneNorm`, mesma nota |
| `supabase/functions/_shared/lead-identity.test.ts` | (verboo) 5 asserções do SE-LID-001 reescritas + 3 testes novos (seção OUTBOUND + invariante `"Desconhecido"` + helper); 13 → 16 `Deno.test`. (claude) +1 teste: chave de dedup estável entre payload inbound e outbound do mesmo número; 16 → 17 |

## Como validar

✅ **Executado neste ambiente** (Deno 2.9.6, node/npm disponíveis — diferente do sandbox do Verboo):

```bash
deno test supabase/functions/_shared/                    # 136 passed, 0 failed
deno check supabase/functions/_shared/lead-identity.ts    # ok
deno check supabase/functions/gpt-maker-webhook/index.ts  # ok
deno check supabase/functions/solo-wpp-webhook/index.ts   # ok
npm run typecheck                                          # limpo
npm run lint                                                # 0 erros (85 warnings pré-existentes, fora do fix)
```

⚠️ Os scripts npm **não cobrem** `supabase/`: `tsconfig.json:15-17` exclui `supabase`,
`eslint.config.js:13` ignora `supabase/functions` e `vite.config.ts:30` exclui `supabase/functions/**`
do vitest — quem cobre este fix é o **Deno**. `NODE_ENV=test npm test` não foi rodado: nenhum arquivo
`.tsx`/frontend foi tocado por esta task. Números e comandos completos em `claude/solucao.md` §4.

