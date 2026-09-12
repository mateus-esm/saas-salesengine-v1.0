-- Sprint 11 · Onda 2 · T12 — filtros v2 no servidor.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w2_filters.test.sql
--
-- O que este teste protege: cada operador de campo personalizado corta o que diz
-- que corta, para cada tipo de campo; valor malformado gravado no banco nunca
-- derruba o Kanban (não bate, e pronto); os baldes de "próximo contato" usam o dia
-- de São Paulo; o filtro da Base de Contatos (crm_lead_matches) enxerga a situação
-- do contato pelos negócios dele; e um tenant não conta os contatos do outro.

begin;

-- @include supabase/migrations/20260910000100_sprint11_opportunity_owner.sql
-- @include supabase/migrations/20260910000200_sprint11_crm_board.sql
-- @include supabase/migrations/20260911000100_sprint11_w2_filters.sql
-- @include supabase/migrations/20260912000100_sprint11_w3_outcome.sql
-- @include supabase/migrations/20260912000200_sprint11_w3_catalog.sql
-- @include supabase/migrations/20260912000300_sprint11_w3_items.sql
-- @include supabase/migrations/20260912000400_sprint11_w3_revenue.sql
-- @include supabase/migrations/20260912000500_sprint11_w3_contact_situation.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5114a000-0000-0000-0000-000000000001', 'S11W2 Filtros A', 'x', 'y'),
  ('5114a000-0000-0000-0000-000000000002', 'S11W2 Filtros B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5114b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w2-filtros.test',    'x', now(), now()),
  ('5114b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor@s11w2-filtros.test', 'x', now(), now()),
  ('5114b000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outro@s11w2-filtros.test',    'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5114b000-0000-0000-0000-00000000000a', '5114b000-0000-0000-0000-00000000000a', 'chefe@s11w2-filtros.test',    '5114a000-0000-0000-0000-000000000001', 'Chefe A',    'admin'),
  ('5114b000-0000-0000-0000-00000000000b', '5114b000-0000-0000-0000-00000000000b', 'vendedor@s11w2-filtros.test', '5114a000-0000-0000-0000-000000000001', 'Vendedor A', 'user'),
  ('5114b000-0000-0000-0000-00000000000c', '5114b000-0000-0000-0000-00000000000c', 'outro@s11w2-filtros.test',    '5114a000-0000-0000-0000-000000000002', 'Outro B',    'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

-- Pipeline P (campos personalizados) e pipeline P2 (negócios dos contatos do bloco B).
-- Campos: sel (seleção) · mul (multi-seleção) · usr (usuário) · num (número) ·
-- cur (moeda) · dat (data) · boo (sim/não) · txt (texto).
insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5114c000-0000-0000-0000-000000000001', '5114a000-0000-0000-0000-000000000001', 'Filtros S11W2', jsonb_build_array(
     jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000001', 'key', 'fonte',        'label', 'Fonte',        'type', 'select',       'required', false, 'position', 0, 'options', jsonb_build_array('Indicação', 'Site', 'Meta')),
     jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000002', 'key', 'produtos',     'label', 'Produtos',     'type', 'multi_select', 'required', false, 'position', 1, 'options', jsonb_build_array('Bateria', 'Carregador', 'Módulo')),
     jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000003', 'key', 'pre_vendedor', 'label', 'Pré-vendedor', 'type', 'user',         'required', false, 'position', 2),
     jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000004', 'key', 'potencia',     'label', 'Potência',     'type', 'number',       'required', false, 'position', 3),
     jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000005', 'key', 'ticket',       'label', 'Ticket',       'type', 'currency',     'required', false, 'position', 4),
     jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000006', 'key', 'visita',       'label', 'Visita',       'type', 'date',         'required', false, 'position', 5),
     jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000007', 'key', 'bateria',      'label', 'Bateria',      'type', 'boolean',      'required', false, 'position', 6),
     jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000008', 'key', 'obs',          'label', 'Obs',          'type', 'text',         'required', false, 'position', 7)
  )),
  ('5114c000-0000-0000-0000-000000000002', '5114a000-0000-0000-0000-000000000001', 'Contatos S11W2', '[]'::jsonb),
  ('5114c000-0000-0000-0000-000000000009', '5114a000-0000-0000-0000-000000000002', 'Vizinho S11W2',  '[]'::jsonb);

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5114d000-0000-0000-0000-000000000001', '5114a000-0000-0000-0000-000000000001', '5114c000-0000-0000-0000-000000000001', 'Entrada',  0, 'open'),
  ('5114d000-0000-0000-0000-000000000002', '5114a000-0000-0000-0000-000000000001', '5114c000-0000-0000-0000-000000000002', 'Contatos', 0, 'open'),
  ('5114d000-0000-0000-0000-000000000009', '5114a000-0000-0000-0000-000000000002', '5114c000-0000-0000-0000-000000000009', 'Vizinho',  0, 'open');

