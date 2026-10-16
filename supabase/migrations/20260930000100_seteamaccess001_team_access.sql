-- 20260930000100_seteamaccess001_team_access.sql
-- Sprint 14 · painel do dono: usuários e permissões da própria equipe.
--
-- O dono da equipe adiciona pessoas, muda o papel (user/admin) e RESTRINGE o
-- acesso, até o limite de assentos do plano.
--
-- DECISÃO: restringir não apaga. Apagar usuário esbarra em FKs NO ACTION e
-- destrói o histórico (responsável de lead, autor de nota). Restringir mantém a
-- pessoa e tudo que ela fez, bloqueia o login (ban no auth, feito pela edge
-- function) e LIBERA o assento — é o que o dono espera ao "tirar alguém".
--
-- DECISÃO: assento = membro ATIVO. tenant_seat_usage passa a ignorar os
-- restritos; reativar alguém passa pelo mesmo trigger que adicionar.

-- ============================================================================
-- 1. ESTADO DE ACESSO
-- ============================================================================

alter table public.profiles
  add column if not exists access_status text not null default 'active',
  add column if not exists access_changed_at timestamptz;

alter table public.profiles drop constraint if exists profiles_access_status_check;
alter table public.profiles
  add constraint profiles_access_status_check
  check (access_status in ('active', 'restricted'));

comment on column public.profiles.access_status is
  'SE-TEAMACCESS-001 · active | restricted. Restrito não faz login (ban no auth) e não ocupa assento.';

-- ============================================================================
-- 2. ASSENTO = MEMBRO ATIVO
-- ============================================================================

create or replace function public.tenant_seat_usage(p_equipe_id uuid)
returns jsonb
language sql stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'used', (select count(*) from public.profiles
              where equipe_id = p_equipe_id and access_status = 'active'),
    'limit', (select seat_limit from public.v_tenant_entitlements where equipe_id = p_equipe_id),
    'can_add', coalesce(
      (select count(*) from public.profiles
        where equipe_id = p_equipe_id and access_status = 'active')
        < (select seat_limit from public.v_tenant_entitlements where equipe_id = p_equipe_id),
      -- Sem plano, sem limite: tenant sem contrato não está sendo vendido assento.
      true)
  );
$fn$;

-- O trigger agora também barra a REATIVAÇÃO: voltar de restricted para active
-- volta a ocupar um assento, então passa pela mesma conta de entrar na equipe.
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_usage jsonb;
  v_reactivating boolean;
begin
  if new.equipe_id is null then return new; end if;
  -- Quem entra já restrito não ocupa assento.
  if new.access_status = 'restricted' then return new; end if;

  v_reactivating := tg_op = 'UPDATE'
    and old.access_status = 'restricted' and new.access_status = 'active';

  if tg_op = 'UPDATE'
     and old.equipe_id is not distinct from new.equipe_id
     and not v_reactivating then
    return new;
  end if;

  -- Neste ponto a linha ainda é restrita (ou nem existe) na tabela, então a
  -- contagem não inclui quem está tentando entrar.
  v_usage := public.tenant_seat_usage(new.equipe_id);
  if not (v_usage->>'can_add')::boolean then
    raise exception 'seat_limit_reached: % de % assentos em uso',
      v_usage->>'used', v_usage->>'limit' using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;

-- ============================================================================
-- 3. A TELA DO DONO: UMA LEITURA, SEM ABRIR A RLS DE profiles
-- ============================================================================

create or replace function public.team_access_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_equipe uuid;
begin
  select p.equipe_id into v_equipe from public.profiles p where p.user_id = auth.uid();
  if v_equipe is null then
    raise exception 'no_team' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid() and ur.role::text in ('owner', 'super_admin')
  ) then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'equipe_id', v_equipe,
    'seats', public.tenant_seat_usage(v_equipe),
    'members', coalesce((
      select jsonb_agg(m order by m->>'nome_completo')
      from (
        select jsonb_build_object(
          'user_id', p.user_id,
          'email', p.email,
          'nome_completo', coalesce(nullif(trim(p.nome_completo), ''), split_part(p.email, '@', 1)),
          'role', coalesce((
            select ur.role::text from public.user_roles ur
             where ur.user_id = p.user_id
             order by case ur.role::text
               when 'super_admin' then 4 when 'owner' then 3 when 'admin' then 2 else 1 end desc
             limit 1), 'user'),
          'access_status', p.access_status,
          'last_sign_in_at', u.last_sign_in_at,
          'is_me', p.user_id = auth.uid()
        ) as m
        from public.profiles p
        left join auth.users u on u.id = p.user_id
        where p.equipe_id = v_equipe
      ) q
    ), '[]'::jsonb)
  );
end;
$fn$;

comment on function public.team_access_overview() is
  'SE-TEAMACCESS-001 · membros da equipe de quem chama + uso de assentos. Só owner/super_admin; a RLS de profiles continua fechando o resto.';

revoke all on function public.team_access_overview() from public, anon;
grant execute on function public.team_access_overview() to authenticated;

-- ============================================================================
-- 4. ASSERÇÕES
-- ============================================================================

do $$
begin
  assert exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'access_status'
  ), 'ASSERT FAILED: profiles.access_status ausente';

  assert (select count(*) from public.profiles where access_status not in ('active','restricted')) = 0,
    'ASSERT FAILED: access_status inválido';
end $$;
