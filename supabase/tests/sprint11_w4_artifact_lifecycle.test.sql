-- Sprint 11 · Onda 4 · T43 — o ciclo de vida do artefato prova o marco.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w4_artifact_lifecycle.test.sql
--
-- O que este teste protege: proposta enviada leva o negócio à etapa do marco e o
-- evento sai uma vez, pelo caminho da etapa; repetir o status não faz nada; sem a
-- etapa, o evento é gravado direto (fonte artifact), uma vez; negócio depois da
-- etapa não volta; negócio fechado não se mexe; status fora do tipo é recusado;
-- a gravação direta do status é recusada; o vizinho não mexe.

begin;

-- @include supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql
-- @include supabase/migrations/20260912100200_sprint11_w4_artifacts.sql
-- @include supabase/migrations/20260912100400_sprint11_w4_artifact_lifecycle.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5123a000-0000-0000-0000-000000000001', 'S11W4 Ciclo A', 'x', 'y'),
  ('5123a000-0000-0000-0000-000000000002', 'S11W4 Ciclo B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5123b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w4-ciclo.test',   'x', now(), now()),
  ('5123b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w4-ciclo.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5123b000-0000-0000-0000-00000000000a', '5123b000-0000-0000-0000-00000000000a', 'chefe@s11w4-ciclo.test',   '5123a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5123b000-0000-0000-0000-00000000000d', '5123b000-0000-0000-0000-00000000000d', 'vizinho@s11w4-ciclo.test', '5123a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('5123c000-0000-0000-0000-000000000001', '5123a000-0000-0000-0000-000000000001', 'Ciclo A');

-- A linha tem a etapa da proposta, mas não as do contrato.
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, funnel_event) values
  ('5123d000-0000-0000-0000-000000000001', '5123a000-0000-0000-0000-000000000001', '5123c000-0000-0000-0000-000000000001', 'Novo',        0, 'open', null),
  ('5123d000-0000-0000-0000-000000000002', '5123a000-0000-0000-0000-000000000001', '5123c000-0000-0000-0000-000000000001', 'Proposta',    1, 'open', 'proposal_sent'),
  ('5123d000-0000-0000-0000-000000000003', '5123a000-0000-0000-0000-000000000001', '5123c000-0000-0000-0000-000000000001', 'Negociação',  2, 'open', null),
  ('5123d000-0000-0000-0000-000000000004', '5123a000-0000-0000-0000-000000000001', '5123c000-0000-0000-0000-000000000001', 'Ganho',       3, 'won',  null);

insert into public.leads (id, equipe_id, name) values
  ('5123e000-0000-0000-0000-000000000001', '5123a000-0000-0000-0000-000000000001', 'Contato Ciclo');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id) values
  -- no começo: a proposta enviada leva à etapa Proposta
  ('5123f000-0000-0000-0000-000000000001', '5123a000-0000-0000-0000-000000000001', '5123e000-0000-0000-0000-000000000001',
   '5123c000-0000-0000-0000-000000000001', '5123d000-0000-0000-0000-000000000001'),
  -- já depois da etapa Proposta: não volta
  ('5123f000-0000-0000-0000-000000000002', '5123a000-0000-0000-0000-000000000001', '5123e000-0000-0000-0000-000000000001',
   '5123c000-0000-0000-0000-000000000001', '5123d000-0000-0000-0000-000000000003'),
  -- ganho: não se mexe
  ('5123f000-0000-0000-0000-000000000003', '5123a000-0000-0000-0000-000000000001', '5123e000-0000-0000-0000-000000000001',
   '5123c000-0000-0000-0000-000000000001', '5123d000-0000-0000-0000-000000000004');

insert into public.custom_tables (id, equipe_id, name, slug, artifact_kind, table_schema) values
  ('51230000-0000-0000-0000-0000000000c1', '5123a000-0000-0000-0000-000000000001', 'Propostas', 'propostas_ciclo', 'proposal', '[]'),
  ('51230000-0000-0000-0000-0000000000c2', '5123a000-0000-0000-0000-000000000001', 'Contratos', 'contratos_ciclo', 'contract', '[]');

insert into public.custom_table_records (id, equipe_id, table_id, data, opportunity_id) values
  ('51230000-0000-0000-0000-0000000000a1', '5123a000-0000-0000-0000-000000000001', '51230000-0000-0000-0000-0000000000c1', '{}', '5123f000-0000-0000-0000-000000000001'),
  ('51230000-0000-0000-0000-0000000000a2', '5123a000-0000-0000-0000-000000000001', '51230000-0000-0000-0000-0000000000c2', '{}', '5123f000-0000-0000-0000-000000000001'),
  ('51230000-0000-0000-0000-0000000000a3', '5123a000-0000-0000-0000-000000000001', '51230000-0000-0000-0000-0000000000c1', '{}', '5123f000-0000-0000-0000-000000000002'),
  ('51230000-0000-0000-0000-0000000000a4', '5123a000-0000-0000-0000-000000000001', '51230000-0000-0000-0000-0000000000c1', '{}', '5123f000-0000-0000-0000-000000000003');

