-- SE-SUPPORT-001: canal adicional de suporte, isolado por equipe.
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  subject text not null check (char_length(subject) <= 200 and char_length(btrim(subject)) > 0),
  description text not null check (char_length(description) <= 10000 and char_length(btrim(description)) > 0),
  status text not null default 'aberto'
    check (status in ('aberto', 'em_atendimento', 'resolvido', 'fechado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id),
  author_kind text not null check (author_kind in ('cliente', 'suporte')),
  body text not null check (char_length(body) <= 10000 and char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index support_tickets_equipe_created_idx on public.support_tickets(equipe_id, created_at desc, id);
create index support_tickets_status_created_idx on public.support_tickets(status, created_at desc, id);
create index support_tickets_created_idx on public.support_tickets(created_at desc, id);
create index support_ticket_messages_conversation_idx on public.support_ticket_messages(ticket_id, created_at, id);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

create policy support_tickets_team_read on public.support_tickets
  for select to authenticated using (
    equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
  );
create policy support_tickets_staff_read on public.support_tickets
  for select to authenticated using (
    public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'super_admin')
  );
create policy support_tickets_team_create on public.support_tickets
  for insert to authenticated with check (
    created_by = auth.uid() and status = 'aberto'
    and equipe_id in (select equipe_id from public.profiles where user_id = auth.uid())
  );
create policy support_tickets_staff_update on public.support_tickets
  for update to authenticated
  using (public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'super_admin'));

create policy support_messages_read on public.support_ticket_messages
  for select to authenticated using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id)
  );
create policy support_messages_create on public.support_ticket_messages
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.support_tickets t where t.id = ticket_id)
  );

-- Remove privilégios padrão amplos somente das tabelas novas.
revoke all on public.support_tickets, public.support_ticket_messages from public, anon, authenticated;
grant select on public.support_tickets, public.support_ticket_messages to authenticated;
grant insert (equipe_id, subject, description) on public.support_tickets to authenticated;
grant update (status) on public.support_tickets to authenticated;
grant insert (ticket_id, body) on public.support_ticket_messages to authenticated;

create function public.support_ticket_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger support_ticket_touch before update on public.support_tickets
  for each row execute function public.support_ticket_touch();

create function public.support_message_author() returns trigger
language plpgsql set search_path = public as $$
begin
  new.author_kind := case when public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'super_admin') then 'suporte' else 'cliente' end;
  return new;
end;
$$;
create trigger support_message_author before insert on public.support_ticket_messages
  for each row execute function public.support_message_author();

-- SECURITY DEFINER apenas para atualizar o timestamp do pai após INSERT autorizado por RLS.
create function public.support_message_touch_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets set updated_at = clock_timestamp() where id = new.ticket_id;
  return new;
end;
$$;
create trigger support_message_touch_ticket after insert on public.support_ticket_messages
  for each row execute function public.support_message_touch_ticket();

-- O filtro não concede acesso às demais colunas ou à gestão de equipes.
create function public.support_ticket_teams()
returns table(id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome from public.equipes e
  where (public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'super_admin'))
    and exists (select 1 from public.support_tickets t where t.equipe_id = e.id)
  order by e.nome, e.id;
$$;
revoke all on function public.support_ticket_teams() from public, anon;
grant execute on function public.support_ticket_teams() to authenticated;

insert into public.notification_types
  (type, default_severity, default_channels, audience, description, purpose, variables)
values ('support.ticket_created', 'info', array['in_app'], 'founder',
  'Novo ticket de suporte', 'suporte', array['ticket_id', 'subject', 'equipe_id'])
on conflict (type) do nothing;

create function public.support_ticket_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare destinatario record;
begin
  -- audience não faz fan-out. Endereçar à equipe do administrador mantém
  -- o sino e a RLS existentes; user_id evita entrega aos seus colegas.
  for destinatario in
    select distinct p.user_id, p.equipe_id
    from public.profiles p join public.user_roles r on r.user_id = p.user_id
    where r.role in ('owner', 'super_admin') and p.equipe_id is not null
  loop
    perform public.notify(
      p_equipe_id => destinatario.equipe_id,
      p_type => 'support.ticket_created',
      p_title => 'Novo ticket de suporte',
      p_body => new.subject,
      p_action_url => '/admin?tab=tickets&ticket=' || new.id,
      p_data => jsonb_build_object('ticket_id', new.id, 'subject', new.subject, 'equipe_id', new.equipe_id),
      p_dedup_key => new.id::text || ':' || destinatario.user_id::text,
      p_user_id => destinatario.user_id
    );
  end loop;
  return new;
end;
$$;
create trigger support_ticket_notify after insert on public.support_tickets
  for each row execute function public.support_ticket_notify();

revoke all on function public.support_ticket_touch(), public.support_message_author(),
  public.support_message_touch_ticket(), public.support_ticket_notify() from public, anon, authenticated;
