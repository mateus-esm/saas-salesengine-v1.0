alter table public.opportunities add column title text;
alter table public.tasks add column opportunity_id uuid references public.opportunities(id) on delete set null;
create index tasks_opportunity_idx on public.tasks(opportunity_id) where opportunity_id is not null;
alter table public.agenda_events drop constraint agenda_events_type_check,
  add constraint agenda_events_type_check check (length(trim(type)) between 1 and 80),
  add column scheduled_from_card boolean not null default false;
create unique index agenda_card_pending on public.agenda_events(opportunity_id)
  where scheduled_from_card and deleted_at is null and outcome is null;

-- All writers, including imports, must link records to the same contact and team.
create function public.crm_validate_agenda_link() returns trigger
language plpgsql set search_path = public as $$
declare deal public.opportunities;
begin
  if tg_op = 'UPDATE' and old.outcome is not null and old.opportunity_id is distinct from new.opportunity_id
     and exists (select 1 from opportunities where id=old.opportunity_id) then
    raise exception 'Desfaça o desfecho antes de trocar a oportunidade';
  end if;
  if new.opportunity_id is not null then
    select * into deal from opportunities where id=new.opportunity_id and deleted_at is null;
    if not found or deal.equipe_id <> new.equipe_id then raise exception 'Oportunidade inválida'; end if;
    new.lead_id := deal.lead_id;
  end if;
  return new;
end $$;
create trigger crm_validate_agenda_link before insert or update of opportunity_id, lead_id, equipe_id on public.agenda_events
for each row execute function public.crm_validate_agenda_link();

create function public.crm_validate_task_link() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.opportunity_id is not null and not exists (
    select 1 from opportunities o join leads l on l.id=o.lead_id and l.equipe_id=o.equipe_id
     where o.id=new.opportunity_id and o.lead_id=new.lead_id and o.deleted_at is null
  ) then raise exception 'A oportunidade deve pertencer ao contato da tarefa'; end if;
  return new;
end $$;
create trigger crm_validate_task_link before insert or update of opportunity_id, lead_id on public.tasks
for each row execute function public.crm_validate_task_link();

create function public.crm_find_deals(q text default '', contact uuid default null, selected uuid default null)
returns table(id uuid, lead_id uuid, label text) language sql stable set search_path = public as $$
  select o.id,o.lead_id,concat_ws(' · ',coalesce(nullif(trim(o.title),''),nullif(l.name,''),l.phone,'Oportunidade'),p.name,right(o.id::text,6))
    from opportunities o join leads l on l.id=o.lead_id join pipelines p on p.id=o.pipeline_id
   where o.equipe_id=(select equipe_id from profiles where id=auth.uid()) and o.deleted_at is null
     and (contact is null or o.lead_id=contact)
     and (selected is null or o.id=selected)
     and (q='' or concat_ws(' ',o.title,l.name,l.phone,p.name,o.id::text) ilike '%'||left(q,100)||'%')
   order by o.updated_at desc,o.id limit 30;
$$;
revoke all on function public.crm_find_deals(text,uuid,uuid) from public,anon;
grant execute on function public.crm_find_deals(text,uuid,uuid) to authenticated;

create table public.crm_builtin_tables (
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  slug text not null check(slug in ('companies','properties')),
  enabled boolean not null,
  primary key(equipe_id,slug)
);
alter table public.crm_builtin_tables enable row level security;
grant select,insert,update on public.crm_builtin_tables to authenticated;
create policy read_team_templates on public.crm_builtin_tables for select to authenticated
using (equipe_id=(select equipe_id from public.profiles where id=auth.uid()));
create policy manage_team_templates on public.crm_builtin_tables for all to authenticated
using (equipe_id=(select equipe_id from public.profiles where id=auth.uid()) and
  (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'super_admin')))
with check (equipe_id=(select equipe_id from public.profiles where id=auth.uid()) and
  (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'super_admin')));

-- Scheduling from the pipeline's meeting fields updates the outstanding calendar entry.
create function public.crm_calendar_from_fields() returns trigger
language plpgsql set search_path=public as $$
declare flag_key text; date_key text; scheduled boolean; date_text text; start_at timestamptz;
begin
  if tg_op='UPDATE' and old.custom_data is not distinct from new.custom_data then return new; end if;
  select max(f->>'field_id') filter(where lower(f->>'label')='reunião agendada' and f->>'type'='boolean'),
         max(f->>'field_id') filter(where lower(f->>'label') in ('data da reunião','data reunião') and f->>'type' in ('date','datetime'))
    into flag_key,date_key from pipelines p cross join lateral jsonb_array_elements(p.custom_fields_schema) f
   where p.id=new.pipeline_id and coalesce((f->>'is_deleted')::boolean,false)=false;
  if flag_key is null or date_key is null then return new; end if;
  if tg_op='UPDATE' and old.custom_data->flag_key is not distinct from new.custom_data->flag_key
    and old.custom_data->date_key is not distinct from new.custom_data->date_key then return new; end if;
  scheduled := coalesce(new.custom_data->>flag_key,'false')='true';
  date_text := nullif(new.custom_data->>date_key,'');
  if not scheduled or date_text is null then
    update agenda_events set deleted_at=now() where opportunity_id=new.id and scheduled_from_card and outcome is null and deleted_at is null;
    return new;
  end if;
  start_at := case when length(date_text)=10 then (date_text::date + time '09:00') at time zone 'America/Fortaleza' else date_text::timestamptz end;
  insert into agenda_events(equipe_id,lead_id,opportunity_id,title,type,starts_at,ends_at,scheduled_from_card)
    values(new.equipe_id,new.lead_id,new.id,'Reunião · '||coalesce(new.title,(select name from leads where id=new.lead_id),'Oportunidade'),
           'meeting',start_at,start_at+interval '1 hour',true)
    on conflict(opportunity_id) where scheduled_from_card and deleted_at is null and outcome is null
    do update set starts_at=excluded.starts_at,ends_at=excluded.starts_at+(agenda_events.ends_at-agenda_events.starts_at);
  return new;
