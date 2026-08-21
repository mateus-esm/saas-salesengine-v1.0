-- 20260821000200_sprint81_builder_scheduling.sql
-- Sprint 8.1 fixes · item 3 — scheduling link for Builder Mode.
--
-- Buying hours is only half the transaction: the customer then has to book them
-- with you. Without a booking step the purchase ends in a dead end and the hours
-- sit unused, which reads as "I paid and nothing happened".
--
-- The URL lives in the product's metadata rather than an env var so it can be
-- changed from the admin panel without a redeploy — the founder does not have
-- the calendar link yet, and the UI must degrade honestly until it exists.

update public.billing_products
   set metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object(
                       'unit', 'hour',
                       'scheduling_url', coalesce(metadata->>'scheduling_url', ''),
                       'note', 'Horas além do retainer do plano. Cobrado como fatura avulsa.'
                     ),
       updated_at = now()
 where code = 'builder_hour';

comment on column public.billing_products.metadata is
  'Per-product settings. Plans carry seat_limit / agent_limit / builder_hours; builder_hour carries scheduling_url (empty until the founder provides the calendar).';

-- Super admins edit the catalog from the admin panel: price changes, activating
-- a product, and setting the scheduling URL. Everyone else still only reads
-- active products (policy from 20260819000100).
drop policy if exists billing_products_admin_write on public.billing_products;
create policy billing_products_admin_write on public.billing_products
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

do $$
declare v_meta jsonb;
begin
  select metadata into v_meta from public.billing_products where code = 'builder_hour';
  assert v_meta ? 'scheduling_url', 'ASSERT FAILED: builder_hour has no scheduling_url key';
  assert (select list_price from public.billing_products where code = 'builder_hour') = 300.00,
    'ASSERT FAILED: builder hour is not R$300';
  raise notice 'Sprint 8.1 builder scheduling assertions passed';
end $$;
