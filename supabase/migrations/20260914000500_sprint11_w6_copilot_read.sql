-- Sprint 11 · Onda 6 · T62 — o que o chat lê: o negócio em resumo e onde focar.
--
--   * `crm_copilot_deal_brief(negócio)` — o resumo que o Copilot mantém, a origem
--     (primeiro toque: entrada, categoria, plataforma, campanha), as tarefas
--     abertas, as sugestões esperando e as últimas ações. A equipe lê.
--   * `crm_focus_list(dono, limite)` — os negócios abertos que pedem atenção agora,
--     com a pontuação e o motivo de cada um. Determinístico, sem modelo:
--       cliente esperando resposta (a última mensagem é dele) ........ +25
--       cliente escreveu nas últimas 24 h (+35) ou 72 h (+20)
--       parado além do SLA da etapa ...................................... +20
--       tarefa atrasada .................................................. +15
--       sugestão do Copilot esperando aprovação ........................ +15
--       valor (proporcional ao maior da lista) ....................... até +30
--     Escopo do dashboard: o vendedor vê os seus.
--   * `crm_copilot_feed` — a casa do Copilot (T64): as sugestões esperando, o que
--     ele fez nos últimos 7 dias, as passadas que falharam e os números de hoje.
--   * Índice de mensagens por contato e data — o contexto do Copilot, o Sync em
--     lote e o "onde focar" perguntam pela conversa mais recente.

create index if not exists idx_messages_lead_created on public.messages (lead_id, created_at desc);

-- ============================================================================
-- 1. O NEGÓCIO EM RESUMO
-- ============================================================================

create or replace function public.crm_copilot_deal_brief(p_opportunity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_opp  public.opportunities;
  v_lead public.leads;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  select * into v_opp from public.opportunities
   where id = p_opportunity_id and equipe_id = v_team and deleted_at is null;
  if v_team is null or not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = v_opp.lead_id;

  return jsonb_build_object(
    'opportunity', jsonb_build_object(
      'id', v_opp.id, 'lead_id', v_opp.lead_id, 'contact', v_lead.name, 'value', v_opp.value, 'status', v_opp.status,
      'pipeline', (select pl.name from public.pipelines pl where pl.id = v_opp.pipeline_id),
      'stage', (select s.name from public.pipeline_stages_v2 s where s.id = v_opp.stage_id),
      'owner', (select pr.nome_completo from public.profiles pr where pr.id = v_opp.owner_id),
      'days_in_stage', floor(extract(epoch from (now() - coalesce(v_opp.stage_entered_at, v_opp.created_at))) / 86400)::int),
    'summary', (select m.summary from public.copilot_memory m where m.opportunity_id = v_opp.id),
    'summary_at', (select m.updated_at from public.copilot_memory m where m.opportunity_id = v_opp.id),
    'origin', (select jsonb_build_object('entry', e.name, 'category', t.origin_category, 'platform', t.platform,
                                         'campaign', c.name, 'at', t.occurred_at)
                 from public.lead_touches t
                 left join public.crm_entries e on e.id = t.entry_id
                 left join public.crm_campaigns c on c.id = t.campaign_id
                where t.id = v_lead.first_touch_id),
    'open_tasks', coalesce((select jsonb_agg(jsonb_build_object('title', t.title, 'due_date', t.due_date, 'status', t.status)
                                             order by t.due_date nulls last)
                              from (select * from public.tasks t
                                     where t.lead_id = v_lead.id and t.status in ('a_fazer', 'fazendo')
                                     order by t.due_date nulls last limit 10) t), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.output_action->>'label',
                                                             'why', d.output_action->>'why', 'at', d.created_at)
                                          order by d.created_at desc)
                           from public.ai_decisions d
                          where d.opportunity_id = v_opp.id and d.agent_role = 'copilot'
                            and d.status in ('pending_approval', 'proposed')), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.output_action->>'label',
                                                            'status', d.status, 'at', d.created_at)
                                         order by d.created_at desc)
                          from (select * from public.ai_decisions d
                                 where d.opportunity_id = v_opp.id and d.agent_role = 'copilot'
                                   and d.status in ('auto_applied', 'executed', 'undone')
                                 order by d.created_at desc limit 10) d), '[]'::jsonb),
    'last_job', (select jsonb_build_object('status', j.status, 'reason', j.reason, 'finished_at', j.finished_at,
                                           'last_error', j.last_error, 'result', j.result)
                   from public.copilot_jobs j where j.opportunity_id = v_opp.id
                  order by j.created_at desc limit 1)
  );
