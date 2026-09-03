-- 20260903000500_sprint82_golive_first_invoice.sql
-- Sprint 8.2 - contrato SEM trial ganhava o primeiro mes de graca.
--
-- O QUE ESTAVA ERRADO, medido em producao
--
-- A Solo Energia (contrato 5234874b, proposta 099CAB5BD789, trial_days = 0,
-- R$200/mes) entrou no ar em 02/09. `go_live_contract` viu trial_days = 0,
-- colocou o contrato em 'active' com current_period_end = 2026-10-01 -- e nao
-- emitiu fatura nenhuma. Em 03/09 o contrato esta ativo, o agente atendendo,
-- e `select ... from invoices where contract_id = 5234874b` devolve zero linhas.
--
-- Ninguem cobre esse buraco depois:
--
--   * endTrials (billing-cron) filtra `status = 'trialing'`. Um contrato sem
--     trial nunca passa por 'trialing', entao nunca e visto.
--   * renewPeriods so emite quando current_period_end entra na janela de 5
--     dias. Para um go-live no dia 2, isso e o dia 26 do mes.
--
-- Resultado: ~30 dias de servico entregue e nao faturado, sem nada no sistema
-- acusando. O trial de 15 dias tem tratamento; o trial de ZERO dias, que e o
-- caso de quem paga desde o primeiro dia, nao tinha.
--
-- A CORRECAO
--
-- Quem nao tem trial e cobrado no go-live, no mesmo instante e na mesma
-- transacao em que o ambiente entra no ar. O valor e proporcional aos dias que
-- faltam do mes (prorated_amount, que ja existe e ja e testado desde o sprint
-- 9), pelo mesmo motivo que o fim de trial e proporcional: a partir do mes
-- seguinte tudo cai no dia 1, e cobrar um mes cheio por 29 dias seria cobrar
-- por um dia que o cliente nao teve.
--
-- POR QUE DENTRO DA TRANSACAO, e nao na edge function: "entrou no ar" e "deve
-- a primeira mensalidade" sao o mesmo fato. Separa-los e criar de novo, num
-- lugar diferente, exatamente a janela que este arquivo esta fechando.
--
-- IDEMPOTENCIA: metadata.period_key = a data do go-live. renewPeriods usa
-- current_period_end como chave, que e outro dia, entao os dois nunca colidem
-- -- e clicar "Colocar no ar" duas vezes continua dando uma fatura so.

