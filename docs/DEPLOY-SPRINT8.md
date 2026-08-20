# Deploy — Sprint 8 + 8.1

> ## ✅ EXECUTADO EM 2026-08-20
>
> | Etapa | Status |
> |---|---|
> | Git push (23 commits) | ✅ feito — `5047c9b..357a854` |
> | 11 migrations em produção | ✅ feito — **todas as asserções passaram contra o banco real** |
> | 10 edge functions | ✅ feito |
> | `public-proposal` respondendo | ✅ verificado em produção |
> | **Secrets** | ❌ **FALTAM 2 — veja abaixo** |
> | Crons (`pg_cron`) | ❌ pendente (depende do secret) |
> | Rotacionar chave Asaas | ❌ pendente — **só você pode fazer** |
>
> ### O que falta, e por que só você pode fazer
>
> As functions estão no ar mas devolvem `{"error":"not_configured"}` porque
> faltam dois secrets. **Isso é o fail-safe funcionando** — o webhook recusa
> tudo em vez de aceitar chamada não autenticada. Nenhum pagamento é perdido:
> a fila de sincronização do Asaas reenfileira e reentrega quando o token entrar.
>
> Não gerei os valores por você de propósito: um secret gerado nesta conversa
> ficaria registrado no histórico dela, que é exatamente o problema da chave do
> Asaas que precisa ser rotacionada.
>
> **No SEU terminal** (não aqui):
>
> ```bash
> openssl rand -hex 32    # -> ASAAS_WEBHOOK_TOKEN
> openssl rand -hex 32    # -> BILLING_CRON_SECRET
> ```
>
> 1. Cole os dois em Supabase Dashboard → Edge Functions → Secrets.
> 2. Cole o **mesmo** `ASAAS_WEBHOOK_TOKEN` no painel do Asaas → Webhooks →
>    Token de autenticação.
> 3. Rode o teste do §5 abaixo: token errado deve dar **401** (hoje dá 500).
> 4. Agende os crons do §6.
>
> Depois disso a cobrança está funcional ponta a ponta.


Sequência exata, na ordem. **Não pule a ordem** — os secrets precisam existir
antes das functions, e as migrations antes de tudo.

Tudo já está commitado localmente (22 commits em `main`) e testado: as 11
migrations aplicam limpas em banco vazio com todas as asserções passando.

---

## 0. ANTES DE QUALQUER COISA — rotacione a chave do Asaas

A `ASAAS_API_KEY` de produção foi colada em texto puro durante o desenvolvimento.
Ela cria cobranças e lê dados de clientes na conta real.

1. Painel Asaas → Integrações → API → **gerar nova chave**
2. Revogar a antiga
3. Guardar a nova para o passo 2 abaixo

---

## 1. Git

```bash
git push origin main
```

22 commits. Nada aqui toca produção — é só código versionado.

---

## 2. Secrets (Supabase Dashboard → Edge Functions → Secrets)

**Nenhum destes vai para o repositório. Nunca.**

Gere os dois que você inventa:

```bash
openssl rand -hex 32   # ASAAS_WEBHOOK_TOKEN
openssl rand -hex 32   # BILLING_CRON_SECRET
```

| Secret | Valor |
|---|---|
| `ASAAS_API_KEY` | a chave NOVA do passo 0 |
| `ASAAS_WEBHOOK_TOKEN` | o primeiro `openssl` acima |
| `BILLING_CRON_SECRET` | o segundo `openssl` acima |
| `RESEND_API_KEY` | sua chave da Resend |
| `SOLO_PLATFORM_INSTANCE_ID` | `soloventures-salesengine-admin` |
| `PLATFORM_EQUIPE_ID` | `select id from equipes where nome = '<sua equipe>'` |
| `PLATFORM_FOUNDER_EMAIL` | seu e-mail |
| `PLATFORM_FOUNDER_PHONE` | `5585936180023` |
| `APP_BASE_URL` | a URL do app em produção |

`GPT_MAKER_TOKEN` e `WHATSMIAU_*` já existem — não mexa.

---

## 3. Migrations

```bash
supabase db push --project-ref egxzsivzqlqadoqpgfby
```

**O que isso faz no banco de produção**, para você não ser surpreendido:

- Cria 15 tabelas novas (catálogo, contratos, faturas, ledger, propostas,
  notificações). Nenhuma tabela existente é dropada.
- **Concede créditos a todas as equipes existentes** (backfill do Sprint 8 T2):
  a alocação do plano de cada uma vira um `grant`, e `creditos_avulsos` vira um
  `topup`. É o marco zero do ledger — consumo anterior não é reconstruível.
- **Desativa** `plan_1/2/3` e cria Starter/Growth/Scale. Contratos existentes
  não são afetados: não existe nenhum ainda.
- Instala o trigger de assentos. **Equipes sem contrato não têm limite**, então
  nenhum time atual quebra por já ter mais gente que o novo plano.
