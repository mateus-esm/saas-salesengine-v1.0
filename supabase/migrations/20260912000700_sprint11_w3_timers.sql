-- Sprint 11 · Onda 3 · T34 — o agendador: reciclo e recorrência (decisões 15 e 16).
--
-- UM AGENDADOR, UMA FUNÇÃO: crm_run_timers(), chamada pelo pg_cron a cada 15 min
-- (o cron.schedule fica em supabase/scripts/2026-09-12_sprint11_schedule_timers.sql,
-- aplicado só com aprovação do founder no T38). Sem edge function, sem segredo.
--
-- RECICLO. A etapa `ciclo` tem prazo (cycle_days) e etapa alvo; o `cycle_pass`
-- do python-agent existia e ninguém o chamava — a Casa Flow tem 200 negócios na
-- etapa Reciclo, 29 vencidos (11/09). Aqui: o negócio vencido volta para a etapa
-- alvo (mesmo pipeline), com evento `recycled` (fonte `timer`) e o webhook da
-- etapa por pg_net. `p_recycle_since` segura o ACUMULADO: só recicla quem venceu
-- a partir daquela hora — o founder decide no T38 se solta os 29 ou não.
--
-- RECORRÊNCIA (decisão 15, refinada): um item recorrente ganho vence a cada N
-- dias/meses; X dias antes nasce um NEGÓCIO NOVO — mesmo contato, mesmo dono, os
-- itens daquela cadência, no pipeline/etapa do item (padrão: o do negócio,
-- primeira etapa aberta), origem 'recorrencia', ligado ao anterior. UM RETORNO
-- POR NEGÓCIO E POR CADÊNCIA: a limpeza semestral e a manutenção anual do mesmo
-- negócio viram dois retornos, cada um no seu tempo (um retorno só levaria uma
-- das cadências para o lugar errado ou a perderia). O retorno ganho agenda o
-- próximo (ele próprio tem os itens recorrentes). Retorno apagado não volta.
--
-- AUTOR. Os movimentos do agendador entram no histórico de etapa como
-- "automation" (o gatilho do histórico lê `crm.actor_type`, que o agendador liga
-- na própria transação).

-- ============================================================================
-- 1. O NEGÓCIO SABE DE ONDE VEIO
-- ============================================================================

alter table public.opportunities add column if not exists renewal_of_id uuid references public.opportunities(id) on delete set null;
alter table public.opportunities add column if not exists renewal_key text;
alter table public.opportunities add column if not exists origin text;

alter table public.opportunities drop constraint if exists opportunities_origin_check;
alter table public.opportunities add constraint opportunities_origin_check
  check (origin is null or origin in ('recorrencia'));

-- Um retorno por negócio e por cadência — apagado inclusive (apagar é "não quero").
create unique index if not exists uq_opportunities_renewal
  on public.opportunities (renewal_of_id, renewal_key)
  where renewal_of_id is not null;

-- ============================================================================
-- 2. O HISTÓRICO SABE QUEM MOVEU
-- ============================================================================

create or replace function public.log_opportunity_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    insert into public.opportunity_stage_history
      (equipe_id, opportunity_id, from_stage_id, to_stage_id, changed_by, changed_by_type)
    values
      (new.equipe_id, new.id, old.stage_id, new.stage_id, auth.uid(),
       coalesce(nullif(current_setting('crm.actor_type', true), ''), 'team'));
    new.stage_entered_at := now();
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 3. O REGISTRO DE CADA EXECUÇÃO
-- ============================================================================

create table if not exists public.crm_timer_runs (
  id        bigint generated always as identity primary key,
  ran_at    timestamptz not null default clock_timestamp(),
  dry_run   boolean not null,
  recycled  integer not null default 0,
  renewals  integer not null default 0,
  details   jsonb not null default '[]'::jsonb
);
alter table public.crm_timer_runs enable row level security;
-- Sem políticas: só o banco (e quem opera pela Management API) lê.

