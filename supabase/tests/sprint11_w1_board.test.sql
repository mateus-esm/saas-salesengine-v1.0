-- Sprint 11 · T3 — o quadro vem do servidor.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w1_board.test.sql
--
-- O que este teste protege: o Kanban mostra TODOS os negócios (o teto de 1.000
-- linhas da API escondia 259 da Solo Energia), cada filtro corta o que diz que
-- corta, um tenant não vê o outro, e o lead score diz "sem dados" em vez de 0.

begin;

-- @include supabase/migrations/20260910000100_sprint11_opportunity_owner.sql
-- @include supabase/migrations/20260910000200_sprint11_crm_board.sql
-- Onda 2: as versões novas das mesmas funções têm de passar no teste da Onda 1.
-- @include supabase/migrations/20260911000100_sprint11_w2_filters.sql
-- @include supabase/migrations/20260911000200_sprint11_w2_tables.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5113a000-0000-0000-0000-000000000001', 'S11 Quadro A', 'x', 'y'),
  ('5113a000-0000-0000-0000-000000000002', 'S11 Quadro B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5113b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11-board.test',    'x', now(), now()),
  ('5113b000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor@s11-board.test', 'x', now(), now()),
  ('5113b000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outro@s11-board.test',    'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5113b000-0000-0000-0000-00000000000a', '5113b000-0000-0000-0000-00000000000a', 'chefe@s11-board.test',    '5113a000-0000-0000-0000-000000000001', 'Chefe A',    'admin'),
  ('5113b000-0000-0000-0000-00000000000b', '5113b000-0000-0000-0000-00000000000b', 'vendedor@s11-board.test', '5113a000-0000-0000-0000-000000000001', 'Vendedor A', 'user'),
  ('5113b000-0000-0000-0000-00000000000c', '5113b000-0000-0000-0000-00000000000c', 'outro@s11-board.test',    '5113a000-0000-0000-0000-000000000002', 'Outro B',    'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.pipelines (id, equipe_id, name) values
  ('5113c000-0000-0000-0000-000000000001', '5113a000-0000-0000-0000-000000000001', 'Quadro S11'),
  ('5113c000-0000-0000-0000-000000000002', '5113a000-0000-0000-0000-000000000002', 'Quadro do vizinho');

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5113d000-0000-0000-0000-000000000001', '5113a000-0000-0000-0000-000000000001', '5113c000-0000-0000-0000-000000000001', 'Entrada',  0, 'open'),
  ('5113d000-0000-0000-0000-000000000002', '5113a000-0000-0000-0000-000000000001', '5113c000-0000-0000-0000-000000000001', 'Proposta', 1, 'open'),
  ('5113d000-0000-0000-0000-000000000003', '5113a000-0000-0000-0000-000000000001', '5113c000-0000-0000-0000-000000000001', 'Vazia',    2, 'open'),
  ('5113d000-0000-0000-0000-000000000009', '5113a000-0000-0000-0000-000000000002', '5113c000-0000-0000-0000-000000000002', 'Vizinho',  0, 'open');

-- 45 negócios na Entrada: valor i*100, criados em 01/01/2026 + (i-1) dias.
-- i <= 10 são do vendedor; i <= 20 vêm de social pago, o resto de indicação;
-- múltiplos de 5 levam a etiqueta "solar".
insert into public.leads (id, equipe_id, name, origin_category, tags)
select ('5113e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5113a000-0000-0000-0000-000000000001',
       'Cliente ' || lpad(i::text, 2, '0'),
       case when i <= 20 then 'paid_social' else 'referral' end,
       case when i % 5 = 0 then array['solar'] else array[]::text[] end
  from generate_series(1, 45) i;

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, owner_id, created_at)
select ('5113f000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5113a000-0000-0000-0000-000000000001',
       ('5113e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '5113c000-0000-0000-0000-000000000001',
       '5113d000-0000-0000-0000-000000000001',
       i * 100,
       case when i <= 10 then '5113b000-0000-0000-0000-00000000000b'::uuid end,
       '2026-01-01T00:00:00Z'::timestamptz + (i - 1) * interval '1 day'
  from generate_series(1, 45) i;

-- Na Proposta: a Maria (achável por nome, e-mail e telefone com máscara) e um
-- negócio ganho.
insert into public.leads (id, equipe_id, name, email, phone, tags) values
  ('5113e000-0000-0000-0000-000000000901', '5113a000-0000-0000-0000-000000000001', 'Maria Buscada', 'maria@s11-board.test', '(85) 99262-5840', array['vip']),
  ('5113e000-0000-0000-0000-000000000902', '5113a000-0000-0000-0000-000000000001', 'Ganhador',      null,                   null,              array[]::text[]);

insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value, status, created_at) values
  ('5113f000-0000-0000-0000-000000000901', '5113a000-0000-0000-0000-000000000001', '5113e000-0000-0000-0000-000000000901', '5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000002',  999, 'open', '2026-03-15T00:00:00Z'),
  ('5113f000-0000-0000-0000-000000000902', '5113a000-0000-0000-0000-000000000001', '5113e000-0000-0000-0000-000000000902', '5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000002', 5000, 'won',  '2026-03-16T00:00:00Z');

-- A Maria tem 3 touchpoints; o Cliente 01 tem atividade (velocidade não nula).
insert into public.touchpoints (lead_id, content, touchpoint_type) values
  ('5113e000-0000-0000-0000-000000000901', 'ligacao 1', 'call'),
  ('5113e000-0000-0000-0000-000000000901', 'ligacao 2', 'call'),
  ('5113e000-0000-0000-0000-000000000901', 'whats',     'whatsapp');

insert into public.lead_activities (lead_id, tipo, descricao) values
  ('5113e000-0000-0000-0000-000000000001', 'note', 'primeira'),
  ('5113e000-0000-0000-0000-000000000001', 'note', 'segunda');

-- O vizinho tem um negócio no próprio quadro.
insert into public.leads (id, equipe_id, name) values
  ('5113e000-0000-0000-0000-000000000999', '5113a000-0000-0000-0000-000000000002', 'Lead do vizinho');
insert into public.opportunities (id, equipe_id, lead_id, pipeline_id, stage_id, value) values
  ('5113f000-0000-0000-0000-000000000999', '5113a000-0000-0000-0000-000000000002', '5113e000-0000-0000-0000-000000000999', '5113c000-0000-0000-0000-000000000002', '5113d000-0000-0000-0000-000000000009', 777);

-- Tudo abaixo roda como o chefe da equipe A, com a RLS valendo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"5113b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- Atalhos de leitura (temp: somem com a transação).
create temp view s11_summary as
  select (e->>'stage_id')::uuid as stage_id, (e->>'count')::int as n, (e->>'value_sum')::numeric as v
    from jsonb_array_elements(public.crm_board_summary('5113c000-0000-0000-0000-000000000001')) e;

-- ============================================================================
-- 1. Resumo: conta e soma por etapa; etapa vazia aparece com zero.
-- ============================================================================
do $$ begin
  assert (select n from s11_summary where stage_id = '5113d000-0000-0000-0000-000000000001') = 45,
    'T3-1 FAIL: Entrada deveria ter 45, tem ' || (select n from s11_summary where stage_id = '5113d000-0000-0000-0000-000000000001');
  assert (select v from s11_summary where stage_id = '5113d000-0000-0000-0000-000000000001') = 103500,
    'T3-1 FAIL: soma da Entrada deveria ser 103500, e ' || (select v from s11_summary where stage_id = '5113d000-0000-0000-0000-000000000001');
  assert (select n from s11_summary where stage_id = '5113d000-0000-0000-0000-000000000002') = 2,
    'T3-1 FAIL: Proposta deveria ter 2';
  assert (select n from s11_summary where stage_id = '5113d000-0000-0000-0000-000000000003') = 0,
    'T3-1 FAIL: a etapa vazia sumiu do resumo ou nao esta zerada';
  assert (select count(*) from s11_summary) = 3,
    'T3-1 FAIL: o resumo deveria ter uma linha por etapa (3), tem ' || (select count(*) from s11_summary);
end $$;

-- ============================================================================
-- 2. Página de 30 + página seguinte de 15, sem sobreposição.
-- ============================================================================
do $$
declare p1 jsonb; p2 jsonb;
begin
  p1 := public.crm_board_stage('5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000001', '{}', 30, 0);
  p2 := public.crm_board_stage('5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000001', '{}', 30, 30);
  assert jsonb_array_length(p1) = 30, 'T3-2 FAIL: primeira pagina deveria ter 30, tem ' || jsonb_array_length(p1);
  assert jsonb_array_length(p2) = 15, 'T3-2 FAIL: segunda pagina deveria ter 15, tem ' || jsonb_array_length(p2);
  assert not exists (
    select 1 from jsonb_array_elements(p1) a join jsonb_array_elements(p2) b on a->>'id' = b->>'id'
  ), 'T3-2 FAIL: as paginas se sobrepoem';
end $$;

-- ============================================================================
-- 3. Busca: pedaço do nome, e-mail, telefone digitado de qualquer jeito.
-- ============================================================================
do $$
declare
  v_stage uuid := '5113d000-0000-0000-0000-000000000002';
  v_pipe  uuid := '5113c000-0000-0000-0000-000000000001';
  q text;
begin
  foreach q in array array['maria', 'MARIA BUS', 'maria@s11', '(85) 99262-5840', '85 99262 5840', '5585992625840', '992625840'] loop
    assert jsonb_array_length(public.crm_board_stage(v_pipe, v_stage, jsonb_build_object('search', q))) = 1,
      'T3-3 FAIL: a busca "' || q || '" deveria achar so a Maria';
  end loop;
  assert jsonb_array_length(public.crm_board_stage(v_pipe, v_stage, '{"search":"ninguem com esse nome"}')) = 0,
    'T3-3 FAIL: busca sem resultado trouxe algo';
  assert (select n from jsonb_array_elements(public.crm_board_summary(v_pipe, '{"search":"cliente 0"}')) e,
                 lateral (select (e->>'count')::int as n) x
           where e->>'stage_id' = '5113d000-0000-0000-0000-000000000001') = 9,
    'T3-3 FAIL: "cliente 0" deveria achar Cliente 01..09 no resumo';
end $$;

-- ============================================================================
-- 4. Período de criação: [01/01, 11/01) = Cliente 01..10.
-- ============================================================================
do $$ begin
  assert (select (e->>'count')::int from jsonb_array_elements(public.crm_board_summary(
            '5113c000-0000-0000-0000-000000000001',
            '{"created_from":"2026-01-01T00:00:00Z","created_to":"2026-01-11T00:00:00Z"}')) e
          where e->>'stage_id' = '5113d000-0000-0000-0000-000000000001') = 10,
    'T3-4 FAIL: o periodo de criacao nao cortou 10 negocios';
end $$;

-- ============================================================================
-- 5. Responsável, inclusive "sem responsável".
-- ============================================================================
do $$
declare s jsonb;
begin
  s := public.crm_board_summary('5113c000-0000-0000-0000-000000000001', '{"owner_ids":["5113b000-0000-0000-0000-00000000000b"]}');
  assert (select (e->>'count')::int from jsonb_array_elements(s) e where e->>'stage_id' = '5113d000-0000-0000-0000-000000000001') = 10,
    'T3-5 FAIL: filtro pelo vendedor deveria dar 10';
  s := public.crm_board_summary('5113c000-0000-0000-0000-000000000001', '{"owner_ids":["none"]}');
  assert (select (e->>'count')::int from jsonb_array_elements(s) e where e->>'stage_id' = '5113d000-0000-0000-0000-000000000001') = 35,
    'T3-5 FAIL: "sem responsavel" na Entrada deveria dar 35';
  assert (select (e->>'count')::int from jsonb_array_elements(s) e where e->>'stage_id' = '5113d000-0000-0000-0000-000000000002') = 2,
    'T3-5 FAIL: "sem responsavel" na Proposta deveria dar 2';
end $$;

-- ============================================================================
-- 6. Etiquetas, origem, status, faixa de valor.
-- ============================================================================
do $$
declare
  v_pipe uuid := '5113c000-0000-0000-0000-000000000001';
  v_entrada text := '5113d000-0000-0000-0000-000000000001';
  v_proposta text := '5113d000-0000-0000-0000-000000000002';
begin
  assert (select (e->>'count')::int from jsonb_array_elements(public.crm_board_summary(v_pipe, '{"tags":["solar"]}')) e where e->>'stage_id' = v_entrada) = 9,
    'T3-6 FAIL: etiqueta solar deveria dar 9';
  assert (select (e->>'count')::int from jsonb_array_elements(public.crm_board_summary(v_pipe, '{"origin_categories":["paid_social"]}')) e where e->>'stage_id' = v_entrada) = 20,
    'T3-6 FAIL: social pago deveria dar 20';
  assert (select (e->>'count')::int from jsonb_array_elements(public.crm_board_summary(v_pipe, '{"statuses":["won"]}')) e where e->>'stage_id' = v_proposta) = 1,
    'T3-6 FAIL: status ganho deveria dar 1 na Proposta';
  assert (select (e->>'count')::int from jsonb_array_elements(public.crm_board_summary(v_pipe, '{"statuses":["won"]}')) e where e->>'stage_id' = v_entrada) = 0,
    'T3-6 FAIL: status ganho deveria zerar a Entrada';
  assert (select (e->>'count')::int from jsonb_array_elements(public.crm_board_summary(v_pipe, '{"value_min":4000,"value_max":4500}')) e where e->>'stage_id' = v_entrada) = 6,
    'T3-6 FAIL: faixa 4000-4500 deveria dar 6';
end $$;

-- ============================================================================
-- 7. O card traz o que o Kanban precisa: nome do lead e nome do responsável.
-- ============================================================================
do $$
declare c jsonb;
begin
  select e into c
    from jsonb_array_elements(public.crm_board_stage(
           '5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000001',
           '{"search":"Cliente 03"}')) e;
  assert c->'lead'->>'name' = 'Cliente 03', 'T3-7 FAIL: o card nao trouxe o nome do lead';
  assert c->>'owner_name' = 'Vendedor A', 'T3-7 FAIL: o card nao trouxe o nome do responsavel: ' || coalesce(c->>'owner_name', 'null');
  assert jsonb_typeof(c->'companies') = 'array', 'T3-7 FAIL: companies deveria ser um array';
end $$;

-- ============================================================================
-- 8. Lead score com nulo honesto.
-- ============================================================================
do $$
declare c jsonb;
begin
  select e into c from jsonb_array_elements(public.crm_board_stage(
    '5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000002', '{"search":"maria"}')) e;
  assert c->'lead_score' = 'null'::jsonb,
    'T3-8 FAIL: sem ICP e sem atividade o score deveria ser nulo, veio ' || coalesce(c->>'lead_score', 'null');

  select e into c from jsonb_array_elements(public.crm_board_stage(
    '5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000001', '{"search":"Cliente 01"}')) e;
  assert c->'velocity' <> 'null'::jsonb, 'T3-8 FAIL: com atividade a velocidade deveria existir';
  assert c->'lead_score' <> 'null'::jsonb, 'T3-8 FAIL: com atividade o score deveria existir';
  assert c->'icp_score' = 'null'::jsonb, 'T3-8 FAIL: pipeline sem ICP deveria dar icp_score nulo';
end $$;

-- ============================================================================
-- 9. Contagem de touchpoints no card.
-- ============================================================================
do $$ begin
  assert (select (e->>'touchpoint_count')::int from jsonb_array_elements(public.crm_board_stage(
            '5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000002', '{"search":"maria"}')) e) = 3,
    'T3-9 FAIL: a Maria tem 3 touchpoints';
end $$;

-- ============================================================================
-- 10. Scores e touchpoints em lote: 1.200 ids numa chamada (vai no corpo do
--     POST, não na URL — o que derrubava o Kanban).
-- ============================================================================
do $$
declare v_ids uuid[]; v jsonb;
begin
  select array_agg(x) into v_ids from (
    select ('5113e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid as x from generate_series(1, 45) i
    union all select '5113e000-0000-0000-0000-000000000901'::uuid
    union all select gen_random_uuid() from generate_series(1, 1154)
  ) ids;
  assert array_length(v_ids, 1) = 1200, 'T3-10 FAIL: fixture de ids';

  v := public.crm_lead_scores(v_ids);
  assert (select count(*) from jsonb_object_keys(v)) = 46,
    'T3-10 FAIL: crm_lead_scores deveria devolver 46 leads, devolveu ' || (select count(*) from jsonb_object_keys(v));
  assert v->'5113e000-0000-0000-0000-000000000901'->'lead_score' = 'null'::jsonb,
    'T3-10 FAIL: score da Maria deveria ser nulo no lote';

  v := public.crm_touchpoint_counts(v_ids);
  assert (v->>'5113e000-0000-0000-0000-000000000901')::int = 3,
    'T3-10 FAIL: crm_touchpoint_counts deveria dar 3 para a Maria';
end $$;

-- ============================================================================
-- 11. O vizinho não vê nada do quadro A (RLS).
-- ============================================================================
set local request.jwt.claims = '{"sub":"5113b000-0000-0000-0000-00000000000c","role":"authenticated"}';

do $$ begin
  assert jsonb_array_length(public.crm_board_summary('5113c000-0000-0000-0000-000000000001')) = 0,
    'T3-11 FAIL: o vizinho ve as etapas do quadro A';
  assert jsonb_array_length(public.crm_board_stage('5113c000-0000-0000-0000-000000000001', '5113d000-0000-0000-0000-000000000001')) = 0,
    'T3-11 FAIL: o vizinho ve os cards do quadro A';
  assert (select count(*) from jsonb_object_keys(public.crm_lead_scores(array['5113e000-0000-0000-0000-000000000001'::uuid]))) = 0,
    'T3-11 FAIL: o vizinho le o score de um lead do quadro A';
end $$;

rollback;
select 'PASS' as result;