end;
$$;

-- ============================================================================
-- 2. ONDE FOCAR
-- ============================================================================

create or replace function public.crm_focus_list(p_owner_id uuid default null, p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team     uuid;
  v_restrict uuid;
  v_result   jsonb;
begin
  select s.v_equipe, s.v_restrict into v_team, v_restrict from public._funnel_scope() s;

  with deals as (
    select o.id, o.lead_id, o.value, o.owner_id, o.pipeline_id, o.stage_id,
           coalesce(o.stage_entered_at, o.created_at) as entered_at
      from public.opportunities o
     where o.equipe_id = v_team and o.deleted_at is null and o.status = 'open'
       and (v_restrict is null or o.owner_id = v_restrict)
       and (p_owner_id is null or o.owner_id = p_owner_id)
  ),
  facts as (
    select d.*,
           s.name as stage_name, s.max_idle_hours,
           lm.created_at as last_msg_at, lm.sender_type as last_msg_from,
           lc.created_at as last_customer_at,
           exists (select 1 from public.tasks t
                    where t.lead_id = d.lead_id and t.status in ('a_fazer', 'fazendo') and t.due_date < now()) as late_task,
           exists (select 1 from public.ai_decisions a
                    where a.opportunity_id = d.id and a.agent_role = 'copilot' and a.status = 'pending_approval') as waiting_approval,
           max(d.value) over () as top_value
      from deals d
      left join public.pipeline_stages_v2 s on s.id = d.stage_id
      left join lateral (select m.created_at, m.sender_type from public.messages m
                          where m.lead_id = d.lead_id and m.sender_type <> 'system'
                          order by m.created_at desc limit 1) lm on true
      left join lateral (select m.created_at from public.messages m
                          where m.lead_id = d.lead_id and m.sender_type = 'customer'
                          order by m.created_at desc limit 1) lc on true
  ),
  scored as (
    select f.*,
           array_remove(array[
             case when f.last_msg_from = 'customer' then 'cliente esperando resposta' end,
             case when f.last_customer_at > now() - interval '24 hours' then 'cliente escreveu hoje'
                  when f.last_customer_at > now() - interval '72 hours' then 'cliente escreveu nos últimos 3 dias' end,
             case when f.max_idle_hours is not null and f.entered_at < now() - make_interval(hours => f.max_idle_hours)
                  then 'parado há ' || floor(extract(epoch from (now() - f.entered_at)) / 3600)::int || ' h (SLA ' || f.max_idle_hours || ' h)' end,
             case when f.late_task then 'tarefa atrasada' end,
             case when f.waiting_approval then 'sugestão do Copilot esperando' end
           ], null) as reasons,
           (case when f.last_msg_from = 'customer' then 25 else 0 end)
         + (case when f.last_customer_at > now() - interval '24 hours' then 35
                 when f.last_customer_at > now() - interval '72 hours' then 20 else 0 end)
         + (case when f.max_idle_hours is not null and f.entered_at < now() - make_interval(hours => f.max_idle_hours) then 20 else 0 end)
         + (case when f.late_task then 15 else 0 end)
         + (case when f.waiting_approval then 15 else 0 end) as signal
      from facts f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'opportunity_id', x.id, 'lead_id', x.lead_id,
           'contact', (select l.name from public.leads l where l.id = x.lead_id),
           'pipeline', (select pl.name from public.pipelines pl where pl.id = x.pipeline_id),
           'stage', x.stage_name, 'value', x.value, 'owner_id', x.owner_id,
           'score', x.score, 'reasons', to_jsonb(x.reasons))
         order by x.score desc, x.value desc nulls last), '[]'::jsonb)
    into v_result
    from (select s.*,
                 s.signal + case when coalesce(s.top_value, 0) > 0
                                 then round(30 * coalesce(s.value, 0) / s.top_value)::int else 0 end as score
            from scored s
           where s.signal > 0
           order by s.signal + case when coalesce(s.top_value, 0) > 0
                                    then round(30 * coalesce(s.value, 0) / s.top_value)::int else 0 end desc,
                    s.value desc nulls last
           limit least(greatest(coalesce(p_limit, 10), 1), 50)) x;

  return v_result;
