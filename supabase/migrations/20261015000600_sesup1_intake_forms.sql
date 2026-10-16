-- Sprint Suporte 1 · #6 — formulários de ingestão (Formulário de Indicação e afins).
--
-- ANTES
--
-- O único formulário público era o "Dados para Contrato" (Sprint 11 · T45): o
-- cliente preenche os dados de um REGISTRO que já existe. Não havia como alguém de
-- fora (um indicador, um visitante) cadastrar um contato novo no CRM.
--
-- AGORA
--
--   1. crm_forms: a definição do formulário (campos ordenados com o destino de
--      cada um, pipeline/etapa do negócio, responsável, origem). RLS por equipe.
--   2. _crm_intake_form_get(token): o que a página mostra (só título, texto e
--      campos; nunca o destino, o pipeline ou o responsável). Devolve NULL se o
--      token não for de um formulário de ingestão — a edge então tenta o
--      formulário de contrato (mesmo link /f/:token, mesma função pública).
--   3. _crm_intake_submit(token, valores): valida TODO campo no banco, acha o lead
--      pelo telefone (phone_normalized, a regra do UNIQUE) ou e-mail da equipe e
--      reaproveita (só preenche o que está vazio; nome nunca é sobrescrito),
--      cria o negócio na etapa configurada (ou reaproveita o aberto do mesmo
--      pipeline), grava os campos personalizados por field_id e registra o toque
--      de origem (crm_record_touch) numa entrada kind='form'.
--   4. Rate limit por token (janela de 1 min, em crm_form_submissions) e honeypot.
--
-- DISTRIBUIÇÃO (Task 8): NÃO está aqui. O responsável vem de crm_forms.responsible_id
-- (nulo = sem dono). O ponto de extensão é o bloco marcado "GANCHO DE DISTRIBUIÇÃO"
-- em _crm_intake_submit: quando a Task 8 criar crm_assign_next(opportunity), é nesse
-- ponto que ela entra, só quando responsible_id é nulo.
--
-- creation_source: o CHECK de leads não aceita 'form'; esta migration o recria
-- (idempotente) incluindo 'form'. crm_entries.kind também ganha 'form'.
--
-- ORDEM DE DEPLOY: migration -> função public-form. Sem a migration a edge responde
-- como antes (a RPC nova ainda não existe e a edge trata PGRST202 caindo no formulário de contrato).

begin;

-- 1. Valores novos nos CHECKs ------------------------------------------------
alter table public.leads drop constraint if exists leads_creation_source_check;
alter table public.leads
  add constraint leads_creation_source_check
  check (creation_source in ('manual', 'ai_agent', 'webhook', 'import', 'solo_api', 'form'));

-- O CHECK de kind nasceu inline (sem nome escolhido): derruba pelo que ele diz, não pelo nome.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.crm_entries'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.crm_entries drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.crm_entries
  add constraint crm_entries_kind_check
  check (kind in ('webhook', 'whatsapp', 'agent', 'manual', 'import', 'form'));

-- 2. Tabelas ----------------------------------------------------------------
create table if not exists public.crm_forms (
  id             uuid primary key default gen_random_uuid(),
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  slug           text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  -- O link é /f/<token>: 64 hex que ninguém adivinha (dois uuid v4 sem hífen).
  -- O slug só serve para a equipe reconhecer o formulário na lista.
  token          text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  title          text not null check (length(btrim(title)) between 1 and 120),
  description    text not null default '',
  -- [{key, label, type, required, target, options?}] na ordem em que aparecem.
  fields         jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  pipeline_id    uuid not null references public.pipelines(id) on delete restrict,
  stage_id       uuid not null references public.pipeline_stages_v2(id) on delete restrict,
  responsible_id uuid references public.profiles(id) on delete set null,
  origin_label   text not null default 'Formulário' check (length(btrim(origin_label)) between 1 and 120),
  origin_category text check (origin_category is null or origin_category = any (public._crm_origin_categories())),
  entry_id       uuid references public.crm_entries(id) on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (equipe_id, slug)
);

