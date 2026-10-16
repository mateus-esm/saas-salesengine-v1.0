-- Sprint Suporte 1 · #7 — formulários de ingestão (crm_forms, _crm_intake_submit).
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sesup1_intake_forms.test.sql
-- (Roda contra o projeto linkado dentro de BEGIN…ROLLBACK; a migration é recriada
--  dentro da transação. NÃO foi executado pelo implementador: não há banco local e a
--  regra da sprint proíbe escrita em produção. Revisar lendo e rodar antes do deploy.)
--
-- O que este teste protege:
--   1. trigger de definição: pipeline/etapa/responsável de outra equipe, etapa de outro
--      pipeline, custom:<id> fora do schema do pipeline (ou apagado), mais de 40 campos
--   2. data real (2026-13-45 não é data)
--   3. envio cria lead + negócio na etapa configurada, custom_data por field_id; dedupe por
--      telefone (formatos diferentes) e depois por e-mail; só preenche vazio; custom_data
--      já preenchido ganha; o negócio aberto do pipeline é reaproveitado; honeypot responde
--      ok sem criar nada; validação recusada devolve {ok:false,error} e fica registrada
--   4. rate limit por (formulário, IP): 5/min, recusas contam; teto do formulário: 60/min
--   5. etapa apagada depois não derruba o envio (UPDATE só de entry_id não revalida), mas
--      editar o formulário com a etapa apagada continua recusado
--   (não coberto: corrida de 23505 em leads — exige duas sessões)

begin;
-- @include supabase/migrations/20261015000600_sesup1_intake_forms.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5e700000-0000-0000-0000-00000000000a', 'Forms A', 'x', 'y'),
  ('5e700000-0000-0000-0000-00000000000b', 'Forms B', 'x', 'y');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5e7b0000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@sesup1-forms.test', 'x', now(), now()),
  ('5e7b0000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@sesup1-forms.test', 'x', now(), now());

insert into public.profiles (id, user_id, email, equipe_id, nome_completo, role) values
  ('5e7b0000-0000-0000-0000-00000000000a', '5e7b0000-0000-0000-0000-00000000000a', 'a@sesup1-forms.test', '5e700000-0000-0000-0000-00000000000a', 'Vendedor A', 'user'),
  ('5e7b0000-0000-0000-0000-00000000000b', '5e7b0000-0000-0000-0000-00000000000b', 'b@sesup1-forms.test', '5e700000-0000-0000-0000-00000000000b', 'Vendedor B', 'user')
on conflict (id) do update set equipe_id = excluded.equipe_id, role = excluded.role;

-- PA tem um campo vivo (...0a) e um apagado (...0d); PB (equipe B) tem o seu.
insert into public.pipelines (id, equipe_id, name, custom_fields_schema) values
  ('5e7c0000-0000-0000-0000-00000000000a', '5e700000-0000-0000-0000-00000000000a', 'Pipeline A',
   '[{"field_id":"aaaaaaaa-0000-0000-0000-00000000000a","key":"cidade","label":"Cidade","type":"text","required":false,"position":0},
     {"field_id":"aaaaaaaa-0000-0000-0000-00000000000d","key":"velho","label":"Velho","type":"text","required":false,"position":1,"is_deleted":true}]'::jsonb),
  ('5e7c0000-0000-0000-0000-0000000000a2', '5e700000-0000-0000-0000-00000000000a', 'Pipeline A2', '[]'::jsonb),
  ('5e7c0000-0000-0000-0000-00000000000b', '5e700000-0000-0000-0000-00000000000b', 'Pipeline B',
   '[{"field_id":"bbbbbbbb-0000-0000-0000-00000000000b","key":"x","label":"X","type":"text","required":false,"position":0}]'::jsonb);

insert into public.pipeline_stages_v2 (id, equipe_id, pipeline_id, name, position, stage_type) values
  ('5e7d0000-0000-0000-0000-00000000000a', '5e700000-0000-0000-0000-00000000000a', '5e7c0000-0000-0000-0000-00000000000a', 'Nova', 0, 'open'),
  ('5e7d0000-0000-0000-0000-0000000000a2', '5e700000-0000-0000-0000-00000000000a', '5e7c0000-0000-0000-0000-00000000000a', 'Nova 2', 1, 'open'),
  ('5e7d0000-0000-0000-0000-0000000000a3', '5e700000-0000-0000-0000-00000000000a', '5e7c0000-0000-0000-0000-0000000000a2', 'Outro pipeline', 0, 'open'),
  ('5e7d0000-0000-0000-0000-00000000000b', '5e700000-0000-0000-0000-00000000000b', '5e7c0000-0000-0000-0000-00000000000b', 'Nova B', 0, 'open');

