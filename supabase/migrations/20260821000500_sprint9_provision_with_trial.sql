-- 20260821000500_sprint9_provision_with_trial.sql
-- Sprint 9 · provisioning honours the plan the CLIENT chose, the setup terms,
-- and starts the trial at go-live.
--
-- Three behavioural changes from the Sprint 8 version:
--
-- 1. The contract is built from `proposals.chosen_plan_code` when the client
--    picked a tier on the proposal page. The old version copied proposal_items
--    blindly, which cannot express "here are three options, you decide".
--
-- 2. The contract starts as `trialing`, not `active`. The clock begins at
--    go-live because that is the first moment the client has a real product —
--    an agent that is trained, channels that are connected, a CRM that is built.
--    Starting it at signature would spend most of the trial on a half-built
--    product and let the client judge the product by that.
--
-- 3. The setup invoice respects setup_waived and setup_charge_timing. Waiving is
--    a decision, not an accident, and `on_golive` exists for deals where the
--    client will not pay before seeing it work — at the cost of doing the labour
--    first.

create or replace function public.provision_tenant_from_proposal(
  p_proposal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_p          public.proposals%rowtype;
  v_accept     public.proposal_acceptances%rowtype;
  v_equipe     uuid;
  v_contract   uuid;
  v_setup_inv  uuid;
  v_monthly    numeric(12,2) := 0;
  v_item       record;
  v_plan       public.billing_products%rowtype;
  v_trial_end  timestamptz;
  v_doc        text;
  v_doc_type   text;
begin
  select * into v_p from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0001';
  end if;
  if v_p.status <> 'aceita' then
    raise exception 'proposal_not_accepted' using errcode = 'P0001';
  end if;

  if v_p.equipe_id is not null then
    select id into v_contract from public.contracts
     where proposal_id = p_proposal_id order by created_at limit 1;
    if v_contract is not null then
      select id into v_setup_inv from public.invoices
       where contract_id = v_contract and kind = 'setup' limit 1;
      return jsonb_build_object(
        'already_provisioned', true,
        'equipe_id', v_p.equipe_id,
        'contract_id', v_contract,
        'setup_invoice_id', v_setup_inv,
        'recurring_invoice_id', null
      );
    end if;
  end if;

  select * into v_accept from public.proposal_acceptances where proposal_id = p_proposal_id;

  -- 1. team ------------------------------------------------------------------
  insert into public.equipes (nome, crm_link, suporte_link)
  values (v_p.cliente_nome, '/crm', '/suporte')
  returning id into v_equipe;

  -- 2. billing account -------------------------------------------------------
  v_doc := regexp_replace(coalesce(v_accept.accepted_doc, v_p.cliente_doc, ''), '[^0-9]', '', 'g');
  v_doc_type := case
    when length(v_doc) = 14 then 'CNPJ'
    when length(v_doc) = 11 then 'CPF'
    else null
  end;

  insert into public.billing_accounts (
    equipe_id, doc_type, doc_number, legal_name, billing_email, phone
  ) values (
    v_equipe, v_doc_type,
    case when v_doc_type is null then null else v_doc end,
    coalesce(v_accept.accepted_name, v_p.cliente_nome),
    v_p.cliente_email, v_p.cliente_whatsapp
  );

  -- 3. contract, in TRIAL ----------------------------------------------------
  -- Provisioning IS go-live: this runs when the implementation is delivered.
  v_trial_end := date_trunc('day', now()) + make_interval(days => greatest(coalesce(v_p.trial_days, 15), 0));

  insert into public.contracts (
    equipe_id, proposal_id, status, term_months,
    started_at, went_live_at, trial_ends_at,
    current_period_start, current_period_end
  ) values (
    v_equipe, p_proposal_id,
    case when coalesce(v_p.trial_days, 15) > 0 then 'trialing' else 'active' end,
    v_p.term_months,
    now(), now(),
    case when coalesce(v_p.trial_days, 15) > 0 then v_trial_end else null end,
    now(),
    case when coalesce(v_p.trial_days, 15) > 0 then v_trial_end
         else date_trunc('month', now()) + interval '1 month' end
  ) returning id into v_contract;

  -- 4. what they actually bought --------------------------------------------
  -- The tier the CLIENT chose wins over anything pre-filled on the proposal.
  if v_p.chosen_plan_code is not null then
    select * into v_plan from public.billing_products
     where code = v_p.chosen_plan_code and kind = 'plan';
    if found then
      insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
      values (v_contract, v_plan.id, 1, v_plan.list_price, 'monthly');
      v_monthly := v_plan.list_price;
    end if;
  end if;

  -- Non-plan lines from the proposal (instances, extra hours) always carry over
  -- at their NEGOTIATED price.
  for v_item in
    select pi.*, bp.kind as product_kind
    from public.proposal_items pi
    left join public.billing_products bp on bp.id = pi.product_id
    where pi.proposal_id = p_proposal_id
  loop
    if v_plan.id is not null and v_item.product_id = v_plan.id then
      continue;  -- already added above
    end if;
    if v_item.product_kind = 'plan' and v_p.chosen_plan_code is not null then
      continue;  -- the client's choice supersedes a pre-filled plan
    end if;

    insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
    values (v_contract, v_item.product_id, v_item.quantity, v_item.unit_price, v_item.period);

    if v_item.period = 'monthly' then
      v_monthly := v_monthly + (v_item.unit_price * v_item.quantity);
    end if;
  end loop;

  -- A proposal with neither a chosen plan nor line items still sells its
  -- headline monthly price.
  if v_monthly = 0 and coalesce(v_p.monthly_price, 0) > 0 then
    v_monthly := v_p.monthly_price;
    insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
    values (v_contract, null, 1, v_p.monthly_price, 'monthly');
  end if;

  -- 5. setup -----------------------------------------------------------------
  -- Waived is a decision; timing decides whether the invoice exists yet. With
  -- 'on_accept' the charge was already raised at acceptance, so provisioning
  -- does not raise a second one.
  if not v_p.setup_waived and coalesce(v_p.setup_price, 0) > 0
     and v_p.setup_charge_timing = 'on_golive' then
    insert into public.invoices (
      equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at
    ) values (
      v_equipe, v_contract, 'setup', 'open',
      v_p.setup_price, v_p.setup_price, current_date + 5, now()
    ) returning id into v_setup_inv;

    insert into public.invoice_items (invoice_id, description, quantity, unit_price, total)
    values (v_setup_inv,
            'Implantação — discovery, treinamento do agente, conexão de canais, arquitetura do CRM e integração de anúncios',
            1, v_p.setup_price, v_p.setup_price);
  end if;

  -- NOTE: no recurring invoice here. The first one is raised by billing-cron
  -- when the trial ends, prorated to the end of that month, so every invoice
  -- after it lands on day 1.

  update public.proposals set equipe_id = v_equipe, updated_at = now()
   where id = p_proposal_id;

  return jsonb_build_object(
    'already_provisioned', false,
    'equipe_id', v_equipe,
    'contract_id', v_contract,
    'setup_invoice_id', v_setup_inv,
    'recurring_invoice_id', null,
    'trial_ends_at', v_trial_end,
    'monthly_total', v_monthly,
    'setup_total', case when v_p.setup_waived then 0 else coalesce(v_p.setup_price, 0) end
  );
end;
$fn$;

-- ============================================================================
-- ASSERTIONS
-- ============================================================================

do $$
declare
  v_prop uuid; v_r jsonb; v_cnt integer; v_status text; v_monthly numeric;
begin
  -- (a) the CLIENT's choice becomes the contract, not the pre-filled plan
  insert into public.proposals (cliente_nome, cliente_doc, setup_price, monthly_price,
                                term_months, status, allow_plan_choice, chosen_plan_code,
                                trial_days, setup_charge_timing)
  values ('__t9_choice__','12345678000199', 2000.00, 0, 12, 'aceita', true, 'plan_scale', 15, 'on_golive')
  returning id into v_prop;
  insert into public.proposal_acceptances (proposal_id, terms_snapshot, accepted_name)
  values (v_prop, '{}'::jsonb, 'Cliente');

  v_r := public.provision_tenant_from_proposal(v_prop);

  select sum(ci.unit_price * ci.quantity) into v_monthly
    from public.contract_items ci where ci.contract_id = (v_r->>'contract_id')::uuid;
  assert v_monthly = 1000.00,
    format('ASSERT FAILED: chosen plan Scale should bill 1000.00, got %s', v_monthly);

  -- (b) the contract starts in TRIAL, not active
  select status into v_status from public.contracts where id = (v_r->>'contract_id')::uuid;
  assert v_status = 'trialing', format('ASSERT FAILED: contract status %s, expected trialing', v_status);
  assert (v_r->>'trial_ends_at') is not null, 'ASSERT FAILED: no trial end recorded';

  -- (c) NO recurring invoice yet — the first one comes when the trial ends
  select count(*) into v_cnt from public.invoices
   where contract_id = (v_r->>'contract_id')::uuid and kind = 'recurring';
  assert v_cnt = 0, 'ASSERT FAILED: a recurring invoice was raised during the trial';

  -- ...but the setup invoice exists, because this deal charges on go-live
  select count(*) into v_cnt from public.invoices
   where contract_id = (v_r->>'contract_id')::uuid and kind = 'setup';
  assert v_cnt = 1, 'ASSERT FAILED: setup invoice missing for an on_golive proposal';

  delete from public.equipes where id = (v_r->>'equipe_id')::uuid;
  delete from public.proposals where id = v_prop;

  -- (d) a WAIVED setup raises no invoice at all
  insert into public.proposals (cliente_nome, setup_price, monthly_price, status,
                                chosen_plan_code, setup_waived, setup_charge_timing, trial_days)
  values ('__t9_waived__', 2000.00, 0, 'aceita', 'plan_starter', true, 'on_golive', 15)
  returning id into v_prop;
  insert into public.proposal_acceptances (proposal_id, terms_snapshot, accepted_name)
  values (v_prop, '{}'::jsonb, 'Cliente');

  v_r := public.provision_tenant_from_proposal(v_prop);
  select count(*) into v_cnt from public.invoices
   where contract_id = (v_r->>'contract_id')::uuid and kind = 'setup';
  assert v_cnt = 0, 'ASSERT FAILED: a waived setup still produced an invoice';
  assert (v_r->>'setup_total')::numeric = 0, 'ASSERT FAILED: waived setup reported a total';

  delete from public.equipes where id = (v_r->>'equipe_id')::uuid;
  delete from public.proposals where id = v_prop;
  raise notice 'Sprint 9 provisioning assertions passed';
end $$;
