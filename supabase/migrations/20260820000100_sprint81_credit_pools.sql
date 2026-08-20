-- 20260820000100_sprint81_credit_pools.sql
-- Sprint 8.1 · T1 — two credit pools.
--
-- WHY: Sprint 8 deliberately unified every wallet into one balance (founder
-- decision 4). The new plan architecture separates them again, and this time for
-- a reason that matters: the attendance agent (WhatsApp, consumed provider-side)
-- and the Copilot (ours) have different unit economics. One shared balance hides
-- which of the two is burning margin, and a tenant that drains the pool on
-- WhatsApp would silently disable the Copilot they also paid for.
--
-- DESIGN: `pool` is a dimension on the ledger, not a second ledger. One table,
-- one set of functions, one audit trail — a second ledger would double every
-- expiry, reconciliation and balance code path, and the two would drift.
--
-- charge_credits() keeps its 4-argument signature ON PURPOSE. The Copilot calls
-- it from python-agent/app/credits.py; changing the signature would break a
-- deployed service. The pool is read from the ledger jsonb instead, defaulting
-- to 'copilot' because that is the only caller.

-- ============================================================================
-- 1. THE POOL DIMENSION
-- ============================================================================

alter table public.credit_ledger
  add column if not exists pool text not null default 'copilot';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credit_ledger_pool_check') then
    alter table public.credit_ledger
      add constraint credit_ledger_pool_check check (pool in ('whatsapp', 'copilot'));
  end if;
end $$;

comment on column public.credit_ledger.pool is
  'whatsapp = attendance agent (provider-side consumption). copilot = our Agno agent. Separate balances, one ledger.';

-- Existing rows predate the split. Grants and top-ups were the plan allowance,
-- which under the old model fed the WhatsApp agent; debits came from the Copilot
-- (the only thing calling charge_credits). Nothing is deployed yet, so this only
-- tidies development data.
update public.credit_ledger set pool = 'whatsapp'
 where entry_type in ('grant', 'topup', 'expiry') and pool = 'copilot'
   and source in ('plan_period', 'invoice');

drop index if exists idx_credit_ledger_open_grants;
create index if not exists idx_credit_ledger_pool_grants
  on public.credit_ledger (equipe_id, pool, expires_at)
  where entry_type = 'grant';

-- The cache gets a pool too. PK moves to (equipe_id, pool).
alter table public.agent_credits_balance
  add column if not exists pool text not null default 'copilot';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'agent_credits_balance_pkey' and conrelid = 'public.agent_credits_balance'::regclass
  ) and not exists (
    select 1 from pg_constraint where conname = 'agent_credits_balance_equipe_pool_key'
  ) then
    alter table public.agent_credits_balance drop constraint agent_credits_balance_pkey;
    alter table public.agent_credits_balance
      add constraint agent_credits_balance_equipe_pool_key primary key (equipe_id, pool);
  end if;
end $$;

-- ============================================================================
-- 2. BALANCE, PER POOL
--
-- The Sprint 8 signatures must be DROPPED, not just replaced. Adding a defaulted
-- parameter creates an overload rather than superseding the original, and then a
-- 1-argument call matches both -- Postgres refuses it as "not unique". Dropping
-- first is what makes existing callers keep working.
-- ============================================================================

drop function if exists public.credit_balance(uuid);
drop function if exists public.recompute_credit_balance(uuid);
drop function if exists public.pending_expiry(uuid);
drop function if exists public.credits_consumed_in_window(uuid, timestamptz, timestamptz);
drop function if exists public.check_credits(uuid, integer);
drop function if exists public.grant_credits(uuid, integer, text, uuid, timestamptz, text, text);

create or replace function public.credits_consumed_in_window(
  p_equipe_id uuid, p_from timestamptz, p_to timestamptz, p_pool text default null
) returns integer
language sql stable
set search_path = public
as $fn$
  select coalesce(-sum(credits), 0)::integer
  from public.credit_ledger
  where equipe_id = p_equipe_id
    and entry_type = 'debit'
    and (p_pool is null or pool = p_pool)
    and created_at >= p_from
    and (p_to is null or created_at < p_to);
$fn$;

create or replace function public.pending_expiry(p_equipe_id uuid, p_pool text default null)
returns integer
language sql stable
set search_path = public
as $fn$
  select coalesce(sum(
    greatest(0, g.credits - public.credits_consumed_in_window(g.equipe_id, g.created_at, g.expires_at, g.pool))
  ), 0)::integer
  from public.credit_ledger g
  where g.equipe_id = p_equipe_id
    and g.entry_type = 'grant'
    and (p_pool is null or g.pool = p_pool)
    and g.expires_at is not null
    and g.expires_at <= now()
    and not exists (
      select 1 from public.credit_ledger e
      where e.equipe_id = g.equipe_id and e.entry_type = 'expiry' and e.ref_id = g.id
    );
