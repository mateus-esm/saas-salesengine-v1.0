# Sprint 15 (parte 2) — Barra que se recolhe, Reciclo com regra e Follow-up agendado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) a navegação para de poluir a tela: a barra some, os grupos se recolhem, e o CRM navega entre as próprias seções sem a barra; (2) o negócio passa a disparar eventos de outreach do próprio Rev — mensagem agendada, follow-up, aviso ao responsável — sem depender de n8n; (3) mover para uma etapa de Reciclo abre um diálogo (como o de Perdido) com motivo e a regra da volta, cujo padrão vem da configuração do pipeline e pode ser ajustado por negócio.

**Architecture:** Um objeto novo, o **follow-up** (`crm_followups`): "nesta data e hora, para este negócio, com este responsável: avisar o responsável, mandar esta mensagem ao cliente por este canal, e/ou devolver o negócio a esta etapa". O envio usa o motor de outreach que já existe (`outreach_jobs` + `outreach-worker`: janela de envio, limite por linha, opt-out, telefone normalizado), que ganha um segundo tipo de job — o job de follow-up, com texto próprio e sem sequência. O aviso e a volta de etapa rodam numa função agendada (`crm_run_followups`, pg_cron a cada 5 min). O diálogo do Reciclo e o botão "Agendar follow-up" usam o mesmo formulário (`FollowupForm`). É a primeira primitiva de `Planning/Architecture/automacao_primitivas_v1.md` (gatilho de tempo → ações `notify` / `send_whatsapp` / `move_stage`), entregue estreita e reaproveitável.

**Tech Stack:** React 18 + Tailwind/shadcn, TanStack Query, Vitest; Supabase Postgres (RPCs `security definer`, pg_cron), edge function Deno `outreach-worker`.

**Spec:** pedido do founder em 13/11 (3 pontos), transcrito em "Requisitos" abaixo.

## Requisitos (do founder, 13/11)

1. Barra lateral com *disclosure*: dá para esconder a barra e recolher os subitens; dentro do CRM, navegar entre as seções sem a barra.
2. Ligação CRM ↔ Outreach: ligar um objeto a eventos de outreach — mandar mensagem, e-mail, follow-up, notificação.
3. Mover para Reciclo abre uma barra como Perdido/Desqualificado: motivo + regras. Regra padrão na configuração do pipeline, regra específica por negócio: vai voltar? quem é o responsável? dia do contato? o responsável é notificado? manda outreach ao cliente? volta para alguma etapa ou fica no Reciclo, e qual? No dia, o responsável recebe o aviso e o cliente recebe a mensagem predefinida (e-mail quando houver Resend). Também "Agendar follow-up": escolher o canal (linha da Solo API), a mensagem, o dia e a hora.

## Global Constraints

- Texto de tela em pt-BR com acentos. Cores só por token (nada de hex).
- Mensagem ao cliente sai **só** pelo motor de outreach (`outreach_jobs` → `outreach-worker`); nunca um caminho novo de envio. Telefone sempre por `_shared/phone.ts` (já é o que o motor faz).
- E-mail aparece como canal **desabilitado** "E-mail — em breve" (Resend fica para depois). Nada de envio de e-mail nesta entrega.
- Nenhum agente/cliente escreve tabela direto: o front chama RPCs (`crm_schedule_followup`, `crm_cancel_followup`); RLS de leitura por equipe.
- Mover etapa continua passando por `crm_move_opportunity` (verbo único) — inclusive a volta automática.
- Migrations idempotentes; aplicadas por `supabase/scripts/run_sql.py --commit` + linha em `supabase_migrations.schema_migrations` (sem `db push`).
- Funciona em 1440×900 e 390×844, claro e escuro; quatro estados nas listas.

## Review Focus

