-- 20260820000400_sprint81_enforcement.sql
-- Sprint 8.1 · T4 — enforce what the entitlements already compute.
--
-- Sprint 8 shipped a pattern worth naming: every limit was CALCULATED and none
-- was ENFORCED. is_read_only was rendered in the UI while the API happily
-- accepted writes; seat_limit was displayed while a 6th user could still be
-- invited. A limit nobody checks is a marketing claim, not a plan.
--
-- Closes TODO B3 (read-only not enforced) and E1 (seat limit not enforced).
--
-- WHAT READ-ONLY MEANS (founder decision 7): data stays visible, AI actions and
-- outbound sending stop. It is deliberately NOT a blanket write block — a
-- suspended customer must still be able to read their CRM, fix a phone number,
-- and pay the invoice. Blocking everything would punish them for owing us money
-- in a way that makes paying harder.

-- ============================================================================
-- 1. THE SINGLE SOURCE FOR "CAN THIS TENANT ACT?"
-- ============================================================================

create or replace function public.tenant_is_suspended(p_equipe_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.contracts
    where equipe_id = p_equipe_id and status = 'suspended'
  );
$fn$;

comment on function public.tenant_is_suspended(uuid) is
  'Sprint 8.1 · dunning end state. True = AI and outbound must refuse; reads stay open.';

create or replace function public.tenant_seat_usage(p_equipe_id uuid)
returns jsonb
language sql stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'used', (select count(*) from public.profiles where equipe_id = p_equipe_id),
    'limit', (select seat_limit from public.v_tenant_entitlements where equipe_id = p_equipe_id),
    'can_add', coalesce(
      (select count(*) from public.profiles where equipe_id = p_equipe_id)
        < (select seat_limit from public.v_tenant_entitlements where equipe_id = p_equipe_id),
      -- No plan, no limit: a tenant without a contract is not being sold seats.
      true)
  );
$fn$;

-- ============================================================================
-- 2. AI ACTIONS REFUSE WHEN SUSPENDED
--
-- Enforced inside charge_credits rather than in each caller: it is the one
-- chokepoint every AI action already passes through, and a rule spread across
-- callers is a rule that will be missed by the next one.
-- ============================================================================

