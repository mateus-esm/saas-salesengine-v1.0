-- Sprint 11 · Onda 4 · T44 — botão de automação com retorno, contrato v1 (decisão 26).
--
-- A tabela de artefato ganha AÇÕES (rótulo + URL: "Gerar proposta", "Enviar para
-- assinatura"). O clique chama `crm_run_artifact_action`, que monta o payload v1
-- (registro por key, negócio, contato, itens, e o retorno: URL + token) e o põe
-- na FILA DE SAÍDA que já existe (achado 28): cada ação é um `webhook_configs`
-- com evento próprio (`artifact_action:<id>`) e modelo `"{{artifact}}"` (o
-- payload passa inteiro), então a entrega é a de sempre — `enqueue_crm_webhooks`
-- → `deliver-crm-webhook` → `webhook_logs`. Não nasce outro caminho de saída.
--
-- O RETORNO chega na edge `artifact-callback` (pública, só com o token): status,
-- campos por key e arquivos (baixados para o bucket privado). O token é de uso
-- único, vale 7 dias e fica guardado como hash (sha256). A edge chama as três
-- funções do fim deste arquivo, que só o service_role executa.
--
-- O contrato está em Planning/Architecture/contrato_artefato_v1.md.

-- ============================================================================
-- 1. AS AÇÕES DA TABELA E AS EXECUÇÕES
-- ============================================================================

-- [{ id, label, webhook_config_id }] — a URL mora no webhook_configs.
alter table public.custom_tables add column if not exists actions jsonb not null default '[]'::jsonb;

create table if not exists public.artifact_action_runs (
  id              uuid primary key default gen_random_uuid(),
  equipe_id       uuid not null references public.equipes(id) on delete cascade,
  record_id       uuid not null references public.custom_table_records(id) on delete cascade,
  table_id        uuid not null references public.custom_tables(id) on delete cascade,
  action_id       text not null,
  action_label    text not null,
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  status          text not null default 'queued'
                  check (status in ('queued', 'claimed', 'completed', 'failed')),
  claimed_at      timestamptz,
  finished_at     timestamptz,
  result          jsonb,
  webhook_log_id  uuid,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

create index if not exists idx_artifact_action_runs_record
  on public.artifact_action_runs (record_id, created_at desc);

alter table public.artifact_action_runs enable row level security;
drop policy if exists artifact_action_runs_team_read on public.artifact_action_runs;
create policy artifact_action_runs_team_read on public.artifact_action_runs
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
-- Sem política de escrita: só o banco (verbos security definer) grava.

-- ============================================================================
-- 2. CONFIGURAR AS AÇÕES
-- ============================================================================

create or replace function public._crm_functions_url(p_name text)
returns text
language sql
immutable
as $$
  select 'https://egxzsivzqlqadoqpgfby.supabase.co/functions/v1/' || p_name;
$$;

-- Troca a lista de ações da tabela: [{ id?, label, url }]. Ação que sai fica com
-- o webhook desligado (o histórico de entregas continua apontando para ele).
create or replace function public.crm_save_artifact_actions(p_table_id uuid, p_actions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_t      public.custom_tables;
  a        jsonb;
  v_id     text;
  v_label  text;
  v_url    text;
  v_cfg    uuid;
  v_old    jsonb;
  v_new    jsonb := '[]'::jsonb;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  select * into v_t from public.custom_tables t
   where t.id = p_table_id and t.equipe_id = v_equipe and t.deleted_at is null;
  if v_equipe is null or not found then
    raise exception 'table_not_found' using errcode = 'P0002';
  end if;
  if v_t.artifact_kind is null then
    raise exception 'not_an_artifact_table' using errcode = '22023';
  end if;
  if jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions) > 10 then
    raise exception 'invalid_actions' using errcode = '22023';
  end if;

  for a in select e.value from jsonb_array_elements(p_actions) e loop
    v_label := btrim(coalesce(a->>'label', ''));
    v_url   := btrim(coalesce(a->>'url', ''));
    if v_label = '' or length(v_label) > 60 or v_url !~ '^https?://[^[:space:]]+$' then
      raise exception 'invalid_action' using errcode = '22023';
    end if;

    v_id := nullif(a->>'id', '');
    v_old := (select e.value from jsonb_array_elements(v_t.actions) e where e.value->>'id' = v_id limit 1);
    v_cfg := case when v_old is not null then (v_old->>'webhook_config_id')::uuid end;

    if v_cfg is not null then
      update public.webhook_configs
         set name = 'Artefato · ' || v_t.name || ' · ' || v_label, url = v_url, active = true
       where id = v_cfg and equipe_id = v_equipe;
    else
      v_id := gen_random_uuid()::text;
      insert into public.webhook_configs
        (equipe_id, name, url, trigger_event, active, headers, field_mappings, payload_template)
      values
        (v_equipe, 'Artefato · ' || v_t.name || ' · ' || v_label, v_url, 'artifact_action:' || v_id,
         true, '{}'::jsonb, '[]'::jsonb, to_jsonb('{{artifact}}'::text))
      returning id into v_cfg;
    end if;

    v_new := v_new || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'webhook_config_id', v_cfg));
  end loop;

  -- As que saíram: webhook desligado.
  update public.webhook_configs c
     set active = false
   where c.equipe_id = v_equipe
     and c.id in (select (e.value->>'webhook_config_id')::uuid from jsonb_array_elements(v_t.actions) e)
     and c.id not in (select (e.value->>'webhook_config_id')::uuid from jsonb_array_elements(v_new) e);

  update public.custom_tables set actions = v_new where id = v_t.id;

  return public.crm_artifact_actions(p_table_id);