create temp table _fields (f jsonb);
insert into _fields values ('[
  {"key":"nome","label":"Nome","type":"text","required":true,"target":"lead.name"},
  {"key":"tel","label":"Telefone","type":"phone","required":false,"target":"lead.phone"},
  {"key":"mail","label":"E-mail","type":"email","required":false,"target":"lead.email"},
  {"key":"nasc","label":"Nascimento","type":"date","required":false,"target":"lead.observations"},
  {"key":"cidade","label":"Cidade","type":"text","required":false,"target":"custom:aaaaaaaa-0000-0000-0000-00000000000a"}
]'::jsonb);

-- 1. Trigger de definição ------------------------------------------------------
do $$
declare
  v_f jsonb := (select f from _fields);
  v_many jsonb;
  v_target text;
begin
  -- válido
  insert into public.crm_forms (id, equipe_id, slug, title, fields, pipeline_id, stage_id, responsible_id)
  values ('5e7f0000-0000-0000-0000-00000000000a', '5e700000-0000-0000-0000-00000000000a', 'indicacao', 'Indicação', v_f,
          '5e7c0000-0000-0000-0000-00000000000a', '5e7d0000-0000-0000-0000-00000000000a', '5e7b0000-0000-0000-0000-00000000000a');

  -- pipeline de outra equipe
  begin
    insert into public.crm_forms (equipe_id, slug, title, fields, pipeline_id, stage_id)
    values ('5e700000-0000-0000-0000-00000000000a', 'x1', 'x', v_f, '5e7c0000-0000-0000-0000-00000000000b', '5e7d0000-0000-0000-0000-00000000000b');
    raise exception 'FALHA: pipeline de outra equipe aceito';
  exception when sqlstate '23514' then null; end;

  -- etapa de outro pipeline
  begin
    insert into public.crm_forms (equipe_id, slug, title, fields, pipeline_id, stage_id)
    values ('5e700000-0000-0000-0000-00000000000a', 'x2', 'x', v_f, '5e7c0000-0000-0000-0000-00000000000a', '5e7d0000-0000-0000-0000-0000000000a3');
    raise exception 'FALHA: etapa de outro pipeline aceita';
  exception when sqlstate '23514' then null; end;

  -- responsável de outra equipe
  begin
    insert into public.crm_forms (equipe_id, slug, title, fields, pipeline_id, stage_id, responsible_id)
    values ('5e700000-0000-0000-0000-00000000000a', 'x3', 'x', v_f, '5e7c0000-0000-0000-0000-00000000000a',
            '5e7d0000-0000-0000-0000-00000000000a', '5e7b0000-0000-0000-0000-00000000000b');
    raise exception 'FALHA: responsável de outra equipe aceito';
  exception when sqlstate '23514' then null; end;

  -- custom:<uuid> que não existe no pipeline, está apagado, ou é do pipeline de outra equipe
  for v_target in select unnest(array[
      'custom:cccccccc-0000-0000-0000-00000000000c',
      'custom:aaaaaaaa-0000-0000-0000-00000000000d',
      'custom:bbbbbbbb-0000-0000-0000-00000000000b']) loop
    begin
      insert into public.crm_forms (equipe_id, slug, title, fields, pipeline_id, stage_id)
      values ('5e700000-0000-0000-0000-00000000000a', 'x4', 'x',
              jsonb_set(v_f, '{4,target}', to_jsonb(v_target)),
              '5e7c0000-0000-0000-0000-00000000000a', '5e7d0000-0000-0000-0000-00000000000a');
      raise exception 'FALHA: destino % aceito', v_target;
    exception when sqlstate '23514' then null; end;
  end loop;

  -- mais de 40 campos
  select jsonb_agg(jsonb_build_object('key', 'k' || g, 'label', 'K' || g, 'type', 'text', 'required', false, 'target', 'lead.observations'))
    into v_many from generate_series(1, 41) g;
  begin
    insert into public.crm_forms (equipe_id, slug, title, fields, pipeline_id, stage_id)
    values ('5e700000-0000-0000-0000-00000000000a', 'x5', 'x', v_f || v_many, '5e7c0000-0000-0000-0000-00000000000a', '5e7d0000-0000-0000-0000-00000000000a');
    raise exception 'FALHA: mais de 40 campos aceito';
  exception when sqlstate '23514' then null; end;
