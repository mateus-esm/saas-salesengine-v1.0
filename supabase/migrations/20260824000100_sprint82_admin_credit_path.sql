-- 20260824000100_sprint82_admin_credit_path.sql
-- Sprint 8.2 fixes · one credit path, and an agent that comes back on demand.
--
-- WHY THIS EXISTS — diagnosed against production on 2026-08-24:
--
--   credit_ledger ............ 0 rows
--   equipes.creditos_avulsos . 1500 / 500 / 500, all written 2026-08-24 01:10
--
-- The founder granted credits three times and nothing happened. The admin panel
-- shipped TWO ways to add credits: the coin button in the Equipes tab, which
-- does `update equipes set creditos_avulsos` (a Sprint 6 column that Billing v1
-- never reads), and the Faturamento tab, which calls admin_grant_credits() and
-- writes the ledger. The first one is the obvious affordance, so that is the one
-- that got used — and it fed a dead end: the client's balance comes from
-- v_credit_balance (the ledger), and agents_to_resume() gates on
-- credit_balance(equipe,'whatsapp') > 0. Both stayed at zero, so six agents
-- stayed paused with reason 'no_credits'.
--
-- Nothing here was "broken" in the sense of throwing; the money simply went to a
-- column no consumer reads. The fix is to remove the second path entirely — in
-- the UI the button now opens the real dialog — and to retire the column so it
-- cannot be mistaken for a balance again.
--
-- Founder decision (2026-08-24): the credits already sitting in the dead column
-- are DISCARDED, not migrated. They were never promised to anyone.

-- ============================================================================
-- 1. RETIRE THE LEGACY CREDIT COLUMN
--
-- Not dropped: fetch-gpt-credits, Suporte.tsx and AuthContext still select it,
-- and a DROP would break them at runtime for a cosmetic gain. Zeroing it makes
-- every consumer agree on the same (correct) number — nobody has avulso credits
-- under Billing v1 — while the comment tells the next reader where to look.
-- ============================================================================

update public.equipes set creditos_avulsos = 0 where creditos_avulsos <> 0;

comment on column public.equipes.creditos_avulsos is
  'DEPRECATED (Sprint 8.2). Pre-billing column. NOT a balance: no Billing v1 code path reads it. The real balance is credit_balance(equipe_id, pool), fed by credit_ledger. Kept at 0 only because legacy readers still select it.';

comment on column public.equipes.limite_creditos is
  'DEPRECATED (Sprint 8.2). Pre-billing plan allowance. The real allowance comes from contract_items -> billing_products.credits_included.';

-- ============================================================================
-- 2. TARGETED AND FORCED AGENT RECONCILIATION
--
-- The reconciler was all-or-nothing: it swept every team. That is right for the
-- cron and wrong for an admin who just credited ONE team and wants that team's
-- agent back now — a full sweep makes a provider call per team and reports a
-- total that says nothing about the one that matters.
--
-- p_force additionally covers the case the resume path could not reach at all:
-- an agent that is inactive AT THE PROVIDER while our agent_paused_at is NULL
-- (switched off by hand in GPT Maker, or a pause that failed after we recorded
-- nothing). Without a force flag no amount of credit would ever turn it on,
-- because the query only ever looked at teams WE had paused.
--
-- What force does NOT bypass: the credit check and the suspension check.
-- Activating an agent with an empty wallet is the exact leak Sprint 8.1 closed.
--
-- Defaulted parameters, so the existing zero-argument callers (billing-cron,
-- agent-power-sync) keep working untouched. The old signatures must be DROPPED
-- rather than replaced — adding a defaulted parameter creates an overload, and
-- then a no-argument call matches both and Postgres refuses it as "not unique".
-- ============================================================================

drop function if exists public.agents_to_pause();
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
    where c.equipe_id = e.id and c.status in ('active','past_due','suspended')
    union all
    -- A tenant with no live contract is not billed and not our cost to carry.
    select case when public.credit_balance(e.id, 'whatsapp') <= 0 then 'no_credits' end
    where not exists (
      select 1 from public.contracts c2
      where c2.equipe_id = e.id and c2.status in ('active','past_due','suspended'))
    limit 1
  ) r
  where public.has_usable_agent(e.gpt_maker_agent_id)
    and (p_equipe_id is null or e.id = p_equipe_id)
    and e.agent_paused_at is null
    and e.agent_power_failures < 5
    and r.reason is not null;
$fn$;

comment on function public.agents_to_pause(uuid) is
  'Teams whose attendance agent should be OFF. p_equipe_id narrows it to one team so an admin action does not sweep the whole base.';