1. **Negócio que sai do Reciclo antes da data** (movido à mão para outra etapa): o follow-up de volta não pode arrastá-lo de volta — a volta só acontece se o negócio ainda estiver na etapa de Reciclo em que entrou. A mensagem e o aviso continuam (a pessoa pediu o contato), salvo cancelamento. *Teste: T1 `return skipped when deal left the stage`.*
2. **Dois movimentos automáticos para o mesmo negócio**: o agendador antigo (`crm_run_timers`, reciclo por `cycle_days`) e o follow-up com volta. Negócio com follow-up de Reciclo agendado é ignorado pelo agendador antigo. *Teste: T1 `timers skip deals with a scheduled recycle followup`.*
3. **Fuso**: data/hora escolhida em America/Sao_Paulo vira `timestamptz` certo; 09:00 no formulário = 09:00 no Brasil. *Teste: T3 `dueAtFromLocal`.*
4. **Equipe sem linha Solo configurada**: o formulário mostra que não há canal e não deixa marcar "enviar mensagem"; o RPC recusa `send_message` sem linha (`no_outreach_line`). *Teste: T1 + T3.*
5. **Cancelar**: cancelar o follow-up cancela o job de envio na fila (`outreach_jobs.status = 'cancelled'`) e nada sai depois. *Teste: T1 `cancel cancels the queued job`.*

---

### Task 1: Banco — follow-up, job de follow-up, agendador e padrões do Reciclo

**Files:**
- Create: `supabase/migrations/20261113000100_sprint15b_followups.sql`
- Create: `supabase/tests/sprint15b_followups.test.sql` (padrão de `supabase/tests/sprint15_artifact_generated_status.test.sql`: `-- @include` da migration, begin…rollback, `select 'PASS'`)

**Interfaces — Produces:**
- Tabela `public.crm_followups`: `id uuid pk`, `equipe_id uuid not null`, `opportunity_id uuid not null references opportunities on delete cascade`, `lead_id uuid not null`, `kind text check in ('recycle','manual')`, `reason text`, `owner_id uuid` (responsável; null = dono do negócio), `due_at timestamptz not null`, `notify_owner boolean not null default true`, `send_message boolean not null default false`, `channel text not null default 'whatsapp' check in ('whatsapp','email')`, `message_text text`, `from_stage_id uuid` (etapa em que estava ao agendar), `return_stage_id uuid` (null = não move), `status text not null default 'scheduled' check in ('scheduled','done','cancelled','failed')`, `outreach_job_id uuid`, `result jsonb not null default '{}'`, `created_by uuid`, `created_at`, `executed_at`. RLS: select para membros da equipe; sem insert/update/delete direto (só RPC). Índices: `(status, due_at) where status='scheduled'`, `(opportunity_id, status)`.
- `pipeline_stages_v2` ganha (para etapas `ciclo`): `recycle_notify_owner boolean not null default true`, `recycle_send_message boolean not null default false`, `recycle_message_template text`. Os padrões de dia e etapa de volta são os que já existem: `cycle_days`, `cycle_target_stage_id`.
- `pipelines` ganha `recycle_reasons jsonb not null default '[]'` (lista de textos, como `loss_reasons`).
- `outreach_jobs`: `enrollment_id` e `step_position` passam a aceitar null; novas colunas `followup_id uuid references crm_followups on delete cascade`, `message_text text`; check `outreach_jobs_kind_shape`: `(enrollment_id is not null and followup_id is null) or (enrollment_id is null and followup_id is not null and message_text is not null)`; unique parcial `(followup_id) where followup_id is not null`.
- `crm_schedule_followup(p_opportunity_id uuid, p_due_at timestamptz, p_kind text default 'manual', p_owner_id uuid default null, p_reason text default null, p_notify_owner boolean default true, p_send_message boolean default false, p_message_text text default null, p_return_stage_id uuid default null) returns jsonb` (`security definer`, `search_path = public`): confere que o chamador é membro da equipe do negócio; `p_due_at` no futuro (tolerância 1 min) senão `invalid_due_at`; `p_send_message` exige texto não vazio (`message_required`) e linha de outreach configurada na equipe (`conversation_opener_settings` com `solo_instance_id` ou `channel_id`; senão `no_outreach_line`); `p_return_stage_id` precisa ser do mesmo pipeline (`invalid_return_stage`); grava `from_stage_id` = etapa atual; se `p_send_message`, cria o `outreach_jobs` (`followup_id`, `message_text`, `lead_id`, `run_after = p_due_at`, `status 'queued'`) e guarda `outreach_job_id`. Um follow-up `recycle` novo cancela o `recycle` agendado anterior do mesmo negócio. Retorna o follow-up como json.
- `crm_cancel_followup(p_followup_id uuid) returns jsonb`: membro da equipe; `scheduled` → `cancelled`; job `queued` ligado → `cancelled`. Idempotente.
- `crm_run_followups(p_limit integer default 200) returns jsonb` (service; agendado no pg_cron a cada 5 min pela própria migration, `cron.schedule('crm-run-followups', '*/5 * * * *', 'select public.crm_run_followups()')`, idempotente via unschedule-if-exists): para cada `scheduled` com `due_at <= now()` (lock `for update skip locked`): se `notify_owner`, insere `notifications` (`user_id` = `owner_id` ou dono do negócio, `type 'crm_followup_due'`, título "Follow-up: <nome do lead>", corpo = motivo/mensagem, `action_url '/crm?tab=pipeline&opp=<id>'`, `dedup_key 'followup:<id>'`); se `return_stage_id` e o negócio **ainda está** em `from_stage_id`, move por `crm_move_opportunity` com `crm.actor_type='automation'`; senão registra `result.return='skipped_left_stage'`; marca `done`, `executed_at`. Erro em um não para o lote (marca `failed` com `result.error`).
- `crm_run_timers`: o reciclo por `cycle_days` ignora negócios com `crm_followups` `kind='recycle' and status='scheduled'`. (Recriar a função inteira a partir de `20260912000700_sprint11_w3_timers.sql` mudando só esse filtro — ou a versão mais recente dela, se outra migration a redefiniu: procure.)

