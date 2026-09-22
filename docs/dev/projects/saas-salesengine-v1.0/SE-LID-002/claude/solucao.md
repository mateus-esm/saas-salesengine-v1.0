# SE-LID-002 — Solução final: rótulo do lead outbound + verificação do dedup por telefone

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LID-002 |
| Agente | claude (harness final) |
| Base | proposta do Verboo, commit `2c1bd38` (aceita como base — ver `revisao-do-fix-verboo.md`) |
| Decisão | Manter o fix do Verboo (rótulo derivado do telefone) e **fechar a lacuna de verificação do requisito (b)** com comentários no código + 1 teste novo. Nenhuma mudança de comportamento em runtime. |

---

## 1. Os dois requisitos do Mateus, e como cada um é atendido

### (a) "O lead deveria vir com a etiqueta completa — com nome e telefone."

Não existe nome real no payload de uma mensagem outbound: o contato não escreveu, então o provider
não tem um `contactName`/`pushName` do contato para mandar. "Etiqueta completa" não pode, portanto,
significar "nome humano" — significa **um rótulo utilizável + o telefone correto na coluna certa**,
que é exatamente o que a mudança do Verboo entrega:

- `leads.name` deixa de ser o placeholder `"Desconhecido"` e passa a ser `Lead <dígitos>` — os mesmos
  dígitos canônicos que `leads.phone_normalized` usa como chave;
- `leads.phone` fica com o número real (`identity.phone`, não nulo, não LID) — inalterado em relação
  ao que já acontecia para outras formas de payload;
- como o rótulo **contém** o telefone, a notificação fica legível mesmo se o `payload_template` da
  Casa Flow (não inspecionável neste sandbox — vive em `webhook_configs`, por equipe) só renderizar
  `{{lead.name}}`. Se o template também renderizar `{{lead.phone}}`, a notificação mostra o número
  duas vezes (cosmético, não um defeito) — mas nunca menos do que os dois requisitos.

### (b) "O telefone deveria passar no teste de duplicidade contra a base de contatos."

**Este é o ponto que o fix do Verboo não verificou explicitamente, e que fechei nesta revisão.**

Não existe uma tabela `contacts` separada de `leads` neste repositório — `public.leads` É a base de
contatos (confirmado por busca: nenhum `.from('contacts')` em `supabase/functions/`). O teste de
duplicidade contra essa base já existe, e já corre para mensagem outbound, e já corria **antes** desta
task inteira (SE-LID-001 e SE-LID-002 não o tocaram):

```
gpt-maker-webhook/index.ts:191-206  (passo 8, antes do fix e depois dele)
  SELECT id, gpt_maker_chat_id, phone FROM leads
   WHERE phone_normalized = phoneNorm AND equipe_id = ? AND deleted_at IS NULL

solo-wpp-webhook/index.ts:408-421   (idêntico, canal solo)
```

Três fatos, verificados por leitura direta do arquivo, comprovam que isso cobre o caso outbound:

1. **A consulta roda incondicionalmente** — não há `if (senderType === 'customer')` em volta dela em
   nenhum dos dois arquivos. O único gate de `senderType` no fluxo de criação está no passo 9c
   (Opportunity), não no passo 8 (dedup) nem no passo 9 (criação do lead).
2. **A chave (`phoneNorm`) vem de `resolveLeadIdentity()`**, que calcula `phoneNormalized` a partir do
   `contactPhone` bruto **independentemente** de o `contactName` estar vazio ou não
   (`lead-identity.ts:173`: `phoneNormalized: rawPhone ? normalizePhone(rawPhone) : null` — nada ali
   depende do nome). Uma mensagem outbound (sem nome) e uma mensagem inbound anterior do mesmo número
   (com nome) produzem a **mesma chave**, contanto que os dígitos do telefone sejam os mesmos.
   `normalizePhone()` é justamente a função que faz "+55 (85) 99648-7923", "5585996487923" e
   "5585996487923@s.whatsapp.net" convergirem para o mesmo valor — então variações de formatação entre
   o payload inbound e o outbound não escapam do dedup.
3. **O passo 9 (criação) só roda dentro de `if (!lead)`** — ou seja, só quando a busca do passo 8 (e a
   busca por `gpt_maker_chat_id` logo depois) não encontrou nada. Se a Casa Flow já tem um lead
   "Maria Souza" com aquele número e a equipe manda uma mensagem para ele, a busca por telefone
   **encontra essa linha**, `resolveLeadIdentity()` nem chega a ser usado para decidir um nome novo, e
   o nome "Maria Souza" **não é sobrescrito**. O rótulo `Lead <número>` só nasce quando o número é
   genuinamente novo para aquela equipe.

