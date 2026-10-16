-- 20261015000402_sesup1_report_per_pipeline.sql
-- SE-SUP1-5 (#15) — relatório por pipeline, com template fixo.
--
-- 1. report_schedules.pipeline_id (nullable): cada pipeline recebe o seu
--    relatório; null = todos os pipelines da equipe (comportamento anterior).
-- 2. build_report_snapshot passa a devolver SEMPRE os mesmos blocos (resumo,
--    marcos do funil, touchpoints por vendedor, destaques, metas) — o renderer
--    (_shared/report-render.ts) não decide o que existe, só formata. `sections`
--    continua gravado no agendamento, mas deixou de mandar no conteúdo.
-- 3. Os insumos da META DIÁRIA vão crus no snapshot (revenue_config por
--    pipeline + dias úteis); a derivação "meta do período ÷ dias úteis" fica em
--    _shared/report-targets.ts, onde é testada. Dias úteis = segunda a sexta,
--    sem feriados.
--
-- A assinatura de build_report_snapshot ganha p_pipeline_id e p_timezone: a
-- antiga é removida para não deixar duas sobrecargas com defaults ambíguas.
-- Chamadas por nome (reports-cron, preview) continuam valendo.
--
-- ORDEM DE DEPLOY: aplicar esta migration (e a 000401, de que ela depende)
-- ANTES de publicar o reports-cron novo — ele passa p_pipeline_id/p_timezone e
-- seleciona a coluna pipeline_id, que só existem depois daqui.

begin;

-- ============================================================================
-- 1. pipeline_id no agendamento
-- ============================================================================

alter table public.report_schedules
  add column if not exists pipeline_id uuid references public.pipelines(id) on delete cascade;

comment on column public.report_schedules.pipeline_id is
  'SE-SUP1-5: pipeline do relatório. null = todos os pipelines da equipe.';

create index if not exists idx_report_schedules_pipeline
  on public.report_schedules (pipeline_id) where pipeline_id is not null;

-- A FK garante que o pipeline existe, não que é DA EQUIPE. A policy de escrita
-- confere só equipe_id do agendamento; sem isto um admin poderia apontar para o
-- pipeline de outro tenant e o snapshot (service role) leria os números dele.
create or replace function public.fn_report_schedule_pipeline_same_team()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.pipeline_id is not null and not exists (
    select 1 from public.pipelines p where p.id = new.pipeline_id and p.equipe_id = new.equipe_id
  ) then
    raise exception 'pipeline_not_in_team' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_report_schedule_pipeline_same_team on public.report_schedules;
create trigger trg_report_schedule_pipeline_same_team
  before insert or update of pipeline_id, equipe_id on public.report_schedules
  for each row execute function public.fn_report_schedule_pipeline_same_team();

-- ============================================================================
-- 2. dias úteis (segunda a sexta, sem feriados)
-- ============================================================================

create or replace function public._business_days(p_from date, p_to_exclusive date)
returns integer
language sql
stable
set search_path = public, extensions
as $$
  select case when p_to_exclusive <= p_from then 0
         else (select count(*)::int
                 from generate_series(p_from, p_to_exclusive - 1, interval '1 day') g
                where extract(isodow from g) < 6)
         end;
$$;

grant execute on function public._business_days(date, date) to authenticated, service_role;

-- ============================================================================
-- 3. o snapshot de template fixo
-- ============================================================================

drop function if exists public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb);

