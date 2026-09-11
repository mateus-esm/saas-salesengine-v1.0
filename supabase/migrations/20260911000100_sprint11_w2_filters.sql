-- 20260911000100_sprint11_w2_filters.sql
-- Sprint 11 · Onda 2 · T12 — filtros v2 no servidor (motor de Consulta).
--
-- O QUE ESTE ARQUIVO ENTREGA
--
-- A Onda 1 criou crm_opp_matches: o único lugar que decide se um negócio passa
-- nos filtros do CRM. Esta migration estende o mesmo contrato (as mesmas chaves
-- de p_filters), sem criar um segundo:
--
--   custom        filtro por campo personalizado declarado, com operador por tipo
--                 (any_of, contains, between_number, between_date, is_true,
--                 is_false, empty, not_empty). É o gêmeo SQL do registro de tipos
--                 de campo do frontend (src/lib/fields/registry.ts, T15).
--   next_contact  atrasado / hoje / semana / sem — no dia de São Paulo.
--   contatos      crm_lead_matches: a Base de Contatos filtra pelo mesmo motor,
--                 inclusive pela situação do contato (derivada dos negócios dele)
--                 e pelo responsável DE UM NEGÓCIO — o contato não tem
--                 responsável próprio (decisão do founder, 11/09).
--
-- FILTRO COMPILADO: O JSON É LIDO UMA VEZ, NÃO UMA VEZ POR LINHA
--
-- A primeira versão desta migration relia e convertia o p_filters em cada linha
-- — medido na base real da Solo Energia, o resumo do Kanban foi de 185 ms (Onda
-- 1) para 590 ms, e a Base de Contatos filtrada por "cliente" levou 2 s. Agora:
--
--   _crm_compile_opp_filters / _crm_compile_lead_filters
--       leem o jsonb UMA vez por consulta e devolvem um registro tipado
--       (crm_opp_filter / crm_lead_filter), com datas, números, ids e o "hoje"
--       de São Paulo já convertidos.
--   _crm_opp_matches_c / _crm_lead_matches_c
--       comparam uma linha com o registro compilado. São SQL puro, sem SET, para
--       o planner poder embuti-las na consulta de quem chama (um SET impede o
--       inlining). Todo nome é qualificado com public.; são security invoker.
--   crm_opp_matches / crm_lead_matches
--       continuam existindo com a mesma assinatura (o contrato), para quem
--       filtra uma linha avulsa. As RPCs do quadro e das tabelas usam o caminho
--       compilado.
--
-- NADA QUE VEM DO CLIENTE DERRUBA A CONSULTA
--
-- O filtro chega da URL, e o valor gravado em custom_data chega de qualquer
-- escritor (tela, webhook, importação). Então: operador desconhecido = filtro
-- ignorado; valor gravado que não converte = não bate; ponta de intervalo que não
-- converte = ponta ausente; id que não é uuid = descartado.
--
-- SEGURANÇA: tudo security invoker — a RLS de opportunities e leads faz o recorte
-- de tenant, como na Onda 1.

-- ============================================================================
-- 1. UTILITÁRIOS
-- ============================================================================

-- Vazio é: ausente, null, "", só espaços, [] ou {}. É o mesmo vazio do registro de
-- tipos do frontend (isEmpty).
create or replace function public._crm_is_empty(v jsonb)
returns boolean
language sql
immutable
as $$
  select v is null
      or jsonb_typeof(v) = 'null'
      or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
      or v = '[]'::jsonb
      or v = '{}'::jsonb;
$$;

-- Número: o formato é conferido antes (sem exceção, sem subtransação), então a
-- conversão nunca falha. Expoente limitado para não estourar o numeric.
create or replace function public._crm_try_numeric(p text)
returns numeric
language sql
immutable
as $$
  select case
           when p ~ '^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d{1,3})?\s*$' then btrim(p)::numeric
         end;
$$;

