-- 2026-11-12_solo_proposals_generated_repair.sql
-- Sprint 15 · T1 / decisão D15.1 — NÃO É MIGRATION E NÃO FOI APLICADO.
--
-- Propostas `sent` que têm rodadas de ação mas nenhuma de envio
-- (action_label ilike '%envi%') só passaram pelo "Gerar": voltam a `generated`,
-- e o `proposal_sent` desses negócios sai do funil.
--
-- Antes de rodar: aplicar a migration 20261112000100 (o CHECK precisa aceitar
-- `generated`) e conferir 2026-11-12_solo_proposals_sent_audit.sql.
-- Atenção: apagar funnel_events muda o passado do dashboard.
--   * Registro `sent` SEM NENHUMA rodada de ação (provável ajuste manual) é só
--     relatado na SEÇÃO 1, NÃO é revertido.
--   * Negócio com `proposal_sent` registrado por pessoa (funnel_events.actor_type =
--     'team') é EXCLUÍDO da reversão: alguém marcou o envio, a proposta não volta.
--   * Só se apaga `proposal_sent` de fonte 'artifact' (o que
--     _crm_apply_artifact_status grava direto), só dos negócios dos registros
--     revertidos e só se nenhuma OUTRA proposta do negócio foi enviada de verdade.
--     Marco que entrou por mudança de etapa (source 'stage_change') NÃO é apagado:
--     pertence ao histórico da etapa.

-- ============================================================================
-- SEÇÃO 1 — ENSAIO (só SELECT)
-- ============================================================================

-- 1a. Descobrir o id da equipe. Copiar o uuid certo para a SEÇÃO 2.
select id, nome from public.equipes where nome ilike '%solo energia%';

-- 1b. Contagens por equipe candidata, separando os dois grupos de propostas `sent`:
--   sem_nenhuma_rodada_nao_reverte = nenhuma linha em artifact_action_runs -> RELATADO, NÃO revertido
--   sem_acao_de_envio_reverte      = há rodadas, mas nenhuma de envio      -> REVERTIDO para generated
select r.equipe_id,
       count(*) filter (where not exists (select 1 from public.artifact_action_runs a where a.record_id = r.id))
         as sem_nenhuma_rodada_nao_reverte,
       count(*) filter (where exists (select 1 from public.artifact_action_runs a where a.record_id = r.id)
                          and not exists (select 1 from public.artifact_action_runs a
                                           where a.record_id = r.id and a.action_label ilike '%envi%')
                          and not exists (select 1 from public.funnel_events fe
                                           where fe.opportunity_id = r.opportunity_id
                                             and fe.event = 'proposal_sent' and fe.actor_type = 'team'))
         as sem_acao_de_envio_reverte
  from public.custom_table_records r
  join public.custom_tables t on t.id = r.table_id and t.artifact_kind = 'proposal'
 where r.equipe_id in (select id from public.equipes where nome ilike '%solo energia%')
   and r.deleted_at is null
   and r.artifact_status = 'sent'
 group by r.equipe_id;

-- 1c. Marcos que seriam apagados (só fonte 'artifact', só dos negócios dos revertidos,
--     só se nenhuma OUTRA proposta do negócio foi enviada de verdade).
with alvo as (
  select r.id, r.equipe_id, r.opportunity_id
    from public.custom_table_records r
    join public.custom_tables t on t.id = r.table_id and t.artifact_kind = 'proposal'
   where r.equipe_id in (select id from public.equipes where nome ilike '%solo energia%')
     and r.deleted_at is null
     and r.artifact_status = 'sent'
     and exists (select 1 from public.artifact_action_runs a where a.record_id = r.id)
     and not exists (select 1 from public.artifact_action_runs a
                      where a.record_id = r.id and a.action_label ilike '%envi%')
     and not exists (select 1 from public.funnel_events fe
                      where fe.opportunity_id = r.opportunity_id
                        and fe.event = 'proposal_sent' and fe.actor_type = 'team')
),
negocios as (
  select distinct a.equipe_id, a.opportunity_id
    from alvo a
   where a.opportunity_id is not null
     and not exists (select 1 from public.custom_table_records o
                       join public.custom_tables ot on ot.id = o.table_id and ot.artifact_kind = 'proposal'
                      where o.opportunity_id = a.opportunity_id
                        and o.deleted_at is null
                        and o.artifact_status = 'sent'
                        and o.id not in (select id from alvo))
)
select n.equipe_id, count(f.id) as eventos_proposal_sent_artifact_a_apagar
  from negocios n
  left join public.funnel_events f
    on f.opportunity_id = n.opportunity_id and f.event = 'proposal_sent' and f.source = 'artifact'
 group by n.equipe_id;

