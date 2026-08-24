-- 20260824000200_sprint82_admin_view_truth.sql
-- Sprint 8.2 follow-up · the admin panel must show the balance that exists,
-- and a trial must entitle the tenant to something.
--
-- WHY THIS EXISTS — found while verifying 20260824000100 against production:
--
--   Casa Flow, read as a member of Casa Flow ... whatsapp_total   = 1000
--   Casa Flow, read from v_admin_team_billing .. whatsapp_balance = 0
--
-- The previous migration closed a real cross-tenant leak by making
-- v_credit_balance and v_tenant_entitlements security_invoker, and kept
-- v_admin_team_billing on definer semantics because the admin screen crosses
-- tenants by design. That reasoning was right about the views and wrong about
-- what a view actually delegates:
--
--   * a DIRECT table read inside a definer-semantics view runs as the view
--     owner (postgres, who owns the tables and so is not subject to their RLS)
--     — which is why seats_used and open_amount were always correct;
--
--   * a SECURITY INVOKER FUNCTION called inside that same view still runs as
--     the CALLER. credit_balance() reads credit_ledger, credit_ledger has a
--     per-tenant policy, so every balance in the admin panel collapsed to the
--     caller's own team — i.e. zero for all the others.
--
-- So Sprint 8.2 fixed "I granted credits and nothing happened" in the ledger and
-- immediately reproduced it one layer up, on the very screen built to grant
-- them. seat_limit failed the same way for a different reason: it was selected
-- from v_tenant_entitlements, which is now invoker and therefore per-tenant.
--
-- Second, unrelated to RLS: Sprint 9 introduced `trialing` and documented it as
-- "a live state: the tenant has full access and is not in arrears", but nothing
-- taught the entitlement views about it. They still join only
-- active/past_due/suspended, so a tenant on trial reads back as contract_status
-- 'none', is_live false, no seat limit and no included credits. The founder's
-- own test signup ("Solo Teste", created 2026-08-24) is in exactly that state.

-- ============================================================================
-- 1. A CROSS-TENANT BALANCE THE ADMIN SCREEN CAN ACTUALLY READ
--
-- Three ways to fix the function-inside-a-view problem, and why this one:
--
--   (a) make credit_balance() SECURITY DEFINER — rejected. It takes an
--       equipe_id, is exposed over PostgREST, and would hand any authenticated
--       user any team's balance. That is a worse leak than the one just closed.
--
--   (b) inline the arithmetic into the view as direct table reads — rejected.
--       The balance is `sum(ledger) - pending_expiry()`, and pending_expiry is
--       another invoker function reading the same table. Inlining means copying
--       the expiry rules into a view where they will drift from the original.
--
--   (c) one narrow definer wrapper, gated on is_super_admin() — taken. The
--       formula stays in credit_balance(); only the privilege changes, and only
--       for callers the admin screen is already restricted to.
--
-- The gate matters on its own: SECURITY DEFINER functions are callable as RPC,
-- so without it this would be exactly the leak rejected in (a).
-- ============================================================================

create or replace function public.admin_credit_balance(p_equipe_id uuid, p_pool text)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  -- NULL rather than an exception: this is read from inside a view, one call
  -- per row, and a raise would abort the whole result set instead of hiding it.
  select case when public.is_super_admin()
              then public.credit_balance(p_equipe_id, p_pool)
         end;
$fn$;

comment on function public.admin_credit_balance(uuid, text) is
  'Sprint 8.2 · credit_balance() for a team that is not the caller''s own. Exists because credit_balance is SECURITY INVOKER and therefore RLS-filtered when called from inside a view; returns NULL to anyone who is not a super admin.';

revoke all on function public.admin_credit_balance(uuid, text) from public, anon;
grant execute on function public.admin_credit_balance(uuid, text) to authenticated, service_role;

-- ============================================================================
-- 2. A TRIAL IS A LIVE CONTRACT
--
-- `trialing` joins the set everywhere the set is spelled out. is_live gains it
-- too: the trial exists so the tenant can use the product, and useEntitlements
-- gates the UI on exactly this flag.
--
-- is_read_only stays `status = 'suspended'` — a trial is not read-only.
-- ============================================================================

