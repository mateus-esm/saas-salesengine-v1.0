-- Sprint 11 · Onda 3 · T28 — reparo: o status volta a concordar com a etapa.
--
-- Em 11/09, 200 negócios estavam numa etapa de ganho/perda com status "open"
-- (197 perda, 3 ganho): o card tinha sido movido, mas mover não fechava o
-- negócio. Este reparo fecha cada um pelo tipo da etapa em que está, com a data
-- de quando entrou nela.
--
-- QUANDO: depois da migration 20260912000100 (o gatilho de desfecho), com
-- aprovação do founder no T38. Ensaio: supabase/tests/sprint11_w3_repair_status.test.sql.
--
-- NÃO GRAVA EVENTO NOVO: quem entrou numa etapa de ganho/perda já tem o evento
-- (pelo histórico da etapa ou pelo nascimento); o gatilho de status não emite
-- quando a etapa já é do mesmo tipo. Sem `begin/commit` aqui — quem aplica abre
-- a transação (e o ensaio roda dentro de um rollback).

update public.opportunities o
   set status    = s.stage_type,
       closed_at = coalesce(o.closed_at, o.stage_entered_at, o.updated_at, o.created_at)
  from public.pipeline_stages_v2 s
 where s.id = o.stage_id
   and s.stage_type in ('won', 'lost')
   and o.status is distinct from s.stage_type
   and o.deleted_at is null;
