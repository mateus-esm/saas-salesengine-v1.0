-- 20260910000100_sprint11_opportunity_owner.sql
-- Sprint 11 · T2 — o negócio tem responsável.
--
-- POR QUE NO NEGÓCIO, E NÃO SÓ NO CONTATO
--
-- "Filtrar por responsável" no Kanban, o placar por vendedor e, depois, o dono de
-- uma campanha perguntam todos a mesma coisa: de quem é ESTE negócio. Um contato
-- pode ter dois negócios tocados por pessoas diferentes. Então o responsável mora
-- em opportunities.owner_id; leads.responsible_id continua sendo o dono do
-- contato, e um negócio novo herda dele por padrão.
--
-- O placar da Sprint 6.9 já pedia `assigned_to` em opportunities — uma coluna que
-- nunca existiu. O erro era engolido e o placar mostrava zero. Esta é a coluna
-- que ele deveria ter lido.
--
-- A EQUIPE ENXERGA A PRÓPRIA EQUIPE
--
-- A RLS de profiles só deixa cada usuário ler o próprio profile (e o super admin
-- ler todos). Por isso, para um vendedor, todo seletor de "membro da equipe" do
-- app mostrava só ele mesmo, e um nome de responsável num card sairia em branco.
-- crm_team_members() devolve id, nome e e-mail da equipe de quem chama — nada de
-- outra equipe, nada além disso.
--
-- Sem begin/commit próprios: o `supabase db push` já roda o arquivo numa
-- transação, e o scripts/sqltest.sh inclui este arquivo dentro da transação do
-- teste.

-- ============================================================================
-- 1. A COLUNA
-- ============================================================================

alter table public.opportunities
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

comment on column public.opportunities.owner_id is
  'Sprint 11: responsável pelo negócio. Nulo = sem responsável. Herda leads.responsible_id no insert quando não informado.';

create index if not exists idx_opportunities_equipe_owner
  on public.opportunities (equipe_id, owner_id)
  where deleted_at is null;

-- ============================================================================
-- 2. HERDA DO CONTATO
--
-- SECURITY DEFINER porque roda na sessão de quem insere: a leitura do lead não
-- pode depender da RLS de quem está criando o negócio.
-- ============================================================================

create or replace function public.fn_opportunity_default_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null and new.lead_id is not null then
    select l.responsible_id
      into new.owner_id
      from public.leads l
     where l.id = new.lead_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_opportunity_default_owner on public.opportunities;
create trigger trg_opportunity_default_owner
  before insert on public.opportunities
  for each row execute function public.fn_opportunity_default_owner();

-- ============================================================================
-- 3. O RESPONSÁVEL É DA EQUIPE DO NEGÓCIO
--
-- A FK só garante que o profile existe. Sem esta checagem, um membro poderia
-- apontar o negócio para um usuário de outro cliente. Dispara depois do default
-- (triggers BEFORE rodam em ordem alfabética: default_owner < owner_same_team),
-- então o responsável herdado também é validado.
--
-- SECURITY DEFINER pelo mesmo motivo da seção 1: a RLS de profiles não deixaria
-- um vendedor enxergar o profile de um colega.
-- ============================================================================

create or replace function public.fn_opportunity_owner_same_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null and not exists (
    select 1
      from public.profiles p
     where p.id = new.owner_id
       and p.equipe_id = new.equipe_id
  ) then
    raise exception 'owner_not_in_team: o responsável % não pertence à equipe deste negócio', new.owner_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_opportunity_owner_same_team on public.opportunities;
create trigger trg_opportunity_owner_same_team
  before insert or update of owner_id, equipe_id on public.opportunities
  for each row execute function public.fn_opportunity_owner_same_team();

-- ============================================================================
-- 4. BACKFILL
--
-- Em 10/09 nenhum lead da base tinha responsible_id, então isto não muda nada
-- hoje. Fica para ambientes onde tenha.
-- ============================================================================

update public.opportunities o
   set owner_id = l.responsible_id
  from public.leads l
 where l.id = o.lead_id
   and o.owner_id is null
   and l.responsible_id is not null
   and exists (
     select 1 from public.profiles p
      where p.id = l.responsible_id and p.equipe_id = o.equipe_id
   );

-- ============================================================================
-- 5. QUEM É DA MINHA EQUIPE
-- ============================================================================

create or replace function public.crm_team_members()
returns table (id uuid, nome_completo text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         coalesce(nullif(trim(p.nome_completo), ''), split_part(p.email, '@', 1)) as nome_completo,
         p.email
    from public.profiles p
   where p.equipe_id is not null
     and p.equipe_id = (select me.equipe_id from public.profiles me where me.id = auth.uid())
   order by 2;
$$;

comment on function public.crm_team_members() is
  'Sprint 11: id, nome e e-mail dos membros da equipe de quem chama. A RLS de profiles só mostra o próprio profile; esta é a porta para seletores de responsável e nomes nos cards.';

revoke all on function public.crm_team_members() from public, anon;
grant execute on function public.crm_team_members() to authenticated;
