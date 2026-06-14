-- 20260614000100_sprint6_1_credit_ledger.sql
-- Copilot credit wallet (SEPARATE from GPT-Maker/Asaas credits) + action ledger.

create table if not exists public.agent_credits_balance (
  equipe_id  uuid primary key references public.equipes(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_action_ledger (
  id                 uuid primary key default gen_random_uuid(),
  equipe_id          uuid not null references public.equipes(id) on delete cascade,
  opportunity_id     uuid,
  lead_id            uuid,
  decision_id        uuid,
  verb               text not null,
  credits_charged    integer not null default 1,
  model              text,
  real_input_tokens  integer,
  real_output_tokens integer,
  real_cost_usd      numeric(12,6),
  mode               text not null check (mode in ('auto','manual')),
  idempotency_key    text not null,
  created_at         timestamptz not null default now(),
  unique (equipe_id, idempotency_key)
);

create index if not exists idx_action_ledger_equipe_created
  on public.agent_action_ledger (equipe_id, created_at desc);

alter table public.agent_credits_balance enable row level security;
alter table public.agent_action_ledger  enable row level security;

create policy agent_credits_balance_tenant on public.agent_credits_balance
  for select using (equipe_id in (select equipe_id from public.profiles where id = auth.uid()));
create policy agent_action_ledger_tenant on public.agent_action_ledger
  for select using (equipe_id in (select equipe_id from public.profiles where id = auth.uid()));

-- Atomic, idempotent, charge-on-success-only debit + ledger insert.
-- Returns the inserted ledger id, OR the EXISTING id on idempotency-key replay,
-- OR raises 'insufficient_credits' when the balance cannot cover p_credits.
create or replace function public.charge_credits(
  p_equipe_id       uuid,
  p_credits         integer,
  p_idempotency_key text,
  p_ledger          jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_balance  integer;
  v_id       uuid;
begin
  select id into v_existing
    from public.agent_action_ledger
   where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  if p_credits is null or p_credits <= 0 then
    raise exception 'invalid_credits' using errcode = 'P0001';
  end if;

  select balance into v_balance
    from public.agent_credits_balance
   where equipe_id = p_equipe_id
   for update;

  if v_balance is null then
    raise exception 'no_wallet' using errcode = 'P0001';
  end if;
  if v_balance < p_credits then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  -- Debit + ledger insert in one sub-block: a unique_violation here means a
  -- concurrent same-key call won the race after our early SELECT (TOCTOU). The
  -- sub-block rolls back BOTH the debit UPDATE and the INSERT on exception, so
  -- there is no double-charge; we then return the existing ledger id (replay).
  begin
    update public.agent_credits_balance
       set balance = balance - p_credits, updated_at = now()
     where equipe_id = p_equipe_id;

    insert into public.agent_action_ledger (
      equipe_id, opportunity_id, lead_id, decision_id, verb, credits_charged,
      model, real_input_tokens, real_output_tokens, real_cost_usd, mode, idempotency_key
    ) values (
      p_equipe_id,
      nullif(p_ledger->>'opportunity_id','')::uuid,
      nullif(p_ledger->>'lead_id','')::uuid,
      nullif(p_ledger->>'decision_id','')::uuid,
      p_ledger->>'verb',
      p_credits,
      p_ledger->>'model',
      nullif(p_ledger->>'real_input_tokens','')::int,
      nullif(p_ledger->>'real_output_tokens','')::int,
      nullif(p_ledger->>'real_cost_usd','')::numeric,
      coalesce(p_ledger->>'mode','manual'),
      p_idempotency_key
    ) returning id into v_id;
  exception when unique_violation then
    -- concurrent replay won the race: no double-charge, return the existing row
    select id into v_id
      from public.agent_action_ledger
     where equipe_id = p_equipe_id and idempotency_key = p_idempotency_key;
  end;

  return v_id;
end;
$$;
