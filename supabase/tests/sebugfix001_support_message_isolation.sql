-- SE-BUGFIX-001 · Bug 1 — prova de isolamento das mensagens de ticket.
--
-- COMO RODAR
--   Execute num banco descartável/staging, com as dependências anteriores à
--   migration aplicadas (é o mesmo modelo dos demais testes em supabase/tests):
--     psql "$DATABASE_URL" -f supabase/tests/sebugfix001_support_message_isolation.sql
--
-- POR QUE ASSIM
--   RLS é avaliada por `auth.uid()`, que lê o claim do JWT da sessão. Num script
--   SQL não há JWT, então o teste troca `request.jwt.claim.sub` e assume o papel
--   `authenticated` — exatamente o que o PostgREST faz por requisição. Assim ele
--   exercita a POLICY de verdade, não um `where` de aplicação: esse é o ponto do
--   bug. As fixtures são revertidas no ROLLBACK do fim.
--
-- O QUE PROVA
--   1. cliente da equipe A lê a mensagem do ticket da equipe A;
--   2. cliente da equipe A NÃO lê a mensagem do ticket da equipe B  <-- o bug;
--   3. cliente da equipe B NÃO lê a mensagem do ticket da equipe A;
--   4. super_admin lê as duas (Master admin);
--   5. owner (dono do time A) lê SÓ a da equipe dele — NÃO é admin do sistema;
--   6. cliente da equipe A NÃO consegue INSERIR mensagem no ticket da equipe B.

begin;

-- @include supabase/migrations/20260927000200_sebugfix001_support_message_isolation.sql

-- ============================================================================
-- Fixtures (UUIDs fixos, como nos demais testes do repo)
--   equipe A 5e000000-…-a1 · equipe B 5e000000-…-b1
--   user A 5e000000-…-0001 · user B …-0002 · super …-0003 · owner …-0004
-- ============================================================================
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5e000000-0000-0000-0000-0000000000a1', 'SE-BUGFIX-001 A', '/crm', '/suporte'),
  ('5e000000-0000-0000-0000-0000000000b1', 'SE-BUGFIX-001 B', '/crm', '/suporte');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sebugfix001-a@example.test', 'x', now(), now()),
  ('5e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sebugfix001-b@example.test', 'x', now(), now()),
  ('5e000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sebugfix001-sa@example.test', 'x', now(), now()),
  ('5e000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sebugfix001-ow@example.test', 'x', now(), now());

-- Colunas conforme a definição real de public.profiles: `email` é UNIQUE NOT NULL
-- e o nome é `nome_completo` (não `nome`). `chat_link_base` virou nullable em
-- 20251226141239, então pode ser omitido.
insert into public.profiles (id, user_id, equipe_id, email, nome_completo, role) values
  ('5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-0000000000a1', 'sebugfix001-a@example.test',  'Cliente A', 'user'),
  ('5e000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-0000000000b1', 'sebugfix001-b@example.test',  'Cliente B', 'user'),
  ('5e000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-0000000000a1', 'sebugfix001-sa@example.test', 'Master',    'super_admin'),
  ('5e000000-0000-0000-0000-000000000004', '5e000000-0000-0000-0000-000000000004', '5e000000-0000-0000-0000-0000000000a1', 'sebugfix001-ow@example.test', 'Owner',     'owner');

-- `has_role` lê public.user_roles (é o que as policies usam), então o papel
-- precisa estar lá, não só em profiles.role.
insert into public.user_roles (user_id, role) values
  ('5e000000-0000-0000-0000-000000000003', 'super_admin'),
  ('5e000000-0000-0000-0000-000000000004', 'owner')
on conflict do nothing;

insert into public.support_tickets (id, equipe_id, created_by, subject, description) values
  ('5e000000-0000-0000-0000-0000000000a2', '5e000000-0000-0000-0000-0000000000a1', '5e000000-0000-0000-0000-000000000001', 'Ticket A', 'assunto A'),
  ('5e000000-0000-0000-0000-0000000000b2', '5e000000-0000-0000-0000-0000000000b1', '5e000000-0000-0000-0000-000000000002', 'Ticket B', 'assunto B');

