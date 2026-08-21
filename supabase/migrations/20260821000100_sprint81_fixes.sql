-- 20260821000100_sprint81_fixes.sql
-- Sprint 8.1 fixes · items 1 and 2 of sprint_8.1_billing_v1_fixes.md
--
-- Both are defects introduced by this sprint, not pre-existing ones.

-- ============================================================================
-- FIX 1 — proposals could not be saved.
--
-- 20260819000300 created RLS on proposals with a SELECT policy and NOTHING
-- else. With RLS enabled and no INSERT/UPDATE/DELETE policy, every write from
-- the admin panel was rejected, which is the "erro ao salvar" on the proposal
-- form. The read policy alone made it look configured.
--
-- Writes are super-admin only, same as reads: a proposal is commercial data
-- about a prospect who is not a tenant yet.
-- ============================================================================

drop policy if exists proposals_super_admin_write on public.proposals;
create policy proposals_super_admin_write on public.proposals
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists proposal_items_super_admin_write on public.proposal_items;
create policy proposal_items_super_admin_write on public.proposal_items
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Acceptances stay READ-only for everyone, including super admins. The whole
-- point of the audit trail is that the person who benefits from changing it
-- cannot. It is written exclusively by the public-proposal edge function under
-- the service role.
drop policy if exists proposal_acceptances_super_admin_write on public.proposal_acceptances;

-- ============================================================================
-- FIX 2 — a team with no plan showed 1000 credits in BOTH wallets.
--
-- Two compounding mistakes:
--
-- (a) 20260820000100 added `pool` to agent_credits_balance with
--     `default 'copilot'`. Pre-existing cache rows therefore became COPILOT
--     rows, while the same migration moved the corresponding ledger grants to
--     WHATSAPP. The cache then claimed copilot=1000 and the ledger whatsapp=1000
--     — the header badge read the stale cache, the billing page read the ledger,
--     and they disagreed. Recomputing every row from the ledger fixes it, since
--     the ledger is the source of truth.
--
-- (b) The Sprint 8 backfill granted every existing team its legacy plan
--     allowance. That was wrong for this business: those teams have no contract
--     and no plan, so the honest balance is zero. The founder's decision is that
--     current clients start zeroed and receive a manual add-on until they are
--     regularised onto a real plan.
--
-- The backfill rows are DELETED rather than reversed with adjustments. They
-- describe credits that were never sold, never paid for and never consumed, and
-- leaving a +1000/-1000 pair in a customer's statement would invent a history
-- that did not happen. Real movements are never deleted — only this one
-- migration artefact is.
-- ============================================================================

do $$
declare v_deleted integer; v_teams integer;
begin
  with removable as (
    select cl.id
    from public.credit_ledger cl
    where cl.idempotency_key like 'backfill_sprint8_%'
      -- Only where nothing has been spent against it. If a team has already
      -- consumed credits we leave its history alone and correct by hand.
      and not exists (
        select 1 from public.credit_ledger d
        where d.equipe_id = cl.equipe_id and d.entry_type = 'debit'
      )
      -- ...and only for teams that never got a real contract.
      and not exists (
        select 1 from public.contracts c
        where c.equipe_id = cl.equipe_id
          and c.status in ('active', 'past_due', 'suspended')
      )
  )
  delete from public.credit_ledger cl using removable r where cl.id = r.id;
  get diagnostics v_deleted = row_count;

  -- Rebuild every cached balance from the ledger, for both pools.
  select count(*) into v_teams from public.equipes;
  perform public.recompute_credit_balance(e.id) from public.equipes e;

  -- Drop cache rows for pools that no longer have any ledger movement, so a
  -- stale row cannot outlive the entries that created it.
  delete from public.agent_credits_balance b
   where b.balance = 0
     and not exists (
       select 1 from public.credit_ledger cl
       where cl.equipe_id = b.equipe_id and cl.pool = b.pool
     );

  raise notice 'sprint8.1 fixes: % backfill entries removed, % teams recomputed', v_deleted, v_teams;
end $$;

-- ============================================================================
-- ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_cache integer; v_ledger integer; v_cnt integer;
begin
  -- (a) cache and ledger agree for every team and pool — the disagreement that
  -- produced the wrong badge is impossible now.
  select count(*) into v_cnt
  from public.agent_credits_balance b
  where b.balance is distinct from public.credit_balance(b.equipe_id, b.pool);
  assert v_cnt = 0, format('ASSERT FAILED: %s cached balances disagree with the ledger', v_cnt);

  -- (b) no team without a contract still carries backfill credits
  select count(*) into v_cnt
  from public.credit_ledger cl
  where cl.idempotency_key like 'backfill_sprint8_%'
    and not exists (
      select 1 from public.contracts c
      where c.equipe_id = cl.equipe_id and c.status in ('active','past_due','suspended'))
    and not exists (
      select 1 from public.credit_ledger d
      where d.equipe_id = cl.equipe_id and d.entry_type = 'debit');
  assert v_cnt = 0, format('ASSERT FAILED: %s backfill entries survived', v_cnt);

  -- (c) a brand new team reads zero in both wallets, from cache and ledger alike
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t81fix__','x','x') returning id into v_e;
  assert public.credit_balance(v_e, 'whatsapp') = 0, 'ASSERT FAILED: new team has whatsapp credits';
  assert public.credit_balance(v_e, 'copilot') = 0, 'ASSERT FAILED: new team has copilot credits';

  -- (d) granting one pool must not move the other, and the cache must follow
  perform public.grant_credits(v_e, 500, 'admin', null, null, 'fix_t1', 'topup', 'whatsapp');
  select balance into v_cache from public.agent_credits_balance where equipe_id = v_e and pool = 'whatsapp';
  v_ledger := public.credit_balance(v_e, 'whatsapp');
  assert v_cache = v_ledger and v_cache = 500,
    format('ASSERT FAILED: cache %s vs ledger %s', v_cache, v_ledger);
  assert public.credit_balance(v_e, 'copilot') = 0,
    'ASSERT FAILED: a whatsapp grant leaked into the copilot pool';

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.1 fixes assertions passed';
end $$;
