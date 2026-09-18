# SE-LID-002 — Revisão crítica do diagnóstico e do fix do Verboo

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LID-002 |
| Revisor | claude (harness final) |
| Peça revisada | commit `2c1bd38` (proposta do Verboo, NÃO final) + `verboo/diagnostico.md` + `verboo/fix.md` |
| Veredito | **Aceito o diagnóstico e o fix como corretos e proporcionais.** Refinei em dois pontos (abaixo) e fechei uma lacuna de verificação que o próprio Verboo sinalizou como faltante: o requisito (b) — dedup por telefone. |

---

## 1. O que aceito sem ressalva

**O mecanismo da causa raiz está certo.** Conferi linha a linha contra o HEAD atual do worktree
(`supabase/functions/gpt-maker-webhook/index.ts`, `solo-wpp-webhook/index.ts`,
`_shared/lead-identity.ts`, `_shared/phone.ts`, `_shared/displayName.ts`):

- a mensagem outbound (equipe inicia a conversa) **cria** o lead de propósito — o gate de
  `senderType === 'customer'` existe só para a Opportunity (`gpt-maker-webhook:492` pós-fix), nunca
  para o passo 9 de criação; confirmado por leitura direta, não por inferência;
- `messages.lead_id` é `NOT NULL` — recusar a criação apagaria a conversa outbound, não "pularia uma
  mensagem". O guard `if (!lead) throw` está lá (`gpt-maker-webhook:373`, `solo-wpp-webhook:503`);
- `resolveLeadIdentity()` é de fato o único ponto de decisão, e o literal `"Desconhecido"` era
  produzido exatamente pela combinação "nome vazio + telefone real" — a única combinação que sobra
  quando se elimina as outras cinco linhas da tabela de precedência;
- a dedução de que o payload do incidente **não trazia `pushName`** (§3 do diagnóstico) é um
  argumento válido: se trouxesse, o rótulo seria o nome da conta da equipe, não o placeholder — outro
  sintoma. A lógica é sólida mesmo sem o payload capturado.

**A decisão de domínio (opção b — criar o lead, rotular pelo telefone) é a certa** dado o estado atual
do schema (`messages.lead_id NOT NULL`, sem soft-skip). Não vejo alternativa melhor sem migration.

**Os quatro arquivos de código estão bem executados**: `leadNameFromPhone()` é reusado pelos dois
webhooks em vez de duplicado; a ordem dos ramos em `resolveLeadIdentity()` é explícita (não
`||`-encadeada, que escondia um ramo inalcançável); o predicado `isAgentMessage` é uma variável
única compartilhada entre `senderType` e o nome, fechando exatamente a classe de bug que causou o
sintoma (um marcador existir e não ser consultado no lugar certo). Rodei os testes e o `deno check`
— ver §4 — e tudo passa.

**Rodei o que o Verboo não conseguiu rodar** (ele registrou "NÃO EXECUTADO — sandbox negou"; aqui os
runners funcionaram):

```
deno test supabase/functions/_shared/     → 135 passed, 0 failed (antes da minha mudança)
deno check lead-identity.ts / phone.ts / displayName.ts / gpt-maker-webhook/index.ts / solo-wpp-webhook/index.ts
                                           → Check ok nos 5 arquivos
npm run typecheck                         → limpo
npm run lint                              → 0 erros, 85 warnings pré-existentes (nenhum nos arquivos tocados)
```

Isso confirma por execução, não só por leitura estática, que a proposta do Verboo não quebra nada de
observável no sandbox atual.

## 2. Onde o Verboo simplificou — e o que fiz sobre isso

### 2.1 Requisito (b) — dedup por telefone — foi verificado por mim, não pelo Verboo

O contrato desta task diz explicitamente: *"o fix do Verboo NÃO trata isso explicitamente"*. Isso é
verdade — `fix.md` menciona dedup só de passagem, na linha "Risco de duplicar lead: **Nenhum**...",
sem mostrar o mecanismo. Tracei o caminho eu mesmo:

- `gpt-maker-webhook/index.ts:191-206` (passo 8) faz `SELECT ... WHERE phone_normalized = phoneNorm
  AND equipe_id = ...` **antes** do passo 9 (criação), e essa consulta **não é condicionada a
  `senderType`** — corre igual para mensagem de cliente e de agente;
- o mesmo vale para `solo-wpp-webhook/index.ts:408-421`;
- `phoneNorm` vem de `identity.phoneNormalized`, que `resolveLeadIdentity()` calcula a partir do
  `contactPhone` bruto **independentemente** de haver nome ou não — ou seja, uma mensagem outbound
  (sem nome) produz a mesma chave de dedup que uma mensagem inbound anterior do mesmo número (com
  nome), porque `normalizePhone()` é uma função pura de canonicalização de dígitos.

