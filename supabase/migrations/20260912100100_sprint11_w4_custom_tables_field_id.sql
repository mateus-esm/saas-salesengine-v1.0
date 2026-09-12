-- Sprint 11 · Onda 4 · T39 — tabelas personalizadas em field_id + página no servidor
-- (decisão 22).
--
-- As tabelas personalizadas passam ao contrato dos campos do pipeline (Onda 1 ·
-- T8): cada coluna tem um `field_id` que não muda; o valor mora em
-- `data[field_id]`; a `key` é o nome público, usado só nas bordas (payload do
-- botão de automação, formulário público). Renomear coluna nunca mais toca em dado.
--
-- CONVERSÃO (achado 27: uma tabela só na produção, "Teste", 1 coluna, 2 registros)
-- _crm_custom_tables_to_field_id(): dá `field_id` a toda coluna que não tem e leva
-- junto os valores (data[key] → data[field_id]), os vínculos
-- (custom_table_links.relation_key) e o campo de exibição das relações (a key da
-- coluna alvo → o field_id dela). Idempotente. Roda uma vez aqui; o ensaio chama a
-- mesma função.
--
-- Coluna nova sem field_id ganha um no banco (gatilho) — a tela já manda o dela.
--
-- PÁGINA NO SERVIDOR: crm_custom_table_page / crm_custom_table_count, com busca
-- em texto (sem curinga: strpos) e ordenação pelo tipo da coluna, sem SQL
-- dinâmico (o mesmo padrão de crm_opp_table).

-- ============================================================================
-- 1. A CONVERSÃO
-- ============================================================================

create or replace function public._crm_custom_tables_to_field_id()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t         record;
  c         jsonb;
  v_new     jsonb;
  v_map     jsonb;
  v_fid     text;
  v_target  text;
  v_changed boolean;
  v_n       integer := 0;
begin
  -- 1) field_id em toda coluna; valores e vínculos seguem o mapa key → field_id.
  --    O mapa cobre toda coluna (não só as que ganharam field_id agora): uma tela
  --    antiga que ainda grava por key depois da migration também é recolhida ao
  --    rodar a conversão de novo. Se o registro já tem data[field_id], ele vence
  --    e a key fica como está.
  for t in select ct.id, ct.equipe_id, ct.slug, ct.table_schema from public.custom_tables ct
            where jsonb_typeof(ct.table_schema) = 'array' loop
    v_new := '[]'::jsonb;
    v_map := '{}'::jsonb;
    for c in select e.value from jsonb_array_elements(t.table_schema) e loop
      v_fid := nullif(c->>'field_id', '');
      if v_fid is null then
        v_fid := gen_random_uuid()::text;
        c := c || jsonb_build_object('field_id', v_fid);
      end if;
      v_new := v_new || jsonb_build_array(c);
      if nullif(c->>'key', '') is not null and c->>'key' <> v_fid then
        v_map := v_map || jsonb_build_object(c->>'key', v_fid);
      end if;
    end loop;

    if v_new is distinct from t.table_schema then
      update public.custom_tables ct set table_schema = v_new where ct.id = t.id;
      v_n := v_n + 1;
    end if;

    if v_map <> '{}'::jsonb then
      update public.custom_table_records r
         set data = (select coalesce(jsonb_object_agg(
                              case when v_map ? e.key and not r.data ? (v_map->>e.key)
                                   then v_map->>e.key else e.key end, e.value), '{}'::jsonb)
                       from jsonb_each(r.data) e)
       where r.table_id = t.id
         and exists (select 1 from jsonb_object_keys(r.data) k
                      where v_map ? k and not r.data ? (v_map->>k));

      update public.custom_table_links l
         set relation_key = v_map->>l.relation_key
       where l.equipe_id = t.equipe_id
         and l.from_table = t.slug
         and v_map ? l.relation_key;
    end if;
  end loop;

  -- 2) O campo de exibição de uma relação passa a ser o field_id da coluna alvo.
  for t in select ct.id, ct.table_schema from public.custom_tables ct
            where jsonb_typeof(ct.table_schema) = 'array' loop
    v_new := '[]'::jsonb;
    v_changed := false;
    for c in select e.value from jsonb_array_elements(t.table_schema) e loop
      if c->>'type' = 'relation' and nullif(c->'relationConfig'->>'targetTableId', '') is not null then
        select tc->>'field_id' into v_target
          from public.custom_tables tt, jsonb_array_elements(tt.table_schema) tc
         where tt.id = (c->'relationConfig'->>'targetTableId')::uuid
           and tc->>'key' = c->'relationConfig'->>'displayField'
           and nullif(tc->>'field_id', '') is not null
         limit 1;
        if v_target is not null then
          c := jsonb_set(c, '{relationConfig,displayField}', to_jsonb(v_target));
          v_changed := true;
        end if;
      end if;
      v_new := v_new || jsonb_build_array(c);
    end loop;
    if v_changed then
      update public.custom_tables ct set table_schema = v_new where ct.id = t.id;
    end if;
  end loop;

  return v_n;
