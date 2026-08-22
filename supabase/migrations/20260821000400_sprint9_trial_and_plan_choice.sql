-- 20260821000400_sprint9_trial_and_plan_choice.sql
-- Sprint 9 · trial, day-1 billing, and letting the client pick their own plan.
--
-- THE COMMERCIAL MODEL THIS ENCODES (founder decisions, 2026-08-21):
--
-- 1. The trial starts at GO-LIVE, not at signature. Fifteen days of an empty CRM
--    and an untrained agent is a trial of a shell — the client would judge the
--    product by what it looks like half-built. The trial has to be of the real,
--    implemented thing, because that is where the value is.
--
-- 2. Setup is never free by accident. It can be waived deliberately per proposal
--    (the Family & Friends path) and its payment can be taken up front or at
--    go-live, but the default is paid, because it is real human work: discovery,
--    agent training and dataset, channel strategy, pipeline design, and the n8n
--    workflow without which Meta Ads never reaches the CRM.
--
-- 3. What de-risks the setup is OWNERSHIP, not a refund. If the client leaves
--    they keep the n8n workflow, the agent dataset and the pipeline structure.
--    That costs nothing extra — it was built anyway — and answers "what if I get
--    stuck with you" far better than money back.
--
-- 4. Billing lands on day 1 for everyone. The partial first month is charged
--    prorated at trial end rather than given away: up to 30 free days on a
--    R$1.000 plan is real money.

-- ============================================================================
-- 1. TRIAL ON THE CONTRACT
-- ============================================================================

alter table public.contracts
  add column if not exists trial_ends_at timestamptz,
  add column if not exists went_live_at  timestamptz;

comment on column public.contracts.trial_ends_at is
  'Sprint 9 · end of the free period. Starts at go-live, never at signature.';
comment on column public.contracts.went_live_at is
  'When the implementation was delivered and the client got a working product.';

-- `trialing` is a live state: the tenant has full access and is not in arrears.
alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts add constraint contracts_status_check
  check (status in ('draft','trialing','active','past_due','suspended','cancelled'));

-- ============================================================================
-- 2. THE PROPOSAL BECOMES A LANDING PAGE
-- ============================================================================

alter table public.proposals
  add column if not exists allow_plan_choice boolean not null default true,
  add column if not exists recommended_plan_code text,
  add column if not exists setup_waived boolean not null default false,
  add column if not exists setup_charge_timing text not null default 'on_accept',
  add column if not exists trial_days integer not null default 15,
  add column if not exists chosen_plan_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proposals_setup_timing_check') then
    alter table public.proposals add constraint proposals_setup_timing_check
      check (setup_charge_timing in ('on_accept', 'on_golive'));
  end if;
end $$;

comment on column public.proposals.allow_plan_choice is
  'Sprint 9 · true = the client compares the three tiers and picks. false = a single pre-agreed plan.';
comment on column public.proposals.recommended_plan_code is
  'Highlighted as "recomendado" on the page. A recommendation, not a restriction — the client still chooses.';
comment on column public.proposals.setup_charge_timing is
  'on_accept = paid before implementation starts (protects the work). on_golive = paid on delivery (easier yes, you carry the labour first).';
comment on column public.proposals.chosen_plan_code is
  'Which tier the client actually selected at acceptance. This is what provisioning turns into the contract.';

-- ============================================================================
-- 3. WHAT THE SETUP INCLUDES — and what the client keeps if they leave
--
-- Kept in the database rather than hardcoded in the page so the founder can
-- adjust the offer without a deploy, and so the same wording appears on the
-- proposal, in the contract and in any future receipt.
-- ============================================================================

create table if not exists public.setup_deliverables (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  title       text not null,
  description text,
  -- The heart of the de-risking: does the client keep this if they cancel?
  client_keeps boolean not null default false,
  sort_order  integer not null default 0,
  active      boolean not null default true
);

insert into public.setup_deliverables (code, title, description, client_keeps, sort_order) values
  ('discovery', 'Discovery do seu processo comercial',
   'Entendemos como sua operação vende hoje: canais que já usa, volume, quem atende, o que trava. Nada é configurado no chute.',
   false, 1),

  ('agent_training', 'Treinamento e dataset do Agente de Atendimento',
   'Construímos a base de conhecimento do seu agente: o que ele sabe, como qualifica, quando transfere para humano e o que nunca deve responder.',
   true, 2),

  ('channels', 'Conexão dos canais de atendimento',
   'Conectamos WhatsApp e demais canais. Se você ainda não tem um número dedicado, orientamos a aquisição.',
   false, 3),

  ('pipeline', 'Arquitetura do CRM: etapas, campos e webhooks',
   'Definimos as etapas do seu funil, os campos personalizados que fazem sentido para o seu negócio e os webhooks de entrada de leads.',
   true, 4),

  ('ads_integration', 'Integração Meta Ads ↔ Sales Engine (workflow n8n)',
   'Montamos o workflow que leva o lead do anúncio direto para o CRM. É a peça que a maioria não consegue montar sozinha — e sem ela o lead não chega.',
   true, 5),

  ('golive', 'Go-live acompanhado',
   'Colocamos no ar com você, testamos ponta a ponta e treinamos seu time no CRM.',
   false, 6)
