-- 20261001000100_sestagehook001_stage_entered_webhook.sql
-- SE-STAGEHOOK-001 — "Ao entrar na etapa" passa a disparar de verdade.
--
-- A tela de etapas já deixa ligar um webhook a "Ao entrar na etapa"
-- (pipeline_stages_v2.webhook_triggers = [{event:'on_stage_entered', webhook_id}]),
-- mas nada no servidor lia isso: o único leitor, cadence-check, só trata
-- on_idle_breach e on_cadence_deadline. Configurar a opção não enviava nada.
--
-- Aqui o banco passa a ler. A entrega é a de sempre (enqueue_crm_webhooks →
-- deliver-crm-webhook → webhook_logs); não nasce outro caminho de saída.
--
-- CONVENÇÃO: o webhook ligado a uma etapa tem trigger_event
-- 'stage_entered:<id do webhook>'. enqueue_crm_webhooks entrega por evento, então
-- um evento único por webhook impede que dois webhooks ligados a etapas
-- diferentes disparem juntos.

-- ============================================================================
-- 1. O PAYLOAD "NEGÓCIO GANHO" (formato do botão "ganho!" do Jestor)
-- ============================================================================

create or replace function public._crm_deal_won_payload(p_opportunity_id uuid, p_triggered_by uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with opp as (
    select o.* from public.opportunities o where o.id = p_opportunity_id
  ),
  who as (
    select pr.id, pr.nome_completo, pr.email
      from public.profiles pr, opp
     where pr.id = coalesce(p_triggered_by, opp.owner_id)
  )
  select jsonb_build_object(
    'event', 'deal_won',
    'button', 'ganho!',
    'source', 'rev',
    'table_id', opp.pipeline_id,
    'record_id', opp.id,
    'triggered_by', (select jsonb_build_object('id', w.id, 'name', w.nome_completo, 'email', w.email) from who w),
    'data', jsonb_build_object(
      'id', opp.id,
      'name', l.name,
      'valor_da_oportunidade', opp.value,
      'estagio', s.name,
      'data_de_fechamento', coalesce(opp.closed_at, now())::date,
      'telefone', l.phone,
      'email', l.email,
      'fonte', coalesce(l.source, l.origem),
      'observacoes', l.observations,
      'pipeline', jsonb_build_object('id', p.id, 'name', p.name),
      'responsavel', (select jsonb_build_object('id', pr.id, 'name', pr.nome_completo, 'email', pr.email)
                        from public.profiles pr where pr.id = opp.owner_id),
      'lead', jsonb_build_object(
        'id', l.id, 'name', l.name, 'email', l.email, 'telefone', l.phone,
        'fonte', coalesce(l.source, l.origem), 'tags', to_jsonb(l.tags),
        'observacoes', l.observations),
      -- Campos do negócio por key (o contrato de _crm_artifact_payload).
      'campos', coalesce((
        select jsonb_object_agg(f->>'key', opp.custom_data->(f->>'field_id'))
          from jsonb_array_elements(p.custom_fields_schema) f
         where jsonb_typeof(p.custom_fields_schema) = 'array'
           and not coalesce((f->>'is_deleted')::boolean, false)
           and nullif(f->>'key', '') is not null
           and nullif(f->>'field_id', '') is not null), '{}'::jsonb),
      'itens', coalesce((
        select jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity,
                                            'unit_price', i.unit_price, 'total', i.total)
                         order by i.position, i.created_at, i.id)
          from public.opportunity_items i
         where i.opportunity_id = opp.id and i.deleted_at is null), '[]'::jsonb),
      -- Propostas e contratos do negócio, com os campos de cada registro.
      'artefatos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'tabela', t.name, 'tipo', t.artifact_kind, 'id', r.id,
                 'status', r.artifact_status,
                 'campos', coalesce(public._crm_artifact_record_fields(r.id), '{}'::jsonb))
               order by case t.artifact_kind when 'proposal' then 0 when 'contract' then 1 else 2 end,
                        r.created_at desc)
          from public.custom_table_records r
          join public.custom_tables t on t.id = r.table_id
           and t.artifact_kind is not null and t.deleted_at is null
         where r.opportunity_id = opp.id and r.deleted_at is null), '[]'::jsonb)
    )
  )
  from opp
  join public.leads l on l.id = opp.lead_id
  join public.pipelines p on p.id = opp.pipeline_id
  left join public.pipeline_stages_v2 s on s.id = opp.stage_id;
$$;

revoke all on function public._crm_deal_won_payload(uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- 2. O GATILHO: ENTROU NA ETAPA → WEBHOOKS LIGADOS A ELA
-- ============================================================================

create or replace function public.dispatch_stage_entered_webhooks()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $$
declare
  v_trigger jsonb;
  v_cfg record;
  v_payload jsonb;
begin
  if new.deleted_at is not null then return new; end if;

  for v_trigger in
    select t from public.pipeline_stages_v2 s,
                  jsonb_array_elements(case when jsonb_typeof(s.webhook_triggers) = 'array'
                                            then s.webhook_triggers else '[]'::jsonb end) t
     where s.id = new.stage_id and s.equipe_id = new.equipe_id
       and t->>'event' = 'on_stage_entered'
  loop
    select c.id, c.trigger_event into v_cfg
      from public.webhook_configs c
     where c.id = nullif(v_trigger->>'webhook_id', '')::uuid
       and c.equipe_id = new.equipe_id
       and c.active and c.inbound_function is null;
    -- Só o webhook com o evento próprio; outro valor deixaria um evento
    -- compartilhado disparar webhooks que ninguém ligou a esta etapa.
    if not found or v_cfg.trigger_event <> 'stage_entered:' || v_cfg.id then
      continue;
    end if;

    -- Mover o negócio nunca pode falhar por causa de uma entrega.
    begin
      v_payload := public._crm_deal_won_payload(new.id, auth.uid());
      perform public.enqueue_crm_webhooks(new.equipe_id, v_cfg.trigger_event,
                                          jsonb_build_object('payload', v_payload));
    exception when others then
      raise warning '[stage_entered_webhook] %', sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists dispatch_stage_entered_webhooks on public.opportunities;
create trigger dispatch_stage_entered_webhooks
  after update of stage_id on public.opportunities
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function public.dispatch_stage_entered_webhooks();
