-- Sprint 11 · Onda 6 · T61 — o Sync só enfileira, na frente.
--
-- ANTES
--
-- O botão ⚡ abria um SSE com o agente e esperava a passada inteira (Torre, Chão,
-- cada verbo) antes de mostrar a telemetria; "Sincronizar Pipeline" rodava negócio
-- por negócio, todos, com ou sem conversa nova.
--
-- AGORA
--
--   * `crm_copilot_enqueue` põe na fila, agora e na frente (prioridade 10):
--     o negócio pedido, ou o negócio aberto do contato (a caixa de entrada só tem o
--     contato). Um trabalho que esperava a conversa pausar passa a rodar já.
--   * Etapa ou pipeline: só os negócios abertos com mensagem depois da última
--     leitura do Copilot (prioridade 5). Pipeline com 1.000 negócios e 30 conversas
--     novas = 30 trabalhos.
--   * Escopo do dashboard: o vendedor só enfileira os seus. Equipe com o Agente de
--     CRM desligado: `copilot_disabled`.
--   * Devolve quantos e quais — a tela acompanha o progresso pela fila.

create or replace function public.crm_copilot_enqueue(
  p_opportunity_id uuid default null,
  p_lead_id        uuid default null,
  p_stage_id       uuid default null,
  p_pipeline_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team     uuid;
  v_restrict uuid;
  v_reason   text;
  v_prio     smallint;
  v_ids      uuid[] := array[]::uuid[];
  v_id       uuid;
  r          record;
begin
  select s.v_equipe, s.v_restrict into v_team, v_restrict from public._funnel_scope() s;
  if not exists (select 1 from public.equipes e where e.id = v_team and coalesce(e.is_crm_agent_enabled, false)) then
    raise exception 'copilot_disabled' using errcode = '42501';
  end if;

  if p_opportunity_id is not null or p_lead_id is not null then
    v_reason := 'manual';
    v_prio := 10;
  elsif p_stage_id is not null or p_pipeline_id is not null then
    v_reason := case when p_stage_id is not null then 'sync_stage' else 'sync_pipeline' end;
    v_prio := 5;
  else
    raise exception 'nothing_to_sync' using errcode = '22023';
  end if;

  for r in
    select o.id, o.lead_id
      from public.opportunities o
      left join public.copilot_memory mem on mem.opportunity_id = o.id
     where o.equipe_id = v_team
       and o.deleted_at is null
       and o.status = 'open'
       and (v_restrict is null or o.owner_id = v_restrict)
       and (p_opportunity_id is null or o.id = p_opportunity_id)
       and (p_lead_id is null or o.lead_id = p_lead_id)
       and (p_stage_id is null or o.stage_id = p_stage_id)
       and (p_pipeline_id is null or o.pipeline_id = p_pipeline_id)
       -- Em lote, só quem tem conversa nova; o pedido de um negócio sempre entra.
       and (v_reason = 'manual'
            or exists (select 1 from public.messages m
                        where m.lead_id = o.lead_id
                          and (mem.last_message_at is null or m.created_at > mem.last_message_at)))
     order by o.updated_at desc nulls last
     limit case when v_reason = 'manual' then 1 else 500 end
  loop
    insert into public.copilot_jobs (equipe_id, opportunity_id, lead_id, reason, priority, run_after, requested_by)
    values (v_team, r.id, r.lead_id, v_reason, v_prio, clock_timestamp(), auth.uid())
    on conflict (opportunity_id) where status = 'queued'
    do update set reason       = excluded.reason,
                  priority     = greatest(public.copilot_jobs.priority, excluded.priority),
                  run_after    = least(public.copilot_jobs.run_after, excluded.run_after),
                  requested_by = excluded.requested_by,
                  updated_at   = clock_timestamp()
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  if v_reason = 'manual' and coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('queued', coalesce(array_length(v_ids, 1), 0), 'job_ids', to_jsonb(v_ids));
end;
$$;

revoke all on function public.crm_copilot_enqueue(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.crm_copilot_enqueue(uuid, uuid, uuid, uuid) to authenticated;
