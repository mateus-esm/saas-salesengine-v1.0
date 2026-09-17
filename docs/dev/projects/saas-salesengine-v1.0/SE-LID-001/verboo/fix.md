# SE-LID-001 — Fix: o `@lid` não é mais nome nem telefone de lead

Tarefa: SE-LID-001 · Branch: `fix/casaflow-lid-leads` · Agente: verboo
Diagnóstico que fundamenta este fix: `verboo/diagnostico.md` (mesma pasta).

---

## 1. O que foi alterado

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `supabase/functions/_shared/phone.ts` | alterado | Novas funções `isTechnicalPhone()` e `extractDialablePhone()`. `normalizePhone()` **não** foi tocado (é espelho documentado de `public.normalize_phone_br`). |
| `supabase/functions/_shared/lead-identity.ts` | **novo** | `resolveLeadIdentity()`: ponto único de decisão do que pode ser gravado em `leads.name` / `leads.phone` / `leads.phone_normalized`. Puro e testável fora do handler HTTP. |
| `supabase/functions/_shared/displayName.ts` | **novo** | Gêmeo servidor de `src/lib/displayName.ts` (`isTechnicalId`, `formatBrPhone`, `formatDisplayName`, `LEAD_ANON_NAME`) + guarda de telefone técnico. Os edge functions não tinham essa máscara. |
| `supabase/functions/gpt-maker-webhook/index.ts` | alterado | Usa `resolveLeadIdentity()`; para de gravar o id técnico em `phone`/`name`; deixa de backfillar o LID em `updates.phone`; novo passo 9.1 reata a chave de dedup em `phone_normalized` (ver 2.3). |
| `supabase/functions/solo-wpp-webhook/index.ts` | alterado | JID técnico não vira nome de lead (`Lead 186432031355045`) nem telefone da instância. Chave de dedup preservada. |
| `src/lib/displayName.ts` | alterado | `isTechnicalPhone()` + `formatDisplayName()` passa a tratar telefone técnico como "sem telefone" (antes formatava o LID como `+186432031355045`). |
| `src/lib/fields/registry.ts` | alterado | Coluna `phone` do motor de campos não formata mais id técnico como número (`:265-266`). |
| `supabase/functions/_shared/phone.test.ts` | alterado | +6 testes (Deno). |
| `supabase/functions/_shared/lead-identity.test.ts` | **novo** | 13 testes (Deno): uma linha da tabela de §2.4 cada, incluindo o payload do incidente. |
| `src/lib/__tests__/displayName.test.ts` | **novo** | 11 testes (vitest) da máscara no app. |

Nenhuma migration foi criada, alterada ou executada. Nenhuma escrita em banco.

---

## 2. Por quê — as cinco decisões

### 2.1 Por que não "resolver o LID para o telefone real"

O LID é o identificador que a Meta usa **quando não expõe o número**; o telefone não está dentro
dele e não existe consulta de mapeamento no repo. "Normalizar para telefone real **quando
possível**" foi implementado no caso em que o número **existe**: um JID que envolve um número
(`5511987654321@s.whatsapp.net`, `@c.us`) agora tem os dígitos extraídos por
`extractDialablePhone()` em vez de ser descartado. Fora isso, a única saída honesta é não gravar.

### 2.2 Por que zerar `phone` (e não só mascarar na leitura)

A notificação não é montada por este repo: ela é o consumidor externo do webhook de saída
(`dispatch_contact_created_webhooks` / `dispatch_pipeline_lead_created_webhooks` →
`net.http_post`), e o `payload_template` padrão renderiza `{{lead.phone}}` **direto da coluna**.
Não existe ponto de máscara depois do banco. Logo a correção tem que ser na escrita.

E `phone` é a única alavanca possível: o trigger `trg_leads_sync_phone_normalized`
(BEFORE INSERT **OR UPDATE OF phone**) **sempre** recalcula
`NEW.phone_normalized := public.normalize_phone_br(NEW.phone)`. Mandar `phone_normalized`
customizado não tem efeito — quem decide é `phone`.

### 2.3 Por que o LID continua sendo a **chave de dedup** (e por que isso não vaza)

`phone_normalized` é a única chave de deduplicação que este webhook sempre usou. Se o lead de LID
fosse gravado com `phone_normalized = NULL`, ele ficaria **fora** do índice
`UNIQUE (equipe_id, phone_normalized)` (que é parcial: `WHERE phone_normalized IS NOT NULL`). O
efeito seria uma regressão: uma mensagem seguinte do mesmo contato com `contextId` **diferente**
erraria os dois lookups (NULL não casa `phone_normalized`; o `gpt_maker_chat_id` seria outro) e
criaria **um segundo lead** — algo que não acontecia antes do fix, porque o LID era a própria chave.

