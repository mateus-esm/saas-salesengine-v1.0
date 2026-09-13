-- Sprint 11 · Onda 6 · T59 — aplicar, desfazer e aprovar: o Copilot opera pelos
-- verbos do banco, com as regras das telas.
--
-- ANTES
--
-- O Copilot escrevia direto nas tabelas a partir do Python (`skills/core_table.py`):
-- `update` de etapa, status e `custom_data`, enums escritos à mão. Em 12/09 as duas
-- últimas passadas falharam por isso — tarefa com status `pending` (o banco aceita
-- `a_fazer/fazendo/feito/parado`) e touchpoint `inbound`. Cada verbo era uma ida
-- ao PostgREST, mais outra para cobrar e outra para o evento: 2–3 s por ação.
--
-- AGORA (decisão 41)
--
--   * `crm_copilot_apply` — uma transação por passada. Cada ação que o modelo
--     propôs é conferida pelo contrato (ids que vieram no contexto, tipo do campo,
--     etapa da mesma linha, tarefa sem repetir) e classificada: segura ou
--     arriscada. O modo da linha decide o resto — observar (só registra), sugerir
--     (tudo pede aprovação), autônomo (a segura com confiança acima do limiar é
--     aplicada; o resto pede). A ação inválida é recusada com o motivo; as válidas
--     seguem. Uma ação que falha não derruba as outras.
--   * Segura: nota; campo declarado **vazio**; nome do contato provisório e e-mail
--     vazio; próxima tarefa; etiqueta que a equipe já usa; avançar para etapa
--     aberta. Arriscada: ganho/perda, voltar de etapa, ir para etapa de ganho/perda,
--     trocar valor já preenchido, valor do negócio, etiqueta nova, trocar nome ou
--     e-mail de verdade.
--   * Mover a etapa é o mesmo `update` das telas: os gatilhos da Onda 3 fecham,
--     reabrem, gravam o histórico (como `copilot`) e o marco.
--   * A ação automática cobra 1 crédito do pool Copiloto (`charge_credits`,
--     idempotente por passada + ação); aprovar e desfazer não cobram. Sem crédito,
--     a ação vira pedido de aprovação.
--   * Toda ação vira uma linha em `ai_decisions` (`agent_role = 'copilot'`) com o
--     rótulo em português, o que se esperava encontrar (para aprovar depois) e o
--     inverso (para desfazer).
--   * `crm_copilot_undo` — desfaz pelo inverso, se ninguém mexeu depois.
--   * `crm_copilot_resolve` — aprovar confere de novo contra o negócio de agora:
--     mudou, fica "desatualizada" e não aplica. Recusar arquiva.
--
-- Itens do negócio (catálogo) ficam para a Onda 7: trocar a lista inteira pede a
-- tela de diff do Builder.

-- ============================================================================
-- 0. OS STATUS NOVOS DA DECISÃO
-- ============================================================================

alter table public.ai_decisions drop constraint if exists ai_decisions_status_sprint6_check;
alter table public.ai_decisions drop constraint if exists ai_decisions_status_w6_check;
alter table public.ai_decisions add constraint ai_decisions_status_w6_check check (status = any (array[
  'auto_applied', 'pending_approval', 'approved', 'rejected', 'executed', 'failed', 'proposed', 'undone', 'stale'
])) not valid;

create index if not exists idx_ai_decisions_copilot_feed
  on public.ai_decisions (equipe_id, created_at desc) where agent_role = 'copilot';
create index if not exists idx_ai_decisions_copilot_opp
  on public.ai_decisions (opportunity_id, created_at desc) where agent_role = 'copilot';

-- ============================================================================
-- 1. VALOR DE CAMPO, CONFERIDO PELO TIPO
-- ============================================================================

