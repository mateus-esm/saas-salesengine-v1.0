-- 20260910000200_sprint11_crm_board.sql
-- Sprint 11 · T3 — o quadro vem do servidor.
--
-- O QUE ESTAVA ERRADO
--
-- O Kanban carregava o pipeline inteiro no navegador, e a API do Supabase corta
-- toda consulta em 1.000 linhas (max_rows). Na Solo Energia, 259 dos 1.259
-- negócios nunca apareciam, sem erro nenhum. Para desenhar os cards, o Kanban
-- ainda carregava TODOS os leads da equipe (também cortados em 1.000) e disparava
-- duas chamadas de lead score POR lead — umas 2.000 requisições por abertura.
--
-- O QUE ESTE ARQUIVO ENTREGA
--
--   crm_board_summary  uma linha por etapa: quantos negócios e quanto valem,
--                      com os filtros aplicados. É o total VERDADEIRO da coluna.
--   crm_board_stage    uma página de cards de uma etapa, já com tudo que o card
--                      desenha: lead, responsável, touchpoints, score, empresas.
--   crm_lead_scores    scores de uma lista de leads numa chamada só.
--   crm_touchpoint_counts  idem para touchpoints.
--
-- As duas últimas recebem os ids no CORPO do POST (rpc), não na URL: mandar mil
-- UUIDs num `.in()` estourava o tamanho de URL.
--
-- UM LUGAR SÓ PARA OS FILTROS
--
-- crm_opp_matches é a única implementação dos filtros do CRM (busca, período,
-- responsável, etapa, status, origem, etiquetas, valor). Resumo e página usam a
-- mesma função, então a contagem da coluna nunca discorda dos cards que ela
-- mostra. A barra de filtros da Onda 2 só precisa montar o jsonb.
--
-- LEAD SCORE COM NULO HONESTO
--
-- A fórmula é a mesma do computeLeadScore do frontend, mas "sem dado" deixa de
-- virar 0: sem icp_weights no pipeline, o ICP é nulo; sem nenhuma atividade, a
-- velocidade é nula; os dois nulos, o score é nulo. O card esconde o selo em vez
-- de mostrar 0 para todo mundo.
--
-- SEGURANÇA
--
-- Tudo roda como quem chama (security invoker): a RLS de opportunities, leads,
-- pipeline_stages_v2 e touchpoints faz o recorte de tenant, como já faz para o
-- resto do app. O nome do responsável vem de crm_team_members() (T2), porque a
-- RLS de profiles não mostra colegas.

-- ============================================================================
-- 0. UTILITÁRIO
-- ============================================================================

-- Tamanho de um array jsonb, ou 0 para qualquer outra coisa. jsonb_array_length
-- explode num escalar, e um filtro mal montado não pode derrubar o Kanban.
create or replace function public._crm_jarr_len(j jsonb)
returns int
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(j) = 'array' then jsonb_array_length(j) else 0 end;
$$;

-- ============================================================================
-- 1. OS FILTROS
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
    -- Busca: pedaço do nome ou do e-mail; ou telefone digitado de qualquer jeito
    -- — a comparação é por dígitos contra o telefone normalizado.
    (
      nullif(trim(p_filters->>'search'), '') is null
      or l.name  ilike '%' || trim(p_filters->>'search') || '%'
      or l.email ilike '%' || trim(p_filters->>'search') || '%'
      or (
        length(regexp_replace(coalesce(p_filters->>'search', ''), '\D', '', 'g')) >= 6
        and (
          coalesce(l.phone_normalized, '') like
            '%' || regexp_replace(p_filters->>'search', '\D', '', 'g') || '%'
          or coalesce(l.phone_normalized, '') =
            coalesce(public.normalize_phone_br(p_filters->>'search'), '-')
        )
      )
    )
    and (p_filters->>'created_from' is null or o.created_at >= (p_filters->>'created_from')::timestamptz)
    and (p_filters->>'created_to'   is null or o.created_at <  (p_filters->>'created_to')::timestamptz)
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
    and (p_filters->>'value_min' is null or o.value >= (p_filters->>'value_min')::numeric)
    and (p_filters->>'value_max' is null or o.value <= (p_filters->>'value_max')::numeric);
$$;

comment on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) is
  'Sprint 11: a única implementação dos filtros do CRM. Chaves de p_filters: search, created_from, created_to, owner_ids ("none" = sem responsável), stage_ids, statuses, origin_categories, tags, value_min, value_max. Chave ausente = sem filtro.';

-- ============================================================================
-- 2. O RESUMO: o total verdadeiro de cada coluna
-- ============================================================================