Por isso o fix **preserva a chave**, em dois tempos:

1. `resolveLeadIdentity()` devolve `phoneNormalized = normalizePhone(<valor cru>)`. Para o LID isso
   é `186432031355045` — exatamente o valor com que as linhas antigas foram criadas, então o lookup
   do step 8 continua **encontrando e reusando** essas linhas.
2. Para lead **novo**, o insert vai com `phone: null` + `phone_normalized: null` (o trigger
   `BEFORE INSERT` grava `normalize_phone_br(null) = null`), e logo em seguida o passo **9.1** faz
   `UPDATE leads SET phone_normalized = <chave> WHERE id = <novo lead>`.

O passo 9.1 funciona porque `trg_leads_sync_phone_normalized` é declarado
`BEFORE INSERT OR UPDATE OF phone` — o trigger só dispara quando `phone` está na lista de colunas do
`UPDATE`. Como o 9.1 altera **apenas** `phone_normalized`, o trigger não roda e a chave não é
apagada. (O `scripts/migrate_solo_energia.py:399-400` já documenta essa mesma semântica no sentido
inverso: "zerar só a coluna não adianta — o trigger reescreve a partir de `phone`".)

**Por que isso não reintroduz o vazamento:** `phone_normalized` é lido **apenas** como chave de
busca — nenhum ponto do app nem o `payload_template` o renderiza (o template usa
`{{lead.name}}`/`{{lead.phone}}`, e `leads.phone` é `NULL`). Conferido: as únicas leituras são os
lookups dos webhooks e o filtro de busca `20260911000100_sprint11_w2_filters.sql:260-261`; no
frontend só aparece em `src/integrations/supabase/types.ts` (tipos gerados). O que chega à
notificação continua sendo o nome mascarado e o telefone nulo.

Se o 9.1 falhar (ex.: `23505`, perdeu a corrida para outra linha viva), a chave fica nula e o lead
segue alcançável por `gpt_maker_chat_id` — estado degradado, não quebra.

### 2.4 Por que o nome vira `[WhatsApp - Lead Anônimo]`

`leads.name` é `NOT NULL`, então o nome é sempre o que a linha exibe (na tela e no payload). A
precedência é agora um conjunto de ramos explícitos e todos alcançáveis:

| `contactName` | `contactPhone` | `name` | situação |
|---|---|---|---|
| nome real | qualquer | o nome real | inalterado |
| vazio | número real | `Desconhecido` | inalterado |
| id técnico | número real | `` `Lead <número>` `` | inalterado |
| id técnico | vazio | `Novo Visitante` | inalterado |
| **vazio** | **id técnico** | `[WhatsApp - Lead Anônimo]` | **alterado (única mudança de rótulo)** |
| **id técnico** | **id técnico** | `[WhatsApp - Lead Anônimo]` | **o incidente** |
| vazio | vazio | `Desconhecido` | inalterado |

O código antigo encadeava `||` sobre os dois campos:
`senderName = isTechnicalSenderId ? '' : (rawSenderName || 'Desconhecido')` e
`finalName = senderName || (senderPhone ? \`Lead ${senderPhone}\` : 'Novo Visitante')`. Como
`rawSenderName || 'Desconhecido'` **nunca é vazio**, o ramo `` `Lead <telefone>` `` só era alcançado
quando o nome era **técnico** (virava `''`) — nunca quando o campo de nome estava simplesmente
ausente. Os ramos acima reproduzem isso fielmente; a forma explícita existe justamente para que
nenhum deles fique inalcançável e pareça fazer algo que não faz.

**Qual era o payload do incidente.** A notificação mostrou ``Lead 186432031355045@lid``, e não
`Desconhecido`. Pela tabela acima, `Desconhecido` seria o resultado com nome vazio — logo o
`contactName` daquele payload era **também** o id técnico. Ou seja: os dois campos chegaram com o
LID, e o nome foi construído a partir do telefone. É por isso que o fix age nos dois.

**A única mudança de rótulo:** "nome vazio + telefone técnico" lia `Desconhecido` e passa a ler
`[WhatsApp - Lead Anônimo]`. É deliberado — um lead sem nome e sem número não tem identidade para
exibir, e esse é exatamente o rótulo que o app já mostra para a mesma linha via
`formatDisplayName`. Notificação e tela passam a concordar. Todos os outros ramos seguem idênticos,
e cada um está fixado em teste (§3.2).