Essa era a peça que faltava verificar — não implementar. Não há nenhuma mudança de comportamento a
fazer aqui: implementar um segundo dedup seria duplicar uma verificação que já existe e já é
suficiente (`UNIQUE INDEX idx_leads_equipe_phone_normalized_unique` cobre a corrida concorrente com
`23505`, tratado nos dois handlers). O que fiz foi:

1. **Comentários no código**, exatamente nos dois pontos onde a busca por telefone acontece
   (`gpt-maker-webhook/index.ts:191-198`, `solo-wpp-webhook/index.ts:408-413`), deixando por escrito
   que a busca cobre outbound de propósito — para que ninguém, no futuro, "conserte" isso adicionando
   um gate de `senderType` ali (o mesmo cuidado que o Verboo já tinha tomado no passo 9, comentário em
   `gpt-maker-webhook:236-245`).
2. **Um teste novo** em `_shared/lead-identity.test.ts` (`"outbound: the phone dedup key matches an
   existing contact's key regardless of direction"`) que prova, no nível que é testável sem subir o
   handler nem o banco (os handlers chamam `serve()` no import, o que Verboo já registrou como
   impeditivo para testá-los diretamente), que a chave de dedup é **estável entre direção** — o mesmo
   número gera a mesma `phoneNormalized` venha o payload de uma mensagem inbound anterior (com nome)
   ou de uma outbound posterior (sem nome).

## 2. Por que não fui além disso

Considerei e descartei três alternativas mais invasivas:

- **Extrair a lógica de dedup dos dois handlers para uma função pura testável em `_shared/`.**
  Melhoraria a testabilidade, mas é refatoração de um caminho que já funciona corretamente e está em
  produção — risco desproporcional ao ganho para esta task, que é sobre um rótulo, não sobre a
  arquitetura de dedup. Não fiz.
