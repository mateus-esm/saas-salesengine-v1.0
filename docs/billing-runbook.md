# Runbook — Billing v1 (Sprint 8)

Como colocar a cobrança no ar e o que fazer quando algo dá errado.
Deploy é **manual** neste projeto — não existe CI.

---

## 1. Secrets (configure ANTES de fazer deploy)

Supabase Dashboard → Edge Functions → Secrets.

| Secret | Para quê | Como obter |
|---|---|---|
| `ASAAS_API_KEY` | Chamar o Asaas para criar cobranças | Painel Asaas → Integrações → API |
| `ASAAS_WEBHOOK_TOKEN` | **Autenticar o webhook de volta** | Você inventa. Gere uma string longa aleatória |
| `BILLING_CRON_SECRET` | Autenticar `billing-cron`, `notification-dispatcher`, `credits-reconcile` | Você inventa |
| `RESEND_API_KEY` | E-mail transacional | resend.com → API Keys |
| `SOLO_PLATFORM_INSTANCE_ID` | WhatsApp de **plataforma** para alertas | Nome da instância Solo dedicada |
| `PLATFORM_EQUIPE_ID` | Onde caem as notificações de proposta | `select id from equipes where nome = '<sua equipe>'` |
| `PLATFORM_FOUNDER_EMAIL` | Cópia de eventos de proposta | Seu e-mail |
| `PLATFORM_FOUNDER_PHONE` | WhatsApp para eventos críticos | Só dígitos, com DDI |
| `APP_BASE_URL` | Montar links absolutos no e-mail | `https://app.seudominio.com.br` |

> ⚠️ **`ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` são coisas diferentes.**
> A API key é o que **nós mandamos para o Asaas**. O webhook token é um valor que
> **você inventa**, cola no painel do Asaas, e o Asaas devolve no header
> `asaas-access-token` para provarmos que a chamada é legítima.
> Usar a API key de produção como webhook token faria ela trafegar no header de
> toda requisição de entrada. Não faça isso.

Gerar um token aleatório:

```bash
openssl rand -hex 32
```

---

## 2. Aplicar as migrations

```bash
supabase db push --project-ref egxzsivzqlqadoqpgfby
```

Sprint 8 adiciona, nesta ordem:

```
20260819000100_sprint8_billing_core.sql     catálogo, contratos, faturas, payment_events
20260819000200_sprint8_credit_ledger.sql    ledger unificado + charge/grant/check/expire
20260819000300_sprint8_proposals.sql        propostas, itens, aceites
20260819000400_sprint8_notifications.sql    notificações, entregas, matriz de canais
20260819000500_sprint8_billing_cron.sql     índices (o agendamento é manual, ver §4)
20260819000550_sprint8_provision.sql        provisionamento atômico
20260819000600_sprint8_entitlements.sql     entitlements derivados + RLS explícita
```

Todas são idempotentes e carregam asserções — se uma garantia quebrar, a migration
falha em vez de aplicar silenciosamente.

---

## 3. Deploy das edge functions

```bash
REF=egxzsivzqlqadoqpgfby

# Públicas — SEM verificação de JWT
supabase functions deploy asaas-webhook           --no-verify-jwt --project-ref $REF
supabase functions deploy public-proposal         --no-verify-jwt --project-ref $REF
supabase functions deploy billing-cron            --no-verify-jwt --project-ref $REF
supabase functions deploy notification-dispatcher --no-verify-jwt --project-ref $REF
supabase functions deploy credits-reconcile       --no-verify-jwt --project-ref $REF

# Autenticadas
supabase functions deploy asaas-subscribe   --project-ref $REF
supabase functions deploy asaas-buy-credits --project-ref $REF
supabase functions deploy provision-tenant  --project-ref $REF
supabase functions deploy fetch-gpt-credits --project-ref $REF
```

> ⚠️ Esquecer `--no-verify-jwt` no `asaas-webhook` faz o Asaas receber **401** em
> todas as entregas — silenciosamente, do nosso lado. Nenhum pagamento seria
> confirmado e nada apareceria nos logs da aplicação.

---

## 4. Registrar o webhook no Asaas

Painel Asaas → Integrações → Webhooks → Adicionar:

