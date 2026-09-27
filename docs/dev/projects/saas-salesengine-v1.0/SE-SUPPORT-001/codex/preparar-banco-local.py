"""Monta dependências mínimas para ensaiar a migration em PostgreSQL descartável.
Não substitui o ensaio da cadeia completa de migrations no ambiente de homologação.
As implementações de has_role e notify são extraídas das migrations reais.
"""
from pathlib import Path

raiz = Path.cwd()
migrations = raiz / 'supabase/migrations'
base = (migrations / '20260819000400_sprint8_notifications.sql').read_text()
base = base[:base.index('-- 7. ASSERTIONS')]
roteamento = (migrations / '20260824000400_sprint84_notification_routing.sql').read_text()
notify = roteamento[roteamento.index('create or replace function public.notify('):]
notify = notify[:notify.index('$fn$;', notify.index('as $fn$')) + len('$fn$;')]
papeis = (migrations / '20260318072102_remote_schema.sql').read_text()
papeis = papeis[papeis.index('CREATE OR REPLACE FUNCTION public.has_role('):]
papeis = papeis[:papeis.index('$function$;', papeis.index('AS $function$')) + len('$function$;')] if '$function$;' in papeis else papeis[:papeis.index('$function$\n;', papeis.index('AS $function$')) + len('$function$\n;')]
# Infra mínima reproduz apenas as dependências das tabelas novas.
sql = '''
create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to authenticated, anon;
create table auth.users(id uuid primary key, instance_id uuid, aud text, role text,
 email text, encrypted_password text, created_at timestamptz, updated_at timestamptz);
create type public.app_role as enum ('user','admin','owner','super_admin');
create table public.equipes(id uuid primary key default gen_random_uuid(), nome text,
 crm_link text, suporte_link text);
create table public.profiles(id uuid primary key, user_id uuid unique references auth.users,
 equipe_id uuid references public.equipes, email text, nome_completo text, role text);
create table public.user_roles(id uuid default gen_random_uuid(), user_id uuid references auth.users,
 role public.app_role, unique(user_id,role));
grant select on public.profiles, public.user_roles to authenticated;
alter table public.profiles enable row level security;
create policy perfil_proprio on public.profiles for select to authenticated using(user_id=auth.uid());
alter table public.user_roles enable row level security;
create policy papel_proprio on public.user_roles for select to authenticated using(user_id=auth.uid());
'''
sql += papeis + '\n' + base
sql += '''
alter table public.notification_types add column purpose text default 'operacao';
alter table public.notification_types add column template_title text;
alter table public.notification_types add column template_body text;
alter table public.notification_types add column variables text[] default '{}';
alter table public.notifications add column recipient_phone text;
alter table public.notifications add column recipient_email text;
create table public.notification_policies(equipe_id uuid, type text, enabled boolean default true,
 auto boolean default true, channels text[], phone_override text, email_override text);
grant select, update on public.notifications to authenticated;
'''
render = roteamento[roteamento.index('create or replace function public.render_template('):]
render = render[:render.index('$fn$;', render.index('as $fn$')) + len('$fn$;')]
sql += render + '\n' + notify
(raiz / '.local-support/dependencias.sql').write_text(sql)
