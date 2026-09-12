-- Sprint 11 · Onda 5 · T48 — entradas, campanhas e toques.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w5_attribution.test.sql
--
-- O que este teste protege: o payload vira toque (chaves planas, objeto utm e a
-- querystring da página, com acento); a plataforma sai do click ID ou da
-- utm_source; a categoria só quando há prova (fbclid não prova anúncio); a
-- campanha pela chave, sem diferenciar maiúsculas, ou a padrão da entrada; o
-- primeiro toque carimba o lead, o toque de volta não; categoria escrita à mão
-- fica; segredo não é guardado; todo webhook de entrada ganha a sua entrada; o
-- vizinho não grava nem lê; a produção inteira ganhou entrada para os webhooks.

begin;

-- @include supabase/migrations/20260913000100_sprint11_w5_attribution.sql

-- ============================================================================
-- 0. Ensaio sobre a produção: todo webhook de entrada tem a sua entrada.
-- ============================================================================
do $$
begin
  assert not exists (select 1 from public.webhook_configs c
                      where c.inbound_function = 'receive_lead'
                        and not exists (select 1 from public.crm_entries e where e.webhook_config_id = c.id)),
    'T48-0 FAIL: webhook de entrada da producao sem entrada';
end $$;

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5130a000-0000-0000-0000-000000000001', 'S11W5 Origem A', 'x', 'y'),
  ('5130a000-0000-0000-0000-000000000002', 'S11W5 Origem B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5130b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w5-origem.test',   'x', now(), now()),
  ('5130b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w5-origem.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5130b000-0000-0000-0000-00000000000a', '5130b000-0000-0000-0000-00000000000a', 'chefe@s11w5-origem.test',   '5130a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5130b000-0000-0000-0000-00000000000d', '5130b000-0000-0000-0000-00000000000d', 'vizinho@s11w5-origem.test', '5130a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.webhook_configs (id, equipe_id, name, url, trigger_event, inbound_function, field_mappings) values
  ('5130c000-0000-0000-0000-000000000001', '5130a000-0000-0000-0000-000000000001', 'Cadastro - Formulário Meta ADS', 'inbound', 'lead_received', 'receive_lead', '[]'),
  ('5130c000-0000-0000-0000-000000000002', '5130a000-0000-0000-0000-000000000001', 'Landing Page - Usina', 'inbound', 'lead_received', 'receive_lead', '[]'),
  ('5130c000-0000-0000-0000-000000000003', '5130a000-0000-0000-0000-000000000001', 'Saida qualquer', 'https://x.test', 'lead_created', null, '[]');

insert into public.crm_campaigns (id, equipe_id, name, platform, origin_category, match_keys) values
  ('5130d000-0000-0000-0000-000000000001', '5130a000-0000-0000-0000-000000000001', 'Usina Verão', 'meta', 'paid_social',
   array['usina_verao', '23850000000001']),
  ('5130d000-0000-0000-0000-000000000002', '5130a000-0000-0000-0000-000000000001', 'Site institucional', 'site', 'direct_brand', array[]::text[]);

insert into public.leads (id, equipe_id, name, origin_category) values
  ('5130e000-0000-0000-0000-000000000001', '5130a000-0000-0000-0000-000000000001', 'Primeiro', null),
  ('5130e000-0000-0000-0000-000000000002', '5130a000-0000-0000-0000-000000000001', 'Indicado', 'referral'),
  ('5130e000-0000-0000-0000-000000000003', '5130a000-0000-0000-0000-000000000001', 'Sem utm', null);

-- ============================================================================
-- 1. Ler o payload.
-- ============================================================================
do $$
declare f jsonb;
begin
  f := public._crm_touch_fields(jsonb_build_object(
         'utm', jsonb_build_object('source', 'ig', 'medium', 'paid_social'),
         'page_url', 'https://solo.test/lp?utm_campaign=Usina%20Ver%C3%A3o&utm_content=video+2&fbclid=AbC',
         'formName', 'Cadastro Usina', 'ad_id', 120211, 'campaign', jsonb_build_object('x', 1)));
  assert f->>'utm_source' = 'ig' and f->>'utm_medium' = 'paid_social', 'T48-1 FAIL: objeto utm, veio ' || f::text;
  assert f->>'utm_campaign' = 'Usina Verão' and f->>'utm_content' = 'video 2', 'T48-1 FAIL: querystring com acento, veio ' || f::text;
  assert f->>'fbclid' = 'AbC' and f->>'form_name' = 'Cadastro Usina' and f->>'ad_id' = '120211',
    'T48-1 FAIL: click id, formulario e anuncio, veio ' || f::text;
  assert not (f ? 'campaign_name'), 'T48-1 FAIL: objeto no lugar de texto nao e nome de campanha';

  assert public._crm_platform_from('{"gclid":"x"}', 'meta') = 'google', 'T48-1 FAIL: gclid e google';
  assert public._crm_platform_from('{"utm_source":"TikTok_Ads"}', null) = 'tiktok', 'T48-1 FAIL: tiktok';
  assert public._crm_platform_from('{"utm_source":"parceiro_xyz"}', null) = 'outra', 'T48-1 FAIL: utm desconhecida e outra';
  assert public._crm_platform_from('{}', 'site') = 'site', 'T48-1 FAIL: sem prova, a da entrada';

  assert public._crm_category_from('{"fbclid":"x"}', 'meta', null) is null, 'T48-1 FAIL: fbclid sozinho nao prova anuncio';
  assert public._crm_category_from('{"gclid":"x"}', 'google', 'direct_brand') = 'paid_search', 'T48-1 FAIL: gclid e busca paga';
  assert public._crm_category_from('{"utm_medium":"cpc"}', 'meta', null) = 'paid_social', 'T48-1 FAIL: cpc na meta';
  assert public._crm_category_from('{}', null, 'direct_brand') = 'direct_brand', 'T48-1 FAIL: sem prova, a da entrada';
end $$;

-- ============================================================================
-- 2. Webhook de entrada ganha entrada; o nome sugere o carimbo.
-- ============================================================================
do $$
declare e public.crm_entries;
begin
  select * into e from public.crm_entries where webhook_config_id = '5130c000-0000-0000-0000-000000000001';
  assert e.kind = 'webhook' and e.platform = 'meta' and e.origin_category = 'paid_social',
    'T48-2 FAIL: webhook do formulario Meta deveria ganhar entrada meta/social pago';
  assert (select platform from public.crm_entries where webhook_config_id = '5130c000-0000-0000-0000-000000000002') = 'site',
    'T48-2 FAIL: landing page e site';
  assert not exists (select 1 from public.crm_entries where webhook_config_id = '5130c000-0000-0000-0000-000000000003'),
    'T48-2 FAIL: webhook de saida nao e entrada';

  update public.webhook_configs set name = 'Formulário Meta - Usina' where id = '5130c000-0000-0000-0000-000000000001';
  assert (select name from public.crm_entries where webhook_config_id = '5130c000-0000-0000-0000-000000000001') = 'Formulário Meta - Usina',
    'T48-2 FAIL: renomear o webhook deveria renomear a entrada';
end $$;

-- ============================================================================
-- 3. O toque: primeiro carimba o lead; o de volta não.
-- ============================================================================
do $$
declare r jsonb; v_entry uuid; l public.leads; t public.lead_touches;
begin
  select id into v_entry from public.crm_entries where webhook_config_id = '5130c000-0000-0000-0000-000000000001';

  r := public.crm_record_touch('5130e000-0000-0000-0000-000000000001', v_entry, jsonb_build_object(
         'name', 'Primeiro', 'utm_source', 'facebook', 'utm_campaign', 'USINA_VERAO',
         'page_url', 'https://solo.test/lp?utm_medium=cpc', 'apikey', 'segredo', 'X-Token', 'segredo2'));
  assert (r->>'first')::boolean and r->>'platform' = 'meta' and r->>'origin_category' = 'paid_social'
         and r->>'campaign_id' = '5130d000-0000-0000-0000-000000000001',
    'T48-3 FAIL: o primeiro toque, veio ' || r::text;

  select * into l from public.leads where id = '5130e000-0000-0000-0000-000000000001';
  assert l.first_touch_id = (r->>'touch_id')::uuid and l.entry_id = v_entry
         and l.campaign_id = '5130d000-0000-0000-0000-000000000001' and l.origin_platform = 'meta'
         and l.origin_category = 'paid_social' and l.origin_detail = 'Formulário Meta - Usina',
    'T48-3 FAIL: o lead deveria carregar o primeiro toque';

  select * into t from public.lead_touches where id = (r->>'touch_id')::uuid;
  assert t.utm_medium = 'cpc' and t.raw->>'name' = 'Primeiro' and not (t.raw ? 'apikey') and not (t.raw ? 'X-Token'),
    'T48-3 FAIL: o toque guarda o payload sem segredo, veio ' || coalesce(t.raw::text, 'null');

  -- Volta pelo Google com campanha desconhecida: toque novo, o lead fica com o primeiro.
  r := public.crm_record_touch('5130e000-0000-0000-0000-000000000001', v_entry, '{"gclid":"g-1","utm_campaign":"Outra Coisa"}');
  assert not (r->>'first')::boolean and r->>'platform' = 'google' and r->>'origin_category' = 'paid_search'
         and r->>'campaign_id' is null,
    'T48-3 FAIL: a volta pelo google, veio ' || r::text;
  assert (select count(*) from public.lead_touches where lead_id = '5130e000-0000-0000-0000-000000000001') = 2
     and (select first_touch_id from public.leads where id = '5130e000-0000-0000-0000-000000000001') = (
           select id from public.lead_touches where lead_id = '5130e000-0000-0000-0000-000000000001' order by occurred_at limit 1),
    'T48-3 FAIL: o lead deveria ter dois toques e ficar com o primeiro';
  assert (select utm_campaign from public.lead_touches where gclid = 'g-1') = 'Outra Coisa'
     and not exists (select 1 from public.crm_campaigns where equipe_id = '5130a000-0000-0000-0000-000000000001' and name ilike 'outra%'),
    'T48-3 FAIL: UTM desconhecida fica no toque e nao cria campanha';
end $$;

-- ============================================================================
-- 4. Categoria escrita à mão fica; campanha padrão da entrada.
-- ============================================================================
do $$
declare r jsonb; v_lp uuid;
begin
  select id into v_lp from public.crm_entries where webhook_config_id = '5130c000-0000-0000-0000-000000000002';

  r := public.crm_record_touch('5130e000-0000-0000-0000-000000000002', v_lp, '{"utm_source":"instagram","utm_medium":"cpc"}');
  assert (select origin_category from public.leads where id = '5130e000-0000-0000-0000-000000000002') = 'referral'
     and (select origin_platform from public.leads where id = '5130e000-0000-0000-0000-000000000002') = 'meta',
    'T48-4 FAIL: a categoria escrita a mao deveria ficar (a plataforma entra)';

  update public.crm_entries set campaign_id = '5130d000-0000-0000-0000-000000000002' where id = v_lp;
  r := public.crm_record_touch('5130e000-0000-0000-0000-000000000003', v_lp, '{"name":"Sem utm"}');
  assert r->>'campaign_id' = '5130d000-0000-0000-0000-000000000002' and r->>'platform' = 'site'
         and r->>'origin_category' = 'direct_brand',
    'T48-4 FAIL: sem UTM, o carimbo da entrada (campanha padrao), veio ' || r::text;
end $$;

-- ============================================================================
-- 5. Pela tela: o usuário grava na própria equipe (entrada Manual); o vizinho não.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5130b000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare r jsonb;
begin
  insert into public.leads (id, equipe_id, name) values
    ('5130e000-0000-0000-0000-000000000004', '5130a000-0000-0000-0000-000000000001', 'Manual');
  r := public.crm_record_touch('5130e000-0000-0000-0000-000000000004', null,
         '{"utm_campaign":"usina_verao"}');
  assert (select kind from public.crm_entries where id = (r->>'entry_id')::uuid) = 'manual'
         and r->>'campaign_id' = '5130d000-0000-0000-0000-000000000001',
    'T48-5 FAIL: sem entrada, a Manual da equipe; a campanha pela chave, veio ' || r::text;
  assert (select count(*) from public.lead_touches where equipe_id = '5130a000-0000-0000-0000-000000000001') = 5,
    'T48-5 FAIL: a equipe deveria ler os seus 5 toques';
end $$;

set local request.jwt.claims = '{"sub":"5130b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.crm_record_touch('5130e000-0000-0000-0000-000000000001', null, '{}');
  exception when others then v_failed := sqlerrm = 'lead_not_found';
  end;
  assert v_failed, 'T48-5 FAIL: o vizinho gravou toque num lead da equipe A';
  assert (select count(*) from public.lead_touches where equipe_id = '5130a000-0000-0000-0000-000000000001') = 0
     and (select count(*) from public.crm_campaigns where equipe_id = '5130a000-0000-0000-0000-000000000001') = 0
     and (select count(*) from public.crm_entries where equipe_id = '5130a000-0000-0000-0000-000000000001') = 0,
    'T48-5 FAIL: o vizinho le toques, campanhas ou entradas da equipe A';
end $$;

-- ============================================================================
-- 6. Como a edge chama (service_role): a entrada de API e o toque em qualquer equipe;
--    o app não pede a entrada por conta própria.
-- ============================================================================
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare v_entry uuid; r jsonb;
begin
  v_entry := public._crm_entry_for('5130a000-0000-0000-0000-000000000001', 'import');
  assert (select name from public.crm_entries where id = v_entry) = 'Importação / API'
     and public._crm_entry_for('5130a000-0000-0000-0000-000000000001', 'import') = v_entry,
    'T50-6 FAIL: a entrada de API da equipe deveria nascer uma vez';
  insert into public.leads (id, equipe_id, name) values
    ('5130e000-0000-0000-0000-000000000006', '5130a000-0000-0000-0000-000000000001', 'Via API');
  r := public.crm_record_touch('5130e000-0000-0000-0000-000000000006', v_entry, '{"utm_source":"google","utm_medium":"cpc"}');
  assert (r->>'first')::boolean and r->>'origin_category' = 'paid_search' and r->>'platform' = 'google',
    'T50-6 FAIL: o toque pela edge, veio ' || r::text;
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5130b000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  begin
    perform public._crm_entry_for('5130a000-0000-0000-0000-000000000001', 'agent');
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T50-6 FAIL: o app nao deveria criar entradas por conta propria';
end $$;

rollback;
select 'PASS' as result;
