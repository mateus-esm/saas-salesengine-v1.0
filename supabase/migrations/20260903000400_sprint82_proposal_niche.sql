-- 20260903000400_sprint82_proposal_niche.sql
-- Sprint 8.2 · o link de uma proposta ia sempre para o dominio de quem estava
-- logado no painel, nunca para a marca do cliente.
--
-- O QUE ESTAVA ERRADO
--
-- `admin-notifications/index.ts` montava o link publico da proposta a partir
-- de `window.location.origin` (o navegador do fundador) ou de `PUBLIC_APP_URL`
-- (um unico secret global). Nenhum dos dois sabe qual e o nicho do cliente que
-- vai receber a proposta -- o produto e white-label por dominio
-- (solon.soloventures.com.br, bmg.soloventures.com.br...), e o Sprint 9 ja
-- resolveu exatamente esse problema para EQUIPES (`tenant_public_origin`,
-- migration 20260830001100). Uma proposta ainda nao tem equipe, entao esse
-- caminho nao a alcanca.
--
-- A CORRECAO
--
-- `proposals` ganha `niche_id`: o nicho que o fundador escolhe ao montar a
-- proposta. `proposal_public_origin()` resolve o dominio nesta ordem:
--
--   1. o nicho escolhido nesta proposta
--   2. se a proposta aponta para uma equipe que ja existe (target_equipe_id),
--      o nicho DELA -- o cliente que ja opera aqui nao muda de dominio no meio
--      do processo
--   3. o nicho 'default', que passa a ser rev.soloventures.com.br: "Solo Rev"
--      e o produto agora (ver src/config/brand.ts), e o dominio institucional
--      tem que dizer isso, nao "saas".
--
-- Quando o provisionamento cria uma equipe NOVA (nao anexa a uma que ja
-- existe), o nicho da proposta vira o nicho da equipe -- senao a mensagem de
-- boas-vindas (que ja usa `tenant_public_origin` por equipe, desde a Sprint 9)
-- voltaria a cair no dominio institucional mesmo para quem escolheu um nicho.

alter table public.proposals
  add column if not exists niche_id text references public.niches(id) on delete set null;

comment on column public.proposals.niche_id is
  'Sprint 8.2 - o nicho/marca sob a qual o cliente ve a proposta e, depois, o proprio app. Nulo = usa o nicho da equipe (se target_equipe_id) ou o nicho institucional default.';

-- rev.soloventures.com.br: "Solo Rev" e o produto (src/config/brand.ts). O
-- dominio institucional tinha ficado para tras com o nome antigo.
update public.niches
   set domain = 'rev.soloventures.com.br',
       description = 'Seu motor de receita'
 where id = 'default';

create or replace function public.proposal_public_origin(p_proposal_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select 'https://' || d
    from (
      select coalesce(
               -- 1. o nicho escolhido nesta proposta
               (select n.domain
                  from public.proposals p
                  join public.niches n on n.id = p.niche_id
                 where p.id = p_proposal_id and n.active
                 limit 1),
               -- 2. a proposta aponta para uma equipe que ja existe: o
               --    dominio dela, para nao trocar de marca no meio do processo
               (select n2.domain
                  from public.proposals p
                  join public.equipes e on e.id = p.target_equipe_id
                  join public.niches n2 on n2.id = e.niche
                 where p.id = p_proposal_id and n2.active
                 limit 1),
               -- 3. sem nicho nenhum: o dominio institucional
               (select n3.domain from public.niches n3 where n3.id = 'default' and n3.active limit 1)
             ) as d
    ) s
   where d is not null and d <> '';
$$;

comment on function public.proposal_public_origin(uuid) is
  'Sprint 8.2 - a origem publica (https://dominio) para O LINK DESTA PROPOSTA: o nicho escolhido nela, senao o nicho da equipe existente que ela vai anexar, senao o dominio institucional. NULL quando nada disso resolve.';

grant execute on function public.proposal_public_origin(uuid) to authenticated, service_role;

-- Quando a equipe e criada do zero no provisionamento, ela herda o nicho da
-- proposta -- senao a mensagem de boas-vindas (que resolve por EQUIPE, nao por
-- proposta) perderia a marca escolhida assim que o ambiente passasse a existir.
-- Anexar a uma equipe que ja existe nao mexe no nicho dela: um cliente que ja
-- opera aqui nao troca de dominio por causa de uma proposta nova.
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

  -- Reexecutar e seguro: devolve o que ja existe em vez de duplicar. E o que
  -- permite consertar um provisionamento pela metade clicando de novo.
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

  -- Vinte e um dias porque e o prazo real de uma implantacao com discovery,
  -- treinamento do agente e integracao de anuncios. Um padrao que mente vira
  -- uma fatura vencida antes da entrega.
  v_previsto := coalesce(p_golive_previsto, current_date + 21);

  select * into v_accept from public.proposal_acceptances where proposal_id = p_proposal_id;

  -- 1. equipe: anexa a que existe, ou cria -----------------------------------
  if v_p.target_equipe_id is not null then
    select id into v_equipe from public.equipes where id = v_p.target_equipe_id;
    if v_equipe is null then
      raise exception 'target_equipe_not_found' using errcode = 'P0001';
    end if;
    v_attached := true;

    -- Dois contratos vivos na mesma equipe cobram o cliente duas vezes. O indice
    -- unico ja barraria, mas com uma mensagem que ninguem entende.
    if exists (
      select 1 from public.contracts
       where equipe_id = v_equipe
         and status in ('onboarding','trialing','active','past_due','suspended')
    ) then
      raise exception 'equipe_has_live_contract' using errcode = 'P0001';
    end if;
  else
    -- Nicho da proposta vira o nicho da equipe nova -- so nesta equipe recem
    -- criada; anexar a uma equipe existente (ramo acima) nunca sobrescreve o
    -- nicho dela.
    insert into public.equipes (nome, crm_link, suporte_link, niche)
    values (v_p.cliente_nome, '/crm', '/suporte', v_p.niche_id)
    returning id into v_equipe;
  end if;

  -- 2. conta de cobranca ------------------------------------------------------
  -- Upsert, nao insert: anexar a uma equipe que ja fatura nao pode apagar o
  -- asaas_customer_id dela. So sobrescreve o que veio preenchido.
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
  -- Sem trial_ends_at, sem went_live_at, sem periodo: o relogio nao corre. Ele
  -- comeca em go_live_contract(), quando o cliente tem produto de verdade.
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
      continue;  -- a escolha do cliente vence um plano pre-preenchido
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
  -- Emitida agora, para os DOIS setup_charge_timing. Vence na data prevista de
  -- conclusao: o cliente ve o valor e o prazo desde o primeiro dia, e a data do
  -- boleto e a data da entrega prometida.
  v_setup_total := case when v_p.setup_waived then 0 else coalesce(v_p.setup_price, 0) end;

  if v_setup_total > 0 then
    -- `awaiting_golive` existe por causa do billing-cron.
    --
    -- voidOrphanInvoices() anula toda fatura ABERTA e SEM cobranca com mais de
    -- 2 horas, porque isso normalmente e entulho de uma chamada ao gateway que
    -- falhou. So que uma fatura de implantacao 'on_golive' e exatamente isso
    -- por semanas -- de proposito. Sem esta marca, o cron (que roda todo dia as
    -- 12h UTC e esta ativo) apagaria a fatura no dia seguinte ao aceite.
    --
    -- E a mesma saida que o sprint 8.3 usou para a fatura avulsa criada a mao.
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
  -- Anexar a uma equipe que ja tem card reaproveita o card: um cliente, um card.
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
    'equipe_id',           v_equipe,
    'contract_id',         v_contract,
    'setup_invoice_id',    v_setup_inv,
    'onboarding_id',       v_card,
    'golive_previsto',     v_previsto,
    'monthly_total',       v_monthly,
    'setup_total',         v_setup_total,
    -- A edge function le isto para decidir se chama o gateway agora. 'on_golive'
    -- deixa a cobranca para o clique de "Colocar no ar".
    'charge_now',          (v_setup_inv is not null and v_p.setup_charge_timing = 'on_accept')
  );