end;
$$;

-- As ações com a URL (para o editor da tabela).
create or replace function public.crm_artifact_actions(p_table_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.value->>'id', 'label', e.value->>'label', 'url', c.url)
                            order by e.ordinality), '[]'::jsonb)
    from public.custom_tables t
    cross join lateral jsonb_array_elements(t.actions) with ordinality e(value, ordinality)
    left join public.webhook_configs c on c.id = (e.value->>'webhook_config_id')::uuid
   where t.id = p_table_id;
$$;

-- ============================================================================
-- 3. O PAYLOAD v1
-- ============================================================================
--
-- Tudo por KEY (o nome público): registro, campos do negócio. Consulta sai com o
-- valor de agora; relação sai como [{id, label}]; arquivo sai como
-- [{name, size, type, path}] (baixar o arquivo fica para a v2 do contrato).

create or replace function public._crm_artifact_payload(p_record_id uuid)
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
                 'fields', coalesce((
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
                      and nullif(c->>'key', '') is not null), '{}'::jsonb))
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
                      '[]'::jsonb));
$$;

revoke all on function public._crm_artifact_payload(uuid) from public, anon, authenticated;

-- ============================================================================
-- 4. O CLIQUE
-- ============================================================================

create or replace function public.crm_run_artifact_action(p_record_id uuid, p_action_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_equipe  uuid;
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
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  select * into v_rec from public.custom_table_records r
   where r.id = p_record_id and r.equipe_id = v_equipe and r.deleted_at is null;
  if v_equipe is null or not found then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;

  select * into v_t from public.custom_tables t where t.id = v_rec.table_id;
  if v_t.artifact_kind is null then
    raise exception 'not_an_artifact_table' using errcode = '22023';
  end if;

  v_action := (select e.value from jsonb_array_elements(v_t.actions) e where e.value->>'id' = p_action_id limit 1);
  select * into v_cfg from public.webhook_configs c
   where c.id = (v_action->>'webhook_config_id')::uuid and c.equipe_id = v_equipe;
  if v_action is null or not found or not coalesce(v_cfg.active, false) or nullif(btrim(v_cfg.url), '') is null then
    raise exception 'action_not_found' using errcode = 'P0002';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.artifact_action_runs
    (equipe_id, record_id, table_id, action_id, action_label, token_hash, expires_at, created_by)
  values
    (v_equipe, v_rec.id, v_t.id, p_action_id, v_action->>'label',
     encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires, auth.uid())
  returning id into v_run;

  v_payload := jsonb_build_object(
      'version', 1,
      'run_id', v_run,
      'action', jsonb_build_object('id', p_action_id, 'label', v_action->>'label'))
    || public._crm_artifact_payload(v_rec.id)
    || jsonb_build_object('callback', jsonb_build_object(
         'url', public._crm_functions_url('artifact-callback'),
         'token', v_token,
         'expires_at', v_expires));

  perform public.enqueue_crm_webhooks(v_equipe, 'artifact_action:' || p_action_id,
                                      jsonb_build_object('artifact', v_payload));

  select l.id into v_log from public.webhook_logs l
   where l.webhook_config_id = v_cfg.id and l.payload->>'run_id' = v_run::text
   order by l.created_at desc limit 1;
  update public.artifact_action_runs set webhook_log_id = v_log where id = v_run;

  return jsonb_build_object('run_id', v_run, 'status', 'queued', 'webhook_log_id', v_log);
end;
$$;

-- ============================================================================
-- 5. O RETORNO (só a edge artifact-callback, com o service_role)
-- ============================================================================

-- Valida o token e segura a execução (uma chamada por vez; 5 minutos de folga
-- para uma edge que caiu no meio). Devolve o que a edge precisa para validar o
-- corpo antes de baixar qualquer arquivo.
create or replace function public._crm_artifact_callback_claim(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_run  public.artifact_action_runs;
  v_t    public.custom_tables;
begin
  select * into v_run from public.artifact_action_runs
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then
    raise exception 'token_invalid' using errcode = 'P0002';
  end if;
  if v_run.finished_at is not null then
    raise exception 'token_used' using errcode = '22023';
  end if;
  if v_run.expires_at < now() then
    raise exception 'token_expired' using errcode = '22023';
  end if;
  if v_run.status = 'claimed' and v_run.claimed_at > now() - interval '5 minutes' then
    raise exception 'callback_in_progress' using errcode = '55P03';
  end if;

  update public.artifact_action_runs set status = 'claimed', claimed_at = now() where id = v_run.id;

  select * into v_t from public.custom_tables where id = v_run.table_id;
  return jsonb_build_object(
    'run_id', v_run.id,
    'equipe_id', v_run.equipe_id,
    'table_id', v_run.table_id,
    'record_id', v_run.record_id,
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

-- Solta a execução (corpo inválido ou download que falhou): o n8n pode tentar de novo.
create or replace function public._crm_artifact_callback_release(p_run_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.artifact_action_runs
     set status = 'queued', claimed_at = null,
         result = coalesce(result, '{}'::jsonb) || jsonb_build_object('last_error', p_error, 'last_error_at', now())
   where id = p_run_id and status = 'claimed';
$$;

-- Aplica o retorno numa transação só: campos (por key; consulta, relação e
-- arquivo não se escrevem assim), arquivos (já no bucket) e status (pela regra
-- do T43, autor "automation"). `p_error` = o n8n avisou que falhou.
-- `p_keep_open` = a automação ainda vai responder de novo (o contrato foi
-- enviado; a assinatura chega dias depois): aplica e deixa o token valendo até
-- vencer — cada resposta entra no histórico da execução.
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
declare
  v_run     public.artifact_action_runs;
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
  v_result  jsonb;
begin
  select * into v_run from public.artifact_action_runs where id = p_run_id for update;
  if not found or v_run.status <> 'claimed' then
    raise exception 'run_not_claimed' using errcode = '55000';
  end if;

  if nullif(btrim(coalesce(p_error, '')), '') is not null then
    v_result := jsonb_build_object('error', left(p_error, 1000));
    update public.artifact_action_runs
       set status = 'failed', finished_at = now(), result = coalesce(result, '{}'::jsonb) || v_result
     where id = v_run.id;
    return jsonb_build_object('status', 'failed') || v_result;
  end if;

  select * into v_rec from public.custom_table_records where id = v_run.record_id and deleted_at is null for update;
  if not found then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;
  select * into v_t from public.custom_tables where id = v_rec.table_id;

  if p_status is not null and not (p_status = any (public._crm_artifact_statuses(v_t.artifact_kind))) then
    raise exception 'invalid_artifact_status' using errcode = '22023';
  end if;

  v_data := v_rec.data;

  for e in select * from jsonb_each(case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}'::jsonb end) loop
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

  v_result := jsonb_build_object(
    'fields_applied', v_applied,
    'fields_ignored', v_ignored,
    'files', v_nfiles,
    'artifact_status', p_status,
    'moved', coalesce((v_status->>'moved')::boolean, false),
    'event', v_status->>'event');

  if p_keep_open then
    update public.artifact_action_runs
       set status = 'queued', claimed_at = null,
           result = coalesce(result, '{}'::jsonb)
                    || jsonb_build_object('responses', coalesce(result->'responses', '[]'::jsonb)
                                                       || jsonb_build_array(v_result || jsonb_build_object('at', now())))
     where id = v_run.id;
    return jsonb_build_object('status', 'open') || v_result;
  end if;

  update public.artifact_action_runs
     set status = 'completed', finished_at = now(), result = coalesce(result, '{}'::jsonb) || v_result
   where id = v_run.id;

  return jsonb_build_object('status', 'completed') || v_result;
end;
$$;

-- ============================================================================
-- 6. PERMISSÕES
-- ============================================================================

revoke all on function public.crm_save_artifact_actions(uuid, jsonb) from public, anon;
revoke all on function public.crm_artifact_actions(uuid) from public, anon;
revoke all on function public.crm_run_artifact_action(uuid, text) from public, anon;
grant execute on function public.crm_save_artifact_actions(uuid, jsonb) to authenticated;
grant execute on function public.crm_artifact_actions(uuid) to authenticated;
grant execute on function public.crm_run_artifact_action(uuid, text) to authenticated;

revoke all on function public._crm_artifact_callback_claim(text) from public, anon, authenticated;
revoke all on function public._crm_artifact_callback_release(uuid, text) from public, anon, authenticated;
revoke all on function public._crm_artifact_callback_finish(uuid, text, jsonb, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public._crm_artifact_callback_claim(text) to service_role;
grant execute on function public._crm_artifact_callback_release(uuid, text) to service_role;
grant execute on function public._crm_artifact_callback_finish(uuid, text, jsonb, jsonb, text, boolean) to service_role;

-- A tabela de artefato leva as ações para o painel do negócio.
create or replace function public.crm_deal_artifacts(p_opportunity_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'table', jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug,
                                       'artifact_kind', t.artifact_kind, 'table_schema', t.table_schema,
                                       'actions', (select coalesce(jsonb_agg(jsonb_build_object('id', a->>'id', 'label', a->>'label')), '[]'::jsonb)
                                                     from jsonb_array_elements(t.actions) a)),
           'records', coalesce((select jsonb_agg(public._crm_custom_table_row_json(r) order by r.created_at desc, r.id)
                                  from public.custom_table_records r
                                 where r.table_id = t.id
                                   and r.opportunity_id = p_opportunity_id
                                   and r.deleted_at is null), '[]'::jsonb))
         order by case t.artifact_kind when 'proposal' then 0 when 'contract' then 1 else 2 end, t.created_at, t.id),
         '[]'::jsonb)
    from public.custom_tables t
   where t.artifact_kind is not null
     and t.deleted_at is null
     and t.equipe_id = (select o.equipe_id from public.opportunities o where o.id = p_opportunity_id);
$$;
