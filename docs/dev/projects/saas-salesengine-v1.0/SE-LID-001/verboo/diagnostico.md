# SE-LID-001 — Diagnóstico: como o `@lid` da Casa Flow virou Nome **e** Telefone na notificação

Tarefa: SE-LID-001 · Projeto: saas-salesengine-v1.0 · Branch: `fix/casaflow-lid-leads`
Worktree lido em 2026-09-17, commit base `3737d59`.
Modo: diagnóstico por leitura de código do repo. Nenhum acesso a banco de produção foi feito.

---

## Veredito em uma linha

O `@lid` entrou pelo **`gpt-maker-webhook`**, no campo **`contactPhone`**, foi gravado cru em
`leads.phone`, o trigger `trg_leads_sync_phone_normalized` derivou `leads.phone_normalized` do
mesmo valor, e a notificação recebe o payload do **webhook de saída** (`contact_created` /
`lead_created`) que renderiza `{{lead.name}}` e `{{lead.phone}}` direto da linha de `leads`.
Por isso o mesmo id técnico apareceu nos dois campos do texto.

---

## 1. Qual webhook recebe o lead e qual campo traz o `@lid`

Há três portas de entrada de lead no repo. A comparação abaixo é o que permite isolar uma delas.

| Webhook | Nome do lead | Telefone gravado | Serve para a Casa Flow? |
|---|---|---|---|
| `supabase/functions/gpt-maker-webhook/index.ts` | `senderName \|\| (senderPhone ? \`Lead ${senderPhone}\` : 'Novo Visitante')` — **embute o telefone CRU, com o sufixo** | `senderPhone` cru | **Sim** |
| `supabase/functions/solo-wpp-webhook/index.ts:102` (`extractPhoneFromJid`) | `pushName \|\| (phone ? \`Lead ${phone}\` : 'Novo Visitante')` — o `phone` já perdeu tudo depois do `@` | `extractPhoneFromJid(remoteJid)` | Não (ver abaixo) |
| `supabase/functions/crm-webhook/index.ts:650` | `payload.name` — obrigatório, se faltar responde 400 | `payload.phone` | Não (ver abaixo) |

**Evidência decisiva** — a notificação trazia Nome `Lead 186432031355045@lid` **e** Telefone
`186432031355045@lid`, os dois **com o sufixo `@lid`**:

- Só o `gpt-maker-webhook` monta o nome a partir do telefone **cru**. Enquanto o campo não foi
  corrigido, a linha era (`git show HEAD:supabase/functions/gpt-maker-webhook/index.ts`, trecho):

  ```ts
  // linha 35 — o telefone, ainda com o sufixo
  const senderPhone = payload.contactPhone || payload.phone || payload.from || ''
  // linha 44 — o nome só é reconhecido como técnico em alguns formatos
  const isTechnicalSenderId = (() => { /* ... @lid, @s.whatsapp.net, @c.us, @g.us, @broadcast, /^\d{8,}$/ ... */ })()
  // linha 55 — '' apenas quando o nome é técnico; nome vazio (ou real) vira uma string não-vazia
  const senderName = isTechnicalSenderId ? '' : (rawSenderName || 'Desconhecido')
  // linha 212 — o telefone cru vira rótulo apenas quando senderName é ''
  const finalName = senderName || (senderPhone ? `Lead ${senderPhone}` : 'Novo Visitante')
  ```

  O nome é `Lead ` + o valor **íntegro** de `senderPhone`, e o `@lid` sobrevive dentro dele — logo o
  próprio `contactPhone` era `186432031355045@lid`.

  **E o `contactName` também era o LID.** Na linha 55, `senderName` só é `''` quando
  `isTechnicalSenderId` é verdadeiro; se o campo de nome estivesse **vazio**, `rawSenderName || 'Desconhecido'`
  produziria `'Desconhecido'` e a linha 212 curto-circuitaria, exibindo `Desconhecido` em vez de
  `` `Lead <telefone>` ``. Como a notificação mostrou `` `Lead 186432031355045@lid` ``, o
  `contactName` daquele payload era **também** técnico. Os dois campos vieram com o LID — é por isso
  que o fix age nos dois, e não só no telefone.

