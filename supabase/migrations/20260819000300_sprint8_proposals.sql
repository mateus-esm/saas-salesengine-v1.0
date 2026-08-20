-- 20260819000300_sprint8_proposals.sql
-- Sprint 8 · T3 — proposals in the shared database.
--
-- WHY (audit item 12): the commercial pipeline lives in localStorage inside
-- manager.html, so it exists in exactly one browser profile and dies with the
-- cache. And index.html builds the proposal from query string parameters
-- (cliente, setup, mensalidade, valor_real...), which means the client can edit
-- their own price in the URL before "accepting" it, and nothing records that an
-- acceptance ever happened.

-- ============================================================================
-- 1. PROPOSALS
-- ============================================================================

-- Public token. NOT sequential: a guessable code lets anyone enumerate other
-- clients' proposals and read their negotiated pricing.
create or replace function public.gen_proposal_code()
returns text
language sql volatile
set search_path = public
as $fn$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$fn$;

create table if not exists public.proposals (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text unique not null default public.gen_proposal_code(),
  cliente_nome       text not null,
  cliente_email      text,
  cliente_whatsapp   text,
  cliente_doc        text,
  setup_price        numeric(12,2) not null default 0 check (setup_price >= 0),
  monthly_price      numeric(12,2) not null default 0 check (monthly_price >= 0),
  -- The "valor_real" of today's template: the pre-discount anchor, shown as
  -- "de R$X por R$Y". Null when there is no discount to display.
  list_monthly_price numeric(12,2) check (list_monthly_price is null or list_monthly_price >= 0),
  term_months        integer check (term_months is null or term_months > 0),
  valid_until        date,
  status             text not null default 'rascunho'
                     check (status in ('rascunho','enviada','vista','aceita','recusada','expirada')),
  equipe_id          uuid references public.equipes(id) on delete set null,
  created_by         uuid,
  sent_at            timestamptz,
  first_viewed_at    timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.proposals is
  'Sprint 8 · replaces manager.html localStorage. equipe_id is filled at provisioning.';
comment on column public.proposals.codigo is
  'Public token for /proposta/:codigo. Random, never sequential — a guessable code exposes other clients pricing.';

create index if not exists idx_proposals_status on public.proposals (status, created_at desc);
create index if not exists idx_proposals_equipe on public.proposals (equipe_id);

-- Line items replace the fixed item_agente / item_crm / item_lp flags, so any
-- combination can be sold without a code change.
create table if not exists public.proposal_items (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  product_id  uuid references public.billing_products(id),
  label       text not null,
  description text,
  quantity    integer not null default 1 check (quantity > 0),
  unit_price  numeric(12,2) not null default 0 check (unit_price >= 0),
  period      text not null default 'monthly' check (period in ('monthly','one_time')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_proposal_items_proposal on public.proposal_items (proposal_id, sort_order);

-- ============================================================================
-- 2. ACCEPTANCE — the audit trail
-- ============================================================================

create table if not exists public.proposal_acceptances (
  id             uuid primary key default gen_random_uuid(),
  proposal_id    uuid not null unique references public.proposals(id) on delete cascade,
  accepted_at    timestamptz not null default now(),
  ip             inet,
  user_agent     text,
  accepted_name  text,
  accepted_doc   text,
  terms_snapshot jsonb not null,
  created_at     timestamptz not null default now()
);

comment on column public.proposal_acceptances.terms_snapshot is
  'Frozen copy of exactly what was displayed at acceptance, built server-side. The only defence against "I never agreed to that price" after a later edit.';
comment on table public.proposal_acceptances is
  'One acceptance per proposal (unique proposal_id).';

-- Link the contract back to the proposal it came from (contracts.proposal_id was
-- created in T1 without the FK, because proposals did not exist yet).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contracts_proposal_id_fkey'
  ) then
    alter table public.contracts
      add constraint contracts_proposal_id_fkey
      foreign key (proposal_id) references public.proposals(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- 3. updated_at
-- ============================================================================

drop trigger if exists trg_proposals_touch on public.proposals;
create trigger trg_proposals_touch before update on public.proposals
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. RLS
--
-- Proposals are commercial data about prospects who are not tenants yet, so
-- there is no tenant to scope them to: super admins only.
--
-- The PUBLIC page does not read these tables directly. It goes through the
-- `public-proposal` edge function (T17) using the service role, which returns
-- only display fields. Exposing this table to `anon` would publish every
-- client's negotiated price.
-- ============================================================================

alter table public.proposals            enable row level security;
alter table public.proposal_items       enable row level security;
alter table public.proposal_acceptances enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'super_admin'
  );
$fn$;

drop policy if exists proposals_super_admin on public.proposals;
create policy proposals_super_admin on public.proposals
  for select to authenticated using (public.is_super_admin());

drop policy if exists proposal_items_super_admin on public.proposal_items;
create policy proposal_items_super_admin on public.proposal_items
  for select to authenticated using (public.is_super_admin());

drop policy if exists proposal_acceptances_super_admin on public.proposal_acceptances;
create policy proposal_acceptances_super_admin on public.proposal_acceptances
  for select to authenticated using (public.is_super_admin());

-- ============================================================================
-- 5. ASSERTIONS
-- ============================================================================

do $$
declare
  v_p1   uuid;
  v_p2   uuid;
  v_c1   text;
  v_c2   text;
begin
  insert into public.proposals (cliente_nome, setup_price, monthly_price, list_monthly_price)
  values ('__t3_assert_a__', 2000.00, 400.00, 500.00) returning id, codigo into v_p1, v_c1;
  insert into public.proposals (cliente_nome, monthly_price)
  values ('__t3_assert_b__', 150.00) returning id, codigo into v_p2, v_c2;

  -- (a) codes are unique and not sequential
  assert v_c1 <> v_c2, 'ASSERT FAILED: proposal codes collided';
  assert length(v_c1) = 12, format('ASSERT FAILED: code length %s, expected 12', length(v_c1));

  -- (b) acceptance is once per proposal — a second click cannot re-accept at a
  -- different price
  insert into public.proposal_acceptances (proposal_id, terms_snapshot, accepted_name)
  values (v_p1, '{"monthly":400.00}'::jsonb, 'Fulano');
  begin
    insert into public.proposal_acceptances (proposal_id, terms_snapshot, accepted_name)
    values (v_p1, '{"monthly":1.00}'::jsonb, 'Fulano');
    raise exception 'ASSERT FAILED: a proposal was accepted twice';
  exception when unique_violation then null;
  end;

  -- (c) status is constrained to the real pipeline
  begin
    update public.proposals set status = 'qualquer_coisa' where id = v_p2;
    raise exception 'ASSERT FAILED: an invalid proposal status was accepted';
  exception when check_violation then null;
  end;

  -- (d) a contract can point at its proposal
  perform 1 from pg_constraint where conname = 'contracts_proposal_id_fkey';
  assert found, 'ASSERT FAILED: contracts.proposal_id foreign key missing';

  -- (e) negative pricing is impossible
  begin
    insert into public.proposals (cliente_nome, monthly_price) values ('__neg__', -1);
    raise exception 'ASSERT FAILED: a negative monthly price was accepted';
  exception when check_violation then null;
  end;

  delete from public.proposals where id in (v_p1, v_p2);
  raise notice 'T3 assertions passed';
end $$;
