-- SE-DOCPIPE-001 — a esteira de propostas e contratos (Jestor → Rev), Fase 1.
--
-- ESTENDE a infra de artefatos da Sprint 11 · Onda 4 (T44/T45); não substitui.
-- Tudo aqui é `create or replace` ou `add … if not exists`: nenhuma coluna,
-- tabela ou função existente some, e as assinaturas antigas continuam valendo
-- (a edge `artifact-callback` já publicada segue funcionando antes do redeploy).
--
-- O que falta à infra existente e entra aqui:
--
--   1. O payload leva os OUTROS artefatos do negócio (`deal_artifacts`): o
--      "Enviar contrato" precisa da proposta para mesclar proposta + contrato.
--      Chave nova no payload v1 — quem não conhece, ignora.
--   2. O clique vira um núcleo reaproveitável (`_crm_start_artifact_run`), com
--      `trigger` no payload ("button" | "form_submit").
--   3. O ENVIO do formulário público pode disparar uma ação da tabela
--      (`form_config.on_submit_action_id`) — o "formulário dispara o n8n" do Jestor.
--   4. A aplicação de um retorno vira um núcleo só (`_crm_artifact_apply`), usado
--      pelo callback por token e pela entrada por ID.
--   5. Idempotência no retorno com `keep_open`: `event_id` opcional (o id do
--      evento do Clicksign / da execução do n8n); repetido = nada é reaplicado.
--      E o `keep_open` renova a validade do token (30 dias, até 90 da criação):
--      assinatura de contrato passa fácil dos 7 dias.
--   6. ENTRADA POR ID com o segredo do tenant (`artifact-inbound`): atualiza o
--      registro pelo id ou por um campo (ex.: `clicksign_document_id`), com
--      idempotência obrigatória por `event_id` (`artifact_inbound_events`).
--   7. Acesso a arquivo do artefato para a automação (URL assinada curta), por
--      token de uma execução aberta ou pelo segredo do tenant.
--
-- Contrato HTTP: docs/dev/projects/saas-salesengine-v1.0/SE-DOCPIPE-001/claude/integracao-n8n.md

-- ============================================================================
-- 1. OS CAMPOS DE UM REGISTRO, POR KEY (o mesmo que o payload v1 já mandava)
-- ============================================================================

create or replace function public._crm_artifact_record_fields(p_record_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with rec as (
    select r.*, public._crm_custom_table_row_json(r) as j
      from public.custom_table_records r
     where r.id = p_record_id
  ),
  tab as (
    select t.* from public.custom_tables t join rec on rec.table_id = t.id
  )
  select coalesce((
    select jsonb_object_agg(c->>'key',
             case c->>'type'
               when 'lookup' then rec.j->'lookups'->(c->>'field_id')
               when 'relation' then (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', tr.id,
                          'label', tr.data->>(c->'relationConfig'->>'displayField'))), '[]'::jsonb)
                   from public.custom_table_links l
                   join public.custom_table_records tr on tr.id = l.to_id and tr.deleted_at is null
                  where l.equipe_id = rec.equipe_id
                    and l.from_table = tab.slug
                    and l.from_id = rec.id
                    and l.relation_key = c->>'field_id'
                    and l.deleted_at is null)
               else rec.data->(c->>'field_id')
             end)
      from jsonb_array_elements(tab.table_schema) c
     where not coalesce((c->>'is_deleted')::boolean, false)
       and nullif(c->>'key', '') is not null), '{}'::jsonb)
    from rec, tab;
$$;

revoke all on function public._crm_artifact_record_fields(uuid) from public, anon, authenticated;

-- ============================================================================
-- 2. O PAYLOAD v1 + `deal_artifacts`
-- ============================================================================
--
-- Igual ao da T44, com uma chave a mais: os outros artefatos vivos do mesmo
-- negócio (até 20), cada um com status e campos por key. Arquivo continua
-- saindo como [{ name, size, type, path }]; a automação troca o `path` por uma
-- URL curta na `artifact-inbound` (action "file_url").

