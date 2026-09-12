-- Sprint 11 · Onda 5 · T55 — as naturezas Duração e Entradas da linha.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w5_line_natures.test.sql
--
-- O que este teste protege: a duração se grava (campanha com início e fim; datas
-- fora de ordem ou faltando são recusadas) e quem salva sem falar dela não a
-- apaga; a linha encerra no dia seguinte ao fim; o negócio novo nasce na linha
-- pedida, ou na padrão quando a campanha acabou, a linha foi apagada ou é de
-- outra equipe; só a edge pergunta; a linha da entrada vale para o número e o
-- agente, não para o manual, e a do webhook é a do webhook.

begin;

-- @include supabase/migrations/20260913000100_sprint11_w5_attribution.sql
-- @include supabase/migrations/20260913000200_sprint11_w5_campaigns.sql
-- @include supabase/migrations/20260913000400_sprint11_w5_line_natures.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5134a000-0000-0000-0000-000000000001', 'S11W5 Linha A', 'x', 'y'),
  ('5134a000-0000-0000-0000-000000000002', 'S11W5 Linha B', 'x', 'y'),
  ('5134a000-0000-0000-0000-000000000003', 'S11W5 Linha C sem padrão', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5134b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w5-linha.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5134b000-0000-0000-0000-00000000000a', '5134b000-0000-0000-0000-00000000000a', 'chefe@s11w5-linha.test', '5134a000-0000-0000-0000-000000000001', 'Chefe', 'admin')
on conflict (id) do update set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.user_roles (user_id, role) values ('5134b000-0000-0000-0000-00000000000a', 'admin') on conflict do nothing;

insert into public.pipelines (id, equipe_id, name) values
  ('5134c000-0000-0000-0000-000000000001', '5134a000-0000-0000-0000-000000000001', 'Padrão'),
  ('5134c000-0000-0000-0000-000000000002', '5134a000-0000-0000-0000-000000000001', 'Black Friday (acabou)'),
  ('5134c000-0000-0000-0000-000000000003', '5134a000-0000-0000-0000-000000000001', 'Verão (no ar)'),
  ('5134c000-0000-0000-0000-000000000004', '5134a000-0000-0000-0000-000000000001', 'Apagada'),
  ('5134c000-0000-0000-0000-000000000005', '5134a000-0000-0000-0000-000000000002', 'Do vizinho'),
  ('5134c000-0000-0000-0000-000000000006', '5134a000-0000-0000-0000-000000000003', 'Campanha sem padrão');

update public.pipelines set deleted_at = now() where id = '5134c000-0000-0000-0000-000000000004';
update public.equipes set default_pipeline_id = '5134c000-0000-0000-0000-000000000001' where id = '5134a000-0000-0000-0000-000000000001';
update public.equipes set default_pipeline_id = '5134c000-0000-0000-0000-000000000005' where id = '5134a000-0000-0000-0000-000000000002';

insert into public.webhook_configs (id, equipe_id, name, url, trigger_event, inbound_function, field_mappings, pipeline_id) values
  ('5134c000-0000-0000-0000-0000000000f1', '5134a000-0000-0000-0000-000000000001', 'Form BF',  'inbound', 'lead_received', 'receive_lead', '[]', '5134c000-0000-0000-0000-000000000002'),
  ('5134c000-0000-0000-0000-0000000000f2', '5134a000-0000-0000-0000-000000000001', 'Form sem linha', 'inbound', 'lead_received', 'receive_lead', '[]', null);

insert into public.crm_entries (id, equipe_id, kind, name) values
  ('5134e000-0000-0000-0000-000000000001', '5134a000-0000-0000-0000-000000000001', 'whatsapp', 'WhatsApp · Loja'),
  ('5134e000-0000-0000-0000-000000000002', '5134a000-0000-0000-0000-000000000001', 'manual', 'Manual');
-- Uma entrada de webhook com linha própria gravada: a do webhook (nenhuma) é que vale.
update public.crm_entries set pipeline_id = '5134c000-0000-0000-0000-000000000003'
 where webhook_config_id = '5134c000-0000-0000-0000-0000000000f2';

set local role authenticated;
set local request.jwt.claims = '{"sub":"5134b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Gravar a duração.
-- ============================================================================
do $$
declare v jsonb; v_failed boolean;
begin
  v := public.crm_save_pipeline_natures('5134c000-0000-0000-0000-000000000002', jsonb_build_object(
         'offer', jsonb_build_object('mode', 'free'), 'process', jsonb_build_object('mode', 'direct'),
         'duration', jsonb_build_object('mode', 'campaign',
                                        'starts_on', ((now() at time zone 'America/Sao_Paulo')::date - 30)::text,
                                        'ends_on',   ((now() at time zone 'America/Sao_Paulo')::date - 1)::text)));
  assert v->'duration'->>'mode' = 'campaign'
         and (v->'duration'->>'ends_on')::date = (now() at time zone 'America/Sao_Paulo')::date - 1,
    'T55-1 FAIL: a campanha com inicio e fim, veio ' || v::text;

  -- Quem salva sem falar da duração (Track Shaper, tela antiga) não a apaga.
  v := public.crm_save_pipeline_natures('5134c000-0000-0000-0000-000000000002',
         '{"offer":{"mode":"free"},"process":{"mode":"milestones","milestones":["qualified"]}}');
  assert v->'duration'->>'mode' = 'campaign' and v->'process'->'milestones' = '["qualified"]'::jsonb,
    'T55-1 FAIL: salvar sem a duracao apagou a duracao, veio ' || v::text;

  v := public.crm_save_pipeline_natures('5134c000-0000-0000-0000-000000000003', jsonb_build_object(
         'duration', jsonb_build_object('mode', 'campaign',
                                        'starts_on', ((now() at time zone 'America/Sao_Paulo')::date - 5)::text,
                                        'ends_on',   ((now() at time zone 'America/Sao_Paulo')::date)::text)));
  assert v->'duration'->>'mode' = 'campaign', 'T55-1 FAIL: a campanha que termina hoje';

  v := public.crm_save_pipeline_natures('5134c000-0000-0000-0000-000000000001', '{"duration":{"mode":"continuous","ends_on":"2026-01-01"}}');
  assert v->'duration' = '{"mode":"continuous"}'::jsonb, 'T55-1 FAIL: continua nao guarda datas, veio ' || v::text;

  foreach v in array array[
    '{"duration":{"mode":"campaign","starts_on":"2026-09-10","ends_on":"2026-09-01"}}'::jsonb,
    '{"duration":{"mode":"campaign","starts_on":"2026-09-10"}}'::jsonb,
    '{"duration":{"mode":"campaign","starts_on":"2026-09-10","ends_on":"2026-02-30"}}'::jsonb] loop
    v_failed := false;
    begin
      perform public.crm_save_pipeline_natures('5134c000-0000-0000-0000-000000000001', v);
    exception when others then v_failed := sqlerrm like '%invalid_duration%';
    end;
    assert v_failed, 'T55-1 FAIL: duracao invalida aceita: ' || v::text;
  end loop;

  v_failed := false;
  begin
    perform public.crm_save_pipeline_natures('5134c000-0000-0000-0000-000000000001', '{"duration":{"mode":"sazonal"}}');
  exception when others then v_failed := sqlerrm like '%invalid_natures%';
  end;
  assert v_failed, 'T55-1 FAIL: modo de duracao desconhecido aceito';
end $$;

-- ============================================================================
-- 2. Quando a linha encerra: no dia seguinte ao fim.
-- ============================================================================
do $$
begin
  assert public._crm_line_closed((select natures from public.pipelines where id = '5134c000-0000-0000-0000-000000000002')),
    'T55-2 FAIL: a Black Friday acabou ontem';
  assert not public._crm_line_closed((select natures from public.pipelines where id = '5134c000-0000-0000-0000-000000000003')),
    'T55-2 FAIL: o Verao termina hoje, ainda recebe';
  assert not public._crm_line_closed('{"duration":{"mode":"continuous"}}') and not public._crm_line_closed('{}')
     and not public._crm_line_closed('{"duration":{"mode":"campaign","ends_on":"lixo"}}'),
    'T55-2 FAIL: continua, vazia ou data lixo nao encerram';
end $$;

-- ============================================================================
-- 3. Em que linha nasce o negócio novo. Só a edge pergunta.
-- ============================================================================
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.crm_intake_pipeline('5134a000-0000-0000-0000-000000000001', '5134c000-0000-0000-0000-000000000003');
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T55-3 FAIL: o app nao pergunta a linha de entrada';
end $$;

reset role;
set local role service_role;
do $$
declare
  a constant uuid := '5134a000-0000-0000-0000-000000000001';
  v_default constant uuid := '5134c000-0000-0000-0000-000000000001';
begin
  assert public.crm_intake_pipeline(a, null) = v_default, 'T55-3 FAIL: sem linha, a padrao';
  assert public.crm_intake_pipeline(a, '5134c000-0000-0000-0000-000000000003') = '5134c000-0000-0000-0000-000000000003',
    'T55-3 FAIL: a campanha no ar recebe';
  assert public.crm_intake_pipeline(a, '5134c000-0000-0000-0000-000000000002') = v_default,
    'T55-3 FAIL: a campanha que acabou manda para a padrao';
  assert public.crm_intake_pipeline(a, '5134c000-0000-0000-0000-000000000004') = v_default,
    'T55-3 FAIL: a linha apagada manda para a padrao';
  assert public.crm_intake_pipeline(a, '5134c000-0000-0000-0000-000000000005') = v_default,
    'T55-3 FAIL: a linha do vizinho nunca recebe o negocio da equipe A';

  -- A padrão encerrada continua recebendo: não há para onde mandar.
  update public.pipelines set natures = (select natures from public.pipelines where id = '5134c000-0000-0000-0000-000000000002')
   where id = v_default;
  assert public.crm_intake_pipeline(a, null) = v_default and public.crm_intake_pipeline(a, v_default) = v_default,
    'T55-3 FAIL: a padrao encerrada segue recebendo';

  -- Sem linha padrão, a campanha que acabou ainda é a única saída.
  update public.pipelines set natures = (select natures from public.pipelines where id = '5134c000-0000-0000-0000-000000000002')
   where id = '5134c000-0000-0000-0000-000000000006';
  assert public.crm_intake_pipeline('5134a000-0000-0000-0000-000000000003', '5134c000-0000-0000-0000-000000000006')
         = '5134c000-0000-0000-0000-000000000006',
    'T55-3 FAIL: sem padrao, a linha pedida';
  assert public.crm_intake_pipeline('5134a000-0000-0000-0000-000000000003', null) is null,
    'T55-3 FAIL: sem padrao e sem linha, nenhuma';
end $$;
reset role;

-- ============================================================================
-- 4. A linha de cada entrada.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5134b000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare l jsonb; e jsonb;
begin
  e := public.crm_save_entry('5134e000-0000-0000-0000-000000000001', '{"pipeline_id":"5134c000-0000-0000-0000-000000000003"}');
  assert e->>'pipeline_id' = '5134c000-0000-0000-0000-000000000003', 'T55-4 FAIL: o numero de WhatsApp ganha linha';

  e := public.crm_save_entry('5134e000-0000-0000-0000-000000000002', '{"pipeline_id":"5134c000-0000-0000-0000-000000000003"}');
  assert e->>'pipeline_id' is null, 'T55-4 FAIL: o manual escolhe a linha no cadastro, nao na entrada';

  l := public.crm_entry_list();
  assert (select x->>'pipeline_name' from jsonb_array_elements(l) x where x->>'id' = '5134e000-0000-0000-0000-000000000001') = 'Verão (no ar)',
    'T55-4 FAIL: a lista traz a linha do numero, veio ' || l::text;
  assert (select x->>'pipeline_name' from jsonb_array_elements(l) x
           where x->>'webhook_config_id' = '5134c000-0000-0000-0000-0000000000f1') = 'Black Friday (acabou)',
    'T55-4 FAIL: a do webhook e a do webhook';
  assert (select x->'pipeline_id' from jsonb_array_elements(l) x
           where x->>'webhook_config_id' = '5134c000-0000-0000-0000-0000000000f2') = 'null'::jsonb,
    'T55-4 FAIL: webhook sem linha cai na padrao, mesmo com linha gravada na entrada';
end $$;

rollback;
select 'PASS' as result;
