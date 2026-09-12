-- Sprint 11 · Onda 4 · T45 — formulário público por registro.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w4_public_forms.test.sql
--
-- O que este teste protege: a tabela escolhe só campos que um formulário aceita;
-- o link guarda o hash, vale 30 dias e gerar outro revoga o anterior; o público vê
-- só os campos do formulário (com o valor atual); o envio valida cada tipo no
-- servidor, recusa obrigatório vazio, grava por field_id e fecha o link; o
-- vizinho não gera link; o app não chama o lado público.

begin;

-- @include supabase/migrations/20260912100100_sprint11_w4_custom_tables_field_id.sql
-- @include supabase/migrations/20260912100200_sprint11_w4_artifacts.sql
-- @include supabase/migrations/20260912100300_sprint11_w4_artifact_files.sql
-- @include supabase/migrations/20260912100400_sprint11_w4_artifact_lifecycle.sql
-- @include supabase/migrations/20260912100500_sprint11_w4_artifact_actions.sql
-- @include supabase/migrations/20260912100600_sprint11_w4_public_forms.sql

-- ---------------------------------------------------------------- fixtures --
insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5125a000-0000-0000-0000-000000000001', 'S11W4 Form A', 'x', 'y'),
  ('5125a000-0000-0000-0000-000000000002', 'S11W4 Form B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5125b000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chefe@s11w4-form.test',   'x', now(), now()),
  ('5125b000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vizinho@s11w4-form.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5125b000-0000-0000-0000-00000000000a', '5125b000-0000-0000-0000-00000000000a', 'chefe@s11w4-form.test',   '5125a000-0000-0000-0000-000000000001', 'Chefe',   'admin'),
  ('5125b000-0000-0000-0000-00000000000d', '5125b000-0000-0000-0000-00000000000d', 'vizinho@s11w4-form.test', '5125a000-0000-0000-0000-000000000002', 'Vizinho', 'admin')
on conflict (id) do update
  set equipe_id = excluded.equipe_id, nome_completo = excluded.nome_completo, role = excluded.role;

insert into public.custom_tables (id, equipe_id, name, slug, artifact_kind, table_schema) values
  ('51250000-0000-0000-0000-0000000000c1', '5125a000-0000-0000-0000-000000000001', 'Contratos', 'contratos_form', 'contract',
   jsonb_build_array(
     jsonb_build_object('field_id', 'f-nome', 'key', 'nome_completo', 'label', 'Nome completo', 'type', 'text'),
     jsonb_build_object('field_id', 'f-cpf', 'key', 'cpf', 'label', 'CPF', 'type', 'text'),
     jsonb_build_object('field_id', 'f-renda', 'key', 'renda', 'label', 'Renda', 'type', 'currency'),
     jsonb_build_object('field_id', 'f-nasc', 'key', 'nascimento', 'label', 'Nascimento', 'type', 'date'),
     jsonb_build_object('field_id', 'f-civil', 'key', 'estado_civil', 'label', 'Estado civil', 'type', 'select',
                        'options', jsonb_build_array('Solteiro', 'Casado')),
     jsonb_build_object('field_id', 'f-tel', 'key', 'telefone', 'label', 'Telefone', 'type', 'phone'),
     jsonb_build_object('field_id', 'f-interno', 'key', 'nota_interna', 'label', 'Nota interna', 'type', 'text'),
     jsonb_build_object('field_id', 'f-dono', 'key', 'vendedor', 'label', 'Vendedor', 'type', 'user')));

insert into public.custom_table_records (id, equipe_id, table_id, data) values
  ('51250000-0000-0000-0000-0000000000a1', '5125a000-0000-0000-0000-000000000001', '51250000-0000-0000-0000-0000000000c1',
   '{"f-nome":"Joao","f-interno":"cliente dificil"}');

create temp table pg_temp.t45 (k text primary key, val text);
grant all on pg_temp.t45 to authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"5125b000-0000-0000-0000-00000000000a","role":"authenticated"}';

