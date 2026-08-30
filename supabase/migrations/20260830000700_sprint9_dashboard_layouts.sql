-- 20260830000700_sprint9_dashboard_layouts.sql
-- Sprint 9 · T8 — "put more or less data to show", in the Vision's words.
--
-- TWO LAYERS, NOT ONE
--
-- A team default that an admin sets (user_id IS NULL) and a personal override
-- on top of it. Both are needed and they are not the same feature:
--
--   * the admin default is how a founder decides what their operation looks at
--     — new sellers inherit it and there is one shared vocabulary in stand-ups;
--   * the personal override is how the one person who only cares about no-shows
--     stops scrolling past four revenue tiles every morning.
--
-- Resolution is simply "personal if present, else team default, else the
-- catalogue's built-in order". No merging of the two: a merge means a widget an
-- admin removes stays on the screen of everyone who had ever touched their
-- layout, which is the opposite of what removing it meant.
--
-- WHY jsonb AND NOT A ROW PER WIDGET
--
-- A layout is read and written whole, always, and never queried across tenants
-- ("which widgets are popular?" is not a question this product asks). A widget
-- table would buy queryability nobody wants and cost a transaction to reorder
-- a list.
--
-- WHAT IS NOT STORED HERE
--
-- Not the data, not the filters, not the period. A layout says which cards
-- exist and in what order. The period lives in the page's own state so that a
-- link shared between two people shows both of them the same numbers.

begin;

create table if not exists public.dashboard_layouts (
  id         uuid primary key default gen_random_uuid(),
  equipe_id  uuid not null references public.equipes(id) on delete cascade,
  -- NULL = the team default, editable by admin/owner only (enforced in the
  -- policies below, since RLS is the only thing standing between a curious
  -- seat and everyone else's screen).
  user_id    uuid references public.profiles(id) on delete cascade,
  -- Which page this layout belongs to. Only 'overview' ships in Sprint 9; the
  -- column exists so the funnel/team/channel pages can gain layouts later
  -- without a migration that rewrites everyone's rows.
  page       text not null default 'overview' check (page in ('overview')),
  widgets    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.dashboard_layouts is
  'Sprint 9: which widgets a dashboard page shows and in what order. One row per team (user_id NULL) plus one per user who personalised it. Holds layout only — never data, filters or period.';

-- `nulls not distinct` is the point: without it Postgres treats every NULL
-- user_id as unique and a team would accumulate a new "default" row on every
-- save, with the newest one winning at random.
create unique index if not exists dashboard_layouts_scope_key
  on public.dashboard_layouts (equipe_id, page, user_id) nulls not distinct;

alter table public.dashboard_layouts enable row level security;

-- Everyone in the team reads both their own layout and the team default.
drop policy if exists dashboard_layouts_select on public.dashboard_layouts;
create policy dashboard_layouts_select on public.dashboard_layouts
  for select to authenticated
  using (equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid()));

-- A user writes their OWN row (user_id = auth.uid()). Nothing else.
drop policy if exists dashboard_layouts_write_own on public.dashboard_layouts;
create policy dashboard_layouts_write_own on public.dashboard_layouts
  for all to authenticated
  using (
    user_id = auth.uid()
    and equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid())
  );

-- The team default (user_id IS NULL) is admin/owner territory. Without this
-- split any seat could rewrite what the whole company sees on login.
drop policy if exists dashboard_layouts_write_team on public.dashboard_layouts;
create policy dashboard_layouts_write_team on public.dashboard_layouts
  for all to authenticated
  using (
    user_id is null
    and equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid())
    and exists (select 1 from public.user_roles r
                 where r.user_id = auth.uid() and r.role in ('admin','owner','super_admin'))
  )
  with check (
    user_id is null
    and equipe_id in (select p.equipe_id from public.profiles p where p.id = auth.uid())
    and exists (select 1 from public.user_roles r
                 where r.user_id = auth.uid() and r.role in ('admin','owner','super_admin'))
  );

grant select, insert, update, delete on public.dashboard_layouts to authenticated;

drop trigger if exists set_dashboard_layouts_updated_at on public.dashboard_layouts;
create trigger set_dashboard_layouts_updated_at
  before update on public.dashboard_layouts
  for each row execute function public.update_updated_at_column();

-- ============================================================================
-- SAVE — one call, correct scope, no round trip to work out which row to touch
--
-- The browser cannot be trusted to send the right equipe_id or to decide
-- whether it is allowed to write the team default, so it sends neither: it
-- sends the widgets and whether this is meant as the team default, and the
-- function resolves the rest and refuses what the caller may not do.
-- ============================================================================

create or replace function public.save_dashboard_layout(
  p_widgets   jsonb,
  p_as_team   boolean default false,
  p_page      text default 'overview'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  if jsonb_typeof(p_widgets) <> 'array' then
    raise exception 'widgets_must_be_array' using errcode = '22023';
  end if;

  if p_as_team then
    if not exists (select 1 from public.user_roles r
                    where r.user_id = auth.uid()
                      and r.role in ('admin','owner','super_admin')) then
      raise exception 'forbidden: only admins set the team default' using errcode = '42501';
    end if;

    insert into public.dashboard_layouts (equipe_id, user_id, page, widgets, updated_by)
    values (v_equipe, null, p_page, p_widgets, auth.uid())
    on conflict (equipe_id, page, user_id)
      do update set widgets = excluded.widgets,
                    updated_by = excluded.updated_by,
                    updated_at = now();
  else
    insert into public.dashboard_layouts (equipe_id, user_id, page, widgets, updated_by)
    values (v_equipe, auth.uid(), p_page, p_widgets, auth.uid())
    on conflict (equipe_id, page, user_id)
      do update set widgets = excluded.widgets,
                    updated_by = excluded.updated_by,
                    updated_at = now();
  end if;

  return jsonb_build_object('saved', true, 'scope', case when p_as_team then 'team' else 'user' end);
end;
$$;

revoke all on function public.save_dashboard_layout(jsonb, boolean, text) from public;
grant execute on function public.save_dashboard_layout(jsonb, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Dropping a personal layout returns the user to the team default. This is the
-- "voltar ao padrão" button, and it must delete rather than write an empty
-- array — an empty array is a valid layout meaning "show nothing".
-- ----------------------------------------------------------------------------

create or replace function public.reset_dashboard_layout(p_page text default 'overview')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.dashboard_layouts
   where user_id = auth.uid() and page = p_page;
  return jsonb_build_object('reset', true);
end;
$$;

revoke all on function public.reset_dashboard_layout(text) from public;
grant execute on function public.reset_dashboard_layout(text) to authenticated;

commit;
