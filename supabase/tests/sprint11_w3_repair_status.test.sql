-- Sprint 11 · Onda 3 · T28 — ensaio do reparo de status sobre a produção real.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_repair_status.test.sql
--
-- Roda a migration do desfecho e o reparo dentro de um rollback, sobre os
-- negócios de verdade, e prova: depois do reparo nenhum negócio discorda da
-- etapa, todo fechado tem data, e nenhum evento de funil foi criado.

begin;

-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql

create temp view pg_temp.disagree as
  select o.id
    from public.opportunities o
    join public.pipeline_stages_v2 s on s.id = o.stage_id
   where o.deleted_at is null
     and s.stage_type in ('won', 'lost')
     and o.status is distinct from s.stage_type;

create temp table pg_temp.before_counts as
  select (select count(*) from public.funnel_events) as events,
         (select count(*) from pg_temp.disagree)     as disagree;

-- @include supabase/scripts/2026-09-12_sprint11_repair_status_from_stage.sql

do $$
declare
  v_before record;
begin
  select * into v_before from pg_temp.before_counts;
  assert (select count(*) from pg_temp.disagree) = 0,
    'REPARO FAIL: ainda ha ' || (select count(*) from pg_temp.disagree) || ' negocios com status diferente da etapa';
  assert (select count(*) from public.funnel_events) = v_before.events,
    'REPARO FAIL: o reparo criou ' || ((select count(*) from public.funnel_events) - v_before.events) || ' eventos';
  assert not exists (select 1 from public.opportunities
                      where deleted_at is null and status in ('won', 'lost') and closed_at is null),
    'REPARO FAIL: negocio fechado sem closed_at';
  raise notice 'reparo: % negocios corrigidos', v_before.disagree;
end $$;

rollback;
select 'PASS' as result;
