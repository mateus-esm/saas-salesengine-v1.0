-- Sprint 11 · Onda 3 · T30 — os itens do negócio.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_items.test.sql
--
-- O que este teste protege: com itens, o valor do negócio é a soma deles (e o
-- banco não deixa o valor discordar); preço fixo vem do catálogo, não do pedido;
-- a lista troca por diferença (a linha que ficou mantém o id — a receita do T31
-- lança por linha); o item guarda a recorrência do momento em que entrou; sem
-- itens, o valor volta a ser livre; nada atravessa a equipe.

begin;

-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5119a000-0000-0000-0000-000000000001', 'S11W3 Itens A', 'x', 'y'),
  ('5119a000-0000-0000-0000-000000000002', 'S11W3 Itens B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5119b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w3-itens.test',   'x', now(), now()),
  ('5119b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w3-itens.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5119b000-0000-0000-0000-00000000000a', '5119b000-0000-0000-0000-00000000000a', 'chefe@s11w3-itens.test',   '5119a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5119b000-0000-0000-0000-00000000000d', '5119b000-0000-0000-0000-00000000000d', 'vizinho@s11w3-itens.test', '5119a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('5119c000-0000-0000-0000-000000000001', '5119a000-0000-0000-0000-000000000001', 'Clinica S11W3 Itens'),
  ('5119c000-0000-0000-0000-000000000009', '5119a000-0000-0000-0000-000000000002', 'Vizinho S11W3 Itens');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5119d000-0000-0000-0000-000000000001', '5119a000-0000-0000-0000-000000000001', '5119c000-0000-0000-0000-000000000001', 'Novo',    1, 'open'),
  ('5119d000-0000-0000-0000-000000000009', '5119a000-0000-0000-0000-000000000002', '5119c000-0000-0000-0000-000000000009', 'Novo',    1, 'open');

insert into public.catalog_items (id, equipe_id, name, kind, price, price_mode, recurrence_every, recurrence_unit, renew_days_before) values
  ('5119ca00-0000-0000-0000-000000000001', '5119a000-0000-0000-0000-000000000001', 'Limpeza',    'service', 250,   'fixed',      6,    'month', 15),
  ('5119ca00-0000-0000-0000-000000000002', '5119a000-0000-0000-0000-000000000001', 'Clareamento','service', 1200,  'negotiable', null, null,    0),
  ('5119ca00-0000-0000-0000-000000000003', '5119a000-0000-0000-0000-000000000001', 'Antigo',     'product', 10,    'fixed',      null, null,    0),
  ('5119ca00-0000-0000-0000-000000000009', '5119a000-0000-0000-0000-000000000002', 'Do vizinho', 'product', 99,    'fixed',      null, null,    0);
update public.catalog_items set deleted_at = now() where id = '5119ca00-0000-0000-0000-000000000003';

insert into public.leads (id, equipe_id, name) values
  ('5119e000-0000-0000-0000-000000000001', '5119a000-0000-0000-0000-000000000001', 'Paciente'),
  ('5119e000-0000-0000-0000-000000000009', '5119a000-0000-0000-0000-000000000002', 'Do vizinho');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value) values
  ('5119f000-0000-0000-0000-000000000001', '5119a000-0000-0000-0000-000000000001', '5119e000-0000-0000-0000-000000000001', '5119c000-0000-0000-0000-000000000001', '5119d000-0000-0000-0000-000000000001', 777),
  ('5119f000-0000-0000-0000-000000000009', '5119a000-0000-0000-0000-000000000002', '5119e000-0000-0000-0000-000000000009', '5119c000-0000-0000-0000-000000000009', '5119d000-0000-0000-0000-000000000009', 50);

set local role authenticated;
set local request.jwt.claims = '{"sub":"5119b000-0000-0000-0000-00000000000a","role":"authenticated"}';

create function pg_temp.value_of(p uuid) returns numeric language sql stable as $$
  select value from public.opportunities where id = p;
$$;

-- ============================================================================
-- 1. Itens do catálogo e linha avulsa: o valor é a soma.
-- ============================================================================
do $$
declare v jsonb; v_limpeza record;
begin
  v := public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000001', jsonb_build_array(
         jsonb_build_object('catalog_item_id', '5119ca00-0000-0000-0000-000000000001', 'quantity', 2, 'unit_price', 1),
         jsonb_build_object('catalog_item_id', '5119ca00-0000-0000-0000-000000000002'),
         jsonb_build_object('name', 'Raio-x', 'quantity', 1, 'unit_price', 80)));
  assert (v->>'value')::numeric = 1780, 'T30-1 FAIL: o verbo deveria devolver 2x250 + 1200 + 80 = 1780, devolveu ' || (v->>'value');
  assert pg_temp.value_of('5119f000-0000-0000-0000-000000000001') = 1780, 'T30-1 FAIL: o valor do negocio nao virou a soma';
  assert jsonb_array_length(v->'items') = 3, 'T30-1 FAIL: deveria devolver 3 itens';

  select * into v_limpeza from public.opportunity_items
   where opportunity_id = '5119f000-0000-0000-0000-000000000001' and catalog_item_id = '5119ca00-0000-0000-0000-000000000001';
  assert v_limpeza.unit_price = 250, 'T30-1 FAIL: preco fixo deveria vir do catalogo (250), veio ' || v_limpeza.unit_price;
  assert v_limpeza.name = 'Limpeza', 'T30-1 FAIL: o nome do item do catalogo nao foi copiado';
  assert v_limpeza.recurrence_every = 6 and v_limpeza.recurrence_unit = 'month' and v_limpeza.renew_days_before = 15,
    'T30-1 FAIL: a recorrencia do catalogo nao foi copiada para o item';
  assert (select unit_price from public.opportunity_items
           where opportunity_id = '5119f000-0000-0000-0000-000000000001'
             and catalog_item_id = '5119ca00-0000-0000-0000-000000000002') = 1200,
    'T30-1 FAIL: negociavel sem preco mandado deveria usar a sugestao do catalogo';
