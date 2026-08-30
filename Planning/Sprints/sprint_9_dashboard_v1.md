1. We need build an really beautiful and precise dashboard interface, this is
   where the system shows your value! We need to have an topdown structure where
   we can see the bigger number and most valuable but also can see the granular
   ones, per pipeline,per responsible, per channel, i also want that the client
   can setup reports to receive and they can setup which data receive in the
   report, and allow: Report Diário, Report Semanal, Report Mensal, So they will
   receive the Relatório with the picture of your comercial process like: New
   Leads, Lead per channel, Proposals Sent, Meetings Scheduling, Meetting
   realized, no-show, deals won, deals lost, motive, resume of the day,
   touchpoints, best opportunities, etc! Everything that the client needs to
   have full control over the process, they can setup this daily, weekly,monthly
   report,define the hours that they want to receive and the number! we send
   trough the api of the solo,trough the number of the solo with the report.
2. Also i want that they can personlize, put more or less data to show,so its
   necessary have an full understanding not only the software but the comercial
   process of the client, how each client has your own data with personalized
   fields,jsonb, tables, tasks,etc its necessary look to this field and have the
   option to show this fields or not,ormaybe do some formulas toshow personlized
   fieds in the dashboard.
3. Its like an BI Area of the Software to the client have full control of your
   operation.

---

# 🛠️ IMPLEMENTATION PLAN — Sprint 9 · Dashboard & BI v1

> **PM:** Claude / Opus 5 · **Engenheiro:** Claude (roteado por tier) · **Data do plano:** 2026-08-30
> Zona 1 (Vision) acima é do founder. Esta zona é do PM. Zona 3 (ledger) fica no fim.

## 0. Auditoria — o que existe hoje, e por que o dashboard atual não serve

Três achados de código que definem o formato desta sprint:

**A. O dashboard atual lê um modelo morto.** `src/pages/Dashboard.tsx` +
`src/hooks/useDashboardMetrics.ts` calculam leads por etapa, valor de pipeline,
negócios fechados e conversão a partir de `leads.stage_id` e
`leads.opportunity_value` — colunas marcadas
`DEPRECATED Sprint 4. Removed Sprint 5` em
`supabase/migrations/20260421000000_sprint4_epic0_cutover.sql:57`. O CRM escreve
em `opportunities` + `pipeline_stages_v2` (`OpportunityKanban.tsx`,
`useOpportunities.ts`). Só um bloco (`get_dashboard_kpis`) lê o modelo vivo.
Ou seja: **os números do dashboard hoje não batem com o kanban.**

**B. Métrica lida do estágio ATUAL é estruturalmente errada.** Se um negócio
percorre Proposta → Reunião → Ganho, contar "propostas enviadas" pelo estágio
atual devolve zero. Todo o histórico é perdido por construção. É por isso que o
relatório pedido na Vision não pode ser montado com o schema de hoje.

**C. Metade do que a Vision pede não tem dado por trás.**

- *deals lost, motive* → **não existe campo de motivo de perda em lugar nenhum**
  do schema (zero ocorrências de `loss_reason` / `motivo_perda`).
- *proposals sent* → a tabela `proposals` é a proposta **da plataforma para o
  cliente** (plano, mensalidade, trial), não a proposta do cliente para o lead
  dele. Nada registra o cliente enviando proposta.
- *meetings scheduled / realized / no-show* → vivem nos booleanos
  **depreciados** `leads.meeting_*`, não na oportunidade.
- *leads per channel* → `channel`, `origin`, `origin_category`, `origin_detail`,
  `source` e `origem` coexistem em `leads`. Seis colunas, nenhum cânone —
  embora `origin_taxonomy` (tenant-scoped, `kind` + `label`) já exista e seja o
  cânone natural.