- **Adicionar um SEGUNDO teste de duplicidade** (por exemplo, contra uma tabela de "contatos
  confirmados" diferente de `leads`). Não existe essa tabela — `leads` já é a base única de contatos.
  Criar uma seria uma mudança de arquitetura não pedida e não justificada pelo sintoma relatado.
- **Backfill das linhas `"Desconhecido"` já existentes.** Sem acesso a banco neste sandbox (mesma
  limitação do Verboo). O SQL de diagnóstico e de correção já está proposto em `verboo/fix.md` §7.1,
  com aprovação explícita pendente do dono da operação antes de rodar. Não fiz — não é reversível sem
  backup e mexe em dado de produção que este contrato pede para preservar como mínimo.

## 3. Diff final desta revisão sobre a proposta do Verboo

| Arquivo | Mudança |
|---|---|
| `supabase/functions/gpt-maker-webhook/index.ts` | +7 linhas de comentário no passo 8 (nenhuma linha de lógica mudou) |
| `supabase/functions/solo-wpp-webhook/index.ts` | +6 linhas de comentário antes do lookup por `phoneNorm` (nenhuma linha de lógica mudou) |
| `supabase/functions/_shared/lead-identity.test.ts` | +1 `Deno.test` (16 → 17), prova a estabilidade da chave de dedup entre direção inbound/outbound |

Nada em `resolveLeadIdentity()`, `leadNameFromPhone()`, `isTechnicalPhone()` ou no cálculo de
`senderType`/`isAgentMessage` foi alterado — a lógica de negócio é exatamente a que o Verboo propôs e
que revisei em `revisao-do-fix-verboo.md`.

## 4. Validação

Executado neste worktree (Deno 2.9.6, node/npm disponíveis):

| Comando | Resultado |
|---|---|
| `deno test supabase/functions/_shared/` | **136 passed, 0 failed** (135 da proposta do Verboo + 1 novo) |
| `deno test supabase/functions/_shared/lead-identity.test.ts` | **17 passed, 0 failed** |
| `deno check supabase/functions/_shared/lead-identity.ts` | Check ok |
| `deno check supabase/functions/_shared/phone.ts` | Check ok |
| `deno check supabase/functions/_shared/displayName.ts` | Check ok |
| `deno check supabase/functions/gpt-maker-webhook/index.ts` | Check ok |
| `deno check supabase/functions/solo-wpp-webhook/index.ts` | Check ok |
| `npm run typecheck` | limpo (não cobre `supabase/`, mas confirma que o resto do repo não quebrou) |
| `npm run lint` | 0 erros; 85 warnings pré-existentes, nenhum nos arquivos tocados por esta task |
| `NODE_ENV=test npm test` (vitest) | **NÃO EXECUTADO** — nenhum arquivo `.tsx`/frontend foi tocado por esta task, então não havia necessidade; registrado aqui para honestidade, não para mascarar |

Diferente do Verboo (que registrou tudo como "NÃO EXECUTADO — sandbox negou"), os runners funcionaram
neste ambiente e os resultados acima são de execução real, não de leitura estática.

## 5. `git status` desta branch, ao final

```
 M .claude/settings.local.json                                              (pré-existente, não desta task — ver verboo/fix.md §7.6)
 M docs/dev/.../SE-LID-002/contexto/spec.md                                  (pré-existente, snapshot do contrato ao chegar no worktree)
 M supabase/functions/_shared/lead-identity.test.ts                         (esta revisão — +1 teste)
 M supabase/functions/gpt-maker-webhook/index.ts                            (esta revisão — comentários)
 M supabase/functions/solo-wpp-webhook/index.ts                             (esta revisão — comentários)
?? docs/dev/.../SE-LID-002/claude/revisao-do-fix-verboo.md                  (novo, este agente)
?? docs/dev/.../SE-LID-002/claude/solucao.md                                (novo, este agente)
```

Nenhum arquivo de `main`/`master`, migration, asset compartilhado ou pasta de cliente foi tocado.

## 6. Rollback

**Risco desta revisão sobre a proposta do Verboo: nenhum.** As três mudanças desta camada são
comentários (não executam) e um teste novo (só roda em `deno test`, não em produção). Reverter:

```bash
git checkout -- supabase/functions/gpt-maker-webhook/index.ts \
                supabase/functions/solo-wpp-webhook/index.ts \
                supabase/functions/_shared/lead-identity.test.ts
```

isso volta exatamente ao estado do commit `2c1bd38` (a proposta do Verboo), sem efeito colateral —
nenhuma linha de lógica foi tocada por esta camada.

**Rollback do fix inteiro (Verboo + esta revisão), se necessário em produção:** reverter os arquivos
de código desta branch para o estado de `3eab92e` (HEAD antes de `2c1bd38`):

```bash
git checkout 3eab92e -- \
  supabase/functions/_shared/lead-identity.ts \
  supabase/functions/_shared/lead-identity.test.ts \
  supabase/functions/gpt-maker-webhook/index.ts \
  supabase/functions/solo-wpp-webhook/index.ts
```

Nenhuma migration, nenhum dado de produção e nenhuma configuração externa (`webhook_configs`) foram
alterados em nenhuma das duas camadas — o rollback é só de código e volta ao comportamento anterior
(rótulo `"Desconhecido"` para o caso outbound), sem efeito colateral em dados já gravados. Linhas
`"Desconhecido"` já existentes no banco não são tocadas por este fix nem pelo rollback — ver
`verboo/fix.md` §7.1 para a proposta de backfill (não executada, pendente de aprovação).

## 7. O que continua em aberto (herdado do Verboo, não fechado por esta revisão)

Ver `verboo/diagnostico.md` §7 e `verboo/fix.md` §7 para a lista completa. Resumo do que **não** foi
fechado nesta revisão, por falta de acesso a produção neste sandbox:

- payload outbound real do GPT Maker (para confirmar a ausência de `contactName`/`pushName`) — não
  capturado;
- qual canal (gpt-maker × solo) a Casa Flow usa hoje — não consultável sem acesso a `equipes` /
  `wpp_instances` de produção; o fix cobre os dois canais de propósito, então isso não bloqueia a
  correção;
- quantidade e destino das linhas `"Desconhecido"` já gravadas — não consultado, sem acesso a banco;
- `creation_source`/`source`/`origem` de um lead criado por outbound (`'ai_agent'`/`'IA'`, mesmo
  quando quem iniciou foi a equipe) — observado, não alterado, decisão de produto fora do escopo do
  sintoma;
- `@lid` ainda gravado em `leads.phone` no canal solo — lacuna pré-existente do SE-LID-001, não desta
  task, documentada no próprio código (`solo-wpp-webhook:425-429`).
