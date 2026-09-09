-- 20260909000100_sebill002_consumption_accounting.sql
-- SE-BILL-002 · the expiry accounting cannot see the attendance agent's usage.
--
-- WHAT IS WRONG
--
-- `credits_consumed_in_window()` answers "how much of this grant was used
-- inside its own window", and `pending_expiry()`/`expire_credits()` claw back
-- the rest when the grant expires. It counted `entry_type = 'debit'` and
-- nothing else.
--
-- But the WhatsApp pool has NO debit path. The attendance agent generates
-- provider-side, so its consumption never passes through `charge_credits`;
-- `credits-reconcile` books it nightly as `adjustment` rows instead (see that
-- file's header — writing adjustments is a deliberate design decision, because
-- they are corrections and carry their reason).
--
-- So for every plan grant on the WhatsApp pool, the consumption was invisible
-- to the expiry accounting: the grant looked 100% unused and was clawed back IN
-- FULL, on top of the reconcile adjustments that had already removed the same
-- credits from the sum. The ledger keeps the difference as a permanent negative
-- residue, and because `credit_balance` is `greatest(0, sum - pending_expiry)`
-- the residue is invisible in the panel while it silently eats every top-up the
-- customer buys afterwards.
--
-- Reproduced on a scratch Postgres running the functions as they were:
--
--   grant  2000 whatsapp  2026-08-01, expires 2026-09-01
--   adjust -1600          2026-08-15  (credits-reconcile: provider usage)
--   topup   +500          2026-08-20  (customer bought credits)
--   expire_credits()      ->  booked an expiry row of -2000, not -400
--   credit_balance        ->  0        (the 500 the customer paid for is gone)
--   raw ledger sum        ->  -1100    (the invisible residue)
--
-- This is the same failure the Sprint 8.5 repair migration compensated by hand
-- ("aqueles buracos engoliram silenciosamente cada recarga"). Sprint 8.5 fixed
-- the reconciler's magnitude; the hole itself was never closed.
--
-- THE FIX
--
-- Count consumption the way the pool actually consumes: metered `debit` rows
-- plus the negative `adjustment` rows that represent real removals from the
-- pool. Two kinds are deliberately NOT consumption:
--
--   * positive adjustments — the Sprint 8.5 repair credits and admin grants add
--     credits, they do not spend them;
--   * `source = 'invoice'` adjustments — refund reversals. Those undo one
--     specific grant or top-up (`ref_id` says which), so charging them against
--     a different grant's window would understate that grant's expiry.
--
-- KNOWN LIMIT, recorded rather than hidden: refunding a *recurring* invoice
-- mid-period reverses the plan grant itself through that same `invoice` source,
-- and the grant's own expiry would then still double-remove. Refunding a live
-- plan period is not an operation the panel offers today, so this is left
-- as-is instead of guessing at a rule for it.

create or replace function public.credits_consumed_in_window(
  p_equipe_id uuid, p_from timestamptz, p_to timestamptz, p_pool text default null
) returns integer
language sql stable
set search_path = public
as $fn$
  select coalesce(-sum(credits), 0)::integer
  from public.credit_ledger
  where equipe_id = p_equipe_id
    and (p_pool is null or pool = p_pool)
    and created_at >= p_from
    and (p_to is null or created_at < p_to)
    and (
      entry_type = 'debit'
      -- SE-BILL-002: the WhatsApp pool is consumed provider-side and lands here
      -- as a reconcile adjustment. Negative only, and never a refund reversal.
      or (entry_type = 'adjustment' and credits < 0 and source <> 'invoice')
    );
$fn$;

comment on function public.credits_consumed_in_window(uuid, timestamptz, timestamptz, text) is
  'Credits consumed on a pool inside a window. Counts metered `debit` rows AND the negative `adjustment` rows credits-reconcile books for the attendance agent''s provider-side usage (SE-BILL-002) — the WhatsApp pool has no debit path, so debits alone read as "nothing was used" and the expiry claw-back removed the full grant a second time. Excludes positive adjustments (repairs/admin grants) and `invoice` adjustments (refund reversals, which are tied to their own grant by ref_id).';

-- ============================================================================
-- REPAIR — expiry rows already booked against the old, blind arithmetic.
--
-- Replacing the function above fixes `pending_expiry()` for grants that have
-- not been swept yet, because it is computed on read. It does NOT fix grants
-- `expire_credits()` already processed: those wrote a concrete `expiry` row for
-- the full grant, and `pending_expiry` skips a grant once such a row exists.
--
-- Append-only, exactly as Sprint 8.5 argued: a positive adjustment with a
-- reason shows both the error and the correction, which is what a customer is
-- entitled to see in their statement. Deleting the wrong row would hide it.
-- ============================================================================
do $$
declare
  r          record;
  v_booked   integer;
  v_correct  integer;
  v_delta    integer;
  v_rows     integer := 0;
  v_credits  integer := 0;
