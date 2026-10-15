-- Sprint Suporte 1 · #9 — mescla MANUAL do par de conversas ativas do lead 309b4c09-…
-- (Solo, canal whatsapp, criadas com 4 s de diferença em 05/10).
--
-- NÃO RODAR AUTOMATICAMENTE. Passo a passo para o dono, ANTES de aplicar de novo
-- o bloco 3 da migration 20261015000300 (que cria uq_conversations_active_lead_channel).
--
-- 1. Identifique o par e escolha a conversa MANTIDA (a que tem mais histórico / a
--    mais antiga). Troque os dois placeholders abaixo.
--
--    select c.id, c.created_at, c.last_message_at, c.responsible_id, c.unread_count,
--           (select count(*) from public.messages m where m.conversation_id = c.id) as mensagens
--      from public.conversations c
--     where c.lead_id::text like '309b4c09%' and c.channel = 'whatsapp'
--       and c.status = 'active' and c.deleted_at is null
--     order by c.created_at;
--
-- 2. Rode a transação abaixo (uma só: ou move tudo ou nada).

begin;

-- <MANTIDA> e <ANTIGA>: uuids da consulta acima.
update public.messages
   set conversation_id = '<MANTIDA>'
 where conversation_id = '<ANTIGA>';

-- A mantida herda o que a antiga tinha de mais novo e a soma dos não lidos.
update public.conversations k
   set last_message_at = greatest(k.last_message_at, o.last_message_at),
       unread_count    = k.unread_count + o.unread_count,
       responsible_id  = coalesce(k.responsible_id, o.responsible_id),
       solo_instance_id = coalesce(k.solo_instance_id, o.solo_instance_id),
       gpt_maker_chat_id = coalesce(k.gpt_maker_chat_id, o.gpt_maker_chat_id)
  from public.conversations o
 where k.id = '<MANTIDA>' and o.id = '<ANTIGA>';

-- A antiga sai do ativo (arquivada, não apagada: reversível).
update public.conversations
   set status = 'archived', archived_at = now(), unread_count = 0
 where id = '<ANTIGA>';

-- Confere: deve devolver 1 linha.
select count(*) as ativas from public.conversations
 where lead_id = (select lead_id from public.conversations where id = '<MANTIDA>')
   and channel = 'whatsapp' and status = 'active' and deleted_at is null;

commit;

-- 3. Reaplique o bloco 3 da migration (create unique index ... idempotente).
