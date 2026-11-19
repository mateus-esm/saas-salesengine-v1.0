CREATE OR REPLACE FUNCTION public._crm_deal_won_payload(p_opportunity_id uuid, p_triggered_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with opp as (
    select o.* from public.opportunities o where o.id = p_opportunity_id
  ),
  who as (
    select pr.id, pr.nome_completo, pr.email
      from public.profiles pr, opp
     where pr.id = coalesce(p_triggered_by, opp.owner_id)
  ), base as (
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
      'nome_oportunidade', coalesce(nullif(trim(opp.title),''),l.name),
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
  ) as payload
  from opp
  join public.leads l on l.id = opp.lead_id
  join public.pipelines p on p.id = opp.pipeline_id
  left join public.pipeline_stages_v2 s on s.id = opp.stage_id
  ), selected as (
    select payload, a.proposal, a.contract
    from base
    cross join lateral (
      -- Only an unambiguous accepted proposal or signed contract supplies defaults.
      select case when count(*) filter (where is_proposal) = 1 then
               (jsonb_agg(item) filter (where is_proposal))->0 end as proposal,
             case when count(*) filter (where is_contract) = 1 then
               (jsonb_agg(item) filter (where is_contract))->0 end as contract
      from (
        select item, item->>'tipo' = 'proposal' and item->>'status' = 'accepted' as is_proposal,
               item->>'tipo' = 'contract' and item->>'status' = 'signed' as is_contract
        from jsonb_array_elements(payload #> '{data,artefatos}') item
      ) candidates
    ) a
  )
  , commercial as (
    select selected.*,
      case when coalesce(jsonb_array_length(o.won_snapshot->'items_won'),0)
                   + coalesce(jsonb_array_length(o.won_snapshot->'items_lost'),0) > 0 then payload#>'{data,itens}'
           when jsonb_typeof(proposal#>'{campos,itens}')='array' and proposal#>'{campos,itens}' <> '[]'::jsonb
             then proposal#>'{campos,itens}' else payload#>'{data,itens}' end as items,
      c.acquisition_channel as channel, o.won_snapshot->'value' as closing_price
    from selected cross join opp o
    left join public.v_lead_channel c on c.lead_id=o.lead_id and c.equipe_id=o.equipe_id
  )
  select jsonb_set(payload, '{data,onboarding}', jsonb_build_object(
    'canal', channel,
    'itens', items,
    'produto', (select string_agg(i->>'name', ', ' order by n) from jsonb_array_elements(items) with ordinality item(i,n)),
    'proposal', proposal,
    'contract', case when contract is not null then jsonb_build_object(
      'id', contract->'id',
      'status', contract->'status',
      'campos', (select jsonb_object_agg(key, value) from jsonb_each(contract->'campos')
                  where key in ('nome_completo', 'cpf_cnpj', 'email_contrato', 'telefone_contrato',
                                'endereco', 'bairro', 'cidade', 'uf', 'cep', 'endereco_instalacao',
                                'concessionaria', 'unidade_consumidora', 'forma_pagamento'))
    ) end,
    'email', coalesce(nullif(btrim(contract #>> '{campos,email_contrato}'), ''),
                      nullif(btrim(proposal #>> '{campos,email}'), ''), payload #>> '{data,email}'),
    'value', coalesce(nullif(closing_price,'null'), nullif(proposal #> '{campos,preco_total}', 'null'), payload #> '{data,valor_da_oportunidade}'),
    'campos', (payload #> '{data,campos}') || jsonb_strip_nulls(jsonb_build_object(
      'potencia_do_sistema_kwp', proposal #> '{campos,potencia_kwp}',
      'consumo_medio_kwh', proposal #> '{campos,consumo_medio_kwh}',
      'endereco_da_propriedade', coalesce(nullif(btrim(contract #>> '{campos,endereco_instalacao}'), ''),
                                           nullif(btrim(proposal #>> '{campos,endereco}'), '')),
      'cidade', nullif(btrim(contract #>> '{campos,cidade}'), ''),
      'estado', nullif(btrim(contract #>> '{campos,uf}'), '')
    ))
  )) from commercial;
$function$;

create or replace function public.crm_message_fields(deal uuid, payload jsonb) returns jsonb
language sql stable set search_path=public as $$
  with data as (select payload->'data' as d),
  items as (
    select coalesce(d#>'{onboarding,itens}',d->'itens') as list,
           coalesce(nullif(d#>>'{onboarding,value}',''), d->>'valor_da_oportunidade') as price
    from data
  )
  select jsonb_build_object(
    'canal', coalesce(c.acquisition_channel,'Não informado'),
    'canal_contato', coalesce(c.contact_channel,'Não informado'),
    'email_responsavel', coalesce(p.contact_email,p.email,'Não informado'),
    'telefone_responsavel', coalesce(nullif(p.telefone,''),'Não informado'),
    'produto', coalesce((select string_agg(x->>'name', ', ' order by n) from jsonb_array_elements(list) with ordinality t(x,n) where nullif(btrim(x->>'name'),'') is not null), 'Não informado'),
    'preco', case when price ~ '^-?[0-9]+([.][0-9]+)?$' then 'R$ '||translate(to_char(price::numeric,'FM999,999,999,999,999,990.00'),',.','.,') else 'Não informado' end,
    'sla', case when s.max_idle_hours>0 then s.max_idle_hours::text||' h' else 'Sem SLA' end,
    'touchpoints', (select count(*) from touchpoints t where t.lead_id=o.lead_id),
    'ultimo_touchpoint', coalesce((select to_char(t.contact_date::date,'DD/MM/YYYY') from touchpoints t where t.lead_id=o.lead_id order by t.contact_date desc nulls last limit 1),'Sem registro')
  ) from opportunities o cross join items left join pipeline_stages_v2 s on s.id=o.stage_id
  left join profiles p on p.id=o.owner_id and p.equipe_id=o.equipe_id
  left join v_lead_channel c on c.lead_id=o.lead_id and c.equipe_id=o.equipe_id where o.id=deal;
$$;