end;
$fn$;

-- ============================================================================
-- ASSERCOES
-- ============================================================================

do $$
declare
  v_niche_default text;
  v_origin text;
  v_p uuid;
  v_e uuid;
  v_equipe_niche text;
begin
  -- (a) o dominio institucional agora e a marca Solo Rev
  select domain into v_niche_default from public.niches where id = 'default';
  assert v_niche_default = 'rev.soloventures.com.br',
    format('ASSERT FAILED: default domain e %s, esperava rev.soloventures.com.br', v_niche_default);

  -- (b) proposta sem nicho e sem equipe: cai no institucional
  insert into public.proposals (cliente_nome, cliente_email, status)
  values ('__t824_prop_sem_nicho__', 'a@a.com', 'rascunho') returning id into v_p;
  v_origin := public.proposal_public_origin(v_p);
  assert v_origin = 'https://rev.soloventures.com.br',
    format('ASSERT FAILED: origin sem nicho = %s', v_origin);

  -- (c) proposta com nicho explicito vence
  update public.proposals set niche_id = 'solon' where id = v_p;
  v_origin := public.proposal_public_origin(v_p);
  assert v_origin = 'https://solon.soloventures.com.br',
    format('ASSERT FAILED: origin com nicho explicito = %s', v_origin);
  delete from public.proposals where id = v_p;

  -- (d) proposta apontando para equipe existente usa o nicho DELA quando a
  --     propria proposta nao escolheu nenhum
  insert into public.equipes (nome, crm_link, suporte_link, niche)
  values ('__t824_equipe_nicho__', '/crm', '/suporte', 'nutria') returning id into v_e;
  insert into public.proposals (cliente_nome, cliente_email, status, target_equipe_id)
  values ('__t824_prop_equipe__', 'b@b.com', 'rascunho', v_e) returning id into v_p;
  v_origin := public.proposal_public_origin(v_p);
  assert v_origin = 'https://nutria.soloventures.com.br',
    format('ASSERT FAILED: origin via equipe existente = %s', v_origin);
  delete from public.proposals where id = v_p;

  -- (e) equipe NOVA criada no provisionamento herda o nicho da proposta
  insert into public.proposals (cliente_nome, cliente_email, status, niche_id, setup_price, monthly_price)
  values ('__t824_prop_provision__', 'c@c.com', 'aceita', 'imob', 0, 0) returning id into v_p;
  perform public.provision_tenant_from_proposal(v_p);
  select e.niche into v_equipe_niche
    from public.proposals p join public.equipes e on e.id = p.equipe_id
   where p.id = v_p;
  assert v_equipe_niche = 'imob',
    format('ASSERT FAILED: equipe criada no provisionamento tem niche %s, esperava imob', v_equipe_niche);

  -- limpeza -- apagar a equipe primeiro cascateia contrato, itens, fatura,
  -- conta de cobranca e card do onboarding (mesmo padrao ja usado na assercao
  -- de provision/go-live, acima neste arquivo de migrations)
  delete from public.equipes where id = (select equipe_id from public.proposals where id = v_p);
  delete from public.proposals where id = v_p;
  delete from public.equipes where id = v_e;

  raise notice 'Sprint 8.2 - proposal niche: assercoes passaram';
end $$;
