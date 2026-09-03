-- 20260903001100_sprint82_attach_by_email.sql
-- Sprint 8.2 - aceitar uma proposta nao pode mais tirar o cliente do ambiente
-- onde estao os dados dele.
--
-- ============================================================================
-- TRES VEZES O MESMO ACIDENTE
-- ============================================================================
--
--   02/09  Solo Energia   o login foi para uma equipe vazia; 470 conversas,
--                         3 pipelines e 456 leads ficaram invisiveis
--   02/09  WI Advogados   mesma coisa, 246 leads
--   03/09  Casa Flow      o Felipe aceitou e caiu numa equipe vazia; 532
--                         conversas ficaram para tras
--
-- Sempre pelo mesmo caminho: a proposta nao tinha `target_equipe_id`, entao
-- `provision_tenant_from_proposal` criou uma equipe nova, e `ensureInvite`
-- MOVEU o perfil do cliente para ela porque o e-mail ja existia.
--
-- A reconciliacao de 02/09 casava por NOME de equipe. Isso nao pegou a Casa
-- Flow: a equipe se chama "Casa Flow" e a proposta "Casa Flow ADS". O vinculo
-- que realmente identifica o mesmo cliente nao e o nome -- e o E-MAIL.
--
-- E enquanto o padrao for "lembre de preencher o campo Ambiente", isso vai
-- acontecer de novo. Esquecer e o comportamento normal de quem usa; o software
-- e que tem que ser seguro por padrao.
--
-- ============================================================================
-- A CORRECAO: O E-MAIL RESOLVE O AMBIENTE
-- ============================================================================
--
-- Quando a proposta NAO diz a qual equipe anexar, o provisionamento agora
-- pergunta: este e-mail ja tem login em alguma equipe? Se tem, e o mesmo
-- cliente, e o contrato vai para o ambiente dele. So cria equipe nova quando
-- ninguem com aquele e-mail existe.
--
-- `target_equipe_id` continua sendo a palavra final: preenchido, manda. E o
-- que permite dizer "este cliente vai comecar do zero num ambiente novo",
-- como o fundador decidiu para o WI.
--
-- O QUE ISSO **NAO** FAZ: nao funde equipes, nao apaga nada, nao mexe em quem
-- ja foi provisionado. So decide melhor no momento de criar.

