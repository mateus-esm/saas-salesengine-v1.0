-- Sprint 8.2 · discovery_q&a · T72 (correção) — pgcrypto mora em `extensions`.
--
-- As duas funções que mexem com token nasceram chamando `gen_random_bytes` e
-- `digest` sem esquema, com `set search_path = public`. O corpo de uma função
-- plpgsql não é resolvido na criação, então a migration passou sem reclamar e o
-- erro só apareceu na primeira chamada:
--
--   42883: function gen_random_bytes(integer) does not exist
--
-- pgcrypto está instalado em `extensions`, e o search_path fixo (que existe por
-- segurança, numa função security definer) não o alcança. O resto do banco já
-- sabia disso — 20260912100600 escreve `extensions.digest` — e esta migration
-- alinha o discovery à mesma convenção.

create or replace function public._discovery_ensure_link(p_onboarding_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.onboarding_discovery (onboarding_id, token_hash, expires_at)
  values (p_onboarding_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 days')
  on conflict (onboarding_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at;

  return v_token;
end;
$$;

create or replace function public._discovery_row(p_token text)
returns public.onboarding_discovery language plpgsql stable as $$
declare r public.onboarding_discovery;
begin
  select * into r from public.onboarding_discovery
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if r.id is null then raise exception 'discovery_not_found'; end if;
  if r.expires_at is not null and r.expires_at < now() then raise exception 'discovery_expired'; end if;
  return r;
end;
$$;

revoke all on function public._discovery_ensure_link(uuid) from public, anon, authenticated;
grant execute on function public._discovery_ensure_link(uuid) to service_role;
