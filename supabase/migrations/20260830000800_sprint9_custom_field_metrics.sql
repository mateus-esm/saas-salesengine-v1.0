-- 20260830000800_sprint9_custom_field_metrics.sql
-- Sprint 9 · T9 — the client's OWN fields on the dashboard.
--
-- The Vision: "each client has your own data with personalized fields, jsonb,
-- tables, tasks — it's necessary look to this field and have the option to show
-- this fields or not". This is that: group and sum by a field the client
-- invented, without anybody writing SQL for their tenant.
--
-- THE WHOLE PROBLEM IS THE WHITELIST
--
-- The naive version takes a field key from the browser and drops it into a
-- jsonb path. That is an arbitrary-read primitive with a dropdown in front of
-- it: `custom_data ->> $1` where $1 is user-controlled reads ANY key in that
-- jsonb, including whatever an integration parked there — internal ids, notes,
-- pricing, a webhook payload someone stored whole.
--
-- So a field is addressable here only if the tenant DECLARED it in
-- pipelines.custom_fields_schema. The function looks the key up in that schema
-- first and refuses anything not found. The schema is the tenant's own list of
-- fields, so this is not a restriction the client will ever feel — it just
-- means the dashboard cannot be used as a jsonb dumping-ground reader.
--
-- Notice also what is NOT dynamic: there is no EXECUTE, no string
-- concatenation, no format(%I). The key is a VALUE passed to the `->>`
-- operator, never part of the query text. Even if the whitelist were somehow
-- bypassed, there is no SQL to inject into.
--
-- WHICH FIELDS MAKE SENSE
--
--   group_by  — text, select, boolean: things with a small set of values.
--               Grouping by a free-text note produces one bucket per row.
--   sum       — number, currency only. Summing text is a coercion error waiting
--               for the one row where somebody typed "a combinar".
--
-- The function enforces the pairing rather than trusting the UI to.

begin;

-- ============================================================================
-- 1. WHAT CAN THIS TENANT EVEN CHART?
--
-- Feeds the widget's field picker. Returns only fields the tenant declared,
-- already filtered to the ones that can be grouped or summed, so the UI never
-- offers a choice the RPC would refuse.
-- ============================================================================

create or replace function public.get_custom_field_options()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_equipe uuid;
  v_result jsonb;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(x order by x->>'pipeline_name', x->>'label'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
             'pipeline_id',   pl.id,
             'pipeline_name', pl.name,
             'key',           f->>'key',
             'label',         f->>'label',
             'type',          f->>'type',
             'groupable',     (f->>'type') in ('text','select','boolean','multi_select'),
             'summable',      (f->>'type') in ('number','currency')
           ) as x
      from public.pipelines pl
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(pl.custom_fields_schema) = 'array'
             then pl.custom_fields_schema else '[]'::jsonb end
      ) f
     where pl.equipe_id = v_equipe
       and pl.deleted_at is null
       and pl.is_archived = false
       and coalesce((f->>'is_deleted')::boolean, false) = false
       and (f->>'type') in ('text','select','boolean','multi_select','number','currency')
  ) s;

  return v_result;
end;
$$;

revoke all on function public.get_custom_field_options() from public;
grant execute on function public.get_custom_field_options() to authenticated;

comment on function public.get_custom_field_options() is
  'Sprint 9: the custom fields this tenant declared that can be charted. The dashboard field picker reads this, so it can only ever offer keys get_custom_field_breakdown() will accept.';

-- ============================================================================
-- 2. THE BREAKDOWN
--
-- p_agg: 'count'  — how many opportunities per value of the field
--        'sum'    — total of a numeric field, grouped by the field itself
--        'value'  — opportunity VALUE summed, grouped by the field
--
-- 'value' is the one clients actually want most of the time ("quanto de receita
-- veio de cada Segmento?") and it is the reason this is not just a count.
-- ============================================================================

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

  -- Enforce the pairing the UI is supposed to respect. Summing a text field is
  -- a cast error on the first row somebody filled in by hand.
  if p_agg = 'sum' and v_type not in ('number', 'currency') then
    raise exception 'field_not_summable: % is %', p_field_key, v_type using errcode = '22023';
  end if;

  with scoped as (
    select o.id, o.value, o.status,
           -- The key is a VALUE here, never query text. No EXECUTE, no format().
           coalesce(nullif(trim(o.custom_data ->> p_field_key), ''), 'Não informado') as bucket
      from public.opportunities o
      join public.leads l on l.id = o.lead_id
     where o.equipe_id = v_equipe
       and o.deleted_at is null
       and l.deleted_at is null
       and o.created_at >= p_from
       and o.created_at <  p_to
       and (v_restrict is null or l.responsible_id = v_restrict)
       and (p_pipeline_ids is null or o.pipeline_id = any(p_pipeline_ids))
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
             when 'value' then coalesce(sum(sc.value), 0)
             -- 'sum' re-reads the field as a number. The whitelist already
             -- guaranteed the declared type is numeric; the regex guards the
             -- row where an older import wrote "1.200,00" into it, so one bad
             -- row cannot 500 the whole dashboard.
             else coalesce(sum(
               case when (sc.bucket ~ '^-?[0-9]+(\.[0-9]+)?$')
                    then sc.bucket::numeric else 0 end), 0)
           end as v
      from scoped sc
     group by bucket
  ) g;

  return v_result;
end;
$$;

revoke all on function public.get_custom_field_breakdown(text, timestamptz, timestamptz, text, uuid[]) from public;
grant execute on function public.get_custom_field_breakdown(text, timestamptz, timestamptz, text, uuid[]) to authenticated;

comment on function public.get_custom_field_breakdown(text, timestamptz, timestamptz, text, uuid[]) is
  'Sprint 9: group opportunities by one of the tenant''s own custom fields. The field key is validated against pipelines.custom_fields_schema before use and is passed as a VALUE to ->>, never interpolated into SQL.';

commit;