- [ ] **Step 1: SQL test** com fixtures (equipe, pipeline com etapas open/ciclo/open2, lead, negócio, membro, `conversation_opener_settings` com `solo_instance_id`), cobrindo: agenda manual com mensagem cria job `queued` com `run_after = due_at`; `no_outreach_line` sem linha; `message_required`; `invalid_due_at`; `invalid_return_stage`; cancelar cancela o job; recycle novo cancela o anterior; `crm_run_followups` cria a notificação e move para `return_stage_id`; `return skipped when deal left the stage`; `timers skip deals with a scheduled recycle followup` (`crm_run_timers(p_dry_run => true, p_equipe_id => …)` não lista o negócio); o check de forma do `outreach_jobs` recusa job sem enrollment e sem followup.
- [ ] **Step 2: migration**. Não rode o teste contra o banco (o controlador roda com o OK do founder já dado). Confira sintaxe lendo as migrations vizinhas; `pgcrypto`/`gen_random_uuid` ok; `security definer` com `set search_path = public`.
- [ ] **Step 3: commit** `feat(sprint15b/T1): follow-up agendado no banco — fila de envio, aviso e volta do Reciclo`

### Task 2: Worker — job de follow-up no motor de outreach

**Files:** Modify `supabase/functions/outreach-worker/index.ts` e o motor em `supabase/functions/_shared/outreach/` (onde `loadContext`/render/persist vivem); testes Deno ao lado dos que já existem nessa pasta.

**Interfaces — Consumes:** T1 `outreach_jobs.followup_id`, `outreach_jobs.message_text`, `enrollment_id`/`step_position` nulos.
**Produces:** job com `followup_id` é enviado com `message_text` renderizado pelas mesmas variáveis do template de sequência (`{{nome}}` etc. — use o renderizador existente), mesma janela/limite/opt-out/telefone; sem cancelar inscrição; `persistDeliveredMessage` aceita `sequenceId`/`enrollmentId`/`stepPosition` nulos e grava a mensagem na conversa como hoje; ao terminar (`crm_outreach_finish`), o follow-up recebe `result.message = 'sent' | 'failed' | 'skipped'` (via o próprio `crm_outreach_finish` estendido em T1, ou um update no worker por RPC — escolha o que o T1 expôs; se precisar, adicione em T1 um `_followup_mark_message(p_job_id, p_status)` chamado dentro de `crm_outreach_finish`).

