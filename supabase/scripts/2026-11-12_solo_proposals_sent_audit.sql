-- 2026-11-12_solo_proposals_sent_audit.sql
-- Sprint 15 · T1 — SOMENTE LEITURA. Nenhum write.
--
-- Pergunta: quantas propostas da Solo Energia dizem "Enviado" mas só passaram
-- pelo "Gerar"? (A automação "Gerar" devolvia `sent` porque `generated` não
-- existia.) O reparo é a decisão D15.1 e está em
-- 2026-11-12_solo_proposals_generated_repair.sql — não é desta tarefa.

-- 1. Resumo: propostas em `sent`, separadas por terem ou não rodado uma ação de envio.
--    "Ação de envio" = action_label ilike '%envi%'.
select
  count(*)                                      as propostas_enviado,
  count(*) filter (where not tem_envio)         as so_gerar,
  count(*) filter (where tem_envio)             as com_envio
from (
  select r.id,
         exists (select 1 from public.artifact_action_runs a
                  where a.record_id = r.id and a.action_label ilike '%envi%') as tem_envio
    from public.custom_table_records r
    join public.custom_tables t on t.id = r.table_id and t.artifact_kind = 'proposal'
    join public.equipes e on e.id = r.equipe_id
   where e.nome ilike '%solo energia%'   -- a Solo pelo nome; trocar por e.id = '<uuid>' se houver homônima
     and r.deleted_at is null
     and r.artifact_status = 'sent'
) x;

-- 2. Por registro: a última ação rodada e o marco proposal_sent do negócio.
select r.id                as record_id,
       r.opportunity_id,
       r.updated_at,
       (select a.action_label from public.artifact_action_runs a
         where a.record_id = r.id order by a.created_at desc limit 1)  as ultima_acao,
       (select a.status from public.artifact_action_runs a
         where a.record_id = r.id order by a.created_at desc limit 1)  as ultima_acao_status,
       exists (select 1 from public.artifact_action_runs a
                where a.record_id = r.id and a.action_label ilike '%envi%') as tem_acao_de_envio,
       (select count(*) from public.funnel_events f
         where f.opportunity_id = r.opportunity_id and f.event = 'proposal_sent') as marcos_proposal_sent,
       (select min(f.source) from public.funnel_events f
         where f.opportunity_id = r.opportunity_id and f.event = 'proposal_sent') as fonte_do_marco
  from public.custom_table_records r
  join public.custom_tables t on t.id = r.table_id and t.artifact_kind = 'proposal'
  join public.equipes e on e.id = r.equipe_id
 where e.nome ilike '%solo energia%'
   and r.deleted_at is null
   and r.artifact_status = 'sent'
 order by tem_acao_de_envio, r.updated_at desc;
