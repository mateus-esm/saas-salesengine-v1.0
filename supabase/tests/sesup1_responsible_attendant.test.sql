-- Sprint Suporte 1 · #8/#11 — crm_set_responsible / crm_set_attendant.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sesup1_responsible_attendant.test.sql
-- (BEGIN…ROLLBACK; a migration é recriada dentro da transação. Não executado pelo
--  implementador: a regra da sprint proíbe escrita em produção.)
--
-- O que protege:
--   1. lead + negócios ABERTOS trocam de dono juntos; o ganho mantém o dono
--   2. devolve opportunities_updated (usado no toast) e grava opportunity_owner_history
--   3. repetir é idempotente (0 negócios); null remove
--   4. usuário de outra equipe → owner_not_in_team; lead de outra equipe → lead_not_found
--   5. crm_set_attendant só mexe em conversations.responsible_id (lead/negócio intactos)
--   6. atendente de outra equipe → owner_not_in_team; conversa de outra equipe → conversation_not_found

begin;
-- @include supabase/migrations/20261015000200_sesup1_responsible_attendant.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5e600000-0000-0000-0000-00000000000a', 'RespA', 'x', 'y'),
  ('5e600000-0000-0000-0000-00000000000b', 'RespB', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5e6b0000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a1@sesup1-resp.test', 'x', now(), now()),
  ('5e6b0000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a2@sesup1-resp.test', 'x', now(), now()),
  ('5e6b0000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b1@sesup1-resp.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5e6b0000-0000-0000-0000-0000000000a1', '5e6b0000-0000-0000-0000-0000000000a1', 'a1@sesup1-resp.test', '5e600000-0000-0000-0000-00000000000a', 'A1', 'user'),
  ('5e6b0000-0000-0000-0000-0000000000a2', '5e6b0000-0000-0000-0000-0000000000a2', 'a2@sesup1-resp.test', '5e600000-0000-0000-0000-00000000000a', 'A2', 'user'),
  ('5e6b0000-0000-0000-0000-0000000000b1', '5e6b0000-0000-0000-0000-0000000000b1', 'b1@sesup1-resp.test', '5e600000-0000-0000-0000-00000000000b', 'B1', 'user')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role;

insert into public.pipelines (id, equipe_id, name, loss_reasons) values
  ('5e6c0000-0000-0000-0000-000000000001', '5e600000-0000-0000-0000-00000000000a', 'P1', '[]'::jsonb),
  ('5e6c0000-0000-0000-0000-000000000002', '5e600000-0000-0000-0000-00000000000a', 'P2', '[]'::jsonb);
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5e6d0000-0000-0000-0000-000000000011', '5e600000-0000-0000-0000-00000000000a', '5e6c0000-0000-0000-0000-000000000001', 'Aberta', 0, 'open'),
  ('5e6d0000-0000-0000-0000-000000000012', '5e600000-0000-0000-0000-00000000000a', '5e6c0000-0000-0000-0000-000000000001', 'Ganha',  1, 'won'),
  ('5e6d0000-0000-0000-0000-000000000021', '5e600000-0000-0000-0000-00000000000a', '5e6c0000-0000-0000-0000-000000000002', 'Aberta', 0, 'open');

insert into public.leads (id, equipe_id, name) values
  ('5e6e0000-0000-0000-0000-000000000001', '5e600000-0000-0000-0000-00000000000a', 'Lead 1');

-- dois abertos (dono A1 e sem dono) + um ganho (dono A1)
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id) values
  ('5e6f0000-0000-0000-0000-000000000001', '5e600000-0000-0000-0000-00000000000a', '5e6e0000-0000-0000-0000-000000000001', '5e6c0000-0000-0000-0000-000000000001', '5e6d0000-0000-0000-0000-000000000011', '5e6b0000-0000-0000-0000-0000000000a1'),
  ('5e6f0000-0000-0000-0000-000000000002', '5e600000-0000-0000-0000-00000000000a', '5e6e0000-0000-0000-0000-000000000001', '5e6c0000-0000-0000-0000-000000000002', '5e6d0000-0000-0000-0000-000000000021', null),
  ('5e6f0000-0000-0000-0000-000000000003', '5e600000-0000-0000-0000-00000000000a', '5e6e0000-0000-0000-0000-000000000001', '5e6c0000-0000-0000-0000-000000000001', '5e6d0000-0000-0000-0000-000000000012', '5e6b0000-0000-0000-0000-0000000000a1');

