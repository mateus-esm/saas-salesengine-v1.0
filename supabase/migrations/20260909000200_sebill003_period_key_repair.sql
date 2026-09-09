-- 20260909000200_sebill003_period_key_repair.sql
-- SE-BILL-003 · o pagamento rolou o período ERRADO.
--
-- O QUE ACONTECEU
--
-- `rollContractPeriod` nunca leu o `period_key` que a própria fatura carrega.
-- Ele estendia a partir de `current_period_end` sempre que esse valor estivesse
-- no futuro — regra certa para a fatura de RENOVAÇÃO, que o `renewPeriods` emite
-- 5 dias antes do fim do período (quem paga está mesmo comprando o próximo), e
-- errada para a fatura do PRIMEIRO período, que cobra o período em curso.
--
-- As linhas gravadas da Solo Energia, exatamente como o código as produziu:
--
--   fatura FAT-2026-000036  period_key 2026-09-02  first_period: true
--                           paga em 2026-09-07
--   contrato  current_period_start 2026-10-01  current_period_end 2026-11-01
--   grant     2500 whatsapp / 500 copilot  expira 2026-11-01  (54 dias)
--             chave period_<contrato>_2026-10-01_<pool>
--
-- O cliente pagou 02/09→01/10 e recebeu 01/10→01/11. Setembro ficou sem cota
-- nenhuma — era essa a queixa ("os créditos não voltaram para 2500"): não havia
-- cota de setembro para voltar. A cota nasceu valendo 54 dias em vez de 30, o
-- `current_period_start` ficou três semanas no futuro, e o `renewPeriods` só
-- voltaria a emitir por volta de 27/10: o mês pago nunca seria cobrado de novo.
--
-- A correção do código está em `_shared/invoice-effects.ts` (a fatura diz de
-- qual período ela é). Esta migration conserta o que já foi gravado.
--
-- A CHAVE DE IDEMPOTÊNCIA É A PARTE PERIGOSA
--
-- O grant foi gravado sob `period_<contrato>_2026-10-01_<pool>`. Reancorar o
-- contrato sem reescrever essa chave deixaria uma armadilha silenciosa: quando a
-- fatura de outubro fosse paga, o `grant_credits` veria a mesma chave, trataria
-- como replay e NÃO concederia a cota de outubro. O cliente pagaria e não
-- receberia crédito nenhum, sem erro em lugar nenhum.
--
-- Reescrever a chave não mexe em dinheiro: corrige o rótulo de qual período
-- aquela linha representa. O valor, o pool e a data continuam os mesmos, e o
-- motivo fica gravado no `metadata` da própria linha.

do $$
declare
  r             record;
  v_wrong_key   text;
  v_right_key   text;
  v_correct_end timestamptz;
  v_fixed       integer := 0;
begin
  for r in
    -- Um contrato cujo período corrente começa DEPOIS do período que a última
    -- fatura paga comprou: o pagamento pulou para a frente.
    select distinct on (c.id)
           c.id                   as contract_id,
           c.equipe_id,
           c.current_period_start as wrong_start,
           i.number               as invoice_number,
           (i.metadata->>'period_key')::timestamptz as paid_period_start
      from public.contracts c
      join public.invoices  i on i.contract_id = c.id
     where i.kind = 'recurring'
       and i.status = 'paid'
       and i.metadata ? 'period_key'
       and c.current_period_start > (i.metadata->>'period_key')::timestamptz
     order by c.id, i.paid_at desc
  loop
    -- A âncora é o dia 1º: `endTrials` proporcionaliza o primeiro período
    -- justamente para que "everything bills on the 1st from now on".
    v_correct_end := date_trunc('month', r.paid_period_start) + interval '1 month';
    v_wrong_key   := to_char(r.wrong_start       at time zone 'UTC', 'YYYY-MM-DD');
    v_right_key   := to_char(r.paid_period_start at time zone 'UTC', 'YYYY-MM-DD');

    update public.contracts
       set current_period_start = r.paid_period_start,
           current_period_end   = v_correct_end
     where id = r.contract_id;

    -- A cota passa a valer pelo período que foi pago, e volta a se chamar pelo
    -- nome certo para que o período seguinte não pareça um replay dela.
    update public.credit_ledger
       set expires_at      = v_correct_end,
           idempotency_key = 'period_' || r.contract_id::text || '_' || v_right_key || '_' || pool,
           metadata        = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'sebill003_repair', jsonb_build_object(
               'reason',      'cota emitida para o periodo seguinte ao que a fatura pagou',
               'invoice',     r.invoice_number,
               'was_key',     idempotency_key,
               'was_expires', expires_at,
               'now_expires', v_correct_end))
     where equipe_id  = r.equipe_id
       and entry_type = 'grant'
       and source     = 'plan_period'
       and idempotency_key = 'period_' || r.contract_id::text || '_' || v_wrong_key || '_' || pool;

    v_fixed := v_fixed + 1;
    raise notice 'SE-BILL-003: contrato % reancorado de % para % (fatura %)',
      r.contract_id, v_wrong_key, v_right_key, r.invoice_number;
  end loop;

  raise notice 'SE-BILL-003: % contrato(s) reancorado(s)', v_fixed;
