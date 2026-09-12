-- Sprint 11 · Onda 5 · T49 — responsável pela entrada (fixo, rodízio).
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w5_owner_rule.test.sql
--
-- O que este teste protege: o rodízio anda um passo por negócio e pula quem não é
-- da equipe; o fixo pega sempre o mesmo, e ninguém quando ele sai da equipe; o
-- negócio que já tem dono fica com ele; sem regra, ninguém; a regra salva sai
-- limpa (sem estranho, sem repetido, sem lixo).

begin;

-- @include supabase/migrations/20260913000100_sprint11_w5_attribution.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5131a000-0000-0000-0000-000000000001', 'S11W5 Dono A', 'x', 'y'),
  ('5131a000-0000-0000-0000-000000000002', 'S11W5 Dono B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5131b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana@s11w5-dono.test',  'x', now(), now()),
  ('5131b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bia@s11w5-dono.test',  'x', now(), now()),
  ('5131b000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caio@s11w5-dono.test', 'x', now(), now()),
  ('5131b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viz@s11w5-dono.test',  'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5131b000-0000-0000-0000-00000000000a', '5131b000-0000-0000-0000-00000000000a', 'ana@s11w5-dono.test',  '5131a000-0000-0000-0000-000000000001', 'Ana',  'user'),
  ('5131b000-0000-0000-0000-00000000000b', '5131b000-0000-0000-0000-00000000000b', 'bia@s11w5-dono.test',  '5131a000-0000-0000-0000-000000000001', 'Bia',  'user'),
  ('5131b000-0000-0000-0000-00000000000c', '5131b000-0000-0000-0000-00000000000c', 'caio@s11w5-dono.test', '5131a000-0000-0000-0000-000000000001', 'Caio', 'user'),
  ('5131b000-0000-0000-0000-00000000000d', '5131b000-0000-0000-0000-00000000000d', 'viz@s11w5-dono.test',  '5131a000-0000-0000-0000-000000000002', 'Viz',  'user')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('5131c000-0000-0000-0000-000000000001', '5131a000-0000-0000-0000-000000000001', 'Dono A');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5131d000-0000-0000-0000-000000000001', '5131a000-0000-0000-0000-000000000001', '5131c000-0000-0000-0000-000000000001', 'Novo', 0, 'open');

-- Rodízio: Ana, o vizinho (não é da equipe) e Bia. Fixo: Caio. Nenhum.
insert into public.crm_entries (id, equipe_id, kind, name, owner_rule) values
  ('5131e000-0000-0000-0000-0000000000a1', '5131a000-0000-0000-0000-000000000001', 'webhook', 'Rodizio',
   jsonb_build_object('mode', 'round_robin', 'user_ids', jsonb_build_array(
     '5131b000-0000-0000-0000-00000000000a', '5131b000-0000-0000-0000-00000000000d', '5131b000-0000-0000-0000-00000000000b'))),
  ('5131e000-0000-0000-0000-0000000000a2', '5131a000-0000-0000-0000-000000000001', 'webhook', 'Fixo',
   jsonb_build_object('mode', 'fixed', 'user_ids', jsonb_build_array('5131b000-0000-0000-0000-00000000000c'))),
  ('5131e000-0000-0000-0000-0000000000a3', '5131a000-0000-0000-0000-000000000001', 'webhook', 'Nenhum', '{"mode":"none"}');

-- Seis leads, cada um com um negócio sem dono.
insert into public.leads (id, equipe_id, name)
select ('5131f000-0000-0000-0000-00000000000' || n)::uuid, '5131a000-0000-0000-0000-000000000001', 'Lead ' || n
  from generate_series(1, 7) n;
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id)
select ('51310000-0000-0000-0000-00000000000' || n)::uuid, '5131a000-0000-0000-0000-000000000001',
       ('5131f000-0000-0000-0000-00000000000' || n)::uuid, '5131c000-0000-0000-0000-000000000001',
       '5131d000-0000-0000-0000-000000000001', null
  from generate_series(1, 7) n;
update public.opportunities set owner_id = null
 where id in (select ('51310000-0000-0000-0000-00000000000' || n)::uuid from generate_series(1, 7) n);

