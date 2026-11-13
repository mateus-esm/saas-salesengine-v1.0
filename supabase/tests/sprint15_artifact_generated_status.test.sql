-- Sprint 15 · T1 — o status "Gerado" não prova marco; só o envio prova.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint15_artifact_generated_status.test.sql
--
-- O que este teste protege: as listas por tipo trazem `generated` logo depois de
-- `draft`; gerar a proposta não move o negócio nem grava `proposal_sent`; enviar
-- depois grava o marco; `generated` vale como status gravável (CHECK da coluna).

begin;

-- @include supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql
-- @include supabase/migrations/20260912100200_sprint11_w4_artifacts.sql
-- @include supabase/migrations/20260912100400_sprint11_w4_artifact_lifecycle.sql
-- @include supabase/migrations/20261112000100_sprint15_artifact_generated_status.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5151a000-0000-0000-0000-000000000001', 'S15T1 Gerado', 'x', 'y');

insert into public.pipelines (id, equipe_id, name) values
  ('5151c000-0000-0000-0000-000000000001', '5151a000-0000-0000-0000-000000000001', 'Gerado');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5151d000-0000-0000-0000-000000000001', '5151a000-0000-0000-0000-000000000001', '5151c000-0000-0000-0000-000000000001', 'Novo',     0, 'open', null),
  ('5151d000-0000-0000-0000-000000000002', '5151a000-0000-0000-0000-000000000001', '5151c000-0000-0000-0000-000000000001', 'Proposta', 1, 'open', 'proposal_sent');

insert into public.leads (id, equipe_id, name) values
  ('5151e000-0000-0000-0000-000000000001', '5151a000-0000-0000-0000-000000000001', 'Contato Gerado');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  ('5151f000-0000-0000-0000-000000000001', '5151a000-0000-0000-0000-000000000001', '5151e000-0000-0000-0000-000000000001',
   '5151c000-0000-0000-0000-000000000001', '5151d000-0000-0000-0000-000000000001');

insert into public.custom_tables (id, equipe_id, name, slug, artifact_kind, table_schema) values
  ('51510000-0000-0000-0000-0000000000c1', '5151a000-0000-0000-0000-000000000001', 'Propostas', 'propostas_gerado', 'proposal', '[]');

insert into public.custom_table_records (id, equipe_id, table_id, data, opportunity_id) values
  ('51510000-0000-0000-0000-0000000000a1', '5151a000-0000-0000-0000-000000000001', '51510000-0000-0000-0000-0000000000c1', '{}', '5151f000-0000-0000-0000-000000000001');

-- ============================================================================
-- 1. As listas por tipo, na mesma ordem do gêmeo em TypeScript.
-- ============================================================================
do $$
begin
  assert public._crm_artifact_statuses('proposal') = array['draft', 'generated', 'sent', 'accepted', 'rejected'],
    'T1-1 FAIL: proposta deveria ter generated logo depois de draft';
  assert public._crm_artifact_statuses('contract') = array['draft', 'generated', 'sent', 'signed', 'rejected'],
    'T1-1 FAIL: contrato deveria ter generated logo depois de draft';
  assert public._crm_artifact_statuses('document') = array['draft', 'generated', 'sent', 'accepted', 'signed', 'rejected'],
    'T1-1 FAIL: documento deveria ter generated logo depois de draft';
  assert public._crm_artifact_milestone('proposal', 'generated') is null
     and public._crm_artifact_milestone('contract', 'generated') is null,
    'T1-1 FAIL: generated nao deveria provar marco';
end $$;

-- ============================================================================
-- 2. Gerar não marca o marco; enviar depois marca.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public._crm_apply_artifact_status('51510000-0000-0000-0000-0000000000a1', 'generated', 'automation');
  assert not (v->>'moved')::boolean and v->>'event' is null,
    'T1-2 FAIL: gerar nao deveria mover nem gravar evento, veio ' || v::text;
  assert (select artifact_status from public.custom_table_records where id = '51510000-0000-0000-0000-0000000000a1') = 'generated',
    'T1-2 FAIL: o status deveria ser generated';
  assert not exists (select 1 from public.funnel_events
                      where opportunity_id = '5151f000-0000-0000-0000-000000000001' and event = 'proposal_sent'),
    'T1-2 FAIL: gerar gravou proposal_sent';
  assert (select stage_id from public.opportunities where id = '5151f000-0000-0000-0000-000000000001')
         = '5151d000-0000-0000-0000-000000000001',
    'T1-2 FAIL: gerar moveu o negocio';

  v := public._crm_apply_artifact_status('51510000-0000-0000-0000-0000000000a1', 'sent', 'automation');
  assert v->>'event' = 'proposal_sent',
    'T1-2 FAIL: enviar deveria gravar proposal_sent, veio ' || v::text;
  assert (select count(*) from public.funnel_events
           where opportunity_id = '5151f000-0000-0000-0000-000000000001' and event = 'proposal_sent') = 1,
    'T1-2 FAIL: o marco deveria sair uma vez';
end $$;

rollback;
select 'PASS' as result;
