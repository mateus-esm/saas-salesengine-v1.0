-- Sprint 11 · Onda 5 · T52 — os verbos das telas de Campanhas e Entradas.
--
-- Campanha: salvar (chaves normalizadas; uma chave não cai em duas campanhas),
-- lançar e apagar investimento, listar com leads e investimento. UTMs que chegaram
-- sem campanha aparecem numa lista; ligar uma a uma campanha põe a chave na
-- campanha E reclassifica o que já chegou (toques sem campanha e leads cujo
-- primeiro toque é um deles). Entrada: o carimbo (categoria, plataforma, campanha
-- padrão, linha, regra de responsável) — o nome de uma entrada de webhook é o do
-- webhook. Tudo pela equipe do token.

-- ============================================================================
-- 1. CAMPANHAS
-- ============================================================================

create or replace function public.crm_save_campaign(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_name   text := btrim(coalesce(p->>'name', ''));
  v_keys   text[];
  v_taken  text;
  v_row    public.crm_campaigns;
begin
  select pr.equipe_id into v_equipe from public.profiles pr where pr.id = auth.uid();
  if v_equipe is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_id is not null and not exists (select 1 from public.crm_campaigns c where c.id = v_id and c.equipe_id = v_equipe) then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid_campaign_name' using errcode = '22023';
  end if;
  if nullif(p->>'owner_id', '') is not null
     and not exists (select 1 from public.profiles pr where pr.id = (p->>'owner_id')::uuid and pr.equipe_id = v_equipe) then
    raise exception 'owner_not_in_team' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct k order by k), '{}') into v_keys
    from (select lower(btrim(x)) as k
            from jsonb_array_elements_text(case when jsonb_typeof(p->'match_keys') = 'array' then p->'match_keys' else '[]'::jsonb end) x) y
   where k <> '';
  if array_length(v_keys, 1) > 50 then
    raise exception 'too_many_match_keys' using errcode = '22023';
  end if;

  select k into v_taken
    from unnest(v_keys) k
   where exists (select 1 from public.crm_campaigns c
                  where c.equipe_id = v_equipe and c.status <> 'archived'
                    and c.id is distinct from v_id and k = any (c.match_keys))
   limit 1;
  if v_taken is not null then
    raise exception 'match_key_taken:%', v_taken using errcode = '23505';
  end if;

  if v_id is null then
    insert into public.crm_campaigns (equipe_id, name, platform, origin_category, owner_id, goal_leads, goal_deals,
                                      goal_revenue, starts_on, ends_on, status, match_keys)
    values (v_equipe, v_name, nullif(p->>'platform', ''), nullif(p->>'origin_category', ''),
            nullif(p->>'owner_id', '')::uuid, nullif(p->>'goal_leads', '')::integer, nullif(p->>'goal_deals', '')::integer,
            nullif(p->>'goal_revenue', '')::numeric, nullif(p->>'starts_on', '')::date, nullif(p->>'ends_on', '')::date,
            coalesce(nullif(p->>'status', ''), 'active'), v_keys)
    returning * into v_row;
  else
    update public.crm_campaigns
       set name = v_name,
           platform = nullif(p->>'platform', ''),
           origin_category = nullif(p->>'origin_category', ''),
           owner_id = nullif(p->>'owner_id', '')::uuid,
           goal_leads = nullif(p->>'goal_leads', '')::integer,
           goal_deals = nullif(p->>'goal_deals', '')::integer,
           goal_revenue = nullif(p->>'goal_revenue', '')::numeric,
           starts_on = nullif(p->>'starts_on', '')::date,
           ends_on = nullif(p->>'ends_on', '')::date,
           status = coalesce(nullif(p->>'status', ''), status),
           match_keys = v_keys,
           updated_at = now()
     where id = v_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.crm_campaign_spend_add(
  p_campaign_id uuid, p_spent_on date, p_amount numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_row    public.crm_campaign_spend;
begin
  select pr.equipe_id into v_equipe from public.profiles pr where pr.id = auth.uid();
  if v_equipe is null or not exists (select 1 from public.crm_campaigns c where c.id = p_campaign_id and c.equipe_id = v_equipe) then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if p_spent_on is null or p_amount is null or p_amount < 0 then
    raise exception 'invalid_spend' using errcode = '22023';
  end if;
  insert into public.crm_campaign_spend (equipe_id, campaign_id, spent_on, amount, note, created_by)
  values (v_equipe, p_campaign_id, p_spent_on, round(p_amount, 2), nullif(btrim(p_note), ''), auth.uid())
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.crm_campaign_spend_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
begin
  select pr.equipe_id into v_equipe from public.profiles pr where pr.id = auth.uid();
  delete from public.crm_campaign_spend s where s.id = p_id and s.equipe_id = v_equipe and s.source = 'manual';
  if not found then
    raise exception 'spend_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- As campanhas da equipe com o que já trouxeram (sempre, não o período — o
-- relatório com período e ROI é o T54).
create or replace function public.crm_campaign_list()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
           'leads', (select count(*) from public.leads l where l.campaign_id = c.id and l.deleted_at is null),
           'touches', (select count(*) from public.lead_touches t where t.campaign_id = c.id),
           'spend', coalesce((select sum(s.amount) from public.crm_campaign_spend s where s.campaign_id = c.id), 0),
           'last_touch_at', (select max(t.occurred_at) from public.lead_touches t where t.campaign_id = c.id))
         order by (c.status = 'archived'), c.status <> 'active', c.created_at desc), '[]'::jsonb)
    from public.crm_campaigns c
   where c.equipe_id = (select pr.equipe_id from public.profiles pr where pr.id = auth.uid());
