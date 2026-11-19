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
  select jsonb_set(payload, '{data,onboarding}', jsonb_build_object(
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
    'value', coalesce(nullif(proposal #> '{campos,preco_total}', 'null'), payload #> '{data,valor_da_oportunidade}'),
    'campos', (payload #> '{data,campos}') || jsonb_strip_nulls(jsonb_build_object(
      'potencia_do_sistema_kwp', proposal #> '{campos,potencia_kwp}',
      'consumo_medio_kwh', proposal #> '{campos,consumo_medio_kwh}',
      'endereco_da_propriedade', coalesce(nullif(btrim(contract #>> '{campos,endereco_instalacao}'), ''),
                                           nullif(btrim(proposal #>> '{campos,endereco}'), '')),
      'cidade', nullif(btrim(contract #>> '{campos,cidade}'), ''),
      'estado', nullif(btrim(contract #>> '{campos,uf}'), '')
    ))
  )) from selected;
$function$
