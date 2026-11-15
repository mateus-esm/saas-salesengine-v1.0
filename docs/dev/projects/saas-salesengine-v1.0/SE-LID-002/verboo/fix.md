# SE-LID-002 — Fix: rótulo do lead criado por mensagem OUTBOUND

| Campo | Valor |
|---|---|
| Projeto | saas-salesengine-v1.0 |
| Tarefa | SE-LID-002 |
| Agente | verboo |
| Branch | `fix/desconhecido-outbound-leads` |
| Base | HEAD `3eab92e` (pós SE-LID-001 / #29) |
| Decisão de domínio | **(b) criar o lead, com nome derivado do telefone** — ver `diagnostico.md` §5 |
| Causa raiz | rótulo de fallback `"Desconhecido"` usado quando o payload não traz campo de nome (o formato de uma mensagem outbound), + campo de nome tratado como "nome do contato" sem olhar **quem enviou** |

---

## 1. Arquivos alterados

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `supabase/functions/_shared/lead-identity.ts` | alterado (ponto único de decisão) | novo `leadNameFromPhone()` exportado; a precedência do nome passa a derivar do telefone quando não há campo de nome, e o literal `"Desconhecido"` deixa de ser escrito em qualquer ramo |
| `supabase/functions/gpt-maker-webhook/index.ts` | alterado (+26/-2) | predicado único `isAgentMessage` (`:47`) reusado pelo `senderType` (`:140`) e pelo nome (`:53-54`) — o `pushName` **do remetente** deixa de rotular o contato em mensagem outbound; comentário no passo 9 explicando por que **não** houve gate de `senderType` na criação do lead (`:236-245`) + log quando o lead nasce de mensagem da equipe (`:249-251`) |
| `supabase/functions/solo-wpp-webhook/index.ts` | alterado (+13/-4) | `pushName` deixa de rotular o lead quando `senderType === 'agent'` (`:438`); rótulo passa a usar `leadNameFromPhone()` (`:441`) — mesma regra do gpt-maker |
| `supabase/functions/_shared/lead-identity.test.ts` | alterado | 5 asserções do SE-LID-001 reescritas (a linha `"Desconhecido"` era exatamente o comportamento que esta task muda) + 3 testes novos (seção "OUTBOUND" + invariante "nenhum payload produz `Desconhecido`" + helper); 13 → 16 `Deno.test`, nenhum perdido — ver §4 |
| `docs/.../SE-LID-002/**` | novo | este `fix.md`, `diagnostico.md`, `README.md` |

Nada foi tocado em `main`, em migrations, em `webhook_configs`, em `src/` (frontend) ou em funções de
outros projetos.

---

## 2. Antes → depois (por forma de payload)

Fonte da verdade: `resolveLeadIdentity()` em `_shared/lead-identity.ts`, usada por `gpt-maker-webhook:55-58`.

| `contactName` | `contactPhone` | nome antes | nome depois |
|---|---|---|---|
| nome real | qualquer | nome real | **inalterado** |
| id técnico | telefone real | `Lead <n>` | **inalterado** |
| id técnico | vazio | `Novo Visitante` | **inalterado** |
| **vazio** | **telefone real** | **`"Desconhecido"`** ← sintoma relatado | **`Lead <n>`** (`Lead 5585996487923`) |
| vazio | id técnico | `[WhatsApp - Lead Anônimo]` | **inalterado** (SE-LID-001) |
| id técnico | id técnico | `[WhatsApp - Lead Anônimo]` | **inalterado** (SE-LID-001) |
| **vazio** | **vazio** | **`"Desconhecido"`** | **`[WhatsApp - Lead Anônimo]`** |

`phone`, `phoneNormalized` e a chave de dedup **não mudam em nenhuma linha** — o fix é exclusivamente de
**rótulo**. O literal `"Desconhecido"` não é mais produzido por nenhuma combinação (verificado no
repositório inteiro: a string só existia em `_shared/lead-identity.ts`, nos testes dele e em docs; não há
`.sql`/`.py` que a referencie, então nada de métrica/segmento depende dela).

O rótulo `Lead <n>` usa os **dígitos canônicos** (`normalizePhone`), não o campo cru: assim
`"+55 (85) 99648-7923"`, `"5585996487923"` e `"5585996487923@s.whatsapp.net"` produzem o mesmo rótulo, e o
rótulo coincide com `phone_normalized` — a chave que o dedup já usa. `leadNameFromPhone()` recusa
`isTechnicalPhone()` internamente, então ele **não** reintroduz `Lead 186432031355045` (a regressão do
SE-LID-001) nem se for chamado por engano.

---

## 3. Por que assim

### 3.1 O lead é criado de propósito (opção b, não o gate)

O contrato levanta a hipótese de que falta um gate `senderType === 'customer'` no passo 9. **O gate não foi
adicionado**, por três motivos verificáveis (`diagnostico.md` §5):

1. o contato é identificável (número real) — o gate de payload `gpt-maker-webhook:129-137` (pós-fix) já
   rejeita o caso sem telefone/`chatId`;
2. `messages.lead_id` é `NOT NULL` (`20251224215400_...:22`) e os dois handlers gravam a mensagem sem gate
   (`gpt-maker-webhook:645-654`, `solo-wpp-webhook:719-729`) → sem lead, o handler estoura no guard
   `if (!lead) throw` (`gpt-maker-webhook:373` / `solo-wpp-webhook:503`) e a conversa outbound some;
3. o defeito era o **rótulo**, não a existência da linha.

Para que ninguém "conserte" isso depois adicionando o gate, o motivo ficou escrito no próprio código
(`gpt-maker-webhook:236-245`).

### 3.2 Reuso, sem duplicar a regra

- `resolveLeadIdentity()` continua sendo o **único** ponto de decisão do caminho gpt-maker — o fix entrou
  lá, não no handler.
- O rótulo `Lead <número>` já existia no código para "número conhecido, nome desconhecido" (ramo do nome
  técnico em `lead-identity.ts` e `solo-wpp-webhook:441`). Em vez de escrever uma segunda implementação, ele
  foi extraído para `leadNameFromPhone()` e **as duas pontas passaram a usar a mesma função**.
- No frontend nada mudou: `src/lib/displayName.ts` já renderiza telefone quando o nome é técnico/ausente, e
  agora o valor gravado no banco já é legível — não é preciso máscara de leitura (nem existe ponto de
  máscara depois do banco: o texto da notificação vem do `payload_template` do trigger, `{{lead.name}}`).

### 3.3 O campo de nome passou a considerar **quem enviou** — nos dois webhooks

`pushName` é o nome do **remetente**, não do contato. Em mensagem inbound o remetente é o contato, e o campo
serve como nome do lead; em mensagem outbound o remetente é a **própria equipe** (conta conectada / agente),
e usar o campo nomeia o contato com o nome da equipe. A regra aplicada nos dois arquivos é a mesma:

| Arquivo | Antes | Depois |
|---|---|---|
| `solo-wpp-webhook:438-441` | `pushName` entrava no rótulo sempre que não-vazio | `contactPushName = senderType === 'customer' ? pushName : undefined` |
| `gpt-maker-webhook:47,53-54` | `payload.contactName \|\| payload.pushName \|\| ''` — `pushName` sem gate (a assimetria que restava do SE-LID-001) | `payload.contactName \|\| (isAgentMessage ? '' : payload.pushName) \|\| ''` |

No gpt-maker o predicado `isAgentMessage` foi extraído (`:47`) e passou a ser **compartilhado** com o
cálculo do `senderType` (`:140`, antes inline): era exatamente o desencontro entre "o marcador de outbound
existe" e "o nome do lead é decidido sem consultá-lo" que produziu o defeito. Com a variável única, os dois
pontos não podem divergir.

`payload.contactName` continua valendo nos dois casos — é o campo de **contato** do provider, não do
remetente. O que mudou é só o `pushName`.

**Honestidade sobre a evidência deste item:** o efeito no `solo-wpp` é **provável mas não capturado** — o
único shape outbound documentado no repositório (resposta do `sendText`,
`Planning/Sprints/sprint_7_api_reference.md:100-108`) **não** traz `pushName`, e nesse caso o rótulo já era
`Lead <número>` (utilizável, não era o sintoma). O caso em que o campo vem preenchido com o nome da conta
conectada é **hipótese**. No gpt-maker há uma razão a mais para o gate: o payload do incidente **não** tinha
`pushName` nenhum (senão o rótulo não seria o placeholder), então o gate **não** é o que corrige o sintoma
relatado — o que corrige é a derivação do número em `lead-identity.ts`. O gate fecha a classe de defeito nos
dois canais e elimina a assimetria entre eles; está registrado como fechamento de classe, não como causa
provada (§3 e a tabela de hipóteses da §7 do `diagnostico.md`).

---

## 4. Testes

`supabase/functions/_shared/lead-identity.test.ts` (Deno):

Contagem exata (conferida no `git diff` do arquivo contra HEAD, não de memória):

- **5 asserções reescritas** — eram exatamente as que fixavam o bug — em 5 testes, dos quais 3 tiveram o
  nome do teste alterado e 2 foram **realocados** para a seção nova com nome novo:
  - *"a real phone with no name at all keeps the previous label and the phone"* →
    *"outbound: a real phone with no name at all is labelled from the number"*: `5585996487923` + nome
    vazio passou de `"Desconhecido"` para `Lead 5585996487923`;
  - *"a real phone typed the Brazilian way is still stored raw and normalized for dedup"* →
    *"outbound: a phone typed the Brazilian way is labelled with the canonical digits"*: ganhou
    `name === "Lead " + phoneNormalized` (aserção nova, `phone`/`phoneNormalized` inalterados);
  - *"a JID-wrapped number with no name field also keeps the pre-existing 'Desconhecido' label"* →
    *"outbound: a JID-wrapped number with no name is labelled from the number"*: `Lead 5511987654321`;
  - *"a payload with neither name nor phone keeps the previous default"* →
    *"outbound: a no-name payload with no usable number gets the anonymous label"*: nome passou a
    `LEAD_ANON_NAME`;
  - *"a payload with no name at all keeps the previous default"* → *"outbound: an empty payload gets the
    anonymous label"*: nome passou a `LEAD_ANON_NAME`.
- **3 testes novos**: o invariante *"no payload shape produces the placeholder 'Desconhecido' as a lead
  name"* (varre 12 formatos — vazio, só espaços, telefone real, telefone formatado, JID, `@lid` em um/ambos
  os campos, nome real — e falha se algum devolver o placeholder; é o guarda contra a reintrodução do
  sintoma) e dois para `leadNameFromPhone()` (monta o rótulo a partir de dígitos/JID/telefone formatado;
  devolve `null` para `@lid`, id técnico sem sufixo, vazio, espaços, `null`, `undefined`).

