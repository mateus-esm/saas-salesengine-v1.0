-- Sprint 15b · T1 — follow-up agendado: fila de envio, aviso e volta do Reciclo.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint15b_followups.test.sql
-- (Não executado pelo implementador: o controlador roda. O tempo é simulado
--  empurrando due_at / stage_entered_at para o passado dentro da transação.)
--
-- O que este teste protege:
--   1. validações do agendar: no_outreach_line, message_required, invalid_due_at,
--      invalid_return_stage
--   2. follow-up manual com mensagem cria job queued com run_after = due_at
--   3. cancelar cancela o job na fila (idempotente)
--   4. recycle novo cancela o recycle agendado anterior (e o job dele)
--   5. crm_run_followups avisa o responsável e move para return_stage_id
--   6. return skipped when deal left the stage
--   7. timers skip deals with a scheduled recycle followup (e o "Manter no Reciclo" executado)
--   8. claim pega o job de follow-up e o finish grava result.message
--   9. o check de forma de outreach_jobs recusa job sem inscrição e sem follow-up

begin;

-- @include supabase/migrations/20261113000100_sprint15b_followups.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('515ba000-0000-0000-0000-000000000001', 'S15b Follow-up', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('515bb000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@s15b-followups.test', 'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('515bb000-0000-0000-0000-000000000001', '515bb000-0000-0000-0000-000000000001', 'a@s15b-followups.test', '515ba000-0000-0000-0000-000000000001', 'Vendedora A', 'user')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role;

-- P1: Novo (open) · Reciclo (ciclo, 15 dias → Novo) · Proposta (open). P2: outra linha.
insert into public.pipelines (id, equipe_id, name) values
  ('515bc000-0000-0000-0000-000000000001', '515ba000-0000-0000-0000-000000000001', 'Follow-up P1'),
  ('515bc000-0000-0000-0000-000000000002', '515ba000-0000-0000-0000-000000000001', 'Follow-up P2');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('515bd000-0000-0000-0000-000000000001', '515ba000-0000-0000-0000-000000000001', '515bc000-0000-0000-0000-000000000001', 'Novo',     0, 'open'),
  ('515bd000-0000-0000-0000-000000000002', '515ba000-0000-0000-0000-000000000001', '515bc000-0000-0000-0000-000000000001', 'Reciclo',  1, 'ciclo'),
  ('515bd000-0000-0000-0000-000000000003', '515ba000-0000-0000-0000-000000000001', '515bc000-0000-0000-0000-000000000001', 'Proposta', 2, 'open'),
  ('515bd000-0000-0000-0000-000000000021', '515ba000-0000-0000-0000-000000000001', '515bc000-0000-0000-0000-000000000002', 'Outra',    0, 'open');
update public.pipeline_stages_v2 set cycle_days = 15, cycle_target_stage_id = '515bd000-0000-0000-0000-000000000001'
 where id = '515bd000-0000-0000-0000-000000000002';

insert into public.leads (id, equipe_id, name) values
  ('515be000-0000-0000-0000-000000000001', '515ba000-0000-0000-0000-000000000001', 'Lead Um'),
  ('515be000-0000-0000-0000-000000000002', '515ba000-0000-0000-0000-000000000001', 'Lead Dois'),
  ('515be000-0000-0000-0000-000000000003', '515ba000-0000-0000-0000-000000000001', 'Lead Tres'),
  ('515be000-0000-0000-0000-000000000004', '515ba000-0000-0000-0000-000000000001', 'Lead Quatro'),
  ('515be000-0000-0000-0000-000000000005', '515ba000-0000-0000-0000-000000000001', 'Lead Cinco'),
  ('515be000-0000-0000-0000-000000000006', '515ba000-0000-0000-0000-000000000001', 'Lead Seis');

-- O1 manual em Novo · O2/O3/O4/O5 no Reciclo · O6 manual (claim/finish).
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, owner_id) values
  ('515bf000-0000-0000-0000-000000000001', '515ba000-0000-0000-0000-000000000001', '515be000-0000-0000-0000-000000000001', '515bc000-0000-0000-0000-000000000001', '515bd000-0000-0000-0000-000000000001', '515bb000-0000-0000-0000-000000000001'),
  ('515bf000-0000-0000-0000-000000000002', '515ba000-0000-0000-0000-000000000001', '515be000-0000-0000-0000-000000000002', '515bc000-0000-0000-0000-000000000001', '515bd000-0000-0000-0000-000000000002', '515bb000-0000-0000-0000-000000000001'),
  ('515bf000-0000-0000-0000-000000000003', '515ba000-0000-0000-0000-000000000001', '515be000-0000-0000-0000-000000000003', '515bc000-0000-0000-0000-000000000001', '515bd000-0000-0000-0000-000000000002', '515bb000-0000-0000-0000-000000000001'),
  ('515bf000-0000-0000-0000-000000000004', '515ba000-0000-0000-0000-000000000001', '515be000-0000-0000-0000-000000000004', '515bc000-0000-0000-0000-000000000001', '515bd000-0000-0000-0000-000000000002', '515bb000-0000-0000-0000-000000000001'),
  ('515bf000-0000-0000-0000-000000000005', '515ba000-0000-0000-0000-000000000001', '515be000-0000-0000-0000-000000000005', '515bc000-0000-0000-0000-000000000001', '515bd000-0000-0000-0000-000000000002', '515bb000-0000-0000-0000-000000000001'),
  ('515bf000-0000-0000-0000-000000000006', '515ba000-0000-0000-0000-000000000001', '515be000-0000-0000-0000-000000000006', '515bc000-0000-0000-0000-000000000001', '515bd000-0000-0000-0000-000000000001', '515bb000-0000-0000-0000-000000000001');

insert into public.wpp_instances (id, equipe_id, instance_name, display_name, status) values
  ('515b0000-0000-0000-0000-0000000000a1', '515ba000-0000-0000-0000-000000000001', 's15b-inst', 'Comercial', 'connected');

-- Linha de outreach ainda SEM linha (nem Solo nem channel_id).
insert into public.conversation_opener_settings (equipe_id) values ('515ba000-0000-0000-0000-000000000001')
on conflict (equipe_id) do update set solo_instance_id = null, channel_id = null;

-- ============================================================================
-- 1. Validações (como a vendedora da equipe).
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"515bb000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  begin
    perform public.crm_schedule_followup('515bf000-0000-0000-0000-000000000001', now() + interval '1 day',
      'manual', null, null, true, true, 'Oi', null);
    raise exception 'T1-1 FAIL: send_message sem linha foi aceito';
  exception when sqlstate '22023' then
    assert sqlerrm like 'no_outreach_line%', 'T1-1 FAIL: esperava no_outreach_line, veio ' || sqlerrm;
  end;

  begin
    perform public.crm_schedule_followup('515bf000-0000-0000-0000-000000000001', now() + interval '1 day',
      'manual', null, null, true, true, '   ', null);
    raise exception 'T1-1 FAIL: mensagem vazia foi aceita';
  exception when sqlstate '22023' then
    assert sqlerrm like 'message_required%', 'T1-1 FAIL: esperava message_required, veio ' || sqlerrm;
  end;

  begin
    perform public.crm_schedule_followup('515bf000-0000-0000-0000-000000000001', now() - interval '10 minutes');
    raise exception 'T1-1 FAIL: data no passado foi aceita';
  exception when sqlstate '22023' then
    assert sqlerrm like 'invalid_due_at%', 'T1-1 FAIL: esperava invalid_due_at, veio ' || sqlerrm;
  end;

  begin
    perform public.crm_schedule_followup('515bf000-0000-0000-0000-000000000001', now() + interval '1 day',
      'manual', null, null, true, false, null, '515bd000-0000-0000-0000-000000000021');
    raise exception 'T1-1 FAIL: etapa de outro pipeline foi aceita';
  exception when sqlstate '22023' then
    assert sqlerrm like 'invalid_return_stage%', 'T1-1 FAIL: esperava invalid_return_stage, veio ' || sqlerrm;
  end;
end $$;

reset role;
do $$ begin
  assert not exists (select 1 from public.crm_followups where equipe_id = '515ba000-0000-0000-0000-000000000001'),
    'T1-1 FAIL: recusa gravou follow-up';
end $$;

-- Agora a equipe tem linha Solo.
update public.conversation_opener_settings
   set provider = 'solo', solo_instance_id = '515b0000-0000-0000-0000-0000000000a1'
 where equipe_id = '515ba000-0000-0000-0000-000000000001';

-- ============================================================================
-- 2-4. Agendar, cancelar, substituir o recycle (como a vendedora).
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"515bb000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare v jsonb; v2 jsonb;
begin
  -- 2. manual com mensagem → job queued
  v := public.crm_schedule_followup('515bf000-0000-0000-0000-000000000001', now() + interval '1 day',
         'manual', null, 'Ligar de volta', true, true, 'Oi {{nome}}, tudo bem?', null);
  assert v->>'status' = 'scheduled' and v->>'outreach_job_id' is not null,
    'T1-2 FAIL: follow-up deveria nascer scheduled com job, veio ' || v::text;
  assert (v->>'from_stage_id')::uuid = '515bd000-0000-0000-0000-000000000001',
    'T1-2 FAIL: from_stage_id deveria ser a etapa atual';
  assert v->>'kind' = 'manual' and (v->>'send_message')::boolean and v->>'message_text' = 'Oi {{nome}}, tudo bem?',
    'T1-2 FAIL: campos gravados errados ' || v::text;

  -- 3. cancelar (duas vezes: idempotente)
  v2 := public.crm_cancel_followup((v->>'id')::uuid);
  assert v2->>'status' = 'cancelled', 'T1-3 FAIL: cancelar deveria dar cancelled, veio ' || v2::text;
  v2 := public.crm_cancel_followup((v->>'id')::uuid);
  assert v2->>'status' = 'cancelled', 'T1-3 FAIL: cancelar de novo deveria seguir cancelled';

  -- 4. recycle novo cancela o anterior
  v := public.crm_schedule_followup('515bf000-0000-0000-0000-000000000002', now() + interval '2 days',
         'recycle', null, 'Sem orçamento', true, true, 'Voltando a falar', '515bd000-0000-0000-0000-000000000001');
  v2 := public.crm_schedule_followup('515bf000-0000-0000-0000-000000000002', now() + interval '3 days',
         'recycle', null, 'Sem orçamento', true, false, null, '515bd000-0000-0000-0000-000000000001');
  assert v2->>'status' = 'scheduled' and v2->>'outreach_job_id' is null,
    'T1-4 FAIL: o novo recycle deveria estar scheduled sem job, veio ' || v2::text;

  -- O3: recycle com volta (o negócio vai sair da etapa à mão). O4: "Manter no Reciclo".
  perform public.crm_schedule_followup('515bf000-0000-0000-0000-000000000003', now() + interval '1 day',
    'recycle', null, 'Pediu para ligar depois', true, false, null, '515bd000-0000-0000-0000-000000000001');
  perform public.crm_schedule_followup('515bf000-0000-0000-0000-000000000004', now() + interval '30 days',
    'recycle', null, 'Obra em março', true, false, null, null);
  -- O6: manual com mensagem, para o claim/finish.
  perform public.crm_schedule_followup('515bf000-0000-0000-0000-000000000006', now() + interval '1 hour',
    'manual', null, null, false, true, 'Mensagem agendada', null);
end $$;

reset role;

do $$
declare v_fu public.crm_followups; v_job public.outreach_jobs;
begin
  -- 2. o job
  select * into v_fu from public.crm_followups where opportunity_id = '515bf000-0000-0000-0000-000000000001';
  select * into v_job from public.outreach_jobs where id = v_fu.outreach_job_id;
  assert v_job.followup_id = v_fu.id and v_job.enrollment_id is null and v_job.step_position is null,
    'T1-2 FAIL: job de follow-up com forma errada';
  assert v_job.run_after = v_fu.due_at and v_job.message_text = 'Oi {{nome}}, tudo bem?'
     and v_job.lead_id = '515be000-0000-0000-0000-000000000001',
    'T1-2 FAIL: job deveria ter run_after = due_at, texto e lead';
  -- 3. cancel cancels the queued job
  assert v_fu.status = 'cancelled' and v_job.status = 'cancelled',
    'T1-3 FAIL: cancelar deveria cancelar follow-up e job, veio ' || v_fu.status || '/' || v_job.status;

  -- 4. o recycle anterior e o job dele
  assert (select count(*) from public.crm_followups
           where opportunity_id = '515bf000-0000-0000-0000-000000000002' and kind = 'recycle' and status = 'scheduled') = 1,
    'T1-4 FAIL: deveria sobrar um recycle agendado';
  assert (select count(*) from public.crm_followups
           where opportunity_id = '515bf000-0000-0000-0000-000000000002' and kind = 'recycle' and status = 'cancelled') = 1,
    'T1-4 FAIL: o recycle anterior deveria estar cancelado';
  assert (select j.status from public.outreach_jobs j join public.crm_followups f on f.id = j.followup_id
           where f.opportunity_id = '515bf000-0000-0000-0000-000000000002') = 'cancelled',
    'T1-4 FAIL: o job do recycle anterior deveria estar cancelado';

  -- RLS: sem política de escrita (o time só lê).
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_followups'
                      and cmd <> 'SELECT'),
    'T1-2 FAIL: crm_followups não deveria ter política de escrita';