end $$;

-- 2. Datas ---------------------------------------------------------------------
do $$
begin
  assert public._crm_is_valid_date('2026-10-16'), 'data real';
  assert public._crm_is_valid_date('2024-02-29'), 'bissexto';
  assert not public._crm_is_valid_date('2026-13-45'), 'mês 13';
  assert not public._crm_is_valid_date('2026-02-30'), '30 de fevereiro';
  assert not public._crm_is_valid_date('16/10/2026'), 'formato errado';
end $$;

-- 3. Envio, dedupe e custom_data -----------------------------------------------
do $$
declare
  v_token text := (select token from public.crm_forms where id = '5e7f0000-0000-0000-0000-00000000000a');
  v_res jsonb;
  v_lead uuid;
begin
  v_res := public._crm_intake_submit(v_token, '{"nome":"Ana","tel":"(85) 99262-5840","cidade":"Fortaleza"}', 'ip-1');
  assert (v_res->>'ok')::boolean, 'primeiro envio ok';
  assert (select count(*) from public.leads where equipe_id = '5e700000-0000-0000-0000-00000000000a') = 1, 'um lead';
  select id into v_lead from public.leads where equipe_id = '5e700000-0000-0000-0000-00000000000a';
  assert (select creation_source from public.leads where id = v_lead) = 'form', 'creation_source form';
  assert (select stage_id from public.opportunities where lead_id = v_lead) = '5e7d0000-0000-0000-0000-00000000000a', 'etapa configurada';
  assert (select owner_id from public.opportunities where lead_id = v_lead) = '5e7b0000-0000-0000-0000-00000000000a', 'dono = responsável do formulário';
  assert (select custom_data->>'aaaaaaaa-0000-0000-0000-00000000000a' from public.opportunities where lead_id = v_lead) = 'Fortaleza',
         'custom_data por field_id';

  -- mesmo telefone em outro formato: mesmo lead, mesmo negócio; nome não muda; e-mail vazio é
  -- preenchido; custom_data já preenchido ganha.
  v_res := public._crm_intake_submit(v_token, '{"nome":"Outro Nome","tel":"85992625840","mail":"ANA@x.com","cidade":"Sobral"}', 'ip-2');
  assert (v_res->>'ok')::boolean, 'segundo envio ok';
  assert (select count(*) from public.leads where equipe_id = '5e700000-0000-0000-0000-00000000000a') = 1, 'dedupe por telefone';
  assert (select count(*) from public.opportunities where lead_id = v_lead) = 1, 'negócio aberto reaproveitado';
  assert (select name from public.leads where id = v_lead) = 'Ana', 'nome nunca sobrescrito';
  assert (select email from public.leads where id = v_lead) = 'ana@x.com', 'e-mail vazio preenchido';
  assert (select custom_data->>'aaaaaaaa-0000-0000-0000-00000000000a' from public.opportunities where lead_id = v_lead) = 'Fortaleza',
         'valor já preenchido ganha no merge';

  -- telefone novo + mesmo e-mail: dedupe por e-mail
  v_res := public._crm_intake_submit(v_token, '{"nome":"Ana 3","tel":"(11) 98888-7777","mail":"ana@x.com"}', 'ip-3');
  assert (select count(*) from public.leads where equipe_id = '5e700000-0000-0000-0000-00000000000a') = 1, 'dedupe por e-mail';

  -- honeypot: ok, nada criado
  v_res := public._crm_intake_submit(v_token, '{"nome":"Bot","tel":"(21) 97777-6666","_hp":"http://spam"}', 'ip-bot');
  assert (v_res->>'ok')::boolean, 'honeypot responde ok';
  assert (select count(*) from public.leads where equipe_id = '5e700000-0000-0000-0000-00000000000a') = 1, 'honeypot não cria lead';
  assert (select count(*) from public.crm_form_submissions where status = 'honeypot') = 1, 'honeypot registrado';

  -- validação recusada: devolve {ok:false}, não levanta, e fica registrada
  v_res := public._crm_intake_submit(v_token, '{"nome":"Dia Ruim","tel":"(85) 99262-1111","nasc":"2026-13-45"}', 'ip-4');
  assert (v_res->>'ok')::boolean = false and v_res->>'error' = 'invalid_field:nasc', 'data impossível recusada';
  v_res := public._crm_intake_submit(v_token, '{"tel":"(85) 99262-1111"}', 'ip-4');
  assert v_res->>'error' = 'required:nome', 'nome obrigatório';
  v_res := public._crm_intake_submit(v_token, '{"nome":"Sem contato"}', 'ip-4');
  assert (v_res->>'ok')::boolean = false, 'sem telefone nem e-mail recusado';
  assert (select count(*) from public.crm_form_submissions where status = 'rejected') = 3, 'recusas registradas';
  assert (select count(*) from public.leads where equipe_id = '5e700000-0000-0000-0000-00000000000a') = 1, 'recusa não cria lead';
