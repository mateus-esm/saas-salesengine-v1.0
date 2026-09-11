-- 20260911000100_sprint11_w2_filters.sql
-- Sprint 11 · Onda 2 · T12 — filtros v2 no servidor (motor de Consulta).
--
-- O QUE ESTE ARQUIVO ENTREGA
--
-- A Onda 1 criou crm_opp_matches: o único lugar que decide se um negócio passa
-- nos filtros do CRM. Esta migration estende o mesmo contrato, sem criar um
-- segundo:
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
-- A busca (nome, e-mail, telefone digitado de qualquer jeito) sai de dentro de
-- crm_opp_matches para _crm_search_matches, e passa a servir negócio e contato.
--
-- NADA QUE VEM DO CLIENTE DERRUBA A CONSULTA
--
-- O filtro chega da URL, e o valor gravado em custom_data chega de qualquer
-- escritor (tela, webhook, importação). Então: operador desconhecido = filtro
-- ignorado; valor gravado que não converte = não bate; ponta de intervalo que não
-- converte = ponta ausente. As datas e valores dos filtros nativos (criado em,
-- valor) passam pelas mesmas conversões seguras.
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
set search_path = public
as $$
  select v is null
      or jsonb_typeof(v) = 'null'
      or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
      or v = '[]'::jsonb
      or v = '{}'::jsonb;
$$;

