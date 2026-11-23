-- Sprint 16 — Growth: criativos, anúncios, a ligação do toque, o Windsor e os experimentos.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint16_growth.test.sql
--
-- O que este teste protege:
--   1. código do criativo validado e único (P000-V0)
--   2. toque de WhatsApp antes do anúncio existir fica solto; o Windsor cria o anúncio
--      ("a completar"), o criativo pelo código do nome, as métricas — e liga o toque
--   3. escolher a campanha do anúncio põe o ID da plataforma nas chaves e o gasto
--      da API vira crm_campaign_spend (meta_api); o manual não é tocado
--   4. toque novo pelo ID do anúncio → campanha, criativo, paid_social
--   5. mensagem padrão do WhatsApp casa o anúncio e não fica no raw
--   6. formulário pela Importação com o nome do anúncio → Social Pago, não api_import
--   7. nome repetido ou clique para WhatsApp não casam por nome
--   8. experimento: salvar, números ao vivo, apagar; relatório por criativo

begin;

-- @include supabase/migrations/20261123000100_sprint16_growth.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('51600000-0000-0000-0000-000000000001', 'S16 Growth', 'x', 'y');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5160b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@s16-growth.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5160b000-0000-0000-0000-00000000000a', '5160b000-0000-0000-0000-00000000000a', 'a@s16-growth.test', '51600000-0000-0000-0000-000000000001', 'Growth A', 'admin')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role;
insert into public.user_roles (user_id, role) values ('5160b000-0000-0000-0000-00000000000a', 'admin');

insert into public.crm_campaigns (id, equipe_id, name, platform, origin_category) values
  ('5160c000-0000-0000-0000-000000000001', '51600000-0000-0000-0000-000000000001', '2026-11 | MSG | Engenharia', 'meta', 'paid_social');
insert into public.crm_campaign_spend (equipe_id, campaign_id, spent_on, amount, source) values
  ('51600000-0000-0000-0000-000000000001', '5160c000-0000-0000-0000-000000000001', current_date - 1, 7, 'manual');

insert into public.leads (id, equipe_id, name) values
  ('5160e000-0000-0000-0000-000000000001', '51600000-0000-0000-0000-000000000001', 'Antes do anúncio'),
  ('5160e000-0000-0000-0000-000000000002', '51600000-0000-0000-0000-000000000001', 'Pelo ID'),
  ('5160e000-0000-0000-0000-000000000003', '51600000-0000-0000-0000-000000000001', 'Pela mensagem'),
  ('5160e000-0000-0000-0000-000000000004', '51600000-0000-0000-0000-000000000001', 'Formulário'),
  ('5160e000-0000-0000-0000-000000000005', '51600000-0000-0000-0000-000000000001', 'Clique com título');

-- 2a. O toque chega com o ID de um anúncio que o Rev ainda não conhece.
do $$
declare r jsonb;
begin
  r := public.crm_record_touch('5160e000-0000-0000-0000-000000000001',
         public._crm_entry_for('51600000-0000-0000-0000-000000000001', 'agent'),
         '{"ctwa_clid": "c-1", "ad_id": "120211", "ad_name": "Converse conosco", "utm_source": "facebook", "utm_medium": "paid_social"}');
  assert r->>'ad_ref' is null, 'sem anúncio cadastrado, sem ligação';
  assert r->>'campaign_id' is null, 'e sem campanha';
end $$;

-- ------------------------------------------------------------ 1. criativos --
set local role authenticated;
set local request.jwt.claims = '{"sub":"5160b000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
begin
  begin
    perform public.crm_save_creative('{"code": "carmona"}');
    assert false, 'código fora do padrão devia ser recusado';
  exception when others then
    assert sqlerrm = 'invalid_creative_code', 'erro esperado invalid_creative_code, veio ' || sqlerrm;
  end;
  perform public.crm_save_creative('{"code": "p001-v1", "title": "Institucional"}');
  assert exists (select 1 from public.crm_creatives where code = 'P001-V1' and equipe_id = '51600000-0000-0000-0000-000000000001'), 'código normalizado em maiúsculas';
  begin
    perform public.crm_save_creative('{"code": "P001-V1"}');
    assert false, 'código repetido devia ser recusado';
  exception when others then
    assert sqlerrm like 'creative_code_taken:%', 'erro esperado creative_code_taken';
  end;
