-- Execute em banco descartável com as dependências anteriores à migration.
-- As consultas sob authenticated exercitam RLS real; fixtures são revertidas.
begin;
-- @include supabase/migrations/20260927000100_sesupport001_tickets.sql

insert into public.equipes (id, nome, crm_link, suporte_link) values
 ('51000000-0000-0000-0000-000000000001', 'Suporte A', '/crm', '/suporte'),
 ('51000000-0000-0000-0000-000000000002', 'Suporte B', '/crm', '/suporte'),
 ('51000000-0000-0000-0000-000000000003', 'Suporte interno', '/crm', '/suporte');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('52000000-0000-0000-0000-00000000000' || n)::uuid,
 '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
 'suporte-' || n || '@example.test', 'x', now(), now() from generate_series(1,5) n;
insert into public.profiles(id, user_id, equipe_id, email, nome_completo, role)
select u.id, u.id,
 case right(u.id::text,1) when '1' then '51000000-0000-0000-0000-000000000001'::uuid
 when '2' then '51000000-0000-0000-0000-000000000002'::uuid
 when '5' then '51000000-0000-0000-0000-000000000001'::uuid
 else '51000000-0000-0000-0000-000000000003'::uuid end,
 u.email, 'Pessoa de teste', 'user'
from auth.users u where u.id::text like '52000000-%'
on conflict (id) do update set equipe_id = excluded.equipe_id;
insert into public.user_roles(user_id,role) values
 ('52000000-0000-0000-0000-000000000001','user'),
 ('52000000-0000-0000-0000-000000000002','admin'),
 ('52000000-0000-0000-0000-000000000003','owner'),
 ('52000000-0000-0000-0000-000000000004','super_admin'),
 ('52000000-0000-0000-0000-000000000005','user')
on conflict do nothing;
create temp table tickets_teste(nome text, id uuid);
grant all on tickets_teste to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000001',true);
with novo as (
 insert into public.support_tickets(equipe_id,subject,description)
 values ('51000000-0000-0000-0000-000000000001','Dúvida A','Descrição A') returning id
) insert into tickets_teste select 'A', id from novo;

do $$
declare n integer;
begin
 assert (select count(*) = 1 from public.support_tickets), 'Cliente deve ver seu ticket';
 assert (select count(*) = 0 from public.support_ticket_teams()), 'Cliente não pode enumerar equipes';
 begin
  insert into public.support_tickets(equipe_id,subject,description)
  values ('51000000-0000-0000-0000-000000000002','Invasão','Outra equipe');
  raise exception 'FALHA: criação entre equipes permitida';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.support_tickets(equipe_id,subject,description,created_by)
  values ('51000000-0000-0000-0000-000000000001','Falso autor','Descrição','52000000-0000-0000-0000-000000000002');
  raise exception 'FALHA: autoria forjada';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.support_tickets(equipe_id,subject,description)
  values ('51000000-0000-0000-0000-000000000001','   ','Descrição');
  raise exception 'FALHA: assunto vazio';
 exception when check_violation then null; end;
 begin
  insert into public.support_tickets(equipe_id,subject,description)
  values ('51000000-0000-0000-0000-000000000001','Assunto',repeat('x',10001));
  raise exception 'FALHA: descrição excede limite';
 exception when check_violation then null; end;
 update public.support_tickets set status='fechado';
 get diagnostics n = row_count;
 assert n=0, 'Cliente não pode alterar status';
 begin
  update public.support_tickets set equipe_id='51000000-0000-0000-0000-000000000002';
  raise exception 'FALHA: troca de equipe permitida';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.support_tickets;
  raise exception 'FALHA: exclusão permitida';
 exception when insufficient_privilege then null; end;
end $$;
insert into public.support_ticket_messages(ticket_id,body)
 select id, 'Complemento do cliente' from tickets_teste where nome='A';

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000002',true);
do $$ begin
 assert (select count(*)=0 from public.support_tickets), 'Admin comum não atravessa equipes';
 assert (select count(*)=0 from public.support_ticket_messages), 'Mensagens de outra equipe invisíveis';
 assert (select count(*)=0 from public.notifications where type='support.ticket_created'), 'Aviso não chega ao cliente';
 begin
  insert into public.support_ticket_messages(ticket_id,body)
   select id, 'Invasão da conversa' from tickets_teste where nome='A';
  raise exception 'FALHA: resposta entre equipes permitida';
 exception when insufficient_privilege then null; end;