-- Conversões que devolvem null em vez de erro.
create or replace function public._crm_try_numeric(p text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  return btrim(p)::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public._crm_try_timestamptz(p text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  return btrim(p)::timestamptz;
exception when others then
  return null;
end;
$$;

-- ============================================================================
-- 2. CAMPO PERSONALIZADO
-- ============================================================================

-- Um filtro: {"field_id": ..., "op": ..., "values"?: [...], "value"?: "...",
-- "from"?: ..., "to"?: ...}. O valor lido é custom_data[field_id] (o endereço
-- único do contrato dos campos, T8).
create or replace function public._crm_custom_match(p_data jsonb, p_filter jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  with f as (
    select p_filter->>'op' as op,
           coalesce(p_data, '{}'::jsonb) -> (p_filter->>'field_id') as v
  )
  select coalesce(
    case f.op
      when 'empty'     then public._crm_is_empty(f.v)
      when 'not_empty' then not public._crm_is_empty(f.v)

      -- seleção, usuário: o valor está na lista. multi-seleção: algum item está.
      when 'any_of' then
        case
          when public._crm_jarr_len(p_filter->'values') = 0 then true
          when jsonb_typeof(f.v) = 'array' then exists (
            select 1 from jsonb_array_elements_text(f.v) x(item)
             where p_filter->'values' ? x.item
          )
          when jsonb_typeof(f.v) in ('string', 'number', 'boolean') then p_filter->'values' ? (f.v #>> '{}')
          else false
        end

      -- texto, url, telefone: pedaço do texto, sem diferenciar maiúsculas.
      when 'contains' then
        case
          when nullif(btrim(coalesce(p_filter->>'value', '')), '') is null then true
          when jsonb_typeof(f.v) in ('string', 'number') then
            (f.v #>> '{}') ilike '%' || btrim(p_filter->>'value') || '%'
          else false
        end

      -- número, moeda: from <= v <= to.
      when 'between_number' then
        public._crm_try_numeric(f.v #>> '{}') is not null
        and (public._crm_try_numeric(p_filter->>'from') is null
             or public._crm_try_numeric(f.v #>> '{}') >= public._crm_try_numeric(p_filter->>'from'))
        and (public._crm_try_numeric(p_filter->>'to') is null
             or public._crm_try_numeric(f.v #>> '{}') <= public._crm_try_numeric(p_filter->>'to'))

      -- data: from <= v < to (meio-aberto, como created_from / created_to).
      when 'between_date' then
        public._crm_try_timestamptz(f.v #>> '{}') is not null
        and (public._crm_try_timestamptz(p_filter->>'from') is null
             or public._crm_try_timestamptz(f.v #>> '{}') >= public._crm_try_timestamptz(p_filter->>'from'))
        and (public._crm_try_timestamptz(p_filter->>'to') is null
             or public._crm_try_timestamptz(f.v #>> '{}') < public._crm_try_timestamptz(p_filter->>'to'))

      -- sim/não. Vazio não é "não": para isso existe "empty".
      when 'is_true'  then f.v = 'true'::jsonb  or lower(coalesce(f.v #>> '{}', '')) in ('true', 'sim')
      when 'is_false' then f.v = 'false'::jsonb or lower(coalesce(f.v #>> '{}', '')) in ('false', 'nao', 'não')

      -- operador desconhecido (ou filtro malformado): ignorado.
      else true
    end,
    false)
  from f;
$$;

-- Todos os filtros de campo juntos (E). Lista ausente ou que não é lista = sem filtro.
create or replace function public._crm_custom_matches(p_data jsonb, p_custom jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  select public._crm_jarr_len(p_custom) = 0
      or not exists (
        select 1
          from jsonb_array_elements(p_custom) f
         where not public._crm_custom_match(p_data, f)
      );
$$;

-- ============================================================================
-- 3. PRÓXIMO CONTATO — no dia de São Paulo
-- ============================================================================

-- leads.next_contact é DATE. "Hoje" é o dia de São Paulo, não o do servidor
-- (UTC): às 22h de Fortaleza o servidor já está no dia seguinte.
create or replace function public._crm_next_contact_matches(p_next date, p_bucket text)
returns boolean
language sql
stable
set search_path = public
as $$
  with t as (select (now() at time zone 'America/Sao_Paulo')::date as today)
  select case coalesce(p_bucket, '')
           when 'overdue' then coalesce(p_next < t.today, false)
           when 'today'   then coalesce(p_next = t.today, false)
           when 'week'    then coalesce(p_next >= t.today and p_next < t.today + 7, false)
           when 'none'    then p_next is null
           else true
         end
    from t;
$$;

-- ============================================================================
-- 4. BUSCA — uma implementação para negócio e contato
-- ============================================================================

-- Pedaço do nome ou do e-mail; ou telefone digitado de qualquer jeito — a
-- comparação é por dígitos contra o telefone normalizado.
create or replace function public._crm_search_matches(l public.leads, p_search text)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    nullif(btrim(coalesce(p_search, '')), '') is null
    or l.name  ilike '%' || btrim(p_search) || '%'
    or l.email ilike '%' || btrim(p_search) || '%'
    or (
      length(regexp_replace(coalesce(p_search, ''), '\D', '', 'g')) >= 6
      and (
        coalesce(l.phone_normalized, '') like
          '%' || regexp_replace(p_search, '\D', '', 'g') || '%'
        or coalesce(l.phone_normalized, '') =
          coalesce(public.normalize_phone_br(p_search), '-')
      )
    );
$$;

-- ============================================================================
-- 5. NEGÓCIOS — crm_opp_matches, mesma assinatura, chaves novas
-- ============================================================================

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
  select
    public._crm_search_matches(l, p_filters->>'search')
    and (public._crm_try_timestamptz(p_filters->>'created_from') is null
         or o.created_at >= public._crm_try_timestamptz(p_filters->>'created_from'))
    and (public._crm_try_timestamptz(p_filters->>'created_to') is null
         or o.created_at <  public._crm_try_timestamptz(p_filters->>'created_to'))
    and (
      public._crm_jarr_len(p_filters->'owner_ids') = 0
      or (o.owner_id is null     and p_filters->'owner_ids' ? 'none')
      or (o.owner_id is not null and p_filters->'owner_ids' ? o.owner_id::text)
    )
    and (public._crm_jarr_len(p_filters->'stage_ids') = 0 or p_filters->'stage_ids' ? o.stage_id::text)
    and (public._crm_jarr_len(p_filters->'statuses')  = 0 or p_filters->'statuses'  ? o.status)
    and (
      public._crm_jarr_len(p_filters->'origin_categories') = 0
      or p_filters->'origin_categories' ? l.origin_category
    )
    and (
      public._crm_jarr_len(p_filters->'tags') = 0
      or l.tags && array(select jsonb_array_elements_text(p_filters->'tags'))
    )
    and (public._crm_try_numeric(p_filters->>'value_min') is null
         or o.value >= public._crm_try_numeric(p_filters->>'value_min'))
    and (public._crm_try_numeric(p_filters->>'value_max') is null
         or o.value <= public._crm_try_numeric(p_filters->>'value_max'))
    and public._crm_next_contact_matches(l.next_contact, p_filters->>'next_contact')
    and public._crm_custom_matches(o.custom_data, p_filters->'custom');
$$;

comment on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) is
  'Sprint 11: a única implementação dos filtros de negócio do CRM. Chaves de p_filters: search, created_from, created_to, owner_ids ("none" = sem responsável), stage_ids, statuses, origin_categories, tags, value_min, value_max, next_contact (overdue|today|week|none), custom ([{field_id, op, values|value|from|to}]). Chave ausente = sem filtro.';

-- ============================================================================
-- 6. CONTATOS — a situação vem dos negócios
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

create or replace function public.crm_lead_matches(l public.leads, p_filters jsonb)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    public._crm_search_matches(l, p_filters->>'search')
    and (public._crm_try_timestamptz(p_filters->>'created_from') is null
         or l.created_at >= public._crm_try_timestamptz(p_filters->>'created_from'))
    and (public._crm_try_timestamptz(p_filters->>'created_to') is null
         or l.created_at <  public._crm_try_timestamptz(p_filters->>'created_to'))
    and (
      public._crm_jarr_len(p_filters->'origin_categories') = 0
      or p_filters->'origin_categories' ? l.origin_category
    )
    and (
      public._crm_jarr_len(p_filters->'tags') = 0
      or l.tags && array(select jsonb_array_elements_text(p_filters->'tags'))
    )
    and public._crm_next_contact_matches(l.next_contact, p_filters->>'next_contact')
    and (
      public._crm_jarr_len(p_filters->'relationship') = 0
      or p_filters->'relationship' ? public._crm_lead_relationship(l.id)
    )
    and (
      public._crm_jarr_len(p_filters->'pipeline_ids') = 0
      or exists (
        select 1 from public.opportunities o
         where o.lead_id = l.id
           and o.deleted_at is null
           and p_filters->'pipeline_ids' ? o.pipeline_id::text
      )
    )
    and (
      public._crm_jarr_len(p_filters->'deal_owner_ids') = 0
      or exists (
        select 1 from public.opportunities o
         where o.lead_id = l.id
           and o.deleted_at is null
           and (
             (o.owner_id is null     and p_filters->'deal_owner_ids' ? 'none')
             or (o.owner_id is not null and p_filters->'deal_owner_ids' ? o.owner_id::text)
           )
      )
    );
$$;

comment on function public.crm_lead_matches(public.leads, jsonb) is
  'Sprint 11: a única implementação dos filtros da Base de Contatos. Chaves: search, created_from, created_to, origin_categories, tags, next_contact, relationship (sem_negocio|negociando|cliente|perdido), pipeline_ids, deal_owner_ids ("none" = tem negócio sem responsável). O contato não tem responsável próprio: o filtro de responsável olha os negócios.';

-- A situação e os filtros por negócio procuram negócios por lead_id. O índice
-- existente (equipe_id, lead_id) não serve para lead_id sozinho.
create index if not exists idx_opportunities_lead_active
  on public.opportunities (lead_id)
  where deleted_at is null;

-- ============================================================================
-- 7. PERMISSÕES
-- ============================================================================

revoke all on function public._crm_is_empty(jsonb) from public, anon;
revoke all on function public._crm_try_numeric(text) from public, anon;
revoke all on function public._crm_try_timestamptz(text) from public, anon;
revoke all on function public._crm_custom_match(jsonb, jsonb) from public, anon;
revoke all on function public._crm_custom_matches(jsonb, jsonb) from public, anon;
revoke all on function public._crm_next_contact_matches(date, text) from public, anon;
revoke all on function public._crm_search_matches(public.leads, text) from public, anon;
revoke all on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) from public, anon;
revoke all on function public._crm_lead_relationship(uuid) from public, anon;
revoke all on function public.crm_lead_matches(public.leads, jsonb) from public, anon;

grant execute on function public._crm_is_empty(jsonb) to authenticated;
grant execute on function public._crm_try_numeric(text) to authenticated;
grant execute on function public._crm_try_timestamptz(text) to authenticated;
grant execute on function public._crm_custom_match(jsonb, jsonb) to authenticated;
grant execute on function public._crm_custom_matches(jsonb, jsonb) to authenticated;
grant execute on function public._crm_next_contact_matches(date, text) to authenticated;
grant execute on function public._crm_search_matches(public.leads, text) to authenticated;
grant execute on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) to authenticated;
grant execute on function public._crm_lead_relationship(uuid) to authenticated;
grant execute on function public.crm_lead_matches(public.leads, jsonb) to authenticated;