end $$;

-- ------------------------------------------------------ 2b. o Windsor puxa --
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare r jsonb; v_ad public.crm_ads;
begin
  r := public._crm_windsor_ingest('51600000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('platform', 'meta', 'day', current_date - 1, 'external_ad_id', '120211',
                       'ad_name', 'P002-V3 | Carmona ponta a ponta | reels 52s', 'campaign_external_id', '120210',
                       'campaign_name', '2026-11 | MSG | Engenharia', 'spend', 50.5, 'impressions', 10000,
                       'reach', 4000, 'video_3s', 3000, 'thruplays', 900, 'conversations', 12),
    jsonb_build_object('platform', 'meta', 'day', current_date, 'external_ad_id', '120211',
                       'ad_name', 'P002-V3 | Carmona ponta a ponta | reels 52s', 'spend', 20),
    jsonb_build_object('platform', 'meta', 'day', current_date, 'external_ad_id', '', 'spend', 99)));
  assert (r->>'new_ads')::int = 1, 'um anúncio novo, veio ' || r::text;
  assert (r->>'metric_rows')::int = 2, 'duas linhas de métrica';
  assert (r->>'linked_touches')::int = 1, 'o toque que chegou antes foi ligado';

  select * into v_ad from public.crm_ads where external_ad_id = '120211' and equipe_id = '51600000-0000-0000-0000-000000000001';
  assert v_ad.source = 'windsor' and v_ad.needs_review, 'nasce a completar';
  assert v_ad.creative_id = (select id from public.crm_creatives where code = 'P002-V3' and equipe_id = '51600000-0000-0000-0000-000000000001'), 'criativo pelo código do nome';
  assert (select title from public.crm_creatives where code = 'P002-V3' and equipe_id = '51600000-0000-0000-0000-000000000001') = 'Carmona ponta a ponta', 'título do segundo pedaço do nome';
  assert v_ad.campaign_id is null, 'a campanha ainda não tem a chave';

  assert (select platform = 'meta' and origin_category = 'paid_social' and creative_id = v_ad.creative_id
            from public.lead_touches where lead_id = '5160e000-0000-0000-0000-000000000001'), 'toque religado com criativo';
  assert not exists (select 1 from public.crm_campaign_spend where source = 'meta_api'
                      and equipe_id = '51600000-0000-0000-0000-000000000001'), 'sem campanha, sem gasto de API';

  -- De novo: idempotente, atualiza o valor.
  r := public._crm_windsor_ingest('51600000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('platform', 'meta', 'day', current_date, 'external_ad_id', '120211', 'spend', 25)));
  assert (r->>'new_ads')::int = 0, 'nada novo na segunda vez';
  assert (select spend from public.crm_ad_metrics m join public.crm_ads a on a.id = m.ad_id
           where a.external_ad_id = '120211' and m.day = current_date) = 25, 'o dia é reescrito';
end $$;

-- --------------------------------------- 3. o formulário completa o anúncio --
set local role authenticated;
set local request.jwt.claims = '{"sub":"5160b000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare v_ad uuid := (select id from public.crm_ads where external_ad_id = '120211' and equipe_id = '51600000-0000-0000-0000-000000000001');
begin
  perform public.crm_save_ad(jsonb_build_object(
    'id', v_ad, 'platform', 'meta', 'external_ad_id', '120211',
    'ad_name', 'P002-V3 | Carmona ponta a ponta | reels 52s', 'campaign_external_id', '120210',
    'campaign_id', '5160c000-0000-0000-0000-000000000001', 'destination', 'whatsapp',
    'prefill_message', 'Oi! Vi o projeto de engenharia da Solo',
    'creative_id', (select id from public.crm_creatives where code = 'P002-V3' and equipe_id = '51600000-0000-0000-0000-000000000001')));
  assert not (select needs_review from public.crm_ads where id = v_ad), 'completo, sai de "a completar"';
  assert exists (select 1 from public.crm_campaigns where id = '5160c000-0000-0000-0000-000000000001' and '120210' = any (match_keys)),
    'o ID da campanha virou chave';
  assert (select sum(amount) from public.crm_campaign_spend where campaign_id = '5160c000-0000-0000-0000-000000000001'
           and source = 'meta_api') = 75.5, 'gasto da API por campanha (50,5 + 25)';
  assert (select sum(amount) from public.crm_campaign_spend where campaign_id = '5160c000-0000-0000-0000-000000000001'
           and source = 'manual') = 7, 'o manual fica';
  assert (select campaign_id from public.leads where id = '5160e000-0000-0000-0000-000000000001')
           = '5160c000-0000-0000-0000-000000000001', 'o lead antigo ganhou a campanha';

  begin
    perform public.crm_save_ad('{"platform": "meta", "ad_name": "Outro", "prefill_message": "oi!  vi o projeto de engenharia da solo"}');
    assert false, 'mensagem padrão repetida devia ser recusada';
  exception when others then
    assert sqlerrm = 'prefill_taken', 'erro esperado prefill_taken, veio ' || sqlerrm;
  end;

  -- Um anúncio cadastrado à mão (sem Windsor) para o formulário.
  perform public.crm_save_ad('{"platform": "meta", "ad_name": "AGO02", "campaign_name": "NOVO TESTE JANEIRO", "destination": "form"}');
  -- Dois com o mesmo nome: o nome não decide.
  perform public.crm_save_ad('{"platform": "meta", "ad_name": "Duplicado"}');
  perform public.crm_save_ad('{"platform": "meta", "ad_name": "Duplicado"}');
end $$;

-- ------------------------------------------------- 4–7. os toques novos --
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare r jsonb; v_raw jsonb;
begin
  r := public.crm_record_touch('5160e000-0000-0000-0000-000000000002',
         public._crm_entry_for('51600000-0000-0000-0000-000000000001', 'agent'),
         '{"ctwa_clid": "c-2", "ad_id": "120211", "ad_name": "Converse conosco"}');
  assert r->>'campaign_id' = '5160c000-0000-0000-0000-000000000001', '4. campanha do anúncio';
  assert r->>'creative_id' = (select id::text from public.crm_creatives where code = 'P002-V3' and equipe_id = '51600000-0000-0000-0000-000000000001'), '4. criativo do anúncio';
  assert r->>'origin_category' = 'paid_social', '4. pago';

  r := public.crm_record_touch('5160e000-0000-0000-0000-000000000003',
         public._crm_entry_for('51600000-0000-0000-0000-000000000001', 'agent'),
         '{"channel": "whatsapp", "_first_text": "Oi!   vi o projeto de engenharia da Solo. Quero orçamento"}');
  assert r->>'ad_ref' = (select id::text from public.crm_ads where external_ad_id = '120211' and equipe_id = '51600000-0000-0000-0000-000000000001'), '5. mensagem padrão casa';
  select raw into v_raw from public.lead_touches where id = (r->>'touch_id')::uuid;
  assert not (v_raw ? '_first_text'), '5. o texto não fica guardado';

  r := public.crm_record_touch('5160e000-0000-0000-0000-000000000004', null,
         '{"_entry_kind": "import", "ad_name": "AGO02", "campaign_name": "NOVO TESTE JANEIRO", "form_name": "FORMULÁRIO SOLON"}');
  assert r->>'ad_ref' = (select id::text from public.crm_ads where ad_name = 'AGO02' and equipe_id = '51600000-0000-0000-0000-000000000001'), '6. formulário casa pelo nome';
  assert r->>'origin_category' = 'paid_social' and r->>'platform' = 'meta', '6. Social Pago · Meta';
  assert (select origin_category from public.leads where id = '5160e000-0000-0000-0000-000000000004') = 'paid_social',
    '6. o lead não fica em api_import';

  r := public.crm_record_touch('5160e000-0000-0000-0000-000000000005',
         public._crm_entry_for('51600000-0000-0000-0000-000000000001', 'agent'),
         '{"ctwa_clid": "c-5", "ad_name": "AGO02"}');
  assert r->>'ad_ref' is null, '7. clique para WhatsApp não casa por nome';
  assert public._crm_resolve_ad('51600000-0000-0000-0000-000000000001', '{"ad_name": "Duplicado"}', null) is null,
    '7. nome repetido não casa';
  assert public._crm_creative_code('p002-v3_120211') = 'P002-V3', 'código no utm_content';
  assert public._crm_creative_code('Carmona P002-V3') is null, 'só no começo';
end $$;

-- ------------------------------------------- 8. experimentos e relatório --
set local role authenticated;
set local request.jwt.claims = '{"sub":"5160b000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare v jsonb; v_list jsonb; v_rep jsonb;
begin
  v := public.crm_save_experiment(jsonb_build_object(
    'title', 'Vídeo do Carmona no Reels', 'hypothesis', 'Prova social técnica baixa o custo por ganho',
    'channel', 'paid_social', 'campaign_id', '5160c000-0000-0000-0000-000000000001',
    'creative_id', (select id from public.crm_creatives where code = 'P002-V3' and equipe_id = '51600000-0000-0000-0000-000000000001'),
    'metric', 'cpl', 'target', 30, 'starts_on', current_date - 7, 'status', 'running',
    'ice_impact', 8, 'ice_confidence', 6, 'ice_ease', 15));
  assert (v->>'ice_ease')::int = 10, 'ICE limitado a 10';

  v_list := public.crm_experiment_list();
  assert jsonb_array_length(v_list) = 1, 'um experimento';
  assert (v_list->0->'live'->>'leads')::int = 3, 'leads ao vivo do criativo na campanha, veio ' || (v_list->0->'live')::text;
  assert (v_list->0->'live'->>'spend')::numeric = 75.5, 'gasto do criativo pelas métricas';

  v_rep := public.crm_ads_report(now() - interval '10 days', now() + interval '1 day');
  assert (select (c->>'spend')::numeric from jsonb_array_elements(v_rep->'creatives') c where c->>'code' = 'P002-V3') = 75.5,
    'relatório por criativo: gasto';
  assert (select (c->>'leads')::int from jsonb_array_elements(v_rep->'creatives') c where c->>'code' = 'P002-V3') = 3,
    'relatório por criativo: leads';
  assert (select (a->>'video_3s')::int from jsonb_array_elements(v_rep->'ads') a where a->>'external_ad_id' = '120211') = 3000,
    'relatório por anúncio: gancho';

  perform public.crm_delete_experiment((v->>'id')::uuid);
  assert jsonb_array_length(public.crm_experiment_list()) = 0, 'apagado';

  assert jsonb_array_length(public.crm_ad_list()) = 4, 'lista de anúncios';
  assert not ((public.crm_ad_list()->0) ? 'prefill_norm'), 'sem a coluna interna';
end $$;

-- ------------------------------------------------- 9. fontes e indicação --
do $$
declare r jsonb;
begin
  assert 'personal_network' = any (public._crm_origin_categories()), 'rede pessoal na taxonomia';
  assert public.origin_category_label('customer_base') = 'Base de clientes', 'rótulo';
  assert public.origin_category_group('personal_network') = 'Rede', 'grupo';
  update public.leads set origin_category = 'personal_network' where id = '5160e000-0000-0000-0000-000000000005';
  insert into public.leads (id, equipe_id, name) values
    ('5160e000-0000-0000-0000-000000000009', '51600000-0000-0000-0000-000000000001', 'Indicado');
  r := public.crm_record_touch('5160e000-0000-0000-0000-000000000009', null,
         '{"_origin_category": "referral", "_referred_by": "5160e000-0000-0000-0000-000000000002"}');
  assert (select referred_by_lead_id from public.leads where id = '5160e000-0000-0000-0000-000000000009')
           = '5160e000-0000-0000-0000-000000000002', 'quem indicou gravado';
  assert (public.crm_referrers(null)->0->>'referrals')::int = 1, 'ranking de quem indica';
end $$;

rollback;
select 'PASS' as result;