- `solo-wpp-webhook` **remove** o sufixo antes de qualquer uso
  (`supabase/functions/solo-wpp-webhook/index.ts:102`, `extractPhoneFromJid` faz split em `@`).
  O mesmo contato por lá viraria `Lead 186432031355045` — **sem** `@lid`, e o Telefone não teria o
  sufixo. A notificação tinha o sufixo nos dois campos, então não foi por aqui.

- `crm-webhook/index.ts:650` exige `payload.name` (responde 400 se ausente) e nunca sintetiza
  `Lead <telefone>`; o nome vem do integrador.

**Conclusão:** entrada = `gpt-maker-webhook`, campo **`contactPhone`** (a linha 35 ainda aceita
`phone` e `from` como fallback). Valor: `186432031355045@lid`.

> **Hipótese (sem evidência no repo, requer confirmação em produção):** o GPT Maker repassa o LID
> da Meta no `contactPhone` quando não consegue ler o número real. O repo não tem fixture de
> payload do GPT Maker; a conclusão acima vem da *forma* das strings persistidas, não de um
> payload capturado. Nas linhas 1–56 do webhook o único campo de identidade do contato é o
> `contactPhone`, então o `@lid` chegou por ali ou pelo fallback `phone`/`from`.

---

## 2. O que é persistido quando entra um `@lid`

Ordem real de execução (o trigger roda **depois** do insert do edge function, e sobrescreve o que
o edge mandou):

| Coluna | O que o edge function mandava (antes do fix) | O que ficava gravado |
|---|---|---|
| `leads.phone` | `senderPhone \|\| null` → `186432031355045@lid` | `186432031355045@lid` |
| `leads.phone_normalized` | `phoneNorm` = `normalizePhone('186432031355045@lid')` = `186432031355045` | `186432031355045` (o trigger recalcula e dá o mesmo resultado) |
| `leads.name` | `Lead 186432031355045@lid` | `Lead 186432031355045@lid` |
| `leads.gpt_maker_chat_id` | `payload.contextId` | valor do `contextId` do GPT Maker |

Detalhamento do que cada peça faz:

1. `normalizePhone` **não** rejeita o LID — ele é um normalizador de dígitos
   (`supabase/functions/_shared/phone.ts:24-48`): tira tudo que não é dígito e devolve
   `186432031355045`. O próprio arquivo documenta que é espelho de
   `public.normalize_phone_br`.

2. O trigger de banco **sempre** reescreve `phone_normalized` a partir de `phone`
   (`supabase/migrations/20260517182736_sprint55_epic1_phone_dedup.sql:200-214`):

   ```sql
   CREATE OR REPLACE FUNCTION public.leads_sync_phone_normalized() ...
     NEW.phone_normalized := public.normalize_phone_br(NEW.phone);
   ...
   CREATE TRIGGER trg_leads_sync_phone_normalized
     BEFORE INSERT OR UPDATE OF phone ON public.leads ...
   ```

   E `normalize_phone_br` só devolve `NULL` para entrada nula/vazia/menos de 8 dígitos
   (mesma migration, linhas 47-58). Ou seja: **o `@lid` atravessa o `normalize_phone_br` intacto**.
   Consequência prática para o fix: não adianta o edge function mandar `phone_normalized`
   diferente de `phone` — quem manda é o trigger, a partir de `phone`.

3. O índice único que faz a deduplicação
   (`20260517182736_sprint55_epic1_phone_dedup.sql:188-191`):

   ```sql
   CREATE UNIQUE INDEX idx_leads_equipe_phone_normalized_unique
     ON public.leads (equipe_id, phone_normalized)
     WHERE phone_normalized IS NOT NULL AND deleted_at IS NULL;
   ```

   Com `phone_normalized = '186432031355045'` o LID virou **a chave de identidade** daquele lead:
   qualquer mensagem seguinte daquele contato cai na mesma linha. Isso é bom para dedup e ruim
   porque institucionaliza o id técnico.