end $$;

-- 4. Rate limit ----------------------------------------------------------------
do $$
declare
  v_token text := (select token from public.crm_forms where id = '5e7f0000-0000-0000-0000-00000000000a');
  i int;
begin
  -- ip-4 já tem 3 recusas: mais 2 passam (5); a 6a tentativa é limitada. Recusas contam.
  perform public._crm_intake_submit(v_token, '{}', 'ip-4');
  perform public._crm_intake_submit(v_token, '{}', 'ip-4');
  begin
    perform public._crm_intake_submit(v_token, '{}', 'ip-4');
    raise exception 'FALHA: 6o envio do mesmo IP aceito';
  exception when sqlstate '53400' then null; end;

  -- outro IP não é afetado
  assert (public._crm_intake_submit(v_token, '{"nome":"Beto","tel":"(85) 99100-0001"}', 'ip-5')->>'ok')::boolean,
         'um IP limitado não tranca os outros';

  -- teto do formulário: 60/min no total, de IPs diferentes
  for i in 1..60 loop
    insert into public.crm_form_submissions (form_id, equipe_id, status, ip_hash)
    values ('5e7f0000-0000-0000-0000-00000000000a', '5e700000-0000-0000-0000-00000000000a', 'rejected', 'bulk-' || i);
  end loop;
  begin
    perform public._crm_intake_submit(v_token, '{"nome":"Caio","tel":"(85) 99100-0002"}', 'ip-novo');
    raise exception 'FALHA: teto do formulário não aplicado';
  exception when sqlstate '53400' then null; end;
end $$;

-- 5. Etapa apagada depois não derruba o envio ----------------------------------
do $$
declare
  v_f jsonb := (select f from _fields);
  v_token text;
begin
  insert into public.crm_forms (id, equipe_id, slug, title, fields, pipeline_id, stage_id)
  values ('5e7f0000-0000-0000-0000-0000000000f2', '5e700000-0000-0000-0000-00000000000a', 'segundo', 'Segundo', v_f,
          '5e7c0000-0000-0000-0000-00000000000a', '5e7d0000-0000-0000-0000-0000000000a2');
  select token into v_token from public.crm_forms where id = '5e7f0000-0000-0000-0000-0000000000f2';

  update public.pipeline_stages_v2 set deleted_at = now() where id = '5e7d0000-0000-0000-0000-0000000000a2';

  -- o 1o envio grava crm_forms.entry_id; isso não pode revalidar a etapa apagada
  assert (public._crm_intake_submit(v_token, '{"nome":"Dani","tel":"(85) 99200-0003"}', 'ip-6')->>'ok')::boolean,
         'envio com etapa apagada não quebra';
  assert (select entry_id from public.crm_forms where id = '5e7f0000-0000-0000-0000-0000000000f2') is not null, 'entry_id gravado';

  -- editar o formulário com a etapa apagada continua sendo recusado
  begin
    update public.crm_forms set title = 'Novo título' where id = '5e7f0000-0000-0000-0000-0000000000f2';
    raise exception 'FALHA: edição com etapa apagada aceita';
  exception when sqlstate '23514' then null; end;
end $$;

rollback;
select 'PASS' as result;