end $$;

-- ============================================================================
-- 5-6. O agendador (o tempo passa).
-- ============================================================================
-- O3 sai do Reciclo à mão antes da data.
update public.opportunities set stage_id = '515bd000-0000-0000-0000-000000000003'
 where id = '515bf000-0000-0000-0000-000000000003';
update public.crm_followups set due_at = now() - interval '1 minute'
 where opportunity_id in ('515bf000-0000-0000-0000-000000000002', '515bf000-0000-0000-0000-000000000003')
   and status = 'scheduled';

do $$
declare r jsonb; v_fu public.crm_followups;
begin
  r := public.crm_run_followups();
  assert (r->>'done')::int >= 2, 'T1-5 FAIL: deveria executar ao menos 2, veio ' || r::text;

  -- 5. O2: avisou e voltou para Novo
  select * into v_fu from public.crm_followups
   where opportunity_id = '515bf000-0000-0000-0000-000000000002' and kind = 'recycle' and status <> 'cancelled';
  assert v_fu.status = 'done' and v_fu.executed_at is not null and v_fu.result->>'return' = 'moved',
    'T1-5 FAIL: O2 deveria estar done/moved, veio ' || v_fu.status || ' ' || v_fu.result::text;
  assert (select stage_id from public.opportunities where id = '515bf000-0000-0000-0000-000000000002')
         = '515bd000-0000-0000-0000-000000000001',
    'T1-5 FAIL: O2 deveria ter voltado para Novo';
  assert (select changed_by_type from public.opportunity_stage_history
           where opportunity_id = '515bf000-0000-0000-0000-000000000002'
           order by id desc limit 1) = 'automation',
    'T1-5 FAIL: a volta deveria ficar no histórico como automation';
  assert exists (select 1 from public.notifications n
                  where n.equipe_id = '515ba000-0000-0000-0000-000000000001'
                    and n.type = 'crm_followup_due'
                    and n.dedup_key = 'followup:' || v_fu.id::text
                    and n.user_id = '515bb000-0000-0000-0000-000000000001'
                    and n.title = 'Follow-up: Lead Dois'
                    and n.body = 'Sem orçamento'
                    and n.action_url = '/crm?tab=pipeline&opp=515bf000-0000-0000-0000-000000000002'),
    'T1-5 FAIL: o aviso ao dono do negócio não saiu como esperado';

  -- 6. return skipped when deal left the stage
  select * into v_fu from public.crm_followups where opportunity_id = '515bf000-0000-0000-0000-000000000003';
  assert v_fu.status = 'done' and v_fu.result->>'return' = 'skipped_left_stage',
    'T1-6 FAIL: O3 deveria estar done/skipped_left_stage, veio ' || v_fu.status || ' ' || v_fu.result::text;
  assert (select stage_id from public.opportunities where id = '515bf000-0000-0000-0000-000000000003')
         = '515bd000-0000-0000-0000-000000000003',
    'T1-6 FAIL: O3 foi arrastado de volta';
  assert exists (select 1 from public.notifications where dedup_key = 'followup:' || v_fu.id::text),
    'T1-6 FAIL: o aviso continua mesmo quando a volta é pulada';

  -- Rodar de novo não repete nada.
  r := public.crm_run_followups();
  assert (select count(*) from public.notifications
           where equipe_id = '515ba000-0000-0000-0000-000000000001' and type = 'crm_followup_due') = 2,
    'T1-5 FAIL: rodar de novo duplicou aviso';
