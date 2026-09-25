# SE-REV-001 — Contrato HTTP, configuração e plano de deploy

Documento operacional: como o n8n chama, como se configura um tenant, e o que
rodar quando o deploy for aprovado. Nada aqui foi executado contra produção.

---

## 1. Configurar um tenant

Uma linha em `public.conversation_opener_settings`. Nasce desligada — ligar
significa mandar mensagem para quem acabou de se cadastrar, e essa decisão é do
tenant.

Pela função (JWT de um usuário do time):

```http
POST {SUPABASE_URL}/functions/v1/start-conversation
Authorization: Bearer <JWT do usuário>
Content-Type: application/json

{
  "action": "update-settings",
  "enabled": true,
  "channel_id": "<id do canal WhatsApp não oficial no provider>",
  "trigger_entry_ids": ["<crm_entries.id da porta do webhook do n8n>"],
  "first_message": "Oi {{lead.first_name}}! Aqui é da {{tenant.name}}. Vi que você se cadastrou — posso te ajudar?"
}
```

- `action: "get-settings"` devolve a configuração atual.
- `channel_id` é o `id` que a aba **Canais** já lista (é o mesmo
  `/v2/workspace/{id}/channels` do `manage-agent-channels`). Pode ficar nulo se o
  tenant tiver **exatamente um** WhatsApp conectado; com dois, é obrigatório.
- **Atualizado na SE-REV-002:** o filtro recomendado é pela **porta**
  (`trigger_entry_ids`, os `crm_entries.id`), não pelo `source`. O nome que
  aparece na tela ("<nome do webhook>") é o nome da porta; o `leads.source` sai
  do field_mapping do webhook e, sem mapeamento, vira `webhook_inbound` — um
  `trigger_sources` com o nome da porta nunca casaria. A porta de um webhook é
  `select id from crm_entries where webhook_config_id = '<id do webhook>'`.
  Portas de outro time são recusadas no `update-settings`.
- `trigger_entry_ids` vazio = qualquer porta. `trigger_sources` continua
  existindo (vazio = qualquer `source`; compara ignorando caixa e espaços) e é
  avaliado sobre o `source` **desta chegada**, não o do primeiro cadastro.
- Placeholders de `first_message`: `{{lead.name}}`, `{{lead.first_name}}`,
  `{{lead.source}}`, `{{tenant.name}}`. Um placeholder sem valor vira string
  vazia — nunca vaza `{{lead.name}}` para o cliente.

---

## 2. O n8n chamando (caminho temporário)

```http
POST {SUPABASE_URL}/functions/v1/start-conversation
x-webhook-secret: <equipes.webhook_secret do tenant>
Content-Type: application/json

{
  "lead_id": "uuid-do-lead",
  "event_key": "planilha-linha-8231",
  "message": "opcional — sobrepõe first_message",
  "channel_id": "opcional — sobrepõe o canal configurado"
}
```

É o mesmo segredo que o cliente já usa no `crm-webhook`; não há segredo novo
para distribuir. `?secret=<…>` na query também funciona, para nós HTTP que não
deixam definir header.

**Sem `lead_id`, pode mandar `phone`** — a busca usa o mesmo
`crm_find_lead_by_phone` do `crm-webhook`, então encontra o lead mesmo com
máscara no número (`+55 (11) 98765-4321`). Se não existir lead, a resposta é 404:
cadastre primeiro no `crm-webhook` e chame em seguida.

**`event_key`** é a idempotência. Omitindo, a chave é `lead:<lead_id>` — uma
conversa por lead, para sempre. Mandando o id do evento (execution do n8n, linha
da planilha), o bloqueio é por evento e um disparo futuro legítimo ainda passa.
De um jeito ou de outro: **reenviar o mesmo evento não abre uma segunda
conversa.**

### Respostas