end;
$$;

-- ============================================================================
-- 3. O QUE O COPILOT FEZ E O QUE ESPERA (a casa do Copilot, T64)
-- ============================================================================

-- As sugestões esperando, o que foi feito nos últimos 7 dias, as passadas que
-- falharam e os números de hoje — com o nome do contato. Escopo do dashboard.
create or replace function public.crm_copilot_feed(p_limit integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team     uuid;
  v_restrict uuid;
  v_today    timestamptz := ((now() at time zone 'America/Sao_Paulo')::date) at time zone 'America/Sao_Paulo';
begin
  select s.v_equipe, s.v_restrict into v_team, v_restrict from public._funnel_scope() s;

  return jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.at desc)
        from (select d.id, d.status, d.created_at as at, d.output_action->>'label' as label,
                     d.output_action->>'why' as why, d.input_summary as reason, d.confidence_score as confidence,
                     d.opportunity_id, o.pipeline_id, l.name as contact
                from public.ai_decisions d
                join public.opportunities o on o.id = d.opportunity_id
                left join public.leads l on l.id = o.lead_id
               where d.equipe_id = v_team and d.agent_role = 'copilot'
                 and d.status in ('pending_approval', 'proposed')
                 and (v_restrict is null or o.owner_id = v_restrict)
               order by d.created_at desc
               limit 50) x), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.at desc)
        from (select d.id, d.status, coalesce(d.resolved_at, d.created_at) as at, d.output_action->>'label' as label,
                     d.input_summary as reason, d.opportunity_id, o.pipeline_id, l.name as contact
                from public.ai_decisions d
                join public.opportunities o on o.id = d.opportunity_id
                left join public.leads l on l.id = o.lead_id
               where d.equipe_id = v_team and d.agent_role = 'copilot'
                 and d.status in ('auto_applied', 'executed', 'undone', 'stale', 'rejected')
                 and coalesce(d.resolved_at, d.created_at) > now() - interval '7 days'
                 and (v_restrict is null or o.owner_id = v_restrict)
               order by coalesce(d.resolved_at, d.created_at) desc
               limit least(greatest(coalesce(p_limit, 60), 1), 200)) x), '[]'::jsonb),
    'failures', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.at desc)
        from (select j.id, j.finished_at as at, j.last_error as error, j.opportunity_id, o.pipeline_id, l.name as contact
                from public.copilot_jobs j
                join public.opportunities o on o.id = j.opportunity_id
                left join public.leads l on l.id = o.lead_id
               where j.equipe_id = v_team and j.status = 'failed' and j.finished_at > now() - interval '7 days'
                 and (v_restrict is null or o.owner_id = v_restrict)
               order by j.finished_at desc
               limit 10) x), '[]'::jsonb),
    'today', jsonb_build_object(
      'applied', (select count(*) from public.ai_decisions d join public.opportunities o on o.id = d.opportunity_id
                   where d.equipe_id = v_team and d.agent_role = 'copilot' and d.status in ('auto_applied', 'executed')
                     and coalesce(d.resolved_at, d.created_at) >= v_today
                     and (v_restrict is null or o.owner_id = v_restrict)),
      'read', (select count(*) from public.copilot_jobs j join public.opportunities o on o.id = j.opportunity_id
                where j.equipe_id = v_team and j.status = 'done' and j.finished_at >= v_today
                  and (v_restrict is null or o.owner_id = v_restrict)))
  );
end;
$$;

revoke all on function public.crm_copilot_deal_brief(uuid) from public, anon;
revoke all on function public.crm_copilot_feed(integer) from public, anon;
revoke all on function public.crm_focus_list(uuid, integer) from public, anon;
grant execute on function public.crm_copilot_deal_brief(uuid) to authenticated;
grant execute on function public.crm_focus_list(uuid, integer) to authenticated;
grant execute on function public.crm_copilot_feed(integer) to authenticated;
