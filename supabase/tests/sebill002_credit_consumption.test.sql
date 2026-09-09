-- SE-BILL-002 functional test — consumo do agente de atendimento na contagem
-- de expiração de créditos.
--
-- Run:  docker exec supabase_db_<ref> psql -U postgres -d postgres -f this
--
-- O teste que importa é o T1: ele reproduz o buraco que engolia a recarga do
-- cliente. Os outros garantem que a correção não passou a contar como consumo
-- coisas que não são consumo (reparos, estornos, o outro pool).
--
-- NÃO chama public.expire_credits(): aquela função varre TODOS os grants
-- expirados do banco, sem parâmetro para escopo. Rodar isso num banco de
-- produção — mesmo dentro de uma transação revertida — trava linhas de todos os
-- inquilinos. public.pending_expiry() é leitura pura e é exatamente a mesma
-- aritmética, então é nela que as asserções batem.
\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5eb00002-0000-0000-0000-000000000001', 'SEBILL002 Atendimento', 'x', 'y'),
  ('5eb00002-0000-0000-0000-000000000002', 'SEBILL002 Já varrido',  'x', 'y');

-- Cota do plano de agosto: 2000 no pool de Atendimento, expirando em 01/09.
-- O agente consumiu 1600 do lado do provider — o `credits-reconcile` lança isso
-- como `adjustment`, porque o pool whatsapp NÃO tem caminho de `debit`.
-- No meio do mês o cliente comprou 500 de recarga.
insert into public.credit_ledger
  (id, equipe_id, entry_type, credits, expires_at, source, pool, idempotency_key, created_at) values
  ('5eb00002-1111-0000-0000-000000000001','5eb00002-0000-0000-0000-000000000001',
   'grant', 2000, now() - interval '1 day', 'plan_period', 'whatsapp', 'sebill002_grant', now() - interval '32 days'),
  ('5eb00002-1111-0000-0000-000000000002','5eb00002-0000-0000-0000-000000000001',
   'adjustment', -1600, null, 'reconcile', 'whatsapp', 'sebill002_reconcile', now() - interval '20 days'),
  ('5eb00002-1111-0000-0000-000000000003','5eb00002-0000-0000-0000-000000000001',
   'topup', 500, null, 'invoice', 'whatsapp', 'sebill002_topup', now() - interval '15 days');

-- ============================================================ T1 — o buraco --
-- Antes da correção, `credits_consumed_in_window` só contava `debit`. O grant
-- parecia 100% intacto, a expiração devolvia 2000 em vez de 400, e a diferença
-- ficava como resíduo negativo que comia a recarga de 500 do cliente.
do $$
begin
  assert public.credits_consumed_in_window(
           '5eb00002-0000-0000-0000-000000000001',
           now() - interval '32 days', now() - interval '1 day', 'whatsapp') = 1600,
    'T1 FAIL: o consumo do provider não foi contado — '
      || public.credits_consumed_in_window('5eb00002-0000-0000-0000-000000000001',
           now() - interval '32 days', now() - interval '1 day', 'whatsapp');

  assert public.pending_expiry('5eb00002-0000-0000-0000-000000000001', 'whatsapp') = 400,
    'T1 FAIL: deviam expirar 400 (2000 - 1600), e não '
      || public.pending_expiry('5eb00002-0000-0000-0000-000000000001', 'whatsapp');

  -- soma = 2000 - 1600 + 500 = 900; menos os 400 que expiram = 500.
  assert public.credit_balance('5eb00002-0000-0000-0000-000000000001', 'whatsapp') = 500,
    'T1 FAIL: a recarga do cliente foi engolida — saldo '
      || public.credit_balance('5eb00002-0000-0000-0000-000000000001', 'whatsapp');

  raise notice 'T1 ok — consumo do provider conta na expiracao; a recarga sobrevive';
end $$;

