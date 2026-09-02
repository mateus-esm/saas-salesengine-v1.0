-- 20260902000200_sprint82_provision_split.sql
-- Sprint 8.2 · provisionar deixa de ser colocar no ar.
--
-- O QUE ESTAVA ERRADO, medido em produção:
--
-- 1. provision_tenant_from_proposal() fazia `insert into equipes` sempre. Não
--    existia caminho para "esse cliente já está no software". Resultado: Solo
--    Energia, Rema Digital e WI Advogados ganharam equipes duplicadas vazias —
--    e o contrato ativo da Solo Energia ficou na equipe SEM os 456 leads.
--
-- 2. Um clique criava a equipe, iniciava o relógio do trial, emitia a fatura,
--    disparava a cobrança e mandava "sua primeira fatura já está disponível".
--    O cliente recebia uma cobrança antes da reunião de discovery.
--
-- 3. Com setup_charge_timing = 'on_accept', a fatura de implantação nunca era
--    emitida em lugar nenhum: a função só a criava no ramo 'on_golive', e o
--    aceite não criava nada. A implantação da Solo Teste (R$1.200) simplesmente
--    não existe como fatura.
--
-- O QUE PASSA A VALER (decisão do fundador, 02/09):
--
--   A fatura de implantação é SEMPRE emitida no provisionamento, com vencimento
--   na data prevista de conclusão da implantação. O que muda entre os dois
--   `setup_charge_timing` é apenas QUANDO a cobrança sai:
--
--     on_accept  → cobra no provisionamento
--     on_golive  → cobra quando o fundador clica em "Colocar no ar"
--
-- Separar emitir a fatura de emitir a cobrança é o que torna o processo
-- confiável: o cliente vê o compromisso e a data desde o começo, e o dinheiro é
-- pedido no momento que o negócio combinou.

-- ============================================================================
-- 1. A PROPOSTA PODE APONTAR PARA UMA EQUIPE QUE JÁ EXISTE
--
-- Nulo = cliente novo, cria ambiente. Preenchido = cliente que já opera aqui,
-- anexa o contrato ao ambiente dele. É a correção do defeito 1.
-- ============================================================================

alter table public.proposals
  add column if not exists target_equipe_id uuid references public.equipes(id) on delete set null;

comment on column public.proposals.target_equipe_id is
  'Sprint 8.2 · equipe existente a que esta proposta se refere. Nulo = cliente novo. Sem isto, renovar o contrato de um cliente criava uma segunda equipe vazia e o contrato ia parar nela.';

-- ============================================================================
-- 2. O CONTRATO EXISTE ANTES DE ESTAR NO AR
--
-- `onboarding`: o ambiente existe, o cliente tem acesso e está sendo implantado.
-- O relógio do trial NÃO corre e a mensalidade não é cobrada. É o estado que
-- faltava — sem ele, "provisionado" e "no ar" eram a mesma coisa.
-- ============================================================================

alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts add constraint contracts_status_check
  check (status in ('draft','onboarding','trialing','active','past_due','suspended','cancelled'));

-- Um contrato vivo por equipe.
--
-- O índice antigo cobria só active/past_due/suspended. `trialing` estava de
-- fora, então dava para provisionar duas propostas para a mesma equipe e criar
-- duas cobranças sem que nada reclamasse. Entra junto com `onboarding`.
drop index if exists uq_contracts_active_per_equipe;
create unique index uq_contracts_active_per_equipe
  on public.contracts (equipe_id)
  where status in ('onboarding','trialing','active','past_due','suspended');