end;
$$;

revoke all on function public._crm_custom_tables_to_field_id() from public, anon, authenticated;

select public._crm_custom_tables_to_field_id();

-- ============================================================================
-- 2. COLUNA NOVA SEM field_id GANHA UM
-- ============================================================================

create or replace function public.fn_custom_table_schema_field_ids()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(new.table_schema) = 'array'
     and exists (select 1 from jsonb_array_elements(new.table_schema) c where nullif(c->>'field_id', '') is null) then
    new.table_schema := (
      select coalesce(jsonb_agg(
               case when nullif(c->>'field_id', '') is null
                    then c || jsonb_build_object('field_id', gen_random_uuid()::text)
                    else c end
               order by ord), '[]'::jsonb)
        from jsonb_array_elements(new.table_schema) with ordinality x(c, ord)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_custom_table_schema_field_ids on public.custom_tables;
create trigger trg_custom_table_schema_field_ids
  before insert or update of table_schema on public.custom_tables
  for each row execute function public.fn_custom_table_schema_field_ids();

-- ============================================================================
-- 3. A PÁGINA NO SERVIDOR
-- ============================================================================

create or replace function public._crm_custom_table_rows(p_table_id uuid, p_search text)
returns setof public.custom_table_records
language sql
stable
set search_path = public
as $$
  select r.*
    from public.custom_table_records r
   where r.table_id = p_table_id
     and r.deleted_at is null
     and (nullif(btrim(p_search), '') is null
          or exists (select 1 from jsonb_each_text(r.data) e
                      where strpos(lower(e.value), lower(btrim(p_search))) > 0));
$$;

-- A linha que a página devolve. Função própria para as tarefas seguintes da onda
-- acrescentarem o que a linha carrega (negócio, status, consultas) sem reescrever
-- a página.
create or replace function public._crm_custom_table_row_json(p public.custom_table_records)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
           'id', p.id, 'equipe_id', p.equipe_id, 'table_id', p.table_id, 'data', p.data,
           'created_at', p.created_at, 'updated_at', p.updated_at);
$$;

create or replace function public.crm_custom_table_page(
  p_table_id uuid,
  p_search   text default null,
  p_sort     jsonb default null,
  p_limit    int default 50,
  p_offset   int default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with s as (
    select nullif(p_sort->>'field_id', '') as fid,
           case when lower(coalesce(p_sort->>'dir', '')) = 'desc' then 'desc' else 'asc' end as dir
  ),
  col as (
    select (select c->>'type'
              from public.custom_tables t, jsonb_array_elements(t.table_schema) c
             where t.id = p_table_id and c->>'field_id' = s.fid
             limit 1) as type,
           s.fid, s.dir
      from s
  ),
  keyed as (
    select r.*,
           case when col.type in ('number', 'currency') then public._crm_try_numeric(r.data->>col.fid) end as sk_num,
           case when col.type = 'date' then public._crm_try_timestamptz(r.data->>col.fid) end as sk_ts,
           case when col.fid is not null and coalesce(col.type, 'text') not in ('number', 'currency', 'date')
                then lower(r.data->>col.fid) end as sk_text,
           col.fid, col.dir
      from public._crm_custom_table_rows(p_table_id, p_search) r
      cross join col
  ),
  ranked as (
    select k.id,
           row_number() over (order by
             case when k.dir = 'asc'  then k.sk_num  end asc  nulls last,
             case when k.dir = 'desc' then k.sk_num  end desc nulls last,
             case when k.dir = 'asc'  then k.sk_ts   end asc  nulls last,
             case when k.dir = 'desc' then k.sk_ts   end desc nulls last,
             case when k.dir = 'asc'  then k.sk_text end asc  nulls last,
             case when k.dir = 'desc' then k.sk_text end desc nulls last,
             k.created_at asc, k.id asc) as rn
      from keyed k
  )
  select coalesce(jsonb_agg(public._crm_custom_table_row_json(rec) order by r.rn), '[]'::jsonb)
    from ranked r
    join public.custom_table_records rec on rec.id = r.id
   where r.rn > greatest(p_offset, 0)
     and r.rn <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 500);
$$;

create or replace function public.crm_custom_table_count(p_table_id uuid, p_search text default null)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::int from public._crm_custom_table_rows(p_table_id, p_search);
$$;

revoke all on function public._crm_custom_table_row_json(public.custom_table_records) from public, anon;
grant execute on function public._crm_custom_table_row_json(public.custom_table_records) to authenticated;
revoke all on function public._crm_custom_table_rows(uuid, text) from public, anon;
revoke all on function public.crm_custom_table_page(uuid, text, jsonb, int, int) from public, anon;
revoke all on function public.crm_custom_table_count(uuid, text) from public, anon;
grant execute on function public._crm_custom_table_rows(uuid, text) to authenticated;
grant execute on function public.crm_custom_table_page(uuid, text, jsonb, int, int) to authenticated;
grant execute on function public.crm_custom_table_count(uuid, text) to authenticated;
