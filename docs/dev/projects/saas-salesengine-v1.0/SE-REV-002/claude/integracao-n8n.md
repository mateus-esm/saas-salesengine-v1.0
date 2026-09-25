# SE-REV-002 — Contrato do outreach e convivência com o n8n

Este documento descreve como configurar e operar o motor. Nada aqui foi
executado contra produção.

## 1. Limite desta entrega

O workflow n8n atual continua sendo o Lead Engine vendido e operado pelo dono.
Ele continua enviando cadastros ao `crm-webhook`; o Rev registra a chegada pela
porta e o motor nativo reage a esse evento. Não é necessário acrescentar um nó
de outreach ao workflow existente.

**Não alterar o workflow nem o Schedule Trigger nesta entrega.** A sugestão de
reduzir o Schedule Trigger de 10 para 2 minutos fica como ideia futura e está
explicitamente marcada como **não aplicar nesta entrega**.

## 2. Endpoint e autenticação

```http
POST {SUPABASE_URL}/functions/v1/outreach
Content-Type: application/json
```

Credenciais aceitas:

- `Authorization: Bearer <JWT do usuário>` para tela e configuração;
- `x-webhook-secret: <equipes.webhook_secret>` para n8n/integração do tenant;
- `Authorization: Bearer <SERVICE_ROLE_KEY>` com `equipe_id` no corpo para
  chamadas internas controladas.

O segredo identifica o tenant. IDs de outro tenant são recusados ou não
encontrados.

## 3. Ações da API

### `list-sequences`

Uso pela tela; devolve sequências e passos, contagem de inscrições, portas
permitidas, instâncias Solo, canais GPT Maker e o perfil de envio.

```json
{ "action": "list-sequences" }
```

### `upsert-sequence`

Somente JWT de usuário do time.

```json
{
  "action": "upsert-sequence",
  "sequence": {
    "id": "<opcional-em-edição>",
    "name": "Entrada de anúncio",
    "active": false,
    "trigger_event": "lead_intake",
    "trigger_entry_ids": ["<crm_entries.id>"],
    "reenroll": "once_per_lead",
    "stop_on_reply": true,
    "stop_on_stage_change": true
  },
  "steps": [
    {
      "position": 0,
      "offset_minutes": 0,
      "message_template": "Oi {{lead.first_name}}, aqui é da {{tenant.name}}…"
    },
    {
      "position": 1,
      "offset_minutes": 1440,
      "message_template": "Oi {{lead.first_name}}, conseguiu ver minha mensagem?"
    },
    {
      "position": 2,
      "offset_minutes": 4320,
      "message_template": "Último contato por aqui. Se não quiser mais receber, responda SAIR."
    }
  ]
}
```

Os offsets são absolutos desde a inscrição e precisam ser estritamente
crescentes. A sequência deve ser criada desligada, revisada e ligada só após o
smoke. Enquanto o upsert não for transacional, não ativar uma sequência na
mesma operação que altera passos em produção.

### `update-profile`

Somente JWT de usuário do time. Escolhe exatamente um provider; não existe
fallback automático.

GPT Maker não oficial:

```json
{
  "action": "update-profile",
  "profile": {
    "provider": "gptmaker",
    "channel_id": "<id-do-canal-WHATSAPP-não-oficial>",
    "solo_instance_id": null,
    "send_window_start": "08:00",
    "send_window_end": "20:00",
    "timezone": "America/Sao_Paulo",
    "max_sends_per_line_hour": 10,
    "opt_out_keywords": ["sair", "parar", "pare", "stop", "cancelar", "descadastrar"]
  }
}
```

Solo API:

```json
{
  "action": "update-profile",
  "profile": {
    "provider": "solo",
    "channel_id": null,
    "solo_instance_id": "<wpp_instances.id-do-tenant>",
    "send_window_start": "08:00",
    "send_window_end": "20:00",
    "timezone": "America/Sao_Paulo",
    "max_sends_per_line_hour": 10,
    "opt_out_keywords": ["sair", "parar", "pare", "stop", "cancelar", "descadastrar"]
  }
}
```

Cloud API/template oficial não é suportada nesta entrega.

### `enroll`

Pode ser chamada por JWT, segredo do webhook ou service role. É idempotente por
`event_key`.

