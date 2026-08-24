-- 20260824000300_sprint83_admin_billing_ops.sql
-- Sprint 8.3 (Fixes 2, items 6/8/9/10) · the admin panel can finally operate
-- billing instead of only watching it.
--
-- WHAT WAS MISSING AND WHY IT MATTERED:
--
--   * No way to cancel an invoice. A charge raised by mistake stayed open
--     forever, went overdue on its own, and dragged the contract to `past_due`
--     — which suspends the tenant and pauses their agent. A typo became an
--     outage.
--
--   * No way to record a payment received outside Asaas. The founder takes PIX
--     directly often enough that this is normal, not exceptional; without it
--     the invoice stayed open, went overdue, and punished a customer who had
--     already paid.
--
--   * No way to bill something that is not in the catalogue. `kind = 'adhoc'`
--     was in the schema from Sprint 8 and nothing ever created one.
--
--   * No way to delete a proposal. The list only grows, and a test proposal
--     sits next to real ones.
--
-- DIVISION OF LABOUR: SQL owns authorisation and the state guards; the gateway
-- calls and the payment side effects stay in TypeScript, where they already
-- live. Every function here returns whatever the caller needs to finish the job
-- at Asaas — an `asaas_payment_id` to cancel, a customer id to charge — rather
-- than pretending Postgres can make an HTTP request.

-- ============================================================================
-- 1. CANCEL AN INVOICE
--
-- `void`, never delete. A paid invoice is an accounting record: if it can
-- vanish, last month's revenue changes retroactively and nothing can be
-- reconciled against the gateway's statement. Cancelling is reversible in the
-- sense that matters — the row and its reason survive.
--
-- Refuses a paid or refunded invoice outright. Undoing a payment is a refund,
-- which has its own effects (reversing the credits it granted) and belongs to
-- the refund path, not here.
-- ============================================================================

create or replace function public.admin_void_invoice(
  p_invoice_id uuid,
  p_reason     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.invoices%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0001';
  end if;

  if v_inv.status in ('paid', 'refunded') then
    raise exception 'invoice_already_paid' using errcode = 'P0001';
  end if;

  -- Idempotent: cancelling twice is not an error, and the caller still needs
  -- the payment id so it can retry the gateway half if that is what failed.
  if v_inv.status <> 'void' then
    update public.invoices
       set status = 'void',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'voided_reason', coalesce(p_reason, 'cancelada no painel admin'),
             'voided_by', auth.uid(),
             'voided_at', now()
           ),
           updated_at = now()
     where id = p_invoice_id;
  end if;

  -- If the contract was dragged to past_due only by this invoice, cancelling it
  -- must release the contract too — otherwise the tenant stays punished for a
  -- charge that no longer exists.
  if v_inv.contract_id is not null then
    update public.contracts c
       set status = 'active', past_due_since = null
     where c.id = v_inv.contract_id
       and c.status = 'past_due'
       and not exists (
         select 1 from public.invoices i
         where i.contract_id = c.id
           and i.status = 'overdue'
           and i.id <> p_invoice_id);
  end if;

  return jsonb_build_object(
    'id', v_inv.id,
    'number', v_inv.number,
    'status', 'void',
    -- The caller cancels this at Asaas. Leaving the charge live is the whole
    -- failure this function exists to prevent: the customer keeps getting
    -- billed for something we cancelled.
    'asaas_payment_id', v_inv.asaas_payment_id
  );
end;
$fn$;

comment on function public.admin_void_invoice(uuid, text) is
  'Sprint 8.3 · super-admin cancels an invoice. Never deletes: a paid invoice is an accounting record. Returns asaas_payment_id so the caller can cancel the charge at the gateway, and releases a contract left past_due by this invoice alone.';

-- ============================================================================
-- 2. DELETE AN INVOICE — DRAFTS ONLY
--
-- A draft that never reached the gateway was never a claim on anyone's money,
-- so it carries no accounting meaning and deleting it is honest cleanup. Every
-- other status must be cancelled instead. The `asaas_payment_id is null` check
-- is the real guarantee: if a charge exists, a customer may have seen it.
-- ============================================================================

create or replace function public.admin_delete_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.invoices%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0001';
  end if;

  if v_inv.status <> 'draft' or v_inv.asaas_payment_id is not null then
    raise exception 'invoice_not_deletable' using errcode = 'P0001';
  end if;

  delete from public.invoices where id = p_invoice_id;  -- items cascade

  return jsonb_build_object('id', p_invoice_id, 'deleted', true);
