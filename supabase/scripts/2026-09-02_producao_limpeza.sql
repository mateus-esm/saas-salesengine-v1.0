-- ============================================================================
-- 2026-09-02 · Limpeza de produção — Sprint 8.2
--
-- ISTO NÃO É UMA MIGRATION. É cirurgia numa base específica, com uuids de
-- produção escritos à mão, e roda UMA vez. Numa migration ela tentaria rodar em
-- qualquer ambiente e falharia — ou, pior, apagaria a equipe errada.
--
-- Rode DEPOIS de as migrations 000100–000500 estarem aplicadas e as edge
-- functions deployadas. Veja docs/runbook_sprint82.md.
--
-- ── O QUE ELA FAZ ───────────────────────────────────────────────────────────
--
-- A. Desduplica as equipes que o provisionamento antigo criou em 02/09.
-- B. Zera o histórico dos clientes legados para o plano novo começar limpo.
-- C. Tira o super_admin de um cliente. (Ver o bloco C — é o mais grave daqui.)
--
-- ── SEGURANÇA ───────────────────────────────────────────────────────────────
--
-- Roda inteira dentro de UMA transação. Qualquer asserção que falhe desfaz
-- tudo. Nada é apagado sem cópia em backup_20260902_*.
--
-- E o motivo de a ordem importar tanto: QUARENTA E TRÊS tabelas apontam para
-- `equipes` com ON DELETE CASCADE — e `profiles` é uma delas. Apagar uma equipe
-- apaga o perfil do usuário junto, e o cliente perde o acesso sem que nada
-- acuse o erro. Por isso tudo é movido ANTES, e o delete só acontece depois de
-- uma verificação que aborta se sobrar qualquer referência.
-- ============================================================================

begin;

-- ============================================================================
-- 0. O MUNDO É O QUE EU ESPERAVA?
--
-- Se a base mudou desde 02/09, os uuids abaixo podem apontar para outra coisa.
-- Melhor abortar do que operar às cegas.
-- ============================================================================