create or replace view public.v_tenant_entitlements as
select
  e.id as equipe_id,
  c.id as contract_id,
  coalesce(c.status, 'none') as contract_status,
  (c.status = 'suspended') as is_read_only,
  (c.status in ('trialing', 'active', 'past_due')) as is_live,
  coalesce(
    (select array_agg(distinct bp.code)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id),
    '{}'::text[]
  ) as modules,
  (select max((bp.metadata->>'seat_limit')::int)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan') as seat_limit,
  (select max((bp.metadata->>'agent_limit')::int)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan') as agent_limit,
  coalesce(
    (select sum(bp.credits_whatsapp * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id), 0)::int as included_credits_whatsapp,
  coalesce(
    (select sum(bp.credits_copilot * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id), 0)::int as included_credits_copilot,
  coalesce(
    (select sum(bp.credits_included * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id), 0)::int as included_credits,
  -- Instances the plan bundles, plus any bought as add-ons.
  coalesce(
    (select sum(coalesce((bp.metadata->>'included_instances')::int, 0) * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id and bp.kind = 'plan'), 0)::int
  + coalesce(
    (select sum(ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id and bp.kind = 'instance'), 0)::int as instance_limit,
  coalesce(
    (select sum(coalesce((bp.metadata->>'builder_hours')::int, 0) * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id and bp.kind = 'plan'), 0)::int as builder_hours,
  (select max(bp.metadata->>'builder_recurrence')
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan') as builder_recurrence,
  c.current_period_end,
  e.page_permissions
from public.equipes e
left join public.contracts c
  on c.equipe_id = e.id
 and c.status in ('trialing', 'active', 'past_due', 'suspended');

-- CREATE OR REPLACE keeps reloptions, but this is the one property whose loss
-- would silently reopen the leak 20260824000100 closed. Restate it.
alter view public.v_tenant_entitlements set (security_invoker = on);

comment on view public.v_tenant_entitlements is
  'Sprint 8.2 · what a tenant may use, derived from its contract. security_invoker: RLS on the underlying tables does the tenant filtering. `trialing` counts as live — the trial exists so the product can be used.';

-- ============================================================================
-- 3. THE ADMIN SCREEN, READING TRUE NUMBERS
--
-- Two changes to the body, both consequences of section 1:
--
--   * the balances go through admin_credit_balance();
--   * seat_limit is computed from base tables instead of being selected from
--     v_tenant_entitlements. Reading a per-tenant invoker view from a
--     cross-tenant one can only ever return the caller's own row, and this is
--     the same expression that view uses.
--
-- Dropped and recreated rather than replaced: `trialing` also has to enter the
-- join, and the seat_limit column changes source.
-- ============================================================================

drop view if exists public.v_admin_team_billing;
create view public.v_admin_team_billing as
select
  e.id as equipe_id,
  e.nome,
  public.has_usable_agent(e.gpt_maker_agent_id) as has_agent,
  e.agent_paused_at,
  e.agent_paused_reason,
  e.agent_power_error,
  e.agent_power_failures,
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
  -- Was public.credit_balance(...), which returned the CALLER's team only.
  public.admin_credit_balance(e.id, 'whatsapp') as whatsapp_balance,
  public.admin_credit_balance(e.id, 'copilot')  as copilot_balance,
  (select count(*) from public.profiles p where p.equipe_id = e.id) as seats_used,
  -- Was (select seat_limit from v_tenant_entitlements ...) — per-tenant since
  -- that view became security_invoker, so it read null for every other team.
  (select max((bp.metadata->>'seat_limit')::int)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan') as seat_limit,
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
  on c.equipe_id = e.id and c.status in ('draft','trialing','active','past_due','suspended')
where public.is_super_admin();

comment on view public.v_admin_team_billing is
  'Sprint 8.2 · one row per team for the admin billing screen. Gated on is_super_admin() inside the view: it deliberately crosses tenants, so the guard cannot live in RLS. Balances go through admin_credit_balance() because a SECURITY INVOKER function called from a view is RLS-filtered to the caller.';

revoke all on public.v_admin_team_billing from anon;
grant select on public.v_admin_team_billing to authenticated;

-- ============================================================================
-- 4. ONE DEFINITION OF "LIVE" IN THE AGENT RECONCILER
--
-- agents_to_pause splits teams into "has a live contract" and "has none", and
-- `trialing` fell into the second bucket. Today both buckets reach the same
-- verdict for a trial (no credits -> pause), so this changes no behaviour — it
-- is here so the set is spelled the same way in all three places and the next
-- reason added to one branch does not silently skip trials.
-- ============================================================================

drop function if exists public.agents_to_pause(uuid);
create function public.agents_to_pause(p_equipe_id uuid default null)
returns table (equipe_id uuid, agent_id text, reason text)
language sql stable
set search_path = public
as $fn$
  select e.id, btrim(e.gpt_maker_agent_id), r.reason
  from public.equipes e
  cross join lateral (
    select case
      when c.status = 'suspended' then 'suspended'
      when public.credit_balance(e.id, 'whatsapp') <= 0 then 'no_credits'
    end as reason
    from public.contracts c
    where c.equipe_id = e.id
      and c.status in ('trialing','active','past_due','suspended')
    union all
    -- A tenant with no live contract is not billed and not our cost to carry.
    select case when public.credit_balance(e.id, 'whatsapp') <= 0 then 'no_credits' end
    where not exists (
      select 1 from public.contracts c2
      where c2.equipe_id = e.id
        and c2.status in ('trialing','active','past_due','suspended'))
    limit 1
  ) r
  where public.has_usable_agent(e.gpt_maker_agent_id)
    and (p_equipe_id is null or e.id = p_equipe_id)
    and e.agent_paused_at is null
    and e.agent_power_failures < 5
    and r.reason is not null;
$fn$;

comment on function public.agents_to_pause(uuid) is
  'Teams whose attendance agent should be OFF. p_equipe_id narrows it to one team so an admin action does not sweep the whole base. `trialing` counts as a live contract.';

-- ============================================================================
-- 5. ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_c uuid; v_cnt integer; v_bool boolean; v_txt text; v_def text;
begin
  insert into public.equipes (nome, crm_link, suporte_link, gpt_maker_agent_id)
  values ('__t82_truth__','x','x','TRUTHAGENT') returning id into v_e;

  -- ---------------------------------------------------------------- section 1
  -- (a) the wrapper is a definer function, or it fixes nothing
  select p.prosecdef into v_bool
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_credit_balance';
  assert v_bool, 'ASSERT FAILED: admin_credit_balance is not SECURITY DEFINER';

  -- (b) ...and it is gated. This block runs as the migration owner, who is not
  --     a super admin, so a real balance coming back here is the leak.
  perform public.grant_credits(v_e, 700, 'invoice', null, null, 'truth_top', 'topup', 'whatsapp');
  assert public.credit_balance(v_e, 'whatsapp') = 700,
    'ASSERT FAILED: the fixture team did not actually receive its credits';
  assert public.admin_credit_balance(v_e, 'whatsapp') is null,
    'ASSERT FAILED: admin_credit_balance answered a caller who is not a super admin';

  -- (c) anon must not be able to call it at all
  assert not has_function_privilege('anon', 'public.admin_credit_balance(uuid, text)', 'execute'),
    'ASSERT FAILED: anon can execute admin_credit_balance';

  -- (d) THE BUG: the admin view must not read balances through the invoker
  --     function, and must not source seat_limit from a per-tenant view.
  v_def := pg_get_viewdef('public.v_admin_team_billing'::regclass);
  assert v_def like '%admin_credit_balance%',
    'ASSERT FAILED: the admin view is not using admin_credit_balance';
  assert v_def not like '%v_tenant_entitlements%',
    'ASSERT FAILED: the admin view still selects from a per-tenant invoker view';

  -- (e) the admin view stays shut to non-super-admins, gate or no gate
  select count(*) into v_cnt from public.v_admin_team_billing;
  assert v_cnt = 0,
    'ASSERT FAILED: v_admin_team_billing returned rows to a non-super-admin';

  -- ---------------------------------------------------------------- section 2
  -- (f) a trial entitles the tenant to the plan it is trialling. Before this
  --     migration every one of these read none/false/null/0.
  insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
  values (v_e, 'trialing', now(), date_trunc('day', now()) + interval '15 days')
  returning id into v_c;
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  select v_c, bp.id, 1, bp.list_price, bp.period
    from public.billing_products bp where bp.code = 'plan_growth';

  select contract_status into v_txt from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_txt = 'trialing',
    format('ASSERT FAILED: a trialing contract reads as %s', v_txt);

  select is_live into v_bool from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_bool, 'ASSERT FAILED: a trialing tenant is not live';

  select is_read_only into v_bool from public.v_tenant_entitlements where equipe_id = v_e;
  assert not v_bool, 'ASSERT FAILED: a trialing tenant reads as read-only';

  select coalesce(seat_limit, 0) into v_cnt from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_cnt > 0, 'ASSERT FAILED: a trialing tenant has no seat limit';

  select included_credits_whatsapp into v_cnt from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_cnt > 0, 'ASSERT FAILED: a trialing tenant is entitled to no credits';

  -- (g) suspension still wins over everything
  update public.contracts set status = 'suspended' where id = v_c;
  select is_live into v_bool from public.v_tenant_entitlements where equipe_id = v_e;
  assert not v_bool, 'ASSERT FAILED: a suspended tenant reads as live';
  select is_read_only into v_bool from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_bool, 'ASSERT FAILED: a suspended tenant is not read-only';

  -- ---------------------------------------------------------------- section 4
  -- (h) a trialing team with credits is left alone; drained, it is queued.
  update public.contracts set status = 'trialing' where id = v_c;
  select count(*) into v_cnt from public.agents_to_pause(v_e);
  assert v_cnt = 0,
    'ASSERT FAILED: a funded trialing agent was queued for pause';

  -- Drained with a direct adjustment row: grant_credits refuses a non-positive
  -- amount, and `adjustment` is the only entry type the sign constraint lets
  -- go negative outside a debit.
  insert into public.credit_ledger (equipe_id, entry_type, credits, source, idempotency_key, pool)
  values (v_e, 'adjustment', -700, 'admin', 'truth_drain', 'whatsapp');
  perform public.recompute_credit_balance(v_e, 'whatsapp');
  assert public.credit_balance(v_e, 'whatsapp') = 0,
    'ASSERT FAILED: the fixture team was not drained';
  select count(*) into v_cnt from public.agents_to_pause(v_e) where reason = 'no_credits';
  assert v_cnt = 1,
    'ASSERT FAILED: a drained trialing agent was not queued for pause';

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.2 admin-view-truth assertions passed';
end $$;