on conflict (code) do update set
  title = excluded.title, description = excluded.description,
  client_keeps = excluded.client_keeps, sort_order = excluded.sort_order, active = true;

alter table public.setup_deliverables enable row level security;
drop policy if exists setup_deliverables_read on public.setup_deliverables;
create policy setup_deliverables_read on public.setup_deliverables
  for select to authenticated using (active);
drop policy if exists setup_deliverables_admin on public.setup_deliverables;
create policy setup_deliverables_admin on public.setup_deliverables
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- ============================================================================
-- 4. DAY-1 BILLING WITH PRORATION
-- ============================================================================

/**
 * What a partial month costs, from `p_from` to the end of that month.
 * Charged once at trial end so every later invoice can land on the 1st.
 */
create or replace function public.prorated_amount(
  p_monthly numeric, p_from timestamptz
) returns numeric
language sql immutable
as $fn$
  select round(
    p_monthly
    * (extract(day from (date_trunc('month', p_from) + interval '1 month' - interval '1 day'))
       - extract(day from p_from) + 1)
    / extract(day from (date_trunc('month', p_from) + interval '1 month' - interval '1 day'))
  , 2);
$fn$;

comment on function public.prorated_amount(numeric, timestamptz) is
  'Sprint 9 · cost of the remaining days of the month, inclusive of the start day. Used once at trial end so all later invoices fall on day 1.';

/** Contracts whose trial has run out and that need their first real invoice. */
create or replace function public.contracts_ending_trial()
returns table (contract_id uuid, equipe_id uuid, monthly numeric, trial_ends_at timestamptz)
language sql stable
set search_path = public
as $fn$
  select c.id, c.equipe_id,
         coalesce((select sum(ci.unit_price * ci.quantity)
                     from public.contract_items ci
                    where ci.contract_id = c.id and ci.period = 'monthly'), 0),
         c.trial_ends_at
  from public.contracts c
  where c.status = 'trialing'
    and c.trial_ends_at is not null
    and c.trial_ends_at <= now();
$fn$;

-- ============================================================================
-- 5. ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_c uuid; v_p uuid; v_amount numeric; v_cnt integer;
begin
  -- (a) proration: a full month from the 1st costs the full price
  v_amount := public.prorated_amount(400.00, '2026-09-01 10:00:00+00'::timestamptz);
  assert v_amount = 400.00, format('ASSERT FAILED: full month prorated to %s', v_amount);

  -- ...and half a 30-day month costs about half
  v_amount := public.prorated_amount(400.00, '2026-09-16 10:00:00+00'::timestamptz);
  assert v_amount between 190.00 and 210.00,
    format('ASSERT FAILED: mid-month proration %s is not roughly half', v_amount);

  -- ...and the last day of the month costs one day, not zero
  v_amount := public.prorated_amount(300.00, '2026-09-30 10:00:00+00'::timestamptz);
  assert v_amount > 0 and v_amount < 20,
    format('ASSERT FAILED: last-day proration %s', v_amount);

  -- (b) trialing is a valid contract state
  insert into public.equipes (nome, crm_link, suporte_link) values ('__t9__','x','x') returning id into v_e;
  insert into public.contracts (equipe_id, status, trial_ends_at, went_live_at,
                                current_period_start, current_period_end)
  values (v_e, 'trialing', now() - interval '1 hour', now() - interval '15 days',
          now() - interval '15 days', now() + interval '15 days')
  returning id into v_c;

  select id into v_p from public.billing_products where code = 'plan_growth';
  insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
  values (v_c, v_p, 1, 400.00, 'monthly');

  -- (c) an expired trial is picked up for its first invoice
  select count(*) into v_cnt from public.contracts_ending_trial() where contract_id = v_c;
  assert v_cnt = 1, 'ASSERT FAILED: an expired trial was not queued for billing';

  -- ...and one still running is left alone
  update public.contracts set trial_ends_at = now() + interval '5 days' where id = v_c;
  select count(*) into v_cnt from public.contracts_ending_trial() where contract_id = v_c;
  assert v_cnt = 0, 'ASSERT FAILED: a running trial was billed early';

  -- (d) a trialing tenant is NOT suspended and keeps working
  assert public.tenant_is_suspended(v_e) = false,
    'ASSERT FAILED: a trialing tenant reads as suspended';

  -- (e) the deliverables the client keeps are recorded
  select count(*) into v_cnt from public.setup_deliverables where client_keeps and active;
  assert v_cnt >= 3,
    format('ASSERT FAILED: only %s deliverables marked as kept by the client', v_cnt);

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 9 trial assertions passed';
end $$;