create or replace function public._crm_artifact_payload(p_record_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with rec as (
    select r.* from public.custom_table_records r where r.id = p_record_id
  ),
  tab as (
    select t.* from public.custom_tables t join rec on rec.table_id = t.id
  ),
  opp as (
    select o.* from public.opportunities o join rec on rec.opportunity_id = o.id
  )
  select jsonb_build_object(
    'table', (select jsonb_build_object('id', tab.id, 'name', tab.name, 'kind', tab.artifact_kind) from tab),
    'record', (select jsonb_build_object(
                 'id', rec.id,
                 'status', rec.artifact_status,
                 'created_at', rec.created_at,
                 'fields', coalesce(public._crm_artifact_record_fields(rec.id), '{}'::jsonb))
               from rec, tab),
    'deal', (select jsonb_build_object(
               'id', opp.id,
               'value', opp.value,
               'status', opp.status,
               'stage', (select jsonb_build_object('id', s.id, 'name', s.name) from public.pipeline_stages_v2 s where s.id = opp.stage_id),
               'pipeline', (select jsonb_build_object('id', p.id, 'name', p.name) from public.pipelines p where p.id = opp.pipeline_id),
               'owner', (select jsonb_build_object('id', pr.id, 'name', pr.nome_completo, 'email', pr.email)
                           from public.profiles pr where pr.id = opp.owner_id),
               'fields', coalesce((
                 select jsonb_object_agg(f->>'key', opp.custom_data->(f->>'field_id'))
                   from public.pipelines p, jsonb_array_elements(p.custom_fields_schema) f
                  where p.id = opp.pipeline_id
                    and jsonb_typeof(p.custom_fields_schema) = 'array'
                    and not coalesce((f->>'is_deleted')::boolean, false)
                    and nullif(f->>'key', '') is not null
                    and nullif(f->>'field_id', '') is not null), '{}'::jsonb))
             from opp),
    'contact', (select jsonb_build_object('id', l.id, 'name', l.name, 'phone', l.phone, 'email', l.email)
                  from opp join public.leads l on l.id = opp.lead_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity,
                                                           'unit_price', i.unit_price, 'total', i.total)
                                        order by i.position, i.created_at, i.id)
                         from opp join public.opportunity_items i on i.opportunity_id = opp.id and i.deleted_at is null),
                      '[]'::jsonb),
    'deal_artifacts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'table', jsonb_build_object('id', x.table_id, 'name', x.table_name, 'kind', x.kind),
               'record', jsonb_build_object(
                 'id', x.id,
                 'status', x.artifact_status,
                 'created_at', x.created_at,
                 'fields', coalesce(public._crm_artifact_record_fields(x.id), '{}'::jsonb)))
             order by x.kind_order, x.created_at desc, x.id)
        from (select r.id, r.artifact_status, r.created_at, t.id as table_id, t.name as table_name,
                     t.artifact_kind as kind,
                     case t.artifact_kind when 'proposal' then 0 when 'contract' then 1 else 2 end as kind_order
                from rec
                join public.custom_table_records r
                  on r.opportunity_id = rec.opportunity_id and r.id <> rec.id and r.deleted_at is null
                join public.custom_tables t
                  on t.id = r.table_id and t.artifact_kind is not null and t.deleted_at is null
               where rec.opportunity_id is not null
               order by kind_order, r.created_at desc, r.id
               limit 20) x), '[]'::jsonb));
$$;

revoke all on function public._crm_artifact_payload(uuid) from public, anon, authenticated;

-- ============================================================================
-- 3. O CLIQUE COMO NÚCLEO: botão ou envio de formulário
-- ============================================================================
--
-- O corpo é o de `crm_run_artifact_action` (T44), com a equipe e o autor como
-- parâmetros — o envio do formulário público não tem usuário logado. Só o banco
-- chama; o verbo público confere a equipe pelo token do usuário.

