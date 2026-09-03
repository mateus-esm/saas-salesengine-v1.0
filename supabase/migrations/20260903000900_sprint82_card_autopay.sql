-- 20260903000900_sprint82_card_autopay.sql
-- Sprint 8.2 - cartao salvo para a cobranca do dia 1 sair sozinha.
--
-- O PROBLEMA
--
-- Hoje toda fatura vira um boleto/PIX que alguem precisa abrir e pagar. No dia
-- 1 de cada mes o cliente recebe uma cobranca, esquece, ela vence, o contrato
-- vai para past_due, sete dias depois suspende e o agente para. O produto para
-- de funcionar por um clique que ninguem deu -- nao por falta de dinheiro.
--
-- POR QUE CARTAO TOKENIZADO E NAO "ASSINATURA DO ASAAS"
--
-- O Asaas tem /subscriptions, que gera as cobrancas mensais sozinho. Usar isso
-- aqui seria ter DUAS coisas emitindo a mensalidade: a assinatura do Asaas e o
-- renewPeriods do billing-cron, que ja existe, ja preca pelos contract_items
-- (o preco NEGOCIADO, nao o de tabela) e ja e idempotente por period_key. Duas
-- fontes de cobranca e cobranca dobrada.
--
-- Entao o cron continua sendo o dono do calendario, e o cartao entra so como
-- forma de pagamento: a fatura que ele ja emite passa a ser cobrada no cartao
-- salvo em vez de virar um boleto para o cliente lembrar de pagar.
--
-- NENHUM DADO DE CARTAO PASSA POR AQUI
--
-- O numero do cartao nunca toca este banco nem as edge functions. O cliente
-- digita no checkout do proprio Asaas; o Asaas devolve um TOKEN no webhook, e e
-- o token que guardamos. Os quatro ultimos digitos e a bandeira sao so para a
-- tela poder dizer "Mastercard final 4242" -- nao servem para cobrar nada.

alter table public.billing_accounts
  add column if not exists asaas_card_token text,
  add column if not exists card_last4       text,
  add column if not exists card_brand       text,
  add column if not exists autopay_enabled  boolean not null default true;

comment on column public.billing_accounts.asaas_card_token is
  'Token do cartao no Asaas. NAO e o numero do cartao: e uma referencia opaca que so serve para cobrar por esta conta. Capturado pelo webhook quando o cliente paga no cartao.';
comment on column public.billing_accounts.card_last4 is
  'Ultimos 4 digitos, so para exibicao ("final 4242"). Nao cobra nada.';
comment on column public.billing_accounts.autopay_enabled is
  'Sprint 8.2 - o cliente quer que a fatura do dia 1 seja cobrada no cartao salvo? Desligado, ele volta a receber boleto/PIX. Ter token e querer usa-lo sao coisas diferentes: desligar nao apaga o cartao.';

-- ============================================================================
-- O CLIENTE PODE LIGAR E DESLIGAR, E PODE APAGAR O CARTAO
--
-- `billing_accounts` so tem politica de SELECT (foi o que quebrou o CNPJ no
-- go-live, corrigido em 36244e1 mandando a escrita para a edge function). Aqui
-- a mesma decisao: quem escreve e uma funcao, nao a tela. Mas esta e a
-- PREFERENCIA do cliente sobre o proprio pagamento, entao ele mesmo executa --
-- limitada a propria equipe, e sem poder tocar em doc, e-mail ou token.
-- ============================================================================

create or replace function public.set_autopay(p_enabled boolean, p_forget_card boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_equipe uuid;
  v_row    public.billing_accounts%rowtype;
begin
  select equipe_id into v_equipe from public.profiles where user_id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = 'P0001';
  end if;

  update public.billing_accounts set
    autopay_enabled  = coalesce(p_enabled, autopay_enabled),
    -- Esquecer o cartao apaga o token de verdade. Guardar "por via das
    -- duvidas" um meio de pagamento que o cliente pediu para remover e
    -- exatamente o que ninguem espera de um botao chamado "remover cartao".
    asaas_card_token = case when p_forget_card then null else asaas_card_token end,
    card_last4       = case when p_forget_card then null else card_last4 end,
    card_brand       = case when p_forget_card then null else card_brand end
  where equipe_id = v_equipe
  returning * into v_row;

  if not found then
    raise exception 'no_billing_account' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'autopay_enabled', v_row.autopay_enabled,
    'has_card',        v_row.asaas_card_token is not null,
    'card_last4',      v_row.card_last4,
    'card_brand',      v_row.card_brand
  );
end;
$fn$;

comment on function public.set_autopay(boolean, boolean) is
  'Sprint 8.2 - o cliente liga/desliga a cobranca automatica no cartao, ou remove o cartao. Escopo travado na propria equipe; nao alcanca doc, e-mail nem o token de outra conta.';

revoke all on function public.set_autopay(boolean, boolean) from public, anon;
grant execute on function public.set_autopay(boolean, boolean) to authenticated;

-- ============================================================================
-- ASSERCOES
-- ============================================================================

do $$
declare
  v_cnt integer;
begin
  -- (a) as colunas existem
  select count(*) into v_cnt from information_schema.columns
   where table_schema='public' and table_name='billing_accounts'
     and column_name in ('asaas_card_token','card_last4','card_brand','autopay_enabled');
  assert v_cnt = 4, format('ASSERT FAILED: %s de 4 colunas de cartao criadas', v_cnt);

  -- (b) autopay nasce ligado: quem salvar um cartao quer usa-lo. Desligar e a
  --     excecao, e o cliente faz isso na tela.
  assert (select count(*) from public.billing_accounts where autopay_enabled is null) = 0,
    'ASSERT FAILED: autopay_enabled aceitou nulo';

  -- (c) nenhuma conta nasce com cartao -- a coluna e nova e o token so entra
  --     pelo webhook, nunca por default
  select count(*) into v_cnt from public.billing_accounts where asaas_card_token is not null;
  assert v_cnt = 0, format('ASSERT FAILED: %s conta(s) ja tem token de cartao', v_cnt);

  -- (d) a funcao existe, e definer, e nao esta exposta a anon
  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='set_autopay' and p.prosecdef
  ), 'ASSERT FAILED: set_autopay nao existe ou nao e security definer';
  assert not has_function_privilege('anon', 'public.set_autopay(boolean, boolean)', 'EXECUTE'),
    'ASSERT FAILED: anon pode executar set_autopay';

  -- (e) sem sessao, a funcao recusa em vez de mexer na conta de alguem
  begin
    perform public.set_autopay(true);
    raise exception 'ASSERT FAILED: set_autopay funcionou sem sessao';
  exception when others then
    assert sqlerrm = 'no_team',
      format('ASSERT FAILED: esperava no_team, veio %', sqlerrm);
  end;

  raise notice 'Sprint 8.2 - cartao/autopay: assercoes passaram';
end $$;