$$;

-- As UTMs de campanha que chegaram e não caíram em nenhuma.
create or replace function public.crm_unmatched_utms(p_limit integer default 50)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('value', u.value, 'touches', u.touches, 'last_at', u.last_at,
                                               'platform', u.platform)
                            order by u.touches desc, u.last_at desc), '[]'::jsonb)
    from (select lower(btrim(t.utm_campaign)) as value, count(*) as touches, max(t.occurred_at) as last_at,
                 mode() within group (order by t.platform) as platform
            from public.lead_touches t
           where t.equipe_id = (select pr.equipe_id from public.profiles pr where pr.id = auth.uid())
             and t.campaign_id is null
             and nullif(btrim(t.utm_campaign), '') is not null
           group by lower(btrim(t.utm_campaign))
           order by count(*) desc
           limit greatest(1, least(coalesce(p_limit, 50), 200))) u;
$$;

-- Liga uma UTM a uma campanha: a chave entra na campanha e o que já chegou com
-- ela (sem campanha) passa a ser dela — o toque e o lead cujo primeiro toque é esse.
create or replace function public.crm_link_utm(p_campaign_id uuid, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe  uuid;
  v_key     text := lower(btrim(coalesce(p_value, '')));
  v_touches integer;
  v_leads   integer;
begin
  select pr.equipe_id into v_equipe from public.profiles pr where pr.id = auth.uid();
  if v_equipe is null or not exists (select 1 from public.crm_campaigns c
                                      where c.id = p_campaign_id and c.equipe_id = v_equipe and c.status <> 'archived') then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if v_key = '' then
    raise exception 'invalid_match_key' using errcode = '22023';
  end if;
  if exists (select 1 from public.crm_campaigns c
              where c.equipe_id = v_equipe and c.status <> 'archived' and c.id <> p_campaign_id and v_key = any (c.match_keys)) then
    raise exception 'match_key_taken:%', v_key using errcode = '23505';
  end if;

  update public.crm_campaigns
     set match_keys = (select array_agg(distinct k order by k) from unnest(match_keys || array[v_key]) k),
         updated_at = now()
   where id = p_campaign_id;

  update public.lead_touches t
     set campaign_id = p_campaign_id
   where t.equipe_id = v_equipe and t.campaign_id is null and lower(btrim(t.utm_campaign)) = v_key;
  get diagnostics v_touches = row_count;

  update public.leads l
     set campaign_id = p_campaign_id
   where l.equipe_id = v_equipe and l.campaign_id is null
     and l.first_touch_id in (select t.id from public.lead_touches t
                               where t.equipe_id = v_equipe and t.campaign_id = p_campaign_id);
  get diagnostics v_leads = row_count;

  return jsonb_build_object('touches', v_touches, 'leads', v_leads);
end;
$$;

-- ============================================================================
-- 2. ENTRADAS
-- ============================================================================

-- A linha em que a entrada põe o negócio novo (T55): o webhook, a do webhook; o
-- número de WhatsApp e o agente, a da entrada; null = a linha padrão da equipe.
-- Cadastro manual e importação: a linha escolhida na hora (null aqui).
create or replace function public.crm_entry_list()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(e) - 'owner_cursor' || jsonb_build_object(
           'pipeline_id', x.line_id,
           'pipeline_name', (select p.name from public.pipelines p where p.id = x.line_id),
           'webhook_active', w.active,
           'campaign_name', (select c.name from public.crm_campaigns c where c.id = e.campaign_id),
           'leads', (select count(*) from public.leads l where l.entry_id = e.id and l.deleted_at is null),
           'touches_30d', (select count(*) from public.lead_touches t
                            where t.entry_id = e.id and t.occurred_at > now() - interval '30 days'),
           'last_touch_at', (select max(t.occurred_at) from public.lead_touches t where t.entry_id = e.id))
         order by case e.kind when 'webhook' then 0 when 'whatsapp' then 1 when 'agent' then 2 when 'manual' then 3 else 4 end,
                  e.name), '[]'::jsonb)
    from public.crm_entries e
    left join public.webhook_configs w on w.id = e.webhook_config_id
    cross join lateral (select case e.kind when 'webhook' then w.pipeline_id
                                           when 'whatsapp' then e.pipeline_id
                                           when 'agent' then e.pipeline_id end as line_id) x
   where e.equipe_id = (select pr.equipe_id from public.profiles pr where pr.id = auth.uid());