### 2.5 `solo-wpp`: por que o telefone ficou (e o nome não)

Nesse caminho a dedup é **só** `phone_normalized` e não há `chatId` de fallback
(`supabase/functions/solo-wpp-webhook/index.ts:368-439`): zerar o telefone do LID criaria **um lead
por mensagem**. Então lá o fix mascara o **nome** (`formatDisplayName(pushName, null)`) e mantém a
chave de dedup intacta. O JID técnico também não é mais aceito como telefone da instância
(`wuid`). Está registrado em Riscos e no README.

---

## 3. Como validar

### 3.1 Comandos (conforme o repo)

```bash
# frontend / app
npm ci                       # node_modules está vazio neste worktree
npm run lint                 # eslint src
npm run typecheck            # tsc -b
npm run test                 # vitest run
npm run build                # vite build

# edge functions (Deno) — módulos novos/alterados
deno test supabase/functions/_shared/phone.test.ts supabase/functions/_shared/lead-identity.test.ts
```

### 3.2 O que os testes provam

`supabase/functions/_shared/lead-identity.test.ts` fixa o payload do incidente:

`lead-identity.test.ts` (13 testes) cobre **cada linha da tabela de §2.4**, com testes extras para
os casos limítrofes (LID já sem sufixo, ausência total de payload), para que o conjunto de
asserções seja o enunciado executável do comportamento:

| `contactName` | `contactPhone` | Esperado |
|---|---|---|
| `"Maria Souza"` | `"186432031355045@lid"` | `name = "Maria Souza"`, `phone = null`, `phoneNormalized = "186432031355045"` |
| `""` | `"186432031355045@lid"` | `name = "[WhatsApp - Lead Anônimo]"`, `phone = null` |
| `"186432031355045@lid"` | `"186432031355045@lid"` | `name = "[WhatsApp - Lead Anônimo]"`, `technicalName = true`, `technicalPhone = true` |
| `""` | `"186432031355045"` (LID sem sufixo) | `name = "[WhatsApp - Lead Anônimo]"`, `phone = null` |
| `"Maria Souza"` | `"5511987654321@s.whatsapp.net"` | `phone = "5511987654321"` (número extraído), `name = "Maria Souza"` |
| `""` | `"5511987654321@s.whatsapp.net"` | `phone = "5511987654321"`, `name = "Desconhecido"` |
| `""` | `"5585996487923"` | `name = "Desconhecido"`, `phone = "5585996487923"` |
| `""` | `"(85) 99648-7923"` | `phone` cru preservado, `phoneNormalized = "5585996487923"` |
| `"264162450083898@lid"` | `"5585996487923"` | `name = "Lead 5585996487923"` |
| `"264162450083898@lid"` | `""` | `name = "Novo Visitante"` |
| `""` / ausente | `""` / ausente | `name = "Desconhecido"`, `phone = null`, `phoneNormalized = null` |
| `"Maria Souza"` | `"5585996487923"` | caso trivial: nada muda |

O handler HTTP do `gpt-maker-webhook` **não** tem teste unitário — não existe harness de Supabase
mockado no repo. Por isso a decisão de identidade foi extraída para `_shared/lead-identity.ts`
(puro, testado). O que fica sem cobertura automatizada é a orquestração em volta: os dois lookups, o
insert e o passo 9.1 — que são exatamente os pontos que a §3.3 descreve e que precisam de conferência
manual/smoke.

`supabase/functions/_shared/phone.test.ts` cobre a detecção (`@lid`, `@g.us`, `@broadcast`, LID
nu de 15 dígitos, e um id de 15 dígitos **dentro** de um envelope `@s.whatsapp.net`/`@c.us` — regra
de consistência, não caso observado) e os falsos positivos que **não** podem ser mascarados
(`85996487923`, `55999998888`, `+55 85 99648-7923`, `@s.whatsapp.net` com número real dentro).

`src/lib/__tests__/displayName.test.ts` cobre o app: `formatDisplayName("Lead 186432031355045@lid",
"186432031355045@lid")` → `[WhatsApp - Lead Anônimo]` (antes devolvia `+186432031355045`).

### 3.3 Verificação do comportamento fim-a-fim

1. **Na escrita** — para o payload do incidente (`contactName` e `contactPhone` com o mesmo
   `@lid`), o fix grava `phone = NULL` e `name = "[WhatsApp - Lead Anônimo]"`; em seguida o passo 9.1
   grava `phone_normalized = "186432031355045"` como chave de dedup. O trigger
   `trg_leads_sync_phone_normalized` roda no insert e grava `NULL` (`normalize_phone_br(NULL) → NULL`,
   migration `20260517182736_...sql:47-49`) e **não** roda no 9.1, porque o `UPDATE` não lista `phone`.
