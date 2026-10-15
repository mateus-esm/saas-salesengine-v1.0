# Sprint Suporte 1 — Plano de execução

**Entrada:** `sprint_suportt_1.md` (17 tickets, Solo Energia, todos `aberto`).
**Princípio:** 17 tickets são ~8 problemas. Cada onda resolve uma *causa* e fecha vários tickets de uma vez, reaproveitando o que já existe (nada de segundo caminho de saída, de envio ou de cálculo).

---

## 1. Diagnóstico — o que o código e o banco já dizem

| # | Ticket | Achado (verificado) | Natureza |
|---|---|---|---|
| 12 | Motivo de perda | `LossReasonDialog` existe, mas só abre no drag do **Kanban** (`OpportunityKanban.tsx:230,245`). Tabela, modal do negócio, painel do chat, Copilot e webhook movem para "Perdido" sem pedir. Dialog também deixa dispensar. **Banco: 528 de 533 negócios perdidos da Solo estão sem motivo.** | Bug sistêmico |
| 2 | Modelos IA | `MODEL_CATALOG` é lista fixa em `manage-agent-settings/index.ts:15`. Novo modelo do provedor exige deploy. | Dado desatualizado |
| 3, 5 | Webhook ↔ botão / ações | Saída: `enqueue_crm_webhooks → deliver-crm-webhook → webhook_logs`. Etapa → webhook acabou de ser ligada em `SE-STAGEHOOK-001` (branch atual, não mergeada). Entrada (`crm-webhook`, 933 linhas) só cria lead. `process-automations` é stub (só grava `lead_activities`). | Falta de capacidade, base existe |
| 6 | Formulários | `public-form` + `_crm_public_form_*` existem, mas só para "Dados para Contrato" de um registro já existente. Não há formulário que **crie** lead/negócio. | Extensão |
| 8, 11 | Responsável no chat | Conversa tem `assigned_to` (atendente); lead tem `responsible_id`; negócio tem `owner_id`. Três campos, nenhuma UI que os mostre juntos nem que edite no chat. | Modelo + UI |
| 9 | Chat | (a) conversa fatiada, (b) nome errado do lead, (c) lixo vira lead. Webhook Solo já ignora grupos/broadcast; `gpt-maker-webhook` já descarta nome com cara de Meta ID. Falta: dedupe de conversa, política de nome, filtro de "não-lead". | Investigar com dados |
| 10 | Reunião / no-show / propostas | **Já existe** `funnel_events` (qualified, proposal_sent, meeting_scheduled, meeting_done, no_show, won, lost) com data (`occurred_at`) e RPC `record_funnel_event`. Falta: (a) **mapeamento deslocado na Solo**: *Elaboração de Proposta*→`qualified`, *Agendamento de Reunião*→`proposal_sent`, *Reunião de Apresentação* e *Visita Técnica*→`meeting_scheduled`, *Negociação*→`meeting_done`; (b) botão para registrar no-show/realizada sem mover etapa; (c) widget por data. Hoje: 6 `meeting_done` vs 10 `meeting_scheduled` vs 39 `proposal_sent`. | Dado errado + UI |
| 13, 14 | Touchpoints / filtro de data | `useDashboardV2` + `DashboardFilterBar` usam presets (`today`, `7d`…). RPCs já aceitam `p_from/p_to` — falta o seletor de intervalo e a métrica de touchpoint por vendedor. | UI + 1 RPC |
| 15 | Relatório padronizado | `reports-cron` já gera snapshot → `notify_report`; `sections[]` é escolhido pelo cliente, e seção vazia some do texto. | Contrato de render |
| 17 | Roleta | Nada existe. Metas moram em `pipelines.revenue_config` (por pipeline, com meta por vendedor); **não há meta diária**. | Feature nova |
| 4 | Google Agenda | Nada existe. | Feature grande |
| 1, 7 | Mobile | Há `components/crm/mobile` (StagePicker, MoveToStageSheet); drag desabilitado no mobile. Falhas pontuais de scroll/janela. | Auditoria |
| 16 | Instagram "pode continuar aberto" | **Causa raiz achada** (Onda 1B): `resolveServiceWindow` trata a conversa como "sempre aberta" se o *tenant* tem qualquer instância Solo conectada (`hasConnectedSoloInstance`, `Chat.tsx:213`). A Solo tem, então o Instagram aparece "aberto", mas o envio vai pelo provedor/Meta, que recusa fora de 24 h. A tela promete o que o canal não entrega. 11 conversas IG hoje. | Bug de regra |