-- ================================ T2 — ajuste positivo não é consumo --
-- Os créditos de reparo do Sprint 8.5 e os grants manuais do admin são
-- positivos. Se contassem como consumo, um grant expirando pareceria mais
-- gasto do que foi e o cliente ficaria com crédito que não comprou.
insert into public.credit_ledger
  (equipe_id, entry_type, credits, source, pool, idempotency_key, created_at)
values ('5eb00002-0000-0000-0000-000000000001','adjustment', 300, 'reconcile', 'whatsapp',
        'sebill002_reparo', now() - interval '18 days');
do $$
begin
  assert public.pending_expiry('5eb00002-0000-0000-0000-000000000001', 'whatsapp') = 400,
    'T2 FAIL: um ajuste POSITIVO mexeu na expiracao — '
      || public.pending_expiry('5eb00002-0000-0000-0000-000000000001', 'whatsapp');
  raise notice 'T2 ok — credito de reparo nao vira consumo';
end $$;

-- ==================================== T3 — estorno não é consumo --
-- `applyRefunded` lança `adjustment` negativo com `source = 'invoice'`, e ele
-- desfaz UM grant/topup específico (o `ref_id` diz qual). Cobrá-lo contra a
-- janela de outro grant subestimaria a expiração daquele grant.
insert into public.credit_ledger
  (equipe_id, entry_type, credits, source, pool, idempotency_key, created_at)
values ('5eb00002-0000-0000-0000-000000000001','adjustment', -500, 'invoice', 'whatsapp',
        'sebill002_estorno', now() - interval '14 days');
do $$
begin
  assert public.pending_expiry('5eb00002-0000-0000-0000-000000000001', 'whatsapp') = 400,
    'T3 FAIL: um estorno virou consumo — '
      || public.pending_expiry('5eb00002-0000-0000-0000-000000000001', 'whatsapp');
  raise notice 'T3 ok — estorno nao vira consumo';
end $$;

-- ============================================ T4 — os pools não se misturam --
insert into public.credit_ledger
  (equipe_id, entry_type, credits, source, pool, idempotency_key, created_at)
values ('5eb00002-0000-0000-0000-000000000001','debit', -100, 'copilot', 'copilot',
        'sebill002_copilot', now() - interval '10 days');
do $$
begin
  assert public.pending_expiry('5eb00002-0000-0000-0000-000000000001', 'whatsapp') = 400,
    'T4 FAIL: debito do Copiloto vazou para a expiracao do Atendimento — '
      || public.pending_expiry('5eb00002-0000-0000-0000-000000000001', 'whatsapp');
  raise notice 'T4 ok — Copiloto e Atendimento seguem separados';
end $$;

-- ========================== T5 — pagamento atrasado: cota CHEIA dá o total certo --
-- O cenário do estudo: cota 2000, fatura vence, cliente paga 8 dias depois,
-- agente consumiu 400 na carência. Esperado: 1600.
--
-- O SE-BILL-001 concedia 2000 - 400 = 1600 de grant, o que dava saldo 1200 —
-- porque os 400 JÁ estavam no ledger. Com a cota cheia, a soma fecha em 1600.
insert into public.equipes (id, nome, crm_link, suporte_link)
values ('5eb00002-0000-0000-0000-000000000003', 'SEBILL002 Atraso', 'x', 'y');
insert into public.credit_ledger
  (equipe_id, entry_type, credits, source, pool, idempotency_key, created_at)
values ('5eb00002-0000-0000-0000-000000000003','adjustment', -400, 'reconcile', 'whatsapp',
        'sebill002_carencia', now() - interval '2 days');
do $$
begin
  perform public.grant_credits('5eb00002-0000-0000-0000-000000000003', 2000, 'plan_period',
                               null, now() + interval '30 days',
                               'sebill002_periodo_whatsapp', 'grant', 'whatsapp');
  assert public.credit_balance('5eb00002-0000-0000-0000-000000000003', 'whatsapp') = 1600,
    'T5 FAIL: o total apos pagamento atrasado deveria ser 1600, e nao '
      || public.credit_balance('5eb00002-0000-0000-0000-000000000003', 'whatsapp');
  raise notice 'T5 ok — cota cheia + residuo do ledger = 1600';
