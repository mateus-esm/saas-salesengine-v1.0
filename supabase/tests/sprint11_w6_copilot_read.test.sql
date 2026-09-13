-- Sprint 11 · Onda 6 · T62 — o negócio em resumo e onde focar.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w6_copilot_read.test.sql
--
-- O que este teste protege: "onde focar" traz quem pede atenção, na ordem da
-- pontuação, com o motivo de cada um — cliente esperando, cliente que escreveu
-- hoje, parado além do SLA, tarefa atrasada, sugestão esperando — e deixa de fora
-- o negócio quieto; a vendedora só vê os seus; o resumo do negócio traz o resumo
-- do Copilot, a origem, as tarefas, as pendências e as últimas ações; o vizinho
-- não lê nada.

begin;

-- @include supabase/migrations/20260914000100_sprint11_w6_copilot_queue.sql
-- @include supabase/migrations/20260914000200_sprint11_w6_copilot_apply.sql
-- @include supabase/migrations/20260914000500_sprint11_w6_copilot_read.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link, is_crm_agent_enabled) values
  ('5139a000-0000-0000-0000-000000000001', 'S11W6 Foco A', 'x', 'y', true),
  ('5139a000-0000-0000-0000-000000000002', 'S11W6 Foco B', 'x', 'y', true);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5139b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w6-foco.test', 'x', now(), now()),
  ('5139b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bia@s11w6-foco.test',   'x', now(), now()),
  ('5139b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viz@s11w6-foco.test',   'x', now(), now());
insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5139b000-0000-0000-0000-00000000000a', '5139b000-0000-0000-0000-00000000000a', 'chefe@s11w6-foco.test', '5139a000-0000-0000-0000-000000000001', 'Chefe', 'admin'),
  ('5139b000-0000-0000-0000-00000000000b', '5139b000-0000-0000-0000-00000000000b', 'bia@s11w6-foco.test',   '5139a000-0000-0000-0000-000000000001', 'Bia',   'user'),
  ('5139b000-0000-0000-0000-00000000000d', '5139b000-0000-0000-0000-00000000000d', 'viz@s11w6-foco.test',   '5139a000-0000-0000-0000-000000000002', 'Viz',   'admin')
on conflict (id) do update set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;
insert into public.user_roles (user_id, role) values
  ('5139b000-0000-0000-0000-00000000000a', 'admin'), ('5139b000-0000-0000-0000-00000000000d', 'admin')
on conflict do nothing;

insert into public.pipelines (id, equipe_id, name) values
  ('5139c000-0000-0000-0000-000000000001', '5139a000-0000-0000-0000-000000000001', 'Usinas');
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type, max_idle_hours) values
  ('5139d000-0000-0000-0000-000000000001', '5139a000-0000-0000-0000-000000000001', '5139c000-0000-0000-0000-000000000001', 'Novo',     0, 'open', 48),
  ('5139d000-0000-0000-0000-000000000002', '5139a000-0000-0000-0000-000000000001', '5139c000-0000-0000-0000-000000000001', 'Proposta', 1, 'open', null);

insert into public.leads (id, equipe_id, name) values
  ('5139e000-0000-0000-0000-000000000001', '5139a000-0000-0000-0000-000000000001', 'Esperando'),
  ('5139e000-0000-0000-0000-000000000002', '5139a000-0000-0000-0000-000000000001', 'Parado'),
  ('5139e000-0000-0000-0000-000000000003', '5139a000-0000-0000-0000-000000000001', 'Com sugestão'),
  ('5139e000-0000-0000-0000-000000000004', '5139a000-0000-0000-0000-000000000001', 'Quieto');
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, owner_id) values
  ('5139f000-0000-0000-0000-000000000001', '5139a000-0000-0000-0000-000000000001', '5139e000-0000-0000-0000-000000000001',
   '5139c000-0000-0000-0000-000000000001', '5139d000-0000-0000-0000-000000000002', 50000, '5139b000-0000-0000-0000-00000000000b'),
  ('5139f000-0000-0000-0000-000000000002', '5139a000-0000-0000-0000-000000000001', '5139e000-0000-0000-0000-000000000002',
   '5139c000-0000-0000-0000-000000000001', '5139d000-0000-0000-0000-000000000001', 10000, '5139b000-0000-0000-0000-00000000000a'),
  ('5139f000-0000-0000-0000-000000000003', '5139a000-0000-0000-0000-000000000001', '5139e000-0000-0000-0000-000000000003',
   '5139c000-0000-0000-0000-000000000001', '5139d000-0000-0000-0000-000000000002', 20000, '5139b000-0000-0000-0000-00000000000b'),
  ('5139f000-0000-0000-0000-000000000004', '5139a000-0000-0000-0000-000000000001', '5139e000-0000-0000-0000-000000000004',
   '5139c000-0000-0000-0000-000000000001', '5139d000-0000-0000-0000-000000000002', 90000, '5139b000-0000-0000-0000-00000000000a');
update public.opportunities set stage_entered_at = now() - interval '72 hours' where id = '5139f000-0000-0000-0000-000000000002';

insert into public.messages (lead_id, content, sender_type, created_at) values
  ('5139e000-0000-0000-0000-000000000001', 'Pode me mandar a proposta?', 'customer', now() - interval '2 hours'),
  ('5139e000-0000-0000-0000-000000000004', 'Obrigado!', 'customer', now() - interval '10 days'),
  ('5139e000-0000-0000-0000-000000000004', 'Por nada', 'member', now() - interval '10 days' + interval '1 minute');
