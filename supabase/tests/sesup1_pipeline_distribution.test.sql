-- SE-SUP1-8 (#17) — Roleta: pipeline_distribution + crm_assign_next no INSERT.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sesup1_pipeline_distribution.test.sql
-- (BEGIN…ROLLBACK; a migration é recriada dentro da transação. NÃO executado pelo
--  implementador: a regra da sprint proíbe escrita em produção.)
--
-- O que protege:
--   1. crm_save_pipeline_distribution: membro de outra equipe, regra com grupo fora
--      da roleta, ativa sem membros -> recusa; pipeline de outra equipe -> P0002
--   2. rodízio na ordem da lista; run 'assigned' com motivo; histórico de dono com
--      source='distribution' e reason; contato sem dono recebe o vendedor
--   3. contato com responsável / dono explícito / negócio já ganho -> roleta não age
--   4. por peso 2:1 -> 4 e 2 em seis negócios
--   5. limite de abertos pula quem chegou nele; todos no limite -> sem dono + 'no_candidate'
--   6. ausente pulado com skip_away; recebe sem skip_away
--   7. por regra: origem (sem caixa/espaço), campo personalizado, padrão; grupo todo
--      ausente cai no padrão dizendo por quê; origin_category (preenchido depois do
--      INSERT) é recusado ao salvar e, numa regra legada, nunca casa nem quebra
--   8. erro dentro da roleta NUNCA bloqueia: negócio criado sem dono + run 'error'
--   9. RLS: outra equipe não lê a roleta nem as decisões

begin;
-- @include supabase/migrations/20261015000800_sesup1_pipeline_distribution.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5e900000-0000-0000-0000-00000000000a', 'RoletaA', 'x', 'y'),
  ('5e900000-0000-0000-0000-00000000000b', 'RoletaB', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5e9b0000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a1@sesup1-roleta.test', 'x', now(), now()),
  ('5e9b0000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a2@sesup1-roleta.test', 'x', now(), now()),
  ('5e9b0000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a3@sesup1-roleta.test', 'x', now(), now()),
  ('5e9b0000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b1@sesup1-roleta.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5e9b0000-0000-0000-0000-0000000000a1', '5e9b0000-0000-0000-0000-0000000000a1', 'a1@sesup1-roleta.test', '5e900000-0000-0000-0000-00000000000a', 'Ana',   'user'),
  ('5e9b0000-0000-0000-0000-0000000000a2', '5e9b0000-0000-0000-0000-0000000000a2', 'a2@sesup1-roleta.test', '5e900000-0000-0000-0000-00000000000a', 'Bruno', 'user'),
  ('5e9b0000-0000-0000-0000-0000000000a3', '5e9b0000-0000-0000-0000-0000000000a3', 'a3@sesup1-roleta.test', '5e900000-0000-0000-0000-00000000000a', 'Caio',  'user'),
  ('5e9b0000-0000-0000-0000-0000000000b1', '5e9b0000-0000-0000-0000-0000000000b1', 'b1@sesup1-roleta.test', '5e900000-0000-0000-0000-00000000000b', 'Beto',  'user')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role, nome_completo = excluded.nome_completo;

-- Um pipeline por cenário (contadores e limites independentes).
insert into public.pipelines (id, equipe_id, name, loss_reasons, custom_fields_schema)
select ('5e9c0000-0000-0000-0000-00000000000' || n)::uuid, '5e900000-0000-0000-0000-00000000000a'::uuid, 'P' || n, '[]'::jsonb,
       '[{"field_id":"f1","key":"imovel","label":"Tipo de imóvel","type":"text","is_deleted":false}]'::jsonb
  from generate_series(1, 6) n;
insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type)
select ('5e9d0000-0000-0000-0000-0000000000' || n || '1')::uuid, '5e900000-0000-0000-0000-00000000000a'::uuid,
       ('5e9c0000-0000-0000-0000-00000000000' || n)::uuid, 'Novo', 0, 'open'
  from generate_series(1, 6) n
union all
select ('5e9d0000-0000-0000-0000-0000000000' || n || '2')::uuid, '5e900000-0000-0000-0000-00000000000a'::uuid,
       ('5e9c0000-0000-0000-0000-00000000000' || n)::uuid, 'Ganho', 1, 'won'
  from generate_series(1, 6) n;

-- Cria N negócios sem dono (um lead novo cada) e devolve os donos na ordem.
create or replace function pg_temp.spawn(p_pipe int, p_n int, p_origem text default null, p_custom jsonb default '{}'::jsonb)
returns uuid[] language plpgsql as $$
declare v_lead uuid; v_opp uuid; v_out uuid[] := '{}';
begin
  for i in 1..p_n loop
    insert into public.leads (equipe_id, name, origem)
    values ('5e900000-0000-0000-0000-00000000000a', 'L' || p_pipe || '-' || i, p_origem)
    returning id into v_lead;
    insert into public.opportunities (equipe_id, lead_id, pipeline_id, stage_id, custom_data)
    values ('5e900000-0000-0000-0000-00000000000a', v_lead, ('5e9c0000-0000-0000-0000-00000000000' || p_pipe)::uuid,
            ('5e9d0000-0000-0000-0000-0000000000' || p_pipe || '1')::uuid, p_custom)
    returning id into v_opp;
    v_out := v_out || (select owner_id from public.opportunities where id = v_opp);
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- 1. o verbo --
set local role authenticated;
set local request.jwt.claims = '{"sub":"5e9b0000-0000-0000-0000-0000000000a1","role":"authenticated"}';

do $$
declare v jsonb;
begin
  begin
    perform public.crm_save_pipeline_distribution('5e9c0000-0000-0000-0000-000000000001',
      '{"active":true,"members":[{"user_id":"5e9b0000-0000-0000-0000-0000000000b1"}]}');
    raise exception 'FALHA: membro de outra equipe aceito';
  exception when sqlstate '23514' then assert sqlerrm like 'member_not_in_team%', sqlerrm;
  end;
  begin
    perform public.crm_save_pipeline_distribution('5e9c0000-0000-0000-0000-000000000001', '{"active":true,"members":[]}');
    raise exception 'FALHA: ativa sem membros';
  exception when sqlstate '22023' then assert sqlerrm like 'no_members%', sqlerrm;
  end;
  begin
    perform public.crm_save_pipeline_distribution('5e9c0000-0000-0000-0000-000000000001',
      '{"mode":"by_rule","active":true,"members":[{"user_id":"5e9b0000-0000-0000-0000-0000000000a1"}],
        "rules":[{"field":"origem","value":"Site","user_ids":["5e9b0000-0000-0000-0000-0000000000a2"]}]}');
    raise exception 'FALHA: grupo fora da roleta';
  exception when sqlstate '22023' then assert sqlerrm like 'invalid_rule_group:1%', sqlerrm;
  end;
  begin
    perform public.crm_save_pipeline_distribution('5e9c0000-0000-0000-0000-000000000001',
      '{"mode":"by_rule","members":[{"user_id":"5e9b0000-0000-0000-0000-0000000000a1"}],
        "rules":[{"field":"leads.phone","value":"x","user_ids":["5e9b0000-0000-0000-0000-0000000000a1"]}]}');
    raise exception 'FALHA: campo fora da lista';
  exception when sqlstate '22023' then assert sqlerrm like 'invalid_rule_field:1%', sqlerrm;
  end;
  -- Campo preenchido só depois do INSERT (primeiro toque) não é aceito numa regra.
  begin
    perform public.crm_save_pipeline_distribution('5e9c0000-0000-0000-0000-000000000001',
      '{"mode":"by_rule","members":[{"user_id":"5e9b0000-0000-0000-0000-0000000000a1"}],
        "rules":[{"field":"origin_category","value":"paid_social","user_ids":["5e9b0000-0000-0000-0000-0000000000a1"]}]}');
    raise exception 'FALHA: origin_category aceito';
  exception when sqlstate '22023' then assert sqlerrm like 'invalid_rule_field:1%', sqlerrm;
  end;

  -- Rodízio Ana, Bruno (Ana repetida é descartada; peso fora de faixa vira 1..100).
  v := public.crm_save_pipeline_distribution('5e9c0000-0000-0000-0000-000000000001',
    '{"mode":"round_robin","active":true,"members":[
       {"user_id":"5e9b0000-0000-0000-0000-0000000000a1","weight":500},
       {"user_id":"5e9b0000-0000-0000-0000-0000000000a2"},
       {"user_id":"5e9b0000-0000-0000-0000-0000000000a1"}]}');
  assert jsonb_array_length(v->'members') = 2, 'sem repetição: ' || v::text;
  assert (v->'members'->0->>'weight')::int = 100, 'peso limitado';
  assert not (v ? 'state'), 'contadores não saem do banco';