set local role authenticated;
set local request.jwt.claims = '{"sub":"5123b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Proposta enviada: o negócio vai à etapa do marco; o evento sai pela etapa.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a1', 'sent');
  assert (v->>'moved')::boolean and v->>'event' = 'proposal_sent' and v->>'stage_id' = '5123d000-0000-0000-0000-000000000002',
    'T43-1 FAIL: a proposta enviada deveria mover o negocio (e dizer para onde), veio ' || v::text;
  assert (select stage_id from public.opportunities where id = '5123f000-0000-0000-0000-000000000001')
         = '5123d000-0000-0000-0000-000000000002',
    'T43-1 FAIL: o negocio deveria estar na etapa Proposta';
  assert (select count(*) from public.funnel_events
           where opportunity_id = '5123f000-0000-0000-0000-000000000001' and event = 'proposal_sent') = 1
     and (select source from public.funnel_events
           where opportunity_id = '5123f000-0000-0000-0000-000000000001' and event = 'proposal_sent') = 'stage_change',
    'T43-1 FAIL: o marco deveria sair uma vez, pelo caminho da etapa';
  assert (select changed_by from public.opportunity_stage_history
           where opportunity_id = '5123f000-0000-0000-0000-000000000001'
           order by changed_at desc limit 1) = '5123b000-0000-0000-0000-00000000000a',
    'T43-1 FAIL: o historico deveria dizer quem enviou';

  -- Repetir: nada muda.
  v := public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a1', 'sent');
  assert not (v->>'moved')::boolean and v->>'event' is null, 'T43-1 FAIL: repetir o status nao deveria fazer nada';
  assert (select count(*) from public.funnel_events
           where opportunity_id = '5123f000-0000-0000-0000-000000000001' and event = 'proposal_sent') = 1,
    'T43-1 FAIL: repetir o status gravou outro evento';
end $$;

-- ============================================================================
-- 2. Sem a etapa do marco: o evento é gravado direto, uma vez.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a2', 'signed');
  assert not (v->>'moved')::boolean and v->>'event' = 'contract_signed',
    'T43-2 FAIL: contrato assinado sem etapa deveria gravar o evento direto, veio ' || v::text;
  assert (select source from public.funnel_events
           where opportunity_id = '5123f000-0000-0000-0000-000000000001' and event = 'contract_signed') = 'artifact',
    'T43-2 FAIL: o evento direto deveria ter a fonte artifact';

  perform public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a2', 'sent');
  perform public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a2', 'signed');
  assert (select count(*) from public.funnel_events
           where opportunity_id = '5123f000-0000-0000-0000-000000000001' and event = 'contract_signed') = 1,
    'T43-2 FAIL: assinar de novo nao deveria gravar outro contract_signed';
  assert (select count(*) from public.funnel_events
           where opportunity_id = '5123f000-0000-0000-0000-000000000001' and event = 'contract_sent') = 1,
    'T43-2 FAIL: contrato enviado deveria gravar contract_sent uma vez';
  assert (select stage_id from public.opportunities where id = '5123f000-0000-0000-0000-000000000001')
         = '5123d000-0000-0000-0000-000000000002',
    'T43-2 FAIL: o contrato nao deveria mexer na etapa sem etapa do marco';
end $$;

-- ============================================================================
-- 3. Negócio depois da etapa não volta; negócio fechado não se mexe.
-- ============================================================================
do $$
declare v jsonb;
begin
  v := public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a3', 'sent');
  assert (select stage_id from public.opportunities where id = '5123f000-0000-0000-0000-000000000002')
         = '5123d000-0000-0000-0000-000000000003',
    'T43-3 FAIL: o negocio depois da etapa Proposta voltou';
  assert v->>'event' = 'proposal_sent'
     and (select source from public.funnel_events
           where opportunity_id = '5123f000-0000-0000-0000-000000000002' and event = 'proposal_sent') = 'artifact',
    'T43-3 FAIL: sem voltar, o marco deveria ser gravado direto';

  v := public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a4', 'sent');
  assert v->>'event' is null and not (v->>'moved')::boolean, 'T43-3 FAIL: negocio ganho nao deveria se mexer';
  assert not exists (select 1 from public.funnel_events
                      where opportunity_id = '5123f000-0000-0000-0000-000000000003' and event = 'proposal_sent'),
    'T43-3 FAIL: negocio ganho ganhou evento de proposta';
  assert (select artifact_status from public.custom_table_records where id = '51230000-0000-0000-0000-0000000000a4') = 'sent',
    'T43-3 FAIL: o status do artefato deveria mudar mesmo com o negocio fechado';
end $$;

-- ============================================================================
-- 4. Status fora do tipo; gravação direta; o vizinho.
-- ============================================================================
do $$
declare v_failed boolean;
begin
  v_failed := false;
  begin
    perform public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a1', 'signed');
  exception when others then v_failed := sqlerrm = 'invalid_artifact_status';
  end;
  assert v_failed, 'T43-4 FAIL: proposta nao se assina';

  v_failed := false;
  begin
    update public.custom_table_records set artifact_status = 'accepted' where id = '51230000-0000-0000-0000-0000000000a1';
  exception when others then v_failed := sqlerrm = 'artifact_status_by_verb';
  end;
  assert v_failed, 'T43-4 FAIL: a gravacao direta do status deveria ser recusada';

  v_failed := false;
  begin
    insert into public.custom_table_records (equipe_id, table_id, data, artifact_status) values
      ('5123a000-0000-0000-0000-000000000001', '51230000-0000-0000-0000-0000000000c1', '{}', 'accepted');
  exception when others then v_failed := sqlerrm = 'artifact_status_by_verb';
  end;
  assert v_failed, 'T43-4 FAIL: nascer aceito sem o verbo deveria ser recusado';

  -- Editar os dados continua livre.
  update public.custom_table_records set data = '{"x":1}' where id = '51230000-0000-0000-0000-0000000000a1';
end $$;

set local request.jwt.claims = '{"sub":"5123b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.crm_set_artifact_status('51230000-0000-0000-0000-0000000000a1', 'accepted');
  exception when others then v_failed := sqlerrm = 'record_not_found';
  end;
  assert v_failed, 'T43-4 FAIL: o vizinho mudou o status do artefato da equipe A';
end $$;

rollback;
select 'PASS' as result;