- Consolida as policies de `webhook_configs` em uma por operação.

Reversível? As tabelas sim (drop). O backfill de créditos não — mas ele só
adiciona saldo, não remove.

---

## 4. Functions

```bash
REF=egxzsivzqlqadoqpgfby

supabase functions deploy asaas-webhook           --no-verify-jwt --project-ref $REF
supabase functions deploy public-proposal         --no-verify-jwt --project-ref $REF
supabase functions deploy billing-cron            --no-verify-jwt --project-ref $REF
supabase functions deploy notification-dispatcher --no-verify-jwt --project-ref $REF
supabase functions deploy credits-reconcile       --no-verify-jwt --project-ref $REF

supabase functions deploy asaas-subscribe    --project-ref $REF
supabase functions deploy asaas-buy-credits  --project-ref $REF
supabase functions deploy provision-tenant   --project-ref $REF
supabase functions deploy fetch-gpt-credits  --project-ref $REF
supabase functions deploy send-chat-message  --project-ref $REF
```

⚠️ Esquecer `--no-verify-jwt` no `asaas-webhook` faz o Asaas receber **401** em
toda entrega, silenciosamente do nosso lado. Nenhum pagamento seria confirmado.

---

## 5. Webhook no Asaas

Painel Asaas → Integrações → Webhooks:

- **URL:** `https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/asaas-webhook`
- **Token:** o mesmo `ASAAS_WEBHOOK_TOKEN` do passo 2
- **Fila de sincronização:** ✅ **ativada** (você já ligou — está certo).
  Ela reenfileira e mantém a ordem quando uma entrega falha. Combina com o
  desenho: sempre devolvemos 200 depois de gravar o evento, então a fila só
  reprocessa falha real de entrega, nunca um bug já registrado.
- **Eventos:** `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
  `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_DELETED`,
  `PAYMENT_RESTORED`

Teste (evento desconhecido = seguro, é registrado como `ignored`):

```bash
curl -i -X POST https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/asaas-webhook \
  -H 'Content-Type: application/json' \
  -H 'asaas-access-token: SEU_TOKEN' \
  -d '{"id":"evt_teste","event":"PAYMENT_AWAITING_RISK_ANALYSIS","payment":{"id":"x"}}'
```

Esperado: `200` com `{"received":true,...}`. Com token errado: **401**.

---

## 6. Crons

Dashboard → Database → Extensions: habilite `pg_cron` e `pg_net`.
SQL Editor (troque `<SECRET>` pelo `BILLING_CRON_SECRET`):

```sql
select cron.schedule('sprint8_billing_tick', '0 12 * * *', $$
  select net.http_post(
    url := 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/billing-cron',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<SECRET>'),
    body := '{}'::jsonb); $$);

select cron.schedule('sprint8_dispatch_tick', '* * * * *', $$
  select net.http_post(
    url := 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/notification-dispatcher',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<SECRET>'),
    body := '{}'::jsonb); $$);

select cron.schedule('sprint8_reconcile_tick', '30 4 * * *', $$
  select net.http_post(
    url := 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/credits-reconcile',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<SECRET>'),
    body := '{}'::jsonb); $$);
```

---

## 7. Frontend

O build já está limpo. Deploy pela Netlify como de costume (`netlify.toml` já
configurado).

---

## 8. Smoke test em produção

1. `/billing` carrega e mostra **duas** carteiras (Atendimento e Copiloto).
2. `/admin` → aba **Propostas** → criar uma proposta de teste → copiar o link.
3. Abrir `/proposta/<codigo>` numa aba anônima → deve renderizar do banco.
4. Aceitar → checar `select * from proposal_acceptances;` (IP, user agent,
   snapshot dos termos).
5. **Provisionar** no admin → deve criar equipe + contrato + 2 faturas.
6. Pagar a fatura de setup com PIX real de valor baixo → o dialog deve virar
   "Pagamento confirmado" sozinho, sem reload.
7. `select * from payment_events order by received_at desc limit 5;` → `processed`.

Se o passo 6 não confirmar: siga `docs/billing-runbook.md` §6.

---

## O que ainda NÃO está pronto (backlog 8.1)

- **C5** — as telas logadas passaram em typecheck/build/lint/testes mas nunca
  foram abertas num navegador com sessão real. Faça o passo 8.1 acima com olhos
  humanos antes de mostrar a cliente.
- **E2** — conectar uma instância não cria o `contract_item` de R$90. Adicione à
  mão até isso ser automatizado, senão é receita que depende de memória.
- **E3** — horas do Builder Mode não são medidas nem cobradas.
- **E5** — migrar clientes atuais dos planos legados para Starter/Growth/Scale.
- **B2** — auto-recarga: a configuração existe, o disparo automático não.
- Limite de **agentes** (`agent_limit`) é exposto e não aplicado.