- [ ] **Step 1:** testes Deno do motor: job de follow-up renderiza `message_text`, respeita janela e opt-out, não chama `cancelEnrollment`; job de sequência continua igual.
- [ ] **Step 2:** implementar; `deno test` da pasta verde; `deno check` no worker.
- [ ] **Step 3: commit** `feat(sprint15b/T2): outreach-worker envia follow-up agendado`

### Task 3: Front — formulário de follow-up, "Agendar follow-up" no negócio e lista

**Files:** Create `src/lib/followups.ts` (+ `src/lib/__tests__/followups.test.ts`), `src/hooks/useFollowups.ts`, `src/components/crm/followups/FollowupForm.tsx`, `FollowupDialog.tsx`, `FollowupList.tsx` (+ testes em `__tests__`); Modify `src/components/crm/OpportunityDetailModal.tsx` (botão "Agendar follow-up" + seção "Follow-ups" com a lista e cancelar), `src/components/crm/OpportunityCard.tsx` (ação "Agendar follow-up" na fileira de ações).

**Interfaces — Produces:**
- `dueAtFromLocal(date: string /*yyyy-MM-dd*/, time: string /*HH:mm*/, tz = "America/Sao_Paulo"): string /*ISO*/` e `defaultDue(daysAhead: number, now?: Date): { date: string; time: "09:00" }`.
- `FollowupFormValue = { date; time; ownerId: string | null; reason: string; notifyOwner: boolean; sendMessage: boolean; channel: "whatsapp" | "email"; messageText: string; returnStageId: string | null; willReturn?: boolean }`.
- `<FollowupForm value onChange mode="manual" | "recycle" stages? reasons? hasLine: boolean members />` — campos: Data e hora; Responsável (`UserPicker` existente, padrão = dono do negócio); Avisar o responsável (switch); Enviar mensagem ao cliente (switch, desabilitado com explicação quando `hasLine=false`); Canal (WhatsApp — "<nome da linha Solo>"; E-mail — em breve, desabilitado); Mensagem (textarea, mostra as variáveis aceitas); no modo `recycle` também: Motivo (lista `recycle_reasons` + "Outro"), "Vai voltar?" (sim/não — não = sem data de volta: só registra o motivo, sem aviso/mensagem), "Quando chegar a data": Manter no Reciclo | Voltar para a etapa [select].
- `useFollowups(opportunityId)`, `useScheduleFollowup()`, `useCancelFollowup()` (RPCs do T1; invalida a lista; toasts pt-BR com o código de erro traduzido: `no_outreach_line` → "Configure uma linha de WhatsApp em Outreach para enviar mensagens.", `invalid_due_at` → "Escolha uma data futura.", `message_required` → "Escreva a mensagem.").
- `useOutreachLine()`: lê `conversation_opener_settings` da equipe e devolve `{ hasLine, label }` (nome da instância Solo se houver).

- [ ] TDD dos puros (`dueAtFromLocal` com 09:00 → `12:00Z` em BRT; `defaultDue`), do formulário (sem linha → switch desabilitado; e-mail desabilitado; modo recycle mostra motivo/volta) e da lista (agendado mostra cancelar; feito mostra resultado). Commit `feat(sprint15b/T3): agendar follow-up no negócio`.

### Task 4: Reciclo com motivo e regra (diálogo + padrões no pipeline)

**Files:** Create `src/components/crm/RecycleDialog.tsx` (+ teste); Modify `src/hooks/useMoveToStage.tsx` e `src/lib/board.ts` (`planStageMove` devolve `"ask-recycle"` quando a etapa alvo é `ciclo`), `src/components/crm/pipeline-settings/StagesEditor.tsx` (na etapa Ciclo: "Avisar o responsável", "Enviar mensagem ao cliente" + modelo de mensagem, além de `cycle_days` e etapa de volta que já existem), editor dos motivos do Reciclo ao lado do editor de motivos de perda (procure onde `loss_reasons` é editado), `src/hooks/usePipelineStagesV2.ts`/tipos para as colunas novas.

