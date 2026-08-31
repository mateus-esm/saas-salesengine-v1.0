# Runbook — Sprint 9 · Dashboard & BI

Deploy é manual neste projeto (não há CI). Esta é a ordem, e o que fazer se
algo der errado no meio.

**Tempo estimado:** 20 minutos, mais 1 hora de observação até o primeiro tique
do cron.

---

## 0. Antes de começar

O que esta sprint muda em produção, em uma frase: o dashboard passa a ler
`opportunities` em vez de colunas depreciadas, e um cron novo manda relatório
por WhatsApp.

**Nada aqui apaga dado de cliente.** A migration de backfill só INSERE em uma
tabela nova (`funnel_events`) e nunca toca em `leads`, `opportunities`,
`conversations` ou `messages`.

Checar antes:

```sql
-- 1.653 leads em 8 clientes é o esperado (Sprint 8.5). Se destoar muito,
-- pare e investigue antes de rodar backfill em cima.
select e.nome, count(l.id) as leads
  from equipes e left join leads l on l.equipe_id = e.id and l.deleted_at is null
 group by e.nome order by leads desc;

-- Quantas transições existem para reprocessar (dimensiona o backfill).
select count(*) from opportunity_stage_history;
```

---

## 1. Migrations

Ordem importa: 0300 cria a tabela que 0400 preenche, e 0900 refatora funções
que 0600 criou.

```bash
supabase db push --project-ref egxzsivzqlqadoqpgfby
```

As nove da sprint, em ordem:

| Arquivo | O que faz |
| :------ | :-------- |
| `20260830000300_sprint9_funnel_events.sql` | `funnel_events`, mapa em `pipeline_stages_v2.funnel_event`, `lost_reason`, `loss_reasons`, triggers |
| `20260830000400_sprint9_funnel_backfill.sql` | `recompute_funnel_events()` + backfill inicial (reprocessa o histórico) |
| `20260830000500_sprint9_canonical_channel.sql` | `v_lead_channel` — canal de aquisição vs. atendimento |
| `20260830000600_sprint9_metrics_rpcs.sql` | RPCs de métrica com escopo por papel |
| `20260830000700_sprint9_dashboard_layouts.sql` | layouts salvos (padrão da equipe + pessoal) |
| `20260830000800_sprint9_custom_field_metrics.sql` | gráficos sobre campo custom, com whitelist |
| `20260830000900_sprint9_report_schedules.sql` | agendas, destinatários, runs, `_core` + snapshot |
| `20260830001000_sprint9_report_cron.sql` | tipos de notificação, `notify_report()`, cron **inerte** |
| `20260830001100_sprint9_tenant_report_link.sql` | `tenant_public_origin()` — link do relatório por domínio do cliente |

> ⚠️ **Nunca use `db push --include-all`.** Há migrations aplicadas à mão que
> não estão no histórico; `--include-all` tenta reaplicar tudo.

**Verificar que passou:**

```sql
select count(*) as eventos_recuperados from funnel_events;
-- Esperado: > 0. São os ganhos/perdas históricos, derivados de stage_type.
-- Zero aqui não é necessariamente erro: significa que nenhum cliente tem
-- oportunidade em estágio won/lost. Confira com:
select count(*) from opportunities where status in ('won','lost');
```

---

## 2. Deploy das funções

```bash
supabase functions deploy reports-cron    --project-ref egxzsivzqlqadoqpgfby
supabase functions deploy report-snapshot --project-ref egxzsivzqlqadoqpgfby
```

`report-snapshot` já está com `verify_jwt = false` no `config.toml` — quem abre
o link do WhatsApp não está logado.

---

## 3. Secrets

**Nenhum secret novo.** O tique de relatório reaproveita o `BILLING_CRON_SECRET`
que já existe — um segredo operacional, não quatro.

O link do relatório **não** vem de secret: cada cliente acessa o app pelo próprio
domínio, e o domínio certo já está no banco (`equipes.niche` → `niches.domain`).
`tenant_public_origin()` resolve por equipe, então a Casa Flow recebe um link
`casaflow.soloventures.com.br` e a Solo Energia um `solon.soloventures.com.br`.

Conferir que todo cliente tem domínio resolvível:

```sql
select e.nome, coalesce(public.tenant_public_origin(e.id), '<SEM LINK>') as origem
  from equipes e order by 2, 1;
```

Equipe sem `niche` cai no domínio do niche `default`. Se nem esse existir, o
relatório sai com os números e **sem** a linha do link — de propósito: os números
são o conteúdo, o link é complemento.

---

## 4. Front-end

```bash
npm run build
```

Deploy pelo fluxo normal do Netlify. Rotas novas:

- `/dashboard/visao-geral` · `/funil` · `/time` · `/canais` · `/relatorios`
- `/relatorio/:token` — **pública**, fora do `ProtectedRoute`

`/dashboard` redireciona para `/dashboard/visao-geral`.

---

## 5. O cron (só depois que o resto estiver saudável)

A migration **não registra job nenhum** — registrar exigiria o segredo no git.
Rode no SQL editor, com os valores reais:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('sprint9_reports_tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sprint9_reports_tick');

