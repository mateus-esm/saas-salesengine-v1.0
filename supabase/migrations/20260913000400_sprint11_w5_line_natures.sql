-- Sprint 11 · Onda 5 · T55 — as naturezas Duração e Entradas da linha (decisão 37).
--
-- DURAÇÃO. `pipelines.natures.duration`: contínua (padrão) ou campanha, com
-- início e fim. Depois do fim a linha para de receber negócio novo: o lead e o
-- toque são gravados como sempre, e o negócio novo nasce na linha padrão da
-- equipe. Quem já tem negócio aberto na linha continua nele — ela para de
-- receber, não de trabalhar.
--
-- ONDE A LINHA É DECIDIDA. O negócio nasce no resolvedor das edges
-- (`_shared/opportunities.ts`), que agora pergunta a `crm_intake_pipeline` em que
-- linha criar. Mover o negócio depois (no toque) daria dois negócios abertos a
-- quem volta, por isso a regra mora aqui e não no `crm_record_touch`.
--
-- ENTRADAS. As portas que alimentam a linha: o webhook pela linha dele; o número
-- de WhatsApp e o agente pela linha da entrada (vazia = a linha padrão da
-- equipe). A lista sai de `crm_entry_list` (20260913000200); a tela filtra.

-- ============================================================================
-- 1. DATA SEM EXCEÇÃO E "A LINHA ENCERROU"
-- ============================================================================

-- Texto → data; o que não for data vira null (nunca derruba quem pergunta).
create or replace function public._crm_try_date(p text)
returns date
language plpgsql
immutable
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p::date;
exception when others then
  return null;
end;
$$;

-- A linha é campanha e o último dia já passou (no fuso de Brasília).
create or replace function public._crm_line_closed(p_natures jsonb)
returns boolean
language sql
stable
as $$
  select coalesce(p_natures->'duration'->>'mode' = 'campaign'
                  and public._crm_try_date(p_natures->'duration'->>'ends_on')
                      < (now() at time zone 'America/Sao_Paulo')::date, false);
$$;

-- ============================================================================
-- 2. GRAVAR A NATUREZA (agora com a duração)
-- ============================================================================

create or replace function public.crm_save_pipeline_natures(p_pipeline_id uuid, p_natures jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_equipe     uuid;
  v_stored     jsonb;
  v_offer      jsonb := coalesce(p_natures->'offer', '{}'::jsonb);
  v_process    jsonb := coalesce(p_natures->'process', '{}'::jsonb);
  v_offer_mode text  := coalesce(v_offer->>'mode', 'free');
  v_proc_mode  text  := coalesce(v_process->>'mode', 'milestones');
  v_duration   jsonb := case when jsonb_typeof(p_natures->'duration') = 'object' then p_natures->'duration' else '{}'::jsonb end;
  v_dur_mode   text  := coalesce(v_duration->>'mode', 'continuous');
  v_starts     date;
  v_ends       date;
  v_dur        jsonb;
  v_items      uuid[];
  v_miles      text[];
  v_result     jsonb;
begin
  select pl.equipe_id, pl.natures into v_equipe, v_stored from public.pipelines pl
   where pl.id = p_pipeline_id and pl.deleted_at is null;
  if v_equipe is null then
    raise exception 'pipeline_not_found' using errcode = 'P0002';
  end if;

  if v_offer_mode not in ('free', 'catalog') or v_proc_mode not in ('milestones', 'direct') then
    raise exception 'invalid_natures' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x::uuid), array[]::uuid[]) into v_items
    from jsonb_array_elements_text(case when jsonb_typeof(v_offer->'catalog_item_ids') = 'array'
                                        then v_offer->'catalog_item_ids' else '[]'::jsonb end) x;
  if exists (select 1 from unnest(v_items) i
              where not exists (select 1 from public.catalog_items c
                                 where c.id = i and c.equipe_id = v_equipe and c.deleted_at is null)) then
    raise exception 'catalog_item_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(m.key order by m.ord), array[]::text[]) into v_miles
    from public._crm_milestones() m
   where m.key in (select jsonb_array_elements_text(case when jsonb_typeof(v_process->'milestones') = 'array'
                                                         then v_process->'milestones' else '[]'::jsonb end));

  -- Duração. Quem não fala dela (o Track Shaper, uma tela antiga) não a apaga.
  if not (p_natures ? 'duration') then
    v_dur := coalesce(v_stored->'duration', '{"mode": "continuous"}'::jsonb);
  elsif v_dur_mode = 'continuous' then
    v_dur := '{"mode": "continuous"}'::jsonb;
  elsif v_dur_mode = 'campaign' then
    v_starts := public._crm_try_date(v_duration->>'starts_on');
    v_ends   := public._crm_try_date(v_duration->>'ends_on');
    if v_starts is null or v_ends is null or v_ends < v_starts then
      raise exception 'invalid_duration' using errcode = '22023';
    end if;
    v_dur := jsonb_build_object('mode', 'campaign', 'starts_on', v_starts, 'ends_on', v_ends);
  else
    raise exception 'invalid_natures' using errcode = '22023';
  end if;

  v_result := jsonb_build_object(
    'offer',    jsonb_build_object('mode', v_offer_mode, 'catalog_item_ids', to_jsonb(v_items)),
    'process',  jsonb_build_object('mode', v_proc_mode, 'milestones', to_jsonb(v_miles)),
    'duration', v_dur
  );

  update public.pipelines pl set natures = v_result where pl.id = p_pipeline_id;
  return v_result;
end;
$$;

revoke all on function public.crm_save_pipeline_natures(uuid, jsonb) from public, anon;
grant execute on function public.crm_save_pipeline_natures(uuid, jsonb) to authenticated, service_role;

-- ============================================================================
-- 3. EM QUE LINHA NASCE O NEGÓCIO NOVO
-- ============================================================================

-- A linha pedida (a do webhook, a da entrada) ou, sem ela, a padrão da equipe.
-- Campanha encerrada, linha apagada ou de outra equipe → a linha padrão. A
-- padrão encerrada continua recebendo: não há para onde mandar.
create or replace function public.crm_intake_pipeline(p_equipe_id uuid, p_pipeline_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_default uuid;
  v_natures jsonb;
begin
  select e.default_pipeline_id into v_default from public.equipes e where e.id = p_equipe_id;
  if p_pipeline_id is null or p_pipeline_id = v_default then
    return v_default;
  end if;

  select pl.natures into v_natures from public.pipelines pl
   where pl.id = p_pipeline_id and pl.equipe_id = p_equipe_id and pl.deleted_at is null;
  if not found then
    return v_default;
  end if;
  if public._crm_line_closed(v_natures) and v_default is not null then
    return v_default;
  end if;
  return p_pipeline_id;
end;
$$;

revoke all on function public.crm_intake_pipeline(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_intake_pipeline(uuid, uuid) to service_role;

comment on function public.crm_intake_pipeline(uuid, uuid) is
  'Sprint 11 T55: the line a new deal is created in (requested line, else team default; an ended campaign line sends it to the default). service_role only.';
