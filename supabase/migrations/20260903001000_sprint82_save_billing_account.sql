-- 20260903001000_sprint82_save_billing_account.sql
-- Sprint 8.2 - "Dados de cobranca" nao salvava.
--
-- O QUE ACONTECE HOJE
--
-- `billing_accounts` tem RLS ligado e UMA politica: billing_accounts_tenant_read,
-- de SELECT. Nao existe politica de INSERT nem de UPDATE. A tela
-- (BillingDataPage) faz `supabase.from("billing_accounts").upsert(...)` direto
-- do navegador, e o resultado depende de a linha existir:
--
--   * linha NAO existe -> o INSERT bate no RLS e volta 42501. O cliente ve
--     "Nao foi possivel salvar" com uma mensagem de erro de banco.
--   * linha existe      -> o UPDATE nao casa com politica nenhuma, afeta ZERO
--     linhas, e o PostgREST devolve 200. O toast diz "Dados de cobranca
--     salvos" e nada foi salvo.
--
-- O segundo caso e o pior: o cliente preenche CNPJ e endereco, le "salvos",
-- e semanas depois a cobranca nao sai por falta de documento.
--
-- E A TERCEIRA VEZ QUE ESTE MESMO BUG APARECE. A 36244e1 corrigiu o
-- GoLiveDialog, que escrevia nesta mesma tabela pelo mesmo caminho. Corrigi
-- aquela chamada e nao procurei as outras -- esta ficou.
--
-- POR QUE UMA FUNCAO E NAO UMA POLITICA DE UPDATE
--
-- Uma politica `for update using (equipe_id = a minha)` resolveria o sintoma e
-- abriria um buraco: pelo PostgREST o cliente poderia gravar QUALQUER coluna da
-- propria linha -- inclusive `asaas_customer_id` e `asaas_card_token`. Apontar
-- o proprio asaas_customer_id para o cliente de outra pessoa e um ataque real,
-- e o cartao salvo alheio idem.
--
-- A funcao aceita so o que o cliente pode mudar. `asaas_customer_id`,
-- `asaas_card_token`, `card_last4`, `card_brand`, `autopay_enabled` e
-- `equipe_id` ficam fora do alcance dela por construcao -- nao ha parametro.
-- E o mesmo desenho de `set_autopay`.

