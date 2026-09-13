-- Sprint 11 · Onda 6 · T63 — as conversas do chat são de quem conversou.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w6_copilot_threads.test.sql
--
-- O que este teste protege: o dono lê a própria conversa e as mensagens; o colega
-- da mesma equipe não; o dono apaga a conversa e as mensagens vão junto; ninguém
-- escreve mensagem pela tela (quem escreve é o agente).

begin;

-- @include supabase/migrations/20260914000600_sprint11_w6_copilot_threads.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('513aa000-0000-0000-0000-000000000001', 'S11W6 Conversas', 'x', 'y');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('513ab000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@s11w6-chat.test', 'x', now(), now()),
  ('513ab000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bia@s11w6-chat.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('513ab000-0000-0000-0000-00000000000a', '513ab000-0000-0000-0000-00000000000a', 'ana@s11w6-chat.test', '513aa000-0000-0000-0000-000000000001', 'Ana', 'admin'),
  ('513ab000-0000-0000-0000-00000000000b', '513ab000-0000-0000-0000-00000000000b', 'bia@s11w6-chat.test', '513aa000-0000-0000-0000-000000000001', 'Bia', 'user')
on conflict (id) do update set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

-- O agente escreve.
insert into public.copilot_threads (id, equipe_id, user_id, title) values
  ('513ac000-0000-0000-0000-000000000001', '513aa000-0000-0000-0000-000000000001', '513ab000-0000-0000-0000-00000000000a', 'Como foi hoje?');
insert into public.copilot_messages (thread_id, equipe_id, user_id, role, content) values
  ('513ac000-0000-0000-0000-000000000001', '513aa000-0000-0000-0000-000000000001', '513ab000-0000-0000-0000-00000000000a', 'user', 'Como foi hoje?'),
  ('513ac000-0000-0000-0000-000000000001', '513aa000-0000-0000-0000-000000000001', '513ab000-0000-0000-0000-00000000000a', 'assistant', 'Hoje entraram 12 leads.');

set local role authenticated;

-- A colega da equipe não lê.
set local request.jwt.claims = '{"sub":"513ab000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  assert not exists (select 1 from public.copilot_threads) and not exists (select 1 from public.copilot_messages),
    'T63 FAIL: a colega le a conversa da Ana';
  begin
    insert into public.copilot_messages (thread_id, equipe_id, user_id, role, content) values
      ('513ac000-0000-0000-0000-000000000001', '513aa000-0000-0000-0000-000000000001', '513ab000-0000-0000-0000-00000000000b', 'user', 'oi');
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T63 FAIL: escreveu mensagem pela tela';
end $$;

-- A dona lê e apaga; as mensagens vão junto.
set local request.jwt.claims = '{"sub":"513ab000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.copilot_messages) = 2, 'T63 FAIL: a dona le as mensagens';
  delete from public.copilot_threads where id = '513ac000-0000-0000-0000-000000000001';
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from public.copilot_messages where thread_id = '513ac000-0000-0000-0000-000000000001'),
    'T63 FAIL: apagar a conversa leva as mensagens';
end $$;

rollback;
select 'PASS' as result;
