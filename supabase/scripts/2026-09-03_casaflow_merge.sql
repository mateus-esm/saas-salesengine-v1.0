-- 2026-09-03_casaflow_merge.sql
-- Devolve o Felipe e o contrato novo para a Casa Flow que tem os dados.
--
-- Rodar assim:
--   python supabase/scripts/run_sql.py supabase/scripts/2026-09-03_casaflow_merge.sql --rehearse
--   python supabase/scripts/run_sql.py supabase/scripts/2026-09-03_casaflow_merge.sql --commit
--
-- ============================================================================
-- O QUE ACONTECEU
-- ============================================================================
--
-- O Felipe aceitou a proposta C43613118923 ("Casa Flow ADS") hoje. A proposta
-- estava SEM `target_equipe_id`, entao o provisionamento fez o que faz quando
-- nao lhe dizem o contrario: criou uma equipe NOVA. E `ensureInvite`, ao ver
-- que o e-mail dele ja tinha login, MOVEU o perfil para a equipe nova.
--
--   Casa Flow      aa33b576  29/04/2026  532 conversas, 526 leads, SEM contrato
--   Casa Flow ADS  a85be56a  03/09/2026  vazia, COM o contrato e o CPF
--
-- Do lado de quem usa, e perda total: o Felipe entra e nao ve nenhum dos 532
-- atendimentos. Eles estao intactos na equipe de abril, invisiveis para ele.
--
-- E O MESMO CAMINHO que quebrou a Solo Energia em 02/09. La a correcao foi
-- reconciliar por NOME (a 20260903000200). Aqui os nomes sao diferentes --
-- "Casa Flow" e "Casa Flow ADS" -- entao aquela regra nao pega este caso, e o
-- vinculo verdadeiro e outro: o MESMO E-MAIL de cliente.
--
-- ============================================================================
-- A DIFERENCA IMPORTANTE EM RELACAO A SOLO ENERGIA
-- ============================================================================
--
-- La, a conta de cobranca boa era a ANTIGA (tinha CPF e cliente Asaas reais) e
-- a nova estava vazia. Aqui e o contrario: quem tem o CPF (08141743376) e a
-- equipe NOVA, porque foi o Felipe que digitou ao aceitar. A antiga nao tem
-- documento nenhum.
--
-- Por isso a fusao aqui e campo a campo, com o preenchido vencendo o vazio --
-- e nao "a antiga prevalece". Copiar a regra do outro script apagaria o CPF
-- que o cliente acabou de informar.
--
-- NADA E APAGADO ANTES DE SER COPIADO para backup_20260903b_*.

begin;

-- ============================================================================
-- 0. A BASE AINDA E A QUE FOI CONFERIDA?
-- ============================================================================

do $$
declare v_cnt integer;
begin
  select count(*) into v_cnt from public.conversations
   where equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce';
  if v_cnt < 400 then
    raise exception 'ABORTADO: a Casa Flow original tem % conversas, esperava ~532.', v_cnt;
  end if;

  select count(*) into v_cnt from public.conversations
   where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';
  if v_cnt <> 0 then
    raise exception 'ABORTADO: a equipe NOVA ja tem % conversas. Alguem comecou a operar nela; nao a apague sem reavaliar.', v_cnt;
  end if;

  -- A equipe que fica nao pode ter contrato vivo, senao a fusao criaria dois.
  if exists (
    select 1 from public.contracts
     where equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
       and status in ('onboarding','trialing','active','past_due','suspended')
  ) then
    raise exception 'ABORTADO: a Casa Flow original ja tem contrato vivo. Fundir criaria dois contratos na mesma equipe.';
  end if;

  raise notice 'Forma da base conferida.';
end $$;

-- ============================================================================
-- 1. BACKUP
-- ============================================================================

create table if not exists backup_20260903b_equipes as
  select * from public.equipes where id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

create table if not exists backup_20260903b_profiles as
  select * from public.profiles
   where equipe_id in ('a85be56a-df64-452c-9ffb-65e7dc922b24','aa33b576-3959-4a81-8e73-4027039ea2ce');

create table if not exists backup_20260903b_billing_accounts as
  select * from public.billing_accounts
   where equipe_id in ('a85be56a-df64-452c-9ffb-65e7dc922b24','aa33b576-3959-4a81-8e73-4027039ea2ce');

create table if not exists backup_20260903b_contracts as
  select * from public.contracts where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

create table if not exists backup_20260903b_onboardings as
  select * from public.onboardings;

-- ============================================================================
-- 2. O LOGIN VOLTA PRIMEIRO
--
-- Antes de qualquer delete. `profiles` cascateia de `equipes`: apagar a equipe
-- nova com o perfil dele dentro apagaria o login do Felipe.
-- ============================================================================

update public.profiles
   set equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce',
       cargo     = 'owner',
       role      = 'owner'
 where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

-- ============================================================================
-- 3. O CONTRATO, AS FATURAS E A PROPOSTA SEGUEM A OPERACAO
-- ============================================================================

update public.contracts
   set equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
 where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

update public.invoices
   set equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
 where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

update public.proposals
   set equipe_id        = 'aa33b576-3959-4a81-8e73-4027039ea2ce',
       -- Registra o vinculo, para que reprovisionar esta proposta um dia nao
       -- crie a terceira equipe.
       target_equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
 where codigo = 'C43613118923';

