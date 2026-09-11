-- 20260911000200_sprint11_w2_tables.sql
-- Sprint 11 · Onda 2 · T13 — as tabelas vêm do servidor, e escrita em lote vira
-- verbo de negócio (motores de Consulta e de Automação).
--
-- O QUE ESTAVA ERRADO
--
-- A Tabela de Leads e a Base de Contatos carregavam a base inteira no navegador
-- (paliativo do T5) e completavam cada linha com consultas à parte: a coluna
-- Empresa fazia uma consulta POR LINHA (~1.260 na Solo Energia) e o resumo de
-- empresas/imóveis mandava ~1.250 UUIDs na URL. As ações em massa usavam
-- `.in('id', ids)` — ids na URL de novo.
--
-- O QUE ESTE ARQUIVO ENTREGA
--
--   _crm_card_json          o card do Kanban num lugar só; crm_board_stage e a
--                           tabela de negócios usam o mesmo, então a linha da
--                           tabela É o card.
--   crm_opp_table           a Tabela de Leads: página de negócios, filtrada pelo
--                           mesmo crm_opp_matches do Kanban e ordenada no servidor.
--   crm_contacts_table      a Base de Contatos: página de contatos com a situação,
--   crm_contacts_count      os números e os negócios de cada um.
--   verbos de negócio       crm_update_opportunities, crm_delete_opportunities,
--                           crm_delete_leads, crm_create_opportunities — ids no
--                           corpo do POST. A tela usa agora; automação, Copilot e
--                           MCP usam os mesmos depois (motores_revops.md §4.4).
--
-- ORDENAÇÃO SEM SQL DINÂMICO
--
-- A chave de ordenação vem da URL. Nada dela vira texto de SQL: cada linha ganha
-- três chaves calculadas (número, data, texto) conforme a chave pedida, e o ORDER
-- BY usa `case` por direção. Chave desconhecida cai no padrão (criado em, desc).
-- `cf:<field_id>` lê o tipo no custom_fields_schema do pipeline — número/moeda
-- ordenam como número, data como data, texto/url/telefone/seleção como texto; os
-- outros tipos não ordenam (mesma regra do registro de tipos do frontend).
-- Nulos sempre no fim; o id desempata, então página 1 e página 2 nunca se repetem.
--
-- SEGURANÇA: tudo security invoker — a RLS faz o recorte de tenant. A Base de
-- Contatos também filtra pela equipe de quem chama: sem pipeline no pedido, a
-- RLS sozinha deixaria um super admin ver os contatos de todos os tenants.

-- ============================================================================
-- 1. O CARD, NUM LUGAR SÓ
-- ============================================================================