drop function if exists public.agents_to_resume();
create function public.agents_to_resume(
  p_equipe_id uuid default null,
  p_force     boolean default false
)
returns table (equipe_id uuid, agent_id text)
language sql stable
set search_path = public
as $fn$
  select e.id, btrim(e.gpt_maker_agent_id)
  from public.equipes e
  where public.has_usable_agent(e.gpt_maker_agent_id)
    and (p_equipe_id is null or e.id = p_equipe_id)
    -- Normal path: only resume what WE paused, and never undo a manual pause.
    -- Forced path: an admin asserting the provider is off regardless of our
    -- records, which is the only way to recover from a state we never saw.
    and (p_force or (e.agent_paused_at is not null
                     and e.agent_paused_reason in ('no_credits', 'suspended')))
    and (p_force or e.agent_power_failures < 5)
    -- Never bypassed, force or not.
    and public.credit_balance(e.id, 'whatsapp') > 0
    and not exists (
      select 1 from public.contracts c
      where c.equipe_id = e.id and c.status = 'suspended');
$fn$;

comment on function public.agents_to_resume(uuid, boolean) is
  'Teams whose attendance agent should be ON. p_force ignores our own paused-state bookkeeping (for an agent switched off at the provider behind our back) but never the credit or suspension checks.';

-- ============================================================================
-- 3. A GRANT CLEARS THE BACKOFF
--
-- agents_to_resume skips teams with 5+ consecutive provider failures, so one
-- stale agent id cannot generate a daily call forever. But a deliberate grant IS
-- the human intervention that backoff was waiting for: if the founder is putting
-- credits in, they want the agent tried again. Without this the grant lands, the
-- balance goes up, and the agent stays dark with no visible reason.
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

  -- Funding the attendance wallet is an instruction to try the agent again.
  if p_pool = 'whatsapp' and p_credits > 0 then
    perform public.reset_agent_power_error(p_equipe_id);
  end if;

  return jsonb_build_object(
    'id', v_id,
    'pool', p_pool,
    'balance', public.credit_balance(p_equipe_id, p_pool),
    -- The caller needs to know whether to bother calling the provider at all.
    'agent_should_resume', exists (select 1 from public.agents_to_resume(p_equipe_id))
  );
end;
$fn$;

comment on function public.admin_grant_credits(uuid, text, integer, text, timestamptz) is
  'Sprint 8.2 · super-admin manual grant. THE ONLY supported way to add credits by hand — equipes.creditos_avulsos is deprecated and read by nothing. Writes the same ledger as paid credits, clears the agent-power backoff, and reports whether the agent is now eligible to resume.';

-- ============================================================================
-- 3b. A PLAN ATTACHED BY AN ADMIN IS A PLAN THE TEAM HAS
--
-- Same dead end as the credits, one table over. admin_set_contract_item created
-- the contract as 'draft', reasoning that "attaching a product is not the same
-- as being paid". But v_tenant_entitlements joins contracts on
-- status in ('active','past_due','suspended') — draft is excluded — so the plan
-- lit up nothing: no seat limit, no modules, no instance allowance, and the
-- client's plan page stayed empty. The founder would have hit exactly the same
-- "I changed it in the admin and nothing happened" a second time.
--
-- This function IS the regularisation path: it exists so the founder can say
-- "this team is on Growth" for tenants that predate billing. That statement has
-- to mean something. p_activate is kept as an escape hatch for the case the
-- original comment had in mind — staging a contract before it is paid.
-- ============================================================================

create or replace function public.admin_set_contract_item(
  p_equipe_id    uuid,
  p_product_code text,
  p_quantity     integer default 1,
  p_unit_price   numeric default null,
  p_activate     boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_contract uuid;
  v_status   text;
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

  select id, status into v_contract, v_status from public.contracts
   where equipe_id = p_equipe_id and status in ('draft','active','past_due','suspended')
   order by created_at limit 1;

  if v_contract is null then
    insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
    values (p_equipe_id,
            case when p_activate then 'active' else 'draft' end,
            now(), date_trunc('day', now()) + interval '1 month')
    returning id, status into v_contract, v_status;
  elsif p_activate and v_status = 'draft' then
    -- Promote, never demote: an admin adding an item to a past_due or suspended
    -- contract is not clearing the dunning that put it there.
    update public.contracts
       set status = 'active',
           current_period_start = coalesce(current_period_start, now()),
           current_period_end   = coalesce(current_period_end,
                                           date_trunc('day', now()) + interval '1 month')
     where id = v_contract
    returning status into v_status;
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
    'contract_status', v_status,
    'item_id', v_item,
    'product', v_product.code,
    'quantity', p_quantity,
    -- What the team is entitled to NOW, so the caller can show the effect
    -- instead of promising one.
    'credits_whatsapp', (select included_credits_whatsapp from public.v_tenant_entitlements where equipe_id = p_equipe_id),
    'credits_copilot',  (select included_credits_copilot  from public.v_tenant_entitlements where equipe_id = p_equipe_id)
  );
