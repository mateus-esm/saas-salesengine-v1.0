-- ============================================================================
-- 20260902000600_sprint82_correcoes_urgentes.sql
-- Sprint 8.2 · as correções que têm prazo.
--
-- Subconjunto NÃO-DESTRUTIVO da limpeza de produção. Só `update`: nenhuma linha
-- é apagada, nenhuma equipe some, nenhum perfil é removido.
--
-- Está numa migration, e não no script de limpeza, porque estas três correções
-- valem para QUALQUER banco que carregue dado criado pelo modelo antigo — não
-- são cirurgia numa base específica. A desduplicação de equipes, essa sim, é
-- específica e continua no script.
--
-- As três têm prazo:
--
--   1. Um cliente está lendo a proposta de todos os outros. Agora.
--   2. Uma fatura de R$700 será anulada sozinha pelo cron às 12h UTC.
--   3. Dois clientes estão gastando o trial num produto meio construído.
--
-- Roda depois das migrations 000100–000500. É idempotente: rodar duas vezes
-- não muda nada na segunda.
-- ============================================================================

-- ============================================================================
-- 1. UM CLIENTE ESTAVA COM SUPER ADMIN
--
-- `is_super_admin()` lê `profiles.role`, e é ela que libera o RLS de
-- `proposals`, `proposal_items`, `proposal_acceptances`, `system_settings`,
-- `notification_senders` e das tabelas de onboarding.
--
-- `wi@walteringlezadv.com.br` — um CLIENTE — está com essa coluna em
-- 'super_admin'. Pela API, esse login lê a proposta de todo mundo, com preço
-- negociado, desconto e aceite.
--
-- A interface nunca mostrou o painel para ele, porque `useRole` lê OUTRA tabela
-- (`user_roles`). É esse descasamento — a tela dizendo uma coisa e o RLS
-- obedecendo outra — que fez o problema passar despercebido. A causa raiz está
-- no todo.md; aqui é o estancamento.
-- ============================================================================

-- A regra, escrita como invariante e não como lista de e-mails: quem pertence à
-- equipe de um cliente não é super admin da plataforma. Um super admin de
-- verdade não tem `equipe_id` — ele atende todas as equipes.
--
-- Em produção isto atinge dois perfis: `wi@walteringlezadv.com.br` (um cliente)
-- e a conta pessoal alternativa do fundador dentro da equipe de outro cliente.
-- O acesso administrativo do fundador é pela conta principal, que não está
-- presa a equipe nenhuma.
--
-- Não vira CHECK aqui de propósito: transformar isto em constraint muda o que a
-- tela de permissões pode fazer, e essa é uma decisão do dono do produto. Está
-- no todo.md junto com a causa raiz.
update public.profiles
   set role = 'owner'
 where role = 'super_admin'
   and equipe_id is not null;

-- ============================================================================
-- 2. QUEM NÃO ESTÁ NO AR NÃO PODE ESTAR EM TRIAL
--
-- O provisionamento ANTIGO preenchia `went_live_at = now()` e iniciava o trial
-- no mesmo clique que criava a equipe. WI Advogados e Rema Digital foram
-- provisionados assim hoje: os contratos dizem `trialing` até 17/09 e os dois
-- estão em Implantação — sem agente treinado, sem canais, sem CRM.
--
-- Ou seja, o trial dos dois está sendo gasto exatamente do jeito que esta
-- sprint existe para impedir. E, como o contrato se diz vivo, o botão "Colocar
-- no ar" responderia `already_live` e não faria nada.
--
-- A regra é semântica, não uma data: um contrato cujo card não está numa etapa
-- terminal não está no ar. O relógio recomeça no go-live de verdade.
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

-- ============================================================================
-- 3. A FATURA DE IMPLANTAÇÃO NÃO PODE SER ANULADA PELO CRON
--
-- `voidOrphanInvoices()` anula toda fatura ABERTA e SEM cobrança com mais de 2
-- horas, porque normalmente isso é entulho de um gateway que falhou. Uma fatura
-- de implantação 'on_golive' fica exatamente nesse estado por semanas, de
-- propósito.
--
-- O cron roda todo dia às 12h UTC e está ativo. Em produção isto é a
-- FAT-2026-000018 da Rema Digital, R$700: sem esta marca ela desaparece na
-- próxima execução e nada registra que existiu.
--
-- O vencimento passa a ser a data prevista de conclusão — o modelo novo, em que
-- o cliente vê como prazo o dia da entrega prometida.
-- ============================================================================

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
-- 4. VERIFICAÇÃO
-- ============================================================================

do $$
declare
  v_cnt integer;
begin
  -- (a) nenhum cliente lê a proposta dos outros
  select count(*) into v_cnt from public.profiles
   where role = 'super_admin' and equipe_id is not null;
  assert v_cnt = 0,
    format('ASSERT FAILED: %s cliente(s) ainda leem a proposta de todo mundo', v_cnt);

  -- (b) ninguém em implantação com o trial correndo
  select count(*) into v_cnt
    from public.contracts c
    join public.onboardings o on o.equipe_id = c.equipe_id
    join public.onboarding_stages s on s.id = o.stage_id
   where not s.is_terminal
     and (c.status in ('trialing', 'active') or c.went_live_at is not null);
  assert v_cnt = 0,
    format('ASSERT FAILED: %s cliente(s) em implantação com o trial correndo', v_cnt);

  -- (c) nenhuma fatura de implantação exposta ao cron.
  --
  --     Escrita SEM o filtro `went_live_at is null` que o update usa. A primeira
  --     versão desta asserção, na migration de backfill, repetia o predicado do
  --     update — e por isso passou sem verificar nada, deixando a fatura da Rema
  --     desprotegida. Uma asserção que só olha as linhas que o update já
  --     escolheu não é uma asserção.
  select count(*) into v_cnt from public.invoices
   where kind = 'setup' and status = 'open' and asaas_payment_id is null
     and coalesce(metadata->>'awaiting_golive', 'false') <> 'true';
  assert v_cnt = 0,
    format('ASSERT FAILED: %s fatura(s) de implantação seriam anuladas pelo cron', v_cnt);

  raise notice 'Sprint 8.2 · correções urgentes: asserções passaram';
end $$;
