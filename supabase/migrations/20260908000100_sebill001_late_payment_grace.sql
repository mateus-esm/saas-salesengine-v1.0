-- 20260908000100_sebill001_late_payment_grace.sql
-- SE-BILL-001 · BUG 1 — deduct grace-window consumption from a late plan grant.
--
-- When a recurring invoice is paid AFTER its due date, the attendance agent has
-- been answering on credit in the meantime. _shared/invoice-effects.ts now
-- reduces the period grant by what was consumed in [due_date, paid_at] per pool.
--
-- To do that from the admin "mark paid by hand" path it needs the invoice's
-- due_date and paid_at. admin_invoice_for_payment() handed back a slimmer row;
-- this adds the two fields. The Asaas webhook already selects them directly.
-- Purely additive to the returned JSON — no caller breaks.

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
    'due_date', v_inv.due_date,
    'paid_at', v_inv.paid_at,
    'metadata', coalesce(v_inv.metadata, '{}'::jsonb)
  );
end;
$fn$;

comment on function public.admin_invoice_for_payment(uuid) is
  'Sprint 8.3 · authorises and validates marking an invoice paid by hand, and returns the row (SE-BILL-001: now including due_date/paid_at for the late-payment grace-window deduction). Applies nothing: the effects live once, in _shared/invoice-effects.ts, shared with the Asaas webhook.';
