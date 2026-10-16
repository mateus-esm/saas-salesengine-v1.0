-- Sprint Suporte 1 · #9 — diagnóstico da ingestão do chat. SOMENTE LEITURA.
-- Nada aqui apaga, mescla ou arquiva: o time decide caso a caso.
-- Para uma equipe só, acrescente `and equipe_id = '<uuid>'` onde houver tabela base.

-- 1. Conversas ativas duplicadas por (lead, canal) — o que a corrida fatiou.
--    O par listado aqui é o que impede uq_conversations_active_lead_channel.
select c.lead_id, c.channel, count(*) as conversas,
       array_agg(c.id order by c.created_at)         as conversation_ids,
       array_agg(c.created_at order by c.created_at) as criadas_em
  from public.conversations c
 where c.status = 'active' and c.deleted_at is null
 group by c.lead_id, c.channel
having count(*) > 1
 order by max(c.created_at) desc;

-- 1b. Mensagens de cada conversa do par (qual delas tem o histórico).
select c.id as conversation_id, c.lead_id, c.created_at, count(m.id) as mensagens,
       min(m.created_at) as primeira_msg, max(m.created_at) as ultima_msg
  from public.conversations c
  left join public.messages m on m.conversation_id = c.id
 where c.status = 'active' and c.deleted_at is null
   and (c.lead_id, c.channel) in (
         select lead_id, channel from public.conversations
          where status = 'active' and deleted_at is null
          group by 1, 2 having count(*) > 1)
 group by c.id
 order by c.lead_id, c.created_at;

-- 2. Leads do mesmo telefone em formatos diferentes (8 últimos dígitos).
--    Para MESCLAR À MÃO — o webhook novo já normaliza pelo _shared/phone.ts.
select l.equipe_id,
       right(regexp_replace(coalesce(l.phone, l.phone_normalized, ''), '\D', '', 'g'), 8) as fim8,
       count(*) as leads,
       array_agg(l.id order by l.created_at)               as lead_ids,
       array_agg(l.name order by l.created_at)             as nomes,
       array_agg(l.phone order by l.created_at)            as telefones,
       array_agg(l.phone_normalized order by l.created_at) as normalizados
  from public.leads l
 where l.deleted_at is null
   and length(regexp_replace(coalesce(l.phone, l.phone_normalized, ''), '\D', '', 'g')) >= 8
 group by 1, 2
having count(*) > 1
 order by count(*) desc, 1;

-- 3. Nomes suspeitos: vazio, só número, "Lead <fone>", rótulos de reserva, id técnico.
select l.id, l.equipe_id, l.name, l.phone, l.creation_source, l.name_locked, l.created_at
  from public.leads l
 where l.deleted_at is null
   and ( btrim(coalesce(l.name, '')) = ''
      or l.name ~ '^\s*\+?[0-9 ()-]{8,}\s*$'
      or l.name ~* '^lead\s+[0-9+ ()-]{8,}'
      or l.name ~* '@(lid|s\.whatsapp\.net|c\.us)\s*$'
      or lower(btrim(l.name)) in ('desconhecido', 'novo visitante', '[whatsapp - lead anônimo]') )
 order by l.created_at desc;

-- 4. Possíveis não-leads já no pipeline: sem telefone e sem nome real, ou
--    nome de remetente de serviço. needs_review=true são os que o filtro novo marcou.
select l.id, l.equipe_id, l.name, l.phone, l.lead_type, l.needs_review, l.review_reason,
       l.creation_source, l.created_at,
       (select count(*) from public.opportunities o
         where o.lead_id = l.id and o.deleted_at is null) as negocios
  from public.leads l
 where l.deleted_at is null
   and ( (l.phone is null and (btrim(coalesce(l.name, '')) = ''
          or lower(btrim(l.name)) in ('desconhecido', 'novo visitante', '[whatsapp - lead anônimo]')))
      or l.name ~* '^(whatsapp|meta|facebook|instagram)\y|no[-_ ]?reply|notification|notifica[cç][aã]o|verifica[cç][aã]o|verification'
      or l.needs_review )
 order by l.created_at desc
 limit 500;

-- 5. Volume por causa, últimos 30 dias (leads que o filtro novo marcou).
select review_reason, count(*) as leads
  from public.leads
 where needs_review and created_at >= now() - interval '30 days'
 group by 1 order by 2 desc;
