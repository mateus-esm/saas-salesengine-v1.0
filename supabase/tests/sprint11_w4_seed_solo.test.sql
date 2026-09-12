-- Sprint 11 · Onda 4 · T46 — ensaio da semente da Solo Energia, sobre a produção.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w4_seed_solo.test.sql
--
-- Roda as migrations da onda e a semente dentro de um rollback e prova: as duas
-- tabelas nascem como artefato (proposta, contrato), toda coluna com field_id e
-- key únicos, as consultas apontam para fontes que existem, o formulário dos
-- Contratos só pede campos que um formulário aceita e abre de verdade pelo lado
-- público; rodar de novo não duplica; a "Teste" continua lá.

begin;

-- @include supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql
-- @include supabase/migrations/20260912100200_sprint11_w4_artifacts.sql
-- @include supabase/migrations/20260912100300_sprint11_w4_artifact_files.sql
-- @include supabase/migrations/20260912100400_sprint11_w4_artifact_lifecycle.sql
-- @include supabase/migrations/20260912100500_sprint11_w4_artifact_actions.sql
-- @include supabase/migrations/20260912100600_sprint11_w4_public_forms.sql

create temp table pg_temp.before_seed as
  select count(*) as tables from public.custom_tables where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904';

-- @include supabase/scripts/2026-09-12_sprint11_seed_solo_artifacts.sql
-- @include supabase/scripts/2026-09-12_sprint11_seed_solo_artifacts.sql

do $$
declare
  v_prop public.custom_tables;
  v_cont public.custom_tables;
  v_rec  uuid;
  g      jsonb;
begin
  select * into v_prop from public.custom_tables
   where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904' and slug = 'propostas_comerciais' and deleted_at is null;
  select * into v_cont from public.custom_tables
   where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904' and slug = 'contratos' and deleted_at is null;

  assert v_prop.artifact_kind = 'proposal' and v_cont.artifact_kind = 'contract',
    'SEED FAIL: as duas tabelas deveriam nascer como artefato';
  assert (select count(*) from public.custom_tables where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904')
         = (select tables from pg_temp.before_seed) + 2,
    'SEED FAIL: rodar duas vezes deveria criar so as duas tabelas';

  -- field_id e key únicos; nenhuma coluna sem os dois.
  assert (select count(distinct c->>'field_id') = count(*) and count(distinct c->>'key') = count(*)
                 and bool_and(nullif(c->>'field_id', '') is not null and nullif(c->>'key', '') is not null)
            from jsonb_array_elements(v_prop.table_schema) c),
    'SEED FAIL: Propostas Comerciais com field_id/key repetido ou vazio';
  assert (select count(distinct c->>'field_id') = count(*) and count(distinct c->>'key') = count(*)
            from jsonb_array_elements(v_cont.table_schema) c),
    'SEED FAIL: Contratos com field_id/key repetido';

  -- Consulta só com fonte que existe.
  assert not exists (
    select 1 from public.custom_tables t, jsonb_array_elements(t.table_schema) c
     where t.id in (v_prop.id, v_cont.id) and c->>'type' = 'lookup'
       and not (c->'lookupConfig'->>'source' = any (array['contact.name', 'contact.phone', 'contact.email',
                                                          'deal.value', 'deal.stage', 'deal.owner', 'deal.items']))),
    'SEED FAIL: consulta com fonte desconhecida';

  -- O formulário dos Contratos: só tipos aceitos, 17 campos, 8 obrigatórios.
  assert jsonb_array_length(v_cont.form_config->'fields') = 17
     and (select count(*) from jsonb_array_elements(v_cont.form_config->'fields') f where (f->>'required')::boolean) = 8,
    'SEED FAIL: o formulario dos Contratos: ' || (v_cont.form_config)::text;
  assert not exists (
    select 1 from jsonb_array_elements(v_cont.form_config->'fields') f
      join jsonb_array_elements(v_cont.table_schema) c on c->>'field_id' = f->>'field_id'
     where not (c->>'type' = any (public._crm_form_field_types()))),
    'SEED FAIL: o formulario pede um campo que o formulario nao aceita';

  -- E abre de verdade pelo lado público.
  insert into public.custom_table_records (equipe_id, table_id, data)
  values (v_cont.equipe_id, v_cont.id, '{}') returning id into v_rec;
  insert into public.custom_record_form_links (equipe_id, table_id, record_id, token_hash, expires_at)
  values (v_cont.equipe_id, v_cont.id, v_rec, encode(extensions.digest('ensaio-seed', 'sha256'), 'hex'), now() + interval '1 day');
  g := public._crm_public_form_get('ensaio-seed');
  assert g->>'title' = 'Dados para Contrato' and jsonb_array_length(g->'fields') = 17 and g->>'team' = 'Solo Energia',
    'SEED FAIL: o formulario publico dos Contratos nao abriu: ' || coalesce(g::text, 'null');

  -- A "Teste" continua lá (a semente não mexe no que existe).
  assert exists (select 1 from public.custom_tables
                  where equipe_id = '939d7dd8-592c-4fda-946e-3568f2909904' and lower(name) = 'teste' and deleted_at is null),
    'SEED FAIL: a tabela Teste sumiu';

  raise notice 'semente: Propostas Comerciais (% colunas), Contratos (% colunas, formulario com % campos)',
    jsonb_array_length(v_prop.table_schema), jsonb_array_length(v_cont.table_schema), jsonb_array_length(v_cont.form_config->'fields');
end $$;

rollback;
select 'PASS' as result;