-- Implantação não é inadimplência: o cliente tem acesso total durante o
-- onboarding, que é justamente o que permite a ele acompanhar a construção do
-- próprio ambiente. is_read_only continua sendo só `suspended`.
create or replace view public.v_tenant_entitlements as
select
  e.id as equipe_id,
  c.id as contract_id,
  coalesce(c.status, 'none') as contract_status,
  (c.status = 'suspended') as is_read_only,
  (c.status in ('onboarding','trialing','active','past_due')) as is_live,
  coalesce(
    (select array_agg(distinct bp.code)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id), '{}'::text[]) as modules,
  (select max((bp.metadata->>'seat_limit')::int)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan') as seat_limit,
  (select max((bp.metadata->>'agent_limit')::int)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan') as agent_limit,
  coalesce(
    (select sum(bp.credits_whatsapp * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id), 0)::int as included_credits_whatsapp,
  coalesce(
    (select sum(bp.credits_copilot * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id), 0)::int as included_credits_copilot,
  coalesce(
    (select sum(bp.credits_included * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id), 0)::int as included_credits,
  coalesce(
    (select sum(coalesce((bp.metadata->>'included_instances')::int, 0) * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id and bp.kind = 'plan'), 0)::int
  + coalesce(
    (select sum(ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id and bp.kind = 'instance'), 0)::int as instance_limit,
  coalesce(
    (select sum(coalesce((bp.metadata->>'builder_hours')::int, 0) * ci.quantity)
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
     where ci.contract_id = c.id and bp.kind = 'plan'), 0)::int as builder_hours,
  (select max(bp.metadata->>'builder_recurrence')
     from public.contract_items ci
     join public.billing_products bp on bp.id = ci.product_id
    where ci.contract_id = c.id and bp.kind = 'plan') as builder_recurrence,
  c.current_period_end,
  e.page_permissions
from public.equipes e
left join public.contracts c
  on c.equipe_id = e.id
 and c.status in ('onboarding','trialing','active','past_due','suspended');

-- ============================================================================
-- 3. PROVISIONAR
--
-- Faz o ambiente existir e o compromisso ficar visível. Não coloca no ar.
-- ============================================================================

-- A versão de um argumento tem que MORRER, não ser substituída.
--
-- `create or replace` não a remove: a nova assinatura tem um parâmetro com
-- default, então as duas passam a aceitar uma chamada de um argumento e o
-- Postgres recusa a ambiguidade com "could not choose a best candidate
-- function". A edge function chama por nome, com um argumento só — ou seja,
-- provisionar pararia de funcionar em produção no instante do deploy.
drop function if exists public.provision_tenant_from_proposal(uuid);

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

  -- Reexecutar é seguro: devolve o que já existe em vez de duplicar. É o que
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

  -- Vinte e um dias porque é o prazo real de uma implantação com discovery,
  -- treinamento do agente e integração de anúncios. Um padrão que mente vira
  -- uma fatura vencida antes da entrega.
  v_previsto := coalesce(p_golive_previsto, current_date + 21);

  select * into v_accept from public.proposal_acceptances where proposal_id = p_proposal_id;

  -- 1. equipe: anexa à que existe, ou cria -----------------------------------
  if v_p.target_equipe_id is not null then
    select id into v_equipe from public.equipes where id = v_p.target_equipe_id;
    if v_equipe is null then
      raise exception 'target_equipe_not_found' using errcode = 'P0001';
    end if;
    v_attached := true;

    -- Dois contratos vivos na mesma equipe cobram o cliente duas vezes. O índice
    -- único já barraria, mas com uma mensagem que ninguém entende.
    if exists (
      select 1 from public.contracts
       where equipe_id = v_equipe
         and status in ('onboarding','trialing','active','past_due','suspended')
    ) then
      raise exception 'equipe_has_live_contract' using errcode = 'P0001';
    end if;
  else
    insert into public.equipes (nome, crm_link, suporte_link)
    values (v_p.cliente_nome, '/crm', '/suporte')
    returning id into v_equipe;
  end if;

  -- 2. conta de cobrança ------------------------------------------------------
  -- Upsert, não insert: anexar a uma equipe que já fatura não pode apagar o
  -- asaas_customer_id dela. Só sobrescreve o que veio preenchido.
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
  -- Sem trial_ends_at, sem went_live_at, sem período: o relógio não corre. Ele
  -- começa em go_live_contract(), quando o cliente tem produto de verdade.
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
      continue;  -- a escolha do cliente vence um plano pré-preenchido
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

  -- 5. a fatura da implantação ------------------------------------------------
  -- Emitida agora, para os DOIS setup_charge_timing. Vence na data prevista de
  -- conclusão: o cliente vê o valor e o prazo desde o primeiro dia, e a data do
  -- boleto é a data da entrega prometida.
  v_setup_total := case when v_p.setup_waived then 0 else coalesce(v_p.setup_price, 0) end;

  if v_setup_total > 0 then
    insert into public.invoices (
      equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at
    ) values (
      v_equipe, v_contract, 'setup', 'open',
      v_setup_total, v_setup_total, v_previsto, now()
    ) returning id into v_setup_inv;

    insert into public.invoice_items (invoice_id, description, quantity, unit_price, total)
    values (v_setup_inv,
            'Implantação — discovery, treinamento do agente, conexão de canais, arquitetura do CRM e integração de anúncios',
            1, v_setup_total, v_setup_total);
  end if;

  -- 6. o card do onboarding ---------------------------------------------------
  -- Anexar a uma equipe que já tem card reaproveita o card: um cliente, um card.
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
    -- A edge function lê isto para decidir se chama o gateway agora. 'on_golive'
    -- deixa a cobrança para o clique de "Colocar no ar".
    'charge_now',          (v_setup_inv is not null and v_p.setup_charge_timing = 'on_accept')
  );
end;
$fn$;

-- ============================================================================
-- 4. COLOCAR NO AR
--
-- O momento em que o cliente passa a ter um produto: agente treinado, canais
-- conectados, CRM montado. É daqui que o trial faz sentido — quinze dias de um
-- ambiente meio construído seriam quinze dias julgando o produto errado.
-- ============================================================================

create or replace function public.go_live_contract(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_c         public.contracts%rowtype;
  v_p         public.proposals%rowtype;
  v_trial_days integer;
  v_trial_end timestamptz;
  v_setup_inv uuid;
  v_setup_total numeric(12,2) := 0;
  v_card      uuid;
  v_previsto  date;
  v_due       date;
  v_charged   boolean;
begin
  select * into v_c from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;

  select * into v_p from public.proposals where id = v_c.proposal_id;
  select id, golive_previsto into v_card, v_previsto
    from public.onboardings where equipe_id = v_c.equipe_id;

  -- Idempotente: clicar duas vezes não dá dois trials nem duas faturas.
  if v_c.went_live_at is not null then
    select id, (asaas_payment_id is not null) into v_setup_inv, v_charged
      from public.invoices
     where contract_id = p_contract_id and kind = 'setup' and status <> 'void'
     limit 1;
    return jsonb_build_object(
      'already_live',     true,
      'equipe_id',        v_c.equipe_id,
      'contract_id',      p_contract_id,
      'status',           v_c.status,
      'trial_ends_at',    v_c.trial_ends_at,
      'setup_invoice_id', v_setup_inv,
      'charge_now',       coalesce(v_setup_inv is not null and not v_charged, false)
    );
  end if;

  if v_c.status not in ('draft','onboarding') then
    raise exception 'contract_not_in_onboarding' using errcode = 'P0001';
  end if;

  v_trial_days := greatest(coalesce(v_p.trial_days, 15), 0);
  v_trial_end  := date_trunc('day', now()) + make_interval(days => v_trial_days);

  update public.contracts set
    went_live_at         = now(),
    status               = case when v_trial_days > 0 then 'trialing' else 'active' end,
    trial_ends_at        = case when v_trial_days > 0 then v_trial_end else null end,
    current_period_start = now(),
    current_period_end   = case when v_trial_days > 0 then v_trial_end
                                else date_trunc('month', now()) + interval '1 month' end
  where id = p_contract_id;

  -- A fatura de implantação normalmente já existe (o provisionamento a emite).
  -- Este ramo cobre a proposta que deixou de ser isenta depois de provisionada,
  -- e os contratos criados antes deste sprint.
  select id into v_setup_inv from public.invoices
   where contract_id = p_contract_id and kind = 'setup' and status <> 'void' limit 1;

  v_setup_total := case when coalesce(v_p.setup_waived, false) then 0 else coalesce(v_p.setup_price, 0) end;

  if v_setup_inv is null and v_setup_total > 0 then
    insert into public.invoices (
      equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at
    ) values (
      v_c.equipe_id, p_contract_id, 'setup', 'open',
      v_setup_total, v_setup_total, coalesce(v_previsto, current_date + 5), now()
    ) returning id into v_setup_inv;

    insert into public.invoice_items (invoice_id, description, quantity, unit_price, total)
    values (v_setup_inv,
            'Implantação — discovery, treinamento do agente, conexão de canais, arquitetura do CRM e integração de anúncios',
            1, v_setup_total, v_setup_total);
  end if;

  -- Se a implantação atrasou, o vencimento previsto já passou. Emitir um boleto
  -- nascido vencido é pior do que não emitir: o cliente recebe uma cobrança em
  -- atraso no dia em que o produto ficou pronto.
  if v_setup_inv is not null then
    select due_date, (asaas_payment_id is not null) into v_due, v_charged
      from public.invoices where id = v_setup_inv;

    if not v_charged and v_due < current_date + 3 then
      update public.invoices set due_date = current_date + 3 where id = v_setup_inv;
    end if;
  end if;

  if v_card is not null then
    update public.onboardings set
      stage_id     = public.onboarding_stage_id('ativo'),
      went_live_at = now(),
      health       = 'on_track',
      blocked_reason = null
    where id = v_card;
  end if;

  return jsonb_build_object(
    'already_live',     false,
    'equipe_id',        v_c.equipe_id,
    'contract_id',      p_contract_id,
    'status',           case when v_trial_days > 0 then 'trialing' else 'active' end,
    'trial_ends_at',    case when v_trial_days > 0 then v_trial_end else null end,
    'trial_days',       v_trial_days,
    'setup_invoice_id', v_setup_inv,
    'setup_total',      v_setup_total,
    'onboarding_id',    v_card,
    -- No go-live cobramos QUALQUER fatura de implantação ainda sem cobrança,
    -- não só as 'on_golive': se o gateway falhou no aceite, este é o momento
    -- natural de tentar de novo.
    'charge_now',       coalesce(v_setup_inv is not null and not v_charged, false)
  );
end;
$fn$;

revoke all on function public.go_live_contract(uuid) from public, anon;
grant execute on function public.go_live_contract(uuid) to service_role;

-- ============================================================================
-- 5. ASSERÇÕES
-- ============================================================================

do $$
declare
  v_prop  uuid;
  v_prop2 uuid;
  v_eq    uuid;
  v_r     jsonb;
  v_g     jsonb;
  v_cnt   integer;
  v_txt   text;
  v_date  date;
  v_num   numeric;
begin
  -- ── (a) cliente novo: cria equipe, contrato em onboarding, fatura com
  --        vencimento na data prevista, e NENHUM trial correndo ──────────────
  insert into public.proposals (cliente_nome, cliente_doc, cliente_email, setup_price,
                                monthly_price, term_months, status, chosen_plan_code,
                                trial_days, setup_charge_timing)
  values ('__t2_novo__', '12345678000199', 'novo@x.com', 2000.00, 0, 12, 'aceita',
          'plan_starter', 15, 'on_golive')
  returning id into v_prop;
  insert into public.proposal_acceptances (proposal_id, terms_snapshot, accepted_name)
  values (v_prop, '{}'::jsonb, 'Cliente Novo');

  v_r := public.provision_tenant_from_proposal(v_prop, current_date + 30);
  v_eq := (v_r->>'equipe_id')::uuid;

  select status into v_txt from public.contracts where id = (v_r->>'contract_id')::uuid;
  assert v_txt = 'onboarding',
    format('ASSERT FAILED: contrato nasceu %s, esperava onboarding', v_txt);

  assert (select trial_ends_at from public.contracts where id = (v_r->>'contract_id')::uuid) is null,
    'ASSERT FAILED: o relógio do trial começou no provisionamento';
  assert (select went_live_at from public.contracts where id = (v_r->>'contract_id')::uuid) is null,
    'ASSERT FAILED: went_live_at foi preenchido sem ninguém colocar no ar';

  assert (v_r->>'setup_invoice_id') is not null,
    'ASSERT FAILED: a fatura de implantação não foi emitida no provisionamento';
  select due_date into v_date from public.invoices where id = (v_r->>'setup_invoice_id')::uuid;
  assert v_date = current_date + 30,
    format('ASSERT FAILED: a fatura venceu em %s, esperava a data prevista de conclusão', v_date);

  -- on_golive não cobra agora
  assert (v_r->>'charge_now')::boolean = false,
    'ASSERT FAILED: uma proposta on_golive mandou cobrar no provisionamento';

  -- o card nasceu em boas-vindas, com a previsão
  select stage_id, golive_previsto into v_txt, v_date from public.onboardings
   where id = (v_r->>'onboarding_id')::uuid;
  assert v_txt = public.onboarding_stage_id('boas_vindas')::text,
    'ASSERT FAILED: o card não nasceu em boas-vindas';
  assert v_date = current_date + 30, 'ASSERT FAILED: o card não guardou a previsão';

  -- ── (b) reexecutar não duplica ──────────────────────────────────────────────
  v_r := public.provision_tenant_from_proposal(v_prop, current_date + 30);
  assert (v_r->>'already_provisioned')::boolean, 'ASSERT FAILED: provisionar de novo não foi idempotente';
  select count(*) into v_cnt from public.contracts where proposal_id = v_prop;
  assert v_cnt = 1, format('ASSERT FAILED: %s contratos para a mesma proposta', v_cnt);

  -- ── (c) colocar no ar: trial começa AGORA, fatura fica, e é idempotente ────
  v_g := public.go_live_contract((v_r->>'contract_id')::uuid);
  assert (v_g->>'status') = 'trialing',
    format('ASSERT FAILED: após o go-live o contrato ficou %s', v_g->>'status');
  assert (v_g->>'trial_ends_at') is not null, 'ASSERT FAILED: o trial não começou no go-live';
  assert (v_g->>'charge_now')::boolean, 'ASSERT FAILED: on_golive não pediu a cobrança no go-live';

  assert (select code from public.onboarding_stages s
           join public.onboardings o on o.stage_id = s.id
          where o.equipe_id = v_eq) = 'ativo',
    'ASSERT FAILED: o card não foi para Ativo no go-live';

  v_g := public.go_live_contract((v_r->>'contract_id')::uuid);
  assert (v_g->>'already_live')::boolean, 'ASSERT FAILED: go-live duas vezes não foi idempotente';
  select count(*) into v_cnt from public.invoices
   where contract_id = (v_r->>'contract_id')::uuid and kind = 'setup' and status <> 'void';
  assert v_cnt = 1, format('ASSERT FAILED: %s faturas de implantação após dois go-lives', v_cnt);

  -- ── (d) is_live cobre onboarding, is_read_only não ─────────────────────────
  update public.contracts set status = 'onboarding', went_live_at = null,
         trial_ends_at = null, current_period_start = null, current_period_end = null
   where id = (v_r->>'contract_id')::uuid;
  assert (select is_live from public.v_tenant_entitlements where equipe_id = v_eq),
    'ASSERT FAILED: um contrato em onboarding não está live — o cliente perderia o acesso durante a implantação';
  assert not (select is_read_only from public.v_tenant_entitlements where equipe_id = v_eq),
    'ASSERT FAILED: onboarding virou somente-leitura';

  -- ── (e) anexar a uma equipe existente NÃO cria equipe nova ────────────────
  select count(*) into v_cnt from public.equipes;

  insert into public.proposals (cliente_nome, cliente_doc, setup_price, monthly_price,
                                status, chosen_plan_code, trial_days,
                                setup_charge_timing, target_equipe_id)
  values ('__t2_anexa__', '12345678000199', 500.00, 0, 'aceita', 'plan_starter', 15,
          'on_accept', v_eq)
  returning id into v_prop2;
  insert into public.proposal_acceptances (proposal_id, terms_snapshot, accepted_name)
  values (v_prop2, '{}'::jsonb, 'Mesmo Cliente');

  -- a equipe ainda tem o contrato em onboarding de (d): tem que recusar
  begin
    v_r := public.provision_tenant_from_proposal(v_prop2);
    raise exception 'ASSERT FAILED: anexou um segundo contrato vivo à mesma equipe';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'equipe_has_live_contract' then raise; end if;
  end;

  update public.contracts set status = 'cancelled' where equipe_id = v_eq;

  v_r := public.provision_tenant_from_proposal(v_prop2, current_date + 10);
  assert (v_r->>'attached')::boolean, 'ASSERT FAILED: attached não foi marcado';
  assert (v_r->>'equipe_id')::uuid = v_eq,
    'ASSERT FAILED: anexar criou uma equipe nova em vez de usar a existente';
  assert (v_r->>'charge_now')::boolean,
    'ASSERT FAILED: on_accept não pediu a cobrança no provisionamento';

  select count(*) into v_num from public.equipes;
  assert v_num = v_cnt, format('ASSERT FAILED: anexar criou %s equipe(s) nova(s)', v_num - v_cnt);

  -- um cliente, um card: a equipe continua com um só
  select count(*) into v_cnt from public.onboardings where equipe_id = v_eq;
  assert v_cnt = 1, format('ASSERT FAILED: a equipe ficou com %s cards', v_cnt);

  -- ── (f) dois contratos vivos na mesma equipe são impossíveis ──────────────
  begin
    insert into public.contracts (equipe_id, status, started_at)
    values (v_eq, 'onboarding', now());
    raise exception 'ASSERT FAILED: dois contratos vivos na mesma equipe';
  exception when unique_violation then null;
  end;

  -- ── (g) setup isento não emite fatura nenhuma ─────────────────────────────
  delete from public.equipes where id = v_eq;
  delete from public.proposals where id in (v_prop, v_prop2);

  insert into public.proposals (cliente_nome, setup_price, monthly_price, status,
                                chosen_plan_code, setup_waived, setup_charge_timing, trial_days)
  values ('__t2_isento__', 2000.00, 0, 'aceita', 'plan_starter', true, 'on_golive', 15)
  returning id into v_prop;
  insert into public.proposal_acceptances (proposal_id, terms_snapshot, accepted_name)
  values (v_prop, '{}'::jsonb, 'Isento');

  v_r := public.provision_tenant_from_proposal(v_prop);
  assert (v_r->>'setup_invoice_id') is null, 'ASSERT FAILED: um setup isento gerou fatura';
  assert (v_r->>'setup_total')::numeric = 0, 'ASSERT FAILED: um setup isento reportou total';
  assert (v_r->>'charge_now')::boolean = false, 'ASSERT FAILED: um setup isento pediu cobrança';

  -- e o vencimento padrão é 21 dias quando ninguém informa a previsão
  assert (v_r->>'golive_previsto')::date = current_date + 21,
    'ASSERT FAILED: a previsão padrão não é de 21 dias';

  delete from public.equipes where id = (v_r->>'equipe_id')::uuid;
  delete from public.proposals where id = v_prop;

  raise notice 'Sprint 8.2 · provision/go-live: asserções passaram';
end $$;