create or replace function public._crm_start_artifact_run(
  p_equipe     uuid,
  p_record_id  uuid,
  p_action_id  text,
  p_created_by uuid,
  p_trigger    text default 'button'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rec     public.custom_table_records;
  v_t       public.custom_tables;
  v_action  jsonb;
  v_cfg     public.webhook_configs;
  v_token   text;
  v_run     uuid;
  v_expires timestamptz := now() + interval '7 days';
  v_payload jsonb;
  v_log     uuid;
begin
  if p_trigger not in ('button', 'form_submit') then
    raise exception 'invalid_trigger' using errcode = '22023';
  end if;

  select * into v_rec from public.custom_table_records r
   where r.id = p_record_id and r.equipe_id = p_equipe and r.deleted_at is null;
  if p_equipe is null or not found then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;

  select * into v_t from public.custom_tables t where t.id = v_rec.table_id;
  if v_t.artifact_kind is null then
    raise exception 'not_an_artifact_table' using errcode = '22023';
  end if;

  v_action := (select e.value from jsonb_array_elements(v_t.actions) e where e.value->>'id' = p_action_id limit 1);
  select * into v_cfg from public.webhook_configs c
   where c.id = (v_action->>'webhook_config_id')::uuid and c.equipe_id = p_equipe;
  if v_action is null or not found or not coalesce(v_cfg.active, false) or nullif(btrim(v_cfg.url), '') is null then
    raise exception 'action_not_found' using errcode = 'P0002';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.artifact_action_runs
    (equipe_id, record_id, table_id, action_id, action_label, token_hash, expires_at, created_by)
  values
    (p_equipe, v_rec.id, v_t.id, p_action_id, v_action->>'label',
     encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires, p_created_by)
  returning id into v_run;

  v_payload := jsonb_build_object(
      'version', 1,
      'run_id', v_run,
      'trigger', p_trigger,
      'action', jsonb_build_object('id', p_action_id, 'label', v_action->>'label'))
    || public._crm_artifact_payload(v_rec.id)
    || jsonb_build_object('callback', jsonb_build_object(
         'url', public._crm_functions_url('artifact-callback'),
         'token', v_token,
         'expires_at', v_expires));

  perform public.enqueue_crm_webhooks(p_equipe, 'artifact_action:' || p_action_id,
                                      jsonb_build_object('artifact', v_payload));

  select l.id into v_log from public.webhook_logs l
   where l.webhook_config_id = v_cfg.id and l.payload->>'run_id' = v_run::text
   order by l.created_at desc limit 1;
  update public.artifact_action_runs set webhook_log_id = v_log where id = v_run;

  return jsonb_build_object('run_id', v_run, 'status', 'queued', 'webhook_log_id', v_log);
end;
$$;

revoke all on function public._crm_start_artifact_run(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- O verbo do botão (mesma assinatura e mesmas respostas da T44).
create or replace function public.crm_run_artifact_action(p_record_id uuid, p_action_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_equipe uuid;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;
  return public._crm_start_artifact_run(v_equipe, p_record_id, p_action_id, auth.uid(), 'button');
end;
$$;

revoke all on function public.crm_run_artifact_action(uuid, text) from public, anon;
grant execute on function public.crm_run_artifact_action(uuid, text) to authenticated;

-- ============================================================================
-- 4. APLICAR UM RETORNO (núcleo do callback e da entrada por ID)
-- ============================================================================
--
-- O miolo de `_crm_artifact_callback_finish` (T44), sem a execução: campos por
-- key (consulta, relação e arquivo não se escrevem assim), arquivos já no
-- bucket e status pela regra do T43, autor "automation".

create or replace function public._crm_artifact_apply(
  p_record_id uuid,
  p_status    text,
  p_fields    jsonb,
  p_files     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec     public.custom_table_records;
  v_t       public.custom_tables;
  v_data    jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_ignored jsonb := '[]'::jsonb;
  e         record;
  v_fid     text;
  f         jsonb;
  v_nfiles  integer := 0;
  v_status  jsonb;
begin
  select * into v_rec from public.custom_table_records where id = p_record_id and deleted_at is null for update;
  if not found then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;
  select * into v_t from public.custom_tables where id = v_rec.table_id;

  if p_status is not null and not (p_status = any (public._crm_artifact_statuses(v_t.artifact_kind))) then
    raise exception 'invalid_artifact_status' using errcode = '22023';
  end if;

  v_data := v_rec.data;

  for e in select * from jsonb_each(case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}'::jsonb end) loop
    v_fid := null;
    select c->>'field_id' into v_fid
      from jsonb_array_elements(v_t.table_schema) c
     where c->>'key' = e.key
       and not coalesce((c->>'is_deleted')::boolean, false)
       and coalesce(c->>'type', 'text') not in ('lookup', 'relation', 'file')
     limit 1;
    if v_fid is null then
      v_ignored := v_ignored || to_jsonb(e.key);
    else
      v_data := jsonb_set(v_data, array[v_fid], e.value);
      v_applied := v_applied || to_jsonb(e.key);
    end if;
  end loop;

  for f in select x.value from jsonb_array_elements(case when jsonb_typeof(p_files) = 'array' then p_files else '[]'::jsonb end) x loop
    v_fid := f->>'field_id';
    if not exists (select 1 from jsonb_array_elements(v_t.table_schema) c
                    where c->>'field_id' = v_fid and c->>'type' = 'file') then
      raise exception 'invalid_file_field' using errcode = '22023';
    end if;
    v_data := jsonb_set(v_data, array[v_fid],
                        (case when jsonb_typeof(v_data->v_fid) = 'array' then v_data->v_fid else '[]'::jsonb end)
                        || jsonb_build_array(jsonb_build_object(
                             'path', f->>'path', 'name', f->>'name', 'size', (f->>'size')::bigint,
                             'type', f->>'type', 'uploaded_at', now())));
    v_nfiles := v_nfiles + 1;
  end loop;

  if v_data is distinct from v_rec.data then
    update public.custom_table_records set data = v_data where id = v_rec.id;
  end if;

  if p_status is not null then
    v_status := public._crm_apply_artifact_status(v_rec.id, p_status, 'automation');
  end if;

  return jsonb_build_object(
    'fields_applied', v_applied,
    'fields_ignored', v_ignored,
    'files', v_nfiles,
    'artifact_status', p_status,
    'moved', coalesce((v_status->>'moved')::boolean, false),
    'event', v_status->>'event');
end;
$$;

revoke all on function public._crm_artifact_apply(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- ============================================================================
-- 5. O CALLBACK POR TOKEN: `event_id` e validade renovada no keep_open
-- ============================================================================

-- Antes de baixar: esse evento já foi aplicado nesta execução? Se sim, solta a
-- execução (sem registrar erro) e a edge responde 200 `duplicate`.
create or replace function public._crm_artifact_callback_seen(p_run_id uuid, p_event_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := nullif(btrim(coalesce(p_event_id, '')), '');
begin
  if v_event is null then
    return false;
  end if;
  update public.artifact_action_runs
     set status = 'queued', claimed_at = null
   where id = p_run_id
     and status = 'claimed'
     and coalesce(result->'event_ids', '[]'::jsonb) ? v_event;
  return found;
end;
$$;

-- `_crm_artifact_callback_finish` (T44) + `p_event_id`:
--   - evento já aplicado → nada muda, a execução volta a esperar;
--   - `keep_open` → o token passa a valer mais 30 dias a partir de agora (nunca
--     menos do que já valia; teto de 90 dias desde o clique);
--   - os últimos 50 `event_id` aplicados ficam em `result.event_ids`.
create or replace function public._crm_artifact_callback_apply(
  p_run_id    uuid,
  p_status    text,
  p_fields    jsonb,
  p_files     jsonb,
  p_error     text,
  p_keep_open boolean,
  p_event_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run     public.artifact_action_runs;
  v_event   text := nullif(btrim(coalesce(p_event_id, '')), '');
  v_events  jsonb;
  v_result  jsonb;
  v_expires timestamptz;
begin
  select * into v_run from public.artifact_action_runs where id = p_run_id for update;
  if not found or v_run.status <> 'claimed' then
    raise exception 'run_not_claimed' using errcode = '55000';
  end if;

  v_events := coalesce(v_run.result->'event_ids', '[]'::jsonb);
  if v_event is not null and v_events ? v_event then
    update public.artifact_action_runs set status = 'queued', claimed_at = null where id = v_run.id;
    return jsonb_build_object('status', 'duplicate', 'event_id', v_event);
  end if;
  if v_event is not null then
    v_events := (select coalesce(jsonb_agg(x.value order by x.ord), '[]'::jsonb)
                   from jsonb_array_elements(v_events || to_jsonb(v_event)) with ordinality x(value, ord)
                  where x.ord > jsonb_array_length(v_events) + 1 - 50);
  end if;

  if nullif(btrim(coalesce(p_error, '')), '') is not null then
    v_result := jsonb_build_object('error', left(p_error, 1000));
    update public.artifact_action_runs
       set status = 'failed', finished_at = now(),
           result = coalesce(result, '{}'::jsonb) || v_result || jsonb_build_object('event_ids', v_events)
     where id = v_run.id;
    return jsonb_build_object('status', 'failed') || v_result;
  end if;

  v_result := public._crm_artifact_apply(v_run.record_id, p_status, p_fields, p_files);
  if v_event is not null then
    v_result := v_result || jsonb_build_object('event_id', v_event);
  end if;

  if coalesce(p_keep_open, false) then
    v_expires := least(v_run.created_at + interval '90 days',
                       greatest(v_run.expires_at, now() + interval '30 days'));
    update public.artifact_action_runs
       set status = 'queued', claimed_at = null, expires_at = v_expires,
           result = coalesce(result, '{}'::jsonb)
                    || jsonb_build_object('responses', coalesce(result->'responses', '[]'::jsonb)
                                                       || jsonb_build_array(v_result || jsonb_build_object('at', now())),
                                          'event_ids', v_events)
     where id = v_run.id;
    return jsonb_build_object('status', 'open', 'expires_at', v_expires) || v_result;
  end if;

  update public.artifact_action_runs
     set status = 'completed', finished_at = now(),
         result = coalesce(result, '{}'::jsonb) || v_result || jsonb_build_object('event_ids', v_events)
   where id = v_run.id;

  return jsonb_build_object('status', 'completed') || v_result;
end;
$$;

-- A assinatura da T44 continua existindo (edge antiga, antes do redeploy) e
-- passa pelo mesmo caminho, sem `event_id`.
create or replace function public._crm_artifact_callback_finish(
  p_run_id    uuid,
  p_status    text,
  p_fields    jsonb,
  p_files     jsonb,
  p_error     text default null,
  p_keep_open boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._crm_artifact_callback_apply(p_run_id, p_status, p_fields, p_files, p_error, p_keep_open, null);
end;
$$;

revoke all on function public._crm_artifact_callback_seen(uuid, text) from public, anon, authenticated;
revoke all on function public._crm_artifact_callback_apply(uuid, text, jsonb, jsonb, text, boolean, text) from public, anon, authenticated;
revoke all on function public._crm_artifact_callback_finish(uuid, text, jsonb, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public._crm_artifact_callback_seen(uuid, text) to service_role;
grant execute on function public._crm_artifact_callback_apply(uuid, text, jsonb, jsonb, text, boolean, text) to service_role;
grant execute on function public._crm_artifact_callback_finish(uuid, text, jsonb, jsonb, text, boolean) to service_role;

-- ============================================================================
-- 6. O ENVIO DO FORMULÁRIO DISPARA UMA AÇÃO
-- ============================================================================
--
-- `form_config.on_submit_action_id`: uma das ações da tabela (ou nada). O envio
-- do cliente grava os dados e, na mesma transação, enfileira a ação (payload
-- com `trigger: "form_submit"`). Se a ação sumiu ou foi desligada, o envio do
-- cliente NÃO falha: a ação é pulada (aviso no log) e a equipe clica à mão.

create or replace function public.crm_save_form_config(p_table_id uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe  uuid;
  v_t       public.custom_tables;
  v_enabled boolean;
  v_title   text;
  v_intro   text;
  v_action  text;
  f         jsonb;
  v_fields  jsonb := '[]'::jsonb;
  v_col     jsonb;
  v_out     jsonb;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  select * into v_t from public.custom_tables t
   where t.id = p_table_id and t.equipe_id = v_equipe and t.deleted_at is null;
  if v_equipe is null or not found then
    raise exception 'table_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_config) is distinct from 'object' then
    raise exception 'invalid_form_config' using errcode = '22023';
  end if;

  v_enabled := coalesce((p_config->>'enabled')::boolean, false);
  v_title := left(btrim(coalesce(p_config->>'title', '')), 120);
  v_intro := left(btrim(coalesce(p_config->>'intro', '')), 1000);
  v_action := nullif(btrim(coalesce(p_config->>'on_submit_action_id', '')), '');

  if v_action is not null
     and not exists (select 1 from jsonb_array_elements(v_t.actions) a where a->>'id' = v_action) then
    raise exception 'invalid_submit_action' using errcode = '22023';
  end if;

  for f in select e.value from jsonb_array_elements(
             case when jsonb_typeof(p_config->'fields') = 'array' then p_config->'fields' else '[]'::jsonb end) e loop
    v_col := (select c from jsonb_array_elements(v_t.table_schema) c
               where c->>'field_id' = f->>'field_id'
                 and not coalesce((c->>'is_deleted')::boolean, false)
               limit 1);
    if v_col is null or not (coalesce(v_col->>'type', 'text') = any (public._crm_form_field_types())) then
      raise exception 'invalid_form_field' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_fields) x where x->>'field_id' = f->>'field_id') then
      continue;
    end if;
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'field_id', f->>'field_id', 'required', coalesce((f->>'required')::boolean, false)));
  end loop;

  if v_enabled and jsonb_array_length(v_fields) = 0 then
    raise exception 'form_needs_fields' using errcode = '22023';
  end if;

  v_out := jsonb_build_object('enabled', v_enabled, 'title', v_title, 'intro', v_intro, 'fields', v_fields,
                              'on_submit_action_id', v_action);
  update public.custom_tables set form_config = v_out where id = v_t.id;
  return v_out;
end;
$$;

revoke all on function public.crm_save_form_config(uuid, jsonb) from public, anon;
grant execute on function public.crm_save_form_config(uuid, jsonb) to authenticated;

-- O envio (T45) + o disparo. A validação por tipo é a mesma, linha a linha.
create or replace function public._crm_public_form_submit(p_token text, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link    public.custom_record_form_links;
  v_t       public.custom_tables;
  v_rec     public.custom_table_records;
  v_data    jsonb;
  f         record;
  c         jsonb;
  v_key     text;
  v_type    text;
  v         jsonb;
  v_text    text;
  v_num     numeric;
  v_n       integer := 0;
  v_action  text;
  v_auto    text;
begin
  v_link := public._crm_public_form_link(p_token, true);
  select * into v_t from public.custom_tables where id = v_link.table_id;
  select * into v_rec from public.custom_table_records where id = v_link.record_id for update;
  v_data := v_rec.data;

  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'invalid_values' using errcode = '22023';
  end if;

  for f in select e.value from jsonb_array_elements(v_t.form_config->'fields') e loop
    c := (select x from jsonb_array_elements(v_t.table_schema) x
           where x->>'field_id' = f.value->>'field_id' and not coalesce((x->>'is_deleted')::boolean, false) limit 1);
    continue when c is null;
    v_key := c->>'key';
    v_type := coalesce(c->>'type', 'text');
    v := p_values->v_key;

    -- Vazio: absent, null, texto em branco, lista vazia.
    if v is null or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
      if coalesce((f.value->>'required')::boolean, false) then
        raise exception 'required:%', v_key using errcode = '22023';
      end if;
      continue;
    end if;

    if v_type in ('text', 'url', 'phone', 'select', 'date') then
      if jsonb_typeof(v) <> 'string' then
        raise exception 'invalid_field:%', v_key using errcode = '22023';
      end if;
      v_text := btrim(v #>> '{}');
      if length(v_text) > 2000
         or (v_type = 'url' and v_text !~ '^https?://[^[:space:]]+$')
         or (v_type = 'phone' and length(regexp_replace(v_text, '\D', '', 'g')) not between 8 and 15)
         or (v_type = 'select' and not coalesce(c->'options', '[]'::jsonb) ? v_text)
         or (v_type = 'date' and public._crm_try_timestamptz(v_text) is null) then
        raise exception 'invalid_field:%', v_key using errcode = '22023';
      end if;
      v := to_jsonb(v_text);
    elsif v_type in ('number', 'currency') then
      v_num := case jsonb_typeof(v)
                 when 'number' then (v #>> '{}')::numeric
                 when 'string' then public._crm_parse_br_number(v #>> '{}')
               end;
      if v_num is null then
        raise exception 'invalid_field:%', v_key using errcode = '22023';
      end if;
      v := to_jsonb(v_num);
    elsif v_type = 'boolean' then
      if jsonb_typeof(v) <> 'boolean' then
        raise exception 'invalid_field:%', v_key using errcode = '22023';
      end if;
    elsif v_type = 'multi_select' then
      if jsonb_typeof(v) <> 'array'
         or exists (select 1 from jsonb_array_elements(v) o
                     where jsonb_typeof(o) <> 'string' or not coalesce(c->'options', '[]'::jsonb) ? (o #>> '{}')) then
        raise exception 'invalid_field:%', v_key using errcode = '22023';
      end if;
    else
      continue;
    end if;

    v_data := jsonb_set(v_data, array[c->>'field_id'], v);
    v_n := v_n + 1;
  end loop;

  if v_data is distinct from v_rec.data then
    update public.custom_table_records set data = v_data where id = v_rec.id;
  end if;
  update public.custom_record_form_links set submitted_at = now() where id = v_link.id;

  -- O disparo: depois dos dados gravados, para o payload já levar o que o
  -- cliente preencheu. Uma falha aqui desfaz só o disparo, nunca o envio.
  v_action := nullif(v_t.form_config->>'on_submit_action_id', '');
  if v_action is not null then
    begin
      perform public._crm_start_artifact_run(v_link.equipe_id, v_rec.id, v_action, null, 'form_submit');
      v_auto := 'queued';
    exception when others then
      v_auto := 'skipped';
      raise warning '[public_form] ação % do envio pulada (registro %): %', v_action, v_rec.id, sqlerrm;
    end;
  end if;

  return jsonb_build_object('ok', true, 'fields', v_n, 'automation', v_auto);
end;
$$;

revoke all on function public._crm_public_form_submit(text, jsonb) from public, anon, authenticated;
grant execute on function public._crm_public_form_submit(text, jsonb) to service_role;

-- ============================================================================
-- 7. A ENTRADA POR ID (segredo do tenant) — idempotente por `event_id`
-- ============================================================================

create table if not exists public.artifact_inbound_events (
  id           uuid primary key default gen_random_uuid(),
  equipe_id    uuid not null references public.equipes(id) on delete cascade,
  event_id     text not null check (length(event_id) between 1 and 200),
  record_id    uuid references public.custom_table_records(id) on delete set null,
  status       text not null default 'processing'
               check (status in ('processing', 'applied', 'failed')),
  claimed_at   timestamptz not null default now(),
  finished_at  timestamptz,
  result       jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  unique (equipe_id, event_id)
);

create index if not exists idx_artifact_inbound_events_record
  on public.artifact_inbound_events (record_id, created_at desc);

alter table public.artifact_inbound_events enable row level security;
drop policy if exists artifact_inbound_events_team_read on public.artifact_inbound_events;
create policy artifact_inbound_events_team_read on public.artifact_inbound_events
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
-- Sem política de escrita: só a edge (service_role) grava, pelas funções abaixo.

-- Segura o evento e acha o registro. O registro vem pelo id, ou por um campo
-- gravável (key + valor, ex.: clicksign_document_id) — opcionalmente só numa
-- tabela. Só tabela de artefato, só da equipe do segredo. Devolve o mesmo que
-- o claim do callback, para a edge validar o corpo antes de baixar arquivo.
create or replace function public._crm_artifact_inbound_begin(
  p_equipe      uuid,
  p_event_id    text,
  p_record_id   uuid,
  p_table_id    uuid,
  p_match_key   text,
  p_match_value text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := btrim(coalesce(p_event_id, ''));
  v_ev    public.artifact_inbound_events;
  v_ids   uuid[];
  v_rec   public.custom_table_records;
  v_t     public.custom_tables;
begin
  if v_event = '' or length(v_event) > 200 then
    raise exception 'event_id_required' using errcode = '22023';
  end if;

  -- 1. Já visto?
  select * into v_ev from public.artifact_inbound_events
   where equipe_id = p_equipe and event_id = v_event
   for update;
  if found and v_ev.status = 'applied' then
    return jsonb_build_object('duplicate', true, 'record_id', v_ev.record_id, 'result', v_ev.result);
  end if;
  if found and v_ev.status = 'processing' and v_ev.claimed_at > now() - interval '5 minutes' then
    raise exception 'event_in_progress' using errcode = '55P03';
  end if;

  -- 2. O registro.
  if p_record_id is not null then
    select array_agg(r.id) into v_ids
      from public.custom_table_records r
      join public.custom_tables t on t.id = r.table_id
     where r.id = p_record_id and r.equipe_id = p_equipe and r.deleted_at is null
       and t.artifact_kind is not null and t.deleted_at is null;
  elsif nullif(btrim(coalesce(p_match_key, '')), '') is not null and nullif(btrim(coalesce(p_match_value, '')), '') is not null then
    select array_agg(r.id) into v_ids
      from public.custom_table_records r
      join public.custom_tables t on t.id = r.table_id
      cross join lateral (select c->>'field_id' as fid
                            from jsonb_array_elements(t.table_schema) c
                           where c->>'key' = btrim(p_match_key)
                             and not coalesce((c->>'is_deleted')::boolean, false)
                             and coalesce(c->>'type', 'text') not in ('lookup', 'relation', 'file')
                           limit 1) col
     where r.equipe_id = p_equipe and r.deleted_at is null
       and t.equipe_id = p_equipe and t.artifact_kind is not null and t.deleted_at is null
       and (p_table_id is null or t.id = p_table_id)
       and r.data->>col.fid = btrim(p_match_value);
  else
    raise exception 'record_required' using errcode = '22023';
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;
  if array_length(v_ids, 1) > 1 then
    raise exception 'record_ambiguous' using errcode = '22023';
  end if;
  select * into v_rec from public.custom_table_records where id = v_ids[1];
  select * into v_t from public.custom_tables where id = v_rec.table_id;

  -- 3. O evento: novo, ou retomado (falhou / ficou preso) — sempre no mesmo registro.
  if v_ev.id is null then
    insert into public.artifact_inbound_events (equipe_id, event_id, record_id)
    values (p_equipe, v_event, v_rec.id)
    on conflict (equipe_id, event_id) do nothing
    returning * into v_ev;
    if v_ev.id is null then
      raise exception 'event_in_progress' using errcode = '55P03';
    end if;
  else
    if v_ev.record_id is distinct from v_rec.id then
      raise exception 'event_id_reused' using errcode = '22023';
    end if;
    update public.artifact_inbound_events
       set status = 'processing', claimed_at = now(), error = null
     where id = v_ev.id;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'event_row_id', v_ev.id,
    'equipe_id', p_equipe,
    'table_id', v_t.id,
    'record_id', v_rec.id,
    'statuses', to_jsonb(public._crm_artifact_statuses(v_t.artifact_kind)),
    'writable_keys', coalesce((select jsonb_agg(c->>'key') from jsonb_array_elements(v_t.table_schema) c
                                where not coalesce((c->>'is_deleted')::boolean, false)
                                  and coalesce(c->>'type', 'text') not in ('lookup', 'relation', 'file')), '[]'::jsonb),
    'file_columns', coalesce((select jsonb_agg(jsonb_build_object('field_id', c->>'field_id', 'key', c->>'key'))
                                from jsonb_array_elements(v_t.table_schema) c
                               where not coalesce((c->>'is_deleted')::boolean, false)
                                 and c->>'type' = 'file'), '[]'::jsonb));
end;
$$;

create or replace function public._crm_artifact_inbound_finish(
  p_event_row_id uuid,
  p_status       text,
  p_fields       jsonb,
  p_files        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev     public.artifact_inbound_events;
  v_result jsonb;
begin
  select * into v_ev from public.artifact_inbound_events where id = p_event_row_id for update;
  if not found or v_ev.status <> 'processing' or v_ev.record_id is null then
    raise exception 'event_not_claimed' using errcode = '55000';
  end if;

  v_result := public._crm_artifact_apply(v_ev.record_id, p_status, p_fields, p_files);

  update public.artifact_inbound_events
     set status = 'applied', finished_at = now(), result = v_result, error = null
   where id = v_ev.id;
  return v_result;
end;
$$;

-- Corpo que o registro não aceita, ou download que falhou: o evento fica
-- `failed` e o mesmo `event_id` pode ser reenviado.
create or replace function public._crm_artifact_inbound_release(p_event_row_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.artifact_inbound_events
     set status = 'failed', error = left(coalesce(p_error, ''), 1000)
   where id = p_event_row_id and status = 'processing';
$$;

-- ============================================================================
-- 8. ARQUIVO DO ARTEFATO PARA A AUTOMAÇÃO
-- ============================================================================
--
-- A equipe dona de uma execução ainda aberta (token válido, não encerrada). A
-- edge só assina caminho dentro da pasta dessa equipe no bucket.

create or replace function public._crm_artifact_run_equipe(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select r.equipe_id
    from public.artifact_action_runs r
   where r.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and r.finished_at is null
     and r.expires_at > now();
$$;

revoke all on function public._crm_artifact_inbound_begin(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public._crm_artifact_inbound_finish(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._crm_artifact_inbound_release(uuid, text) from public, anon, authenticated;
revoke all on function public._crm_artifact_run_equipe(text) from public, anon, authenticated;
grant execute on function public._crm_artifact_inbound_begin(uuid, text, uuid, uuid, text, text) to service_role;
grant execute on function public._crm_artifact_inbound_finish(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public._crm_artifact_inbound_release(uuid, text) to service_role;
grant execute on function public._crm_artifact_run_equipe(text) to service_role;