4. `leads.name` é **NOT NULL** (`supabase/migrations/20251207215011_...sql:67`), então a coluna
   nunca fica vazia: ou é o nome real, ou `Lead <telefone>`, ou `Novo Visitante`/`Desconhecido`.
   Depois do fix há um terceiro rótulo possível, `[WhatsApp - Lead Anônimo]` — a tabela completa de
   precedência está em `fix.md` §2.4.

5. `leads.observations` existe e é nullable (mesma migration, linha 76) e o `gpt-maker-webhook`
   não escreve nela — é a razão de a notificação ter chegado com **"Observações" vazia**.

---

## 3. Quem monta a notificação "Solo Ventures | Casa Flow — Você tem um novo lead no CRM!"

### 3.1 O que foi descartado, com evidência

- **Não existe no repo.** `grep` por `novo lead`, `CRM!`, `Solo Ventures` não encontra template,
  string montada nem mensagem pronta em `supabase/functions`, `src`, `python-agent` ou
  `supabase/migrations`.
- **Não é o sistema de notificações da plataforma.** O `notification-dispatcher` só envia linhas
  da tabela `notifications`, e os `notification_types` semeados no repo (migrations de sprint 8,
  8.2, 8.4 e 9) não têm nenhum tipo de lead/CRM. O único `notify()` de lead-adjacente é o
  `assistant_handoff_needs_human`. Não há trigger que insira em `notifications` no insert de lead.
- **Não é o `gpt-maker-webhook`.** Ele não importa `solo-sender` nem envia mensagem para a equipe —
  só grava lead/conversa/mensagem e dispara a atribuição.

### 3.2 O caminho que sobra — e é suficiente

O lead criado dispara um **webhook de saída** para uma URL configurada pelo próprio tenant:

```
INSERT em public.leads
   └─ trigger dispatch_contact_created_webhooks (AFTER INSERT ON public.leads)
        └─ public.enqueue_crm_webhooks(equipe_id, 'contact_created', contexto)
             └─ public.render_webhook_payload(payload_template, contexto)
                  └─ net.http_post(url := webhook.url, body := payload)
                       └─ INSERT em public.webhook_logs (direction='outbound', payload=...)

INSERT em public.opportunities (contato adicionado a um pipeline)
   └─ trigger dispatch_pipeline_lead_created_webhooks (AFTER INSERT ON public.opportunities)
        └─ mesmo enqueue_crm_webhooks, evento 'lead_created',
           com 'lead' = to_jsonb(linha de public.leads)
```

`supabase/migrations/20260807000000_split_contact_pipeline_webhooks.sql` (trechos):

```sql
-- contact_created: nova linha na Base de Contatos
PERFORM public.enqueue_crm_webhooks(
  NEW.equipe_id,
  'contact_created',
  jsonb_build_object('event','contact_created','created_at',...,'lead', to_jsonb(NEW),
                     'opportunity', NULL, 'pipeline', NULL, 'stage', NULL));
...
-- lead_created: contato adicionado a um pipeline
  SELECT to_jsonb(lead_row) INTO lead_payload FROM public.leads AS lead_row WHERE lead_row.id = NEW.lead_id;
  PERFORM public.enqueue_crm_webhooks(NEW.equipe_id, 'lead_created',
    jsonb_build_object('event','lead_created',...,'lead', lead_payload,
                       'opportunity', to_jsonb(NEW), 'pipeline', pipeline_payload, 'stage', stage_payload));
...
CREATE TRIGGER dispatch_contact_created_webhooks
  AFTER INSERT ON public.leads FOR EACH ROW ...
CREATE TRIGGER dispatch_pipeline_lead_created_webhooks
  AFTER INSERT ON public.opportunities FOR EACH ROW ...
```