-- ============================================================================
-- 1. Configurar: só campos que um formulário aceita.
-- ============================================================================
do $$
declare v jsonb; v_failed boolean := false;
begin
  begin
    perform public.crm_create_form_link('51250000-0000-0000-0000-0000000000a1');
  exception when others then v_failed := sqlerrm = 'form_not_enabled';
  end;
  assert v_failed, 'T45-1 FAIL: sem formulario ligado nao deveria gerar link';

  v_failed := false;
  begin
    perform public.crm_save_form_config('51250000-0000-0000-0000-0000000000c1',
      '{"enabled":true,"fields":[{"field_id":"f-dono"}]}');
  exception when others then v_failed := sqlerrm = 'invalid_form_field';
  end;
  assert v_failed, 'T45-1 FAIL: campo de usuario nao entra no formulario publico';

  v := public.crm_save_form_config('51250000-0000-0000-0000-0000000000c1', jsonb_build_object(
         'enabled', true, 'title', 'Dados para Contrato', 'intro', 'Preencha para gerarmos o contrato.',
         'fields', jsonb_build_array(
           jsonb_build_object('field_id', 'f-nome', 'required', true),
           jsonb_build_object('field_id', 'f-cpf', 'required', true),
           jsonb_build_object('field_id', 'f-renda'),
           jsonb_build_object('field_id', 'f-nasc'),
           jsonb_build_object('field_id', 'f-civil'),
           jsonb_build_object('field_id', 'f-tel'),
           jsonb_build_object('field_id', 'f-cpf'))));
  assert jsonb_array_length(v->'fields') = 6, 'T45-1 FAIL: campo repetido deveria entrar uma vez, veio ' || v::text;
end $$;

-- ============================================================================
-- 2. O link: hash guardado, 30 dias, gerar outro revoga o anterior.
-- ============================================================================
do $$
declare v1 jsonb; v2 jsonb;
begin
  v1 := public.crm_create_form_link('51250000-0000-0000-0000-0000000000a1');
  v2 := public.crm_create_form_link('51250000-0000-0000-0000-0000000000a1');
  assert length(v2->>'token') = 64 and v1->>'token' <> v2->>'token', 'T45-2 FAIL: cada link deveria ter um token novo';
  assert (select count(*) from public.custom_record_form_links
           where record_id = '51250000-0000-0000-0000-0000000000a1' and revoked_at is null) = 1,
    'T45-2 FAIL: gerar outro link deveria revogar o anterior';
  assert not exists (select 1 from public.custom_record_form_links where token_hash = v2->>'token'),
    'T45-2 FAIL: o token nao deveria ficar guardado em claro';
  assert (v2->>'expires_at')::timestamptz between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour',
    'T45-2 FAIL: o link deveria valer 30 dias';
  insert into pg_temp.t45 values ('old', v1->>'token'), ('token', v2->>'token');
end $$;

