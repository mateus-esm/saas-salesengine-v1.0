# Sprint Suporte 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Each "Task" below is one wave of `sprint_suporte_1_plano.md` (the spec, same folder; sections 1 diagnosis, 4 decisions).

**Goal:** Resolve the 17 Solo Energia support tickets with systemic, reuse-first changes.
**Spec:** `Planning/AppOps/Support/sprint_suporte_1_plano.md` (binding authority) and `sprint_suportt_1.md` (the tickets).
**Tech Stack:** React + Vite + TS + vitest + TanStack Query; Supabase (Postgres RPCs/migrations, Deno edge functions).

## Global Constraints
- Work ONLY in this worktree on branch `task/SE-SUP1-support-sprint-1`. Never touch the sibling checkout `../saas-salesengine-v1.0`.
- **NEVER write to production**: no `supabase db push`, no `db query` that mutates, no `functions deploy`, no `git push`, no merge. Read-only `npx supabase db query --linked "select ..."` is allowed for investigation. Migrations are only WRITTEN as files in `supabase/migrations/` (timestamp prefix `202610150NNNNN_sesup1_<name>.sql`, wrapped in a transaction, idempotent where possible) and are applied manually later by the owner.
- Never use `db push --include-all`. Every new table in `public` gets RLS enabled in the same migration (tenant isolation by `equipe_id`, same pattern as `agenda_events`). `security definer` functions set `search_path = public, extensions` (pgcrypto) and every `%s`/param is cast.
- stage_type values are English: `open|won|lost`. WhatsApp phones always go through `supabase/functions/_shared/phone.ts`.
- Reuse existing code paths (funnel_events/record_funnel_event, enqueue_crm_webhooks, notify_report, owner_events, useMemberDirectory, resolveServiceWindow). Do not build a parallel path.
- UI copy in Portuguese (pt-BR). Match surrounding comment density and idiom (comments explain WHY, in the existing language of the file).
- Verification per task: `npx vitest run <touched tests>` plus `npx tsc -b` (or `npx tsc --noEmit -p tsconfig.app.json`) must not add errors; new logic gets tests (TDD). Deno edge-function tests (`*_test.ts`/`*.test.ts` under supabase/functions) are run with `deno test` if deno is available, else say so in the report.
- Commit at the end of each task on the branch with conventional message `feat(suporte): ... (#SE-SUP1-<n>)`; end commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Tickets numbers refer to `sprint_suportt_1.md`. Do NOT edit files outside what the task needs. Migrations that depend on an earlier task's RPC may call it by the name documented in that task.