end $$;

-- ============================================================================
-- 7. timers skip deals with a scheduled recycle followup
-- ============================================================================
-- O4 (recycle agendado) e O5 (sem follow-up) entraram no Reciclo há 20 dias (vencidos).
update public.opportunities set stage_entered_at = now() - interval '20 days'
 where id in ('515bf000-0000-0000-0000-000000000004', '515bf000-0000-0000-0000-000000000005');
update public.crm_followups set created_at = now() - interval '19 days'
 where opportunity_id = '515bf000-0000-0000-0000-000000000004';

do $$
declare r jsonb;
begin
  r := public.crm_run_timers(p_dry_run => true, p_equipe_id => '515ba000-0000-0000-0000-000000000001');
  assert not exists (select 1 from jsonb_array_elements(r->'details') d
                      where d->>'opportunity_id' = '515bf000-0000-0000-0000-000000000004'),
    'T1-7 FAIL: timers listou o negócio com recycle agendado: ' || r::text;
  assert exists (select 1 from jsonb_array_elements(r->'details') d
                  where d->>'kind' = 'recycle' and d->>'opportunity_id' = '515bf000-0000-0000-0000-000000000005'),
    'T1-7 FAIL: o negócio sem follow-up deveria seguir com o reciclo padrão: ' || r::text;

  -- "Manter no Reciclo" executado nesta passagem pela etapa: o padrão continua sem puxar.
  update public.crm_followups set due_at = now() - interval '1 minute'
   where opportunity_id = '515bf000-0000-0000-0000-000000000004' and status = 'scheduled';
  perform public.crm_run_followups();
  assert (select status from public.crm_followups where opportunity_id = '515bf000-0000-0000-0000-000000000004') = 'done',
    'T1-7 FAIL: o follow-up de O4 deveria estar done';
  assert (select stage_id from public.opportunities where id = '515bf000-0000-0000-0000-000000000004')
         = '515bd000-0000-0000-0000-000000000002',
    'T1-7 FAIL: "Manter no Reciclo" não deveria mover';
  r := public.crm_run_timers(p_dry_run => true, p_equipe_id => '515ba000-0000-0000-0000-000000000001');
  assert not exists (select 1 from jsonb_array_elements(r->'details') d
                      where d->>'opportunity_id' = '515bf000-0000-0000-0000-000000000004'),
    'T1-7 FAIL: timers puxou o negócio que ficou no Reciclo por regra própria: ' || r::text;