create or replace function public.charge_credits(
  p_equipe_id       uuid,
  p_credits         integer,
  p_idempotency_key text,
  p_ledger          jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_existing uuid;
  v_balance  integer;
  v_id       uuid;
  v_pool     text;
begin
  v_pool := coalesce(nullif(p_ledger->>'pool', ''), 'copilot');
  if v_pool not in ('whatsapp','copilot') then
    raise exception 'invalid_pool' using errcode = 'P0001';
  end if;

  -- Replay first: an action already charged before the suspension must still
  -- return its original id, or a retry would look like a new failure.
  select id into v_existing
    from public.agent_action_ledger
   where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  if public.tenant_is_suspended(p_equipe_id) then
    raise exception 'contract_suspended' using errcode = 'P0001';
  end if;

  if p_credits is null or p_credits <= 0 then
    raise exception 'invalid_credits' using errcode = 'P0001';
  end if;

  insert into public.agent_credits_balance (equipe_id, pool, balance)
  values (p_equipe_id, v_pool, public.credit_balance(p_equipe_id, v_pool))
  on conflict (equipe_id, pool) do nothing;

  perform 1 from public.agent_credits_balance
   where equipe_id = p_equipe_id and pool = v_pool for update;

  v_balance := public.credit_balance(p_equipe_id, v_pool);
  if v_balance < p_credits then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  begin
    insert into public.credit_ledger (
      equipe_id, entry_type, credits, source, ref_id, idempotency_key, metadata, pool
    ) values (
      p_equipe_id, 'debit', -p_credits, 'ai_action',
      nullif(p_ledger->>'decision_id','')::uuid,
      p_idempotency_key, coalesce(p_ledger, '{}'::jsonb), v_pool
    );

    insert into public.agent_action_ledger (
      equipe_id, opportunity_id, lead_id, decision_id, verb, credits_charged,
      model, real_input_tokens, real_output_tokens, real_cost_usd, mode, idempotency_key
    ) values (
      p_equipe_id,
      nullif(p_ledger->>'opportunity_id','')::uuid,
      nullif(p_ledger->>'lead_id','')::uuid,
      nullif(p_ledger->>'decision_id','')::uuid,
      p_ledger->>'verb', p_credits, p_ledger->>'model',
      nullif(p_ledger->>'real_input_tokens','')::int,
      nullif(p_ledger->>'real_output_tokens','')::int,
      nullif(p_ledger->>'real_cost_usd','')::numeric,
      coalesce(p_ledger->>'mode','manual'), p_idempotency_key
    ) returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.agent_action_ledger
     where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  end;

  perform public.recompute_credit_balance(p_equipe_id, v_pool);
  return v_id;
end;
$fn$;

-- check_credits reports the suspension too, so the Copilot's pre-flight refuses
-- the whole plan instead of discovering it one action in.
create or replace function public.check_credits(
  p_equipe_id uuid, p_estimated integer default 1, p_pool text default 'copilot'
) returns jsonb
language sql stable
set search_path = public
as $fn$
  select jsonb_build_object(
    'allowed', not public.tenant_is_suspended(p_equipe_id)
               and public.credit_balance(p_equipe_id, p_pool) >= greatest(p_estimated, 1),
    'balance', public.credit_balance(p_equipe_id, p_pool),
    'deficit', greatest(0, greatest(p_estimated, 1) - public.credit_balance(p_equipe_id, p_pool)),
    'pool', p_pool,
    'suspended', public.tenant_is_suspended(p_equipe_id)
  );
$fn$;

-- ============================================================================
-- 3. SEAT LIMIT (E1)
--
-- A trigger, not an application check: create-equipe-member is one path in, and
-- the next one added would silently bypass an edge-function guard.
-- ============================================================================

create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_usage jsonb;
begin
  -- Only when a profile JOINS a team. Updates within a team, and the owner row
  -- created during provisioning, are not seat purchases.
  if new.equipe_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.equipe_id is not distinct from new.equipe_id then
    return new;
  end if;

  v_usage := public.tenant_seat_usage(new.equipe_id);
  if not (v_usage->>'can_add')::boolean then
    raise exception 'seat_limit_reached: % de % assentos em uso',
      v_usage->>'used', v_usage->>'limit' using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_profiles_seat_limit on public.profiles;
create trigger trg_profiles_seat_limit
  before insert or update on public.profiles
  for each row execute function public.enforce_seat_limit();

-- ============================================================================
-- 4. ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_c uuid; v_p uuid; v_chk jsonb; v_u uuid; v_usage jsonb; i int;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t81_enf__','x','x') returning id into v_e;
  insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
  values (v_e, 'active', now(), now() + interval '1 month') returning id into v_c;
  select id into v_p from public.billing_products where code = 'plan_starter';  -- 3 seats
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  values (v_c, v_p, 1, 200.00, 'monthly');

  perform public.grant_credits(v_e, 1000, 'plan_period', null, now() + interval '30 days', 'e_g', 'grant', 'copilot');

  -- (a) an active tenant can spend
  v_chk := public.check_credits(v_e, 10, 'copilot');
  assert (v_chk->>'allowed')::boolean, 'ASSERT FAILED: active tenant denied';
  perform public.charge_credits(v_e, 10, 'enf_ok', '{"verb":"reply","mode":"auto"}'::jsonb);

  -- (b) SUSPENSION STOPS AI even with credits in the wallet — the gap B3 named
  update public.contracts set status = 'suspended' where id = v_c;
  v_chk := public.check_credits(v_e, 10, 'copilot');
  assert not (v_chk->>'allowed')::boolean, 'ASSERT FAILED: suspended tenant still allowed';
  assert (v_chk->>'suspended')::boolean, 'ASSERT FAILED: check_credits did not report suspension';
  begin
    perform public.charge_credits(v_e, 10, 'enf_susp', '{"verb":"reply","mode":"auto"}'::jsonb);
    raise exception 'ASSERT FAILED: a suspended tenant was charged for an AI action';
  exception when sqlstate 'P0001' then null;
  end;

  -- (c) a replay of an action charged BEFORE suspension still returns its id,
  -- so a retry does not surface as a new error
  assert public.charge_credits(v_e, 10, 'enf_ok', '{"verb":"reply","mode":"auto"}'::jsonb) is not null,
    'ASSERT FAILED: replay of a pre-suspension charge was refused';

  update public.contracts set status = 'active' where id = v_c;

  -- (d) SEAT LIMIT: Starter sells 3 seats, so the 4th must be refused
  for i in 1..3 loop
    v_u := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values (v_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            format('__enf%s@test.com', i), 'x', now(), now(), now());
    update public.profiles set equipe_id = v_e where user_id = v_u;
  end loop;

  v_usage := public.tenant_seat_usage(v_e);
  assert (v_usage->>'used')::int = 3, format('ASSERT FAILED: seats used %s', v_usage->>'used');
  assert not (v_usage->>'can_add')::boolean, 'ASSERT FAILED: a 4th seat is still allowed';

  v_u := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '__enf4@test.com', 'x', now(), now(), now());
  begin
    update public.profiles set equipe_id = v_e where user_id = v_u;
    raise exception 'ASSERT FAILED: the 4th seat was accepted on a 3-seat plan';
  exception when sqlstate 'P0001' then null;
  end;

  delete from public.equipes where id = v_e;
  delete from auth.users where email like '__enf%@test.com';
  raise notice 'Sprint 8.1 T4 assertions passed';
end $$;
