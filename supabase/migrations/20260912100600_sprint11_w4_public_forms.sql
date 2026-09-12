-- Sprint 11 · Onda 4 · T45 — formulário público por registro (decisão 27).
--
-- "Dados para Contrato": a tabela escolhe os campos do formulário; cada registro
-- tem um link com token (`/f/:token`); o cliente preenche sem login; o registro
-- recebe os valores e o link guarda a hora do envio. O link vale até o envio ou
-- 30 dias; gerar outro revoga o anterior. O token fica guardado como hash — o
-- link aparece uma vez, na hora de gerar (e vai para a área de transferência).
--
-- O lado público segue o padrão da casa (report-snapshot, public-proposal): a
-- edge `public-form` lê com o service_role e devolve só o que o formulário
-- mostra; o anônimo não toca no banco. Tipos no formulário: texto, número,
-- moeda, data, sim/não, seleção, multi-seleção, URL e telefone — cada um
-- validado aqui, no servidor (o navegador não é a defesa).

-- ============================================================================
-- 1. O FORMULÁRIO DA TABELA E OS LINKS
-- ============================================================================

-- { enabled, title, intro, fields: [{ field_id, required }] }
alter table public.custom_tables add column if not exists form_config jsonb;

create table if not exists public.custom_record_form_links (
  id            uuid primary key default gen_random_uuid(),
  equipe_id     uuid not null references public.equipes(id) on delete cascade,
  table_id      uuid not null references public.custom_tables(id) on delete cascade,
  record_id     uuid not null references public.custom_table_records(id) on delete cascade,
  token_hash    text not null unique,
  expires_at    timestamptz not null,
  submitted_at  timestamptz,
  revoked_at    timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create index if not exists idx_custom_record_form_links_record
  on public.custom_record_form_links (record_id, created_at desc);

alter table public.custom_record_form_links enable row level security;
drop policy if exists custom_record_form_links_team_read on public.custom_record_form_links;
create policy custom_record_form_links_team_read on public.custom_record_form_links
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));
-- Sem política de escrita: só os verbos (security definer) gravam.

-- Número escrito do jeito brasileiro ("R$ 4.500,00", "1.234") ou do jeito da
-- máquina ("4500.5"). Gêmeo de parseBrNumber (src/lib/fields/registry.ts).
create or replace function public._crm_parse_br_number(p text)
returns numeric
language sql
immutable
as $$
  select case
           when x.t = '' then null
           when x.t like '%,%' then public._crm_try_numeric(replace(replace(x.t, '.', ''), ',', '.'))
           when x.t ~ '^-?\d{1,3}(\.\d{3})+$' then public._crm_try_numeric(replace(x.t, '.', ''))
           else public._crm_try_numeric(x.t)
         end
    from (select regexp_replace(regexp_replace(coalesce(p, ''), 'R\$', '', 'gi'), '\s', '', 'g') as t) x;
$$;

create or replace function public._crm_form_field_types()
returns text[]
language sql
immutable
as $$
  select array['text', 'number', 'currency', 'date', 'boolean', 'select', 'multi_select', 'url', 'phone'];
$$;

-- ============================================================================
-- 2. CONFIGURAR (verbo da equipe)
-- ============================================================================

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

  v_out := jsonb_build_object('enabled', v_enabled, 'title', v_title, 'intro', v_intro, 'fields', v_fields);
  update public.custom_tables set form_config = v_out where id = v_t.id;
  return v_out;
end;
$$;