$$;

-- O carimbo de uma entrada. Só muda o que veio no patch.
create or replace function public.crm_save_entry(p_entry_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_entry  public.crm_entries;
begin
  select pr.equipe_id into v_equipe from public.profiles pr where pr.id = auth.uid();
  select * into v_entry from public.crm_entries e where e.id = p_entry_id and e.equipe_id = v_equipe;
  if v_equipe is null or not found then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  if p ? 'campaign_id' and nullif(p->>'campaign_id', '') is not null
     and not exists (select 1 from public.crm_campaigns c where c.id = (p->>'campaign_id')::uuid and c.equipe_id = v_equipe) then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;
  if p ? 'pipeline_id' and nullif(p->>'pipeline_id', '') is not null
     and not exists (select 1 from public.pipelines pl where pl.id = (p->>'pipeline_id')::uuid and pl.equipe_id = v_equipe) then
    raise exception 'pipeline_not_found' using errcode = 'P0002';
  end if;

  update public.crm_entries e
     set name = case when p ? 'name' and e.kind <> 'webhook' and length(btrim(p->>'name')) between 1 and 120
                     then btrim(p->>'name') else e.name end,
         origin_category = case when p ? 'origin_category' then nullif(p->>'origin_category', '') else e.origin_category end,
         platform = case when p ? 'platform' then nullif(p->>'platform', '') else e.platform end,
         campaign_id = case when p ? 'campaign_id' then nullif(p->>'campaign_id', '')::uuid else e.campaign_id end,
         -- A linha de um webhook é a do próprio webhook (tela de webhooks); a do
         -- número e a do agente, esta; manual e importação escolhem na hora.
         pipeline_id = case when p ? 'pipeline_id' and e.kind in ('whatsapp', 'agent')
                            then nullif(p->>'pipeline_id', '')::uuid else e.pipeline_id end,
         owner_rule = case when p ? 'owner_rule' then public._crm_normalize_owner_rule(v_equipe, p->'owner_rule') else e.owner_rule end,
         active = case when p ? 'active' then coalesce((p->>'active')::boolean, e.active) else e.active end,
         updated_at = now()
   where e.id = p_entry_id
  returning * into v_entry;

  return to_jsonb(v_entry) - 'owner_cursor';
end;
$$;

-- ============================================================================
-- 3. A ORIGEM DE UM LEAD (T53)
-- ============================================================================

-- As chegadas de um lead (as 50 últimas), com a entrada e a campanha por nome, e
-- qual delas é o primeiro toque. RLS: só o lead da própria equipe.
create or replace function public.crm_lead_attribution(p_lead_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'first_touch_id', l.first_touch_id,
    'total', (select count(*) from public.lead_touches t where t.lead_id = l.id),
    'touches', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', t.id, 'occurred_at', t.occurred_at, 'first', t.id = l.first_touch_id,
               'entry_name', e.name, 'entry_kind', e.kind,
               'origin_category', t.origin_category, 'platform', t.platform,
               'campaign_id', t.campaign_id, 'campaign', c.name,
               'utm_source', t.utm_source, 'utm_medium', t.utm_medium, 'utm_campaign', t.utm_campaign,
               'utm_content', t.utm_content, 'utm_term', t.utm_term,
               'fbclid', t.fbclid, 'gclid', t.gclid, 'ctwa_clid', t.ctwa_clid,
               'campaign_name', t.campaign_name, 'adset_name', t.adset_name, 'ad_name', t.ad_name, 'ad_id', t.ad_id,
               'form_name', t.form_name, 'landing_page', t.landing_page, 'referrer', t.referrer))
             order by t.occurred_at desc)
        from (select * from public.lead_touches t0 where t0.lead_id = l.id order by t0.occurred_at desc limit 50) t
        left join public.crm_entries e on e.id = t.entry_id
        left join public.crm_campaigns c on c.id = t.campaign_id), '[]'::jsonb))
  from public.leads l
  where l.id = p_lead_id;
