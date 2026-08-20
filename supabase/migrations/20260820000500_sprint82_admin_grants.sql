-- 20260820000500_sprint82_admin_grants.sql
-- Sprint 8.2 · admin-side grants and add-ons.
--
-- WHY: every current tenant starts at zero under the new model, and the founder
-- needs to hand them credits or an add-on manually until each one is regularised
-- onto a real contract. Doing that with raw INSERTs would bypass idempotency and
-- leave no record of WHO granted WHAT and why.
--
-- Everything here is super-admin only and writes through the same ledger the
-- paying flows use, so a manual grant is auditable next to a purchased one.

-- ============================================================================
-- 1. MANUAL CREDIT GRANT
-- ============================================================================

create or replace function public.admin_grant_credits(
  p_equipe_id uuid,
  p_pool      text,
  p_credits   integer,
  p_reason    text default null,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_key   text;
  v_id    uuid;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_pool not in ('whatsapp','copilot') then
    raise exception 'invalid_pool' using errcode = 'P0001';
  end if;
  if p_credits = 0 then
    raise exception 'invalid_credits' using errcode = 'P0001';
  end if;

  -- Timestamped key: two deliberate grants of the same size on the same day are
  -- legitimate, so this must not collapse them the way a value-based key would.
  v_key := format('admin_%s_%s_%s', p_pool, to_char(now(), 'YYYYMMDDHH24MISSMS'), coalesce(v_actor::text, 'system'));

  if p_credits > 0 then
    insert into public.credit_ledger (
      equipe_id, entry_type, credits, expires_at, source, idempotency_key, pool, metadata
    ) values (
      p_equipe_id,
      case when p_expires_at is null then 'topup' else 'grant' end,
      p_credits, p_expires_at, 'admin', v_key, p_pool,
      jsonb_build_object('reason', p_reason, 'granted_by', v_actor)
    ) returning id into v_id;
  else
    -- A negative amount is a correction, not a debit for work done, so it is
    -- booked as an adjustment and stays visible in the statement.
    insert into public.credit_ledger (
      equipe_id, entry_type, credits, source, idempotency_key, pool, metadata
    ) values (
      p_equipe_id, 'adjustment', p_credits, 'admin', v_key, p_pool,
      jsonb_build_object('reason', p_reason, 'granted_by', v_actor)
    ) returning id into v_id;
  end if;

  perform public.recompute_credit_balance(p_equipe_id, p_pool);

  return jsonb_build_object(
    'id', v_id,
    'pool', p_pool,
    'balance', public.credit_balance(p_equipe_id, p_pool)
  );
end;
$fn$;

comment on function public.admin_grant_credits(uuid, text, integer, text, timestamptz) is
  'Sprint 8.2 · super-admin manual grant. Writes to the same ledger as paid credits so it is auditable alongside them. Positive with no expiry = topup; with expiry = grant; negative = adjustment.';

-- ============================================================================
-- 2. ADD-ONS AND PLAN ON A CONTRACT
--
-- Lets the founder attach a plan, instances or Builder hours to a team without
-- a proposal — the "regularisation" path for tenants that predate billing.
-- ============================================================================

create or replace function public.admin_set_contract_item(
  p_equipe_id   uuid,
  p_product_code text,
  p_quantity    integer default 1,
  p_unit_price  numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_contract uuid;
  v_product  public.billing_products%rowtype;
  v_item     uuid;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_product from public.billing_products where code = p_product_code;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  -- Reuse the live contract; create a draft one if the team has none. Draft
  -- rather than active: attaching a product is not the same as being paid.
  select id into v_contract from public.contracts
   where equipe_id = p_equipe_id and status in ('draft','active','past_due','suspended')
   order by created_at limit 1;

  if v_contract is null then
    insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
    values (p_equipe_id, 'draft', now(), date_trunc('day', now()) + interval '1 month')
    returning id into v_contract;
  end if;

  -- A plan is singular: swapping tiers must replace, never accumulate, or the
  -- customer ends up billed for both.
  if v_product.kind = 'plan' then
    delete from public.contract_items ci
     using public.billing_products bp
     where ci.contract_id = v_contract and bp.id = ci.product_id and bp.kind = 'plan';
  else
    delete from public.contract_items ci
     where ci.contract_id = v_contract and ci.product_id = v_product.id;
  end if;

  if p_quantity > 0 then
    insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
    values (v_contract, v_product.id, p_quantity,
            coalesce(p_unit_price, v_product.list_price), v_product.period)
    returning id into v_item;
  end if;

  return jsonb_build_object(
    'contract_id', v_contract,
    'item_id', v_item,
    'product', v_product.code,
    'quantity', p_quantity
  );
end;
$fn$;

-- ============================================================================
-- 3. ONE ROW PER TEAM FOR THE ADMIN SCREEN
-- ============================================================================

create or replace view public.v_admin_team_billing as
select
  e.id as equipe_id,
  e.nome,
  e.gpt_maker_agent_id is not null as has_agent,
  e.agent_paused_at,
  e.agent_paused_reason,
  c.id as contract_id,
  coalesce(c.status, 'none') as contract_status,
  c.current_period_end,
  (select bp.code from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan' limit 1) as plan_code,
  (select bp.name from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan' limit 1) as plan_name,
  coalesce((select sum(ci.unit_price * ci.quantity) from public.contract_items ci
             where ci.contract_id = c.id and ci.period = 'monthly'), 0) as mrr,
  public.credit_balance(e.id, 'whatsapp') as whatsapp_balance,
  public.credit_balance(e.id, 'copilot')  as copilot_balance,
  (select count(*) from public.profiles p where p.equipe_id = e.id) as seats_used,
  (select seat_limit from public.v_tenant_entitlements te where te.equipe_id = e.id) as seat_limit,
  coalesce((select sum(ci.quantity) from public.contract_items ci
              join public.billing_products bp on bp.id = ci.product_id
             where ci.contract_id = c.id and bp.kind = 'instance'), 0) as instances_contracted,
  (select count(*) from public.wpp_instances w where w.equipe_id = e.id) as instances_connected,
  coalesce((select sum(ci.quantity) from public.contract_items ci
              join public.billing_products bp on bp.id = ci.product_id
             where ci.contract_id = c.id and bp.code = 'builder_hour'), 0) as builder_hours_extra,
  coalesce((select sum(i.total) from public.invoices i
             where i.equipe_id = e.id and i.status in ('open','overdue')), 0) as open_amount
from public.equipes e
left join public.contracts c
  on c.equipe_id = e.id and c.status in ('draft','active','past_due','suspended');

comment on view public.v_admin_team_billing is
  'Sprint 8.2 · one row per team for the admin billing screen: plan, MRR, both credit pools, seats, instances contracted vs connected, and what is owed.';

-- ============================================================================
-- 4. ASSERTIONS
-- ============================================================================

do $$
declare v_e uuid; v_r jsonb; v_row record;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t82_admin__','x','x') returning id into v_e;

  -- These run as the migration owner, which is not a super admin, so the guard
  -- must refuse. That IS the assertion: the function is not open by default.
  begin
    perform public.admin_grant_credits(v_e, 'whatsapp', 1000, 'teste');
    raise exception 'ASSERT FAILED: admin_grant_credits ran without super admin';
  exception when sqlstate 'P0001' then null;
  end;

  begin
    perform public.admin_set_contract_item(v_e, 'plan_growth', 1);
    raise exception 'ASSERT FAILED: admin_set_contract_item ran without super admin';
  exception when sqlstate 'P0001' then null;
  end;

  -- The admin view answers for a team with nothing at all
  select * into v_row from public.v_admin_team_billing where equipe_id = v_e;
  assert v_row.contract_status = 'none', 'ASSERT FAILED: a team with no contract is not reported as none';
  assert v_row.whatsapp_balance = 0 and v_row.copilot_balance = 0,
    'ASSERT FAILED: a fresh team should show zero in both pools';
  assert v_row.seats_used = 0, 'ASSERT FAILED: seats_used wrong';
  assert v_row.open_amount = 0, 'ASSERT FAILED: open_amount wrong';

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.2 admin assertions passed';
end $$;