**Nenhum teste foi perdido**: as duas asserções removidas (`assertEquals(name, "Desconhecido")` com payload
vazio e com payload `{}`) foram substituídas por equivalentes na seção nova, agora esperando
`LEAD_ANON_NAME` sobre as **mesmas** duas entradas. Os testes de comportamento que não mudou (nome técnico
sem telefone, nome técnico com telefone, nome real + telefone real) foram mantidos intactos. Total: 13
`Deno.test` antes, 16 depois (13 − 0 removidos + 3 novos; as 5 reescritas contam nas 13).

Não existe teste para `solo-wpp-webhook` nem para `gpt-maker-webhook` (nenhum dos dois tem `*.test.ts`, e os
handlers chamam `serve()` no topo do módulo, o que impediria importá-los num teste). Por isso as duas regras
que os handlers aplicam foram concentradas em `_shared/` — o rótulo em `leadNameFromPhone()`
(`lead-identity.ts`) e a decisão de nome em `resolveLeadIdentity()` — e é lá que ficam testadas. O que resta
específico dos handlers (o gate `isAgentMessage` sobre o `pushName`) está coberto **apenas por leitura de
código**: `gpt-maker-webhook:47,53-54` e `solo-wpp-webhook:438`.

---

## 5. Validação — **NÃO EXECUTADO** (sandbox)

