-- Sprint 16 · ajuste 1 — o gerenciador completa o anúncio (campanha, criativo pelo vídeo, destino, status).
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint16_ads_enrich.test.sql

begin;

-- @include supabase/migrations/20261123000100_sprint16_growth.sql
-- @include supabase/migrations/20261123000200_sprint16_ads_enrich.sql
-- @include supabase/migrations/20261123000300_sprint16_ad_ref_complete.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('51610000-0000-0000-0000-000000000001', 'S16 Enrich', 'x', 'y');
-- Campanha arquivada com a chave: não é recriada nem recebe anúncio.
insert into public.crm_campaigns (equipe_id, name, status, match_keys) values
  ('51610000-0000-0000-0000-000000000001', 'Velha', 'archived', array['999']);

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare r jsonb; v_set02_lead public.crm_ads; v_set02_msg public.crm_ads; v_ago public.crm_ads;
begin
  r := public._crm_windsor_ingest('51610000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('platform', 'meta', 'day', current_date - 1, 'external_ad_id', 'A1', 'ad_name', 'SET02',
      'campaign_external_id', '111', 'campaign_name', '[CADASTRO] NOVO TESTE', 'spend', 10,
      'objective', 'OUTCOME_LEADS', 'destination_type', 'ON_AD', 'video_id', 'V-SET', 'effective_status', 'ACTIVE',
      'daily_budget', 25, 'thumbnail_url', 'https://t/set.jpg', 'body', 'Pare de pagar caro', 'preview_url', 'https://fb.me/x'),
    jsonb_build_object('platform', 'meta', 'day', current_date - 1, 'external_ad_id', 'A2', 'ad_name', 'SET02',
      'campaign_external_id', '222', 'campaign_name', '[MENSAGEM] NOVO TESTE', 'spend', 20,
      'objective', 'OUTCOME_ENGAGEMENT', 'destination_type', 'WHATSAPP', 'video_id', 'V-SET', 'effective_status', 'PAUSED'),
    jsonb_build_object('platform', 'meta', 'day', current_date - 1, 'external_ad_id', 'A3', 'ad_name', 'AGO02',
      'campaign_external_id', '111', 'campaign_name', '[CADASTRO] NOVO TESTE', 'spend', 5, 'platform_leads', 25,
      'video_id', 'V-AGO', 'destination_type', 'ON_AD'),
    jsonb_build_object('platform', 'meta', 'day', current_date - 1, 'external_ad_id', 'A4', 'ad_name', 'P009-V1 | Prova',
      'campaign_external_id', '999', 'campaign_name', 'Arquivada', 'spend', 1, 'video_id', 'V-P9'),
    jsonb_build_object('platform', 'meta', 'day', current_date - 1, 'external_ad_id', 'A5', 'ad_name', 'SET02',
      'campaign_external_id', '111', 'spend', 1, 'video_id', 'V-OTHER')));

  assert (r->>'new_campaigns')::int = 2, '2 campanhas novas (111, 222), não a 999 arquivada: ' || r::text;
  assert (select count(*) from public.crm_campaigns where equipe_id = '51610000-0000-0000-0000-000000000001') = 3, '3 campanhas';
  assert (select origin_category from public.crm_campaigns where '111' = any (match_keys)) = 'paid_social', 'Social Pago';
  assert (select name from public.crm_campaigns where '222' = any (match_keys)) = '[MENSAGEM] NOVO TESTE', 'nome da plataforma';

  select * into v_set02_lead from public.crm_ads where external_ad_id = 'A1';
  select * into v_set02_msg from public.crm_ads where external_ad_id = 'A2';
  select * into v_ago from public.crm_ads where external_ad_id = 'A3';
  assert v_set02_lead.creative_id = v_set02_msg.creative_id, 'mesmo vídeo em duas campanhas = um criativo';
  assert v_set02_lead.creative_id <> v_ago.creative_id, 'vídeo diferente, criativo diferente';
  assert (select code from public.crm_creatives where id = v_set02_lead.creative_id) = 'SET02', 'código = nome do anúncio';
  assert (select thumbnail_url from public.crm_creatives where id = v_set02_lead.creative_id) is not null, 'miniatura no criativo';
  assert (select code from public.crm_creatives c join public.crm_ads a on a.creative_id = c.id where a.external_ad_id = 'A5')
           like 'SET02 #%', 'mesmo nome, outro vídeo: código com sufixo';
  assert (select code from public.crm_creatives c join public.crm_ads a on a.creative_id = c.id where a.external_ad_id = 'A4')
           = 'P009-V1', 'o código P000-V0 do nome manda';
  assert v_set02_lead.destination = 'form' and v_set02_msg.destination = 'whatsapp', 'destino pelo gerenciador';
  assert v_set02_lead.status = 'active' and v_set02_msg.status = 'paused', 'status pelo gerenciador';
  assert v_set02_lead.platform_daily_budget = 25, 'verba';
  assert not v_set02_lead.needs_review and not v_set02_msg.needs_review and not v_ago.needs_review, 'nada a completar';
  assert (select campaign_id from public.crm_ads where external_ad_id = 'A4') is null, 'campanha arquivada não recebe';
  assert (select platform_leads from public.crm_ad_metrics m join public.crm_ads a on a.id = m.ad_id where a.external_ad_id = 'A3') = 25, 'leads';

  -- De novo: nada novo, nada duplicado.
  r := public._crm_windsor_ingest('51610000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('platform', 'meta', 'day', current_date, 'external_ad_id', 'A1', 'ad_name', 'SET02',
      'campaign_external_id', '111', 'spend', 3, 'video_id', 'V-SET', 'effective_status', 'ACTIVE')));
  assert (r->>'new_campaigns')::int = 0 and (r->>'new_creatives')::int = 0, 'idempotente';
  assert (select count(*) from public.crm_creatives where equipe_id = '51610000-0000-0000-0000-000000000001') = 4, '4 criativos';