## Review Focus
- Lost-reason / responsible / distribution RPCs must be tenant-scoped (caller's `equipe_id`) — no cross-tenant writes.
- Instagram window never reports open for >24h without a verified human-agent path.
- Report render must be stable: same sections, same order, zeros when empty.

---

### Task 1: (Onda 1) Motor único de movimentação de etapa  → fecha **#12** (e protege #3/#5/#10)
**Causa:** cada tela chama `moveCard` por conta própria.
**Solução elegante:** um único ponto de entrada.
- `useMoveToStage()` (hook) que, ao destino ter `stage_type='lost'`, **abre o diálogo obrigatório** (sem botão de dispensar; cancelar = desfaz a movimentação) e só então grava etapa + `lost_reason` **na mesma chamada**. Substitui os 3 caminhos hoje duplicados no Kanban e passa a valer em Tabela, modal do negócio, painel do chat e mobile.
- Banco: RPC `crm_move_opportunity(opp, stage, lost_reason)` que **rejeita** destino `lost` sem motivo quando o pipeline tem `loss_reasons`. Webhook/Copilot passam pela mesma RPC (ou recebem `lost_reason = 'nao_informado'` explícito, nunca vazio).
- Backfill: 528 perdidos sem motivo → `lost_reason = 'Não informado'` + filtro "sem motivo" no dashboard para a Solo qualificar depois (não inventar motivo).
- Teste: unit do hook + teste SQL da RPC (perdido sem motivo → erro).

### Task 2: (Onda 1B) Instagram: janela honesta e envio humano  → fecha **#16**
**Decisão (sem nova pergunta):** o Instagram **não é "sempre aberto"** — a Meta impõe 24 h desde a última mensagem do cliente, e o sintoma relatado ("não dá para enviar com janela fechada") é a tela mentindo. Duas partes:
1. **Corrigir a regra** (`src/lib/service-window.ts`): `hasConnectedSoloInstance` vale **só para WhatsApp** (Solo API é WhatsApp). `instagram`/`messenger` entram numa categoria *Meta-messaging*: janela = 24 h do último inbound. `resolveServiceWindow` passa a receber `channel`; a decisão continua num único módulo. Teste: conversa IG + tenant com Solo conectada + último inbound há 30 h → `open=false`.
2. **Liberar o envio humano até onde a Meta permite** — a tag `HUMAN_AGENT` permite resposta de atendente real por até 7 dias. (a) Sonda viva no provedor: enviar a uma conversa IG de teste com janela vencida e capturar status/corpo (mesma pendência de `sprint_7_api_reference.md` §2.3); (b) se o provedor aceitar a tag, `send-chat-message` a aplica só a mensagem de **humano** (nunca do agente de IA): janela IG = 24 h (IA) / 7 d (humano); (c) se não aceitar, o campo de mensagem mostra "fechado" com texto claro e as saídas reais (responder ao comentário/story; abrir WhatsApp se o lead tem telefone).
- Resposta ao ticket: o canal segue aberto; explicar o que a Meta permite sem prometer envio ilimitado.

### Task 3: (Onda 2) Responsável e chat  → fecha **#8, #11**
- Regra de produto (proposta): **Responsável** = dono da conta/negócio (`leads.responsible_id`/`owner_id`); **Atendente** = quem está na conversa (`conversations.assigned_to`). São dois papéis legítimos; a UI mostra os dois e nunca mistura.
- `CRMContextPanel` + `ConversationHeader`: bloco "Responsável / Atendente" com seletor inline (usa `useMemberDirectory`), RPC única `crm_set_responsible(lead, user)` que mantém `leads` e `opportunities` coerentes e grava `owner_events` (já existe da Sprint 11 W2).
- Reaproveitar o painel de CRM do chat: mostrar etapa, valor, próximo contato, campos-chave do cartão (`cardModel.ts`) em vez de criar visão nova.

### Task 4: (Onda 3) Qualidade da ingestão do chat  → fecha **#9** (3 sintomas)
Começa **com dados, não com código** (uma query por sintoma na produção Solo, só leitura):
1. *Conversa fatiada:* medir conversas do mesmo lead com `created_at` a < N min e mensagens sem resposta entre elas. Hipótese: corrida entre dois webhooks (`solo-wpp-webhook` + `gpt-maker-webhook`) sem `unique`/upsert por (lead, canal, janela aberta). Correção: `get_or_create_conversation` atômico (advisory lock por lead+canal).
2. *Nome errado:* o `pushName` do WhatsApp é o nome que **o próprio contato** escolheu e sobrescreve edição manual. Correção: `leads.name_locked` (ou `name_source='manual'`) — edição manual nunca é sobrescrita; `pushName` só preenche nome vazio/técnico.
3. *Não-lead vira lead:* filtro de entrada em um só lugar (`_shared/inbound-filter.ts`): notificação de sistema, mensagens de protocolo, números de serviço, conversa paralela do mesmo telefone (normalizar via `_shared/phone.ts`, regra já estabelecida). Não-lead cria conversa mas **não** cria negócio no pipeline.
- Entregável: relatório curto "quantos casos de cada tipo nos últimos 30 dias" antes de codar, para validar a hipótese.

### Task 5: (Onda 4) Dashboard e relatório  → fecha **#13, #14, #15**
- **#14:** `DashboardFilterBar` ganha preset "Personalizado" (`Calendar mode=range`); os RPCs já aceitam `from/to`, então é só UI + `useUrlFilters`.
- **#13:** RPC `get_touchpoints_by_seller(from,to,pipelines,channels)` agrupando por `responsible_id` (+ total geral) a partir de `touchpoints`; novo widget no catálogo (`widgetCatalog.ts`) e coluna em `TeamPage`.
- **#15 (por pipeline):** o agendamento de relatório ganha `pipeline_id` — cada pipeline recebe o seu (o RPC do snapshot já aceita `p_pipeline_ids`). Relatório **com template fixo**: o `ReportSnapshot` passa a ter sempre as mesmas seções, na mesma ordem, com `0` quando não há dado ("0 touchpoints", "Meta: 0 / gap: X"). O cliente escolhe *recortes* (canal, vendedor), não *quais seções existem*. Adicionar: track da meta, gap da meta diária, destaques do dia, touchpoints e o placar dos 5 marcos do funil (Onda 7). **Meta diária:** hoje não existe; passa a viver em `pipelines.revenue_config.daily_targets` por marco (touchpoints, reuniões agendadas/realizadas, propostas, fechamentos). Se vazio, deriva de `goalDeals`/`goalRevenue` ÷ dias úteis do período — o gestor sobrescreve onde quiser. Mudança concentrada em `_shared/report-render.ts` + o RPC do snapshot; `reports-cron` e o dispatcher ficam intocados.

### Task 6: (Onda 5) Automação orientada a evento (webhook ↔ ação)  → fecha **#3, #5**, prepara #6/#10/#17
Uma só ideia: **evento → (ação)**, onde ação ∈ {chamar URL (hoje), mover etapa, atualizar campo, atribuir responsável}.
- Tabela `crm_automations(equipe_id, trigger {event, stage_id|button_id|webhook_id}, action {type, params}, enabled)`; executor `run_automation()` em SQL chamando as mesmas RPCs da Onda 1/2 (`crm_move_opportunity`, `crm_set_responsible`, atualização de `custom_data[field_id]` — contrato dos campos personalizados).
- Entrada: `crm-webhook` passa a aceitar `action` declarado na configuração do webhook (mover para fase X, atualizar campo Y a partir do payload via o mapeamento já existente).
- #3 visibilidade: `Webhooks.tsx` lista também webhooks ligados a etapas/botões (convenção `stage_entered:<id>`), mostra a origem ("Etapa X → ao entrar") e exibe o **payload de exemplo** do evento (gerado de `_crm_deal_won_payload`) para o mapeamento de campos.
- Logs: `webhook_logs` com filtro por status/evento/data, payload enviado/recebido colapsável, botão "reenviar". Mesma tela mostra execuções de automação (`automation_runs`).
- Remover o stub `process-automations` ou fazê-lo ler de `crm_automations` (decidir na execução; sem tocar o que Solo usa hoje).

### Task 7: (Onda 6) Formulários de ingestão  → fecha **#6**
- Generalizar `public-form`: novo tipo `intake` (hoje só "contrato"). Definição do formulário (campos do lead + campos personalizados, pipeline/etapa de destino, responsável ou roleta) em `crm_forms`; link público `/f/:slug`.
- Submissão → RPC única `crm_intake_submit(form, values)` que cria lead (dedupe via `useLeadDuplicateCheck`, regra já existente), negócio na etapa configurada e `origem` = formulário. Ex.: **Formulário de Indicação** (campo "indicado por" mapeia para `lead_attribution`).
- Reaproveita validação server-side, token e o padrão `parsePublicFormRequest`. Sem CAPTCHA no MVP, mas rate-limit por IP/slug.

### Task 8: (Onda 7) Marcos do funil e Roleta  → fecha **#10, #17**
**#10 — contabilizar reunião agendada, reunião realizada, no-show, proposta enviada e fechamento, por data.** Nada de tabela nova: o motor é `funnel_events` (cada marco com `occurred_at`), e o dashboard já lê dele. Falta:
1. **Corrigir o mapeamento da Solo** (um UPDATE de dados, conferido etapa por etapa com o gestor antes de aplicar): Qualificação→`qualified`; Envio/Negociação de Proposta→`proposal_sent`; Agendamento de Reunião→`meeting_scheduled`; Reunião de Apresentação / Visita Técnica→`meeting_done` ao concluir; `no_show` por registro manual.
2. **Registro manual de desfecho** (realizada, no-show, visita técnica) no evento da agenda e no card do negócio, chamando o `record_funnel_event` existente. `agenda_events.outcome` é só atalho de UI; a verdade contábil fica em `funnel_events`.
3. **Widget "Marcos do funil"**: contagem por marco × dia/semana/mês, por vendedor e por pipeline, com o seletor de datas da Onda 4; entra no relatório diário.
4. Histórico: não há `no_show` no passado; o widget mostra "série começa em <data>" em vez de zero enganoso.

**#17 — Roleta, regra por pipeline.** `pipeline_distribution(pipeline_id, mode, rules jsonb, active)`:
- `mode`: `round_robin` | `weighted` (peso por vendedor) | `by_rule` (o gestor define: *se origem/fonte/campo X = valor → este grupo de vendedores*, avaliadas em ordem, com `default`).
- Tela em **Configurações do pipeline → Distribuição**: lista de regras, limite de negócios abertos por vendedor, "pular ausentes".
- Aplicada **na criação do negócio** num único ponto (`crm_assign_next(opp)` no trigger de INSERT), valendo para webhook, formulário, chat e importação. Grava `owner_events` com o motivo ("regra 2: origem=Indicação"). Depende da Onda 2 (`crm_set_responsible`).

### Task 9: (Onda 9) Catálogo de modelos IA  → fecha **#2**
O provedor (GPT Maker) expõe a lista; `MODEL_CATALOG` (`manage-agent-settings/index.ts:15`) passa a ser só a **tabela de preço/rótulo**, não a lista de modelos.
- `action=models` busca a lista no provedor, cruza com o catálogo local e **cacheia** em `ai_model_catalog` (TTL 6 h) — atualização interna, sem ação do cliente.
- Botão **"Atualizar lista"** no `ModelSelector` força o refresh.
- Modelo listado pelo provedor e **sem preço nosso**: aparece como "novo" com preço provisório (o maior crédito do mesmo fornecedor) — nunca crédito 0 — e gera alerta no painel admin para precificar.
- Modelo que sumiu do provedor: segue visível se algum agente o usa, com aviso.
- Falha do provedor → serve o último cache. Sonda inicial: confirmar endpoint e formato dos ids (o arquivo registra grafias irregulares, ex. `OPEN_AI_04`).

### Task 10: (Onda 8) Mobile  → fecha **#1, #7**
Auditoria guiada (Chrome, viewport 390 px) nas rotas CRM/Kanban, Chat, Dashboard, Webhooks. Lista fechada de defeitos (scroll horizontal da trilha de etapas, janelas que estouram viewport, tabelas sem `overflow-x`), corrigida em lote com utilitário de layout (`useIsMobile` já existe). Só começa depois de definir os "erros de visibilidade" exatos com o cliente — pedir 3–5 prints.