**O que dá para reaproveitar:** `opportunity_stage_history` (log append-only de
toda transição, com ator e timestamp — a base do backfill), `touchpoints`,
`agenda_events`, `pipelines.custom_fields_schema` / `revenue_config`,
`custom_tables` + `custom_table_records`, e toda a pilha de notificação da
Sprint 8.4 (`notification_senders` por finalidade, templates editáveis,
`notify()`, `notification-dispatcher`, `sendViaSolo`, `_shared/phone.ts`).

**Volume real:** ~1.653 leads em 8 clientes. Não justifica materialized view nem
pré-agregação nesta sprint. RPC direta resolve; a decisão fica registrada para
ser revisitada quando um cliente passar de ~50k oportunidades.

## 1. Decisões de arquitetura (founder, 2026-08-30)

| # | Decisão | Escolha |
| :- | :------ | :------ |
| D1 | Fonte da verdade das métricas | `opportunities` + `pipeline_stages_v2` + `opportunity_stage_history`. `leads` fica como identidade do contato. |
| D2 | Como o dashboard entende o funil de cada cliente | **Mapa semântico por pipeline**: cada estágio mapeia para um evento canônico. Nada de hardcode. |
| D3 | Número que envia o relatório | Número da **plataforma**, `purpose = 'operacao'`, via infra da 8.4. Não consome crédito do cliente. |
| D4 | Personalização nesta sprint | **Catálogo de widgets + layout salvo**. Fórmulas ficam para a 9.1. |
| D5 | Formato do relatório | **Texto formatado no WhatsApp + link** para a página completa do relatório. |
| D6 | Escopo | Tudo na Sprint 9, em 4 ondas. |
| D7 | Visibilidade | `admin`/`owner` veem a equipe inteira; `user` vê só o que é dele. Escopo derivado no servidor. |
| D8 | Backfill (decidido pelo PM) | O mapa semântico **reprocessa o histórico**. `opportunity_stage_history` já tem toda transição; ao mapear, o cliente ganha histórico real, não gráfico vazio. |

## 2. Princípios inegociáveis desta sprint

1. **Evento, não snapshot.** Métrica de funil sai de um log append-only
   (`funnel_events`), nunca do estágio atual da oportunidade.
2. **Uma camada de métrica, dois consumidores.** O dashboard e o relatório do
   WhatsApp chamam **as mesmas RPCs**. O relatório é uma renderização do
   snapshot — nunca uma segunda implementação de "novos leads" que diverge da
   tela.
3. **Escopo vem do servidor.** O recorte por responsável é derivado de
   `auth.uid()` dentro da função. Um parâmetro de escopo vindo do cliente seria
   um bypass de uma linha.
4. **Nada novo fala WhatsApp.** O envio passa por `notify()` →
   `notification_deliveries` → `notification-dispatcher` → `sendViaSolo`, com
   telefone normalizado por `_shared/phone.ts`. Sem o 55 a API aceita e a
   mensagem some — já custou uma sprint.
5. **Jsonb só com whitelist.** Widget sobre campo custom só aceita campo
   declarado em `pipelines.custom_fields_schema` ou `custom_tables.table_schema`.
   Sem isso, config de widget vira query jsonb arbitrária.
6. **Cron nasce inerte.** A migration documenta o job e não registra nada, igual
   `20260819000500_sprint8_billing_cron.sql`. Segredo não entra em git.
7. **Reenvio é impossível por construção.** `unique (schedule_id, period_start)`
   em `report_runs`. Dois ticks do cron não mandam o relatório duas vezes.

## 3. Modelo de dados novo