insert into public.tasks (lead_id, title, due_date, status) values
  ('5139e000-0000-0000-0000-000000000002', 'Ligar', now() - interval '1 day', 'a_fazer');
insert into public.ai_decisions (equipe_id, lead_id, opportunity_id, pipeline_id, decision_type, agent_role, actor, status, output_action) values
  ('5139a000-0000-0000-0000-000000000001', '5139e000-0000-0000-0000-000000000003', '5139f000-0000-0000-0000-000000000003',
   '5139c000-0000-0000-0000-000000000001', 'copilot_action', 'copilot', 'copilot', 'pending_approval',
   '{"label": "Marcar como ganho", "why": "risky", "action": {"type": "set_outcome", "outcome": "won"}}'),
  ('5139a000-0000-0000-0000-000000000001', '5139e000-0000-0000-0000-000000000003', '5139f000-0000-0000-0000-000000000003',
   '5139c000-0000-0000-0000-000000000001', 'copilot_action', 'copilot', 'copilot', 'auto_applied',
   '{"label": "Nota: pediu desconto", "action": {"type": "note", "text": "pediu desconto"}}');
insert into public.copilot_memory (opportunity_id, equipe_id, summary) values
  ('5139f000-0000-0000-0000-000000000003', '5139a000-0000-0000-0000-000000000001', 'Pediu desconto de 5%.');

-- ============================================================================
-- 1. Onde focar, pelo chefe (vê a equipe).
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"5139b000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare f jsonb; first_row jsonb;
begin
  f := public.crm_focus_list();
  assert jsonb_array_length(f) = 3, 'T62-1 FAIL: 3 pedem atencao (o quieto fica de fora), veio ' || f::text;
  first_row := f->0;
  assert first_row->>'contact' = 'Esperando'
     and first_row->'reasons' ? 'cliente esperando resposta' and first_row->'reasons' ? 'cliente escreveu hoje'
     -- o valor conta em proporção ao maior negócio aberto (o quieto, de R$ 90 mil): 30 × 50/90 = 17
     and (first_row->>'score')::int = 25 + 35 + 17,
    'T62-1 FAIL: o cliente esperando vem primeiro, com os motivos, veio ' || first_row::text;
  assert (select x->'reasons' from jsonb_array_elements(f) x where x->>'contact' = 'Parado') ?& array['tarefa atrasada']
     and (select (x->'reasons'->>0) from jsonb_array_elements(f) x where x->>'contact' = 'Parado') like 'parado há 72 h (SLA 48 h)',
    'T62-1 FAIL: parado alem do SLA e tarefa atrasada, veio ' || f::text;
  assert (select x->'reasons' from jsonb_array_elements(f) x where x->>'contact' = 'Com sugestão') ? 'sugestão do Copilot esperando',
    'T62-1 FAIL: a sugestao esperando';
  assert not exists (select 1 from jsonb_array_elements(f) x where x->>'contact' = 'Quieto'),
    'T62-1 FAIL: o negocio quieto (de maior valor) nao pede atencao';
end $$;

-- ============================================================================
-- 2. A vendedora só vê os seus; o resumo do negócio.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5139b000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare f jsonb; b jsonb;
begin
  f := public.crm_focus_list();
  assert (select array_agg(x->>'contact' order by x->>'contact') from jsonb_array_elements(f) x) = array['Com sugestão', 'Esperando'],
    'T62-2 FAIL: a Bia so ve os seus, veio ' || f::text;

  b := public.crm_copilot_deal_brief('5139f000-0000-0000-0000-000000000003');
  assert b->>'summary' = 'Pediu desconto de 5%.' and b->'opportunity'->>'stage' = 'Proposta'
     and b->'opportunity'->>'owner' = 'Bia'
     and jsonb_array_length(b->'pending') = 1 and b->'pending'->0->>'label' = 'Marcar como ganho'
     and jsonb_array_length(b->'recent') = 1 and b->'recent'->0->>'label' = 'Nota: pediu desconto',
    'T62-2 FAIL: o resumo do negocio, veio ' || b::text;
end $$;

-- ============================================================================
-- 2b. A casa do Copilot: o que espera, o que foi feito, hoje — no escopo.
-- ============================================================================
do $$
declare f jsonb;
begin
  f := public.crm_copilot_feed();
  assert jsonb_array_length(f->'pending') = 1 and f->'pending'->0->>'contact' = 'Com sugestão'
     and f->'pending'->0->>'label' = 'Marcar como ganho' and f->'pending'->0->>'why' = 'risky',
    'T62-2b FAIL: a sugestao esperando, com o contato, veio ' || f::text;
  assert jsonb_array_length(f->'recent') = 1 and (f->'today'->>'applied')::int = 1,
    'T62-2b FAIL: o que foi feito hoje, veio ' || f::text;
end $$;

-- ============================================================================
-- 3. O vizinho não lê nada.
-- ============================================================================
set local request.jwt.claims = '{"sub":"5139b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean := false;
begin
  assert public.crm_focus_list() = '[]'::jsonb, 'T62-3 FAIL: o vizinho ve o foco da equipe A';
  assert jsonb_array_length(public.crm_copilot_feed()->'pending') = 0, 'T62-3 FAIL: o vizinho ve a casa do Copilot da equipe A';
  begin
    perform public.crm_copilot_deal_brief('5139f000-0000-0000-0000-000000000001');
  exception when others then v_failed := sqlerrm like '%opportunity_not_found%';
  end;
  assert v_failed, 'T62-3 FAIL: o vizinho leu o resumo de um negocio da equipe A';
end $$;

rollback;
select 'PASS' as result;
