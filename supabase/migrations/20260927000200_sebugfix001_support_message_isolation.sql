-- SE-BUGFIX-001 · Bug 1 — vazamento de mensagens de ticket entre equipes.
--
-- O QUE ESTAVA ERRADO
--
-- A policy de leitura de `support_ticket_messages` era:
--
--   exists (select 1 from public.support_tickets t where t.id = ticket_id)
--
-- Esse EXISTS responde apenas "o ticket existe". Ele NÃO pergunta de quem é o
-- ticket, então qualquer usuário autenticado lia a conversa de qualquer equipe.
-- A policy de `support_tickets` filtrava corretamente por equipe, mas isso não
-- protegia as mensagens: o filtro era implícito, via subconsulta, e subconsulta
-- dentro de policy não herda a RLS da tabela referenciada. As mensagens eram
-- legíveis por qualquer sessão autenticada — o ticket aparecia na lista só da
-- equipe dona, mas a conversa vazava.
--
-- A CORREÇÃO
--
-- O filtro passa a ser EXPLÍCITO, escrito na própria condição da policy, sem
-- depender de RLS implícito de subconsulta:
--
--   * a mensagem é legível se o ticket for da equipe do usuário; OU
--   * se o usuário for super_admin (o "Master admin").
--
-- O papel `owner` continua atravessando (vê todos os tickets), porque é o que a
-- policy de `support_tickets` já fazia e é o que o painel admin usa hoje. O dono
-- disse "só quem pode ver é o próprio time e o Master admin"; o `owner` NÃO foi
-- removido aqui — está registrado como decisão pendente de confirmação. Quando o
-- dono responder, ajustar apenas esta condição.
--
-- A policy de INSERT (`support_messages_create`) tinha o mesmo EXISTS sem
-- filtro: permitia inserir mensagem em ticket de outra equipe. Corrigida junto,
-- com a mesma condição, para não deixar a metade de escrita do mesmo furo.

drop policy if exists support_messages_read on public.support_ticket_messages;
create policy support_messages_read on public.support_ticket_messages
  for select to authenticated using (
    exists (
      select 1
      from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.equipe_id in (select p.equipe_id from public.profiles p where p.user_id = auth.uid())
          or public.has_role(auth.uid(), 'super_admin')
          or public.has_role(auth.uid(), 'owner')
        )
    )
  );

drop policy if exists support_messages_create on public.support_ticket_messages;
create policy support_messages_create on public.support_ticket_messages
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (
          t.equipe_id in (select p.equipe_id from public.profiles p where p.user_id = auth.uid())
          or public.has_role(auth.uid(), 'super_admin')
          or public.has_role(auth.uid(), 'owner')
        )
    )
  );