- **URL:** `https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/asaas-webhook`
- **Token de autenticação:** o valor de `ASAAS_WEBHOOK_TOKEN`
- **Eventos:** `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
  `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_DELETED`,
  `PAYMENT_RESTORED`
- **Versão:** v3

Testar (deve responder `{"received":true,...}`):

```bash
curl -i -X POST https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/asaas-webhook \
  -H 'Content-Type: application/json' \
  -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" \
  -d '{"id":"evt_teste","event":"PAYMENT_AWAITING_RISK_ANALYSIS","payment":{"id":"x"}}'
```

Um evento desconhecido é registrado como `ignored` — é seguro para teste.
Token errado deve devolver **401**.

---

## 5. Agendar os crons

Dashboard → Database → Extensions: habilite `pg_cron` e `pg_net`.
Depois, no SQL Editor (injetando os valores reais — **nunca** comite isto):

```sql
select cron.schedule('sprint8_billing_tick', '0 12 * * *', $$
  select net.http_post(
    url     := 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/billing-cron',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<BILLING_CRON_SECRET>'),
    body    := '{}'::jsonb);
$$);

select cron.schedule('sprint8_dispatch_tick', '* * * * *', $$
  select net.http_post(
    url     := 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/notification-dispatcher',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<BILLING_CRON_SECRET>'),
    body    := '{}'::jsonb);
$$);

select cron.schedule('sprint8_reconcile_tick', '30 4 * * *', $$
  select net.http_post(
    url     := 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/credits-reconcile',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<BILLING_CRON_SECRET>'),
    body    := '{}'::jsonb);
$$);
```

Conferir: `select * from cron.job;`
Histórico: `select * from cron.job_run_details order by start_time desc limit 10;`

Rodar à mão é seguro — todo job é idempotente:

```bash
curl -X POST .../functions/v1/billing-cron -H 'x-cron-secret: <SECRET>'
```

---

## 6. Diagnóstico

### "O cliente diz que pagou e não recebeu"

Esta é a pergunta que o Sprint 8 existe para responder. Siga na ordem:

```sql
-- 1. O evento chegou?
select provider_event_id, event_type, status, last_error, received_at
from payment_events order by received_at desc limit 20;
```

| O que você vê | O que significa |
|---|---|
| Nenhuma linha | O Asaas não entregou. Confira URL, token e eventos no painel do Asaas |
| `status = 'failed'` | Chegou e o processamento quebrou. `last_error` diz o quê; o cron re-enfileira |
| `status = 'ignored'` | Evento sem fatura correspondente, ou tipo que não tratamos |
| `status = 'processed'` | Foi aplicado — siga para o passo 2 |

```sql
-- 2. A fatura mudou de estado?
select number, kind, status, total, paid_at, asaas_payment_id
from invoices where equipe_id = '<uuid>' order by created_at desc;

-- 3. O crédito entrou?
select entry_type, credits, source, created_at, metadata
from credit_ledger where equipe_id = '<uuid>' order by created_at desc limit 20;

-- 4. Saldo atual (a verdade)
select public.credit_balance('<uuid>');
```

### Creditar manualmente (último recurso)

Use uma chave de idempotência única e descritiva — assim uma segunda execução
acidental não credita duas vezes:

```sql
select public.grant_credits(
  '<equipe_id>', 1000, 'invoice', null, null,
  'manual_2026_08_20_ticket_123', 'topup');
```

### Reenviar uma notificação

```sql
update notification_deliveries set status = 'pending', attempts = 0
where notification_id = '<uuid>';
```

### Fatura órfã (aberta, sem cobrança no gateway)

Acontece quando o Asaas falha logo depois de criarmos a fatura. O
`billing-cron` cancela automaticamente depois de 2h. Para forçar:

```sql
update invoices set status = 'void'
where status = 'open' and asaas_payment_id is null
  and created_at < now() - interval '2 hours';
```

---

## 7. O que este sprint NÃO cobre

- **Não é possível parar o agente de WhatsApp por falta de crédito.** A geração
  acontece no lado do provider, de forma autônoma; não existe ponto onde
  interceptar. O consumo é medido depois, pelo `credits-reconcile`. O soft stop
  vale para o Copilot. Ver TODO 8.1 no arquivo do sprint.
- **Recarga automática só é automática com cartão salvo.** Com PIX, geramos a
  cobrança e avisamos — alguém ainda precisa pagar.
- **Não há checkout público.** Toda venda passa por proposta.
