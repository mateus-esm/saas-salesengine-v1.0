-- Sprint 11 · Onda 5 · T52 — os verbos de Campanhas e Entradas.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w5_campaigns.test.sql
--
-- O que este teste protege: a campanha salva com chaves limpas, sem chave em duas
-- campanhas e sem dono de fora; o investimento entra e sai; a lista conta leads e
-- investimento; UTM sem campanha aparece, e ligá-la reclassifica o que já chegou
-- (toque e lead) e o que vier; o carimbo da entrada muda sem mexer no nome e na
-- linha de um webhook; o vizinho não vê nem mexe.

begin;

-- @include supabase/migrations/20260913000100_sprint11_w5_attribution.sql
-- @include supabase/migrations/20260913000200_sprint11_w5_campaigns.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5132a000-0000-0000-0000-000000000001', 'S11W5 Campanha A', 'x', 'y'),
  ('5132a000-0000-0000-0000-000000000002', 'S11W5 Campanha B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5132b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w5-camp.test',   'x', now(), now()),
  ('5132b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vend@s11w5-camp.test',    'x', now(), now()),
  ('5132b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w5-camp.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5132b000-0000-0000-0000-00000000000a', '5132b000-0000-0000-0000-00000000000a', 'chefe@s11w5-camp.test',   '5132a000-0000-0000-0000-000000000001', 'Chefe',    'admin'),
  ('5132b000-0000-0000-0000-00000000000b', '5132b000-0000-0000-0000-00000000000b', 'vend@s11w5-camp.test',    '5132a000-0000-0000-0000-000000000001', 'Vendedor', 'user'),
  ('5132b000-0000-0000-0000-00000000000d', '5132b000-0000-0000-0000-00000000000d', 'vizinho@s11w5-camp.test', '5132a000-0000-0000-0000-000000000002', 'Vizinho',  'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('5132c000-0000-0000-0000-000000000001', '5132a000-0000-0000-0000-000000000001', 'Usinas');

insert into public.webhook_configs (id, equipe_id, name, url, trigger_event, inbound_function, field_mappings, pipeline_id) values
  ('5132c000-0000-0000-0000-0000000000f1', '5132a000-0000-0000-0000-000000000001', 'Formulário Meta', 'inbound', 'lead_received',
   'receive_lead', '[]', '5132c000-0000-0000-0000-000000000001');

insert into public.leads (id, equipe_id, name) values
  ('5132e000-0000-0000-0000-000000000001', '5132a000-0000-0000-0000-000000000001', 'Um'),
  ('5132e000-0000-0000-0000-000000000002', '5132a000-0000-0000-0000-000000000001', 'Dois'),
  ('5132e000-0000-0000-0000-000000000003', '5132a000-0000-0000-0000-000000000001', 'Tres');

-- Dois leads chegam pela UTM "Black_Friday" que ainda não tem campanha.
do $$
declare v_entry uuid := (select id from public.crm_entries where webhook_config_id = '5132c000-0000-0000-0000-0000000000f1');
begin
  perform public.crm_record_touch('5132e000-0000-0000-0000-000000000001', v_entry, '{"utm_campaign":"Black_Friday"}');
  perform public.crm_record_touch('5132e000-0000-0000-0000-000000000002', v_entry, '{"utm_campaign":"black_friday "}');
end $$;

create temp table pg_temp.t52 (k text primary key, val text);
grant all on pg_temp.t52 to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5132b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Salvar campanha: chaves limpas, sem chave repetida entre campanhas, dono da equipe.
-- ============================================================================
do $$
declare c jsonb; v_failed boolean;
begin
  c := public.crm_save_campaign(jsonb_build_object(
         'name', ' Usina Verão ', 'platform', 'meta', 'origin_category', 'paid_social',
         'owner_id', '5132b000-0000-0000-0000-00000000000b', 'goal_leads', 100, 'starts_on', '2026-09-01',
         'match_keys', jsonb_build_array('  Usina_Verao ', 'usina_verao', '', '23850000000001')));
  assert c->>'name' = 'Usina Verão' and c->'match_keys' = '["23850000000001", "usina_verao"]'::jsonb,
    'T52-1 FAIL: nome e chaves limpos, veio ' || c::text;
  insert into pg_temp.t52 values ('verao', c->>'id');

  v_failed := false;
  begin
    perform public.crm_save_campaign(jsonb_build_object('name', 'Outra', 'match_keys', jsonb_build_array('USINA_VERAO')));
  exception when others then v_failed := sqlerrm = 'match_key_taken:usina_verao';
  end;
  assert v_failed, 'T52-1 FAIL: uma chave nao cai em duas campanhas';

  v_failed := false;
  begin
    perform public.crm_save_campaign(jsonb_build_object('name', 'Com dono de fora', 'owner_id', '5132b000-0000-0000-0000-00000000000d'));
  exception when others then v_failed := sqlerrm = 'owner_not_in_team';
  end;
  assert v_failed, 'T52-1 FAIL: dono de outra equipe';

  c := public.crm_save_campaign(jsonb_build_object('id', (select val from pg_temp.t52 where k = 'verao'),
         'name', 'Usina Verão 2026', 'platform', 'meta', 'match_keys', jsonb_build_array('usina_verao')));
  assert c->>'name' = 'Usina Verão 2026' and c->'match_keys' = '["usina_verao"]'::jsonb and c->>'status' = 'active',
    'T52-1 FAIL: editar mantem a mesma campanha';
end $$;

-- ============================================================================
-- 2. Investimento e a lista.
-- ============================================================================
do $$
declare s jsonb; l jsonb; v_c uuid := (select val from pg_temp.t52 where k = 'verao')::uuid;
begin
  s := public.crm_campaign_spend_add(v_c, '2026-09-05', 1500.555, 'Meta setembro');
  perform public.crm_campaign_spend_add(v_c, '2026-09-10', 500, null);
  perform public.crm_campaign_spend_delete((s->>'id')::uuid);
  perform public.crm_campaign_spend_add(v_c, '2026-09-05', 1500.50, null);

  l := public.crm_campaign_list();
  assert (select (x->>'spend')::numeric from jsonb_array_elements(l) x where x->>'id' = v_c::text) = 2000.50,
    'T52-2 FAIL: o investimento da campanha, veio ' || l::text;
end $$;

-- ============================================================================
-- 3. UTM sem campanha: aparece; ligar reclassifica o que chegou e o que vier.
-- ============================================================================
do $$
declare u jsonb; r jsonb; v_c uuid := (select val from pg_temp.t52 where k = 'verao')::uuid;
begin
  u := public.crm_unmatched_utms();
  assert (select (x->>'touches')::int from jsonb_array_elements(u) x where x->>'value' = 'black_friday') = 2,
    'T52-3 FAIL: a UTM sem campanha deveria aparecer com 2 toques, veio ' || u::text;

  r := public.crm_link_utm(v_c, 'Black_Friday');
  assert (r->>'touches')::int = 2 and (r->>'leads')::int = 2, 'T52-3 FAIL: ligar deveria levar 2 toques e 2 leads, veio ' || r::text;
  assert (select campaign_id from public.leads where id = '5132e000-0000-0000-0000-000000000002') = v_c,
    'T52-3 FAIL: o lead do primeiro toque deveria cair na campanha';
  assert not exists (select 1 from jsonb_array_elements(public.crm_unmatched_utms()) x where x->>'value' = 'black_friday'),
    'T52-3 FAIL: ligada, a UTM sai da lista';
  assert (select match_keys from public.crm_campaigns where id = v_c) @> array['black_friday'],
    'T52-3 FAIL: a chave entra na campanha';
end $$;

reset role;
do $$
begin
  assert (public.crm_record_touch('5132e000-0000-0000-0000-000000000003',
            (select id from public.crm_entries where webhook_config_id = '5132c000-0000-0000-0000-0000000000f1'),
            '{"utm_campaign":"BLACK_FRIDAY"}')->>'campaign_id') = (select val from pg_temp.t52 where k = 'verao'),
    'T52-3 FAIL: o que vier com a UTM ligada cai na campanha';
end $$;

-- ============================================================================
-- 4. O carimbo da entrada; o nome e a linha do webhook ficam.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5132b000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare e jsonb; l jsonb; v_entry uuid := (select id from public.crm_entries where webhook_config_id = '5132c000-0000-0000-0000-0000000000f1');
begin
  e := public.crm_save_entry(v_entry, jsonb_build_object(
         'name', 'Nome novo', 'pipeline_id', null, 'platform', 'meta', 'origin_category', 'paid_social',
         'campaign_id', (select val from pg_temp.t52 where k = 'verao'),
         'owner_rule', jsonb_build_object('mode', 'fixed', 'user_ids', jsonb_build_array('5132b000-0000-0000-0000-00000000000b'))));
  assert e->>'name' = 'Formulário Meta' and e->>'campaign_id' = (select val from pg_temp.t52 where k = 'verao')
         and e->'owner_rule'->>'mode' = 'fixed' and not (e ? 'owner_cursor'),
    'T52-4 FAIL: o carimbo muda, o nome do webhook fica, veio ' || e::text;

  l := public.crm_entry_list();
  assert (select x->>'pipeline_name' from jsonb_array_elements(l) x where x->>'id' = v_entry::text) = 'Usinas'
     and (select (x->>'leads')::int from jsonb_array_elements(l) x where x->>'id' = v_entry::text) = 3,
    'T52-4 FAIL: a lista traz a linha do webhook e os leads da entrada, veio ' || l::text;
end $$;

-- ============================================================================
-- 5. O vizinho não vê nem mexe.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5132b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean;
begin
  assert public.crm_campaign_list() = '[]'::jsonb and public.crm_entry_list() = '[]'::jsonb
     and public.crm_unmatched_utms() = '[]'::jsonb,
    'T52-5 FAIL: o vizinho ve campanhas, entradas ou UTMs da equipe A';

  v_failed := false;
  begin
    perform public.crm_save_entry((select id from public.crm_entries where webhook_config_id = '5132c000-0000-0000-0000-0000000000f1'),
                                  '{"platform":"google"}');
  exception when others then v_failed := sqlerrm = 'entry_not_found';
  end;
  assert v_failed, 'T52-5 FAIL: o vizinho mexeu na entrada da equipe A';

  v_failed := false;
  begin
    perform public.crm_link_utm((select val from pg_temp.t52 where k = 'verao')::uuid, 'x');
  exception when others then v_failed := sqlerrm = 'campaign_not_found';
  end;
  assert v_failed, 'T52-5 FAIL: o vizinho ligou UTM na campanha da equipe A';
end $$;

rollback;
select 'PASS' as result;