---

## 2. Ondas (ordem = valor ÷ custo, dependências respeitadas)

### Onda 0 — Fechar o que está aberto (0,5 dia)
Mergear `task/SE-STAGEHOOK-001` (já cobre o *backend* de #3: etapa → webhook). Commitar/separar as mudanças soltas em `useBilling.ts`/`CreditsPage.tsx` (não são desta sprint). Cada onda abaixo sai em branch própria `task/SE-SUP1-<onda>`.

### Onda 1 — Motor único de movimentação de etapa  → fecha **#12** (e protege #3/#5/#10)
**Causa:** cada tela chama `moveCard` por conta própria.
**Solução elegante:** um único ponto de entrada.
- `useMoveToStage()` (hook) que, ao destino ter `stage_type='lost'`, **abre o diálogo obrigatório** (sem botão de dispensar; cancelar = desfaz a movimentação) e só então grava etapa + `lost_reason` **na mesma chamada**. Substitui os 3 caminhos hoje duplicados no Kanban e passa a valer em Tabela, modal do negócio, painel do chat e mobile.
- Banco: RPC `crm_move_opportunity(opp, stage, lost_reason)` que **rejeita** destino `lost` sem motivo quando o pipeline tem `loss_reasons`. Webhook/Copilot passam pela mesma RPC (ou recebem `lost_reason = 'nao_informado'` explícito, nunca vazio).
- Backfill: 528 perdidos sem motivo → `lost_reason = 'Não informado'` + filtro "sem motivo" no dashboard para a Solo qualificar depois (não inventar motivo).
- Teste: unit do hook + teste SQL da RPC (perdido sem motivo → erro).

### Onda 1B — Instagram: janela honesta e envio humano  → fecha **#16**
**Decisão (sem nova pergunta):** o Instagram **não é "sempre aberto"** — a Meta impõe 24 h desde a última mensagem do cliente, e o sintoma relatado ("não dá para enviar com janela fechada") é a tela mentindo. Duas partes:
1. **Corrigir a regra** (`src/lib/service-window.ts`): `hasConnectedSoloInstance` vale **só para WhatsApp** (Solo API é WhatsApp). `instagram`/`messenger` entram numa categoria *Meta-messaging*: janela = 24 h do último inbound. `resolveServiceWindow` passa a receber `channel`; a decisão continua num único módulo. Teste: conversa IG + tenant com Solo conectada + último inbound há 30 h → `open=false`.
2. **Liberar o envio humano até onde a Meta permite** — a tag `HUMAN_AGENT` permite resposta de atendente real por até 7 dias. (a) Sonda viva no provedor: enviar a uma conversa IG de teste com janela vencida e capturar status/corpo (mesma pendência de `sprint_7_api_reference.md` §2.3); (b) se o provedor aceitar a tag, `send-chat-message` a aplica só a mensagem de **humano** (nunca do agente de IA): janela IG = 24 h (IA) / 7 d (humano); (c) se não aceitar, o campo de mensagem mostra "fechado" com texto claro e as saídas reais (responder ao comentário/story; abrir WhatsApp se o lead tem telefone).
- Resposta ao ticket: o canal segue aberto; explicar o que a Meta permite sem prometer envio ilimitado.

### Onda 2 — Responsável e chat  → fecha **#8, #11**
- Regra de produto (proposta): **Responsável** = dono da conta/negócio (`leads.responsible_id`/`owner_id`); **Atendente** = quem está na conversa (`conversations.assigned_to`). São dois papéis legítimos; a UI mostra os dois e nunca mistura.
- `CRMContextPanel` + `ConversationHeader`: bloco "Responsável / Atendente" com seletor inline (usa `useMemberDirectory`), RPC única `crm_set_responsible(lead, user)` que mantém `leads` e `opportunities` coerentes e grava `owner_events` (já existe da Sprint 11 W2).
- Reaproveitar o painel de CRM do chat: mostrar etapa, valor, próximo contato, campos-chave do cartão (`cardModel.ts`) em vez de criar visão nova.

### Onda 3 — Qualidade da ingestão do chat  → fecha **#9** (3 sintomas)
Começa **com dados, não com código** (uma query por sintoma na produção Solo, só leitura):
1. *Conversa fatiada:* medir conversas do mesmo lead com `created_at` a < N min e mensagens sem resposta entre elas. Hipótese: corrida entre dois webhooks (`solo-wpp-webhook` + `gpt-maker-webhook`) sem `unique`/upsert por (lead, canal, janela aberta). Correção: `get_or_create_conversation` atômico (advisory lock por lead+canal).
2. *Nome errado:* o `pushName` do WhatsApp é o nome que **o próprio contato** escolheu e sobrescreve edição manual. Correção: `leads.name_locked` (ou `name_source='manual'`) — edição manual nunca é sobrescrita; `pushName` só preenche nome vazio/técnico.
3. *Não-lead vira lead:* filtro de entrada em um só lugar (`_shared/inbound-filter.ts`): notificação de sistema, mensagens de protocolo, números de serviço, conversa paralela do mesmo telefone (normalizar via `_shared/phone.ts`, regra já estabelecida). Não-lead cria conversa mas **não** cria negócio no pipeline.
- Entregável: relatório curto "quantos casos de cada tipo nos últimos 30 dias" antes de codar, para validar a hipótese.

### Onda 4 — Dashboard e relatório  → fecha **#13, #14, #15**
- **#14:** `DashboardFilterBar` ganha preset "Personalizado" (`Calendar mode=range`); os RPCs já aceitam `from/to`, então é só UI + `useUrlFilters`.
- **#13:** RPC `get_touchpoints_by_seller(from,to,pipelines,channels)` agrupando por `responsible_id` (+ total geral) a partir de `touchpoints`; novo widget no catálogo (`widgetCatalog.ts`) e coluna em `TeamPage`.
- **#15 (por pipeline):** o agendamento de relatório ganha `pipeline_id` — cada pipeline recebe o seu (o RPC do snapshot já aceita `p_pipeline_ids`). Relatório **com template fixo**: o `ReportSnapshot` passa a ter sempre as mesmas seções, na mesma ordem, com `0` quando não há dado ("0 touchpoints", "Meta: 0 / gap: X"). O cliente escolhe *recortes* (canal, vendedor), não *quais seções existem*. Adicionar: track da meta, gap da meta diária, destaques do dia, touchpoints e o placar dos 5 marcos do funil (Onda 7). **Meta diária:** hoje não existe; passa a viver em `pipelines.revenue_config.daily_targets` por marco (touchpoints, reuniões agendadas/realizadas, propostas, fechamentos). Se vazio, deriva de `goalDeals`/`goalRevenue` ÷ dias úteis do período — o gestor sobrescreve onde quiser. Mudança concentrada em `_shared/report-render.ts` + o RPC do snapshot; `reports-cron` e o dispatcher ficam intocados.

### Onda 5 — Automação orientada a evento (webhook ↔ ação)  → fecha **#3, #5**, prepara #6/#10/#17
Uma só ideia: **evento → (ação)**, onde ação ∈ {chamar URL (hoje), mover etapa, atualizar campo, atribuir responsável}.
- Tabela `crm_automations(equipe_id, trigger {event, stage_id|button_id|webhook_id}, action {type, params}, enabled)`; executor `run_automation()` em SQL chamando as mesmas RPCs da Onda 1/2 (`crm_move_opportunity`, `crm_set_responsible`, atualização de `custom_data[field_id]` — contrato dos campos personalizados).
- Entrada: `crm-webhook` passa a aceitar `action` declarado na configuração do webhook (mover para fase X, atualizar campo Y a partir do payload via o mapeamento já existente).
- #3 visibilidade: `Webhooks.tsx` lista também webhooks ligados a etapas/botões (convenção `stage_entered:<id>`), mostra a origem ("Etapa X → ao entrar") e exibe o **payload de exemplo** do evento (gerado de `_crm_deal_won_payload`) para o mapeamento de campos.
- Logs: `webhook_logs` com filtro por status/evento/data, payload enviado/recebido colapsável, botão "reenviar". Mesma tela mostra execuções de automação (`automation_runs`).
- Remover o stub `process-automations` ou fazê-lo ler de `crm_automations` (decidir na execução; sem tocar o que Solo usa hoje).

### Onda 6 — Formulários de ingestão  → fecha **#6**
- Generalizar `public-form`: novo tipo `intake` (hoje só "contrato"). Definição do formulário (campos do lead + campos personalizados, pipeline/etapa de destino, responsável ou roleta) em `crm_forms`; link público `/f/:slug`.
- Submissão → RPC única `crm_intake_submit(form, values)` que cria lead (dedupe via `useLeadDuplicateCheck`, regra já existente), negócio na etapa configurada e `origem` = formulário. Ex.: **Formulário de Indicação** (campo "indicado por" mapeia para `lead_attribution`).
- Reaproveita validação server-side, token e o padrão `parsePublicFormRequest`. Sem CAPTCHA no MVP, mas rate-limit por IP/slug.

### Onda 7 — Marcos do funil e Roleta  → fecha **#10, #17**
**#10 — contabilizar reunião agendada, reunião realizada, no-show, proposta enviada e fechamento, por data.** Nada de tabela nova: o motor é `funnel_events` (cada marco com `occurred_at`), e o dashboard já lê dele. Falta:
1. **Corrigir o mapeamento da Solo** (um UPDATE de dados, conferido etapa por etapa com o gestor antes de aplicar): Qualificação→`qualified`; Envio/Negociação de Proposta→`proposal_sent`; Agendamento de Reunião→`meeting_scheduled`; Reunião de Apresentação / Visita Técnica→`meeting_done` ao concluir; `no_show` por registro manual.
2. **Registro manual de desfecho** (realizada, no-show, visita técnica) no evento da agenda e no card do negócio, chamando o `record_funnel_event` existente. `agenda_events.outcome` é só atalho de UI; a verdade contábil fica em `funnel_events`.
3. **Widget "Marcos do funil"**: contagem por marco × dia/semana/mês, por vendedor e por pipeline, com o seletor de datas da Onda 4; entra no relatório diário.
4. Histórico: não há `no_show` no passado; o widget mostra "série começa em <data>" em vez de zero enganoso.

**#17 — Roleta, regra por pipeline.** `pipeline_distribution(pipeline_id, mode, rules jsonb, active)`:
- `mode`: `round_robin` | `weighted` (peso por vendedor) | `by_rule` (o gestor define: *se origem/fonte/campo X = valor → este grupo de vendedores*, avaliadas em ordem, com `default`).
- Tela em **Configurações do pipeline → Distribuição**: lista de regras, limite de negócios abertos por vendedor, "pular ausentes".
- Aplicada **na criação do negócio** num único ponto (`crm_assign_next(opp)` no trigger de INSERT), valendo para webhook, formulário, chat e importação. Grava `owner_events` com o motivo ("regra 2: origem=Indicação"). Depende da Onda 2 (`crm_set_responsible`).

### Onda 8 — Mobile  → fecha **#1, #7**
Auditoria guiada (Chrome, viewport 390 px) nas rotas CRM/Kanban, Chat, Dashboard, Webhooks. Lista fechada de defeitos (scroll horizontal da trilha de etapas, janelas que estouram viewport, tabelas sem `overflow-x`), corrigida em lote com utilitário de layout (`useIsMobile` já existe). Só começa depois de definir os "erros de visibilidade" exatos com o cliente — pedir 3–5 prints.

### Onda 9 — Catálogo de modelos IA  → fecha **#2**
O provedor (GPT Maker) expõe a lista; `MODEL_CATALOG` (`manage-agent-settings/index.ts:15`) passa a ser só a **tabela de preço/rótulo**, não a lista de modelos.
- `action=models` busca a lista no provedor, cruza com o catálogo local e **cacheia** em `ai_model_catalog` (TTL 6 h) — atualização interna, sem ação do cliente.
- Botão **"Atualizar lista"** no `ModelSelector` força o refresh.
- Modelo listado pelo provedor e **sem preço nosso**: aparece como "novo" com preço provisório (o maior crédito do mesmo fornecedor) — nunca crédito 0 — e gera alerta no painel admin para precificar.
- Modelo que sumiu do provedor: segue visível se algum agente o usa, com aviso.
- Falha do provedor → serve o último cache. Sonda inicial: confirmar endpoint e formato dos ids (o arquivo registra grafias irregulares, ex. `OPEN_AI_04`).

### Sprint própria — Reuniões e ferramentas Google  → **#4**, fora desta sprint
Google Agenda **integrado de verdade** (OAuth, dois sentidos) vira sprint dedicada junto da visão maior: **agenda, ligações, reunião com gravação, armazenamento das gravações e análise por IA**. Desenho de partida para não se perder:
- Núcleo `meetings` (evento + participantes + gravação + transcrição + análise) com provedores plugáveis (Google Meet/Agenda primeiro) — o mesmo "um só caminho" de billing e envio.
- Gravações em Supabase Storage por equipe (RLS + cota por plano); transcrição e análise por IA cobradas da **carteira do Copiloto** (Sprint 8 já tem as duas carteiras).
- Dependências com prazo: verificação do app Google (escopos sensíveis) e consentimento de gravação (LGPD).
- Resposta ao ticket #4: "entra em sprint dedicada; hoje a agenda é interna". Nem o feed `.ics` entra aqui, para não criar meia-solução a migrar depois.

---

## 3. Ordem recomendada e esforço

| Ordem | Onda | Tickets | Esforço | Risco |
|---|---|---|---|---|
| 0 | Merge STAGEHOOK | (#3 back) | XS | baixo |
| 1 | Motor de etapa | 12 | S | baixo |
| 1B | Instagram: janela | 16 | S | médio (sonda no provedor) |
| 2 | Responsável/chat | 8, 11 | S–M | baixo |
| 3 | Ingestão do chat | 9 | M | **médio** (investigação) |
| 4 | Dashboard/relatório | 13, 14, 15 | M | baixo |
| 5 | Evento→ação | 3, 5 | M–L | médio |
| 6 | Formulários | 6 | M | baixo |
| 7 | Marcos do funil + Roleta | 10, 17 | M–L | médio |
| 8 | Mobile | 1, 7 | M | baixo (depende de prints) |
| 9 | Modelos IA | 2 | S | baixo |
| — | Google Agenda / reuniões | 4 | **sprint própria** | alto |

Ondas 1, 1B, 2, 4, 9 são independentes e podem ir em paralelo. 5→6→7 têm dependência (5 expõe as ações que 6 e 7 usam).

## 4. Decisões tomadas (Mateus, 15/10)

| # | Decisão |
|---|---|
| 16 | Instagram **continua aberto** como canal; a janela é regra da Meta e não some. Corrige-se a tela e libera-se o envio humano até onde a Meta permite (Onda 1B). |
| 4 | Google Agenda real **fica para sprint própria** (reuniões com gravação, armazenamento, análise por IA, ligações, ferramentas Google). |
| 17 | Roleta **por pipeline**; o gestor define o formato (X por vendedor, por fonte, etc.). |
| 15 | Meta e relatório **por pipeline**. |
| 10 | Melhor forma: `funnel_events` (já com data) como contabilidade dos 5 marcos, mapeamento da Solo corrigido, registro manual. |
| 2 | Fetch no provedor GPT Maker + botão + refresh interno. |

**Pendências que viram ação, não pergunta:** validar com o gestor da Solo o mapeamento etapa→marco antes do UPDATE (Onda 7); sonda viva do envio Instagram fora da janela (Onda 1B); confirmar endpoint da lista de modelos (Onda 9); pedir 3–5 prints do mobile (Onda 8).

## 5. Como executar (cada onda)

1. Branch `task/SE-SUP1-<onda>` a partir de `main` (não da branch STAGEHOOK).
2. Plano de tarefas detalhado da onda (TDD, passos de 2–5 min) com `superpowers:writing-plans` imediatamente antes de codar — esta visão geral não o substitui.
3. Migrations: aplicar com `supabase db query` (nunca `db push --include-all`; memória do histórico de migrations), todo objeto novo em `public` com RLS na mesma transação, todo `%s` de função com cast de tipo.
4. Deploy manual (sem CI); a cada onda, resposta ao ticket no painel (`support_tickets`) com o que mudou e fechamento.
5. Verificação antes de fechar: teste automatizado + conferência no banco (ex.: Onda 1 → `select count(*) … stage_type='lost' and lost_reason is null` = 0 para novos).