```json
{
  "action": "enroll",
  "sequence_id": "<cadence_sequences.id>",
  "lead_id": "<leads.id>",
  "event_key": "n8n:<execution-id>:<item-id>"
}
```

Também aceita `phone` no lugar de `lead_id`. O caminho automático normal não
precisa desta chamada: a inserção em `lead_touches` feita pelo `crm-webhook`
inscreve pela porta configurada.

Resposta criada:

```json
{
  "created": true,
  "enrollment_id": "<uuid>",
  "enrollment_key": "api:n8n:<execution-id>:<item-id>"
}
```

Repetir a mesma chave devolve `created: false`; não cria novos jobs.

### `cancel`, `opt-out` e `get-trace`

```json
{ "action": "cancel", "enrollment_id": "<uuid>" }
```

```json
{ "action": "opt-out", "lead_id": "<uuid>" }
```

```json
{ "action": "get-trace", "lead_id": "<uuid>" }
```

O opt-out fica preso ao telefone normalizado do tenant; apagar e recriar o lead
não reabilita o número.

## 4. Exemplo de configuração do caso Casa Flow

Este exemplo é documentação operacional, não dado hardcoded no produto.

1. Manter o workflow atual planilha → `crm-webhook/inbound/{config_id}` sem
   nenhuma mudança.
2. Na tela **Outreach**, escolher a porta `crm_entries` correspondente ao
   webhook “Meta ADS - Cadastro”. O filtro é pela porta, não pela string de
   `leads.source`.
3. Escolher GPT Maker e o canal `WHATSAPP` não oficial confirmado pela API do
   provider. Se o canal for `CLOUD_API`, não ativar: templates oficiais ficam
   para uma entrega posterior.
4. Usar limite inicial baixo, janela comercial e criar a sequência desligada:
   passo 0 imediato, passo 1 em +1 dia, passo 2 em +3 dias com “responda SAIR”.
5. Executar o smoke em aparelho controlado. Só depois ligar a sequência.

Nenhum UUID, telefone ou texto específico de cliente é usado na lógica do
motor. Os IDs são configuração do tenant.

## 5. Cancelamentos e estados

- mensagem nova `sender_type = customer` depois do início cancela por
  `lead_replied` quando `stop_on_reply` está ligado;
- resposta inteira igual a uma palavra de saída normalizada registra opt-out e
  cancela por `opted_out`;
- mudança de etapa cancela sequência configurada com
  `stop_on_stage_change`;
- oportunidade ganha/perdida, lead apagado ou sequência desligada cancelam os
  jobs restantes;
- timeout após possível aceitação vira `unknown`, nunca retry;
- falha certamente transitória pode tentar no máximo três vezes.

## 6. Deploy e smoke

Ordem resumida; os comandos completos e os bloqueios estão em
`implementacao.md`.

1. Mergear a PR #44 (SE-REV-001).
2. Mergear a SE-REV-002 já atualizada sobre a base.
3. Aplicar, em ordem, as migrations `20260926000050` e `20260926000100`.
4. Configurar `OUTREACH_WORKER_SECRET`.
5. Publicar `start-conversation`, `crm-webhook`, `send-chat-message`, `outreach`
   e `outreach-worker`.
6. Publicar o frontend.
7. Configurar os dois segredos do worker no Vault.
8. Fazer smoke com sequências desligadas.
9. Agendar o script inerte e só então ativar uma sequência piloto.

Smoke obrigatório:

- envio manual sem chat em GPT Maker e Solo;
- segunda chamada `start-conversation` para o mesmo aparelho;
- porta certa inscreve e porta errada não;
- sequência curta entrega uma vez por passo;
- resposta e `SAIR` bloqueiam os passos seguintes;
- fora da janela e limite por linha adiam sem chamar provider;
- resposta inbound aciona o agente quando habilitado;
- rastro, conversa, mensagem e atividade concordam.

### Rollback

```sql
select cron.unschedule('outreach-tick');
update public.cadence_sequences set active = false where active;
```

Depois reverter frontend/Edge Functions pelo processo de release. Não apagar as
tabelas ou o rastro. O n8n segue intacto e continua sendo o caminho padronizado.