**Conclusão: o requisito (b) já estava satisfeito pelo código existente antes desta task — não pelo
fix do Verboo especificamente, mas pela arquitetura Sprint 5.5 (dedup por `phone_normalized`), que
nunca teve gate de `senderType`.** O Verboo não errou ao não mexer nisso (mexer seria escopo
desnecessário), mas também não **verificou e documentou** isso, que era peça explícita do requisito
do Mateus. Tratei essa lacuna como a principal entrega desta revisão — ver `solucao.md` §2 e §3.

### 2.2 "Etiqueta completa nome + telefone" — o mesmo raciocínio, uma ressalva a mais

O rótulo `Lead <número>` cumpre o requisito (a) da forma que os dados permitem: não existe nome real
no payload outbound (a Casa Flow não pode ter mandado um nome que não tem), então "nome E telefone"
não pode significar "nome humano real" — só pode significar "um rótulo utilizável, mais o telefone
gravado e correto". Isso o fix entrega: `identity.phone` fica com o número real (não nulo, não LID) e
`identity.name` embute os mesmos dígitos. Uma vantagem que nem o Verboo nem o diagnóstico registraram
explicitamente: como o rótulo **contém** o telefone, a notificação fica legível mesmo se o
`payload_template` do webhook da Casa Flow (que não temos acesso para inspecionar — está em
`webhook_configs`, por equipe) só renderizar `{{lead.name}}` e não `{{lead.phone}}`. Isso não é uma
falha do Verboo — é um reforço que vale documentar (`solucao.md` §2.3).

### 2.3 Duas simplificações menores, aceitas conscientemente

- O rótulo `Lead <número>` mistura inglês ("Lead") com PT-BR nas notificações. Não é uma regressão —
  é o mesmo rótulo que o resto do código já usa para "número conhecido, nome desconhecido" desde antes
  desta task (`lead-identity.ts`, ramo de nome técnico). Trocar por um rótulo em português mudaria uma
  convenção já em produção e potencialmente consumida por automações externas do cliente
  (`payload_template` faz parsing de string). Não mexi.
- `creation_source: 'ai_agent'` / `source: 'IA'` continuam gravados para um lead criado por mensagem
  da equipe. O próprio Verboo marcou isso como fora de escopo (`fix.md` §7.4) porque afeta
  filtros/atribuição em produção. Concordo em não mexer: não é o sintoma relatado e o risco de
  regressão em relatórios existentes é desproporcional ao ganho.

## 3. O que ficou como hipótese — e continua como hipótese

Não encontrei forma de fechar nenhuma das hipóteses que o Verboo já havia marcado como tal (não há
acesso a banco nem a um payload outbound real capturado neste sandbox):

| Hipótese | Situação depois da minha revisão |
|---|---|
| Payload outbound do GPT Maker vem sem `contactName`/`pushName` | Continua deduzido do sintoma (o literal `"Desconhecido"` só é alcançável por essa combinação) — não capturado |
| `pushName` em evento `fromMe:true` no canal solo | Continua hipótese — nenhum payload outbound documentado no repo traz o campo |
| Qual canal a Casa Flow usa hoje (gpt-maker × solo) | Continua não provado — por isso concordo em manter o fix nos dois canais, simetricamente |
| Linhas `"Desconhecido"` já existentes no banco | Continua não consultado — sem acesso a banco neste sandbox também |

Não fechei essas hipóteses porque fechá-las exige acesso a produção (logs reais, banco), que este
sandbox não tem — a mesma limitação do Verboo. O que mudou é que a hipótese que **era fechável só por
leitura de código** (o requisito de dedup) foi fechada, e está documentada com as linhas exatas em
`solucao.md`.

## 4. Validação executada nesta revisão

| Comando | Resultado |
|---|---|
| `deno test supabase/functions/_shared/` (antes da minha mudança, sobre a proposta do Verboo) | **135 passed, 0 failed** |
| `deno check` nos 5 arquivos de `_shared/` + os 2 webhooks | **Check ok** nos 5 |
| `npm run typecheck` | limpo |
| `npm run lint` | 0 erros; 85 warnings pré-existentes, nenhum nos arquivos desta task |

Isso substitui o "NÃO EXECUTADO — sandbox negou" do Verboo por resultado real. Depois de aplicar meu
próprio refinamento (comentários + 1 teste novo, ver `solucao.md`), rodei de novo — ver `solucao.md`
§4 para os números finais.