create or replace function public.save_billing_account(
  p_doc_type           text,
  p_doc_number         text,
  p_legal_name         text default null,
  p_billing_email      text default null,
  p_phone              text default null,
  p_postal_code        text default null,
  p_address_street     text default null,
  p_address_number     text default null,
  p_address_complement text default null,
  p_address_district   text default null,
  p_address_city       text default null,
  p_address_state      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_equipe uuid;
  v_doc    text;
begin
  select equipe_id into v_equipe from public.profiles where user_id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = 'P0001';
  end if;

  if p_doc_type is null or p_doc_type not in ('CPF','CNPJ') then
    raise exception 'doc_type_invalid' using errcode = 'P0001';
  end if;

  -- Só dígitos: é o formato que o gateway espera, e guardar a máscara
  -- significa normalizar de novo em todo lugar que lê.
  v_doc := regexp_replace(coalesce(p_doc_number,''), '[^0-9]', '', 'g');

  -- Forma, não dígito verificador. O DV é conferido na tela (br-doc.ts) e de
  -- novo em checkBillingReadiness antes de qualquer cobrança -- que é a porta
  -- que realmente importa. Uma terceira cópia da conta do DV aqui seria um
  -- terceiro lugar para divergir.
  if (p_doc_type = 'CPF'  and length(v_doc) <> 11)
  or (p_doc_type = 'CNPJ' and length(v_doc) <> 14) then
    raise exception 'doc_invalid' using errcode = 'P0001';
  end if;
  -- 00000000000 passa em qualquer conta de tamanho e nunca é um documento real.
  if v_doc ~ ('^(.)\1{' || (length(v_doc) - 1)::text || '}$') then
    raise exception 'doc_invalid' using errcode = 'P0001';
  end if;

  insert into public.billing_accounts (
    equipe_id, doc_type, doc_number, legal_name, billing_email, phone,
    postal_code, address_street, address_number, address_complement,
    address_district, address_city, address_state
  ) values (
    v_equipe, p_doc_type, v_doc,
    nullif(btrim(coalesce(p_legal_name,'')), ''),
    nullif(btrim(coalesce(p_billing_email,'')), ''),
    nullif(btrim(coalesce(p_phone,'')), ''),
    nullif(btrim(coalesce(p_postal_code,'')), ''),
    nullif(btrim(coalesce(p_address_street,'')), ''),
    nullif(btrim(coalesce(p_address_number,'')), ''),
    nullif(btrim(coalesce(p_address_complement,'')), ''),
    nullif(btrim(coalesce(p_address_district,'')), ''),
    nullif(btrim(coalesce(p_address_city,'')), ''),
    nullif(btrim(coalesce(p_address_state,'')), '')
  )
  on conflict (equipe_id) do update set
    doc_type           = excluded.doc_type,
    doc_number         = excluded.doc_number,
    legal_name         = excluded.legal_name,
    billing_email      = excluded.billing_email,
    phone              = excluded.phone,
    postal_code        = excluded.postal_code,
    address_street     = excluded.address_street,
    address_number     = excluded.address_number,
    address_complement = excluded.address_complement,
    address_district   = excluded.address_district,
    address_city       = excluded.address_city,
    address_state      = excluded.address_state;

  return jsonb_build_object('saved', true, 'equipe_id', v_equipe, 'doc_number', v_doc);
end;
$fn$;

comment on function public.save_billing_account(text,text,text,text,text,text,text,text,text,text,text,text) is
  'Sprint 8.2 - o cliente salva os proprios dados de cobranca. billing_accounts so tem politica de SELECT, entao a escrita direta da tela falhava (42501) ou afetava zero linhas devolvendo sucesso. Aceita SO os campos que o cliente pode mudar: asaas_customer_id, asaas_card_token e autopay ficam fora por construcao.';

revoke all on function public.save_billing_account(text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.save_billing_account(text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- ============================================================================
-- A SEGUNDA TELA COM O MESMO DEFEITO
--
-- `AutoRecharge.tsx` faz `update billing_accounts set auto_recharge_*` direto
-- do navegador. Como a linha SEMPRE existe quando essa tela aparece, cai no
-- caso silencioso: zero linhas, 200, toast "Preferencia salva". A recarga
-- automatica nunca foi ligada por ninguem -- o cliente marca, le que salvou, e
-- o saldo acaba assim mesmo.
--
-- Achado varrendo o frontend por escrita direta em tabela com RLS so de
-- leitura, depois que o mesmo bug apareceu pela terceira vez. `billing_accounts`
-- era a unica tabela nessa situacao, com estes dois chamadores.
-- ============================================================================

create or replace function public.save_auto_recharge(
  p_enabled    boolean,
  p_threshold  integer,
  p_product_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_equipe uuid;
begin
  select equipe_id into v_equipe from public.profiles where user_id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = 'P0001';
  end if;

  if coalesce(p_threshold, 0) < 0 then
    raise exception 'threshold_invalid' using errcode = 'P0001';
  end if;

  -- O pacote precisa ser um pacote de credito de verdade. Sem esta checagem o
  -- cliente poderia apontar a recarga para QUALQUER produto do catalogo pelo
  -- PostgREST -- inclusive um plano -- e a recarga automatica compraria aquilo.
  if p_product_id is not null and not exists (
    select 1 from public.billing_products
     where id = p_product_id and kind = 'credit_pack' and active
  ) then
    raise exception 'product_invalid' using errcode = 'P0001';
  end if;

  -- Ligar sem dizer o que comprar deixaria o cron sem instrucao: ele acordaria
  -- todo dia com a recarga ligada e nada para comprar.
  if coalesce(p_enabled, false) and p_product_id is null then
    raise exception 'product_required' using errcode = 'P0001';
  end if;

  update public.billing_accounts set
    auto_recharge_enabled    = coalesce(p_enabled, false),
    auto_recharge_threshold  = coalesce(p_threshold, 0),
    auto_recharge_product_id = p_product_id
  where equipe_id = v_equipe;

  if not found then
    raise exception 'no_billing_account' using errcode = 'P0001';
  end if;

  return jsonb_build_object('saved', true, 'enabled', coalesce(p_enabled, false));
end;
$fn$;

comment on function public.save_auto_recharge(boolean,integer,uuid) is
  'Sprint 8.2 - o cliente liga a recarga automatica de creditos. Antes a tela escrevia direto e o RLS engolia em silencio (0 linhas, 200): a recarga nunca ligou. Valida que o pacote e credit_pack ativo -- senao daria para apontar a recarga para qualquer produto.';

revoke all on function public.save_auto_recharge(boolean,integer,uuid) from public, anon;
grant execute on function public.save_auto_recharge(boolean,integer,uuid) to authenticated;

-- ============================================================================
-- ASSERCOES
-- ============================================================================

do $$
declare
  v_eq   uuid;
  v_cnt  integer;
begin
  -- (a) a funcao existe, e definer, e nao esta exposta a anon
  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='save_billing_account' and p.prosecdef
  ), 'ASSERT FAILED: save_billing_account nao existe ou nao e security definer';

  assert not has_function_privilege(
    'anon', 'public.save_billing_account(text,text,text,text,text,text,text,text,text,text,text,text)', 'EXECUTE'
  ), 'ASSERT FAILED: anon pode executar save_billing_account';

  -- (b) sem sessao, recusa -- e nao grava na conta de ninguem
  begin
    perform public.save_billing_account('CNPJ', '11222333000181');
    raise exception 'ASSERT FAILED: gravou sem sessao';
  exception when others then
    assert sqlerrm = 'no_team', format('ASSERT FAILED: esperava no_team, veio %', sqlerrm);
  end;

  -- (c) A PROVA DO BUG: escrita direta continua nao funcionando para um
  --     cliente. Se algum dia alguem adicionar uma politica de UPDATE aberta,
  --     esta assercao passa a falhar e o motivo aparece aqui.
  select count(*) into v_cnt from pg_policy
   where polrelid='public.billing_accounts'::regclass and polcmd in ('a','w','*');
  assert v_cnt = 0,
    format('ASSERT FAILED: apareceram %s politica(s) de escrita em billing_accounts -- se foi de proposito, confira que o cliente nao consegue gravar asaas_customer_id nem asaas_card_token', v_cnt);

  -- (d) a segunda funcao existe e tambem recusa sem sessao
  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='save_auto_recharge' and p.prosecdef
  ), 'ASSERT FAILED: save_auto_recharge nao existe ou nao e security definer';

  begin
    perform public.save_auto_recharge(true, 500, null);
    raise exception 'ASSERT FAILED: save_auto_recharge gravou sem sessao';
  exception when others then
    assert sqlerrm = 'no_team', format('ASSERT FAILED: esperava no_team, veio %', sqlerrm);
  end;

  -- (e) NENHUMA outra tabela ficou com RLS so de leitura sendo escrita pela
  --     tela. billing_accounts era a unica; esta assercao existe para que a
  --     proxima apareca aqui em vez de virar um "salvou" que nao salvou.
  select count(*) into v_cnt
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relrowsecurity
     and c.relname = 'billing_accounts'
     and not exists (select 1 from pg_policy p where p.polrelid=c.oid and p.polcmd in ('a','w','*'));
  assert v_cnt = 1,
    'ASSERT FAILED: billing_accounts deixou de ser somente-leitura no RLS -- reveja as duas funcoes acima';

  raise notice 'Sprint 8.2 - save_billing_account + save_auto_recharge: assercoes passaram';
end $$;
