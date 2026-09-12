-- Sprint 11 · Onda 3 · T31 — ganho → receita (decisão 12).
--
-- A receita é um LIVRO-RAZÃO: `revenue_entries`, só inserção. Ninguém edita um
-- lançamento; uma correção é outro lançamento. A receita de um período é a soma
-- dos lançamentos daquele período.
--
--   * GANHO → um lançamento por item do negócio (T30), ou um pelo valor quando o
--     negócio não tem itens; na data do ganho (closed_at), com o responsável do
--     momento (_opportunity_owner_at, T14).
--   * REABRIR, PERDER, APAGAR → estorno de tudo o que estava lançado, no período
--     de cada lançamento: a receita de agosto é "o que foi ganho em agosto, como
--     está hoje" (o negócio reaberto por engano em setembro some de agosto).
--   * MUDAR VALOR/ITENS DE UM GANHO → ajuste, no período do ganho, do mesmo dono.
--   * MUDAR A DATA DO GANHO → a receita muda de período (estorno no velho,
--     lançamento no novo).
--
-- UMA FUNÇÃO DECIDE: _crm_sync_revenue(negócio) compara o que o negócio DEVE ter
-- lançado (por linha, na data do ganho) com o que JÁ ESTÁ lançado (por linha e
-- período) e lança só a diferença. Chamá-la duas vezes não lança nada na
-- segunda — os gatilhos podem chamar à vontade.
--
-- QUEM CHAMA: um gatilho no negócio (status, valor, data do ganho, apagado) e
-- um gatilho ADIADO nos itens (roda no commit, quando a lista já está pronta —
-- o verbo dos itens escreve linha a linha e não queremos ajustes intermediários).

create table if not exists public.revenue_entries (
  id                   uuid primary key default gen_random_uuid(),
  equipe_id            uuid not null references public.equipes(id) on delete cascade,
  opportunity_id       uuid not null references public.opportunities(id) on delete cascade,
  lead_id              uuid references public.leads(id) on delete set null,
  pipeline_id          uuid references public.pipelines(id) on delete set null,
  opportunity_item_id  uuid references public.opportunity_items(id) on delete set null,
  catalog_item_id      uuid references public.catalog_items(id) on delete set null,
  line_key             text not null,
  amount               numeric(16, 2) not null,
  kind                 text not null,
  recognized_at        timestamptz not null,
  owner_id             uuid,
  actor                uuid,
  source               text not null default 'sync',
  created_at           timestamptz not null default clock_timestamp(),
  constraint revenue_entries_kind   check (kind in ('booking', 'adjustment', 'reversal')),
  constraint revenue_entries_source check (source in ('sync', 'backfill'))
);

comment on table public.revenue_entries is
  'Sprint 11 · T31: the revenue ledger. Insert-only (written by _crm_sync_revenue). A period''s revenue is the sum of its entries; corrections are new entries in the original period.';

create index if not exists idx_revenue_entries_equipe_time on public.revenue_entries (equipe_id, recognized_at);
create index if not exists idx_revenue_entries_opportunity on public.revenue_entries (opportunity_id);
create index if not exists idx_revenue_entries_owner on public.revenue_entries (equipe_id, owner_id, recognized_at);
create index if not exists idx_revenue_entries_pipeline on public.revenue_entries (pipeline_id, recognized_at);
create index if not exists idx_revenue_entries_catalog on public.revenue_entries (catalog_item_id) where catalog_item_id is not null;
create index if not exists idx_revenue_entries_lead on public.revenue_entries (lead_id);

alter table public.revenue_entries enable row level security;

drop policy if exists "team reads revenue" on public.revenue_entries;
create policy "team reads revenue" on public.revenue_entries
  for select using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- Nenhuma política de escrita: o app lê; só o banco (funções definer) escreve.
revoke insert, update, delete on public.revenue_entries from authenticated, anon;
grant select on public.revenue_entries to authenticated;

-- ============================================================================
-- A FUNÇÃO QUE DECIDE
-- ============================================================================

create or replace function public._crm_sync_revenue(p_opportunity_id uuid, p_source text default 'sync')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp   public.opportunities;
  v_when  timestamptz;
  v_owner uuid;
  v_live  boolean;
  v_n     integer;
