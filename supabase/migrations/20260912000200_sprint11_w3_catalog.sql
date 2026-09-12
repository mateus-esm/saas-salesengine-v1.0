-- Sprint 11 · Onda 3 · T29 — o catálogo de produtos e serviços (decisão 14).
--
-- O que a linha vende, a que preço e com que recorrência. Da equipe (RLS), usado
-- por qualquer pipeline dela; o pipeline escolhe quais itens oferece na natureza
-- Oferta (T35). O nome não colide com `billing_products` (a cobrança do SaaS).
--
--   * preço FIXO: o item do negócio usa o preço do catálogo (T30 ignora o preço
--     mandado); NEGOCIÁVEL: o preço é sugestão, editável no negócio.
--   * recorrência opcional e inteira: a cada N dias/meses, abrir o retorno X dias
--     antes, em qual pipeline/etapa (padrão: o mesmo pipeline, primeira etapa
--     aberta — T34 decide na hora).
--   * arquivar esconde (deleted_at); o que já foi vendido guarda uma cópia do
--     item (T30), então nada some de negócio nenhum.
--
-- Escrita pelos verbos (crm_save_catalog_item, crm_archive_catalog_items); a
-- leitura é select direto com RLS (a lista é pequena).

create table if not exists public.catalog_items (
  id                 uuid primary key default gen_random_uuid(),
  equipe_id          uuid not null references public.equipes(id) on delete cascade,
  name               text not null,
  kind               text not null default 'product',
  price              numeric(14, 2),
  price_mode         text not null default 'negotiable',
  recurrence_every   integer,
  recurrence_unit    text,
  renew_days_before  integer not null default 0,
  renew_pipeline_id  uuid references public.pipelines(id) on delete set null,
  renew_stage_id     uuid references public.pipeline_stages_v2(id) on delete set null,
  description        text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint catalog_name_present    check (length(btrim(name)) > 0),
  constraint catalog_kind_check      check (kind in ('product', 'service')),
  constraint catalog_price_positive  check (price is null or price >= 0),
  constraint catalog_price_mode      check (price_mode in ('fixed', 'negotiable')),
  constraint catalog_fixed_has_price check (price_mode <> 'fixed' or price is not null),
  constraint catalog_recurrence_pair check ((recurrence_every is null) = (recurrence_unit is null)),
  constraint catalog_recurrence_every_positive check (recurrence_every is null or recurrence_every > 0),
  constraint catalog_recurrence_unit check (recurrence_unit is null or recurrence_unit in ('day', 'month')),
  constraint catalog_renew_days      check (renew_days_before >= 0)
);

create index if not exists idx_catalog_items_equipe on public.catalog_items (equipe_id) where deleted_at is null;

drop trigger if exists set_catalog_items_updated_at on public.catalog_items;
create trigger set_catalog_items_updated_at
  before update on public.catalog_items
  for each row execute function public.update_updated_at_column();

alter table public.catalog_items enable row level security;

drop policy if exists "team reads catalog" on public.catalog_items;
create policy "team reads catalog" on public.catalog_items
  for select using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "team writes catalog" on public.catalog_items;
