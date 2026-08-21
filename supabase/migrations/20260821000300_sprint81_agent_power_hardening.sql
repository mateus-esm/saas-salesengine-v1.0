-- 20260821000300_sprint81_agent_power_hardening.sql
-- Sprint 8.1 fixes · the two agents that kept failing to pause in production.
--
-- Diagnosed from a real run (paused: 6, failed: 2):
--
-- (a) One team has gpt_maker_agent_id = '' — an EMPTY STRING, not NULL. The
--     filter tested `is not null`, so it passed, and we then called
--     PUT /agent//inactive, which can never work. That is a defect in the
--     filter, not bad data: a blank id means "no agent" just as much as NULL.
--
-- (b) One team has a real-looking id the provider rejects — stale, deleted, or
--     already inactive on their side. Retrying it every run forever is noise
--     that hides genuine failures, and it hammers the provider for nothing.
--
-- So: record what went wrong, back off after repeated failures, and surface it
-- in the admin screen instead of only in a log nobody reads.

alter table public.equipes
  add column if not exists agent_power_error   text,
  add column if not exists agent_power_failures integer not null default 0,
  add column if not exists agent_power_last_try timestamptz;

comment on column public.equipes.agent_power_error is
  'Sprint 8.1 · last error from the provider when toggling the agent. Non-null means the switch is not working for this team.';
comment on column public.equipes.agent_power_failures is
  'Consecutive failures. After 5 the team is skipped until an admin intervenes, so one broken agent id cannot generate a daily provider call forever.';

/** A blank agent id is no agent at all. */
create or replace function public.has_usable_agent(p_agent_id text)
returns boolean
language sql immutable
as $fn$
  select p_agent_id is not null and length(btrim(p_agent_id)) > 0;
$fn$;

-- ============================================================================
-- Rebuilt with the blank-id fix and the failure backoff.
-- ============================================================================

create or replace function public.agents_to_pause()
returns table (equipe_id uuid, agent_id text, reason text)
language sql stable
set search_path = public
as $fn$
  select e.id, btrim(e.gpt_maker_agent_id), r.reason
  from public.equipes e
  cross join lateral (
    select case
      when c.status = 'suspended' then 'suspended'
      when public.credit_balance(e.id, 'whatsapp') <= 0 then 'no_credits'
    end as reason
    from public.contracts c
    where c.equipe_id = e.id and c.status in ('active','past_due','suspended')
    union all
    select case when public.credit_balance(e.id, 'whatsapp') <= 0 then 'no_credits' end
    where not exists (
      select 1 from public.contracts c2
      where c2.equipe_id = e.id and c2.status in ('active','past_due','suspended'))
    limit 1
  ) r
  where public.has_usable_agent(e.gpt_maker_agent_id)
    and e.agent_paused_at is null
    and e.agent_power_failures < 5
    and r.reason is not null;
$fn$;

create or replace function public.agents_to_resume()
returns table (equipe_id uuid, agent_id text)
language sql stable
set search_path = public
as $fn$
  select e.id, btrim(e.gpt_maker_agent_id)
  from public.equipes e
  where public.has_usable_agent(e.gpt_maker_agent_id)
    and e.agent_paused_at is not null
    and e.agent_paused_reason in ('no_credits', 'suspended')
    and e.agent_power_failures < 5
    and public.credit_balance(e.id, 'whatsapp') > 0
    and not exists (
      select 1 from public.contracts c
      where c.equipe_id = e.id and c.status = 'suspended');
$fn$;

/**
 * Clear the failure counter. Called after a successful toggle, and available to
 * an admin who has fixed the agent id and wants it retried immediately rather
 * than waiting out the backoff.
 */
create or replace function public.reset_agent_power_error(p_equipe_id uuid)
returns void
language sql
security definer
set search_path = public
as $fn$
  update public.equipes
     set agent_power_error = null, agent_power_failures = 0
   where id = p_equipe_id;
$fn$;

-- Surface it where the founder already looks. Dropped rather than replaced:
-- CREATE OR REPLACE VIEW cannot insert columns in the middle.
drop view if exists public.v_admin_team_billing;
create view public.v_admin_team_billing as
select
  e.id as equipe_id,
  e.nome,
  public.has_usable_agent(e.gpt_maker_agent_id) as has_agent,
  e.agent_paused_at,
  e.agent_paused_reason,
  e.agent_power_error,
  e.agent_power_failures,
  c.id as contract_id,
  coalesce(c.status, 'none') as contract_status,
  c.current_period_end,
  (select bp.code from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan' limit 1) as plan_code,
  (select bp.name from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan' limit 1) as plan_name,
  coalesce((select sum(ci.unit_price * ci.quantity) from public.contract_items ci
             where ci.contract_id = c.id and ci.period = 'monthly'), 0) as mrr,
  public.credit_balance(e.id, 'whatsapp') as whatsapp_balance,
  public.credit_balance(e.id, 'copilot')  as copilot_balance,
  (select count(*) from public.profiles p where p.equipe_id = e.id) as seats_used,
  (select seat_limit from public.v_tenant_entitlements te where te.equipe_id = e.id) as seat_limit,
  coalesce((select sum(ci.quantity) from public.contract_items ci
              join public.billing_products bp on bp.id = ci.product_id
             where ci.contract_id = c.id and bp.kind = 'instance'), 0) as instances_contracted,
  (select count(*) from public.wpp_instances w where w.equipe_id = e.id) as instances_connected,
  coalesce((select sum(ci.quantity) from public.contract_items ci
              join public.billing_products bp on bp.id = ci.product_id
             where ci.contract_id = c.id and bp.code = 'builder_hour'), 0) as builder_hours_extra,
  coalesce((select sum(i.total) from public.invoices i
             where i.equipe_id = e.id and i.status in ('open','overdue')), 0) as open_amount
from public.equipes e
left join public.contracts c
  on c.equipe_id = e.id and c.status in ('draft','active','past_due','suspended');

-- ============================================================================
-- ASSERTIONS
-- ============================================================================

do $$
declare v_e uuid; v_blank uuid; v_cnt integer;
begin
  -- (a) THE BUG: a blank agent id must never be queued
  insert into public.equipes (nome, crm_link, suporte_link, gpt_maker_agent_id)
  values ('__t81_blank__','x','x','') returning id into v_blank;
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_blank;
  assert v_cnt = 0, 'ASSERT FAILED: a team with a blank agent id was queued for pause';

  -- ...and neither must whitespace
  update public.equipes set gpt_maker_agent_id = '   ' where id = v_blank;
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_blank;
  assert v_cnt = 0, 'ASSERT FAILED: a whitespace-only agent id was queued';

  -- (b) a real id still is queued, and comes back trimmed
  insert into public.equipes (nome, crm_link, suporte_link, gpt_maker_agent_id)
  values ('__t81_real__','x','x','  AGENTX  ') returning id into v_e;
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_e and agent_id = 'AGENTX';
  assert v_cnt = 1, 'ASSERT FAILED: a valid agent id was not queued, or not trimmed';

  -- (c) backoff: a team that keeps failing stops being retried
  update public.equipes set agent_power_failures = 5 where id = v_e;
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_e;
  assert v_cnt = 0, 'ASSERT FAILED: a repeatedly failing agent is still being retried';

  -- (d) an admin can clear the block
  perform public.reset_agent_power_error(v_e);
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_e;
  assert v_cnt = 1, 'ASSERT FAILED: reset_agent_power_error did not re-enable retries';

  delete from public.equipes where id in (v_e, v_blank);
  raise notice 'Sprint 8.1 agent power hardening assertions passed';
end $$;
