-- 20260902000400_sprint82_brand_solo_rev.sql
-- Sprint 8.2 · o produto passa a se chamar Solo Rev.
--
-- Rev de Receita e de Revolução: o objetivo do produto é ser um motor de
-- receita. "Sales Engine" era o nome interno de engenharia, e ele vazou para
-- textos que o cliente lê — inclusive para `setup_deliverables`, que é a lista
-- de entregas exibida na proposta pública. Ou seja: para o texto que ele
-- literalmente aceita ao clicar em "Aceitar proposta".
--
-- Solo Rev é o PRODUTO. Solo Ventures continua sendo a EMPRESA que fatura, e é
-- ela que assina o remetente e o rodapé dos e-mails. Trocar as duas pelo mesmo
-- nome quebraria a nota fiscal.
--
-- O código tem um guarda para isto (src/__tests__/brand-consistency.test.ts).
-- Esta migration cuida do que o guarda não alcança: texto que mora no banco.

update public.setup_deliverables
   set title       = replace(title, 'Sales Engine', 'Solo Rev'),
       description = replace(coalesce(description, ''), 'Sales Engine', 'Solo Rev')
 where title like '%Sales Engine%' or description like '%Sales Engine%';

update public.billing_products
   set name = replace(name, 'Sales Engine', 'Solo Rev')
 where name like '%Sales Engine%';

update public.notification_types
   set description    = replace(coalesce(description, ''),    'Sales Engine', 'Solo Rev'),
       template_title = replace(coalesce(template_title, ''), 'Sales Engine', 'Solo Rev'),
       template_body  = replace(coalesce(template_body, ''),  'Sales Engine', 'Solo Rev')
 where description like '%Sales Engine%'
    or template_title like '%Sales Engine%'
    or template_body like '%Sales Engine%';

-- ============================================================================
-- ASSERÇÕES
-- ============================================================================

do $$
declare
  v_cnt integer;
  v_txt text;
begin
  -- (a) nada que o cliente lê ainda diz o nome antigo
  select count(*) into v_cnt from public.setup_deliverables
   where title like '%Sales Engine%' or coalesce(description, '') like '%Sales Engine%';
  assert v_cnt = 0,
    format('ASSERT FAILED: %s entrega(s) da proposta ainda dizem "Sales Engine"', v_cnt);

  select count(*) into v_cnt from public.billing_products where name like '%Sales Engine%';
  assert v_cnt = 0, format('ASSERT FAILED: %s produto(s) ainda dizem "Sales Engine"', v_cnt);

  select count(*) into v_cnt from public.notification_types
   where coalesce(template_title, '') like '%Sales Engine%'
      or coalesce(template_body, '')  like '%Sales Engine%';
  assert v_cnt = 0, format('ASSERT FAILED: %s template(s) ainda dizem "Sales Engine"', v_cnt);

  -- (b) o item que motivou isto continua existindo, com o nome novo
  select title into v_txt from public.setup_deliverables where code = 'ads_integration';
  assert v_txt like '%Solo Rev%',
    format('ASSERT FAILED: a integração de anúncios diz "%s"', v_txt);

  raise notice 'Sprint 8.2 · marca nos dados: asserções passaram';
end $$;