-- Data: só o que parece ISO chega à conversão; o que parece ISO e não existe
-- (31/02) cai na exceção do _crm_cast_timestamptz.
create or replace function public._crm_cast_timestamptz(p text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  return btrim(p)::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public._crm_try_timestamptz(p text)
returns timestamptz
language sql
stable
as $$
  select case
           when p ~ '^\s*\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)?\s*$'
             then public._crm_cast_timestamptz(p)
         end;
$$;

-- Uma lista de ids do jsonb, só com o que é uuid.
create or replace function public._crm_uuid_list(p jsonb)
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(x::uuid), array[]::uuid[])
    from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
   where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- Uma lista de textos do jsonb.
create or replace function public._crm_text_list(p jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(x), array[]::text[])
    from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x;
$$;

-- ============================================================================
-- 2. CAMPO PERSONALIZADO
-- ============================================================================

-- Todos os filtros de campo (E). Cada filtro: {"field_id", "op", "values"?,
-- "value"?, "from"?, "to"?}. O valor lido é custom_data[field_id] (o endereço
-- único do contrato dos campos, T8).
--
-- plpgsql de propósito: roda uma vez por linha quando há filtro de campo, e um
-- laço sobre o jsonb, sem consulta dentro, custa microssegundos. A primeira
-- versão (SQL com subconsulta, que o planner não consegue embutir) levou quase
-- 1 s na Tabela de Leads da Solo Energia com um único filtro de campo.
create or replace function public._crm_custom_matches(p_data jsonb, p_custom jsonb)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  i    int;
  j    int;
  f    jsonb;
  v    jsonb;
  vals jsonb;
  op   text;
  ok   boolean;
  txt  text;
  num  numeric;
  lo   numeric;
  hi   numeric;
  ts   timestamptz;
  tlo  timestamptz;
  thi  timestamptz;