Seguindo o registrado para este ambiente, **nenhum runner foi executado**: o sandbox negou os comandos
("This command requires approval") e não há `node_modules` no worktree. Isto é **não executado**, não
"passou":

| Comando | Onde | Resultado |
|---|---|---|
| `deno test supabase/functions/_shared/lead-identity.test.ts supabase/functions/_shared/phone.test.ts` | raiz do repo | **NÃO EXECUTADO** — permissão negada |
| `npm run typecheck` | raiz do repo | **NÃO EXECUTADO** — permissão negada |
| `npm run lint` | raiz do repo | **NÃO EXECUTADO** — não tentado após as duas negativas acima |
| `npm test` | raiz do repo | **NÃO EXECUTADO** — não tentado (idem) |

### ⚠️ Os scripts npm **não cobrem** os arquivos alterados

Verificado nas configurações do próprio repositório — a receita de validação deste projeto daria **cobertura
falsa** para este fix:

| Script | Config | Efeito |
|---|---|---|
| `npm run typecheck` | `tsconfig.json:15-17` → `"exclude": ["supabase"]` | **não** checa `supabase/functions/**` |
| `npm run lint` | `eslint.config.js:13` → `ignores: [..., "supabase/functions"]` | **não** lint-a `supabase/functions/**` |
| `npm test` (vitest) | `vite.config.ts:30` exclui `supabase/functions/**` | **não** roda nenhum teste de `supabase/` |

