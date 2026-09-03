-- 2026-09-03_wi_reset_e_dedup.sql
-- Cirurgia de dados. NAO e migration: mexe em linhas especificas desta base,
-- decididas pelo fundador caso a caso, e nao e regra do software.
--
-- Rodar assim:
--   python supabase/scripts/run_sql.py supabase/scripts/2026-09-03_wi_reset_e_dedup.sql --rehearse
--   python supabase/scripts/run_sql.py supabase/scripts/2026-09-03_wi_reset_e_dedup.sql --commit
--
-- ============================================================================
-- O QUE ESTE SCRIPT FAZ, E O QUE VOCE PRECISA SABER ANTES DE RODAR
-- ============================================================================
--
-- A. WALTER INGLEZ ADVOGADOS -- o unico passo que APAGA operacao de verdade
--
--    Existem duas equipes para o mesmo cliente:
--
--      "Walter Inglez Advogados" 26b9ab8c  25/12/2025  246 conversas, 246 leads,
--                                                      2 logins, SEM contrato
--      "WI Advogados"            e5bda77f  02/09/2026  vazia, COM o contrato
--                                                      da proposta aceita
--
--    Decisao do fundador (03/09): fica a NOVA, a do negocio fechado. A antiga
--    e apagada, com as 246 conversas e os 246 leads.
--
--    O QUE ESTE SCRIPT PROTEGE, e que o pedido nao mencionava: `profiles` tem
--    `on delete cascade` para `equipes`. Apagar a equipe antiga apagaria os
--    DOIS LOGINS junto -- e a equipe nova tem zero perfis. O cliente ficaria
--    sem nenhuma forma de entrar, e nada acusaria o erro.
--
--    Entao a ordem e: mover os logins primeiro, apagar depois. Tudo o que
--    morre e copiado para backup_20260903_* antes.
--
-- B. DUPLICATAS VAZIAS -- Solo Energia c39a6d83 e Rema Digital b16e48b5.
--    Ambas criadas em 02/09 pelo provisionamento antigo, ambas com 0 conversas,
--    0 leads, 0 perfis, 0 contratos. Nada se perde.
--
-- C. O QUADRO -- quem fechou negocio e ainda nao esta no ar volta para
--    "Boas-vindas", que e onde o processo comeca de verdade: ambiente criado,
--    acesso enviado, discovery a agendar. O backfill os tinha colocado em
--    "Implantacao", uma etapa que eles nunca chegaram a comecar.
--
-- D. A MENSAGEM que nunca saiu -- nenhum desses clientes recebeu as
--    boas-vindas (welcome_notif = nao para todos). Este script enfileira.
--
-- E. A MENSALIDADE QUE FALTOU -- Solo Energia entrou no ar em 02/09 com
--    trial_days = 0 e NENHUMA fatura foi emitida (ver a migration
--    20260903000500). O buraco no codigo esta fechado dali em diante; esta
--    parte emite a fatura que aquele go-live deveria ter emitido.
--
-- O QUE ESTE SCRIPT NAO FAZ, DE PROPOSITO:
--
--   * Nao emite a implantacao de R$1.000 da Solo Energia (proposta
--     099CAB5BD789, setup_charge_timing = on_accept). O contrato entrou no ar
--     sem ela e cobrar R$1.000 de surpresa e decisao comercial, nao correcao
--     de bug. Se for para cobrar: Admin -> Faturamento -> Nova fatura avulsa.
--
--   * Nao emite cobranca no gateway. SQL nao fala com o Asaas. As faturas
--     nascem `open` com metadata.manual = true (sem essa marca o billing-cron
--     as anularia em 2h) e a cobranca sai pelo painel, em
--     Faturamento -> ... -> "Emitir cobranca no Asaas".

begin;

-- ============================================================================
-- 0. AS EQUIPES, RESOLVIDAS POR ID -- e a checagem de que a base ainda e a
--    que foi conferida ao escrever isto. Se qualquer forma mudou, aborta antes
--    de tocar em qualquer linha.
-- ============================================================================

do $$
declare
  v_cnt integer;
