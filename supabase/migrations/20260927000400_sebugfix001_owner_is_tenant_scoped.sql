-- SE-BUGFIX-001 · Bug 1 (complemento) — `owner` é o DONO DO TIME, não admin do sistema.
--
-- CONFIRMADO PELO DONO (2026-09-27):
--   "owner é quem o dono do time? Se for ele tem que ver só o dele, eu sou o
--    administrador do sistema geral, só o admin geral pode ver tudo e tem
--    acesso ao admin panel."
--
-- O QUE ESTAVA ERRADO
--
-- As policies de `support_tickets` tratavam `owner` como staff do sistema:
--
--   support_tickets_staff_read   / staff_update:
--     has_role(uid,'owner') OR has_role(uid,'super_admin')
--
-- `owner` é o papel do CLIENTE que administra a própria equipe (Casa Flow,
-- Jornada do R1). Ele NÃO pode ver tickets de outros tenants nem operar o
-- painel Admin. Quem atravessa é só o `super_admin` — o administrador geral.
--
-- A RPC `support_ticket_teams()` (que alimenta o filtro de equipes do Admin)
-- tinha a mesma condição e devolvia a lista de equipes com tickets para um
-- `owner` — também restrita ao super_admin agora.
--
-- O QUE NÃO MUDA
--
-- `owner` continua vendo e respondendo os tickets da PRÓPRIA equipe — pela
-- policy `support_tickets_team_read` (equipe do usuário), que não depende de
-- papel. Nada do acesso legítimo do dono do time é perdido.

drop policy if exists support_tickets_staff_read on public.support_tickets;
create policy support_tickets_staff_read on public.support_tickets
  for select to authenticated using (
    public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists support_tickets_staff_update on public.support_tickets;
create policy support_tickets_staff_update on public.support_tickets
  for update to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

create or replace function public.support_ticket_teams()
returns table(id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome from public.equipes e
  where public.has_role(auth.uid(), 'super_admin')
    and exists (select 1 from public.support_tickets t where t.equipe_id = e.id)
  order by e.nome, e.id;
$$;
revoke all on function public.support_ticket_teams() from public, anon;
grant execute on function public.support_ticket_teams() to authenticated;

-- O aviso de ticket novo vai para quem opera o painel: só o super_admin.
-- (Antes endereçava também aos `owner`, que agora não veem o painel.)
create or replace function public.support_ticket_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare destinatario record;
begin
  for destinatario in
    select distinct p.user_id, p.equipe_id
    from public.profiles p join public.user_roles r on r.user_id = p.user_id
    where r.role = 'super_admin' and p.equipe_id is not null
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
end $$;
