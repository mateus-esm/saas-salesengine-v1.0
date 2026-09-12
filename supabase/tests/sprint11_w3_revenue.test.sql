-- Sprint 11 · Onda 3 · T31 — ganho → receita (o livro-razão).
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w3_revenue.test.sql
--
-- O que este teste protege: o ganho lança a receita (um lançamento por item, ou
-- um pelo valor), com o responsável do momento; reabrir estorna no período do
-- ganho; ganhar de novo lança de novo; mudar valor ou itens de um negócio ganho
-- lança o ajuste; apagar um negócio ganho estorna; negócio aberto não lança; o
-- livro-razão só aceita escrita do banco; o vizinho não lê.

begin;

-- @include supabase/migrations/20260911000300_sprint11_w2_owner_events.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('511aa000-0000-0000-0000-000000000001', 'S11W3 Receita A', 'x', 'y'),
  ('511aa000-0000-0000-0000-000000000002', 'S11W3 Receita B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('511ab000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w3-receita.test',   'x', now(), now()),
  ('511ab000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@s11w3-receita.test',       'x', now(), now()),
  ('511ab000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@s11w3-receita.test',       'x', now(), now()),
  ('511ab000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w3-receita.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('511ab000-0000-0000-0000-00000000000a', '511ab000-0000-0000-0000-00000000000a', 'chefe@s11w3-receita.test',   '511aa000-0000-0000-0000-000000000001', 'Chefe',      'admin'),
  ('511ab000-0000-0000-0000-00000000000b', '511ab000-0000-0000-0000-00000000000b', 'b@s11w3-receita.test',       '511aa000-0000-0000-0000-000000000001', 'Vendedor B', 'user'),
  ('511ab000-0000-0000-0000-00000000000c', '511ab000-0000-0000-0000-00000000000c', 'c@s11w3-receita.test',       '511aa000-0000-0000-0000-000000000001', 'Vendedor C', 'user'),
  ('511ab000-0000-0000-0000-00000000000d', '511ab000-0000-0000-0000-00000000000d', 'vizinho@s11w3-receita.test', '511aa000-0000-0000-0000-000000000002', 'Vizinho',    'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('511ac000-0000-0000-0000-000000000001', '511aa000-0000-0000-0000-000000000001', 'Receita S11W3');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('511ad000-0000-0000-0000-000000000001', '511aa000-0000-0000-0000-000000000001', '511ac000-0000-0000-0000-000000000001', 'Novo',    1, 'open'),
  ('511ad000-0000-0000-0000-000000000002', '511aa000-0000-0000-0000-000000000001', '511ac000-0000-0000-0000-000000000001', 'Ganho',   2, 'won'),
  ('511ad000-0000-0000-0000-000000000003', '511aa000-0000-0000-0000-000000000001', '511ac000-0000-0000-0000-000000000001', 'Perdido', 3, 'lost');

insert into public.catalog_items (id, equipe_id, name, kind, price, price_mode) values
  ('511aca00-0000-0000-0000-000000000001', '511aa000-0000-0000-0000-000000000001', 'Módulo',   'product', 800,  'fixed'),
  ('511aca00-0000-0000-0000-000000000002', '511aa000-0000-0000-0000-000000000001', 'Inversor', 'product', 3000, 'fixed');

insert into public.leads (id, equipe_id, name) values
  ('511ae000-0000-0000-0000-000000000001', '511aa000-0000-0000-0000-000000000001', 'Cliente Solar');

-- D1: com itens, do B. D2: sem itens, valor 5000, do B.
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, owner_id) values
  ('511af000-0000-0000-0000-000000000001', '511aa000-0000-0000-0000-000000000001', '511ae000-0000-0000-0000-000000000001', '511ac000-0000-0000-0000-000000000001', '511ad000-0000-0000-0000-000000000001', null, '511ab000-0000-0000-0000-00000000000b'),
  ('511af000-0000-0000-0000-000000000002', '511aa000-0000-0000-0000-000000000001', '511ae000-0000-0000-0000-000000000001', '511ac000-0000-0000-0000-000000000001', '511ad000-0000-0000-0000-000000000001', 5000, '511ab000-0000-0000-0000-00000000000b');

set local role authenticated;
set local request.jwt.claims = '{"sub":"511ab000-0000-0000-0000-00000000000a","role":"authenticated"}';

create function pg_temp.net(p uuid) returns numeric language sql stable as $$
  select coalesce(sum(amount), 0) from public.revenue_entries where opportunity_id = p;
$$;
create function pg_temp.entries(p uuid, p_kind text) returns int language sql stable as $$
  select count(*)::int from public.revenue_entries where opportunity_id = p and kind = p_kind;
$$;

-- Itens do D1: 10 módulos + 1 inversor = 11.000.
select public.crm_set_opportunity_items('511af000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('catalog_item_id', '511aca00-0000-0000-0000-000000000001', 'quantity', 10),
  jsonb_build_object('catalog_item_id', '511aca00-0000-0000-0000-000000000002', 'quantity', 1)));
set constraints all immediate;

-- ============================================================================
-- 1. Negócio aberto não lança nada.
-- ============================================================================
do $$ begin
  assert (select count(*) from public.revenue_entries where opportunity_id::text like '511af000%') = 0,
    'T31-1 FAIL: negocio aberto lancou receita';
end $$;

-- ============================================================================
-- 2. O ganho lança: um por item (D1), um pelo valor (D2); o dono do momento.
-- ============================================================================
do $$
declare v_closed timestamptz;
begin
  update public.opportunities set stage_id = '511ad000-0000-0000-0000-000000000002'
   where id in ('511af000-0000-0000-0000-000000000001', '511af000-0000-0000-0000-000000000002');
  set constraints all immediate;

  assert pg_temp.entries('511af000-0000-0000-0000-000000000001', 'booking') = 2,
    'T31-2 FAIL: D1 com 2 itens deveria ter 2 lancamentos, tem ' || pg_temp.entries('511af000-0000-0000-0000-000000000001', 'booking');
  assert pg_temp.net('511af000-0000-0000-0000-000000000001') = 11000, 'T31-2 FAIL: receita do D1 deveria ser 11000';
  assert (select amount from public.revenue_entries
           where opportunity_id = '511af000-0000-0000-0000-000000000001'
             and catalog_item_id = '511aca00-0000-0000-0000-000000000002') = 3000,
    'T31-2 FAIL: o lancamento do inversor deveria ser 3000';
  assert pg_temp.entries('511af000-0000-0000-0000-000000000002', 'booking') = 1
         and pg_temp.net('511af000-0000-0000-0000-000000000002') = 5000,
    'T31-2 FAIL: D2 sem itens deveria ter 1 lancamento de 5000';

  select closed_at into v_closed from public.opportunities where id = '511af000-0000-0000-0000-000000000002';
  assert (select bool_and(recognized_at = v_closed and owner_id = '511ab000-0000-0000-0000-00000000000b')
            from public.revenue_entries where opportunity_id = '511af000-0000-0000-0000-000000000002'),
    'T31-2 FAIL: o lancamento deveria ter a data do ganho e o dono do momento (B)';
end $$;

-- ============================================================================
-- 3. Trocar o dono depois do ganho não muda de quem é a receita.
-- ============================================================================
do $$ begin
  update public.opportunities set owner_id = '511ab000-0000-0000-0000-00000000000c'
   where id = '511af000-0000-0000-0000-000000000002';
  update public.opportunities set value = 6000 where id = '511af000-0000-0000-0000-000000000002';
  assert pg_temp.entries('511af000-0000-0000-0000-000000000002', 'adjustment') = 1
         and pg_temp.net('511af000-0000-0000-0000-000000000002') = 6000,
    'T31-3 FAIL: mudar o valor de um ganho deveria lancar 1 ajuste e a receita virar 6000';
  assert not exists (select 1 from public.revenue_entries
                      where opportunity_id = '511af000-0000-0000-0000-000000000002'
                        and owner_id is distinct from '511ab000-0000-0000-0000-00000000000b'),
    'T31-3 FAIL: o ajuste de um ganho do B deveria continuar sendo do B';
  assert (select count(distinct recognized_at) from public.revenue_entries
           where opportunity_id = '511af000-0000-0000-0000-000000000002') = 1,
    'T31-3 FAIL: o ajuste deveria ficar no periodo do ganho';
end $$;

-- ============================================================================
-- 4. Reabrir estorna no período do ganho; ganhar de novo lança de novo.
-- ============================================================================
do $$
declare v_first timestamptz;
begin
  select recognized_at into v_first from public.revenue_entries
   where opportunity_id = '511af000-0000-0000-0000-000000000002' and kind = 'booking';

  update public.opportunities set stage_id = '511ad000-0000-0000-0000-000000000001'
   where id = '511af000-0000-0000-0000-000000000002';
  assert pg_temp.net('511af000-0000-0000-0000-000000000002') = 0, 'T31-4 FAIL: reabrir deveria zerar a receita';
  assert pg_temp.entries('511af000-0000-0000-0000-000000000002', 'reversal') = 1, 'T31-4 FAIL: reabrir deveria lancar 1 estorno';
  assert (select recognized_at from public.revenue_entries
           where opportunity_id = '511af000-0000-0000-0000-000000000002' and kind = 'reversal') = v_first,
    'T31-4 FAIL: o estorno deveria ficar no periodo do ganho original';

  update public.opportunities set stage_id = '511ad000-0000-0000-0000-000000000002'
   where id = '511af000-0000-0000-0000-000000000002';
  assert pg_temp.net('511af000-0000-0000-0000-000000000002') = 6000, 'T31-4 FAIL: ganhar de novo deveria lancar de novo';
  assert pg_temp.entries('511af000-0000-0000-0000-000000000002', 'booking') = 2, 'T31-4 FAIL: o novo ganho e um novo lancamento';
  -- O novo ganho é do dono de agora (C).
  assert (select owner_id from public.revenue_entries
           where opportunity_id = '511af000-0000-0000-0000-000000000002' and kind = 'booking'
           order by created_at desc limit 1) = '511ab000-0000-0000-0000-00000000000c',
    'T31-4 FAIL: o novo ganho deveria ser do dono do momento (C)';
end $$;

-- ============================================================================
-- 5. Mudar os itens de um negócio ganho ajusta a receita por linha.
-- ============================================================================
do $$ begin
  -- Sai o inversor, os módulos passam a 12.
  perform public.crm_set_opportunity_items('511af000-0000-0000-0000-000000000001', (
    select jsonb_agg(jsonb_build_object('id', i.id, 'quantity', 12))
      from public.opportunity_items i
     where i.opportunity_id = '511af000-0000-0000-0000-000000000001'
       and i.catalog_item_id = '511aca00-0000-0000-0000-000000000001' and i.deleted_at is null));
  set constraints all immediate;
  assert pg_temp.net('511af000-0000-0000-0000-000000000001') = 9600,
    'T31-5 FAIL: 12 modulos = 9600, a receita ficou ' || pg_temp.net('511af000-0000-0000-0000-000000000001');
  assert (select coalesce(sum(amount), 0) from public.revenue_entries
           where opportunity_id = '511af000-0000-0000-0000-000000000001'
             and catalog_item_id = '511aca00-0000-0000-0000-000000000002') = 0,
    'T31-5 FAIL: o inversor que saiu deveria ter sido estornado';
end $$;

-- ============================================================================
-- 6. Apagar um negócio ganho estorna; perder não lança.
-- ============================================================================
do $$ begin
  update public.opportunities set deleted_at = now() where id = '511af000-0000-0000-0000-000000000001';
  assert pg_temp.net('511af000-0000-0000-0000-000000000001') = 0, 'T31-6 FAIL: apagar um ganho deveria estornar';

  update public.opportunities set stage_id = '511ad000-0000-0000-0000-000000000003'
   where id = '511af000-0000-0000-0000-000000000002';
  assert pg_temp.net('511af000-0000-0000-0000-000000000002') = 0, 'T31-6 FAIL: ganho que virou perda deveria ficar sem receita';
end $$;

-- ============================================================================
-- 7. O livro-razão é do banco: o app não escreve; o vizinho não lê.
-- ============================================================================
do $$
declare v_failed boolean := false;
begin
  begin
    insert into public.revenue_entries (equipe_id, opportunity_id, line_key, amount, kind, recognized_at)
    values ('511aa000-0000-0000-0000-000000000001', '511af000-0000-0000-0000-000000000002', 'value', 1, 'booking', now());
  exception when others then v_failed := true;
  end;
  assert v_failed, 'T31-7 FAIL: o app nao deveria escrever direto no livro-razao';
end $$;

set local request.jwt.claims = '{"sub":"511ab000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.revenue_entries where opportunity_id::text like '511af000%') = 0,
    'T31-7 FAIL: o vizinho le a receita da equipe A';
end $$;

rollback;
select 'PASS' as result;