create or replace function public._crm_card_json(
  o public.opportunities,
  l public.leads,
  p_has_icp boolean,
  p_owner_name text
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select to_jsonb(o) || jsonb_build_object(
    'lead', case when l.id is null then null else jsonb_build_object(
      'id',              l.id,
      'name',            l.name,
      'phone',           l.phone,
      'email',           l.email,
      'next_contact',    l.next_contact,
      'tags',            to_jsonb(coalesce(l.tags, array[]::text[])),
      'origin_category', l.origin_category,
      'source',          l.source,
      'responsible_id',  l.responsible_id
    ) end,
    'owner_name',       p_owner_name,
    'touchpoint_count', (select count(*)::int from public.touchpoints tp where tp.lead_id = o.lead_id),
    'icp_score',        sc.icp,
    'velocity',         sc.vel,
    'lead_score',       case
                          when sc.icp is null and sc.vel is null then null
                          else least(10, greatest(0, round(((coalesce(sc.icp, 0) + coalesce(sc.vel, 0)) / 2.0) / 10.0)))::int
                        end,
    'companies',        coalesce((
                          select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                            from public.opportunity_links ol
                            join public.companies c on c.id = ol.linked_id and c.deleted_at is null
                           where ol.opportunity_id = o.id
                             and ol.linked_type = 'company'
                             and ol.deleted_at is null
                        ), '[]'::jsonb)
  )
  from (
    select
      case when coalesce(p_has_icp, false) and o.lead_id is not null
           then (select s.score from public.fn_calculate_icp_score(o.lead_id) s)
      end as icp,
      case when exists (select 1 from public.lead_activities a where a.lead_id = o.lead_id)
           then public.fn_calculate_lead_velocity(o.lead_id)
      end as vel
  ) sc;
$$;

-- O quadro passa a montar o card pela função acima. Mesma assinatura, mesma saída
-- (o teste da Onda 1 roda sobre esta versão).
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
  with f as materialized (
    select public._crm_compile_opp_filters(p_filters) as c
  ),
  team as (
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
      cross join f
     where o.pipeline_id = p_pipeline_id
       and o.stage_id = p_stage_id
       and o.deleted_at is null
       and public._crm_opp_matches_c(o, l, f.c)
     -- position empata em massa (a importação deixou 1.259 negócios em 0):
     -- updated_at e id garantem que página 1 e página 2 nunca se repetem.
     order by o.position asc, o.updated_at desc, o.id
     limit greatest(1, least(coalesce(p_limit, 30), 200))
     offset greatest(0, coalesce(p_offset, 0))
  )
  select coalesce(
           jsonb_agg(
             public._crm_card_json(
               pg.o,
               pg.l,
               (select v from has_icp),
               (select t.nome_completo from team t where t.id = (pg.o).owner_id)
             )
             order by (pg.o).position asc, (pg.o).updated_at desc, (pg.o).id
           ),
           '[]'::jsonb
         )
    from page pg;
$$;

-- ============================================================================
-- 2. A TABELA DE NEGÓCIOS
-- ============================================================================

create or replace function public.crm_opp_table(
  p_pipeline_id uuid,
  p_filters jsonb default '{}'::jsonb,
  p_sort jsonb default '{"key":"created_at","dir":"desc"}'::jsonb,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with f as materialized (
    select public._crm_compile_opp_filters(p_filters) as c
  ),
  team as (
    select m.id, m.nome_completo from public.crm_team_members() m
  ),
  has_icp as (
    select public._crm_jarr_len(p.icp_weights) > 0 as v
      from public.pipelines p
     where p.id = p_pipeline_id
  ),
  req as (
    select coalesce(nullif(coalesce(p_sort, '{}'::jsonb)->>'key', ''), 'created_at') as k,
           case when lower(coalesce(p_sort, '{}'::jsonb)->>'dir') = 'asc' then 'asc' else 'desc' end as d
  ),
  -- O tipo do campo quando a chave é cf:<field_id>.
  cf as (
    select fld->>'field_id' as field_id, fld->>'type' as type
      from public.pipelines p
      cross join req
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(p.custom_fields_schema) = 'array' then p.custom_fields_schema else '[]'::jsonb end
      ) fld
     where p.id = p_pipeline_id
       and req.k like 'cf:%'
       and fld->>'field_id' = substring(req.k from 4)
       and coalesce((fld->>'is_deleted')::boolean, false) = false
     limit 1
  ),
  -- A chave efetiva: uma da lista, ou um campo que ordena; senão o padrão.
  eff as (
    select case when ok then req.k else 'created_at' end as k,
           case when ok then req.d else 'desc' end as d,
           (select cf.field_id from cf) as cf_id,
           (select cf.type from cf) as cf_type
      from req,
           lateral (select req.k in ('created_at', 'updated_at', 'value', 'stage', 'stage_entered_at',
                                     'closed_at', 'lead_name', 'owner_name', 'next_contact')
                        or exists (select 1 from cf
                                    where cf.type in ('number', 'currency', 'date', 'text', 'url', 'phone', 'select'))
                        as ok) chk
  ),
  base as (
    select o, l, s.position as stage_pos,
           (select t.nome_completo from team t where t.id = o.owner_id) as owner_name
      from public.opportunities o
      left join public.leads l on l.id = o.lead_id
      left join public.pipeline_stages_v2 s on s.id = o.stage_id
      cross join f
     where o.pipeline_id = p_pipeline_id
       and o.deleted_at is null
       and public._crm_opp_matches_c(o, l, f.c)
  ),
  keyed as (
    select b.o, b.l, b.owner_name, e.d,
           case e.k
             when 'value' then (b.o).value
             when 'stage' then b.stage_pos::numeric
             else case when e.k like 'cf:%' and e.cf_type in ('number', 'currency')
                       then public._crm_try_numeric((b.o).custom_data->>e.cf_id) end
           end as sk_num,
           case e.k
             when 'created_at'       then (b.o).created_at
             when 'updated_at'       then (b.o).updated_at
             when 'stage_entered_at' then (b.o).stage_entered_at
             when 'closed_at'        then (b.o).closed_at
             when 'next_contact'     then (b.l).next_contact::timestamptz
             else case when e.k like 'cf:%' and e.cf_type = 'date'
                       then public._crm_try_timestamptz((b.o).custom_data->>e.cf_id) end
           end as sk_ts,
           case e.k
             when 'lead_name'  then lower((b.l).name)
             when 'owner_name' then lower(b.owner_name)
             else case when e.k like 'cf:%' and e.cf_type in ('text', 'url', 'phone', 'select')
                       then lower((b.o).custom_data->>e.cf_id) end
           end as sk_text
      from base b
      cross join eff e
  ),
  ranked as (
    select k.*,
           row_number() over (
             order by
               case when k.d = 'asc'  then k.sk_num  end asc  nulls last,
               case when k.d = 'desc' then k.sk_num  end desc nulls last,
               case when k.d = 'asc'  then k.sk_ts   end asc  nulls last,
               case when k.d = 'desc' then k.sk_ts   end desc nulls last,
               case when k.d = 'asc'  then k.sk_text end asc  nulls last,
               case when k.d = 'desc' then k.sk_text end desc nulls last,
               (k.o).id
           ) as rn
      from keyed k
  ),
  page as (
    select r.*
      from ranked r
     where r.rn >  greatest(0, coalesce(p_offset, 0))
       and r.rn <= greatest(0, coalesce(p_offset, 0)) + greatest(1, least(coalesce(p_limit, 50), 200))
  )
  select coalesce(
           jsonb_agg(
             public._crm_card_json(pg.o, pg.l, (select v from has_icp), pg.owner_name)
               || jsonb_build_object(
                    'property_count',
                    (select count(*)::int
                       from public.property_owner_links pol
                      where pol.owner_type = 'contact'
                        and pol.owner_id = (pg.o).lead_id
                        and pol.deleted_at is null)
                  )
             order by pg.rn
           ),
           '[]'::jsonb
         )
    from page pg;
$$;

-- ============================================================================
-- 3. A BASE DE CONTATOS
-- ============================================================================

-- Os contatos que passam no filtro, com os números dos negócios de cada um. Os
-- negócios da equipe são lidos numa passada só (agregados por contato), em vez de
-- três subconsultas por contato — com a RLS valendo em cada uma, a primeira
-- versão levou 2 s para "clientes" na Solo Energia. Sem SET: a tabela e a contagem
-- usam esta mesma função, e o planner pode embuti-la.
create or replace function public._crm_contacts_base(p_filters jsonb)
returns table (
  l            public.leads,
  relationship text,
  open_count   int,
  won_value    numeric,
  last_won_at  timestamptz
)
language sql
stable
as $$
  with me as (
    select p.equipe_id from public.profiles p where p.id = auth.uid()
  ),
  f as materialized (
    select public._crm_compile_lead_filters(p_filters) as c
  ),
  agg as materialized (
    select o.lead_id,
           case
             when bool_or(o.status = 'won')  then 'cliente'
             when bool_or(o.status = 'open') then 'negociando'
             when bool_or(o.status = 'lost') then 'perdido'
             else 'sem_negocio'
           end as relationship,
           (count(*) filter (where o.status = 'open'))::int as open_count,
           coalesce(sum(o.value) filter (where o.status = 'won'), 0) as won_value,
           max(o.closed_at) filter (where o.status = 'won') as last_won_at,
           array_agg(distinct o.pipeline_id) as pipelines,
           array_agg(distinct o.owner_id) filter (where o.owner_id is not null) as owners,
           bool_or(o.owner_id is null) as unowned
      from public.opportunities o
     where o.equipe_id = (select equipe_id from me)
       and o.deleted_at is null
     group by o.lead_id
  )
  select ld,
         coalesce(a.relationship, 'sem_negocio'),
         coalesce(a.open_count, 0),
         coalesce(a.won_value, 0),
         a.last_won_at
    from public.leads ld
    cross join f
    left join agg a on a.lead_id = ld.id
   where ld.equipe_id = (select equipe_id from me)
     and ld.deleted_at is null
     and public._crm_lead_matches_c(
           ld, f.c,
           coalesce(a.relationship, 'sem_negocio'),
           a.pipelines,
           a.owners,
           coalesce(a.unowned, false)
         );
$$;

create or replace function public.crm_contacts_table(
  p_filters jsonb default '{}'::jsonb,
  p_sort jsonb default '{"key":"created_at","dir":"desc"}'::jsonb,
  p_limit int default 50,
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
  req as (
    select coalesce(nullif(coalesce(p_sort, '{}'::jsonb)->>'key', ''), 'created_at') as k,
           case when lower(coalesce(p_sort, '{}'::jsonb)->>'dir') = 'asc' then 'asc' else 'desc' end as d
  ),
  eff as (
    select case when ok then req.k else 'created_at' end as k,
           case when ok then req.d else 'desc' end as d
      from req,
           lateral (select req.k in ('created_at', 'name', 'last_message_at', 'won_value', 'last_won_at', 'next_contact') as ok) chk
  ),
  keyed as (
    select b.*, e.d,
           case e.k when 'won_value' then b.won_value end as sk_num,
           case e.k
             when 'created_at'      then (b.l).created_at
             when 'last_message_at' then (b.l).last_message_at
             when 'last_won_at'     then b.last_won_at
             when 'next_contact'    then (b.l).next_contact::timestamptz
           end as sk_ts,
           case e.k when 'name' then lower((b.l).name) end as sk_text
      from public._crm_contacts_base(p_filters) b
      cross join eff e
  ),
  ranked as (
    select k.*,
           row_number() over (
             order by
               case when k.d = 'asc'  then k.sk_num  end asc  nulls last,
               case when k.d = 'desc' then k.sk_num  end desc nulls last,
               case when k.d = 'asc'  then k.sk_ts   end asc  nulls last,
               case when k.d = 'desc' then k.sk_ts   end desc nulls last,
               case when k.d = 'asc'  then k.sk_text end asc  nulls last,
               case when k.d = 'desc' then k.sk_text end desc nulls last,
               (k.l).id
           ) as rn
      from keyed k
  ),
  page as (
    select r.*
      from ranked r
     where r.rn >  greatest(0, coalesce(p_offset, 0))
       and r.rn <= greatest(0, coalesce(p_offset, 0)) + greatest(1, least(coalesce(p_limit, 50), 200))
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',                   (pg.l).id,
               'equipe_id',            (pg.l).equipe_id,
               'name',                 (pg.l).name,
               'phone',                (pg.l).phone,
               'email',                (pg.l).email,
               'origin_category',      (pg.l).origin_category,
               'channel',              (pg.l).channel,
               'tags',                 to_jsonb(coalesce((pg.l).tags, array[]::text[])),
               'observations',         (pg.l).observations,
               'created_at',           (pg.l).created_at,
               'last_message_at',      (pg.l).last_message_at,
               'next_contact',         (pg.l).next_contact,
               'personal_custom_data', coalesce((pg.l).personal_custom_data, '{}'::jsonb),
               'company_name',         (select c.name
                                          from public.contact_company_links ccl
                                          join public.companies c on c.id = ccl.company_id and c.deleted_at is null
                                         where ccl.contact_id = (pg.l).id
                                           and ccl.deleted_at is null
                                         order by ccl.is_primary desc nulls last, ccl.created_at asc
                                         limit 1),
               'property_count',       (select count(*)::int
                                          from public.property_owner_links pol
                                         where pol.owner_type = 'contact'
                                           and pol.owner_id = (pg.l).id
                                           and pol.deleted_at is null),
               'relationship',         pg.relationship,
               'open_count',           pg.open_count,
               'won_value',            pg.won_value,
               'last_won_at',          pg.last_won_at,
               'deals',                coalesce((
                                         select jsonb_agg(d.j order by d.open_first, d.recent desc, d.id)
                                           from (
                                             select jsonb_build_object(
                                                      'id',            o.id,
                                                      'pipeline_id',   o.pipeline_id,
                                                      'pipeline_name', pl.name,
                                                      'stage_id',      o.stage_id,
                                                      'stage_name',    s.name,
                                                      'stage_color',   s.color,
                                                      'status',        o.status,
                                                      'value',         o.value,
                                                      'owner_id',      o.owner_id,
                                                      'owner_name',    (select t.nome_completo from team t where t.id = o.owner_id)
                                                    ) as j,
                                                    case when o.status = 'open' then 0 else 1 end as open_first,
                                                    coalesce(o.closed_at, o.updated_at, o.created_at) as recent,
                                                    o.id
                                               from public.opportunities o
                                               left join public.pipelines pl on pl.id = o.pipeline_id
                                               left join public.pipeline_stages_v2 s on s.id = o.stage_id
                                              where o.lead_id = (pg.l).id
                                                and o.deleted_at is null
                                              order by open_first, recent desc, o.id
                                              limit 10
                                           ) d
                                       ), '[]'::jsonb)
             )
             order by pg.rn
           ),
           '[]'::jsonb
         )
    from page pg;