```
funnel_events                     (log append-only — o coração da sprint)
  id, equipe_id, opportunity_id, lead_id, pipeline_id,
  event      -- qualified | proposal_sent | meeting_scheduled
             -- | meeting_done | no_show | won | lost
  occurred_at, source (stage_change|manual|import|recompute), actor, stage_id
  unique (opportunity_id, event, occurred_at)

pipeline_stages_v2.funnel_event   -- text NULL, CHECK no conjunto fechado
                                  -- won/lost NÃO entram aqui: derivam de
                                  -- stage_type, senão divergem
v_stage_funnel_event              -- o coalesce; único lugar que responde
                                  -- "o que este estágio significa"

opportunities.lost_reason         -- text NULL
pipelines.loss_reasons            -- jsonb: lista configurável por pipeline
v_lead_channel                    -- canal canônico resolvido contra origin_taxonomy

dashboard_layouts                 -- equipe_id, user_id NULL = padrão da equipe
                                  -- widgets jsonb

report_schedules                  -- frequency, send_hour, weekday, monthday,
                                  -- timezone (America/Sao_Paulo), sections[],
                                  -- filters jsonb, active, next_run_at
report_recipients                 -- schedule_id, name, phone (normalizado), channel
report_runs                       -- snapshot jsonb CONGELADO, public_token,
                                  -- rendered_text, period_start/end, expires_at
                                  -- unique (schedule_id, period_start)
```

**Por que `funnel_events` e não colunas na oportunidade:** um lead pode receber
duas propostas. Coluna guarda a última; log guarda as duas. Taxas de conversão
usam `count(distinct opportunity_id)`, volume de atividade usa `count(*)` — a
distinção fica documentada na RPC, não na cabeça de quem lê o gráfico.

## 4. Mapa de ondas

```
W1 Fundação de dados (sem UI)      T1 → T2 → T3
W2 Métricas + dashboard core       T4 → T5 → (T6 ∥ T7)
W3 Personalização + relatório      T8 → T9 ∥ T10 ∥ T11
W4 Agendador + envio               T12 → T13 → T14 → T15
```

## 5. Tarefas

### 🌊 Wave 1 — Fundação de dados

| ID | Tarefa | Tier | Modelo | Arquivos (ownership exclusiva) |
| :- | :----- | :--- | :----- | :----------------------------- |
| T1 | `funnel_events` + mapa semântico + motivo de perda | **XL** | Opus 5 | `supabase/migrations/20260830000300_sprint9_funnel_events.sql` |
| T2 | `recompute_funnel_events()` + backfill do histórico | **L** | Opus 5 | `supabase/migrations/20260830000400_sprint9_funnel_backfill.sql` |
| T3 | Canal canônico (`v_lead_channel`) | **M** | Sonnet 5 | `supabase/migrations/20260830000500_sprint9_canonical_channel.sql` |

- **T1** — cria `funnel_events` (+ RLS + índices), adiciona
  `pipeline_stages_v2.funnel_event` com CHECK fechado, a view
  `v_stage_funnel_event`, `opportunities.lost_reason`, `pipelines.loss_reasons`,
  e o trigger que transforma cada `opportunity_stage_history` em evento.
  **Critério:** mover um card no kanban gera exatamente uma linha em
  `funnel_events`; mover de volta e de novo gera duas, não uma.
- **T2** — `recompute_funnel_events(p_pipeline_id)`: **idempotente**, apaga os
  eventos `source='recompute'` do pipeline e reprocessa
  `opportunity_stage_history` inteiro contra o mapa atual. Nunca inventa
  mapeamento por heurística de nome — estágio sem mapa não vira evento.
  **Critério:** rodar duas vezes seguidas devolve a mesma contagem.
- **T3** — resolve as seis colunas de origem contra `origin_taxonomy`, com
  precedência explícita e documentada e `'não informado'` como fallback.

### 🌊 Wave 2 — Métricas + dashboard core

| ID | Tarefa | Tier | Modelo | Arquivos |
| :- | :----- | :--- | :----- | :------- |
| T4 | RPCs de métrica com escopo por papel | **XL** | Opus 5 | `supabase/migrations/20260830000600_sprint9_metrics_rpcs.sql` |
| T5 | Hooks de dashboard (mata o `useDashboardMetrics` legado) | **L** | Opus 5 | `src/hooks/useDashboardV2.ts`, `src/types/dashboard.ts` |
| T6 | Shell + sub-rotas + KPI hero + funil | **XL** | Opus 5 | `src/pages/Dashboard.tsx`, `src/pages/dashboard/**`, `src/App.tsx` |
| T7 | Quebras: pipeline · responsável · canal | **L** | Opus 5 | `src/components/dashboard/**` |