-- ============================================================================
-- 1. Rodízio: Ana, Bia, Ana, Bia — o vizinho nunca.
-- ============================================================================
do $$
declare v_owners uuid[] := '{}'; r jsonb; n int;
begin
  for n in 1..4 loop
    r := public.crm_record_touch(('5131f000-0000-0000-0000-00000000000' || n)::uuid,
                                 '5131e000-0000-0000-0000-0000000000a1', '{}',
                                 ('51310000-0000-0000-0000-00000000000' || n)::uuid);
    v_owners := v_owners || (select owner_id from public.opportunities where id = ('51310000-0000-0000-0000-00000000000' || n)::uuid);
  end loop;
  assert v_owners = array['5131b000-0000-0000-0000-00000000000a', '5131b000-0000-0000-0000-00000000000b',
                          '5131b000-0000-0000-0000-00000000000a', '5131b000-0000-0000-0000-00000000000b']::uuid[],
    'T49-1 FAIL: o rodizio deveria alternar Ana e Bia (sem o vizinho), veio ' || v_owners::text;
end $$;

-- ============================================================================
-- 2. Fixo; quem saiu da equipe; negócio com dono; sem regra.
-- ============================================================================
do $$
declare r jsonb;
begin
  r := public.crm_record_touch('5131f000-0000-0000-0000-000000000005', '5131e000-0000-0000-0000-0000000000a2', '{}',
                               '51310000-0000-0000-0000-000000000005');
  assert r->>'owner_id' = '5131b000-0000-0000-0000-00000000000c'
     and (select owner_id from public.opportunities where id = '51310000-0000-0000-0000-000000000005') = '5131b000-0000-0000-0000-00000000000c',
    'T49-2 FAIL: o fixo deveria ser o Caio';

  -- O negócio já tem dono: fica.
  r := public.crm_record_touch('5131f000-0000-0000-0000-000000000005', '5131e000-0000-0000-0000-0000000000a1', '{}',
                               '51310000-0000-0000-0000-000000000005');
  assert (select owner_id from public.opportunities where id = '51310000-0000-0000-0000-000000000005') = '5131b000-0000-0000-0000-00000000000c'
     and r->>'owner_id' is null,
    'T49-2 FAIL: negocio com dono deveria ficar com ele';

  -- Caio sai da equipe: o fixo não tem mais ninguém.
  update public.profiles set equipe_id = '5131a000-0000-0000-0000-000000000002' where id = '5131b000-0000-0000-0000-00000000000c';
  r := public.crm_record_touch('5131f000-0000-0000-0000-000000000006', '5131e000-0000-0000-0000-0000000000a2', '{}',
                               '51310000-0000-0000-0000-000000000006');
  assert (select owner_id from public.opportunities where id = '51310000-0000-0000-0000-000000000006') is null,
    'T49-2 FAIL: quem saiu da equipe nao recebe negocio';

  r := public.crm_record_touch('5131f000-0000-0000-0000-000000000007', '5131e000-0000-0000-0000-0000000000a3', '{}',
                               '51310000-0000-0000-0000-000000000007');
  assert (select owner_id from public.opportunities where id = '51310000-0000-0000-0000-000000000007') is null,
    'T49-2 FAIL: sem regra, sem dono';
end $$;

-- ============================================================================
-- 3. A regra salva sai limpa.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public._crm_normalize_owner_rule('5131a000-0000-0000-0000-000000000001', jsonb_build_object(
         'mode', 'round_robin',
         'user_ids', jsonb_build_array('5131b000-0000-0000-0000-00000000000b', 'lixo',
                                       '5131b000-0000-0000-0000-00000000000d', '5131b000-0000-0000-0000-00000000000a',
                                       '5131b000-0000-0000-0000-00000000000b')));
  assert v = jsonb_build_object('mode', 'round_robin', 'user_ids',
               jsonb_build_array('5131b000-0000-0000-0000-00000000000b', '5131b000-0000-0000-0000-00000000000a')),
    'T49-3 FAIL: sem estranho, sem repetido, na ordem, veio ' || v::text;
  assert public._crm_normalize_owner_rule('5131a000-0000-0000-0000-000000000001', '{"mode":"sorteio"}') = '{"mode":"none"}'::jsonb,
    'T49-3 FAIL: modo desconhecido vira nenhum';
end $$;

rollback;
select 'PASS' as result;