-- author_kind é preenchido pelo trigger support_message_author, não vai aqui.
insert into public.support_ticket_messages (id, ticket_id, author_id, body) values
  ('5e000000-0000-0000-0000-0000000000a3', '5e000000-0000-0000-0000-0000000000a2', '5e000000-0000-0000-0000-000000000001', 'segredo da equipe A'),
  ('5e000000-0000-0000-0000-0000000000b3', '5e000000-0000-0000-0000-0000000000b2', '5e000000-0000-0000-0000-000000000002', 'segredo da equipe B');

-- Daqui para baixo, tudo roda como um usuário autenticado comum.
set local role authenticated;

-- ============================================================================
-- 1 e 2. cliente da equipe A: enxerga a A, NÃO enxerga a B  (o bug)
-- ============================================================================
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000001', true);
do $$
begin
  assert (select count(*) from public.support_ticket_messages
          where id = '5e000000-0000-0000-0000-0000000000a3') = 1,
    'ASSERT FAILED (1): cliente da equipe A não enxergou a mensagem do próprio ticket';

  assert (select count(*) from public.support_ticket_messages
          where id = '5e000000-0000-0000-0000-0000000000b3') = 0,
    'ASSERT FAILED (2): VAZAMENTO — cliente da equipe A enxergou a mensagem da equipe B';
end $$;

-- ============================================================================
-- 3. cliente da equipe B NÃO enxerga a mensagem da equipe A
-- ============================================================================
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000002', true);
do $$
begin
  assert (select count(*) from public.support_ticket_messages
          where id = '5e000000-0000-0000-0000-0000000000a3') = 0,
    'ASSERT FAILED (3): VAZAMENTO — cliente da equipe B enxergou a mensagem da equipe A';
end $$;

-- ============================================================================
-- 4. super_admin (Master admin) enxerga as duas
-- ============================================================================
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000003', true);
do $$
begin
  assert (select count(*) from public.support_ticket_messages
          where id in ('5e000000-0000-0000-0000-0000000000a3',
                       '5e000000-0000-0000-0000-0000000000b3')) = 2,
    'ASSERT FAILED (4): super_admin não enxergou as duas conversas';
end $$;

-- ============================================================================
-- 5. owner é o DONO DO TIME (equipe A): enxerga só a conversa da própria equipe.
--    NÃO é administrador do sistema — quem atravessa é só o super_admin.
-- ============================================================================
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000004', true);
do $$
begin
  assert (select count(*) from public.support_ticket_messages
          where id = '5e000000-0000-0000-0000-0000000000a3') = 1,
    'ASSERT FAILED (5a): owner não enxergou a conversa da própria equipe';

  assert (select count(*) from public.support_ticket_messages
          where id = '5e000000-0000-0000-0000-0000000000b3') = 0,
    'ASSERT FAILED (5b): VAZAMENTO — owner (dono do time A) enxergou a conversa da equipe B';
end $$;

-- ============================================================================
-- 6. cliente da equipe A NÃO consegue INSERIR no ticket da equipe B
--
-- IMPORTANTE: a lista de colunas usa SÓ as que `authenticated` tem privilégio de
-- INSERT — `grant insert (ticket_id, body)`. Nomear `author_id` faria o Postgres
-- levantar insufficient_privilege pelo CHECK DE PRIVILÉGIO DE COLUNA, antes de
-- avaliar a RLS, e a asserção passaria pelo motivo errado (passaria até com a
-- policy antiga). Deixando `author_id` cair no default (auth.uid()), o único
-- motivo possível para o bloqueio é a WITH CHECK da policy — que é o que se
-- quer provar.
-- ============================================================================
select set_config('request.jwt.claim.sub', '5e000000-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    insert into public.support_ticket_messages (ticket_id, body)
    values ('5e000000-0000-0000-0000-0000000000b2', 'tentativa de invasão');
    raise exception 'ASSERT FAILED (6): cliente da equipe A conseguiu escrever no ticket da equipe B';
  exception when insufficient_privilege then
    null;  -- esperado: a WITH CHECK da policy barrou
  end;

  -- Controle: o MESMO insert no PRÓPRIO ticket TEM de passar. Sem isso, um
  -- bloqueio genérico (ex.: falta de privilégio) passaria por "isolamento".
  insert into public.support_ticket_messages (ticket_id, body)
  values ('5e000000-0000-0000-0000-0000000000a2', 'mensagem legítima da equipe A');
end $$;

reset role;
rollback;