Ou seja: o único runner que valida este fix é o **Deno** (`deno test` e `deno check`, config
`supabase/functions/deno.json`). Rodar só os scripts npm e ver "verde" **não** diz nada sobre este diff.
Para os testes `.tsx`/vitest do frontend (não tocado aqui), o repo exige `NODE_ENV=test` — sem isso falha
com `jsxDEV is not a function`.

Roteiro sugerido ao revisor (na ordem):

```bash
# 1) o que realmente cobre este fix
deno check supabase/functions/_shared/lead-identity.ts
deno test supabase/functions/_shared/
# 2) sanidade do resto do repo (não cobre supabase/, mas confirma que nada quebrou)
npm run typecheck
npm run lint
NODE_ENV=test npm test
```

### Verificação estática feita no lugar (não substitui o runner)

- **Ordem dos ramos** em `lead-identity.ts`: `nome real` → `telefone técnico` → `phoneLabel` → `nome
  técnico` → `sem identidade`. Todos os 7 formatos da tabela de §2 são alcançáveis; nenhum ficou órfão.
- **Regressão do SE-LID-001**: `@lid` continua caindo no ramo `technicalPhone` (que vem **antes** de
  `phoneLabel`) e `leadNameFromPhone()` tem guarda própria — `Lead 186432031355045` não reaparece.
- **Tipos**: `leadNameFromPhone(phone: string | null | undefined): string | null`; em `solo-wpp` o
  encadeamento `contactPushName || leadNameFromPhone(phone) || 'Novo Visitante'` termina sempre em `string`
  (o último operando é literal), e `phone` ali é `string` (não `null`), aceito pelo parâmetro.
- **`isAgentMessage` no gpt-maker**: declarado em `:47`, **antes** dos dois consumidores — o `rawSenderName`
  (`:53-54`) e o `senderType` (`:139-145`) —, ambos no mesmo escopo do handler. O log do passo 9 está em
  `:249-251`, dentro de `if (!lead)` (`:247`). A antiga condição inline em `:140` foi substituída pela
  variável, de modo que os dois não podem divergir.
- **Sem import circular**: `solo-wpp-webhook` passa a importar `lead-identity.ts`, que importa apenas
  `phone.ts` e `displayName.ts` (ambos puros, sem `serve()`).
- **Testes**: contagem conferida contra HEAD via `git diff` (13 → 16 `Deno.test`, nenhuma asserção perdida)
  — ver §4.

---

## 6. Riscos e rollback

| Risco | Avaliação | Mitigação |
|---|---|---|
| Leads novos com nome `Lead <número>` em vez de `Desconhecido` | É o objetivo; muda o texto da notificação `contact_created` para contatos criados por outbound | O telefone continua em `leads.phone`; nada mais no payload mudou |
| O rótulo fica com dígitos canônicos (`Lead 5585996487923`) e o telefone com o valor cru (`(85) 99648-7923`) | Inconsistência cosmética entre duas colunas que representam o mesmo dado | Intencional: o rótulo passa a coincidir com `phone_normalized`, a chave de dedup (evita dois rótulos para o mesmo contato) |
| Linhas antigas com `name = 'Desconhecido'` permanecem | O fix é **na escrita**; não há backfill nesta task | Ver §7 (opção de backfill com aprovação) |
| `"Novo Visitante"` (nome técnico + telefone vazio) | Mantido de propósito — não é o sintoma e não há repro | — |
| Risco de duplicar lead | **Nenhum**: `phone`/`phoneNormalized`/`gpt_maker_chat_id` e a ordem de lookup do passo 9 não foram tocados | — |
| Gate do `pushName` no gpt-maker (novo): uma mensagem **inbound** cujo único nome venha em `pushName` (sem `contactName`) | Comportamento **inalterado** — inbound é `senderType === 'customer'`, então o `pushName` continua sendo usado | O gate só afeta `role === 'assistant' \|\| fromMe === true`, que é justamente quem **não** é o contato |
| Gate do `pushName` no gpt-maker: algum payload outbound que hoje traz o nome do contato só em `pushName` | Passaria a `Lead <número>` em vez do nome — **hipótese não observada**; o payload do sintoma não tinha `pushName` nenhum | Se aparecer um caso real, o ajuste é usar `contactName` (o campo de contato do provider), que o gate preserva |