-- ============================================================================
-- 4. A CONTA DE COBRANCA: O PREENCHIDO VENCE O VAZIO
--
-- O CPF esta na conta NOVA (o Felipe digitou ao aceitar) e falta na antiga.
-- Aqui e campo a campo, nao "a antiga prevalece" -- copiar a regra do script
-- da Solo Energia apagaria o documento que o cliente acabou de informar.
-- ============================================================================

update public.billing_accounts k set
  doc_type          = coalesce(d.doc_type,          k.doc_type),
  doc_number        = coalesce(d.doc_number,        k.doc_number),
  legal_name        = coalesce(d.legal_name,        k.legal_name),
  billing_email     = coalesce(d.billing_email,     k.billing_email),
  phone             = coalesce(d.phone,             k.phone),
  postal_code       = coalesce(d.postal_code,       k.postal_code),
  address_street    = coalesce(d.address_street,    k.address_street),
  address_number    = coalesce(d.address_number,    k.address_number),
  address_complement= coalesce(d.address_complement,k.address_complement),
  address_district  = coalesce(d.address_district,  k.address_district),
  address_city      = coalesce(d.address_city,      k.address_city),
  address_state     = coalesce(d.address_state,     k.address_state),
  -- o cliente do gateway e o cartao: o que existir vence, nunca sobrescreve
  -- um id real por nulo
  asaas_customer_id = coalesce(k.asaas_customer_id, d.asaas_customer_id),
  asaas_card_token  = coalesce(k.asaas_card_token,  d.asaas_card_token),
  card_last4        = coalesce(k.card_last4,        d.card_last4),
  card_brand        = coalesce(k.card_brand,        d.card_brand)
from public.billing_accounts d
where k.equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
  and d.equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

-- Se por algum motivo a equipe que fica nao tiver conta, a nova migra inteira.
update public.billing_accounts
   set equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
 where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24'
   and not exists (
     select 1 from public.billing_accounts x
      where x.equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce');

-- ============================================================================
-- 5. O CARD DO QUADRO APONTA PARA A EQUIPE VIVA
--
-- A Casa Flow perdeu o card dela na 20260903000800 (legado sem contrato), e
-- agora ela TEM contrato -- entao o card do negocio novo e o card dela.
-- `onboardings.equipe_id` e unique, entao so da para mover se nao houver outro.
-- ============================================================================

update public.onboardings
   set equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
 where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24'
   and not exists (
     select 1 from public.onboardings x
      where x.equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce');

update public.wpp_instances
   set equipe_id = 'aa33b576-3959-4a81-8e73-4027039ea2ce'
 where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

-- ============================================================================
-- 6. A CASCA VAZIA SAI
-- ============================================================================

delete from public.opportunity_stage_history
 where equipe_id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

delete from public.equipes where id = 'a85be56a-df64-452c-9ffb-65e7dc922b24';

-- ============================================================================
-- VERIFICACAO -- qualquer falha desfaz TUDO
-- ============================================================================

do $$
declare
  v_cnt integer;
  v_eq  uuid;
  v_doc text;
begin
  -- (a) a casca sumiu
  assert not exists (select 1 from public.equipes where id='a85be56a-df64-452c-9ffb-65e7dc922b24'),
    'ASSERT FAILED: a equipe nova continua de pe';

  -- (b) A QUE IMPORTA: o Felipe ve os dados dele de novo
  select p.equipe_id into v_eq from public.profiles p where p.email='f.felipe1411@gmail.com';
  assert v_eq = 'aa33b576-3959-4a81-8e73-4027039ea2ce',
    format('ASSERT FAILED: o login do Felipe aponta para %s', coalesce(v_eq::text,'NENHUMA EQUIPE'));

  select count(*) into v_cnt from public.conversations where equipe_id = v_eq;
  assert v_cnt > 400,
    format('ASSERT FAILED: a equipe do Felipe tem %s conversas, esperava mais de 400', v_cnt);

  -- (c) o contrato acompanhou
  assert exists (
    select 1 from public.contracts
     where equipe_id='aa33b576-3959-4a81-8e73-4027039ea2ce'
       and status in ('onboarding','trialing','active','past_due')
  ), 'ASSERT FAILED: o contrato nao foi para a equipe que opera';

  -- (d) o CPF que o Felipe digitou sobreviveu a fusao
  select doc_number into v_doc from public.billing_accounts
   where equipe_id='aa33b576-3959-4a81-8e73-4027039ea2ce';
  assert v_doc = '08141743376',
    format('ASSERT FAILED: o CPF virou %s -- a fusao apagou o que o cliente informou', coalesce(v_doc,'NULL'));

  -- (e) nenhum login orfao
  select count(*) into v_cnt from public.profiles p
   where p.equipe_id is not null
     and not exists (select 1 from public.equipes e where e.id=p.equipe_id);
  assert v_cnt = 0, format('ASSERT FAILED: %s perfis apontam para equipe inexistente', v_cnt);

  -- (f) um cliente, um card
  select count(*) into v_cnt from (
    select equipe_id from public.onboardings where equipe_id is not null
     group by equipe_id having count(*)>1) d;
  assert v_cnt = 0, format('ASSERT FAILED: %s equipe(s) com card duplicado', v_cnt);

  -- (g) o backup existe
  assert (select count(*) from backup_20260903b_profiles) >= 1,
    'ASSERT FAILED: o backup de perfis esta vazio';

  raise notice 'Casa Flow: fusao concluida, assercoes passaram.';
end $$;

commit;