$fn$;

-- p_pool null = every pool combined. Keeps the 1-argument call working for
-- callers that legitimately want the grand total.
create or replace function public.credit_balance(p_equipe_id uuid, p_pool text default null)
returns integer
language sql stable
set search_path = public
as $fn$
  select greatest(0,
    coalesce((
      select sum(credits) from public.credit_ledger
      where equipe_id = p_equipe_id and (p_pool is null or pool = p_pool)
    ), 0)
    - public.pending_expiry(p_equipe_id, p_pool)
  )::integer;
$fn$;

create or replace function public.recompute_credit_balance(p_equipe_id uuid, p_pool text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v integer; p text;
begin
  foreach p in array (case when p_pool is null then array['whatsapp','copilot'] else array[p_pool] end)
  loop
    v := public.credit_balance(p_equipe_id, p);
    insert into public.agent_credits_balance (equipe_id, pool, balance, updated_at)
    values (p_equipe_id, p, v, now())
    on conflict (equipe_id, pool) do update set balance = excluded.balance, updated_at = now();
  end loop;
  return public.credit_balance(p_equipe_id, p_pool);
end;
$fn$;

drop view if exists public.v_credit_balance;
create view public.v_credit_balance as
select
  e.id as equipe_id,
  public.credit_balance(e.id, 'whatsapp') as whatsapp_total,
  public.credit_balance(e.id, 'copilot')  as copilot_total,
  public.credit_balance(e.id)             as total,
  coalesce((
    select greatest(0, g.credits - public.credits_consumed_in_window(g.equipe_id, g.created_at, g.expires_at, g.pool))
    from public.credit_ledger g
    where g.equipe_id = e.id and g.entry_type = 'grant' and g.pool = 'whatsapp'
      and (g.expires_at is null or g.expires_at > now())
    order by g.created_at desc limit 1
  ), 0) as whatsapp_expiring,
  coalesce((
    select greatest(0, g.credits - public.credits_consumed_in_window(g.equipe_id, g.created_at, g.expires_at, g.pool))
    from public.credit_ledger g
    where g.equipe_id = e.id and g.entry_type = 'grant' and g.pool = 'copilot'
      and (g.expires_at is null or g.expires_at > now())
    order by g.created_at desc limit 1
  ), 0) as copilot_expiring,
  (
    select g.expires_at from public.credit_ledger g
    where g.equipe_id = e.id and g.entry_type = 'grant'
      and (g.expires_at is null or g.expires_at > now())
    order by g.created_at desc limit 1
  ) as grant_expires_at
from public.equipes e;

-- ============================================================================
-- 3. MOVING CREDITS, PER POOL
-- ============================================================================

create or replace function public.grant_credits(
  p_equipe_id       uuid,
  p_credits         integer,
  p_source          text,
  p_ref_id          uuid,
  p_expires_at      timestamptz,
  p_idempotency_key text,
  p_entry_type      text default 'grant',
  p_pool            text default 'whatsapp'
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'invalid_credits' using errcode = 'P0001';
  end if;
  if p_entry_type not in ('grant','topup','refund') then
    raise exception 'invalid_entry_type' using errcode = 'P0001';
  end if;
  if p_pool not in ('whatsapp','copilot') then
    raise exception 'invalid_pool' using errcode = 'P0001';
  end if;

  select id into v_id from public.credit_ledger
   where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.credit_ledger (
      equipe_id, entry_type, credits, expires_at, source, ref_id, idempotency_key, pool
    ) values (
      p_equipe_id, p_entry_type, p_credits,
      case when p_entry_type = 'grant' then p_expires_at else null end,
      p_source, p_ref_id, p_idempotency_key, p_pool
    ) returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.credit_ledger
     where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  end;

  perform public.recompute_credit_balance(p_equipe_id, p_pool);
  return v_id;
end;
$fn$;

create or replace function public.check_credits(
  p_equipe_id uuid, p_estimated integer default 1, p_pool text default 'copilot'
) returns jsonb
language sql stable
set search_path = public
as $fn$
  select jsonb_build_object(
    'allowed', public.credit_balance(p_equipe_id, p_pool) >= greatest(p_estimated, 1),
    'balance', public.credit_balance(p_equipe_id, p_pool),
    'deficit', greatest(0, greatest(p_estimated, 1) - public.credit_balance(p_equipe_id, p_pool)),
    'pool', p_pool
  );
$fn$;

create or replace function public.expire_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare r record; v_amount integer; v_count integer := 0;
begin
  for r in
    select g.* from public.credit_ledger g
    where g.entry_type = 'grant'
      and g.expires_at is not null
      and g.expires_at <= now()
      and not exists (
        select 1 from public.credit_ledger e
        where e.equipe_id = g.equipe_id and e.entry_type = 'expiry' and e.ref_id = g.id
      )
  loop
    v_amount := greatest(0, r.credits - public.credits_consumed_in_window(r.equipe_id, r.created_at, r.expires_at, r.pool));
    insert into public.credit_ledger (equipe_id, entry_type, credits, source, ref_id, idempotency_key, pool)
    values (r.equipe_id, 'expiry', -v_amount, 'plan_period', r.id, 'expiry_' || r.id::text, r.pool)
    on conflict (equipe_id, idempotency_key) do nothing;
    perform public.recompute_credit_balance(r.equipe_id, r.pool);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

-- ============================================================================
-- 4. charge_credits — SAME 4-ARGUMENT SIGNATURE.
--
-- python-agent/app/credits.py calls this with exactly four parameters. Adding a
-- fifth would break a deployed service on the next migration, so the pool rides
-- in the ledger jsonb and defaults to 'copilot' — the only caller today.
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

  select id into v_existing
    from public.agent_action_ledger
   where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
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

-- ============================================================================
-- 5. ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_chk jsonb; v_id uuid;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t81_assert__','x','x') returning id into v_e;

  perform public.grant_credits(v_e, 2500, 'plan_period', null, now() + interval '30 days', 'wa_g', 'grant', 'whatsapp');
  perform public.grant_credits(v_e,  500, 'plan_period', null, now() + interval '30 days', 'cp_g', 'grant', 'copilot');

  -- (a) pools are independent
  assert public.credit_balance(v_e, 'whatsapp') = 2500,
    format('ASSERT FAILED: whatsapp %s, expected 2500', public.credit_balance(v_e,'whatsapp'));
  assert public.credit_balance(v_e, 'copilot') = 500,
    format('ASSERT FAILED: copilot %s, expected 500', public.credit_balance(v_e,'copilot'));
  assert public.credit_balance(v_e) = 3000, 'ASSERT FAILED: combined total wrong';

  -- (b) THE POINT OF THE SPLIT: draining WhatsApp must not disable the Copilot
  perform public.grant_credits(v_e, 1, 'invoice', null, null, 'noop', 'topup', 'whatsapp');
  insert into public.credit_ledger (equipe_id, entry_type, credits, source, idempotency_key, pool)
  values (v_e, 'debit', -2501, 'ai_action', 'wa_drain', 'whatsapp');
  perform public.recompute_credit_balance(v_e);
  assert public.credit_balance(v_e, 'whatsapp') = 0, 'ASSERT FAILED: whatsapp should be drained';
  assert public.credit_balance(v_e, 'copilot') = 500,
    'ASSERT FAILED: draining WhatsApp also drained the Copilot — the pools are not isolated';

  -- (c) check_credits answers per pool
  v_chk := public.check_credits(v_e, 10, 'whatsapp');
  assert not (v_chk->>'allowed')::boolean, 'ASSERT FAILED: whatsapp allowed while empty';
  v_chk := public.check_credits(v_e, 10, 'copilot');
  assert (v_chk->>'allowed')::boolean, 'ASSERT FAILED: copilot denied while funded';

  -- (d) charge_credits keeps its 4-arg signature and defaults to copilot
  v_id := public.charge_credits(v_e, 10, 'act_default', '{"verb":"reply","mode":"auto"}'::jsonb);
  assert v_id is not null, 'ASSERT FAILED: 4-arg charge_credits broke';
  assert public.credit_balance(v_e, 'copilot') = 490,
    format('ASSERT FAILED: default pool charge hit the wrong pool (copilot=%s)', public.credit_balance(v_e,'copilot'));

  -- (e) an explicit pool in the ledger jsonb routes the charge
  perform public.grant_credits(v_e, 100, 'invoice', null, null, 'wa_top', 'topup', 'whatsapp');
  perform public.charge_credits(v_e, 40, 'act_wa', '{"verb":"reply","mode":"auto","pool":"whatsapp"}'::jsonb);
  assert public.credit_balance(v_e, 'whatsapp') = 60,
    format('ASSERT FAILED: whatsapp %s, expected 60', public.credit_balance(v_e,'whatsapp'));
  assert public.credit_balance(v_e, 'copilot') = 490, 'ASSERT FAILED: whatsapp charge touched the copilot pool';

  -- (f) an unknown pool is refused rather than silently defaulted
  begin
    perform public.charge_credits(v_e, 1, 'act_bad', '{"pool":"inexistente"}'::jsonb);
    raise exception 'ASSERT FAILED: an invalid pool was accepted';
  exception when sqlstate 'P0001' then null;
  end;

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.1 T1 assertions passed';
end $$;