end $$;

-- ============================================================================
-- 8. claim pega o job de follow-up; finish grava result.message
-- ============================================================================
update public.outreach_jobs j set run_after = '2000-01-01T00:00:00Z'
  from public.crm_followups f
 where f.id = j.followup_id and f.opportunity_id = '515bf000-0000-0000-0000-000000000006';

do $$
declare v_job_id uuid; v_claimed uuid[]; v_status text;
begin
  select f.outreach_job_id into v_job_id from public.crm_followups f
   where f.opportunity_id = '515bf000-0000-0000-0000-000000000006';
  select array_agg(c.id) into v_claimed from public.crm_outreach_claim(1) c;
  assert v_job_id = any (v_claimed), 'T1-8 FAIL: o claim deveria pegar o job de follow-up';
  assert (select status from public.outreach_jobs where id = v_job_id) = 'running', 'T1-8 FAIL: job deveria estar running';

  v_status := public.crm_outreach_finish(v_job_id, 'sent', null,
                jsonb_build_object('provider', 'solo', 'rendered_message', 'Mensagem agendada'), false);
  assert v_status = 'sent', 'T1-8 FAIL: finish deveria devolver sent, veio ' || v_status;
  assert (select result->>'message' from public.crm_followups
           where opportunity_id = '515bf000-0000-0000-0000-000000000006') = 'sent',
    'T1-8 FAIL: result.message deveria ser sent';
end $$;

-- ============================================================================
-- 9. o check de forma de outreach_jobs
-- ============================================================================
do $$
begin
  begin
    insert into public.outreach_jobs (equipe_id, lead_id, run_after)
    values ('515ba000-0000-0000-0000-000000000001', '515be000-0000-0000-0000-000000000001', now());
    raise exception 'T1-9 FAIL: job sem inscrição e sem follow-up foi aceito';
  exception when check_violation then
    assert sqlerrm like '%outreach_jobs_kind_shape%', 'T1-9 FAIL: violou outro check: ' || sqlerrm;
  end;
  begin
    insert into public.outreach_jobs (equipe_id, lead_id, run_after, followup_id)
    select '515ba000-0000-0000-0000-000000000001', '515be000-0000-0000-0000-000000000001', now(), f.id
      from public.crm_followups f where f.opportunity_id = '515bf000-0000-0000-0000-000000000003';
    raise exception 'T1-9 FAIL: job de follow-up sem texto foi aceito';
  exception when check_violation then
    assert sqlerrm like '%outreach_jobs_kind_shape%', 'T1-9 FAIL: violou outro check: ' || sqlerrm;
  end;
end $$;

rollback;
select 'PASS' as result;