E o template padrão do payload
(`supabase/migrations/20260806000000_configurable_lead_webhooks.sql:12-27`) — é **aqui** que os
campos crus saem do banco:

```sql
ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS payload_template jsonb NOT NULL DEFAULT
    '{
      "event": "{{event}}",
      "created_at": "{{created_at}}",
      "lead": {
        "id": "{{lead.id}}",
        "name": "{{lead.name}}",     -- <- "Lead 186432031355045@lid"
        "email": "{{lead.email}}",
        "phone": "{{lead.phone}}",   -- <- "186432031355045@lid"
        "source": "{{lead.source}}",
        ...
      }
    }'::jsonb;
```

O `render_webhook_payload` (mesma migration) resolve `{{lead.name}}` com
`p_context #> string_to_array('lead.name','.')` sobre `to_jsonb(NEW)` — **sem nenhuma máscara**.
O corpo inteiro fica registrado em `webhook_logs.payload`.

### 3.3 Por que a notificação não usa `formatDisplayName`

Porque ela **não é montada por este repo**. Quem compõe o texto "Solo Ventures | Casa Flow — Você
tem um novo lead no CRM!" é o consumidor externo apontado em `webhook_configs.url` (a automação da
própria Casa Flow, provavelmente n8n/GPT Maker). O que este repo entrega a ele é o JSON acima, com
`lead.name` e `lead.phone` **copiados da linha de `leads`**. A máscara do `formatDisplayName` roda
no app React (`src/lib/displayName.ts`) e no edge, nunca dentro do `render_webhook_payload` do
Postgres — então ela não tinha como alcançar a notificação.

Isso explica a assimetria observada: **na tela do CRM o nome já aparecia mascarado** (o
`formatDisplayName` é aplicado na UI), enquanto **na notificação o id técnico chegou cru**.

> **Hipótese (sem acesso ao destino):** a config da Casa Flow está em `trigger_event='lead_created'`
> (o link do texto aponta para um pipeline, e só o contexto de `lead_created` carrega
> `{{pipeline.id}}` — `004130b6-...`). Não é possível confirmar sem ler `webhook_configs`/
> `webhook_logs` em produção, o que esta task não faz. Em qualquer das duas opções
> (`lead_created` **ou** `contact_created`) o campo lido é o mesmo: `lead.name`/`lead.phone`.

### 3.4 Como confirmar em produção (somente leitura — fora do escopo desta task)

```sql
-- 1. o payload entregue ficou logado
select created_at, event_type, payload
from public.webhook_logs
where direction = 'outbound'
  and payload -> 'lead' ->> 'name' like '%@lid%'
order by created_at desc;

-- 2. qual config a Casa Flow usa
select id, trigger_event, url, active, payload_template
from public.webhook_configs
where equipe_id = '<equipe Casa Flow>';
```

---

## 4. Por que "resolver para o telefone real" não é possível para um LID

O LID (`186432031355045@lid`) é um identificador de conta que a Meta atribui justamente quando
**não expõe o número**. O telefone não está contido nele e o repo não tem nenhuma consulta de
mapeamento LID→telefone. Logo, para o LID restam duas saídas honestas: **não guardar** (é o que o
fix faz) ou mascarar.

O "quando possível" existe em um caso concreto e foi implementado: quando o valor é um JID que
**envolve** um número real (`5511987654321@s.whatsapp.net` / `@c.us`), o número está lá dentro e o
fix passa a extrair os dígitos em vez de descartar.

---

## 5. Evidências (arquivo:linha)

