-- 20261015000800_sesup1_pipeline_distribution.sql
-- SE-SUP1-8 (#17) — Roleta: distribuição de negócios novos, por pipeline.
--
-- O QUE É
--
--   pipeline_distribution (uma linha por pipeline)
--     mode     round_robin | weighted | by_rule
--     members  [{user_id, weight, away}]     quem participa da roleta
--     rules    [{field, value, user_ids}]    só by_rule; avaliadas EM ORDEM (campos:
--                                            origem, fonte, canal, personalizados); nenhuma
--                                            casou = padrão (todos os membros)
--     max_open_per_seller                    limite de negócios ABERTOS do vendedor
--                                            neste pipeline (nulo = sem limite)
--     skip_away                              "pular ausentes": membro marcado como
--                                            ausente não recebe
--     active
--
--   AUSÊNCIA: o produto não tem noção de ausência do usuário (profiles não guarda
--   férias/folga; agenda_events não tem dono). Então "ausente" é um interruptor por
--   membro, NA PRÓPRIA ROLETA, que o gestor liga e desliga — e "pular ausentes"
--   decide se ele vale. Quando existir presença de verdade, é aqui que ela entra.
--
-- UM SÓ PONTO DE APLICAÇÃO
--
-- O gatilho BEFORE INSERT trg_opportunity_distribution chama crm_assign_next(new)
-- quando o negócio nasce SEM dono. Vale para todo caminho que cria negócio —
-- webhook, formulário (crm_intake_submit), chat, importação, tela — porque todos
-- terminam num INSERT em opportunities. Nenhuma edge precisa saber da roleta.
--
-- Ordem (gatilhos BEFORE rodam em ordem alfabética):
--   trg_opportunity_default_owner   herda leads.responsible_id — o contato que já
--                                   tem dono continua com ele (a roleta é para
--                                   quem ainda não tem)
--   trg_opportunity_distribution    <- aqui: só se owner_id ainda é nulo
--   trg_opportunity_owner_same_team valida o escolhido (sempre membro da equipe)
-- Depois do INSERT, crm_record_touch só escolhe dono pela regra da ENTRADA se o
-- negócio continua sem dono — com a roleta ativa, ela vence.
--
-- NUNCA BLOQUEIA A CRIAÇÃO. Qualquer erro dentro da roleta vira "sem responsável"
-- + uma linha status='error' em pipeline_distribution_runs (e um WARNING no log);
-- o negócio é criado do mesmo jeito. Perder um lead porque a roleta quebrou seria
-- pior que um lead sem dono, que aparece no filtro "sem responsável".
--
-- O MOTIVO. Cada decisão vira uma linha em pipeline_distribution_runs
-- ("regra 2: origem=Indicação", "rodízio", "por peso (3)"). O histórico de dono
-- (opportunity_owner_history — o "owner_events" da Sprint 11 W2) ganha a coluna
-- `reason` e a origem 'distribution': o gatilho de histórico, que já grava a
-- atribuição do INSERT, lê o motivo da run deste negócio. Nada de segundo log de dono.
--
-- O ESCOLHIDO. Rodízio e peso usam o mesmo algoritmo — weighted round robin suave
-- (o do nginx): cada membro elegível soma o seu peso a um contador; o maior leva
-- e perde o total. Peso 1 para todos = rodízio puro, na ordem da lista. by_rule faz
-- rodízio dentro do grupo da regra. Os contadores ficam em `state`, por grupo, e a
-- linha da roleta é travada (FOR UPDATE) na escolha: dois negócios simultâneos no
-- mesmo pipeline nunca pegam a mesma vez.
--
-- O contato: se o lead está sem responsável, ele recebe o mesmo vendedor (a regra
-- de coerência do crm_set_responsible); lead com responsável não muda.
--
-- Sem begin/commit próprios (scripts/sqltest.sh inclui o arquivo na transação do teste).

-- ============================================================================
-- 1. A CONFIGURAÇÃO
-- ============================================================================

create table if not exists public.pipeline_distribution (
  pipeline_id          uuid primary key references public.pipelines(id) on delete cascade,
  equipe_id            uuid not null references public.equipes(id) on delete cascade,
  mode                 text not null default 'round_robin'
                       check (mode in ('round_robin', 'weighted', 'by_rule')),
  members              jsonb not null default '[]'::jsonb check (jsonb_typeof(members) = 'array'),
  rules                jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  max_open_per_seller  integer check (max_open_per_seller is null or max_open_per_seller between 1 and 10000),
  skip_away            boolean not null default true,
  active               boolean not null default false,
  -- Contadores do rodízio, por grupo ("all:<uid>", "r2:<uid>"). Só o banco escreve.
  state                jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);

comment on table public.pipeline_distribution is
  'SE-SUP1-8 #17: roleta do pipeline. Aplicada no INSERT de opportunities sem dono (trg_opportunity_distribution -> crm_assign_next). Escrita só por crm_save_pipeline_distribution.';

alter table public.pipeline_distribution enable row level security;

drop policy if exists pipeline_distribution_select_own_team on public.pipeline_distribution;
create policy pipeline_distribution_select_own_team on public.pipeline_distribution
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- Sem política de escrita: o verbo valida membros/regras e normaliza. Um UPDATE
-- direto poderia pôr na roleta alguém de outra equipe.
revoke all on public.pipeline_distribution from anon, authenticated;
grant select on public.pipeline_distribution to authenticated;

-- ============================================================================
-- 2. O LOG DE DECISÕES
-- ============================================================================

create table if not exists public.pipeline_distribution_runs (
  id             bigserial primary key,
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  pipeline_id    uuid not null,
  -- Sem FK: a linha é gravada no BEFORE INSERT, antes do negócio existir.
  opportunity_id uuid not null,
  assigned_to    uuid,
  status         text not null check (status in ('assigned', 'no_candidate', 'error')),
  reason         text not null,
  created_at     timestamptz not null default clock_timestamp()
);

create index if not exists idx_distribution_runs_pipeline
  on public.pipeline_distribution_runs (pipeline_id, created_at desc);
create index if not exists idx_distribution_runs_opportunity
  on public.pipeline_distribution_runs (opportunity_id);

alter table public.pipeline_distribution_runs enable row level security;

drop policy if exists pipeline_distribution_runs_select_own_team on public.pipeline_distribution_runs;
create policy pipeline_distribution_runs_select_own_team on public.pipeline_distribution_runs
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

revoke all on public.pipeline_distribution_runs from anon, authenticated;
grant select on public.pipeline_distribution_runs to authenticated;

-- ============================================================================
-- 3. O HISTÓRICO DE DONO GUARDA O MOTIVO
-- ============================================================================

alter table public.opportunity_owner_history add column if not exists reason text;

alter table public.opportunity_owner_history drop constraint if exists opportunity_owner_history_source_check;
alter table public.opportunity_owner_history add constraint opportunity_owner_history_source_check
  check (source in ('change', 'backfill', 'distribution'));

-- Corpo da 20260911000300; só o ramo INSERT lê a decisão da roleta deste negócio.
create or replace function public.fn_opportunity_owner_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if tg_op = 'INSERT' then
    if new.owner_id is not null then
      select r.reason into v_reason
        from public.pipeline_distribution_runs r
       where r.opportunity_id = new.id
         and r.status = 'assigned'
         and r.assigned_to = new.owner_id
       order by r.id desc
       limit 1;
      insert into public.opportunity_owner_history
        (equipe_id, opportunity_id, from_owner, to_owner, changed_by, changed_at, source, reason)
      values
        (new.equipe_id, new.id, null, new.owner_id, auth.uid(), coalesce(new.created_at, clock_timestamp()),
         case when v_reason is not null then 'distribution' else 'change' end, v_reason);
    end if;
  elsif new.owner_id is distinct from old.owner_id then
    insert into public.opportunity_owner_history
      (equipe_id, opportunity_id, from_owner, to_owner, changed_by, changed_at)
    values
      (new.equipe_id, new.id, old.owner_id, new.owner_id, auth.uid(), clock_timestamp());
  end if;
  return null;
end;
$$;

-- ============================================================================
-- 4. CAMPOS QUE UMA REGRA PODE LER
-- ============================================================================

-- SÓ CAMPOS QUE EXISTEM NO INSERT. A regra é avaliada no nascimento do negócio,
-- e origin_category / origin_platform / origin_detail são preenchidos DEPOIS dele
-- por crm_record_touch (primeiro toque) — num lead novo de webhook, formulário ou
-- chat estariam sempre vazios e toda regra sobre eles cairia no padrão. (E
-- origin_category guarda códigos internos, como paid_social, que o gestor não
-- digitaria.) Ficam: origem, origin, source, channel (gravados com o lead) e os
-- campos personalizados do negócio. Uma regra antiga com campo removido não
-- quebra: simplesmente nunca casa.

-- Rótulo em português do campo, para o motivo ("regra 2: origem=Indicação").
create or replace function public._distribution_field_label(p_field text, p_schema jsonb)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select case p_field
    when 'origem'          then 'origem'
    when 'origin'          then 'origem'
    when 'source'          then 'fonte'
    when 'channel'         then 'canal'
    else coalesce((select f->>'label' from jsonb_array_elements(coalesce(p_schema, '[]'::jsonb)) f
                    where 'custom:' || (f->>'field_id') = p_field limit 1), 'campo')
  end;
$$;

-- O valor que a regra compara: coluna do lead, ou custom_data[field_id] do negócio
-- (contrato dos campos personalizados). Lista fechada: nada vira SQL dinâmico.
-- Multiseleção (array): casa se QUALQUER item casar.
create or replace function public._distribution_field_matches(
  p_field text, p_value text, p_lead public.leads, p_custom jsonb
)
returns boolean
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_raw  jsonb;
  v_want text := lower(btrim(coalesce(p_value, '')));
begin
  if v_want = '' then
    return false;
  end if;
  v_raw := case p_field
    when 'origem'          then to_jsonb(p_lead.origem)
    when 'origin'          then to_jsonb(p_lead.origin)
    when 'source'          then to_jsonb(p_lead.source)
    when 'channel'         then to_jsonb(p_lead.channel)
    else case when p_field like 'custom:%' then coalesce(p_custom, '{}'::jsonb) -> substr(p_field, 8) end
  end;
  if v_raw is null or v_raw = 'null'::jsonb then
    return false;
  end if;
  if jsonb_typeof(v_raw) = 'array' then
    return exists (select 1 from jsonb_array_elements(v_raw) x where lower(btrim(x #>> '{}')) = v_want);
  end if;
  return lower(btrim(v_raw #>> '{}')) = v_want;
end;
$$;

revoke all on function public._distribution_field_label(text, jsonb) from public, anon, authenticated;
revoke all on function public._distribution_field_matches(text, text, public.leads, jsonb) from public, anon, authenticated;

-- ============================================================================
-- 5. A ESCOLHA: crm_assign_next(opp)
-- ============================================================================
--
-- Recebe a linha do negócio (ainda não inserida) e devolve
--   {status: assigned|no_candidate|inactive, user_id, reason}
-- Atualiza só os contadores da roleta. Interna: só o gatilho chama.

create or replace function public.crm_assign_next(p_opp public.opportunities)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cfg      public.pipeline_distribution;
  v_lead     public.leads;
  v_schema   jsonb;
  v_rule     jsonb;
  v_idx      int := 0;
  v_group    text := 'all';
  v_pool     uuid[];
  v_reason   text;
  v_state    jsonb;
  v_m        record;
  v_total    numeric := 0;
  v_best     uuid;
  v_best_cw  numeric;
  v_cw       numeric;
  v_skipped_away  int := 0;
  v_skipped_limit int := 0;
  v_note     text;
begin
  select * into v_cfg from public.pipeline_distribution d
   where d.pipeline_id = p_opp.pipeline_id
     and d.equipe_id = p_opp.equipe_id
     and d.active
   for update;
  if v_cfg.pipeline_id is null then
    return jsonb_build_object('status', 'inactive');
  end if;

  -- Os membros válidos HOJE (ainda da equipe), na ordem da lista.
  -- (O pool por regra é recortado desta lista, então peso/ausência valem igual.)
  if v_cfg.mode = 'by_rule' then
    select * into v_lead from public.leads l where l.id = p_opp.lead_id;
    select p.custom_fields_schema into v_schema from public.pipelines p where p.id = p_opp.pipeline_id;
    for v_rule in select r from jsonb_array_elements(v_cfg.rules) r loop
      v_idx := v_idx + 1;
      if public._distribution_field_matches(v_rule->>'field', v_rule->>'value', v_lead, p_opp.custom_data) then
        v_group := 'r' || v_idx;
        v_reason := format('regra %s: %s=%s', v_idx::text,
                           public._distribution_field_label(v_rule->>'field', v_schema), btrim(v_rule->>'value'));
        select array_agg(u::uuid) into v_pool
          from jsonb_array_elements_text(coalesce(v_rule->'user_ids', '[]'::jsonb)) u;
        exit;
      end if;
    end loop;
    if v_group = 'all' then
      v_reason := 'padrão (nenhuma regra casou)';
    end if;
  elsif v_cfg.mode = 'weighted' then
    v_reason := 'por peso';
  else
    v_reason := 'rodízio';
  end if;

  v_state := coalesce(v_cfg.state, '{}'::jsonb);

  -- Duas passadas no máximo: o grupo da regra; se ninguém dele puder receber, o padrão.
  for pass in 1..2 loop
    v_total := 0; v_best := null; v_best_cw := null;
    v_skipped_away := 0; v_skipped_limit := 0;

    for v_m in
      select (m->>'user_id')::uuid as uid,
             case when v_cfg.mode = 'weighted'
                  then greatest(1, least(100, coalesce((m->>'weight')::int, 1)))
                  else 1 end as weight,
             coalesce((m->>'away')::boolean, false) as away,
             o.ord
        from jsonb_array_elements(v_cfg.members) with ordinality o(m, ord)
        join public.profiles p on p.id = (m->>'user_id')::uuid and p.equipe_id = p_opp.equipe_id
       where (v_group = 'all' or (m->>'user_id')::uuid = any(v_pool))
       order by o.ord
    loop
      if v_cfg.skip_away and v_m.away then
        v_skipped_away := v_skipped_away + 1;
        continue;
      end if;
      if v_cfg.max_open_per_seller is not null and (
           select count(*) from public.opportunities x
            where x.owner_id = v_m.uid
              and x.pipeline_id = p_opp.pipeline_id
              and x.status = 'open'
              and x.deleted_at is null) >= v_cfg.max_open_per_seller then
        v_skipped_limit := v_skipped_limit + 1;
        continue;
      end if;
      v_cw := coalesce((v_state->>(v_group || ':' || v_m.uid::text))::numeric, 0) + v_m.weight;
      v_state := jsonb_set(v_state, array[v_group || ':' || v_m.uid::text], to_jsonb(v_cw));
      v_total := v_total + v_m.weight;
      if v_best_cw is null or v_cw > v_best_cw then
        v_best := v_m.uid;
        v_best_cw := v_cw;
      end if;
    end loop;

    exit when v_best is not null or v_group = 'all';
    -- O grupo da regra está todo ausente/no limite: cai no padrão, dizendo por quê.
    v_reason := v_reason || ' — grupo indisponível, padrão';
    v_group := 'all';
  end loop;

  v_note := concat_ws(', ',
              case when v_skipped_limit > 0 then v_skipped_limit::text || ' no limite' end,
              case when v_skipped_away  > 0 then v_skipped_away::text  || ' ausente(s)' end);

  if v_best is null then
    return jsonb_build_object('status', 'no_candidate',
      'reason', 'ninguém disponível na roleta' || case when v_note <> '' then ' (' || v_note || ')' else '' end);
  end if;

  v_state := jsonb_set(v_state, array[v_group || ':' || v_best::text], to_jsonb(v_best_cw - v_total));
  update public.pipeline_distribution set state = v_state where pipeline_id = v_cfg.pipeline_id;

  if v_cfg.mode = 'weighted' then
    v_reason := format('por peso (%s)', (select greatest(1, least(100, coalesce((m->>'weight')::int, 1)))
                                           from jsonb_array_elements(v_cfg.members) m
                                          where (m->>'user_id')::uuid = v_best limit 1)::text);
  end if;

  return jsonb_build_object('status', 'assigned', 'user_id', v_best,
    'reason', v_reason || case when v_note <> '' then ' · pulou ' || v_note else '' end);
end;
$$;

revoke all on function public.crm_assign_next(public.opportunities) from public, anon, authenticated;

comment on function public.crm_assign_next(public.opportunities) is
  'SE-SUP1-8 #17: escolhe o dono de um negócio novo pela roleta do pipeline (rodízio, peso ou regra; limite de abertos; pular ausentes). Interna — só trg_opportunity_distribution chama.';

-- ============================================================================
-- 6. O PONTO ÚNICO: o gatilho de INSERT
-- ============================================================================

create or replace function public.fn_opportunity_distribution()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pick jsonb;
begin
  if new.owner_id is not null then
    return new;
  end if;
  -- Barato antes do bloco de exceção: o pipeline sem roleta ativa não paga nada.
  if not exists (select 1 from public.pipeline_distribution d
                  where d.pipeline_id = new.pipeline_id and d.active) then
    return new;
  end if;
  -- Negócio que já nasce fechado (importação de histórico) não entra na roleta.
  if coalesce(new.status, 'open') <> 'open' or exists (
       select 1 from public.pipeline_stages_v2 s
        where s.id = new.stage_id and s.stage_type in ('won', 'lost')) then
    return new;
  end if;

  -- Tudo da roleta num bloco só (subtransação): se qualquer passo falhar — a
  -- escolha, o contato ou o próprio log —, contadores, contato e log voltam juntos
  -- e o negócio segue sem dono. A variável NEW não é desfeita pelo bloco, por isso
  -- o owner_id é zerado à mão no handler.
  begin
    v_pick := public.crm_assign_next(new);

    if v_pick->>'status' = 'assigned' then
      new.owner_id := (v_pick->>'user_id')::uuid;
      -- Contato sem dono recebe o mesmo vendedor; contato com dono não muda.
      update public.leads l
         set responsible_id = new.owner_id
       where l.id = new.lead_id
         and l.equipe_id = new.equipe_id
         and l.responsible_id is null;
    end if;

    if v_pick->>'status' in ('assigned', 'no_candidate') then
      insert into public.pipeline_distribution_runs (equipe_id, pipeline_id, opportunity_id, assigned_to, status, reason)
      values (new.equipe_id, new.pipeline_id, new.id, new.owner_id, v_pick->>'status', coalesce(v_pick->>'reason', ''));
    end if;
  exception when others then
    -- Nunca bloqueia a criação: sem dono, com o erro registrado.
    new.owner_id := null;
    raise warning 'pipeline_distribution: % (%)', sqlerrm, sqlstate;
    begin
      insert into public.pipeline_distribution_runs (equipe_id, pipeline_id, opportunity_id, status, reason)
      values (new.equipe_id, new.pipeline_id, new.id, 'error', left('erro: ' || sqlerrm, 500));
    exception when others then
      raise warning 'pipeline_distribution: log do erro falhou: %', sqlerrm;
    end;
  end;
  return new;
end;
$$;

drop trigger if exists trg_opportunity_distribution on public.opportunities;
create trigger trg_opportunity_distribution
  before insert on public.opportunities
  for each row execute function public.fn_opportunity_distribution();

-- ============================================================================
-- 7. O VERBO DA TELA: crm_save_pipeline_distribution
-- ============================================================================
--
-- p_config: {mode, members:[{user_id, weight, away}], rules:[{field, value, user_ids}],
--            max_open_per_seller, skip_away, active}
-- Normaliza (membros sem repetição e só da equipe; peso 1..100; regras com campo da
-- lista fechada ou custom:<field_id> vivo do pipeline; grupo da regra ⊆ membros) e
-- recusa o que não dá para normalizar sem mudar o sentido.

create or replace function public.crm_save_pipeline_distribution(p_pipeline_id uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_team    uuid;
  v_schema  jsonb;
  v_mode    text := coalesce(p_config->>'mode', 'round_robin');
  v_members jsonb;
  v_ids     uuid[];
  v_rules   jsonb := '[]'::jsonb;
  v_rule    jsonb;
  v_field   text;
  v_value   text;
  v_uids    jsonb;
  v_max     integer;
  v_active  boolean := coalesce((p_config->>'active')::boolean, false);
  v_n       int := 0;
  v_row     public.pipeline_distribution;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  if v_team is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select pl.custom_fields_schema into v_schema
    from public.pipelines pl
   where pl.id = p_pipeline_id and pl.equipe_id = v_team and pl.deleted_at is null;
  if not found then
    raise exception 'pipeline_not_found' using errcode = 'P0002';
  end if;

  if v_mode not in ('round_robin', 'weighted', 'by_rule') then
    raise exception 'invalid_mode: %', v_mode using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_config->'members', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_config->'rules', '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_config' using errcode = '22023';
  end if;

  -- Membros: só uuid, só da equipe, sem repetição (fica a primeira), na ordem dada.
  if exists (select 1 from jsonb_array_elements(coalesce(p_config->'members', '[]'::jsonb)) m
              where coalesce(m->>'user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 or not exists (select 1 from public.profiles p
                                 where p.id = (m->>'user_id')::uuid and p.equipe_id = v_team)) then
    raise exception 'member_not_in_team' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', x.uid,
           'weight',  greatest(1, least(100, coalesce(case when x.m->>'weight' ~ '^\d+$' then (x.m->>'weight')::int end, 1))),
           'away',    coalesce((x.m->>'away')::boolean, false)) order by x.ord), '[]'::jsonb),
         array_agg(x.uid order by x.ord)
    into v_members, v_ids
    from (select distinct on ((m->>'user_id')::uuid) (m->>'user_id')::uuid as uid, m, ord
            from jsonb_array_elements(coalesce(p_config->'members', '[]'::jsonb)) with ordinality t(m, ord)
           order by (m->>'user_id')::uuid, ord) x;

  if v_active and coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'no_members' using errcode = '22023';
  end if;

  -- Regras (só by_rule as usa, mas guardar as de outro modo não faz mal: trocar de
  -- modo e voltar não apaga o trabalho do gestor).
  for v_rule in select r from jsonb_array_elements(coalesce(p_config->'rules', '[]'::jsonb)) r loop
    v_n := v_n + 1;
    if v_n > 30 then
      raise exception 'too_many_rules' using errcode = '22023';
    end if;
    v_field := btrim(coalesce(v_rule->>'field', ''));
    v_value := btrim(coalesce(v_rule->>'value', ''));
    if v_field not in ('origem', 'origin', 'source', 'channel')
       and not (v_field like 'custom:%' and exists (
             select 1 from jsonb_array_elements(coalesce(v_schema, '[]'::jsonb)) f
              where 'custom:' || (f->>'field_id') = v_field
                and coalesce((f->>'is_deleted')::boolean, false) = false)) then
      raise exception 'invalid_rule_field:%', v_n::text using errcode = '22023';
    end if;
    if v_value = '' or length(v_value) > 200 then
      raise exception 'invalid_rule_value:%', v_n::text using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(distinct u), '[]'::jsonb) into v_uids
      from jsonb_array_elements_text(coalesce(v_rule->'user_ids', '[]'::jsonb)) u
     where u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    if jsonb_array_length(v_uids) = 0
       or exists (select 1 from jsonb_array_elements_text(v_uids) u where not (u::uuid = any(coalesce(v_ids, array[]::uuid[])))) then
      raise exception 'invalid_rule_group:%', v_n::text using errcode = '22023';
    end if;
    v_rules := v_rules || jsonb_build_array(jsonb_build_object('field', v_field, 'value', v_value, 'user_ids', v_uids));
  end loop;

  if v_mode = 'by_rule' and v_active and jsonb_array_length(v_rules) = 0 then
    raise exception 'no_rules' using errcode = '22023';
  end if;

  if p_config ? 'max_open_per_seller' and jsonb_typeof(p_config->'max_open_per_seller') <> 'null' then
    if (p_config->>'max_open_per_seller') !~ '^\d+$' then
      raise exception 'invalid_max_open' using errcode = '22023';
    end if;
    v_max := (p_config->>'max_open_per_seller')::integer;
    if v_max < 1 or v_max > 10000 then
      raise exception 'invalid_max_open' using errcode = '22023';
    end if;
  end if;

  insert into public.pipeline_distribution as d
    (pipeline_id, equipe_id, mode, members, rules, max_open_per_seller, skip_away, active, updated_at, updated_by)
  values
    (p_pipeline_id, v_team, v_mode, v_members, v_rules, v_max,
     coalesce((p_config->>'skip_away')::boolean, true), v_active, now(), auth.uid())
  on conflict (pipeline_id) do update
     set mode = excluded.mode,
         members = excluded.members,
         rules = excluded.rules,
         max_open_per_seller = excluded.max_open_per_seller,
         skip_away = excluded.skip_away,
         active = excluded.active,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         -- Contador de quem saiu da roleta não serve para nada.
         state = coalesce((select jsonb_object_agg(k, v) from jsonb_each(d.state) s(k, v)
                            where split_part(k, ':', 2) in (select x->>'user_id' from jsonb_array_elements(excluded.members) x)),
                          '{}'::jsonb)
   where d.equipe_id = v_team
  returning * into v_row;

  if v_row.pipeline_id is null then
    -- A linha existe mas é de outra equipe (não deveria: pipeline_id é da equipe).
    raise exception 'pipeline_not_found' using errcode = 'P0002';
  end if;

  return to_jsonb(v_row) - 'state';
end;
$$;

revoke all on function public.crm_save_pipeline_distribution(uuid, jsonb) from public, anon;
grant execute on function public.crm_save_pipeline_distribution(uuid, jsonb) to authenticated;

comment on function public.crm_save_pipeline_distribution(uuid, jsonb) is
  'SE-SUP1-8 #17: grava a roleta do pipeline (equipe de quem chama), validando membros, regras e limite.';
