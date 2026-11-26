-- Sprint 17 · Fase 4 — API de Conversões: mapeamento etapa → evento (desligado
-- por padrão), fila com event_id estável, gatilho na mudança de etapa.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint17_meta_capi.test.sql

begin;

-- @include supabase/migrations/20261124000200_sprint17_meta_leads.sql
-- @include supabase/migrations/20261124000300_sprint17_meta_capi.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('51730000-0000-0000-0000-000000000001', 'S17C A', 'x', 'y');
insert into public.pipelines (id, equipe_id, name) values
  ('51730000-0000-0000-0000-0000000000b1', '51730000-0000-0000-0000-000000000001', 'Linha S17');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('51730000-0000-0000-0000-0000000000c1', '51730000-0000-0000-0000-000000000001', '51730000-0000-0000-0000-0000000000b1', 'Novo', 0, 'open'),
  ('51730000-0000-0000-0000-0000000000c2', '51730000-0000-0000-0000-000000000001', '51730000-0000-0000-0000-0000000000b1', 'Qualificado', 1, 'open');
insert into public.leads (id, equipe_id, name) values
  ('51730000-0000-0000-0000-0000000000d1', '51730000-0000-0000-0000-000000000001', 'Lead CAPI');
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('51730000-0000-0000-0000-0000000000e1', '51730000-0000-0000-0000-000000000001', '51730000-0000-0000-0000-0000000000d1',
   '51730000-0000-0000-0000-0000000000b1', '51730000-0000-0000-0000-0000000000c1');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  ea uuid := '51730000-0000-0000-0000-000000000001';
  s2 uuid := '51730000-0000-0000-0000-0000000000c2';
  s1 uuid := '51730000-0000-0000-0000-0000000000c1';
  op uuid := '51730000-0000-0000-0000-0000000000e1';
  ld uuid := '51730000-0000-0000-0000-0000000000d1';
  ia uuid; n int; ev public.crm_conversion_events; eid text; r jsonb;
begin
  ia := public._crm_integration_store_key(ea, 'meta', 'TOKEN-A-xxxxxxxx', '[]'::jsonb, '{"capi_enabled": false}'::jsonb,
          '51730000-0000-0000-0000-0000000000a1');

  -- ── mapeamento salvo começa desligado ──
  perform public._crm_capi_save_mapping(ea, s2, 'qualified', null);
  assert (select active from public.crm_conversion_mappings where equipe_id = ea and stage_id = s2) = false, 'desligado por padrão';

  -- ── mapeamento desligado: nada entra na fila ──
  insert into public.opportunity_stage_history (equipe_id, opportunity_id, from_stage_id, to_stage_id) values (ea, op, s1, s2);
  assert (select count(*) from public.crm_conversion_events where equipe_id = ea) = 0, 'mapeamento off → nada';

  -- ── mapeamento ligado mas CAPI geral desligada: nada ──
  perform public._crm_capi_save_mapping(ea, s2, 'qualified', true);
  insert into public.opportunity_stage_history (equipe_id, opportunity_id, from_stage_id, to_stage_id) values (ea, op, s1, s2);
  assert (select count(*) from public.crm_conversion_events where equipe_id = ea) = 0, 'capi_enabled off → nada';

  -- ── tudo ligado: entra uma vez, event_id estável ──
  update public.crm_integrations set settings = settings || '{"capi_enabled": true, "dataset_id": "D1"}'::jsonb where id = ia;
  insert into public.opportunity_stage_history (equipe_id, opportunity_id, from_stage_id, to_stage_id) values (ea, op, s1, s2);
  insert into public.opportunity_stage_history (equipe_id, opportunity_id, from_stage_id, to_stage_id) values (ea, op, s1, s2);
  assert (select count(*) from public.crm_conversion_events where equipe_id = ea) = 1, 'volta à etapa não conta de novo';
  select * into ev from public.crm_conversion_events where equipe_id = ea;
  eid := encode(extensions.digest(ea::text || ':' || op::text || ':' || s2::text || ':qualified', 'sha256'), 'hex');
  assert ev.event_id = eid, 'event_id = sha256(equipe:opp:stage:event)';
  assert ev.status = 'queued' and ev.lead_id = ld and ev.event_name = 'qualified', 'na fila, com lead';

  -- ── claim / finish ──
  select count(*) into n from public._crm_capi_claim(10);
  assert n = 1, 'claim';
  perform public._crm_capi_finish(ev.id, 'sent', 'lead_id', '{"user_data":{"lead_id":"1"}}'::jsonb, '{"events_received":1}'::jsonb, null);
  select * into ev from public.crm_conversion_events where id = ev.id;
  assert ev.status = 'sent' and ev.sent_at is not null and ev.match_key = 'lead_id', 'enviado';
  perform public._crm_capi_finish(ev.id, 'skipped', null, null, null, 'too_old');
  assert (select skip_reason from public.crm_conversion_events where id = ev.id) = 'too_old', 'skip registra motivo';

  -- ── registro por lead (LGPD) ──
  r := public._crm_lead_conversion_events_for(ld);
  assert jsonb_array_length(r) = 1, 'aparece no lead';
  assert not (r->0 ? 'response'), 'tela não recebe a resposta crua';

  -- ── gatilho nunca derruba a mudança de etapa ──
  delete from public.crm_conversion_mappings where equipe_id = ea;
  insert into public.crm_conversion_mappings (equipe_id, provider, pipeline_id, stage_id, event_name, active)
  values (ea, 'meta', null, s1, 'raw_lead', true);
  insert into public.opportunity_stage_history (equipe_id, opportunity_id, from_stage_id, to_stage_id) values (ea, op, s2, s1);
  assert (select count(*) from public.crm_conversion_events where equipe_id = ea and event_name = 'raw_lead') = 1, 'outro evento entra';
end $$;

rollback;
select 'PASS' as result;
