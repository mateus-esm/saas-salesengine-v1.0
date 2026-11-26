-- Sprint 17 · Fases 2–3 — fila de entrada do Meta, formulário como entrada,
-- leadgen_id no toque, anúncio criado pelo lead.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint17_meta_leads.test.sql

begin;

-- @include supabase/migrations/20261124000200_sprint17_meta_leads.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('51720000-0000-0000-0000-000000000001', 'S17L A', 'x', 'y'),
  ('51720000-0000-0000-0000-000000000002', 'S17L B', 'x', 'y');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  ea uuid := '51720000-0000-0000-0000-000000000001';
  eb uuid := '51720000-0000-0000-0000-000000000002';
  u1 uuid := '51720000-0000-0000-0000-0000000000a1';
  ia uuid; ib uuid; pa uuid; q1 uuid; q2 uuid; qx uuid; e1 uuid; e2 uuid;
  v_lead uuid; v_ad uuid; r jsonb; t public.lead_touches; ev public.crm_inbound_events; n int;
begin
  ia := public._crm_integration_store_key(ea, 'meta', 'TOKEN-A-xxxxxxxx', '[]'::jsonb, '{}'::jsonb, u1);
  ib := public._crm_integration_store_key(eb, 'meta', 'TOKEN-B-xxxxxxxx', '[]'::jsonb, '{}'::jsonb, u1);
  perform public._crm_meta_assets_sync(ia, '[{"asset_type":"page","external_id":"S17P1","name":"Página"},
                                             {"asset_type":"page","external_id":"S17P2","name":"Outra"}]'::jsonb);
  perform public._crm_meta_assets_sync(ib, '[{"asset_type":"page","external_id":"S17P2","name":"Outra"}]'::jsonb);
  select id into pa from public.crm_integration_assets where integration_id = ia and external_id = 'S17P1';
  perform public._crm_asset_set_status(pa, 'active');

  -- ── enqueue: só página ativa; idempotente; payload só com IDs ──
  q1 := public._crm_meta_enqueue_leadgen('S17P1',
          '{"leadgen_id":"12345678901234567","page_id":"S17P1","form_id":"F1","ad_id":"AD1","full_name":"não guarda"}'::jsonb, 'webhook');
  assert q1 is not null, 'página ativa enfileira';
  q2 := public._crm_meta_enqueue_leadgen('S17P1', '{"leadgen_id":"12345678901234567","page_id":"S17P1","form_id":"F1"}'::jsonb, 'webhook');
  assert q2 is null, 'reenvio do Meta não duplica';
  assert (select count(*) from public.crm_inbound_events where equipe_id = ea) = 1, 'um evento só';
  select * into ev from public.crm_inbound_events where id = q1;
  assert ev.external_id = '12345678901234567', 'leadgen_id como texto, sem arredondar';
  assert not (ev.payload ? 'full_name'), 'payload só com IDs';
  assert ev.asset_id = pa and ev.status = 'queued', 'ligado à página, na fila';

  qx := public._crm_meta_enqueue_leadgen('S17P2', '{"leadgen_id":"999","page_id":"S17P2"}'::jsonb, 'webhook');
  assert qx is null, 'página não ativa não grava (nem na equipe A nem na B)';
  assert not exists (select 1 from public.crm_inbound_events where external_id = '999'), 'nada gravado';

  -- ── claim / finish / backoff / dead / hold ──
  select count(*) into n from public._crm_inbound_claim(10, array[q1]);
  assert n = 1, 'claim pega o evento';
  assert (select status from public.crm_inbound_events where id = q1) = 'processing', 'em processamento';
  select count(*) into n from public._crm_inbound_claim(10, array[q1]);
  assert n = 0, 'não pega duas vezes';

  perform public._crm_inbound_finish(q1, 'error', 'falhou', null, null, 60000);
  select * into ev from public.crm_inbound_events where id = q1;
  assert ev.status = 'error' and ev.attempts = 1 and ev.next_attempt_at > now(), 'erro com backoff';
  update public.crm_inbound_events set attempts = 7, next_attempt_at = now() - interval '1 second' where id = q1;
  perform public._crm_inbound_claim(10, null);
  perform public._crm_inbound_finish(q1, 'error', 'falhou de novo', null, null, 60000);
  assert (select status from public.crm_inbound_events where id = q1) = 'dead', '8 tentativas → dead';

  update public.crm_inbound_events set status = 'queued', attempts = 2, next_attempt_at = now() where id = q1;
  perform public._crm_inbound_claim(10, array[q1]);
  perform public._crm_inbound_finish(q1, 'hold', 'token', null, null, 3600000);
  select * into ev from public.crm_inbound_events where id = q1;
  assert ev.status = 'queued' and ev.attempts = 2, 'hold (token) não queima tentativa';

  -- integração em erro (token) → fila daquela equipe parada
  update public.crm_inbound_events set next_attempt_at = now() where id = q1;
  update public.crm_integrations set status = 'error' where id = ia;
  select count(*) into n from public._crm_inbound_claim(10, array[q1]);
  assert n = 0, 'equipe com token inválido não processa';
  update public.crm_integrations set status = 'connected' where id = ia;

  -- ── entrada por formulário: criada uma vez, canal Social Pago · Meta ──
  e1 := public._crm_entry_for_meta_form(ea, 'S17P1', 'F1', null);
  e2 := public._crm_entry_for_meta_form(ea, 'S17P1', 'F1', 'Simulação Solar');
  assert e1 = e2, 'uma entrada por formulário';
  assert (select kind from public.crm_entries where id = e1) = 'meta_form', 'kind meta_form';
  assert (select name from public.crm_entries where id = e1) = 'Meta · Simulação Solar', 'nome chega depois';
  assert (select origin_category from public.crm_entries where id = e1) = 'paid_social', 'social pago';
  assert (select platform from public.crm_entries where id = e1) = 'meta', 'plataforma meta';
  assert public._crm_entry_for_meta_form(eb, 'S17P1', 'F1', 'X') <> e1, 'outra equipe, outra entrada';

  -- ── anúncio que chega no lead: criado com source meta e campanha ligada ──
  v_ad := public._crm_meta_upsert_ad(ea, '{"ad_id":"S17AD1","ad_name":"P001-V1 | Conta alta","adset_id":"AS1",
            "adset_name":"Fortaleza","campaign_id":"S17C1","campaign_name":"LEADS NOV"}'::jsonb);
  assert (select source from public.crm_ads where id = v_ad) = 'meta', 'source meta';
  assert (select destination from public.crm_ads where id = v_ad) = 'form', 'destino formulário';
  assert (select campaign_id from public.crm_ads where id = v_ad) is not null, 'campanha criada e ligada';
  update public.crm_ads set ad_name = 'Nome do Windsor', source = 'windsor' where id = v_ad;
  assert public._crm_meta_upsert_ad(ea, '{"ad_id":"S17AD1","ad_name":"outro"}'::jsonb) = v_ad, 'mesmo anúncio';
  assert (select ad_name from public.crm_ads where id = v_ad) = 'Nome do Windsor', 'não sobrescreve o Windsor';
  assert (select source from public.crm_ads where id = v_ad) = 'windsor', 'source fica';
  assert public._crm_meta_upsert_ad(ea, '{}'::jsonb) is null, 'sem ad_id, nada';

  -- ── leadgen_id no toque, anúncio casado ──
  insert into public.leads (equipe_id, name) values (ea, 'Lead S17') returning id into v_lead;
  r := public.crm_record_touch(v_lead, e1,
         '{"leadgen_id":"12345678901234567","ad_id":"S17AD1","form_id":"F1","utm_source":"facebook","utm_medium":"paid_social"}'::jsonb,
         null, '2026-11-20T10:00:00Z');
  select * into t from public.lead_touches where id = (r->>'touch_id')::uuid;
  assert t.leadgen_id = '12345678901234567', 'leadgen_id gravado';
  assert t.crm_ad_id = v_ad, 'anúncio casado pelo ID';
  assert t.occurred_at = '2026-11-20T10:00:00Z'::timestamptz, 'hora do lead';
  assert t.platform = 'meta' and t.origin_category = 'paid_social', 'social pago meta';
  assert public._crm_touch_fields('{"leadgenId":"77"}'::jsonb)->>'leadgen_id' = '77', 'camelCase também';

  -- ── a linha do formulário pode ser escolhida (crm_save_entry) ──
  assert exists (select 1 from pg_proc where proname = 'crm_save_entry'
                  and pg_get_functiondef(oid) like '%meta_form%'), 'save_entry trata meta_form';
end $$;

rollback;
select 'PASS' as result;
