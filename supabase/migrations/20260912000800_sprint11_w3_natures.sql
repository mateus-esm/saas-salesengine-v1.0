-- Sprint 11 · Onda 3 · T35 — as naturezas Oferta e Processo da linha (decisão 18).
--
-- A linha (pipeline) passa a se configurar pelas naturezas (motores_revops.md
-- §4.2). Esta onda constrói duas:
--
--   * OFERTA — o que a linha vende: valor livre (o de hoje, padrão) ou catálogo
--     (quais itens do catálogo a linha oferece; vazio = todos). Em modo catálogo o
--     seletor de itens do negócio mostra só a oferta da linha.
--   * PROCESSO — como a linha vende: marcos (qualificação, reunião, proposta,
--     contrato) ou compra direta (entrou → comprou). Escolher os marcos cria as
--     etapas que já declaram o `funnel_event`: o dashboard conta desde o dia um.
--
-- Guardado em `pipelines.natures` (jsonb) pelo verbo crm_save_pipeline_natures,
-- que valida e normaliza (marcos sem repetição, na ordem do funil; itens do
-- catálogo da equipe). crm_add_milestone_stages cria só as etapas dos marcos que
-- a linha ainda não declara — nunca apaga nem reordena o que existe (v1: entram
-- antes do ganho/perda; reordenar é no editor de etapas).
--
-- Marcos novos no catálogo de eventos: contract_sent, contract_signed (a Onda 4,
-- dos artefatos, emite os dois a partir do contrato).

alter table public.pipelines add column if not exists natures jsonb not null default '{}'::jsonb;
alter table public.pipelines drop constraint if exists pipelines_natures_object;
alter table public.pipelines add constraint pipelines_natures_object check (jsonb_typeof(natures) = 'object');

alter table public.pipeline_stages_v2 drop constraint if exists pipeline_stages_v2_funnel_event_check;
alter table public.pipeline_stages_v2 add constraint pipeline_stages_v2_funnel_event_check check (
  funnel_event is null or funnel_event = any (array[
    'qualified', 'proposal_sent', 'meeting_scheduled', 'meeting_done', 'no_show', 'contract_sent', 'contract_signed'
  ]));

alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check check (event = any (array[
  'qualified', 'proposal_sent', 'meeting_scheduled', 'meeting_done', 'no_show',
  'contract_sent', 'contract_signed', 'won', 'lost', 'reopened', 'recycled'
]));

-- ============================================================================
-- O CATÁLOGO DOS MARCOS (ordem do funil e nome da etapa)
-- ============================================================================

create or replace function public._crm_milestones()
returns table (key text, ord int, stage_name text)
language sql
immutable
as $$
  values ('qualified',         1, 'Qualificado'),
         ('meeting_scheduled', 2, 'Reunião agendada'),
         ('meeting_done',      3, 'Reunião feita'),
         ('proposal_sent',     4, 'Proposta enviada'),
         ('contract_sent',     5, 'Contrato enviado'),
         ('contract_signed',   6, 'Contrato assinado');
$$;

-- ============================================================================
-- GRAVAR A NATUREZA
-- ============================================================================

create or replace function public.crm_save_pipeline_natures(p_pipeline_id uuid, p_natures jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_equipe     uuid;
  v_offer      jsonb := coalesce(p_natures->'offer', '{}'::jsonb);
  v_process    jsonb := coalesce(p_natures->'process', '{}'::jsonb);
  v_offer_mode text  := coalesce(v_offer->>'mode', 'free');
  v_proc_mode  text  := coalesce(v_process->>'mode', 'milestones');
  v_items      uuid[];
  v_miles      text[];
  v_result     jsonb;
begin
  select pl.equipe_id into v_equipe from public.pipelines pl
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

  v_result := jsonb_build_object(
    'offer',   jsonb_build_object('mode', v_offer_mode, 'catalog_item_ids', to_jsonb(v_items)),
    'process', jsonb_build_object('mode', v_proc_mode, 'milestones', to_jsonb(v_miles))
  );

  update public.pipelines pl set natures = v_result where pl.id = p_pipeline_id;
  return v_result;
end;
$$;

-- ============================================================================
-- CRIAR AS ETAPAS DOS MARCOS QUE FALTAM
-- ============================================================================

create or replace function public.crm_add_milestone_stages(p_pipeline_id uuid, p_milestones text[])
returns int
language plpgsql
set search_path = public
as $$
declare
  v_equipe uuid;
  v_at     int;
  v_new    text[];
  v_n      int;
begin
  select pl.equipe_id into v_equipe from public.pipelines pl
   where pl.id = p_pipeline_id and pl.deleted_at is null;
  if v_equipe is null then
    raise exception 'pipeline_not_found' using errcode = 'P0002';
  end if;

  -- Os marcos pedidos que nenhuma etapa ativa declara, na ordem do funil.
  select coalesce(array_agg(m.key order by m.ord), array[]::text[]) into v_new
    from public._crm_milestones() m
   where m.key = any(coalesce(p_milestones, array[]::text[]))
     and not exists (select 1 from public.pipeline_stages_v2 s
                      where s.pipeline_id = p_pipeline_id and s.deleted_at is null and s.funnel_event = m.key);
  v_n := coalesce(array_length(v_new, 1), 0);
  if v_n = 0 then
    return 0;
  end if;

  -- Entram antes da primeira etapa de ganho/perda (ou no fim, sem elas).
  select min(s.position) into v_at from public.pipeline_stages_v2 s
   where s.pipeline_id = p_pipeline_id and s.deleted_at is null and s.stage_type in ('won', 'lost');
  if v_at is null then
    select coalesce(max(s.position) + 1, 0) into v_at from public.pipeline_stages_v2 s
     where s.pipeline_id = p_pipeline_id and s.deleted_at is null;
  else
    update public.pipeline_stages_v2 s set position = s.position + v_n
     where s.pipeline_id = p_pipeline_id and s.deleted_at is null and s.position >= v_at;
  end if;

  insert into public.pipeline_stages_v2 (equipe_id, pipeline_id, name, position, stage_type, funnel_event, color)
  select v_equipe, p_pipeline_id, m.stage_name, v_at + (row_number() over (order by m.ord))::int - 1, 'open', m.key, '#6366f1'
    from public._crm_milestones() m
   where m.key = any(v_new);

  return v_n;
end;
$$;

revoke all on function public.crm_save_pipeline_natures(uuid, jsonb) from public, anon;
revoke all on function public.crm_add_milestone_stages(uuid, text[]) from public, anon;
grant execute on function public.crm_save_pipeline_natures(uuid, jsonb) to authenticated;
grant execute on function public.crm_add_milestone_stages(uuid, text[]) to authenticated;