-- ============================================================================
-- 3. O público: vê só os campos do formulário; o envio valida no servidor.
-- ============================================================================
reset role;
set local role service_role;
do $$
declare g jsonb; v_failed boolean;
begin
  v_failed := false;
  begin
    perform public._crm_public_form_get((select val from pg_temp.t45 where k = 'old'));
  exception when others then v_failed := sqlerrm = 'form_revoked';
  end;
  assert v_failed, 'T45-3 FAIL: o link revogado deveria ser recusado';

  g := public._crm_public_form_get((select val from pg_temp.t45 where k = 'token'));
  assert g->>'team' = 'S11W4 Form A' and g->>'title' = 'Dados para Contrato', 'T45-3 FAIL: cabecalho do formulario: ' || g::text;
  assert (select array_agg(x->>'key' order by o) from jsonb_array_elements(g->'fields') with ordinality t(x, o))
         = array['nome_completo', 'cpf', 'renda', 'nascimento', 'estado_civil', 'telefone'],
    'T45-3 FAIL: o formulario deveria ter so os campos escolhidos, na ordem';
  assert g->'fields'->0->>'value' = 'Joao' and (g->'fields'->0->>'required')::boolean,
    'T45-3 FAIL: o campo deveria vir com o valor atual e se e obrigatorio';
  assert position('cliente dificil' in g::text) = 0, 'T45-3 FAIL: campo fora do formulario vazou para o publico';

  -- Obrigatório vazio recusa o envio inteiro.
  v_failed := false;
  begin
    perform public._crm_public_form_submit((select val from pg_temp.t45 where k = 'token'), '{"nome_completo":"Joao da Silva","cpf":"  "}');
  exception when others then v_failed := sqlerrm = 'required:cpf';
  end;
  assert v_failed, 'T45-3 FAIL: CPF obrigatorio vazio deveria recusar o envio';

  -- Cada tipo é validado.
  v_failed := false;
  begin
    perform public._crm_public_form_submit((select val from pg_temp.t45 where k = 'token'),
      '{"nome_completo":"Joao","cpf":"529.982.247-25","estado_civil":"Viuvo"}');
  exception when others then v_failed := sqlerrm = 'invalid_field:estado_civil';
  end;
  assert v_failed, 'T45-3 FAIL: opcao fora da lista deveria ser recusada';

  v_failed := false;
  begin
    perform public._crm_public_form_submit((select val from pg_temp.t45 where k = 'token'),
      '{"nome_completo":"Joao","cpf":"529.982.247-25","renda":"muito"}');
  exception when others then v_failed := sqlerrm = 'invalid_field:renda';
  end;
  assert v_failed, 'T45-3 FAIL: renda que nao e numero deveria ser recusada';

  v_failed := false;
  begin
    perform public._crm_public_form_submit((select val from pg_temp.t45 where k = 'token'),
      '{"nome_completo":"Joao","cpf":"529.982.247-25","telefone":"123"}');
  exception when others then v_failed := sqlerrm = 'invalid_field:telefone';
  end;
  assert v_failed, 'T45-3 FAIL: telefone curto deveria ser recusado';

  -- O envio válido: grava por field_id, só os campos do formulário, e fecha o link.
  perform public._crm_public_form_submit((select val from pg_temp.t45 where k = 'token'), jsonb_build_object(
    'nome_completo', 'Joao da Silva', 'cpf', '529.982.247-25', 'renda', '4.500,00',
    'nascimento', '1985-03-10', 'estado_civil', 'Casado', 'telefone', '(85) 99999-0000',
    'nota_interna', 'tentativa de escrever fora do formulario'));
end $$;

reset role;
do $$
declare v_data jsonb;
begin
  select data into v_data from public.custom_table_records where id = '51250000-0000-0000-0000-0000000000a1';
  assert v_data->>'f-nome' = 'Joao da Silva' and v_data->>'f-cpf' = '529.982.247-25'
         and (v_data->>'f-renda')::numeric = 4500 and v_data->>'f-civil' = 'Casado',
    'T45-4 FAIL: o envio deveria gravar por field_id, veio ' || v_data::text;
  assert v_data->>'f-interno' = 'cliente dificil', 'T45-4 FAIL: o publico escreveu num campo fora do formulario';
  assert (select submitted_at is not null from public.custom_record_form_links
           where record_id = '51250000-0000-0000-0000-0000000000a1' and revoked_at is null),
    'T45-4 FAIL: o link deveria guardar a hora do envio';
end $$;

set local role service_role;
do $$
declare v_failed boolean := false;
begin
  begin
    perform public._crm_public_form_get((select val from pg_temp.t45 where k = 'token'));
  exception when others then v_failed := sqlerrm = 'form_submitted';
  end;
  assert v_failed, 'T45-4 FAIL: o link deveria valer ate o envio';
end $$;

-- ============================================================================
-- 5. O vizinho não gera link; o app não chama o lado público.
-- ============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5125b000-0000-0000-0000-00000000000d","role":"authenticated"}';
do $$
declare v_failed boolean;
begin
  v_failed := false;
  begin
    perform public.crm_create_form_link('51250000-0000-0000-0000-0000000000a1');
  exception when others then v_failed := sqlerrm = 'record_not_found';
  end;
  assert v_failed, 'T45-5 FAIL: o vizinho gerou link de um registro da equipe A';

  assert (select count(*) from public.custom_record_form_links) = 0, 'T45-5 FAIL: o vizinho ve os links da equipe A';

  v_failed := false;
  begin
    perform public._crm_public_form_get('x');
  exception when insufficient_privilege then v_failed := true;
  end;
  assert v_failed, 'T45-5 FAIL: o app nao deveria chamar o lado publico';
end $$;

rollback;
select 'PASS' as result;