| HTTP | Corpo | Significado |
| --- | --- | --- |
| 201 | `{success: true, event_id, conversation_id, provider_chat_id, channel_id, …}` | conversa aberta |
| 200 | `{success: true, already: true, status: "opened", …}` | esse evento já tinha aberto — nada foi feito de novo |
| 200 | `{success: false, already: true, status: "pending"}` | outra chamada está abrindo agora |
| 200 | `{success: false, skipped: true, code: "source_not_triggered"}` | o `source` do lead está fora do filtro do tenant |
| 401 | `{code: "invalid_secret"}` | segredo errado |
| 402 | `{code: "contract_suspended"}` | conta em modo somente leitura |
| 404 | `{code: "lead_not_found"}` | lead não existe nesse time |
| 409 | `{code: "disabled"}` | o tenant não ligou o recurso |
| 422 | `{code: "missing_phone" \| "technical_phone" \| "missing_message" \| "channel_*"}` | dado ou canal impedem abrir — detalhe em `message` |
| 502 | `{code: "provider_rejected" \| "provider_unreachable", provider_status, hint}` | o provider recusou; corpo dele gravado no rastro |

Retry no n8n é seguro: a chave de idempotência protege. Um `502` pode ser
retentado — a tentativa `failed` é reassumível na hora.

---

## 3. Consultar o que aconteceu

```sql
-- as últimas aberturas de um tenant, com o id devolvido pelo provider
select created_at, status, lead_id, channel_id, channel_type,
       provider_chat_id, provider_status, error_code, error_message, attempts
  from public.conversation_open_events
 where equipe_id = '<uuid>'
 order by created_at desc
 limit 50;

-- as conversas que NÓS abrimos (a base da cadência futura)
select id, lead_id, opened_at, provider_channel_id, gpt_maker_chat_id, last_message_at
  from public.conversations
 where equipe_id = '<uuid>'
   and opened_via = 'start_conversation'
 order by opened_at desc;
```

Na timeline do lead, a atividade aparece com `tipo = 'conversation_opened'`.

---

## 4. Deploy (etapa posterior, com aprovação)

```bash
# 1. esquema
supabase db push

# 2. teste do esquema contra o projeto linkado (roda em BEGIN … ROLLBACK)
bash scripts/sqltest.sh supabase/tests/serev001_start_conversation.test.sql

# 3. a função nova (verify_jwt = false já está no config.toml)
supabase functions deploy start-conversation

# 4. o gatilho de entrada
supabase functions deploy crm-webhook
```

`GPT_MAKER_TOKEN` já existe no ambiente das funções (o `send-chat-message` e o
`manage-agent-channels` usam o mesmo). Nenhum segredo novo.

### Smoke test, nesta ordem

1. **Recurso desligado.** Chamar com o segredo do tenant antes de configurar →
   espera `409 disabled`. Prova que nenhum tenant recebe abertura por acidente.
2. **Canal errado, de propósito.** Configurar `channel_id` de um canal
   Instagram/Cloud API → espera `422 channel_type_unsupported`, com a linha
   correspondente em `conversation_open_events`. Prova que a falha é explícita e
   registrada.
3. **Caminho feliz, com um número nosso.** Configurar o canal WhatsApp não
   oficial e um lead de teste cujo telefone seja um aparelho da equipe. Espera:
   `201`, mensagem chegando no aparelho, `provider_chat_id` preenchido no
   rastro, conversa com `opened_via = 'start_conversation'` e a mensagem visível
   no inbox do Rev.
4. **Idempotência.** Repetir exatamente a chamada do passo 3 → espera `200` com
   `already: true` e **nenhuma segunda mensagem** no aparelho.
5. **Ponta a ponta.** Disparar o fluxo real do n8n para o `crm-webhook` com
   a porta configurada em `trigger_entry_ids` e um telefone de teste. Espera
   `conversation_open_dispatched: true` na resposta do webhook e a conversa
   aberta. Reenviar o mesmo payload → nenhuma segunda conversa.
6. **Resposta do lead.** Responder do aparelho e confirmar que a mensagem cai na
   **mesma** conversa (não numa segunda) — é o que fecha o ciclo para o agente de
   IA assumir.

### Ponto de atenção no passo 3

Se `provider_chat_id` voltar `null`, o shape da resposta do provider é diferente
dos nomes previstos. O corpo cru está em
`conversation_open_events.provider_response`: olhar lá, achar o campo, e
acrescentar o nome em `extractProviderChatId()`. Enquanto isso, o inbox amarra
sozinho quando o lead responder (o `gpt-maker-webhook` preenche o
`gpt_maker_chat_id` nesse momento).

### Rollback

`update public.conversation_opener_settings set enabled = false where equipe_id = '<uuid>';`

Desliga o tenant na hora, sem redeploy. O n8n continua funcionando como hoje —
ele nunca deixou de ser o caminho ativo.
