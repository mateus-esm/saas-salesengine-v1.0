# SE-LID-002 — Diagnóstico: lead "Desconhecido" criado por mensagem OUTBOUND

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LID-002 |
| Agente | verboo (diagnóstico + fix com código) |
| Branch | `fix/desconhecido-outbound-leads` |
| Data | 2026-09-18 |
| Base analisada | HEAD = `3eab92e` (merge #31), ou seja **depois** do fix SE-LID-001 (#29 / `d4221a3`) |
| Sintoma | Relato de 2026-09-18: "Continua o mesmo erro de desconhecido lead na equipe do Casa Flow. O que eu analisei: são mensagens que foram iniciadas pelo próprio usuário, e essas mensagens ficam como desconhecido." |

---

## 0. Resumo em uma frase

A mensagem outbound (equipe inicia a conversa) **cria** o lead — isso está correto e é intencional —
mas o **rótulo** desse lead era o literal `"Desconhecido"`, porque o payload de uma mensagem outbound
não traz nome de contato (o contato não é quem escreveu). O SE-LID-001 blindou o caminho contra
**IDs técnicos**, não contra **campo de nome vazio** — e o próprio SE-LID-001 fixou a linha
"nome vazio + telefone real" como `"Desconhecido"`.

A cadeia completa, em uma linha:

```
mensagem outbound (fromMe/role:assistant, sem contactName)
  → gpt-maker-webhook passa pelo gate de payload (:118-125) e cria o lead (:211-241, sem gate de senderType)
  → resolveLeadIdentity() cai no ramo "sem nome" e devolve "Desconhecido"
  → INSERT em leads (:254) dispara dispatch_contact_created_webhooks AFTER INSERT (:177-179)
  → payload_template renderiza {{lead.name}} → notificação/CRM mostram "Desconhecido"
```

---

## 1. Correção das linhas citadas no contrato

O contrato (hipótese) aponta `gpt-maker-webhook/index.ts:54` (`senderName = isTechnicalSenderId ? '' : …`),
`:124-126` (`senderType`) e `:410` (gate da Opportunity). **Essas referências são do arquivo anterior ao
merge do SE-LID-001**, que reescreveu o topo do handler. No HEAD atual (`3eab92e`):

| Hipótese do contrato | Onde está no HEAD | Situação |
|---|---|---|
| `:54 senderName = isTechnicalSenderId ? … : (rawSenderName \|\| 'Desconhecido')` | **não existe mais** — substituído por `:42` `rawSenderName` + `:43-46` `resolveLeadIdentity({contactName, contactPhone})` | confirmado em substância, linha mudou |
| `:124-126 senderType = 'agent'` quando `role === 'assistant' \|\| fromMe === true` | `:127-133` (pré-fix) | ✅ confirmado |
| criação de lead (`passo 9`) sem gate `senderType === 'customer'` | `:211-241` (pré-fix); o `if (!lead)` abre em `:222` | ✅ confirmado |
| só a Opportunity tem gate | `:467` `if (senderType === 'customer')` (passo 9c, pré-fix) | ✅ confirmado |
| `solo-wpp-webhook/index.ts:365` `key.fromMe ? 'agent' : 'customer'` | `:371` no HEAD (pós-fix) — a linha deslocou | ✅ confirmado |

A hipótese do contrato estava **certa no mecanismo e desatualizada nas linhas** — ela foi escrita contra o
arquivo anterior ao merge do SE-LID-001, que reescreveu o topo do handler.

**Convenção de linhas deste documento.** As seções 1 e 2 descrevem o **defeito**, então citam o HEAD
**pré-fix** (`3eab92e`) — é nesse código que o bug vive. As seções 5 e 6 (e o `fix.md` inteiro) citam o
código **pós-fix**, que é o que está na branch. A tabela de equivalência pré→pós está no fim da §2.3.

---

## 2. Cadeia causal com evidência `arquivo:linha`

### 2.1 A mensagem outbound não é descartada em nenhum ponto do pipeline

`supabase/functions/gpt-maker-webhook/index.ts`:

- `:24-30` — só `role === 'tool'` é descartado (log interno do agente). Mensagem de agente **segue**.
- `:117-125` — gate de payload: exige telefone **ou** `chatId`, e conteúdo/mídia não vazio. Uma mensagem
  que a equipe enviou para um número tem ambos → **passa**.
- `:127-133` — `senderType = 'agent'` quando `payload.role === 'assistant' || payload.fromMe === true`.
  Esse é o único marcador de "outbound" no handler; ele é usado em `:467`, `:550`, `:639`, `:660`
  (pré-fix) — **nunca** no passo 9.

### 2.2 O nome do lead nasce em `resolveLeadIdentity()`, e o caminho de agente não tem nome

O payload de uma mensagem outbound não carrega nome do contato. No GPT Maker o nome é montado em `:42`
(pré-fix; pós-fix `:53-54`) como `payload.contactName || payload.pushName` — e `pushName` é o nome do
**remetente**: em uma mensagem que o contato não escreveu, não há o que preencher. O nome, então, é
decidido em `supabase/functions/_shared/lead-identity.ts` pela precedência (pós-fix deste documento, ver
`fix.md`):

| `contactName` | `contactPhone` | nome (pré-fix, HEAD) |
|---|---|---|
| nome real | qualquer | o nome real |
| id técnico | telefone real | `Lead <n>` |
| id técnico | vazio | `Novo Visitante` |
| **vazio** | **telefone real** | **`"Desconhecido"`** ← o sintoma |
| vazio | id técnico | `[WhatsApp - Lead Anônimo]` |
| vazio | vazio | `"Desconhecido"` |

O código pré-fix (HEAD) que produzia a linha do sintoma está em `lead-identity.ts` (ramo final do
`if/else if` de nome): o comentário era literalmente *"The payload carried no name field at all.
Pre-existing label, kept as-is."*.

> Nota sobre as linhas desta seção: os números abaixo são do HEAD **pré-fix** (`3eab92e`), porque é nesse
> código que o defeito vive. Depois do fix eles deslocam (a tabela de equivalência está no fim desta seção).

### 2.3 O lead é criado — sem nenhum gate de `senderType`

`gpt-maker-webhook/index.ts:211-241` (pré-fix; ver tabela de equivalência abaixo):

- `:212-223` documenta o índice UNIQUE e as compensações do SE-LID-001;
- `:228` `const finalName = identity.name` e `:241` `name: finalName` — o rótulo entra no `INSERT`;
- em nenhum ponto entre `:211` e `:241` há condição sobre `senderType`.

É exatamente o assimetria apontada no contrato: a Opportunity (passo 9c, `:467` pré-fix) tem o gate e o
comentário "Mensagens de agente NÃO disparam"; a criação do lead não tem. Para o funil isso está certo
(mensagem outbound não deve abrir negócio), mas o lead — a linha em `public.leads` — é criado do mesmo jeito.

**Equivalência de linhas (pré-fix `3eab92e` → pós-fix)**, conferida com `git show HEAD:<arquivo>`. Os dois
documentos usam apenas os números **pós-fix**, exceto nas seções que descrevem o defeito:

| Âncora | pré-fix | pós-fix |
|---|---|---|
| `rawSenderName` (fonte do nome) | `:42` | `:53-54` |
| `resolveLeadIdentity(...)` | `:43-46` | `:55-58` |
| gate de payload (telefone/chatId) | `:117-125` | `:129-137` |
| `senderType` (condição inline) | `:127-133` | `:139-145` (predicado `isAgentMessage` em `:47`) |
| comentário do passo 9 (novo) | — | `:236-245` |
| `if (!lead)` | `:222` | `:247` |
| `const finalName` / `name: finalName` | `:228` / `:241` | `:253` / `:266` |
| `creation_source: 'ai_agent'` | `:245` | `:270` |
| guard `Lead nulo após processamento` | `:348` | `:373` |
| gate da Opportunity (passo 9c) | `:467` | `:492` |
| gates `senderType === 'customer'` (unread/IA) | `:550`, `:639`, `:660` | `:575`, `:664`, `:685` |
| INSERT em `messages` | `:619` | `:644-654` |

> Como os números foram conferidos: `git show HEAD:<arquivo>` para a coluna pré-fix (a versão base lida
> sem qualquer edição desta task) e `Read`/`Grep` sobre a árvore de trabalho para a coluna pós-fix. Uma
> rodada anterior de revisão citou `:480` (gate da Opportunity) e `:254` (`name: finalName`), que vinham de
> uma leitura intermediária e **estavam errados**; os valores desta tabela são os conferidos linha a linha.

### 2.4 O rótulo chega à equipe sem nenhuma máscara depois do banco

- `supabase/migrations/20260807000000_split_contact_pipeline_webhooks.sql:177-179` —
  `CREATE TRIGGER dispatch_contact_created_webhooks AFTER INSERT ON public.leads`: **todo** INSERT em
  `leads` (inclusive o do passo 9) enfileira o evento `contact_created`.
- `:98-124` — o payload é montado com `'lead', to_jsonb(NEW)` — a linha crua.
- O `payload_template` padrão (`20260806000000_configurable_lead_webhooks.sql`) renderiza `{{lead.name}}`
  e `{{lead.phone}}` direto da coluna, e `render_webhook_payload` só faz o lookup do path. **Não existe
  ponto de máscara depois do banco** — quem compõe o texto da notificação é o consumidor externo
  (`webhook_configs.url`, a automação do cliente).

Ou seja: o literal `"Desconhecido"` que a equipe vê **é** o valor gravado em `leads.name`.

---

## 3. Por que o próprio sintoma prova o formato do payload

Não foi preciso capturar o payload para saber o que ele contém — o **literal** que a equipe vê elimina as
outras possibilidades. Pela tabela de 2.2, no HEAD só existe **uma família de payloads** que produz
`"Desconhecido"`: `contactName` vazio **e** `contactPhone` não-técnico (com ou sem número utilizável).
Todas as outras combinações produzem nome real, `Lead <n>`, `Novo Visitante` ou
`[WhatsApp - Lead Anônimo]` — nenhuma delas é `"Desconhecido"`.

Consequências verificáveis:

1. o evento outbound chega **sem campo de nome** (`contactName`/`pushName` ausentes ou em branco);
2. o telefone **não** é um `@lid` (senão o SE-LID-001 já o teria mascarado como `[WhatsApp - Lead Anônimo]`);
3. portanto o payload é "número real + nome ausente" — o formato exato de uma mensagem iniciada pela equipe.

Essa dedução vale para o código **pré-fix**, que já lia o `pushName` (`:42` pré-fix). Ou seja: o literal
`"Desconhecido"` prova que **nem** `contactName` **nem** `pushName` vieram preenchidos. Se o `pushName`
tivesse vindo, o rótulo seria o nome da conta remetente — **outro** sintoma, não o relatado. Isso é o que
permite afirmar que o gate do `pushName` adicionado no fix (§`fix.md` §3.3) fecha a classe de defeito sem
ser, ele mesmo, a correção do sintoma: a correção do sintoma é a derivação do número em
`lead-identity.ts`.

Isso também explica por que o sintoma **volta** depois do SE-LID-001: aquele fix mudou as duas linhas com
`isTechnicalId`/`isTechnicalPhone` verdadeiros; a linha do sintoma nunca teve id técnico nenhum.

---

## 4. Por que a máscara do SE-LID-001 não cobriu este caminho

| | SE-LID-001 (#29) | SE-LID-002 (esta task) |
|---|---|---|
| Entrada que motivou | `contactPhone = "186432031355045@lid"` (id técnico da Meta) | campo de nome **vazio** em mensagem outbound |
| Pergunta feita | "este valor é um **id técnico**?" | "**quem enviou** esta mensagem, e existe nome do contato?" |
| Módulo de decisão | `_shared/lead-identity.ts` (`resolveLeadIdentity`) | o mesmo módulo — estendido, não duplicado |
| Linha "nome vazio + telefone real" | **preservada de propósito** como `"Desconhecido"` (tabela do módulo, linha marcada `previous`) | é exatamente a linha que passa a ser derivada do telefone |
| Teste que fixava o comportamento | `lead-identity.test.ts`: *"a real phone with no name at all keeps the previous label and the phone"* → `assertEquals(name, "Desconhecido")` | esse teste foi reescrito — hoje é *"outbound: a real phone with no name at all is labelled from the number"* → `Lead 5585996487923` (ver `fix.md` §4) |

A causa raiz é, então, **dupla e localizada no mesmo ponto**:

1. o rótulo de fallback para "sem nome, com número" era um *placeholder de falha* (`"Desconhecido"`), não
   um rótulo útil — e o SE-LID-001 o deixou explicitamente como estava;
2. o `pushName`/`contactName` era tratado como "nome do contato" independentemente de **quem enviou** a
   mensagem, o que é falso por definição em uma mensagem outbound.

O item (2) **não** é o que produz o sintoma relatado — no caminho gpt-maker o campo simplesmente vem vazio
(§3), e é o item (1) que transforma "vazio" em `"Desconhecido"`. O item (2) é a mesma classe de defeito na
outra ponta: no gpt-maker ele era latente (`payload.pushName` entrava no nome sem consultar `isAgentMessage`,
`:42` pré-fix) e no solo-wpp era explícito (§6). O fix fecha os dois — a causa do sintoma está no item (1),
a simetria da classe está no item (2).

---

## 5. Pergunta de domínio: mensagem OUTBOUND deve CRIAR lead?

**Resposta: (b) — criar, mas com nome derivado do telefone (fallback coerente).** Justificativa em três
frentes, todas verificáveis no repositório:

**(i) O contato existe e é um lead legítimo.** A mensagem outbound tem um destinatário real (número em
`key.remoteJid` / `contactPhone`). A opção (a) — "não criar quando não há contato identificado" — não se
aplica: o gate de payload de `gpt-maker-webhook:118-125` **já rejeita** o caso em que não há nem telefone
nem `chatId`. O que sobra é sempre um contato identificado por número. Um prospect que a equipe procurou é
exatamente o que um CRM deve ter na base.

**(ii) Recusar a criação não "pula uma mensagem" — apaga a mensagem.** `public.messages.lead_id` é
`UUID NOT NULL REFERENCES public.leads(id)`
(`supabase/migrations/20251224215400_c565ab2a-f1ad-42e2-90dd-e41ac34c03e8.sql:22`), e os dois webhooks
gravam a mensagem com esse `lead_id` sem gate de `senderType`
(`gpt-maker-webhook:645-654`, `solo-wpp-webhook:719-729`, pós-fix). Sem lead, o INSERT da mensagem falha e
o handler estoura no guard `if (!lead) throw new Error("Falha inesperada: Lead nulo após processamento")`
(`gpt-maker-webhook:373`, `solo-wpp-webhook:503`): a conversa outbound desapareceria do CRM e o provider
ainda receberia erro (retentativas). A opção (a) seria, na prática, "descartar conversas iniciadas pela
equipe" — o oposto do que a equipe pediu.

**(iii) A opção (c) — "criar e resolver o nome real depois" — já existe em parte, e por isso é complemento,
não substituta de (b).** Existe um caminho que atualiza `name` de um lead já criado:
`analyze-message/index.ts:278` monta `leadUpdates.name = data.name` (nome extraído pela IA do conteúdo) e
`:362` aplica `update(leadUpdates)` em `leads`. Ele é disparado pelos dois webhooks **só para mensagem de
cliente** (`gpt-maker-webhook:685`, `solo-wpp-webhook:759`, sob `senderType === 'customer'` e
`is_crm_agent_enabled`). Então o lead que nasce com `Lead <número>` **pode** ser renomeado quando o contato
responder — mas somente depois que ele responde, e com o agente de CRM ligado. O que não existe é
enriquecimento a partir do `pushName` da mensagem inbound do provider (seria imediato e não dependeria da
IA); está registrado como pendência em `fix.md` §7.2 (mexe em linhas existentes, precisa de decisão de
produto). Em qualquer caso, (c) pressupõe que a linha exista **com um rótulo utilizável**, que é justamente
o que (b) entrega — e é por isso que (b) é a base e (c) é o complemento.

O que **não** se justifica é manter o gate de `senderType` fora do passo 9 e o rótulo como está: a
combinação produzia "lead criado, mas ilegível". A escolha implementada é (b) com o mesmo rótulo que o
resto do código já usa para "número conhecido, nome desconhecido" (`Lead <número>` — ver `fix.md` §2).

---

## 6. O mesmo defeito existe no `solo-wpp-webhook`? **Sim** (mesma classe; rótulo diferente)

`supabase/functions/solo-wpp-webhook/index.ts` (linhas **pós-fix**). Os deslocamentos desta task são dois:
`+1` a partir do import novo (linha 25) e `+9` a partir do bloco de comentário que antecede
`contactPushName`; onde o número pré-fix importa, ele está indicado.

- `:371` `const senderType = key.fromMe ? 'agent' : 'customer'` — o mesmo marcador de outbound;
- `:423-446` criação do lead, **sem gate de `senderType`** (idêntico ao gpt-maker);
- `:503` mesmo guard `throw new Error("Falha inesperada: Lead nulo apos processamento")`;
- `:591`, `:663`, `:739`, `:759` — os gates de `senderType === 'customer'` existem para análise de IA,
  unread e Opportunity, **não** para a criação do lead;
- `:719-729` INSERT em `messages` com `lead_id: lead.id`, sem gate;
- `:369` `extractPhoneFromJid(key.remoteJid)` → `:444` `phone: phone || null`: para um `@lid`, o id **pelado**
  entra em `leads.phone` (ver ressalva no fim desta seção).

O defeito específico: em `:430-432` (pré-fix) — hoje `:439-441` — o rótulo era

```ts
const senderName = technicalJid
  ? formatDisplayName(pushName, null)
  : (pushName || (phone ? `Lead ${phone}` : 'Novo Visitante'))
```

`pushName` é o nome de **quem enviou** — a documentação do próprio repositório usa o campo apenas no
exemplo inbound, com `"pushName": "Maria Cliente"` (`Planning/Sprints/sprint_7_api_reference.md:133-156`,
`key.fromMe: false`). Em uma mensagem outbound (`key.fromMe: true`, formato documentado em
`sprint_7_api_reference.md:100-108`) o campo ou **não vem** — e aí o lead nasce como `Lead <número>`, que é
utilizável — ou vem com o `pushName` da **própria conta conectada**, e aí o contato fica nomeado com o nome
da equipe. Nenhum dos dois casos usa o nome do contato, e o código não distingue os casos.

**Honestidade sobre a evidência:** o segundo caso (conta conectada ecoando o próprio `pushName`) é
**hipótese**, não prova — não há payload outbound capturado neste repositório; o único shape outbound
documentado (`:100-108`, resposta do `sendText`) **não** traz `pushName`. O que está **provado por código** é
que nada impede um campo de remetente de virar o nome do contato, e é isso que o fix fecha (§`fix.md` §3.3).

**Diferença de sintoma entre os dois canais:** o `solo-wpp-webhook` **nunca escreve** o literal
`"Desconhecido"` (não há essa string no arquivo — busca no repositório inteiro: só aparece em
`_shared/lead-identity.ts`, nos testes dele e em docs). Como o relato é literalmente "desconhecido", o
caminho que produziu o sintoma do Casa Flow é o **gpt-maker**; se a instância tiver migrado para o Solo, o
sintoma seria outro (`Lead <número>` ou o nome da conta). Não foi possível provar qual canal a equipe Casa
Flow usa hoje a partir do repositório: `gpt-maker-webhook` resolve a equipe por `equipes.gpt_maker_agent_id`
e `solo-wpp-webhook` por `wpp_instances.instance_name`, e ambos podem estar ativos. O fix cobre os dois.

**Ressalva fora do escopo (não é o sintoma, e não foi alterada):** neste canal o `@lid` **continua indo para
`leads.phone`**. `:369` `extractPhoneFromJid(key.remoteJid)` devolve o id pelado (`"186432031355045"`) e
`:444` grava `phone: phone || null`; o `technicalJid` de `:430` alimenta **só** o rótulo. O próprio código
documenta o trade-off em `:425-429`: o valor permanece como **chave de dedup** porque este caminho não tem
*fetch* por chat id — anulá-lo criaria um lead por mensagem. Efeito colateral: no `contact_created` desse
canal, `{{lead.phone}}` ainda pode renderizar o id. Isso **não** contradiz o fix desta task (que é de
rótulo), mas contradiz o **título** do SE-LID-001 ("o `@lid` não vira nome nem telefone") — a metade
"telefone" nunca foi fechada aqui. Fechar exige migration/estratégia de dedup; registrado em `fix.md` §7.3.
Nada disso foi tocado por esta task.

---

## 7. O que **não** foi provado / hipóteses em aberto

| Item | Status | Como fechar |
|---|---|---|
| Payload outbound do GPT Maker vem sem `contactName` | **deduzido do sintoma** (§3) — não há payload capturado no repositório | ler o log `[Webhook] Recebido:` da função `gpt-maker-webhook` (o handler loga o corpo em `:21`) para um evento outbound real |
| `pushName` em `messages.upsert` com `fromMe: true` (solo) | **hipótese** — o único shape outbound documentado não tem o campo | capturar um evento `messages.upsert` de mensagem enviada pela equipe |
| Qual canal a equipe Casa Flow usa hoje (gpt-maker × solo) | **não provado** | consultar `equipes.gpt_maker_agent_id` e `wpp_instances` da equipe |
| Linhas `"Desconhecido"` já existentes no banco | **não consultado** — sem acesso a banco neste sandbox | `select id, name, phone, phone_normalized, created_at from leads where name = 'Desconhecido' and deleted_at is null order by created_at desc;` (somente leitura) |
| `creation_source` de um lead criado por outbound no gpt-maker | **observado, não alterado** — `:245` pré-fix (`:270` pós-fix) grava `ai_agent` / `source: 'IA'` / `origem: 'IA'` mesmo quando quem iniciou foi a equipe; o solo já usa um valor de canal (`solo_api`, `solo-wpp-webhook:462`) | decisão de produto; mexer altera filtros/atribuição (`fix.md` §7.4) |
| `payload.pushName` sem gate no gpt-maker (nome do **remetente** podia virar nome do contato; assimétrico com o solo) | **observado** no código (pré-fix `:42`) e **fechado** nesta task — ver `fix.md` §3.3. Não era a causa do sintoma: o payload do incidente não tinha `pushName` nenhum | — (fechado) |
| Enriquecimento do nome de um lead **já criado** | **existe em parte** — `analyze-message/index.ts:278` + `:362` atualizam `leads.name` com o nome extraído pela IA, mas só para mensagem de **cliente** (`gpt-maker-webhook:685`, `solo-wpp-webhook:759`) | não existe enriquecimento pelo `pushName` inbound do provider; pendência em `fix.md` §7.2 |
| `@lid` gravado em `leads.phone` no canal solo | **observado, não alterado** — `solo-wpp-webhook:369,444`; trade-off documentado no próprio código (`:425-429`), contradiz o título do SE-LID-001 | migration/estratégia de dedup; `fix.md` §7.3 |
| Execução de `deno test` / `npm run typecheck` / `lint` | **NÃO EXECUTADO** — sandbox bloqueia os runners. Além disso, `tsconfig.json:15-17`, `eslint.config.js:13` e `vite.config.ts:30` **excluem** `supabase/`, então os scripts npm não cobrem este fix de qualquer forma | `fix.md` §5 lista os comandos exatos (o runner que cobre é o `deno`) |

Nada nesta seção foi usado para justificar o fix; o fix se apoia apenas nos itens provados (§2, §3, §6).
