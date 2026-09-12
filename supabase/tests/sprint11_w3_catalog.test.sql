-- Sprint 11 · Onda 3 · T29 — o catálogo de produtos e serviços.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_catalog.test.sql
--
-- O que este teste protege: o catálogo é da equipe (o vizinho não vê nem
-- arquiva); preço fixo exige preço; recorrência vem inteira (a cada N + unidade);
-- a etapa do retorno é do pipeline do retorno; arquivar esconde sem apagar.

begin;

-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5118a000-0000-0000-0000-000000000001', 'S11W3 Catalogo A', 'x', 'y'),
  ('5118a000-0000-0000-0000-000000000002', 'S11W3 Catalogo B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5118b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w3-catalogo.test',   'x', now(), now()),
  ('5118b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w3-catalogo.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5118b000-0000-0000-0000-00000000000a', '5118b000-0000-0000-0000-00000000000a', 'chefe@s11w3-catalogo.test',   '5118a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5118b000-0000-0000-0000-00000000000d', '5118b000-0000-0000-0000-00000000000d', 'vizinho@s11w3-catalogo.test', '5118a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('5118c000-0000-0000-0000-000000000001', '5118a000-0000-0000-0000-000000000001', 'Clinica S11W3'),
  ('5118c000-0000-0000-0000-000000000002', '5118a000-0000-0000-0000-000000000001', 'Retorno S11W3');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5118d000-0000-0000-0000-000000000001', '5118a000-0000-0000-0000-000000000001', '5118c000-0000-0000-0000-000000000001', 'Novo',     1, 'open'),
  ('5118d000-0000-0000-0000-000000000011', '5118a000-0000-0000-0000-000000000001', '5118c000-0000-0000-0000-000000000002', 'Agendar',  1, 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"5118b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Salvar: cria, edita, e as regras do item.
-- ============================================================================
do $$
declare
  v_id uuid;
  v_limpeza uuid;
  v_failed boolean;
begin
  v_id := public.crm_save_catalog_item(jsonb_build_object(
    'name', 'Instalação de usina 5 kWp', 'kind', 'service', 'price_mode', 'negotiable', 'price', 25000));
  assert v_id is not null, 'T29-1 FAIL: salvar deveria devolver o id';
  assert (select equipe_id from public.catalog_items where id = v_id) = '5118a000-0000-0000-0000-000000000001',
    'T29-1 FAIL: o item deveria ser da equipe de quem salvou';

  perform public.crm_save_catalog_item(jsonb_build_object('id', v_id, 'name', 'Usina 5 kWp', 'price', 24000));
  assert (select name || '|' || price::text from public.catalog_items where id = v_id) = 'Usina 5 kWp|24000.00',
    'T29-1 FAIL: editar deveria trocar nome e preco';
  assert (select kind from public.catalog_items where id = v_id) = 'service',
    'T29-1 FAIL: editar sem mandar o tipo nao deveria apagar o tipo';

  -- Recorrente: limpeza a cada 6 meses, retorno 15 dias antes, no pipeline de retorno.
  v_limpeza := public.crm_save_catalog_item(jsonb_build_object(
    'name', 'Limpeza', 'kind', 'service', 'price_mode', 'fixed', 'price', 250,
    'recurrence_every', 6, 'recurrence_unit', 'month', 'renew_days_before', 15,
    'renew_pipeline_id', '5118c000-0000-0000-0000-000000000002',
    'renew_stage_id',    '5118d000-0000-0000-0000-000000000011'));
  assert (select recurrence_every = 6 and recurrence_unit = 'month' and renew_days_before = 15
            from public.catalog_items where id = v_limpeza), 'T29-1 FAIL: recorrencia nao gravou';

  v_failed := false;
  begin
    perform public.crm_save_catalog_item(jsonb_build_object('name', 'Sem preço', 'price_mode', 'fixed'));
  exception when others then v_failed := sqlerrm like '%catalog_fixed_has_price%';
  end;
  assert v_failed, 'T29-1 FAIL: preco fixo sem preco deveria ser recusado';

  v_failed := false;
  begin
    perform public.crm_save_catalog_item(jsonb_build_object('name', 'Meia recorrência', 'recurrence_every', 3));
  exception when others then v_failed := sqlerrm like '%catalog_recurrence_pair%';
  end;
  assert v_failed, 'T29-1 FAIL: recorrencia sem unidade deveria ser recusada';

  v_failed := false;
  begin
    perform public.crm_save_catalog_item(jsonb_build_object(
      'name', 'Retorno torto', 'recurrence_every', 1, 'recurrence_unit', 'month',
      'renew_pipeline_id', '5118c000-0000-0000-0000-000000000002',
      'renew_stage_id',    '5118d000-0000-0000-0000-000000000001'));
  exception when others then v_failed := sqlerrm like '%renew_stage_not_in_pipeline%';
  end;
  assert v_failed, 'T29-1 FAIL: etapa de retorno de outro pipeline deveria ser recusada';

  v_failed := false;
  begin
    perform public.crm_save_catalog_item(jsonb_build_object('name', '   '));
  exception when others then v_failed := true;
  end;
  assert v_failed, 'T29-1 FAIL: nome vazio deveria ser recusado';
end $$;

-- ============================================================================
-- 2. O vizinho não vê, não edita e não arquiva o catálogo da equipe A.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5118b000-0000-0000-0000-00000000000d","role":"authenticated"}';

do $$ begin
  assert (select count(*) from public.catalog_items where name in ('Usina 5 kWp', 'Limpeza')) = 0,
    'T29-2 FAIL: o vizinho ve o catalogo da equipe A';
end $$;

reset role;
create temp table pg_temp.a_items as select id from public.catalog_items where equipe_id = '5118a000-0000-0000-0000-000000000001';
grant select on pg_temp.a_items to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5118b000-0000-0000-0000-00000000000d","role":"authenticated"}';

do $$
declare v_failed boolean;
begin
  assert public.crm_archive_catalog_items(array(select id from pg_temp.a_items)) = 0,
    'T29-2 FAIL: o vizinho arquivou itens da equipe A';
  v_failed := false;
  begin
    perform public.crm_save_catalog_item(jsonb_build_object('id', (select id from pg_temp.a_items limit 1), 'name', 'Roubado'));
  exception when others then v_failed := sqlerrm like '%catalog_item_not_found%';
  end;
  assert v_failed, 'T29-2 FAIL: o vizinho editou um item da equipe A';
end $$;

-- ============================================================================
-- 3. Arquivar esconde (e só o que é da equipe).
-- ============================================================================
set local request.jwt.claims = '{"sub":"5118b000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$ begin
  assert public.crm_archive_catalog_items(array(select id from pg_temp.a_items)) = 2,
    'T29-3 FAIL: arquivar deveria contar os 2 itens da equipe';
  assert (select count(*) from public.catalog_items where deleted_at is null
            and equipe_id = '5118a000-0000-0000-0000-000000000001') = 0,
    'T29-3 FAIL: item arquivado continua ativo';
  assert public.crm_archive_catalog_items(array(select id from pg_temp.a_items)) = 0,
    'T29-3 FAIL: arquivar de novo nao deveria contar';
end $$;

rollback;
select 'PASS' as result;
