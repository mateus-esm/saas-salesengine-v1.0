-- 20260820000200_sprint81_plan_architecture.sql
-- Sprint 8.1 · T2 — the new plan revenue architecture.
--
-- Fixes the pricing inversion recorded as TODO A1. Under the Sprint 8 catalog a
-- top-up cost R$0,080/credit while the best plan cost R$0,100 — so the cheapest
-- way to buy credits was to take the smallest plan and recharge, which is the
-- opposite of what a tier ladder should reward. The new numbers invert it back:
--
--   Starter  R$200  / 3.000 cr total = R$0,067 per credit
--   Growth   R$400  / 6.500 cr total = R$0,062 per credit
--   Scale    R$1.000 / 18.000 cr total = R$0,056 per credit
--   Recharge R$40   / 500 cr         = R$0,080 per credit
--
-- Committing is now cheaper per credit at every tier, and gets cheaper as you
-- climb. Convenience carries the premium, which is where it belongs.

-- ============================================================================
-- 1. THE CATALOG LEARNS ABOUT POOLS
-- ============================================================================

alter table public.billing_products
  add column if not exists credits_whatsapp integer not null default 0,
  add column if not exists credits_copilot  integer not null default 0;

comment on column public.billing_products.credits_whatsapp is
  'Attendance-agent credits granted per period. Read this, never the amount paid.';
comment on column public.billing_products.credits_copilot is
  'Copilot credits granted per period.';
comment on column public.billing_products.credits_included is
  'DEPRECATED for plans (see credits_whatsapp/credits_copilot). Still authoritative for credit_pack, whose pool is chosen at purchase.';

-- ============================================================================
-- 2. PLANS
--
-- Sprint 8 seeded plan_1/2/3 from the legacy `planos` table. Those are retired
-- rather than edited: an existing contract_item points at a product row, and
-- rewriting its price would silently reprice a signed contract. Deactivating
-- keeps history intact while removing them from anything new.
-- ============================================================================

update public.billing_products
   set active = false
 where code in ('plan_1', 'plan_2', 'plan_3');

insert into public.billing_products
  (code, name, kind, list_price, period, credits_whatsapp, credits_copilot, credits_included, metadata)
values
  ('plan_starter', 'Starter', 'plan',  200.00, 'monthly',  2500,  500,  3000,
   jsonb_build_object('seat_limit', 3,  'agent_limit', 1, 'included_instances', 0,
                      'builder_hours', 1, 'builder_recurrence', 'one_time')),
  ('plan_growth',  'Growth',  'plan',  400.00, 'monthly',  5500, 1000,  6500,
   jsonb_build_object('seat_limit', 5,  'agent_limit', 1, 'included_instances', 0,
                      'builder_hours', 2, 'builder_recurrence', 'one_time')),
  ('plan_scale',   'Scale',   'plan', 1000.00, 'monthly', 15000, 3000, 18000,
   jsonb_build_object('seat_limit', 10, 'agent_limit', 1, 'included_instances', 0,
                      'builder_hours', 1, 'builder_recurrence', 'monthly'))
on conflict (code) do update set
  name             = excluded.name,
  list_price       = excluded.list_price,
  credits_whatsapp = excluded.credits_whatsapp,
  credits_copilot  = excluded.credits_copilot,
  credits_included = excluded.credits_included,
  metadata         = excluded.metadata,
  active           = true,
  updated_at       = now();

-- ============================================================================
-- 3. ADD-ONS
-- ============================================================================

-- Connectivity only — conversation credits come from the plan's WhatsApp pool.
-- Billed as a monthly contract_item on the contract's own invoice, not on a
-- separate day-01 cycle: two charges a month for one customer means two due
-- dates, two PIX codes and twice the chance of one going unpaid.
update public.billing_products
   set list_price = 90.00,
       name       = 'Instância WhatsApp conectada',
       metadata   = jsonb_build_object('includes_credits', false),
       updated_at = now()
 where code = 'instance_whatsapp';

insert into public.billing_products (code, name, kind, list_price, period, metadata)
values ('builder_hour', 'Builder Mode (hora extra)', 'addon', 300.00, 'one_time',
        jsonb_build_object('unit', 'hour',
                           'note', 'Horas além do retainer do plano. Cobrado como fatura avulsa.'))
on conflict (code) do update set
  name = excluded.name, list_price = excluded.list_price,
  metadata = excluded.metadata, active = true, updated_at = now();

-- ============================================================================
-- 4. RECHARGE PACKS
--
-- One set of packs at R$0,08/credit. The POOL is chosen at purchase rather than
-- baked into the product: duplicating every pack per pool would double the cards
-- on the recharge screen to say the same thing twice.
-- ============================================================================