end $$;

-- ============================================================================
-- OS AJUSTES MANUAIS DE 07/09 — devolvidos.
--
-- Com o saldo mostrando 3972 depois do pagamento, o founder lançou à mão
-- -1972 (Atendimento) e -500 (Copiloto) para forçar o número a 2000/500. Era um
-- remendo sobre a contabilidade quebrada, não uma cobrança: nada foi consumido
-- naquele instante.
--
-- Agora que o `credits-reconcile` volta a lançar o consumo real de setembro (a
-- chave por dia do SE-BILL-002), manter os dois seria cobrar duas vezes — uma
-- pelo remendo, outra pelo consumo de verdade.
--
-- Estorno por linha positiva, nunca delete: o extrato do cliente tem de mostrar
-- o erro E a correção. Chave fixa por linha estornada, então rodar de novo não
-- devolve nada duas vezes.
-- ============================================================================
insert into public.credit_ledger
  (equipe_id, entry_type, credits, source, pool, ref_id, idempotency_key, metadata)
select l.equipe_id,
       'adjustment',
       -l.credits,                       -- devolve o que o ajuste tirou
       'reconcile',
       l.pool,
       null,
       'sebill003_undo_' || l.id::text,
       jsonb_build_object(
         'reason',      'sebill003_undo_manual_patch',
         'undoes',      l.id,
         'undoes_key',  l.idempotency_key,
         'explanation', 'ajuste manual de 07/09 que forcava o saldo enquanto o periodo estava errado')
  from public.credit_ledger l
 where l.source     = 'admin'
   and l.entry_type = 'adjustment'
   and l.credits    < 0
   and l.metadata->>'reason' = 'Ajuste'
   and l.created_at >= timestamptz '2026-09-07 00:00:00+00'
   and l.created_at <  timestamptz '2026-09-08 00:00:00+00'
on conflict (equipe_id, idempotency_key) do nothing;

-- ============================================================================
-- UM DÉBITO ESTORNADO NÃO É CONSUMO.
--
-- `credits_consumed_in_window` soma só linhas NEGATIVAS, então a linha positiva
-- do estorno acima não cancela o débito que ela desfaz: a cota continuaria
-- parecendo gasta. Na Solo Energia isso mostraria "0 de 2500 do plano" com 3.356
-- de saldo — os dois números do mesmo card se contradizendo.
--
-- Somar as positivas junto NÃO é a saída: o SE-BILL-002 as exclui de propósito,
-- para o crédito de reparo do Sprint 8.5 não fazer uma cota parecer menos usada
-- do que foi. A regra certa é mais estreita — ignorar o débito que foi
-- explicitamente desfeito, identificado pela linha que diz qual linha ela
-- desfaz. As duas continuam no extrato: o cliente vê o erro E a correção.
-- ============================================================================
create or replace function public.credits_consumed_in_window(
  p_equipe_id uuid, p_from timestamptz, p_to timestamptz, p_pool text default null
) returns integer
language sql stable
set search_path = public
as $fn$
  select coalesce(-sum(l.credits), 0)::integer
  from public.credit_ledger l
  where l.equipe_id = p_equipe_id
    and (p_pool is null or l.pool = p_pool)
    and l.created_at >= p_from
    and (p_to is null or l.created_at < p_to)
    and (
      l.entry_type = 'debit'
      -- SE-BILL-002: o pool de atendimento é consumido do lado do provedor e
      -- chega aqui como ajuste do reconciliador. Só negativos, e nunca estorno
      -- de fatura.
      or (l.entry_type = 'adjustment' and l.credits < 0 and l.source <> 'invoice')
    )
    -- SE-BILL-003: e nunca um débito que já foi desfeito.
    and not exists (
      select 1 from public.credit_ledger u
      where u.equipe_id = l.equipe_id
        and u.metadata->>'undoes' = l.id::text
    );
