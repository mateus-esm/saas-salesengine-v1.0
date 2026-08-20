-- 20260819000600_sprint8_entitlements.sql
-- Sprint 8 · T12 — entitlements derived from the contract, and explicit tenant
-- scoping on the webhook_configs policies.
--
-- PART A — what a tenant may use should follow what they bought, not a JSONB
-- somebody remembers to toggle.
--
-- PART B — a correction to the sprint's own audit. Item 5 claimed the policies
-- added by 20260617000000_add_team_page_permissions.sql leak across tenants.
-- Tested against a live database: they do NOT. The policies are written without
-- tenant scoping —
--     equipe_id in (select id from equipes where page_permissions->>'webhooks')
-- — but `equipes` has its own RLS with tenant-scoped SELECT policies, so that
-- subquery only ever returns the caller's own team. The scoping is real but
-- ACCIDENTAL: it depends entirely on equipes' RLS staying narrow. The day anyone
-- adds a broad "authenticated may read all teams" policy (for a picker, an admin
-- screen, a report) these silently become cross-tenant.
--
-- So this is hardening, not an incident. The fix makes the scoping explicit so it
-- cannot be undone at a distance.

-- ============================================================================
-- PART A · ENTITLEMENTS
-- ============================================================================

create or replace view public.v_tenant_entitlements as
select
  e.id as equipe_id,
  c.id as contract_id,
  coalesce(c.status, 'none') as contract_status,
  -- Read-only is the dunning end state: data visible, AI and outbound stopped.
  (c.status = 'suspended') as is_read_only,
  (c.status in ('active', 'past_due')) as is_live,
  coalesce(
    (select array_agg(distinct bp.code)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id),
    '{}'::text[]
  ) as modules,
  coalesce(
    (select max((bp.metadata->>'seat_limit')::int)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id and bp.kind = 'plan'),
    null
  ) as seat_limit,
  coalesce(
    (select sum(bp.credits_included * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id),
    0
  )::int as included_credits,
  coalesce(
    (select sum(ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id and bp.kind = 'instance'),
    0
  )::int as instance_limit,
  c.current_period_end,
  e.page_permissions
from public.equipes e
left join public.contracts c
  on c.equipe_id = e.id
 and c.status in ('active', 'past_due', 'suspended');

comment on view public.v_tenant_entitlements is
  'Sprint 8 T12 · what a tenant may use, derived from contract_items. page_permissions is now only a super-admin override.';

comment on column public.equipes.page_permissions is
  'Sprint 8: OVERRIDE ONLY. Normal access derives from v_tenant_entitlements (what the tenant bought). Kept so a super admin can force a module on or off.';

-- Effective access = bought it OR an override says yes. Security definer so the
-- view's joins are not re-filtered by the caller's RLS on every table it touches.
create or replace function public.has_module_access(p_equipe_id uuid, p_module text)
returns boolean
language sql stable
security definer
set search_path = public
as $fn$
  select coalesce(
    -- explicit override wins, in both directions
    (select (e.page_permissions->>p_module)::boolean
       from public.equipes e where e.id = p_equipe_id),
    -- otherwise: did they buy something that grants it?
    (select exists (
       select 1 from public.v_tenant_entitlements te
        where te.equipe_id = p_equipe_id and p_module = any(te.modules)
     )),
    true
  );
$fn$;

-- ============================================================================
-- PART B · EXPLICIT TENANT SCOPING ON webhook_configs
-- ============================================================================

drop policy if exists "Enable read for webhook_configs based on team permission"  on public.webhook_configs;
drop policy if exists "Enable write for webhook_configs based on team permission" on public.webhook_configs;
-- The original policy is correctly scoped; replaced here only so ONE policy per
-- operation governs the table and the permission check is not duplicated.
drop policy if exists "Team members can manage webhooks" on public.webhook_configs;

-- One policy, both conditions stated outright: your team AND the module enabled.
create policy webhook_configs_tenant on public.webhook_configs
  for all to authenticated
  using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
    and coalesce((select (e.page_permissions->>'webhooks')::boolean
                    from public.equipes e where e.id = webhook_configs.equipe_id), true)
  )
  with check (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
    and coalesce((select (e.page_permissions->>'webhooks')::boolean
                    from public.equipes e where e.id = webhook_configs.equipe_id), true)
  );

-- ============================================================================
-- ASSERTIONS
-- ============================================================================

do $$
declare
  v_ea uuid; v_eb uuid; v_ua uuid := 'aaaa9999-1111-1111-1111-111111111111';
  v_contract uuid; v_prod uuid; v_cnt integer; v_ent record;
begin
  -- two tenants, one user in A
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          '__t12_a@test.com','x',now(),now(),now());

  insert into public.equipes (nome, crm_link, suporte_link) values ('__t12_A__','x','x') returning id into v_ea;
  insert into public.equipes (nome, crm_link, suporte_link) values ('__t12_B__','x','x') returning id into v_eb;
  update public.profiles set equipe_id = v_ea where user_id = v_ua;

  insert into public.webhook_configs (equipe_id, name, url, trigger_event, active)
  values (v_ea,'A own','https://a.example','lead_created',true),
         (v_eb,'B SECRET','https://b.example','lead_created',true);

  -- (a) explicit scoping holds: A sees only its own
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ua, 'role','authenticated')::text, true);

  select count(*) into v_cnt from public.webhook_configs;
  assert v_cnt = 1, format('ASSERT FAILED: tenant A sees %s webhook_configs, expected 1', v_cnt);

  select count(*) into v_cnt from public.webhook_configs where name = 'B SECRET';
  assert v_cnt = 0, 'ASSERT FAILED: cross-tenant read of another team webhook';

  reset role;
  perform set_config('request.jwt.claims', null, true);

  -- (b) entitlements derive from what was bought
  select id into v_prod from public.billing_products where code = 'plan_2';  -- Solo Scale
  insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
  values (v_ea, 'active', now(), now() + interval '1 month') returning id into v_contract;
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  values (v_contract, v_prod, 1, 400.00, 'monthly');

  select * into v_ent from public.v_tenant_entitlements where equipe_id = v_ea;
  assert v_ent.contract_status = 'active', 'ASSERT FAILED: entitlements did not see the active contract';
  assert v_ent.is_read_only = false, 'ASSERT FAILED: an active contract reported read-only';
  assert 'plan_2' = any(v_ent.modules), 'ASSERT FAILED: purchased module missing from entitlements';
  assert v_ent.included_credits = 3000,
    format('ASSERT FAILED: included_credits %s, expected 3000', v_ent.included_credits);
  assert v_ent.seat_limit = 5, format('ASSERT FAILED: seat_limit %s, expected 5', v_ent.seat_limit);

  -- (c) suspension flips read-only — the dunning end state
  update public.contracts set status = 'suspended' where id = v_contract;
  select * into v_ent from public.v_tenant_entitlements where equipe_id = v_ea;
  assert v_ent.is_read_only = true, 'ASSERT FAILED: a suspended contract is not read-only';
  assert v_ent.is_live = false, 'ASSERT FAILED: a suspended contract still reports live';

  -- (d) a super-admin override still wins, in both directions
  update public.equipes set page_permissions = page_permissions || '{"webhooks": false}'::jsonb where id = v_ea;
  assert public.has_module_access(v_ea, 'webhooks') = false,
    'ASSERT FAILED: override could not switch a module off';
  update public.equipes set page_permissions = page_permissions || '{"webhooks": true}'::jsonb where id = v_ea;
  assert public.has_module_access(v_ea, 'webhooks') = true,
    'ASSERT FAILED: override could not switch a module on';

  delete from public.equipes where id in (v_ea, v_eb);
  delete from auth.users where id = v_ua;
  raise notice 'T12 assertions passed';
end $$;