create or replace function public.go_live_contract(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_c            public.contracts%rowtype;
  v_p            public.proposals%rowtype;
  v_trial_days   integer;
  v_trial_end    timestamptz;
  v_setup_inv    uuid;
  v_setup_total  numeric(12,2) := 0;
  v_card         uuid;
  v_previsto     date;
  v_due          date;
  v_charged      boolean;
  v_first_inv    uuid;
  v_monthly      numeric(12,2) := 0;
  v_first_total  numeric(12,2) := 0;
  v_period_key   text;
  v_period_end   timestamptz;
  v_to_charge    uuid[] := '{}';
begin
  select * into v_c from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;

  select * into v_p from public.proposals where id = v_c.proposal_id;
  select id, golive_previsto into v_card, v_previsto
    from public.onboardings where equipe_id = v_c.equipe_id;

  -- Idempotente: clicar duas vezes nao da dois trials nem duas faturas.
  if v_c.went_live_at is not null then
    select id, (asaas_payment_id is not null) into v_setup_inv, v_charged
      from public.invoices
     where contract_id = p_contract_id and kind = 'setup' and status <> 'void'
     limit 1;

    if v_setup_inv is not null and not v_charged then
      v_to_charge := array_append(v_to_charge, v_setup_inv);
    end if;

    -- A primeira mensalidade tambem pode ter ficado sem cobranca (gateway fora
    -- do ar no clique anterior). Reoferece para cobranca, sem emitir outra.
    select id into v_first_inv
      from public.invoices
     where contract_id = p_contract_id and kind = 'recurring'
       and status not in ('void','paid') and asaas_payment_id is null
     order by issued_at limit 1;
    if v_first_inv is not null then
      v_to_charge := array_append(v_to_charge, v_first_inv);
    end if;

    return jsonb_build_object(
      'already_live',      true,
      'equipe_id',         v_c.equipe_id,
      'contract_id',       p_contract_id,
      'status',            v_c.status,
      'trial_ends_at',     v_c.trial_ends_at,
      'setup_invoice_id',  v_setup_inv,
      'first_invoice_id',  v_first_inv,
      'charge_invoice_ids', to_jsonb(v_to_charge),
      'charge_now',        (array_length(v_to_charge, 1) > 0)
    );
  end if;

  if v_c.status not in ('draft','onboarding') then
    raise exception 'contract_not_in_onboarding' using errcode = 'P0001';
  end if;

  v_trial_days := greatest(coalesce(v_p.trial_days, 15), 0);
  v_trial_end  := date_trunc('day', now()) + make_interval(days => v_trial_days);
  -- Sem trial, o periodo corrente vai ate o dia 1 do mes que vem: e a partir
  -- dali que renewPeriods assume, e todo mes cai no dia 1.
  v_period_end := case when v_trial_days > 0 then v_trial_end
                       else date_trunc('month', now()) + interval '1 month' end;

  update public.contracts set
    went_live_at         = now(),
    status               = case when v_trial_days > 0 then 'trialing' else 'active' end,
    trial_ends_at        = case when v_trial_days > 0 then v_trial_end else null end,
    current_period_start = now(),
    current_period_end   = v_period_end
  where id = p_contract_id;

  -- A fatura de implantacao normalmente ja existe (o provisionamento a emite).
  -- Este ramo cobre a proposta que deixou de ser isenta depois de provisionada,
  -- e os contratos criados antes deste sprint.
  select id into v_setup_inv from public.invoices
   where contract_id = p_contract_id and kind = 'setup' and status <> 'void' limit 1;

  v_setup_total := case when coalesce(v_p.setup_waived, false) then 0 else coalesce(v_p.setup_price, 0) end;

  if v_setup_inv is null and v_setup_total > 0 then
    insert into public.invoices (
      equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at
    ) values (
      v_c.equipe_id, p_contract_id, 'setup', 'open',
      v_setup_total, v_setup_total, coalesce(v_previsto, current_date + 5), now()
    ) returning id into v_setup_inv;

    insert into public.invoice_items (invoice_id, description, quantity, unit_price, total)
    values (v_setup_inv,
            'Implantacao - discovery, treinamento do agente, conexao de canais, arquitetura do CRM e integracao de anuncios',
            1, v_setup_total, v_setup_total);
  end if;

  -- Se a implantacao atrasou, o vencimento previsto ja passou. Emitir um boleto
  -- nascido vencido e pior do que nao emitir: o cliente recebe uma cobranca em
  -- atraso no dia em que o produto ficou pronto.
  if v_setup_inv is not null then
    select due_date, (asaas_payment_id is not null) into v_due, v_charged
      from public.invoices where id = v_setup_inv;

    if not v_charged and v_due < current_date + 3 then
      update public.invoices set due_date = current_date + 3 where id = v_setup_inv;
    end if;

    -- A espera acabou. Daqui em diante ela e uma fatura comum, e se a cobranca
    -- falhar o billing-cron deve mesmo anula-la e reemitir -- que e o
    -- comportamento correto para entulho de gateway.
    update public.invoices
       set metadata = metadata - 'awaiting_golive'
     where id = v_setup_inv;

    if not v_charged then
      v_to_charge := array_append(v_to_charge, v_setup_inv);
    end if;
  end if;

  -- ── A PRIMEIRA MENSALIDADE, quando nao ha trial ───────────────────────────
  --
  -- O buraco que este arquivo fecha. Com trial, endTrials emite quando ele
  -- acaba. Sem trial, ninguem emitia -- e o cliente usava o mes inteiro de
  -- graca.
  --
  -- Proporcional pelo mesmo motivo do fim de trial: o proximo ciclo cai no dia
  -- 1, entao esta fatura cobre so os dias que faltam deste mes.
  if v_trial_days = 0 then
    select coalesce(sum(ci.unit_price * ci.quantity), 0) into v_monthly
      from public.contract_items ci
     where ci.contract_id = p_contract_id and ci.period = 'monthly';

    if v_monthly > 0 then
      v_period_key  := to_char(current_date, 'YYYY-MM-DD');
      v_first_total := public.prorated_amount(v_monthly, now());

      -- Uma fatura por contrato por go-live. renewPeriods usa
      -- current_period_end como chave, que e outra data: nunca colidem.
      select id into v_first_inv from public.invoices
       where contract_id = p_contract_id and kind = 'recurring'
         and metadata @> jsonb_build_object('period_key', v_period_key)
       limit 1;

      if v_first_inv is null then
        insert into public.invoices (
          equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at, metadata
        ) values (
          v_c.equipe_id, p_contract_id, 'recurring', 'open',
          v_first_total, v_first_total, current_date + 5, now(),
          jsonb_build_object('period_key', v_period_key, 'prorated', true, 'first_period', true)
        ) returning id into v_first_inv;

        insert into public.invoice_items (invoice_id, description, quantity, unit_price, total)
        values (v_first_inv,
                'Assinatura - de ' || to_char(current_date, 'DD/MM/YYYY') || ' ate o fim do mes',
                1, v_first_total, v_first_total);
      end if;

      v_to_charge := array_append(v_to_charge, v_first_inv);
    end if;
  end if;

  if v_card is not null then
    update public.onboardings set
      stage_id     = public.onboarding_stage_id('ativo'),
      went_live_at = now(),
      health       = 'on_track',
      blocked_reason = null
    where id = v_card;
  end if;

  return jsonb_build_object(
    'already_live',      false,
    'equipe_id',         v_c.equipe_id,
    'contract_id',       p_contract_id,
    'status',            case when v_trial_days > 0 then 'trialing' else 'active' end,
    'trial_ends_at',     case when v_trial_days > 0 then v_trial_end else null end,
    'trial_days',        v_trial_days,
    'setup_invoice_id',  v_setup_inv,
    'setup_total',       v_setup_total,
    'first_invoice_id',  v_first_inv,
    'first_total',       v_first_total,
    'monthly_total',     v_monthly,
    'onboarding_id',     v_card,
    -- Tudo o que precisa de cobranca no gateway, numa lista so. No go-live
    -- cobramos QUALQUER fatura ainda sem cobranca, nao so as 'on_golive': se o
    -- gateway falhou no aceite, este e o momento natural de tentar de novo.
    'charge_invoice_ids', to_jsonb(v_to_charge),
    'charge_now',        (array_length(v_to_charge, 1) > 0)
  );
end;
$fn$;

comment on function public.go_live_contract(uuid) is
  'Sprint 8.2 - a transacao do go-live: went_live_at, trial (ou a primeira mensalidade proporcional quando trial_days=0), fatura de implantacao e card para Ativo. Devolve charge_invoice_ids com tudo que a edge function precisa cobrar.';

revoke all on function public.go_live_contract(uuid) from public, anon;
grant execute on function public.go_live_contract(uuid) to service_role;

-- ============================================================================
-- ASSERCOES
-- ============================================================================

do $$
declare
  v_eq    uuid;
  v_prop  uuid;
  v_c     uuid;
  v_plan  uuid;
  v_g     jsonb;
  v_cnt   integer;
  v_num   numeric;
  v_txt   text;
begin
  select id into v_plan from public.billing_products where kind = 'plan' limit 1;

  -- ── (a) SEM TRIAL: a primeira mensalidade sai no go-live ──────────────────
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t825_sem_trial__', '/crm', '/suporte') returning id into v_eq;
  insert into public.proposals (cliente_nome, cliente_email, status, setup_price,
                                monthly_price, trial_days, setup_charge_timing, equipe_id)
  values ('__t825_sem_trial__', 'a@a.com', 'aceita', 0, 300.00, 0, 'on_accept', v_eq)
  returning id into v_prop;
  insert into public.contracts (equipe_id, proposal_id, status, started_at)
  values (v_eq, v_prop, 'onboarding', now()) returning id into v_c;
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  values (v_c, v_plan, 1, 300.00, 'monthly');

  v_g := public.go_live_contract(v_c);

  assert (v_g->>'status') = 'active',
    format('ASSERT FAILED: sem trial o contrato ficou %s, esperava active', v_g->>'status');
  assert (v_g->>'first_invoice_id') is not null,
    'ASSERT FAILED: sem trial, o go-live nao emitiu a primeira mensalidade -- o bug que esta migration corrige';

  select total, status into v_num, v_txt from public.invoices where id = (v_g->>'first_invoice_id')::uuid;
  assert v_txt = 'open',
    format('ASSERT FAILED: a primeira mensalidade nasceu %s, esperava open', v_txt);
  -- proporcional: nunca mais que o mes cheio, e maior que zero
  assert v_num > 0 and v_num <= 300.00,
    format('ASSERT FAILED: primeira mensalidade %s fora da faixa (0, 300]', v_num);
  assert v_num = public.prorated_amount(300.00, now()),
    format('ASSERT FAILED: %s nao bate com prorated_amount', v_num);

  -- ela entra na lista de cobranca
  assert (v_g->'charge_invoice_ids') ? (v_g->>'first_invoice_id'),
    'ASSERT FAILED: a primeira mensalidade nao foi oferecida para cobranca';

  -- ── (b) IDEMPOTENTE: colocar no ar de novo nao emite outra ────────────────
  v_g := public.go_live_contract(v_c);
  assert (v_g->>'already_live')::boolean, 'ASSERT FAILED: o segundo go-live nao foi idempotente';
  select count(*) into v_cnt from public.invoices where contract_id = v_c and kind = 'recurring';
  assert v_cnt = 1, format('ASSERT FAILED: %s mensalidades apos dois go-lives, esperava 1', v_cnt);

  delete from public.equipes where id = v_eq;
  delete from public.proposals where id = v_prop;

  -- ── (c) COM TRIAL: nada de mensalidade agora; quem cobra e o fim do trial ──
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t825_com_trial__', '/crm', '/suporte') returning id into v_eq;
  insert into public.proposals (cliente_nome, cliente_email, status, setup_price,
                                monthly_price, trial_days, setup_charge_timing, equipe_id)
  values ('__t825_com_trial__', 'b@b.com', 'aceita', 0, 300.00, 15, 'on_accept', v_eq)
  returning id into v_prop;
  insert into public.contracts (equipe_id, proposal_id, status, started_at)
  values (v_eq, v_prop, 'onboarding', now()) returning id into v_c;
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  values (v_c, v_plan, 1, 300.00, 'monthly');

  v_g := public.go_live_contract(v_c);

  assert (v_g->>'status') = 'trialing',
    format('ASSERT FAILED: com trial o contrato ficou %s', v_g->>'status');
  assert (v_g->>'first_invoice_id') is null,
    'ASSERT FAILED: com trial de 15 dias, o go-live cobrou a mensalidade na hora';
  select count(*) into v_cnt from public.invoices where contract_id = v_c and kind = 'recurring';
  assert v_cnt = 0, format('ASSERT FAILED: %s mensalidades num contrato em trial', v_cnt);

  delete from public.equipes where id = v_eq;
  delete from public.proposals where id = v_prop;

  raise notice 'Sprint 8.2 - go-live emite a primeira mensalidade: assercoes passaram';
end $$;
