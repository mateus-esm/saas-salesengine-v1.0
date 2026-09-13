-- Sprint 11 · Onda 6 · T66 — o relatório de velocidade roda sobre as tabelas da onda.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w6_copilot_speed_report.test.sql
--
-- O relatório é somente leitura; o teste só garante que ele compila e roda contra
-- as tabelas e colunas que as migrations criam (em rollback).

begin;

-- @include supabase/migrations/20260914000100_sprint11_w6_copilot_queue.sql
-- @include supabase/migrations/20260914000200_sprint11_w6_copilot_apply.sql
-- @include supabase/migrations/20260914000600_sprint11_w6_copilot_threads.sql
-- @include supabase/scripts/2026-09-14_copilot_speed_report.sql

rollback;
select 'PASS' as result;