create or replace function public._copilot_is_empty(p jsonb)
returns boolean
language sql
immutable
as $$
  select p is null or jsonb_typeof(p) = 'null'
      or (jsonb_typeof(p) = 'string' and btrim(p #>> '{}') = '')
      or (jsonb_typeof(p) = 'array' and jsonb_array_length(p) = 0);
$$;

-- O valor que o modelo mandou, no formato que o campo guarda; null = não serve.
-- Os mesmos tipos e regras do formulário público (Onda 4); a opção da lista é
-- aceita sem diferenciar maiúsculas e volta escrita como na lista.
create or replace function public._copilot_coerce_value(p_field jsonb, p_value jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_type text := coalesce(p_field->>'type', 'text');
  v_text text;
  v_num  numeric;
  v_opts jsonb := coalesce(p_field->'options', '[]'::jsonb);
begin
  if public._copilot_is_empty(p_value) then
    return null;
  end if;

  if v_type in ('text', 'url', 'phone', 'select', 'date') then
    if jsonb_typeof(p_value) not in ('string', 'number') then
      return null;
    end if;
    v_text := btrim(p_value #>> '{}');
    if length(v_text) > 2000 then
      return null;
    end if;
    if v_type = 'url' and v_text !~ '^https?://[^[:space:]]+$' then
      return null;
    end if;
    if v_type = 'phone' and length(regexp_replace(v_text, '\D', '', 'g')) not between 8 and 15 then
      return null;
    end if;
    if v_type = 'select' then
      select o #>> '{}' into v_text from jsonb_array_elements(v_opts) o where lower(o #>> '{}') = lower(v_text) limit 1;
      if v_text is null then
        return null;
      end if;
    end if;
    if v_type = 'date' then
      v_text := coalesce(public._crm_try_date(v_text)::text,
                         ((public._crm_try_timestamptz(v_text)) at time zone 'America/Sao_Paulo')::date::text);
      if v_text is null then
        return null;
      end if;
    end if;
    return to_jsonb(v_text);
  elsif v_type in ('number', 'currency') then
    v_num := case jsonb_typeof(p_value)
               when 'number' then (p_value #>> '{}')::numeric
               when 'string' then public._crm_parse_br_number(p_value #>> '{}')
             end;
    return case when v_num is null then null else to_jsonb(v_num) end;
  elsif v_type = 'boolean' then
    if jsonb_typeof(p_value) = 'boolean' then
      return p_value;
    end if;
    v_text := lower(btrim(p_value #>> '{}'));
    return case when v_text in ('sim', 's', 'true', 'yes') then 'true'::jsonb
                when v_text in ('não', 'nao', 'n', 'false', 'no') then 'false'::jsonb end;
  elsif v_type = 'multi_select' then
    if jsonb_typeof(p_value) <> 'array' then
      return null;
    end if;
    return (select case when count(x.opt) = jsonb_array_length(p_value) then jsonb_agg(x.opt) end
              from (select (select o #>> '{}' from jsonb_array_elements(v_opts) o
                             where lower(o #>> '{}') = lower(e #>> '{}') limit 1) as opt
                      from jsonb_array_elements(p_value) e) x);
  end if;
  return null;
end;
$$;

create or replace function public._copilot_safe_uuid(p text)
returns uuid
language sql
immutable
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

create or replace function public._copilot_brl(p numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || replace(to_char(round(p, 2), 'FM999999999990.00'), '.', ',');
$$;

-- ============================================================================
-- 2. CONFERIR UMA AÇÃO
-- ============================================================================

-- {ok, reason} ou {ok, risky, action (normalizada), label, expected}.
create or replace function public._copilot_check(
  p_opp       public.opportunities,
  p_lead      public.leads,
  p_pipe      public.pipelines,
  p_action    jsonb,
  p_team_tags text[]
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_type  text := p_action->>'type';
  v_field jsonb;
  v_val   jsonb;
  v_cur   jsonb;
  v_text  text;
  v_due   timestamptz;
  v_num   numeric;
  v_to    public.pipeline_stages_v2;
  v_from  public.pipeline_stages_v2;
begin
  if jsonb_typeof(p_action) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'reason', 'not_an_object');
  end if;

  case v_type
  when 'note' then
    v_text := btrim(coalesce(p_action->>'text', ''));
    if v_text = '' or length(v_text) > 2000 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_text');
    end if;
    if exists (select 1 from public.lead_activities a
                where a.lead_id = p_lead.id and a.tipo = 'note' and lower(btrim(a.descricao)) = lower(v_text)) then
      return jsonb_build_object('ok', false, 'reason', 'duplicate');
    end if;
    return jsonb_build_object('ok', true, 'risky', false,
      'action', jsonb_build_object('type', 'note', 'text', v_text),
      'label', 'Nota: ' || left(v_text, 140));

  when 'set_field' then
    select f into v_field
      from jsonb_array_elements(coalesce(p_pipe.custom_fields_schema, '[]'::jsonb)) f
     where f->>'field_id' = p_action->>'field_id'
       and not coalesce((f->>'is_deleted')::boolean, false)
       and f->>'type' = any (public._copilot_writable_field_types())
     limit 1;
    if v_field is null then
      return jsonb_build_object('ok', false, 'reason', 'unknown_field');
    end if;
    v_val := public._copilot_coerce_value(v_field, p_action->'value');
    if v_val is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value');
    end if;
    v_cur := p_opp.custom_data -> (v_field->>'field_id');
    if v_cur = v_val then
      return jsonb_build_object('ok', false, 'reason', 'unchanged');
    end if;
    return jsonb_build_object('ok', true, 'risky', not public._copilot_is_empty(v_cur),
      'action', jsonb_build_object('type', 'set_field', 'field_id', v_field->>'field_id', 'value', v_val),
      'label', coalesce(nullif(v_field->>'label', ''), v_field->>'key') || ': '
               || case when jsonb_typeof(v_val) = 'array'
                       then (select string_agg(e #>> '{}', ', ') from jsonb_array_elements(v_val) e)
                       when jsonb_typeof(v_val) = 'boolean' then case when v_val = 'true'::jsonb then 'sim' else 'não' end
                       else v_val #>> '{}' end,
      'expected', jsonb_build_object('value', coalesce(v_cur, 'null'::jsonb)));

  when 'set_contact' then
    v_text := btrim(coalesce(p_action->>'value', ''));
    if p_action->>'attribute' = 'name' then
      if v_text = '' or length(v_text) > 120 or public._copilot_name_is_placeholder(v_text) then
        return jsonb_build_object('ok', false, 'reason', 'invalid_value');
      end if;
      if p_lead.name = v_text then
        return jsonb_build_object('ok', false, 'reason', 'unchanged');
      end if;
      return jsonb_build_object('ok', true, 'risky', not public._copilot_name_is_placeholder(p_lead.name),
        'action', jsonb_build_object('type', 'set_contact', 'attribute', 'name', 'value', v_text),
        'label', 'Nome do contato: ' || v_text,
        'expected', jsonb_build_object('value', coalesce(to_jsonb(p_lead.name), 'null'::jsonb)));
    elsif p_action->>'attribute' = 'email' then
      v_text := lower(v_text);
      if v_text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_text) > 200 then
        return jsonb_build_object('ok', false, 'reason', 'invalid_value');
      end if;
      if lower(coalesce(p_lead.email, '')) = v_text then
        return jsonb_build_object('ok', false, 'reason', 'unchanged');
      end if;
      return jsonb_build_object('ok', true, 'risky', nullif(btrim(p_lead.email), '') is not null,
        'action', jsonb_build_object('type', 'set_contact', 'attribute', 'email', 'value', v_text),
        'label', 'E-mail do contato: ' || v_text,
        'expected', jsonb_build_object('value', coalesce(to_jsonb(p_lead.email), 'null'::jsonb)));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invalid_attribute');

  when 'create_task' then
    v_text := btrim(coalesce(p_action->>'title', ''));
    if v_text = '' or length(v_text) > 200 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_title');
    end if;
    v_due := coalesce(public._crm_try_timestamptz(p_action->>'due_at'),
                      (((now() at time zone 'America/Sao_Paulo')::date + 1) + time '09:00') at time zone 'America/Sao_Paulo');
    if v_due < now() - interval '1 day' or v_due > now() + interval '365 days' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_due');
    end if;
    if exists (select 1 from public.tasks t
                where t.lead_id = p_lead.id and t.status in ('a_fazer', 'fazendo')
                  and lower(btrim(t.title)) = lower(v_text)) then
      return jsonb_build_object('ok', false, 'reason', 'duplicate');
    end if;
    return jsonb_build_object('ok', true, 'risky', false,
      'action', jsonb_build_object('type', 'create_task', 'title', v_text, 'due_at', v_due),
      'label', 'Tarefa: ' || v_text || ' (' || to_char(v_due at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || ')');

  when 'add_tag' then
    v_text := btrim(coalesce(p_action->>'tag', ''));
    if v_text = '' or length(v_text) > 60 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_tag');
    end if;
    if v_text = any (coalesce(p_lead.tags, array[]::text[])) then
      return jsonb_build_object('ok', false, 'reason', 'unchanged');
    end if;
    return jsonb_build_object('ok', true, 'risky', not (v_text = any (coalesce(p_team_tags, array[]::text[]))),
      'action', jsonb_build_object('type', 'add_tag', 'tag', v_text),
      'label', 'Etiqueta: ' || v_text);

  when 'move_stage' then
    select * into v_to from public.pipeline_stages_v2 s
     where s.id = public._copilot_safe_uuid(p_action->>'stage_id')
       and s.pipeline_id = p_opp.pipeline_id and s.deleted_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'unknown_stage');
    end if;
    if v_to.id = p_opp.stage_id then
      return jsonb_build_object('ok', false, 'reason', 'unchanged');
    end if;
    select * into v_from from public.pipeline_stages_v2 s where s.id = p_opp.stage_id;
    return jsonb_build_object('ok', true,
      'risky', v_to.stage_type <> 'open' or p_opp.status <> 'open' or v_to.position <= coalesce(v_from.position, -1),
      'action', jsonb_build_object('type', 'move_stage', 'stage_id', v_to.id),
      'label', 'Moveu para ' || v_to.name,
      'expected', jsonb_build_object('stage_id', p_opp.stage_id));

  when 'set_outcome' then
    if p_action->>'outcome' not in ('won', 'lost') then
      return jsonb_build_object('ok', false, 'reason', 'invalid_outcome');
    end if;
    if p_opp.status = p_action->>'outcome' then
      return jsonb_build_object('ok', false, 'reason', 'unchanged');
    end if;
    v_text := nullif(left(btrim(coalesce(p_action->>'reason', '')), 200), '');
    return jsonb_build_object('ok', true, 'risky', true,
      'action', jsonb_build_object('type', 'set_outcome', 'outcome', p_action->>'outcome', 'reason', v_text),
      'label', case when p_action->>'outcome' = 'won' then 'Marcar como ganho'
                    else 'Marcar como perdido' || coalesce(': ' || v_text, '') end,
      'expected', jsonb_build_object('stage_id', p_opp.stage_id));

  when 'set_value' then
    if coalesce(p_pipe.natures->'offer'->>'mode', 'free') = 'catalog' then
      return jsonb_build_object('ok', false, 'reason', 'value_comes_from_items');
    end if;
    v_num := case jsonb_typeof(p_action->'value')
               when 'number' then (p_action->>'value')::numeric
               when 'string' then public._crm_parse_br_number(p_action->>'value')
             end;
    if v_num is null or v_num < 0 or v_num > 1000000000000 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value');
    end if;
    if p_opp.value = v_num then
      return jsonb_build_object('ok', false, 'reason', 'unchanged');
    end if;
    return jsonb_build_object('ok', true, 'risky', true,
      'action', jsonb_build_object('type', 'set_value', 'value', v_num),
      'label', 'Valor: ' || public._copilot_brl(v_num),
      'expected', jsonb_build_object('value', p_opp.value));

  else
    return jsonb_build_object('ok', false, 'reason', 'unknown_type');
  end case;
end;
$$;

-- ============================================================================
-- 3. APLICAR UMA AÇÃO JÁ CONFERIDA (e guardar o inverso)
-- ============================================================================

create or replace function public._copilot_apply_one(p_opportunity_id uuid, p_action jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_opp  public.opportunities;
  v_lead public.leads;
  v_id   uuid;
  v_prev jsonb;
  v_new  uuid;
begin
  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
  select * into v_lead from public.leads where id = v_opp.lead_id for update;

  case p_action->>'type'
  when 'note' then
    insert into public.lead_activities (lead_id, opportunity_id, tipo, descricao, metadata)
    values (v_lead.id, v_opp.id, 'note', p_action->>'text', jsonb_build_object('actor', 'copilot'))
    returning id into v_id;
    return jsonb_build_object('activity_id', v_id);

  when 'set_field' then
    v_prev := v_opp.custom_data -> (p_action->>'field_id');
    update public.opportunities
       set custom_data = jsonb_set(coalesce(custom_data, '{}'::jsonb), array[p_action->>'field_id'], p_action->'value')
     where id = v_opp.id;
    return jsonb_build_object('field_id', p_action->>'field_id', 'previous', coalesce(v_prev, 'null'::jsonb), 'set', p_action->'value');

  when 'set_contact' then
    if p_action->>'attribute' = 'name' then
      v_prev := to_jsonb(v_lead.name);
      update public.leads set name = p_action->>'value' where id = v_lead.id;
    else
      v_prev := to_jsonb(v_lead.email);
      update public.leads set email = p_action->>'value' where id = v_lead.id;
    end if;
    return jsonb_build_object('attribute', p_action->>'attribute', 'previous', coalesce(v_prev, 'null'::jsonb), 'set', p_action->'value');

  when 'create_task' then
    insert into public.tasks (lead_id, title, due_date, status, assigned_to, description)
    values (v_lead.id, p_action->>'title', (p_action->>'due_at')::timestamptz, 'a_fazer', v_opp.owner_id, 'Criada pelo Copilot')
    returning id into v_id;
    return jsonb_build_object('task_id', v_id);

  when 'add_tag' then
    update public.leads set tags = array_append(coalesce(tags, array[]::text[]), p_action->>'tag')
     where id = v_lead.id and not (p_action->>'tag' = any (coalesce(tags, array[]::text[])));
    return jsonb_build_object('tag', p_action->>'tag');

  when 'move_stage' then
    update public.opportunities set stage_id = (p_action->>'stage_id')::uuid where id = v_opp.id;
    return jsonb_build_object('previous_stage_id', v_opp.stage_id, 'set_stage_id', (p_action->>'stage_id')::uuid);

  when 'set_outcome' then
    -- O status escrito move o negócio para a etapa daquele tipo (Onda 3).
    update public.opportunities
       set status = p_action->>'outcome',
           lost_reason = case when p_action->>'outcome' = 'lost' then coalesce(p_action->>'reason', lost_reason) else lost_reason end
     where id = v_opp.id
    returning stage_id into v_new;
    return jsonb_build_object('previous_stage_id', v_opp.stage_id, 'previous_status', v_opp.status, 'set_stage_id', v_new);

  when 'set_value' then
    update public.opportunities set value = (p_action->>'value')::numeric where id = v_opp.id;
    return jsonb_build_object('previous', v_opp.value, 'set', (p_action->>'value')::numeric);
  end case;

  raise exception 'unknown_type' using errcode = '22023';
end;
$$;

-- ============================================================================
-- 4. A PASSADA: CONFERIR, CLASSIFICAR, APLICAR OU PEDIR
-- ============================================================================

create or replace function public.crm_copilot_apply(
  p_opportunity_id uuid,
  p_run_id         uuid,
  p_actions        jsonb,
  p_summary        text        default null,
  p_confidence     numeric     default null,
  p_cursor         timestamptz default null,
  p_model          text        default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp       public.opportunities;
  v_lead      public.leads;
  v_pipe      public.pipelines;
  v_mode      text;
  v_threshold numeric;
  v_auto_fld  boolean;
  v_auto_stg  boolean;
  v_tags      text[];
  v_action    jsonb;
  v_i         integer := 0;
  v_chk       jsonb;
  v_conf      numeric;
  v_why       text;
  v_dec       uuid;
  v_inv       jsonb;
  v_applied   jsonb := '[]'::jsonb;
  v_pending   jsonb := '[]'::jsonb;
  v_proposed  jsonb := '[]'::jsonb;
  v_rejected  jsonb := '[]'::jsonb;
begin
  select * into v_opp from public.opportunities where id = p_opportunity_id and deleted_at is null for update;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_actions, '[]'::jsonb)) <> 'array' then
    raise exception 'actions_must_be_an_array' using errcode = '22023';
  end if;
  select * into v_pipe from public.pipelines where id = v_opp.pipeline_id;

  select a.autonomy_mode into v_mode from public.copilot_agents a
   where a.equipe_id = v_opp.equipe_id and a.scope = 'pipeline' and a.pipeline_id = v_opp.pipeline_id limit 1;
  v_mode := coalesce(v_mode, 'suggest');
  select r.confidence_threshold, r.auto_extract_custom_fields, r.auto_advance_stages
    into v_threshold, v_auto_fld, v_auto_stg
    from public.pipeline_agent_rules r
   where r.equipe_id = v_opp.equipe_id and r.pipeline_id = v_opp.pipeline_id limit 1;
  v_threshold := coalesce(v_threshold, 0.75);
  v_auto_fld  := coalesce(v_auto_fld, true);
  v_auto_stg  := coalesce(v_auto_stg, true);

  select coalesce(array_agg(distinct t), array[]::text[]) into v_tags
    from public.leads l2, unnest(coalesce(l2.tags, array[]::text[])) t
   where l2.equipe_id = v_opp.equipe_id and l2.deleted_at is null;

  -- O histórico de etapa diz que foi o Copilot.
  perform set_config('crm.actor_type', 'copilot', true);

  for v_action in select e.value from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) e loop
    v_i := v_i + 1;
    if v_i > 20 then
      v_rejected := v_rejected || jsonb_build_object('index', v_i, 'type', v_action->>'type', 'reason', 'too_many_actions');
      continue;
    end if;

    -- O negócio pode ter mudado pela ação anterior (etapa, campo).
    select * into v_opp from public.opportunities where id = p_opportunity_id;
    select * into v_lead from public.leads where id = v_opp.lead_id;
    v_chk := public._copilot_check(v_opp, v_lead, v_pipe, v_action, v_tags);
    if not coalesce((v_chk->>'ok')::boolean, false) then
      v_rejected := v_rejected || jsonb_build_object('index', v_i, 'type', v_action->>'type', 'reason', v_chk->>'reason');
      continue;
    end if;

    v_conf := least(greatest(coalesce(nullif(v_action->>'confidence', '')::numeric, p_confidence, 0), 0), 1);
    v_why := case
      when v_mode = 'observe' then 'observe'
      when v_mode = 'suggest' then 'suggest_mode'
      when (v_chk->>'risky')::boolean then 'risky'
      when v_conf < v_threshold then 'low_confidence'
      when v_chk->'action'->>'type' = 'set_field' and not v_auto_fld then 'fields_need_approval'
      when v_chk->'action'->>'type' = 'move_stage' and not v_auto_stg then 'stages_need_approval'
      when public.credit_balance(v_opp.equipe_id, 'copilot') < 1 then 'no_credits'
    end;

    begin
      insert into public.ai_decisions (
        equipe_id, lead_id, opportunity_id, pipeline_id, decision_type, agent_role, actor,
        status, confidence_score, input_summary, output_action)
      values (
        v_opp.equipe_id, v_opp.lead_id, v_opp.id, v_opp.pipeline_id, 'copilot_action', 'copilot', 'copilot',
        case when v_why is null then 'auto_applied' when v_why = 'observe' then 'proposed' else 'pending_approval' end,
        v_conf, nullif(left(btrim(coalesce(v_action->>'reason', '')), 500), ''),
        jsonb_build_object('run_id', p_run_id, 'index', v_i, 'action', v_chk->'action', 'label', v_chk->>'label',
                           'expected', v_chk->'expected', 'why', v_why, 'model', p_model))
      returning id into v_dec;

      if v_why is null then
        perform public.charge_credits(v_opp.equipe_id, 1, 'copilot:' || p_run_id::text || ':' || v_i::text,
          jsonb_build_object('pool', 'copilot', 'verb', v_chk->'action'->>'type', 'opportunity_id', v_opp.id,
                             'lead_id', v_opp.lead_id, 'decision_id', v_dec, 'model', p_model, 'mode', 'auto'));
        v_inv := public._copilot_apply_one(v_opp.id, v_chk->'action');
        update public.ai_decisions set output_action = output_action || jsonb_build_object('inverse', v_inv) where id = v_dec;
        v_applied := v_applied || jsonb_build_object('index', v_i, 'decision_id', v_dec, 'type', v_chk->'action'->>'type', 'label', v_chk->>'label');
      elsif v_why = 'observe' then
        v_proposed := v_proposed || jsonb_build_object('index', v_i, 'decision_id', v_dec, 'type', v_chk->'action'->>'type', 'label', v_chk->>'label');
      else
        v_pending := v_pending || jsonb_build_object('index', v_i, 'decision_id', v_dec, 'type', v_chk->'action'->>'type',
                                                     'label', v_chk->>'label', 'why', v_why);
      end if;
    exception when others then
      -- Uma ação que falha não leva as outras junto (nem cobra).
      v_rejected := v_rejected || jsonb_build_object('index', v_i, 'type', v_action->>'type',
                                                     'reason', 'failed: ' || left(sqlerrm, 200));
    end;
  end loop;

  insert into public.copilot_memory (opportunity_id, equipe_id, summary, last_message_at, last_run_id, updated_at)
  values (v_opp.id, v_opp.equipe_id, nullif(btrim(coalesce(p_summary, '')), ''), p_cursor, p_run_id, clock_timestamp())
  on conflict (opportunity_id) do update
    set summary         = coalesce(excluded.summary, public.copilot_memory.summary),
        last_message_at = greatest(public.copilot_memory.last_message_at, excluded.last_message_at),
        last_run_id     = excluded.last_run_id,
        updated_at      = clock_timestamp();

  return jsonb_build_object('mode', v_mode, 'applied', v_applied, 'pending', v_pending,
                            'proposed', v_proposed, 'rejected', v_rejected);
end;
$$;

-- ============================================================================
-- 5. DESFAZER E APROVAR (a equipe, pela tela)
-- ============================================================================

create or replace function public.crm_copilot_undo(p_decision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_dec  public.ai_decisions;
  v_act  jsonb;
  v_inv  jsonb;
  v_opp  public.opportunities;
  v_lead public.leads;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  select * into v_dec from public.ai_decisions
   where id = p_decision_id and equipe_id = v_team and agent_role = 'copilot' for update;
  if v_team is null or not found then
    raise exception 'decision_not_found' using errcode = 'P0002';
  end if;
  if v_dec.status not in ('auto_applied', 'executed') then
    return jsonb_build_object('ok', false, 'reason', 'not_applied');
  end if;
  v_act := v_dec.output_action->'action';
  v_inv := v_dec.output_action->'inverse';
  if v_inv is null then
    return jsonb_build_object('ok', false, 'reason', 'not_undoable');
  end if;
  select * into v_opp from public.opportunities where id = v_dec.opportunity_id for update;
  select * into v_lead from public.leads where id = v_opp.lead_id for update;

  case v_act->>'type'
  when 'note' then
    delete from public.lead_activities where id = (v_inv->>'activity_id')::uuid;
  when 'set_field' then
    if coalesce(v_opp.custom_data -> (v_inv->>'field_id'), 'null'::jsonb) is distinct from v_inv->'set' then
      return jsonb_build_object('ok', false, 'reason', 'changed_since');
    end if;
    update public.opportunities
       set custom_data = case when v_inv->'previous' = 'null'::jsonb then custom_data - (v_inv->>'field_id')
                              else jsonb_set(custom_data, array[v_inv->>'field_id'], v_inv->'previous') end
     where id = v_opp.id;
  when 'set_contact' then
    if (case when v_inv->>'attribute' = 'name' then v_lead.name else v_lead.email end) is distinct from v_inv->>'set' then
      return jsonb_build_object('ok', false, 'reason', 'changed_since');
    end if;
    if v_inv->>'attribute' = 'name' then
      update public.leads set name = v_inv->>'previous' where id = v_lead.id;
    else
      update public.leads set email = v_inv->>'previous' where id = v_lead.id;
    end if;
  when 'create_task' then
    delete from public.tasks where id = (v_inv->>'task_id')::uuid and status = 'a_fazer';
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'changed_since');
    end if;
  when 'add_tag' then
    update public.leads set tags = array_remove(tags, v_inv->>'tag') where id = v_lead.id;
  when 'move_stage', 'set_outcome' then
    if v_opp.stage_id is distinct from (v_inv->>'set_stage_id')::uuid then
      return jsonb_build_object('ok', false, 'reason', 'changed_since');
    end if;
    update public.opportunities set stage_id = (v_inv->>'previous_stage_id')::uuid where id = v_opp.id;
  when 'set_value' then
    if v_opp.value is distinct from (v_inv->>'set')::numeric then
      return jsonb_build_object('ok', false, 'reason', 'changed_since');
    end if;
    update public.opportunities set value = (v_inv->>'previous')::numeric where id = v_opp.id;
  else
    return jsonb_build_object('ok', false, 'reason', 'not_undoable');
  end case;

  update public.ai_decisions set status = 'undone', resolved_by = auth.uid(), resolved_at = now() where id = v_dec.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.crm_copilot_resolve(p_decision_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team  uuid;
  v_dec   public.ai_decisions;
  v_act   jsonb;
  v_exp   jsonb;
  v_opp   public.opportunities;
  v_lead  public.leads;
  v_pipe  public.pipelines;
  v_tags  text[];
  v_chk   jsonb;
  v_stale boolean;
  v_inv   jsonb;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  select * into v_dec from public.ai_decisions
   where id = p_decision_id and equipe_id = v_team and agent_role = 'copilot' for update;
  if v_team is null or not found then
    raise exception 'decision_not_found' using errcode = 'P0002';
  end if;
  if v_dec.status not in ('pending_approval', 'proposed') then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  if not coalesce(p_approve, false) then
    update public.ai_decisions set status = 'rejected', resolved_by = auth.uid(), resolved_at = now() where id = v_dec.id;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  v_act := v_dec.output_action->'action';
  v_exp := coalesce(v_dec.output_action->'expected', '{}'::jsonb);
  select * into v_opp from public.opportunities where id = v_dec.opportunity_id and deleted_at is null for update;
  if not found then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = v_opp.lead_id;
  select * into v_pipe from public.pipelines where id = v_opp.pipeline_id;
  select coalesce(array_agg(distinct t), array[]::text[]) into v_tags
    from public.leads l2, unnest(coalesce(l2.tags, array[]::text[])) t
   where l2.equipe_id = v_opp.equipe_id and l2.deleted_at is null;

  -- O negócio mudou desde a sugestão? Então ela está desatualizada.
  v_stale := case v_act->>'type'
    when 'set_field' then coalesce(v_opp.custom_data -> (v_act->>'field_id'), 'null'::jsonb)
                          is distinct from coalesce(v_exp->'value', 'null'::jsonb)
    when 'set_contact' then coalesce(to_jsonb(case when v_act->>'attribute' = 'name' then v_lead.name else v_lead.email end), 'null'::jsonb)
                          is distinct from coalesce(v_exp->'value', 'null'::jsonb)
    when 'move_stage' then v_opp.stage_id is distinct from (v_exp->>'stage_id')::uuid
    when 'set_outcome' then v_opp.stage_id is distinct from (v_exp->>'stage_id')::uuid
    when 'set_value' then v_opp.value is distinct from (v_exp->>'value')::numeric
    else false
  end;
  v_chk := public._copilot_check(v_opp, v_lead, v_pipe, v_act, v_tags);
  if v_stale or not coalesce((v_chk->>'ok')::boolean, false) then
    update public.ai_decisions
       set status = 'stale', resolved_by = auth.uid(), resolved_at = now(),
           error_details = coalesce(v_chk->>'reason', 'changed_since')
     where id = v_dec.id;
    return jsonb_build_object('ok', false, 'reason', 'stale');
  end if;

  perform set_config('crm.actor_type', 'copilot', true);
  v_inv := public._copilot_apply_one(v_opp.id, v_chk->'action');
  update public.ai_decisions
     set status = 'executed', resolved_by = auth.uid(), resolved_at = now(),
         output_action = output_action || jsonb_build_object('inverse', v_inv, 'approved_by', auth.uid())
   where id = v_dec.id;
  return jsonb_build_object('ok', true, 'status', 'executed');
end;
$$;

-- ============================================================================
-- 6. QUEM CHAMA
-- ============================================================================

revoke all on function public.crm_copilot_apply(uuid, uuid, jsonb, text, numeric, timestamptz, text) from public, anon, authenticated;
revoke all on function public._copilot_apply_one(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._copilot_check(public.opportunities, public.leads, public.pipelines, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.crm_copilot_undo(uuid) from public, anon;
revoke all on function public.crm_copilot_resolve(uuid, boolean) from public, anon;
grant execute on function public.crm_copilot_apply(uuid, uuid, jsonb, text, numeric, timestamptz, text) to service_role;
grant execute on function public.crm_copilot_undo(uuid) to authenticated;
grant execute on function public.crm_copilot_resolve(uuid, boolean) to authenticated;