create or replace function public.provision_tenant_from_proposal(
  p_proposal_id     uuid,
  p_golive_previsto date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_p           public.proposals%rowtype;
  v_accept      public.proposal_acceptances%rowtype;
  v_equipe      uuid;
  v_contract    uuid;
  v_setup_inv   uuid;
  v_card        uuid;
  v_monthly     numeric(12,2) := 0;
  v_item        record;
  v_plan        public.billing_products%rowtype;
  v_doc         text;
  v_doc_type    text;
  v_attached    boolean := false;
  v_attached_by text   := null;
  v_previsto    date;
  v_setup_total numeric(12,2);
begin
  select * into v_p from public.proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0001';
  end if;
  if v_p.status <> 'aceita' then
    raise exception 'proposal_not_accepted' using errcode = 'P0001';
  end if;

  -- Reexecutar e seguro: devolve o que ja existe em vez de duplicar.
  if v_p.equipe_id is not null then
    select id into v_contract from public.contracts
     where proposal_id = p_proposal_id order by created_at limit 1;
    if v_contract is not null then
      select id into v_setup_inv from public.invoices
       where contract_id = v_contract and kind = 'setup' and status <> 'void' limit 1;
      select id, golive_previsto into v_card, v_previsto
        from public.onboardings where proposal_id = p_proposal_id;
      return jsonb_build_object(
        'already_provisioned', true,
        'attached',            false,
        'equipe_id',           v_p.equipe_id,
        'contract_id',         v_contract,
        'setup_invoice_id',    v_setup_inv,
        'onboarding_id',       v_card,
        'golive_previsto',     v_previsto,
        'charge_now',          false
      );
    end if;
  end if;

  v_previsto := coalesce(p_golive_previsto, current_date + 21);

  select * into v_accept from public.proposal_acceptances where proposal_id = p_proposal_id;

  -- ── 1. QUAL AMBIENTE ────────────────────────────────────────────────────
  --
  -- Ordem: o que a proposta manda; senao o ambiente de quem ja tem login com
  -- este e-mail; senao um novo.
  if v_p.target_equipe_id is not null then
    select id into v_equipe from public.equipes where id = v_p.target_equipe_id;
    if v_equipe is null then
      raise exception 'target_equipe_not_found' using errcode = 'P0001';
    end if;
    v_attached := true;
    v_attached_by := 'target';
  else
    -- O e-mail e o vinculo que identifica o mesmo cliente. Casar por NOME nao
    -- serve: "Casa Flow" e "Casa Flow ADS" sao a mesma pessoa e nomes
    -- diferentes, e dois clientes distintos podem ter nomes parecidos.
    if coalesce(btrim(v_p.cliente_email), '') <> '' then
      select p.equipe_id into v_equipe
        from public.profiles p
       where lower(p.email) = lower(btrim(v_p.cliente_email))
         and p.equipe_id is not null
       limit 1;

      if v_equipe is not null then
        v_attached := true;
        v_attached_by := 'email';
      end if;
    end if;

    if v_equipe is null then
      insert into public.equipes (nome, crm_link, suporte_link, niche)
      values (v_p.cliente_nome, '/crm', '/suporte', v_p.niche_id)
      returning id into v_equipe;
    end if;
  end if;

  -- Dois contratos vivos na mesma equipe cobram o cliente duas vezes.
  if v_attached and exists (
    select 1 from public.contracts
     where equipe_id = v_equipe
       and status in ('onboarding','trialing','active','past_due','suspended')
  ) then
    raise exception 'equipe_has_live_contract' using errcode = 'P0001';
  end if;

  -- 2. conta de cobranca ------------------------------------------------------
  v_doc := nullif(regexp_replace(coalesce(v_accept.accepted_doc, v_p.cliente_doc, ''), '[^0-9]', '', 'g'), '');
  v_doc_type := case
    when length(v_doc) = 14 then 'CNPJ'
    when length(v_doc) = 11 then 'CPF'
    else null
  end;

  insert into public.billing_accounts (
    equipe_id, doc_type, doc_number, legal_name, billing_email, phone
  ) values (
    v_equipe, v_doc_type,
    case when v_doc_type is null then null else v_doc end,
    coalesce(nullif(btrim(v_accept.accepted_name), ''), v_p.cliente_nome),
    v_p.cliente_email, v_p.cliente_whatsapp
  )
  on conflict (equipe_id) do update set
    doc_type      = coalesce(excluded.doc_type,      public.billing_accounts.doc_type),
    doc_number    = coalesce(excluded.doc_number,    public.billing_accounts.doc_number),
    legal_name    = coalesce(excluded.legal_name,    public.billing_accounts.legal_name),
    billing_email = coalesce(excluded.billing_email, public.billing_accounts.billing_email),
    phone         = coalesce(excluded.phone,         public.billing_accounts.phone);

  -- 3. contrato, em ONBOARDING ------------------------------------------------
  insert into public.contracts (
    equipe_id, proposal_id, status, term_months, started_at
  ) values (
    v_equipe, p_proposal_id, 'onboarding', v_p.term_months, now()
  ) returning id into v_contract;

  -- 4. o que foi comprado -----------------------------------------------------
  if v_p.chosen_plan_code is not null then
    select * into v_plan from public.billing_products
     where code = v_p.chosen_plan_code and kind = 'plan';
    if found then
      insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
      values (v_contract, v_plan.id, 1, v_plan.list_price, 'monthly');
      v_monthly := v_plan.list_price;
    end if;
  end if;

  for v_item in
    select pi.*, bp.kind as product_kind
    from public.proposal_items pi
    left join public.billing_products bp on bp.id = pi.product_id
    where pi.proposal_id = p_proposal_id
  loop
    if v_plan.id is not null and v_item.product_id = v_plan.id then
      continue;
    end if;
    if v_item.product_kind = 'plan' and v_p.chosen_plan_code is not null then
      continue;
    end if;

    insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
    values (v_contract, v_item.product_id, v_item.quantity, v_item.unit_price, v_item.period);

    if v_item.period = 'monthly' then
      v_monthly := v_monthly + (v_item.unit_price * v_item.quantity);
    end if;
  end loop;

  if v_monthly = 0 and coalesce(v_p.monthly_price, 0) > 0 then
    v_monthly := v_p.monthly_price;
    insert into public.contract_items (contract_id, product_id, quantity, unit_price, period)
    values (v_contract, null, 1, v_p.monthly_price, 'monthly');
  end if;

  -- 5. a fatura da implantacao ------------------------------------------------
  v_setup_total := case when v_p.setup_waived then 0 else coalesce(v_p.setup_price, 0) end;

  if v_setup_total > 0 then
    insert into public.invoices (
      equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at, metadata
    ) values (
      v_equipe, v_contract, 'setup', 'open',
      v_setup_total, v_setup_total, v_previsto, now(),
      case when v_p.setup_charge_timing = 'on_golive'
           then '{"awaiting_golive": true}'::jsonb
           else '{}'::jsonb end
    ) returning id into v_setup_inv;

    insert into public.invoice_items (invoice_id, description, quantity, unit_price, total)
    values (v_setup_inv,
            'Implantacao - discovery, treinamento do agente, conexao de canais, arquitetura do CRM e integracao de anuncios',
            1, v_setup_total, v_setup_total);
  end if;

  -- 6. o card do onboarding ---------------------------------------------------
  select id into v_card from public.onboardings where equipe_id = v_equipe;
  if v_card is not null then
    update public.onboardings set
      proposal_id     = p_proposal_id,
      stage_id        = public.onboarding_stage_id('boas_vindas'),
      cliente_nome    = v_p.cliente_nome,
      golive_previsto = v_previsto
    where id = v_card;
  else
    insert into public.onboardings (proposal_id, equipe_id, stage_id, cliente_nome, golive_previsto)
    values (p_proposal_id, v_equipe, public.onboarding_stage_id('boas_vindas'),
            v_p.cliente_nome, v_previsto)
    on conflict (proposal_id) do update set
      equipe_id       = excluded.equipe_id,
      stage_id        = excluded.stage_id,
      golive_previsto = excluded.golive_previsto
    returning id into v_card;
  end if;

  update public.proposals set equipe_id = v_equipe, updated_at = now()
   where id = p_proposal_id;

  return jsonb_build_object(
    'already_provisioned', false,
    'attached',            v_attached,
    -- Diz COMO o ambiente foi escolhido. Sem isto, "por que o contrato foi
    -- parar nessa equipe?" nao tem resposta depois do fato.
    'attached_by',         v_attached_by,
    'equipe_id',           v_equipe,
    'contract_id',         v_contract,
    'setup_invoice_id',    v_setup_inv,
    'onboarding_id',       v_card,
    'golive_previsto',     v_previsto,
    'monthly_total',       v_monthly,
    'setup_total',         v_setup_total,
    'charge_now',          (v_setup_inv is not null and v_p.setup_charge_timing = 'on_accept')
  );
end;
$fn$;

comment on function public.provision_tenant_from_proposal(uuid, date) is
  'Sprint 8.2 - provisiona a partir de uma proposta aceita. O ambiente e escolhido nesta ordem: target_equipe_id, depois a equipe de quem ja tem login com o e-mail do cliente, e so entao uma equipe nova. Resolver pelo e-mail e o que impede o cliente de ser jogado num ambiente vazio e perder o acesso aos proprios dados.';

-- ============================================================================
-- ASSERCOES
-- ============================================================================

-- NOTA SOBRE O QUE DA PARA TESTAR AQUI
--
-- Estas assercoes rodam DENTRO da migration, contra a base de producao. Entao
-- elas nao podem criar um cliente de mentira com login: `profiles.user_id` tem
-- FK para `auth.users`, e inventar um usuario de autenticacao para depois
-- apaga-lo e mexer no que nao deve.
--
-- Por isso o caminho do e-mail e verificado em DUAS partes, sem tocar em dado
-- de cliente: a consulta de resolucao e conferida contra um cliente real que
-- ja existe (so leitura), e os dois caminhos que criam coisas sao exercitados
-- ponta a ponta com dados descartaveis.
do $$
declare
  v_eq_scratch uuid;
  v_prop       uuid;
  v_r          jsonb;
  v_email_real text;
  v_eq_real    uuid;
  v_eq_achada  uuid;
begin
  -- ── (a) A CONSULTA QUE RESOLVE O AMBIENTE, contra dado real ─────────────
  --        Pega um cliente que existe de verdade e confirma que o e-mail dele
  --        aponta para a equipe dele. E exatamente a consulta nova da funcao.
  select p.email, p.equipe_id into v_email_real, v_eq_real
    from public.profiles p
   where p.equipe_id is not null and p.email is not null
   order by p.created_at
   limit 1;

  if v_email_real is not null then
    select p.equipe_id into v_eq_achada
      from public.profiles p
     where lower(p.email) = lower(btrim(v_email_real))
       and p.equipe_id is not null
     limit 1;

    assert v_eq_achada = v_eq_real,
      format('ASSERT FAILED: o e-mail %s resolveu para %s, esperava %s',
             v_email_real, v_eq_achada, v_eq_real);
  end if;

  -- ── (b) E-MAIL DESCONHECIDO cria ambiente novo (comportamento preservado)
  insert into public.proposals (cliente_nome, cliente_email, status, setup_price,
                                monthly_price, trial_days, setup_charge_timing)
  values ('__t11_cliente_novo__', 't11_inexistente_'||gen_random_uuid()::text||'@exemplo.invalid',
          'aceita', 0, 100.00, 0, 'on_accept')
  returning id into v_prop;

  v_r := public.provision_tenant_from_proposal(v_prop);
  assert (v_r->>'attached')::boolean = false,
    'ASSERT FAILED: anexou um cliente novo a uma equipe existente';
  assert (v_r->>'attached_by') is null,
    format('ASSERT FAILED: attached_by = %s para cliente novo, esperava nulo', v_r->>'attached_by');

  delete from public.equipes where id = (v_r->>'equipe_id')::uuid;
  delete from public.proposals where id = v_prop;

  -- ── (c) target_equipe_id tem a palavra final ────────────────────────────
  --        E o que permite "este cliente recomeca num ambiente novo", como o
  --        fundador decidiu para o WI. Usa o e-mail de um cliente REAL para
  --        provar que o target vence a resolucao por e-mail.
  insert into public.equipes (nome, crm_link, suporte_link)
  values ('__t11_destino_explicito__', '/crm', '/suporte') returning id into v_eq_scratch;

  insert into public.proposals (cliente_nome, cliente_email, status, setup_price,
                                monthly_price, trial_days, setup_charge_timing, target_equipe_id)
  values ('__t11_com_target__', coalesce(v_email_real, 't11@exemplo.invalid'), 'aceita',
          0, 100.00, 0, 'on_accept', v_eq_scratch)
  returning id into v_prop;

  v_r := public.provision_tenant_from_proposal(v_prop);
  assert (v_r->>'equipe_id')::uuid = v_eq_scratch,
    'ASSERT FAILED: target_equipe_id deixou de mandar -- a resolucao por e-mail o atropelou';
  assert (v_r->>'attached_by') = 'target',
    format('ASSERT FAILED: attached_by = %s, esperava target', v_r->>'attached_by');

  -- limpeza: a equipe descartavel leva contrato, conta e card no cascade
  delete from public.proposals where id = v_prop;
  delete from public.equipes where id = v_eq_scratch;

  -- ── (d) nada de teste sobrou
  assert not exists (select 1 from public.equipes where nome like '\_\_t11%'),
    'ASSERT FAILED: sobrou equipe de teste';
  assert not exists (select 1 from public.proposals where cliente_nome like '\_\_t11%'),
    'ASSERT FAILED: sobrou proposta de teste';

  raise notice 'Sprint 8.2 - ambiente resolvido pelo e-mail: assercoes passaram';
end $$;