end;
$fn$;

comment on function public.admin_delete_invoice(uuid) is
  'Sprint 8.3 · super-admin permanently removes a DRAFT invoice that never reached the gateway. Anything a customer could have seen must be voided instead.';

-- ============================================================================
-- 3. AN INVOICE FOR SOMETHING THAT IS NOT IN THE CATALOGUE
--
-- `metadata.manual = true` is load-bearing, not decoration. billing-cron voids
-- any open invoice with no gateway charge after two hours, on the assumption
-- that it is the debris of a failed Asaas call. A deliberately created invoice
-- that the customer will pay by PIX looks exactly like that debris — without
-- the flag this feature would quietly delete its own output.
-- ============================================================================

create or replace function public.admin_create_adhoc_invoice(
  p_equipe_id   uuid,
  p_description text,
  p_amount      numeric,
  p_due_date    date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id       uuid;
  v_number   text;
  v_customer text;
  v_due      date;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'description_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.equipes where id = p_equipe_id) then
    raise exception 'equipe_not_found' using errcode = 'P0001';
  end if;

  insert into public.invoices (
    equipe_id, kind, status, subtotal, total, due_date, issued_at, metadata
  ) values (
    p_equipe_id, 'adhoc', 'open', p_amount, p_amount,
    coalesce(p_due_date, current_date + 5), now(),
    jsonb_build_object('manual', true, 'created_by', auth.uid())
  ) returning id, number, due_date into v_id, v_number, v_due;

  -- product_id stays null: that is what "not in the catalogue" means, and the
  -- column is nullable precisely for this.
  insert into public.invoice_items (invoice_id, product_id, description, quantity, unit_price, total)
  values (v_id, null, btrim(p_description), 1, p_amount, p_amount);

  select asaas_customer_id into v_customer
    from public.billing_accounts where equipe_id = p_equipe_id;

  return jsonb_build_object(
    'id', v_id,
    'number', v_number,
    'total', p_amount,
    'due_date', v_due,
    'description', btrim(p_description),
    -- Null means no gateway charge is possible for this tenant yet. The invoice
    -- is still valid; it just has to be settled by hand.
    'asaas_customer_id', v_customer
  );
end;
$fn$;

comment on function public.admin_create_adhoc_invoice(uuid, text, numeric, date) is
  'Sprint 8.3 · super-admin bills something outside the catalogue. Flags metadata.manual so billing-cron does not mistake it for the debris of a failed gateway call and void it.';

-- ============================================================================
-- 4. CORRECT AN INVOICE BEFORE IT IS PAID
--
-- Due date is always safe to move. The amount is not: an invoice with several
-- lines cannot be re-priced through a single number without silently throwing
-- the other lines away, so that case is refused and the operator is told to
-- cancel and reissue. Refusing is better than guessing at what the customer
-- owes.
-- ============================================================================

create or replace function public.admin_update_invoice(
  p_invoice_id  uuid,
  p_due_date    date default null,
  p_description text default null,
  p_amount      numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv   public.invoices%rowtype;
  v_items integer;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0001';
  end if;
  if v_inv.status not in ('draft', 'open', 'overdue') then
    raise exception 'invoice_not_editable' using errcode = 'P0001';
  end if;

  if p_amount is not null then
    if p_amount <= 0 then
      raise exception 'invalid_amount' using errcode = 'P0001';
    end if;

    select count(*) into v_items from public.invoice_items where invoice_id = p_invoice_id;
    if v_items > 1 then
      raise exception 'invoice_has_multiple_items' using errcode = 'P0001';
    end if;

    delete from public.invoice_items where invoice_id = p_invoice_id;
    insert into public.invoice_items (invoice_id, product_id, description, quantity, unit_price, total)
    values (p_invoice_id, null,
            coalesce(nullif(btrim(p_description), ''), 'Cobrança'),
            1, p_amount, p_amount);

    update public.invoices
       set subtotal = p_amount, total = p_amount, updated_at = now()
     where id = p_invoice_id;

  elsif p_description is not null and btrim(p_description) <> '' then
    -- Description alone, same money.
    update public.invoice_items
       set description = btrim(p_description)
     where invoice_id = p_invoice_id;
  end if;

  if p_due_date is not null then
    update public.invoices
       set due_date = p_due_date,
           -- An invoice that went overdue and gets a new future date is open
           -- again; leaving it 'overdue' would keep dunning a live charge.
           status = case when status = 'overdue' and p_due_date >= current_date
                         then 'open' else status end,
           updated_at = now()
     where id = p_invoice_id;
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id;

  return jsonb_build_object(
    'id', v_inv.id,
    'number', v_inv.number,
    'status', v_inv.status,
    'total', v_inv.total,
    'due_date', v_inv.due_date,
    'asaas_payment_id', v_inv.asaas_payment_id
  );
end;
$fn$;

comment on function public.admin_update_invoice(uuid, date, text, numeric) is
  'Sprint 8.3 · super-admin corrects an unpaid invoice. Refuses to re-price a multi-line invoice through a single amount — that one has to be cancelled and reissued.';

-- ============================================================================
-- 5. GUARD FOR A PAYMENT RECEIVED OUTSIDE THE GATEWAY
--
-- The effects of "this invoice was paid" — granting the plan's credits, rolling
-- the contract period, resuming the agent — live in TypeScript because that is
-- where they already were for the Asaas webhook, and there must be exactly ONE
-- implementation of them. Duplicating them in SQL is how an invoice marked paid
-- in the admin panel would end up granting nothing, which is the same shape of
-- bug Sprint 8.2 was spent fixing.
--
-- So this function does not apply anything. It authorises, checks the state is
-- payable, and hands back the row the shared TypeScript needs.
-- ============================================================================

create or replace function public.admin_invoice_for_payment(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inv public.invoices%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0001';
  end if;
  if v_inv.status in ('paid', 'refunded') then
    raise exception 'invoice_already_paid' using errcode = 'P0001';
  end if;
  if v_inv.status = 'void' then
    raise exception 'invoice_void' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', v_inv.id,
    'equipe_id', v_inv.equipe_id,
    'contract_id', v_inv.contract_id,
    'kind', v_inv.kind,
    'status', v_inv.status,
    'total', v_inv.total,
    'metadata', coalesce(v_inv.metadata, '{}'::jsonb)
  );
end;
$fn$;

comment on function public.admin_invoice_for_payment(uuid) is
  'Sprint 8.3 · authorises and validates marking an invoice paid by hand, and returns the row. Applies nothing: the effects live once, in _shared/invoice-effects.ts, shared with the Asaas webhook.';

-- ============================================================================
-- 6. DELETE A PROPOSAL
--
-- `proposals.equipe_id` is set by provisioning and is the only durable link
-- between a proposal and the tenant it created. A provisioned proposal is
-- therefore the origin document of a live contract: deleting it would orphan
-- the contract's history, so it is refused. Cancel the contract instead.
-- ============================================================================

create or replace function public.admin_delete_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_p public.proposals%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_p from public.proposals where id = p_proposal_id;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0001';
  end if;

  if v_p.equipe_id is not null then
    raise exception 'proposal_provisioned' using errcode = 'P0001';
  end if;

  delete from public.proposal_items where proposal_id = p_proposal_id;
  delete from public.proposals where id = p_proposal_id;

  return jsonb_build_object('id', p_proposal_id, 'deleted', true, 'codigo', v_p.codigo);
end;
$fn$;

comment on function public.admin_delete_proposal(uuid) is
  'Sprint 8.3 · super-admin removes a proposal that never became a tenant. A provisioned proposal is the origin document of a live contract and is refused.';

-- ============================================================================
-- 7. GRANTS
--
-- SECURITY DEFINER functions are reachable over PostgREST, so `anon` must not
-- hold execute on any of them. Each also gates on is_super_admin() internally —
-- the grant is the outer fence, the gate is the real one.
-- ============================================================================

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.admin_void_invoice(uuid, text)',
    'public.admin_delete_invoice(uuid)',
    'public.admin_create_adhoc_invoice(uuid, text, numeric, date)',
    'public.admin_update_invoice(uuid, date, text, numeric)',
    'public.admin_invoice_for_payment(uuid)',
    'public.admin_delete_proposal(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated, service_role', v_sig);
  end loop;
end $$;

-- ============================================================================
-- 8. ASSERTIONS
--
-- Run twice over: once as the migration owner (who is NOT a super admin) to
-- prove every gate holds, then again while impersonating a real super admin to
-- prove the behaviour. The second half is skipped when the base has no super
-- admin, so this migration still applies to an empty database.
-- ============================================================================

do $$
declare
  v_e uuid; v_i uuid; v_p uuid; v_c uuid;
  v_admin uuid; v_r jsonb; v_txt text; v_cnt integer;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t83_ops__','x','x') returning id into v_e;

  insert into public.invoices (equipe_id, kind, status, subtotal, total, due_date)
  values (v_e, 'adhoc', 'open', 100, 100, current_date + 5) returning id into v_i;

  -- (a) every entry point refuses a caller who is not a super admin
  begin
    perform public.admin_void_invoice(v_i, 'teste');
    raise exception 'ASSERT FAILED: admin_void_invoice ran without super admin';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_txt = message_text;
    assert v_txt = 'forbidden', format('ASSERT FAILED: expected forbidden, got %s', v_txt);
  end;

  begin
    perform public.admin_create_adhoc_invoice(v_e, 'teste', 10, null);
    raise exception 'ASSERT FAILED: admin_create_adhoc_invoice ran without super admin';
  exception when sqlstate 'P0001' then null;
  end;

  begin
    perform public.admin_delete_proposal(gen_random_uuid());
    raise exception 'ASSERT FAILED: admin_delete_proposal ran without super admin';
  exception when sqlstate 'P0001' then null;
  end;

  -- (b) anon must not hold execute on any of them
  assert not has_function_privilege('anon', 'public.admin_void_invoice(uuid, text)', 'execute'),
    'ASSERT FAILED: anon can execute admin_void_invoice';
  assert not has_function_privilege('anon', 'public.admin_invoice_for_payment(uuid)', 'execute'),
    'ASSERT FAILED: anon can execute admin_invoice_for_payment';

  -- ---- now as a real super admin -------------------------------------------
  select user_id into v_admin from public.profiles where role = 'super_admin' limit 1;
  if v_admin is null then
    raise notice 'Sprint 8.3: no super admin in this database, behavioural assertions skipped';
    delete from public.equipes where id = v_e;
    return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  assert public.is_super_admin(), 'ASSERT FAILED: impersonation did not take';

  -- (c) THE POINT OF ITEM 6: an open invoice can be cancelled, and the caller
  --     is handed what it needs to cancel the charge at the gateway.
  v_r := public.admin_void_invoice(v_i, 'criada por engano');
  assert v_r->>'status' = 'void', 'ASSERT FAILED: invoice was not voided';
  select status into v_txt from public.invoices where id = v_i;
  assert v_txt = 'void', 'ASSERT FAILED: void did not persist';
  assert (select metadata->>'voided_reason' from public.invoices where id = v_i) = 'criada por engano',
    'ASSERT FAILED: the reason was not recorded';

  -- (d) cancelling twice is not an error
  v_r := public.admin_void_invoice(v_i, 'de novo');
  assert v_r->>'status' = 'void', 'ASSERT FAILED: voiding twice raised';

  -- (e) a PAID invoice is untouchable — this is the accounting guarantee
  update public.invoices set status = 'paid', paid_at = now() where id = v_i;
  begin
    perform public.admin_void_invoice(v_i, 'nao pode');
    raise exception 'ASSERT FAILED: a paid invoice was voided';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_txt = message_text;
    assert v_txt = 'invoice_already_paid',
      format('ASSERT FAILED: expected invoice_already_paid, got %s', v_txt);
  end;

  -- ...and cannot be marked paid again
  begin
    perform public.admin_invoice_for_payment(v_i);
    raise exception 'ASSERT FAILED: a paid invoice was accepted for payment again';
  exception when sqlstate 'P0001' then null;
  end;

  -- (f) delete is drafts-only
  begin
    perform public.admin_delete_invoice(v_i);
    raise exception 'ASSERT FAILED: a paid invoice was deleted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_txt = message_text;
    assert v_txt = 'invoice_not_deletable',
      format('ASSERT FAILED: expected invoice_not_deletable, got %s', v_txt);
  end;

  insert into public.invoices (equipe_id, kind, status, subtotal, total)
  values (v_e, 'adhoc', 'draft', 50, 50) returning id into v_i;
  v_r := public.admin_delete_invoice(v_i);
  assert (v_r->>'deleted')::boolean, 'ASSERT FAILED: a draft was not deleted';
  select count(*) into v_cnt from public.invoices where id = v_i;
  assert v_cnt = 0, 'ASSERT FAILED: the draft survived the delete';

  -- (g) ITEM 6, ad-hoc billing. The manual flag is what stops billing-cron
  --     voiding it two hours later as failed-gateway debris.
  v_r := public.admin_create_adhoc_invoice(v_e, 'Hora extra de builder', 250, current_date + 7);
  v_i := (v_r->>'id')::uuid;
  assert (select (metadata->>'manual')::boolean from public.invoices where id = v_i),
    'ASSERT FAILED: an ad-hoc invoice is not flagged manual and the cron will void it';
  assert (select total from public.invoices where id = v_i) = 250,
    'ASSERT FAILED: ad-hoc total is wrong';
  select count(*) into v_cnt from public.invoice_items where invoice_id = v_i;
  assert v_cnt = 1, 'ASSERT FAILED: ad-hoc invoice has no line';

  begin
    perform public.admin_create_adhoc_invoice(v_e, 'gratis', 0, null);
    raise exception 'ASSERT FAILED: a zero-amount invoice was created';
  exception when sqlstate 'P0001' then null;
  end;

  -- (h) ITEM 6, corrections. Re-pricing works on a single-line invoice...
  v_r := public.admin_update_invoice(v_i, current_date + 20, 'Hora extra (corrigido)', 300);
  assert (v_r->>'total')::numeric = 300, 'ASSERT FAILED: the amount was not corrected';
  assert (select description from public.invoice_items where invoice_id = v_i) = 'Hora extra (corrigido)',
    'ASSERT FAILED: the line description was not corrected';

  -- ...and is refused on a multi-line one rather than flattening it
  insert into public.invoice_items (invoice_id, product_id, description, quantity, unit_price, total)
  values (v_i, null, 'segunda linha', 1, 10, 10);
  begin
    perform public.admin_update_invoice(v_i, null, null, 400);
    raise exception 'ASSERT FAILED: a multi-line invoice was silently re-priced';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_txt = message_text;
    assert v_txt = 'invoice_has_multiple_items',
      format('ASSERT FAILED: expected invoice_has_multiple_items, got %s', v_txt);
  end;

  -- (i) an overdue invoice pushed to a future date is open again, not overdue
  update public.invoices set status = 'overdue' where id = v_i;
  v_r := public.admin_update_invoice(v_i, current_date + 30, null, null);
  assert v_r->>'status' = 'open',
    format('ASSERT FAILED: a re-dated overdue invoice reads as %s', v_r->>'status');

  -- (j) cancelling the only overdue invoice releases a contract it dragged down
  insert into public.contracts (equipe_id, status, past_due_since, current_period_start, current_period_end)
  values (v_e, 'past_due', now(), now(), now() + interval '1 month') returning id into v_c;
  update public.invoices set contract_id = v_c, status = 'overdue' where id = v_i;
  perform public.admin_void_invoice(v_i, 'cobranca indevida');
  select status into v_txt from public.contracts where id = v_c;
  assert v_txt = 'active',
    format('ASSERT FAILED: contract stayed %s after its only overdue invoice was cancelled', v_txt);

  -- (k) ITEM 8: a proposal that never became a tenant can go...
  insert into public.proposals (cliente_nome, cliente_email, status)
  values ('__t83_prop__', 'x@x.com', 'rascunho') returning id into v_p;
  v_r := public.admin_delete_proposal(v_p);
  assert (v_r->>'deleted')::boolean, 'ASSERT FAILED: an unprovisioned proposal was not deleted';

  -- ...and one that did must not, or a live contract loses its origin document
  insert into public.proposals (cliente_nome, cliente_email, status, equipe_id)
  values ('__t83_prop2__', 'y@y.com', 'aceita', v_e) returning id into v_p;
  begin
    perform public.admin_delete_proposal(v_p);
    raise exception 'ASSERT FAILED: a provisioned proposal was deleted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_txt = message_text;
    assert v_txt = 'proposal_provisioned',
      format('ASSERT FAILED: expected proposal_provisioned, got %s', v_txt);
  end;

  delete from public.proposals where id = v_p;
  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.3 admin billing ops assertions passed';
end $$;
