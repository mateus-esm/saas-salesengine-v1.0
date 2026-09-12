-- Sprint 11 · Onda 3 · T31 — ensaio do backfill da receita sobre a produção real.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_backfill_revenue.test.sql
--
-- Aplica, dentro de um rollback, as migrations da onda até a receita, o reparo
-- de status e o backfill — na ordem do deploy — e prova: todo negócio ganho tem
-- receita líquida = valor, na data do ganho; nenhum aberto/perdido tem receita;
-- rodar o backfill de novo não lança nada.

begin;

-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/scripts/2026-09-12_sprint11_repair_status_from_stage.sql
-- @include supabase/scripts/2026-09-12_sprint11_backfill_revenue.sql

do $$
declare
  v_won     integer;
  v_booked  integer;
  v_wrong   integer;
  v_again   integer;
begin
  select count(*) into v_won from public.opportunities
   where status = 'won' and deleted_at is null and coalesce(value, 0) <> 0;

  select count(*) into v_booked from public.revenue_entries where kind = 'booking';
  assert v_booked = v_won,
    'BACKFILL FAIL: ' || v_won || ' ganhos com valor, ' || v_booked || ' lancamentos';

  select count(*) into v_wrong
    from public.opportunities o
   where o.deleted_at is null
     and o.status = 'won'
     and (select coalesce(sum(e.amount), 0) from public.revenue_entries e where e.opportunity_id = o.id) <> coalesce(o.value, 0);
  assert v_wrong = 0, 'BACKFILL FAIL: ' || v_wrong || ' ganhos com receita diferente do valor';

  assert not exists (select 1 from public.revenue_entries e
                       join public.opportunities o on o.id = e.opportunity_id
                      where o.status <> 'won' or o.deleted_at is not null),
    'BACKFILL FAIL: negocio aberto, perdido ou apagado com receita';

  assert not exists (select 1 from public.revenue_entries e
                       join public.opportunities o on o.id = e.opportunity_id
                      where e.recognized_at <> o.closed_at),
    'BACKFILL FAIL: lancamento fora da data do ganho';

  select coalesce(sum(public._crm_sync_revenue(o.id, 'backfill')), 0) into v_again
    from public.opportunities o where o.status = 'won' and o.deleted_at is null;
  assert v_again = 0, 'BACKFILL FAIL: rodar de novo lancou ' || v_again;

  raise notice 'backfill: % ganhos, % lancamentos', v_won, v_booked;
end $$;

rollback;
select 'PASS' as result;