end $$;

-- Outra equipe: não grava nem lê.
set local request.jwt.claims = '{"sub":"5e9b0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
begin
  begin
    perform public.crm_save_pipeline_distribution('5e9c0000-0000-0000-0000-000000000001', '{"active":false}');
    raise exception 'FALHA: pipeline de outra equipe';
  exception when sqlstate 'P0002' then null;
  end;
  assert (select count(*) from public.pipeline_distribution) = 0, 'RLS: roleta da A invisível para B';
end $$;

reset role;

-- O restante como postgres (o INSERT de webhook/importação não tem auth.uid()).
insert into public.pipeline_distribution (pipeline_id, equipe_id, mode, members, rules, max_open_per_seller, skip_away, active) values
  ('5e9c0000-0000-0000-0000-000000000002', '5e900000-0000-0000-0000-00000000000a', 'weighted',
   '[{"user_id":"5e9b0000-0000-0000-0000-0000000000a1","weight":2},{"user_id":"5e9b0000-0000-0000-0000-0000000000a2","weight":1}]', '[]', null, true, true),
  ('5e9c0000-0000-0000-0000-000000000003', '5e900000-0000-0000-0000-00000000000a', 'round_robin',
   '[{"user_id":"5e9b0000-0000-0000-0000-0000000000a1"},{"user_id":"5e9b0000-0000-0000-0000-0000000000a2"}]', '[]', 1, true, true),
  ('5e9c0000-0000-0000-0000-000000000004', '5e900000-0000-0000-0000-00000000000a', 'round_robin',
   '[{"user_id":"5e9b0000-0000-0000-0000-0000000000a1","away":true},{"user_id":"5e9b0000-0000-0000-0000-0000000000a2"}]', '[]', null, true, true),
  ('5e9c0000-0000-0000-0000-000000000005', '5e900000-0000-0000-0000-00000000000a', 'by_rule',
   '[{"user_id":"5e9b0000-0000-0000-0000-0000000000a1"},{"user_id":"5e9b0000-0000-0000-0000-0000000000a2"},{"user_id":"5e9b0000-0000-0000-0000-0000000000a3","away":true}]',
   '[{"field":"origem","value":"Indicação","user_ids":["5e9b0000-0000-0000-0000-0000000000a2"]},
     {"field":"custom:f1","value":"Casa","user_ids":["5e9b0000-0000-0000-0000-0000000000a1"]},
     {"field":"source","value":"Feira","user_ids":["5e9b0000-0000-0000-0000-0000000000a3"]},
     {"field":"origin_category","value":"paid_social","user_ids":["5e9b0000-0000-0000-0000-0000000000a3"]}]', null, true, true),
  ('5e9c0000-0000-0000-0000-000000000006', '5e900000-0000-0000-0000-00000000000a', 'round_robin',
   '[{"user_id":"5e9b0000-0000-0000-0000-0000000000a1"}]', '[]', null, true, true);