begin
  -- a antiga do WI: e ela mesma que tem a operacao?
  select count(*) into v_cnt from public.conversations where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';
  if v_cnt < 200 then
    raise exception 'ABORTADO: a equipe antiga do WI tem % conversas, esperava 246. A base nao e a que foi conferida.', v_cnt;
  end if;

  -- a nova do WI: continua vazia e com o contrato?
  select count(*) into v_cnt from public.conversations where equipe_id = 'e5bda77f-cec0-485e-8d52-404b4fb11ac6';
  if v_cnt <> 0 then
    raise exception 'ABORTADO: a equipe NOVA do WI ja tem % conversas. Alguem comecou a operar nela; nao apague a antiga sem reavaliar.', v_cnt;
  end if;
  if not exists (select 1 from public.contracts where equipe_id = 'e5bda77f-cec0-485e-8d52-404b4fb11ac6') then
    raise exception 'ABORTADO: a equipe nova do WI nao tem contrato. Sem ele, apagar a antiga deixa o cliente sem nada.';
  end if;

  -- as duplicatas vazias sao mesmo vazias?
  select count(*) into v_cnt from public.conversations
   where equipe_id in ('c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b', 'b16e48b5-675a-469c-8b45-21c8cf60139c');
  if v_cnt <> 0 then
    raise exception 'ABORTADO: uma das duplicatas tem % conversas. Nao e casca.', v_cnt;
  end if;
  select count(*) into v_cnt from public.contracts
   where equipe_id in ('c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b', 'b16e48b5-675a-469c-8b45-21c8cf60139c');
  if v_cnt <> 0 then
    raise exception 'ABORTADO: uma das duplicatas tem contrato. Nao e casca.';
  end if;

  raise notice 'Forma da base conferida.';
end $$;

-- ============================================================================
-- 1. BACKUP -- tudo o que vai morrer, copiado antes.
--    Nao apague estas tabelas antes de conferir o resultado por uma semana.
-- ============================================================================

create table if not exists backup_20260903_equipes as
  select * from public.equipes where id in (
    '26b9ab8c-b601-47fa-ae68-b7d3be4712d8',
    'c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b',
    'b16e48b5-675a-469c-8b45-21c8cf60139c'
  );

create table if not exists backup_20260903_profiles as
  select * from public.profiles where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

create table if not exists backup_20260903_conversations as
  select * from public.conversations where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

create table if not exists backup_20260903_leads as
  select * from public.leads where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

create table if not exists backup_20260903_messages as
  select m.* from public.messages m
   where m.conversation_id in (
     select id from public.conversations where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8'
   );

create table if not exists backup_20260903_opportunities as
  select * from public.opportunities where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

create table if not exists backup_20260903_billing_accounts as
  select * from public.billing_accounts where equipe_id in (
    '26b9ab8c-b601-47fa-ae68-b7d3be4712d8',
    'c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b',
    'b16e48b5-675a-469c-8b45-21c8cf60139c'
  );

create table if not exists backup_20260903_onboardings as
  select * from public.onboardings;

create table if not exists backup_20260903_stage_history as
  select * from public.opportunity_stage_history
   where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

-- ============================================================================
-- 2. WI -- OS LOGINS PRIMEIRO. Esta e a linha que impede o cliente de perder
--    o acesso quando a equipe antiga for apagada, tres blocos abaixo.
-- ============================================================================

update public.profiles
   set equipe_id = 'e5bda77f-cec0-485e-8d52-404b4fb11ac6'
 where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

-- A proposta do WI foi aceita sem e-mail (cliente_email = null), entao o
-- convite de acesso nunca teve para onde ir e as boas-vindas nao teriam
-- destinatario. O e-mail do dono da conta e o endereco certo: e a pessoa que
-- assinou.
update public.proposals
   set cliente_email = coalesce(cliente_email, 'wi@walteringlezadv.com.br')
 where id = '56d1c2ca-78f7-4954-8522-adbb4e874ed9';

update public.billing_accounts
   set billing_email = coalesce(billing_email, 'wi@walteringlezadv.com.br')
 where equipe_id = 'e5bda77f-cec0-485e-8d52-404b4fb11ac6';

-- O nicho da equipe antiga acompanha o cliente: e ele que decide em qual
-- dominio o link de acesso abre.
update public.equipes
   set niche = coalesce(niche, (
     select niche from public.equipes where id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8'
   ))
 where id = 'e5bda77f-cec0-485e-8d52-404b4fb11ac6';

-- ============================================================================
-- 3. APAGAR
--
--    A equipe antiga do WI tem operacao real, e por isso `admin_delete_equipe()`
--    (o botao do painel) se RECUSA a apaga-la. Aqui o delete e direto e
--    deliberado -- e a excecao cirurgica que o fundador pediu, com backup
--    completo tres blocos acima. O cascade leva conversas, mensagens, leads,
--    oportunidades e o card do quadro.
-- ============================================================================

-- O historico de etapas sai antes: a FK de `opportunity_stage_history.to_stage_id`
-- e ON DELETE SET NULL sobre uma coluna NOT NULL, entao o cascade morreria ali
-- com 23502. Mesma razao pela qual `admin_delete_equipe()` faz isto.
delete from public.opportunity_stage_history
 where equipe_id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

delete from public.equipes where id = '26b9ab8c-b601-47fa-ae68-b7d3be4712d8';

