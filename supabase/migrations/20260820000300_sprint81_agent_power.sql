-- 20260820000300_sprint81_agent_power.sql
-- Sprint 8.1 · T3 — state for pausing and resuming the attendance agent.
--
-- WHY: Sprint 8 closed with the soft stop covering only the Copilot. The
-- attendance agent generates provider-side and autonomously, so no pre-flight
-- check of ours can gate it — a tenant at zero credits kept consuming, and we
-- kept paying the provider for it. That was TODO B1.
--
-- The provider does expose a switch:
--     PUT /v2/agent/{agentId}/inactive
--     PUT /v2/agent/{agentId}/active
-- Both halves matter. Deactivating a customer we could not switch back on would
-- be worse than not stopping them at all, so the resume path is what makes this
-- safe to use.
--
-- These columns exist so we never call the provider twice for the same state,
-- and so a human can see WHY an agent is off without reading logs.

alter table public.equipes
  add column if not exists agent_paused_at     timestamptz,
  add column if not exists agent_paused_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipes_agent_paused_reason_check') then
    alter table public.equipes
      add constraint equipes_agent_paused_reason_check
      check (agent_paused_reason is null
             or agent_paused_reason in ('no_credits', 'suspended', 'manual'));
  end if;
end $$;

comment on column public.equipes.agent_paused_at is
  'Sprint 8.1 · when the attendance agent was deactivated at the provider. NULL = running.';
comment on column public.equipes.agent_paused_reason is
  'no_credits = WhatsApp pool empty · suspended = dunning · manual = a human turned it off. A manual pause is never auto-resumed.';

create index if not exists idx_equipes_agent_paused
  on public.equipes (agent_paused_at)
  where agent_paused_at is not null;

-- ============================================================================
-- Which tenants should the agent be OFF for, and which should be back ON?
-- Kept in SQL so the cron and the webhook cannot disagree about the rule.
-- ============================================================================

create or replace function public.agents_to_pause()
returns table (equipe_id uuid, agent_id text, reason text)
language sql stable
set search_path = public
as $fn$
  select e.id, e.gpt_maker_agent_id, r.reason
  from public.equipes e
  cross join lateral (
    select case
      when c.status = 'suspended' then 'suspended'
      when public.credit_balance(e.id, 'whatsapp') <= 0 then 'no_credits'
    end as reason
    from public.contracts c
    where c.equipe_id = e.id and c.status in ('active','past_due','suspended')
    union all
    -- A tenant with no live contract is not billed and not our cost to carry.
    select case when public.credit_balance(e.id, 'whatsapp') <= 0 then 'no_credits' end
    where not exists (
      select 1 from public.contracts c2
      where c2.equipe_id = e.id and c2.status in ('active','past_due','suspended'))
    limit 1
  ) r
  where e.gpt_maker_agent_id is not null
    and e.agent_paused_at is null
    and r.reason is not null;
$fn$;

create or replace function public.agents_to_resume()
returns table (equipe_id uuid, agent_id text)
language sql stable
set search_path = public
as $fn$
  select e.id, e.gpt_maker_agent_id
  from public.equipes e
  where e.gpt_maker_agent_id is not null
    and e.agent_paused_at is not null
    -- A human switched it off deliberately; paying an invoice must not undo that.
    and e.agent_paused_reason in ('no_credits', 'suspended')
    and public.credit_balance(e.id, 'whatsapp') > 0
    and not exists (
      select 1 from public.contracts c
      where c.equipe_id = e.id and c.status = 'suspended');
$fn$;

-- ============================================================================
-- ASSERTIONS
-- ============================================================================

do $$
declare
  v_e uuid; v_c uuid; v_cnt integer;
begin
  insert into public.equipes (nome, crm_link, suporte_link, gpt_maker_agent_id)
  values ('__t81_power__','x','x','AGENT123') returning id into v_e;
  insert into public.contracts (equipe_id, status, current_period_start, current_period_end)
  values (v_e, 'active', now(), now() + interval '1 month') returning id into v_c;

  -- (a) zero WhatsApp credits -> should be paused
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_e;
  assert v_cnt = 1, 'ASSERT FAILED: an agent with no WhatsApp credits was not queued for pause';

  -- (b) funded -> should not be paused
  perform public.grant_credits(v_e, 2500, 'plan_period', null, now() + interval '30 days', 'p_g', 'grant', 'whatsapp');
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_e;
  assert v_cnt = 0, 'ASSERT FAILED: a funded agent was queued for pause';

  -- (c) COPILOT credits must not keep the WhatsApp agent alive — the whole
  -- reason the pools are separate.
  insert into public.credit_ledger (equipe_id, entry_type, credits, source, idempotency_key, pool)
  values (v_e, 'debit', -2500, 'ai_action', 'drain_wa', 'whatsapp');
  perform public.grant_credits(v_e, 1000, 'plan_period', null, now() + interval '30 days', 'cp_g', 'grant', 'copilot');
  perform public.recompute_credit_balance(v_e);
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_e;
  assert v_cnt = 1, 'ASSERT FAILED: copilot credits kept the WhatsApp agent running';

  -- (d) once paused it is not queued again — we never call the provider twice
  update public.equipes set agent_paused_at = now(), agent_paused_reason = 'no_credits' where id = v_e;
  select count(*) into v_cnt from public.agents_to_pause() where equipe_id = v_e;
  assert v_cnt = 0, 'ASSERT FAILED: an already-paused agent was queued again';

  -- (e) a top-up brings it back
  perform public.grant_credits(v_e, 500, 'invoice', null, null, 'wa_top', 'topup', 'whatsapp');
  select count(*) into v_cnt from public.agents_to_resume() where equipe_id = v_e;
  assert v_cnt = 1, 'ASSERT FAILED: a funded, paused agent was not queued for resume';

  -- (f) ...but not while the contract is suspended for non-payment
  update public.contracts set status = 'suspended' where id = v_c;
  select count(*) into v_cnt from public.agents_to_resume() where equipe_id = v_e;
  assert v_cnt = 0, 'ASSERT FAILED: credits resumed an agent whose contract is suspended';

  -- (g) a manual pause is never auto-resumed
  update public.contracts set status = 'active' where id = v_c;
  update public.equipes set agent_paused_reason = 'manual' where id = v_e;
  select count(*) into v_cnt from public.agents_to_resume() where equipe_id = v_e;
  assert v_cnt = 0, 'ASSERT FAILED: a manual pause was overridden automatically';

  delete from public.equipes where id = v_e;
  raise notice 'Sprint 8.1 T3 assertions passed';
end $$;
