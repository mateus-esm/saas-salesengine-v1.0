-- Sprint 11 · Onda 3 · T30 — os itens do negócio (decisão 13).
--
-- Um negócio pode listar o que está vendendo: itens do catálogo (T29) ou linhas
-- avulsas. Com pelo menos um item, `opportunities.value` = soma dos itens, e o
-- banco não deixa discordar (escrever o valor direto volta à soma). Sem itens, o
-- valor segue livre — o comportamento de hoje, para quem não usa catálogo.
--
-- O item guarda uma cópia do momento em que entrou: nome, preço, se o preço era
-- fixo, e a recorrência do catálogo. O catálogo pode mudar ou ser arquivado
-- depois; o que foi vendido não muda com ele.
--
-- ESCRITA SÓ PELO VERBO. A tabela é só leitura para o app (RLS: select da
-- equipe); `crm_set_opportunity_items` é security definer — tira a equipe do
-- token e confere o negócio e o catálogo — porque é ele quem garante que preço
-- fixo vem do catálogo, não do pedido. A lista troca por DIFERENÇA: a linha
-- mandada com id é editada no lugar (a receita do T31 lança por linha, e trocar
-- o id de uma linha viraria estorno + lançamento).

create table if not exists public.opportunity_items (
  id                 uuid primary key default gen_random_uuid(),
  equipe_id          uuid not null references public.equipes(id) on delete cascade,
  opportunity_id     uuid not null references public.opportunities(id) on delete cascade,
  catalog_item_id    uuid references public.catalog_items(id) on delete set null,
  name               text not null,
  quantity           numeric(14, 3) not null default 1,
  unit_price         numeric(14, 2) not null default 0,
  total              numeric(16, 2) generated always as (round(quantity * unit_price, 2)) stored,
  price_locked       boolean not null default false,
  recurrence_every   integer,
  recurrence_unit    text,
  renew_days_before  integer not null default 0,
  renew_pipeline_id  uuid references public.pipelines(id) on delete set null,
  renew_stage_id     uuid references public.pipeline_stages_v2(id) on delete set null,
  position           integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint opportunity_item_name_present check (length(btrim(name)) > 0),
  constraint opportunity_item_quantity_positive check (quantity > 0),
  constraint opportunity_item_price_positive check (unit_price >= 0),
  constraint opportunity_item_recurrence_pair check ((recurrence_every is null) = (recurrence_unit is null)),
  constraint opportunity_item_recurrence_unit check (recurrence_unit is null or recurrence_unit in ('day', 'month'))
);

create index if not exists idx_opportunity_items_opportunity
  on public.opportunity_items (opportunity_id) where deleted_at is null;
create index if not exists idx_opportunity_items_catalog
  on public.opportunity_items (catalog_item_id) where deleted_at is null;

drop trigger if exists set_opportunity_items_updated_at on public.opportunity_items;
create trigger set_opportunity_items_updated_at
  before update on public.opportunity_items
  for each row execute function public.update_updated_at_column();

alter table public.opportunity_items enable row level security;

drop policy if exists "team reads deal items" on public.opportunity_items;
create policy "team reads deal items" on public.opportunity_items
  for select using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- ============================================================================
-- O VALOR É A SOMA (quando há itens)
-- ============================================================================

create or replace function public.fn_opportunity_value_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  select sum(i.total) into v_total
    from public.opportunity_items i
   where i.opportunity_id = new.id and i.deleted_at is null;
  if v_total is not null then
    new.value := v_total;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_opportunity_value_from_items on public.opportunities;
create trigger trg_opportunity_value_from_items
  before update of value on public.opportunities
  for each row execute function public.fn_opportunity_value_from_items();

-- ============================================================================
-- O VERBO
-- ============================================================================

