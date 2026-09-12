-- Sprint 11 · Onda 3 · T32 — a situação e o ciclo de vida do contato (decisão 17).
--
-- REFINAMENTO DA DECISÃO 17 (visto na produção em 11/09): 65 negócios ganhos não
-- têm valor (62 da Solo Energia) — a receita deles é zero. "Cliente = receita
-- líquida > 0" rebaixaria 49 clientes de verdade. Então:
--
--   * CLIENTE continua sendo quem tem um negócio ganho vivo (não apagado). É o
--     mesmo fato que gera a receita: um ganho reaberto, perdido ou apagado deixa
--     de ser ganho e tem a receita estornada (T31) — os dois andam juntos.
--   * GANHO TOTAL passa a ser a receita líquida do contato (livro-razão do T31):
--     itens, ajustes e estornos incluídos. ÚLTIMO GANHO segue a data do último
--     negócio ganho (um ganho sem valor tem data, não tem lançamento).
--   * `leads.lifecycle_stage` volta a significar algo: acompanha os negócios —
--     client (ganho vivo) > opportunity (aberto) > lost (só perdidos). Quem não
--     tem negócio fica como está (raw/mql/sql — o sweep do Copilot usa `mql`).

-- ============================================================================
-- 1. A BASE DE CONTATOS: Ganho total pela receita
-- ============================================================================

create or replace function public._crm_contacts_base(p_filters jsonb)
returns table (
  l            public.leads,
  relationship text,
  open_count   int,
  won_value    numeric,
  last_won_at  timestamptz
)
language sql
stable
as $$
  with me as (
    select p.equipe_id from public.profiles p where p.id = auth.uid()
  ),
  f as materialized (
    select public._crm_compile_lead_filters(p_filters) as c
  ),
  agg as materialized (
    select o.lead_id,
           case
             when bool_or(o.status = 'won')  then 'cliente'
             when bool_or(o.status = 'open') then 'negociando'
             when bool_or(o.status = 'lost') then 'perdido'
             else 'sem_negocio'
           end as relationship,
           (count(*) filter (where o.status = 'open'))::int as open_count,
           max(o.closed_at) filter (where o.status = 'won') as last_won_at,
           array_agg(distinct o.pipeline_id) as pipelines,
           array_agg(distinct o.owner_id) filter (where o.owner_id is not null) as owners,
           bool_or(o.owner_id is null) as unowned
      from public.opportunities o
     where o.equipe_id = (select equipe_id from me)
       and o.deleted_at is null
     group by o.lead_id
  ),
  rev as materialized (
    select e.lead_id, sum(e.amount) as net
      from public.revenue_entries e
     where e.equipe_id = (select equipe_id from me)
     group by e.lead_id
  )
  select ld,
         coalesce(a.relationship, 'sem_negocio'),
         coalesce(a.open_count, 0),
         coalesce(r.net, 0),
         a.last_won_at
    from public.leads ld
    cross join f
    left join agg a on a.lead_id = ld.id
    left join rev r on r.lead_id = ld.id
   where ld.equipe_id = (select equipe_id from me)
     and ld.deleted_at is null
     and public._crm_lead_matches_c(
           ld, f.c,
           coalesce(a.relationship, 'sem_negocio'),
           a.pipelines,
           a.owners,
           coalesce(a.unowned, false)
         );
$$;

-- ============================================================================
-- 2. O CICLO DE VIDA ACOMPANHA OS NEGÓCIOS
-- ============================================================================

create or replace function public._crm_lifecycle_from_deals(p_lead_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when bool_or(o.status = 'won')  then 'client'
    when bool_or(o.status = 'open') then 'opportunity'
    when bool_or(o.status = 'lost') then 'lost'
  end
    from public.opportunities o
   where o.lead_id = p_lead_id
     and o.deleted_at is null;
$$;

create or replace function public.fn_lead_lifecycle_from_deals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage text;
begin
  -- O contato de agora (e o de antes, se o negócio mudou de contato).
  v_stage := public._crm_lifecycle_from_deals(new.lead_id);
  if v_stage is not null then
    update public.leads l set lifecycle_stage = v_stage
     where l.id = new.lead_id and l.lifecycle_stage is distinct from v_stage;
  end if;

  if tg_op = 'UPDATE' and old.lead_id is distinct from new.lead_id then
    v_stage := public._crm_lifecycle_from_deals(old.lead_id);
    if v_stage is not null then
      update public.leads l set lifecycle_stage = v_stage
       where l.id = old.lead_id and l.lifecycle_stage is distinct from v_stage;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_lead_lifecycle_from_deals_insert on public.opportunities;
create trigger trg_lead_lifecycle_from_deals_insert
  after insert on public.opportunities
  for each row execute function public.fn_lead_lifecycle_from_deals();

drop trigger if exists trg_lead_lifecycle_from_deals_update on public.opportunities;
create trigger trg_lead_lifecycle_from_deals_update
  after update on public.opportunities
  for each row
  when (old.status     is distinct from new.status
     or old.deleted_at is distinct from new.deleted_at
     or old.lead_id    is distinct from new.lead_id)
  execute function public.fn_lead_lifecycle_from_deals();

revoke all on function public._crm_lifecycle_from_deals(uuid) from public, anon, authenticated;