create or replace function public.crm_board_summary(
  p_pipeline_id uuid,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with agg as (
    select o.stage_id,
           count(*)::int            as n,
           coalesce(sum(o.value), 0) as v
      from public.opportunities o
      left join public.leads l on l.id = o.lead_id
     where o.pipeline_id = p_pipeline_id
       and o.deleted_at is null
       and public.crm_opp_matches(o, l, coalesce(p_filters, '{}'::jsonb))
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
-- 3. A PÁGINA DE UMA COLUNA
-- ============================================================================

create or replace function public.crm_board_stage(
  p_pipeline_id uuid,
  p_stage_id uuid,
  p_filters jsonb default '{}'::jsonb,
  p_limit int default 30,
  p_offset int default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with team as (
    select m.id, m.nome_completo from public.crm_team_members() m
  ),
  has_icp as (
    select public._crm_jarr_len(p.icp_weights) > 0 as v
      from public.pipelines p
     where p.id = p_pipeline_id
  ),
  page as (
    select o, l
      from public.opportunities o
      left join public.leads l on l.id = o.lead_id
     where o.pipeline_id = p_pipeline_id
       and o.stage_id = p_stage_id
       and o.deleted_at is null
       and public.crm_opp_matches(o, l, coalesce(p_filters, '{}'::jsonb))
     -- position empata em massa (a importação deixou 1.259 negócios em 0):
     -- updated_at e id garantem que página 1 e página 2 nunca se repetem.
     order by o.position asc, o.updated_at desc, o.id
     limit greatest(1, least(coalesce(p_limit, 30), 200))
     offset greatest(0, coalesce(p_offset, 0))
  ),
  scored as (
    select pg.o,
           pg.l,
           case
             when coalesce((select v from has_icp), false) and (pg.o).lead_id is not null
               then (select s.score from public.fn_calculate_icp_score((pg.o).lead_id) s)
           end as icp,
           case
             when exists (select 1 from public.lead_activities a where a.lead_id = (pg.o).lead_id)
               then public.fn_calculate_lead_velocity((pg.o).lead_id)
           end as vel
      from page pg
  )
  select coalesce(
           jsonb_agg(
             to_jsonb(s.o) || jsonb_build_object(
               'lead', case when (s.l).id is null then null else jsonb_build_object(
                 'id',              (s.l).id,
                 'name',            (s.l).name,
                 'phone',           (s.l).phone,
                 'email',           (s.l).email,
                 'next_contact',    (s.l).next_contact,
                 'tags',            to_jsonb(coalesce((s.l).tags, array[]::text[])),
                 'origin_category', (s.l).origin_category,
                 'source',          (s.l).source,
                 'responsible_id',  (s.l).responsible_id
               ) end,
               'owner_name',       (select t.nome_completo from team t where t.id = (s.o).owner_id),
               'touchpoint_count', (select count(*)::int from public.touchpoints tp where tp.lead_id = (s.o).lead_id),
               'icp_score',        s.icp,
               'velocity',         s.vel,
               'lead_score',       case
                                     when s.icp is null and s.vel is null then null
                                     else least(10, greatest(0, round(((coalesce(s.icp, 0) + coalesce(s.vel, 0)) / 2.0) / 10.0)))::int
                                   end,
               'companies',        coalesce((
                                     select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                                       from public.opportunity_links ol
                                       join public.companies c on c.id = ol.linked_id and c.deleted_at is null
                                      where ol.opportunity_id = (s.o).id
                                        and ol.linked_type = 'company'
                                        and ol.deleted_at is null
                                   ), '[]'::jsonb)
             )
             order by (s.o).position asc, (s.o).updated_at desc, (s.o).id
           ),
           '[]'::jsonb
         )
    from scored s;
$$;

-- ============================================================================
-- 4. EM LOTE: scores e touchpoints de uma lista de leads
-- ============================================================================

create or replace function public.crm_lead_scores(p_lead_ids uuid[])
returns jsonb
language sql
stable
set search_path = public
as $$
  with target as (
    select l.id,
           exists (
             select 1
               from public.opportunities o
               join public.pipelines p on p.id = o.pipeline_id
              where o.lead_id = l.id
                and o.deleted_at is null
                and public._crm_jarr_len(p.icp_weights) > 0
           ) as has_icp,
           exists (select 1 from public.lead_activities a where a.lead_id = l.id) as has_activity
      from public.leads l
     where l.id = any(coalesce(p_lead_ids, array[]::uuid[]))
       and l.deleted_at is null
  ),
  scored as (
    select t.id,
           case when t.has_icp then (select s.score from public.fn_calculate_icp_score(t.id) s) end as icp,
           case when t.has_activity then public.fn_calculate_lead_velocity(t.id) end as vel
      from target t
  )
  select coalesce(
           jsonb_object_agg(
             s.id,
             jsonb_build_object(
               'icp_score',  s.icp,
               'velocity',   s.vel,
               'lead_score', case
                               when s.icp is null and s.vel is null then null
                               else least(10, greatest(0, round(((coalesce(s.icp, 0) + coalesce(s.vel, 0)) / 2.0) / 10.0)))::int
                             end
             )
           ),
           '{}'::jsonb
         )
    from scored s;
$$;

create or replace function public.crm_touchpoint_counts(p_lead_ids uuid[])
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(x.lead_id, x.n), '{}'::jsonb)
    from (
      select t.lead_id, count(*)::int as n
        from public.touchpoints t
       where t.lead_id = any(coalesce(p_lead_ids, array[]::uuid[]))
       group by t.lead_id
    ) x;
$$;

-- ============================================================================
-- 5. PERMISSÕES
-- ============================================================================

revoke all on function public._crm_jarr_len(jsonb) from public, anon;
revoke all on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) from public, anon;
revoke all on function public.crm_board_summary(uuid, jsonb) from public, anon;
revoke all on function public.crm_board_stage(uuid, uuid, jsonb, int, int) from public, anon;
revoke all on function public.crm_lead_scores(uuid[]) from public, anon;
revoke all on function public.crm_touchpoint_counts(uuid[]) from public, anon;

grant execute on function public._crm_jarr_len(jsonb) to authenticated;
grant execute on function public.crm_opp_matches(public.opportunities, public.leads, jsonb) to authenticated;
grant execute on function public.crm_board_summary(uuid, jsonb) to authenticated;
grant execute on function public.crm_board_stage(uuid, uuid, jsonb, int, int) to authenticated;
grant execute on function public.crm_lead_scores(uuid[]) to authenticated;
grant execute on function public.crm_touchpoint_counts(uuid[]) to authenticated;