**Interfaces:** Consumes T3 `FollowupForm`, `useScheduleFollowup`, `defaultDue`. `MoveRequest.run(lostReason)` não muda; para Reciclo, o hook chama `run(null)` e, **depois** que o movimento resolver, `crm_schedule_followup` com `kind:'recycle'` e o formulário. Padrões do formulário vêm da etapa alvo: `cycle_days` → data (`defaultDue(cycle_days || 7)`), `cycle_target_stage_id` → "Voltar para", `recycle_notify_owner`, `recycle_send_message`, `recycle_message_template`. Cancelar o diálogo = nada move (como Perdido). Movimento em lote para Reciclo: um follow-up por negócio com os mesmos valores. "Vai voltar? Não" → move e grava só o motivo (follow-up `recycle` com `notify_owner=false, send_message=false, return_stage_id=null`, `due_at` = agora + 1 min) para o motivo ficar registrado.

- [ ] TDD: `planStageMove` → `ask-recycle`; diálogo mostra os padrões da etapa; confirmar chama `run` e depois agenda; cancelar não move. Commit `feat(sprint15b/T4): Reciclo pergunta motivo e regra da volta`.

### Task 5: Barra lateral que se recolhe e CRM com navegação própria

**Files:** Modify `src/components/shell/AppShellSidebar.tsx`, `src/components/shell/AppHeader.tsx`, `src/components/AuthenticatedLayout.tsx`, `src/pages/CRM.tsx`; Create `src/components/crm/CrmSectionNav.tsx` (+ testes).

**Interfaces / regras:**
- O botão do cabeçalho (`SidebarTrigger`) **esconde e mostra** a barra inteira (modo `offcanvas`); um botão no rodapé da barra alterna "modo ícones" (`icon`). Os dois estados persistem (cookie do shadcn para aberto/fechado; `localStorage` `rev.sidebar.mode` = `icon|offcanvas`, com try/catch). Atalho Ctrl/Cmd+B continua.
- Cada grupo (CRM, Automação, Conta, Em breve) tem cabeçalho clicável que recolhe/expande os itens (`Collapsible`), estado por grupo em `localStorage` `rev.sidebar.groups`; o grupo com o item ativo abre sozinho. Subitens de "Tabelas" seguem recolhíveis.
- `CrmSectionNav`: barra horizontal no topo do CRM (rolável no celular), com as seções de `TOP_TABS`/`TAB_LABELS`/`TAB_ICONS` como links (`/crm?tab=…`, `aria-current`), e "Tabelas" como menu com as tabelas personalizadas (`/crm?tab=tabelas&custom_table=<slug>`). Substitui o `<h1>` `sm:sr-only` do CRM (o título vira a seção ativa na própria barra). Funciona com a barra lateral escondida.
- [ ] TDD: trigger alterna offcanvas; grupo recolhe e lembra; `CrmSectionNav` marca a seção ativa e lista as tabelas. Commit `feat(sprint15b/T5): barra lateral recolhível e navegação própria do CRM`.

---

## Rulings (controlador, 13/11 — o founder pediu "planeje e execute tudo de uma vez")

- Follow-up é a primeira primitiva do motor de automações (tempo → avisar / enviar / mover), entregue sem o construtor genérico; a Sprint 18 o absorve como tipo de automação.
- A volta automática só move se o negócio ainda está na etapa em que foi agendado; aviso e mensagem saem mesmo assim.
- O reciclo antigo por `cycle_days` continua para quem não tem follow-up (compatível), e os campos dele viram o padrão do diálogo.
- E-mail: só aparece como "em breve".
- T5 roda em paralelo com T1–T4 em outro worktree (arquivos disjuntos), mesclado no fim.