create policy "team writes catalog" on public.catalog_items
  for insert with check (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "team updates catalog" on public.catalog_items;
create policy "team updates catalog" on public.catalog_items
  for update using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()))
  with check (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- Sem política de DELETE: o item arquiva, não some (ver project_equipe_delete_traps).

-- ============================================================================
-- VERBOS
-- ============================================================================

-- Cria (sem id) ou edita (com id). Só os campos mandados mudam na edição.
create or replace function public.crm_save_catalog_item(p_item jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_equipe   uuid;
  v_id       uuid := nullif(p_item->>'id', '')::uuid;
  v_row      public.catalog_items;
  v_pipeline uuid;
  v_stage    uuid;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  if v_id is not null then
    select * into v_row from public.catalog_items c where c.id = v_id and c.deleted_at is null;
    if not found then
      raise exception 'catalog_item_not_found' using errcode = 'P0002';
    end if;
  else
    v_row.equipe_id := v_equipe;
    v_row.kind := 'product';
    v_row.price_mode := 'negotiable';
    v_row.renew_days_before := 0;
    v_row.active := true;
  end if;

  if p_item ? 'name'              then v_row.name := btrim(p_item->>'name'); end if;
  if p_item ? 'kind'              then v_row.kind := p_item->>'kind'; end if;
  if p_item ? 'price'             then v_row.price := nullif(p_item->>'price', '')::numeric; end if;
  if p_item ? 'price_mode'        then v_row.price_mode := p_item->>'price_mode'; end if;
  if p_item ? 'recurrence_every'  then v_row.recurrence_every := nullif(p_item->>'recurrence_every', '')::int; end if;
  if p_item ? 'recurrence_unit'   then v_row.recurrence_unit := nullif(p_item->>'recurrence_unit', ''); end if;
  if p_item ? 'renew_days_before' then v_row.renew_days_before := coalesce(nullif(p_item->>'renew_days_before', '')::int, 0); end if;
  if p_item ? 'renew_pipeline_id' then v_row.renew_pipeline_id := nullif(p_item->>'renew_pipeline_id', '')::uuid; end if;
  if p_item ? 'renew_stage_id'    then v_row.renew_stage_id := nullif(p_item->>'renew_stage_id', '')::uuid; end if;
  if p_item ? 'description'       then v_row.description := nullif(btrim(p_item->>'description'), ''); end if;
  if p_item ? 'active'            then v_row.active := coalesce((p_item->>'active')::boolean, true); end if;

  -- Sem recorrência, nada de retorno.
  if v_row.recurrence_every is null then
    v_row.renew_pipeline_id := null;
    v_row.renew_stage_id := null;
    v_row.renew_days_before := 0;
  end if;

  -- O pipeline de retorno é da equipe (a RLS de pipelines responde) e a etapa é dele.
  if v_row.renew_pipeline_id is not null then
    select pl.id into v_pipeline from public.pipelines pl
     where pl.id = v_row.renew_pipeline_id and pl.deleted_at is null;
    if v_pipeline is null then
      raise exception 'renew_pipeline_not_found' using errcode = 'P0002';
    end if;
  end if;
  if v_row.renew_stage_id is not null then
    select s.id into v_stage from public.pipeline_stages_v2 s
     where s.id = v_row.renew_stage_id and s.deleted_at is null
       and s.pipeline_id = v_row.renew_pipeline_id;
    if v_stage is null then
      raise exception 'renew_stage_not_in_pipeline' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    insert into public.catalog_items
      (equipe_id, name, kind, price, price_mode, recurrence_every, recurrence_unit,
       renew_days_before, renew_pipeline_id, renew_stage_id, description, active)
    values
      (v_equipe, v_row.name, v_row.kind, v_row.price, v_row.price_mode, v_row.recurrence_every,
       v_row.recurrence_unit, v_row.renew_days_before, v_row.renew_pipeline_id, v_row.renew_stage_id,
       v_row.description, v_row.active)
    returning id into v_id;
  else
    update public.catalog_items c
       set name = v_row.name, kind = v_row.kind, price = v_row.price, price_mode = v_row.price_mode,
           recurrence_every = v_row.recurrence_every, recurrence_unit = v_row.recurrence_unit,
           renew_days_before = v_row.renew_days_before, renew_pipeline_id = v_row.renew_pipeline_id,
           renew_stage_id = v_row.renew_stage_id, description = v_row.description, active = v_row.active
     where c.id = v_id;
  end if;

  return v_id;
end;
$$;

-- Arquiva (esconde). Devolve quantos saíram; o que não é da equipe conta 0.
create or replace function public.crm_archive_catalog_items(p_ids uuid[])
returns int
language sql
set search_path = public
as $$
  with a as (
    update public.catalog_items c
       set deleted_at = now(), active = false
     where c.id = any(coalesce(p_ids, array[]::uuid[]))
       and c.deleted_at is null
    returning 1
  )
  select count(*)::int from a;
$$;

revoke all on function public.crm_save_catalog_item(jsonb) from public, anon;
revoke all on function public.crm_archive_catalog_items(uuid[]) from public, anon;
grant execute on function public.crm_save_catalog_item(jsonb) to authenticated;
grant execute on function public.crm_archive_catalog_items(uuid[]) to authenticated;
grant select, insert, update on public.catalog_items to authenticated;