begin
  for r in
    select e.id      as expiry_id,
           e.equipe_id,
           e.credits as expiry_credits,
           e.pool,
           g.id         as grant_id,
           g.credits    as grant_credits,
           g.created_at as grant_from,
           g.expires_at as grant_to
    from public.credit_ledger e
    join public.credit_ledger g
      on g.id = e.ref_id
     and g.entry_type = 'grant'
    where e.entry_type = 'expiry'
  loop
    -- Expiry rows are stored negative; compare magnitudes.
    v_booked  := -r.expiry_credits;
    v_correct := greatest(0, r.grant_credits - public.credits_consumed_in_window(
                                 r.equipe_id, r.grant_from, r.grant_to, r.pool));
    v_delta   := v_booked - v_correct;

    -- Only over-removal is repaired. A booked expiry SMALLER than the corrected
    -- figure would mean the grant was under-expired; clawing more back now would
    -- be charging a customer for a past accounting decision, so it is left be.
    continue when v_delta <= 0;

    insert into public.credit_ledger (
      equipe_id, entry_type, credits, source, pool, ref_id, idempotency_key, metadata
    ) values (
      r.equipe_id,
      'adjustment',
      v_delta,
      'reconcile',
      r.pool,
      r.grant_id,
      'sebill002_expiry_repair_' || r.expiry_id::text,
      jsonb_build_object(
        'reason',        'sebill002_over_expiry_repair',
        'expiry_row',    r.expiry_id,
        'grant_row',     r.grant_id,
        'booked_expiry', v_booked,
        'correct_expiry', v_correct,
        'window_from',   r.grant_from,
        'window_to',     r.grant_to
      )
    )
    on conflict (equipe_id, idempotency_key) do nothing;

    if found then
      v_rows    := v_rows + 1;
      v_credits := v_credits + v_delta;
    end if;
  end loop;

  -- The cache table is derived; every touched tenant has to be recomputed or the
  -- panel keeps showing the pre-repair number. Sprint 8.2 exists because money
  -- was once written somewhere no consumer read.
  perform public.recompute_credit_balance(equipe_id)
     from (select distinct equipe_id from public.credit_ledger
            where source = 'reconcile'
              and metadata->>'reason' = 'sebill002_over_expiry_repair') s;

  raise notice 'SE-BILL-002 expiry repair: % row(s), % credit(s) returned', v_rows, v_credits;
end $$;

-- ============================================================================
-- ASSERTIONS — the arithmetic this migration exists to fix.
--
-- Deliberately does NOT call expire_credits(): that function sweeps EVERY
-- expired grant in the database, so calling it from a migration would fire a
-- global expiry as a side effect of a deploy. pending_expiry() is a pure read
-- and proves the same arithmetic.
-- ============================================================================
do $$
declare
  v_equipe uuid;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__sebill002_assert__', 'x', 'x') returning id into v_equipe;

  -- The reproduction from this file's header.
  insert into public.credit_ledger
    (equipe_id, entry_type, credits, expires_at, source, pool, idempotency_key, created_at) values
    (v_equipe, 'grant',      2000, now() - interval '1 day', 'plan_period', 'whatsapp', 'a_grant', now() - interval '32 days'),
    (v_equipe, 'adjustment', -1600, null,                    'reconcile',   'whatsapp', 'a_recon', now() - interval '20 days'),
    (v_equipe, 'topup',        500, null,                    'invoice',     'whatsapp', 'a_topup', now() - interval '15 days');

  -- 2000 granted, 1600 consumed by the attendance agent -> 400 unused expires.
  assert public.pending_expiry(v_equipe, 'whatsapp') = 400,
    format('ASSERT FAILED: pending_expiry should be 400, got %s', public.pending_expiry(v_equipe, 'whatsapp'));

  -- sum = 2000 - 1600 + 500 = 900; minus the 400 that expires -> the top-up survives.
  assert public.credit_balance(v_equipe, 'whatsapp') = 500,
    format('ASSERT FAILED: the top-up was swallowed; balance %s, expected 500',
           public.credit_balance(v_equipe, 'whatsapp'));

  -- A positive adjustment is not consumption: the Sprint 8.5 repair credits must
  -- not make an expiring grant look more used than it was.
  insert into public.credit_ledger
    (equipe_id, entry_type, credits, source, pool, idempotency_key, created_at)
  values (v_equipe, 'adjustment', 300, 'reconcile', 'whatsapp', 'a_repair', now() - interval '18 days');
  assert public.pending_expiry(v_equipe, 'whatsapp') = 400,
    format('ASSERT FAILED: a positive adjustment changed the expiry to %s',
           public.pending_expiry(v_equipe, 'whatsapp'));

  -- A refund reversal is not consumption of an unrelated grant either.
  insert into public.credit_ledger
    (equipe_id, entry_type, credits, source, pool, idempotency_key, created_at)
  values (v_equipe, 'adjustment', -500, 'invoice', 'whatsapp', 'a_refund', now() - interval '14 days');
  assert public.pending_expiry(v_equipe, 'whatsapp') = 400,
    format('ASSERT FAILED: a refund reversal changed the expiry to %s',
           public.pending_expiry(v_equipe, 'whatsapp'));

  -- Pools stay separate: Copilot debits are not WhatsApp consumption.
  insert into public.credit_ledger
    (equipe_id, entry_type, credits, source, pool, idempotency_key, created_at)
  values (v_equipe, 'debit', -100, 'copilot', 'copilot', 'a_cop', now() - interval '10 days');
  assert public.pending_expiry(v_equipe, 'whatsapp') = 400,
    format('ASSERT FAILED: a copilot debit leaked into the whatsapp expiry (%s)',
           public.pending_expiry(v_equipe, 'whatsapp'));

  delete from public.equipes where id = v_equipe;
  raise notice 'SE-BILL-002 assertions passed';
end $$;