update public.billing_products
   set metadata = jsonb_build_object('pool_chosen_at_purchase', true), updated_at = now()
 where kind = 'credit_pack';

insert into public.billing_products (code, name, kind, list_price, period, credits_included, metadata)
values ('credits_15000', '15.000 créditos', 'credit_pack', 1200.00, 'one_time', 15000,
        jsonb_build_object('pool_chosen_at_purchase', true))
on conflict (code) do nothing;

-- ============================================================================
-- 5. ENTITLEMENTS READ THE NEW SHAPE
-- ============================================================================

-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot reorder or rename
-- columns, and this adds agent_limit / builder_hours / the two credit pools.
drop view if exists public.v_tenant_entitlements cascade;
create view public.v_tenant_entitlements as
select
  e.id as equipe_id,
  c.id as contract_id,
  coalesce(c.status, 'none') as contract_status,
  (c.status = 'suspended') as is_read_only,
  (c.status in ('active', 'past_due')) as is_live,
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
 and c.status in ('active', 'past_due', 'suspended');

-- ============================================================================
-- 6. ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_c uuid; v_p uuid; v_ent record;
  v_plan_rate numeric; v_pack_rate numeric;
begin
  -- (a) THE INVERSION IS GONE: every plan must beat the recharge rate, and the
  -- ladder must get cheaper as it climbs.
  select list_price / nullif(credits_included, 0) into v_pack_rate
    from public.billing_products where code = 'credits_500';

  for v_plan_rate in
    select list_price / nullif(credits_included, 0)
      from public.billing_products where kind = 'plan' and active
  loop
    assert v_plan_rate < v_pack_rate,
      format('ASSERT FAILED: a plan costs %s per credit, recharge costs %s — inversion still present',
             round(v_plan_rate, 4), round(v_pack_rate, 4));
  end loop;

  assert (select list_price/credits_included from public.billing_products where code='plan_scale')
       < (select list_price/credits_included from public.billing_products where code='plan_growth'),
    'ASSERT FAILED: Scale is not cheaper per credit than Growth';
  assert (select list_price/credits_included from public.billing_products where code='plan_growth')
       < (select list_price/credits_included from public.billing_products where code='plan_starter'),
    'ASSERT FAILED: Growth is not cheaper per credit than Starter';

  -- (b) legacy plans are retired, not repriced — a signed contract keeps its price
  assert (select count(*) from public.billing_products where code in ('plan_1','plan_2','plan_3') and active) = 0,
    'ASSERT FAILED: legacy plans still active';
  assert (select list_price from public.billing_products where code = 'plan_2') = 400.00,
    'ASSERT FAILED: a legacy plan was repriced instead of retired';

  -- (c) entitlements expose both pools and the plan limits
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t81_plan__','x','x') returning id into v_e;
  insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
  values (v_e, 'active', now(), now() + interval '1 month') returning id into v_c;
  select id into v_p from public.billing_products where code = 'plan_growth';
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  values (v_c, v_p, 1, 400.00, 'monthly');

  select * into v_ent from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_ent.included_credits_whatsapp = 5500,
    format('ASSERT FAILED: whatsapp credits %s, expected 5500', v_ent.included_credits_whatsapp);
  assert v_ent.included_credits_copilot = 1000,
    format('ASSERT FAILED: copilot credits %s, expected 1000', v_ent.included_credits_copilot);
  assert v_ent.seat_limit = 5, format('ASSERT FAILED: seat_limit %s, expected 5', v_ent.seat_limit);
  assert v_ent.agent_limit = 1, format('ASSERT FAILED: agent_limit %s, expected 1', v_ent.agent_limit);
  assert v_ent.instance_limit = 0,
    format('ASSERT FAILED: instance_limit %s, expected 0 (instances are paid add-ons)', v_ent.instance_limit);
  assert v_ent.builder_hours = 2, format('ASSERT FAILED: builder_hours %s, expected 2', v_ent.builder_hours);

  -- (d) an instance add-on raises the instance allowance
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  select v_c, id, 2, 90.00, 'monthly' from public.billing_products where code = 'instance_whatsapp';
  select * into v_ent from public.v_tenant_entitlements where equipe_id = v_e;
  assert v_ent.instance_limit = 2,
    format('ASSERT FAILED: instance_limit %s after buying 2', v_ent.instance_limit);
  -- ...and adds no credits, because the add-on is connectivity only
  assert v_ent.included_credits_whatsapp = 5500,
    'ASSERT FAILED: the instance add-on granted credits it should not';

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.1 T2 assertions passed';
end $$;