**Rollback:** reverter os 4 arquivos de código (`git revert` do commit desta branch). Nenhuma migration,
nenhum dado de produção e nenhuma configuração externa foram alterados — o rollback é só de código e
volta ao comportamento anterior (rótulo `"Desconhecido"`), sem efeito colateral em dados já gravados.

---

## 7. Fora de escopo (observado, não alterado)

1. **Backfill das linhas `"Desconhecido"` já existentes.** Sem acesso a banco neste sandbox, nada foi
   consultado nem alterado. Se for desejado, o caminho é (a) `select` de diagnóstico, (b) `update` com
   aprovação do dono da operação:
   ```sql
   -- diagnóstico (somente leitura)
   select id, equipe_id, name, phone, phone_normalized, created_at
     from public.leads
    where name = 'Desconhecido' and deleted_at is null
    order by created_at desc;

   -- correção (proposta; exige aprovação; reversível apenas por log/backup)
   update public.leads
      set name = 'Lead ' || phone_normalized
    where name = 'Desconhecido'
      and phone_normalized is not null and deleted_at is null;
   ```
   Não foi executado; propor apenas depois de medir quantas linhas são e se o cliente quer preservá-las
   como registro do defeito.
2. **Enriquecimento do nome depois (opção (c) do contrato) — já existe parcialmente, e é por isso que a
   opção (b) é a base certa.** Correção de uma versão anterior deste documento: **existe** um caminho que
   atualiza `leads.name` de uma linha já criada — `analyze-message/index.ts:278` monta
   `leadUpdates.name = data.name` (nome extraído pela IA do conteúdo da mensagem) e `:362` aplica
   `update(leadUpdates)` em `leads`. Ele é disparado pelos dois webhooks **apenas para mensagem de cliente**
   (`gpt-maker-webhook:685`, `solo-wpp-webhook:759`, ambos sob `senderType === 'customer'` e
   `is_crm_agent_enabled`). Consequência prática: o lead que nasce com `Lead <número>` por causa de uma
   mensagem outbound **pode** ser renomeado depois, quando o contato responder e a IA extrair o nome — mas
   só depois que ele responde, e somente se o agente de CRM estiver ligado. O que continua **não** existindo
   é o enriquecimento a partir do `pushName` da mensagem inbound do provider (que seria imediato e não
   dependeria da IA). Não alterado nesta task: mexer aqui muda linhas existentes e precisa de decisão de
   produto (pode sobrescrever edição manual do nome).
3. **O `solo-wpp-webhook` grava o LID nu em `leads.phone`** — lacuna pré-existente do SE-LID-001,
   **não** do rótulo desta task. `:369` `extractPhoneFromJid(key.remoteJid)` devolve o id pelado
   (`"186432031355045"`) e `:444` grava `phone: phone || null`; o `technicalJid` de `:430` é usado **só** no
   rótulo. Efeito: naquele canal o `{{lead.phone}}` da notificação ainda pode renderizar o id. Não foi
   alterado porque zerar `phone` zeraria junto o `phone_normalized` derivado pelo trigger
   `trg_leads_sync_phone_normalized` (a chave de dedup) e este arquivo não tem o fallback por chat id — o
   próprio código documenta o trade-off em `:425-429`. Fechar isso exige migration/estratégia de dedup e
   está fora do escopo do sintoma "Desconhecido".
4. **`creation_source` de lead criado por outbound no gpt-maker.** `gpt-maker-webhook:270-272` grava
   `creation_source: 'ai_agent'`, `source/origem: 'IA'` mesmo quando **a equipe** iniciou a conversa (o
   solo usa um valor de canal, `solo_api`, `solo-wpp-webhook:462`). Não alterado: impacta filtros/atribuição
   e não é o sintoma.
5. **Índice UNIQUE parcial em `(equipe_id, gpt_maker_chat_id)`** — pendência já registrada no SE-LID-001
   (`gpt-maker-webhook:221-223`), continua aberta; exige migration.
6. **`.claude/settings.local.json`** aparece como modificado no `git status` desta branch; é alteração
   pré-existente do worktree, **não** desta task. Não foi tocado e não deve entrar em commit.