- **T4** — `get_funnel_overview`, `get_funnel_series`, `get_funnel_breakdown`,
  `get_loss_reasons`, `get_top_opportunities`, `get_report_snapshot`. Todas
  `SECURITY DEFINER`, `SET search_path = public`, escopo derivado de
  `auth.uid()`: `admin`/`owner` veem a equipe, `user` é forçado ao próprio
  `responsible_id` **dentro da função**.
- **T6** — sub-rotas no padrão que AI Studio e Billing já usam: `/dashboard` ·
  `/dashboard/funil` · `/dashboard/time` · `/dashboard/canais` ·
  `/dashboard/relatorios`. Top-down: KPI hero → funil com conversão por etapa →
  quebras → tabelas. Gráficos com `recharts` (já é dependência) sobre os tokens
  `--chart-N` existentes. **Invocar a skill `dataviz` antes do primeiro
  gráfico** — a área precisa ler como um sistema só, claro e escuro.

### 🌊 Wave 3 — Personalização + página do relatório

| ID | Tarefa | Tier | Modelo | Arquivos |
| :- | :----- | :--- | :----- | :------- |
| T8 | `dashboard_layouts` + catálogo de widgets + liga/desliga/reordena | **L** | Opus 5 | `supabase/migrations/20260830000700_sprint9_dashboard_layouts.sql`, `src/hooks/useDashboardLayout.ts`, `src/components/dashboard/WidgetCatalog.tsx` |
| T9 | Widgets sobre campo custom / jsonb (com whitelist) | **L** | Opus 5 | `supabase/migrations/20260830000800_sprint9_custom_field_metrics.sql`, `src/components/dashboard/CustomFieldWidget.tsx` |
| T10 | UI de motivo de perda + config por pipeline | **M** | Sonnet 5 | `src/components/crm/LossReasonDialog.tsx`, `src/components/crm/OpportunityKanban.tsx`, `src/pages/PipelineSettings.tsx` |
| T11 | Página pública `/relatorio/:token` | **L** | Opus 5 | `supabase/functions/report-snapshot/index.ts`, `src/pages/PublicReport.tsx` |

- **T8** — padrão da equipe (`user_id IS NULL`, editável por admin) + override
  pessoal. Widget é descritor `{type, metric, dimension, filters, size,
  position, visible}` escolhido de um catálogo — não config livre.
- **T11** — mesmo padrão de `PublicProposal`: edge function com service role lê
  o run congelado pelo token; as tabelas **nunca** são expostas a `anon`.

### 🌊 Wave 4 — Agendador + envio

| ID | Tarefa | Tier | Modelo | Arquivos |
| :- | :----- | :--- | :----- | :------- |
| T12 | Tabelas de relatório + `get_report_snapshot` + `next_run_at` | **XL** | Opus 5 | `supabase/migrations/20260830000900_sprint9_report_schedules.sql` |
| T13 | `reports-cron` + tipos/templates de notificação + cron inerte | **L** | Opus 5 | `supabase/functions/reports-cron/index.ts`, `supabase/functions/_shared/report-render.ts`, `supabase/migrations/20260830001000_sprint9_report_cron.sql` |
| T14 | UI `/dashboard/relatorios` (agendamento, seções, horário, destinatários, "enviar agora") | **L** | Opus 5 | `src/pages/dashboard/ReportsPage.tsx`, `src/hooks/useReportSchedules.ts` |
| T15 | Runbook de deploy + docs + ledger | **S** | Haiku 4.5 | `docs/runbook_sprint9.md`, `Planning/Workflow/billing.md` |

