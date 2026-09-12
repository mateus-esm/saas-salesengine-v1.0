-- Sprint 11 · Onda 4 · T42 — o bucket privado dos artefatos.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w4_artifact_files.test.sql
--
-- O que este teste protege: o bucket `artifacts` é privado; quem é da equipe
-- grava e lê na pasta da equipe; ninguém grava na pasta de outra equipe nem lê o
-- que está lá; o anônimo não lê nada.

begin;

-- @include supabase/migrations/20260912100300_sprint11_w4_artifact_files.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5122a000-0000-0000-0000-000000000001', 'S11W4 Arquivo A', 'x', 'y'),
  ('5122a000-0000-0000-0000-000000000002', 'S11W4 Arquivo B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5122b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w4-arquivo.test',   'x', now(), now()),
  ('5122b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w4-arquivo.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5122b000-0000-0000-0000-00000000000a', '5122b000-0000-0000-0000-00000000000a', 'chefe@s11w4-arquivo.test',   '5122a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5122b000-0000-0000-0000-00000000000d', '5122b000-0000-0000-0000-00000000000d', 'vizinho@s11w4-arquivo.test', '5122a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

do $$
begin
  assert (select not public from storage.buckets where id = 'artifacts'), 'T42-0 FAIL: o bucket artifacts deveria ser privado';
end $$;

-- ============================================================================
-- 1. A equipe grava e lê na própria pasta; não grava na pasta do vizinho.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5122b000-0000-0000-0000-00000000000a","role":"authenticated"}';

insert into storage.objects (bucket_id, name, owner) values
  ('artifacts', '5122a000-0000-0000-0000-000000000001/tabela/registro/proposta.pdf', '5122b000-0000-0000-0000-00000000000a');

do $$
declare v_failed boolean := false;
begin
  assert (select count(*) from storage.objects
           where bucket_id = 'artifacts' and name like '5122a000-0000-0000-0000-000000000001/%') = 1,
    'T42-1 FAIL: a equipe deveria ler o arquivo da propria pasta';
  begin
    insert into storage.objects (bucket_id, name, owner) values
      ('artifacts', '5122a000-0000-0000-0000-000000000002/tabela/registro/intruso.pdf', '5122b000-0000-0000-0000-00000000000a');
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T42-1 FAIL: gravou na pasta da equipe B';
end $$;

-- ============================================================================
-- 2. O vizinho não lê a pasta da equipe A; o anônimo não lê nada.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5122b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
begin
  assert (select count(*) from storage.objects
           where bucket_id = 'artifacts' and name like '5122a000-0000-0000-0000-000000000001/%') = 0,
    'T42-2 FAIL: o vizinho le o arquivo da equipe A';
end $$;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'artifacts') = 0,
    'T42-2 FAIL: o anonimo le arquivos do bucket artifacts';
end $$;

rollback;
select 'PASS' as result;