end $$;

-- ============================================================================
-- 2. Trocar a lista por diferença: a linha que ficou mantém o id.
-- ============================================================================
do $$
declare v jsonb; v_keep uuid; v_before_ids uuid[];
begin
  select id into v_keep from public.opportunity_items
   where opportunity_id = '5119f000-0000-0000-0000-000000000001' and catalog_item_id = '5119ca00-0000-0000-0000-000000000002';

  -- Fica o clareamento (agora negociado a 1000); sai a limpeza e o raio-x.
  v := public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000001', jsonb_build_array(
         jsonb_build_object('id', v_keep, 'quantity', 1, 'unit_price', 1000)));
  assert (select count(*) from public.opportunity_items
           where opportunity_id = '5119f000-0000-0000-0000-000000000001' and deleted_at is null) = 1,
    'T30-2 FAIL: deveria sobrar 1 item';
  assert exists (select 1 from public.opportunity_items where id = v_keep and deleted_at is null and unit_price = 1000),
    'T30-2 FAIL: o item que ficou deveria manter o id e o preco novo';
  assert pg_temp.value_of('5119f000-0000-0000-0000-000000000001') = 1000, 'T30-2 FAIL: valor deveria ser 1000';
end $$;

-- ============================================================================
-- 3. Com itens, escrever o valor direto não o faz discordar da soma.
-- ============================================================================
do $$ begin
  update public.opportunities set value = 5 where id = '5119f000-0000-0000-0000-000000000001';
  assert pg_temp.value_of('5119f000-0000-0000-0000-000000000001') = 1000,
    'T30-3 FAIL: com itens, o valor deveria continuar a soma (1000), ficou ' || pg_temp.value_of('5119f000-0000-0000-0000-000000000001');
end $$;

-- ============================================================================
-- 4. Sem itens, o valor volta a ser livre.
-- ============================================================================
do $$ begin
  perform public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000001', '[]'::jsonb);
  update public.opportunities set value = 3333 where id = '5119f000-0000-0000-0000-000000000001';
  assert pg_temp.value_of('5119f000-0000-0000-0000-000000000001') = 3333, 'T30-4 FAIL: sem itens o valor deveria ser livre';
end $$;

-- ============================================================================
-- 5. O que não pode: item arquivado novo, item do vizinho, negócio do vizinho.
-- ============================================================================
do $$
declare v_failed boolean;
begin
  v_failed := false;
  begin
    perform public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000001',
      jsonb_build_array(jsonb_build_object('catalog_item_id', '5119ca00-0000-0000-0000-000000000003')));
  exception when others then v_failed := sqlerrm like '%catalog_item_not_found%';
  end;
  assert v_failed, 'T30-5 FAIL: item arquivado nao deveria entrar num negocio';

  v_failed := false;
  begin
    perform public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000001',
      jsonb_build_array(jsonb_build_object('catalog_item_id', '5119ca00-0000-0000-0000-000000000009')));
  exception when others then v_failed := sqlerrm like '%catalog_item_not_found%';
  end;
  assert v_failed, 'T30-5 FAIL: item do catalogo do vizinho nao deveria entrar';

  v_failed := false;
  begin
    perform public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000009',
      jsonb_build_array(jsonb_build_object('name', 'Invasao', 'unit_price', 1)));
  exception when others then v_failed := sqlerrm like '%opportunity_not_found%';
  end;
  assert v_failed, 'T30-5 FAIL: nao deveria mexer nos itens do negocio do vizinho';

  v_failed := false;
  begin
    perform public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000001',
      jsonb_build_array(jsonb_build_object('name', '  ', 'unit_price', 1)));
  exception when others then v_failed := true;
  end;
  assert v_failed, 'T30-5 FAIL: linha avulsa sem nome deveria ser recusada';
end $$;

-- ============================================================================
-- 6. Um item que o negócio já tinha continua quando o catálogo o arquiva.
-- ============================================================================
do $$
declare v jsonb; v_id uuid;
begin
  v := public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000001', jsonb_build_array(
         jsonb_build_object('catalog_item_id', '5119ca00-0000-0000-0000-000000000001')));
  select id into v_id from public.opportunity_items
   where opportunity_id = '5119f000-0000-0000-0000-000000000001' and deleted_at is null;
  perform public.crm_archive_catalog_items(array['5119ca00-0000-0000-0000-000000000001']::uuid[]);
  -- Salvar a lista com a linha que já existia (pelo id) continua valendo.
  v := public.crm_set_opportunity_items('5119f000-0000-0000-0000-000000000001', jsonb_build_array(
         jsonb_build_object('id', v_id, 'quantity', 3)));
  assert pg_temp.value_of('5119f000-0000-0000-0000-000000000001') = 750,
    'T30-6 FAIL: o item ja no negocio deveria continuar com o catalogo arquivado (3 x 250)';
end $$;

-- ============================================================================
-- 7. O vizinho não lê os itens da equipe A.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5119b000-0000-0000-0000-00000000000d","role":"authenticated"}';

do $$ begin
  assert (select count(*) from public.opportunity_items where opportunity_id = '5119f000-0000-0000-0000-000000000001') = 0,
    'T30-7 FAIL: o vizinho le os itens da equipe A';
end $$;

rollback;
select 'PASS' as result;