-- p_items: [{ id?, catalog_item_id?, name?, quantity?, unit_price? }, ...] na ordem.
-- Devolve { value, items }.
create or replace function public.crm_set_opportunity_items(p_opportunity_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team     uuid;
  v_item     jsonb;
  v_id       uuid;
  v_cat_id   uuid;
  v_cat      public.catalog_items;
  v_existing public.opportunity_items;
  v_keep     uuid[] := array[]::uuid[];
  v_pos      integer := 0;
  v_qty      numeric;
  v_price    numeric;
  v_total    numeric;
begin
  select p.equipe_id into v_team from public.profiles p where p.id = auth.uid();
  if v_team is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  if not exists (select 1 from public.opportunities o
                  where o.id = p_opportunity_id and o.equipe_id = v_team and o.deleted_at is null) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'items_must_be_an_array' using errcode = '22023';
  end if;

  for v_item in select e.value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e loop
    v_id    := nullif(v_item->>'id', '')::uuid;
    v_qty   := nullif(v_item->>'quantity', '')::numeric;
    v_price := nullif(v_item->>'unit_price', '')::numeric;

    if v_id is not null then
      -- Uma linha que o negócio já tem: editada no lugar (o catálogo não é relido).
      select * into v_existing from public.opportunity_items i
       where i.id = v_id and i.opportunity_id = p_opportunity_id and i.deleted_at is null;
      if not found then
        raise exception 'item_not_found' using errcode = 'P0002';
      end if;
      update public.opportunity_items i
         set quantity   = coalesce(v_qty, v_existing.quantity),
             unit_price = case when v_existing.price_locked then v_existing.unit_price
                               else coalesce(v_price, v_existing.unit_price) end,
             name       = case when v_existing.catalog_item_id is null
                               then coalesce(nullif(btrim(v_item->>'name'), ''), v_existing.name)
                               else v_existing.name end,
             position   = v_pos
       where i.id = v_id;
    else
      v_cat_id := nullif(v_item->>'catalog_item_id', '')::uuid;
      if v_cat_id is not null then
        -- Do catálogo: da equipe, não arquivado, disponível. Preço fixo manda.
        select * into v_cat from public.catalog_items c
         where c.id = v_cat_id and c.equipe_id = v_team and c.deleted_at is null;
        if not found then
          raise exception 'catalog_item_not_found' using errcode = 'P0002';
        end if;
        if not v_cat.active then
          raise exception 'catalog_item_paused' using errcode = '22023';
        end if;
        insert into public.opportunity_items
          (equipe_id, opportunity_id, catalog_item_id, name, quantity, unit_price, price_locked,
           recurrence_every, recurrence_unit, renew_days_before, renew_pipeline_id, renew_stage_id, position)
        values
          (v_team, p_opportunity_id, v_cat.id, v_cat.name, coalesce(v_qty, 1),
           case when v_cat.price_mode = 'fixed' then v_cat.price else coalesce(v_price, v_cat.price, 0) end,
           v_cat.price_mode = 'fixed',
           v_cat.recurrence_every, v_cat.recurrence_unit, v_cat.renew_days_before,
           v_cat.renew_pipeline_id, v_cat.renew_stage_id, v_pos)
        returning id into v_id;
      else
        -- Linha avulsa.
        insert into public.opportunity_items
          (equipe_id, opportunity_id, name, quantity, unit_price, position)
        values
          (v_team, p_opportunity_id, btrim(coalesce(v_item->>'name', '')), coalesce(v_qty, 1), coalesce(v_price, 0), v_pos)
        returning id into v_id;
      end if;
    end if;

    v_keep := v_keep || v_id;
    v_pos := v_pos + 1;
  end loop;

  -- O que não veio na lista sai (arquivado, para a receita saber que saiu).
  update public.opportunity_items i
     set deleted_at = now()
   where i.opportunity_id = p_opportunity_id
     and i.deleted_at is null
     and not (i.id = any(v_keep));

  select sum(i.total) into v_total
    from public.opportunity_items i
   where i.opportunity_id = p_opportunity_id and i.deleted_at is null;
  if v_total is not null then
    update public.opportunities o set value = v_total
     where o.id = p_opportunity_id and o.value is distinct from v_total;
  end if;

  return jsonb_build_object(
    'value', (select o.value from public.opportunities o where o.id = p_opportunity_id),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position)
                         from public.opportunity_items i
                        where i.opportunity_id = p_opportunity_id and i.deleted_at is null), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.crm_set_opportunity_items(uuid, jsonb) from public, anon;
grant execute on function public.crm_set_opportunity_items(uuid, jsonb) to authenticated;
grant select on public.opportunity_items to authenticated;