end;
$fn$;

comment on function public.admin_set_contract_item(uuid, text, integer, numeric, boolean) is
  'Sprint 8.2 · super-admin attaches a plan or add-on. Activates the contract by default: v_tenant_entitlements ignores draft contracts, so a draft would grant the team nothing. Pass p_activate => false to stage one instead.';

-- The 4-argument signature would still resolve for existing callers, but leaving
-- it behind means two functions with different activation behaviour. Drop it.
drop function if exists public.admin_set_contract_item(uuid, text, integer, numeric);

-- ============================================================================
-- 4. CLOSE THE CROSS-TENANT READ ON THE BILLING VIEWS
--
-- Found while tracing the balance the client reads: all three views were
-- security_invoker = false (so RLS on the underlying tables never applied) AND
-- granted to `anon`. Any unauthenticated caller could read every team's balance,
-- MRR and seat count straight off PostgREST.
--
-- Two different fixes, because the two kinds of view need opposite things:
--
--   v_credit_balance / v_tenant_entitlements are per-tenant, and every table
--   underneath already has an `authenticated` tenant policy — so switching them
--   to security_invoker makes RLS do the filtering. service_role and the
--   SECURITY DEFINER functions that read them are owned by roles with BYPASSRLS,
--   so nothing server-side changes.
--
--   v_admin_team_billing must cross tenants BY DESIGN — the admin screen is a
--   list of every team. Under security_invoker it would return zeros, because
--   no policy lets even a super admin read another team's credit_ledger. So it
--   keeps definer semantics and gains an explicit is_super_admin() gate instead.
-- ============================================================================

alter view public.v_credit_balance      set (security_invoker = on);
alter view public.v_tenant_entitlements set (security_invoker = on);

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
  on c.equipe_id = e.id and c.status in ('draft','active','past_due','suspended')
where public.is_super_admin();

comment on view public.v_admin_team_billing is
  'Sprint 8.2 · one row per team for the admin billing screen. Gated on is_super_admin() inside the view: it deliberately crosses tenants, so the guard cannot live in RLS.';

-- `anon` had every privilege on all three, including INSERT and DELETE, which
-- are meaningless on a view and were never intended.
revoke all on public.v_credit_balance      from anon;
revoke all on public.v_tenant_entitlements from anon;
revoke all on public.v_admin_team_billing  from anon;

grant select on public.v_credit_balance      to authenticated;
grant select on public.v_tenant_entitlements to authenticated;
grant select on public.v_admin_team_billing  to authenticated;