insert into public.conversations (id, lead_id, equipe_id, channel, status) values
  ('5e600c00-0000-0000-0000-000000000001', '5e6e0000-0000-0000-0000-000000000001', '5e600000-0000-0000-0000-00000000000a', 'whatsapp', 'active');

set local role authenticated;
set local request.jwt.claims = '{"sub":"5e6b0000-0000-0000-0000-0000000000a1","role":"authenticated"}';

do $$
declare
  v_r jsonb;
  v_hist int;
begin
  -- 1/2. troca coerente
  v_r := public.crm_set_responsible('5e6e0000-0000-0000-0000-000000000001', '5e6b0000-0000-0000-0000-0000000000a2');
  assert (v_r->>'opportunities_updated')::int = 2, 'dois abertos mudam: ' || v_r::text;
  assert (select responsible_id from public.leads where id = '5e6e0000-0000-0000-0000-000000000001') = '5e6b0000-0000-0000-0000-0000000000a2', 'lead';
  assert (select count(*) from public.opportunities where lead_id = '5e6e0000-0000-0000-0000-000000000001' and status = 'open' and owner_id = '5e6b0000-0000-0000-0000-0000000000a2') = 2, 'abertos com A2';
  assert (select owner_id from public.opportunities where id = '5e6f0000-0000-0000-0000-000000000003') = '5e6b0000-0000-0000-0000-0000000000a1', 'ganho mantém o dono';
  select count(*) into v_hist from public.opportunity_owner_history
   where to_owner = '5e6b0000-0000-0000-0000-0000000000a2' and opportunity_id in ('5e6f0000-0000-0000-0000-000000000001','5e6f0000-0000-0000-0000-000000000002');
  assert v_hist = 2, 'histórico de dono gravado pelo gatilho';

  -- 3. idempotente e remoção
  v_r := public.crm_set_responsible('5e6e0000-0000-0000-0000-000000000001', '5e6b0000-0000-0000-0000-0000000000a2');
  assert (v_r->>'opportunities_updated')::int = 0, 'repetir não muda nada';
  v_r := public.crm_set_responsible('5e6e0000-0000-0000-0000-000000000001', null);
  assert (v_r->>'opportunities_updated')::int = 2, 'remover zera os abertos';
  assert (select responsible_id from public.leads where id = '5e6e0000-0000-0000-0000-000000000001') is null, 'lead sem responsável';

  -- 4. equipe
  begin
    perform public.crm_set_responsible('5e6e0000-0000-0000-0000-000000000001', '5e6b0000-0000-0000-0000-0000000000b1');
    raise exception 'FALHA: usuário de outra equipe aceito';
  exception when sqlstate '23514' then assert sqlerrm like 'owner_not_in_team%', sqlerrm;
  end;

  -- 5. atendente: só a conversa
  perform public.crm_set_attendant('5e600c00-0000-0000-0000-000000000001', '5e6b0000-0000-0000-0000-0000000000a2');
  assert (select responsible_id from public.conversations where id = '5e600c00-0000-0000-0000-000000000001') = '5e6b0000-0000-0000-0000-0000000000a2', 'atendente gravado';
  assert (select responsible_id from public.leads where id = '5e6e0000-0000-0000-0000-000000000001') is null, 'lead intacto';
  assert (select count(*) from public.opportunities where lead_id = '5e6e0000-0000-0000-0000-000000000001' and status = 'open' and owner_id is not null) = 0, 'negócios intactos';

  -- 6. atendente de outra equipe
  begin
    perform public.crm_set_attendant('5e600c00-0000-0000-0000-000000000001', '5e6b0000-0000-0000-0000-0000000000b1');
    raise exception 'FALHA: atendente de outra equipe aceito';
  exception when sqlstate '23514' then null;
  end;
end $$;

-- Equipe B: não enxerga lead nem conversa da A.
set local request.jwt.claims = '{"sub":"5e6b0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
begin
  begin
    perform public.crm_set_responsible('5e6e0000-0000-0000-0000-000000000001', '5e6b0000-0000-0000-0000-0000000000b1');
    raise exception 'FALHA: lead de outra equipe alterado';
  exception when sqlstate 'P0002' then assert sqlerrm like 'lead_not_found%', sqlerrm;
  end;
  begin
    perform public.crm_set_attendant('5e600c00-0000-0000-0000-000000000001', '5e6b0000-0000-0000-0000-0000000000b1');
    raise exception 'FALHA: conversa de outra equipe alterada';
  exception when sqlstate 'P0002' then assert sqlerrm like 'conversation_not_found%', sqlerrm;
  end;
end $$;

rollback;
