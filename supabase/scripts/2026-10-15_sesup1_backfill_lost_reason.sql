-- ============================================================================
-- APLICAR A MÃO (script avulso, fora de supabase/migrations).
-- ============================================================================
-- Sprint Suporte 1 · #12 — backfill do motivo de perda.
--
-- Na Solo Energia, 528 dos 533 negócios perdidos estão com lost_reason vazio. Não
-- inventamos motivo: marcamos 'Não informado' (o mesmo rótulo que o dashboard já
-- mostra para vazio), e a Solo qualifica depois filtrando por esse motivo.
--
-- Seguro e idempotente: só toca negócio em etapa de perda (stage_type = 'lost')
-- com lost_reason nulo ou em branco; rodar de novo não encontra nada. Não troca
-- etapa nem status, então nenhum gatilho de etapa/funil dispara; o gatilho de
-- motivo padrão (trg_opportunity_z_lost_reason, da migration anterior) é
-- compatível. Pré-requisito: 20261015000100_sesup1_crm_move_opportunity.sql.
--
-- ORDEM SUGERIDA: 1) rodar a contagem abaixo; 2) rodar o UPDATE; 3) conferir 0.
--
--   select count(*) from public.opportunities o
--     join public.pipeline_stages_v2 s on s.id = o.stage_id
--    where s.stage_type = 'lost' and o.deleted_at is null
--      and nullif(btrim(coalesce(o.lost_reason, '')), '') is null;   -- esperado: ~528

-- Revisão 16/10: somente Solo Energia, sem registros apagados.
-- EXECUÇÃO PENDENTE DE AUTORIZAÇÃO EXPLÍCITA (auto-review recusou o lote).
begin;
set local lock_timeout='5s';
do $$ declare v_team uuid; begin
  select id into strict v_team from public.equipes where nome='Solo Energia';
  update public.opportunities o set lost_reason='Não informado'
   from public.pipeline_stages_v2 s
   where s.id=o.stage_id and s.stage_type='lost' and o.equipe_id=v_team
     and o.deleted_at is null and nullif(btrim(coalesce(o.lost_reason,'')),'') is null;
end $$;
commit;