end $$;

-- Ajuste 2: ID prefixado do formulário ("ag:"), anúncio antigo sem nada do gerenciador.
insert into public.leads (id, equipe_id, name) values
  ('51610e00-0000-0000-0000-000000000001', '51610000-0000-0000-0000-000000000001', 'Form antigo');

do $$
declare r jsonb;
begin
  r := public.crm_record_touch('51610e00-0000-0000-0000-000000000001', null,
         '{"_entry_kind": "import", "ad_id": "ag:A3", "ad_name": "AGO02"}');
  assert r->>'ad_ref' = (select id::text from public.crm_ads where external_ad_id = 'A3'), 'ag: tirado na chegada';
  assert public._crm_ad_ref('Você não tem permissão suficiente') is null, 'texto não é ID';
  assert public._crm_ad_ref('ag:120250653648650015') = '120250653648650015', 'prefixo';

  insert into public.lead_touches (equipe_id, lead_id, ad_id, occurred_at)
  values ('51610000-0000-0000-0000-000000000001', '51610e00-0000-0000-0000-000000000001', 'ag:A1', now());

  r := public._crm_windsor_ingest('51610000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('platform', 'meta', 'day', current_date - 90, 'external_ad_id', 'OLD', 'ad_name', 'Placa Condominio',
      'campaign_external_id', '222', 'spend', 4)));
  assert (r->>'linked_touches')::int >= 1, 'toque ag: antigo religado: ' || r::text;
  assert (select destination from public.crm_ads where external_ad_id = 'OLD') = 'whatsapp', 'destino dos irmãos da campanha';
  assert (select c.code from public.crm_ads a join public.crm_creatives c on c.id = a.creative_id where a.external_ad_id = 'OLD')
           = 'PLACA CONDOMINIO', 'criativo pelo nome';
  assert not (select needs_review from public.crm_ads where external_ad_id = 'OLD'), 'completo';
end $$;

rollback;
select 'PASS' as result;
