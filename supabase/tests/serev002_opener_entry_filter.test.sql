-- SE-REV-002 · Fase 0 — a coluna de filtro por porta da abertura automática.
--
-- Rodar: bash scripts/sqltest.sh supabase/tests/serev002_opener_entry_filter.test.sql
\set ON_ERROR_STOP on

begin;

-- @include supabase/migrations/20260925000100_serev001_start_conversation.sql
-- @include supabase/migrations/20260926000050_serev002_opener_entry_filter.sql

insert into public.equipes (id, nome, crm_link, suporte_link)
values ('5e000000-0000-0000-0000-000000000201', 'Teste SE-REV-002 F0', 'x', 'y');

-- =========================================================================
-- TEST 1 — tenant que já tinha configuração continua sem filtro de porta.
-- =========================================================================
do $$
begin
  insert into public.conversation_opener_settings (equipe_id, enabled)
  values ('5e000000-0000-0000-0000-000000000201', true);
  assert (select trigger_entry_ids = '{}'::uuid[] from public.conversation_opener_settings
           where equipe_id = '5e000000-0000-0000-0000-000000000201'),
    'F0-T1 FAIL: trigger_entry_ids deveria nascer vazio (sem filtro)';
  raise notice 'F0-T1 ok — a coluna nasce vazia, comportamento atual preservado';
end $$;

-- =========================================================================
-- TEST 2 — guarda UUIDs e recusa texto (o nome da porta não é aceito no lugar
-- do id: foi exatamente essa confusão que motivou a coluna).
-- =========================================================================
do $$
declare v_recusou boolean := false;
begin
  update public.conversation_opener_settings
     set trigger_entry_ids = array['5a000000-0000-0000-0000-0000000000e1']::uuid[]
   where equipe_id = '5e000000-0000-0000-0000-000000000201';
  assert (select '5a000000-0000-0000-0000-0000000000e1'::uuid = any (trigger_entry_ids)
            from public.conversation_opener_settings
           where equipe_id = '5e000000-0000-0000-0000-000000000201'),
    'F0-T2 FAIL: a porta não foi gravada';
  begin
    update public.conversation_opener_settings
       set trigger_entry_ids = array['Meta Ads - Cadastro']::uuid[]
     where equipe_id = '5e000000-0000-0000-0000-000000000201';
  exception when invalid_text_representation then
    v_recusou := true;
  end;
  assert v_recusou, 'F0-T2 FAIL: nome de porta aceito como id';
  raise notice 'F0-T2 ok — só UUID de porta entra no filtro';
end $$;

-- =========================================================================
-- TEST 3 — a migration é reaplicável (add column if not exists).
-- =========================================================================
-- @include supabase/migrations/20260926000050_serev002_opener_entry_filter.sql
do $$ begin raise notice 'F0-T3 ok — reaplicar a migration não quebra'; end $$;

rollback;
select 'PASS' as result;