do $$
declare
  v_owners uuid[];
  v_a1 constant uuid := '5e9b0000-0000-0000-0000-0000000000a1';
  v_a2 constant uuid := '5e9b0000-0000-0000-0000-0000000000a2';
  v_a3 constant uuid := '5e9b0000-0000-0000-0000-0000000000a3';
  v_lead uuid;
  v_opp  uuid;
begin
  -- 2. rodízio
  v_owners := pg_temp.spawn(1, 3);
  assert v_owners = array[v_a1, v_a2, v_a1], 'rodízio na ordem: ' || v_owners::text;
  assert (select count(*) from public.pipeline_distribution_runs
           where pipeline_id = '5e9c0000-0000-0000-0000-000000000001' and status = 'assigned' and reason = 'rodízio') = 3, 'runs com motivo';
  assert (select count(*) from public.opportunity_owner_history h
            join public.opportunities o on o.id = h.opportunity_id
           where o.pipeline_id = '5e9c0000-0000-0000-0000-000000000001'
             and h.source = 'distribution' and h.reason = 'rodízio') = 3, 'histórico de dono com o motivo';
  assert (select count(*) from public.leads l join public.opportunities o on o.lead_id = l.id
           where o.pipeline_id = '5e9c0000-0000-0000-0000-000000000001' and l.responsible_id = o.owner_id) = 3, 'contato recebe o vendedor';

  -- 3. não age: contato com dono, dono explícito, negócio ganho
  insert into public.leads (equipe_id, name, responsible_id) values ('5e900000-0000-0000-0000-00000000000a', 'Com dono', v_a3) returning id into v_lead;
  insert into public.opportunities (equipe_id, lead_id, pipeline_id, stage_id)
  values ('5e900000-0000-0000-0000-00000000000a', v_lead, '5e9c0000-0000-0000-0000-000000000001', '5e9d0000-0000-0000-0000-000000000011')
  returning id into v_opp;
  assert (select owner_id from public.opportunities where id = v_opp) = v_a3, 'contato com dono mantém o dono';
  assert not exists (select 1 from public.pipeline_distribution_runs where opportunity_id = v_opp), 'sem run';

  insert into public.leads (equipe_id, name) values ('5e900000-0000-0000-0000-00000000000a', 'Explícito') returning id into v_lead;
  insert into public.opportunities (equipe_id, lead_id, pipeline_id, stage_id, owner_id)
  values ('5e900000-0000-0000-0000-00000000000a', v_lead, '5e9c0000-0000-0000-0000-000000000001', '5e9d0000-0000-0000-0000-000000000011', v_a3)
  returning id into v_opp;
  assert not exists (select 1 from public.pipeline_distribution_runs where opportunity_id = v_opp), 'dono explícito: sem run';

  insert into public.leads (equipe_id, name) values ('5e900000-0000-0000-0000-00000000000a', 'Já ganho') returning id into v_lead;
  insert into public.opportunities (equipe_id, lead_id, pipeline_id, stage_id)
  values ('5e900000-0000-0000-0000-00000000000a', v_lead, '5e9c0000-0000-0000-0000-000000000001', '5e9d0000-0000-0000-0000-000000000012')
  returning id into v_opp;
  assert (select owner_id from public.opportunities where id = v_opp) is null, 'negócio ganho não entra na roleta';

  -- 4. peso 2:1
  v_owners := pg_temp.spawn(2, 6);
  assert (select count(*) from unnest(v_owners) u where u = v_a1) = 4, 'peso 2 recebe 4: ' || v_owners::text;
  assert (select count(*) from unnest(v_owners) u where u = v_a2) = 2, 'peso 1 recebe 2';
  assert (select reason from public.pipeline_distribution_runs
           where pipeline_id = '5e9c0000-0000-0000-0000-000000000002' order by id limit 1) = 'por peso (2)', 'motivo com o peso';

  -- 5. limite 1: Ana, Bruno, depois ninguém
  v_owners := pg_temp.spawn(3, 3);
  assert v_owners[1] = v_a1 and v_owners[2] = v_a2 and v_owners[3] is null, 'limite: ' || v_owners::text;
  assert (select status from public.pipeline_distribution_runs
           where pipeline_id = '5e9c0000-0000-0000-0000-000000000003' order by id desc limit 1) = 'no_candidate', 'sem candidato registrado';
  assert (select reason from public.pipeline_distribution_runs
           where pipeline_id = '5e9c0000-0000-0000-0000-000000000003' order by id desc limit 1) like '%2 no limite%', 'motivo diz quantos no limite';

  -- 6. ausente pulado; sem "pular ausentes", recebe
  v_owners := pg_temp.spawn(4, 2);
  assert v_owners = array[v_a2, v_a2], 'Ana ausente pulada: ' || v_owners::text;
  update public.pipeline_distribution set skip_away = false where pipeline_id = '5e9c0000-0000-0000-0000-000000000004';
  v_owners := pg_temp.spawn(4, 2);
  assert v_a1 = any(v_owners), 'sem pular ausentes, Ana recebe';

  -- 7. por regra
  v_owners := pg_temp.spawn(5, 1, ' indicação ');
  assert v_owners[1] = v_a2, 'origem casa sem caixa/espaço';
  assert (select reason from public.pipeline_distribution_runs
           where pipeline_id = '5e9c0000-0000-0000-0000-000000000005' order by id desc limit 1) = 'regra 1: origem=Indicação', 'motivo da regra';
  v_owners := pg_temp.spawn(5, 1, null, '{"f1":"Casa"}');
  assert v_owners[1] = v_a1, 'campo personalizado';
  assert (select reason from public.pipeline_distribution_runs
           where pipeline_id = '5e9c0000-0000-0000-0000-000000000005' order by id desc limit 1) = 'regra 2: Tipo de imóvel=Casa', 'rótulo do campo';
  v_owners := pg_temp.spawn(5, 1, 'Google');
  assert v_owners[1] is not null and v_owners[1] <> v_a3, 'padrão: rodízio entre os presentes';
  assert (select reason from public.pipeline_distribution_runs
           where pipeline_id = '5e9c0000-0000-0000-0000-000000000005' order by id desc limit 1) like 'padrão%', 'motivo padrão';
  -- Grupo da regra 3 (só Caio, ausente) -> cai no padrão, dizendo por quê.
  insert into public.leads (equipe_id, name, source) values ('5e900000-0000-0000-0000-00000000000a', 'Feira', 'Feira') returning id into v_lead;
  insert into public.opportunities (equipe_id, lead_id, pipeline_id, stage_id)
  values ('5e900000-0000-0000-0000-00000000000a', v_lead, '5e9c0000-0000-0000-0000-000000000005', '5e9d0000-0000-0000-0000-000000000051')
  returning id into v_opp;
  assert (select owner_id from public.opportunities where id = v_opp) in (v_a1, v_a2), 'fallback para o padrão';
  assert (select reason from public.pipeline_distribution_runs where opportunity_id = v_opp) like 'regra 3: fonte=Feira — grupo indisponível, padrão%', 'motivo do fallback';

  -- Regra antiga gravada com campo removido (origin_category): não quebra, só não casa.
  insert into public.leads (equipe_id, name, origin_category) values ('5e900000-0000-0000-0000-00000000000a', 'Legado', 'paid_social') returning id into v_lead;
  insert into public.opportunities (equipe_id, lead_id, pipeline_id, stage_id)
  values ('5e900000-0000-0000-0000-00000000000a', v_lead, '5e9c0000-0000-0000-0000-000000000005', '5e9d0000-0000-0000-0000-000000000051')
  returning id into v_opp;
  assert (select status from public.pipeline_distribution_runs where opportunity_id = v_opp) = 'assigned', 'regra legada não vira erro';
  assert (select reason from public.pipeline_distribution_runs where opportunity_id = v_opp) like 'padrão%', 'regra legada não casa: cai no padrão';

  -- 8. erro dentro da roleta não bloqueia
  update public.pipeline_distribution set state = jsonb_build_object('all:' || v_a1::text, 'x')
   where pipeline_id = '5e9c0000-0000-0000-0000-000000000006';
  v_owners := pg_temp.spawn(6, 1);
  assert v_owners[1] is null, 'sem dono quando a roleta quebra';
  assert (select status from public.pipeline_distribution_runs
           where pipeline_id = '5e9c0000-0000-0000-0000-000000000006' order by id desc limit 1) = 'error', 'erro registrado';
  assert (select count(*) from public.opportunities where pipeline_id = '5e9c0000-0000-0000-0000-000000000006') = 1, 'negócio criado mesmo assim';
end $$;

-- 9. RLS das decisões
set local role authenticated;
set local request.jwt.claims = '{"sub":"5e9b0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.pipeline_distribution_runs) = 0, 'B não lê as decisões da A';
end $$;
set local request.jwt.claims = '{"sub":"5e9b0000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$
begin
  assert (select count(*) from public.pipeline_distribution_runs) > 0, 'A lê as próprias decisões';
end $$;

rollback;
select 'PASS' as result;
