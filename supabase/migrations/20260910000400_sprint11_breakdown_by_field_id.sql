-- 20260910000400_sprint11_breakdown_by_field_id.sql
-- Sprint 11 · T8 — o dashboard lê o campo onde o app grava.
--
-- O card, a tabela e o formulário gravam o valor de um campo personalizado em
-- custom_data[field_id]. A quebra por campo da Sprint 9 lia custom_data->>key.
-- Resultado: todo valor digitado no app caía em "Não informado" — conferido
-- contra a função em produção em 10/09.
--
-- O endereço do valor é o field_id (decisão da Sprint 11). A chave continua
-- sendo o nome público do campo — é por ela que o dashboard escolhe o campo —,
-- e a leitura cai para custom_data->>key quando o field_id não tem nada, porque
-- importações e webhooks antigos gravaram lá.
--
-- Uma chave pode existir em mais de um pipeline da equipe, com field_ids
-- diferentes. O field_id certo é o do pipeline de cada negócio.
--
-- MULTI-SELEÇÃO
--
-- Um campo de seleção múltipla guarda um array. `->>` o transformava num balde
-- chamado '["Placas","Inversor"]'. Agora cada valor do array é um balde, e o
-- negócio conta uma vez em cada um — "receita por produto" é justamente a
-- pergunta que a Solo Energia vai fazer do campo "Produto de interesse".
--
-- Mesma assinatura, mesmo whitelist, mesma regra de não-injeção: a chave e o
-- field_id são VALORES passados a ->, nunca texto de query.

create or replace function public.get_custom_field_breakdown(
  p_field_key text,
  p_from      timestamptz,
  p_to        timestamptz,
  p_agg       text default 'count',
  p_pipeline_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe   uuid;
  v_restrict uuid;
  v_type     text;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_equipe, v_restrict from public._funnel_scope() s;

  if p_agg not in ('count', 'sum', 'value') then
    raise exception 'invalid_agg: %', p_agg using errcode = '22023';
  end if;

  -- THE WHITELIST. The key must be one this tenant declared, in a pipeline this
  -- tenant owns. Anything else is refused before it can reach a jsonb path.
  select f->>'type' into v_type
    from public.pipelines pl
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(pl.custom_fields_schema) = 'array'
           then pl.custom_fields_schema else '[]'::jsonb end
    ) f
   where pl.equipe_id = v_equipe
     and pl.deleted_at is null
     and f->>'key' = p_field_key
     and coalesce((f->>'is_deleted')::boolean, false) = false
   limit 1;

  if v_type is null then
    raise exception 'unknown_field: % is not declared in this tenant''s pipeline schema', p_field_key
      using errcode = '22023';
  end if;

  if p_agg = 'sum' and v_type not in ('number', 'currency') then
    raise exception 'field_not_summable: % is %', p_field_key, v_type using errcode = '22023';
  end if;

  with field_ids as (
    -- The field_id of this key in each of the tenant's pipelines.
    select pl.id as pipeline_id, f->>'field_id' as field_id
      from public.pipelines pl
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(pl.custom_fields_schema) = 'array'
             then pl.custom_fields_schema else '[]'::jsonb end
      ) f
     where pl.equipe_id = v_equipe
       and pl.deleted_at is null
       and f->>'key' = p_field_key
       and coalesce((f->>'is_deleted')::boolean, false) = false
  ),
  scoped as (
    select o.id, o.value,
           -- field_id first (where the app writes), the key as fallback (older
           -- imports and webhooks). Values, never query text.
           coalesce(
             case when fi.field_id is not null
                   and o.custom_data -> fi.field_id is not null
                   and o.custom_data -> fi.field_id <> 'null'::jsonb
                  then o.custom_data -> fi.field_id end,
             o.custom_data -> p_field_key
           ) as raw
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
      left join field_ids fi on fi.pipeline_id = o.pipeline_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and l.deleted_at is null
       and o.created_at >= p_from
       and o.created_at <  p_to
       and (v_restrict is null or l.responsible_id = v_restrict)
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
  ),
  bucketed as (
    -- One row per (deal, value). A multi-select array gives one row per item;
    -- anything else gives one row. DISTINCT: a repeated item counts once.
    select distinct sc.id, sc.value,
           coalesce(nullif(trim(x.item), ''), 'Não informado') as bucket
      from scoped sc
      cross join lateral (
        select a.item
          from jsonb_array_elements_text(
                 case when jsonb_typeof(sc.raw) = 'array' then sc.raw else '[]'::jsonb end
               ) as a(item)
        union all
        select case when sc.raw is null or jsonb_typeof(sc.raw) in ('array', 'null') then null
                    else sc.raw #>> '{}' end
         where sc.raw is null
            or jsonb_typeof(sc.raw) <> 'array'
            or jsonb_array_length(sc.raw) = 0
      ) x
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('label', bucket, 'value', round(v, 2), 'count', n)
           order by v desc, n desc, bucket
         ), '[]'::jsonb)
    into v_result
  from (
    select bucket,
           count(*) as n,
           case p_agg
             when 'count' then count(*)::numeric
             when 'value' then coalesce(sum(b.value), 0)
             -- 'sum' re-reads the field as a number. The whitelist guaranteed
             -- the declared type is numeric; the regex guards the row where an
             -- older import wrote "1.200,00", so one bad row cannot 500 the
             -- whole dashboard.
             else coalesce(sum(
               case when (b.bucket ~ '^-?[0-9]+(\.[0-9]+)?$')
                    then b.bucket::numeric else 0 end), 0)
           end as v
      from bucketed b
     group by bucket
  ) g;

  return v_result;
end;
$$;

revoke all on function public.get_custom_field_breakdown(text, timestamptz, timestamptz, text, uuid[]) from public;
grant execute on function public.get_custom_field_breakdown(text, timestamptz, timestamptz, text, uuid[]) to authenticated;

comment on function public.get_custom_field_breakdown(text, timestamptz, timestamptz, text, uuid[]) is
  'Sprint 11: group opportunities by one of the tenant''s own custom fields. The key is validated against pipelines.custom_fields_schema; the value is read from custom_data[field_id] (falling back to custom_data[key]); multi-select values count once per item. Key and field_id are passed as VALUES to ->, never interpolated into SQL.';