-- As duas cascas de 02/09. Nenhum dado, nenhum login, nenhum contrato.
delete from public.equipes where id in (
  'c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b',
  'b16e48b5-675a-469c-8b45-21c8cf60139c'
);

-- ============================================================================
-- 4. O QUADRO -- quem fechou e nao esta no ar volta para Boas-vindas.
--
--    entered_stage_at reinicia junto: a contagem de dias parados na etapa e o
--    que colore o card, e herdar "12 dias" de uma etapa que o cliente nunca
--    comecou faria o quadro nascer mentindo. O trigger de historico registra a
--    transicao sozinho.
-- ============================================================================

update public.onboardings o
   set stage_id         = public.onboarding_stage_id('boas_vindas'),
       entered_stage_at = now(),
       health           = 'on_track',
       blocked_reason   = null
  from public.contracts c
 where c.equipe_id = o.equipe_id
   and c.status = 'onboarding'
   and c.went_live_at is null
   and o.went_live_at is null
   and o.stage_id <> public.onboarding_stage_id('boas_vindas');

-- ============================================================================
-- 5. A MENSALIDADE QUE O GO-LIVE DA SOLO ENERGIA NAO EMITIU
--
--    Contrato 5234874b: no ar desde 02/09, trial_days = 0, R$200/mes, zero
--    faturas. A migration 20260903000500 fecha o buraco para os proximos
--    go-lives; este bloco emite a fatura daquele.
--
--    Proporcional de 02/09 ate 30/09, pela mesma regra do fim de trial: o
--    proximo ciclo cai no dia 1, entao esta cobre so o que falta do mes.
-- ============================================================================

do $$
declare
  v_c        public.contracts%rowtype;
  v_monthly  numeric(12,2);
  v_total    numeric(12,2);
  v_key      text;
  v_inv      uuid;
begin
  select * into v_c from public.contracts where id = '5234874b-e8d2-4e5c-a739-d659737b1e53';
  if not found then
    raise notice 'Contrato da Solo Energia nao encontrado; pulando.';
    return;
  end if;

  select coalesce(sum(ci.unit_price * ci.quantity), 0) into v_monthly
    from public.contract_items ci
   where ci.contract_id = v_c.id and ci.period = 'monthly';

  v_key := to_char(v_c.went_live_at, 'YYYY-MM-DD');

  -- Idempotente: rodar de novo nao emite uma segunda.
  if exists (
    select 1 from public.invoices
     where contract_id = v_c.id and kind = 'recurring'
       and metadata @> jsonb_build_object('period_key', v_key)
  ) then
    raise notice 'A mensalidade da Solo Energia ja existe; pulando.';
    return;
  end if;

  if v_monthly <= 0 then
    raise notice 'Contrato da Solo Energia sem valor mensal; pulando.';
    return;
  end if;

  v_total := public.prorated_amount(v_monthly, v_c.went_live_at);

  insert into public.invoices (
    equipe_id, contract_id, kind, status, subtotal, total, due_date, issued_at, metadata
  ) values (
    v_c.equipe_id, v_c.id, 'recurring', 'open', v_total, v_total,
    current_date + 5, now(),
    -- `manual` protege do voidOrphanInvoices, que anula em 2h toda fatura
    -- aberta sem cobranca no gateway. Sai sozinha quando o painel emitir a
    -- cobranca.
    jsonb_build_object('period_key', v_key, 'prorated', true, 'first_period', true,
                       'manual', true, 'origem', 'correcao_golive_sem_trial_20260903')
  ) returning id into v_inv;

  insert into public.invoice_items (invoice_id, description, quantity, unit_price, total)
  values (v_inv,
          'Assinatura - de ' || to_char(v_c.went_live_at, 'DD/MM/YYYY') || ' ate o fim do mes',
          1, v_total, v_total);

  raise notice 'Solo Energia: fatura de % emitida.', v_total;
end $$;

-- ============================================================================
-- 6. AS BOAS-VINDAS QUE NUNCA SAIRAM
--
--    Um cliente por contrato vivo que ainda nao esta no ar. notify() e o mesmo
--    caminho que o provisionamento usa, com o mesmo dedup_key -- entao se
--    algum ja tiver recebido, nada e duplicado.
-- ============================================================================

do $$
declare
  r          record;
  v_agenda   text;
  v_origin   text;
  v_id       uuid;
  v_enviados integer := 0;