create table if not exists public.crm_form_submissions (
  id             uuid primary key default gen_random_uuid(),
  form_id        uuid not null references public.crm_forms(id) on delete cascade,
  equipe_id      uuid not null references public.equipes(id) on delete cascade,
  status         text not null check (status in ('ok', 'honeypot')),
  lead_id        uuid references public.leads(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  -- O que a pessoa digitou, como veio: nada se perde quando o lead já existia e
  -- só os campos vazios foram preenchidos.
  "values"       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_crm_form_submissions_window on public.crm_form_submissions (form_id, created_at desc);
create index if not exists idx_crm_forms_equipe on public.crm_forms (equipe_id);

alter table public.crm_forms enable row level security;
alter table public.crm_form_submissions enable row level security;

drop policy if exists "tenant_isolation_crm_forms" on public.crm_forms;
create policy "tenant_isolation_crm_forms"
  on public.crm_forms
  for all
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()))
  with check (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- Quem é da equipe lê o histórico; escrever só pela RPC (definer).
drop policy if exists "tenant_read_crm_form_submissions" on public.crm_form_submissions;
create policy "tenant_read_crm_form_submissions"
  on public.crm_form_submissions
  for select
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- 3. A definição do formulário é validada ao gravar --------------------------
-- RLS só confere a equipe da linha; pipeline, etapa, responsável e o destino de
-- cada campo precisam ser da MESMA equipe (senão alguém aponta o formulário para
-- o pipeline de outro cliente).
create or replace function public._crm_forms_validate()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  f        jsonb;
  v_keys   text[] := '{}';
  v_target text;
  v_names  integer := 0;
  v_ident  integer := 0;
begin
  if not exists (select 1 from public.pipelines p where p.id = new.pipeline_id and p.equipe_id = new.equipe_id) then
    raise exception 'invalid_form: pipeline fora da equipe' using errcode = '23514';
  end if;
  if not exists (select 1 from public.pipeline_stages_v2 s
                  where s.id = new.stage_id and s.pipeline_id = new.pipeline_id
                    and s.equipe_id = new.equipe_id and s.deleted_at is null) then
    raise exception 'invalid_form: etapa fora do pipeline' using errcode = '23514';
  end if;
  if new.responsible_id is not null
     and not exists (select 1 from public.profiles p where p.id = new.responsible_id and p.equipe_id = new.equipe_id) then
    raise exception 'invalid_form: responsável fora da equipe' using errcode = '23514';
  end if;

  for f in select * from jsonb_array_elements(new.fields) loop
    if jsonb_typeof(f) <> 'object'
       or coalesce(f->>'key', '') !~ '^[A-Za-z][A-Za-z0-9_]{0,39}$'
       or length(btrim(coalesce(f->>'label', ''))) = 0
       or coalesce(f->>'type', '') not in ('text', 'textarea', 'phone', 'email', 'number', 'date', 'select', 'boolean') then
      raise exception 'invalid_form: campo malformado' using errcode = '23514';
    end if;
    if f->>'key' = any (v_keys) or f->>'key' = '_hp' then
      raise exception 'invalid_form: chave repetida %', f->>'key' using errcode = '23514';
    end if;
    v_keys := v_keys || (f->>'key');
    v_target := coalesce(f->>'target', '');
    if v_target not in ('lead.name', 'lead.phone', 'lead.email', 'lead.observations', 'attribution.indicated_by')
       and v_target !~ '^custom:[0-9a-fA-F-]{36}$' then
      raise exception 'invalid_form: destino inválido %', v_target using errcode = '23514';
    end if;
    if v_target = 'lead.name' then v_names := v_names + 1; end if;
    if v_target in ('lead.phone', 'lead.email') then v_ident := v_ident + 1; end if;
    if f->>'type' = 'select' and (jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options') = 0) then
      raise exception 'invalid_form: select sem opções' using errcode = '23514';
    end if;
  end loop;

  -- Um formulário que não cria contato identificável não serve: nome + telefone ou e-mail.
  if new.is_active and (v_names <> 1 or v_ident = 0) then
    raise exception 'invalid_form: precisa de um campo de nome e de telefone ou e-mail' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_crm_forms_validate on public.crm_forms;
create trigger trg_crm_forms_validate
  before insert or update on public.crm_forms
  for each row execute function public._crm_forms_validate();

-- 4. O que a página mostra ---------------------------------------------------
-- NULL = este token não é de um formulário de ingestão (a edge tenta o de contrato).
create or replace function public._crm_intake_form_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_form public.crm_forms;
begin
  select * into v_form from public.crm_forms where token = p_token::text;
  if not found then
    return null;
  end if;
  if not v_form.is_active then
    raise exception 'form_revoked' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'kind', 'intake',
    'team', (select e.nome from public.equipes e where e.id = v_form.equipe_id),
    'title', v_form.title,
    'intro', v_form.description,
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', x.value->>'key',
               'label', x.value->>'label',
               'type', x.value->>'type',
               'options', coalesce(x.value->'options', '[]'::jsonb),
               'required', coalesce((x.value->>'required')::boolean, false),
               'value', null)
             order by x.ordinality)
        from jsonb_array_elements(v_form.fields) with ordinality x(value, ordinality)), '[]'::jsonb));