-- Bloco A: 8 contatos, cada um com um negócio aberto no pipeline P, sem responsável.
-- O próximo contato do lead 1..4 é ontem, hoje, daqui a 3 dias e daqui a 10 dias
-- (dia de São Paulo); 5..8 não têm.
insert into public.leads (id, equipe_id, name, next_contact)
select ('5114e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5114a000-0000-0000-0000-000000000001',
       'Filtro ' || i,
       case i
         when 1 then (now() at time zone 'America/Sao_Paulo')::date - 1
         when 2 then (now() at time zone 'America/Sao_Paulo')::date
         when 3 then (now() at time zone 'America/Sao_Paulo')::date + 3
         when 4 then (now() at time zone 'America/Sao_Paulo')::date + 10
       end
  from generate_series(1, 8) i;

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, custom_data)
select ('5114f000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5114a000-0000-0000-0000-000000000001',
       ('5114e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5114c000-0000-0000-0000-000000000001',
       '5114d000-0000-0000-0000-000000000001',
       cd
  from (values
    (1, jsonb_build_object(
          '5114f100-0000-0000-0000-000000000001', 'Indicação',
          '5114f100-0000-0000-0000-000000000002', jsonb_build_array('Bateria', 'Módulo'),
          '5114f100-0000-0000-0000-000000000003', '5114b000-0000-0000-0000-00000000000b',
          '5114f100-0000-0000-0000-000000000004', 10,
          '5114f100-0000-0000-0000-000000000005', 5000,
          '5114f100-0000-0000-0000-000000000006', '2026-03-10T03:00:00Z',
          '5114f100-0000-0000-0000-000000000007', true,
          '5114f100-0000-0000-0000-000000000008', 'Telhado Colonial')),
    (2, jsonb_build_object(
          '5114f100-0000-0000-0000-000000000001', 'Site',
          '5114f100-0000-0000-0000-000000000002', jsonb_build_array('Carregador'),
          '5114f100-0000-0000-0000-000000000003', '5114b000-0000-0000-0000-00000000000a',
          '5114f100-0000-0000-0000-000000000004', 9,
          '5114f100-0000-0000-0000-000000000005', 1500.5,
          '5114f100-0000-0000-0000-000000000006', '2026-03-31T15:00:00Z',
          '5114f100-0000-0000-0000-000000000007', false,
          '5114f100-0000-0000-0000-000000000008', 'telhado metálico')),
    (3, jsonb_build_object(
          '5114f100-0000-0000-0000-000000000001', 'Meta',
          '5114f100-0000-0000-0000-000000000002', '[]'::jsonb,
          '5114f100-0000-0000-0000-000000000004', 'abc',
          '5114f100-0000-0000-0000-000000000006', '31/02/2026',
          '5114f100-0000-0000-0000-000000000008', '')),
    (4, jsonb_build_object(
          '5114f100-0000-0000-0000-000000000001', 'null'::jsonb,
          '5114f100-0000-0000-0000-000000000004', 25,
          '5114f100-0000-0000-0000-000000000006', '2026-04-01T03:00:00Z',
          '5114f100-0000-0000-0000-000000000008', 'null'::jsonb)),
    (5, '{}'::jsonb),
    (6, jsonb_build_object(
          '5114f100-0000-0000-0000-000000000002', '{}'::jsonb,
          '5114f100-0000-0000-0000-000000000004', '12',
          '5114f100-0000-0000-0000-000000000007', 'sim',
          '5114f100-0000-0000-0000-000000000008', '[]'::jsonb)),
    (7, jsonb_build_object(
          '5114f100-0000-0000-0000-000000000001', 'Indicação',
          '5114f100-0000-0000-0000-000000000004', 12.5,
          '5114f100-0000-0000-0000-000000000008', '   ')),
    (8, jsonb_build_object(
          '5114f100-0000-0000-0000-000000000001', 'Site',
          '5114f100-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000'))
  ) as v(i, cd);

-- Bloco B: a situação do contato vem dos negócios dele (pipeline P2).
--   Cliente Ganho — um ganho (dono Chefe) e um aberto (dono Vendedor) → cliente
--   Em Negociação — um aberto sem dono → negociando
--   Já Perdido    — só um perdido (dono Chefe) → perdido
--   Sem Negócio   — nenhum negócio → sem_negocio
insert into public.leads (id, equipe_id, name, email, phone, origin_category, tags, created_at) values
  ('5114e000-0000-0000-0000-000000000101', '5114a000-0000-0000-0000-000000000001', 'Cliente Ganho', 'ganho@s11w2.test', '(85) 99262-5840', 'paid_social', array['vip'],       '2026-01-15T12:00:00Z'),
  ('5114e000-0000-0000-0000-000000000102', '5114a000-0000-0000-0000-000000000001', 'Em Negociação', null,               null,              'paid_social', array[]::text[], '2026-02-15T12:00:00Z'),
  ('5114e000-0000-0000-0000-000000000103', '5114a000-0000-0000-0000-000000000001', 'Já Perdido',    null,               null,              'paid_social', array[]::text[], '2026-03-15T12:00:00Z'),
  ('5114e000-0000-0000-0000-000000000104', '5114a000-0000-0000-0000-000000000001', 'Sem Negócio',   null,               null,              'referral',    array[]::text[], '2026-03-20T12:00:00Z');

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, status, owner_id) values
  ('5114f000-0000-0000-0000-000000000111', '5114a000-0000-0000-0000-000000000001', '5114e000-0000-0000-0000-000000000101', '5114c000-0000-0000-0000-000000000002', '5114d000-0000-0000-0000-000000000002', 'won',  '5114b000-0000-0000-0000-00000000000a'),
  ('5114f000-0000-0000-0000-000000000112', '5114a000-0000-0000-0000-000000000001', '5114e000-0000-0000-0000-000000000101', '5114c000-0000-0000-0000-000000000002', '5114d000-0000-0000-0000-000000000002', 'open', '5114b000-0000-0000-0000-00000000000b'),
  ('5114f000-0000-0000-0000-000000000121', '5114a000-0000-0000-0000-000000000001', '5114e000-0000-0000-0000-000000000102', '5114c000-0000-0000-0000-000000000002', '5114d000-0000-0000-0000-000000000002', 'open', null),
  ('5114f000-0000-0000-0000-000000000131', '5114a000-0000-0000-0000-000000000001', '5114e000-0000-0000-0000-000000000103', '5114c000-0000-0000-0000-000000000002', '5114d000-0000-0000-0000-000000000002', 'lost', '5114b000-0000-0000-0000-00000000000a');

-- Um contato no tenant vizinho, para a RLS.
insert into public.leads (id, equipe_id, name, phone) values
  ('5114e000-0000-0000-0000-000000000999', '5114a000-0000-0000-0000-000000000002', 'Lead do vizinho', '(85) 99262-5840');

-- Tudo abaixo roda como o chefe da equipe A, com a RLS valendo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"5114b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- Atalhos de contagem (temp: somem com a transação).
create function pg_temp.n_opps(f jsonb) returns int language sql stable as $$
  select count(*)::int
    from public.opportunities o
    left join public.leads l on l.id = o.lead_id
   where o.pipeline_id = '5114c000-0000-0000-0000-000000000001'
     and o.deleted_at is null
     and public.crm_opp_matches(o, l, f);
$$;

create function pg_temp.n_leads(f jsonb) returns int language sql stable as $$
  select count(*)::int
    from public.leads l
   where l.equipe_id = '5114a000-0000-0000-0000-000000000001'
     and l.deleted_at is null
     and public.crm_lead_matches(l, f);
$$;

-- Um filtro de campo: {"custom": [{"field_id": ..., "op": ..., ...}]}
create function pg_temp.cf(p_field text, p_op text, p_extra jsonb default '{}'::jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('custom', jsonb_build_array(
    jsonb_build_object('field_id', '5114f100-0000-0000-0000-00000000000' || p_field, 'op', p_op) || p_extra
  ));
$$;

-- ============================================================================
-- 0. Utilitários: vazio, número e data que não quebram.
-- ============================================================================
do $$ begin
  assert public._crm_is_empty(null) and public._crm_is_empty('null') and public._crm_is_empty('""')
     and public._crm_is_empty('[]') and public._crm_is_empty('{}') and public._crm_is_empty('"   "'),
    'T12-0 FAIL: algum dos jeitos de vazio nao foi reconhecido';
  assert not public._crm_is_empty('0') and not public._crm_is_empty('false') and not public._crm_is_empty('"a"'),
    'T12-0 FAIL: 0, false ou texto foram tratados como vazio';
  assert public._crm_try_numeric('abc') is null and public._crm_try_numeric('12') = 12
     and public._crm_try_numeric(' 12.5 ') = 12.5 and public._crm_try_numeric(null) is null,
    'T12-0 FAIL: _crm_try_numeric';
  assert public._crm_try_timestamptz('31/02/2026') is null and public._crm_try_timestamptz('') is null
     and public._crm_try_timestamptz('2026-03-10T03:00:00Z') = '2026-03-10T03:00:00Z'::timestamptz,
    'T12-0 FAIL: _crm_try_timestamptz';
end $$;

-- ============================================================================
-- 1. any_of em seleção, multi-seleção (sobreposição) e usuário.
-- ============================================================================
do $$ begin
  assert pg_temp.n_opps('{}') = 8, 'T12-1 FAIL: sem filtro deveria haver 8 negocios, ha ' || pg_temp.n_opps('{}');
  assert pg_temp.n_opps(pg_temp.cf('1', 'any_of', '{"values":["Indicação"]}')) = 2,
    'T12-1 FAIL: selecao Indicacao deveria dar 2, deu ' || pg_temp.n_opps(pg_temp.cf('1', 'any_of', '{"values":["Indicação"]}'));
  assert pg_temp.n_opps(pg_temp.cf('1', 'any_of', '{"values":["Indicação","Site"]}')) = 4,
    'T12-1 FAIL: selecao Indicacao|Site deveria dar 4';
  assert pg_temp.n_opps(pg_temp.cf('2', 'any_of', '{"values":["Bateria","Carregador"]}')) = 2,
    'T12-1 FAIL: multi-selecao Bateria|Carregador deveria dar 2 (sobreposicao)';
  assert pg_temp.n_opps(pg_temp.cf('3', 'any_of', '{"values":["5114b000-0000-0000-0000-00000000000b"]}')) = 1,
    'T12-1 FAIL: usuario Vendedor deveria dar 1';
  assert pg_temp.n_opps(pg_temp.cf('1', 'any_of', '{"values":[]}')) = 8,
    'T12-1 FAIL: any_of sem valores deveria ser "sem filtro"';
end $$;

-- ============================================================================
-- 2. between_number: só from, só to, os dois; "abc" não bate e não quebra.
-- ============================================================================
do $$ begin
  assert pg_temp.n_opps(pg_temp.cf('4', 'between_number', '{"from":10}')) = 4,
    'T12-2 FAIL: potencia >= 10 deveria dar 4 (10, 25, "12", 12.5), deu ' || pg_temp.n_opps(pg_temp.cf('4', 'between_number', '{"from":10}'));
  assert pg_temp.n_opps(pg_temp.cf('4', 'between_number', '{"to":10}')) = 2,
    'T12-2 FAIL: potencia <= 10 deveria dar 2 (10 e 9)';
  assert pg_temp.n_opps(pg_temp.cf('4', 'between_number', '{"from":9,"to":12}')) = 3,
    'T12-2 FAIL: potencia entre 9 e 12 deveria dar 3 (10, 9, "12")';
  assert pg_temp.n_opps(pg_temp.cf('5', 'between_number', '{"from":1000,"to":2000}')) = 1,
    'T12-2 FAIL: ticket entre 1000 e 2000 deveria dar 1';
  assert pg_temp.n_opps(pg_temp.cf('4', 'between_number', '{"from":"xyz"}')) = 5,
    'T12-2 FAIL: ponta que nao converte deveria ser ignorada (5 negocios com numero valido: 10, 9, 25, "12", 12.5)';
end $$;

-- ============================================================================
-- 3. between_date meio-aberto; data malformada não bate e não quebra.
-- ============================================================================
do $$ begin
  assert pg_temp.n_opps(pg_temp.cf('6', 'between_date', '{"from":"2026-03-01T03:00:00Z","to":"2026-04-01T03:00:00Z"}')) = 2,
    'T12-3 FAIL: marco deveria dar 2 (a visita em 01/04 03:00Z fica fora do intervalo meio-aberto)';
  assert pg_temp.n_opps(pg_temp.cf('6', 'between_date', '{"from":"2026-03-15T00:00:00Z"}')) = 2,
    'T12-3 FAIL: a partir de 15/03 deveria dar 2';
end $$;

-- ============================================================================
-- 4. is_true / is_false; contains sem diferenciar maiúsculas.
-- ============================================================================
do $$ begin
  assert pg_temp.n_opps(pg_temp.cf('7', 'is_true')) = 2,
    'T12-4 FAIL: sim deveria dar 2 (true e "sim")';
  assert pg_temp.n_opps(pg_temp.cf('7', 'is_false')) = 1,
    'T12-4 FAIL: nao deveria dar 1 (so false; vazio e "empty")';
  assert pg_temp.n_opps(pg_temp.cf('8', 'contains', '{"value":"TELHADO"}')) = 2,
    'T12-4 FAIL: contains TELHADO deveria dar 2';
  assert pg_temp.n_opps(pg_temp.cf('8', 'contains', '{"value":"   "}')) = 8,
    'T12-4 FAIL: contains sem texto deveria ser "sem filtro"';
end $$;

-- ============================================================================
-- 5. empty / not_empty nos cinco jeitos de vazio.
-- ============================================================================
do $$ begin
  assert pg_temp.n_opps(pg_temp.cf('8', 'empty')) = 6,
    'T12-5 FAIL: texto vazio deveria dar 6 ("", null, ausente x2, [], espacos), deu ' || pg_temp.n_opps(pg_temp.cf('8', 'empty'));
  assert pg_temp.n_opps(pg_temp.cf('8', 'not_empty')) = 2,
    'T12-5 FAIL: texto preenchido deveria dar 2';
  assert pg_temp.n_opps(pg_temp.cf('2', 'empty')) = 6,
    'T12-5 FAIL: multi-selecao vazia deveria dar 6 ([], {}, ausente)';
  assert pg_temp.n_opps(pg_temp.cf('2', 'not_empty')) = 2,
    'T12-5 FAIL: multi-selecao preenchida deveria dar 2';
end $$;

-- ============================================================================
-- 6. Dois filtros = E; op desconhecida e elemento malformado = sem filtro.
-- ============================================================================
do $$ begin
  assert pg_temp.n_opps(jsonb_build_object('custom', jsonb_build_array(
           jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000001', 'op', 'any_of', 'values', jsonb_build_array('Indicação', 'Site')),
           jsonb_build_object('field_id', '5114f100-0000-0000-0000-000000000004', 'op', 'between_number', 'from', 10)
         ))) = 2,
    'T12-6 FAIL: Indicacao|Site E potencia >= 10 deveria dar 2';
  assert pg_temp.n_opps(pg_temp.cf('1', 'whatever')) = 8,
    'T12-6 FAIL: op desconhecida deveria ser ignorada';
  assert pg_temp.n_opps('{"custom":["lixo", 42]}') = 8,
    'T12-6 FAIL: elemento malformado deveria ser ignorado';
  assert pg_temp.n_opps('{"custom":"nao e lista"}') = 8,
    'T12-6 FAIL: custom que nao e lista deveria ser ignorado';
end $$;

-- ============================================================================
-- 7. Próximo contato: os quatro baldes, no dia de São Paulo.
-- ============================================================================
do $$ begin
  assert pg_temp.n_opps('{"next_contact":"overdue"}') = 1, 'T12-7 FAIL: atrasado deveria dar 1';
  assert pg_temp.n_opps('{"next_contact":"today"}')   = 1, 'T12-7 FAIL: hoje deveria dar 1';
  assert pg_temp.n_opps('{"next_contact":"week"}')    = 2, 'T12-7 FAIL: semana deveria dar 2 (hoje e +3)';
  assert pg_temp.n_opps('{"next_contact":"none"}')    = 4, 'T12-7 FAIL: sem proximo contato deveria dar 4';
  assert pg_temp.n_opps('{"next_contact":"xyz"}')     = 8, 'T12-7 FAIL: balde desconhecido deveria ser ignorado';
end $$;

-- ============================================================================
-- 8. O quadro usa o mesmo filtro: resumo e página batem com a contagem.
-- ============================================================================
do $$
declare
  f jsonb := pg_temp.cf('1', 'any_of', '{"values":["Indicação","Site"]}');
  v_sum int;
begin
  select coalesce(sum((e->>'count')::int), 0) into v_sum
    from jsonb_array_elements(public.crm_board_summary('5114c000-0000-0000-0000-000000000001', f)) e;
  assert v_sum = 4, 'T12-8 FAIL: o resumo deveria somar 4, somou ' || v_sum;
  assert jsonb_array_length(public.crm_board_stage('5114c000-0000-0000-0000-000000000001', '5114d000-0000-0000-0000-000000000001', f, 200, 0)) = 4,
    'T12-8 FAIL: a pagina da etapa deveria trazer 4 cards';
end $$;

-- ============================================================================
-- 9. Base de Contatos: busca, período, situação, pipeline e responsável do negócio.
-- ============================================================================
do $$ begin
  assert pg_temp.n_leads('{}') = 12, 'T12-9 FAIL: a equipe A deveria ter 12 contatos, tem ' || pg_temp.n_leads('{}');
  assert pg_temp.n_leads('{"search":"(85) 99262-5840"}') = 1, 'T12-9 FAIL: busca por telefone com mascara';
  assert pg_temp.n_leads('{"search":"negocia"}') = 1, 'T12-9 FAIL: busca por pedaco do nome';
  assert pg_temp.n_leads('{"created_from":"2026-02-01T03:00:00Z","created_to":"2026-03-16T03:00:00Z"}') = 2,
    'T12-9 FAIL: periodo de criacao deveria dar 2';
  assert pg_temp.n_leads('{"created_from":"nao e data"}') = 12,
    'T12-9 FAIL: data de periodo que nao converte deveria ser ignorada';

  assert public._crm_lead_relationship('5114e000-0000-0000-0000-000000000101') = 'cliente',
    'T12-9 FAIL: ganho + aberto deveria ser cliente';
  assert public._crm_lead_relationship('5114e000-0000-0000-0000-000000000102') = 'negociando', 'T12-9 FAIL: negociando';
  assert public._crm_lead_relationship('5114e000-0000-0000-0000-000000000103') = 'perdido',    'T12-9 FAIL: perdido';
  assert public._crm_lead_relationship('5114e000-0000-0000-0000-000000000104') = 'sem_negocio', 'T12-9 FAIL: sem negocio';

  assert pg_temp.n_leads('{"relationship":["cliente"]}') = 1, 'T12-9 FAIL: situacao cliente deveria dar 1';
  assert pg_temp.n_leads('{"relationship":["negociando"]}') = 9,
    'T12-9 FAIL: negociando deveria dar 9 (8 do bloco A + 1), deu ' || pg_temp.n_leads('{"relationship":["negociando"]}');
  assert pg_temp.n_leads('{"relationship":["cliente","perdido"]}') = 2, 'T12-9 FAIL: cliente|perdido deveria dar 2';
  assert pg_temp.n_leads('{"relationship":["sem_negocio"]}') = 1, 'T12-9 FAIL: sem negocio deveria dar 1';

  assert pg_temp.n_leads('{"pipeline_ids":["5114c000-0000-0000-0000-000000000002"]}') = 3,
    'T12-9 FAIL: contatos com negocio na P2 deveriam ser 3';
  assert pg_temp.n_leads('{"deal_owner_ids":["5114b000-0000-0000-0000-00000000000b"]}') = 1,
    'T12-9 FAIL: contatos com negocio do Vendedor deveriam ser 1';
  assert pg_temp.n_leads('{"deal_owner_ids":["5114b000-0000-0000-0000-00000000000a"]}') = 2,
    'T12-9 FAIL: contatos com negocio do Chefe deveriam ser 2';
  assert pg_temp.n_leads('{"deal_owner_ids":["none"]}') = 9,
    'T12-9 FAIL: contatos com negocio sem dono deveriam ser 9 (8 do bloco A + 1)';

  assert pg_temp.n_leads('{"next_contact":"overdue"}') = 1, 'T12-9 FAIL: proximo contato atrasado no contato';
  assert pg_temp.n_leads('{"origin_categories":["referral"]}') = 1, 'T12-9 FAIL: origem referral';
  assert pg_temp.n_leads('{"tags":["vip"]}') = 1, 'T12-9 FAIL: etiqueta vip';
end $$;

-- ============================================================================
-- 10. O vizinho não conta os contatos da equipe A (RLS).
-- ============================================================================
set local request.jwt.claims = '{"sub":"5114b000-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$ begin
  assert pg_temp.n_leads('{}') = 0, 'T12-10 FAIL: o vizinho conta contatos da equipe A';
  assert pg_temp.n_leads('{"search":"(85) 99262-5840"}') = 0, 'T12-10 FAIL: o vizinho acha o telefone da equipe A';
  assert pg_temp.n_opps('{}') = 0, 'T12-10 FAIL: o vizinho conta negocios da equipe A';
end $$;

rollback;
select 'PASS' as result;