-- Gera o link do registro (e revoga o anterior que ainda valia). O token volta
-- só aqui; o banco guarda o hash.
create or replace function public.crm_create_form_link(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_equipe  uuid;
  v_rec     public.custom_table_records;
  v_t       public.custom_tables;
  v_token   text;
  v_expires timestamptz := now() + interval '30 days';
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  select * into v_rec from public.custom_table_records r
   where r.id = p_record_id and r.equipe_id = v_equipe and r.deleted_at is null;
  if v_equipe is null or not found then
    raise exception 'record_not_found' using errcode = 'P0002';
  end if;
  select * into v_t from public.custom_tables where id = v_rec.table_id;
  if not coalesce((v_t.form_config->>'enabled')::boolean, false)
     or jsonb_array_length(coalesce(v_t.form_config->'fields', '[]'::jsonb)) = 0 then
    raise exception 'form_not_enabled' using errcode = '22023';
  end if;

  update public.custom_record_form_links
     set revoked_at = now()
   where record_id = v_rec.id and submitted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.custom_record_form_links (equipe_id, table_id, record_id, token_hash, expires_at, created_by)
  values (v_equipe, v_t.id, v_rec.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires, auth.uid());

  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

-- ============================================================================
-- 3. O LADO PÚBLICO (só a edge public-form, com o service_role)
-- ============================================================================

create or replace function public._crm_public_form_link(p_token text, p_lock boolean default false)
returns public.custom_record_form_links
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.custom_record_form_links;
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  if p_lock then
    select * into v_link from public.custom_record_form_links where token_hash = v_hash for update;
  else
    select * into v_link from public.custom_record_form_links where token_hash = v_hash;
  end if;
  if not found then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;
  if v_link.submitted_at is not null then
    raise exception 'form_submitted' using errcode = '22023';
  end if;
  if v_link.revoked_at is not null then
    raise exception 'form_revoked' using errcode = '22023';
  end if;
  if v_link.expires_at < now() then
    raise exception 'form_expired' using errcode = '22023';
  end if;
  if not exists (select 1 from public.custom_table_records r where r.id = v_link.record_id and r.deleted_at is null) then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;
  return v_link;
end;
$$;

-- O que o formulário mostra: nome da equipe, título, texto e os campos (por key),
-- com o valor atual de cada um.
create or replace function public._crm_public_form_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.custom_record_form_links;
  v_t    public.custom_tables;
  v_data jsonb;
begin
  v_link := public._crm_public_form_link(p_token);
  select * into v_t from public.custom_tables where id = v_link.table_id;
  select data into v_data from public.custom_table_records where id = v_link.record_id;

  return jsonb_build_object(
    'team', (select e.nome from public.equipes e where e.id = v_link.equipe_id),
    'title', coalesce(nullif(v_t.form_config->>'title', ''), v_t.name),
    'intro', coalesce(v_t.form_config->>'intro', ''),
    'expires_at', v_link.expires_at,
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', col.c->>'key',
               'label', col.c->>'label',
               'type', coalesce(col.c->>'type', 'text'),
               'options', coalesce(col.c->'options', '[]'::jsonb),
               'required', coalesce((f.value->>'required')::boolean, false),
               'value', v_data->(col.c->>'field_id'))
             order by f.ordinality)
        from jsonb_array_elements(v_t.form_config->'fields') with ordinality f(value, ordinality)
        join lateral (select x as c from jsonb_array_elements(v_t.table_schema) x
                       where x->>'field_id' = f.value->>'field_id'
                         and not coalesce((x->>'is_deleted')::boolean, false)
                       limit 1) col on true), '[]'::jsonb));
end;
$$;

-- O envio: valida cada campo pelo tipo, grava por field_id e fecha o link.
-- Campo que não veio fica como estava; obrigatório vazio recusa o envio inteiro.
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

  return jsonb_build_object('ok', true, 'fields', v_n);
end;
$$;

-- ============================================================================
-- 4. PERMISSÕES
-- ============================================================================

revoke all on function public.crm_save_form_config(uuid, jsonb) from public, anon;
revoke all on function public.crm_create_form_link(uuid) from public, anon;
grant execute on function public.crm_save_form_config(uuid, jsonb) to authenticated;
grant execute on function public.crm_create_form_link(uuid) to authenticated;

revoke all on function public._crm_public_form_link(text, boolean) from public, anon, authenticated;
revoke all on function public._crm_public_form_get(text) from public, anon, authenticated;
revoke all on function public._crm_public_form_submit(text, jsonb) from public, anon, authenticated;
grant execute on function public._crm_public_form_get(text) to service_role;
grant execute on function public._crm_public_form_submit(text, jsonb) to service_role;

-- ============================================================================
-- 5. O PAINEL DO NEGÓCIO SABE SE A TABELA TEM FORMULÁRIO
-- ============================================================================

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
                                                     from jsonb_array_elements(t.actions) a),
                                       'form_config', t.form_config),
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