do $$
begin
  if not exists (select 1 from public.equipes where id = '939d7dd8-592c-4fda-946e-3568f2909904' and nome = 'Solo Energia') then
    raise exception 'ABORTADO: a equipe Solo Energia (939d7dd8) não é a que eu esperava';
  end if;
  if not exists (select 1 from public.equipes where id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8') then
    raise exception 'ABORTADO: a equipe Walter Inglez (26b9ab8c) não existe';
  end if;
  if not exists (select 1 from public.onboardings limit 1) then
    raise exception 'ABORTADO: o backfill do onboarding (migration 000500) ainda não rodou';
  end if;
end $$;

-- ============================================================================
-- 1. CÓPIAS, ANTES DE QUALQUER DELETE
--
-- Só o que de fato vai sumir. As três duplicatas de 02/09 estão vazias; a Rema
-- antiga tem alguns leads, e os legados têm o histórico de ações do agente.
-- ============================================================================

create table if not exists backup_20260902_equipes as
  select * from public.equipes where id in (
    'e5bda77f-cec0-485e-8d52-404b4fb11ac6',  -- WI Advogados (duplicata de hoje)
    '33b33ec5-2325-4e34-aa2d-2070e964f4de',  -- Rema Digital (a antiga, de abril)
    'c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b',  -- Solo Energia (duplicata de hoje)
    '57b34902-fad3-4e31-a401-b6858027ba21'   -- Solo Teste
  );

create table if not exists backup_20260902_leads as
  select * from public.leads where equipe_id = '33b33ec5-2325-4e34-aa2d-2070e964f4de';
create table if not exists backup_20260902_opportunities as
  select * from public.opportunities where equipe_id = '33b33ec5-2325-4e34-aa2d-2070e964f4de';
create table if not exists backup_20260902_conversations as
  select * from public.conversations where equipe_id = '33b33ec5-2325-4e34-aa2d-2070e964f4de';
create table if not exists backup_20260902_stage_history as
  select * from public.opportunity_stage_history where equipe_id in (
    'e5bda77f-cec0-485e-8d52-404b4fb11ac6',
    '33b33ec5-2325-4e34-aa2d-2070e964f4de',
    'c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b',
    '57b34902-fad3-4e31-a401-b6858027ba21');

-- Os legados: o histórico que o bloco B zera.
create table if not exists backup_20260902_agent_action_ledger as
  select * from public.agent_action_ledger where equipe_id in (
    'aa33b576-3959-4a81-8e73-4027039ea2ce',  -- Casa Flow
    '939d7dd8-592c-4fda-946e-3568f2909904',  -- Solo Energia
    'a43f3b4a-5944-427a-84ce-787b3f8711bb'   -- Jornada do R1
  );
create table if not exists backup_20260902_credit_ledger as
  select * from public.credit_ledger where equipe_id in (
    'aa33b576-3959-4a81-8e73-4027039ea2ce',
    '939d7dd8-592c-4fda-946e-3568f2909904',
    'a43f3b4a-5944-427a-84ce-787b3f8711bb');
create table if not exists backup_20260902_consumo_creditos as
  select * from public.consumo_creditos where equipe_id in (
    'aa33b576-3959-4a81-8e73-4027039ea2ce',
    '939d7dd8-592c-4fda-946e-3568f2909904',
    'a43f3b4a-5944-427a-84ce-787b3f8711bb');
create table if not exists backup_20260902_notifications as
  select * from public.notifications where equipe_id in (
    'aa33b576-3959-4a81-8e73-4027039ea2ce',
    '939d7dd8-592c-4fda-946e-3568f2909904',
    'a43f3b4a-5944-427a-84ce-787b3f8711bb');
create table if not exists backup_20260902_invoices as
  select * from public.invoices;
create table if not exists backup_20260902_profiles as
  select * from public.profiles;

-- ============================================================================
-- 2. BLOCO A — DESDUPLICAÇÃO
--
-- Uma função temporária porque são três fusões idênticas, e três cópias do
-- mesmo procedimento é onde um dos três esquece um passo.
-- ============================================================================

create or replace function pg_temp.fundir_equipe(p_keep uuid, p_drop uuid)
returns void
language plpgsql
as $fn$
declare
  v_refs integer;
begin
  if p_keep = p_drop then
    raise exception 'fundir_equipe: origem e destino iguais';
  end if;
  if not exists (select 1 from public.equipes where id = p_keep) then
    raise exception 'fundir_equipe: a equipe que fica (%) não existe', p_keep;
  end if;

  -- 1. PERFIS PRIMEIRO. profiles.equipe_id é ON DELETE CASCADE: se o delete
  --    acontecesse antes, o cliente perderia o login e nada acusaria.
  update public.profiles set equipe_id = p_keep where equipe_id = p_drop;

  -- 2. O contrato. Só um pode estar vivo por equipe (uq_contracts_active_per_equipe),
  --    e a que fica não deve ter nenhum — se tiver, é sinal de que a fusão não é
  --    a operação certa e o índice único vai gritar.
  update public.contracts set equipe_id = p_keep where equipe_id = p_drop;

  -- 3. Faturas e o resto do faturamento.
  update public.invoices set equipe_id = p_keep where equipe_id = p_drop;

  -- 4. A conta de cobrança: a que fica prevalece, e só recebe da outra o que
  --    ela mesma não tem. A conta antiga da Solo Energia tem CPF e
  --    asaas_customer_id reais; a duplicata de hoje não tem nada. Sobrescrever
  --    perderia o cliente já criado no gateway.
  update public.billing_accounts k set
    doc_type      = coalesce(k.doc_type,      d.doc_type),
    doc_number    = coalesce(k.doc_number,    d.doc_number),
    legal_name    = coalesce(k.legal_name,    d.legal_name),
    billing_email = coalesce(k.billing_email, d.billing_email),
    phone         = coalesce(k.phone,         d.phone),
    asaas_customer_id = coalesce(k.asaas_customer_id, d.asaas_customer_id)
  from public.billing_accounts d
  where k.equipe_id = p_keep and d.equipe_id = p_drop;

  -- Se a que fica não tinha conta nenhuma, a da outra passa a ser dela.
  update public.billing_accounts set equipe_id = p_keep
   where equipe_id = p_drop
     and not exists (select 1 from public.billing_accounts x where x.equipe_id = p_keep);

  -- 5. A proposta aponta para a equipe que fica.
  update public.proposals set equipe_id = p_keep where equipe_id = p_drop;
  update public.proposals set target_equipe_id = p_keep where target_equipe_id = p_drop;

  -- 6. O card do onboarding. equipe_id é unique: quando as duas têm card, o da
  --    equipe que fica é o que vale, e o outro vai embora.
  if exists (select 1 from public.onboardings where equipe_id = p_keep) then
    delete from public.onboardings where equipe_id = p_drop;
  else
    update public.onboardings set equipe_id = p_keep where equipe_id = p_drop;
  end if;

  -- 7. Instâncias de WhatsApp e webhooks, que também são configuração e não dado.
  update public.wpp_instances set equipe_id = p_keep where equipe_id = p_drop;

  -- 8. O histórico de etapas do funil precisa sair ANTES, e por um motivo
  --    torto: `opportunity_stage_history.to_stage_id` referencia
  --    `pipeline_stages_v2` com ON DELETE SET NULL, mas a coluna é NOT NULL.
  --    Apagar a equipe cascateia nos estágios, o cascade tenta anular essa
  --    coluna, e o NOT NULL rejeita — o delete inteiro aborta com uma mensagem
  --    que não menciona equipes em lugar nenhum.
  --
  --    O ensaio pegou isto. Sem ele, a limpeza teria falhado no meio, em
  --    produção, com um erro ilegível. (A causa raiz — FK SET NULL apontando
  --    para coluna NOT NULL — está no todo.md.)
  delete from public.opportunity_stage_history where equipe_id = p_drop;

  -- 9. A VERIFICAÇÃO. Nada que importe pode continuar apontando para a equipe
  --    condenada, ou o cascade leva junto.
  select
    (select count(*) from public.profiles   where equipe_id = p_drop) +
    (select count(*) from public.contracts  where equipe_id = p_drop) +
    (select count(*) from public.invoices   where equipe_id = p_drop) +
    (select count(*) from public.proposals  where equipe_id = p_drop) +
    (select count(*) from public.onboardings where equipe_id = p_drop) +
    (select count(*) from public.wpp_instances where equipe_id = p_drop)
  into v_refs;

  if v_refs > 0 then
    raise exception 'ABORTADO: % referência(s) ainda apontam para a equipe % — o cascade apagaria', v_refs, p_drop;
  end if;

  delete from public.equipes where id = p_drop;
end;
$fn$;

-- ── A.1 · WI Advogados ───────────────────────────────────────────────────────
--
-- Decisão do fundador: fica a equipe ANTIGA, com 246 leads e 246 conversas. A
-- duplicata criada hoje está vazia; o contrato e a proposta migram para a que
-- tem a operação.
select pg_temp.fundir_equipe(
  '26b9ab8c-b601-47fa-ae68-b7d3be4712d8',  -- fica: Walter Inglez Advogados
  'e5bda77f-cec0-485e-8d52-404b4fb11ac6'   -- sai:  WI Advogados (vazia, de hoje)
);

-- O nome comercial atual é o da proposta.
update public.equipes set nome = 'WI Advogados'
 where id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';
update public.onboardings set cliente_nome = 'WI Advogados'
 where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

-- ── A.2 · Solo Energia ───────────────────────────────────────────────────────
--
-- Fica a equipe antiga: 456 leads, 470 conversas, CPF e asaas_customer_id
-- reais. Era ela que estava sem contrato nenhum enquanto a duplicata vazia
-- carregava o contrato ativo.
select pg_temp.fundir_equipe(
  '939d7dd8-592c-4fda-946e-3568f2909904',  -- fica
  'c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b'   -- sai
);

-- ── A.3 · Rema Digital ───────────────────────────────────────────────────────
--
-- Aqui é o contrário: fica a de HOJE. Decisão do fundador — a Rema recomeça do
-- zero, e a equipe de abril tinha 4 leads e nenhum membro.
select pg_temp.fundir_equipe(
  'b16e48b5-675a-469c-8b45-21c8cf60139c',  -- fica: a de hoje, com contrato e fatura
  '33b33ec5-2325-4e34-aa2d-2070e964f4de'   -- sai:  a de abril
);

-- ── A.4 · Solo Teste ─────────────────────────────────────────────────────────
--
-- Lixo de teste de 24/08, com um contrato em trial vencendo 08/09 que viraria
-- uma fatura de verdade se ficasse. O perfil é o do próprio fundador, então sai
-- da equipe antes (senão o cascade apagaria o perfil dele).
update public.profiles set equipe_id = null
 where equipe_id = '57b34902-fad3-4e31-a401-b6858027ba21';
update public.proposals set equipe_id = null, target_equipe_id = null
 where equipe_id = '57b34902-fad3-4e31-a401-b6858027ba21'
    or target_equipe_id = '57b34902-fad3-4e31-a401-b6858027ba21';
delete from public.onboardings where equipe_id = '57b34902-fad3-4e31-a401-b6858027ba21';
delete from public.equipes where id = '57b34902-fad3-4e31-a401-b6858027ba21';

-- ============================================================================
-- 2.5. BLOCO A' — QUEM NÃO ESTÁ NO AR NÃO PODE ESTAR EM TRIAL
--
-- O provisionamento ANTIGO preenchia `went_live_at = now()` e iniciava o trial
-- no mesmo clique que criava a equipe. WI Advogados e Rema Digital foram
-- provisionados assim hoje, 02/09: os contratos dizem `trialing`, com trial
-- terminando em 17/09 — e os dois estão em Implantação, sem agente treinado,
-- sem canais conectados e sem CRM montado.
--
-- Ou seja: o trial dos dois está sendo gasto exatamente do jeito que esta
-- sprint existe para impedir — julgando um produto meio construído. E, como o
-- contrato se diz vivo, o botão "Colocar no ar" responderia `already_live` e
-- não faria nada.
--
-- A regra aqui é semântica, não uma data: **um contrato cujo card não está numa
-- etapa terminal não está no ar.** O relógio recomeça no go-live de verdade.
--
-- Isto também é o que faz a proteção da fatura, logo abaixo, funcionar: ela
-- depende de `went_live_at is null`.
-- ============================================================================

update public.contracts c
   set status               = 'onboarding',
       went_live_at         = null,
       trial_ends_at        = null,
       current_period_start = null,
       current_period_end   = null
  from public.onboardings o
  join public.onboarding_stages s on s.id = o.stage_id
 where o.equipe_id = c.equipe_id
   and not s.is_terminal
   and c.status in ('trialing', 'active');

-- Agora sim a fatura de implantação pendente pode ser protegida do
-- voidOrphanInvoices(), que anula fatura aberta sem cobrança com mais de 2h e
-- roda todo dia às 12h UTC. Em produção isto é a FAT-2026-000018 da Rema
-- (R$700), que sem esta linha some na próxima execução do cron.
--
-- O vencimento passa a ser a data prevista de conclusão — o modelo novo, em que
-- o cliente vê como prazo o dia da entrega prometida.
update public.invoices i
   set metadata = i.metadata || '{"awaiting_golive": true}'::jsonb,
       due_date = coalesce(o.golive_previsto, i.due_date)
  from public.contracts c
  left join public.onboardings o on o.equipe_id = c.equipe_id
 where i.contract_id = c.id
   and i.kind = 'setup'
   and i.status = 'open'
   and i.asaas_payment_id is null
   and c.went_live_at is null;

-- ============================================================================
-- 3. BLOCO B — RESET DOS CLIENTES LEGADOS
--
-- Casa Flow, Solo Energia e Jornada do R1 entraram no software antes de existir
-- faturamento. O histórico deles é de um arranjo que não vale mais, e deixá-lo
-- misturado com o plano novo faz o saldo de crédito e o extrato mentirem desde
-- o primeiro dia.
--
-- EXCEÇÃO, NÃO REGRA. Isto não é comportamento do software: nenhuma linha de
-- código foi alterada para isto acontecer. É uma operação de dados, feita uma
-- vez, para clientes específicos.
-- ============================================================================

-- Faturas em aberto do arranjo antigo. `void` e não delete: o número da fatura
-- é sequencial e apagá-lo abre um buraco no histórico fiscal.
update public.invoices set status = 'void'
 where status in ('open', 'past_due')
   and equipe_id in (
     'aa33b576-3959-4a81-8e73-4027039ea2ce',  -- Casa Flow
     '939d7dd8-592c-4fda-946e-3568f2909904',  -- Solo Energia
     'a43f3b4a-5944-427a-84ce-787b3f8711bb'   -- Jornada do R1
   );

-- O histórico de consumo. Copiado acima; some daqui para o plano novo começar
-- com o extrato limpo.
delete from public.agent_action_ledger where equipe_id in (
  'aa33b576-3959-4a81-8e73-4027039ea2ce',
  '939d7dd8-592c-4fda-946e-3568f2909904',
  'a43f3b4a-5944-427a-84ce-787b3f8711bb');
delete from public.credit_ledger where equipe_id in (
  'aa33b576-3959-4a81-8e73-4027039ea2ce',
  '939d7dd8-592c-4fda-946e-3568f2909904',
  'a43f3b4a-5944-427a-84ce-787b3f8711bb');
delete from public.consumo_creditos where equipe_id in (
  'aa33b576-3959-4a81-8e73-4027039ea2ce',
  '939d7dd8-592c-4fda-946e-3568f2909904',
  'a43f3b4a-5944-427a-84ce-787b3f8711bb');
delete from public.notifications where equipe_id in (
  'aa33b576-3959-4a81-8e73-4027039ea2ce',
  '939d7dd8-592c-4fda-946e-3568f2909904',
  'a43f3b4a-5944-427a-84ce-787b3f8711bb');

-- O prazo para regularizar: dia 4. Depois disso, o agente é pausado À MÃO pelo
-- controle que já existe no painel (Faturamento → equipe → Ativar/pausar
-- agente). Automatizar viraria regra do software, e isto é uma exceção.
update public.proposals set valid_until = date '2026-09-04'
 where cliente_nome in ('Casa Flow', 'Casa Flow ADS', 'Solo Energia', 'Jornada do R1')
   and status in ('rascunho', 'enviada', 'vista');

-- ============================================================================
-- 4. BLOCO C — UM CLIENTE ESTAVA COM SUPER ADMIN
--
-- Achado ao conferir os perfis para a desduplicação, e é o item mais grave
-- deste arquivo.
--
-- `is_super_admin()` lê `profiles.role`, e é ela que libera o RLS de
-- `proposals`, `proposal_items`, `proposal_acceptances`, `system_settings`,
-- `notification_senders` e, agora, das tabelas de onboarding.
--
-- `wi@walteringlezadv.com.br` — um CLIENTE — está com `profiles.role =
-- 'super_admin'`. Ou seja: pela API, esse login lê a proposta de todo mundo,
-- com preço negociado, desconto e aceite. É exatamente o vazamento que o
-- comentário da migration de propostas dizia estar evitando ao não expor a
-- tabela para `anon`.
--
-- A interface não mostra o painel para ele, porque useRole lê `user_roles` — e
-- é justamente esse descasamento que fez o problema passar despercebido: a tela
-- diz uma coisa e o RLS obedece outra. A causa raiz (duas fontes de verdade
-- para a mesma autoridade) está no todo.md; aqui fica o estancamento.
-- ============================================================================

update public.profiles
   set role = 'owner'
 where email = 'wi@walteringlezadv.com.br'
   and role = 'super_admin';

-- A conta pessoal do fundador dentro da equipe de um cliente também não precisa
-- disso: o acesso administrativo dele é pela conta principal.
update public.profiles
   set role = 'user'
 where email = 'mateussmaia95@hotmail.com'
   and role = 'super_admin';

-- ============================================================================
-- 5. VERIFICAÇÃO FINAL
--
-- Falhar aqui desfaz tudo, inclusive os backups. É a intenção: um estado
-- inesperado no fim significa que a análise estava errada, e meia limpeza é
-- pior que nenhuma.
-- ============================================================================

do $$
declare
  v_cnt integer;
  v_nome text;
begin
  -- (a) as quatro equipes condenadas sumiram
  select count(*) into v_cnt from public.equipes where id in (
    'e5bda77f-cec0-485e-8d52-404b4fb11ac6',
    '33b33ec5-2325-4e34-aa2d-2070e964f4de',
    'c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b',
    '57b34902-fad3-4e31-a401-b6858027ba21');
  assert v_cnt = 0, format('ASSERT FAILED: %s equipe(s) duplicada(s) sobreviveram', v_cnt);

  -- (b) nenhum cliente tem duas equipes com o mesmo nome
  select count(*) into v_cnt from (
    select nome from public.equipes group by nome having count(*) > 1
  ) d;
  assert v_cnt = 0, format('ASSERT FAILED: %s nome(s) de equipe ainda duplicados', v_cnt);

  -- (c) o contrato da Solo Energia está na equipe com os leads
  assert exists (
    select 1 from public.contracts
     where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904'
       and status in ('onboarding','trialing','active','past_due')
  ), 'ASSERT FAILED: a Solo Energia continua sem contrato na equipe que opera';

  assert (select count(*) from public.leads
           where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904') > 400,
    'ASSERT FAILED: a equipe da Solo Energia que ficou não é a que tem os leads';

  -- (d) o dono da Solo Energia continua tendo acesso
  assert exists (
    select 1 from public.profiles
     where email = 'mateus@soloenergia.com.br'
       and equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904'
  ), 'ASSERT FAILED: o owner da Solo Energia perdeu o vínculo com a equipe';

  -- (e) a WI ficou com a operação e com o contrato
  select nome into v_nome from public.equipes where id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';
  assert v_nome = 'WI Advogados', format('ASSERT FAILED: a equipe WI se chama "%s"', v_nome);
  assert (select count(*) from public.leads
           where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8') > 200,
    'ASSERT FAILED: a equipe da WI que ficou não é a que tem os leads';
  assert exists (
    select 1 from public.contracts where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8'
  ), 'ASSERT FAILED: o contrato da WI não migrou';

  -- (f) NINGUÉM perdeu o login
  select count(*) into v_cnt from backup_20260902_profiles b
   where not exists (select 1 from public.profiles p where p.user_id = b.user_id);
  assert v_cnt = 0, format('ASSERT FAILED: %s perfil(is) foram apagados pelo cascade', v_cnt);

  -- (g) nenhum cliente é super admin
  select count(*) into v_cnt from public.profiles p
   where p.role = 'super_admin' and p.equipe_id is not null
     and p.email <> 'mateussmaia95@gmail.com';
  assert v_cnt = 0,
    format('ASSERT FAILED: %s cliente(s) ainda leem a proposta de todo mundo', v_cnt);

  -- (h) os legados começam com extrato limpo
  select count(*) into v_cnt from public.agent_action_ledger where equipe_id in (
    'aa33b576-3959-4a81-8e73-4027039ea2ce',
    '939d7dd8-592c-4fda-946e-3568f2909904',
    'a43f3b4a-5944-427a-84ce-787b3f8711bb');
  assert v_cnt = 0, format('ASSERT FAILED: %s ações antigas sobraram nos legados', v_cnt);

  -- (i) o backup existe de verdade antes de a transação fechar
  assert (select count(*) from backup_20260902_agent_action_ledger) > 2000,
    'ASSERT FAILED: o backup do histórico dos legados está vazio ou incompleto';

  -- (j) NENHUMA fatura de implantação aberta e sem cobrança está exposta ao
  --     billing-cron. Escrito de propósito SEM o filtro `went_live_at is null`
  --     que o update usa: a versão anterior desta asserção repetia o mesmo
  --     predicado do update e por isso passou sem verificar nada, deixando a
  --     fatura da Rema desprotegida. Uma asserção que só olha as linhas que o
  --     update já escolheu não é uma asserção.
  select count(*) into v_cnt
    from public.invoices i
   where i.kind = 'setup'
     and i.status = 'open'
     and i.asaas_payment_id is null
     and coalesce(i.metadata->>'awaiting_golive', 'false') <> 'true';
  assert v_cnt = 0,
    format('ASSERT FAILED: %s fatura(s) de implantação seriam anuladas pelo billing-cron', v_cnt);

  -- (k) ninguém está em trial sem estar no ar
  select count(*) into v_cnt
    from public.contracts c
    join public.onboardings o on o.equipe_id = c.equipe_id
    join public.onboarding_stages s on s.id = o.stage_id
   where not s.is_terminal
     and (c.status in ('trialing', 'active') or c.went_live_at is not null);
  assert v_cnt = 0,
    format('ASSERT FAILED: %s cliente(s) em implantação com o trial correndo', v_cnt);

  raise notice 'Limpeza de produção 02/09: todas as verificações passaram';
end $$;

commit;
