-- 2026-11-12_solo_proposals_generated_repair.sql
-- Sprint 15 · T1 / decisão D15.1 — NÃO É MIGRATION E NÃO FOI APLICADO.
--
-- Propostas da Solo Energia em `sent` que nunca rodaram uma ação de envio
-- (action_label ilike '%envi%') só passaram pelo "Gerar": voltam a `generated`,
-- e o `proposal_sent` desses negócios sai do funil.
--
-- Antes de rodar: aplicar a migration 20261112000100 (o CHECK precisa aceitar
-- `generated`) e conferir 2026-11-12_solo_proposals_sent_audit.sql.
-- Atenção: apagar funnel_events muda o passado do dashboard da Solo.
-- Só apaga `proposal_sent` de negócio sem outra proposta que de fato foi enviada.

-- ============================================================================
-- SEÇÃO 1 — ENSAIO (só SELECT)
-- ============================================================================
with alvo as (
  select r.id, r.opportunity_id
    from public.custom_table_records r
    join public.custom_tables t on t.id = r.table_id and t.artifact_kind = 'proposal'
    join public.equipes e on e.id = r.equipe_id
   where e.nome ilike '%solo energia%'   -- a Solo pelo nome; trocar por e.id = '<uuid>' se houver homônima
     and r.deleted_at is null
     and r.artifact_status = 'sent'
     and not exists (select 1 from public.artifact_action_runs a
                      where a.record_id = r.id and a.action_label ilike '%envi%')
),
negocios as (
  select distinct a.opportunity_id
    from alvo a
   where a.opportunity_id is not null
     and not exists (select 1 from public.custom_table_records o
                       join public.custom_tables ot on ot.id = o.table_id and ot.artifact_kind = 'proposal'
                      where o.opportunity_id = a.opportunity_id
                        and o.deleted_at is null
                        and o.artifact_status = 'sent'
                        and o.id not in (select id from alvo))
)
select (select count(*) from alvo)     as registros_a_voltar_para_gerado,
       (select count(*) from negocios) as negocios_sem_outra_proposta_enviada,
       (select count(*) from public.funnel_events f
         where f.event = 'proposal_sent'
           and f.opportunity_id in (select opportunity_id from negocios)) as eventos_proposal_sent_a_apagar;

-- ============================================================================
-- SEÇÃO 2 — ESCRITA (termina em ROLLBACK de propósito)
-- ============================================================================
begin;

-- A mesma regra do verbo (_crm_apply_artifact_status): o gatilho só deixa
-- gravar artifact_status com esta marca, que vale só nesta transação.
select set_config('crm.artifact_status_verb', 'on', true);

create temp table _alvo on commit drop as
select r.id, r.opportunity_id
  from public.custom_table_records r
  join public.custom_tables t on t.id = r.table_id and t.artifact_kind = 'proposal'
  join public.equipes e on e.id = r.equipe_id
 where e.nome ilike '%solo energia%'
   and r.deleted_at is null
   and r.artifact_status = 'sent'
   and not exists (select 1 from public.artifact_action_runs a
                    where a.record_id = r.id and a.action_label ilike '%envi%');

-- Negócios cujo marco sai: nenhuma OUTRA proposta enviada de verdade.
create temp table _negocios on commit drop as
select distinct a.opportunity_id
  from _alvo a
 where a.opportunity_id is not null
   and not exists (select 1 from public.custom_table_records o
                     join public.custom_tables ot on ot.id = o.table_id and ot.artifact_kind = 'proposal'
                    where o.opportunity_id = a.opportunity_id
                      and o.deleted_at is null
                      and o.artifact_status = 'sent'
                      and o.id not in (select id from _alvo));

update public.custom_table_records set artifact_status = 'generated'
 where id in (select id from _alvo);

delete from public.funnel_events
 where event = 'proposal_sent'
   and opportunity_id in (select opportunity_id from _negocios);

select (select count(*) from _alvo)     as propostas_voltaram_para_gerado,
       (select count(*) from _negocios) as negocios_sem_proposal_sent,
       (select count(*) from public.custom_table_records r
         where r.id in (select id from _alvo) and r.artifact_status = 'generated') as conferido_generated;

-- Conferir as contagens acima contra a SEÇÃO 1; se batem, trocar por `commit;`.
rollback;