$$;

create or replace function public.crm_contacts_count(p_filters jsonb default '{}'::jsonb)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int from public._crm_contacts_base(p_filters);
$$;

-- ============================================================================
-- 4. VERBOS DE NEGÓCIO
-- ============================================================================

-- Mover etapa e/ou trocar responsável de vários negócios. Só estas duas chaves:
-- qualquer outra é recusada, para que o verbo nunca vire um "update genérico".
-- A etapa só move negócios da linha dela; responsável de outra equipe é recusado
-- pelo trigger do T2 (owner_not_in_team). Devolve quantos mudaram.
create or replace function public.crm_update_opportunities(p_ids uuid[], p_patch jsonb)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_patch     jsonb := coalesce(p_patch, '{}'::jsonb);
  v_key       text;
  v_has_stage boolean;
  v_has_owner boolean;
  v_stage     uuid;
  v_owner     uuid;
  v_n         int;
begin
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'invalid_patch: o patch precisa ser um objeto' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(v_patch) loop
    if v_key not in ('stage_id', 'owner_id') then
      raise exception 'invalid_patch_key: %', v_key using errcode = '22023';
    end if;
  end loop;

  v_has_stage := v_patch ? 'stage_id';
  v_has_owner := v_patch ? 'owner_id';
  if not v_has_stage and not v_has_owner then
    return 0;
  end if;

  if v_has_stage then
    v_stage := nullif(v_patch->>'stage_id', '')::uuid;
    if v_stage is null then
      raise exception 'invalid_patch: stage_id nao pode ser nulo' using errcode = '22023';
    end if;
  end if;
  if v_has_owner then
    v_owner := nullif(v_patch->>'owner_id', '')::uuid;
  end if;

  update public.opportunities o
     set stage_id = case when v_has_stage then v_stage else o.stage_id end,
         owner_id = case when v_has_owner then v_owner else o.owner_id end
   where o.id = any(coalesce(p_ids, array[]::uuid[]))
     and o.deleted_at is null
     and (not v_has_stage or exists (
           select 1 from public.pipeline_stages_v2 s
            where s.id = v_stage
              and s.pipeline_id = o.pipeline_id
              and s.deleted_at is null))
     and ((v_has_stage and o.stage_id is distinct from v_stage)
          or (v_has_owner and o.owner_id is distinct from v_owner));

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Apagar é soft delete, como no resto do app.
create or replace function public.crm_delete_opportunities(p_ids uuid[])
returns int
language sql
set search_path = public
as $$
  with d as (
    update public.opportunities o
       set deleted_at = now()
     where o.id = any(coalesce(p_ids, array[]::uuid[]))
       and o.deleted_at is null
    returning 1
  )
  select count(*)::int from d;