2. **Na notificação** — o payload de saída passa a levar `"name": "[WhatsApp - Lead Anônimo]"` e
   `"phone": null`, então o texto que hoje mostra `Lead 186432031355045@lid` /
   `186432031355045@lid` passa a mostrar o rótulo anônimo e o telefone vazio (o template é do
   consumidor externo; não há nada a mudar do nosso lado).
3. **Sem duplicata** — o mesmo contato voltando a mandar mensagem: o lookup por `phone_normalized`
   acha a linha (legada, ou nova com a chave reatada no 9.1) e reusa. A janela de duplicata remanescente
   é estreita e está descrita em Riscos 1.
4. **Linha com LID na tela** — a coluna `phone` do motor de campos deixa de renderizar
   `+186432031355045` e passa a ficar vazia (`src/lib/fields/registry.ts:265-266`); o
   `formatDisplayName` já mascarava o nome.

### 3.4 Estado da validação neste workspace — **NÃO EXECUTADO**

Honestidade de baseline: **nenhum** comando de build/test/lint pôde ser executado nesta sessão.
`npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` e `deno test`
foram **bloqueados por permissão do sandbox** (retorno `This command requires approval`), e
`node_modules` está vazio. Portanto:

- não há baseline de falhas a registrar — não houve execução, nem antes nem depois;
- os resultados esperados da seção 3.2 são **expectativa derivada da leitura do código**, não
  saída observada. Quem for revisar deve rodar os comandos da 3.1 antes do merge.

Os arquivos de teste foram escritos para falhar se o comportamento divergir do descrito acima, e
foram revisados linha a linha contra os módulos (`normalizePhone`, `isTechnicalId`,
`formatBrPhone`, `extractDialablePhone`) — mas revisão não substitui execução. Uma asserção errada
foi encontrada nessa revisão e corrigida (`lead-identity.test.ts`, caso do JID com nome vazio, que
esperava `` `Lead <telefone>` `` em vez do `Desconhecido` pré-existente) — ver 2.4.

---

## 4. Riscos e rollback

### Riscos assumidos (com o motivo)

1. **Corrida entre o INSERT e o passo 9.1.** Para lead de LID o insert grava
   `phone_normalized = NULL` (o trigger sobrescreve) e a chave só é gravada no 9.1, uma transação
   depois. Como o `UNIQUE (equipe_id, phone_normalized)` é parcial, ele **não** protege o INSERT.
   Se uma segunda mensagem do mesmo contato chegar **nesse intervalo** com um `gpt_maker_chat_id`
   diferente, os dois lookups erram (o `phone_normalized` dela já é o LID, mas a linha nova ainda
   não tem chave; o chat id é outro) e uma segunda linha é criada. É uma janela estreita — de uma
   requisição — e não o caminho normal (depois do 9.1 a chave existe e deduplica). Mitigação
   recomendada (fora do escopo, exige migration e aprovação): índice único parcial em
   `(equipe_id, gpt_maker_chat_id) WHERE gpt_maker_chat_id IS NOT NULL AND deleted_at IS NULL`, que
   fecharia a janela de forma atômica. Registrado no README.
2. **Heurística de dígitos** em `isTechnicalPhone`. Um número estrangeiro real com 15+ dígitos
   (limite do E.164) seria classificado como técnico e descartado de `phone`. Aceito: a operação é
   Brasil-only (o próprio `normalizePhone` é), e o LID do incidente tem exatamente 15 dígitos. Um
   `@s.whatsapp.net`/`@c.us` com número real **não** é afetado — o envelope é desembrulhado e os
   dígitos internos passam pela mesma regra, então um id de 15 dígitos disfarçado de número também
   é recusado (regra de consistência; nenhum payload dessa forma foi observado).
3. **`solo-wpp` mantém o LID em `phone`.** Decisão consciente: zerar criaria um lead por mensagem.
   Consequência: se esse caminho algum dia alimentar uma notificação, o Telefone ainda aparece como
   `186432031355045`. Não há evidência de que a Casa Flow use esse caminho (o sufixo `@lid` no
   Telefone da notificação só é produzido pelo `gpt-maker-webhook`).
4. **`phone_normalized` volta a carregar o id técnico** em leads novos de LID (passo 9.1). É uma
   escolha deliberada para não perder a dedup: a coluna é chave de busca, nunca renderizada (ver
   2.3). Efeito colateral conhecido: a busca de leads por dígitos
   (`20260911000100_sprint11_w2_filters.sql:260`) pode casar um lead de LID — comportamento que as
   linhas legadas já tinham.
