-- 20260819000200_sprint8_credit_ledger.sql
-- Sprint 8 · T2 — one credit wallet per tenant.
--
-- WHY (audit items 6 and 7): charge_credits() from Sprint 6.1 is atomic,
-- idempotent and TOCTOU-safe — and has ZERO callers. agent_credits_balance is an
-- empty table. Meanwhile the balance shown to users is derived on every page load
-- by calling the provider's credits-spent API. Nothing can block an action on low
-- balance, so the soft stop the founder chose has nothing to enforce against.
--
-- EXPIRY MODEL — the important design decision here.
--
-- A monthly plan allowance is a `grant` that expires at period end; a purchased
-- top-up is a `topup` that never expires. The requirement is that consumption
-- eats the GRANT first, so a customer never loses credits they paid for at the
-- moment their plan renews.
--
-- Rather than splitting every debit across two buckets (which needs two ledger
-- rows per action and makes the idempotency key ambiguous), debits stay plain
-- negative rows and the ordering is enforced at EXPIRY time:
--
--     expired_amount(g) = greatest(0, g.credits - consumed_during_g_period)
--
-- If the customer used 800 of a 1000 grant, 200 expires. If they used 1200
-- (1000 grant + 200 of top-ups), 0 expires and their purchased credits survive.
-- Behaviourally identical to bucket-splitting, with a ledger that stays a simple
-- signed sum.

-- ============================================================================
-- 1. THE LEDGER
-- ============================================================================

create table if not exists public.credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  equipe_id       uuid not null references public.equipes(id) on delete cascade,
  entry_type      text not null check (entry_type in ('grant','topup','debit','refund','expiry','adjustment')),
  credits         integer not null,
  expires_at      timestamptz,
  source          text not null,
  ref_id          uuid,
  metadata        jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  unique (equipe_id, idempotency_key),
  -- Signs are not a convention here, they are enforced. A positive debit or a
  -- negative grant would silently invert a customer's balance.
  constraint credit_ledger_sign check (
    (entry_type in ('grant','topup','refund') and credits > 0)
    or (entry_type in ('debit','expiry') and credits < 0)
    or (entry_type = 'adjustment')
  ),
  constraint credit_ledger_expiry_only_on_grant check (
    expires_at is null or entry_type = 'grant'
  )
);

comment on table public.credit_ledger is
  'Sprint 8 · the single source of truth for credits. agent_credits_balance is a cache of this.';
comment on column public.credit_ledger.credits is
  'SIGNED. grant/topup/refund > 0, debit/expiry < 0. Balance is a plain SUM.';

create index if not exists idx_credit_ledger_equipe_created
  on public.credit_ledger (equipe_id, created_at desc);
create index if not exists idx_credit_ledger_open_grants
  on public.credit_ledger (equipe_id, expires_at)
  where entry_type = 'grant';

alter table public.credit_ledger enable row level security;

drop policy if exists credit_ledger_tenant_read on public.credit_ledger;
create policy credit_ledger_tenant_read on public.credit_ledger
  for select to authenticated using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
  );
-- No write policy: credits are moved only by the functions below, via service role.

-- ============================================================================
-- 2. BALANCE
-- ============================================================================

-- Credits consumed inside a grant's own window. Debits are negative, so this
-- returns a positive "how much was used" number.
create or replace function public.credits_consumed_in_window(
  p_equipe_id uuid, p_from timestamptz, p_to timestamptz
) returns integer
language sql stable
set search_path = public
as $fn$
  select coalesce(-sum(credits), 0)::integer
  from public.credit_ledger
  where equipe_id = p_equipe_id
    and entry_type = 'debit'
    and created_at >= p_from
    and (p_to is null or created_at < p_to);
$fn$;

-- How much of an expired grant is still unconsumed and therefore owed an expiry
-- row. Returns 0 once the cron has materialised it.
create or replace function public.pending_expiry(p_equipe_id uuid)
returns integer
language sql stable
set search_path = public
as $fn$
  select coalesce(sum(
    greatest(0, g.credits - public.credits_consumed_in_window(g.equipe_id, g.created_at, g.expires_at))
  ), 0)::integer
  from public.credit_ledger g
  where g.equipe_id = p_equipe_id
    and g.entry_type = 'grant'
    and g.expires_at is not null
    and g.expires_at <= now()
    and not exists (
      select 1 from public.credit_ledger e
      where e.equipe_id = g.equipe_id and e.entry_type = 'expiry' and e.ref_id = g.id
    );
$fn$;

