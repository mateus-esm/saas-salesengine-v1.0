-- 20260819000550_sprint8_provision.sql
-- Sprint 8 · T9 — atomic provisioning from an accepted proposal.
--
-- WHY A DATABASE FUNCTION: provisioning creates a team, a billing account, a
-- contract, its items and two invoices. The Supabase client cannot wrap those in
-- one transaction, so a failure halfway would leave a team with a contract and
-- no invoice — a customer who exists but can never be billed. Inside plpgsql it
-- is one atomic unit.
--
-- The external steps (gateway charge, auth invite) stay in the edge function and
-- run AFTER this commits, because they cannot be rolled back.

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
  v_rec_inv    uuid;
  v_monthly    numeric(12,2) := 0;
  v_item       record;
  v_period_end timestamptz;
  v_doc        text;
  v_doc_type   text;
begin
  -- Lock the proposal: two operators clicking "Provisionar" at the same moment
  -- must not create two teams.
  select * into v_p from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0001';
  end if;
  if v_p.status <> 'aceita' then
    raise exception 'proposal_not_accepted' using errcode = 'P0001';
  end if;

  -- IDEMPOTENCY: if this proposal already produced a contract, return it rather
  -- than duplicating. Lets the edge function safely resume after a failed
  -- invite or gateway call.
  if v_p.equipe_id is not null then
    select id into v_contract from public.contracts
     where proposal_id = p_proposal_id
     order by created_at limit 1;
    if v_contract is not null then
      select id into v_setup_inv from public.invoices
       where contract_id = v_contract and kind = 'setup' limit 1;
      select id into v_rec_inv from public.invoices
       where contract_id = v_contract and kind = 'recurring' order by created_at limit 1;
      return jsonb_build_object(
        'already_provisioned', true,
        'equipe_id', v_p.equipe_id,
        'contract_id', v_contract,
        'setup_invoice_id', v_setup_inv,
        'recurring_invoice_id', v_rec_inv
      );
    end if;
  end if;

  select * into v_accept from public.proposal_acceptances where proposal_id = p_proposal_id;

  -- 1. team ------------------------------------------------------------------
  insert into public.equipes (nome, crm_link, suporte_link)
  values (v_p.cliente_nome, '/crm', '/suporte')
  returning id into v_equipe;

  -- 2. billing account -------------------------------------------------------
  -- Prefer the document actually typed at acceptance; fall back to the proposal.
  v_doc := regexp_replace(coalesce(v_accept.accepted_doc, v_p.cliente_doc, ''), '[^0-9]', '', 'g');
  v_doc_type := case
    when length(v_doc) = 14 then 'CNPJ'
    when length(v_doc) = 11 then 'CPF'
    else null
  end;

  insert into public.billing_accounts (
    equipe_id, doc_type, doc_number, legal_name, billing_email, phone
  ) values (
    v_equipe,
    v_doc_type,
    case when v_doc_type is null then null else v_doc end,
    coalesce(v_accept.accepted_name, v_p.cliente_nome),
    v_p.cliente_email,
    v_p.cliente_whatsapp
  );

  -- 3. contract --------------------------------------------------------------
  v_period_end := date_trunc('day', now()) + interval '1 month';

  insert into public.contracts (
    equipe_id, proposal_id, status, term_months,
    started_at, current_period_start, current_period_end
  ) values (
    v_equipe, p_proposal_id, 'active', v_p.term_months,
    now(), now(), v_period_end
  ) returning id into v_contract;

  -- 4. contract items — the NEGOTIATED price, copied from the proposal --------
  for v_item in
    select * from public.proposal_items where proposal_id = p_proposal_id
  loop
    insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
    values (v_contract, v_item.product_id, v_item.quantity, v_item.unit_price, v_item.period);

    if v_item.period = 'monthly' then
      v_monthly := v_monthly + (v_item.unit_price * v_item.quantity);
    end if;
  end loop;

  -- A proposal with no line items still sells its headline monthly price.
  if v_monthly = 0 and coalesce(v_p.monthly_price, 0) > 0 then
    v_monthly := v_p.monthly_price;
    insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
    values (v_contract, null, 1, v_p.monthly_price, 'monthly');
  end if;

  -- 5. setup invoice ---------------------------------------------------------
  if coalesce(v_p.setup_price, 0) > 0 then
    insert into public.invoices (
      equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at
    ) values (
      v_equipe, v_contract, 'setup', 'open',
      v_p.setup_price, v_p.setup_price, current_date + 3, now()
    ) returning id into v_setup_inv;

    insert into public.invoice_items (invoice_id, description, quantity, unit_price, total)
    values (v_setup_inv, 'Implantação', 1, v_p.setup_price, v_p.setup_price);
  end if;

  -- 6. first recurring invoice ----------------------------------------------
  if v_monthly > 0 then
    insert into public.invoices (
      equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at, metadata
    ) values (
      v_equipe, v_contract, 'recurring', 'open',
      v_monthly, v_monthly, current_date + 3, now(),
      jsonb_build_object('period_key', to_char(v_period_end, 'YYYY-MM-DD'))
    ) returning id into v_rec_inv;

    insert into public.invoice_items (invoice_id, product_id, description, quantity, unit_price, total)
    select v_rec_inv, ci.product_id,
           coalesce(bp.name, 'Assinatura mensal'),
           ci.quantity, ci.unit_price, ci.unit_price * ci.quantity
    from public.contract_items ci
    left join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = v_contract and ci.period = 'monthly';
  end if;

  -- 7. link the proposal -----------------------------------------------------
  update public.proposals set equipe_id = v_equipe, updated_at = now()
   where id = p_proposal_id;

  return jsonb_build_object(
    'already_provisioned', false,
    'equipe_id', v_equipe,
    'contract_id', v_contract,
    'setup_invoice_id', v_setup_inv,
    'recurring_invoice_id', v_rec_inv,
    'monthly_total', v_monthly,
    'setup_total', coalesce(v_p.setup_price, 0)
  );