$fn$;

comment on function public.credits_consumed_in_window(uuid, timestamptz, timestamptz, text) is
  'Créditos consumidos num pool dentro de uma janela. Conta `debit` medidos E os `adjustment` negativos que o credits-reconcile lança pelo consumo do agente de atendimento (SE-BILL-002) — o pool WhatsApp não tem caminho de débito, e só com débitos a janela lê "nada foi usado" e a expiração remove a cota uma segunda vez. Exclui ajustes positivos (reparos/créditos administrativos), ajustes de `invoice` (estorno, amarrado à própria cota por ref_id) e débitos que foram explicitamente desfeitos por outra linha (SE-BILL-003, `metadata->>''undoes''`).';

-- O cache é derivado: sem isto o painel continua mostrando o número anterior.
select public.recompute_credit_balance(equipe_id)
  from (select distinct equipe_id from public.contracts) c;

-- ============================================================================
-- ASSERÇÕES — o que esta migration existe para garantir.
-- ============================================================================
do $$
declare
  v_bad integer;
begin
  -- Nenhum contrato pode ter o período corrente começando depois do período que
  -- a última fatura paga comprou.
  select count(*) into v_bad
    from public.contracts c
    join public.invoices  i on i.contract_id = c.id
   where i.kind = 'recurring' and i.status = 'paid' and i.metadata ? 'period_key'
     and c.current_period_start > (i.metadata->>'period_key')::timestamptz;
  assert v_bad = 0, format('ASSERT FAILED: %s contrato(s) ainda no periodo errado', v_bad);

  -- Nenhuma cota de plano pode valer muito mais que um período.
  select count(*) into v_bad
    from public.credit_ledger
   where entry_type = 'grant' and source = 'plan_period' and expires_at is not null
     and expires_at - created_at > interval '40 days';
  assert v_bad = 0, format('ASSERT FAILED: %s cota(s) com validade maior que um periodo', v_bad);

  -- A chave da cota não pode ser a do PRÓXIMO período, ou o pagamento seguinte
  -- é descartado como replay e o cliente paga sem receber crédito.
  select count(*) into v_bad
    from public.credit_ledger l
    join public.contracts c on c.equipe_id = l.equipe_id
   where l.entry_type = 'grant' and l.source = 'plan_period'
     and l.idempotency_key = 'period_' || c.id::text || '_'
         || to_char(c.current_period_end at time zone 'UTC', 'YYYY-MM-DD') || '_' || l.pool;
  assert v_bad = 0,
    format('ASSERT FAILED: %s cota(s) com a chave do PROXIMO periodo', v_bad);

  -- Um débito desfeito não pode continuar contando como cota gasta.
  select count(*) into v_bad
    from public.credit_ledger l
    join public.credit_ledger u
      on u.equipe_id = l.equipe_id and u.metadata->>'undoes' = l.id::text
   where public.credits_consumed_in_window(
           l.equipe_id, l.created_at - interval '1 second',
           l.created_at + interval '1 second', l.pool) <> 0;
  assert v_bad = 0,
    format('ASSERT FAILED: %s debito(s) estornado(s) ainda contam como consumo', v_bad);

  raise notice 'SE-BILL-003 assertions passed';
end $$;