create or replace function public.build_report_snapshot(
  p_equipe      uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_sections    text[] default null,
  p_filters     jsonb  default '{}'::jsonb,
  p_pipeline_id uuid   default null,
  p_timezone    text   default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_pipelines  uuid[];
  v_channels   text[];
  v_resp       uuid[];
  v_sections   text[] := coalesce(p_sections, array[]::text[]);
  v_equipe     text;
  v_pipe_name  text;
  v_from_day   date := (p_from at time zone p_timezone)::date;
  v_to_day     date := ((p_to - interval '1 microsecond') at time zone p_timezone)::date + 1;
  v_month_s    date := date_trunc('month', (p_from at time zone p_timezone))::date;
  v_quarter_s  date := date_trunc('quarter', (p_from at time zone p_timezone))::date;
  v_top_won    jsonb;
  v_goals      jsonb;
begin
  select nome into v_equipe from public.equipes where id = p_equipe;

  -- A coluna do agendamento manda; `filters.pipeline_ids` continua valendo para
  -- agendamentos antigos (pipeline_id nulo).
  if p_pipeline_id is not null then
    select p.name into v_pipe_name from public.pipelines p
     where p.id = p_pipeline_id and p.equipe_id = p_equipe;
    if v_pipe_name is null then
      raise exception 'pipeline_not_in_team' using errcode = '42501';
    end if;
    v_pipelines := array[p_pipeline_id];
  elsif p_filters ? 'pipeline_ids' and jsonb_typeof(p_filters->'pipeline_ids') = 'array'
        and jsonb_array_length(p_filters->'pipeline_ids') > 0 then
    v_pipelines := array(select (jsonb_array_elements_text(p_filters->'pipeline_ids'))::uuid);
    -- Filtro legado: o cabeçalho do relatório nomeia o recorte em vez de dizer
    -- "Todos os pipelines".
    select string_agg(p.name, ', ' order by p.name) into v_pipe_name
      from public.pipelines p where p.equipe_id = p_equipe and p.id = any(v_pipelines);
  end if;

  -- Recortes: o cliente escolhe canal e vendedor; não escolhe seções.
  if p_filters ? 'channels' and jsonb_typeof(p_filters->'channels') = 'array'
     and jsonb_array_length(p_filters->'channels') > 0 then
    v_channels := array(select jsonb_array_elements_text(p_filters->'channels'));
  end if;
  if p_filters ? 'responsible_ids' and jsonb_typeof(p_filters->'responsible_ids') = 'array'
     and jsonb_array_length(p_filters->'responsible_ids') > 0 then
    v_resp := array(select (jsonb_array_elements_text(p_filters->'responsible_ids'))::uuid);
  end if;

  -- Maiores ganhos NA janela (destaque positivo). Mesmo escopo do overview.
  select coalesce(jsonb_agg(w.x order by w.val desc), '[]'::jsonb)
    into v_top_won
    from (
      select d.x, d.val
        from (
          select distinct on (o.id)
                 jsonb_build_object(
                   'lead_name',        l.name,
                   'value',            coalesce(o.value, 0),
                   'responsible_name', pr.nome_completo) as x,
                 coalesce(o.value, 0) as val
            from public.funnel_events fe
            join public.opportunities o on o.id = fe.opportunity_id
            join public.leads l on l.id = o.lead_id
            left join public.profiles pr on pr.id = l.responsible_id
            left join public.v_lead_channel c on c.lead_id = l.id
           where fe.equipe_id = p_equipe
             and fe.event = 'won'
             and fe.occurred_at >= p_from and fe.occurred_at < p_to
             and o.deleted_at is null and l.deleted_at is null
             and (v_pipelines is null or o.pipeline_id = any(v_pipelines))
             and (v_resp is null or l.responsible_id = any(v_resp))
             and (v_channels is null or c.acquisition_channel = any(v_channels))
           order by o.id
        ) d
       order by d.val desc
       limit 3
    ) w;

  -- Insumos da meta: revenue_config CRU por pipeline do escopo. Quem deriva é
  -- _shared/report-targets.ts.
  select coalesce(jsonb_agg(jsonb_build_object(
           'pipeline_id',   p.id,
           'name',          p.name,
           'period',        p.revenue_config->>'period',
           'goal_deals',    p.revenue_config->'goal_deals',
           'goal_revenue',  p.revenue_config->'goal_revenue',
           'daily_targets', p.revenue_config->'daily_targets') order by p.name), '[]'::jsonb)
    into v_goals
    from public.pipelines p
   where p.equipe_id = p_equipe
     and (v_pipelines is null or p.id = any(v_pipelines))
     and (v_pipelines is not null or p.is_archived = false);

  return jsonb_build_object(
    'equipe_name', v_equipe,
    'period',      jsonb_build_object('from', p_from, 'to', p_to),
    'sections',    to_jsonb(v_sections),
    'pipeline',    case when v_pipe_name is not null
                        then jsonb_build_object('id', p_pipeline_id, 'name', v_pipe_name) end,
    'overview',    public._funnel_overview_core(p_equipe, null, p_from, p_to, v_pipelines, v_resp, v_channels),
    'loss_reasons',      public._loss_reasons_core(p_equipe, null, p_from, p_to, v_pipelines),
    'top_opportunities', public._top_opportunities_core(p_equipe, null, 5, v_pipelines),
    'top_won',           v_top_won,
    'touchpoints_by_seller',
                   public._touchpoints_by_seller_core(
                     p_equipe, null, p_from, p_to, v_pipelines, v_channels, v_resp, p_timezone),
    'goals', jsonb_build_object(
      'window_business_days',  public._business_days(v_from_day, v_to_day),
      'month_business_days',   public._business_days(v_month_s, (v_month_s + interval '1 month')::date),
      'quarter_business_days', public._business_days(v_quarter_s, (v_quarter_s + interval '3 months')::date),
      'pipelines',             v_goals)
  );
end;
$$;

comment on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb, uuid, text) is
  'SE-SUP1-5: snapshot de template fixo — sempre os mesmos blocos. Mesmos _core do dashboard. p_pipeline_id restringe a um pipeline.';

revoke all on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.build_report_snapshot(uuid, timestamptz, timestamptz, text[], jsonb, uuid, text) to service_role;

-- ============================================================================
-- 4. preview: o mesmo snapshot, com o pipeline e o fuso do agendamento
-- ============================================================================

create or replace function public.preview_report_snapshot(
  p_schedule_id uuid,
  p_from        timestamptz default null,
  p_to          timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  v_equipe uuid;
  v_sched  record;
  v_from   timestamptz;
  v_to     timestamptz;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  select * into v_sched from public.report_schedules
   where id = p_schedule_id and equipe_id = v_equipe;
  if v_sched.id is null then
    raise exception 'schedule_not_found' using errcode = 'P0002';
  end if;

  select f.period_start, f.period_end into v_from, v_to
    from public.report_period(v_sched.frequency, v_sched.timezone, now()) f;

  return public.build_report_snapshot(
    v_equipe,
    coalesce(p_from, v_from),
    coalesce(p_to, v_to),
    v_sched.sections,
    v_sched.filters,
    v_sched.pipeline_id,
    v_sched.timezone);
end;
$$;

revoke all on function public.preview_report_snapshot(uuid, timestamptz, timestamptz) from public;
grant execute on function public.preview_report_snapshot(uuid, timestamptz, timestamptz) to authenticated;

commit;