| Evidência | Arquivo:linha |
|---|---|
| Campo de telefone do contato (`contactPhone`/`phone`/`from`) | `supabase/functions/gpt-maker-webhook/index.ts:35` |
| `resolveLeadIdentity` decide nome/telefone (pós-fix) | `supabase/functions/gpt-maker-webhook/index.ts:43-46` |
| Nome sintetizado com o telefone cru (pré-fix) | `git show HEAD:supabase/functions/gpt-maker-webhook/index.ts` (linha 212; `senderName` na 55) |
| Insert do lead: `phone`, `phone_normalized`, `name` | `supabase/functions/gpt-maker-webhook/index.ts:228-252` |
| Lookup por `phone_normalized` (chave legada do LID) | `supabase/functions/gpt-maker-webhook/index.ts:181-194` |
| Lookup por `gpt_maker_chat_id` (dedup do LID) | `supabase/functions/gpt-maker-webhook/index.ts:196-209` |
| `normalizePhone` é normalizador de dígitos, não validador | `supabase/functions/_shared/phone.ts:24-48` |
| `normalize_phone_br` só anula entrada vazia/<8 dígitos | `supabase/migrations/20260517182736_sprint55_epic1_phone_dedup.sql:39-73` |
| Trigger que deriva `phone_normalized` de `phone` | `..._phone_dedup.sql:200-214` |
| UNIQUE `(equipe_id, phone_normalized)` | `..._phone_dedup.sql:188-191` |
| `leads.name` NOT NULL / `leads.observations` nullable | `supabase/migrations/20251207215011_b027b01d-7a34-4afc-b295-5ed6f91f5d54.sql:63-84` |
| Trigger de saída em `leads` e em `opportunities` | `supabase/migrations/20260807000000_split_contact_pipeline_webhooks.sql` |
| `payload_template` com `{{lead.name}}`/`{{lead.phone}}` | `supabase/migrations/20260806000000_configurable_lead_webhooks.sql:12-27` |
| Máscara de display (nome) no app | `src/lib/displayName.ts:20-28` (`isTechnicalId`), `:97-107` (`formatDisplayName`) |
| `solo-wpp` remove o sufixo do JID antes de usar | `supabase/functions/solo-wpp-webhook/index.ts:95-105`, `:368` |
| `crm-webhook` exige `payload.name` | `supabase/functions/crm-webhook/index.ts:650-663` |

## 6. Residuais (não alterados nesta task, com motivo)

- **`crm-webhook`** — não tem LID nas evidências e a dedup dele é por telefone
  (`findLeadByPhone` → RPC que compara `phone_normalized`, comentário em
  `supabase/functions/crm-webhook/index.ts:185`). Anular o telefone ali destruiria a dedup da
  integração. Fica registrado no README como pendência caso apareça LID nesse caminho.
- **`solo-wpp`** — a dedup é **só** por `phone_normalized` e o caminho não tem `chatId` de
  fallback como o GPT Maker tem (`supabase/functions/solo-wpp-webhook/index.ts:368-439`). Anular o
  telefone do LID ali criaria **um lead por mensagem**. O fix lá mascarou o **nome** e manteve a
  chave de dedup — ver `fix.md`, seção "Riscos".
- **UI de telefone** — a coluna `phone` do motor de campos renderizava o LID como
  `+186432031355045` (`src/lib/fields/registry.ts:265-266`). **Corrigido nesta task**: passou a
  devolver vazio quando o valor é id técnico — mesma classe de defeito do `formatDisplayName`,
  sem tocar em nenhum outro campo.
- **UI histórica (não alterada)** — três pontos ainda renderizam `lead.phone` cru para linhas
  antigas com LID: `src/components/crm/OpportunityDetailModal.tsx:597`,
  `src/components/crm/OpportunityCard.tsx:307` (tooltip) e `src/components/crm/DatabaseView.tsx:205`
  (troca o nome técnico pelo telefone, que também é o LID). O `OpportunityCard` também monta o link
  `wa.me` a partir dos dígitos (`:303`), que para um LID aponta para um número inexistente —
  decidir entre esconder o botão ou bloquear o clique é uma escolha de UX, fora do escopo aqui.