end $$;

-- ================================= T6 — reparo de expiração já lançada --
-- Substituir a função corrige `pending_expiry`, que é calculada na leitura. Não
-- corrige o que `expire_credits()` já gravou: aquele grant tem uma linha
-- `expiry` concreta e passa a ser ignorado por `pending_expiry`. A migration
-- compensa a diferença com um ajuste positivo, append-only.
insert into public.credit_ledger
  (id, equipe_id, entry_type, credits, expires_at, source, pool, idempotency_key, created_at) values
  ('5eb00002-2222-0000-0000-000000000001','5eb00002-0000-0000-0000-000000000002',
   'grant', 2000, now() - interval '1 day', 'plan_period', 'whatsapp', 'sebill002_b_grant', now() - interval '32 days'),
  ('5eb00002-2222-0000-0000-000000000002','5eb00002-0000-0000-0000-000000000002',
   'adjustment', -1600, null, 'reconcile', 'whatsapp', 'sebill002_b_reconcile', now() - interval '20 days'),
  ('5eb00002-2222-0000-0000-000000000003','5eb00002-0000-0000-0000-000000000002',
   'topup', 500, null, 'invoice', 'whatsapp', 'sebill002_b_topup', now() - interval '15 days');
-- A varredura antiga: devolveu o grant inteiro em vez dos 400 não usados.
insert into public.credit_ledger
  (equipe_id, entry_type, credits, source, pool, ref_id, idempotency_key, created_at)
values ('5eb00002-0000-0000-0000-000000000002','expiry', -2000, 'plan_period', 'whatsapp',
        '5eb00002-2222-0000-0000-000000000001',
        'expiry_5eb00002-2222-0000-0000-000000000001', now() - interval '1 day');

do $$
declare v_delta integer;
begin
  -- Com a linha de expiração presente, pending_expiry sai de cena...
  assert public.pending_expiry('5eb00002-0000-0000-0000-000000000002', 'whatsapp') = 0,
    'T6 FAIL: pending_expiry devia ignorar um grant ja varrido';
  -- ...e o saldo fica errado até o reparo: 2000 - 1600 + 500 - 2000 = -1100 -> 0.
  assert public.credit_balance('5eb00002-0000-0000-0000-000000000002', 'whatsapp') = 0,
    'T6 FAIL: o fixture nao reproduziu o buraco — saldo '
      || public.credit_balance('5eb00002-0000-0000-0000-000000000002', 'whatsapp');

  -- É exatamente esta conta que a migration faz.
  v_delta := 2000 - greatest(0, 2000 - public.credits_consumed_in_window(
    '5eb00002-0000-0000-0000-000000000002',
    now() - interval '32 days', now() - interval '1 day', 'whatsapp'));
  assert v_delta = 1600,
    'T6 FAIL: o reparo devia devolver 1600, e nao ' || v_delta;

  insert into public.credit_ledger
    (equipe_id, entry_type, credits, source, pool, ref_id, idempotency_key, metadata)
  values ('5eb00002-0000-0000-0000-000000000002','adjustment', v_delta, 'reconcile', 'whatsapp',
          '5eb00002-2222-0000-0000-000000000001',
          'sebill002_expiry_repair_test',
          jsonb_build_object('reason','sebill002_over_expiry_repair'));

  assert public.credit_balance('5eb00002-0000-0000-0000-000000000002', 'whatsapp') = 500,
    'T6 FAIL: apos o reparo a recarga devia reaparecer — saldo '
      || public.credit_balance('5eb00002-0000-0000-0000-000000000002', 'whatsapp');
  raise notice 'T6 ok — expiracao ja lancada reparada, recarga de volta';
end $$;

rollback;
