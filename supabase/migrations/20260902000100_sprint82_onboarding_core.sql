-- 20260902000100_sprint82_onboarding_core.sql
-- Sprint 8.2 · o onboarding vira uma coisa que existe no banco.
--
-- O QUE FALTAVA: entre "o cliente aceitou a proposta" e "o cliente está no ar"
-- há discovery, treinamento do agente, conexão de canais, arquitetura do CRM e
-- integração de anúncios. Nada disso existia no software. A aba Propostas parava
-- em "aceita" e o botão Provisionar já entregava o ambiente, o trial e a fatura
-- no mesmo clique — como se a implantação levasse zero dia.
--
-- Isso deixava o processo inteiro na cabeça do fundador. Um cliente parado há
-- doze dias esperando a reunião de discovery era invisível: não havia lugar
-- nenhum onde essa espera aparecesse.
--
-- TRÊS TABELAS, TRÊS RESPONSABILIDADES:
--
--   onboarding_stages  o vocabulário. Editável sem deploy, porque o processo de
--                      serviço muda mais rápido que o código.
--   onboardings        onde cada cliente está, desde quando, e o que trava.
--   onboarding_events  o histórico. Escrito por trigger, nunca pela aplicação —
--                      um card que voltou de Homologação para Implantação três
--                      vezes é a informação mais útil do sistema, e ela se perde
--                      se depender de alguém lembrar de registrar.

-- ============================================================================
-- 1. AS ETAPAS
--
-- `owner` existe porque metade dos travamentos de onboarding não são nossos: o
-- cliente não agendou o discovery, o cliente não validou a homologação. Sem essa
-- coluna o quadro mostra doze dias parados e não diz de quem é a bola.
--
-- `description` é a definição de pronto, e ela aparece no card. Uma etapa sem
-- critério de saída é onde o trabalho apodrece.
-- ============================================================================