-- 1d. Candidatos a reverter cuja ÚLTIMA rodada de ação não terminou (status <> 'completed'):
--     a geração pode ainda estar em curso ou ter falhado. Conferir antes de rodar a SEÇÃO 2.
select r.equipe_id, count(*) as candidatos_com_ultima_rodada_nao_concluida
  from public.custom_table_records r
  join public.custom_tables t on t.id = r.table_id and t.artifact_kind = 'proposal'
 where r.equipe_id in (select id from public.equipes where nome ilike '%solo energia%')
   and r.deleted_at is null
   and r.artifact_status = 'sent'
   and exists (select 1 from public.artifact_action_runs a where a.record_id = r.id)
   and not exists (select 1 from public.artifact_action_runs a
                    where a.record_id = r.id and a.action_label ilike '%envi%')
   and not exists (select 1 from public.funnel_events fe
                    where fe.opportunity_id = r.opportunity_id
                      and fe.event = 'proposal_sent' and fe.actor_type = 'team')
   and (select a.status from public.artifact_action_runs a
         where a.record_id = r.id order by a.created_at desc limit 1) <> 'completed'
 group by r.equipe_id;

-- ============================================================================
-- SEÇÃO 2 — ESCRITA (termina em ROLLBACK de propósito)
-- ============================================================================
-- ANTES: trocar o uuid de zeros abaixo (UMA vez, na tabela _cfg) pelo id da equipe
-- visto em 1a. O bloco recusa rodar se continuar zerado ou se o id não existir.
begin;

create temp table _cfg on commit drop as
select '00000000-0000-0000-0000-000000000000'::uuid as equipe_id;  -- <== TROCAR

do $$
declare v uuid := (select equipe_id from _cfg);
begin
  if v = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'repair: troque o uuid placeholder em _cfg pelo id da equipe (veja a consulta 1a)';
  end if;
  if not exists (select 1 from public.equipes where id = v) then
    raise exception 'repair: equipe % nao existe', v;
  end if;
end $$;

-- A mesma regra do verbo (_crm_apply_artifact_status): o gatilho só deixa
-- gravar artifact_status com esta marca, que vale só nesta transação.
select set_config('crm.artifact_status_verb', 'on', true);

create temp table _alvo on commit drop as
select r.id, r.opportunity_id
  from public.custom_table_records r
  join public.custom_tables t on t.id = r.table_id and t.artifact_kind = 'proposal'
 where r.equipe_id = (select equipe_id from _cfg)
   and r.deleted_at is null
   and r.artifact_status = 'sent'
   and exists (select 1 from public.artifact_action_runs a where a.record_id = r.id)
   and not exists (select 1 from public.artifact_action_runs a
                    where a.record_id = r.id and a.action_label ilike '%envi%')
   and not exists (select 1 from public.funnel_events fe
                    where fe.opportunity_id = r.opportunity_id
                      and fe.event = 'proposal_sent' and fe.actor_type = 'team');

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
   and source = 'artifact'
   and equipe_id = (select equipe_id from _cfg)
   and opportunity_id in (select opportunity_id from _negocios);

select (select count(*) from _alvo)     as propostas_voltaram_para_gerado,
       (select count(*) from _negocios) as negocios_considerados,
       (select count(*) from public.custom_table_records r
         where r.id in (select id from _alvo) and r.artifact_status = 'generated') as conferido_generated;

-- Conferir as contagens acima contra a SEÇÃO 1 (grupo sem_acao_de_envio_reverte);
-- se batem, trocar `rollback;` por `commit;`.
rollback;