end $$;
create trigger crm_calendar_from_fields after insert or update of custom_data on public.opportunities
for each row execute function public.crm_calendar_from_fields();

-- Keep the existing ten points per activity and two points of daily decay.
create function public.crm_engagement_velocity(lead uuid) returns numeric
language sql stable set search_path=public as $$
  select case when count(*)>0 then greatest(0,count(*)*10 -
    2*greatest(0,extract(epoch from now()-max(at))/86400)) end
  from (select created_at as at from lead_activities where lead_id=lead
        union all select created_at from touchpoints where lead_id=lead) events;
$$;
create or replace function public.fn_calculate_lead_velocity(p_lead_id uuid) returns numeric
language sql stable set search_path=public as $$
  select coalesce(public.crm_engagement_velocity(p_lead_id),0);
$$;
create function public.crm_combined_score(icp numeric,velocity numeric) returns int
language sql immutable set search_path=public as $$
  select round(avg(least(100, greatest(0,signal)))/10)::int
  from (values(icp),(velocity)) scores(signal) where signal is not null;
$$;
revoke all on function public.crm_engagement_velocity(uuid),public.crm_combined_score(numeric,numeric) from public,anon;
grant execute on function public.crm_engagement_velocity(uuid),public.crm_combined_score(numeric,numeric) to authenticated,service_role;

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
    'lead_score',       public.crm_combined_score(sc.icp, sc.vel),
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
      public.crm_engagement_velocity(o.lead_id) as vel
  ) sc;
$$;

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
           ) as has_icp
      from public.leads l
     where l.id = any(coalesce(p_lead_ids, array[]::uuid[]))
       and l.deleted_at is null
  ),
  scored as (
    select t.id,
           case when t.has_icp then (select s.score from public.fn_calculate_icp_score(t.id) s) end as icp,
           public.crm_engagement_velocity(t.id) as vel
      from target t
  )
  select coalesce(
           jsonb_object_agg(
             s.id,
             jsonb_build_object(
               'icp_score',  s.icp,
               'velocity',   s.vel,
               'lead_score', public.crm_combined_score(s.icp,s.vel)
             )
           ),
           '{}'::jsonb
         )
    from scored s;
$$;

create or replace function public._crm_opp_matches_c(o public.opportunities, l public.leads, f public.crm_opp_filter)
returns boolean
language sql
stable
as $$
  select (public._crm_search_c(l, f.search, f.search_digits, f.search_phone)
          or strpos(lower(o.title), lower(f.search)) > 0)
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
    and (f.custom is null or public._crm_custom_matches(o.custom_data, f.custom))
    and public._crm_origin_matches_c(l, f.campaign_ids, f.campaign_none, f.platforms, f.entry_ids);
$$;

-- Keep the table RPC's existing pagination, relation enrichment and custom-field sorts.
do $migration$
declare
  definition text := pg_get_functiondef('public.crm_opp_table(uuid,jsonb,jsonb,integer,integer)'::regprocedure);
begin
  if strpos(definition, 'when ''value'' then (b.o).value') = 0
     or strpos(definition, '''closed_at'', ''lead_name'', ''owner_name'', ''next_contact'')') = 0
     or strpos(definition, 'lower((b.l).name)') = 0 then
    raise exception 'Unexpected crm_opp_table definition';
  end if;
  definition := replace(definition, '''closed_at'', ''lead_name'', ''owner_name'', ''next_contact'')',
    '''closed_at'', ''lead_name'', ''owner_name'', ''next_contact'', ''lead_score'')');
  definition := replace(definition, 'lower((b.l).name)', 'lower(coalesce(nullif(trim((b.o).title),''''),(b.l).name))');
  definition := replace(definition, 'when ''value'' then (b.o).value', $score$
             when 'value' then (b.o).value
             when 'lead_score' then public.crm_combined_score(
               case when (select v from has_icp) then (select s.score from public.fn_calculate_icp_score((b.o).lead_id) s) end,
               public.crm_engagement_velocity((b.o).lead_id))$score$);
  execute definition;
end $migration$;
