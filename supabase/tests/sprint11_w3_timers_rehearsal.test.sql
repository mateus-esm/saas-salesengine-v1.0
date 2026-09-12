-- Sprint 11 · Onda 3 · T34 — ensaio do agendador sobre a produção real.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_timers_rehearsal.test.sql
--
-- Na ordem do deploy (migrations, reparo, backfills), dentro de um rollback:
-- o que o agendador faria na primeira execução, para todas as equipes — sem
-- corte (soltar o acumulado) e com corte (só o que vencer depois de ligar).
-- Os números esperados são os de 11/09; se a produção mudou, a mensagem diz o novo.

begin;

-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql
-- @include supabase/migrations/20260912000600_sprint11_w3_revenue_metrics.sql
-- @include supabase/migrations/20260912000700_sprint11_w3_timers.sql
-- @include supabase/migrations/20260912000800_sprint11_w3_natures.sql
-- @include supabase/scripts/2026-09-12_sprint11_repair_status_from_stage.sql
-- @include supabase/scripts/2026-09-12_sprint11_backfill_revenue.sql
-- @include supabase/scripts/2026-09-12_sprint11_backfill_lifecycle.sql

do $$
declare
  v_all   jsonb;
  v_since jsonb;
begin
  v_all   := public.crm_run_timers(true, null);
  v_since := public.crm_run_timers(true, now());

  assert (v_since->>'recycled')::int = 0,
    'ENSAIO: com corte na hora de ligar, nada deveria reciclar na primeira execucao; reciclaria ' || (v_since->>'recycled');
  assert (v_all->>'renewals')::int = 0,
    'ENSAIO: sem catalogo ainda, nenhum retorno deveria nascer; nasceriam ' || (v_all->>'renewals');
  assert (v_all->>'recycled')::int between 25 and 40,
    'ENSAIO: sem corte, o acumulado do reciclo mudou: reciclaria ' || (v_all->>'recycled') || ' (eram 29 em 11/09)';
end $$;

rollback;
select 'PASS' as result;