$$;

create or replace function public.crm_delete_leads(p_ids uuid[])
returns int
language sql
set search_path = public
as $$
  with d as (
    update public.leads l
       set deleted_at = now()
     where l.id = any(coalesce(p_ids, array[]::uuid[]))
       and l.deleted_at is null
    returning 1
  )
  select count(*)::int from d;
$$;

-- Um negócio por contato numa linha: na etapa informada ou na primeira etapa
-- aberta. Pula quem já tem negócio aberto nessa linha (um contato pode ter vários
-- negócios, mas o lote não duplica sem querer). O responsável vem do trigger do
-- T2. Devolve {created, skipped}.
create or replace function public.crm_create_opportunities(
  p_lead_ids uuid[],
  p_pipeline_id uuid,
  p_stage_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_equipe  uuid;
  v_stage   uuid;
  v_total   int;
  v_created int;
begin
  select p.equipe_id into v_equipe
    from public.pipelines p
   where p.id = p_pipeline_id and p.deleted_at is null;
  if v_equipe is null then
    raise exception 'unknown_pipeline: %', p_pipeline_id using errcode = '22023';
  end if;

  if p_stage_id is not null then
    select s.id into v_stage
      from public.pipeline_stages_v2 s
     where s.id = p_stage_id and s.pipeline_id = p_pipeline_id and s.deleted_at is null;
    if v_stage is null then
      raise exception 'stage_not_in_pipeline: %', p_stage_id using errcode = '22023';
    end if;
  else
    select s.id into v_stage
      from public.pipeline_stages_v2 s
     where s.pipeline_id = p_pipeline_id and s.deleted_at is null and s.stage_type = 'open'
     order by s.position, s.id
     limit 1;
    if v_stage is null then
      raise exception 'pipeline_without_open_stage: %', p_pipeline_id using errcode = '22023';
    end if;
  end if;

  select count(distinct x) into v_total
    from unnest(coalesce(p_lead_ids, array[]::uuid[])) x;

  with target as (
    select distinct l.id
      from public.leads l
     where l.id = any(coalesce(p_lead_ids, array[]::uuid[]))
       and l.deleted_at is null
       and l.equipe_id = v_equipe
       and not exists (
         select 1 from public.opportunities o
          where o.lead_id = l.id
            and o.pipeline_id = p_pipeline_id
            and o.deleted_at is null
            and o.status = 'open'
       )
  ),
  ins as (
    insert into public.opportunities (equipe_id, lead_id, pipeline_id, stage_id)
    select v_equipe, t.id, p_pipeline_id, v_stage from target t
    returning 1
  )
  select count(*) into v_created from ins;

  return jsonb_build_object('created', v_created, 'skipped', v_total - v_created);
end;
$$;

-- ============================================================================
-- 5. PERMISSÕES
-- ============================================================================

revoke all on function public._crm_card_json(public.opportunities, public.leads, boolean, text) from public, anon;
revoke all on function public.crm_board_stage(uuid, uuid, jsonb, int, int) from public, anon;
revoke all on function public.crm_opp_table(uuid, jsonb, jsonb, int, int) from public, anon;
revoke all on function public._crm_contacts_base(jsonb) from public, anon;
revoke all on function public.crm_contacts_table(jsonb, jsonb, int, int) from public, anon;
revoke all on function public.crm_contacts_count(jsonb) from public, anon;
revoke all on function public.crm_update_opportunities(uuid[], jsonb) from public, anon;
revoke all on function public.crm_delete_opportunities(uuid[]) from public, anon;
revoke all on function public.crm_delete_leads(uuid[]) from public, anon;
revoke all on function public.crm_create_opportunities(uuid[], uuid, uuid) from public, anon;

grant execute on function public._crm_card_json(public.opportunities, public.leads, boolean, text) to authenticated;
grant execute on function public.crm_board_stage(uuid, uuid, jsonb, int, int) to authenticated;
grant execute on function public.crm_opp_table(uuid, jsonb, jsonb, int, int) to authenticated;
grant execute on function public._crm_contacts_base(jsonb) to authenticated;
grant execute on function public.crm_contacts_table(jsonb, jsonb, int, int) to authenticated;
grant execute on function public.crm_contacts_count(jsonb) to authenticated;
grant execute on function public.crm_update_opportunities(uuid[], jsonb) to authenticated;
grant execute on function public.crm_delete_opportunities(uuid[]) to authenticated;
grant execute on function public.crm_delete_leads(uuid[]) to authenticated;
grant execute on function public.crm_create_opportunities(uuid[], uuid, uuid) to authenticated;
