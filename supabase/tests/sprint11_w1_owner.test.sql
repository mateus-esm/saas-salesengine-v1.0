-- Sprint 11 · T2 — o negócio tem responsável.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w1_owner.test.sql
--
-- Roda contra a produção dentro de BEGIN … ROLLBACK: a migration é incluída na
-- própria transação, as fixtures idem, e nada sobra.

begin;

-- @include supabase/migrations/20260910000100_sprint11_opportunity_owner.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5110a000-0000-0000-0000-000000000001', 'S11 Dono A', 'x', 'y'),
  ('5110a000-0000-0000-0000-000000000002', 'S11 Dono B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5110b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono-a@s11-owner.test',     'x', now(), now()),
  ('5110b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-a@s11-owner.test', 'x', now(), now()),
  ('5110b000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dono-b@s11-owner.test',     'x', now(), now());

-- profiles.id é o id do auth.users em toda a base. Um trigger em auth.users pode
-- já ter criado as linhas; o upsert só as prende à equipe certa.
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5110b000-0000-0000-0000-00000000000a', '5110b000-0000-0000-0000-00000000000a', 'dono-a@s11-owner.test',     '5110a000-0000-0000-0000-000000000001', 'Dono A',     'admin'),
  ('5110b000-0000-0000-0000-00000000000b', '5110b000-0000-0000-0000-00000000000b', 'vendedor-a@s11-owner.test', '5110a000-0000-0000-0000-000000000001', 'Vendedor A', 'user'),
  ('5110b000-0000-0000-0000-00000000000c', '5110b000-0000-0000-0000-00000000000c', 'dono-b@s11-owner.test',     '5110a000-0000-0000-0000-000000000002', 'Dono B',     'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id,
      nome_completo = excluded.nome_completo,
      role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('5110c000-0000-0000-0000-000000000001', '5110a000-0000-0000-0000-000000000001', 'Comercial S11');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5110d000-0000-0000-0000-000000000001', '5110a000-0000-0000-0000-000000000001', '5110c000-0000-0000-0000-000000000001', 'Novo', 0, 'open');

insert into public.leads (id, equipe_id, name, responsible_id) values
  ('5110e000-0000-0000-0000-000000000001', '5110a000-0000-0000-0000-000000000001', 'Lead com dono', '5110b000-0000-0000-0000-00000000000b'),
  ('5110e000-0000-0000-0000-000000000002', '5110a000-0000-0000-0000-000000000001', 'Lead sem dono', null);

-- ============================================================================
-- 1. Negócio novo herda o responsável do contato.
-- ============================================================================
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('5110f000-0000-0000-0000-000000000001', '5110a000-0000-0000-0000-000000000001', '5110e000-0000-0000-0000-000000000001', '5110c000-0000-0000-0000-000000000001', '5110d000-0000-0000-0000-000000000001');

do $$ begin
  assert (select owner_id from public.opportunities where id = '5110f000-0000-0000-0000-000000000001')
         = '5110b000-0000-0000-0000-00000000000b',
    'T2-1 FAIL: o negocio nao herdou o responsavel do contato';
end $$;

-- ============================================================================
-- 2. Responsável explícito é mantido.
-- ============================================================================
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id) values
  ('5110f000-0000-0000-0000-000000000002', '5110a000-0000-0000-0000-000000000001', '5110e000-0000-0000-0000-000000000001', '5110c000-0000-0000-0000-000000000001', '5110d000-0000-0000-0000-000000000001', '5110b000-0000-0000-0000-00000000000a');

do $$ begin
  assert (select owner_id from public.opportunities where id = '5110f000-0000-0000-0000-000000000002')
         = '5110b000-0000-0000-0000-00000000000a',
    'T2-2 FAIL: o responsavel explicito foi sobrescrito';
end $$;

-- ============================================================================
-- 3. Contato sem responsável → negócio sem responsável.
-- ============================================================================
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('5110f000-0000-0000-0000-000000000003', '5110a000-0000-0000-0000-000000000001', '5110e000-0000-0000-0000-000000000002', '5110c000-0000-0000-0000-000000000001', '5110d000-0000-0000-0000-000000000001');

do $$ begin
  assert (select owner_id from public.opportunities where id = '5110f000-0000-0000-0000-000000000003') is null,
    'T2-3 FAIL: inventou um responsavel para contato sem dono';
end $$;

-- ============================================================================
-- 4. Responsável de outra equipe é recusado — no insert e no update.
-- ============================================================================
do $$
declare v_refused boolean := false;
begin
  begin
    insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id) values
      ('5110f000-0000-0000-0000-000000000004', '5110a000-0000-0000-0000-000000000001', '5110e000-0000-0000-0000-000000000002', '5110c000-0000-0000-0000-000000000001', '5110d000-0000-0000-0000-000000000001', '5110b000-0000-0000-0000-00000000000c');
  exception when others then
    v_refused := sqlerrm like 'owner_not_in_team%';
  end;
  assert v_refused, 'T2-4 FAIL: aceitou responsavel de outra equipe no insert';
end $$;

do $$
declare v_refused boolean := false;
begin
  begin
    update public.opportunities
       set owner_id = '5110b000-0000-0000-0000-00000000000c'
     where id = '5110f000-0000-0000-0000-000000000003';
  exception when others then
    v_refused := sqlerrm like 'owner_not_in_team%';
  end;
  assert v_refused, 'T2-4 FAIL: aceitou responsavel de outra equipe no update';
end $$;

-- ============================================================================
-- 5. Apagar o profile zera o responsável sem apagar o negócio.
-- ============================================================================
delete from public.profiles where id = '5110b000-0000-0000-0000-00000000000a';

do $$ begin
  assert exists (select 1 from public.opportunities where id = '5110f000-0000-0000-0000-000000000002'),
    'T2-5 FAIL: apagar o profile apagou o negocio';
  assert (select owner_id from public.opportunities where id = '5110f000-0000-0000-0000-000000000002') is null,
    'T2-5 FAIL: o negocio ficou apontando para um profile apagado';
end $$;

-- ============================================================================
-- 6. crm_team_members(): o vendedor vê a própria equipe, e só ela.
--    (Por último: troca o papel da sessão para authenticated.)
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5110b000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$ begin
  assert exists (select 1 from public.crm_team_members() where id = '5110b000-0000-0000-0000-00000000000b'),
    'T2-6 FAIL: o vendedor nao se ve na propria equipe';
  assert not exists (select 1 from public.crm_team_members() where id = '5110b000-0000-0000-0000-00000000000c'),
    'T2-6 FAIL: o vendedor ve gente de outra equipe';
  assert (select count(*) from public.crm_team_members()) = 1,
    'T2-6 FAIL: esperado 1 membro depois de apagar o Dono A, veio ' || (select count(*) from public.crm_team_members());
end $$;

rollback;
select 'PASS' as result;