-- ============================================================================
-- 4. O AGENDADOR
-- ============================================================================

create or replace function public.crm_run_timers(
  p_dry_run       boolean default false,
  p_recycle_since timestamptz default null,
  p_equipe_id     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_recycled integer := 0;
  v_renewals integer := 0;
  v_details  jsonb := '[]'::jsonb;
  v_new_id   uuid;
  v_stage    uuid;
  c_limit    constant integer := 500;
begin
  perform set_config('crm.actor_type', 'automation', true);

  -- ---------------------------------------------------------------- reciclo --
  for r in
    select o.id, o.equipe_id, o.lead_id, o.pipeline_id, o.stage_id,
           s.cycle_target_stage_id as target, s.cycle_webhook_url as webhook,
           o.stage_entered_at + make_interval(days => s.cycle_days) as expired_at
      from public.opportunities o
      join public.pipeline_stages_v2 s on s.id = o.stage_id
      join public.pipeline_stages_v2 t on t.id = s.cycle_target_stage_id
     where s.stage_type = 'ciclo'
       and s.deleted_at is null
       and coalesce(s.cycle_days, 0) > 0
       and t.deleted_at is null
       and t.pipeline_id = o.pipeline_id
       and o.deleted_at is null
       and o.stage_entered_at + make_interval(days => s.cycle_days) <= now()
       and (p_recycle_since is null or o.stage_entered_at + make_interval(days => s.cycle_days) >= p_recycle_since)
       and (p_equipe_id is null or o.equipe_id = p_equipe_id)
     order by o.stage_entered_at
     limit c_limit
  loop
    v_recycled := v_recycled + 1;
    v_details := v_details || jsonb_build_object('kind', 'recycle', 'opportunity_id', r.id,
                                                 'from_stage_id', r.stage_id, 'to_stage_id', r.target);
    if not p_dry_run then
      update public.opportunities set stage_id = r.target where id = r.id;
      insert into public.funnel_events
        (equipe_id, opportunity_id, lead_id, pipeline_id, stage_id, event, occurred_at, source, actor, actor_type)
      values
        (r.equipe_id, r.id, r.lead_id, r.pipeline_id, r.target, 'recycled', clock_timestamp(), 'timer', null, 'automation');
      if r.webhook is not null and r.webhook <> '' then
        perform net.http_post(
          url     := r.webhook,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := jsonb_build_object('event', 'cycle_pass', 'equipe_id', r.equipe_id, 'opportunity_id', r.id,
                                        'from_stage_id', r.stage_id, 'to_stage_id', r.target)
        );
      end if;
    end if;
  end loop;

  -- ------------------------------------------------------------ recorrência --
  for r in
    with due as (
      select o.id, o.equipe_id, o.lead_id, o.pipeline_id, o.owner_id,
             i.recurrence_every, i.recurrence_unit,
             i.recurrence_every::text || ':' || i.recurrence_unit as rkey,
             min(i.renew_days_before) as renew_days_before,
             (array_agg(i.renew_pipeline_id order by i.position) filter (where i.renew_pipeline_id is not null))[1] as renew_pipeline_id,
             (array_agg(i.renew_stage_id order by i.position) filter (where i.renew_stage_id is not null))[1] as renew_stage_id,
             o.closed_at + case i.recurrence_unit
                             when 'month' then make_interval(months => i.recurrence_every)
                             else make_interval(days => i.recurrence_every) end as due_at
        from public.opportunities o
        join public.opportunity_items i on i.opportunity_id = o.id and i.deleted_at is null
       where o.status = 'won'
         and o.deleted_at is null
         and o.closed_at is not null
         and i.recurrence_every is not null
         and (p_equipe_id is null or o.equipe_id = p_equipe_id)
       group by o.id, o.equipe_id, o.lead_id, o.pipeline_id, o.owner_id, o.closed_at,
                i.recurrence_every, i.recurrence_unit
    )
    select d.* from due d
     where d.due_at - make_interval(days => d.renew_days_before) <= now()
       and not exists (select 1 from public.opportunities x
                        where x.renewal_of_id = d.id and x.renewal_key = d.rkey)
     order by d.due_at
     limit c_limit
  loop
    -- Onde o retorno nasce: o pipeline do item (se ativo), senão o do negócio;
    -- a etapa do item (se é daquele pipeline), senão a primeira aberta.
    select pl.id into r.renew_pipeline_id from public.pipelines pl
     where pl.id = coalesce(r.renew_pipeline_id, r.pipeline_id) and pl.deleted_at is null and not pl.is_archived;
    if r.renew_pipeline_id is null then
      r.renew_pipeline_id := r.pipeline_id;
    end if;
    select s.id into v_stage from public.pipeline_stages_v2 s
     where s.id = r.renew_stage_id and s.pipeline_id = r.renew_pipeline_id and s.deleted_at is null;
    if v_stage is null then
      select s.id into v_stage from public.pipeline_stages_v2 s
       where s.pipeline_id = r.renew_pipeline_id and s.stage_type = 'open' and s.deleted_at is null
       order by s.position, s.created_at limit 1;
    end if;
    if v_stage is null then
      v_details := v_details || jsonb_build_object('kind', 'renewal_skipped', 'opportunity_id', r.id,
                                                   'reason', 'no_open_stage', 'pipeline_id', r.renew_pipeline_id);
      continue;
    end if;

    v_renewals := v_renewals + 1;
    v_details := v_details || jsonb_build_object('kind', 'renewal', 'opportunity_id', r.id, 'cadence', r.rkey,
                                                 'due_at', r.due_at, 'pipeline_id', r.renew_pipeline_id, 'stage_id', v_stage);
    if not p_dry_run then
      insert into public.opportunities
        (equipe_id, lead_id, pipeline_id, stage_id, owner_id, origin, renewal_of_id, renewal_key)
      values
        (r.equipe_id, r.lead_id, r.renew_pipeline_id, v_stage, r.owner_id, 'recorrencia', r.id, r.rkey)
      returning id into v_new_id;

      insert into public.opportunity_items
        (equipe_id, opportunity_id, catalog_item_id, name, quantity, unit_price, price_locked,
         recurrence_every, recurrence_unit, renew_days_before, renew_pipeline_id, renew_stage_id, position)
      select i.equipe_id, v_new_id, i.catalog_item_id, i.name, i.quantity, i.unit_price, i.price_locked,
             i.recurrence_every, i.recurrence_unit, i.renew_days_before, i.renew_pipeline_id, i.renew_stage_id, i.position
        from public.opportunity_items i
       where i.opportunity_id = r.id and i.deleted_at is null
         and i.recurrence_every = r.recurrence_every and i.recurrence_unit = r.recurrence_unit;

      update public.opportunities o
         set value = (select sum(i.total) from public.opportunity_items i
                       where i.opportunity_id = v_new_id and i.deleted_at is null)
       where o.id = v_new_id;
    end if;
  end loop;

  insert into public.crm_timer_runs (dry_run, recycled, renewals, details)
  values (p_dry_run, v_recycled, v_renewals, v_details);

  perform set_config('crm.actor_type', '', true);

  return jsonb_build_object('dry_run', p_dry_run, 'recycled', v_recycled, 'renewals', v_renewals, 'details', v_details);
end;
$$;

comment on function public.crm_run_timers(boolean, timestamptz, uuid) is
  'Sprint 11 · T34: the one scheduler — recycles expired deals in ciclo stages (event recycled, stage webhook) and opens the next-cycle deal for won recurring items (one per deal and cadence). Called by pg_cron for every team; p_dry_run answers without writing; p_recycle_since holds the backlog; p_equipe_id runs one team (operation, tests).';

revoke all on function public.crm_run_timers(boolean, timestamptz, uuid) from public, anon, authenticated;