begin
  select value into v_agenda from public.system_settings where key = 'ONBOARDING_CALENDLY_URL';

  for r in
    select c.id as contract_id, c.equipe_id, e.nome, o.golive_previsto
      from public.contracts c
      join public.equipes e on e.id = c.equipe_id
      left join public.onboardings o on o.equipe_id = c.equipe_id
     where c.status = 'onboarding' and c.went_live_at is null
  loop
    v_origin := public.tenant_public_origin(r.equipe_id);

    v_id := public.notify(
      r.equipe_id,
      'onboarding.welcome',
      'Bem-vindo!',
      '',
      '/home',
      jsonb_build_object(
        'cliente_nome',    r.nome,
        'link_agenda',     coalesce(v_agenda, ''),
        'link_app',        coalesce(v_origin, ''),
        'link_senha',      case when v_origin is null then '' else v_origin || '/definir-senha' end,
        'golive_previsto', coalesce(to_char(r.golive_previsto, 'DD/MM/YYYY'), '')
      ),
      'welcome_' || r.contract_id::text
    );

    if v_id is not null then
      v_enviados := v_enviados + 1;
      raise notice 'Boas-vindas enfileiradas para %', r.nome;
    else
      raise notice '% ja tinha recebido; nada duplicado.', r.nome;
    end if;
  end loop;

  raise notice '% mensagem(ns) de boas-vindas enfileirada(s).', v_enviados;
end $$;

-- ============================================================================
-- VERIFICACAO -- qualquer falha aqui desfaz TUDO acima.
-- ============================================================================

do $$
declare
  v_cnt integer;
  v_eq  uuid;
begin
  -- (a) as tres equipes sumiram
  select count(*) into v_cnt from public.equipes where id in (
    '26b9ab8c-b601-47fa-ae68-b7d3be4712d8',
    'c39a6d83-9f13-4232-9f3c-f9c8cc6d8f7b',
    'b16e48b5-675a-469c-8b45-21c8cf60139c'
  );
  assert v_cnt = 0, format('ASSERT FAILED: %s das equipes condenadas continuam de pe', v_cnt);

  -- (b) E ESTA E A QUE IMPORTA: o cliente do WI ainda tem login, e ele aponta
  --     para a equipe que tem o contrato.
  select equipe_id into v_eq from public.profiles where email = 'wi@walteringlezadv.com.br';
  assert v_eq = 'e5bda77f-cec0-485e-8d52-404b4fb11ac6',
    format('ASSERT FAILED: o login do WI aponta para %s, esperava a equipe nova', coalesce(v_eq::text, 'NENHUMA EQUIPE'));

  select count(*) into v_cnt from public.profiles
   where equipe_id = 'e5bda77f-cec0-485e-8d52-404b4fb11ac6';
  assert v_cnt = 2, format('ASSERT FAILED: %s logins na equipe do WI, esperava 2', v_cnt);

  -- (c) nenhum login ficou orfao
  select count(*) into v_cnt from public.profiles p
   where p.equipe_id is not null
     and not exists (select 1 from public.equipes e where e.id = p.equipe_id);
  assert v_cnt = 0, format('ASSERT FAILED: %s perfis apontam para equipe inexistente', v_cnt);

  -- (d) o backup existe e tem o que foi apagado
  select count(*) into v_cnt from backup_20260903_conversations;
  assert v_cnt >= 200, format('ASSERT FAILED: o backup tem %s conversas, esperava 246', v_cnt);
  select count(*) into v_cnt from backup_20260903_profiles;
  assert v_cnt = 2, format('ASSERT FAILED: o backup tem %s perfis, esperava 2', v_cnt);

  -- (e) nenhum nome de equipe duplicado sobrou
  select count(*) into v_cnt from (
    select nome from public.equipes group by nome having count(*) > 1
  ) d;
  assert v_cnt = 0, format('ASSERT FAILED: %s nome(s) de equipe ainda duplicado(s)', v_cnt);

  -- (f) quem fechou e nao esta no ar esta em Boas-vindas
  select count(*) into v_cnt
    from public.onboardings o
    join public.contracts c on c.equipe_id = o.equipe_id
   where c.status = 'onboarding' and c.went_live_at is null
     and o.stage_id <> public.onboarding_stage_id('boas_vindas');
  assert v_cnt = 0, format('ASSERT FAILED: %s card(s) fechado(s) fora de Boas-vindas', v_cnt);

  -- (g) a Solo Energia deixou de usar o produto de graca
  select count(*) into v_cnt from public.invoices
   where contract_id = '5234874b-e8d2-4e5c-a739-d659737b1e53' and kind = 'recurring' and status = 'open';
  assert v_cnt = 1, format('ASSERT FAILED: %s mensalidades abertas na Solo Energia, esperava 1', v_cnt);

  -- (h) um cliente, um card
  select count(*) into v_cnt from (
    select cliente_nome from public.onboardings group by cliente_nome having count(*) > 1
  ) d;
  assert v_cnt = 0, format('ASSERT FAILED: %s cliente(s) com card duplicado', v_cnt);

  raise notice 'Cirurgia 03/09: todas as assercoes passaram.';
end $$;

commit;