end $$;
with novo as (
 insert into public.support_tickets(equipe_id,subject,description)
 values ('51000000-0000-0000-0000-000000000002','Dúvida B','Descrição B') returning id
) insert into tickets_teste select 'B', id from novo;

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000003',true);
do $$ begin
 assert (select count(*)=2 from public.support_tickets), 'Owner deve ver todas as equipes';
 assert (select count(*)=2 from public.support_ticket_teams()), 'Owner recebe nomes dos filtros';
 assert (select count(*)=2 from public.notifications where type='support.ticket_created'), 'Owner recebe aviso de cada ticket';
 assert (select bool_and(user_id=auth.uid()) from public.notifications where type='support.ticket_created'), 'Avisos pessoais';
 begin
  update public.support_tickets set subject='Histórico reescrito';
  raise exception 'FALHA: reescrita permitida';
 exception when insufficient_privilege then null; end;
 begin
  update public.support_tickets set status='inventado';
  raise exception 'FALHA: status inválido permitido';
 exception when check_violation then null; end;
end $$;
update public.support_tickets set status='em_atendimento' where id=(select id from tickets_teste where nome='A');
insert into public.support_ticket_messages(ticket_id,body)
 select id, 'Resposta do suporte' from tickets_teste where nome='A';

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000004',true);
do $$ begin
 assert (select count(*)=2 from public.support_tickets), 'Super admin deve ver todos os tickets';
 assert (select count(*)=2 from public.notifications where type='support.ticket_created'), 'Super admin recebe aviso de cada ticket';
 assert (select bool_and(action_url like '/admin?tab=tickets&ticket=%') from public.notifications where type='support.ticket_created'), 'Aviso abre ticket';
end $$;
update public.support_tickets set status='resolvido' where id=(select id from tickets_teste where nome='A');

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000005',true);
do $$ begin
 assert (select count(*)=1 from public.support_tickets), 'Colega vê tickets da mesma equipe';
 assert (select status='resolvido' from public.support_tickets), 'Status do admin aparece ao cliente';
 assert (select count(*)=2 from public.support_ticket_messages), 'Conversa chega ao cliente';
 assert (select count(*)=1 from public.support_ticket_messages where author_kind='suporte'), 'Autoria de suporte preservada';
 assert (select count(*)=1 from public.support_ticket_messages where author_kind='cliente'), 'Autoria de cliente preservada';
 begin
  insert into public.support_ticket_messages(ticket_id,body,author_kind)
   select id, 'Falsa resposta do suporte','suporte' from tickets_teste where nome='A';
  raise exception 'FALHA: classificação de autoria forjada';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.support_ticket_messages(ticket_id,body,author_id)
   select id, 'Falso autor','52000000-0000-0000-0000-000000000004' from tickets_teste where nome='A';
  raise exception 'FALHA: autor da mensagem forjado';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.support_ticket_messages(ticket_id,body)
   select id, '   ' from tickets_teste where nome='A';
  raise exception 'FALHA: mensagem vazia';
 exception when check_violation then null; end;
 begin
  update public.support_ticket_messages set body='Reescrito';
  raise exception 'FALHA: mensagem reescrita';
 exception when insufficient_privilege then null; end;
 begin
  perform public.support_ticket_notify();
  raise exception 'FALHA: função interna pública';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
 assert (select count(*)=4 from public.notification_deliveries d join public.notifications n on n.id=d.notification_id
  where n.type='support.ticket_created' and d.channel='in_app'), 'Uma entrega por administrador e ticket';
 assert (select bool_and(updated_at >= created_at) from public.support_tickets), 'Timestamp de atualização válido';
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.support_tickets;
  raise exception 'FALHA: leitura anônima permitida';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS' as result;