end;
$$;

-- 5. O envio -----------------------------------------------------------------
create or replace function public._crm_intake_submit(p_token text, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_form    public.crm_forms;
  f         jsonb;
  v_key     text;
  v_raw     text;
  v_type    text;
  v_target  text;
  v_name    text;
  v_phone   text;
  v_email   text;
  v_obs     text;
  v_by      text;
  v_pkey    text;
  v_ekey    text;
  v_norm    text;
  v_custom  jsonb := '{}'::jsonb;
  v_lead    public.leads;
  v_lead_id uuid;
  v_opp_id  uuid;
  v_entry   uuid;
  v_owner   uuid;
  v_detail  text;
  v_new     boolean := false;
begin
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'invalid_values' using errcode = '22023';
  end if;

  select * into v_form from public.crm_forms where token = p_token::text for update;
  if not found then
    raise exception 'form_not_found' using errcode = 'P0002';
  end if;
  if not v_form.is_active then
    raise exception 'form_revoked' using errcode = '22023';
  end if;

  -- Honeypot: campo escondido que gente não preenche. Responde ok e não cria nada.
  if length(btrim(coalesce(p_values->>'_hp', ''))) > 0 then
    insert into public.crm_form_submissions (form_id, equipe_id, status) values (v_form.id, v_form.equipe_id, 'honeypot');
    return jsonb_build_object('ok', true);
  end if;

  -- Rate limit por formulário: o `for update` acima serializa os envios do mesmo
  -- token, então a contagem não corre. 10 por minuto basta para uma indicação.
  if (select count(*) from public.crm_form_submissions s
       where s.form_id = v_form.id and s.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  -- Valida cada campo declarado (o que sobra em p_values é ignorado).
  for f in select * from jsonb_array_elements(v_form.fields) loop
    v_key    := f->>'key';
    v_type   := f->>'type';
    v_target := f->>'target';
    v_raw    := nullif(btrim(coalesce(p_values->>v_key, '')), '');

    if v_raw is null then
      if coalesce((f->>'required')::boolean, false) or v_target = 'lead.name' then
        raise exception 'required:%', v_key using errcode = '22023';
      end if;
      if v_target = 'lead.phone' then v_pkey := v_key; end if;
      if v_target = 'lead.email' then v_ekey := v_key; end if;
      continue;
    end if;
    if length(v_raw) > 2000 then
      raise exception 'invalid_field:%', v_key using errcode = '22023';
    end if;

    if v_type = 'email' and v_raw !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'invalid_field:%', v_key using errcode = '22023';
    elsif v_type = 'phone' and public.normalize_phone_br(v_raw) is null then
      raise exception 'invalid_field:%', v_key using errcode = '22023';
    elsif v_type = 'number' and v_raw !~ '^-?[0-9]+([.,][0-9]+)?$' then
      raise exception 'invalid_field:%', v_key using errcode = '22023';
    elsif v_type = 'date' and v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'invalid_field:%', v_key using errcode = '22023';
    elsif v_type = 'select' and not (f->'options') @> to_jsonb(v_raw) then
      raise exception 'invalid_field:%', v_key using errcode = '22023';
    elsif v_type = 'boolean' and lower(v_raw) not in ('true', 'false') then
      raise exception 'invalid_field:%', v_key using errcode = '22023';
    end if;

    if    v_target = 'lead.name'  then v_name  := v_raw;
    elsif v_target = 'lead.phone' then v_phone := v_raw; v_pkey := v_key;
    elsif v_target = 'lead.email' then v_email := lower(v_raw); v_ekey := v_key;
    elsif v_target = 'lead.observations' then v_obs := v_raw;
    elsif v_target = 'attribution.indicated_by' then v_by := v_raw;
    elsif v_target like 'custom:%' then
      v_custom := v_custom || jsonb_build_object(
        substring(v_target from 8),
        case v_type
          when 'number'  then to_jsonb(replace(v_raw, ',', '.')::numeric)
          when 'boolean' then to_jsonb(lower(v_raw) = 'true')
          else to_jsonb(v_raw)
        end);
    end if;
  end loop;

  if v_phone is null and v_email is null then
    raise exception 'required:%', coalesce(v_pkey, v_ekey, 'contact') using errcode = '22023';
  end if;

  v_norm   := public.normalize_phone_br(v_phone);
  v_detail := coalesce('Indicado por ' || v_by, v_form.title);

  -- Dedup: telefone normalizado primeiro (a regra do UNIQUE), depois e-mail.
  if v_norm is not null then
    select * into v_lead from public.leads l
     where l.equipe_id = v_form.equipe_id and l.deleted_at is null and l.phone_normalized = v_norm
     order by l.created_at limit 1;
  end if;
  if v_lead.id is null and v_email is not null then
    select * into v_lead from public.leads l
     where l.equipe_id = v_form.equipe_id and l.deleted_at is null and lower(l.email) = v_email
     order by l.created_at limit 1;
  end if;

  if v_lead.id is not null then
    -- Só o que está vazio. Nome nunca muda aqui (name_locked ou não: quem já
    -- está no CRM tem nome melhor do que o de um formulário).
    update public.leads l
       set email        = coalesce(nullif(btrim(l.email), ''), v_email),
           phone        = coalesce(nullif(btrim(l.phone), ''), v_phone),
           observations = coalesce(nullif(btrim(l.observations), ''), v_obs)
     where l.id = v_lead.id;
    v_lead_id := v_lead.id;
  else
    insert into public.leads (
      equipe_id, name, email, phone, observations, source, origem, origin_category, origin_detail,
      creation_source, created_by_type, lead_type, contact_type, atendido_por_agente, responsible_id)
    values (
      v_form.equipe_id, v_name, v_email, v_phone, v_obs, v_form.origin_label, v_form.origin_label,
      v_form.origin_category, v_detail, 'form', 'automation', 'lead', 'opportunity', false, v_form.responsible_id)
    returning id into v_lead_id;
    v_new := true;
  end if;

  -- O negócio: o aberto do mesmo pipeline é reaproveitado (um indicado não vira
  -- dois cards); senão nasce na etapa configurada.
  select o.id into v_opp_id from public.opportunities o
   where o.lead_id = v_lead_id and o.pipeline_id = v_form.pipeline_id
     and o.status = 'open' and o.deleted_at is null
   order by o.created_at desc limit 1;

  if v_opp_id is not null then
    update public.opportunities o
       set custom_data = v_custom || o.custom_data   -- o que já estava preenchido ganha
     where o.id = v_opp_id;
  else
    insert into public.opportunities (equipe_id, lead_id, pipeline_id, stage_id, value, currency, custom_data, owner_id)
    values (v_form.equipe_id, v_lead_id, v_form.pipeline_id, v_form.stage_id, null, 'BRL', v_custom, v_form.responsible_id)
    returning id into v_opp_id;
  end if;

  -- GANCHO DE DISTRIBUIÇÃO (Task 8): quando existir crm_assign_next(uuid), chamá-la
  -- aqui, só se v_form.responsible_id is null e o negócio ainda estiver sem dono:
  --   if v_form.responsible_id is null then perform public.crm_assign_next(v_opp_id); end if;
  -- (crm_record_touch abaixo já aplica a regra de dono da ENTRADA do formulário.)

  -- Toque de origem: a entrada do formulário (criada na primeira vez).
  v_entry := v_form.entry_id;
  if v_entry is null or not exists (select 1 from public.crm_entries e where e.id = v_entry) then
    insert into public.crm_entries (equipe_id, kind, name, origin_category)
    values (v_form.equipe_id, 'form', v_form.origin_label, v_form.origin_category)
    returning id into v_entry;
    update public.crm_forms set entry_id = v_entry where id = v_form.id;
  end if;

  perform public.crm_record_touch(
    v_lead_id, v_entry,
    jsonb_strip_nulls(jsonb_build_object(
      'form_id', v_form.id::text, 'form_name', v_form.title, 'indicated_by', v_by)),
    v_opp_id);

  insert into public.crm_form_submissions (form_id, equipe_id, status, lead_id, opportunity_id, "values")
  values (v_form.id, v_form.equipe_id, 'ok', v_lead_id, v_opp_id, p_values - '_hp');

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public._crm_forms_validate() from public, anon, authenticated;
revoke all on function public._crm_intake_form_get(text) from public, anon, authenticated;
revoke all on function public._crm_intake_submit(text, jsonb) from public, anon, authenticated;
grant execute on function public._crm_intake_form_get(text) to service_role;
grant execute on function public._crm_intake_submit(text, jsonb) to service_role;

commit;