begin
  select * into v_opp from public.opportunities o where o.id = p_opportunity_id;
  if not found then
    return 0;
  end if;

  v_live  := v_opp.status = 'won' and v_opp.deleted_at is null;
  v_when  := coalesce(v_opp.closed_at, v_opp.updated_at, v_opp.created_at);
  v_owner := coalesce(public._opportunity_owner_at(v_opp.id, v_when), v_opp.owner_id);

  with items as (
    select i.id, i.catalog_item_id, i.total
      from public.opportunity_items i
     where i.opportunity_id = v_opp.id and i.deleted_at is null
  ),
  desired as (
    -- Ganho: um por item...
    select 'item:' || it.id::text as line_key, it.id as item_id, it.catalog_item_id, it.total::numeric as amount
      from items it
     where v_live
    union all
    -- ...ou um pelo valor, sem itens.
    select 'value', null::uuid, null::uuid, coalesce(v_opp.value, 0)::numeric
     where v_live and not exists (select 1 from items)
  ),
  existing as (
    select e.line_key, e.recognized_at, sum(e.amount) as net,
           (array_agg(e.opportunity_item_id) filter (where e.opportunity_item_id is not null))[1] as item_id,
           (array_agg(e.catalog_item_id) filter (where e.catalog_item_id is not null))[1] as catalog_item_id,
           (array_agg(e.owner_id order by e.created_at) filter (where e.owner_id is not null))[1] as owner_id
      from public.revenue_entries e
     where e.opportunity_id = v_opp.id
     group by e.line_key, e.recognized_at
  ),
  -- O que está lançado num período que não é o do ganho atual, ou numa linha que
  -- não deve mais existir: estorno total, no período do lançamento, do mesmo dono.
  reversals as (
    select ex.line_key, ex.recognized_at, -ex.net as amount, ex.item_id, ex.catalog_item_id,
           ex.owner_id, 'reversal'::text as kind
      from existing ex
     where ex.net <> 0
       and (ex.recognized_at <> v_when
            or not exists (select 1 from desired d where d.line_key = ex.line_key))
  ),
  -- O que deve estar lançado no período do ganho: a diferença.
  deltas as (
    select d.line_key, v_when as recognized_at, d.amount - coalesce(ex.net, 0) as amount,
           d.item_id, d.catalog_item_id, v_owner as owner_id,
           case when ex.line_key is null or ex.net = 0 then 'booking' else 'adjustment' end as kind
      from desired d
      left join existing ex on ex.line_key = d.line_key and ex.recognized_at = v_when
     where d.amount - coalesce(ex.net, 0) <> 0
  )
  insert into public.revenue_entries
    (equipe_id, opportunity_id, lead_id, pipeline_id, opportunity_item_id, catalog_item_id,
     line_key, amount, kind, recognized_at, owner_id, actor, source)
  select v_opp.equipe_id, v_opp.id, v_opp.lead_id, v_opp.pipeline_id, x.item_id, x.catalog_item_id,
         x.line_key, x.amount, x.kind, x.recognized_at, x.owner_id, auth.uid(), p_source
    from (select * from reversals union all select * from deltas) x;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public._crm_sync_revenue(uuid, text) is
  'Sprint 11 · T31: books the difference between what a deal owes (won: its items or its value, at closed_at, owner of the moment) and what is already in revenue_entries. Idempotent.';

revoke all on function public._crm_sync_revenue(uuid, text) from public, anon, authenticated;

-- ============================================================================
-- QUEM CHAMA
-- ============================================================================

create or replace function public.fn_opportunity_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nasce aberto e sem receita: nada a fazer (o caso comum).
  if tg_op = 'INSERT' and new.status <> 'won' then
    return null;
  end if;
  perform public._crm_sync_revenue(new.id);
  return null;
end;
$$;

-- Nasce ganho (importação): lança. UPDATE: só quando algo que muda a receita mudou.
drop trigger if exists trg_opportunity_revenue_insert on public.opportunities;
create trigger trg_opportunity_revenue_insert
  after insert on public.opportunities
  for each row
  when (new.status = 'won')
  execute function public.fn_opportunity_revenue();
drop trigger if exists trg_opportunity_revenue_update on public.opportunities;
create trigger trg_opportunity_revenue_update
  after update on public.opportunities
  for each row
  when (old.status     is distinct from new.status
     or old.value      is distinct from new.value
     or old.closed_at  is distinct from new.closed_at
     or old.deleted_at is distinct from new.deleted_at)
  execute function public.fn_opportunity_revenue();

-- Itens: adiado para o commit (a lista inteira já está gravada).
create or replace function public.fn_opportunity_items_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.opportunities o where o.id = new.opportunity_id and o.status = 'won')
     or exists (select 1 from public.revenue_entries e where e.opportunity_id = new.opportunity_id) then
    perform public._crm_sync_revenue(new.opportunity_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_opportunity_items_revenue on public.opportunity_items;
create constraint trigger trg_opportunity_items_revenue
  after insert or update on public.opportunity_items
  deferrable initially deferred
  for each row
  execute function public.fn_opportunity_items_revenue();
