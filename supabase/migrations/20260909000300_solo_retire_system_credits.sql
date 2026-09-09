-- 20260909000300_solo_retire_system_credits.sql
-- Solo Energia passa a ser cliente de verdade: sai o crédito de cortesia.
--
-- POR QUE
--
-- Entre 24 e 25/08, enquanto a contabilidade de créditos estava quebrada
-- (SE-BILL-002 — a chave mensal do reconciliador travava o consumo do mês, e a
-- expiração cega estornava a cota inteira), o founder lançou crédito à mão para
-- a operação não parar: 1.500 no Atendimento e 500 no Copiloto, como `topup` de
-- `source = 'admin'`.
--
-- Aquilo era andaime, não plano. Agora o período está certo (SE-BILL-003), o
-- reconciliador lança o consumo real todo dia, e a Solo Energia é cliente
-- pagante: o saldo dela tem de ser a cota do plano menos o que o agente gastou,
-- e mais nada. Se precisar de mais, compra — é o que o `asaas-buy-credits`
-- existe para fazer, e crédito comprado (`source = 'invoice'`) não é tocado
-- aqui.
--
-- POR QUE SÓ A SOLO ENERGIA
--
-- Casa Flow (2.500) e Jornada do R1 (500) também têm crédito administrativo,
-- mas ainda estão em onboarding — não há contrato ativo nem cota de plano por
-- trás delas. Tirar o crédito dessas equipes agora deixaria o agente delas sem
-- nada durante a implantação. Quando cada uma entrar no ar, o mesmo raciocínio
-- se aplica, e a decisão é do founder, não desta migration.
--
-- COMO
--
-- Ajuste negativo, nunca delete: o `topup` de agosto e a retirada de setembro
-- ficam os dois no extrato, cada um com o seu motivo. É o mesmo princípio do
-- Sprint 8.5 — o cliente tem direito de ver o que entrou e o que saiu.

-- Uma linha de retirada POR crédito de cortesia, cada uma dizendo qual linha ela
-- desfaz. Não é enfeite: `credits_consumed_in_window` conta todo ajuste negativo
-- como consumo do agente, então uma retirada solta de -1.500 faria o card dizer
-- que o agente gastou 2.116 e inventaria 1.472 de "avulsos". Declarando o par,
-- os dois lados saem da conta de consumo (SE-BILL-003) e a cota do plano
-- continua medindo só o que o agente de fato usou.
do $$
declare
  v_equipe uuid;
  r        record;
  v_total  integer := 0;
begin
  select id into v_equipe from public.equipes where nome = 'Solo Energia';
  if v_equipe is null then
    raise notice 'Solo Energia nao encontrada — nada a fazer';
    return;
  end if;

  for r in
    select id, pool, credits
      from public.credit_ledger
     where equipe_id   = v_equipe
       and entry_type  = 'topup'
       and source      = 'admin'     -- comprado é `invoice`, e fica
       and credits     > 0
  loop
    insert into public.credit_ledger
      (equipe_id, entry_type, credits, source, pool, ref_id, idempotency_key, metadata)
    values (
      v_equipe,
      'adjustment',
      -r.credits,
      'admin',
      r.pool,
      r.id,
      'solo_retire_system_credits_' || r.id::text,
      jsonb_build_object(
        'reason',      'retirada do credito de cortesia de agosto',
        'undoes',      r.id,
        'explanation', 'lancado a mao enquanto a contabilidade estava quebrada (SE-BILL-002); '
                       || 'com o periodo corrigido a conta passa a ser a cota do plano menos o consumo',
        'retired',     r.credits)
    )
    on conflict (equipe_id, idempotency_key) do nothing;

    if found then
      v_total := v_total + r.credits;
      raise notice 'Solo Energia: % creditos de cortesia retirados do pool %', r.credits, r.pool;
    end if;
  end loop;

  perform public.recompute_credit_balance(v_equipe);
  raise notice 'Solo Energia: % credito(s) de cortesia retirado(s) no total', v_total;
end $$;

-- ============================================================================
-- ASSERÇÕES — o saldo passa a ser só o plano menos o consumo.
-- ============================================================================
do $$
declare
  v_equipe   uuid;
  v_wa       integer;
  v_cop      integer;
  v_cortesia integer;
begin
  select id into v_equipe from public.equipes where nome = 'Solo Energia';
  if v_equipe is null then return; end if;

  -- Nenhum crédito de cortesia sobrando: os `topup` de admin e as retiradas
  -- têm de se anular.
  select coalesce(sum(credits), 0) into v_cortesia
    from public.credit_ledger
   where equipe_id = v_equipe
     and source    = 'admin'
     and (entry_type = 'topup'
          or idempotency_key like 'solo_retire_system_credits_%');
  assert v_cortesia = 0,
    format('ASSERT FAILED: sobraram %s creditos de cortesia', v_cortesia);

  v_wa  := public.credit_balance(v_equipe, 'whatsapp');
  v_cop := public.credit_balance(v_equipe, 'copilot');

  -- O saldo não pode passar da cota do plano: sem cortesia e sem compra, é o
  -- teto possível.
  assert v_wa  <= 2500, format('ASSERT FAILED: Atendimento acima da cota (%s)', v_wa);
  assert v_cop <= 500,  format('ASSERT FAILED: Copiloto acima da cota (%s)', v_cop);

  -- A retirada não pode ter virado "consumo do agente": a cota do plano só
  -- encolhe pelo que o agente gastou de verdade.
  assert (select whatsapp_expiring from public.v_credit_balance where equipe_id = v_equipe) >= v_wa,
    'ASSERT FAILED: a retirada da cortesia foi contada como consumo da cota';

  raise notice 'Solo Energia agora: Atendimento % · Copiloto %', v_wa, v_cop;
end $$;