-- De hora em hora: send_hour tem granularidade de hora, então um tique por
-- minuto não acharia nada em 59 de cada 60 execuções.
SELECT cron.schedule(
  'sprint9_reports_tick',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/reports-cron',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'x-cron-secret', '<BILLING_CRON_SECRET>'
                 ),
      body    := '{}'::jsonb
    );
  $$
);
```

Com este, são **quatro** crons ativos: `sprint8_billing_tick`,
`sprint8_dispatch_tick`, `sprint8_reconcile_tick` e `sprint9_reports_tick`.

> O `sprint8_dispatch_tick` **precisa estar rodando** — é ele que efetivamente
> entrega. Sem ele o relatório é montado, enfileirado e nunca sai. (Ver
> `todo.md`: a fila já ficou parada desde 24/08 uma vez.)

---

## 6. Teste de fumaça em produção

Faça isso com **um número seu**, não com o de cliente.

```sql
-- 1. agenda de teste na sua própria equipe
insert into report_schedules (equipe_id, name, frequency, send_hour, timezone)
values ('<sua-equipe>', 'TESTE', 'daily', 8, 'America/Sao_Paulo')
returning id;

-- 2. você como destinatário (com o 55!)
insert into report_recipients (schedule_id, name, phone)
values ('<id-acima>', 'Teste', '55<ddd><numero>');
```

Dispare na mão:

```bash
curl -X POST https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/reports-cron \
     -H 'x-cron-secret: <BILLING_CRON_SECRET>' \
     -H 'Content-Type: application/json' \
     -d '{"schedule_id":"<id-acima>","force":true}'
```

Confira:

```sql
select r.status, r.recipients_n, r.error, r.public_token
  from report_runs r order by r.created_at desc limit 1;

select n.type, d.channel, d.status, d.attempts, d.error
  from notifications n join notification_deliveries d on d.notification_id = n.id
 where n.type like 'report.%' order by n.created_at desc limit 5;
```

Abra `https://<app>/relatorio/<public_token>` e confira que os números batem
com `/dashboard/visao-geral` no mesmo período.

**Apague a agenda de teste no fim.**

---

## 7. O que dizer aos 8 clientes

O dashboard **vai parecer vazio de funil** até alguém mapear as etapas, e isso
é de propósito: o sistema se recusa a adivinhar o que "Proposta" significa no
pipeline de cada um. Ganhos e perdas já aparecem sozinhos (saem de `stage_type`).

Roteiro, um minuto por cliente:

1. `/pipeline` → escolher a pipeline → **"O que cada etapa significa"**
2. Marcar as etapas que são proposta / reunião agendada / reunião feita
3. Clicar **"Reprocessar histórico"** — os números aparecem para trás, não só
   daqui pra frente
4. `/dashboard/relatorios` → criar o relatório diário, escolher horário e
   colocar o número

---

## Se der errado

| Sintoma | Causa provável | O que fazer |
| :------ | :------------- | :---------- |
| Funil todo zerado | Nenhuma etapa mapeada | É o comportamento correto. `/pipeline` → mapear → Reprocessar. |
| Ganhos zerados também | Backfill não rodou | `select recompute_funnel_events(null);` como admin da equipe. |
| Números não batem com o kanban | Backfill defasado | Reprocessar. É idempotente — rodar duas vezes não muda nada. |
| Relatório não chega | `sprint8_dispatch_tick` parado | `select * from cron.job;` e verificar a fila em `notification_deliveries`. |
| Chega sem link | Equipe sem `niche`, ou niche `default` inativo | `select nome, niche from equipes where niche is null;` e corrigir o cadastro. Sem redeploy. |
| Link abre a marca de outro cliente | `niches.domain` errado para aquele niche | Corrigir `niches.domain`. O link é resolvido no envio, então vale já no próximo. |
| Chega duas vezes | Não deveria ser possível | `unique (schedule_id, period_start)` impede. Se acontecer, guardar os dois `report_runs.id` — é bug de verdade. |
| Link do relatório dá 404 | Rota `/relatorio/:token` fora do build | Confirmar que o deploy do front subiu. |
| Link dá 410 | Run com mais de 90 dias | Esperado. `expires_at` é proposital. |

### Rollback

O front volta pelo deploy anterior no Netlify.

O banco **não precisa de rollback**: tudo é aditivo. Se quiser desligar a
sprint sem reverter migration:

```sql
SELECT cron.unschedule('sprint9_reports_tick');   -- para de enviar
UPDATE report_schedules SET active = false;       -- desativa tudo
```

Reverter as migrations em si só se houver motivo forte — `funnel_events` é
reconstruível a qualquer momento por `recompute_funnel_events()`, mas eventos
`manual` (no-show marcado à mão) não são.

---

## Testes

Rodam contra um Postgres local, não contra produção:

```bash
npx supabase start
npx supabase db reset --local
docker cp supabase/tests/sprint9_w1_funnel_events.test.sql supabase_db_<ref>:/tmp/t.sql
docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/t.sql
```

| Arquivo | Cobre |
| :------ | :---- |
| `sprint9_w1_funnel_events.test.sql` | 12 testes: histórico preservado, sem contagem dupla, idempotência do recompute, canal canônico |
| `sprint9_w2_metrics.test.sql` | 11 testes: aritmética, e os dois que importam — assento comum não lê receita da equipe, tenant vizinho invisível |
| `sprint9_w4_reports.test.sql` | 11 testes: fuso horário, janela fechada, e o unique que impede envio duplicado |

Todos terminam em `rollback` — não deixam resíduo.