create table if not exists public.onboarding_stages (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  label       text not null,
  description text,
  owner       text not null default 'solo' check (owner in ('solo','cliente')),
  sort_order  integer not null,
  is_initial  boolean not null default false,
  is_terminal boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.onboarding_stages is
  'Sprint 8.2 · as etapas do onboarding. Editáveis: o processo de serviço muda mais rápido que o código.';
comment on column public.onboarding_stages.owner is
  'De quem é a bola nesta etapa. Sem isto o quadro mostra o atraso e não mostra a causa.';
comment on column public.onboarding_stages.description is
  'A definição de pronto. Exibida no card — uma etapa sem critério de saída é onde o trabalho apodrece.';

insert into public.onboarding_stages (code, label, description, owner, sort_order, is_initial, is_terminal) values
  ('aceite',      'Aceite',      'Proposta aceita. O ambiente ainda não existe.',                                          'solo',    1, true,  false),
  ('boas_vindas', 'Boas-vindas', 'Ambiente criado, acesso enviado e o cliente convidado a agendar o discovery.',           'cliente', 2, false, false),
  ('discovery',   'Discovery',   'Reunião realizada. Processo comercial, oferta e canais mapeados.',                       'cliente', 3, false, false),
  ('implantacao', 'Implantação', 'Agente treinado, canais conectados, CRM montado e Meta Ads integrado.',                  'solo',    4, false, false),
  ('homologacao', 'Homologação', 'O cliente validou o agente e o funil num teste real.',                                   'cliente', 5, false, false),
  ('go_live',     'Go-live',     'Pronto para entrar no ar. Aguardando o clique que inicia a cobrança e o trial.',         'solo',    6, false, false),
  ('ativo',       'Ativo',       'No ar. Trial correndo ou assinatura ativa.',                                            'solo',    7, false, true)
on conflict (code) do update
  set label       = excluded.label,
      description = excluded.description,
      owner       = excluded.owner,
      sort_order  = excluded.sort_order,
      is_initial  = excluded.is_initial,
      is_terminal = excluded.is_terminal;

-- Exatamente uma etapa inicial. Sem isto, provisionar não sabe onde pôr o card.
create unique index if not exists uq_onboarding_stage_initial
  on public.onboarding_stages ((true)) where is_initial;

/**
 * Resolve o código de uma etapa. Existe para que as funções de provisionamento e
 * go-live não carreguem uuids literais, que mudam entre ambientes.
 */
create or replace function public.onboarding_stage_id(p_code text)
returns uuid
language sql stable
set search_path = public
as $fn$
  select id from public.onboarding_stages where code = p_code;
$fn$;

-- ============================================================================
-- 2. O CARD
--
-- `proposal_id` é nulo para os clientes que já estavam no software antes deste
-- sprint: eles entram por backfill e nunca tiveram proposta neste sistema.
--
-- `equipe_id` é nulo entre o aceite e o provisionamento — o card nasce antes da
-- equipe existir, que é justamente o intervalo que o produto não enxergava.
--
-- Os dois juntos não podem ser nulos: um card precisa ser sobre alguém.
-- ============================================================================

create table if not exists public.onboardings (
  id                    uuid primary key default gen_random_uuid(),
  proposal_id           uuid unique references public.proposals(id) on delete cascade,
  equipe_id             uuid unique references public.equipes(id)   on delete cascade,
  stage_id              uuid not null references public.onboarding_stages(id),
  cliente_nome          text not null,
  responsavel_user_id   uuid,

  -- O cliente vê esta data como o vencimento da fatura de implantação. É por
  -- isso que ela mora aqui e não numa anotação: mudá-la muda uma cobrança.
  golive_previsto       date,

  discovery_agendado_em timestamptz,
  discovery_feito_em    timestamptz,
  went_live_at          timestamptz,

  health                text not null default 'on_track'
                        check (health in ('on_track','at_risk','blocked')),
  blocked_reason        text,
  notes                 text,

  -- clock_timestamp(), não now(): now() é constante dentro de uma transação,
  -- então um backfill que move vários cards de uma vez daria a todos o mesmo
  -- horário de entrada e o "parado há N dias" nasceria errado.
  entered_stage_at      timestamptz not null default clock_timestamp(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint onboardings_has_subject
    check (proposal_id is not null or equipe_id is not null),

  -- Bloqueado sem motivo é um card que ninguém consegue destravar, porque
  -- ninguém sabe o que era para destravar.
  constraint onboardings_blocked_has_reason
    check (health <> 'blocked' or coalesce(btrim(blocked_reason), '') <> '')
);

comment on table public.onboardings is
  'Sprint 8.2 · um card por cliente, do aceite até estar no ar.';
comment on column public.onboardings.golive_previsto is
  'Data prevista de conclusão da implantação. Vira o vencimento da fatura de implantação — mudá-la muda uma cobrança.';
comment on column public.onboardings.entered_stage_at is
  'Quando o card entrou na etapa atual. É daqui que sai o "parado há N dias" do quadro.';

create index if not exists idx_onboardings_stage on public.onboardings (stage_id, entered_stage_at);
create index if not exists idx_onboardings_health on public.onboardings (health) where health <> 'on_track';

-- ============================================================================
-- 3. O HISTÓRICO
-- ============================================================================

create table if not exists public.onboarding_events (
  id            uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.onboardings(id) on delete cascade,
  from_stage    text,
  to_stage      text not null,
  note          text,
  actor_user_id uuid,
  created_at    timestamptz not null default now()
);

create index if not exists idx_onboarding_events_card
  on public.onboarding_events (onboarding_id, created_at desc);

comment on table public.onboarding_events is
  'Sprint 8.2 · escrito por trigger, nunca pela aplicação. Um card que voltou duas vezes de Homologação é a informação mais útil do quadro.';

/**
 * Registra a transição e reinicia o relógio da etapa.
 *
 * `entered_stage_at` é reiniciado AQUI e não pela aplicação porque o quadro usa
 * essa data para dizer há quantos dias o card está parado. Se a aplicação
 * pudesse mover o card sem reiniciar o relógio, o número exibido seria mentira —
 * e é justamente esse número que decide para onde o fundador olha primeiro.
 */
create or replace function public.log_onboarding_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_from text;
  v_to   text;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select code into v_to from public.onboarding_stages where id = new.stage_id;

  if tg_op = 'UPDATE' then
    select code into v_from from public.onboarding_stages where id = old.stage_id;
    new.entered_stage_at := clock_timestamp();
  end if;

  insert into public.onboarding_events (onboarding_id, from_stage, to_stage, actor_user_id)
  values (new.id, v_from, v_to, auth.uid());

  return new;
end;
$fn$;

-- AFTER para o INSERT (a linha precisa existir antes do evento apontar para ela)
-- e BEFORE para o UPDATE (entered_stage_at precisa ser alterado na linha que
-- está sendo gravada).
drop trigger if exists trg_onboardings_log_insert on public.onboardings;
create trigger trg_onboardings_log_insert after insert on public.onboardings
  for each row execute function public.log_onboarding_stage_change();

drop trigger if exists trg_onboardings_log_update on public.onboardings;
create trigger trg_onboardings_log_update before update on public.onboardings
  for each row execute function public.log_onboarding_stage_change();

drop trigger if exists trg_onboardings_touch on public.onboardings;
create trigger trg_onboardings_touch before update on public.onboardings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_onboarding_stages_touch on public.onboarding_stages;
create trigger trg_onboarding_stages_touch before update on public.onboarding_stages
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. RLS
--
-- O onboarding é a operação interna da Solo sobre um cliente: quanto tempo a
-- implantação está levando, o que travou, de quem é a bola. Não é dado do
-- inquilino. Super admin, como propostas.
-- ============================================================================

alter table public.onboarding_stages enable row level security;
alter table public.onboardings       enable row level security;
alter table public.onboarding_events enable row level security;

drop policy if exists onboarding_stages_admin on public.onboarding_stages;
create policy onboarding_stages_admin on public.onboarding_stages
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists onboardings_admin on public.onboardings;
create policy onboardings_admin on public.onboardings
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists onboarding_events_admin on public.onboarding_events;
create policy onboarding_events_admin on public.onboarding_events
  for select to authenticated using (public.is_super_admin());

-- ============================================================================
-- 5. ASSERÇÕES
-- ============================================================================

do $$
declare
  v_card  uuid;
  v_prop  uuid;
  v_cnt   integer;
  v_when  timestamptz;
  v_stage uuid;
begin
  -- (a) as sete etapas existem, na ordem, com uma inicial e uma terminal
  select count(*) into v_cnt from public.onboarding_stages where active;
  assert v_cnt = 7, format('ASSERT FAILED: esperava 7 etapas, achei %s', v_cnt);

  assert (select code from public.onboarding_stages where is_initial) = 'aceite',
    'ASSERT FAILED: a etapa inicial não é aceite';
  assert (select code from public.onboarding_stages where is_terminal) = 'ativo',
    'ASSERT FAILED: a etapa terminal não é ativo';

  -- (b) um card precisa ser sobre alguém
  begin
    insert into public.onboardings (stage_id, cliente_nome)
    values (public.onboarding_stage_id('aceite'), '__sem_sujeito__');
    raise exception 'ASSERT FAILED: um card sem proposta e sem equipe foi aceito';
  exception when check_violation then null;
  end;

  -- (c) criar o card já grava o primeiro evento
  insert into public.proposals (cliente_nome, monthly_price)
  values ('__ob_assert__', 200.00) returning id into v_prop;

  insert into public.onboardings (proposal_id, stage_id, cliente_nome)
  values (v_prop, public.onboarding_stage_id('aceite'), '__ob_assert__')
  returning id, entered_stage_at into v_card, v_when;

  select count(*) into v_cnt from public.onboarding_events
   where onboarding_id = v_card and to_stage = 'aceite' and from_stage is null;
  assert v_cnt = 1, format('ASSERT FAILED: o insert do card gerou %s eventos, esperava 1', v_cnt);

  -- (d) mudar de etapa gera evento COM origem e reinicia o relógio
  perform pg_sleep(0.01);
  update public.onboardings
     set stage_id = public.onboarding_stage_id('implantacao')
   where id = v_card;

  select count(*) into v_cnt from public.onboarding_events
   where onboarding_id = v_card and from_stage = 'aceite' and to_stage = 'implantacao';
  assert v_cnt = 1, 'ASSERT FAILED: a mudança de etapa não gerou evento com origem';

  assert (select entered_stage_at from public.onboardings where id = v_card) > v_when,
    'ASSERT FAILED: entered_stage_at não foi reiniciado — o "parado há N dias" mentiria';

  -- (e) um update que NÃO muda a etapa não polui o histórico
  update public.onboardings set notes = 'qualquer coisa' where id = v_card;
  select count(*) into v_cnt from public.onboarding_events where onboarding_id = v_card;
  assert v_cnt = 2, format('ASSERT FAILED: %s eventos após um update sem troca de etapa, esperava 2', v_cnt);

  -- (f) bloqueado sem motivo é rejeitado
  begin
    update public.onboardings set health = 'blocked', blocked_reason = '   ' where id = v_card;
    raise exception 'ASSERT FAILED: um card foi bloqueado sem motivo';
  exception when check_violation then null;
  end;

  update public.onboardings
     set health = 'blocked', blocked_reason = 'Cliente não enviou o material'
   where id = v_card;

  -- (g) um cliente, um card
  select stage_id into v_stage from public.onboardings where id = v_card;
  begin
    insert into public.onboardings (proposal_id, stage_id, cliente_nome)
    values (v_prop, v_stage, '__duplicado__');
    raise exception 'ASSERT FAILED: a mesma proposta gerou dois cards';
  exception when unique_violation then null;
  end;

  -- (h) apagar a proposta leva o card e o histórico junto
  delete from public.proposals where id = v_prop;
  select count(*) into v_cnt from public.onboardings where id = v_card;
  assert v_cnt = 0, 'ASSERT FAILED: o card sobreviveu à proposta';
  select count(*) into v_cnt from public.onboarding_events where onboarding_id = v_card;
  assert v_cnt = 0, 'ASSERT FAILED: o histórico sobreviveu ao card';

  raise notice 'Sprint 8.2 · onboarding core: asserções passaram';
end $$;