end;
$fn$;

comment on function public.provision_tenant_from_proposal(uuid) is
  'Sprint 8 T9 · atomic: team + billing account + contract + items + invoices. Idempotent per proposal. External steps (gateway, auth invite) run after this commits.';

-- ============================================================================
-- ASSERTIONS
-- ============================================================================

do $$
declare
  v_prop uuid;
  v_r1   jsonb;
  v_r2   jsonb;
  v_cnt  integer;
begin
  insert into public.proposals (cliente_nome, cliente_email, cliente_doc,
                                setup_price, monthly_price, term_months, status)
  values ('__t9_assert__', 'x@y.com', '12345678000199', 2000.00, 400.00, 12, 'aceita')
  returning id into v_prop;

  insert into public.proposal_items (proposal_id, label, quantity, unit_price, period)
  values (v_prop, 'Agente IA', 1, 300.00, 'monthly'),
         (v_prop, 'CRM',       1, 100.00, 'monthly');

  insert into public.proposal_acceptances (proposal_id, terms_snapshot, accepted_name, accepted_doc)
  values (v_prop, '{"monthly":400}'::jsonb, 'Cliente Teste', '12.345.678/0001-99');

  v_r1 := public.provision_tenant_from_proposal(v_prop);

  -- (a) everything was created
  assert (v_r1->>'already_provisioned')::boolean = false, 'ASSERT FAILED: first run claimed already provisioned';
  assert v_r1->>'equipe_id' is not null, 'ASSERT FAILED: no team created';
  assert (v_r1->>'monthly_total')::numeric = 400.00,
    format('ASSERT FAILED: monthly total %s, expected 400.00', v_r1->>'monthly_total');

  -- (b) the negotiated price came across, not a catalog price
  select count(*) into v_cnt from public.contract_items
   where contract_id = (v_r1->>'contract_id')::uuid and unit_price in (300.00, 100.00);
  assert v_cnt = 2, format('ASSERT FAILED: expected 2 negotiated items, got %s', v_cnt);

  -- (c) both invoices exist and are open
  select count(*) into v_cnt from public.invoices
   where contract_id = (v_r1->>'contract_id')::uuid and status = 'open';
  assert v_cnt = 2, format('ASSERT FAILED: expected 2 open invoices, got %s', v_cnt);

  -- (d) the CNPJ typed at acceptance was normalised to digits
  select count(*) into v_cnt from public.billing_accounts
   where equipe_id = (v_r1->>'equipe_id')::uuid and doc_type = 'CNPJ' and doc_number = '12345678000199';
  assert v_cnt = 1, 'ASSERT FAILED: billing account document not normalised';

  -- (e) THE IDEMPOTENCY GUARANTEE: clicking Provisionar twice must not create a
  -- second team or bill the customer twice.
  v_r2 := public.provision_tenant_from_proposal(v_prop);
  assert (v_r2->>'already_provisioned')::boolean = true, 'ASSERT FAILED: second run re-provisioned';
  assert v_r2->>'equipe_id' = v_r1->>'equipe_id', 'ASSERT FAILED: second run created a different team';
  select count(*) into v_cnt from public.invoices where equipe_id = (v_r1->>'equipe_id')::uuid;
  assert v_cnt = 2, format('ASSERT FAILED: re-run duplicated invoices (%s total)', v_cnt);

  -- (f) an unaccepted proposal cannot be provisioned
  begin
    update public.proposals set status = 'enviada' where id = v_prop;
    perform public.provision_tenant_from_proposal(v_prop);
    raise exception 'ASSERT FAILED: an unaccepted proposal was provisioned';
  exception when sqlstate 'P0001' then null;
  end;

  delete from public.equipes where id = (v_r1->>'equipe_id')::uuid;
  delete from public.proposals where id = v_prop;
  raise notice 'T9 assertions passed';
end $$;
