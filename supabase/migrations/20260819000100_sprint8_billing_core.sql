-- 20260819000100_sprint8_billing_core.sql
-- Sprint 8 · T1 — Billing core schema.
--
-- WHY: there is no invoice, no contract, and the payer is whoever happened to
-- sign up (asaas-subscribe reads profiles.cpf). Nothing here existed before, so
-- every money flow in Sprint 8 has had nowhere to write.
--
-- ARCHITECTURE (founder decision 9, 2026-08-19): the local ledger is the truth
-- and Asaas is only the payment rail. We own contracts, invoices and entitlements;
-- Asaas collects money and reports it. An Asaas subscription cannot express
-- "setup + 3 modules + 2 instances at a negotiated price with 20% off", which is
-- exactly what the proposals sell — so the gateway can never be the source of truth.
--
-- Money is numeric(12,2). Credits are integer. Never float.

-- ============================================================================
-- 1. CATALOG — list prices. What we sell, before any negotiation.
-- ============================================================================

create table if not exists public.billing_products (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  name             text not null,
  kind             text not null check (kind in ('plan','addon','credit_pack','setup','instance')),
  list_price       numeric(12,2) not null check (list_price >= 0),
  period           text not null check (period in ('monthly','one_time')),
  credits_included integer not null default 0 check (credits_included >= 0),
  metadata         jsonb not null default '{}'::jsonb,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.billing_products is
  'Sprint 8 · catalog of sellable items. list_price is the anchor; the price actually charged lives on contract_items.unit_price.';
comment on column public.billing_products.credits_included is
  'Credits granted per period (plans) or per purchase (credit_pack). Read this — never derive credits from the amount paid.';

-- Seed plans from the legacy `planos` table. `planos` stays readable this sprint
-- (equipes.plano_id still references it); it is retired in 8.1.
insert into public.billing_products (code, name, kind, list_price, period, credits_included, metadata)
select
  'plan_' || p.id,
  p.nome,
  'plan',
  p.preco_mensal,
  'monthly',
  p.limite_creditos,
  jsonb_build_object('legacy_plano_id', p.id, 'seat_limit', p.limite_usuarios)
from public.planos p
on conflict (code) do nothing;

-- WhatsApp instance: price moves out of the SOLO_INSTANCE_MONTHLY_PRICE env var
-- and into the catalog (audit item 8). Changing the price no longer needs a redeploy.
insert into public.billing_products (code, name, kind, list_price, period, credits_included)
values ('instance_whatsapp', 'Instância WhatsApp', 'instance', 100.00, 'monthly', 0)
on conflict (code) do nothing;

-- Credit packs at today's effective rate: Billing.tsx charges (credits/500)*40,
-- i.e. R$0,08 per credit. Seeded at the SAME rate so this migration changes no price.
insert into public.billing_products (code, name, kind, list_price, period, credits_included)
values
  ('credits_500',   '500 créditos',    'credit_pack',  40.00, 'one_time',   500),
  ('credits_1000',  '1.000 créditos',  'credit_pack',  80.00, 'one_time',  1000),
  ('credits_2500',  '2.500 créditos',  'credit_pack', 200.00, 'one_time',  2500),
  ('credits_5000',  '5.000 créditos',  'credit_pack', 400.00, 'one_time',  5000),
  ('credits_10000', '10.000 créditos', 'credit_pack', 800.00, 'one_time', 10000)
on conflict (code) do nothing;

-- Generic setup fee. Proposals carry their own negotiated setup_price; this is
-- the catalog anchor so a setup line always has a product to point at.
insert into public.billing_products (code, name, kind, list_price, period, credits_included)
values ('setup_implantacao', 'Implantação', 'setup', 0.00, 'one_time', 0)
on conflict (code) do nothing;

-- ============================================================================
-- 2. BILLING ACCOUNT — the payer is the TEAM, not whoever signed up.
-- ============================================================================

create table if not exists public.billing_accounts (
  equipe_id         uuid primary key references public.equipes(id) on delete cascade,
  doc_type          text check (doc_type in ('CPF','CNPJ')),
  doc_number        text,
  legal_name        text,
  billing_email     text,
  phone             text,
  postal_code       text,
  address_street    text,
  address_number    text,
  address_complement text,
  address_district  text,
  address_city      text,
  address_state     text,
  asaas_customer_id text,
  auto_recharge_enabled   boolean not null default false,
  auto_recharge_threshold integer,
  auto_recharge_product_id uuid references public.billing_products(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Digits only, and the right number of them for the declared type. A CPF in a
  -- CNPJ field is rejected by Asaas at charge time, which is the worst moment to find out.
  constraint billing_accounts_doc_shape check (
    doc_type is null
    or (doc_type = 'CPF'  and doc_number ~ '^[0-9]{11}$')
    or (doc_type = 'CNPJ' and doc_number ~ '^[0-9]{14}$')
  )
);

comment on table public.billing_accounts is
  'Sprint 8 · the paying entity, owned by the team. Replaces reading profiles.cpf.';

-- Backfill: one row per team, carrying over the Asaas customer id and the best
-- available document. Prefer an owner profile, then admin, then anyone.
insert into public.billing_accounts (equipe_id, doc_type, doc_number, legal_name, billing_email, phone, asaas_customer_id)
select
  e.id,
  case when p.cpf is not null and regexp_replace(p.cpf, '[^0-9]', '', 'g') ~ '^[0-9]{11}$' then 'CPF' end,
  case when p.cpf is not null and regexp_replace(p.cpf, '[^0-9]', '', 'g') ~ '^[0-9]{11}$'
       then regexp_replace(p.cpf, '[^0-9]', '', 'g') end,
  coalesce(e.nome, p.nome_completo),
  p.email,
  p.telefone,
  nullif(e.asaas_customer_id, '')
from public.equipes e
left join lateral (
  select pr.*
  from public.profiles pr
  where pr.equipe_id = e.id
  order by (pr.cargo = 'owner') desc, (pr.role = 'owner') desc, (pr.role = 'admin') desc, pr.created_at
  limit 1
) p on true
on conflict (equipe_id) do nothing;

comment on column public.equipes.asaas_customer_id is
  'DEPRECATED sprint 8 -> billing_accounts.asaas_customer_id. Kept until T6 stops reading it.';

-- ============================================================================
-- 3. CONTRACTS — what THIS customer actually pays.
-- ============================================================================

create table if not exists public.contracts (
  id                   uuid primary key default gen_random_uuid(),
  equipe_id            uuid not null references public.equipes(id) on delete cascade,
  proposal_id          uuid,
  status               text not null default 'draft'
                       check (status in ('draft','active','past_due','suspended','cancelled')),
  term_months          integer check (term_months is null or term_months > 0),
  started_at           timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  past_due_since       timestamptz,
  cancel_at            timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint contracts_period_order check (
    current_period_start is null or current_period_end is null
    or current_period_end > current_period_start
  )
);

-- One live contract per team. Without this, two accidental provisionings bill the
-- customer twice and nothing complains.
create unique index if not exists uq_contracts_active_per_equipe
  on public.contracts (equipe_id)
  where status in ('active','past_due','suspended');

create index if not exists idx_contracts_equipe on public.contracts (equipe_id);
create index if not exists idx_contracts_status_period
  on public.contracts (status, current_period_end);

create table if not exists public.contract_items (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  product_id  uuid references public.billing_products(id),
  quantity    integer not null default 1 check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  period      text not null check (period in ('monthly','one_time')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_contract_items_contract on public.contract_items (contract_id);

comment on column public.contract_items.unit_price is
  'The NEGOTIATED price and the authoritative one. Never bill from billing_products.list_price when a contract_item exists.';

-- ============================================================================
-- 4. INVOICES
-- ============================================================================

create sequence if not exists public.invoice_number_seq;

create or replace function public.next_invoice_number()
returns text
language sql
volatile
set search_path = public
as $fn$
  select 'FAT-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$fn$;

create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  equipe_id         uuid not null references public.equipes(id) on delete cascade,
  contract_id       uuid references public.contracts(id) on delete set null,
  number            text unique not null default public.next_invoice_number(),
  kind              text not null check (kind in ('setup','recurring','credit_pack','adhoc')),
  status            text not null default 'draft'
                    check (status in ('draft','open','paid','overdue','void','refunded')),
  subtotal          numeric(12,2) not null default 0 check (subtotal >= 0),
  discount          numeric(12,2) not null default 0 check (discount >= 0),
  total             numeric(12,2) not null default 0 check (total >= 0),
  currency          text not null default 'BRL',
  due_date          date,
  issued_at         timestamptz,
  paid_at           timestamptz,
  asaas_payment_id  text unique,
  asaas_invoice_url text,
  pix_payload       text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.invoices.asaas_payment_id is
  'UNIQUE on purpose: the second line of defence against crediting one payment twice, after payment_events.provider_event_id.';

create index if not exists idx_invoices_equipe_created on public.invoices (equipe_id, created_at desc);
create index if not exists idx_invoices_status_due on public.invoices (status, due_date);
create index if not exists idx_invoices_contract on public.invoices (contract_id);

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  product_id  uuid references public.billing_products(id),
  description text not null,
  quantity    integer not null default 1 check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  total       numeric(12,2) not null check (total >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_invoice_items_invoice on public.invoice_items (invoice_id);

-- ============================================================================
-- 5. PAYMENT EVENTS — resolves audit item #1 (no webhook, nothing confirms payment).
-- The webhook writes here FIRST and only then processes. The unique constraint on
-- provider_event_id is what makes an Asaas redelivery a no-op instead of a double credit.
-- ============================================================================

create table if not exists public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null default 'asaas',
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null,
  invoice_id        uuid references public.invoices(id) on delete set null,
  status            text not null default 'pending'
                    check (status in ('pending','processed','failed','ignored')),
  attempts          integer not null default 0,
  last_error        text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (provider, provider_event_id)
);

create index if not exists idx_payment_events_status
  on public.payment_events (status, received_at)
  where status in ('pending','failed');

-- ============================================================================
-- 6. updated_at triggers
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

do $$
declare t text;
begin
  foreach t in array array['billing_products','billing_accounts','contracts','invoices']
  loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_touch before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- 7. RLS
--
-- Reads are tenant-scoped. WRITES HAVE NO POLICY FOR `authenticated` ON PURPOSE:
-- money is only ever written by an edge function using the service role, which
-- bypasses RLS. A tenant that could update invoices.status could mark itself paid.
--
-- On profiles.id vs profiles.user_id: handle_new_user() inserts (new.id, new.id),
-- so both equal auth.uid() and either form works. We standardise on user_id here
-- for explicitness. Existing policies using `id` are NOT broken — do not "fix" them.
-- ============================================================================

alter table public.billing_products  enable row level security;
alter table public.billing_accounts  enable row level security;
alter table public.contracts         enable row level security;
alter table public.contract_items    enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_items     enable row level security;
alter table public.payment_events    enable row level security;

drop policy if exists billing_products_read on public.billing_products;
create policy billing_products_read on public.billing_products
  for select to authenticated using (active = true);

drop policy if exists billing_accounts_tenant_read on public.billing_accounts;
create policy billing_accounts_tenant_read on public.billing_accounts
  for select to authenticated using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists contracts_tenant_read on public.contracts;
create policy contracts_tenant_read on public.contracts
  for select to authenticated using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists contract_items_tenant_read on public.contract_items;
create policy contract_items_tenant_read on public.contract_items
  for select to authenticated using (
    contract_id in (
      select c.id from public.contracts c
      where c.equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
    )
  );

drop policy if exists invoices_tenant_read on public.invoices;
create policy invoices_tenant_read on public.invoices
  for select to authenticated using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists invoice_items_tenant_read on public.invoice_items;
create policy invoice_items_tenant_read on public.invoice_items
  for select to authenticated using (
    invoice_id in (
      select i.id from public.invoices i
      where i.equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
    )
  );

-- payment_events: no policy at all. Invisible to tenants; service role only.

-- ============================================================================
-- 8. ASSERTIONS — these run at migration time and fail the migration if the
-- guarantees above are not real. Each one covers a way this schema could
-- silently cost or leak money.
-- ============================================================================

do $$
declare
  v_equipe   uuid;
  v_contract uuid;
  v_invoice  uuid;
  v_n1       text;
  v_n2       text;
  v_ok       boolean;
begin
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t1_assert__', 'x', 'x') returning id into v_equipe;

  -- (a) only one live contract per team
  insert into public.contracts (equipe_id, status) values (v_equipe, 'active')
    returning id into v_contract;
  begin
    insert into public.contracts (equipe_id, status) values (v_equipe, 'past_due');
    raise exception 'ASSERT FAILED: a second live contract was allowed for one team';
  exception when unique_violation then null;
  end;

  -- ...but a cancelled one may coexist, otherwise renewals could never be recorded
  insert into public.contracts (equipe_id, status) values (v_equipe, 'cancelled');

  -- (b) invoice numbers are unique and sequential
  insert into public.invoices (equipe_id, contract_id, kind, status, total)
    values (v_equipe, v_contract, 'recurring', 'open', 150.00)
    returning id, number into v_invoice, v_n1;
  insert into public.invoices (equipe_id, kind, status, total)
    values (v_equipe, 'credit_pack', 'open', 40.00) returning number into v_n2;
  assert v_n1 <> v_n2, 'ASSERT FAILED: invoice numbers collided';
  assert v_n1 like 'FAT-%', 'ASSERT FAILED: unexpected invoice number format';

  -- (c) one Asaas payment cannot be attached to two invoices
  update public.invoices set asaas_payment_id = 'pay_assert_1' where id = v_invoice;
  begin
    insert into public.invoices (equipe_id, kind, status, total, asaas_payment_id)
      values (v_equipe, 'adhoc', 'open', 1.00, 'pay_assert_1');
    raise exception 'ASSERT FAILED: the same asaas_payment_id was accepted twice';
  exception when unique_violation then null;
  end;

  -- (d) a webhook redelivery is rejected at the database, not in application code
  insert into public.payment_events (provider_event_id, event_type, payload)
    values ('evt_assert_1', 'PAYMENT_CONFIRMED', '{}'::jsonb);
  begin
    insert into public.payment_events (provider_event_id, event_type, payload)
      values ('evt_assert_1', 'PAYMENT_CONFIRMED', '{}'::jsonb);
    raise exception 'ASSERT FAILED: a duplicate provider_event_id was accepted';
  exception when unique_violation then null;
  end;

  -- (e) document shape is enforced per type
  begin
    insert into public.billing_accounts (equipe_id, doc_type, doc_number)
      values (v_equipe, 'CNPJ', '12345678901')  -- 11 digits declared as CNPJ
      on conflict (equipe_id) do update set doc_type = 'CNPJ', doc_number = '12345678901';
    raise exception 'ASSERT FAILED: an 11-digit CNPJ was accepted';
  exception when check_violation then null;
  end;

  -- (f) negative money is impossible
  begin
    insert into public.invoices (equipe_id, kind, status, total)
      values (v_equipe, 'adhoc', 'open', -1.00);
    raise exception 'ASSERT FAILED: a negative invoice total was accepted';
  exception when check_violation then null;
  end;

  -- (g) the catalog seeded and credit packs know their own credit amount
  select credits_included = 1000 into v_ok
    from public.billing_products where code = 'credits_1000';
  assert v_ok, 'ASSERT FAILED: credit pack seed missing or wrong';

  -- Cleanup. Deleting the team cascades to contracts, invoices and their items,
  -- but payment_events.invoice_id is ON DELETE SET NULL, so that row would survive
  -- and collide with the next run of this migration. Remove it explicitly.
  delete from public.payment_events where provider_event_id = 'evt_assert_1';
  delete from public.equipes where id = v_equipe;
  raise notice 'T1 assertions passed';
end $$;