-- ============================================================================
-- 5. ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_c uuid; v_cnt integer;
begin
  insert into public.equipes (nome, crm_link, suporte_link, gpt_maker_agent_id, creditos_avulsos)
  values ('__t82_path__','x','x','AGENTPATH', 999) returning id into v_e;

  -- (a) THE BUG: the legacy column is not a balance. Writing to it must move
  --     nothing that Billing v1 reads. This is the whole incident in one assert.
  assert public.credit_balance(v_e, 'whatsapp') = 0,
    'ASSERT FAILED: creditos_avulsos leaked into the real balance';

  -- (b) with no credits the agent is queued to pause, and narrowing works
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_e;
  assert v_cnt = 1, 'ASSERT FAILED: a broke agent was not queued for pause';
  select count(*) into v_cnt from public.agents_to_pause(v_e);
  assert v_cnt = 1, 'ASSERT FAILED: targeted agents_to_pause missed its own team';

  -- (c) narrowing must EXCLUDE everyone else, or an admin action still sweeps
  select count(*) into v_cnt from public.agents_to_pause(v_e) where equipe_id <> v_e;
  assert v_cnt = 0, 'ASSERT FAILED: targeted agents_to_pause returned other teams';

  -- (d) force must not resurrect an agent with an empty wallet
  select count(*) into v_cnt from public.agents_to_resume(v_e, true);
  assert v_cnt = 0, 'ASSERT FAILED: force resumed an agent with zero credits';

  -- (e) funded but never paused by us -> normal path skips it, force finds it.
  --     This is the case that was previously unreachable at any credit level.
  perform public.grant_credits(v_e, 500, 'invoice', null, null, 'path_top', 'topup', 'whatsapp');
  select count(*) into v_cnt from public.agents_to_resume(v_e, false);
  assert v_cnt = 0, 'ASSERT FAILED: the normal path resumed an agent it never paused';
  select count(*) into v_cnt from public.agents_to_resume(v_e, true);
  assert v_cnt = 1, 'ASSERT FAILED: force could not reach an agent we never paused';

  -- (f) once we have paused it, credits bring it back without force
  update public.equipes
     set agent_paused_at = now(), agent_paused_reason = 'no_credits' where id = v_e;
  select count(*) into v_cnt from public.agents_to_resume(v_e, false);
  assert v_cnt = 1, 'ASSERT FAILED: a funded, paused agent was not queued for resume';

  -- (g) the backoff still blocks the normal path...
  update public.equipes set agent_power_failures = 5 where id = v_e;
  select count(*) into v_cnt from public.agents_to_resume(v_e, false);
  assert v_cnt = 0, 'ASSERT FAILED: backoff did not block a repeatedly failing agent';

  -- (h) ...and a grant is the intervention that clears it. Runs as the migration
  --     owner, so admin_grant_credits itself is refused; assert the guard holds
  --     and clear the counter the way the function would.
  begin
    perform public.admin_grant_credits(v_e, 'whatsapp', 100, 'teste');
    raise exception 'ASSERT FAILED: admin_grant_credits ran without super admin';
  exception when sqlstate 'P0001' then null;
  end;
  perform public.reset_agent_power_error(v_e);
  select count(*) into v_cnt from public.agents_to_resume(v_e, false);
  assert v_cnt = 1, 'ASSERT FAILED: clearing the backoff did not re-enable resume';

  -- (i) a suspended contract still wins over everything, force included
  insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
  values (v_e, 'suspended', now(), now() + interval '1 month');
  select count(*) into v_cnt from public.agents_to_resume(v_e, true);
  assert v_cnt = 0, 'ASSERT FAILED: force resumed an agent whose contract is suspended';

  -- (j) the admin view is closed to anyone who is not a super admin. The
  --     migration owner is not one, so it must come back empty.
  select count(*) into v_cnt from public.v_admin_team_billing;
  assert v_cnt = 0, 'ASSERT FAILED: v_admin_team_billing returned rows to a non-super-admin';

  -- (k) THE SECOND DEAD END: a draft contract entitles the team to nothing, so
  --     an admin who attaches a plan and gets a draft has changed nothing the
  --     client can see. This is why admin_set_contract_item now activates.
  delete from public.contracts where equipe_id = v_e;
  insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
  values (v_e, 'draft', now(), now() + interval '1 month') returning id into v_c;
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  select v_c, bp.id, 1, bp.list_price, bp.period
    from public.billing_products bp where bp.code = 'plan_growth';

  select coalesce(included_credits_whatsapp, 0) into v_cnt
    from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_cnt = 0, 'ASSERT FAILED: a draft contract is expected to entitle nothing';

  update public.contracts set status = 'active' where id = v_c;
  select coalesce(included_credits_whatsapp, 0) into v_cnt
    from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_cnt > 0,
    'ASSERT FAILED: an active plan contract still entitles the team to no credits';

  -- (l) the old 4-argument signature must be gone, or two functions with
  --     different activation behaviour coexist and callers get whichever.
  select count(*) into v_cnt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_contract_item';
  assert v_cnt = 1,
    format('ASSERT FAILED: expected exactly one admin_set_contract_item, found %s', v_cnt);

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.2 admin credit path assertions passed';
end $$;

-- `anon` must not be able to select the billing views any more.
do $$
declare v_cnt integer;
begin
  select count(*) into v_cnt
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('v_credit_balance','v_tenant_entitlements','v_admin_team_billing')
    and grantee = 'anon';
  assert v_cnt = 0, format('ASSERT FAILED: anon still holds %s grants on the billing views', v_cnt);

  -- reloptions stores the literal the ALTER used, so this is 'on' rather than
  -- 'true'. Accept either instead of asserting on one spelling.
  select count(*) into v_cnt
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('v_credit_balance','v_tenant_entitlements')
    and lower(coalesce((select option_value from pg_options_to_table(c.reloptions)
                        where option_name = 'security_invoker'), 'off')) in ('on','true');
  assert v_cnt = 2, 'ASSERT FAILED: the per-tenant views are not security_invoker';

  raise notice 'Sprint 8.2 view exposure assertions passed';
end $$;
