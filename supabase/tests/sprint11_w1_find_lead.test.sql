-- Sprint 11 · T7 — o lead que volta pelo formulário é achado.
--
-- Run:  bash scripts/sqltest.sh supabase/tests/sprint11_w1_find_lead.test.sql
--
-- O crm-webhook procurava lead existente por `phone = <só dígitos>`. 897 dos
-- 1.175 telefones da Solo Energia estão com máscara, então não achava, tentava
-- inserir, batia no UNIQUE (equipe_id, phone_normalized) e respondia 500: o lead
-- do formulário sumia. A busca agora compara pelo telefone normalizado, com a
-- mesma função que o trigger usa para preencher a coluna.

begin;

-- @include supabase/migrations/20260910000300_sprint11_find_lead_by_phone.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
  ('5117a000-0000-0000-0000-000000000001', 'S11 Telefone A', 'x', 'y'),
  ('5117a000-0000-0000-0000-000000000002', 'S11 Telefone B', 'x', 'y');

insert into public.leads (id, equipe_id, name, phone) values
  ('5117b000-0000-0000-0000-000000000001', '5117a000-0000-0000-0000-000000000001', 'Maria A',   '(85) 99262-5840'),
  ('5117b000-0000-0000-0000-000000000002', '5117a000-0000-0000-0000-000000000002', 'Maria B',   '(85) 99262-5840'),
  ('5117b000-0000-0000-0000-000000000003', '5117a000-0000-0000-0000-000000000001', 'Apagado A', '(11) 98888-7777');

update public.leads set deleted_at = now() where id = '5117b000-0000-0000-0000-000000000003';

do $$
declare
  v_a uuid := '5117a000-0000-0000-0000-000000000001';
  v_b uuid := '5117a000-0000-0000-0000-000000000002';
  q text;
begin
  -- 1. O mesmo número, digitado de cinco jeitos, acha o mesmo lead.
  foreach q in array array['(85) 99262-5840', '+55 85 99262-5840', '5585992625840', '85992625840', '8592625840'] loop
    assert public.crm_find_lead_by_phone(v_a, q) = '5117b000-0000-0000-0000-000000000001',
      'T7-1 FAIL: "' || q || '" deveria achar a Maria A';
  end loop;

  -- 2. O tenant manda: o mesmo número em outra equipe é outro lead.
  assert public.crm_find_lead_by_phone(v_b, '(85) 99262-5840') = '5117b000-0000-0000-0000-000000000002',
    'T7-2 FAIL: a equipe B deveria achar a propria Maria';

  -- 3. Lead apagado não conta.
  assert public.crm_find_lead_by_phone(v_a, '(11) 98888-7777') is null,
    'T7-3 FAIL: achou um lead apagado';

  -- 4. Lixo não acha nada.
  assert public.crm_find_lead_by_phone(v_a, '123') is null, 'T7-4 FAIL: telefone curto achou alguem';
  assert public.crm_find_lead_by_phone(v_a, null) is null, 'T7-4 FAIL: telefone nulo achou alguem';
  assert public.crm_find_lead_by_phone(v_a, '') is null, 'T7-4 FAIL: telefone vazio achou alguem';
end $$;

-- 5. Só o service_role (o crm-webhook) pode chamar: com equipe como parâmetro,
--    um usuário comum sondaria telefones de outros clientes.
do $$ begin
  assert not has_function_privilege('authenticated', 'public.crm_find_lead_by_phone(uuid, text)', 'execute'),
    'T7-5 FAIL: authenticated pode chamar crm_find_lead_by_phone';
  assert not has_function_privilege('anon', 'public.crm_find_lead_by_phone(uuid, text)', 'execute'),
    'T7-5 FAIL: anon pode chamar crm_find_lead_by_phone';
  assert has_function_privilege('service_role', 'public.crm_find_lead_by_phone(uuid, text)', 'execute'),
    'T7-5 FAIL: service_role nao pode chamar crm_find_lead_by_phone';
end $$;

rollback;
select 'PASS' as result;