begin
  if p_custom is null or jsonb_typeof(p_custom) <> 'array' then
    return true;
  end if;

  for i in 0 .. jsonb_array_length(p_custom) - 1 loop
    f := p_custom -> i;
    -- Filtro malformado (não é objeto): ignorado.
    continue when jsonb_typeof(f) is distinct from 'object';

    op := f->>'op';
    v  := coalesce(p_data, '{}'::jsonb) -> (f->>'field_id');

    case op
      when 'empty' then
        ok := public._crm_is_empty(v);

      when 'not_empty' then
        ok := not public._crm_is_empty(v);

      -- seleção, usuário: o valor está na lista. multi-seleção: algum item está.
      when 'any_of' then
        vals := f->'values';
        if jsonb_typeof(vals) is distinct from 'array' or jsonb_array_length(vals) = 0 then
          ok := true;
        elsif jsonb_typeof(v) = 'array' then
          ok := false;
          for j in 0 .. jsonb_array_length(vals) - 1 loop
            if v ? (vals->>j) then
              ok := true;
              exit;
            end if;
          end loop;
        elsif jsonb_typeof(v) in ('string', 'number', 'boolean') then
          ok := vals ? (v #>> '{}');
        else
          ok := false;
        end if;

      -- texto, url, telefone: pedaço do texto, sem diferenciar maiúsculas.
      when 'contains' then
        txt := nullif(btrim(coalesce(f->>'value', '')), '');
        if txt is null then
          ok := true;
        elsif jsonb_typeof(v) in ('string', 'number') then
          ok := (v #>> '{}') ilike '%' || txt || '%';
        else
          ok := false;
        end if;

      -- número, moeda: from <= v <= to.
      when 'between_number' then
        num := public._crm_try_numeric(v #>> '{}');
        lo  := public._crm_try_numeric(f->>'from');
        hi  := public._crm_try_numeric(f->>'to');
        ok  := num is not null and (lo is null or num >= lo) and (hi is null or num <= hi);

      -- data: from <= v < to (meio-aberto, como created_from / created_to).
      when 'between_date' then
        ts  := public._crm_try_timestamptz(v #>> '{}');
        tlo := public._crm_try_timestamptz(f->>'from');
        thi := public._crm_try_timestamptz(f->>'to');
        ok  := ts is not null and (tlo is null or ts >= tlo) and (thi is null or ts < thi);

      -- sim/não. Vazio não é "não": para isso existe "empty".
      when 'is_true' then
        ok := v = 'true'::jsonb or lower(coalesce(v #>> '{}', '')) in ('true', 'sim');

      when 'is_false' then
        ok := v = 'false'::jsonb or lower(coalesce(v #>> '{}', '')) in ('false', 'nao', 'não');

      -- operador desconhecido: ignorado.
      else
        ok := true;
    end case;

    if not coalesce(ok, false) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- ============================================================================
-- 3. BUSCA E PRÓXIMO CONTATO — uma implementação para negócio e contato
-- ============================================================================

-- Pedaço do nome ou do e-mail; ou telefone digitado de qualquer jeito — a
-- comparação é por dígitos contra o telefone normalizado. p_digits e p_phone já
-- vêm prontos do filtro compilado.
create or replace function public._crm_search_c(l public.leads, p_search text, p_digits text, p_phone text)
returns boolean
language sql
stable
as $$
  select p_search is null
      or l.name  ilike '%' || p_search || '%'
      or l.email ilike '%' || p_search || '%'
      or (p_digits is not null and (
            coalesce(l.phone_normalized, '') like '%' || p_digits || '%'
            or coalesce(l.phone_normalized, '') = p_phone));
$$;

-- leads.next_contact é DATE; p_today é o dia de São Paulo, calculado uma vez no
-- filtro compilado (às 22h de Fortaleza o servidor, em UTC, já está no dia seguinte).
create or replace function public._crm_next_contact_c(p_next date, p_bucket text, p_today date)
returns boolean
language sql
immutable
as $$
  select p_bucket is null
      or (p_bucket = 'overdue' and p_next <  p_today)
      or (p_bucket = 'today'   and p_next =  p_today)
      or (p_bucket = 'week'    and p_next >= p_today and p_next < p_today + 7)
      or (p_bucket = 'none'    and p_next is null);
$$;

-- ============================================================================
-- 4. NEGÓCIOS
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_opp_filter' and typnamespace = 'public'::regnamespace) then
    create type public.crm_opp_filter as (
      search        text,         -- nulo = sem busca
      search_digits text,         -- só com 6+ dígitos
      search_phone  text,
      created_from  timestamptz,
      created_to    timestamptz,
      owner_ids     uuid[],       -- nulo = sem filtro; vazio + owner_none = só sem dono
      owner_none    boolean,
      stage_ids     uuid[],
      statuses      text[],
      origins       text[],
      tags          text[],
      value_min     numeric,
      value_max     numeric,
      next_contact  text,
      today         date,
      custom        jsonb         -- nulo = sem filtro de campo
    );
  end if;
end $$;

create or replace function public._crm_compile_opp_filters(p_filters jsonb)
returns public.crm_opp_filter
language plpgsql
stable
set search_path = public
as $$
declare
  p jsonb := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  r public.crm_opp_filter;
  v_digits text;
begin
  r.search := nullif(btrim(coalesce(p->>'search', '')), '');
  if r.search is not null then
    v_digits := regexp_replace(r.search, '\D', '', 'g');
    if length(v_digits) >= 6 then
      r.search_digits := v_digits;
      r.search_phone  := coalesce(public.normalize_phone_br(r.search), '-');
    end if;
  end if;

  r.created_from := public._crm_try_timestamptz(p->>'created_from');
  r.created_to   := public._crm_try_timestamptz(p->>'created_to');

  if public._crm_jarr_len(p->'owner_ids') > 0 then
    r.owner_ids  := public._crm_uuid_list(p->'owner_ids');
    r.owner_none := p->'owner_ids' ? 'none';
  end if;
  if public._crm_jarr_len(p->'stage_ids') > 0 then
    r.stage_ids := public._crm_uuid_list(p->'stage_ids');
  end if;
  if public._crm_jarr_len(p->'statuses') > 0 then
    r.statuses := public._crm_text_list(p->'statuses');
  end if;
  if public._crm_jarr_len(p->'origin_categories') > 0 then
    r.origins := public._crm_text_list(p->'origin_categories');
  end if;
  if public._crm_jarr_len(p->'tags') > 0 then
    r.tags := public._crm_text_list(p->'tags');
  end if;

  r.value_min := public._crm_try_numeric(p->>'value_min');
  r.value_max := public._crm_try_numeric(p->>'value_max');

  if p->>'next_contact' in ('overdue', 'today', 'week', 'none') then
    r.next_contact := p->>'next_contact';
  end if;
  r.today := (now() at time zone 'America/Sao_Paulo')::date;

  if public._crm_jarr_len(p->'custom') > 0 then
    r.custom := p->'custom';
  end if;
  return r;
end;
$$;

create or replace function public._crm_opp_matches_c(
  o public.opportunities,
  l public.leads,
  f public.crm_opp_filter
)
returns boolean
language sql
stable
as $$
  select public._crm_search_c(l, f.search, f.search_digits, f.search_phone)
    and (f.created_from is null or o.created_at >= f.created_from)
    and (f.created_to   is null or o.created_at <  f.created_to)
    and (f.owner_ids is null
         or (o.owner_id is null and coalesce(f.owner_none, false))
         or (o.owner_id is not null and o.owner_id = any(f.owner_ids)))
    and (f.stage_ids is null or o.stage_id = any(f.stage_ids))
    and (f.statuses  is null or o.status = any(f.statuses))
    and (f.origins   is null or l.origin_category = any(f.origins))
    and (f.tags      is null or l.tags && f.tags)
    and (f.value_min is null or o.value >= f.value_min)
    and (f.value_max is null or o.value <= f.value_max)
    and public._crm_next_contact_c(l.next_contact, f.next_contact, f.today)
    and (f.custom is null or public._crm_custom_matches(o.custom_data, f.custom));
$$;

-- O contrato: mesma assinatura da Onda 1, para filtrar um negócio avulso.
create or replace function public.crm_opp_matches(
  o public.opportunities,
  l public.leads,
  p_filters jsonb
)
returns boolean
language sql
stable
set search_path = public
as $$
  select public._crm_opp_matches_c(o, l, public._crm_compile_opp_filters(p_filters));
$$;

comment on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) is
  'Sprint 11: a única implementação dos filtros de negócio do CRM. Chaves de p_filters: search, created_from, created_to, owner_ids ("none" = sem responsável), stage_ids, statuses, origin_categories, tags, value_min, value_max, next_contact (overdue|today|week|none), custom ([{field_id, op, values|value|from|to}]). Chave ausente = sem filtro. As RPCs usam o caminho compilado (_crm_compile_opp_filters + _crm_opp_matches_c).';

-- O resumo do Kanban no caminho compilado. Mesma assinatura e saída da Onda 1.
create or replace function public.crm_board_summary(
  p_pipeline_id uuid,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with f as materialized (
    select public._crm_compile_opp_filters(p_filters) as c
  ),
  agg as (
    select o.stage_id,
           count(*)::int            as n,
           coalesce(sum(o.value), 0) as v
      from public.opportunities o
      left join public.leads l on l.id = o.lead_id
      cross join f
     where o.pipeline_id = p_pipeline_id
       and o.deleted_at is null
       and public._crm_opp_matches_c(o, l, f.c)
     group by o.stage_id
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'stage_id',  s.id,
               'count',     coalesce(a.n, 0),
               'value_sum', coalesce(a.v, 0)
             )
             order by s.position, s.id
           ),
           '[]'::jsonb
         )
    from public.pipeline_stages_v2 s
    left join agg a on a.stage_id = s.id
   where s.pipeline_id = p_pipeline_id
     and s.deleted_at is null;
$$;

-- ============================================================================
-- 5. CONTATOS — a situação vem dos negócios
-- ============================================================================

-- cliente (algum ganho) > negociando (algum aberto) > perdido (só perdidos) >
-- sem_negocio. Só negócios não apagados. Na Onda 3 a situação passa a vir da
-- receita; o nome e os valores ficam.
create or replace function public._crm_lead_relationship(p_lead_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.opportunities o
                  where o.lead_id = p_lead_id and o.deleted_at is null and o.status = 'won')  then 'cliente'
    when exists (select 1 from public.opportunities o
                  where o.lead_id = p_lead_id and o.deleted_at is null and o.status = 'open') then 'negociando'
    when exists (select 1 from public.opportunities o
                  where o.lead_id = p_lead_id and o.deleted_at is null and o.status = 'lost') then 'perdido'
    else 'sem_negocio'
  end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_lead_filter' and typnamespace = 'public'::regnamespace) then
    create type public.crm_lead_filter as (
      search          text,
      search_digits   text,
      search_phone    text,
      created_from    timestamptz,
      created_to      timestamptz,
      origins         text[],
      tags            text[],
      next_contact    text,
      today           date,
      relationship    text[],
      pipeline_ids    uuid[],
      deal_owner_ids  uuid[],     -- nulo = sem filtro
      deal_owner_none boolean
    );
  end if;
end $$;

create or replace function public._crm_compile_lead_filters(p_filters jsonb)
returns public.crm_lead_filter
language plpgsql
stable
set search_path = public
as $$
declare
  p jsonb := case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end;
  r public.crm_lead_filter;
  v_digits text;
begin
  r.search := nullif(btrim(coalesce(p->>'search', '')), '');
  if r.search is not null then
    v_digits := regexp_replace(r.search, '\D', '', 'g');
    if length(v_digits) >= 6 then
      r.search_digits := v_digits;
      r.search_phone  := coalesce(public.normalize_phone_br(r.search), '-');
    end if;
  end if;

  r.created_from := public._crm_try_timestamptz(p->>'created_from');
  r.created_to   := public._crm_try_timestamptz(p->>'created_to');

  if public._crm_jarr_len(p->'origin_categories') > 0 then
    r.origins := public._crm_text_list(p->'origin_categories');
  end if;
  if public._crm_jarr_len(p->'tags') > 0 then
    r.tags := public._crm_text_list(p->'tags');
  end if;
  if p->>'next_contact' in ('overdue', 'today', 'week', 'none') then
    r.next_contact := p->>'next_contact';
  end if;
  r.today := (now() at time zone 'America/Sao_Paulo')::date;

  if public._crm_jarr_len(p->'relationship') > 0 then
    r.relationship := public._crm_text_list(p->'relationship');
  end if;
  if public._crm_jarr_len(p->'pipeline_ids') > 0 then
    r.pipeline_ids := public._crm_uuid_list(p->'pipeline_ids');
  end if;
  if public._crm_jarr_len(p->'deal_owner_ids') > 0 then
    r.deal_owner_ids  := public._crm_uuid_list(p->'deal_owner_ids');
    r.deal_owner_none := p->'deal_owner_ids' ? 'none';
  end if;
  return r;
end;
$$;

-- Um contato contra o filtro compilado. Os dados dos negócios do contato
-- (situação, linhas, donos) chegam prontos: a tabela os calcula numa passada só
-- por opportunities, em vez de três subconsultas por contato.
create or replace function public._crm_lead_matches_c(
  l public.leads,
  f public.crm_lead_filter,
  p_relationship text,
  p_pipelines uuid[],
  p_owners uuid[],
  p_unowned boolean
)
returns boolean
language sql
stable
as $$
  select public._crm_search_c(l, f.search, f.search_digits, f.search_phone)
    and (f.created_from is null or l.created_at >= f.created_from)
    and (f.created_to   is null or l.created_at <  f.created_to)
    and (f.origins is null or l.origin_category = any(f.origins))
    and (f.tags    is null or l.tags && f.tags)
    and public._crm_next_contact_c(l.next_contact, f.next_contact, f.today)
    and (f.relationship is null or p_relationship = any(f.relationship))
    and (f.pipeline_ids is null or coalesce(p_pipelines && f.pipeline_ids, false))
    and (f.deal_owner_ids is null
         or (coalesce(f.deal_owner_none, false) and coalesce(p_unowned, false))
         or coalesce(p_owners && f.deal_owner_ids, false));
$$;

-- O contrato para um contato avulso.
create or replace function public.crm_lead_matches(l public.leads, p_filters jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  select public._crm_lead_matches_c(
           l,
           public._crm_compile_lead_filters(p_filters),
           public._crm_lead_relationship(l.id),
           (select array_agg(distinct o.pipeline_id) from public.opportunities o
             where o.lead_id = l.id and o.deleted_at is null),
           (select array_agg(distinct o.owner_id) from public.opportunities o
             where o.lead_id = l.id and o.deleted_at is null and o.owner_id is not null),
           coalesce((select bool_or(o.owner_id is null) from public.opportunities o
                      where o.lead_id = l.id and o.deleted_at is null), false)
         );
$$;

comment on function public.crm_lead_matches(public.leads, jsonb) is
  'Sprint 11: a única implementação dos filtros da Base de Contatos. Chaves: search, created_from, created_to, origin_categories, tags, next_contact, relationship (sem_negocio|negociando|cliente|perdido), pipeline_ids, deal_owner_ids ("none" = tem negócio sem responsável). O contato não tem responsável próprio: o filtro de responsável olha os negócios. As RPCs usam o caminho compilado (_crm_compile_lead_filters + _crm_lead_matches_c).';

-- A situação e os filtros por negócio procuram negócios por lead_id. O índice
-- existente (equipe_id, lead_id) não serve para lead_id sozinho.
create index if not exists idx_opportunities_lead_active
  on public.opportunities (lead_id)
  where deleted_at is null;

-- ============================================================================
-- 6. PERMISSÕES
-- ============================================================================

revoke all on function public._crm_is_empty(jsonb) from public, anon;
revoke all on function public._crm_try_numeric(text) from public, anon;
revoke all on function public._crm_cast_timestamptz(text) from public, anon;
revoke all on function public._crm_try_timestamptz(text) from public, anon;
revoke all on function public._crm_uuid_list(jsonb) from public, anon;
revoke all on function public._crm_text_list(jsonb) from public, anon;
revoke all on function public._crm_custom_matches(jsonb, jsonb) from public, anon;
revoke all on function public._crm_search_c(public.leads, text, text, text) from public, anon;
revoke all on function public._crm_next_contact_c(date, text, date) from public, anon;
revoke all on function public._crm_compile_opp_filters(jsonb) from public, anon;
revoke all on function public._crm_opp_matches_c(public.opportunities, public.leads, public.crm_opp_filter) from public, anon;
revoke all on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) from public, anon;
revoke all on function public.crm_board_summary(uuid, jsonb) from public, anon;
revoke all on function public._crm_lead_relationship(uuid) from public, anon;
revoke all on function public._crm_compile_lead_filters(jsonb) from public, anon;
revoke all on function public._crm_lead_matches_c(public.leads, public.crm_lead_filter, text, uuid[], uuid[], boolean) from public, anon;
revoke all on function public.crm_lead_matches(public.leads, jsonb) from public, anon;

grant execute on function public._crm_is_empty(jsonb) to authenticated;
grant execute on function public._crm_try_numeric(text) to authenticated;
grant execute on function public._crm_cast_timestamptz(text) to authenticated;
grant execute on function public._crm_try_timestamptz(text) to authenticated;
grant execute on function public._crm_uuid_list(jsonb) to authenticated;
grant execute on function public._crm_text_list(jsonb) to authenticated;
grant execute on function public._crm_custom_matches(jsonb, jsonb) to authenticated;
grant execute on function public._crm_search_c(public.leads, text, text, text) to authenticated;
grant execute on function public._crm_next_contact_c(date, text, date) to authenticated;
grant execute on function public._crm_compile_opp_filters(jsonb) to authenticated;
grant execute on function public._crm_opp_matches_c(public.opportunities, public.leads, public.crm_opp_filter) to authenticated;
grant execute on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) to authenticated;
grant execute on function public.crm_board_summary(uuid, jsonb) to authenticated;
grant execute on function public._crm_lead_relationship(uuid) to authenticated;
grant execute on function public._crm_compile_lead_filters(jsonb) to authenticated;
grant execute on function public._crm_lead_matches_c(public.leads, public.crm_lead_filter, text, uuid[], uuid[], boolean) to authenticated;
grant execute on function public.crm_lead_matches(public.leads, jsonb) to authenticated;