-- The authoritative balance. Subtracts expiry the cron has not yet written, so
-- the number never overstates just because a scheduled job has not run.
create or replace function public.credit_balance(p_equipe_id uuid)
returns integer
language sql stable
set search_path = public
as $fn$
  select greatest(0,
    coalesce((select sum(credits) from public.credit_ledger where equipe_id = p_equipe_id), 0)
    - public.pending_expiry(p_equipe_id)
  )::integer;
$fn$;

create or replace function public.recompute_credit_balance(p_equipe_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v integer;
begin
  v := public.credit_balance(p_equipe_id);
  insert into public.agent_credits_balance (equipe_id, balance, updated_at)
  values (p_equipe_id, v, now())
  on conflict (equipe_id) do update set balance = excluded.balance, updated_at = now();
  return v;
end;
$fn$;

-- What the UI renders. The split matters commercially: a customer who thinks
-- purchased credits vanish at renewal will not buy top-ups.
create or replace view public.v_credit_balance as
select
  e.id as equipe_id,
  public.credit_balance(e.id) as total,
  coalesce((
    select greatest(0, g.credits - public.credits_consumed_in_window(g.equipe_id, g.created_at, g.expires_at))
    from public.credit_ledger g
    where g.equipe_id = e.id and g.entry_type = 'grant'
      and (g.expires_at is null or g.expires_at > now())
    order by g.created_at desc limit 1
  ), 0) as expiring_balance,
  (
    select g.expires_at
    from public.credit_ledger g
    where g.equipe_id = e.id and g.entry_type = 'grant'
      and (g.expires_at is null or g.expires_at > now())
    order by g.created_at desc limit 1
  ) as grant_expires_at
from public.equipes e;

comment on view public.v_credit_balance is
  'permanent_balance = total - expiring_balance. Read via the security-definer RPC or service role.';

-- ============================================================================
-- 3. MOVING CREDITS
-- ============================================================================

-- Adds credits. Used by the webhook (topup, after a confirmed payment) and by
-- the cron (grant, at period rollover). Idempotent: a webhook redelivery or a
-- double cron tick credits exactly once.
create or replace function public.grant_credits(
  p_equipe_id       uuid,
  p_credits         integer,
  p_source          text,
  p_ref_id          uuid,
  p_expires_at      timestamptz,
  p_idempotency_key text,
  p_entry_type      text default 'grant'
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

  select id into v_id from public.credit_ledger
   where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;  -- replay
  end if;

  begin
    insert into public.credit_ledger (
      equipe_id, entry_type, credits, expires_at, source, ref_id, idempotency_key
    ) values (
      p_equipe_id, p_entry_type, p_credits,
      case when p_entry_type = 'grant' then p_expires_at else null end,
      p_source, p_ref_id, p_idempotency_key
    ) returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.credit_ledger
     where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  end;

  perform public.recompute_credit_balance(p_equipe_id);
  return v_id;
end;
$fn$;

-- Pre-flight check for the soft stop. Does NOT debit. This is what lets an AI
-- action refuse before spending money with the provider.
create or replace function public.check_credits(
  p_equipe_id uuid, p_estimated integer default 1
) returns jsonb
language sql stable
set search_path = public
as $fn$
  select jsonb_build_object(
    'allowed', public.credit_balance(p_equipe_id) >= greatest(p_estimated, 1),
    'balance', public.credit_balance(p_equipe_id),
    'deficit', greatest(0, greatest(p_estimated, 1) - public.credit_balance(p_equipe_id))
  );
$fn$;

-- Materialises expiry for grants past their date. Called by billing-cron (T7).
create or replace function public.expire_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r        record;
  v_amount integer;
  v_count  integer := 0;
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
    v_amount := greatest(0, r.credits - public.credits_consumed_in_window(r.equipe_id, r.created_at, r.expires_at));
    if v_amount > 0 then
      insert into public.credit_ledger (equipe_id, entry_type, credits, source, ref_id, idempotency_key)
      values (r.equipe_id, 'expiry', -v_amount, 'plan_period', r.id, 'expiry_' || r.id::text)
      on conflict (equipe_id, idempotency_key) do nothing;
    else
      -- Nothing left to expire, but record a zero-value adjustment so this grant
      -- stops being reconsidered on every run.
      insert into public.credit_ledger (equipe_id, entry_type, credits, source, ref_id, idempotency_key)
      values (r.equipe_id, 'expiry', -0, 'plan_period', r.id, 'expiry_' || r.id::text)
      on conflict (equipe_id, idempotency_key) do nothing;
    end if;
    perform public.recompute_credit_balance(r.equipe_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

-- A zero-credit expiry row is legitimate (see above), so relax the sign rule for
-- expiry specifically: it may be zero or negative, never positive.
alter table public.credit_ledger drop constraint if exists credit_ledger_sign;
alter table public.credit_ledger add constraint credit_ledger_sign check (
  (entry_type in ('grant','topup','refund') and credits > 0)
  or (entry_type = 'debit' and credits < 0)
  or (entry_type = 'expiry' and credits <= 0)
  or (entry_type = 'adjustment')
);

-- ============================================================================
-- 4. charge_credits — EXTENDED, not replaced.
--
-- The Sprint 6.1 implementation is already atomic, idempotent and TOCTOU-safe;
-- that design is kept verbatim. Two changes:
--   (a) it now also writes the debit to credit_ledger, the new source of truth;
--   (b) the balance is read from the ledger rather than trusting the cache.
--
-- BEHAVIOUR CHANGE: the old function raised 'no_wallet' when agent_credits_balance
-- had no row. With the ledger, a tenant with no entries simply has a balance of 0,
-- so that case now raises 'insufficient_credits' like any other empty wallet.
-- Safe to change: the function had no callers.
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
begin
  select id into v_existing
    from public.agent_action_ledger
   where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  if p_credits is null or p_credits <= 0 then
    raise exception 'invalid_credits' using errcode = 'P0001';
  end if;

  -- Serialise concurrent charges for this tenant. The cache row doubles as the
  -- lock target, so make sure it exists before locking it.
  insert into public.agent_credits_balance (equipe_id, balance)
  values (p_equipe_id, public.credit_balance(p_equipe_id))
  on conflict (equipe_id) do nothing;

  perform 1 from public.agent_credits_balance
   where equipe_id = p_equipe_id for update;

  v_balance := public.credit_balance(p_equipe_id);
  if v_balance < p_credits then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  -- Debit + both ledger inserts in one sub-block. A unique_violation here means a
  -- concurrent same-key call won the race after our early SELECT (TOCTOU). The
  -- sub-block rolls back everything on exception, so there is no double-charge;
  -- we then return the existing ledger id (replay).
  begin
    insert into public.credit_ledger (
      equipe_id, entry_type, credits, source, ref_id, idempotency_key, metadata
    ) values (
      p_equipe_id, 'debit', -p_credits, 'ai_action',
      nullif(p_ledger->>'decision_id','')::uuid,
      p_idempotency_key,
      coalesce(p_ledger, '{}'::jsonb)
    );

    insert into public.agent_action_ledger (
      equipe_id, opportunity_id, lead_id, decision_id, verb, credits_charged,
      model, real_input_tokens, real_output_tokens, real_cost_usd, mode, idempotency_key
    ) values (
      p_equipe_id,
      nullif(p_ledger->>'opportunity_id','')::uuid,
      nullif(p_ledger->>'lead_id','')::uuid,
      nullif(p_ledger->>'decision_id','')::uuid,
      p_ledger->>'verb',
      p_credits,
      p_ledger->>'model',
      nullif(p_ledger->>'real_input_tokens','')::int,
      nullif(p_ledger->>'real_output_tokens','')::int,
      nullif(p_ledger->>'real_cost_usd','')::numeric,
      coalesce(p_ledger->>'mode','manual'),
      p_idempotency_key
    ) returning id into v_id;
  exception when unique_violation then
    select id into v_id
      from public.agent_action_ledger
     where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  end;

  perform public.recompute_credit_balance(p_equipe_id);
  return v_id;
end;
$fn$;

-- ============================================================================
-- 5. BACKFILL — the zero mark for every existing tenant.
--
-- Consumption before this point was never ledgered and cannot be reconstructed;
-- the reconciliation job (T11) takes over from here.
-- ============================================================================

do $$
declare r record; v_allowance integer; v_end timestamptz;
begin
  for r in
    select e.id, e.limite_creditos, e.creditos_avulsos, e.plano_id,
           p.limite_creditos as plano_creditos
    from public.equipes e
    left join public.planos p on p.id = e.plano_id
  loop
    -- Same precedence the app already uses (fixed in commit 5047c9b):
    -- the plan's allowance wins over the legacy per-team column.
    v_allowance := coalesce(r.plano_creditos, r.limite_creditos, 0);
    v_end := date_trunc('month', now()) + interval '1 month';

    if v_allowance > 0 then
      perform public.grant_credits(
        r.id, v_allowance, 'plan_period', null, v_end,
        'backfill_sprint8_grant_' || r.id::text, 'grant');
    end if;

    if coalesce(r.creditos_avulsos, 0) > 0 then
      perform public.grant_credits(
        r.id, r.creditos_avulsos, 'invoice', null, null,
        'backfill_sprint8_topup_' || r.id::text, 'topup');
    end if;

    perform public.recompute_credit_balance(r.id);
  end loop;
end $$;

-- ============================================================================
-- 6. ASSERTIONS
-- ============================================================================

do $$
declare
  v_equipe uuid;
  v_end    timestamptz := now() + interval '30 days';
  v_a      uuid;
  v_b      uuid;
  v_bal    integer;
  v_chk    jsonb;
  v_grant  uuid;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t2_assert__', 'x', 'x') returning id into v_equipe;

  -- (a) grant + topup accumulate
  perform public.grant_credits(v_equipe, 1000, 'plan_period', null, v_end, 'k_grant', 'grant');
  perform public.grant_credits(v_equipe,  500, 'invoice',     null, null,  'k_topup', 'topup');
  assert public.credit_balance(v_equipe) = 1500,
    format('ASSERT FAILED: expected 1500, got %s', public.credit_balance(v_equipe));

  -- (b) replaying an idempotency key credits once, not twice.
  -- This is the exact path an Asaas webhook redelivery takes.
  perform public.grant_credits(v_equipe, 500, 'invoice', null, null, 'k_topup', 'topup');
  assert public.credit_balance(v_equipe) = 1500,
    format('ASSERT FAILED: replay double-credited, got %s', public.credit_balance(v_equipe));

  -- (c) charge_credits debits and is idempotent
  v_a := public.charge_credits(v_equipe, 200, 'act_1', '{"verb":"reply","mode":"auto"}'::jsonb);
  assert public.credit_balance(v_equipe) = 1300, 'ASSERT FAILED: debit did not apply';
  v_b := public.charge_credits(v_equipe, 200, 'act_1', '{"verb":"reply","mode":"auto"}'::jsonb);
  assert v_a = v_b, 'ASSERT FAILED: replay created a second action';
  assert public.credit_balance(v_equipe) = 1300, 'ASSERT FAILED: replay double-charged';

  -- (d) the cache mirrors the ledger
  select balance into v_bal from public.agent_credits_balance where equipe_id = v_equipe;
  assert v_bal = 1300, format('ASSERT FAILED: cache says %s, ledger says 1300', v_bal);

  -- (e) insufficient balance is refused
  begin
    perform public.charge_credits(v_equipe, 999999, 'act_toobig', '{"mode":"auto"}'::jsonb);
    raise exception 'ASSERT FAILED: a charge beyond the balance was allowed';
  exception when sqlstate 'P0001' then null;
  end;

  -- (f) check_credits reports without moving anything
  v_chk := public.check_credits(v_equipe, 100);
  assert (v_chk->>'allowed')::boolean, 'ASSERT FAILED: check_credits denied an affordable charge';
  v_chk := public.check_credits(v_equipe, 99999);
  assert not (v_chk->>'allowed')::boolean, 'ASSERT FAILED: check_credits allowed an unaffordable charge';
  assert (v_chk->>'deficit')::int = 99999 - 1300, 'ASSERT FAILED: wrong deficit';
  assert public.credit_balance(v_equipe) = 1300, 'ASSERT FAILED: check_credits moved the balance';

  -- (g) THE COMMERCIAL GUARANTEE: expiry takes only what is left of the grant,
  -- so purchased credits survive the renewal.
  -- 1000 granted, 200 consumed -> 800 expires, the 500 top-up is untouched.
  --
  -- Backdate first. Inside a single transaction now() is frozen, so every row
  -- above shares one timestamp and a grant window would contain nothing. Spread
  -- them out to simulate a real period: grant, then usage, then expiry.
  update public.credit_ledger set created_at = now() - interval '2 hours'
   where equipe_id = v_equipe and entry_type = 'grant';
  update public.credit_ledger set created_at = now() - interval '1 hour'
   where equipe_id = v_equipe and entry_type = 'debit';
  update public.credit_ledger set expires_at = now() - interval '1 minute'
   where equipe_id = v_equipe and entry_type = 'grant';
  perform public.expire_credits();
  assert public.credit_balance(v_equipe) = 500,
    format('ASSERT FAILED: after expiry expected 500 (the purchased top-up), got %s',
           public.credit_balance(v_equipe));

  -- (h) expiry is idempotent
  perform public.expire_credits();
  assert public.credit_balance(v_equipe) = 500, 'ASSERT FAILED: expiry ran twice';

  -- (i) signs are enforced
  begin
    insert into public.credit_ledger (equipe_id, entry_type, credits, source, idempotency_key)
    values (v_equipe, 'grant', -5, 'x', 'bad_sign');
    raise exception 'ASSERT FAILED: a negative grant was accepted';
  exception when check_violation then null;
  end;

  delete from public.equipes where id = v_equipe;
  raise notice 'T2 assertions passed';
end $$;
