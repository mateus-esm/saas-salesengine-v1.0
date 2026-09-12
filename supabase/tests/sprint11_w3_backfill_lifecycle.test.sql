-- Sprint 11 · Onda 3 · T32 — ensaio do backfill do ciclo de vida sobre a produção real.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_backfill_lifecycle.test.sql
--
-- Na ordem do deploy (migrations, reparo de status, backfill), dentro de um
-- rollback: todo contato com negócio fica com o ciclo de vida dos negócios; quem
-- não tem negócio não muda; rodar de novo não muda nada.

begin;

-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql
-- @include supabase/scripts/2026-09-12_sprint11_repair_status_from_stage.sql

create temp table pg_temp.no_deal_before as
  select l.id, l.lifecycle_stage
    from public.leads l
   where not exists (select 1 from public.opportunities o where o.lead_id = l.id and o.deleted_at is null);

-- @include supabase/scripts/2026-09-12_sprint11_backfill_lifecycle.sql

do $$
declare
  v_wrong integer;
  v_moved integer;
begin
  select count(*) into v_wrong
    from public.leads l
   where exists (select 1 from public.opportunities o where o.lead_id = l.id and o.deleted_at is null)
     and l.lifecycle_stage is distinct from public._crm_lifecycle_from_deals(l.id);
  assert v_wrong = 0, 'LIFECYCLE FAIL: ' || v_wrong || ' contatos com ciclo de vida diferente dos negocios';

  select count(*) into v_moved
    from pg_temp.no_deal_before b join public.leads l on l.id = b.id
   where l.lifecycle_stage is distinct from b.lifecycle_stage;
  assert v_moved = 0, 'LIFECYCLE FAIL: ' || v_moved || ' contatos sem negocio mudaram';

  raise notice 'lifecycle: client %, opportunity %, lost %',
    (select count(*) from public.leads where lifecycle_stage = 'client'),
    (select count(*) from public.leads where lifecycle_stage = 'opportunity'),
    (select count(*) from public.leads where lifecycle_stage = 'lost');
end $$;

-- Idempotente: a segunda passada não encontra o que mudar.
-- @include supabase/scripts/2026-09-12_sprint11_backfill_lifecycle.sql

rollback;
select 'PASS' as result;