5. **Linhas históricas não são corrigidas.** O fix vale para leads novos. Um lead criado antes
   continua com `name`/`phone` de LID no banco — a UI mascara o nome e a coluna de telefone agora
   fica vazia, mas os pontos de UI listados no diagnóstico (link `wa.me`, tooltips) ainda mostram o
   id. Limpeza é uma ação de dados separada, com aprovação (ver 4.3).

### 4.1 O que muda para quem já operava

- Leads novos de GPT Maker com nome técnico passam de `Lead <id>@lid` para
  `[WhatsApp - Lead Anônimo]` — é a mudança de rótulo pretendida.
- Há **uma** mudança de rótulo além do caso do incidente: "nome vazio + telefone técnico" lia
  `Desconhecido` e passa a ler `[WhatsApp - Lead Anônimo]` (ver 2.4). 
- Leads normais (telefone real), payloads sem nome com telefone real e o caso "nome técnico +
  telefone real" (`Lead <número>`) **não** mudam de comportamento.
- Nenhuma coluna, índice, RPC ou contrato de payload foi alterado. O passo 9.1 é a única escrita
  adicional (um `UPDATE` por lead novo sem telefone).

### 4.2 Rollback

Reverter os arquivos alterados (`git revert` do commit do fix ou `git checkout` dos arquivos de
código + remover os módulos/testes novos). Não há migration nem dado a desfazer, então o rollback é
puramente de código e não deixa estado inconsistente: o comportamento volta a ser o anterior, e as
linhas criadas com o fix continuam válidas — o LID no `phone` volta a ser exibido (era o
comportamento antigo), e a chave em `phone_normalized` permanece, que é exatamente o que o código
antigo também gravava.

### 4.3 Remediação de dados históricos — **manual, exige aprovação, não executada**

Sugestão para o time (dry-run primeiro, em janela autorizada; não faz parte deste fix):

```sql
-- 1) reconhecer o que existe
--    (a) linhas LEGADAS: o id técnico ficou gravado no telefone
select id, equipe_id, name, phone, phone_normalized, gpt_maker_chat_id, created_at
from public.leads
where phone ~ '@(lid|g\.us|broadcast)$';

--    (b) linhas criadas JÁ com o fix: telefone nulo e chave de dedup preservada
--        (nada a corrigir no telefone; serve para confirmar que o vazamento parou)
select id, equipe_id, name, phone, phone_normalized, created_at
from public.leads
where phone is null and phone_normalized ~ '^[0-9]{15,}$';

-- 2) guardar a chave de dedup atual (o LID em dígitos) antes de mexer
create temp table lid_keys as
select id, regexp_replace(phone, '\D', '', 'g') as chave
from public.leads
where phone ~ '@(lid|g\.us|broadcast)$';

-- 3) zerar telefone e rótulo técnico. Este UPDATE lista `phone`, então
--    trg_leads_sync_phone_normalized dispara e zera phone_normalized junto.
update public.leads
set phone = null,
    name  = case when name like '%@lid%' then '[WhatsApp - Lead Anônimo]' else name end
where id in (select id from lid_keys);

-- 4) reatar a chave de dedup. Este UPDATE NÃO lista `phone`, então o trigger
--    `UPDATE OF phone` não dispara e o valor permanece gravado — a mesma
--    manobra do passo 9.1 do webhook, agora aplicada ao histórico.
update public.leads l
set phone_normalized = k.chave
from lid_keys k
where l.id = k.id;
```

---

## 5. Fora de escopo (registrado de propósito)

- `crm-webhook` não foi alterado: sem evidência de LID nesse caminho e a dedup dele depende do
  telefone (`findLeadByPhone` → `phone_normalized`). Ver diagnóstico, seção 6.
- Os pontos de UI que geram **link** a partir do telefone
  (`src/components/crm/OpportunityCard.tsx:303` monta `wa.me/<dígitos>`; `:307` é tooltip;
  `DatabaseView.tsx:205` troca o nome técnico pelo telefone) não foram tocados: decidir entre
  esconder o botão de WhatsApp ou bloquear o clique para um LID é escolha de UX, fora do escopo da
  notificação. A coluna `phone` do motor de campos **foi** corrigida
  (`src/lib/fields/registry.ts`), por ser a mesma máscara de exibição do `formatDisplayName`.
- Nenhum commit, push ou PR foi feito por esta task.