- **T13** — o cron computa o período, chama `get_report_snapshot`, renderiza
  pelo **template editável** nos novos `notification_types` (`report.daily` /
  `report.weekly` / `report.monthly`, `purpose='operacao'`), cria o `report_run`
  com token e enfileira via `notify()`. Timezone `America/Sao_Paulo` no cálculo
  de `next_run_at`.

## 6. Ownership de arquivos

Nenhuma tarefa da mesma onda compartilha arquivo. `src/App.tsx` é tocado só por
T6. `Planning/Workflow/billing.md` recebe uma linha por tarefa — no merge,
**conflito de ledger se resolve mantendo todas as linhas**.

## 7. Riscos e o que fazer com eles

| Risco | Mitigação |
| :---- | :-------- |
| Cliente não mapeia os estágios → dashboard vazio | Estado vazio que **ensina**: "mapeie seus estágios para ver este número", com link direto para a tela de mapa. Nunca um gráfico zerado sem explicação. |
| Backfill roda duas vezes e dobra evento | `recompute` apaga `source='recompute'` antes de reprocessar. Idempotência testada. |
| Cron dispara duas vezes | `unique (schedule_id, period_start)` em `report_runs`. |
| Telefone sem 55 → mensagem some | `_shared/phone.ts` na gravação do destinatário **e** no envio. |
| Link do relatório vaza dado do cliente | Token aleatório longo, `expires_at`, edge function service-role, tabela fechada para `anon`. |
| RPC lenta quando um cliente crescer | Índices em `funnel_events (equipe_id, event, occurred_at)`. Materialized view fica registrada como decisão adiada, não esquecida. |

## 8. ✅ Definition of Done — *rascunho do PM, founder confirma*

- [ ] O dashboard não lê mais nenhuma coluna depreciada; o número na tela bate com o kanban.
- [ ] Existe estrutura top-down: número grande → funil → quebra por pipeline, responsável e canal → detalhe.
- [ ] "Propostas enviadas" e "reuniões" contam corretamente mesmo para negócios que já avançaram de etapa.
- [ ] Negócio perdido pede motivo, e o motivo aparece agregado no dashboard e no relatório.
- [ ] O cliente liga/desliga e reordena widgets; o layout persiste por equipe e por usuário.
- [ ] Widget sobre campo personalizado (jsonb / tabela custom) funciona e só aceita campo declarado no schema.
- [ ] `admin`/`owner` veem a equipe; `user` vê só o dele — verificado com uma sessão de cada.
- [ ] Dá para agendar relatório diário, semanal e mensal, escolhendo seções, horário e destinatários.
- [ ] O relatório chega no WhatsApp pelo número da plataforma, com texto legível e link para a página completa.
- [ ] O link abre o relatório **congelado** do período enviado.
- [ ] Rodar o cron duas vezes no mesmo período não envia duas mensagens.
- [ ] `npm run build` limpo; runbook de deploy escrito (secrets + cron + ordem das migrations).

## 9. 📊 Ledger da sprint

- [x] T1 · `funnel_events` + mapa semântico + motivo de perda — XL
- [x] T2 · `recompute_funnel_events()` + backfill — L
- [x] T3 · Canal canônico — M
- [x] T4 · RPCs de métrica com escopo por papel — XL
- [x] T5 · Hooks de dashboard — L
- [x] T6 · Shell + sub-rotas + KPI hero + funil — XL
- [x] T7 · Quebras pipeline/responsável/canal — L
- [x] T8 · Layouts + catálogo de widgets — L
- [x] T9 · Widgets sobre campo custom — L
- [x] T10 · UI de motivo de perda + mapa de etapas — M
- [x] T11 · Página pública do relatório — L (movida da W3 para a W4: depende de report_runs)
- [x] T12 · Tabelas de relatório + snapshot — XL
- [x] T13 · `reports-cron` + templates + cron inerte — L
- [ ] T14 · UI de agendamento — L
- [ ] T15 · Runbook + docs — S