$$;

-- ============================================================================
-- 4. PERMISSÕES
-- ============================================================================

revoke all on function public.crm_save_campaign(jsonb) from public, anon;
revoke all on function public.crm_campaign_spend_add(uuid, date, numeric, text) from public, anon;
revoke all on function public.crm_campaign_spend_delete(uuid) from public, anon;
revoke all on function public.crm_campaign_list() from public, anon;
revoke all on function public.crm_unmatched_utms(integer) from public, anon;
revoke all on function public.crm_link_utm(uuid, text) from public, anon;
revoke all on function public.crm_entry_list() from public, anon;
revoke all on function public.crm_save_entry(uuid, jsonb) from public, anon;
grant execute on function public.crm_save_campaign(jsonb) to authenticated;
grant execute on function public.crm_campaign_spend_add(uuid, date, numeric, text) to authenticated;
grant execute on function public.crm_campaign_spend_delete(uuid) to authenticated;
grant execute on function public.crm_campaign_list() to authenticated;
grant execute on function public.crm_unmatched_utms(integer) to authenticated;
grant execute on function public.crm_link_utm(uuid, text) to authenticated;
grant execute on function public.crm_entry_list() to authenticated;
grant execute on function public.crm_save_entry(uuid, jsonb) to authenticated;
revoke all on function public.crm_lead_attribution(uuid) from public, anon;
grant execute on function public.crm_lead_attribution(uuid) to authenticated;
